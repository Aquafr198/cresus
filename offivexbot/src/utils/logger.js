const { brandedEmbed, noticeEmbed } = require('./embeds');

// Discord embed field value cap. Posting a 5000-char message and then
// editing/deleting it would overflow this and Discord would silently
// reject the entire log embed.
const FIELD_VALUE_MAX = 1024;
function truncate(text, max = FIELD_VALUE_MAX) {
  if (!text) return text;
  return text.length > max ? text.substring(0, max - 3) + '...' : text;
}

/**
 * Send a moderation/event log entry to the configured logs channel.
 * @param {Object} client Discord client.
 * @param {String} type   Log kind ('messageDelete' | 'messageUpdate' | 'guildMemberAdd' | 'guildMemberRemove' | 'moderation').
 * @param {Object} data   Payload — shape depends on `type`.
 */
async function sendLog(client, type, data) {
  if (!client?.config?.logs?.channelId) return;

  const logChannel = client.channels.cache.get(client.config.logs.channelId);
  if (!logChannel) return;

  const guild = logChannel.guild;
  let embed;

  switch (type) {
    case 'messageDelete':
      if (!data || !data.author) return;

      embed = noticeEmbed('danger', { guild })
        .setAuthor({ name: '🗑️ Message deleted' })
        .addFields(
          { name: 'Author', value: `<@${data.author.id}> (${data.author.tag})`, inline: true },
          {
            name: 'Channel',
            value: data.channelId ? `<#${data.channelId}>` : 'Unknown channel',
            inline: true,
          },
          { name: 'Content', value: truncate(data.content) || '*No text content*' },
        )
        .setTimestamp();
      break;

    case 'messageUpdate':
      if (!data || !data.author) return;

      embed = noticeEmbed('warning', { guild })
        .setAuthor({ name: '✏️ Message edited' })
        .addFields(
          { name: 'Author', value: `<@${data.author.id}> (${data.author.tag})`, inline: true },
          {
            name: 'Channel',
            value: data.channelId ? `<#${data.channelId}>` : 'Unknown channel',
            inline: true,
          },
          { name: 'Before', value: truncate(data.oldContent) || '*No text content*' },
          { name: 'After', value: truncate(data.newContent) || '*No text content*' },
        )
        .setTimestamp();
      break;

    case 'guildMemberAdd':
      if (!data || !data.user) return;

      embed = noticeEmbed('success', { guild })
        .setAuthor({ name: '➕ Member joined' })
        .setThumbnail(data.user.displayAvatarURL())
        .addFields(
          { name: 'User', value: `<@${data.user.id}> (${data.user.tag})`, inline: true },
          { name: 'ID', value: data.user.id, inline: true },
          {
            name: 'Account created',
            value: `<t:${Math.floor(data.user.createdAt.getTime() / 1000)}:R>`,
            inline: false,
          },
        )
        .setTimestamp();
      break;

    case 'guildMemberRemove':
      if (!data || !data.user) return;

      embed = brandedEmbed({ color: 0xff6600, guild })
        .setAuthor({ name: '➖ Member left' })
        .setThumbnail(data.user.displayAvatarURL())
        .addFields(
          { name: 'User', value: `${data.user.tag}`, inline: true },
          { name: 'ID', value: data.user.id, inline: true },
          {
            name: 'Joined the server',
            value: data.joinedAt
              ? `<t:${Math.floor(data.joinedAt.getTime() / 1000)}:R>`
              : 'Unknown',
            inline: false,
          },
        )
        .setTimestamp();
      break;

    case 'moderation':
      if (!data || !data.moderator || !data.target) return;

      embed = brandedEmbed({ color: 0x9900ff, guild })
        .setAuthor({ name: `🛡️ Moderation action: ${data.action}` })
        .addFields(
          {
            name: 'Moderator',
            value: `<@${data.moderator.id}> (${data.moderator.tag})`,
            inline: true,
          },
          { name: 'User', value: `<@${data.target.id}> (${data.target.tag})`, inline: true },
          { name: 'Reason', value: truncate(data.reason) || '*No reason provided*' },
        )
        .setTimestamp();

      if (data.duration) {
        embed.addFields({ name: 'Duration', value: data.duration, inline: true });
      }
      break;
  }

  if (embed) {
    await logChannel
      .send({ embeds: [embed] })
      .catch((err) => console.error('[logger] failed to send log:', err));
  }
}

module.exports = { sendLog };
