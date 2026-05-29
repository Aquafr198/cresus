-- Realized PNL events emitted by the dev_sold_detector when a creator's
-- profitable sell is observed. Consumed by the Discord bot via the
-- `/api/v1/pnl/recent` endpoint to generate an auto-posted PNL card image.
--
-- Lamport amounts are stored as TEXT (string-encoded u64) because SQLite's
-- INTEGER type is i64 and saturates above ~9.2 × 10^18. Realistic memecoin
-- proceeds stay well below i64, but we keep the schema future-proof.
--
-- `pnl_sol_lamports` is signed (a -50 SOL drawdown is also a valid event,
-- though the detector currently only inserts when PNL > 0). Store as TEXT
-- so a future "loss tracker" feature doesn't need a migration.
CREATE TABLE IF NOT EXISTS realized_pnl_events (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    bundle_id              TEXT NOT NULL,
    token_mint             TEXT NOT NULL,
    token_symbol           TEXT,
    creator_wallet         TEXT NOT NULL,
    invested_sol_lamports  TEXT NOT NULL,
    sold_sol_lamports      TEXT NOT NULL,
    pnl_sol_lamports       TEXT NOT NULL,
    pnl_multiplier_x100    INTEGER NOT NULL,
    sol_usd_rate_cents     INTEGER,
    detected_at            INTEGER NOT NULL,
    posted_at              INTEGER,
    FOREIGN KEY (bundle_id) REFERENCES bundles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pnl_events_after_id
    ON realized_pnl_events(id);

CREATE INDEX IF NOT EXISTS idx_pnl_events_unposted
    ON realized_pnl_events(posted_at) WHERE posted_at IS NULL;
