CREATE TABLE IF NOT EXISTS tokens (
    id                TEXT PRIMARY KEY,
    mint_address      TEXT NOT NULL UNIQUE,
    name              TEXT,
    symbol            TEXT,
    decimals          INTEGER NOT NULL,
    supply            TEXT NOT NULL,
    metadata_uri      TEXT,
    creator_wallet_id TEXT REFERENCES wallets(id) ON DELETE SET NULL,
    tx_signature      TEXT,
    created_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tokens_mint ON tokens(mint_address);
