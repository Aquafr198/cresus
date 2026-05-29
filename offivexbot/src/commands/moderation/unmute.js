const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { noticeEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription("Remove a member's mute")
    .addUserOption((option) =>
      option.setName('member').setDescription('The member to unmute').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason for the unmute')
        .setMaxLength(512)
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({
        content: '❌ You need the Moderate Members permission to use this command.',
        ephemeral: true,
      });
    }

    const { moderation } = client.config;
    if (moderation && moderation.staffRoleId) {
      if (!interaction.member.roles.cache.has(moderation.staffRoleId)) {
        return interaction.reply({
          content: "❌ You don't have permission to use this command.",
          ephemeral: true,
        });
      }
    }

    const member = interaction.options.getMember('member');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!member) {
      return interaction.reply({ content: "❌ That member isn't in this server.", ephemeral: true });
    }
    if (!member.isCommunicationDisabled()) {
      return interaction.reply({ content: "❌ This member isn't muted.", ephemeral: true });
    }

    try {
      await member.timeout(null, `Unmute: ${reason} | By: ${interaction.user.tag}`);

      const confirmEmbed = noticeEmbed('success', { guild: interaction.guild })
        .setAuthor({ name: '🔊 Member unmuted' })
        .setDescription(`${member} has been unmuted.`)
        .addFields(
          { name: '👤 Member', value: `${member.user.tag}`, inline: true },
          { name: '👮 Moderator', value: `${interaction.user.tag}`, inline: true },
          { name: '📝 Reason', value: reason, inline: false },
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

      await interaction.reply({ embeds: [confirmEmbed] });

      // DM the unmuted member (best-effort).
      try {
        const dmEmbed = noticeEmbed('success')
          .setAuthor({ name: '🔊 You have been unmuted on Offivex' })
          .setDescription(`Your mute on **${interaction.guild.name}** has been removed.`)
          .addFields({ name: '📝 Reason', value: reason, inline: false })
          .setTimestamp();
        await member.send({ embeds: [dmEmbed] });
      } catch (err) {
        // DMs closed — non-fatal.
      }

      await sendLog(interaction, client, member, reason);
    } catch (error) {
      console.error('[unmute] failed to remove timeout:', error);
      return interaction.reply({
        content: '❌ An error occurred while removing the mute.',
        ephemeral: true,
      });
    }
  },
};

async function sendLog(interaction, client, member, reason) {
  const { logs } = client.config;
  if (!logs || !logs.channelId) return;

  const logsChannel = interaction.guild.channels.cache.get(logs.channelId);
  if (!logsChannel) return;

  const logEmbed = noticeEmbed('success', { guild: interaction.guild })
    .setAuthor({ name: '🔊 Unmute' })
    .setDescription('A member has been unmuted.')
    .addFields(
      { name: '👤 Member', value: `${member} (${member.user.tag})`, inline: true },
      { name: '🆔 ID', value: member.id, inline: true },
      { name: '👮 Moderator', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
      { name: '📝 Reason', value: reason, inline: false },
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp();

  try {
    await logsChannel.send({ embeds: [logEmbed] });
  } catch (err) {
    console.error('[unmute] failed to send log:', err);
  }
}
