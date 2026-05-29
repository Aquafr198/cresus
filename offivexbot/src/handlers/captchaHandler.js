// TODO(offivex security): the correct captcha code is currently embedded in
// the SelectMenu `customId` (`verify_code_<correctCode>`). A motivated user
// can read it via Discord DevTools or a third-party API client and bypass
// the verification — but a bot picking values at random can NOT, which is
// the threat model we care about right now (anti-raid). If you ever need
// to defeat human attackers too, replace this with a server-side cache:
// generate a random tokenId, store `{ tokenId → correctCode }` with a 30s
// TTL, embed only the tokenId in the customId, and look it up at verify
// time. See plan 2026-05-24 ("hors scope" section).

const {
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} = require('discord.js');
const { brandedEmbed, noticeEmbed } = require('../utils/embeds');

// Generate a random alphanumeric code.
function generateRandomCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

module.exports = (client) => {
  client.handleVerificationButton = async function (interaction) {
    try {
      // The customId is `start_verification:<memberId>` — reject clicks from
      // members other than the one the verify message was originally posted
      // for. Without this, anyone in the verify channel can spam-click the
      // buttons of other members (pure UX pollution, but ugly).
      const expectedUserId = interaction.customId.split(':')[1];
      if (expectedUserId && interaction.user.id !== expectedUserId) {
        return await interaction.reply({
          embeds: [
            noticeEmbed('danger', { guild: interaction.guild }).setDescription(
              '❌ This verification prompt is for another member.',
            ),
          ],
          ephemeral: true,
        });
      }

      const Verification = require('../database/models/Verification');
      const verificationData = await Verification.findOne({ guildId: interaction.guild.id });

      if (!verificationData) {
        return await interaction.reply({
          embeds: [
            noticeEmbed('danger', { guild: interaction.guild }).setDescription(
              '❌ The verification system has not been set up correctly.',
            ),
          ],
          ephemeral: true,
        });
      }

      // Generate one correct code and four decoys.
      const correctCode = generateRandomCode();
      const fakeCodes = [];
      for (let i = 0; i < 4; i++) {
        fakeCodes.push(generateRandomCode());
      }

      // Shuffle the codes (Fisher-Yates) so the correct position is random.
      const allCodes = [correctCode, ...fakeCodes];
      for (let i = allCodes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allCodes[i], allCodes[j]] = [allCodes[j], allCodes[i]];
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`verify_code_${correctCode}`) // see TODO at top of file
        .setPlaceholder('Pick the verification code')
        .addOptions(
          allCodes.map((code) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(code)
              .setValue(code)
              .setDescription(`Code: ${code}`),
          ),
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const captchaEmbed = brandedEmbed({ guild: interaction.guild })
        .setAuthor({ name: '🔒 Security verification' })
        .setDescription(
          [
            `To access the server, pick code **${correctCode}** in the menu below.`,
            '',
            '⏱️ This verification expires in 30 seconds.',
          ].join('\n'),
        );

      await interaction.reply({
        embeds: [captchaEmbed],
        components: [row],
        ephemeral: true,
      });
    } catch (error) {
      console.error('[captchaHandler] verification button error:', error);
      await interaction.reply({
        embeds: [
          noticeEmbed('danger').setDescription('❌ An error occurred during verification.'),
        ],
        ephemeral: true,
      });
    }
  };

  client.handleCodeSelection = async function (interaction) {
    try {
      const Verification = require('../database/models/Verification');
      const verificationData = await Verification.findOne({ guildId: interaction.guild.id });

      if (!verificationData) {
        return await interaction.reply({
          embeds: [
            noticeEmbed('danger', { guild: interaction.guild }).setDescription(
              '❌ The verification system has not been set up correctly.',
            ),
          ],
          ephemeral: true,
        });
      }

      // Extract the correct code from the customId (see TODO at top of file).
      const correctCode = interaction.customId.split('_')[2];
      const selectedCode = interaction.values[0];

      if (selectedCode === correctCode) {
        const member = interaction.member;

        if (member.roles.cache.has(verificationData.roleNonVerifie)) {
          await member.roles.remove(verificationData.roleNonVerifie);
        }
        await member.roles.add(verificationData.roleMembre);

        await interaction.update({
          embeds: [
            noticeEmbed('success', { guild: interaction.guild })
              .setAuthor({ name: '✅ Verified' })
              .setDescription('You now have access to the server. Welcome!'),
          ],
          components: [],
        });
      } else {
        await interaction.update({
          embeds: [
            noticeEmbed('danger', { guild: interaction.guild })
              .setAuthor({ name: '❌ Wrong code' })
              .setDescription('Click the verify button again to try once more.'),
          ],
          components: [],
        });
      }
    } catch (error) {
      console.error('[captchaHandler] code selection error:', error);
      await interaction.reply({
        embeds: [
          noticeEmbed('danger').setDescription('❌ An error occurred during verification.'),
        ],
        ephemeral: true,
      });
    }
  };
};
