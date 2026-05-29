// TODO(offivex): integrate with backend /user/referral/* — currently the
// support role is granted permanently to anyone with `discord.gg/offivex`
// in their Discord status, with NO link to the SaaS subscription or
// referral cashback. Two ways to make it earn its keep:
//   1) Tie the grant to a real referral signal (user joined via an /apply
//      with a tracked code) — turn it into a "verified referrer" badge.
//   2) Accept that it's purely a "thanks for displaying support" badge
//      and document it as such — current behaviour, just decoupled from
//      anything money-related.
// Until then this stays a feature inherited from the game-server era of
// the bot, kept on the user's explicit ask (see plan 2026-05-24).
const { Events } = require('discord.js');
const config = require('../../config.json');
const { noticeEmbed } = require('../utils/embeds');

module.exports = {
  name: Events.PresenceUpdate,
  async execute(oldPresence, newPresence) {
    // Skip if the support-role feature isn't configured.
    if (!config.supportRole || !config.supportRole.roleId) return;

    const member = newPresence?.member;
    if (!member || member.user.bot) return;

    const guild = newPresence.guild;
    if (!guild) return;

    const inviteLink = config.supportRole.inviteLink.toLowerCase();
    const roleId = config.supportRole.roleId;

    const supportRole = guild.roles.cache.get(roleId);
    if (!supportRole) return;

    // Helper: does this presence contain the invite anywhere in its activities?
    const hasInviteInStatus = (presence) => {
      if (!presence || !presence.activities) return false;
      return presence.activities.some((activity) => {
        // Custom status (type 4) lives under `state`.
        if (activity.type === 4) {
          const state = activity.state?.toLowerCase() || '';
          return state.includes(inviteLink);
        }
        const name = activity.name?.toLowerCase() || '';
        const details = activity.details?.toLowerCase() || '';
        const state = activity.state?.toLowerCase() || '';
        return name.includes(inviteLink) || details.includes(inviteLink) || state.includes(inviteLink);
      });
    };

    const hadInvite = hasInviteInStatus(oldPresence);
    const hasInvite = hasInviteInStatus(newPresence);

    // No change → no work.
    if (hadInvite === hasInvite) return;

    const hasRole = member.roles.cache.has(roleId);

    try {
      // Member added the invite to their status.
      if (hasInvite && !hasRole) {
        await member.roles.add(supportRole);
        await sendLog(guild, member, true);

        try {
          const embed = noticeEmbed('success')
            .setAuthor({ name: '🎉 Thanks for the support!' })
            .setDescription(
              `You received the **${supportRole.name}** role for putting our invite link in your Discord status.\n\nThanks for supporting **Offivex**! 💜`,
            );
          await member.send({ embeds: [embed] });
        } catch (err) {
          // DMs closed — non-fatal.
        }
      }
      // Member removed the invite from their status.
      else if (!hasInvite && hasRole) {
        await member.roles.remove(supportRole);
        await sendLog(guild, member, false);

        try {
          const embed = noticeEmbed('danger')
            .setAuthor({ name: '😢 Support role removed' })
            .setDescription(
              `You lost the **${supportRole.name}** role because you removed our invite link from your Discord status.\n\nAdd it back to recover the role! 💜`,
            );
          await member.send({ embeds: [embed] });
        } catch (err) {
          // DMs closed — non-fatal.
        }
      }
    } catch (error) {
      console.error('[presenceUpdate] support role handling error:', error);
    }
  },
};

async function sendLog(guild, member, added) {
  if (!config.supportRole.logsChannelId) return;

  const logsChannel = guild.channels.cache.get(config.supportRole.logsChannelId);
  if (!logsChannel) return;

  const embed = noticeEmbed(added ? 'success' : 'danger', { guild })
    .setAuthor({ name: added ? '✅ Support role granted' : '❌ Support role removed' })
    .setDescription(
      `**Member:** ${member} (${member.user.tag})\n**Action:** ${
        added ? 'Added the invite link to their status' : 'Removed the invite link from their status'
      }`,
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp();

  try {
    await logsChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[presenceUpdate] failed to send log:', err?.message ?? err);
  }
}
