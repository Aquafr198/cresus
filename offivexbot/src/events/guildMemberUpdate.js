const config = require('../../config.json');
const { brandedEmbed, noticeEmbed, COLOR } = require('../utils/embeds');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    // Skip if the booster-role feature isn't configured.
    if (!config.boosterRole || !config.boosterRole.roleId) return;
    // Ignore bots.
    if (newMember.user.bot) return;

    const guild = newMember.guild;
    const roleId = config.boosterRole.roleId;

    const boosterRole = guild.roles.cache.get(roleId);
    if (!boosterRole) return;

    // Detect a transition between booster / non-booster.
    const wasBooster = oldMember.premiumSince !== null;
    const isBooster = newMember.premiumSince !== null;

    if (wasBooster === isBooster) return;

    const hasRole = newMember.roles.cache.has(roleId);

    try {
      // Member just started boosting.
      if (isBooster && !hasRole) {
        await newMember.roles.add(boosterRole);

        await sendLog(guild, newMember, true);

        // DM the member to thank them.
        try {
          const embed = brandedEmbed({ color: 0xff73fa })
            .setAuthor({ name: '💎 Thanks for the boost!' })
            .setDescription(
              `You received the **${boosterRole.name}** role for boosting the server!\n\nThanks for supporting **Offivex**! 💜🚀`,
            );
          await newMember.send({ embeds: [embed] });
        } catch (err) {
          // Member's DMs are probably closed — non-fatal.
        }
      }
      // Member stopped boosting.
      else if (!isBooster && hasRole) {
        await newMember.roles.remove(boosterRole);

        await sendLog(guild, newMember, false);

        try {
          const embed = noticeEmbed('danger')
            .setAuthor({ name: '😢 Booster role removed' })
            .setDescription(
              `You lost the **${boosterRole.name}** role because you're no longer boosting the server.\n\nFeel free to boost again to get it back! 💜`,
            );
          await newMember.send({ embeds: [embed] });
        } catch (err) {
          // DMs closed — non-fatal.
        }
      }
    } catch (error) {
      console.error('[guildMemberUpdate] booster role handling error:', error);
    }
  },
};

async function sendLog(guild, member, added) {
  if (!config.boosterRole.logsChannelId) return;

  const logsChannel = guild.channels.cache.get(config.boosterRole.logsChannelId);
  if (!logsChannel) return;

  const embed = brandedEmbed({ color: added ? 0xff73fa : COLOR.embedDanger, guild })
    .setAuthor({ name: added ? '💎 New booster!' : '❌ Boost removed' })
    .setDescription(
      `**Member:** ${member} (${member.user.tag})\n**Action:** ${
        added ? 'Started boosting the server' : 'Stopped boosting'
      }`,
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp();

  try {
    await logsChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[guildMemberUpdate] failed to send log:', err?.message ?? err);
  }
}
