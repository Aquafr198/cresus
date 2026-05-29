CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    action      TEXT NOT NULL,
    detail      TEXT DEFAULT '',
    wallet_id   TEXT,
    tx_signature TEXT,
    created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
