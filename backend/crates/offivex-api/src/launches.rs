//! Launch dashboard — single bundled endpoint returning every panel of the
//! "Viewing mint" UI in one round-trip.
//!
//! Pipeline (server-side parallel via `tokio::join!`):
//!   1. Token details (from local `tokens` table + supply from `mint` row)
//!   2. Per-wallet balances (parallel `getBalance` + `getTokenAccountsByOwner`)
//!   3. Tasks filtered by `WHERE token_mint = ?` (volume + bumper bots)
//!   4. Bonding curve state (only when the mint matches a `pump_fun_launches` row)
//!   5. Activity backfill from the in-memory `EventBus` ring buffer
//!
//! Refused with 404 when the mint is not in the local `tokens` table — the
//! dashboard is scoped to Offivex-launched tokens by design (see plan).

use axum::{
    extract::{Path, State},
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use serde_json::json;
use std::sync::Arc;

use crate::error::AppError;
use offivex_core::monitor::event_bus::{EventBus, MonitorEvent};
use offivex_core::rpc::manager::RpcManager;
use tokio_rusqlite::Connection;

/// Bundled state for the launches dashboard handler. Wired in the server
/// router with the same triple middleware stack as the other trading routes.
#[derive(Clone)]
pub struct LaunchesState {
    pub db: Arc<Connection>,
    pub rpc: RpcManager,
    pub event_bus: Arc<EventBus>,
}

#[derive(Debug, Serialize)]
pub struct TokenDetails {
    pub mint_address: String,
    pub name: Option<String>,
    pub symbol: Option<String>,
    pub decimals: i64,
    pub supply: String,
    pub metadata_uri: Option<String>,
    pub creator_wallet_id: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
pub struct HolderRow {
    pub wallet_id: String,
    pub label: String,
    pub public_key: String,
    pub balance_raw: u64,
    pub percent_of_supply: f64,
}

#[derive(Debug, Serialize)]
pub struct VolumeTaskRow {
    pub id: String,
    pub wallet_ids: Vec<String>,
    pub status: String,
    pub min_sol: f64,
    pub max_sol: f64,
    pub sell_percent: u8,
    pub trades_count: i64,
    pub total_volume_sol: f64,
}

#[derive(Debug, Serialize)]
pub struct BumperTaskRow {
    pub id: String,
    pub wallet_ids: Vec<String>,
    pub status: String,
    pub price_threshold: f64,
    pub buy_amount: f64,
    pub max_buys_hour: u32,
    pub buys_count: i64,
    pub total_spent_sol: f64,
}

#[derive(Debug, Serialize, Default)]
pub struct TasksByType {
    pub volume: Vec<VolumeTaskRow>,
    pub bumper: Vec<BumperTaskRow>,
}

#[derive(Debug, Serialize)]
pub struct LaunchDashboardResponse {
    pub mint: String,
    pub details: TokenDetails,
    pub holders: Vec<HolderRow>,
    pub tasks: TasksByType,
    pub curve: Option<offivex_core::trading::pump_fun::BondingCurveState>,
    pub activity: Vec<MonitorEvent>,
    pub fetched_at_ms: u128,
}

/// GET /api/v1/launches/{mint}/dashboard
pub async fn get_dashboard(
    State(state): State<LaunchesState>,
    Path(mint): Path<String>,
) -> Result<Response, AppError> {
    let started = std::time::Instant::now();

    crate::validation::validate_solana_address(&mint)
        .map_err(|e| AppError::bad_request(format!("Invalid mint: {}", e)))?;

    let mint_pubkey = mint
        .parse::<solana_sdk::pubkey::Pubkey>()
        .map_err(|_| AppError::bad_request("Invalid mint pubkey"))?;

    // 1. Token details — required. 404 if not an Offivex-launched mint.
    let token = offivex_db::repo::token_repo::TokenRepo::get_by_mint(&state.db, mint.clone())
        .await
        .map_err(|e| AppError::internal(format!("token lookup: {}", e)))?
        .ok_or_else(|| AppError::not_found("Mint not found in Offivex tokens"))?;

    let details = TokenDetails {
        mint_address: token.mint_address.clone(),
        name: token.name.clone(),
        symbol: token.symbol.clone(),
        decimals: token.decimals,
        supply: token.supply.clone(),
        metadata_uri: token.metadata_uri.clone(),
        creator_wallet_id: token.creator_wallet_id.clone(),
        created_at: token.created_at,
    };
    let total_supply: u128 = token.supply.parse::<u128>().unwrap_or(0);

    // 2. RPC client (shared across all parallel ops).
    let (rpc_client, _) = state
        .rpc
        .get_client()
        .await
        .map_err(|e| AppError::internal(format!("RPC error: {}", e)))?;
    let rpc_client = Arc::new(rpc_client);

    // 3. Wallet set associated with this launch — the creator wallet plus
    // every sub-wallet derived from it. Bounds the per-poll RPC budget on
    // vaults that hold many unrelated launches. Legacy tokens minted before
    // we recorded `creator_wallet_id` fall back to scanning everything.
    let wallets = match token.creator_wallet_id.clone() {
        Some(creator_id) => {
            offivex_db::repo::wallet_repo::WalletRepo::list_by_creator(&state.db, creator_id)
                .await
                .map_err(|e| AppError::internal(format!("list wallets: {}", e)))?
        }
        None => offivex_db::repo::wallet_repo::WalletRepo::list_all(&state.db)
            .await
            .map_err(|e| AppError::internal(format!("list wallets: {}", e)))?,
    };

    // 4. Parallel fan-out: holders + tasks + curve + activity all at once.
    let holders_fut = {
        let rpc = Arc::clone(&rpc_client);
        let mint = mint.clone();
        let wallets = wallets.clone();
        async move {
            let futures = wallets.into_iter().map(|w| {
                let rpc = Arc::clone(&rpc);
                let mint = mint.clone();
                async move {
                    let pubkey = match w.public_key.parse::<solana_sdk::pubkey::Pubkey>() {
                        Ok(p) => p,
                        Err(e) => {
                            tracing::warn!(
                                wallet_id = %w.id,
                                err = %e,
                                "invalid pubkey on wallet row, skipping",
                            );
                            return None;
                        }
                    };
                    let bal = match offivex_core::wallet::operations::get_balance(&rpc, &pubkey)
                        .await
                    {
                        Ok(b) => b,
                        Err(e) => {
                            tracing::warn!(
                                wallet_id = %w.id,
                                mint = %mint,
                                err = %e,
                                "balance lookup failed during dashboard poll",
                            );
                            return None;
                        }
                    };
                    let token = bal.tokens.into_iter().find(|t| t.mint == mint && t.amount > 0)?;
                    let percent = if total_supply > 0 {
                        (token.amount as f64) / (total_supply as f64) * 100.0
                    } else {
                        0.0
                    };
                    Some(HolderRow {
                        wallet_id: w.id.clone(),
                        label: w.name.unwrap_or_else(|| w.id.clone()),
                        public_key: w.public_key,
                        balance_raw: token.amount,
                        percent_of_supply: percent,
                    })
                }
            });
            futures_util::future::join_all(futures)
                .await
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
        }
    };

    let tasks_fut = {
        let db = Arc::clone(&state.db);
        let mint = mint.clone();
        async move { fetch_tasks_by_mint(&db, &mint).await }
    };

    let curve_fut = {
        let db = Arc::clone(&state.db);
        let rpc = Arc::clone(&rpc_client);
        let mint_str = mint.clone();
        async move {
            // Only fetch the curve PDA if the mint is a Pump.fun launch we
            // ourselves created — saves an RPC roundtrip on Raydium-only mints.
            let mint_owned = mint_str.clone();
            let is_pf: bool = db
                .call(move |conn| {
                    let mut stmt = conn.prepare(
                        "SELECT 1 FROM pump_fun_launches WHERE token_mint = ?1 LIMIT 1",
                    )?;
                    Ok(stmt.exists([&mint_owned])?)
                })
                .await
                .unwrap_or_default();
            if !is_pf {
                return Ok(None);
            }
            offivex_core::trading::pump_fun::get_curve_state(&mint_pubkey, &rpc)
                .await
                .map_err(|e| e.to_string())
        }
    };

    let activity_fut = {
        let bus = Arc::clone(&state.event_bus);
        let mint = mint.clone();
        async move { bus.recent_for_mint(&mint, 50) }
    };

    let (holders, tasks_res, curve_res, activity) =
        tokio::join!(holders_fut, tasks_fut, curve_fut, activity_fut);

    // Tasks SQL errors fall through to empty list — the panel just shows
    // "no tasks" rather than failing the whole dashboard.
    let tasks = tasks_res.unwrap_or_default();
    // Curve fetch errors degrade silently (curve panel just hidden client-side).
    let curve = curve_res.unwrap_or(None);

    let elapsed_ms = started.elapsed().as_millis();
    tracing::debug!(mint = %mint, holders = holders.len(), elapsed_ms, "dashboard fetched");

    Ok(Json(json!({
        "success": true,
        "data": LaunchDashboardResponse {
            mint,
            details,
            holders,
            tasks,
            curve,
            activity,
            fetched_at_ms: elapsed_ms,
        }
    }))
    .into_response())
}

/// SQL query both task tables (volume + bumper), filtered by mint. Errors
/// returned to the caller; the handler swallows them so a SQL hiccup
/// doesn't take down the whole dashboard.
async fn fetch_tasks_by_mint(
    db: &Arc<Connection>,
    mint: &str,
) -> Result<TasksByType, tokio_rusqlite::Error> {
    let mint_owned = mint.to_string();
    db.call(move |conn| {
        let mut out = TasksByType::default();

        // Volume tasks
        {
            let mut stmt = conn.prepare(
                "SELECT id, wallet_ids, min_sol, max_sol, sell_percent, status, trades_count, total_volume_sol
                 FROM volume_tasks WHERE token_mint = ?1 ORDER BY created_at DESC",
            )?;
            let rows = stmt.query_map([&mint_owned], |row| {
                let wallet_ids_json: String = row.get(1)?;
                let wallet_ids: Vec<String> =
                    serde_json::from_str(&wallet_ids_json).unwrap_or_default();
                let min_sol_lamports: i64 = row.get(2)?;
                let max_sol_lamports: i64 = row.get(3)?;
                let total_volume_lamports: i64 = row.get(7)?;
                Ok(VolumeTaskRow {
                    id: row.get(0)?,
                    wallet_ids,
                    status: row.get(5)?,
                    min_sol: min_sol_lamports as f64 / 1e9,
                    max_sol: max_sol_lamports as f64 / 1e9,
                    sell_percent: row.get::<_, i64>(4)? as u8,
                    trades_count: row.get(6)?,
                    total_volume_sol: total_volume_lamports as f64 / 1e9,
                })
            })?;
            for r in rows.flatten() {
                out.volume.push(r);
            }
        }

        // Bumper tasks
        {
            let mut stmt = conn.prepare(
                "SELECT id, wallet_ids, price_threshold, buy_amount, max_buys_hour, status, buys_count, total_spent_sol
                 FROM bumper_tasks WHERE token_mint = ?1 ORDER BY created_at DESC",
            )?;
            let rows = stmt.query_map([&mint_owned], |row| {
                let wallet_ids_json: String = row.get(1)?;
                let wallet_ids: Vec<String> =
                    serde_json::from_str(&wallet_ids_json).unwrap_or_default();
                let buy_amount_lamports: i64 = row.get(3)?;
                let total_spent_lamports: i64 = row.get(7)?;
                Ok(BumperTaskRow {
                    id: row.get(0)?,
                    wallet_ids,
                    status: row.get(5)?,
                    price_threshold: row.get(2)?,
                    buy_amount: buy_amount_lamports as f64 / 1e9,
                    max_buys_hour: row.get::<_, i64>(4)? as u32,
                    buys_count: row.get(6)?,
                    total_spent_sol: total_spent_lamports as f64 / 1e9,
                })
            })?;
            for r in rows.flatten() {
                out.bumper.push(r);
            }
        }

        Ok(out)
    })
    .await
}

