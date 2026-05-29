// PNL poller — pulls profitable-sell events from the Rust API on a fixed
// interval and posts a generated card to a dedicated Discord channel.
//
// Design:
//   - SQL on the Rust side is the source of truth for "posted vs not". The
//     local `pnl_checkpoint` table is a high-water optimisation only.
//   - On each tick we `GET /pnl/recent?after_id=<checkpoint>&limit=10`,
//     iterate, post, then `POST /pnl/<id>/ack` to flip `posted_at` on
//     Rust. A bot crash between `send` and `ack` only causes one duplicate
//     post at worst — the same event won't come back if `posted_at` is
//     already set on the second tick.
//   - Failures don't move the checkpoint forward, so transient errors are
//     idempotent retries on the next tick.
//   - Every fetch is wrapped in an `AbortController` with a hard timeout
//     so a stalled / hung backend can't lock the poller forever.

const { AttachmentBuilder } = require('discord.js');
const { generatePnlCard } = require('./pnlImageGenerator');
const PnlCheckpoint = require('../database/models/PnlCheckpoint');

let intervalHandle = null;
let warnedAuth = false;
let warnedChannel = false;

// Per-request timeout. Tuned generously enough that a slow but live backend
// still completes (~95th percentile is well under 1s on devnet), but tight
// enough that a hung port silently returning never blocks the next tick.
const REQUEST_TIMEOUT_MS = 10_000;

async function loadCheckpoint() {
  const existing = await PnlCheckpoint.findOne({});
  if (existing) return existing.lastSeenEventId || 0;
  await PnlCheckpoint.create({ lastSeenEventId: 0 });
  return 0;
}

async function bumpCheckpoint(eventId) {
  await PnlCheckpoint.updateOne(
    {},
    { lastSeenEventId: eventId, updatedAt: new Date() },
    { upsert: true },
  );
}

async function fetchRecent({ apiBaseUrl, token, afterId, limit }) {
  const url = `${apiBaseUrl}/pnl/recent?after_id=${encodeURIComponent(afterId)}&limit=${encodeURIComponent(limit)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (res.status === 401) {
      if (!warnedAuth) {
        console.error('[pnlPoller] 401 from Rust API — check PNL_API_TOKEN matches OFFIVEX_BOT_PNL_TOKEN');
        warnedAuth = true;
      }
      return null;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    warnedAuth = false;
    const body = await res.json();
    if (!body.success) throw new Error(body.error || 'success=false');
    return body.data || [];
  } finally {
    clearTimeout(timer);
  }
}

async function ack({ apiBaseUrl, token, eventId }) {
  const url = `${apiBaseUrl}/pnl/${encodeURIComponent(eventId)}/ack`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    const elapsedMs = Date.now() - startedAt;
    if (!res.ok) throw new Error(`ack HTTP ${res.status} (event=${eventId}, ${elapsedMs}ms)`);
    // Useful when debugging "events posted but re-appearing on next tick" —
    // a slow / hung ack lets the Rust backend keep returning the same event.
    // Only log at warn level when over 1s (typical ack is ~50-300ms).
    if (elapsedMs > 1000) {
      console.warn(`[pnlPoller] slow ack: event=${eventId} took ${elapsedMs}ms`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function postOne(client, channelId, event, siteUrl) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    if (!warnedChannel) {
      console.error(`[pnlPoller] channel ${channelId} not found / inaccessible`);
      warnedChannel = true;
    }
    return false;
  }
  warnedChannel = false;
  const buffer = await generatePnlCard(event, siteUrl);
  const attachment = new AttachmentBuilder(buffer, { name: 'pnl.png' });
  const symbol = event.token_symbol ? `**$${event.token_symbol}** ` : '';
  const mintShort = `${String(event.token_mint).slice(0, 4)}…${String(event.token_mint).slice(-4)}`;
  await channel.send({
    content: `${symbol}\`${mintShort}\``,
    files: [attachment],
  });
  return true;
}

async function tick(client, config) {
  const token = process.env.PNL_API_TOKEN;
  if (!token) return; // silent — feature disabled

  let checkpoint;
  try {
    checkpoint = await loadCheckpoint();
  } catch (err) {
    console.warn('[pnlPoller] checkpoint read failed:', err.message);
    return;
  }

  let events;
  try {
    events = await fetchRecent({
      apiBaseUrl: config.apiBaseUrl,
      token,
      afterId: checkpoint,
      limit: 10,
    });
  } catch (err) {
    console.warn('[pnlPoller] fetch failed:', err.message);
    return;
  }
  if (!events || events.length === 0) return;

  for (const event of events) {
    try {
      const posted = await postOne(client, config.channelId, event, config.siteUrl);
      if (!posted) {
        // Channel issue — abort the loop so we don't burn the rest of the
        // batch on a misconfig.
        return;
      }
      await ack({ apiBaseUrl: config.apiBaseUrl, token, eventId: event.id });
      await bumpCheckpoint(event.id);
    } catch (err) {
      console.warn(`[pnlPoller] event ${event.id} failed:`, err.message);
      // Don't advance checkpoint — Rust will return this event again on the
      // next tick (`posted_at` still NULL).
      return;
    }
  }
}

function start(client, config) {
  if (intervalHandle) return; // already started
  if (!config || !config.channelId) {
    console.log('[pnlPoller] no channelId configured — skipping');
    return;
  }
  if (!process.env.PNL_API_TOKEN) {
    console.log('[pnlPoller] PNL_API_TOKEN not set — skipping');
    return;
  }
  const intervalMs = Number(config.pollIntervalMs) || 30_000;
  console.log(
    `[pnlPoller] started, channel=${config.channelId}, interval=${intervalMs}ms`,
  );
  // First tick immediately (so a fresh deploy posts pending events without
  // waiting `intervalMs`), then on the configured cadence.
  tick(client, config).catch((e) => console.warn('[pnlPoller] initial tick:', e.message));
  intervalHandle = setInterval(() => {
    tick(client, config).catch((e) => console.warn('[pnlPoller] tick:', e.message));
  }, intervalMs);
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { start, stop };
