-- Pump.fun token launches
CREATE TABLE IF NOT EXISTS pump_fun_launches (
    id                TEXT PRIMARY KEY,
    token_name        TEXT NOT NULL,
    token_symbol      TEXT NOT NULL,
    token_description TEXT NOT NULL DEFAULT '',
    image_url         TEXT NOT NULL DEFAULT '',
    token_mint        TEXT,
    creator_wallet_id TEXT NOT NULL,
    initial_buy_sol   INTEGER NOT NULL DEFAULT 0,
    status            TEXT NOT NULL DEFAULT 'pending',
    tx_signature      TEXT,
    bonding_curve     TEXT,
    metadata_uri      TEXT,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pump_fun_status ON pump_fun_launches(status);
CREATE INDEX IF NOT EXISTS idx_pump_fun_creator ON pump_fun_launches(creator_wallet_id);
