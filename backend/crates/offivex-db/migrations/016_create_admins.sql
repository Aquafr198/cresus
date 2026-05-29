CREATE TABLE IF NOT EXISTS admins (
    id              TEXT PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    last_login_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);

CREATE TABLE IF NOT EXISTS admin_sessions (
    id              TEXT PRIMARY KEY,
    admin_id        TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    created_at      INTEGER NOT NULL,
    expires_at      INTEGER NOT NULL,
    last_seen_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_id);
