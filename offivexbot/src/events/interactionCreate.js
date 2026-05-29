const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ActionRowBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const Ticket = require('../database/models/Ticket');
const Giveaway = require('../database/models/Giveaway');
const { check: checkCooldown } = require('../utils/cooldowns');
const { brandedEmbed, authorBarEmbed, noticeEmbed } = require('../utils/embeds');

module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(interaction, client) {
    try {
      // ─────────────────────────────────────────────
      // Slash commands
      // ─────────────────────────────────────────────
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        try {
          await command.execute(interaction, client);
        } catch (error) {
          console.error(error);
          if (interaction.replied || interaction.deferred) {
            await interaction.editReply({
              content: 'An error occurred while executing the command.',
              ephemeral: true,
            });
          } else {
            await interaction.reply({
              content: 'An error occurred while executing the command.',
              ephemeral: true,
            });
          }
        }
        return;
      }

      // ─────────────────────────────────────────────
      // Anti-raid verification button
      // ─────────────────────────────────────────────
      //
      // customId now looks like `start_verification:<memberId>` (the older
      // bare `start_verification` is grandfathered for any in-flight buttons
      // that pre-date the user-scoping fix).
      if (interaction.isButton() && interaction.customId.startsWith('start_verification')) {
        await client.handleVerificationButton(interaction);
        return;
      }

      // Captcha code selection (one-of dropdown)
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('verify_code_')) {
        await client.handleCodeSelection(interaction);
        return;
      }

      // ============================================
      // TICKET SYSTEM
      // ============================================

      // User selected a ticket category from the dropdown
      if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
        await interaction.deferReply({ ephemeral: true });

        const { ticketSystem } = client.config;
        const ticketType = interaction.values[0];
        const ticketTypeInfo = ticketSystem.ticketTypes.find((t) => t.id === ticketType);

        // Block muted users from spamming tickets.
        if (interaction.member.isCommunicationDisabled()) {
          return interaction.editReply({
            content:
              '❌ You are currently muted and cannot open a ticket.\n\n⏱️ Wait until your mute expires.',
            ephemeral: true,
          });
        }

        // One open ticket per user at a time.
        const existingTicket = await Ticket.findOne({
          userId: interaction.user.id,
          status: 'open',
        });

        if (existingTicket) {
          return interaction.editReply({
            content: `❌ You already have an open ticket: <#${existingTicket.channelId}>`,
            ephemeral: true,
          });
        }

        // Find the parent category for ticket channels.
        const category = interaction.guild.channels.cache.get(ticketSystem.categoryId);
        if (!category) {
          return interaction.editReply({
            content:
              '❌ The ticket category is not configured correctly. Please contact an administrator.',
            ephemeral: true,
          });
        }

        // Stable, sortable, human-readable ticket id.
        const ticketId = `ticket-${interaction.user.username}-${Date.now().toString(36)}`
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '');

        // Spin up the private channel.
        const ticketChannel = await interaction.guild.channels.create({
          name: ticketId,
          type: ChannelType.GuildText,
          parent: ticketSystem.categoryId,
          permissionOverwrites: [
            {
              id: interaction.guild.id, // @everyone
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: interaction.user.id, // ticket opener
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
              ],
            },
            {
              id: ticketSystem.staffRoleId,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.AttachFiles,
              ],
            },
            {
              id: client.user.id, // the bot
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ManageMessages,
              ],
            },
          ],
        });

        const ticketEmbed = authorBarEmbed({
          author: { name: `🎫 ${ticketTypeInfo.name}` },
          guild: interaction.guild,
          footer: `Ticket id: ${ticketId}`,
        })
          .setDescription(
            [
              `Welcome ${interaction.user}!`,
              '',
              'Thanks for opening a ticket — a staff member will reply as soon as possible.',
              '',
              '**Please describe your request in detail** (include screenshots, mint addresses, error messages — anything that helps us help you faster).',
            ].join('\n'),
          )
          .addFields(
            { name: '👤 Opened by', value: `${interaction.user}`, inline: true },
            { name: '📅 Date', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
          )
          .setTimestamp();

        const closeButton = new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close ticket')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒');

        const row = new ActionRowBuilder().addComponents(closeButton);

        await ticketChannel.send({
          content: `${interaction.user} | <@&${ticketSystem.staffRoleId}>`,
          embeds: [ticketEmbed],
          components: [row],
        });

        // Persist the ticket so /tickets list + close-confirm have state.
        await Ticket.create({
          ticketId: ticketId,
          userId: interaction.user.id,
          username: interaction.user.username,
          channelId: ticketChannel.id,
          type: ticketType,
          status: 'open',
        });

        // Mirror to the logs channel.
        const logsChannel = interaction.guild.channels.cache.get(ticketSystem.logsChannelId);
        if (logsChannel) {
          const logEmbed = noticeEmbed('success', { guild: interaction.guild })
            .setAuthor({ name: '📩 New ticket' })
            .addFields(
              { name: 'User', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
              { name: 'Type', value: ticketTypeInfo.name, inline: true },
              { name: 'Channel', value: `<#${ticketChannel.id}>`, inline: true },
            )
            .setTimestamp();

          await logsChannel.send({ embeds: [logEmbed] });
        }

        return interaction.editReply({
          content: `✅ Your ticket has been created: ${ticketChannel}`,
          ephemeral: true,
        });
      }

      // Close-ticket button → confirmation dialog
      if (interaction.isButton() && interaction.customId === 'close_ticket') {
        await interaction.deferReply();

        const ticket = await Ticket.findOne({ channelId: interaction.channel.id });

        if (!ticket) {
          return interaction.editReply({
            content: "❌ This ticket doesn't exist in the database.",
          });
        }

        const confirmEmbed = noticeEmbed('danger', {
          guild: interaction.guild,
          footer: 'This action cannot be undone',
        })
          .setAuthor({ name: '🔒 Close ticket' })
          .setDescription('Are you sure you want to close this ticket?');

        const confirmButton = new ButtonBuilder()
          .setCustomId('confirm_close_ticket')
          .setLabel('Confirm close')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('✅');

        const cancelButton = new ButtonBuilder()
          .setCustomId('cancel_close_ticket')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('❌');

        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

        return interaction.editReply({ embeds: [confirmEmbed], components: [row] });
      }

      // Confirm-close → flip to 'closed' + delete channel after grace period
      if (interaction.isButton() && interaction.customId === 'confirm_close_ticket') {
        await interaction.deferUpdate();

        const { ticketSystem } = client.config;
        const ticket = await Ticket.findOne({ channelId: interaction.channel.id });

        if (!ticket) {
          return interaction.followUp({ content: '❌ Ticket not found.', ephemeral: true });
        }

        await Ticket.findOneAndUpdate(
          { channelId: interaction.channel.id },
          {
            status: 'closed',
            closedAt: new Date(),
            closedBy: interaction.user.id,
          },
        );

        const logsChannel = interaction.guild.channels.cache.get(ticketSystem.logsChannelId);
        if (logsChannel) {
          const logEmbed = noticeEmbed('danger', { guild: interaction.guild })
            .setAuthor({ name: '🔒 Ticket closed' })
            .addFields(
              { name: 'Ticket', value: ticket.ticketId, inline: true },
              { name: 'Closed by', value: `${interaction.user.tag}`, inline: true },
              { name: 'Opened by', value: ticket.username, inline: true },
            )
            .setTimestamp();

          await logsChannel.send({ embeds: [logEmbed] });
        }

        const closedEmbed = noticeEmbed('danger', { guild: interaction.guild })
          .setAuthor({ name: '🔒 Ticket closed' })
          .setDescription(
            `This ticket was closed by ${interaction.user}.\nThe channel will be deleted in 5 seconds.`,
          )
          .setTimestamp();

        await interaction.channel.send({ embeds: [closedEmbed] });

        setTimeout(async () => {
          try {
            await interaction.channel.delete();
          } catch (error) {
            console.error('[interactionCreate] failed to delete ticket channel:', error);
          }
        }, 5000);
      }

      // Cancel-close → dismiss the confirmation
      if (interaction.isButton() && interaction.customId === 'cancel_close_ticket') {
        await interaction.deferUpdate();
        await interaction.deleteReply();
      }

      // ============================================
      // GIVEAWAY SYSTEM
      // ============================================

      // Participate / unparticipate button
      if (interaction.isButton() && interaction.customId === 'giveaway_participate') {
        // 1.5s per (user, giveaway) cooldown — debounces double-click and
        // blocks scripts that hammer the toggle to bombard the DB + the
        // embed update (Discord would rate-limit us anyway, but cleaner
        // to short-circuit before we touch the DB).
        const cd = checkCooldown(
          `gw-toggle:${interaction.user.id}:${interaction.message.id}`,
          1500,
        );
        if (cd.onCooldown) {
          return interaction.reply({
            content: `Slow down — try again in ${Math.ceil(cd.retryInMs / 1000)}s.`,
            ephemeral: true,
          });
        }

        const giveaway = Giveaway.getById(interaction.message.id);

        if (!giveaway) {
          return interaction.reply({
            content: "❌ This giveaway no longer exists or has ended.",
            ephemeral: true,
          });
        }

        if (giveaway.status === 'ended') {
          return interaction.reply({
            content: '❌ This giveaway has already ended!',
            ephemeral: true,
          });
        }

        // Check the required role, if any.
        if (giveaway.roleRequired) {
          const member = interaction.member;
          if (!member.roles.cache.has(giveaway.roleRequired)) {
            return interaction.reply({
              content: `❌ You need the <@&${giveaway.roleRequired}> role to participate!`,
              ephemeral: true,
            });
          }
        }

        // Toggle participation: if already in → remove, else add.
        const wasParticipating = Giveaway.hasParticipant(giveaway.id, interaction.user.id);
        if (wasParticipating) {
          Giveaway.removeParticipant(giveaway.id, interaction.user.id);
          await updateGiveawayEmbed(interaction.message, giveaway.id);
          return interaction.reply({
            content: '❌ You are no longer entered in the giveaway.',
            ephemeral: true,
          });
        }

        Giveaway.addParticipant(giveaway.id, interaction.user.id);
        await updateGiveawayEmbed(interaction.message, giveaway.id);

        return interaction.reply({
          content: `✅ You're entered in the giveaway for **${giveaway.prize}**! 🎉\n\n🍀 Good luck!`,
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error("[interactionCreate] handler error:", error);

      // Best-effort error response. If the interaction is already gone (expired,
      // already-replied edge case, network), log the secondary failure so the
      // operator sees BOTH errors instead of just the first one disappearing.
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            content: '❌ An error occurred.',
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: '❌ An error occurred.',
            ephemeral: true,
          });
        }
      } catch (replyError) {
        console.warn(
          '[interactionCreate] could not deliver error reply:',
          replyError?.message ?? replyError,
        );
      }
    }
  },
};

// Refresh the participant counter on the giveaway embed.
async function updateGiveawayEmbed(message, giveawayId) {
  try {
    const embed = EmbedBuilder.from(message.embeds[0]);

    // Pull the count from SQL (source of truth) rather than passing it in —
    // keeps the embed accurate even if a concurrent click changed the count
    // between our read and our edit.
    const fields = embed.data.fields;
    const participantsField = fields.find((f) => f.name === '👥 Participants');
    if (participantsField) {
      participantsField.value = `${Giveaway.countParticipants(giveawayId)}`;
    }

    await message.edit({ embeds: [embed] });
  } catch (error) {
    console.error('[interactionCreate] giveaway embed update failed:', error);
  }
}
