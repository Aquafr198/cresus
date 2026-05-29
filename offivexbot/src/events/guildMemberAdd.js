const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { authorBarEmbed, noticeEmbed } = require('../utils/embeds');

module.exports = {
  name: 'guildMemberAdd',
  once: false,
  async execute(member, client) {
    try {
      const { welcome } = client.config;

      // ============================================
      // WELCOME FLOW
      // ============================================

      // Grant the default role.
      if (welcome.defaultRoleId) {
        const defaultRole = member.guild.roles.cache.get(welcome.defaultRoleId);
        if (defaultRole) {
          await member.roles.add(defaultRole).catch((e) =>
            console.error('Cannot add the default role:', e),
          );
        }
      }

      // Send the welcome message.
      if (welcome.channelId) {
        const welcomeChannel = member.guild.channels.cache.get(welcome.channelId);

        if (welcomeChannel) {
          // Try to figure out who invited the new member by diffing invite
          // `uses` against the cached snapshot.
          let inviterName = 'Direct link';
          try {
            const invites = await member.guild.invites.fetch();
            const cachedInvites = client.inviteCache?.get(member.guild.id);

            if (cachedInvites) {
              const usedInvite = invites.find((inv) => {
                const cached = cachedInvites.get(inv.code);
                return cached && inv.uses > cached.uses;
              });

              if (usedInvite && usedInvite.inviter) {
                inviterName = usedInvite.inviter.username;
              }
            }

            // Refresh the cache.
            if (!client.inviteCache) client.inviteCache = new Map();
            client.inviteCache.set(
              member.guild.id,
              new Map(invites.map((inv) => [inv.code, { uses: inv.uses }])),
            );
          } catch (e) {
            // No permission to read invites, or a transient fetch failure.
            // Surface the cause so an operator scanning logs can spot a
            // permission misconfig instead of silent data loss.
            console.warn('[guildMemberAdd] could not refresh invite cache:', e?.message ?? e);
          }

          // Welcome card — author bar pattern (Wynlers-style):
          // a small label at the very top of the embed shows the member
          // number, then a compact description with the @mention, and a
          // thumbnail for the user's avatar. No bullet fields — keeps the
          // card visually clean.
          const welcomeEmbed = authorBarEmbed({
            author: { name: `👤 NEW MEMBER (#${member.guild.memberCount})` },
            guild: member.guild,
            footer: `Joined via ${inviterName === 'Direct link' ? 'a direct link' : inviterName}`,
          })
            .setDescription(
              `Welcome <@${member.id}> (**${member.user.username}**) — we hope you enjoy the launch ride on **Offivex**. 🚀`,
            )
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }));

          await welcomeChannel.send({
            content: `<@${member.id}>`,
            embeds: [welcomeEmbed],
          });
        }
      }

      // ============================================
      // ANTI-RAID VERIFICATION FLOW
      // ============================================

      const Verification = require('../database/models/Verification');
      const verificationData = await Verification.findOne({ guildId: member.guild.id });

      if (verificationData) {
        // Apply the "unverified" role.
        const nonVerifieRole = member.guild.roles.cache.get(verificationData.roleNonVerifie);
        if (nonVerifieRole) {
          await member.roles.add(nonVerifieRole).catch((e) =>
            console.error('Cannot add the unverified role:', e),
          );

          // Post the verification prompt in the dedicated channel.
          const verificationChannel = member.guild.channels.cache.get(verificationData.channelId);
          if (verificationChannel) {
            const verificationEmbed = noticeEmbed('warning', { guild: member.guild })
              .setAuthor({ name: '⚠️ Verification required' })
              .setDescription(
                [
                  `Hi <@${member.id}> — click the button below to confirm you're not a bot.`,
                  '',
                  '⏱️ **You have 30 seconds** to complete the verification, or you will be kicked automatically.',
                ].join('\n'),
              );

            // customId encodes the member id so the captcha handler can reject
            // clicks from other users — the public verify message would
            // otherwise let any member trigger anyone else's verification
            // captcha (UX pollution + griefing vector).
            const verifyButton = new ButtonBuilder()
              .setCustomId(`start_verification:${member.id}`)
              .setLabel('Verify my account')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🔒');

            const row = new ActionRowBuilder().addComponents(verifyButton);

            // Clean up any leftover verification prompts for this user.
            try {
              const messages = await verificationChannel.messages.fetch({ limit: 50 });
              const userMessages = messages.filter(
                (m) =>
                  m.content.includes(`<@${member.id}>`) &&
                  m.author.id === client.user.id,
              );

              if (userMessages.size > 0) {
                await verificationChannel.bulkDelete(userMessages);
              }
            } catch (cleanupError) {
              console.error(
                '[guildMemberAdd] verification cleanup error:',
                cleanupError?.message ?? cleanupError,
              );
            }

            const message = await verificationChannel.send({
              content: `<@${member.id}>`,
              embeds: [verificationEmbed],
              components: [row],
            });

            // Kick the member after 30 seconds if they haven't verified.
            setTimeout(async () => {
              try {
                const updatedMember = await member.guild.members.fetch(member.id).catch(() => null);
                if (
                  updatedMember &&
                  updatedMember.roles.cache.has(verificationData.roleNonVerifie) &&
                  !updatedMember.roles.cache.has(verificationData.roleMembre)
                ) {
                  // Verification timed out — kick.
                  await updatedMember.kick('Verification not completed within 30s');

                  if (message) {
                    const expiredEmbed = noticeEmbed('danger', { guild: member.guild })
                      .setAuthor({ name: '⏱️ Verification expired' })
                      .setDescription(
                        `<@${member.id}> was kicked for failing to verify within the time limit.`,
                      );

                    await message
                      .edit({
                        content: `<@${member.id}> — verification expired`,
                        embeds: [expiredEmbed],
                        components: [],
                      })
                      .catch(console.error);

                    setTimeout(() => message.delete().catch(() => {}), 10000);
                  }
                }
              } catch (error) {
                console.error('[guildMemberAdd] verification kick error:', error);
              }
            }, 30000);
          }
        }
      }
    } catch (error) {
      console.error('[guildMemberAdd] handler error:', error);
    }
  },
};
