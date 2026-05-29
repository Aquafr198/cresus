CREATE TABLE IF NOT EXISTS api_keys (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash                TEXT NOT NULL,
    key_prefix              TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'revoked')),
    created_at              INTEGER NOT NULL,
    last_used_at            INTEGER,
    revoked_at              INTEGER,
    revoked_by_admin_id     TEXT REFERENCES admins(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix_status ON api_keys(key_prefix, status);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

-- One active key per user (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_user_active
    ON api_keys(user_id) WHERE status = 'active';
