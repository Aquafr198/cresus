CREATE TABLE IF NOT EXISTS bundles (
    id              TEXT PRIMARY KEY,
    token_id        TEXT REFERENCES tokens(id) ON DELETE SET NULL,
    config_json     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'configured',
    jito_bundle_id  TEXT,
    market_address  TEXT,
    pool_address    TEXT,
    tx_signatures   TEXT,
    error_message   TEXT,
    created_at      INTEGER NOT NULL,
    executed_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_bundles_status ON bundles(status);
CREATE INDEX IF NOT EXISTS idx_bundles_token ON bundles(token_id);
