// Singleton row tracking the highest realized-PNL event id the bot has
// successfully consumed. SQL on the Offivex backend is the source of truth
// for "posted vs not" (via `posted_at`); this checkpoint lets the bot skip
// already-acked rows after a restart without re-querying every unposted
// event. Backed by SQLite (table `pnl_checkpoint`, hardcoded id=1).

const db = require('../db');

function rowToCheckpoint(row) {
  if (!row) return null;
  return {
    lastSeenEventId: row.last_seen_event_id,
    updatedAt: new Date(row.updated_at),
  };
}

/// Mirrors Mongoose's `findOne({})` for the singleton row. Always returns
/// a value because the row is seeded in `db.js` at boot.
async function findOne(_filter) {
  const row = db
    .prepare('SELECT last_seen_event_id, updated_at FROM pnl_checkpoint WHERE id = 1')
    .get();
  return rowToCheckpoint(row);
}

/// Mirrors `PnlCheckpoint.create({ lastSeenEventId })`. The seed row is
/// already present so this is a no-op upsert kept for API compatibility
/// with the pre-existing pnlPoller code path.
async function create(fields) {
  await updateOne({}, fields, { upsert: true });
  return findOne({});
}

/// Mirrors `updateOne({}, patch, { upsert: true })` for the singleton.
async function updateOne(_filter, patch, _options) {
  const lastSeenEventId =
    typeof patch.lastSeenEventId === 'number' ? patch.lastSeenEventId : 0;
  const updatedAt =
    patch.updatedAt instanceof Date ? patch.updatedAt.getTime() : Date.now();
  db.prepare(`
    UPDATE pnl_checkpoint
    SET last_seen_event_id = @lastSeenEventId,
        updated_at = @updatedAt
    WHERE id = 1
  `).run({ lastSeenEventId, updatedAt });
}

module.exports = { findOne, create, updateOne };
