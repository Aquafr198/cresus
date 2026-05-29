module.exports = {
  name: 'inviteDelete',
  async execute(invite, client) {
    // Drop the invite from the cache so a future join can't be wrongly
    // attributed to a code that no longer exists.
    if (!client.inviteCache) return;

    const guildInvites = client.inviteCache.get(invite.guild.id);
    if (guildInvites) {
      guildInvites.delete(invite.code);
    }
  },
};
