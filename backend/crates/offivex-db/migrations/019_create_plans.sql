CREATE TABLE IF NOT EXISTS plans (
    id                  TEXT PRIMARY KEY,
    slug                TEXT NOT NULL UNIQUE,
    name                TEXT NOT NULL,
    price_usd_cents     INTEGER NOT NULL,
    duration_days       INTEGER NOT NULL,
    features_json       TEXT NOT NULL DEFAULT '{}',
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plans_slug ON plans(slug);
CREATE INDEX IF NOT EXISTS idx_plans_active ON plans(is_active);

-- Seed default plans (idempotent via INSERT OR IGNORE on UNIQUE slug)
INSERT OR IGNORE INTO plans (id, slug, name, price_usd_cents, duration_days, features_json, is_active, created_at)
VALUES
    ('plan_monthly_default', 'monthly', 'Monthly', 100000, 30, '{}', 1, strftime('%s','now')),
    ('plan_yearly_default',  'yearly',  'Yearly',  700000, 365, '{}', 1, strftime('%s','now'));
