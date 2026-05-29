<p align="center">
  <h1 align="center">Offivex</h1>
  <p align="center">
    Self-hosted Solana token launchpad & DeFi toolkit
    <br />
    <strong>Launch tokens, manage wallets, automate trading — all from your own machine.</strong>
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Next.js_14-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white" alt="Solana" />
</p>

---

## Overview

Offivex is a **fully self-hosted** Solana platform that gives you complete control over token launches, wallet management, and on-chain trading. No third-party dashboards, no API keys shared with SaaS providers — everything runs on your infrastructure.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Rust (Axum, Tokio, tokio-rusqlite) |
| **Frontend** | TypeScript, Next.js 14, React 18, Tailwind CSS |
| **Database** | SQLite with automatic migrations |
| **Cryptography** | AES-256-GCM, Argon2 KDF, BIP-39 mnemonics |
| **Deployment** | Docker Compose + Caddy (auto-TLS) |
| **Blockchain** | Solana (devnet & mainnet), Jupiter, Jito, Raydium, Pump.fun |

---

## Features

### Wallet Management
- Create and manage multiple Solana wallets with hierarchical sub-wallets
- Private keys encrypted at rest with AES-256-GCM, locked behind a master password
- BIP-39 seed phrase backup and restore
- Wallet groups, balance checking, SOL transfers, and key export

### Token Operations
- Mint SPL tokens with full metadata (name, symbol, decimals, supply)
- Clone existing token metadata for quick launches
- Vanity address generation for custom mint addresses
- IPFS metadata pinning via Pinata

### Bundle Launch
- Multi-wallet coordinated token launches with Jito bundles
- Liquidity pool creation on Raydium + market creation on OpenBook
- MEV-protected transaction submission
- Automated fee collection from bundle wallets

### Pump.fun Integration
- Launch tokens directly on Pump.fun bonding curve
- Buy and sell on active bonding curves
- Full launch history tracking

### Trading
- **Manual Trade** — Swap any SPL token via Jupiter aggregator with configurable slippage
- **Volume Bot** — Automated buy/sell cycles across multiple wallets
- **Bumper Bot** — Price floor maintenance with configurable thresholds (Birdeye + Jupiter price feeds)
- **Wallet Warmer** — Generate transaction history on wallets before use

### Distribution
- Anti-bubble-map token distribution with timing and amount randomization
- Multi-hop transfers via intermediate wallets
- Layered batch execution with configurable delays
- Automatic resume of stalled distributions after server restart

### Monitoring & Ops
- Real-time transaction monitor via WebSocket
- Prometheus metrics endpoint (`/api/v1/metrics`)
- Automated daily database backups with retention policy
- Off-site backup support (S3, rclone, MinIO)
- Audit logging for all security-sensitive operations
- Dead letter queue for failed operations with retry/dismiss
- Health check endpoints with detailed system status

---

## Architecture

```
Offivex/
├── backend/                        # Rust workspace
│   ├── crates/
│   │   ├── Offivex-server/          # Axum HTTP server, auth, routing, metrics, scheduler
│   │   ├── Offivex-api/             # Request handlers, validation, audit
│   │   ├── Offivex-core/            # Business logic — trading, bundles, wallets, distribution
│   │   ├── Offivex-db/              # SQLite — migrations, repos, backups
│   │   └── Offivex-crypto/          # AES-256-GCM, Argon2, BIP-39, secure memory
│   └── Cargo.toml                  # Workspace manifest
│
├── frontend/                       # Next.js 14 application
│   ├── src/app/                    # 22 page routes
│   ├── src/components/             # React components (UI, layout, auth)
│   └── src/lib/api.ts              # Typed API client
│
├── docker-compose.yml              # Full stack: backend + frontend + Caddy
├── docker/Caddyfile                # Reverse proxy config for Docker
├── Caddyfile                       # Standalone reverse proxy config
└── .env.docker                     # Docker environment template
```

---

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/Aquafr198/Offivex.git
cd Offivex
cp .env.docker .env
# Edit .env — set your DOMAIN and API keys
docker compose up -d
```

Three containers start: **backend** (Rust, port 3001), **frontend** (Next.js, port 3000), **caddy** (reverse proxy, ports 80/443 with auto-TLS).

Open `https://localhost` and set your master password on first launch.

### Manual Setup

**Prerequisites:** Rust 1.83+, Node.js 20+

```bash
# 1. Backend
cd backend
cp .env.example .env        # Configure your RPC endpoints and API keys
cargo build --release
./target/release/Offivex      # Starts on http://127.0.0.1:3001

# 2. Frontend (separate terminal)
cd frontend
npm install
npm run build
npm start                    # Starts on http://127.0.0.1:3000
```

---

## Configuration

All settings are managed via environment variables. See [`backend/.env.example`](backend/.env.example) for the complete reference.

| Variable | Default | Description |
|----------|---------|-------------|
| `OFFIVEX_SOLANA_CLUSTER` | `devnet` | Solana cluster: `devnet` or `mainnet` |
| `SOLANA_RPC_MAINNET` | Public RPC | Mainnet RPC endpoint (paid RPC recommended) |
| `SOLANA_RPC_DEVNET` | Public RPC | Devnet RPC endpoint |
| `PINATA_API_KEY` | — | Pinata API key for IPFS metadata pinning |
| `BIRDEYE_API_KEY` | — | Birdeye API key for price feeds |
| `JITO_TIP_LAMPORTS` | `10000` | Jito bundle tip amount |
| `DOMAIN` | `localhost` | Domain for Caddy auto-TLS (Docker only) |
| `DEV_MODE` | `false` | Relaxes security checks — **never use in production** |

---

## Security

| Measure | Details |
|---------|---------|
| **Encryption at rest** | All private keys encrypted with AES-256-GCM |
| **Key derivation** | Master password hashed with Argon2 |
| **Memory safety** | Master key exists only in memory; zeroed on lock |
| **Auto-lock** | Configurable inactivity timeout |
| **Rate limiting** | Auth: 5 req/min, API: 100 req/min per IP |
| **Audit log** | Tracks wallet creation, unlocks, transfers, key exports |
| **Production guards** | Warns on localhost CORS, 0.0.0.0 binding, or DEV_MODE on mainnet |
| **Seed phrase** | BIP-39 mnemonic for wallet recovery |

---

## Tests

```bash
cd backend
cargo test --workspace            # 81 unit & integration tests
cargo test -- --ignored           # Devnet integration tests (requires network)
```

---

## License

[MIT](LICENSE)
