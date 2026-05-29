use tokio_rusqlite::Connection;

use crate::DbError;

/// One observation of the creator wallet's token balance for a given bundle,
/// used by the dev-sold detector to compute drops between ticks.
#[derive(Debug, Clone)]
pub struct CreatorSnapshot {
    pub bundle_id: String,
    pub snapshot_at: i64,
    /// u64 token balance serialized as TEXT to dodge SQLite's i64 range.
    pub balance_raw: String,
}

pub struct BundleSnapshotRepo;

impl BundleSnapshotRepo {
    pub async fn insert(
        conn: &Connection,
        bundle_id: String,
        snapshot_at: i64,
        balance_raw: u64,
    ) -> Result<(), DbError> {
        let balance_str = balance_raw.to_string();
        conn.call(move |c| {
            c.execute(
                "INSERT INTO bundle_creator_snapshots (bundle_id, snapshot_at, balance_raw)
                 VALUES (?1, ?2, ?3)",
                rusqlite::params![bundle_id, snapshot_at, balance_str],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    /// Return the latest snapshot for a bundle, or None if none exist yet.
    pub async fn latest(
        conn: &Connection,
        bundle_id: String,
    ) -> Result<Option<CreatorSnapshot>, DbError> {
        let row = conn
            .call(move |c| {
                let mut stmt = c.prepare(
                    "SELECT bundle_id, snapshot_at, balance_raw FROM bundle_creator_snapshots
                     WHERE bundle_id = ?1 ORDER BY snapshot_at DESC LIMIT 1",
                )?;
                Ok(stmt
                    .query_row(rusqlite::params![bundle_id], |row| {
                        Ok(CreatorSnapshot {
                            bundle_id: row.get(0)?,
                            snapshot_at: row.get(1)?,
                            balance_raw: row.get(2)?,
                        })
                    })
                    .ok())
            })
            .await?;
        Ok(row)
    }
}
