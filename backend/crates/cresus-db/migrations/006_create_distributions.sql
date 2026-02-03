CREATE TABLE IF NOT EXISTS distributions (
    id              TEXT PRIMARY KEY,
    source_wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    strategy        TEXT NOT NULL DEFAULT 'direct',
    status          TEXT NOT NULL DEFAULT 'planned',
    total_sol       INTEGER NOT NULL,
    config_json     TEXT NOT NULL,
    result_json     TEXT,
    error_message   TEXT,
    created_at      INTEGER NOT NULL,
    executed_at     INTEGER
);

CREATE TABLE IF NOT EXISTS distribution_transfers (
    id              TEXT PRIMARY KEY,
    distribution_id TEXT NOT NULL REFERENCES distributions(id) ON DELETE CASCADE,
    from_wallet_id  TEXT NOT NULL,
    to_wallet_id    TEXT NOT NULL,
    amount_lamports INTEGER NOT NULL,
    hop_index       INTEGER NOT NULL DEFAULT 0,
    delay_ms        INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending',
    tx_signature    TEXT,
    error_message   TEXT,
    executed_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_distributions_status ON distributions(status);
CREATE INDEX IF NOT EXISTS idx_dist_transfers_dist ON distribution_transfers(distribution_id);
CREATE INDEX IF NOT EXISTS idx_dist_transfers_status ON distribution_transfers(status);
