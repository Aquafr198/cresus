use tokio_rusqlite::Connection;
use crate::models::Subscription;
use crate::DbError;

pub struct SubscriptionRepo;

impl SubscriptionRepo {
    pub async fn find_active_by_user(
        conn: &Connection,
        user_id: &str,
    ) -> Result<Option<Subscription>, DbError> {
        let user_id = user_id.to_string();
        let result = conn
            .call(move |c| {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64;
                let row = c
                    .query_row(
                        "SELECT id, user_id, plan_id, status, started_at, expires_at,
                                current_payment_id, created_at, updated_at
                         FROM subscriptions
                         WHERE user_id = ?1 AND status = 'active' AND expires_at IS NOT NULL AND expires_at > ?2
                         ORDER BY expires_at DESC LIMIT 1",
                        rusqlite::params![user_id, now],
                        |r| {
                            Ok(Subscription {
                                id: r.get(0)?,
                                user_id: r.get(1)?,
                                plan_id: r.get(2)?,
                                status: r.get(3)?,
                                started_at: r.get(4)?,
                                expires_at: r.get(5)?,
                                current_payment_id: r.get(6)?,
                                created_at: r.get(7)?,
                                updated_at: r.get(8)?,
                            })
                        },
                    )
                    .ok();
                Ok(row)
            })
            .await?;
        Ok(result)
    }

    pub async fn find_latest_by_user(
        conn: &Connection,
        user_id: &str,
    ) -> Result<Option<Subscription>, DbError> {
        let user_id = user_id.to_string();
        let result = conn
            .call(move |c| {
                let row = c
                    .query_row(
                        "SELECT id, user_id, plan_id, status, started_at, expires_at,
                                current_payment_id, created_at, updated_at
                         FROM subscriptions
                         WHERE user_id = ?1
                         ORDER BY created_at DESC LIMIT 1",
                        rusqlite::params![user_id],
                        |r| {
                            Ok(Subscription {
                                id: r.get(0)?,
                                user_id: r.get(1)?,
                                plan_id: r.get(2)?,
                                status: r.get(3)?,
                                started_at: r.get(4)?,
                                expires_at: r.get(5)?,
                                current_payment_id: r.get(6)?,
                                created_at: r.get(7)?,
                                updated_at: r.get(8)?,
                            })
                        },
                    )
                    .ok();
                Ok(row)
            })
            .await?;
        Ok(result)
    }

    pub async fn upsert_active(
        conn: &Connection,
        id: &str,
        user_id: &str,
        plan_id: &str,
        duration_secs: i64,
        payment_id: &str,
    ) -> Result<Subscription, DbError> {
        let id = id.to_string();
        let user_id = user_id.to_string();
        let plan_id = plan_id.to_string();
        let payment_id = payment_id.to_string();
        let row = conn
            .call(move |c| {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64;

                // Try to find an existing active sub (any status, not expired or pending).
                let existing: Option<(String, Option<i64>)> = c
                    .query_row(
                        "SELECT id, expires_at FROM subscriptions
                         WHERE user_id = ?1 AND status IN ('active','pending')
                         ORDER BY created_at DESC LIMIT 1",
                        rusqlite::params![user_id],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .ok();

                let (sub_id, started_at, expires_at) = match existing {
                    Some((existing_id, existing_exp)) => {
                        // Extend from the later of (now, existing_exp)
                        let base = std::cmp::max(now, existing_exp.unwrap_or(now));
                        let new_exp = base + duration_secs;
                        c.execute(
                            "UPDATE subscriptions
                             SET plan_id = ?1, status = 'active',
                                 started_at = COALESCE(started_at, ?2),
                                 expires_at = ?3,
                                 current_payment_id = ?4,
                                 updated_at = ?5
                             WHERE id = ?6",
                            rusqlite::params![plan_id, now, new_exp, payment_id, now, existing_id],
                        )?;
                        (existing_id, now, new_exp)
                    }
                    None => {
                        let new_exp = now + duration_secs;
                        c.execute(
                            "INSERT INTO subscriptions
                             (id, user_id, plan_id, status, started_at, expires_at, current_payment_id, created_at, updated_at)
                             VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?6, ?7, ?8)",
                            rusqlite::params![id, user_id, plan_id, now, new_exp, payment_id, now, now],
                        )?;
                        (id, now, new_exp)
                    }
                };

                Ok(Subscription {
                    id: sub_id,
                    user_id,
                    plan_id,
                    status: "active".to_string(),
                    started_at: Some(started_at),
                    expires_at: Some(expires_at),
                    current_payment_id: Some(payment_id),
                    created_at: now,
                    updated_at: now,
                })
            })
            .await?;
        Ok(row)
    }

    pub async fn set_status(
        conn: &Connection,
        id: &str,
        status: &str,
    ) -> Result<(), DbError> {
        let id = id.to_string();
        let status = status.to_string();
        conn.call(move |c| {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            c.execute(
                "UPDATE subscriptions SET status = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![status, now, id],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    pub async fn list_by_user(
        conn: &Connection,
        user_id: &str,
    ) -> Result<Vec<Subscription>, DbError> {
        let user_id = user_id.to_string();
        let result = conn
            .call(move |c| {
                let mut stmt = c.prepare(
                    "SELECT id, user_id, plan_id, status, started_at, expires_at,
                            current_payment_id, created_at, updated_at
                     FROM subscriptions
                     WHERE user_id = ?1
                     ORDER BY created_at DESC",
                )?;
                let rows = stmt
                    .query_map(rusqlite::params![user_id], |r| {
                        Ok(Subscription {
                            id: r.get(0)?,
                            user_id: r.get(1)?,
                            plan_id: r.get(2)?,
                            status: r.get(3)?,
                            started_at: r.get(4)?,
                            expires_at: r.get(5)?,
                            current_payment_id: r.get(6)?,
                            created_at: r.get(7)?,
                            updated_at: r.get(8)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await?;
        Ok(result)
    }

    pub async fn count_active(conn: &Connection) -> Result<i64, DbError> {
        let n = conn
            .call(|c| {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64;
                let n: i64 = c.query_row(
                    "SELECT COUNT(*) FROM subscriptions
                     WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at > ?1",
                    rusqlite::params![now],
                    |r| r.get(0),
                )?;
                Ok(n)
            })
            .await?;
        Ok(n)
    }

    pub async fn sum_active_mrr_cents(conn: &Connection) -> Result<i64, DbError> {
        // MRR = sum of (price_usd_cents * 30 / duration_days) for active subscriptions.
        let n = conn
            .call(|c| {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64;
                let n: i64 = c.query_row(
                    "SELECT COALESCE(SUM((p.price_usd_cents * 30) / p.duration_days), 0)
                     FROM subscriptions s
                     JOIN plans p ON p.id = s.plan_id
                     WHERE s.status = 'active' AND s.expires_at > ?1",
                    rusqlite::params![now],
                    |r| r.get(0),
                )?;
                Ok(n)
            })
            .await?;
        Ok(n)
    }
}
