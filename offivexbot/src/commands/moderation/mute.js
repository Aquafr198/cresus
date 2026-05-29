const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { noticeEmbed, brandedEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout a server member')
    .addUserOption((option) =>
      option.setName('member').setDescription('The member to mute').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('duration')
        .setDescription('Mute duration')
        .setRequired(true)
        .addChoices(
          { name: '5 minutes', value: '5m' },
          { name: '10 minutes', value: '10m' },
          { name: '30 minutes', value: '30m' },
          { name: '1 hour', value: '1h' },
          { name: '2 hours', value: '2h' },
          { name: '6 hours', value: '6h' },
          { name: '12 hours', value: '12h' },
          { name: '1 day', value: '1d' },
          { name: '3 days', value: '3d' },
          { name: '7 days', value: '7d' },
          { name: '14 days', value: '14d' },
          { name: '28 days (max)', value: '28d' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason for the mute')
        .setMaxLength(512)
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction, client) {
    // In-handler permission double-check. `setDefaultMemberPermissions` is a
    // UI hint Discord can override server-side; never trust it as the only
    // gate on a destructive action.
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({
        content: "❌ You need the Moderate Members permission to use this command.",
        ephemeral: true,
      });
    }

    // Optional secondary gate via config staff role (defence in depth).
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
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!member) {
      return interaction.reply({ content: "❌ That member isn't in this server.", ephemeral: true });
    }
    if (member.user.bot) {
      return interaction.reply({ content: "❌ You can't mute a bot.", ephemeral: true });
    }
    if (member.id === interaction.user.id) {
      return interaction.reply({ content: "❌ You can't mute yourself.", ephemeral: true });
    }
    if (member.roles.highest.position >= interaction.member.roles.highest.position) {
      return interaction.reply({
        content: "❌ You can't mute this member because their role is higher than or equal to yours.",
        ephemeral: true,
      });
    }
    if (member.roles.highest.position >= interaction.guild.members.me.roles.highest.position) {
      return interaction.reply({
        content: "❌ I can't mute this member because their role is higher than or equal to mine.",
        ephemeral: true,
      });
    }
    if (member.isCommunicationDisabled()) {
      return interaction.reply({ content: '❌ This member is already muted.', ephemeral: true });
    }

    const durationMs = parseDuration(durationStr);
    const durationText = formatDuration(durationStr);

    try {
      await member.timeout(durationMs, `${reason} | By: ${interaction.user.tag}`);

      const confirmEmbed = noticeEmbed('danger', { guild: interaction.guild })
        .setAuthor({ name: '🔇 Member muted' })
        .setDescription(`${member} has been muted.`)
        .addFields(
          { name: '👤 Member', value: `${member.user.tag}`, inline: true },
          { name: '⏱️ Duration', value: durationText, inline: true },
          { name: '👮 Moderator', value: `${interaction.user.tag}`, inline: true },
          { name: '📝 Reason', value: reason, inline: false },
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();

      await interaction.reply({ embeds: [confirmEmbed] });

      // DM the muted member (best-effort).
      try {
        const dmEmbed = noticeEmbed('danger')
          .setAuthor({ name: '🔇 You have been muted on Offivex' })
          .setDescription(`You have been muted on **${interaction.guild.name}**.`)
          .addFields(
            { name: '⏱️ Duration', value: durationText, inline: true },
            { name: '📝 Reason', value: reason, inline: false },
            { name: '💡 Info', value: 'You can still open a ticket if you want to contest this sanction.' },
          )
          .setTimestamp();
        await member.send({ embeds: [dmEmbed] });
      } catch (err) {
        // Member's DMs are probably closed — non-fatal.
      }

      await sendLog(interaction, client, member, durationText, reason);
    } catch (error) {
      console.error('[mute] failed to apply timeout:', error);
      return interaction.reply({
        content: '❌ An error occurred while applying the mute.',
        ephemeral: true,
      });
    }
  },
};

function parseDuration(duration) {
  const match = duration.match(/^(\d+)([mhd])$/);
  if (!match) return 0;
  const value = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}

function formatDuration(duration) {
  const match = duration.match(/^(\d+)([mhd])$/);
  if (!match) return duration;
  const value = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'm': return `${value} minute${value > 1 ? 's' : ''}`;
    case 'h': return `${value} hour${value > 1 ? 's' : ''}`;
    case 'd': return `${value} day${value > 1 ? 's' : ''}`;
    default: return duration;
  }
}

async function sendLog(interaction, client, member, durationText, reason) {
  const { logs } = client.config;
  if (!logs || !logs.channelId) return;

  const logsChannel = interaction.guild.channels.cache.get(logs.channelId);
  if (!logsChannel) return;

  const logEmbed = noticeEmbed('danger', { guild: interaction.guild })
    .setAuthor({ name: '🔇 Mute' })
    .setDescription('A member has been muted.')
    .addFields(
      { name: '👤 Member', value: `${member} (${member.user.tag})`, inline: true },
      { name: '🆔 ID', value: member.id, inline: true },
      { name: '⏱️ Duration', value: durationText, inline: true },
      { name: '👮 Moderator', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
      { name: '📝 Reason', value: reason, inline: false },
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp();

  try {
    await logsChannel.send({ embeds: [logEmbed] });
  } catch (err) {
    console.error('[mute] failed to send log:', err);
  }
}
