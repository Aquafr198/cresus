const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { brandedEmbed, noticeEmbed } = require('../../utils/embeds');

// Tune the parallelism so we stay well under Discord's per-route rate
// limit. discord.js queues REST internally — concurrency 3 lets us hand
// off 3 ops at a time without making the queue too deep. The 250ms
// inter-batch breather gives the queue room to drain.
const CONCURRENCY = 3;
const BATCH_GAP_MS = 250;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('massrole')
    .setDescription('Add or remove a role on every server member')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Add a role to every member')
        .addRoleOption((option) =>
          option.setName('role').setDescription('The role to add').setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName('bots')
            .setDescription('Include bots? (default: no)')
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove a role from every member')
        .addRoleOption((option) =>
          option.setName('role').setDescription('The role to remove').setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName('bots')
            .setDescription('Include bots? (default: no)')
            .setRequired(false),
        ),
    )
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
    const role = interaction.options.getRole('role');
    const includeBots = interaction.options.getBoolean('bots') || false;

    // Make sure the bot can actually manage this role.
    if (role.position >= interaction.guild.members.me.roles.highest.position) {
      return interaction.reply({
        content: "❌ I can't manage this role because it's higher than or equal to my top role.",
        ephemeral: true,
      });
    }

    if (role.id === interaction.guild.id) {
      return interaction.reply({
        content: "❌ You can't use the @everyone role here.",
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    await interaction.guild.members.fetch();

    let members = interaction.guild.members.cache;

    if (!includeBots) {
      members = members.filter((member) => !member.user.bot);
    }

    if (subcommand === 'add') {
      members = members.filter((member) => !member.roles.cache.has(role.id));
    } else {
      members = members.filter((member) => member.roles.cache.has(role.id));
    }

    const totalMembers = members.size;

    if (totalMembers === 0) {
      const message =
        subcommand === 'add'
          ? '✅ All members already have this role!'
          : "✅ Nobody has this role.";
      return interaction.editReply({ content: message });
    }

    const progressEmbed = noticeEmbed('warning', {
      guild: interaction.guild,
      footer: 'This operation may take several minutes…',
    })
      .setAuthor({ name: `${subcommand === 'add' ? '➕' : '➖'} Mass role in progress…` })
      .setDescription(
        `${subcommand === 'add' ? 'Adding' : 'Removing'} ${role} for ${totalMembers} members…`,
      )
      .addFields(
        { name: '📊 Progress', value: `0 / ${totalMembers} (0%)`, inline: true },
        { name: '✅ Success', value: '0', inline: true },
        { name: '❌ Errors', value: '0', inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [progressEmbed] });

    let success = 0;
    let errors = 0;
    let processed = 0;

    const membersArray = [...members.values()];

    // Process in CONCURRENCY-sized batches with Promise.allSettled. Pre-
    // refactor this loop awaited each operation sequentially with a 100ms
    // pause — for a 5000-member server that meant ~8 minutes minimum.
    // Concurrency 3 brings it down to ~2.5 min without straining the
    // Discord rate limit (discord.js queues REST internally).
    for (let i = 0; i < membersArray.length; i += CONCURRENCY) {
      const batch = membersArray.slice(i, i + CONCURRENCY);
      const reason = `Mass role by ${interaction.user.tag}`;
      const results = await Promise.allSettled(
        batch.map((member) =>
          subcommand === 'add'
            ? member.roles.add(role, reason)
            : member.roles.remove(role, reason),
        ),
      );

      const prevProcessed = processed;
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === 'fulfilled') {
          success++;
        } else {
          errors++;
          console.error(
            `[massrole] failed for ${batch[j].user.tag}:`,
            r.reason?.message ?? r.reason,
          );
        }
      }
      processed += batch.length;

      // Refresh the progress embed when we cross a 10-member boundary, or
      // at the very end. Same cadence as the previous sequential loop —
      // chosen to limit edit traffic on Discord's side.
      const crossedTen = Math.floor(processed / 10) > Math.floor(prevProcessed / 10);
      if (crossedTen || processed === totalMembers) {
        const percent = Math.round((processed / totalMembers) * 100);
        const updatedEmbed = noticeEmbed('warning', {
          guild: interaction.guild,
          footer: 'This operation may take several minutes…',
        })
          .setAuthor({ name: `${subcommand === 'add' ? '➕' : '➖'} Mass role in progress…` })
          .setDescription(
            `${subcommand === 'add' ? 'Adding' : 'Removing'} ${role} for ${totalMembers} members…`,
          )
          .addFields(
            { name: '📊 Progress', value: `${processed} / ${totalMembers} (${percent}%)`, inline: true },
            { name: '✅ Success', value: `${success}`, inline: true },
            { name: '❌ Errors', value: `${errors}`, inline: true },
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [updatedEmbed] }).catch((err) => {
          console.warn('[massrole] progress edit failed:', err?.message ?? err);
        });
      }

      // Tiny breather between batches — keeps the discord.js REST queue
      // drainable so a long massrole doesn't crowd out other commands.
      if (i + CONCURRENCY < membersArray.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_GAP_MS));
      }
    }

    const finalEmbed = noticeEmbed(errors === 0 ? 'success' : 'warning', { guild: interaction.guild })
      .setAuthor({ name: `${subcommand === 'add' ? '➕' : '➖'} Mass role finished!` })
      .setDescription(
        `${role} was ${subcommand === 'add' ? 'added to' : 'removed from'} ${success} members.`,
      )
      .addFields(
        { name: '✅ Success', value: `${success}`, inline: true },
        { name: '❌ Errors', value: `${errors}`, inline: true },
        { name: '👤 Executed by', value: `${interaction.user}`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [finalEmbed] });

    // Mirror to the logs channel.
    const { logs } = client.config;
    if (logs && logs.channelId) {
      const logsChannel = interaction.guild.channels.cache.get(logs.channelId);
      if (logsChannel) {
        const logEmbed = brandedEmbed({ guild: interaction.guild })
          .setAuthor({ name: '📋 Mass role' })
          .addFields(
            { name: 'Action', value: subcommand === 'add' ? 'Add role' : 'Remove role', inline: true },
            { name: 'Role', value: `${role}`, inline: true },
            { name: 'Executed by', value: `${interaction.user.tag}`, inline: true },
            { name: 'Members affected', value: `${success}`, inline: true },
            { name: 'Errors', value: `${errors}`, inline: true },
          )
          .setTimestamp();

        await logsChannel.send({ embeds: [logEmbed] });
      }
    }
  },
};
