const { SlashCommandBuilder } = require('discord.js');
const { check: checkCooldown } = require('../../utils/cooldowns');
const { brandedEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Submit a suggestion to the staff')
    .addStringOption((option) =>
      option
        .setName('suggestion')
        .setDescription('Your suggestion')
        // Discord embed description limit = 4096; we cap input at 2000 so
        // the suggestion always renders cleanly inside the embed instead
        // of being silently rejected by Discord when a user pastes a wall
        // of text.
        .setMaxLength(2000)
        .setRequired(true),
    ),

  async execute(interaction, client) {
    // 30s per-user cooldown — keeps the suggestions channel readable
    // without making it annoying for users who type a follow-up.
    const cd = checkCooldown(`suggest:${interaction.user.id}`, 30_000);
    if (cd.onCooldown) {
      return interaction.reply({
        content: `Slow down — try again in ${Math.ceil(cd.retryInMs / 1000)}s.`,
        ephemeral: true,
      });
    }

    const suggestion = interaction.options.getString('suggestion');
    const { suggestions } = client.config;

    const suggestionChannel = interaction.guild.channels.cache.get(suggestions.channelId);
    if (!suggestionChannel) {
      return interaction.reply({
        content: "The suggestions channel isn't configured correctly.",
        ephemeral: true,
      });
    }

    const suggestionEmbed = brandedEmbed({ guild: interaction.guild })
      .setAuthor({ name: '💡 New suggestion' })
      .setDescription(suggestion)
      .addFields(
        { name: 'Status', value: '📊 Awaiting review', inline: true },
        { name: 'Author', value: `<@${interaction.user.id}>`, inline: true },
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setTimestamp();

    const message = await suggestionChannel.send({ embeds: [suggestionEmbed] });
    await message.react('👍');
    await message.react('👎');

    return interaction.reply({
      content: `Your suggestion was posted in <#${suggestionChannel.id}>.`,
      ephemeral: true,
    });
  },
};
