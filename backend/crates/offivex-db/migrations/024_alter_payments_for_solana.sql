-- Phase 5 — Direct on-chain Solana payment (Kinesis-style).
--
-- ALTER TABLE ADD COLUMN is non-idempotent in SQLite; the actual column adds
-- are emitted in run_migrations() via add_column_if_not_exists (see lib.rs).
-- This .sql file holds the indexes (which ARE idempotent via IF NOT EXISTS)
-- plus full documentation of the schema delta.
--
-- New columns on `payments`:
--   solana_address              TEXT      -- HD-derived deposit address (one per invoice)
--   derivation_index            INTEGER   -- BIP44 path index (UNIQUE — never reused)
--   amount_lamports             INTEGER   -- expected amount, integer math (no floats!)
--   amount_lamports_received    INTEGER   -- detected on-chain amount
--   expires_at                  INTEGER   -- Unix ts when invoice expires (default: created_at + 1800)
--   sol_usd_rate_cents          INTEGER   -- locked USD cents per 1 SOL at creation
--   reveal_key                  TEXT      -- plaintext API key, NULLed after 1st status fetch post-confirm
--   reveal_key_expires_at       INTEGER   -- garbage-collected after 24h
--
-- Status flow (status column already exists, CHECK constraint already covers our values):
--   pending → confirming → confirmed   (happy path)
--   pending → expired                  (no payment in 30min)
--   pending → underpaid                (received < 99.5% expected)
--   pending → failed                   (manual admin override)

-- One active invoice per address (allow address recycling once an invoice is dead)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_solana_address_active
    ON payments(solana_address)
    WHERE solana_address IS NOT NULL AND status NOT IN ('expired', 'failed');

-- BIP44 derivation index is allocated atomically; never reused even if invoice fails
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_derivation_index
    ON payments(derivation_index)
    WHERE derivation_index IS NOT NULL;

-- Anti-replay: each Solana signature can credit at most one invoice
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_tx_hash
    ON payments(tx_hash)
    WHERE tx_hash IS NOT NULL;

-- Watcher hot path: list pending/confirming, prune expired
CREATE INDEX IF NOT EXISTS idx_payments_status_expires
    ON payments(status, expires_at);

-- Reveal-key garbage collection
CREATE INDEX IF NOT EXISTS idx_payments_reveal_expires
    ON payments(reveal_key_expires_at)
    WHERE reveal_key IS NOT NULL;
