-- Wallet warmer tables for anti-detection

CREATE TABLE IF NOT EXISTS warmer_tasks (
    id              TEXT PRIMARY KEY,
    wallet_ids      TEXT NOT NULL, -- JSON array of wallet IDs to warm
    actions_count   INTEGER NOT NULL, -- total number of actions to perform
    min_delay_hours INTEGER NOT NULL,
    max_delay_hours INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'stopped', -- stopped, running, completed
    actions_completed INTEGER DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    completed_at    INTEGER
);

CREATE TABLE IF NOT EXISTS warmer_actions (
    id              TEXT PRIMARY KEY,
    task_id         TEXT NOT NULL REFERENCES warmer_tasks(id) ON DELETE CASCADE,
    wallet_id       TEXT NOT NULL,
    action_type     TEXT NOT NULL, -- 'sol_transfer', 'token_swap', 'nft_interaction'
    details         TEXT, -- JSON details of the action
    tx_signature    TEXT,
    scheduled_at    INTEGER NOT NULL,
    executed_at     INTEGER,
    status          TEXT NOT NULL DEFAULT 'pending', -- pending, executed, failed
    FOREIGN KEY (task_id) REFERENCES warmer_tasks(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_warmer_tasks_status ON warmer_tasks(status);
CREATE INDEX IF NOT EXISTS idx_warmer_actions_task ON warmer_actions(task_id);
CREATE INDEX IF NOT EXISTS idx_warmer_actions_status ON warmer_actions(status);
CREATE INDEX IF NOT EXISTS idx_warmer_actions_scheduled ON warmer_actions(scheduled_at);
