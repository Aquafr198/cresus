use tokio_rusqlite::Connection;
use crate::models::User;
use crate::DbError;

pub struct UserRepo;

impl UserRepo {
    pub async fn create(
        conn: &Connection,
        id: &str,
        email: &str,
        telegram: Option<&str>,
        created_from_apply_id: Option<&str>,
    ) -> Result<User, DbError> {
        let id = id.to_string();
        let email = email.to_string();
        let telegram = telegram.map(|s| s.to_string());
        let created_from_apply_id = created_from_apply_id.map(|s| s.to_string());
        let row = conn
            .call(move |c| {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64;
                c.execute(
                    "INSERT INTO users (id, telegram, email, status, created_at, created_from_apply_id)
                     VALUES (?1, ?2, ?3, 'active', ?4, ?5)",
                    rusqlite::params![id, telegram, email, now, created_from_apply_id],
                )?;
                Ok(User {
                    id,
                    telegram,
                    email,
                    status: "active".to_string(),
                    created_at: now,
                    created_from_apply_id,
                    notes: None,
                    referral_code: None,
                })
            })
            .await?;
        Ok(row)
    }

    pub async fn find_by_email(
        conn: &Connection,
        email: &str,
    ) -> Result<Option<User>, DbError> {
        let email = email.to_string();
        let result = conn
            .call(move |c| {
                let row = c
                    .query_row(
                        "SELECT id, telegram, email, status, created_at, created_from_apply_id, notes, referral_code
                         FROM users WHERE email = ?1",
                        rusqlite::params![email],
                        |r| {
                            Ok(User {
                                id: r.get(0)?,
                                telegram: r.get(1)?,
                                email: r.get(2)?,
                                status: r.get(3)?,
                                created_at: r.get(4)?,
                                created_from_apply_id: r.get(5)?,
                                notes: r.get(6)?,
                                referral_code: r.get(7)?,
                            })
                        },
                    )
                    .ok();
                Ok(row)
            })
            .await?;
        Ok(result)
    }

    pub async fn find_by_id(conn: &Connection, id: &str) -> Result<Option<User>, DbError> {
        let id = id.to_string();
        let result = conn
            .call(move |c| {
                let row = c
                    .query_row(
                        "SELECT id, telegram, email, status, created_at, created_from_apply_id, notes, referral_code
                         FROM users WHERE id = ?1",
                        rusqlite::params![id],
                        |r| {
                            Ok(User {
                                id: r.get(0)?,
                                telegram: r.get(1)?,
                                email: r.get(2)?,
                                status: r.get(3)?,
                                created_at: r.get(4)?,
                                created_from_apply_id: r.get(5)?,
                                notes: r.get(6)?,
                                referral_code: r.get(7)?,
                            })
                        },
                    )
                    .ok();
                Ok(row)
            })
            .await?;
        Ok(result)
    }

