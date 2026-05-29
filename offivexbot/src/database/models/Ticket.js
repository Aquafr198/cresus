// Ticket data access — backed by SQLite (table `tickets`).
//
// Keeps the same surface as the prior Mongoose model so the call sites in
// `events/interactionCreate.js` don't change : `findOne(filter)`,
// `create(fields)`, `findOneAndUpdate(filter, patch)`. Rows are returned as
// plain camelCase objects matching the old Mongoose shape.

const db = require('../db');

const VALID_FILTERS = new Set(['ticketId', 'userId', 'channelId', 'status']);
const COLUMN = {
  ticketId: 'ticket_id',
  userId: 'user_id',
  username: 'username',
  channelId: 'channel_id',
  type: 'type',
  status: 'status',
  createdAt: 'created_at',
  closedAt: 'closed_at',
  closedBy: 'closed_by',
  lastActivityAt: 'last_activity_at',
  closingAt: 'closing_at',
};

const insertStmt = db.prepare(`
  INSERT INTO tickets (ticket_id, user_id, username, channel_id, type, status, created_at, last_activity_at)
  VALUES (@ticketId, @userId, @username, @channelId, @type, @status, @createdAt, @createdAt)
`);

// Bumps both `last_activity_at` AND clears `closing_at` — a user posting in
// a ticket within the 1h grace period rescues the ticket from auto-close.
const bumpActivityStmt = db.prepare(
  `UPDATE tickets SET last_activity_at = ?, closing_at = NULL WHERE channel_id = ? AND status = 'open'`,
);

// Find all open tickets that haven't had activity in `thresholdMs`.
const findInactiveStmt = db.prepare(
  `SELECT * FROM tickets WHERE status = 'open' AND last_activity_at IS NOT NULL AND last_activity_at < ?`,
);

const setClosingAtStmt = db.prepare(
  `UPDATE tickets SET closing_at = ? WHERE ticket_id = ?`,
);

function rowToTicket(row) {
  if (!row) return null;
  return {
    ticketId: row.ticket_id,
    userId: row.user_id,
    username: row.username,
    channelId: row.channel_id,
    type: row.type,
    status: row.status,
    createdAt: new Date(row.created_at),
    closedAt: row.closed_at != null ? new Date(row.closed_at) : null,
    closedBy: row.closed_by,
    lastActivityAt: row.last_activity_at != null ? new Date(row.last_activity_at) : null,
    closingAt: row.closing_at != null ? new Date(row.closing_at) : null,
  };
}

function buildWhere(filter) {
  const where = [];
  const params = {};
  for (const [k, v] of Object.entries(filter || {})) {
    if (!VALID_FILTERS.has(k)) continue;
    where.push(`${COLUMN[k]} = @${k}`);
    params[k] = v;
  }
  return {
    sql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

async function findOne(filter) {
  const { sql, params } = buildWhere(filter);
  const row = db.prepare(`SELECT * FROM tickets ${sql} LIMIT 1`).get(params);
  return rowToTicket(row);
}

async function create(fields) {
  insertStmt.run({
    ticketId: fields.ticketId,
    userId: fields.userId,
    username: fields.username,
    channelId: fields.channelId,
    type: fields.type,
    status: fields.status || 'open',
    createdAt: Date.now(),
  });
  return findOne({ ticketId: fields.ticketId });
}

async function findOneAndUpdate(filter, patch) {
  const sets = [];
  const params = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (!COLUMN[k]) continue;
    sets.push(`${COLUMN[k]} = @${k}`);
    params[k] = v instanceof Date ? v.getTime() : v;
  }
  if (sets.length === 0) return findOne(filter);
  const { sql: whereSql, params: whereParams } = buildWhere(filter);
  db.prepare(`UPDATE tickets SET ${sets.join(', ')} ${whereSql}`).run({
    ...params,
    ...whereParams,
  });
  return findOne(filter);
}

/**
 * Bump `last_activity_at` for the OPEN ticket attached to `channelId`. Also
 * clears `closing_at` so a user posting during the 1h grace period rescues
 * their own ticket. Cheap — single UPDATE keyed on `idx_tickets_channel`.
 * @returns {boolean} true if a row was updated.
 */
function bumpActivity(channelId, now = Date.now()) {
  const info = bumpActivityStmt.run(now, channelId);
  return info.changes > 0;
}

/**
 * Return all OPEN tickets whose last activity is older than `now - thresholdMs`.
 * Used by the auto-close scheduler.
 */
function findInactive(thresholdMs, now = Date.now()) {
  return findInactiveStmt.all(now - thresholdMs).map(rowToTicket);
}

/**
 * Stamp the moment after which the ticket should actually be closed
 * (warning DM sent, grace period started).
 */
function setClosingAt(ticketId, closingAt) {
  setClosingAtStmt.run(closingAt, ticketId);
}

module.exports = {
  findOne,
  create,
  findOneAndUpdate,
  bumpActivity,
  findInactive,
  setClosingAt,
};
