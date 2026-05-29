const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { brandedEmbed } = require('../../utils/embeds');

// Owner allowlist for /restartbot — loaded from the OWNER_IDS env var
// (CSV: "id1,id2,id3"). Empty / unset = nobody can /restartbot, which is
// fail-secure (better than a hardcoded id that might belong to a former
// team member after a rotation).
const OWNER_IDS = (process.env.OWNER_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restartbot')
    .setDescription('Restart the bot (owner only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    // Defence in depth: Discord admin perm + bot-owner allowlist.
    if (!OWNER_IDS.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Only the bot owner can use this command.',
        ephemeral: true,
      });
    }

    const { logs } = client.config;
    if (logs && logs.channelId) {
      const logsChannel = interaction.guild.channels.cache.get(logs.channelId);
      if (logsChannel) {
        const logEmbed = brandedEmbed({ color: 0xff9900, guild: interaction.guild })
          .setAuthor({ name: '🔄 Bot restart' })
          .setDescription(`The bot was restarted by ${interaction.user.tag}`)
          .addFields(
            { name: 'User', value: `${interaction.user} (${interaction.user.id})`, inline: true },
            { name: 'Date', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
          )
          .setTimestamp();
        await logsChannel.send({ embeds: [logEmbed] });
      }
    }

    console.log(
      `[${new Date().toISOString()}] Restart requested by ${interaction.user.tag} (${interaction.user.id})`,
    );

    await interaction.reply({ content: '⏳ Restarting the bot…' });

    // Safe path: exit the process, let the supervisor (PM2 / systemd / Docker
    // restart policy) bring us back up.
    setTimeout(() => {
      process.exit(0);
    }, 2000);
  },
};
