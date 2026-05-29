// Centralised SQLite handle for the Offivex bot.
//
// Replaces the prior Mongoose layer. `better-sqlite3` is synchronous and
// extremely fast for the bot's workload (single-process, low-volume CRUD on
// 4 trivial tables). The DB file lives under `data/bot.db` next to the
// repo by default — override with `BOT_DB_PATH` to relocate.
//
// The schema is created idempotently with `CREATE TABLE IF NOT EXISTS` so
// the first boot bootstraps and subsequent boots are no-ops.

const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const DB_PATH =
  process.env.BOT_DB_PATH ||
  path.join(__dirname, '..', '..', 'data', 'bot.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS infractions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('warn','mute','kick','ban','badword','spam','link')),
    reason TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    expires INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_infractions_user ON infractions(user_id);

  CREATE TABLE IF NOT EXISTS tickets (
    ticket_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
    created_at INTEGER NOT NULL,
    closed_at INTEGER,
    closed_by TEXT,
    -- last_activity_at bumps on every message in the ticket channel; the
    -- auto-close scheduler uses it to find 48h-inactive tickets.
    last_activity_at INTEGER,
    -- closing_at is set when the scheduler has DM-warned the opener about
    -- the impending auto-close. NULL otherwise. Cleared on activity bump
    -- so a user can rescue a ticket during the 1h grace by posting once.
    closing_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_tickets_user_status ON tickets(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channel_id);
  -- idx_tickets_status_activity is created AFTER the migration block below,
  -- because pre-existing DBs don't have last_activity_at yet at this point.

  CREATE TABLE IF NOT EXISTS verifications (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    role_membre TEXT NOT NULL,
    role_non_verifie TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pnl_checkpoint (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    last_seen_event_id INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO pnl_checkpoint (id, last_seen_event_id, updated_at)
    VALUES (1, 0, 0);

  -- Giveaways are persisted so they survive a bot restart. Previously they
  -- lived in an in-memory Map and any running giveaway was silently dropped
  -- whenever the process restarted (cf. PM2 reload, host reboot). Boot
  -- reconciliation in commands/admin/giveaway.js#reconcile reschedules the
  -- timeouts from this table.
  CREATE TABLE IF NOT EXISTS giveaways (
    id TEXT PRIMARY KEY,                 -- = Discord message id (1:1 with the embed)
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    prize TEXT NOT NULL,                 -- renamed from 'recompense' (game-server vocab)
    end_at INTEGER NOT NULL,             -- ms epoch
    winners_count INTEGER NOT NULL DEFAULT 1,
    role_required TEXT,                  -- optional gating role id
    host_id TEXT NOT NULL,               -- user id of the staff who ran /giveaway start
    status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','ended')),
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_giveaways_status ON giveaways(status);

  CREATE TABLE IF NOT EXISTS giveaway_participants (
    giveaway_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (giveaway_id, user_id),
    FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_giveaway_participants_user ON giveaway_participants(user_id);
`);

// ────────────────────────────────────────────────────────────────────────────
// Idempotent schema upgrades for existing DBs
// ────────────────────────────────────────────────────────────────────────────
//
// `CREATE TABLE IF NOT EXISTS` doesn't add new columns to a table that
// already exists. For DBs created before the auto-close feature shipped,
// we need to manually ALTER TABLE to add the two new tickets columns.
// SQLite has no `ADD COLUMN IF NOT EXISTS`, so we PRAGMA the column list
// and emit the ALTER only when missing — safe to run on every boot.
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

ensureColumn('tickets', 'last_activity_at', 'last_activity_at INTEGER');
ensureColumn('tickets', 'closing_at', 'closing_at INTEGER');

// Index needs to live AFTER ensureColumn — for a pre-existing DB the
// last_activity_at column was just added by the ALTER above, so the
// index couldn't have been created in the initial CREATE block.
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_tickets_status_activity ON tickets(status, last_activity_at)`,
);

// Backfill last_activity_at for tickets that pre-date the column. Using
// created_at is the safe baseline — an old open ticket gets its 48h
// inactivity countdown starting from boot at worst.
db.prepare(
  `UPDATE tickets SET last_activity_at = created_at WHERE last_activity_at IS NULL`,
).run();

module.exports = db;
