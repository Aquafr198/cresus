-- A.3 — Periodic balance snapshots of the creator wallet for every
-- confirmed bundle that declared a `creator_reserve_tokens`. The dev-sold
-- detector consults the most recent snapshot to compare on-chain balance
-- drift and emit `dev_sold` MonitorEvents when the drop crosses the
-- configured threshold (~20% of the prior snapshot).
--
-- `balance_raw` is stored as TEXT to preserve the full u64 range — SQLite's
-- INTEGER type is i64 and saturates at 9.2e18 raw token units, which is
-- below typical memecoin supplies when decimals=9.
CREATE TABLE IF NOT EXISTS bundle_creator_snapshots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    bundle_id    TEXT NOT NULL,
    snapshot_at  INTEGER NOT NULL,
    balance_raw  TEXT NOT NULL,
    FOREIGN KEY (bundle_id) REFERENCES bundles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bundle_creator_snapshots_bundle_time
    ON bundle_creator_snapshots(bundle_id, snapshot_at DESC);
