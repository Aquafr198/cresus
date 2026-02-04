use tokio_rusqlite::Connection;
use crate::models::DeadLetterTransaction;
use crate::DbError;

pub struct DlqRepo;

impl DlqRepo {
    pub async fn insert(conn: &Connection, entry: DeadLetterTransaction) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "INSERT INTO dead_letter_transactions
                 (id, source, source_id, wallet_id, tx_type, payload_json,
                  error_message, error_category, retry_count, max_retries,
                  last_attempt_at, next_retry_at, resolved_at, tx_signature, status, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
                rusqlite::params![
                    entry.id, entry.source, entry.source_id, entry.wallet_id,
                    entry.tx_type, entry.payload_json, entry.error_message,
                    entry.error_category, entry.retry_count, entry.max_retries,
                    entry.last_attempt_at, entry.next_retry_at, entry.resolved_at,
                    entry.tx_signature, entry.status, entry.created_at,
                ],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }

    pub async fn list_pending(conn: &Connection) -> Result<Vec<DeadLetterTransaction>, DbError> {
        let result = conn.call(|c| {
            let mut stmt = c.prepare(
                "SELECT id, source, source_id, wallet_id, tx_type, payload_json,
                        error_message, error_category, retry_count, max_retries,
                        last_attempt_at, next_retry_at, resolved_at, tx_signature, status, created_at
                 FROM dead_letter_transactions
                 WHERE status = 'pending'
                 ORDER BY created_at ASC"
            )?;
            let rows = stmt.query_map([], Self::map_row)?.collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        }).await?;
        Ok(result)
    }

    pub async fn list_all(conn: &Connection, limit: i64) -> Result<Vec<DeadLetterTransaction>, DbError> {
        let result = conn.call(move |c| {
            let mut stmt = c.prepare(
                "SELECT id, source, source_id, wallet_id, tx_type, payload_json,
                        error_message, error_category, retry_count, max_retries,
                        last_attempt_at, next_retry_at, resolved_at, tx_signature, status, created_at
                 FROM dead_letter_transactions
                 ORDER BY created_at DESC
                 LIMIT ?1"
            )?;
            let rows = stmt.query_map([limit], Self::map_row)?.collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        }).await?;
        Ok(result)
    }

    pub async fn get_by_id(conn: &Connection, id: String) -> Result<Option<DeadLetterTransaction>, DbError> {
        let result = conn.call(move |c| {
            let r = c.query_row(
                "SELECT id, source, source_id, wallet_id, tx_type, payload_json,
                        error_message, error_category, retry_count, max_retries,
                        last_attempt_at, next_retry_at, resolved_at, tx_signature, status, created_at
                 FROM dead_letter_transactions WHERE id = ?1",
                rusqlite::params![id],
                Self::map_row,
            );
            match r {
                Ok(v) => Ok(Some(v)),
                Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(tokio_rusqlite::Error::Rusqlite(e)),
            }
        }).await?;
        Ok(result)
    }

    pub async fn update_status(
        conn: &Connection,
        id: String,
        status: String,
        tx_signature: Option<String>,
        resolved_at: Option<i64>,
    ) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "UPDATE dead_letter_transactions SET status = ?1, tx_signature = ?2, resolved_at = ?3 WHERE id = ?4",
                rusqlite::params![status, tx_signature, resolved_at, id],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }

    pub async fn increment_retry(
        conn: &Connection,
        id: String,
        error_message: String,
        next_retry_at: Option<i64>,
        new_status: String,
    ) -> Result<(), DbError> {
        let now = chrono::Utc::now().timestamp();
        conn.call(move |c| {
            c.execute(
                "UPDATE dead_letter_transactions
                 SET retry_count = retry_count + 1,
                     error_message = ?1,
                     last_attempt_at = ?2,
                     next_retry_at = ?3,
                     status = ?4
                 WHERE id = ?5",
                rusqlite::params![error_message, now, next_retry_at, new_status, id],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }

    pub async fn count_by_status(conn: &Connection) -> Result<Vec<(String, i64)>, DbError> {
        let result = conn.call(|c| {
            let mut stmt = c.prepare(
                "SELECT status, COUNT(*) FROM dead_letter_transactions GROUP BY status"
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })?.collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        }).await?;
        Ok(result)
    }

    pub async fn dismiss(conn: &Connection, id: String) -> Result<bool, DbError> {
        let now = chrono::Utc::now().timestamp();
        let count = conn.call(move |c| {
            let changed = c.execute(
                "UPDATE dead_letter_transactions SET status = 'dismissed', resolved_at = ?1 WHERE id = ?2 AND status IN ('pending', 'exhausted')",
                rusqlite::params![now, id],
            )?;
            Ok(changed)
        }).await?;
        Ok(count > 0)
    }

    fn map_row(row: &rusqlite::Row<'_>) -> Result<DeadLetterTransaction, rusqlite::Error> {
        Ok(DeadLetterTransaction {
            id: row.get(0)?,
            source: row.get(1)?,
            source_id: row.get(2)?,
            wallet_id: row.get(3)?,
            tx_type: row.get(4)?,
            payload_json: row.get(5)?,
            error_message: row.get(6)?,
            error_category: row.get(7)?,
            retry_count: row.get(8)?,
            max_retries: row.get(9)?,
            last_attempt_at: row.get(10)?,
            next_retry_at: row.get(11)?,
            resolved_at: row.get(12)?,
            tx_signature: row.get(13)?,
            status: row.get(14)?,
            created_at: row.get(15)?,
        })
    }
}
