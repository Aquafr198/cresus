const { PermissionFlagsBits } = require('discord.js');
const Infraction = require('../database/models/Infraction');
const { noticeEmbed } = require('./embeds');

// Per-user message cache for spam detection.
const userMessageCache = new Map();

// Discord's bulkDelete API rejects messages older than 14 days. Pre-filter
// the batch instead of letting Discord 50034 the whole call.
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Is this channel a ticket channel? (We exempt automod inside tickets so
 * support conversations can include links and frank language.)
 * @param {Object} channel Discord channel.
 */
function isTicketChannel(channel) {
  return channel.name && channel.name.startsWith('ticket-');
}

/**
 * Should this member be skipped by automod? (Mods + configured exempt roles.)
 * Extracted so all three checks apply the same gate without duplicating
 * the `permissions.has('ManageMessages')` + exemptRoleIds logic.
 */
function isExempt(member, client) {
  if (!member) return true;
  if (member.permissions.has('ManageMessages')) return true;
  const exemptRoleIds = client.config.automod.exemptRoleIds || [];
  return exemptRoleIds.some((id) => member.roles.cache.has(id));
}

/**
 * Reject messages containing configured bad words.
 * @param {Object} message Discord message.
 * @param {Object} member  Pre-fetched GuildMember (provided by messageCreate).
 * @param {Object} client  Discord.js client.
 */
async function checkBadWords(message, member, client) {
  if (message.author.bot || !message.guild) return;

  // Skip ticket channels.
  if (isTicketChannel(message.channel)) return;

  // Skip moderators and exempt roles.
  if (isExempt(member, client)) return;

  const content = message.content.toLowerCase();
  const badWords = client.config.automod.badWords;

  const containsBadWord = badWords.some((word) => content.includes(word.toLowerCase()));

  if (containsBadWord) {
    try {
      await message.delete();
      await logInfraction(message, client, 'badword', 'Message containing forbidden words');
      await message.channel
        .send({
          content: `<@${message.author.id}>, your message contained forbidden words and was deleted.`,
        })
        .then((msg) => setTimeout(() => msg.delete().catch(() => {}), 5000));
    } catch (err) {
      console.error('[automod] bad-words moderation failed:', err);
    }
  }
}

/**
 * Reject messages containing HTTP(S) links.
 * @param {Object} message Discord message.
 * @param {Object} member  Pre-fetched GuildMember.
 * @param {Object} client  Discord.js client.
 */
async function checkLinks(message, member, client) {
  if (message.author.bot || !message.guild) return;

  // Links are allowed inside tickets (so users can share Solscan, Birdeye, etc.).
  if (isTicketChannel(message.channel)) return;

  if (isExempt(member, client)) return;

  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  if (urlRegex.test(message.content)) {
    try {
      await message.delete();
      await logInfraction(message, client, 'link', 'Message containing links');
      await message.channel
        .send({
          content: `<@${message.author.id}>, links aren't allowed here.`,
        })
        .then((msg) => setTimeout(() => msg.delete().catch(() => {}), 5000));
    } catch (err) {
      console.error('[automod] link moderation failed:', err);
    }
  }
}

/**
 * Detect spam — N messages in M ms → timeout + bulk-delete.
 * @param {Object} message Discord message.
 * @param {Object} member  Pre-fetched GuildMember.
 * @param {Object} client  Discord.js client.
 */
async function checkSpam(message, member, client) {
  if (message.author.bot || !message.guild) return;

  // Skip ticket channels.
  if (isTicketChannel(message.channel)) return;

  if (isExempt(member, client)) return;

  const { maxMessages, timeWindow, muteDuration } = client.config.automod.antispamSettings;

  // First message in the window → seed the cache entry and schedule its expiry.
  if (!userMessageCache.has(message.author.id)) {
    userMessageCache.set(message.author.id, {
      messages: [message],
      timeout: setTimeout(() => {
        userMessageCache.delete(message.author.id);
      }, timeWindow),
    });
    return;
  }

  const userData = userMessageCache.get(message.author.id);
  userData.messages.push(message);

  if (userData.messages.length >= maxMessages) {
    try {
      const messagesToDelete = userData.messages;
      const channel = message.channel;

      // Pre-filter the batch to the 14-day bulkDelete window. Without this,
      // a single edited-long-ago message in the batch would make the whole
      // call 50034 silently (caught in the outer try/catch, logged as
      // "spam handling failed", BUT the user is never timed out and the
      // spam messages stay).
      const deletable = messagesToDelete.filter(
        (m) => !m.deleted && Date.now() - m.createdTimestamp < FOURTEEN_DAYS_MS,
      );
      if (deletable.length > 0) {
        await channel.bulkDelete(deletable);
      }

      // Bail BEFORE attempting the timeout if the bot lacks ModerateMembers
      // or if the spammer outranks the bot. Without this guard, the timeout
      // call throws, the outer try/catch swallows it, the spammer's
      // messages have already been deleted, BUT no mute is applied — the
      // user sees their messages vanish without consequence, and the only
      // trace is a generic "[automod] spam handling failed" log. Surfacing
      // the failure as a distinct infraction type lets staff manually act.
      const botMember = message.guild.members.me;
      const canTimeout =
        botMember.permissions.has(PermissionFlagsBits.ModerateMembers) &&
        member.roles.highest.position < botMember.roles.highest.position;

      if (!canTimeout) {
        console.warn(
          `[automod] cannot timeout ${member.user.tag}: missing ModerateMembers perm or role hierarchy mismatch`,
        );
        await logInfraction(
          message,
          client,
          'spam',
          `Spam detected (${messagesToDelete.length} messages) — auto-mute BLOCKED by permissions / role hierarchy`,
        );
        clearTimeout(userData.timeout);
        userMessageCache.delete(message.author.id);
        return;
      }

      // Temp mute (timeout).
      await member.timeout(muteDuration, 'Spam detected');

      await logInfraction(
        message,
        client,
        'spam',
        `Spam detected (${messagesToDelete.length} messages)`,
      );

      await channel.send({
        content: `<@${message.author.id}> has been timed out for ${muteDuration / 60000} minutes for spam.`,
      });

      // Reset the cache entry so the user can speak again after the mute.
      clearTimeout(userData.timeout);
      userMessageCache.delete(message.author.id);
    } catch (err) {
      console.error('[automod] spam handling failed:', err);
    }
  }
}

/**
 * Persist an infraction and post it to the automod log channel.
 * @param {Object} message Discord message.
 * @param {Object} client  Discord.js client.
 * @param {String} type    Infraction kind.
 * @param {String} reason  Human-readable reason.
 */
async function logInfraction(message, client, type, reason) {
  try {
    await Infraction.create({
      userId: message.author.id,
      username: message.author.username,
      type: type,
      reason: reason,
      moderatorId: client.user.id,
    });

    const logChannel = message.guild.channels.cache.get(client.config.automod.logsChannelId);
    if (!logChannel) return;

    const logEmbed = noticeEmbed('danger', { guild: message.guild })
      .setAuthor({ name: '🛡️ AutoMod — infraction detected' })
      .setDescription('An automatic moderation action was taken.')
      .addFields(
        { name: 'User', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
        { name: 'Infraction type', value: type, inline: true },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
        { name: 'Message ID', value: message.id, inline: true },
      )
      .setTimestamp();

    await logChannel.send({ embeds: [logEmbed] });
  } catch (err) {
    console.error('[automod] failed to log infraction:', err);
  }
}

module.exports = {
  checkBadWords,
  checkLinks,
  checkSpam,
};
