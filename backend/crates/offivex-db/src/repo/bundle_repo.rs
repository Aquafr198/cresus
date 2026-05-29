use tokio_rusqlite::Connection;
use crate::models::Bundle;
use crate::DbError;

pub struct BundleRepo;

impl BundleRepo {
    pub async fn create(conn: &Connection, bundle: Bundle) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "INSERT INTO bundles (id, token_id, config_json, status, jito_bundle_id, market_address, pool_address, tx_signatures, error_message, created_at, executed_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                rusqlite::params![
                    bundle.id, bundle.token_id, bundle.config_json, bundle.status,
                    bundle.jito_bundle_id, bundle.market_address, bundle.pool_address,
                    bundle.tx_signatures, bundle.error_message, bundle.created_at, bundle.executed_at,
                ],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }

    /// Hard cap to bound a single unpaginated list call. Bundles accumulate
    /// over time; an old dashboard tab would otherwise pull every launch
    /// ever fired by this install.
    const LIST_ALL_LIMIT: i64 = 1_000;

    pub async fn list_all(conn: &Connection) -> Result<Vec<Bundle>, DbError> {
        let bundles = conn.call(|c| {
            let mut stmt = c.prepare(
                "SELECT id, token_id, config_json, status, jito_bundle_id, market_address, pool_address, tx_signatures, error_message, created_at, executed_at
                 FROM bundles ORDER BY created_at DESC LIMIT ?1"
            )?;
            let rows = stmt.query_map(rusqlite::params![Self::LIST_ALL_LIMIT], |row| {
                Ok(Bundle {
                    id: row.get(0)?, token_id: row.get(1)?, config_json: row.get(2)?,
                    status: row.get(3)?, jito_bundle_id: row.get(4)?, market_address: row.get(5)?,
                    pool_address: row.get(6)?, tx_signatures: row.get(7)?, error_message: row.get(8)?,
                    created_at: row.get(9)?, executed_at: row.get(10)?,
                })
            })?;
            Ok(rows.collect::<Result<Vec<_>, _>>()?)
        }).await?;
        Ok(bundles)
    }

    pub async fn get_by_id(conn: &Connection, id: String) -> Result<Option<Bundle>, DbError> {
        let bundle = conn.call(move |c| {
            let mut stmt = c.prepare(
                "SELECT id, token_id, config_json, status, jito_bundle_id, market_address, pool_address, tx_signatures, error_message, created_at, executed_at
                 FROM bundles WHERE id = ?1"
            )?;
            let mut rows = stmt.query_map(rusqlite::params![id], |row| {
                Ok(Bundle {
                    id: row.get(0)?, token_id: row.get(1)?, config_json: row.get(2)?,
                    status: row.get(3)?, jito_bundle_id: row.get(4)?, market_address: row.get(5)?,
                    pool_address: row.get(6)?, tx_signatures: row.get(7)?, error_message: row.get(8)?,
                    created_at: row.get(9)?, executed_at: row.get(10)?,
                })
            })?;
            Ok(rows.next().transpose()?)
        }).await?;
        Ok(bundle)
    }

    pub async fn update_status(conn: &Connection, id: String, status: String, error_message: Option<String>) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "UPDATE bundles SET status = ?1, error_message = ?2 WHERE id = ?3",
                rusqlite::params![status, error_message, id],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }
}
