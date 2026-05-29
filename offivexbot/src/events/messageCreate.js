const automod = require('../utils/automod');
const Ticket = require('../database/models/Ticket');

module.exports = {
  name: 'messageCreate',
  once: false,
  async execute(message, client) {
    // Ignore bots and DMs.
    if (message.author.bot || !message.guild) return;

    // Bump `last_activity_at` on the ticket if this message lands in one
    // (rescues the ticket from the 48h auto-close if it was in the 1h
    // grace window). The DB query is cheap and idempotent — we still
    // short-circuit on the channel-name prefix so we don't touch the DB
    // on every single message server-wide.
    if (message.channel.name?.startsWith('ticket-')) {
      Ticket.bumpActivity(message.channel.id);
    }

    // Fetch the GuildMember ONCE here (one Discord REST call) and pass it
    // down to each automod check. Pre-refactor, each of the three checks
    // called `members.fetch()` independently → 3 REST calls per message on
    // every chatty server. The fetch can fail on rare race conditions
    // (member left between message send and our handler running) — in
    // that case there's nothing to moderate anyway, so we just return.
    let member;
    try {
      member = await message.guild.members.fetch(message.author.id);
    } catch (e) {
      return;
    }

    // Run automod checks. Each function has its own try/catch, so a throw
    // in one of them doesn't kill the others.
    await automod.checkBadWords(message, member, client);
    await automod.checkLinks(message, member, client);
    await automod.checkSpam(message, member, client);
  },
};
