CREATE TABLE IF NOT EXISTS payments (
    id                          TEXT PRIMARY KEY,
    user_id                     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    plan_id                     TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    provider                    TEXT NOT NULL DEFAULT 'nowpayments',
    provider_payment_id         TEXT,
    amount_usd_cents            INTEGER NOT NULL,
    currency_paid               TEXT,
    amount_paid_crypto          TEXT,
    tx_hash                     TEXT,
    status                      TEXT NOT NULL
                                    CHECK (status IN ('pending', 'confirming', 'confirmed', 'failed', 'expired', 'partial')),
    created_at                  INTEGER NOT NULL,
    confirmed_at                INTEGER,
    webhook_payload_json        TEXT,
    webhook_received_at         INTEGER
);

-- Idempotence: a given provider payment id can appear only once
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_pid
    ON payments(provider, provider_payment_id)
    WHERE provider_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_user_status ON payments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);
