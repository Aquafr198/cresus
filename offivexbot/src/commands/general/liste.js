const { SlashCommandBuilder } = require('discord.js');
const { brandedEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('liste')
    .setDescription('Show the list of member-facing commands'),

  async execute(interaction, client) {
    const embed = brandedEmbed({ guild: interaction.guild })
      .setAuthor({ name: '📋 Member commands' })
      .setDescription('Here are the commands you can use on this server:')
      .addFields(
        { name: '/suggest <suggestion>', value: 'Submit a suggestion to the staff', inline: false },
        { name: '/ping', value: "Check the bot's latency", inline: false },
        { name: '/liste', value: 'Show this command list', inline: false },
        // Add other member-facing commands here as the bot grows.
      );

    await interaction.reply({ embeds: [embed] });
  },
};
