# Operational Runbook

Recovery procedures for common Offivex incidents. Run these from the project root (`Offivex/`) unless noted.

---

## Quick triage commands

| Symptom | First command |
|---|---|
| Frontend hangs on `/login` after paste key | `docker compose logs backend --tail 50` |
| User reports "402 no_active_plan" but admin granted | `curl -H "Authorization: Bearer $ADMIN_TOKEN" http://api.../admin/users/{user_id}` — verify expires_at |
| `/admin/users` shows but user can't log in | Check audit_log for `admin_user_updated status:active→suspended` |
| `/health` 200 but `/readyz` 503 | One of `db` / `mek_unlocked` / `treasury_pubkey_set` is false in `/readyz` response body |
| No payments confirming | `curl /admin/watcher-status` — `secs_since_last_tick` should be < 60 |
| Slow API responses (>500ms) | `grep "Slow HTTP request" backend.log` |

---

## Scenario 1 — MEK perdu mais seed phrase wallet présent

**Symptom** : `/auth/status` returns `{password_set: true, unlocked: false}` but no one remembers the password.

**Recovery via seed phrase** :

```bash
# 1. Stop backend
docker compose stop backend

# 2. Manual restore via CLI (derives MEK from the wallet seed phrase)
# This sub-command bypasses the lost password by re-deriving the MEK from
# the BIP39 seed that was set at wallet creation.
docker compose run --rm backend cargo run --release -- admin restore-from-seed

# Will prompt for the seed phrase (12/24 words) on stdin.
# On success, writes a new MEK to the encrypted key store + new admin password.

# 3. Restart
docker compose start backend

# 4. Verify
curl http://localhost:3001/api/v1/auth/status
# → {"password_set": true, "unlocked": false}  (need /auth/unlock with new password)
```

---

## Scenario 2 — DB corrompue / accidentally dropped data

**Symptom** : `sqlite3 offivex.db "PRAGMA integrity_check"` returns non-`ok`, OR admin reports missing rows.

**Recovery from backup** :

```bash
# 1. Stop backend (writers must stop before swap)
docker compose stop backend

# 2. List available hourly backups (24 retention by default)
ls -lat data/backups/ | head -10

# 3. Pick the most recent backup PRIOR to the corruption point
LATEST=$(ls -1t data/backups/OFFIVEX_*.db 2>/dev/null | head -1)
echo "Restoring from $LATEST"

# 4. Backup the corrupt DB before overwriting (forensic)
cp data/offivex.db data/offivex.db.corrupt.$(date +%s)

# 5. Restore
cp "$LATEST" data/offivex.db

# 6. Verify integrity
sqlite3 data/offivex.db "PRAGMA integrity_check;"
# → "ok"

# 7. Restart
docker compose start backend
docker compose logs backend --tail 30  # confirm boot OK, "Database initialized"
```

**Data loss window** : up to 1 hour (last backup interval). If you need finer recovery, restore the closest backup + manually replay audit_log entries.

---

## Scenario 3 — Treasury seed leak suspected

**Symptom** : you have credible suspicion the seed phrase has leaked (env var dump, ex-employee, infrastructure breach).

**Critical** : do this within minutes — every minute the old seed is valid is another minute the attacker can drain incoming invoice addresses.

```bash
# 1. IMMEDIATELY shut down inbound traffic
docker compose stop caddy
# All pending invoices will fail to confirm — but at least no new invoice addresses
# are derived under the compromised seed.

# 2. Generate fresh BIP39 phrase OFFLINE (use iancoleman.io in airplane mode)
# Write down on paper, never store digitally.

# 3. Run sweep tool to drain all derived addresses to the new treasury
docker compose run --rm backend cargo run --release -- treasury sweep \
    --old-seed-stdin \
    --new-treasury-pubkey <pubkey_derived_from_new_seed_idx_0>
# Will scan all `payments.derivation_index` values and sweep any remaining
# balance to the new treasury before the old seed is rotated out.

# 4. Update .env.docker with the new seed
# REPLACE OFFIVEX_TREASURY_SEED_PHRASE=<new phrase>
nano .env.docker

# 5. Re-issue invoices for any user who paid but hadn't been confirmed yet
# Get the list:
sqlite3 data/offivex.db \
  "SELECT id, user_id, solana_address FROM payments
   WHERE status IN ('pending', 'confirming')"
# Contact each user via Telegram with a new invoice link.

# 6. Re-start everything
docker compose up -d

# 7. ALERT all users via Telegram that ANY treasury-derived address sent SOL
# before this date is COMPROMISED — they MUST move their funds.
```

