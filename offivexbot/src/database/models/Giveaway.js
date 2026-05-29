// Giveaway data access — backed by SQLite (tables `giveaways` +
// `giveaway_participants`).
//
// Unlike the other models in this directory, this one does NOT mimic the
// Mongoose API because there was no prior Mongoose model for giveaways
// (state was held in an in-memory Map). Cleaner naming reflects that this
// is the canonical persistence layer for the feature.
//
// All functions are synchronous because better-sqlite3 itself is
// synchronous, but they're declared `async`-friendly (return values used
// directly with `await` in callers) for forward-compat with any future
// migration to a non-blocking driver.

const db = require('../db');

const insertStmt = db.prepare(`
  INSERT INTO giveaways
    (id, guild_id, channel_id, prize, end_at, winners_count, role_required, host_id, status, created_at)
  VALUES
    (@id, @guildId, @channelId, @prize, @endAt, @winnersCount, @roleRequired, @hostId, 'running', @createdAt)
`);

const markEndedStmt = db.prepare(`UPDATE giveaways SET status = 'ended' WHERE id = ?`);
const selectByIdStmt = db.prepare(`SELECT * FROM giveaways WHERE id = ?`);
const listRunningStmt = db.prepare(`SELECT * FROM giveaways WHERE status = 'running' ORDER BY end_at ASC`);

const insertParticipantStmt = db.prepare(`
  INSERT OR IGNORE INTO giveaway_participants (giveaway_id, user_id)
  VALUES (?, ?)
`);
const deleteParticipantStmt = db.prepare(`
  DELETE FROM giveaway_participants WHERE giveaway_id = ? AND user_id = ?
`);
const listParticipantsStmt = db.prepare(`
  SELECT user_id FROM giveaway_participants WHERE giveaway_id = ?
`);
const countParticipantsStmt = db.prepare(`
  SELECT COUNT(*) AS n FROM giveaway_participants WHERE giveaway_id = ?
`);

function rowToGiveaway(row) {
  if (!row) return null;
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    prize: row.prize,
    endAt: row.end_at,
    winnersCount: row.winners_count,
    roleRequired: row.role_required,
    hostId: row.host_id,
    status: row.status,
    createdAt: row.created_at,
  };
}

function create(fields) {
  insertStmt.run({
    id: fields.id,
    guildId: fields.guildId,
    channelId: fields.channelId,
    prize: fields.prize,
    endAt: fields.endAt,
    winnersCount: fields.winnersCount,
    roleRequired: fields.roleRequired ?? null,
    hostId: fields.hostId,
    createdAt: Date.now(),
  });
  return rowToGiveaway(selectByIdStmt.get(fields.id));
}

function getById(id) {
  return rowToGiveaway(selectByIdStmt.get(id));
}

function markEnded(id) {
  const info = markEndedStmt.run(id);
  return info.changes > 0;
}

function listRunning() {
  return listRunningStmt.all().map(rowToGiveaway);
}

/// Returns true if a NEW participant row was inserted, false if the user
/// was already a participant (idempotent). Used by the participate button
/// to detect "double-click = leave the giveaway" intent.
function addParticipant(giveawayId, userId) {
  const info = insertParticipantStmt.run(giveawayId, userId);
  return info.changes > 0;
}

/// Returns true if a row was actually deleted, false otherwise.
function removeParticipant(giveawayId, userId) {
  const info = deleteParticipantStmt.run(giveawayId, userId);
  return info.changes > 0;
}

function listParticipants(giveawayId) {
  return listParticipantsStmt.all(giveawayId).map((r) => r.user_id);
}

function countParticipants(giveawayId) {
  return countParticipantsStmt.get(giveawayId).n;
}

function hasParticipant(giveawayId, userId) {
  const row = db
    .prepare(`SELECT 1 FROM giveaway_participants WHERE giveaway_id = ? AND user_id = ? LIMIT 1`)
    .get(giveawayId, userId);
  return !!row;
}

module.exports = {
  create,
  getById,
  markEnded,
  listRunning,
  addParticipant,
  removeParticipant,
  listParticipants,
  countParticipants,
  hasParticipant,
};
