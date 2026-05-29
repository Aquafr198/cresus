CREATE TABLE IF NOT EXISTS apply_requests (
    id                      TEXT PRIMARY KEY,
    telegram                TEXT NOT NULL,
    email                   TEXT NOT NULL,
    project                 TEXT NOT NULL,
    plan_pref               TEXT,
    status                  TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected')),
    submitted_at            INTEGER NOT NULL,
    decided_at              INTEGER,
    decided_by_admin_id     TEXT REFERENCES admins(id) ON DELETE SET NULL,
    user_id_after_approval  TEXT,
    ip                      TEXT,
    notes                   TEXT
);

CREATE INDEX IF NOT EXISTS idx_apply_requests_status ON apply_requests(status);
CREATE INDEX IF NOT EXISTS idx_apply_requests_submitted ON apply_requests(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_apply_requests_email ON apply_requests(email);
