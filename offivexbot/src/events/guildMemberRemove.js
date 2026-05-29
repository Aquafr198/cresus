// Cleanup when a member leaves the server :
//   1. Close any tickets they had open (notice in channel, mark DB row, delete channel after 30s)
//   2. Remove them from running giveaways' participants (so they don't get
//      picked as a winner who isn't in the server anymore)

const db = require('../database/db');
const { noticeEmbed } = require('../utils/embeds');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    try {
      const userId = member.id;
      const username = member.user?.tag ?? userId;

      // ── 1. Close their open tickets ───────────────────────────────────
      const openTickets = db
        .prepare(`SELECT * FROM tickets WHERE user_id = ? AND status = 'open'`)
        .all(userId);

      for (const ticket of openTickets) {
        try {
          const channel = await client.channels.fetch(ticket.channel_id).catch(() => null);
          if (channel) {
            const embed = noticeEmbed('warning', { guild: member.guild })
              .setAuthor({ name: '👋 User has left' })
              .setDescription(
                `**${ticket.username}** (the ticket opener) has left the server.\n\n` +
                  `This ticket will be closed in 30 seconds.`,
              );
            await channel.send({ embeds: [embed] }).catch(() => {});
            setTimeout(async () => {
              try {
                await channel.delete('Auto-closed: ticket opener left the server');
              } catch (e) {
                console.warn(
                  `[guildMemberRemove] cannot delete ${channel.id}:`,
                  e?.message ?? e,
                );
              }
            }, 30000);
          }
          // Mark closed in DB regardless of channel state.
          db.prepare(
            `UPDATE tickets SET status = 'closed', closed_at = ?, closed_by = ? WHERE ticket_id = ?`,
          ).run(Date.now(), client.user.id, ticket.ticket_id);
        } catch (e) {
          console.error(
            `[guildMemberRemove] ticket ${ticket.ticket_id} cleanup failed:`,
            e,
          );
        }
      }

      // ── 2. Yank them out of running giveaways' participant lists ──────
      const removed = db
        .prepare(
          `DELETE FROM giveaway_participants
           WHERE user_id = ?
             AND giveaway_id IN (SELECT id FROM giveaways WHERE status = 'running')`,
        )
        .run(userId);

      if (removed.changes > 0) {
        console.log(
          `[guildMemberRemove] removed ${username} from ${removed.changes} running giveaway(s)`,
        );
      }
    } catch (e) {
      console.error('[guildMemberRemove] handler error:', e);
    }
  },
};
