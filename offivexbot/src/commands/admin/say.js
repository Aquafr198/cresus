const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Send an embed message as the bot')
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Embed title')
        .setMaxLength(256)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('Message body: {n}=newline, {t}=tab, **bold**, *italic*, __underline__')
        .setMaxLength(6000)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('color')
        .setDescription('Embed color (hex)')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('title_format')
        .setDescription('Title casing')
        .addChoices(
          { name: '🔠 UPPERCASE', value: 'upper' },
          { name: '🔡 lowercase', value: 'lower' },
          { name: '📝 Normal', value: 'normal' },
        )
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('image')
        .setDescription('Full-size image URL')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('thumbnail')
        .setDescription('Thumbnail URL (small image on the right)')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('footer')
        .setDescription('Footer text (bottom of the embed)')
        .setMaxLength(2048)
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Target channel (default: current channel)')
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName('timestamp')
        .setDescription('Show date/time? (default: yes)')
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    // In-handler permission double-check — never trust setDefaultMemberPermissions
    // as the only gate on a bot-as-user broadcast.
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: '❌ You need the Manage Messages permission to use this command.',
        ephemeral: true,
      });
    }

    try {
      let titre = interaction.options.getString('title');
      let message = interaction.options.getString('message');
      const couleur = interaction.options.getString('color') || '#9945FF';
      const formatTitre = interaction.options.getString('title_format') || 'upper';
      const image = validateImageUrl(interaction.options.getString('image'));
      const thumbnail = validateImageUrl(interaction.options.getString('thumbnail'));
      let footerText = interaction.options.getString('footer');
      const showTimestamp = interaction.options.getBoolean('timestamp') ?? true;
      const channel = interaction.options.getChannel('channel') || interaction.channel;

      // Belt-and-braces footer cap. The slash option already declares
      // setMaxLength(2048), but Discord enforces the embed footer at 2048
      // chars too — re-truncate locally so a future schema change can't
      // ship a long footer that silently fails at send time.
      if (footerText) footerText = footerText.substring(0, 2048);

      switch (formatTitre) {
        case 'upper':
          titre = titre.toUpperCase();
          break;
        case 'lower':
          titre = titre.toLowerCase();
          break;
        // 'normal' → leave as-is
      }

      message = formatMessage(message);

      // Discord embed description cap is 4096 chars.
      const EMBED_LIMIT = 4096;

      // Default footer = server name + member count.
      const footer = footerText || `${interaction.guild.name} - ${interaction.guild.memberCount} members`;

      if (message.length <= EMBED_LIMIT) {
        // Short message → single embed.
        const embed = new EmbedBuilder()
          .setColor(couleur)
          .setTitle(titre)
          .setDescription(message)
          .setFooter({ text: footer });

        if (showTimestamp) embed.setTimestamp();
        if (image) embed.setImage(image);
        if (thumbnail) embed.setThumbnail(thumbnail);

        await channel.send({ embeds: [embed] });
      } else {
        // Long message → multiple embeds.
        const chunks = splitMessage(message, EMBED_LIMIT);

        for (let i = 0; i < chunks.length; i++) {
          const embed = new EmbedBuilder().setColor(couleur).setDescription(chunks[i]);

          // Title + thumbnail only on the first embed.
          if (i === 0) {
            embed.setTitle(titre);
            if (thumbnail) embed.setThumbnail(thumbnail);
          }

          // Footer, image and timestamp only on the last embed.
          if (i === chunks.length - 1) {
            embed.setFooter({ text: footer });
            if (showTimestamp) embed.setTimestamp();
            if (image) embed.setImage(image);
          }

          await channel.send({ embeds: [embed] });
        }
      }

      await interaction.reply({
        content: `✅ Message sent to ${channel}`,
        ephemeral: true,
      });
    } catch (error) {
      console.error('[say] command error:', error);
      await interaction.reply({
        content: '❌ An error occurred while sending the message.',
        ephemeral: true,
      });
    }
  },
};

// Expand custom formatting tokens into their actual characters/emojis.
function formatMessage(text) {
  return text
    // Newlines
    .replace(/\{n\}/gi, '\n')
    .replace(/\{nl\}/gi, '\n')
    .replace(/\{br\}/gi, '\n')
    // Double newline (paragraph)
    .replace(/\{nn\}/gi, '\n\n')
    .replace(/\{p\}/gi, '\n\n')
    // Spaces and tabs
    .replace(/\{t\}/gi, '    ')
    .replace(/\{tab\}/gi, '    ')
    .replace(/\{s\}/gi, ' ')
    // Horizontal rule
    .replace(/\{hr\}/gi, '───────────────────────')
    .replace(/\{line\}/gi, '───────────────────────')
    // Invisible space (for visual centering)
    .replace(/\{space\}/gi, '⠀')
    // Common emojis
    .replace(/\{check\}/gi, '✅')
    .replace(/\{cross\}/gi, '❌')
    .replace(/\{warning\}/gi, '⚠️')
    .replace(/\{info\}/gi, 'ℹ️')
    .replace(/\{star\}/gi, '⭐')
    .replace(/\{arrow\}/gi, '➤')
    .replace(/\{bullet\}/gi, '•');
}

// Validate an image URL — accept HTTPS with common extensions, plus trusted CDNs.
function validateImageUrl(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;

    const validExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const hasValidExtension = validExtensions.some((ext) =>
      parsed.pathname.toLowerCase().endsWith(ext),
    );

    // Discord and Imgur often serve images without an extension in the URL.
    const trustedDomains = ['cdn.discordapp.com', 'media.discordapp.net', 'i.imgur.com', 'imgur.com'];
    const isTrustedDomain = trustedDomains.some((domain) => parsed.hostname.includes(domain));

    if (hasValidExtension || isTrustedDomain) {
      return url;
    }
    return null;
  } catch {
    return null;
  }
}

// Split a long string into <= maxLength chunks, preferring newline boundaries.
function splitMessage(text, maxLength) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Prefer the last newline before the limit; fall back to last space.
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trimStart();
  }

  return chunks;
}
