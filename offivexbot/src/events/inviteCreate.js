module.exports = {
  name: 'inviteCreate',
  async execute(invite, client) {
    // Keep the invite cache up to date so guildMemberAdd can resolve
    // "invited by" by diffing the `uses` counter.
    if (!client.inviteCache) client.inviteCache = new Map();

    const guildInvites = client.inviteCache.get(invite.guild.id) || new Map();
    guildInvites.set(invite.code, { uses: invite.uses });
    client.inviteCache.set(invite.guild.id, guildInvites);
  },
};
