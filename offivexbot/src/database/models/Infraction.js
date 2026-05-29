// Infraction data access — backed by SQLite (table `infractions`).
//
// The only call site is `utils/automod.js` which does
// `Infraction.create({ userId, username, type, reason, moderatorId })` and
// ignores the return value. We keep the rest of the API minimal until a real
// caller appears.

const db = require('../db');

const insertStmt = db.prepare(`
  INSERT INTO infractions (user_id, username, type, reason, moderator_id, timestamp, expires)
  VALUES (@userId, @username, @type, @reason, @moderatorId, @timestamp, @expires)
`);

async function create(fields) {
  const result = insertStmt.run({
    userId: fields.userId,
    username: fields.username,
    type: fields.type,
    reason: fields.reason,
    moderatorId: fields.moderatorId,
    timestamp: fields.timestamp instanceof Date
      ? fields.timestamp.getTime()
      : (fields.timestamp ?? Date.now()),
    expires: fields.expires instanceof Date
      ? fields.expires.getTime()
      : (fields.expires ?? null),
  });
  return {
    id: result.lastInsertRowid,
    userId: fields.userId,
    username: fields.username,
    type: fields.type,
    reason: fields.reason,
    moderatorId: fields.moderatorId,
    timestamp: new Date(fields.timestamp ?? Date.now()),
    expires: fields.expires ?? null,
  };
}

module.exports = { create };
