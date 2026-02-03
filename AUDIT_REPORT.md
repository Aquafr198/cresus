# Cresus Platform — Comprehensive Engineering Audit Report

**Audit Date**: 2026-02-03
**Auditor**: Claude Opus 4.5 (Senior Software Engineer, Security Auditor, Systems Architect)
**Scope**: Full codebase — 5 Rust crates, 1 Next.js frontend, SQLite database, all configuration
**Reference Specification**: `context.md` (Kinesis.gg competitive analysis) + approved implementation plan

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Specification Compliance Matrix](#2-specification-compliance-matrix)
3. [Findings by Severity](#3-findings-by-severity)
4. [Architecture Assessment](#4-architecture-assessment)
5. [Security Assessment](#5-security-assessment)
6. [Performance Assessment](#6-performance-assessment)
7. [Test Coverage Gap Analysis](#7-test-coverage-gap-analysis)
8. [Recommendations — Prioritized Remediation Roadmap](#8-recommendations)
9. [Appendix A — Full Findings Index](#appendix-a-full-findings-index)
10. [Appendix B — Dependency Compliance Matrix](#appendix-b-dependency-compliance-matrix)
11. [Appendix C — File Inventory](#appendix-c-file-inventory)

---

## 1. Executive Summary

### 1.1 Overall Health Assessment

The Cresus platform is a **functionally complete** implementation that covers all 10 phases of the approved plan. All specified features exist: wallet management with encrypted key storage, token minting, Jito bundle launch, SOL distribution with anti-detection, profile randomization, transaction monitoring via WebSocket, vanity address grinding, and a full Next.js dashboard. The project compiles and builds cleanly.

However, the audit reveals **significant security vulnerabilities** and **architectural gaps** that must be addressed before any real-value operations. The most critical issues center around **secret key exposure** — both in the API layer (raw key export) and in memory management (missing zeroization). The auth/authorization model has fundamental gaps: most endpoints are accessible without unlocking the application.

### 1.2 Top 5 Risks

| # | Risk | Severity | Impact |
|---|------|----------|--------|
| 1 | **Wallet export returns raw plaintext secret key** — any website can steal keys via CORS | CRITICAL | Total fund loss |
| 2 | **Vanity grind stores unencrypted secret keys in database** — bypasses entire encryption model | CRITICAL | Key compromise at rest |
| 3 | **No centralized auth middleware** — 8 of 10 handler modules accessible while app is locked | CRITICAL | Unauthorized access to all data and operations |
| 4 | **Secret key bytes never zeroized in memory** — keys persist in heap after use | CRITICAL | Memory scraping attacks |
| 5 | **CORS allows any origin** + no rate limiting — enables browser-based attacks from any website | HIGH | Cross-origin key theft, brute-force |

### 1.3 Findings Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 9 | Immediate security risk or data loss potential |
| **HIGH** | 16 | Significant security gap or major spec deviation |
| **MEDIUM** | 27 | Functional deviation or reliability concern |
| **LOW** | 22 | Code quality issue or minor deviation |
| **INFO** | 20 | Observation, positive finding, or suggestion |
| **Total** | **94** | |

### 1.4 Verdict

**NOT READY FOR PRODUCTION USE.** The CRITICAL findings (especially SEC-01 through SEC-04) must be resolved before handling any real Solana assets. The platform's cryptographic foundation (cresus-crypto) is well-implemented, but the layers above it fail to maintain the security guarantees that the crypto crate establishes.

---

## 2. Specification Compliance Matrix

### 2.1 Dependency Compliance

| Spec Dependency | Spec Version | Actual | Status | Notes |
|---|---|---|---|---|
| solana-sdk | 2.1 | 2.1.15 | MATCH | Exact pin in cresus-core |
| spl-token | 7 | 7.0 | MATCH | In cresus-core |
| mpl-token-metadata | 5 | 5.0 | MATCH | In cresus-core |
| jito-sdk-rust | 0.3 | **N/A** | **DEVIATED** | Replaced with manual HTTP JSON-RPC |
| axum | 0.8 | 0.8 | MATCH | In cresus-server |
| tokio | 1 | 1 | MATCH | Workspace dependency |
| tower-http | 0.6 | 0.6 | MATCH | In cresus-server |
| aes-gcm | 0.10 | 0.10 | MATCH | In cresus-crypto |
| argon2 | 0.5 | 0.5 | MATCH | In cresus-crypto |
| zeroize | 1 | 1.7 | MATCH | Semver compatible |
| sqlx | 0.8 | **N/A** | **DEVIATED** | Replaced with tokio-rusqlite 0.5 |
| reqwest | 0.12 | 0.12 | MATCH | In cresus-core |
| rayon | 1.10 | 1.10 | MATCH | In cresus-core |
| tracing | 0.1 | 0.1 | MATCH | Workspace dependency |
| serde | 1 | 1 | MATCH | Workspace dependency |

**Deviation Summary**: 2 of 15 dependencies deviated from spec.

- **sqlx → tokio-rusqlite**: Legitimate architectural choice. tokio-rusqlite bundles SQLite directly (no external DB server), simplifying deployment. Trade-off: no compile-time query checking, no connection pooling, different migration tooling.
- **jito-sdk-rust → manual HTTP**: The Jito SDK crate had compatibility issues with solana-sdk 2.x at build time. Manual HTTP implementation provides equivalent functionality with direct control over request/response handling.

### 2.2 Feature Completeness

| Phase | Feature | Status | Notes |
|---|---|---|---|
| 0 | Scaffolding (workspace, migrations, crypto, server) | COMPLETE | All 5 crates, 7 migrations, health check |
| 1 | Wallet Manager (CRUD, encrypt, groups, sub-wallets) | COMPLETE | Encryption works; export has security issue (SEC-01) |
| 2 | RPC Management + Token Minting | COMPLETE | Health checks, failover, SPL mint, metadata, clone |
| 3 | Meme Library (upload, IPFS pin, metadata templates) | COMPLETE | Full CRUD + Pinata pinning |
| 4 | Bundle/Launch (market + pool + snipe atomic) | COMPLETE | Missing Address Lookup Tables (ARCH-05) |
| 5 | Anti-Bubble Distribution (multi-hop, timing, variation) | COMPLETE | Transaction fee accounting issue (SOL-07) |
| 6 | Profile Randomization | COMPLETE | Batch and individual |
| 7 | Transaction Monitor (WS subscription, real-time) | COMPLETE | Amount extraction not implemented (COMP-02) |
| 8 | Vanity Address Generation (rayon multi-thread) | COMPLETE | Key stored unencrypted (SEC-02) |
| 9 | Polish + Hardening (retry, logging, toast, error boundary) | PARTIAL | Toast system unused; AppError unused |

### 2.3 Frontend Stack Compliance

| Spec Requirement | Status | Notes |
|---|---|---|
| Next.js 14+ (App Router) | COMPLETE | App Router with all 9 pages |
| TypeScript strict | COMPLETE | `"strict": true`, zero `any` types |
| Tailwind CSS | COMPLETE | Fully configured and used |
| shadcn/ui | **NOT INSTALLED** | All UI is raw Tailwind; functional but no component library |
| Zustand | **INSTALLED BUT UNUSED** | Zero imports across entire codebase |
| TanStack Query | **INSTALLED BUT UNUSED** | Zero imports, no QueryClientProvider |
| Native WebSocket | COMPLETE | `ws.ts` with auto-reconnect, used by monitor page |

### 2.4 Database Schema Compliance

| Spec Table | Migration File | Status |
|---|---|---|
| wallets | 001_create_wallets.sql | COMPLETE |
| wallet_groups | 001_create_wallets.sql | COMPLETE |
| app_config | 001_create_wallets.sql | COMPLETE |
| tokens | 002_create_tokens.sql | COMPLETE |
| bundles | 003_create_bundles.sql | COMPLETE |
| meme_assets | 004_create_meme_library.sql | COMPLETE |
| meme_metadata | 004_create_meme_library.sql | COMPLETE |
| rpc_endpoints | 005_create_tasks.sql | COMPLETE |
| tasks | 005_create_tasks.sql | COMPLETE |
| distributions | 006_create_distributions.sql | COMPLETE |
| distribution_transfers | 006_create_distributions.sql | COMPLETE |
| wallet_profiles | 007_create_profiles.sql | COMPLETE |

### 2.5 API Endpoint Compliance

| Spec Endpoint Group | Routes Implemented | Status |
|---|---|---|
| `/auth/*` | status, setup, unlock, lock | COMPLETE |
| `/wallets/*` | list, create, get, delete, subwallets, export, groups | COMPLETE |
| `/rpc/*` | list, add, delete, set_active, health | COMPLETE |
| `/tokens/*` | list, mint, clone-info, vanity/start, vanity/{id} | COMPLETE |
| `/meme-library/*` | assets CRUD, pin, serve, metadata CRUD, json, pin | COMPLETE |
| `/bundles/*` | list, get, launch | COMPLETE |
| `/distributions/*` | list, get, plan, execute | COMPLETE |
| `/profiles/*` | list, get, preview, randomize, randomize-batch, update, delete | COMPLETE |
| `/monitor/*` | subscribe, unsubscribe, subscriptions | COMPLETE |
| `/ws/monitor` | WebSocket upgrade | COMPLETE |
| `/stats` | Dashboard stats | COMPLETE |
| `/health` | Health check | COMPLETE |

---

## 3. Findings by Severity

### 3.1 CRITICAL Findings (9)

---

#### SEC-01: Wallet Export Returns Raw Plaintext Secret Key

**Location**: `crates/cresus-api/src/wallet.rs:149`
**Spec Requirement**: "Export: Encrypted JSON"
**Actual Behavior**: Returns `{ "success": true, "data": { "secret_key": "<base58_raw_key>" } }`

The `export_wallet` handler decrypts the wallet secret key and returns it as a plain base58 string in the JSON response. Combined with the CORS wildcard (SEC-06), any website loaded in the user's browser can call this endpoint and steal private keys.

**Impact**: Total fund loss. Any cross-origin JavaScript can exfiltrate all wallet keys.
**Remediation**: Return an encrypted JSON export (re-encrypt with a user-provided export password) or at minimum require a confirmation step. Never transmit raw secret keys over HTTP.

---

#### SEC-02: Vanity Grind Stores Unencrypted Secret Key in Database

**Location**: `crates/cresus-core/src/token/vanity.rs:220-223`

When a vanity address grind completes, the result is stored in the `tasks` table as JSON containing `"secret_key_bs58"` — the raw secret key in base58. This completely bypasses the AES-256-GCM encryption used for all other wallet secrets. Anyone with filesystem access to the SQLite database can read these keys.

**Impact**: Key compromise at rest. Defeats the entire encryption model.
**Remediation**: Encrypt the vanity result's secret key with the MEK before storing in the database, identical to the wallet creation flow.

---

#### SEC-03: No Centralized Auth Middleware — 8 of 10 Handler Modules Accessible While Locked

**Location**: `crates/cresus-server/src/router.rs:15-121`
**Affected Modules**: token.rs (list), bundle.rs (list, get), distribution.rs (list, get), meme_library.rs (all), profile.rs (all), rpc_config.rs (all), monitor.rs (all), stats.rs (all)

The spec describes an auth flow of "setup password → unlock → session." There is no Axum middleware or extractor that enforces unlock status. Only handlers that need the MEK for decryption (mint, launch, execute) check internally. All read operations and many write operations (RPC config, profiles, meme library, monitor) are fully accessible while the app is locked.

**Impact**: Unauthorized data access and RPC endpoint manipulation without authentication.
**Remediation**: Implement an Axum middleware layer that checks unlock status and rejects requests to protected routes with 403 when locked.

---

#### SEC-04: Secret Key Bytes Never Zeroized After Use

**Locations**:
- `crates/cresus-core/src/wallet/keygen.rs:16-18` — `secret_bytes()` returns `Vec<u8>`, never zeroized
- `crates/cresus-core/src/wallet/encryption.rs:15` — `decrypt_secret_key` returns `Vec<u8>`, never zeroized
- `crates/cresus-core/src/wallet/manager.rs:142-143, 198-199` — decrypted keys dropped without zeroing
- `crates/cresus-core/src/bundle/builder.rs:335` — `Keypair` from decrypted bytes dropped without zeroing
- `crates/cresus-core/src/distribution/disperser.rs:279` — same pattern

The `cresus-crypto` crate provides `SecretBytes` with zeroize-on-drop, but callers never use it for decrypted key material. Raw `Vec<u8>` and `Keypair` values containing secret keys are simply dropped, leaving key bytes in heap memory.

**Impact**: Memory scraping or cold-boot attacks can recover private keys.
**Remediation**: Use `zeroize::Zeroizing<Vec<u8>>` for all functions returning secret bytes. Ensure `Keypair` objects are wrapped in zeroizing containers.

---

#### SEC-05: Stack-Resident Derived Key Not Zeroized in `derive_master_key`

**Location**: `crates/cresus-crypto/src/kdf.rs:21-26`

The function allocates `let mut output = [0u8; 32]` on the stack, fills it with the derived master key, copies it into `SecretBytes`, and returns. The stack-resident 32-byte array is never zeroized and may persist in memory.

**Impact**: Master encryption key recoverable from stack memory.
**Remediation**: Add `output.zeroize()` after constructing `SecretBytes`.

---

#### SEC-06: Frontend Displays Secret Keys in DOM Without Protection

**Locations**:
- `frontend/src/app/wallets/page.tsx:299-330` — exported key rendered in `<div>` indefinitely
- `frontend/src/app/mint/page.tsx:428-449` — vanity result key rendered inline permanently

When a user exports a wallet or completes a vanity grind, the secret key is rendered directly in the DOM and stored in React state with no auto-dismiss timeout, no show/hide toggle, and no memory clearing. The vanity result has no close button at all.

**Impact**: Keys visible to screen capture, browser extensions, and shoulder surfing.
**Remediation**: Add auto-dismiss timer (30s), show/hide toggle (hidden by default), and clear from React state after dismissal.

---

#### SOL-01: Snipe Buy `min_token_out` Hardcoded to 1 (No Slippage Protection)

**Location**: `crates/cresus-core/src/bundle/builder.rs:250`

All snipe buy transactions use `min_token_out: 1`, accepting essentially any output amount. While within an atomic Jito bundle front-running is prevented, if the bundle fails and transactions leak to the mempool individually, they are vulnerable to sandwich attacks. Additionally, later snipe wallets in the bundle pay progressively worse prices with no minimum protection.

**Impact**: Potential loss of funds via sandwich attacks on leaked transactions.
**Remediation**: Expose `min_token_out` in `SnipeBuyEntry` config. Calculate reasonable minimums based on expected pool price and configurable slippage tolerance.

---

#### SOL-02: Token Supply Calculation Overflow

**Location**: `crates/cresus-core/src/token/mint.rs:124`

`params.supply * 10u64.pow(params.decimals as u32)` can overflow for large supply + decimal combinations (e.g., supply=10^12, decimals=9 → 10^21 > u64::MAX). This panics in debug mode and silently wraps in release mode, minting a drastically wrong supply.

**Impact**: Incorrect token supply minted; potential economic loss.
**Remediation**: Use `checked_mul` and `checked_pow` with proper error propagation.

---

#### SEC-07: RPC Endpoint Manipulation Without Auth

**Location**: `crates/cresus-api/src/rpc_config.rs:26-49, 93-106`

The `add_endpoint` and `set_active` handlers accept arbitrary URLs with no unlock check. An attacker with local network access can add a malicious RPC endpoint, set it active, and wait for the user to unlock. All Solana RPC traffic then routes through the attacker's server.

**Impact**: Transaction interception, manipulation, and front-running.
**Remediation**: Require unlock status for all RPC configuration changes.

---

### 3.2 HIGH Findings (16)

| ID | Title | Location |
|---|---|---|
| SEC-08 | `export_secret_key` returns key as plain `String` (not zeroized) | `wallet/manager.rs:237-250` |
| SEC-09 | MEK cloned via `.clone()` into unprotected `Vec<u8>` in multiple modules | `manager.rs:129`, `builder.rs:99`, `disperser.rs:136`, `mint.rs:61` |
| SEC-10 | `lock()` may not zeroize MEK (depends on `SecretBytes` drop impl) | `wallet/manager.rs:115-118` |
| SEC-11 | CORS allows any origin, any method, any header | `router.rs:16-19` |
| SEC-12 | No session tokens — unlock is a global in-memory flag | `router.rs` (no middleware) |
| SEC-13 | WebSocket endpoint has no auth/unlock check | `monitor.rs:85-90` |
| SEC-14 | No Solana address format validation at API boundary | `token.rs:39`, `bundle.rs:28`, `monitor.rs:27,32` |
| PERF-01 | Blocking synchronous RPC calls inside async context | `mint.rs:89-91`, `builder.rs:106-108`, `client.rs:23,49-51` |
| PERF-02 | Bundle uses single blockhash — timing sensitivity with no refresh | `builder.rs:107` |
| PERF-03 | `submit_and_confirm_with_retry` not used in launch flow | `builder.rs:283-288` |
| TEST-01 | Entire `cresus-db` crate has zero test coverage | All repo modules |
| FE-01 | Zustand installed but never imported — no shared state management | `package.json:15` |
| FE-02 | TanStack Query installed but never imported — no server state caching | `package.json:16` |
| FE-03 | Toast notification system fully wired but never called (dead code) | `Toast.tsx`, `layout.tsx:21` |
| FE-04 | WebSocket stale closure with `paused` dependency causes effect churn | `monitor/page.tsx:34-57` |
| S-04 | `EncryptedPayload` serializes ciphertext as JSON integer array (non-standard) | `aes.rs:21-27` |

---

### 3.3 MEDIUM Findings (27)

| ID | Title | Location |
|---|---|---|
| SPEC-01 | tokio-rusqlite instead of sqlx (spec deviation) | All Cargo.toml |
| SPEC-02 | Manual Jito HTTP instead of jito-sdk-rust 0.3 | `jito.rs` |
| SPEC-03 | shadcn/ui not installed (spec says to use it) | `package.json` |
| SEC-15 | Argon2id parallelism p=1 (weaker brute-force resistance) | `kdf.rs:11-16` |
| SEC-16 | No brute-force protection on password unlock attempts | `manager.rs:85-112` |
| SEC-17 | No password strength/emptiness validation | `types.rs:59-66`, `wallet.rs:42-50` |
| SEC-18 | No explicit multipart upload size limit | `meme_library.rs:22-58` |
| SEC-19 | Float-to-u64 SOL conversion loses precision, allows negative | `distribution.rs:57` |
| SEC-20 | No upper bound on subwallet count | `types.rs:54-56` |
| SEC-21 | No rate limiting on any endpoint | `router.rs:15-121` |
| SEC-22 | Avatar URLs rendered without validation | `profiles/page.tsx:198-201` |
| ARCH-01 | Duplicated `decrypt_wallet_keypair` across builder.rs and disperser.rs | `builder.rs:317-338`, `disperser.rs:261-282` |
| ARCH-02 | Duplicated `compute_ata` and ATA creation across 3 files | `builder.rs`, `snipe.rs`, `mint.rs` |
| ARCH-03 | Hardcoded program IDs parsed with `.unwrap()` on every call | Multiple files |
| ARCH-04 | AppError struct in error.rs is complete dead code | `error.rs:1-62` |
| ARCH-05 | No Address Lookup Tables (spec says needed for tx size) | `bundle/` |
| DB-01 | No migration version tracking mechanism | `lib.rs:39-47` |
| DB-02 | No indexes on `meme_assets` or `meme_metadata` tables | `004_create_meme_library.sql` |
| SOL-03 | Metadata instruction discriminator may not match on-chain program | `metadata.rs:56-85` |
| SOL-04 | OpenBook `InitializeMarket` serialization format is fragile | `market.rs:196-215` |
| SOL-05 | `amount_lamports` stored as `i64` but cast to `u64` without validation | `disperser.rs:102,243` |
| SOL-06 | Multi-hop distribution does not account for transaction fees | `anti_bubble.rs:211-261` |
| SOL-07 | ATA instruction in mint.rs missing rent sysvar account | `mint.rs:186-208` |
| REL-01 | Distribution execution has no resume/idempotency safety | `disperser.rs:126-215` |
| REL-02 | WebSocket subscriber has no reconnection logic | `subscriber.rs:98-161` |
| FE-05 | Silent error swallowing in dashboard and auth gate | `page.tsx:15-17`, `AuthGate.tsx:33-36` |
| FE-06 | WebSocket never disconnected on page unmount (resource leak) | `monitor/page.tsx:53-56` |

---

### 3.4 LOW Findings (22)

| ID | Title | Location |
|---|---|---|
| SEC-23 | `SecretBytes` derives `Clone`, doubling key material | `secure_mem.rs:7` |
| SEC-24 | `into_inner()` transfers zeroize responsibility to caller | `secure_mem.rs:39-44` |
| SEC-25 | Hardcoded verification token `"CRESUS_VERIFY_OK"` | `manager.rs:65` |
| SEC-26 | Vanity threads parameter not bounded | `token.rs:143-151` |
| DB-03 | WAL pragma result not verified | `lib.rs:28` |
| DB-04 | Directory creation error silently ignored | `lib.rs:20-22` |
| DB-05 | Redundant index on `tokens.mint_address` | `002_create_tokens.sql:3,14` |
| DB-06 | No index on `rpc_endpoints.is_active` | `005_create_tasks.sql` |
| DB-07 | No index on `distributions.source_wallet_id` | `006_create_distributions.sql` |
| DB-08 | Missing FK constraints on `distribution_transfers` wallet columns | `006_create_distributions.sql:14-26` |
| ARCH-06 | `ApiError` type defined but never instantiated | `types.rs:11-24` |
| ARCH-07 | `ApiResponse` only used in wallet.rs, inline json! elsewhere | `types.rs:4-33` |
| ARCH-08 | `VanityResult` struct holds key in plain `Vec<u8>` with `Debug` derive | `vanity.rs:13-16` |
| REL-03 | `send_transaction_with_retry` cannot refresh blockhash | `client.rs:9-41` |
| REL-04 | EventBus silently drops events when no subscribers exist | `event_bus.rs:34` |
| COMP-01 | Monitor event wallet extraction uses crude heuristic | `subscriber.rs:276-289` |
| FE-07 | Error banner styling inconsistent between pages | Various pages |
| FE-08 | No `src/hooks/` or `src/store/` directories exist | Frontend root |
| FE-09 | Page components are 255-542 line monoliths | All page files |
| FE-10 | Identical data-fetching boilerplate across 8 pages | All page files |
| FE-11 | Inline `import()` type syntax in api.ts | `api.ts` (many lines) |
| FE-12 | useCallback hooks with incomplete dependency arrays | `mint/page.tsx:66`, `bundle/page.tsx:54` |

---

### 3.5 INFO Findings (20)

| ID | Title |
|---|---|
| INFO-01 | AES-256-GCM implementation is correct (nonce generation, AEAD, key validation) |
| INFO-02 | Argon2id variant and version are correct (Algorithm::Argon2id, V0x13) |
| INFO-03 | Zeroize-on-drop correctly implemented for SecretBytes |
| INFO-04 | Debug output redacted for SecretBytes (`[REDACTED]`) |
| INFO-05 | Salt generation is cryptographically sound (16 bytes from OsRng) |
| INFO-06 | WAL mode and foreign key enforcement correctly enabled |
| INFO-07 | Server binds to localhost by default (good security default) |
| INFO-08 | No SQL injection risk — all queries use parameterized statements |
| INFO-09 | No XSS vectors in frontend — no dangerouslySetInnerHTML |
| INFO-10 | No hardcoded secrets in frontend code |
| INFO-11 | TypeScript strict mode, zero `any` types |
| INFO-12 | Comprehensive type definitions for all 12 entities |
| INFO-13 | All 9 required frontend pages exist and are functional |
| INFO-14 | All specified API endpoints implemented |
| INFO-15 | Loading states and button disabling consistently implemented |
| INFO-16 | WebSocket client properly implements auto-reconnect |
| INFO-17 | Sidebar navigation covers all routes |
| INFO-18 | Rust 2024 edition used (requires Rust 1.85+) |
| INFO-19 | No pagination on list endpoints (acceptable for single-user desktop app) |
| INFO-20 | `.env.example` missing PINATA_JWT entry |

---

## 4. Architecture Assessment

### 4.1 Strengths

1. **Clean crate separation**: The 5-crate workspace (crypto → db → core → api → server) provides good separation of concerns. The crypto crate is a true leaf dependency with no internal deps.

2. **Split state pattern**: Axum's `.with_state()` + `.merge()` pattern correctly isolates state per route group, preventing a single bloated AppState from being threaded everywhere.

3. **Correct crypto primitives**: AES-256-GCM with random nonces, Argon2id with adequate parameters, and zeroize-on-drop for the `SecretBytes` type demonstrate security awareness at the foundation.

4. **Complete feature coverage**: Every feature from the 10-phase plan is implemented end-to-end (backend + frontend).

### 4.2 Weaknesses

1. **Security guarantees break above crypto layer**: The crypto crate establishes strong guarantees (encrypted at rest, zeroize on drop), but callers in cresus-core and cresus-api consistently violate these by handling raw `Vec<u8>` key material without zeroization.

2. **No auth middleware**: Authorization checks are scattered (or absent) across individual handlers rather than enforced at the router level. This is the single biggest architectural gap.

3. **Synchronous RPC in async context**: The entire Solana interaction layer uses `solana_client::rpc_client::RpcClient` (synchronous) inside async functions, blocking tokio worker threads. This will cause stalls under concurrent load.

4. **Frontend has no state management layer**: Despite installing Zustand and TanStack Query, neither is used. Every page independently fetches data with duplicated boilerplate, resulting in no cross-page caching and redundant API calls.

5. **Error handling is fragmented**: `AppError` exists but is unused. `ApiResponse` is partially adopted. Most handlers construct error responses inline with `json!()` macros, creating inconsistent error formats.

### 4.3 Crate Dependency Graph (Actual)

```
cresus-server (binary)
├── cresus-api
├── cresus-core (indirect via api)
├── cresus-db (indirect via api, core)
├── cresus-crypto (indirect)
├── axum 0.8
├── tower-http 0.6
├── tokio 1
└── tracing 0.1

cresus-api
├── cresus-core
├── cresus-db
├── axum 0.8
└── serde_json

cresus-core
├── cresus-crypto
├── cresus-db
├── solana-sdk 2.1.15
├── solana-client 2.1.15
├── spl-token 7
├── mpl-token-metadata 5
├── reqwest 0.12
├── rayon 1.10
└── tokio-tungstenite

cresus-db
├── tokio-rusqlite 0.5
├── rusqlite 0.31
├── serde
└── chrono 0.4
    (cresus-crypto listed as dep but unused)

cresus-crypto (leaf)
├── aes-gcm 0.10
├── argon2 0.5
├── zeroize 1.7
└── rand 0.8
```

**Issue**: `cresus-db` lists `cresus-crypto` as a dependency but never imports from it. This is unnecessary coupling.

---

## 5. Security Assessment

### 5.1 Cryptographic Layer (cresus-crypto) — GOOD

The foundational crypto is well-implemented:
- AES-256-GCM with 12-byte random nonces from OsRng (CSPRNG)
- Argon2id v1.3 with m=64MiB, t=3, p=1 (exceeds OWASP minimum; p=1 is adequate for desktop)
- `SecretBytes` with `Zeroize + Drop` implementation
- Debug output redacted
- 7 unit tests covering key derivation and encrypt/decrypt

**Issues**: Argon2id parallelism p=1 is single-lane (MEDIUM). Stack-resident key not zeroized in `derive_master_key` (CRITICAL).

### 5.2 Key Management Layer (cresus-core) — POOR

The security guarantees established by cresus-crypto are systematically violated:
- `keygen::secret_bytes()` returns raw `Vec<u8>` (never zeroized)
- `decrypt_secret_key` returns raw `Vec<u8>` (never zeroized)
- `Keypair::from_bytes()` creates objects that are dropped without zeroing
- MEK is `.clone()`-ed into unprotected memory in 4+ locations
- `export_secret_key` returns a plain `String`
- `lock()` relies on `Drop` rather than explicit zeroization

### 5.3 API Security Layer (cresus-api + cresus-server) — POOR

- **No auth middleware**: Global unlock flag, no per-client sessions
- **No input validation**: Solana addresses accepted as raw strings without format checking
- **No rate limiting**: Unlimited password attempts, unlimited vanity grinds
- **CORS wildcard**: Any website can call any endpoint
- **Raw key export**: Wallet export returns plaintext secret key
- **No TLS**: Plain HTTP only (acceptable for localhost but dangerous if exposed)

### 5.4 Frontend Security — MIXED

**Good**: No XSS vectors, no hardcoded secrets, TypeScript strict mode
**Bad**: Secret keys displayed in DOM indefinitely, no auto-dismiss, no memory clearing

### 5.5 Solana-Specific Security

- **Slippage**: Snipe buys hardcode `min_token_out: 1` (no protection)
- **Overflow**: Supply calculation can overflow u64
- **Blockhash**: Single blockhash for entire bundle with no refresh
- **Fee accounting**: Multi-hop distribution doesn't account for tx fees
- **Serialization**: Manual instruction serialization may not match on-chain programs

---

## 6. Performance Assessment

### 6.1 Critical: Synchronous RPC Blocking Async Runtime

The synchronous `solana_client::rpc_client::RpcClient` is used throughout `cresus-core` inside `async` functions. This blocks tokio worker threads during network calls. Under concurrent load (e.g., simultaneous distribution execution, health checks, token minting), this can exhaust the thread pool.

**Affected**: `mint.rs`, `builder.rs`, `disperser.rs`, `manager.rs`, `client.rs`
**Fix**: Switch to `solana_client::nonblocking::rpc_client::RpcClient` or wrap calls in `spawn_blocking`.

### 6.2 RPC Client Recreation on Every Call

`RpcManager::get_client()` and `health_check_all()` create a new `RpcClient` instance per call. Each creates a new HTTP client with its own connection pool, preventing HTTP connection reuse and adding TLS handshake overhead.

### 6.3 Database Performance

**Good**: WAL mode enabled, indexes on frequently queried columns (wallets by group, pubkey, parent)
**Issues**: Missing indexes on `meme_assets`, `meme_metadata`, and `rpc_endpoints.is_active`. Sequential single-row inserts for batch operations (sub-wallets, distribution transfers).

### 6.4 Minor Performance Items

- Vanity grinder creates a new rayon thread pool per invocation (LOW)
- Hardcoded program IDs re-parsed from strings on every call (LOW)

---

## 7. Test Coverage Gap Analysis

### 7.1 Current Test Inventory

| Crate | Test Count | Coverage |
|---|---|---|
| cresus-crypto | 7 tests (3 files) | AES encrypt/decrypt, KDF determinism, SecretBytes debug |
| cresus-db | 0 | None |
| cresus-core | 0 | None |
| cresus-api | 0 | None |
| cresus-server | 0 | None |
| frontend | 0 | None |
| **Total** | **7** | |

### 7.2 Critical Untested Paths

| Priority | Path | Risk |
|---|---|---|
| P0 | Wallet encryption/decryption roundtrip (core, not crypto) | Key corruption = permanent fund loss |
| P0 | Bundle transaction construction correctness | Invalid transactions = failed launches |
| P0 | Auth flow (setup → unlock → lock → re-unlock) | Auth bypass = unauthorized access |
| P1 | Distribution planning with multi-hop | Incorrect amounts/hops = fund loss |
| P1 | Database migration idempotency | Schema corruption on upgrades |
| P1 | Jito bundle submission and retry logic | Failed launches, lost tips |
| P2 | RPC failover behavior | Silent failures during operations |
| P2 | Vanity grinder with edge cases (empty prefix, max threads) | Crashes, resource exhaustion |
| P2 | WebSocket subscription/unsubscription lifecycle | Memory leaks, stale subscriptions |

### 7.3 Missing Crypto Test Cases

- Empty plaintext encryption
- Tampered ciphertext rejection (GCM tag verification)
- Invalid key lengths (0, 16, 64 bytes)
- Nonce uniqueness across multiple encryptions
- `generate_salt()` output length and uniqueness
- `into_inner()` correctness
- `Clone` independence

---

## 8. Recommendations — Prioritized Remediation Roadmap

### Priority 0 — CRITICAL (Block Deployment)

| # | Action | Findings | Effort |
|---|--------|----------|--------|
| 1 | **Implement auth middleware** — Axum extractor that checks unlock status, apply to all routes except `/auth/*` and `/health` | SEC-03, SEC-07, SEC-12, SEC-13 | Medium |
| 2 | **Fix wallet export** — Return encrypted JSON (re-encrypt with export password), never raw keys | SEC-01, SEC-06, SEC-08 | Small |
| 3 | **Encrypt vanity results** — Store vanity secret key encrypted with MEK in tasks table | SEC-02 | Small |
| 4 | **Zeroize all secret key material** — Use `Zeroizing<Vec<u8>>` everywhere, add explicit zeroize in `lock()` and `derive_master_key` | SEC-04, SEC-05, SEC-09, SEC-10 | Medium |
| 5 | **Fix supply overflow** — Use `checked_mul`/`checked_pow` | SOL-02 | Small |
| 6 | **Add slippage protection** — Expose `min_token_out` in snipe config | SOL-01 | Small |

### Priority 1 — HIGH (Before Real-Value Operations)

| # | Action | Findings | Effort |
|---|--------|----------|--------|
| 7 | **Restrict CORS** — Allow only `http://localhost:3000` and `http://127.0.0.1:3000` | SEC-11 | Small |
| 8 | **Add input validation** — Validate Solana addresses (base58, 32 bytes), bound subwallet count, validate password strength | SEC-14, SEC-20, SEC-17 | Medium |
| 9 | **Add rate limiting** — `tower::limit::RateLimit` on `/auth/unlock` and resource-intensive endpoints | SEC-16, SEC-21 | Small |
| 10 | **Switch to async RPC client** — Replace synchronous `RpcClient` with `nonblocking::RpcClient` | PERF-01, PERF-02 | Large |
| 11 | **Use retry variant for bundle launch** — Call `submit_and_confirm_with_retry` | PERF-03 | Small |
| 12 | **Add core test suite** — Unit tests for wallet CRUD, encryption roundtrip, bundle construction | TEST-01 | Large |

### Priority 2 — MEDIUM (Quality & Reliability)

| # | Action | Findings | Effort |
|---|--------|----------|--------|
| 13 | **Adopt `AppError` across all handlers** — Replace inline `json!()` error responses | ARCH-04, ARCH-06, ARCH-07 | Medium |
| 14 | **Fix distribution fee accounting** — Deduct tx fees from relay amounts in multi-hop | SOL-06 | Small |
| 15 | **Add distribution resume/idempotency** — Detect stalled "executing" distributions on startup | REL-01 | Medium |
| 16 | **Add WebSocket reconnection** — Auto-reconnect with backoff in subscriber.rs | REL-02 | Small |
| 17 | **Cache RPC clients** — Store `RpcClient` instances per endpoint in a HashMap | PERF-02 (related) | Small |
| 18 | **Extract shared utilities** — Deduplicate `decrypt_wallet_keypair`, `compute_ata`, program ID constants | ARCH-01, ARCH-02, ARCH-03 | Medium |
| 19 | **Add migration versioning** — Use `PRAGMA user_version` to track schema version | DB-01 | Small |
| 20 | **Integrate Zustand + TanStack Query OR remove them** — Eliminate dead dependencies | FE-01, FE-02 | Medium-Large |
| 21 | **Wire up Toast system OR remove it** — Use for success/error feedback across all pages | FE-03 | Small |
| 22 | **Add missing indexes** — `meme_metadata.image_asset_id`, `rpc_endpoints.is_active` | DB-02, DB-06 | Small |

### Priority 3 — LOW (Polish)

| # | Action | Findings |
|---|--------|----------|
| 23 | Remove `cresus-crypto` dependency from `cresus-db` |
| 24 | Extract shared data-fetching hook in frontend |
| 25 | Decompose page components into sub-components |
| 26 | Fix WebSocket cleanup on monitor page unmount |
| 27 | Validate instruction serialization against on-chain IDL |
| 28 | Add `checked_cast` for `i64` → `u64` lamport conversions |
| 29 | Remove redundant `idx_tokens_mint` index |

---

## Appendix A: Full Findings Index

| ID | Severity | Category | Title |
|---|---|---|---|
| SEC-01 | CRITICAL | Security | Wallet export returns raw plaintext secret key |
| SEC-02 | CRITICAL | Security | Vanity grind stores unencrypted secret key in database |
| SEC-03 | CRITICAL | Security | No centralized auth middleware |
| SEC-04 | CRITICAL | Security | Secret key bytes never zeroized after use |
| SEC-05 | CRITICAL | Security | Stack-resident derived key not zeroized |
| SEC-06 | CRITICAL | Security | Frontend displays secret keys without protection |
| SEC-07 | CRITICAL | Security | RPC endpoint manipulation without auth |
| SOL-01 | CRITICAL | Solana | Snipe buy min_token_out hardcoded to 1 |
| SOL-02 | CRITICAL | Solana | Token supply calculation overflow |
| SEC-08 | HIGH | Security | export_secret_key returns plain String |
| SEC-09 | HIGH | Security | MEK cloned into unprotected memory |
| SEC-10 | HIGH | Security | lock() may not zeroize MEK |
| SEC-11 | HIGH | Security | CORS allows any origin |
| SEC-12 | HIGH | Security | No session tokens |
| SEC-13 | HIGH | Security | WebSocket no auth check |
| SEC-14 | HIGH | Security | No Solana address validation |
| PERF-01 | HIGH | Performance | Blocking sync RPC in async context |
| PERF-02 | HIGH | Performance | Single blockhash, no refresh |
| PERF-03 | HIGH | Performance | Retry variant not used in launch |
| TEST-01 | HIGH | Testing | cresus-db zero test coverage |
| FE-01 | HIGH | Frontend | Zustand installed but unused |
| FE-02 | HIGH | Frontend | TanStack Query installed but unused |
| FE-03 | HIGH | Frontend | Toast system dead code |
| FE-04 | HIGH | Frontend | WebSocket stale closure |
| S-04 | HIGH | Security | EncryptedPayload JSON integer array |
| SPEC-01 | MEDIUM | Compliance | tokio-rusqlite instead of sqlx |
| SPEC-02 | MEDIUM | Compliance | Manual Jito HTTP instead of SDK |
| SPEC-03 | MEDIUM | Compliance | shadcn/ui not installed |
| SEC-15 | MEDIUM | Security | Argon2id parallelism p=1 |
| SEC-16 | MEDIUM | Security | No brute-force protection |
| SEC-17 | MEDIUM | Security | No password strength validation |
| SEC-18 | MEDIUM | Security | No upload size limit |
| SEC-19 | MEDIUM | Security | Float-to-u64 SOL conversion |
| SEC-20 | MEDIUM | Security | No subwallet count bound |
| SEC-21 | MEDIUM | Security | No rate limiting |
| SEC-22 | MEDIUM | Security | Avatar URLs unvalidated |
| ARCH-01 | MEDIUM | Architecture | Duplicated decrypt_wallet_keypair |
| ARCH-02 | MEDIUM | Architecture | Duplicated compute_ata |
| ARCH-03 | MEDIUM | Architecture | Hardcoded program IDs with unwrap |
| ARCH-04 | MEDIUM | Architecture | AppError is dead code |
| ARCH-05 | MEDIUM | Architecture | No Address Lookup Tables |
| DB-01 | MEDIUM | Database | No migration versioning |
| DB-02 | MEDIUM | Database | Missing indexes on meme tables |
| SOL-03 | MEDIUM | Solana | Metadata instruction discriminator may mismatch |
| SOL-04 | MEDIUM | Solana | OpenBook serialization fragile |
| SOL-05 | MEDIUM | Solana | i64 to u64 cast without validation |
| SOL-06 | MEDIUM | Solana | Multi-hop ignores tx fees |
| SOL-07 | MEDIUM | Solana | ATA instruction missing rent sysvar |
| REL-01 | MEDIUM | Reliability | Distribution no resume/idempotency |
| REL-02 | MEDIUM | Reliability | WebSocket no reconnection |
| FE-05 | MEDIUM | Frontend | Silent error swallowing |
| FE-06 | MEDIUM | Frontend | WebSocket not disconnected on unmount |
| SEC-23 | LOW | Security | SecretBytes derives Clone |
| SEC-24 | LOW | Security | into_inner() transfers zeroize responsibility |
| SEC-25 | LOW | Security | Hardcoded verification token |
| SEC-26 | LOW | Security | Vanity threads unbounded |
| DB-03 | LOW | Database | WAL pragma not verified |
| DB-04 | LOW | Database | Directory creation error silenced |
| DB-05 | LOW | Database | Redundant token index |
| DB-06 | LOW | Database | Missing rpc_endpoints index |
| DB-07 | LOW | Database | Missing distributions index |
| DB-08 | LOW | Database | Missing FK on distribution_transfers |
| ARCH-06 | LOW | Architecture | ApiError type never used |
| ARCH-07 | LOW | Architecture | ApiResponse partially adopted |
| ARCH-08 | LOW | Architecture | VanityResult holds key with Debug |
| REL-03 | LOW | Reliability | Retry can't refresh blockhash |
| REL-04 | LOW | Reliability | EventBus drops events silently |
| COMP-01 | LOW | Completeness | Monitor wallet extraction crude |
| FE-07 | LOW | Frontend | Error banner styling inconsistent |
| FE-08 | LOW | Frontend | No hooks/store directories |
| FE-09 | LOW | Frontend | Monolithic page components |
| FE-10 | LOW | Frontend | Duplicated fetch boilerplate |
| FE-11 | LOW | Frontend | Inline import() type syntax |
| FE-12 | LOW | Frontend | Incomplete useCallback deps |

---

## Appendix B: Dependency Compliance Matrix

See Section 2.1 for the full dependency comparison table.

**Additional unlisted dependencies found** (not in spec but legitimate):
- `rand 0.8` (cresus-crypto) — Required for CSPRNG
- `chrono 0.4` (cresus-db) — Timestamp utilities
- `dashmap` (cresus-core) — Concurrent hash maps for monitor
- `tokio-tungstenite` (cresus-core) — WebSocket client for Solana RPC
- `bs58` (cresus-core) — Base58 encoding for Solana addresses
- `borsh` (cresus-core) — Solana instruction serialization

---

## Appendix C: File Inventory

### Backend (Rust)

```
crates/cresus-crypto/src/       3 files  (aes.rs, kdf.rs, secure_mem.rs)
crates/cresus-db/src/           7 files  (lib.rs, models.rs, repo/*.rs)
crates/cresus-db/migrations/    7 files  (001-007)
crates/cresus-core/src/         21 files (wallet/*, token/*, bundle/*, distribution/*, profile/*, monitor/*, rpc/*)
crates/cresus-api/src/          10 files (wallet, token, bundle, meme_library, distribution, profile, monitor, rpc_config, stats, types)
crates/cresus-server/src/       5 files  (main, config, router, state, error)
```

### Frontend (Next.js)

```
frontend/src/app/               9 page files + layout + globals.css
frontend/src/components/        4 files (Sidebar, AuthGate, Toast, ErrorBoundary)
frontend/src/lib/               3 files (api.ts, ws.ts, types.ts)
frontend/src/hooks/             (does not exist)
frontend/src/store/             (does not exist)
```

### Configuration

```
Cargo.toml                      Workspace root
.gitignore                      Comprehensive coverage
.env.example                    Missing PINATA_JWT entry
frontend/package.json           Includes unused deps (zustand, @tanstack/react-query)
frontend/next.config.js         API proxy rewrite (bypassed by api.ts)
frontend/tailwind.config.ts     Standard config, no plugins
frontend/tsconfig.json          Strict mode enabled
```

---

*End of audit report. Generated 2026-02-03 by Claude Opus 4.5.*
