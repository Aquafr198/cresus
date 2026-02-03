CREATE TABLE IF NOT EXISTS wallet_profiles (
    id          TEXT PRIMARY KEY,
    wallet_id   TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    display_name TEXT,
    avatar_url  TEXT,
    bio         TEXT,
    twitter     TEXT,
    telegram    TEXT,
    website     TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_wallet ON wallet_profiles(wallet_id);
