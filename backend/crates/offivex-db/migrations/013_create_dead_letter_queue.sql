CREATE TABLE IF NOT EXISTS dead_letter_transactions (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,           -- 'distribution', 'volume_bot', 'bumper_bot', 'warmer', 'manual'
    source_id TEXT,                 -- reference to the originating task/distribution
    wallet_id TEXT NOT NULL,
    tx_type TEXT NOT NULL,          -- 'sol_transfer', 'token_swap', 'token_transfer', 'bundle'
    payload_json TEXT NOT NULL,     -- serialized request details for replay
    error_message TEXT NOT NULL,
    error_category TEXT NOT NULL,   -- 'retryable', 'fatal', 'user_error'
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    last_attempt_at INTEGER NOT NULL,
    next_retry_at INTEGER,          -- NULL if fatal/exhausted
    resolved_at INTEGER,            -- when manually resolved or successfully retried
    tx_signature TEXT,              -- populated on successful retry
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'retrying', 'resolved', 'exhausted', 'dismissed'
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dlq_status ON dead_letter_transactions(status);
CREATE INDEX IF NOT EXISTS idx_dlq_source ON dead_letter_transactions(source, source_id);
CREATE INDEX IF NOT EXISTS idx_dlq_next_retry ON dead_letter_transactions(next_retry_at) WHERE status = 'pending';
