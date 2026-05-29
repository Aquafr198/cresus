//! Referral system repository (Phase 6.5).
//!
//! Links referrers → referees via the `referrals` table. Earnings are computed
//! on-demand by joining referrals → users → subscriptions/payments, so there is
//! no materialized earnings state to keep in sync.

use tokio_rusqlite::Connection;

use crate::models::Referral;
use crate::DbError;

pub struct ReferralRepo;

/// Aggregate stats for one referrer.
#[derive(Debug, Clone)]
pub struct ReferralStats {
    pub total_referees: i64,
    pub active_referees: i64,
    pub total_earnings_cents: i64,
}

/// Per-referee row returned by `list_by_referrer`.
#[derive(Debug, Clone)]
pub struct ReferralListItem {
    pub referee_user_id: String,
    pub joined_at: i64,
    pub plan_slug: Option<String>,
    pub subscription_status: Option<String>,
    pub earnings_cents: i64,
}

impl ReferralRepo {
    /// Insert a referrer → referee link. Returns Err on UNIQUE collision
    /// (one referee can only be referred once).
    pub async fn insert(
        conn: &Connection,
        id: &str,
        referrer_user_id: &str,
        referee_user_id: &str,
    ) -> Result<Referral, DbError> {
        let id = id.to_string();
        let referrer_user_id = referrer_user_id.to_string();
        let referee_user_id = referee_user_id.to_string();
        let row = conn
            .call(move |c| {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64;
                c.execute(
                    "INSERT INTO referrals (id, referrer_user_id, referee_user_id, created_at)
                     VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![id, referrer_user_id, referee_user_id, now],
                )?;
                Ok(Referral {
                    id,
                    referrer_user_id,
                    referee_user_id,
                    created_at: now,
                })
            })
            .await?;
        Ok(row)
    }

    /// Aggregate stats for `referrer_user_id`.
    /// Earnings = `earnings_bps / 10000` × sum of confirmed payments by referees.
    pub async fn stats_for_referrer(
        conn: &Connection,
        referrer_user_id: &str,
        earnings_bps: i64,
    ) -> Result<ReferralStats, DbError> {
        let referrer_user_id = referrer_user_id.to_string();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let stats = conn
            .call(move |c| {
                // Total referees count
                let total_referees: i64 = c.query_row(
                    "SELECT COUNT(*) FROM referrals WHERE referrer_user_id = ?1",
                    rusqlite::params![referrer_user_id],
                    |r| r.get(0),
                )?;

                // Active referees = those with status='active' subscription not expired
                let active_referees: i64 = c.query_row(
                    "SELECT COUNT(DISTINCT r.referee_user_id)
                     FROM referrals r
                     JOIN subscriptions s ON s.user_id = r.referee_user_id
                     WHERE r.referrer_user_id = ?1
                       AND s.status = 'active'
                       AND COALESCE(s.expires_at, 0) > ?2",
                    rusqlite::params![referrer_user_id, now],
                    |r| r.get(0),
                )?;

                // Sum of confirmed payments by all referees
                let total_paid_cents: i64 = c.query_row(
                    "SELECT COALESCE(SUM(p.amount_usd_cents), 0)
                     FROM referrals r
                     JOIN payments p ON p.user_id = r.referee_user_id
                     WHERE r.referrer_user_id = ?1
                       AND p.status = 'confirmed'",
                    rusqlite::params![referrer_user_id],
                    |r| r.get(0),
                )?;

                // earnings = total_paid * earnings_bps / 10000 (integer)
                let total_earnings_cents =
                    ((total_paid_cents as i128 * earnings_bps as i128) / 10_000) as i64;

                Ok(ReferralStats {
                    total_referees,
                    active_referees,
                    total_earnings_cents,
                })
            })
            .await?;
        Ok(stats)
    }

    /// List referees for `referrer_user_id` with their current subscription
    /// + per-referee earnings.
    ///
    /// Audit P2 PERF-1 — the original SQL had a correlated subquery
    /// `(SELECT id FROM subscriptions ... LIMIT 1)` evaluated **per referee row**,
    /// resulting in O(N) extra queries for N referees. The rewrite below uses a
    /// CTE with `ROW_NUMBER() OVER (PARTITION BY user_id ...)` (SQLite 3.25+) so
    /// the latest subscription per referee is computed in a single pass.
    ///
    /// Combined with migration 026's `idx_payments_user_confirmed` partial index,
    /// the payments SUM also avoids a full-table scan.
    pub async fn list_by_referrer(
        conn: &Connection,
        referrer_user_id: &str,
        earnings_bps: i64,
    ) -> Result<Vec<ReferralListItem>, DbError> {
        let referrer_user_id = referrer_user_id.to_string();
        let result = conn
            .call(move |c| {
                let mut stmt = c.prepare(
                    "WITH ref_users AS (
                        SELECT referee_user_id, created_at AS joined_at
                        FROM referrals
                        WHERE referrer_user_id = ?1
                    ),
                    latest_subs AS (
                        SELECT s.user_id, s.plan_id, s.status,
                               ROW_NUMBER() OVER (
                                   PARTITION BY s.user_id ORDER BY s.created_at DESC
                               ) AS rn
                        FROM subscriptions s
                        WHERE s.user_id IN (SELECT referee_user_id FROM ref_users)
                    )
                    SELECT
                        ru.referee_user_id,
                        ru.joined_at,
                        plan.slug AS plan_slug,
                        ls.status AS sub_status,
                        COALESCE((
                            SELECT SUM(p.amount_usd_cents)
                            FROM payments p
                            WHERE p.user_id = ru.referee_user_id
                              AND p.status = 'confirmed'
                        ), 0) AS total_confirmed_cents
                    FROM ref_users ru
                    LEFT JOIN latest_subs ls
                           ON ls.user_id = ru.referee_user_id AND ls.rn = 1
                    LEFT JOIN plans plan ON plan.id = ls.plan_id
                    ORDER BY ru.joined_at DESC",
                )?;
                let rows = stmt
                    .query_map(rusqlite::params![referrer_user_id], |r| {
                        let total_paid_cents: i64 = r.get(4)?;
                        let earnings_cents =
                            ((total_paid_cents as i128 * earnings_bps as i128) / 10_000) as i64;
                        Ok(ReferralListItem {
                            referee_user_id: r.get(0)?,
                            joined_at: r.get(1)?,
                            plan_slug: r.get(2)?,
                            subscription_status: r.get(3)?,
                            earnings_cents,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await?;
        Ok(result)
    }
}