    pub async fn list_paginated(
        conn: &Connection,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<User>, DbError> {
        let result = conn
            .call(move |c| {
                let mut stmt = c.prepare(
                    "SELECT id, telegram, email, status, created_at, created_from_apply_id, notes, referral_code
                     FROM users
                     ORDER BY created_at DESC
                     LIMIT ?1 OFFSET ?2",
                )?;
                let rows = stmt
                    .query_map(rusqlite::params![limit, offset], |r| {
                        Ok(User {
                            id: r.get(0)?,
                            telegram: r.get(1)?,
                            email: r.get(2)?,
                            status: r.get(3)?,
                            created_at: r.get(4)?,
                            created_from_apply_id: r.get(5)?,
                            notes: r.get(6)?,
                            referral_code: r.get(7)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await?;
        Ok(result)
    }

    pub async fn set_status(
        conn: &Connection,
        id: &str,
        status: &str,
    ) -> Result<(), DbError> {
        let id = id.to_string();
        let status = status.to_string();
        conn.call(move |c| {
            c.execute(
                "UPDATE users SET status = ?1 WHERE id = ?2",
                rusqlite::params![status, id],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    pub async fn set_notes(
        conn: &Connection,
        id: &str,
        notes: &str,
    ) -> Result<(), DbError> {
        let id = id.to_string();
        // Trim + cap at 2000 chars (defensive — handler validates upstream too)
        let notes = notes.trim().chars().take(2000).collect::<String>();
        conn.call(move |c| {
            c.execute(
                "UPDATE users SET notes = ?1 WHERE id = ?2",
                rusqlite::params![if notes.is_empty() { None } else { Some(&notes) }, id],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    /// Paginated search by email or telegram LIKE substring, with optional status filter.
    /// `q` is matched against email AND telegram with `LIKE '%q%'` (case-insensitive).
    pub async fn search_paginated(
        conn: &Connection,
        q: Option<&str>,
        status: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<User>, DbError> {
        let q = q.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let status = status.map(|s| s.to_string()).filter(|s| !s.is_empty() && s != "all");
        let result = conn
            .call(move |c| {
                // Build dynamic SQL — explicit branches to keep prepare cacheable.
                let (sql, params): (String, Vec<Box<dyn rusqlite::ToSql>>) = match (&q, &status) {
                    (Some(qq), Some(s)) => (
                        "SELECT id, telegram, email, status, created_at, created_from_apply_id, notes, referral_code
                         FROM users
                         WHERE (LOWER(email) LIKE LOWER(?1) OR LOWER(COALESCE(telegram,'')) LIKE LOWER(?1))
                           AND status = ?2
                         ORDER BY created_at DESC LIMIT ?3 OFFSET ?4".into(),
                        vec![
                            Box::new(format!("%{qq}%")),
                            Box::new(s.clone()),
                            Box::new(limit),
                            Box::new(offset),
                        ],
                    ),
                    (Some(qq), None) => (
                        "SELECT id, telegram, email, status, created_at, created_from_apply_id, notes, referral_code
                         FROM users
                         WHERE LOWER(email) LIKE LOWER(?1) OR LOWER(COALESCE(telegram,'')) LIKE LOWER(?1)
                         ORDER BY created_at DESC LIMIT ?2 OFFSET ?3".into(),
                        vec![
                            Box::new(format!("%{qq}%")),
                            Box::new(limit),
                            Box::new(offset),
                        ],
                    ),
                    (None, Some(s)) => (
                        "SELECT id, telegram, email, status, created_at, created_from_apply_id, notes, referral_code
                         FROM users WHERE status = ?1
                         ORDER BY created_at DESC LIMIT ?2 OFFSET ?3".into(),
                        vec![Box::new(s.clone()), Box::new(limit), Box::new(offset)],
                    ),
                    (None, None) => (
                        "SELECT id, telegram, email, status, created_at, created_from_apply_id, notes, referral_code
                         FROM users
                         ORDER BY created_at DESC LIMIT ?1 OFFSET ?2".into(),
                        vec![Box::new(limit), Box::new(offset)],
                    ),
                };
                let mut stmt = c.prepare(&sql)?;
                let rows = stmt
                    .query_map(rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())), |r| {
                        Ok(User {
                            id: r.get(0)?,
                            telegram: r.get(1)?,
                            email: r.get(2)?,
                            status: r.get(3)?,
                            created_at: r.get(4)?,
                            created_from_apply_id: r.get(5)?,
                            notes: r.get(6)?,
                            referral_code: r.get(7)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await?;
        Ok(result)
    }

    pub async fn count_by_status(conn: &Connection, status: &str) -> Result<i64, DbError> {
        let status = status.to_string();
        let n = conn
            .call(move |c| {
                let n: i64 = c.query_row(
                    "SELECT COUNT(*) FROM users WHERE status = ?1",
                    rusqlite::params![status],
                    |r| r.get(0),
                )?;
                Ok(n)
            })
            .await?;
        Ok(n)
    }

    /// Set the user's referral code. Fails with DbError on UNIQUE collision —
    /// caller should retry with a fresh code.
    pub async fn set_referral_code(
        conn: &Connection,
        id: &str,
        code: &str,
    ) -> Result<(), DbError> {
        let id = id.to_string();
        let code = code.to_string();
        conn.call(move |c| {
            c.execute(
                "UPDATE users SET referral_code = ?1 WHERE id = ?2 AND referral_code IS NULL",
                rusqlite::params![code, id],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    pub async fn find_by_referral_code(
        conn: &Connection,
        code: &str,
    ) -> Result<Option<User>, DbError> {
        let code = code.to_string();
        let result = conn
            .call(move |c| {
                let row = c
                    .query_row(
                        "SELECT id, telegram, email, status, created_at, created_from_apply_id, notes, referral_code
                         FROM users WHERE referral_code = ?1",
                        rusqlite::params![code],
                        |r| {
                            Ok(User {
                                id: r.get(0)?,
                                telegram: r.get(1)?,
                                email: r.get(2)?,
                                status: r.get(3)?,
                                created_at: r.get(4)?,
                                created_from_apply_id: r.get(5)?,
                                notes: r.get(6)?,
                                referral_code: r.get(7)?,
                            })
                        },
                    )
                    .ok();
                Ok(row)
            })
            .await?;
        Ok(result)
    }

    pub async fn count_active(conn: &Connection) -> Result<i64, DbError> {
        let n = conn
            .call(|c| {
                let n: i64 = c.query_row(
                    "SELECT COUNT(*) FROM users WHERE status = 'active'",
                    [],
                    |r| r.get(0),
                )?;
                Ok(n)
            })
            .await?;
        Ok(n)
    }
}
