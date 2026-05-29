use tokio_rusqlite::Connection;
use crate::models::{Distribution, DistributionTransfer};
use crate::DbError;

/// Outcome of `DistributionRepo::claim_for_execution`. See that method for
/// semantics — used by the execute handler to translate the atomic claim
/// into the right HTTP status (Conflict / NotFound) without leaking
/// internal repo types.
pub enum DistributionClaim {
    Claimed(Distribution),
    NotFound,
    WrongStatus(String),
}

pub struct DistributionRepo;

impl DistributionRepo {
    pub async fn create(conn: &Connection, dist: Distribution) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "INSERT INTO distributions (id, source_wallet_id, strategy, status, total_sol, config_json, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    dist.id, dist.source_wallet_id, dist.strategy, dist.status,
                    dist.total_sol, dist.config_json, dist.created_at,
                ],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }

    pub async fn get_by_id(conn: &Connection, id: String) -> Result<Option<Distribution>, DbError> {
        let result = conn.call(move |c| {
            let r = c.query_row(
                "SELECT id, source_wallet_id, strategy, status, total_sol, config_json,
                        result_json, error_message, created_at, executed_at
                 FROM distributions WHERE id = ?1",
                rusqlite::params![id],
                |row| Ok(Distribution {
                    id: row.get(0)?,
                    source_wallet_id: row.get(1)?,
                    strategy: row.get(2)?,
                    status: row.get(3)?,
                    total_sol: row.get(4)?,
                    config_json: row.get(5)?,
                    result_json: row.get(6)?,
                    error_message: row.get(7)?,
                    created_at: row.get(8)?,
                    executed_at: row.get(9)?,
                }),
            );
            match r {
                Ok(v) => Ok(Some(v)),
                Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(tokio_rusqlite::Error::Rusqlite(e)),
            }
        }).await?;
        Ok(result)
    }

    /// Bound the worst-case memory + network of an unpaginated list call.
    /// Distributions accumulate over time; a forgotten dashboard tab would
    /// otherwise pull millions of rows.
    const LIST_ALL_LIMIT: i64 = 1_000;

    pub async fn list_all(conn: &Connection) -> Result<Vec<Distribution>, DbError> {
        let result = conn.call(|c| {
            let mut stmt = c.prepare(
                "SELECT id, source_wallet_id, strategy, status, total_sol, config_json,
                        result_json, error_message, created_at, executed_at
                 FROM distributions ORDER BY created_at DESC LIMIT ?1"
            )?;
            let rows = stmt.query_map(rusqlite::params![Self::LIST_ALL_LIMIT], |row| {
                Ok(Distribution {
                    id: row.get(0)?,
                    source_wallet_id: row.get(1)?,
                    strategy: row.get(2)?,
                    status: row.get(3)?,
                    total_sol: row.get(4)?,
                    config_json: row.get(5)?,
                    result_json: row.get(6)?,
                    error_message: row.get(7)?,
                    created_at: row.get(8)?,
                    executed_at: row.get(9)?,
                })
            })?.collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        }).await?;
        Ok(result)
    }

    /// Atomic `planned → executing` claim used by the execute handler.
    ///
    /// Wrapping check+update inside a single SQL UPDATE prevents the race
    /// where two concurrent POST /distributions/{id}/execute requests both
    /// observe `status = 'planned'`, both spawn background executors, and
    /// the source wallet ends up paying every transfer twice.
    ///
    /// Returns:
    ///   - `Claimed(dist)` — this caller transitioned the row; safe to spawn
    ///   - `NotFound`       — no row with that id
    ///   - `WrongStatus(s)` — row exists but was not in `planned` state
    pub async fn claim_for_execution(
        conn: &Connection,
        id: String,
    ) -> Result<DistributionClaim, DbError> {
        let id_clone = id.clone();
        let result = conn.call(move |c| {
            let tx = c.unchecked_transaction()?;
            let row = tx.query_row(
                "SELECT id, source_wallet_id, strategy, status, total_sol, config_json,
                        result_json, error_message, created_at, executed_at
                 FROM distributions WHERE id = ?1",
                rusqlite::params![id_clone],
                |r| Ok(Distribution {
                    id: r.get(0)?,
                    source_wallet_id: r.get(1)?,
                    strategy: r.get(2)?,
                    status: r.get(3)?,
                    total_sol: r.get(4)?,
                    config_json: r.get(5)?,
                    result_json: r.get(6)?,
                    error_message: r.get(7)?,
                    created_at: r.get(8)?,
                    executed_at: r.get(9)?,
                }),
            );
            let dist = match row {
                Ok(d) => d,
                Err(rusqlite::Error::QueryReturnedNoRows) => {
                    tx.commit()?;
                    return Ok(DistributionClaim::NotFound);
                }
                Err(e) => return Err(tokio_rusqlite::Error::Rusqlite(e)),
            };
            if dist.status != "planned" {
                tx.commit()?;
                return Ok(DistributionClaim::WrongStatus(dist.status));
            }
            let affected = tx.execute(
                "UPDATE distributions SET status = 'executing' WHERE id = ?1 AND status = 'planned'",
                rusqlite::params![dist.id],
            )?;
            tx.commit()?;
            if affected == 0 {
                // Lost the race to a concurrent claim; status is something else now.
                Ok(DistributionClaim::WrongStatus("executing".to_string()))
            } else {
                Ok(DistributionClaim::Claimed(Distribution {
                    status: "executing".to_string(),
                    ..dist
                }))
            }
        }).await?;
        Ok(result)
    }

    pub async fn update_status(
        conn: &Connection,
        id: String,
        status: String,
        error_message: Option<String>,
        result_json: Option<String>,
        executed_at: Option<i64>,
    ) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "UPDATE distributions SET status = ?1, error_message = ?2, result_json = ?3, executed_at = ?4 WHERE id = ?5",
                rusqlite::params![status, error_message, result_json, executed_at, id],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }

    pub async fn create_transfer(conn: &Connection, t: DistributionTransfer) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "INSERT INTO distribution_transfers
                 (id, distribution_id, from_wallet_id, to_wallet_id, amount_lamports, hop_index, delay_ms, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    t.id, t.distribution_id, t.from_wallet_id, t.to_wallet_id,
                    t.amount_lamports, t.hop_index, t.delay_ms, t.status,
                ],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }

    pub async fn list_transfers(conn: &Connection, distribution_id: String) -> Result<Vec<DistributionTransfer>, DbError> {
        let result = conn.call(move |c| {
            let mut stmt = c.prepare(
                "SELECT id, distribution_id, from_wallet_id, to_wallet_id, amount_lamports,
                        hop_index, delay_ms, status, tx_signature, error_message, executed_at
                 FROM distribution_transfers WHERE distribution_id = ?1
                 ORDER BY hop_index ASC, rowid ASC"
            )?;
            let rows = stmt.query_map(rusqlite::params![distribution_id], |row| {
                Ok(DistributionTransfer {
                    id: row.get(0)?,
                    distribution_id: row.get(1)?,
                    from_wallet_id: row.get(2)?,
                    to_wallet_id: row.get(3)?,
                    amount_lamports: row.get(4)?,
                    hop_index: row.get(5)?,
                    delay_ms: row.get(6)?,
                    status: row.get(7)?,
                    tx_signature: row.get(8)?,
                    error_message: row.get(9)?,
                    executed_at: row.get(10)?,
                })
            })?.collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        }).await?;
        Ok(result)
    }

    pub async fn update_transfer_status(
        conn: &Connection,
        id: String,
        status: String,
        tx_signature: Option<String>,
        error_message: Option<String>,
        executed_at: Option<i64>,
    ) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "UPDATE distribution_transfers SET status = ?1, tx_signature = ?2, error_message = ?3, executed_at = ?4 WHERE id = ?5",
                rusqlite::params![status, tx_signature, error_message, executed_at, id],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }

    /// Reset all "failed" transfers back to "pending" for a given distribution.
    /// Returns the number of transfers reset.
    pub async fn reset_failed_transfers(conn: &Connection, distribution_id: String) -> Result<usize, DbError> {
        let count = conn.call(move |c| {
            let changed = c.execute(
                "UPDATE distribution_transfers SET status = 'pending', error_message = NULL, executed_at = NULL
                 WHERE distribution_id = ?1 AND status = 'failed'",
                rusqlite::params![distribution_id],
            )?;
            Ok(changed)
        }).await?;
        Ok(count)
    }

    /// Find distributions that have been running for too long (stalled).
    /// Returns distributions that are in "running" or "executing" status
    /// and have been created more than stall_seconds ago.
    pub async fn find_stalled(
        conn: &Connection,
        stall_seconds: i64,
    ) -> Result<Vec<Distribution>, DbError> {
        let cutoff_timestamp = chrono::Utc::now().timestamp() - stall_seconds;

        let result = conn.call(move |c| {
            let mut stmt = c.prepare(
                "SELECT id, source_wallet_id, strategy, status, total_sol, config_json,
                        result_json, error_message, created_at, executed_at
                 FROM distributions
                 WHERE status IN ('running', 'executing')
                 AND created_at < ?1
                 ORDER BY created_at ASC"
            )?;
            let rows = stmt.query_map([cutoff_timestamp], |row| {
                Ok(Distribution {
                    id: row.get(0)?,
                    source_wallet_id: row.get(1)?,
                    strategy: row.get(2)?,
                    status: row.get(3)?,
                    total_sol: row.get(4)?,
                    config_json: row.get(5)?,
                    result_json: row.get(6)?,
                    error_message: row.get(7)?,
                    created_at: row.get(8)?,
                    executed_at: row.get(9)?,
                })
            })?.collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        }).await?;
        Ok(result)
    }

    /// Find all pending transfers for a distribution.
    pub async fn find_pending_transfers(
        conn: &Connection,
        distribution_id: String,
    ) -> Result<Vec<DistributionTransfer>, DbError> {
        let result = conn.call(move |c| {
            let mut stmt = c.prepare(
                "SELECT id, distribution_id, from_wallet_id, to_wallet_id, amount_lamports,
                        hop_index, delay_ms, status, tx_signature, error_message, executed_at
                 FROM distribution_transfers
                 WHERE distribution_id = ?1 AND status = 'pending'
                 ORDER BY hop_index ASC"
            )?;
            let rows = stmt.query_map([&distribution_id], |row| {
                Ok(DistributionTransfer {
                    id: row.get(0)?,
                    distribution_id: row.get(1)?,
                    from_wallet_id: row.get(2)?,
                    to_wallet_id: row.get(3)?,
                    amount_lamports: row.get(4)?,
                    hop_index: row.get(5)?,
                    delay_ms: row.get(6)?,
                    status: row.get(7)?,
                    tx_signature: row.get(8)?,
                    error_message: row.get(9)?,
                    executed_at: row.get(10)?,
                })
            })?.collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        }).await?;
        Ok(result)
    }
}
