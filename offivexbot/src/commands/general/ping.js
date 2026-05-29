const { SlashCommandBuilder } = require('discord.js');
const { check: checkCooldown } = require('../../utils/cooldowns');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription("Show the bot's latency"),

  async execute(interaction, client) {
    // 5s per-user cooldown — instant feedback for legit users, blocks
    // trivial spam.
    const cd = checkCooldown(`ping:${interaction.user.id}`, 5_000);
    if (cd.onCooldown) {
      return interaction.reply({
        content: `Slow down — try again in ${Math.ceil(cd.retryInMs / 1000)}s.`,
        ephemeral: true,
      });
    }

    const sent = await interaction.reply({ content: 'Pinging…', fetchReply: true });

    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(client.ws.ping);

    await interaction.editReply(`🏓 Pong! Latency: ${latency}ms | API: ${apiLatency}ms`);
  },
};
