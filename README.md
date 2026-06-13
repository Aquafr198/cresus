<p align="center">
  <h1 align="center">Offivex</h1>
  <p align="center">
    Production-grade Solana memecoin launchpad — anti-rug stack, atomic Jito bundles, anti-bubble distribution
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Rust-1.83-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/Tailwind_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/discord.js_14-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="discord.js" />
  <img src="https://img.shields.io/badge/Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white" alt="Solana" />
  <img src="https://img.shields.io/badge/Jito-FF6B35?style=for-the-badge" alt="Jito" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="MIT" />
</p>

---

## What this is

Offivex is a **full-stack Solana memecoin launchpad** built as a paid SaaS. One launch
is a single atomic Jito bundle that mints the token, builds the OpenBook market, opens
a Raydium pool, distributes supply across hundreds of wallets without leaving a
BubbleMap-traceable graph, and burns the LP — all in one slot.

Beyond the launcher, the repo ships a complete SaaS layer:
- HD wallet vault with Argon2id + AES-GCM + zeroize
- Subscription billing with HD-derived Solana invoice addresses
- Admin panel + apply flow + audit log
- Companion Discord community bot (tickets, moderation, giveaways)

This README documents the architecture and engineering decisions. The repo is shared
as a portfolio piece — the code, tests, and infrastructure scripts are all real.

---

## Why this exists

Existing Solana launchpads either:
- Lock you into their dashboard (no self-host, no key custody), or
- Ship a thin wrapper around `spl-token` with no anti-rug / anti-bubble / MEV protection.

Offivex is the alternative: every defensive measure that retail traders look for via
RugCheck, DEXTools, and BubbleMaps is built directly into the launch pipeline, and the
operator keeps full key custody on their own infra.

---

## Architecture

```
                      ┌─────────────────────────────────────┐
                      │            Next.js 16 UI            │
                      │  /launch · /wallets · /distribution │
                      │  /admin  · /pay     · /docs         │
                      └────────────────┬────────────────────┘
                                       │ typed API (axum)
                                       ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │                       offivex-server (axum + tokio)                   │
   │                                                                       │
   │  middleware: api_key │ active_plan │ require_unlocked                 │
   │  scheduler: auto-lock │ payment_watcher │ backup │ dlq retry          │
   └───┬────────────────────┬────────────────────┬─────────────────────┬───┘
       │                    │                    │                     │
       ▼                    ▼                    ▼                     ▼
 ┌──────────┐         ┌─────────────┐      ┌────────────┐       ┌──────────┐
 │ offivex- │         │  offivex-   │      │  offivex-  │       │ offivex- │
 │   api    │         │    core     │      │    db      │       │  crypto  │
 │          │         │             │      │            │       │          │
 │ handlers │         │  bundle/    │      │  SQLite    │       │ AES-GCM  │
 │ validate │         │  trading/   │      │  WAL +     │       │ Argon2id │
 │ audit    │         │  monitor/   │      │  29 migs   │       │ BIP-39   │
 │ DTOs     │         │  payment/   │      │  9 repos   │       │ zeroize  │
 │          │         │  wallet/    │      │            │       │          │
 │          │         │  distribution│     │            │       │          │
 └──────────┘         └──────┬──────┘      └────────────┘       └──────────┘
                             │
                             ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │                          Solana mainnet                               │
   │  Jito (bundle submit) · Raydium AMM/CLMM · OpenBook · Pump.fun · SPL  │
   └───────────────────────────────────────────────────────────────────────┘

   ┌───────────────────────────────────────────────────────────────────────┐
   │                  offivexbot (discord.js v14)                          │
   │  tickets · giveaways · moderation · canvas banners · PnL pollers      │
   │  schedulers: 48h ticket auto-close · monthly DB purge                 │
   └───────────────────────────────────────────────────────────────────────┘
```

---

## Highlight features

### Anti-rug stack (built into every launch)

