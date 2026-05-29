# Offivex Discord Bot

Discord bot for the Offivex Solana memecoin launchpad community: moderation,
support tickets, anti-raid verification, giveaways, and auto-posting of
profitable on-chain PNL events pulled from the Rust backend.

- **Stack** — Node.js 18+, [discord.js](https://discord.js.org) v14, [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), [canvas](https://github.com/Automattic/node-canvas) (for the PNL cards)
- **Storage** — local SQLite at `data/bot.db` (4 tables: `tickets`, `verifications`, `pnl_checkpoint`, `giveaways`/`giveaway_participants`, `infractions`)
- **Integration** — pulls PNL events from the Offivex Rust backend at `/api/v1/pnl/recent` and posts generated cards to a configured Discord channel

## Quick start

```bash
# 1. Install
npm install

# 2. Configure env (copy + fill in)
cp .env.example .env
# Edit .env: TOKEN, CLIENT_ID, PNL_API_TOKEN (matches the backend's
# OFFIVEX_BOT_PNL_TOKEN), PNL_CHANNEL_ID, OWNER_IDS — see .env.example for
# the full list with comments.

# 3. Configure server-specific IDs (channels, roles)
# Edit config.json — replace the test-guild Discord IDs with the ones from
# your production server.

# 4. Register slash commands (one-shot)
node deploy-commands.js
# With GUILD_ID set → instant guild-scoped registration.
# Without GUILD_ID → global registration (up to 1h to propagate).

# 5. Run
node src/index.js
# Or with a supervisor (PM2 / systemd / Docker restart-on-exit). The
# /restartbot command exits the process and expects a supervisor to revive it.
```

## Environment variables

See [`.env.example`](.env.example) for the authoritative list. Quick summary:

| Variable | Required | Description |
|---|---|---|
| `TOKEN` | Yes | Discord bot token from the application page |
| `CLIENT_ID` | Yes | OAuth application ID (used to register slash commands) |
| `GUILD_ID` | Optional | If set, slash commands are registered to this guild only (instant). If unset, registered globally (up to 1h propagation). |
| `OWNER_IDS` | Optional | CSV of Discord user IDs allowed to run `/restartbot`. Empty = nobody can. |
| `PNL_API_TOKEN` | Optional | Bearer token shared with the Rust backend (`OFFIVEX_BOT_PNL_TOKEN` there). Without it the PNL poller silently no-ops. |
| `PNL_CHANNEL_ID` | Optional | Discord channel where PNL cards are posted. Without it the poller no-ops. |
| `API_BASE_URL` | Optional | Override the Rust backend base URL (default `http://localhost:3001/api/v1`). |
| `SITE_URL` | Optional | Brand URL embedded in PNL cards (default `https://offivex.gg`). |
| `PNL_POLL_INTERVAL_MS` | Optional | PNL poll cadence in ms (default `30000`). |
| `BOT_DB_PATH` | Optional | Relocate the SQLite file (default `./data/bot.db`). |

## Commands

### Admin

| Command | Description | Permission |
|---|---|---|
| `/restartbot` | Exit the process so the supervisor restarts the bot | Owner allowlist (`OWNER_IDS`) |
| `/clear [count]` | Delete the last `count` messages (1–100). With `count=0`, clone-and-delete to wipe the entire channel | Manage Messages |
| `/say` | Send a customisable embed as the bot (title, body, color, image, thumbnail, footer, channel) | Manage Messages |
| `/massrole add\|remove role:<role>` | Add or remove a role on every server member | Administrator |
| `/giveaway start prize:<prize> duration:<minutes> [winners] [channel] [required_role]` | Launch a persistent giveaway (survives bot restart) | Administrator |
| `/giveaway end message_id:<id>` | End a giveaway immediately | Administrator |
| `/giveaway reroll message_id:<id> [winners]` | Draw new winners on an ended giveaway | Administrator |
| `/setup-verification channel:<ch> member_role:<role> unverified_role:<role>` | Set up the CAPTCHA anti-raid system | Administrator |

### Tickets

| Command | Description | Permission |
|---|---|---|
| `/setup-tickets` | Post the ticket-opening menu with the 5 default categories | Administrator |
| Default categories | 🔑 API & Auth · 💳 Billing · 🐛 Bug Report · 🚀 Launch Support · 🧭 Other | — |

Editable in `config.json` under `ticketSystem.ticketTypes`.

### Moderation

| Command | Description | Permission |
|---|---|---|
| `/mute member:<u> duration:<5m–28d> [reason]` | Apply a Discord timeout | Moderate Members |
| `/unmute member:<u> [reason]` | Remove a timeout | Moderate Members |
| `/configure-permissions` | Lock all channels behind the verified-member role (run AFTER `/setup-verification`) | Administrator |

### General (member-facing)

| Command | Description |
|---|---|
| `/ping` | Show bot + API latency |
| `/liste` | List member-facing commands |
| `/suggest <suggestion>` | Submit a suggestion to the staff |

## Events

| Event | What it does |
|---|---|
| `guildMemberAdd` | Welcome embed + default role + invite tracking + anti-raid CAPTCHA |
| `guildMemberUpdate` | Grant/remove the Nitro booster reward role |
| `presenceUpdate` | Grant/remove the "support" role to members who put `discord.gg/offivex` in their custom status |
| `messageCreate` | AutoMod: bad-words filter, links filter, spam detection (timeouts after N msgs in M ms) |
| `messageDelete` / `messageUpdate` | Log deleted/edited messages to the configured logs channel |
| `inviteCreate` / `inviteDelete` | Keep the invite-tracking cache in sync |
| `interactionCreate` | Routes slash commands + ticket buttons + giveaway button + verification button |

## Database

SQLite, created automatically at first boot under `data/bot.db`. The five
tables are :

- `infractions` — automod violations (bad word, link, spam) with moderator + timestamp
- `tickets` — support tickets with status (open/closed) + closer
- `verifications` — per-guild anti-raid config (channel, message, member/non-member roles)
- `pnl_checkpoint` — singleton row tracking the highest PNL event id consumed
- `giveaways` + `giveaway_participants` — persistent giveaway state (so a restart doesn't lose in-flight giveaways)

## PNL auto-posting

Polls the Rust backend every 30s for new profitable-sell events:

1. `GET /api/v1/pnl/recent?after_id=<checkpoint>&limit=10` — fetch un-acked events
2. For each event: generate a 400×450 PNG card via `node-canvas`, post it to `PNL_CHANNEL_ID`
3. `POST /api/v1/pnl/<id>/ack` — flip `posted_at` on the backend so the same event isn't returned again

Auth is `Bearer ${PNL_API_TOKEN}` — must match `OFFIVEX_BOT_PNL_TOKEN` on the backend. If the token / channel id is missing the poller logs and no-ops.

Card source: [`src/utils/pnlImageGenerator.js`](src/utils/pnlImageGenerator.js). Branding pulled from `frontend/src/app/globals.css` so the bot stays in lockstep with the website theme.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/ping` (or any slash command) returns "Unknown interaction" or doesn't appear | Slash commands never registered | Run `node deploy-commands.js`. If `GUILD_ID` is set, restart the bot in the right guild. |
| PNL channel is silent despite events on the backend | `PNL_API_TOKEN` mismatch, or `PNL_CHANNEL_ID` empty / wrong | Check the bot logs for `[pnlPoller] 401` (token mismatch) or `[pnlPoller] channel <id> not found`. |
| Bot crashes when a message is edited | (Fixed) — `messageUpdate.js` used to import a non-existent `logger` export | Already fixed in repo, just confirming the symptom. |
| `/restartbot` says "Only the bot owner can use this command" | `OWNER_IDS` env var is empty | Add your Discord user id (CSV format) to `.env`. |
| AutoMod spam handler doesn't delete anything | Some messages in the batch were > 14 days old (Discord rejects the whole `bulkDelete`) | Already filtered out in `src/utils/automod.js`. |
| Verification button does nothing | Verification system not configured for this guild | Run `/setup-verification`, then `/configure-permissions`. |
| `<#some-id>` showing as raw id in embeds | The bot can't see / fetch the channel | Make sure the bot has the `View Channels` permission on the target channel. |

## Operational notes

- **Supervisor**: `/restartbot` exits the process with `process.exit(0)`. Run under PM2 (`pm2 start src/index.js --name offivex-bot`) or `systemd` / Docker `restart: unless-stopped` for auto-revival.
- **Giveaways survive restarts**: at boot, `giveaway.reconcile()` reads every row with `status='running'`, reschedules the `setTimeout` for those still in flight, and finalises any that should have ended while the bot was down.
- **Captcha note**: the current CAPTCHA stores the correct code inside the SelectMenu `customId`. This blocks bots (random selections) but a motivated human with DevTools can read it. See the TODO at the top of [`src/handlers/captchaHandler.js`](src/handlers/captchaHandler.js) for the upgrade path if you ever need anti-human security.
- **Presence-update role grant**: the "support" role currently has no link to the SaaS backend's `/user/referral/*` system. See the TODO at the top of [`src/events/presenceUpdate.js`](src/events/presenceUpdate.js).

## Layout

```
offivexbot/
├── config.json              # server-specific Discord IDs + status + ticket types
├── deploy-commands.js       # one-shot slash command registration
├── index.js                 # root redirect to src/index.js (some hosts expect it)
├── README.md                # this file
├── src/
│   ├── index.js             # bot entry point (login + event/command wiring)
│   ├── assets/              # static assets (logo for the PNL cards)
│   ├── commands/
│   │   ├── admin/           # clear, giveaway, massrole, restartbot, say, setup-verification
│   │   ├── general/         # liste, ping, suggest
│   │   ├── moderation/      # configure-permissions, mute, unmute
│   │   └── tickets/         # setup-tickets
│   ├── database/
│   │   ├── db.js            # better-sqlite3 init + schema
│   │   └── models/          # SQLite-backed adapters (Ticket, Verification, PnlCheckpoint, Infraction, Giveaway)
│   ├── events/              # discord.js event handlers
│   ├── handlers/            # commandHandler, eventHandler, captchaHandler
│   └── utils/               # automod, logger, pnlImageGenerator, pnlPoller
└── data/                    # runtime DB (gitignored)
```

## License

Internal. Not for redistribution.
