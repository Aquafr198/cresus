require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
// Initialise SQLite (creates `data/bot.db` + schema if absent). Importing
// this module has the side effect of running the CREATE TABLE statements;
// no further setup is needed at boot.
require('./database/db');
const pnlPoller = require('./utils/pnlPoller');
const ticketAutoClose = require('./scheduler/ticketAutoClose');
const dbCleanup = require('./scheduler/dbCleanup');

// ────────────────────────────────────────────────────────────────────────────
// Process-level safety net
// ────────────────────────────────────────────────────────────────────────────
//
// Without these handlers, a single unhandled async error anywhere in the
// codebase crashes the entire bot. We log + exit on `uncaughtException`
// (unknown state, can't safely continue → supervisor restarts), but only
// log on `unhandledRejection` so a single bad promise doesn't kill the bot.
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
});

// Discord client.
//
// Intent rules:
//   - `Guilds`                  always needed
//   - `GuildMessages` + `MessageContent`  for automod (read message text)
//   - `GuildMembers`            for guildMemberAdd + members.fetch()
//   - `GuildPresences`          for presenceUpdate (PRIVILEGED — enable in dev portal)
//   - `GuildInvites`            for invite tracking + inviteCreate/Delete
// Dropped intents: GuildMessageReactions (we POST reactions via message.react
// in /suggest but don't RECEIVE reaction events), and DirectMessages (we SEND
// DMs from presence/booster/mute but never receive them — sending DMs doesn't
// require this intent). Each dropped intent reduces gateway bandwidth and
// privacy surface.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildInvites,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.GuildMember,
  ],
});

// discord.js emits these on WebSocket / shard failures. Without listeners
// they bubble up as unhandled errors and would crash the bot — the
// process handlers above would then SIGTERM it. Logging is enough; the
// library reconnects automatically.
client.on('error', (err) => console.error('[client error]', err));
client.on('shardError', (err) => console.error('[shard error]', err));

// Slash command registry.
client.commands = new Collection();
client.config = config;

// Load the handler modules (command + event + captcha).
const handlersDir = path.join(__dirname, 'handlers');
fs.readdirSync(handlersDir).forEach((file) => {
  require(`${handlersDir}/${file}`)(client);
});

// Status rotation. The interval handle is hoisted so the graceful-shutdown
// path can clear it on SIGTERM/SIGINT.
let statusInterval = null;
let statusIndex = 0;
const updateStatus = () => {
  if (!config.status || config.status.length === 0) return;

  const status = config.status[statusIndex];
  client.user.setActivity(status.content, { type: status.type });

  statusIndex = (statusIndex + 1) % config.status.length;
};

client.once('ready', async () => {
  console.log(`${client.user.tag} is online!`);
  updateStatus();
  statusInterval = setInterval(updateStatus, 30000); // rotate every 30 seconds

  // Seed the invite cache so `guildMemberAdd` can resolve "invited by" later.
  client.inviteCache = new Map();
  for (const guild of client.guilds.cache.values()) {
    try {
      const invites = await guild.invites.fetch();
      client.inviteCache.set(guild.id, new Map(invites.map((inv) => [inv.code, { uses: inv.uses }])));
      console.log(`📨 Invite cache loaded for ${guild.name}`);
    } catch (e) {
      // Surface the failure properly instead of swallowing — operators
      // scanning logs need to spot a missing Manage Server permission.
      console.warn(`Cannot load invites for ${guild.name}:`, e?.message ?? e);
    }
  }

  // Start the PNL poller (Offivex) — silent no-op if the config is
  // incomplete (channelId / PNL_API_TOKEN absent). Env vars override the
  // config.json defaults so prod deploys can point to https://api.offivex.gg
  // without touching the committed config.
  const pnlPostsBase = config.pnlPosts || {};
  const pnlPostsConfig = {
    channelId:    process.env.PNL_CHANNEL_ID     || pnlPostsBase.channelId     || '',
    apiBaseUrl:   process.env.API_BASE_URL       || pnlPostsBase.apiBaseUrl    || 'http://localhost:3001/api/v1',
    siteUrl:      process.env.SITE_URL           || pnlPostsBase.siteUrl       || 'https://offivex.gg',
    pollIntervalMs: Number(process.env.PNL_POLL_INTERVAL_MS) || pnlPostsBase.pollIntervalMs || 30000,
  };
  pnlPoller.start(client, pnlPostsConfig);

  // Replay every running giveaway from SQLite — reschedules timers for
  // those still in-flight, finalises any that should have ended while the
  // bot was offline. Without this, a restart silently drops in-progress
  // giveaways (pre-persistence behaviour).
  const giveawayCommand = client.commands.get('giveaway');
  if (giveawayCommand && typeof giveawayCommand.reconcile === 'function') {
    try {
      await giveawayCommand.reconcile(client);
    } catch (err) {
      console.error('[boot] giveaway reconcile failed:', err);
    }
  }

  // Start the recurring background jobs.
  //
  //   ticketAutoClose — hourly tick, warns + closes inactive tickets (48h)
  //   dbCleanup       — daily tick, purges stale infractions / closed
  //                     tickets / ended-giveaway participants
  ticketAutoClose.start(client);
  dbCleanup.start();
});

// ────────────────────────────────────────────────────────────────────────────
// Graceful shutdown
// ────────────────────────────────────────────────────────────────────────────
//
// Without this, `docker stop` / `pm2 reload` / a Ctrl+C in dev all kill
// the process raw. SQLite's WAL journal stays open (risk of corruption on
// the next boot), Discord sockets hang, and any in-flight REST call is
// dropped. The handler clears our intervals, stops the PNL poller, asks
// discord.js to log out cleanly, then exits.
let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return; // ignore duplicate signals
  shuttingDown = true;
  console.log(`[bot] ${signal} received, shutting down gracefully…`);
  if (statusInterval) clearInterval(statusInterval);
  pnlPoller.stop();
  ticketAutoClose.stop();
  dbCleanup.stop();
  try {
    await client.destroy();
  } catch (e) {
    console.error('[bot] client.destroy failed:', e);
  }
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

client.login(process.env.TOKEN);
