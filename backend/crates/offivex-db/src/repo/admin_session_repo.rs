use tokio_rusqlite::Connection;
use crate::models::AdminSession;
use crate::DbError;

pub struct AdminSessionRepo;

impl AdminSessionRepo {
    pub async fn create(
        conn: &Connection,
        id: &str,
        admin_id: &str,
        token_hash: &str,
        ttl_secs: i64,
    ) -> Result<AdminSession, DbError> {
        let id = id.to_string();
        let admin_id = admin_id.to_string();
        let token_hash = token_hash.to_string();
        let row = conn
            .call(move |c| {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64;
                let expires_at = now + ttl_secs;
                c.execute(
                    "INSERT INTO admin_sessions (id, admin_id, token_hash, created_at, expires_at, last_seen_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    rusqlite::params![id, admin_id, token_hash, now, expires_at, now],
                )?;
                Ok(AdminSession {
                    id,
                    admin_id,
                    token_hash,
                    created_at: now,
                    expires_at,
                    last_seen_at: now,
                })
            })
            .await?;
        Ok(row)
    }

    pub async fn find_by_token_hash(
        conn: &Connection,
        token_hash: &str,
    ) -> Result<Option<AdminSession>, DbError> {
        let token_hash = token_hash.to_string();
        let result = conn
            .call(move |c| {
                let row = c
                    .query_row(
                        "SELECT id, admin_id, token_hash, created_at, expires_at, last_seen_at
                         FROM admin_sessions WHERE token_hash = ?1",
                        rusqlite::params![token_hash],
                        |r| {
                            Ok(AdminSession {
                                id: r.get(0)?,
                                admin_id: r.get(1)?,
                                token_hash: r.get(2)?,
                                created_at: r.get(3)?,
                                expires_at: r.get(4)?,
                                last_seen_at: r.get(5)?,
                            })
                        },
                    )
                    .ok();
                Ok(row)
            })
            .await?;
        Ok(result)
    }

    /// Sliding-window refresh: updates last_seen_at and bumps expires_at by ttl_secs.
    pub async fn touch(
        conn: &Connection,
        token_hash: &str,
        ttl_secs: i64,
    ) -> Result<(), DbError> {
        let token_hash = token_hash.to_string();
        conn.call(move |c| {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            let new_exp = now + ttl_secs;
            c.execute(
                "UPDATE admin_sessions
                 SET last_seen_at = ?1, expires_at = ?2
                 WHERE token_hash = ?3",
                rusqlite::params![now, new_exp, token_hash],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    pub async fn delete_by_token_hash(
        conn: &Connection,
        token_hash: &str,
    ) -> Result<(), DbError> {
        let token_hash = token_hash.to_string();
        conn.call(move |c| {
            c.execute(
                "DELETE FROM admin_sessions WHERE token_hash = ?1",
                rusqlite::params![token_hash],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    pub async fn delete_expired(conn: &Connection) -> Result<usize, DbError> {
        let n = conn
            .call(|c| {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64;
                let n = c.execute(
                    "DELETE FROM admin_sessions WHERE expires_at < ?1",
                    rusqlite::params![now],
                )?;
                Ok(n)
            })
            .await?;
        Ok(n)
    }
}
