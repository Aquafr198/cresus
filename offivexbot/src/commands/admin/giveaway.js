const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const Giveaway = require('../../database/models/Giveaway');
const { brandedEmbed, noticeEmbed, COLOR } = require('../../utils/embeds');

// Pending timeouts keyed by giveaway id (= Discord message id). Held in a
// Map so we can clear/replace them if the same giveaway is ended manually
// before its natural end. THE MAP IS NOT THE SOURCE OF TRUTH — the SQLite
// `giveaways` table is. This Map only tracks the in-flight setTimeout
// handle so we can cancel it.
const pendingTimeouts = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage giveaways')
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Launch a new giveaway')
        .addStringOption((opt) =>
          opt
            .setName('prize')
            .setDescription('The prize to win (e.g. 1 month Yearly, 100 USDC, etc.)')
            .setRequired(true))
        .addIntegerOption((opt) =>
          opt
            .setName('duration')
            .setDescription('Giveaway duration in minutes')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(10080)) // 7 days
        .addIntegerOption((opt) =>
          opt
            .setName('winners')
            .setDescription('Number of winners (default: 1)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(20))
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel to post the giveaway in (default: current channel)')
            .setRequired(false))
        .addRoleOption((opt) =>
          opt
            .setName('required_role')
            .setDescription('Role required to participate (optional)')
            .setRequired(false)))
    .addSubcommand((sub) =>
      sub
        .setName('end')
        .setDescription('End a giveaway immediately')
        .addStringOption((opt) =>
          opt
            .setName('message_id')
            .setDescription('The giveaway message id')
            .setRequired(true)))
    .addSubcommand((sub) =>
      sub
        .setName('reroll')
        .setDescription('Reroll the winners of an ended giveaway')
        .addStringOption((opt) =>
          opt
            .setName('message_id')
            .setDescription('The giveaway message id')
            .setRequired(true))
        .addIntegerOption((opt) =>
          opt
            .setName('winners')
            .setDescription('Number of new winners')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(20)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    // In-handler permission double-check (defence in depth — never trust
    // setDefaultMemberPermissions alone on destructive actions).
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ You need the Administrator permission to use this command.',
        ephemeral: true,
      });
    }
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'start') {
      await startGiveaway(interaction, client);
    } else if (subcommand === 'end') {
      await endGiveaway(interaction, client);
    } else if (subcommand === 'reroll') {
      await rerollGiveaway(interaction, client);
    }
  },

  /// Called once at boot from src/index.js#ready. Re-schedules timeouts for
  /// every giveaway still flagged `status = 'running'` in the DB. Any
  /// giveaway whose `end_at` is already in the past is finalised
  /// immediately — that's the case when the bot was offline at the moment
  /// it should have ended.
  async reconcile(client) {
    const running = Giveaway.listRunning();
    let scheduled = 0;
    let finalisedImmediately = 0;
    const now = Date.now();
    for (const gw of running) {
      const delay = gw.endAt - now;
      if (delay <= 0) {
        // End now (asynchronously — don't block boot on Discord API calls).
        finishGiveaway(gw.id, client).catch((err) =>
          console.error('[giveaway.reconcile] immediate finish failed:', err),
        );
        finalisedImmediately += 1;
      } else {
        scheduleFinish(client, gw.id, delay);
        scheduled += 1;
      }
    }
    console.log(
      `[giveaway] reconcile: ${scheduled} running rescheduled, ${finalisedImmediately} overdue finalised`,
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Subcommand handlers
// ─────────────────────────────────────────────────────────────────────────────

async function startGiveaway(interaction, client) {
  const prize = interaction.options.getString('prize');
  const durationMinutes = interaction.options.getInteger('duration');
  const winnersCount = interaction.options.getInteger('winners') || 1;
  const channel = interaction.options.getChannel('channel') || interaction.channel;
  const requiredRole = interaction.options.getRole('required_role');

  await interaction.deferReply({ ephemeral: true });

  const endTime = Date.now() + durationMinutes * 60 * 1000;
  const endTimestamp = Math.floor(endTime / 1000);

  const giveawayEmbed = brandedEmbed({
    color: COLOR.embedDefault,
    guild: interaction.guild,
    footer: `Hosted by ${interaction.user.tag}`,
  })
    .setAuthor({ name: '🎉 GIVEAWAY' })
    .setDescription(`**${prize}**\n\nClick the button below to enter!`)
    .addFields(
      { name: '⏰ Ends', value: `<t:${endTimestamp}:R> (<t:${endTimestamp}:F>)`, inline: true },
      { name: '🏆 Winners', value: `${winnersCount}`, inline: true },
      { name: '👥 Participants', value: '0', inline: true },
    )
    .setTimestamp();

  if (requiredRole) {
    giveawayEmbed.addFields({ name: '🔒 Required role', value: `${requiredRole}`, inline: false });
  }

  const participateButton = new ButtonBuilder()
    .setCustomId('giveaway_participate')
    .setLabel('Enter 🎉')
    .setStyle(ButtonStyle.Success);
  const row = new ActionRowBuilder().addComponents(participateButton);

  const giveawayMessage = await channel.send({
    embeds: [giveawayEmbed],
    components: [row],
  });

  // Persist BEFORE scheduling the timeout so a crash between send and
  // scheduleFinish still leaves a recoverable row for reconcile() to pick
  // up on next boot.
  Giveaway.create({
    id: giveawayMessage.id,
    guildId: interaction.guild.id,
    channelId: channel.id,
    prize,
    endAt: endTime,
    winnersCount,
    roleRequired: requiredRole ? requiredRole.id : null,
    hostId: interaction.user.id,
  });

  scheduleFinish(client, giveawayMessage.id, durationMinutes * 60 * 1000);

  await interaction.editReply({
    content: `✅ Giveaway launched in ${channel}!\n🎁 Prize: **${prize}**\n⏰ Duration: **${formatDuration(durationMinutes)}**\n🏆 Winners: **${winnersCount}**`,
  });
}

async function endGiveaway(interaction, client) {
  const messageId = interaction.options.getString('message_id');
  await interaction.deferReply({ ephemeral: true });

  const giveaway = Giveaway.getById(messageId);
  if (!giveaway) {
    return interaction.editReply({ content: '❌ Giveaway not found. Double-check the message id.' });
  }
  if (giveaway.status === 'ended') {
    return interaction.editReply({ content: '❌ This giveaway has already ended.' });
  }

  await finishGiveaway(messageId, client);
  await interaction.editReply({ content: '✅ Giveaway ended!' });
}

async function rerollGiveaway(interaction, client) {
  const messageId = interaction.options.getString('message_id');
  const winnersCount = interaction.options.getInteger('winners') || 1;

  await interaction.deferReply({ ephemeral: true });

  const giveaway = Giveaway.getById(messageId);
  if (!giveaway) {
    return interaction.editReply({ content: '❌ Giveaway not found. Double-check the message id.' });
  }
  if (giveaway.status !== 'ended') {
    return interaction.editReply({ content: "❌ This giveaway hasn't ended yet." });
  }

  const participants = Giveaway.listParticipants(messageId);
  if (participants.length === 0) {
    return interaction.editReply({ content: '❌ No participants in this giveaway.' });
  }

  const winners = selectWinners(participants, Math.min(winnersCount, participants.length));
  const winnersMention = winners.map((id) => `<@${id}>`).join(', ');

  const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
  if (channel) {
    const rerollEmbed = noticeEmbed('success')
      .setAuthor({ name: '🎉 REROLL — New winner(s)!' })
      .setDescription(`**${giveaway.prize}**\n\n🏆 New winner(s): ${winnersMention}`)
      .setTimestamp();

    await channel.send({
      content: `🎊 Congrats ${winnersMention}! You won **${giveaway.prize}**!`,
      embeds: [rerollEmbed],
    });
  }

  await interaction.editReply({ content: `✅ Reroll done! New winner(s): ${winnersMention}` });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function scheduleFinish(client, giveawayId, delayMs) {
  // Cap to the largest setTimeout-safe value (24.85 days). Beyond that, Node
  // silently clamps to 1ms, which would finish the giveaway instantly.
  const SAFE_MAX = 2_147_483_000;
  const handle = setTimeout(() => {
    pendingTimeouts.delete(giveawayId);
    finishGiveaway(giveawayId, client).catch((err) =>
      console.error('[giveaway] scheduled finish failed:', err),
    );
  }, Math.min(delayMs, SAFE_MAX));
  pendingTimeouts.set(giveawayId, handle);
}

async function finishGiveaway(messageId, client) {
  const giveaway = Giveaway.getById(messageId);
  if (!giveaway || giveaway.status === 'ended') return;

  // Flip status FIRST so a concurrent /giveaway end + scheduled timer can't
  // both pick winners and post twice.
  if (!Giveaway.markEnded(messageId)) return;

  const pending = pendingTimeouts.get(messageId);
  if (pending) {
    clearTimeout(pending);
    pendingTimeouts.delete(messageId);
  }

  try {
    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel) {
      // Channel is gone — mark ended and bail. Otherwise the row stays
      // `running` forever and reconcile() replays the same dead giveaway
      // on every boot.
      console.warn(`[giveaway] channel ${giveaway.channelId} gone — marking ${messageId} ended`);
      return;
    }

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) {
      // Message was deleted (staff cleanup, accidental purge, etc.). Same
      // reasoning — we already markEnded()'d above, so the row is in a
      // sane terminal state; just no winner announcement is possible.
      console.warn(`[giveaway] message ${messageId} gone — no winner announcement possible`);
      return;
    }

    const participants = Giveaway.listParticipants(messageId);

    let resultEmbed;
    let resultContent;

    if (participants.length === 0) {
      resultEmbed = noticeEmbed('danger', { footer: 'Giveaway ended' })
        .setAuthor({ name: '🎉 GIVEAWAY ENDED' })
        .setDescription(`**${giveaway.prize}**\n\n❌ No participants — the giveaway is cancelled.`)
        .addFields({ name: '👥 Participants', value: '0', inline: true })
        .setTimestamp();
      resultContent = '😢 Nobody entered the giveaway…';
    } else {
      const winners = selectWinners(participants, Math.min(giveaway.winnersCount, participants.length));
      const winnersMention = winners.map((id) => `<@${id}>`).join(', ');

      resultEmbed = noticeEmbed('success', {
        footer: 'Giveaway ended • Use /giveaway reroll to draw new winners',
      })
        .setAuthor({ name: '🎉 GIVEAWAY ENDED' })
        .setDescription(`**${giveaway.prize}**\n\n🏆 **Winner(s):** ${winnersMention}`)
        .addFields(
          { name: '👥 Participants', value: `${participants.length}`, inline: true },
          { name: '🏆 Winner(s)', value: `${winners.length}`, inline: true },
        )
        .setTimestamp();
      resultContent = `🎊 Congrats ${winnersMention}!\n\n🎁 You won: **${giveaway.prize}**!\n\nDM <@${giveaway.hostId}> to claim your prize!`;
    }

    const disabledButton = new ButtonBuilder()
      .setCustomId('giveaway_ended')
      .setLabel('Giveaway ended')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);
    const row = new ActionRowBuilder().addComponents(disabledButton);

    await message.edit({ embeds: [resultEmbed], components: [row] });
    await channel.send({ content: resultContent });
  } catch (error) {
    console.error('[giveaway] finishGiveaway failed:', error);
  }
}

function selectWinners(participants, count) {
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function formatDuration(minutes) {
  if (minutes < 60) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
  }
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return `${days} day${days > 1 ? 's' : ''}${hours > 0 ? ` ${hours}h` : ''}`;
}
