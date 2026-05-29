-- Audit P2 PERF-3 + PERF-5 — composite indexes for hot-path queries.
--
-- Without these, two queries cause full-table scans at scale:
--
-- 1) `referral_repo::stats_for_referrer` (Phase 6.5) sums confirmed payments
--    across all referees: `SELECT SUM(amount_usd_cents) FROM payments
--    WHERE user_id = ? AND status = 'confirmed'`. At 10K payments, this is
--    a ~10K-row scan per referral stats request.
--
-- 2) `SubscriptionRepo::find_latest_by_user` is `SELECT … ORDER BY created_at
--    DESC LIMIT 1` on a user's subscription history. Without an index on
--    (user_id, created_at), the engine must sort the user's full sub history
--    on every call (cheap today, but used on every /user/me + /user/billing/*).
--
-- Both indexes are idempotent (IF NOT EXISTS) so re-running migrations on a
-- legacy DB is safe. Verified by the `migrations_are_idempotent` test.

-- PERF-3 — payments(user_id, status='confirmed') partial index.
-- Partial because referral earnings + billing list only ever filter on
-- confirmed; non-confirmed rows are short-lived and don't benefit.
CREATE INDEX IF NOT EXISTS idx_payments_user_confirmed
    ON payments(user_id)
    WHERE status = 'confirmed';

-- PERF-5 — subscriptions(user_id, created_at DESC).
-- SQLite reads indexes in either direction; DESC in the index hint helps with
-- query planning but is not strictly required.
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_created
    ON subscriptions(user_id, created_at);
