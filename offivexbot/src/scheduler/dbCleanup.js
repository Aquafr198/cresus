// Daily purge to keep the SQLite file from growing unbounded.
//
// Retention policy (decided 2026-05-24, see plan file):
//   - infractions           → drop after 90 days
//   - closed tickets        → drop after 365 days
//   - giveaway_participants → drop as soon as the parent giveaway is 'ended'
//
// All DELETEs wrapped in a single transaction so a crash mid-purge leaves
// the DB in a clean state. The job ticks once on boot, then daily.

const db = require('../database/db');

const TICK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

let intervalHandle = null;

function tick() {
  const now = Date.now();
  try {
    const tx = db.transaction(() => {
      const r1 = db
        .prepare(`DELETE FROM infractions WHERE timestamp < ?`)
        .run(now - NINETY_DAYS_MS);
      const r2 = db
        .prepare(
          `DELETE FROM tickets WHERE status = 'closed' AND closed_at IS NOT NULL AND closed_at < ?`,
        )
        .run(now - ONE_YEAR_MS);
      const r3 = db
        .prepare(
          `DELETE FROM giveaway_participants
           WHERE giveaway_id IN (SELECT id FROM giveaways WHERE status = 'ended')`,
        )
        .run();
      return {
        infractions: r1.changes,
        tickets: r2.changes,
        giveawayParticipants: r3.changes,
      };
    });
    const counts = tx();
    const total = counts.infractions + counts.tickets + counts.giveawayParticipants;
    if (total > 0) {
      console.log(
        `[dbCleanup] purged ${counts.infractions} infractions, ${counts.tickets} closed tickets, ${counts.giveawayParticipants} giveaway participants`,
      );
    }
  } catch (e) {
    console.error('[dbCleanup] tick failed:', e);
  }
}

function start() {
  if (intervalHandle) return;
  console.log(`[dbCleanup] started, tick=${TICK_INTERVAL_MS / 3600000}h`);
  // Tick immediately so a long-restarted bot catches up.
  tick();
  intervalHandle = setInterval(tick, TICK_INTERVAL_MS);
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { start, stop };