| Defense | How |
|---|---|
| Mint authority revoked | `set_authority` instruction baked into the launch bundle (slot 0) |
| Freeze authority OFF | Set to `None` at `initialize_mint` — token can never be frozen by the creator |
| LP burn atomic | Computed `sqrt(coin · pc) - MINIMUM_LIQUIDITY` with 10k-lamport safety margin, burned in the same Jito bundle as pool initialization |
| Treasury wallet boot-fail-fast | Backend refuses to boot if `OFFIVEX_TREASURY_SEED_PHRASE` is invalid or test mnemonic on mainnet |
| CORS allowlist | Empty / wildcard / `http://` rejected at boot on mainnet |

### Anti-bubble distribution

| Strategy | What it breaks |
|---|---|
| `Direct` | Single-hop transfers from source to N targets (baseline) |
| `MultiHop { hops }` | SOL passes through 1+ intermediate relay wallets per target. Breaks BubbleMaps' direct-edge attribution |
| `Layered { batch_size, batch_delay_ms }` | Targets receive in randomized batches with jittered delays. Defeats time-clustering heuristics |
| `AmountVariation { max_deviation_pct }` | Per-wallet amount randomized ±N% from the mean. Defeats sum-matching heuristics |
| `TimingVariation { min/max_delay_ms }` | Per-transfer delay jitter. Defeats sequential-slot pattern detection |
| Atomic claim | `UPDATE … WHERE id=? AND status='planned'` checks affected rows — guarantees no double-execution on concurrent POSTs |

### HD wallet vault

- AES-256-GCM per record (12-byte IV from `OsRng`)
- Master key derived from password with **Argon2id (64 MiB / 3 iter / 1 parallel)**
- BIP-39 mnemonic backup with optional passphrase
- SLIP-0010 ed25519 derivation for invoice addresses (`m/44'/501'/N'/0'`)
- `SecretBytes` zeroize-on-drop wrapper across the codebase
- Mid-flight key safety: every task re-reads the master key under RwLock (no pre-cloned `SecretBytes`), so password rotation never tears running operations
- Auto-lock with TOCTOU re-check (last-activity verified after acquiring the write lock)

### Atomic Jito bundle launch (single slot)

A "Bundle Launch" is one Jito bundle containing, in order:
1. Buy SOL → token at small slippage (creator priming)
2. `InitializeMint` (decimals = 6, supply = 1B)
3. `OpenBook` market creation
4. Raydium AMM v4 `initialize2` (LP minted to operator)
5. `set_authority(mint, None)` (revoke)
6. `Burn(LP - safety_margin)` (rug-proof)
7. N anti-bubble distribution transfers

If any one tx in the bundle reverts, the entire bundle is dropped — no half-launch state.

### SaaS billing layer

- Subscription plans cached in-memory; `POST /admin/plans/reload` busts cache via audit-logged endpoint
- Per-subscription HD-derived invoice address (no key reuse between users)
- Solana payment watcher with **u64-saturating tolerance math** + atomic claim race fix
- Reveal-key flow with 24h TTL + one-shot NULL-on-fetch
- Apply flow (waitlist) with grant/revoke/rotate admin actions

### Discord community bot ([`offivexbot/`](offivexbot/))

- Brand-consistent canvas banners (1024×320 PNG) cached + emitted above every embed
- 5 ticket categories (API & Auth / Billing / Bug Report / Launch Support / Other)
- 48h ticket auto-close scheduler + DM notification
- Monthly DB purge (infractions >90d, closed tickets >1y, ended-giveaway participants)
- Verification flow with `customId` scoping (prevents cross-user button interaction)
- Giveaways, presence-based rewards, Nitro boost detection
- Full English (translated from FR in a dedicated pass)

### Security audit + hardening (senior dev review)

A multi-agent senior review identified 3 CRITICAL + 12 MAJOR + 8 MEDIUM findings. All
shipped: distribution race fix via SQL atomic claim, MEK rotation safety in quick-sell,
require_unlocked split on task routes, identifier whitelist in DB migration helper,
LIST_ALL_LIMIT cap on every unbounded repo query, etc. The full breakdown is in the
commit history.

A pre-commit hook (`.githooks/pre-commit`) blocks committing `.env`, BIP39 phrases,
Solana private keys, and template-leak patterns.

