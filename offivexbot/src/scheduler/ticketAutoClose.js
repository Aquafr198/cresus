// Daily-ish scheduler that auto-closes tickets inactive for > 48h.
//
// Two-phase to avoid surprise closures:
//
//   Phase 1 — first scan that finds last_activity_at < now - 48h AND no
//             pending closing_at: post a warning in the ticket channel + DM
//             the opener, then stamp `closing_at = now + 1h`. A user
//             posting any message in the ticket clears closing_at via
//             Ticket.bumpActivity, rescuing the ticket.
//
//   Phase 2 — second scan, when closing_at <= now: actually close. Mark
//             the DB row closed AND delete the channel.
//
// Tick cadence: 1h. A daily tick would make the "1h grace" feel like up to
// 24h, which is fine but not as crisp. Hourly keeps the experience tight.

const Ticket = require('../database/models/Ticket');
const { noticeEmbed } = require('../utils/embeds');

const INACTIVITY_MS = 48 * 60 * 60 * 1000;
const GRACE_AFTER_WARNING_MS = 60 * 60 * 1000;
const TICK_INTERVAL_MS = 60 * 60 * 1000;

let intervalHandle = null;

async function processOne(client, ticket) {
  const now = Date.now();

  // Phase 1 — first time we see this ticket as inactive.
  if (ticket.closingAt == null) {
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (channel) {
      try {
        const embed = noticeEmbed('warning')
          .setAuthor({ name: '⏱️ Auto-close pending' })
          .setDescription(
            `<@${ticket.userId}>, this ticket has been inactive for **48 hours**.\n` +
              `It will be **closed in 1 hour** unless someone posts here.`,
          );
        await channel.send({ embeds: [embed] });
      } catch (e) {
        console.warn(
          `[ticketAutoClose] cannot post warning in ${ticket.channelId}:`,
          e?.message ?? e,
        );
      }
    }

    // DM the opener too (best-effort — they may have DMs closed).
    try {
      const user = await client.users.fetch(ticket.userId);
      const dmEmbed = noticeEmbed('warning')
        .setAuthor({ name: '⏱️ Your ticket is about to close' })
        .setDescription(
          `Your ticket on **${channel?.guild?.name ?? 'the server'}** has been inactive for 48 hours.\n` +
            `It will close in 1 hour. Post a message in the ticket channel to keep it open.`,
        );
      await user.send({ embeds: [dmEmbed] });
    } catch (_e) {
      /* DMs closed — non-fatal */
    }

    Ticket.setClosingAt(ticket.ticketId, now + GRACE_AFTER_WARNING_MS);
    return;
  }

  // Phase 2 — grace window has elapsed.
  if (ticket.closingAt.getTime() <= now) {
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (channel) {
      try {
        await channel.delete('Auto-closed after 48h inactivity');
      } catch (e) {
        console.warn(
          `[ticketAutoClose] cannot delete channel ${ticket.channelId}:`,
          e?.message ?? e,
        );
      }
    }
    await Ticket.findOneAndUpdate(
      { ticketId: ticket.ticketId },
      { status: 'closed', closedAt: new Date(), closedBy: client.user.id },
    );
    console.log(`[ticketAutoClose] closed ticket ${ticket.ticketId} (inactive > 48h)`);
  }
}

async function tick(client) {
  try {
    const inactive = Ticket.findInactive(INACTIVITY_MS);
    if (inactive.length === 0) return;
    console.log(`[ticketAutoClose] scanning ${inactive.length} inactive ticket(s)`);
    for (const ticket of inactive) {
      try {
        await processOne(client, ticket);
      } catch (e) {
        console.error(`[ticketAutoClose] processOne(${ticket.ticketId}) failed:`, e);
      }
    }
  } catch (e) {
    console.error('[ticketAutoClose] tick failed:', e);
  }
}

function start(client) {
  if (intervalHandle) return;
  console.log(
    `[ticketAutoClose] started, tick=${TICK_INTERVAL_MS / 60000}min, inactivity=${INACTIVITY_MS / 3600000}h, grace=${GRACE_AFTER_WARNING_MS / 60000}min`,
  );
  // Run once immediately so a long-restarted bot catches up.
  tick(client).catch((e) => console.error('[ticketAutoClose] initial tick failed:', e));
  intervalHandle = setInterval(() => {
    tick(client).catch((e) => console.error('[ticketAutoClose] tick failed:', e));
  }, TICK_INTERVAL_MS);
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { start, stop };
