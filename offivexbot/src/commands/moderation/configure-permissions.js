// src/commands/moderation/configure-permissions.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { noticeEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('configure-permissions')
    .setDescription('Lock all channels behind the verified-member role')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    // Wrap the whole handler in try/catch so a throw before/after deferReply
    // never leaves the interaction hanging.
    try {
      await interaction.deferReply({ ephemeral: true });

      const { guild } = interaction;

      const Verification = require('../../database/models/Verification');
      const verificationData = await Verification.findOne({ guildId: guild.id });

      if (!verificationData) {
        return interaction.editReply(
          '❌ The verification system is not set up. Run `/setup-verification` first.',
        );
      }

      const membreRole = guild.roles.cache.get(verificationData.roleMembre);
      const nonVerifieRole = guild.roles.cache.get(verificationData.roleNonVerifie);
      const verificationChannel = guild.channels.cache.get(verificationData.channelId);

      if (!membreRole || !nonVerifieRole || !verificationChannel) {
        return interaction.editReply(
          '❌ The verification roles or channel no longer exist. Please reconfigure the system.',
        );
      }

      let modifiedChannels = 0;
      await interaction.editReply('🔄 Updating channel permissions…');

      for (const [, channel] of guild.channels.cache) {
        try {
          // Verification channel — visible to unverified members ONLY.
          if (channel.id === verificationData.channelId) {
            await channel.permissionOverwrites.set([
              {
                id: guild.id, // @everyone
                deny: [PermissionFlagsBits.ViewChannel],
              },
              {
                id: nonVerifieRole.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.ReadMessageHistory,
                  PermissionFlagsBits.SendMessages,
                ],
              },
              {
                id: membreRole.id,
                allow: [PermissionFlagsBits.ViewChannel],
              },
              {
                id: client.user.id, // the bot
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.EmbedLinks,
                  PermissionFlagsBits.AttachFiles,
                  PermissionFlagsBits.AddReactions,
                ],
              },
            ]);
          }
          // FIX: previously checked `ManageRoles` which is the wrong permission
          // for editing channel overwrites — `ManageChannels` is what Discord
          // actually requires here. The old check could "pass" while the
          // subsequent `permissionOverwrites.edit` calls silently 50013'd.
          else if (
            channel
              .permissionsFor(guild.members.me)
              .has(PermissionFlagsBits.ManageChannels)
          ) {
            await channel.permissionOverwrites.edit(guild.id, { ViewChannel: false }); // @everyone
            await channel.permissionOverwrites.edit(membreRole.id, { ViewChannel: true });
            await channel.permissionOverwrites.edit(nonVerifieRole.id, { ViewChannel: false });
          }

          modifiedChannels++;
        } catch (channelError) {
          console.error(
            `[configure-permissions] channel "${channel.name}" failed:`,
            channelError?.message ?? channelError,
          );
        }
      }

      const successEmbed = noticeEmbed('success', { guild })
        .setAuthor({ name: '✅ Configuration complete' })
        .setDescription(
          [
            '**Summary**',
            `• ${modifiedChannels} channels configured`,
            `• Verification channel: <#${verificationChannel.id}>`,
            '',
            '**Permissions**',
            '• Unverified members: can see ONLY the verification channel',
            '• Verified members: full server access',
            '• Auto-kick: after 30 seconds without verification',
            '',
            'ℹ️ To test, sign out and rejoin the server with another account.',
          ].join('\n'),
        );
      return interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
      console.error('[configure-permissions] handler error:', error);
      try {
        if (interaction.deferred || interaction.replied) {
          return interaction.editReply(
            '❌ An error occurred while configuring permissions.',
          );
        }
        return interaction.reply({
          content: '❌ An error occurred while configuring permissions.',
          ephemeral: true,
        });
      } catch (replyError) {
        console.warn(
          '[configure-permissions] could not deliver error reply:',
          replyError?.message ?? replyError,
        );
      }
    }
  },
};