---

## Scenario 4 — Watcher stuck (no ticks for > 5 min)

**Symptom** : `GET /admin/watcher-status` returns `secs_since_last_tick > 60` and growing.

**Diagnosis** :

```bash
# 1. Quick status
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3001/api/v1/admin/watcher-status

# Look at:
#   - "secs_since_last_tick" — how long since last sweep?
#   - "total_errors_since_boot" — growing? consistent failures?
#   - "pending_or_confirming_count" — invoices waiting?

# 2. Tail watcher logs
docker compose logs backend --tail 200 | grep -iE "watcher|payment"

# Common causes:
#   - "Rpc error: timeout" → Helius/Solana RPC down. Watcher will retry,
#     but stalled until RPC comes back. Check Helius status page.
#   - "DB error: database is locked" → SQLite contention. Restart backend.
#   - "TaskAbort" or silent stop → process died, restart container.

# 3. Force restart (watcher resumes from DB state, idempotent)
docker compose restart backend

# 4. Verify recovery
sleep 30
curl /admin/watcher-status
# → secs_since_last_tick should be < 10
```

---

## Scenario 5 — Admin password lost

**Symptom** : no one can log into `/admin/login`.

**Recovery via CLI** :

```bash
# CLI subcommand creates a fresh admin (bypasses login auth).
# This is intentional — physical access to the container = full control.
docker compose exec backend cargo run --release -- admin create \
    --username newadmin --password-stdin
# Will prompt for password on stdin.

# Then log in via web with newadmin credentials, and via the admin UI:
# - Verify other admins still work (audit log them)
# - If old admin is compromised, revoke its sessions:
#   curl -X POST http://api.../admin/sessions/revoke-all-for-user/<admin_id>
```

---

## Scenario 6 — User can't access despite valid key (cache stale)

**Symptom** : admin rotated/revoked a user's API key, but the user's frontend keeps working for a few seconds.

**Cause** : The 30s API key cache in `require_api_key` was not invalidated. After audit P4 this is fixed (admin destructive ops clear the cache atomically), but if you ever observe this:

```bash
# Restart backend to nuke the in-memory cache
docker compose restart backend
```

---

## Scenario 7 — `/readyz` returns 503

**Symptom** : Caddy/LB routes traffic away from the backend; `curl /readyz` returns `{"ready": false, "checks": {...}}`.

**Diagnosis** : look at which check is `false` in the response :

| Failed check | Cause | Fix |
|---|---|---|
| `db: false` | SQLite connection broken | Restart backend ; check disk space (`df -h`) |
| `mek_unlocked: false` | Admin needs to unlock via `POST /auth/unlock` | Admin logs in and unlocks via UI |
| `treasury_pubkey_set: false` | `OFFIVEX_TREASURY_SEED_PHRASE` missing or invalid | Fix env var, restart backend |

---

## Backup verification (monthly recommendation)

```bash
# Pick a random backup
RANDOM_BACKUP=$(ls data/backups/*.db | shuf -n 1)

# Try restoring it to a scratch DB
sqlite3 "$RANDOM_BACKUP" ".dump" > /tmp/restore_test.sql
sqlite3 /tmp/restore_check.db < /tmp/restore_test.sql

# Run integrity check
sqlite3 /tmp/restore_check.db "PRAGMA integrity_check;"
# → "ok"

# Cleanup
rm /tmp/restore_test.sql /tmp/restore_check.db
```

---

## Contact escalation

1. **Tier 1 (operational)** : admin can self-recover via this runbook (scenarios 1, 4, 5, 6, 7).
2. **Tier 2 (data/forensic)** : scenarios 2, 3 — escalate to security@offivex.io, do NOT improvise.
3. **Tier 3 (regulatory/legal)** : if treasury seed leak resulted in user fund loss → involve legal counsel within 24h.

Every incident — even successfully self-recovered — should be logged in the post-incident review channel (`#ops-incidents`) within 48h.
