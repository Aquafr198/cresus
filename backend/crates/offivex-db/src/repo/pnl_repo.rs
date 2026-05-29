use tokio_rusqlite::Connection;

use crate::DbError;

#[derive(Debug, Clone)]
pub struct RealizedPnlEvent {
    pub id: i64,
    pub bundle_id: String,
    pub token_mint: String,
    pub token_symbol: Option<String>,
    pub creator_wallet: String,
    /// u64 lamports as decimal string.
    pub invested_sol_lamports: String,
    pub sold_sol_lamports: String,
    /// Signed integer as decimal string (positive in current detector path).
    pub pnl_sol_lamports: String,
    /// 264 ⇒ 2.64×.
    pub pnl_multiplier_x100: i64,
    pub sol_usd_rate_cents: Option<i64>,
    pub detected_at: i64,
    pub posted_at: Option<i64>,
}

pub struct PnlRepo;

impl PnlRepo {
    #[allow(clippy::too_many_arguments)]
    pub async fn insert(
        conn: &Connection,
        bundle_id: String,
        token_mint: String,
        token_symbol: Option<String>,
        creator_wallet: String,
        invested_sol_lamports: u64,
        sold_sol_lamports: u64,
        pnl_sol_lamports: i64,
        pnl_multiplier_x100: i64,
        sol_usd_rate_cents: Option<i64>,
        detected_at: i64,
    ) -> Result<i64, DbError> {
        let invested = invested_sol_lamports.to_string();
        let sold = sold_sol_lamports.to_string();
        let pnl = pnl_sol_lamports.to_string();
        let id = conn
            .call(move |c| {
                c.execute(
                    "INSERT INTO realized_pnl_events
                       (bundle_id, token_mint, token_symbol, creator_wallet,
                        invested_sol_lamports, sold_sol_lamports, pnl_sol_lamports,
                        pnl_multiplier_x100, sol_usd_rate_cents, detected_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    rusqlite::params![
                        bundle_id,
                        token_mint,
                        token_symbol,
                        creator_wallet,
                        invested,
                        sold,
                        pnl,
                        pnl_multiplier_x100,
                        sol_usd_rate_cents,
                        detected_at,
                    ],
                )?;
                Ok(c.last_insert_rowid())
            })
            .await?;
        Ok(id)
    }

    /// Return PNL events with `id > after` that haven't been posted yet, up
    /// to `limit` rows in chronological order. The bot uses this every
    /// poll-tick; the SQL is the source of truth for "posted vs not".
    pub async fn list_unposted_after(
        conn: &Connection,
        after: i64,
        limit: i64,
    ) -> Result<Vec<RealizedPnlEvent>, DbError> {
        let limit = limit.clamp(1, 100);
        let rows = conn
            .call(move |c| {
                let mut stmt = c.prepare(
                    "SELECT id, bundle_id, token_mint, token_symbol, creator_wallet,
                            invested_sol_lamports, sold_sol_lamports, pnl_sol_lamports,
                            pnl_multiplier_x100, sol_usd_rate_cents, detected_at, posted_at
                     FROM realized_pnl_events
                     WHERE id > ?1 AND posted_at IS NULL
                     ORDER BY id ASC
                     LIMIT ?2",
                )?;
                let rows = stmt.query_map(rusqlite::params![after, limit], |row| {
                    Ok(RealizedPnlEvent {
                        id: row.get(0)?,
                        bundle_id: row.get(1)?,
                        token_mint: row.get(2)?,
                        token_symbol: row.get(3)?,
                        creator_wallet: row.get(4)?,
                        invested_sol_lamports: row.get(5)?,
                        sold_sol_lamports: row.get(6)?,
                        pnl_sol_lamports: row.get(7)?,
                        pnl_multiplier_x100: row.get(8)?,
                        sol_usd_rate_cents: row.get(9)?,
                        detected_at: row.get(10)?,
                        posted_at: row.get(11)?,
                    })
                })?;
                Ok(rows.collect::<Result<Vec<_>, _>>()?)
            })
            .await?;
        Ok(rows)
    }

    /// Idempotent — repeated calls keep the first `posted_at`.
    pub async fn mark_posted(conn: &Connection, id: i64, posted_at: i64) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "UPDATE realized_pnl_events SET posted_at = ?2
                 WHERE id = ?1 AND posted_at IS NULL",
                rusqlite::params![id, posted_at],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }
}
