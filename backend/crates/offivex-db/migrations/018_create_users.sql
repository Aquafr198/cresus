CREATE TABLE IF NOT EXISTS users (
    id                      TEXT PRIMARY KEY,
    telegram                TEXT,
    email                   TEXT NOT NULL UNIQUE,
    status                  TEXT NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'suspended')),
    created_at              INTEGER NOT NULL,
    created_from_apply_id   TEXT REFERENCES apply_requests(id) ON DELETE SET NULL,
    notes                   TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at DESC);
