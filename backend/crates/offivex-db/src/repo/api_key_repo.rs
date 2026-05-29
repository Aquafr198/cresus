use tokio_rusqlite::Connection;
use crate::models::ApiKey;
use crate::DbError;

pub struct ApiKeyRepo;

impl ApiKeyRepo {
    pub async fn insert(
        conn: &Connection,
        id: &str,
        user_id: &str,
        key_hash: &str,
        key_prefix: &str,
    ) -> Result<ApiKey, DbError> {
        let id = id.to_string();
        let user_id = user_id.to_string();
        let key_hash = key_hash.to_string();
        let key_prefix = key_prefix.to_string();
        let row = conn
            .call(move |c| {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64;
                c.execute(
                    "INSERT INTO api_keys (id, user_id, key_hash, key_prefix, status, created_at)
                     VALUES (?1, ?2, ?3, ?4, 'active', ?5)",
                    rusqlite::params![id, user_id, key_hash, key_prefix, now],
                )?;
                Ok(ApiKey {
                    id,
                    user_id,
                    key_hash,
                    key_prefix,
                    status: "active".to_string(),
                    created_at: now,
                    last_used_at: None,
                    revoked_at: None,
                    revoked_by_admin_id: None,
                })
            })
            .await?;
        Ok(row)
    }

    /// Returns all active rows matching the prefix. Caller must argon2-verify each candidate.
    pub async fn find_active_by_prefix(
        conn: &Connection,
        key_prefix: &str,
    ) -> Result<Vec<ApiKey>, DbError> {
        let key_prefix = key_prefix.to_string();
        let result = conn
            .call(move |c| {
                let mut stmt = c.prepare(
                    "SELECT id, user_id, key_hash, key_prefix, status, created_at,
                            last_used_at, revoked_at, revoked_by_admin_id
                     FROM api_keys WHERE key_prefix = ?1 AND status = 'active'",
                )?;
                let rows = stmt
                    .query_map(rusqlite::params![key_prefix], |r| {
                        Ok(ApiKey {
                            id: r.get(0)?,
                            user_id: r.get(1)?,
                            key_hash: r.get(2)?,
                            key_prefix: r.get(3)?,
                            status: r.get(4)?,
                            created_at: r.get(5)?,
                            last_used_at: r.get(6)?,
                            revoked_at: r.get(7)?,
                            revoked_by_admin_id: r.get(8)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await?;
        Ok(result)
    }

    pub async fn find_active_by_user(
        conn: &Connection,
        user_id: &str,
    ) -> Result<Option<ApiKey>, DbError> {
        let user_id = user_id.to_string();
        let result = conn
            .call(move |c| {
                let row = c
                    .query_row(
                        "SELECT id, user_id, key_hash, key_prefix, status, created_at,
                                last_used_at, revoked_at, revoked_by_admin_id
                         FROM api_keys WHERE user_id = ?1 AND status = 'active'",
                        rusqlite::params![user_id],
                        |r| {
                            Ok(ApiKey {
                                id: r.get(0)?,
                                user_id: r.get(1)?,
                                key_hash: r.get(2)?,
                                key_prefix: r.get(3)?,
                                status: r.get(4)?,
                                created_at: r.get(5)?,
                                last_used_at: r.get(6)?,
                                revoked_at: r.get(7)?,
                                revoked_by_admin_id: r.get(8)?,
                            })
                        },
                    )
                    .ok();
                Ok(row)
            })
            .await?;
        Ok(result)
    }

    /// All keys (active + revoked) for a user, newest first.
    pub async fn list_by_user(
        conn: &Connection,
        user_id: &str,
    ) -> Result<Vec<ApiKey>, DbError> {
        let user_id = user_id.to_string();
        let result = conn
            .call(move |c| {
                let mut stmt = c.prepare(
                    "SELECT id, user_id, key_hash, key_prefix, status, created_at,
                            last_used_at, revoked_at, revoked_by_admin_id
                     FROM api_keys
                     WHERE user_id = ?1
                     ORDER BY created_at DESC",
                )?;
                let rows = stmt
                    .query_map(rusqlite::params![user_id], |r| {
                        Ok(ApiKey {
                            id: r.get(0)?,
                            user_id: r.get(1)?,
                            key_hash: r.get(2)?,
                            key_prefix: r.get(3)?,
                            status: r.get(4)?,
                            created_at: r.get(5)?,
                            last_used_at: r.get(6)?,
                            revoked_at: r.get(7)?,
                            revoked_by_admin_id: r.get(8)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await?;
        Ok(result)
    }

    pub async fn list_all(conn: &Connection) -> Result<Vec<ApiKey>, DbError> {
        let result = conn
            .call(|c| {
                let mut stmt = c.prepare(
                    "SELECT id, user_id, key_hash, key_prefix, status, created_at,
                            last_used_at, revoked_at, revoked_by_admin_id
                     FROM api_keys ORDER BY created_at DESC",
                )?;
                let rows = stmt
                    .query_map([], |r| {
                        Ok(ApiKey {
                            id: r.get(0)?,
                            user_id: r.get(1)?,
                            key_hash: r.get(2)?,
                            key_prefix: r.get(3)?,
                            status: r.get(4)?,
                            created_at: r.get(5)?,
                            last_used_at: r.get(6)?,
                            revoked_at: r.get(7)?,
                            revoked_by_admin_id: r.get(8)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await?;
        Ok(result)
    }

    pub async fn mark_used(conn: &Connection, id: &str) -> Result<(), DbError> {
        let id = id.to_string();
        conn.call(move |c| {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            c.execute(
                "UPDATE api_keys SET last_used_at = ?1 WHERE id = ?2",
                rusqlite::params![now, id],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    pub async fn revoke(
        conn: &Connection,
        id: &str,
        admin_id: Option<&str>,
    ) -> Result<(), DbError> {
        let id = id.to_string();
        let admin_id = admin_id.map(|s| s.to_string());
        conn.call(move |c| {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            c.execute(
                "UPDATE api_keys
                 SET status = 'revoked', revoked_at = ?1, revoked_by_admin_id = ?2
                 WHERE id = ?3 AND status = 'active'",
                rusqlite::params![now, admin_id, id],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    /// Atomic rotate: revoke current active key for user (if any), insert new one. Same TX.
    pub async fn rotate(
        conn: &Connection,
        user_id: &str,
        new_id: &str,
        new_hash: &str,
        new_prefix: &str,
    ) -> Result<ApiKey, DbError> {
        let user_id = user_id.to_string();
        let new_id = new_id.to_string();
        let new_hash = new_hash.to_string();
        let new_prefix = new_prefix.to_string();
        let row = conn
            .call(move |c| {
                let tx = c.unchecked_transaction()?;
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64;
                tx.execute(
                    "UPDATE api_keys SET status = 'revoked', revoked_at = ?1
                     WHERE user_id = ?2 AND status = 'active'",
                    rusqlite::params![now, user_id],
                )?;
                tx.execute(
                    "INSERT INTO api_keys (id, user_id, key_hash, key_prefix, status, created_at)
                     VALUES (?1, ?2, ?3, ?4, 'active', ?5)",
                    rusqlite::params![new_id, user_id, new_hash, new_prefix, now],
                )?;
                tx.commit()?;
                Ok(ApiKey {
                    id: new_id,
                    user_id,
                    key_hash: new_hash,
                    key_prefix: new_prefix,
                    status: "active".to_string(),
                    created_at: now,
                    last_used_at: None,
                    revoked_at: None,
                    revoked_by_admin_id: None,
                })
            })
            .await?;
        Ok(row)
    }
}
