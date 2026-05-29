# Security Policy

## Threat model

Offivex is a SaaS launchpad that signs Solana transactions on behalf of users. The most catastrophic outcomes are:

1. **Treasury seed compromise** → attacker drains every invoice address ever derived.
2. **MEK compromise** → attacker decrypts all wallet private keys at rest, drains every user wallet.
3. **API key leak (in-flight or in-storage)** → attacker uses victim's session to launch unwanted on-chain ops.
4. **Watcher race compromise** → double-credit a single SOL payment to two users.

Each of these is mitigated by layered defenses documented below.

## Cryptographic primitives

| Use case | Primitive |
|---|---|
| Admin passwords | Argon2id PHC (64 MB, t=3, p=1) |
| User API keys | Argon2id PHC (same params) |
| Wallet private keys at rest | AES-256-GCM with random 12-byte nonce per wallet |
| Reveal_key at rest | AES-256-GCM under a key derived from the treasury seed (`HMAC-SHA256("offivex-reveal-key-v1", treasury_seed)`) |
| HD derivation | SLIP-0010 ed25519 (path `m/44'/501'/N'/0'`) |
| Random number generation | `rand::rngs::OsRng` with rejection sampling for unbiased alphabet |
| Token comparison | `subtle::ConstantTimeEq` (defense against timing oracle) |

## Defense-in-depth summary

- **Triple-stack middleware** on data-plane routes: `require_api_key → require_active_plan → require_unlocked`. Each layer fails fast independently.
- **Cache invalidation contract** documented in [auth.rs](backend/crates/Offivex-server/src/auth.rs) — admin destructive ops clear the API key cache atomically.
- **Brute-force prefix lockout** (SEC-MAX-4): >10 invalid attempts on the same API key prefix in 60s → 429 for 15min.
- **WS rate limiting** (SEC-MAX-2): token bucket 10 msg/sec/client; sustained burst closes the socket.
- **CSP strict** + X-Frame-Options DENY + Referrer-Policy + Permissions-Policy.
- **CORS validation at boot** (SEC-6): mainnet rejects wildcard `*`, `http://` scheme, and localhost-origins.
- **Treasury seed fail-fast at boot** — missing/invalid → exit code 1, no degraded-mode boot.
- **ZeroizingKeypair** wraps every decrypted wallet keypair; volatile-write zero on Drop.
- **Anti-replay** via UNIQUE indexes on `payments.tx_hash` + `payments.derivation_index` + `payments.solana_address (WHERE active)`.
- **Atomic claim** on payment confirmation via `WHERE status IN ('pending', 'confirming')` guard — only one watcher tick can ever transition a payment to `confirmed`.
- **Audit log** for every admin action AND every user data-plane op (mint, bundle launch, swap, distribution execute) — full forensic trail with user_id, wallet, amounts, tx_hash.
- **Argon2 in `spawn_blocking`** — verification CPU work runs on the blocking thread pool, never blocks the async runtime.

## Pre-release security checklist

Before every deployment to mainnet, run:

```bash
# 1. Backend dependency audit
cd Offivex/backend
cargo install cargo-audit  # one-time
cargo audit

# 2. Frontend dependency audit
cd Offivex/frontend
npm audit --audit-level=high

# 3. Full test suite (172+ tests must pass)
cd Offivex/backend
cargo test --workspace

# 4. Type check + production build
cd Offivex/frontend
npx tsc --noEmit
npm run build

# 5. Deploy check (env vars, migrations, etc.)
bash scripts/deploy-check.sh
```

All five MUST exit 0 before deploying. CI integration recommended.

## Reporting a vulnerability

Email `security@offivex.io` (or contact the team Telegram if private channel needed). Do NOT open public GitHub issues for security reports.

We aim to respond within 24h with severity assessment + patch ETA. Standard disclosure timeline: 90 days unless coordinated otherwise.

## Known limitations (accepted)

| Limitation | Mitigation today | Long-term plan |
|---|---|---|
| Treasury seed via env var (not HSM) | Container `/proc/{pid}/environ` not readable (non-root user) + env var stripped from logs | HSM (AWS CloudHSM / Yubikey) in Phase 7 |
| Per-user data isolation absent (mono-tenant) | All operations gated by admin MEK unlock | Phase 7 dedicated sprint — user_id on 13 tables |
| API key in localStorage (XSS-readable) | Strict CSP `script-src 'self'` + content sanitization | httpOnly cookies + CSRF in Phase 7 |
| SQLite single-writer bottleneck (~150 users) | WAL + tuned pragmas + composite indexes | Postgres migration (~2 weeks dedicated) |
| Memory dump leaks reveal_key during the brief in-RAM window | AES-encrypted at rest + Drop zeroize on copies | Hardware enclave (Intel SGX / AWS Nitro) in long-term roadmap |

## Audit log queries (admin reference)

```sql
-- Detect prefix-enumeration attempts (SEC-MAX-6):
SELECT created_at, details FROM audit_log
 WHERE action = 'apply_invalid_referral_code'
 ORDER BY created_at DESC LIMIT 100;

-- User data-plane forensics for incident response (SEC-MAX-3):
SELECT created_at, action, details, ip
  FROM audit_log
 WHERE user_id = 'X'
   AND action LIKE 'user_op_%'
 ORDER BY created_at DESC;

-- Suspect bulk-revoke + key-rotate within 5min window:
SELECT admin_id, COUNT(*) FROM audit_log
 WHERE action IN ('admin_rotated_key', 'admin_revoked_key', 'admin_user_updated')
   AND created_at > strftime('%s', 'now') - 300
 GROUP BY admin_id;
```
