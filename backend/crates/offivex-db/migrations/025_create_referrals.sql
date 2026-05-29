-- Phase 6.5 — Referral system.
--
-- Each user gets an opt-in referral code (lazily generated). When an
-- applicant submits an `apply_requests` row with a valid `referral_code`,
-- and that apply is approved (creating a `users` row), a `referrals` row
-- is created linking referrer → referee.
--
-- Earnings (% of referee's confirmed payments) are computed on-demand in
-- the `referral_repo::stats_for_referrer` query — no materialized state to
-- keep in sync.
--
-- New columns added via add_column_if_not_exists (see lib.rs):
--   users.referral_code        TEXT — own code, e.g. "OFX-A1B2C3"
--   apply_requests.referral_code TEXT — code captured at /apply submission

CREATE TABLE IF NOT EXISTS referrals (
    id                  TEXT PRIMARY KEY,
    referrer_user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referee_user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at          INTEGER NOT NULL,
    UNIQUE(referee_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer
    ON referrals(referrer_user_id);

-- One-time UNIQUE partial index on users.referral_code (NULLs allowed).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code
    ON users(referral_code)
    WHERE referral_code IS NOT NULL;
