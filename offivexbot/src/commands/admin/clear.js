const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  Client,
} = require('discord.js');
const { noticeEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription("Delete messages from a channel (or clone-and-delete to wipe it entirely)")
    .addIntegerOption((option) =>
      option
        .setName('count')
        .setDescription('Number of messages to delete (max 100, 0 = wipe channel)')
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  /**
   * @param {ChatInputCommandInteraction} interaction
   * @param {Client} client
   */
  async execute(interaction, client) {
    // In-handler permission double-check. `setDefaultMemberPermissions` is a
    // UI hint Discord can override server-side; never trust it as the only
    // gate on a destructive action.
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: '❌ You need the Manage Messages permission to use this command.',
        ephemeral: true,
      });
    }

    try {
      const channel = interaction.channel;
      const count = interaction.options.getInteger('count') || 0;

      // Defer the reply up front so we don't time out on slow channel clones.
      await interaction.deferReply({ ephemeral: true });

      if (count === 0) {
        // Clone-and-delete: wipe the channel by creating a clone and dropping
        // the original. This is the only way to delete messages older than
        // 14 days at once.
        const position = channel.position;
        const newChannel = await channel.clone({
          reason: `Channel wiped by ${interaction.user.tag}`,
        });

        // Send the reply BEFORE deleting the channel (otherwise the
        // interaction targets a dead channel).
        const embed = noticeEmbed('success', { guild: interaction.guild })
          .setAuthor({ name: '✅ Channel wiped' })
          .setDescription('The channel is being wiped…')
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        await channel.delete(`Channel wiped by ${interaction.user.tag}`);
        await newChannel.setPosition(position);

        // No need to reply again — the original channel is gone.
      } else {
        if (count < 1 || count > 100) {
          return await interaction.editReply({
            content: '❌ The message count must be between 1 and 100.',
            ephemeral: true,
          });
        }

        try {
          const messages = await channel.messages.fetch({ limit: count });
          const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
          const filteredMessages = messages.filter((msg) => msg.createdTimestamp > twoWeeksAgo);

          if (filteredMessages.size === 0) {
            return await interaction.editReply({
              content:
                "❌ All messages are older than 14 days and can't be bulk-deleted. Use the command with count=0 to wipe the channel entirely.",
              ephemeral: true,
            });
          }

          const { size } = await channel.bulkDelete(filteredMessages);

          const embed = noticeEmbed('success', { guild: interaction.guild })
            .setAuthor({ name: '✅ Messages deleted' })
            .setDescription(`${size} message${size > 1 ? 's' : ''} deleted.`)
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error('[clear] message delete failed:', error);
          await interaction.editReply({
            content:
              '❌ An error occurred while deleting messages. Some messages may be older than 14 days.',
            ephemeral: true,
          });
        }
      }
    } catch (error) {
      console.error('[clear] command error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ An error occurred while executing the command.',
          ephemeral: true,
        });
      } else {
        await interaction.editReply({
          content: '❌ An error occurred while executing the command.',
          ephemeral: true,
        });
      }
    }
  },
};
