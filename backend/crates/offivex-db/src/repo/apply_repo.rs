use tokio_rusqlite::Connection;
use crate::models::ApplyRequest;
use crate::DbError;

pub struct ApplyRepo;

#[allow(clippy::too_many_arguments)]
impl ApplyRepo {
    pub async fn insert(
        conn: &Connection,
        id: &str,
        telegram: &str,
        email: &str,
        project: &str,
        plan_pref: Option<&str>,
        ip: Option<&str>,
        referral_code: Option<&str>,
    ) -> Result<ApplyRequest, DbError> {
        let id = id.to_string();
        let telegram = telegram.to_string();
        let email = email.to_string();
        let project = project.to_string();
        let plan_pref = plan_pref.map(|s| s.to_string());
        let ip = ip.map(|s| s.to_string());
        let referral_code = referral_code.map(|s| s.to_string());
        let row = conn
            .call(move |c| {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64;
                c.execute(
                    "INSERT INTO apply_requests
                     (id, telegram, email, project, plan_pref, status, submitted_at, ip, referral_code)
                     VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?7, ?8)",
                    rusqlite::params![id, telegram, email, project, plan_pref, now, ip, referral_code],
                )?;
                Ok(ApplyRequest {
                    id,
                    telegram,
                    email,
                    project,
                    plan_pref,
                    status: "pending".to_string(),
                    submitted_at: now,
                    decided_at: None,
                    decided_by_admin_id: None,
                    user_id_after_approval: None,
                    ip,
                    notes: None,
                    referral_code,
                })
            })
            .await?;
        Ok(row)
    }

    pub async fn list_paginated(
        conn: &Connection,
        status_filter: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ApplyRequest>, DbError> {
        let status_filter = status_filter.map(|s| s.to_string());
        let result = conn
            .call(move |c| {
                let (sql, params): (&'static str, Vec<Box<dyn rusqlite::ToSql>>) = match status_filter
                {
                    Some(s) => (
                        "SELECT id, telegram, email, project, plan_pref, status,
                                submitted_at, decided_at, decided_by_admin_id,
                                user_id_after_approval, ip, notes, referral_code
                         FROM apply_requests
                         WHERE status = ?1
                         ORDER BY submitted_at DESC
                         LIMIT ?2 OFFSET ?3",
                        vec![Box::new(s), Box::new(limit), Box::new(offset)],
                    ),
                    None => (
                        "SELECT id, telegram, email, project, plan_pref, status,
                                submitted_at, decided_at, decided_by_admin_id,
                                user_id_after_approval, ip, notes, referral_code
                         FROM apply_requests
                         ORDER BY submitted_at DESC
                         LIMIT ?1 OFFSET ?2",
                        vec![Box::new(limit), Box::new(offset)],
                    ),
                };
                let mut stmt = c.prepare(sql)?;
                let rows = stmt
                    .query_map(rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())), |r| {
                        Ok(ApplyRequest {
                            id: r.get(0)?,
                            telegram: r.get(1)?,
                            email: r.get(2)?,
                            project: r.get(3)?,
                            plan_pref: r.get(4)?,
                            status: r.get(5)?,
                            submitted_at: r.get(6)?,
                            decided_at: r.get(7)?,
                            decided_by_admin_id: r.get(8)?,
                            user_id_after_approval: r.get(9)?,
                            ip: r.get(10)?,
                            notes: r.get(11)?,
                            referral_code: r.get(12)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await?;
        Ok(result)
    }

    pub async fn get_by_id(
        conn: &Connection,
        id: &str,
    ) -> Result<Option<ApplyRequest>, DbError> {
        let id = id.to_string();
        let result = conn
            .call(move |c| {
                let row = c
                    .query_row(
                        "SELECT id, telegram, email, project, plan_pref, status,
                                submitted_at, decided_at, decided_by_admin_id,
                                user_id_after_approval, ip, notes, referral_code
                         FROM apply_requests WHERE id = ?1",
                        rusqlite::params![id],
                        |r| {
                            Ok(ApplyRequest {
                                id: r.get(0)?,
                                telegram: r.get(1)?,
                                email: r.get(2)?,
                                project: r.get(3)?,
                                plan_pref: r.get(4)?,
                                status: r.get(5)?,
                                submitted_at: r.get(6)?,
                                decided_at: r.get(7)?,
                                decided_by_admin_id: r.get(8)?,
                                user_id_after_approval: r.get(9)?,
                                ip: r.get(10)?,
                                notes: r.get(11)?,
                                referral_code: r.get(12)?,
                            })
                        },
                    )
                    .ok();
                Ok(row)
            })
            .await?;
        Ok(result)
    }

    pub async fn mark_approved(
        conn: &Connection,
        id: &str,
        admin_id: &str,
        user_id: &str,
    ) -> Result<(), DbError> {
        let id = id.to_string();
        let admin_id = admin_id.to_string();
        let user_id = user_id.to_string();
        conn.call(move |c| {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            c.execute(
                "UPDATE apply_requests
                 SET status = 'approved',
                     decided_at = ?1,
                     decided_by_admin_id = ?2,
                     user_id_after_approval = ?3
                 WHERE id = ?4 AND status = 'pending'",
                rusqlite::params![now, admin_id, user_id, id],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    pub async fn mark_rejected(
        conn: &Connection,
        id: &str,
        admin_id: &str,
        notes: Option<&str>,
    ) -> Result<(), DbError> {
        let id = id.to_string();
        let admin_id = admin_id.to_string();
        let notes = notes.map(|s| s.to_string());
        conn.call(move |c| {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            c.execute(
                "UPDATE apply_requests
                 SET status = 'rejected',
                     decided_at = ?1,
                     decided_by_admin_id = ?2,
                     notes = ?3
                 WHERE id = ?4 AND status = 'pending'",
                rusqlite::params![now, admin_id, notes, id],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    pub async fn count_pending(conn: &Connection) -> Result<i64, DbError> {
        let n = conn
            .call(|c| {
                let n: i64 = c.query_row(
                    "SELECT COUNT(*) FROM apply_requests WHERE status = 'pending'",
                    [],
                    |r| r.get(0),
                )?;
                Ok(n)
            })
            .await?;
        Ok(n)
    }
}
