use tokio_rusqlite::Connection;
use crate::models::AuditEntry;
use crate::DbError;

pub struct AuditRepo;

impl AuditRepo {
    /// Legacy wallet-flavored audit insert. Kept for backward compatibility.
    pub async fn insert(
        conn: &Connection,
        action: &str,
        detail: &str,
        wallet_id: Option<&str>,
        tx_signature: Option<&str>,
    ) -> Result<(), DbError> {
        Self::insert_full(conn, action, detail, wallet_id, tx_signature, None, None, None).await
    }

    /// Full audit insert with admin/user/ip context (Phase 1 user-mgmt).
    pub async fn insert_full(
        conn: &Connection,
        action: &str,
        detail: &str,
        wallet_id: Option<&str>,
        tx_signature: Option<&str>,
        admin_id: Option<&str>,
        user_id: Option<&str>,
        ip: Option<&str>,
    ) -> Result<(), DbError> {
        let action = action.to_string();
        let detail = detail.to_string();
        let wallet_id = wallet_id.map(|s| s.to_string());
        let tx_signature = tx_signature.map(|s| s.to_string());
        let admin_id = admin_id.map(|s| s.to_string());
        let user_id = user_id.map(|s| s.to_string());
        let ip = ip.map(|s| s.to_string());
        conn.call(move |c| {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            c.execute(
                "INSERT INTO audit_log (action, detail, wallet_id, tx_signature, created_at, admin_id, user_id, ip)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![action, detail, wallet_id, tx_signature, now, admin_id, user_id, ip],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    pub async fn list_by_user(
        conn: &Connection,
        user_id: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AuditEntry>, DbError> {
        let user_id = user_id.to_string();
        let result = conn
            .call(move |c| {
                let mut stmt = c.prepare(
                    "SELECT id, action, detail, wallet_id, tx_signature, created_at,
                            admin_id, user_id, ip
                     FROM audit_log
                     WHERE user_id = ?1
                     ORDER BY created_at DESC
                     LIMIT ?2 OFFSET ?3",
                )?;
                let rows = stmt
                    .query_map(rusqlite::params![user_id, limit, offset], |row| {
                        Ok(AuditEntry {
                            id: row.get(0)?,
                            action: row.get(1)?,
                            detail: row.get(2)?,
                            wallet_id: row.get(3)?,
                            tx_signature: row.get(4)?,
                            created_at: row.get(5)?,
                            admin_id: row.get(6)?,
                            user_id: row.get(7)?,
                            ip: row.get(8)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await?;
        Ok(result)
    }

    pub async fn list(
        conn: &Connection,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AuditEntry>, DbError> {
        let result = conn
            .call(move |c| {
                let mut stmt = c.prepare(
                    "SELECT id, action, detail, wallet_id, tx_signature, created_at, admin_id, user_id, ip
                     FROM audit_log
                     ORDER BY created_at DESC
                     LIMIT ?1 OFFSET ?2",
                )?;
                let rows = stmt
                    .query_map(rusqlite::params![limit, offset], |row| {
                        Ok(AuditEntry {
                            id: row.get(0)?,
                            action: row.get(1)?,
                            detail: row.get(2)?,
                            wallet_id: row.get(3)?,
                            tx_signature: row.get(4)?,
                            created_at: row.get(5)?,
                            admin_id: row.get(6)?,
                            user_id: row.get(7)?,
                            ip: row.get(8)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await?;
        Ok(result)
    }
}
