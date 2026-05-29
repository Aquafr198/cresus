CREATE TABLE IF NOT EXISTS app_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_groups (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wallets (
    id               TEXT PRIMARY KEY,
    name             TEXT,
    public_key       TEXT NOT NULL,
    encrypted_secret BLOB NOT NULL,
    nonce            BLOB NOT NULL,
    group_id         TEXT REFERENCES wallet_groups(id) ON DELETE SET NULL,
    parent_id        TEXT REFERENCES wallets(id) ON DELETE CASCADE,
    derivation_index INTEGER,
    created_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wallets_group ON wallets(group_id);
CREATE INDEX IF NOT EXISTS idx_wallets_parent ON wallets(parent_id);
CREATE INDEX IF NOT EXISTS idx_wallets_pubkey ON wallets(public_key);
