// Verification data access — backed by SQLite (table `verifications`).
//
// Keeps the same surface as the prior Mongoose model so the call sites in
// `commands/admin/setup-verification.js`, `commands/moderation/configure-permissions.js`,
// `events/guildMemberAdd.js`, and `handlers/captchaHandler.js` don't change.

const db = require('../db');

function rowToVerification(row) {
  if (!row) return null;
  return {
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    roleMembre: row.role_membre,
    roleNonVerifie: row.role_non_verifie,
  };
}

async function findOne(filter) {
  if (!filter || !filter.guildId) {
    // Mongoose's findOne with no filter returns *any* row; emulate.
    const row = db.prepare('SELECT * FROM verifications LIMIT 1').get();
    return rowToVerification(row);
  }
  const row = db
    .prepare('SELECT * FROM verifications WHERE guild_id = ? LIMIT 1')
    .get(filter.guildId);
  return rowToVerification(row);
}

/// Upsert by guildId. Mirrors the original
/// `findOneAndUpdate(filter, patch, { upsert: true, new: true })` call.
async function findOneAndUpdate(filter, patch, _options) {
  const guildId = filter && filter.guildId;
  if (!guildId) throw new Error('Verification.findOneAndUpdate requires { guildId }');
  const merged = { ...patch, guildId };
  db.prepare(`
    INSERT INTO verifications (guild_id, channel_id, message_id, role_membre, role_non_verifie)
    VALUES (@guildId, @channelId, @messageId, @roleMembre, @roleNonVerifie)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id = excluded.channel_id,
      message_id = excluded.message_id,
      role_membre = excluded.role_membre,
      role_non_verifie = excluded.role_non_verifie
  `).run({
    guildId,
    channelId: merged.channelId ?? null,
    messageId: merged.messageId ?? null,
    roleMembre: merged.roleMembre ?? null,
    roleNonVerifie: merged.roleNonVerifie ?? null,
  });
  return findOne({ guildId });
}

module.exports = { findOne, findOneAndUpdate };