---

## Tech stack

| Layer | Tech | Role |
|---|---|---|
| **Backend** | Rust 1.83, axum, tokio, tokio-rusqlite | HTTP API + scheduler + Solana ops |
| **Workspace** | 5 crates (`offivex-server` / `-api` / `-core` / `-db` / `-crypto`) | Layered separation, ~50k LOC |
| **Frontend** | Next.js 16 (App Router), Tailwind 4 `@theme`, SWR | Typed API client, AuthGate state machine |
| **DB** | SQLite WAL, 29 migrations, 9 repos | Single-file, backup-friendly, fast |
| **Crypto** | AES-256-GCM, Argon2id, BIP-39, ed25519 | All key material in `SecretBytes` |
| **On-chain** | `solana-sdk` 2.1, Raydium AMM v4 + CLMM, OpenBook, Jupiter v6, Jito | Mainnet + devnet |
| **Bot** | discord.js v14, @napi-rs/canvas, better-sqlite3 | Schedulers + canvas-rendered embeds |
| **Deploy** | Docker Compose + Caddy (auto-TLS) | One-command stand-up |

---

## Quick start

```bash
git clone https://github.com/Aquafr198/offivex.git
cd offivex
cp .env.docker .env       # fill DOMAIN + RPC endpoints + treasury seed
docker compose up -d
```

Three containers: backend (Rust, :3001) + frontend (Next.js, :3000) + caddy (:80/443
with Let's Encrypt). Open `https://<DOMAIN>` and set the master password on first
launch.

For manual / non-Docker setup, see [`backend/.env.example`](backend/.env.example) +
[`frontend/`](frontend/) for the per-component instructions.

---

## Project layout

```
offivex/
├── backend/
│   └── crates/
│       ├── offivex-server/      Axum HTTP server, auth, middleware, scheduler
│       ├── offivex-api/         Handlers · DTOs · validation · audit
│       ├── offivex-core/        Bundle, trading, monitor, payment, wallet, distribution
│       ├── offivex-db/          SQLite migrations + repos + backup
│       └── offivex-crypto/      AES-GCM, Argon2id, BIP-39, secure-mem
├── frontend/
│   └── src/
│       ├── app/                 22 page routes (App Router)
│       ├── components/          UI, launch widgets, admin modals, ConfirmDialog
│       └── lib/                 Typed API client, SWR helpers, keybinds
├── offivexbot/
│   └── src/
│       ├── commands/            slash + button commands
│       ├── events/              guildMember, message, interaction, presence
│       ├── scheduler/           48h ticket auto-close · monthly DB purge
│       └── utils/               brand · bannerGenerator · pnlImageGenerator
├── docker-compose.yml + Caddyfile
├── .githooks/pre-commit         Blocks .env / seed / private-key leaks
├── RUNBOOK.md · SECURITY.md     Ops + security docs
└── scripts/                     Local dev helpers
```

---

## Tests

```bash
# Backend
cd backend && cargo test --workspace        # 81 unit + integration tests
cargo test -- --ignored                     # devnet integration (needs network)

# Bot
cd offivexbot && npm test
```

---

## Status

**Production-tested** — the launcher has shipped tokens on Solana mainnet through the
full anti-rug + anti-bubble pipeline. The SaaS layer (auth, billing, payment watcher,
admin panel) has been senior-audited and hardened. The Discord bot ships with 14
schedulers + handlers wired for a live community.

Repo is shared as a portfolio piece — see commit history for the senior-review fix
pass (`Full platform release` commit `cfa7dbf` covers the rebrand + audit pass).

---

## License

[MIT](LICENSE) — fork, study, adapt with attribution.

---

## Author

Built by [@Aquafr198](https://github.com/Aquafr198). Code architecture + review
iterated with `Claude Code (Opus 4.7)` over multiple sessions. The strategy,
contracts, anti-rug stack, anti-bubble heuristics, and Discord bot are real and have
shipped on mainnet.

If you fork this and ship something interesting, ping me — would love to see it.
