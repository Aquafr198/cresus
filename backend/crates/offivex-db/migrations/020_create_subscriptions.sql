CREATE TABLE IF NOT EXISTS subscriptions (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id                 TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    status                  TEXT NOT NULL
                                CHECK (status IN ('pending', 'active', 'expired', 'canceled')),
    started_at              INTEGER,
    expires_at              INTEGER,
    current_payment_id      TEXT,
    created_at              INTEGER NOT NULL,
    updated_at              INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_exp ON subscriptions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_user
    ON subscriptions(user_id) WHERE status = 'active';
