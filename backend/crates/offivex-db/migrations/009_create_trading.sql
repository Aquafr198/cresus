-- Trading tables for Volume Bot, Bumper Bot, etc.

-- Volume bot tasks
CREATE TABLE IF NOT EXISTS volume_tasks (
    id              TEXT PRIMARY KEY,
    token_mint      TEXT NOT NULL,
    wallet_ids      TEXT NOT NULL, -- JSON array of wallet IDs
    min_sol         INTEGER NOT NULL, -- in lamports
    max_sol         INTEGER NOT NULL, -- in lamports
    sell_percent    INTEGER NOT NULL DEFAULT 100, -- percentage to sell (1-100)
    min_delay_sec   INTEGER NOT NULL,
    max_delay_sec   INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'stopped', -- stopped, running, paused
    trades_count    INTEGER DEFAULT 0,
    total_volume_sol INTEGER DEFAULT 0, -- total volume in lamports
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

-- Individual trades executed by volume bot
CREATE TABLE IF NOT EXISTS volume_trades (
    id              TEXT PRIMARY KEY,
    task_id         TEXT NOT NULL REFERENCES volume_tasks(id) ON DELETE CASCADE,
    wallet_id       TEXT NOT NULL,
    direction       TEXT NOT NULL, -- 'buy' or 'sell'
    sol_amount      INTEGER NOT NULL, -- lamports
    token_amount    INTEGER NOT NULL, -- token base units
    tx_signature    TEXT,
    executed_at     INTEGER NOT NULL,
    FOREIGN KEY (task_id) REFERENCES volume_tasks(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_volume_tasks_status ON volume_tasks(status);
CREATE INDEX IF NOT EXISTS idx_volume_tasks_token ON volume_tasks(token_mint);
CREATE INDEX IF NOT EXISTS idx_volume_trades_task ON volume_trades(task_id);
CREATE INDEX IF NOT EXISTS idx_volume_trades_wallet ON volume_trades(wallet_id);
CREATE INDEX IF NOT EXISTS idx_volume_trades_executed ON volume_trades(executed_at);
