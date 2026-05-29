const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const { brandedEmbed, withBanner } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-tickets')
    .setDescription('Set up the support ticket system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const { ticketSystem } = client.config;

    // Defer ephemerally so the public channel won't show the slash-command
    // attribution ("Username used /setup-tickets · integration") above the
    // permanent ticket-menu card.
    await interaction.deferReply({ ephemeral: true });

    const embed = brandedEmbed({ guild: interaction.guild }).setDescription(
      [
        '**Need to reach Offivex support?**',
        'Pick the category that matches your request in the menu below — a staff member will reply in a private channel.',
        '',
        '📋 **A few rules before opening a ticket**',
        '• Tickets inactive for **more than 48 hours** are auto-closed.',
        '• No refund without **valid proof**.',
        '• Mention your **exact handle** for faster handling.',
      ].join('\n'),
    );

    const options = ticketSystem.ticketTypes.map((type) => {
      // Split the leading emoji from the rest of the label.
      const parts = type.name.split(' ');
      const emoji = parts[0];
      const label = parts.slice(1).join(' ');

      return {
        label,
        value: type.id,
        description: type.description,
        emoji,
      };
    });

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_select')
        .setPlaceholder('Pick the ticket category…')
        .addOptions(options),
    );

    const payload = await withBanner(
      { title: 'Tickets', subtitle: 'Offivex Support', variant: 'purple' },
      embed,
      [row],
    );
    await interaction.channel.send(payload);
    await interaction.editReply('✅ Ticket menu posted in this channel.');
  },
};
