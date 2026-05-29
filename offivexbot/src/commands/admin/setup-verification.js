const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
} = require('discord.js');
const { brandedEmbed, withBanner, noticeEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-verification')
    .setDescription('Set up the anti-raid verification system')
    .addChannelOption((option) =>
      option.setName('channel').setDescription('The verification channel').setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName('member_role')
        .setDescription('Role granted to verified members')
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName('unverified_role')
        .setDescription('Role granted to unverified members')
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel');
    const memberRole = interaction.options.getRole('member_role');
    const unverifiedRole = interaction.options.getRole('unverified_role');

    const verificationEmbed = brandedEmbed({ guild: interaction.guild }).setDescription(
      [
        '**Verify your account to access the server.**',
        'Click the button below and solve the short captcha — takes ~10 seconds.',
        '',
        '⏱️ **30 seconds limit** — unverified members are kicked automatically.',
        '🛡️ This protects the server against raid bots.',
      ].join('\n'),
    );

    const verifyButton = new ButtonBuilder()
      .setCustomId('start_verification')
      .setLabel('Verify my account')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔒');

    const row = new ActionRowBuilder().addComponents(verifyButton);

    const payload = await withBanner(
      { title: 'Verification', subtitle: 'Anti-raid checkpoint', variant: 'purple' },
      verificationEmbed,
      [row],
    );
    const verificationMsg = await channel.send(payload);

    try {
      const Verification = require('../../database/models/Verification');

      await Verification.findOneAndUpdate(
        { guildId: interaction.guild.id },
        {
          guildId: interaction.guild.id,
          channelId: channel.id,
          messageId: verificationMsg.id,
          roleMembre: memberRole.id,
          roleNonVerifie: unverifiedRole.id,
        },
        { upsert: true, new: true },
      );

      const confirmEmbed = noticeEmbed('success', { guild: interaction.guild })
        .setTitle('✅ Verification system configured')
        .setDescription(
          [
            '**Setup**',
            `• Verification channel: <#${channel.id}>`,
            `• Member role: <@&${memberRole.id}>`,
            `• Unverified role: <@&${unverifiedRole.id}>`,
            '',
            '**Next steps**',
            '1. Run `/configure-permissions` to lock the other channels behind the member role.',
            '2. New members have 30 seconds to verify before they get auto-kicked.',
            '',
            "⚠️ Make sure the bot's role sits **above** both the member and unverified roles in the role list.",
          ].join('\n'),
        );

      await interaction.editReply({ embeds: [confirmEmbed] });
    } catch (error) {
      console.error('[setup-verification] save failed:', error);
      const errEmbed = noticeEmbed('danger', { guild: interaction.guild }).setDescription(
        '❌ An error occurred while saving the verification setup.',
      );
      await interaction.editReply({ embeds: [errEmbed] });
    }
  },
};
