-- Bumper bot tables for price support automation

CREATE TABLE IF NOT EXISTS bumper_tasks (
    id              TEXT PRIMARY KEY,
    token_mint      TEXT NOT NULL,
    wallet_ids      TEXT NOT NULL, -- JSON array of wallet IDs
    price_threshold REAL NOT NULL, -- price in SOL (e.g., 0.0001)
    buy_amount      INTEGER NOT NULL, -- lamports to buy each time
    max_buys_hour   INTEGER NOT NULL, -- max buys per hour (rate limit)
    status          TEXT NOT NULL DEFAULT 'stopped', -- stopped, running, paused
    buys_count      INTEGER DEFAULT 0,
    total_spent_sol INTEGER DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bumper_buys (
    id              TEXT PRIMARY KEY,
    task_id         TEXT NOT NULL REFERENCES bumper_tasks(id) ON DELETE CASCADE,
    wallet_id       TEXT NOT NULL,
    sol_amount      INTEGER NOT NULL,
    token_amount    INTEGER NOT NULL,
    price_at_buy    REAL NOT NULL,
    tx_signature    TEXT,
    executed_at     INTEGER NOT NULL,
    FOREIGN KEY (task_id) REFERENCES bumper_tasks(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bumper_tasks_status ON bumper_tasks(status);
CREATE INDEX IF NOT EXISTS idx_bumper_tasks_token ON bumper_tasks(token_mint);
CREATE INDEX IF NOT EXISTS idx_bumper_buys_task ON bumper_buys(task_id);
CREATE INDEX IF NOT EXISTS idx_bumper_buys_executed ON bumper_buys(executed_at);
