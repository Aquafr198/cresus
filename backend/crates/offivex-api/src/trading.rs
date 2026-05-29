use axum::{
    extract::{Extension, Path, State},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tokio_rusqlite::Connection;

use crate::error::AppError;
use crate::user::UserCtxExt;
use offivex_core::trading::{VolumeBot, VolumeBotConfig, BumperBot, BumperBotConfig};
use offivex_core::wallet::warmer::{WalletWarmer, WarmerConfig};
use offivex_core::rpc::manager::RpcManager;
use offivex_crypto::SecretBytes;
use offivex_db::repo::audit_repo::AuditRepo;

/// Shared state for trading handlers
#[derive(Clone)]
pub struct TradingState {
    pub db: Arc<Connection>,
    pub rpc: RpcManager,
    pub master_key: Arc<RwLock<Option<SecretBytes>>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateVolumeTaskRequest {
    pub token_mint: String,
    pub wallet_ids: Vec<String>,
    pub min_sol: f64, // SOL
    pub max_sol: f64, // SOL
    pub sell_percent: u8,
    pub min_delay_sec: u64,
    pub max_delay_sec: u64,
    #[serde(default = "default_slippage")]
    pub slippage_bps: u16,
}

fn default_slippage() -> u16 {
    500 // 5%
}

#[derive(Debug, Serialize)]
pub struct VolumeTaskResponse {
    pub id: String,
    pub token_mint: String,
    pub wallet_ids: Vec<String>,
    pub min_sol: f64,
    pub max_sol: f64,
    pub sell_percent: u8,
    pub min_delay_sec: u64,
    pub max_delay_sec: u64,
    pub status: String,
    pub trades_count: i64,
    pub total_volume_sol: f64,
    pub created_at: i64,
}

/// POST /api/v1/trading/volume — Create a new volume bot task
pub async fn create_volume_task(
    State(state): State<TradingState>,
    Json(body): Json<CreateVolumeTaskRequest>,
) -> Result<Response, AppError> {
    // Validate
    if body.wallet_ids.is_empty() {
        return Err(AppError::bad_request("At least one wallet required"));
    }
    if body.min_sol >= body.max_sol {
        return Err(AppError::bad_request("min_sol must be less than max_sol"));
    }
    if body.sell_percent == 0 || body.sell_percent > 100 {
        return Err(AppError::bad_request(
            "sell_percent must be between 1 and 100",
        ));
    }
    if body.min_delay_sec >= body.max_delay_sec {
        return Err(AppError::bad_request(
            "min_delay_sec must be less than max_delay_sec",
        ));
    }
    // Slippage range — same gate as /distributions/:id/execute and
    // /trading/quick-sell. A volume bot runs an unbounded sequence of swaps
    // in a loop; accepting `slippage_bps = 9999` would invite sandwich-MEV
    // drain on every cycle. 1..=5000 = up to 50%, sensible upper bound.
    if !(1..=5000).contains(&body.slippage_bps) {
        return Err(AppError::bad_request(
            "slippage_bps must be in 1..=5000",
        ));
    }

    // Validate token mint
    crate::validation::validate_solana_address(&body.token_mint)
        .map_err(|e| AppError::bad_request(&format!("Invalid token_mint: {}", e)))?;

    // Parse token mint
    let token_mint = body
        .token_mint
        .parse::<solana_sdk::pubkey::Pubkey>()
        .map_err(|_| AppError::bad_request("Invalid token mint pubkey"))?;

    // Convert SOL to lamports
    let min_sol_lamports = (body.min_sol * 1e9) as u64;
    let max_sol_lamports = (body.max_sol * 1e9) as u64;

    // Create task ID
    let task_id = uuid::Uuid::new_v4().to_string();
    let wallet_ids_json = serde_json::to_string(&body.wallet_ids)
        .map_err(|e| AppError::internal(&format!("JSON error: {}", e)))?;

    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // Insert into DB
    let task_id_clone = task_id.clone();
    let token_mint_str = token_mint.to_string();
    state
        .db
        .call(move |conn| {
            conn.execute(
                "INSERT INTO volume_tasks (id, token_mint, wallet_ids, min_sol, max_sol, sell_percent, min_delay_sec, max_delay_sec, status, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'stopped', ?9, ?9)",
                (
                    &task_id_clone,
                    &token_mint_str,
                    &wallet_ids_json,
                    min_sol_lamports as i64,
                    max_sol_lamports as i64,
                    body.sell_percent as i64,
                    body.min_delay_sec as i64,
                    body.max_delay_sec as i64,
                    created_at,
                ),
            )?;
            Ok(())
        })
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": task_id,
            "status": "stopped",
        }
    }))
    .into_response())
}

/// GET /api/v1/trading/volume — List all volume tasks
pub async fn list_volume_tasks(State(state): State<TradingState>) -> Result<Response, AppError> {
    let tasks: Vec<VolumeTaskResponse> = state
        .db
        .call(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, token_mint, wallet_ids, min_sol, max_sol, sell_percent, min_delay_sec, max_delay_sec, status, trades_count, total_volume_sol, created_at
                 FROM volume_tasks ORDER BY created_at DESC"
            )?;

            let rows = stmt.query_map([], |row| {
                let wallet_ids_json: String = row.get(2)?;
                let wallet_ids: Vec<String> = serde_json::from_str(&wallet_ids_json).unwrap_or_default();
                let min_sol_lamports: i64 = row.get(3)?;
                let max_sol_lamports: i64 = row.get(4)?;
                let total_volume_lamports: i64 = row.get(10)?;

                Ok(VolumeTaskResponse {
                    id: row.get(0)?,
                    token_mint: row.get(1)?,
                    wallet_ids,
                    min_sol: min_sol_lamports as f64 / 1e9,
                    max_sol: max_sol_lamports as f64 / 1e9,
                    sell_percent: row.get::<_, i64>(5)? as u8,
                    min_delay_sec: row.get::<_, i64>(6)? as u64,
                    max_delay_sec: row.get::<_, i64>(7)? as u64,
                    status: row.get(8)?,
                    trades_count: row.get(9)?,
                    total_volume_sol: total_volume_lamports as f64 / 1e9,
                    created_at: row.get(11)?,
                })
            })?;

            let mut tasks = Vec::new();
            for row in rows {
                if let Ok(task) = row {
                    tasks.push(task);
                }
            }
            Ok(tasks)
        })
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

    Ok(Json(json!({ "success": true, "data": tasks })).into_response())
}

/// POST /api/v1/trading/volume/:id/start — Start a volume bot task
pub async fn start_volume_task(
    State(state): State<TradingState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    // Load task from DB
    let (token_mint, wallet_ids_json, min_sol, max_sol, sell_percent, min_delay, max_delay): (
        String,
        String,
        i64,
        i64,
        i64,
        i64,
        i64,
    ) = state
        .db
        .call({
            let id = id.clone();
            move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT token_mint, wallet_ids, min_sol, max_sol, sell_percent, min_delay_sec, max_delay_sec FROM volume_tasks WHERE id = ?",
                )?;
                let result = stmt.query_row([&id], |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                    ))
                })?;
                Ok(result)
            }
        })
        .await
        .map_err(|_| AppError::not_found("Task not found"))?;

    let wallet_ids: Vec<String> = serde_json::from_str(&wallet_ids_json)
        .map_err(|e| AppError::internal(&format!("JSON error: {}", e)))?;

    let token_pubkey = token_mint
        .parse::<solana_sdk::pubkey::Pubkey>()
        .map_err(|_| AppError::internal("Invalid token mint"))?;

    let config = VolumeBotConfig {
        token_mint: token_pubkey,
        wallet_ids,
        min_sol: min_sol as u64,
        max_sol: max_sol as u64,
        sell_percent: sell_percent as u8,
        min_delay_sec: min_delay as u64,
        max_delay_sec: max_delay as u64,
        slippage_bps: 500, // 5% default
    };

    // Get RPC client
    let (rpc_client, _) = state
        .rpc
        .get_client()
        .await
        .map_err(|e| AppError::internal(&format!("RPC error: {}", e)))?;

    // Create volume bot
    let bot = VolumeBot::new(
        id.clone(),
        config,
        state.db.clone(),
        rpc_client,
        state.master_key.clone(),
    )
    .await
    .map_err(|e| AppError::internal(&format!("Failed to create bot: {}", e)))?;

    // Start bot
    bot.start()
        .await
        .map_err(|e| AppError::internal(&format!("Failed to start bot: {}", e)))?;

    // Spawn task to run bot
    tokio::spawn(async move {
        if let Err(e) = bot.run().await {
            tracing::error!("Volume bot {} error: {}", id, e);
        }
    });

    Ok(Json(json!({ "success": true, "data": { "status": "running" } })).into_response())
}

/// POST /api/v1/trading/volume/:id/stop — Stop a volume bot task
pub async fn stop_volume_task(
    State(state): State<TradingState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    // Just update DB status to stopped
    // The running task will check status and stop itself
    let updated_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    state
        .db
        .call(move |conn| {
            conn.execute(
                "UPDATE volume_tasks SET status = 'stopped', updated_at = ? WHERE id = ?",
                (updated_at, &id),
            )?;
            Ok(())
        })
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

    Ok(Json(json!({ "success": true, "data": { "status": "stopped" } })).into_response())
}

/// GET /api/v1/trading/volume/:id/stats — Get volume task statistics
pub async fn get_volume_stats(
    State(state): State<TradingState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let id_for_task = id.clone();
    let task: VolumeTaskResponse = state
        .db
        .call(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT id, token_mint, wallet_ids, min_sol, max_sol, sell_percent, min_delay_sec, max_delay_sec, status, trades_count, total_volume_sol, created_at
                 FROM volume_tasks WHERE id = ?",
            )?;

            let result = stmt.query_row([&id_for_task], |row| {
                let wallet_ids_json: String = row.get(2)?;
                let wallet_ids: Vec<String> =
                    serde_json::from_str(&wallet_ids_json).unwrap_or_default();
                let min_sol_lamports: i64 = row.get(3)?;
                let max_sol_lamports: i64 = row.get(4)?;
                let total_volume_lamports: i64 = row.get(10)?;

                Ok(VolumeTaskResponse {
                    id: row.get(0)?,
                    token_mint: row.get(1)?,
                    wallet_ids,
                    min_sol: min_sol_lamports as f64 / 1e9,
                    max_sol: max_sol_lamports as f64 / 1e9,
                    sell_percent: row.get::<_, i64>(5)? as u8,
                    min_delay_sec: row.get::<_, i64>(6)? as u64,
                    max_delay_sec: row.get::<_, i64>(7)? as u64,
                    status: row.get(8)?,
                    trades_count: row.get(9)?,
                    total_volume_sol: total_volume_lamports as f64 / 1e9,
                    created_at: row.get(11)?,
                })
            })?;
            Ok(result)
        })
        .await
        .map_err(|_| AppError::not_found("Task not found"))?;

    // Get recent trades
    let recent_trades: Vec<serde_json::Value> = state
        .db
        .call({
            let id = id.clone();
            move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT wallet_id, direction, sol_amount, token_amount, tx_signature, executed_at
                     FROM volume_trades WHERE task_id = ? ORDER BY executed_at DESC LIMIT 20",
                )?;

                let rows = stmt.query_map([&id], |row| {
                    let sol_lamports: i64 = row.get(2)?;
                    let token_amount: i64 = row.get(3)?;
                    let tx_sig: Option<String> = row.get(4)?;

                    Ok(json!({
                        "wallet_id": row.get::<_, String>(0)?,
                        "direction": row.get::<_, String>(1)?,
                        "sol_amount": sol_lamports as f64 / 1e9,
                        "token_amount": token_amount,
                        "tx_signature": tx_sig,
                        "executed_at": row.get::<_, i64>(5)?,
                    }))
                })?;

                let mut trades = Vec::new();
                for row in rows {
                    if let Ok(trade) = row {
                        trades.push(trade);
                    }
                }
                Ok(trades)
            }
        })
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "task": task,
            "recent_trades": recent_trades,
        }
    }))
    .into_response())
}
// ============================================================================
// Bumper Bot Handlers
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct CreateBumperTaskRequest {
    pub token_mint: String,
    pub wallet_ids: Vec<String>,
    pub price_threshold: f64, // SOL
    pub buy_amount: f64,      // SOL
    pub max_buys_hour: u32,
    #[serde(default = "default_check_interval")]
    pub check_interval_sec: u64,
}

fn default_check_interval() -> u64 {
    30 // check every 30 seconds
}

#[derive(Debug, Serialize)]
pub struct BumperTaskResponse {
    pub id: String,
    pub token_mint: String,
    pub wallet_ids: Vec<String>,
    pub price_threshold: f64,
    pub buy_amount: f64,
    pub max_buys_hour: u32,
    pub status: String,
    pub buys_count: i64,
    pub total_spent_sol: f64,
    pub created_at: i64,
}

/// POST /api/v1/trading/bumper — Create a new bumper bot task
pub async fn create_bumper_task(
    State(state): State<TradingState>,
    Json(body): Json<CreateBumperTaskRequest>,
) -> Result<Response, AppError> {
    // Validate
    if body.wallet_ids.is_empty() {
        return Err(AppError::bad_request("At least one wallet required"));
    }
    if body.price_threshold <= 0.0 {
        return Err(AppError::bad_request("Price threshold must be positive"));
    }
    if body.buy_amount <= 0.0 {
        return Err(AppError::bad_request("Buy amount must be positive"));
    }

    crate::validation::validate_solana_address(&body.token_mint)
        .map_err(|e| AppError::bad_request(&format!("Invalid token_mint: {}", e)))?;

    let buy_amount_lamports = (body.buy_amount * 1e9) as u64;
    let task_id = uuid::Uuid::new_v4().to_string();
    let wallet_ids_json = serde_json::to_string(&body.wallet_ids)
        .map_err(|e| AppError::internal(&format!("JSON error: {}", e)))?;

    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let task_id_clone = task_id.clone();
    let token_mint_clone = body.token_mint.clone();
    state
        .db
        .call(move |conn| {
            conn.execute(
                "INSERT INTO bumper_tasks (id, token_mint, wallet_ids, price_threshold, buy_amount, max_buys_hour, status, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'stopped', ?7, ?7)",
                (
                    &task_id_clone,
                    &token_mint_clone,
                    &wallet_ids_json,
                    body.price_threshold,
                    buy_amount_lamports as i64,
                    body.max_buys_hour as i64,
                    created_at,
                ),
            )?;
            Ok(())
        })
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": task_id,
            "status": "stopped",
        }
    }))
    .into_response())
}

/// GET /api/v1/trading/bumper — List all bumper tasks
pub async fn list_bumper_tasks(State(state): State<TradingState>) -> Result<Response, AppError> {
    let tasks: Vec<BumperTaskResponse> = state
        .db
        .call(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, token_mint, wallet_ids, price_threshold, buy_amount, max_buys_hour, status, buys_count, total_spent_sol, created_at
                 FROM bumper_tasks ORDER BY created_at DESC"
            )?;

            let rows = stmt.query_map([], |row| {
                let wallet_ids_json: String = row.get(2)?;
                let wallet_ids: Vec<String> =
                    serde_json::from_str(&wallet_ids_json).unwrap_or_default();
                let buy_amount_lamports: i64 = row.get(4)?;
                let total_spent_lamports: i64 = row.get(8)?;

                Ok(BumperTaskResponse {
                    id: row.get(0)?,
                    token_mint: row.get(1)?,
                    wallet_ids,
                    price_threshold: row.get(3)?,
                    buy_amount: buy_amount_lamports as f64 / 1e9,
                    max_buys_hour: row.get::<_, i64>(5)? as u32,
                    status: row.get(6)?,
                    buys_count: row.get(7)?,
                    total_spent_sol: total_spent_lamports as f64 / 1e9,
                    created_at: row.get(9)?,
                })
            })?;

            let mut tasks = Vec::new();
            for row in rows {
                if let Ok(task) = row {
                    tasks.push(task);
                }
            }
            Ok(tasks)
        })
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

    Ok(Json(json!({ "success": true, "data": tasks })).into_response())
}

/// POST /api/v1/trading/bumper/:id/start — Start a bumper bot task
pub async fn start_bumper_task(
    State(state): State<TradingState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    // Load task from DB
    let (token_mint, wallet_ids_json, price_threshold, buy_amount, max_buys_hour): (
        String,
        String,
        f64,
        i64,
        i64,
    ) = state
        .db
        .call({
            let id = id.clone();
            move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT token_mint, wallet_ids, price_threshold, buy_amount, max_buys_hour FROM bumper_tasks WHERE id = ?",
                )?;
                let result = stmt.query_row([&id], |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                })?;
                Ok(result)
            }
        })
        .await
        .map_err(|_| AppError::not_found("Task not found"))?;

    let wallet_ids: Vec<String> = serde_json::from_str(&wallet_ids_json)
        .map_err(|e| AppError::internal(&format!("JSON error: {}", e)))?;

    let token_pubkey = token_mint
        .parse::<solana_sdk::pubkey::Pubkey>()
        .map_err(|_| AppError::internal("Invalid token mint"))?;

    let config = BumperBotConfig {
        token_mint: token_pubkey,
        wallet_ids,
        price_threshold,
        buy_amount: buy_amount as u64,
        max_buys_hour: max_buys_hour as u32,
        check_interval_sec: 30,
    };

    // Get RPC client
    let (rpc_client, _) = state
        .rpc
        .get_client()
        .await
        .map_err(|e| AppError::internal(&format!("RPC error: {}", e)))?;

    // Create bumper bot
    let bot = BumperBot::new(
        id.clone(),
        config,
        state.db.clone(),
        rpc_client,
        state.master_key.clone(),
    )
    .await
    .map_err(|e| AppError::internal(&format!("Failed to create bot: {}", e)))?;

    // Start bot
    bot.start()
        .await
        .map_err(|e| AppError::internal(&format!("Failed to start bot: {}", e)))?;

    // Spawn task to run bot
    tokio::spawn(async move {
        if let Err(e) = bot.run().await {
            tracing::error!("Bumper bot {} error: {}", id, e);
        }
    });

    Ok(Json(json!({ "success": true, "data": { "status": "running" } })).into_response())
}

/// POST /api/v1/trading/bumper/:id/stop — Stop a bumper bot task
pub async fn stop_bumper_task(
    State(state): State<TradingState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let updated_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    state
        .db
        .call(move |conn| {
            conn.execute(
                "UPDATE bumper_tasks SET status = 'stopped', updated_at = ? WHERE id = ?",
                (updated_at, &id),
            )?;
            Ok(())
        })
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

    Ok(Json(json!({ "success": true, "data": { "status": "stopped" } })).into_response())
}

// ============================================================================
// Wallet Warmer Handlers
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct CreateWarmerTaskRequest {
    pub wallet_ids: Vec<String>,
    pub actions_count: u32,
    pub min_delay_hours: u32,
    pub max_delay_hours: u32,
}

#[derive(Debug, Serialize)]
pub struct WarmerTaskResponse {
    pub id: String,
    pub wallet_ids: Vec<String>,
    pub actions_count: i64,
    pub actions_completed: i64,
    pub min_delay_hours: i64,
    pub max_delay_hours: i64,
    pub status: String,
    pub created_at: i64,
}

/// POST /api/v1/trading/warmer — Create a new wallet warmer task
pub async fn create_warmer_task(
    State(state): State<TradingState>,
    Json(body): Json<CreateWarmerTaskRequest>,
) -> Result<Response, AppError> {
    if body.wallet_ids.is_empty() {
        return Err(AppError::bad_request("At least one wallet required"));
    }
    if body.actions_count == 0 {
        return Err(AppError::bad_request("Actions count must be positive"));
    }
    if body.min_delay_hours >= body.max_delay_hours {
        return Err(AppError::bad_request("min_delay must be less than max_delay"));
    }

    let task_id = uuid::Uuid::new_v4().to_string();
    let wallet_ids_json = serde_json::to_string(&body.wallet_ids)
        .map_err(|e| AppError::internal(&format!("JSON error: {}", e)))?;

    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let task_id_clone = task_id.clone();
    state
        .db
        .call(move |conn| {
            conn.execute(
                "INSERT INTO warmer_tasks (id, wallet_ids, actions_count, min_delay_hours, max_delay_hours, status, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'stopped', ?6, ?6)",
                (
                    &task_id_clone,
                    &wallet_ids_json,
                    body.actions_count as i64,
                    body.min_delay_hours as i64,
                    body.max_delay_hours as i64,
                    created_at,
                ),
            )?;
            Ok(())
        })
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": task_id,
            "status": "stopped",
        }
    }))
    .into_response())
}

/// GET /api/v1/trading/warmer — List all warmer tasks
pub async fn list_warmer_tasks(State(state): State<TradingState>) -> Result<Response, AppError> {
    let tasks: Vec<WarmerTaskResponse> = state
        .db
        .call(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, wallet_ids, actions_count, actions_completed, min_delay_hours, max_delay_hours, status, created_at
                 FROM warmer_tasks ORDER BY created_at DESC"
            )?;

            let rows = stmt.query_map([], |row| {
                let wallet_ids_json: String = row.get(1)?;
                let wallet_ids: Vec<String> =
                    serde_json::from_str(&wallet_ids_json).unwrap_or_default();

                Ok(WarmerTaskResponse {
                    id: row.get(0)?,
                    wallet_ids,
                    actions_count: row.get(2)?,
                    actions_completed: row.get(3)?,
                    min_delay_hours: row.get(4)?,
                    max_delay_hours: row.get(5)?,
                    status: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })?;

            let mut tasks = Vec::new();
            for row in rows {
                if let Ok(task) = row {
                    tasks.push(task);
                }
            }
            Ok(tasks)
        })
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

    Ok(Json(json!({ "success": true, "data": tasks })).into_response())
}

/// POST /api/v1/trading/warmer/:id/start — Start a warmer task
pub async fn start_warmer_task(
    State(state): State<TradingState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    // Load task from DB
    let (wallet_ids_json, actions_count, min_delay_hours, max_delay_hours): (
        String,
        i64,
        i64,
        i64,
    ) = state
        .db
        .call({
            let id = id.clone();
            move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT wallet_ids, actions_count, min_delay_hours, max_delay_hours FROM warmer_tasks WHERE id = ?",
                )?;
                let result = stmt.query_row([&id], |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                    ))
                })?;
                Ok(result)
            }
        })
        .await
        .map_err(|_| AppError::not_found("Task not found"))?;

    let wallet_ids: Vec<String> = serde_json::from_str(&wallet_ids_json)
        .map_err(|e| AppError::internal(&format!("JSON error: {}", e)))?;

    let config = WarmerConfig {
        wallet_ids,
        actions_count: actions_count as u32,
        min_delay_hours: min_delay_hours as u32,
        max_delay_hours: max_delay_hours as u32,
    };

    // Get RPC client
    let (rpc_client, _) = state
        .rpc
        .get_client()
        .await
        .map_err(|e| AppError::internal(&format!("RPC error: {}", e)))?;

    // Create warmer
    let warmer = WalletWarmer::new(
        id.clone(),
        config,
        state.db.clone(),
        rpc_client,
        state.master_key.clone(),
    )
    .await
    .map_err(|e| AppError::internal(&format!("Failed to create warmer: {}", e)))?;

    // Start warmer
    warmer
        .start()
        .await
        .map_err(|e| AppError::internal(&format!("Failed to start warmer: {}", e)))?;

    // Spawn task to run warmer
    tokio::spawn(async move {
        if let Err(e) = warmer.run().await {
            tracing::error!("Warmer task {} error: {}", id, e);
        }
    });

    Ok(Json(json!({ "success": true, "data": { "status": "running" } })).into_response())
}

/// POST /api/v1/trading/warmer/:id/stop — Stop a warmer task
pub async fn stop_warmer_task(
    State(state): State<TradingState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let updated_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    state
        .db
        .call(move |conn| {
            conn.execute(
                "UPDATE warmer_tasks SET status = 'stopped', updated_at = ? WHERE id = ?",
                (updated_at, &id),
            )?;
            Ok(())
        })
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

    Ok(Json(json!({ "success": true, "data": { "status": "stopped" } })).into_response())
}

// ============================================================================
// Manual Swap Handler
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct SwapRequest {
    pub wallet_id: String,
    pub token_mint: String,
    pub direction: String, // "buy" or "sell"
    pub amount: f64,       // SOL for buy, tokens for sell
    pub slippage_bps: u16,
}

/// POST /api/v1/trading/swap — Execute a manual token swap via Jupiter
pub async fn execute_swap(
    State(state): State<TradingState>,
    Extension(user_ctx): Extension<UserCtxExt>,
    Json(body): Json<SwapRequest>,
) -> Result<Response, AppError> {
    // Validate inputs
    if body.wallet_id.is_empty() {
        return Err(AppError::bad_request("wallet_id is required"));
    }
    crate::validation::validate_solana_address(&body.token_mint)
        .map_err(|e| AppError::bad_request(&format!("Invalid token_mint: {}", e)))?;

    let direction = match body.direction.as_str() {
        "buy" => "buy",
        "sell" => "sell",
        _ => return Err(AppError::bad_request("direction must be 'buy' or 'sell'")),
    };
    if body.amount <= 0.0 {
        return Err(AppError::bad_request("amount must be positive"));
    }

    let token_pubkey = body
        .token_mint
        .parse::<solana_sdk::pubkey::Pubkey>()
        .map_err(|_| AppError::bad_request("Invalid token mint pubkey"))?;

    // Get master encryption key
    let mek = state
        .master_key
        .read()
        .await
        .as_ref()
        .cloned()
        .ok_or_else(|| AppError::forbidden("App is locked"))?;

    // Decrypt wallet keypair
    let keypair = offivex_core::wallet::decrypt::decrypt_wallet_keypair(
        &state.db,
        &body.wallet_id,
        &mek,
    )
    .await
    .map_err(|e| AppError::internal(&format!("Failed to decrypt wallet: {}", e)))?;

    // Get RPC client
    let (rpc_client, _) = state
        .rpc
        .get_client()
        .await
        .map_err(|e| AppError::internal(&format!("RPC error: {}", e)))?;

    // Execute swap
    let signature = if direction == "buy" {
        let sol_lamports = (body.amount * 1e9) as u64;
        offivex_core::trading::swap::swap_sol_to_token(
            &keypair,
            &token_pubkey,
            sol_lamports,
            body.slippage_bps,
            &rpc_client,
        )
        .await
    } else {
        let token_amount = (body.amount * 1e9) as u64;
        offivex_core::trading::swap::swap_token_to_sol(
            &keypair,
            &token_pubkey,
            token_amount,
            body.slippage_bps,
            &rpc_client,
        )
        .await
    }
    .map_err(|e| {
        crate::metrics::inc_swap_error();
        AppError::internal(&format!("Swap failed: {}", e))
    })?;

    crate::metrics::inc_swap();
    crate::audit::log_audit(
        &state.db,
        &format!("swap.{}", direction),
        &format!("{} {} of {}", direction, body.amount, body.token_mint),
        Some(&body.wallet_id),
        Some(&signature),
    )
    .await;

    // Audit SEC-MAX-3 — data-plane forensic audit with user_id.
    let _ = AuditRepo::insert_full(
        &state.db,
        &format!("user_op_swap_{}", direction),
        &format!(
            "wallet={} token={} amount={} slippage_bps={}",
            body.wallet_id, body.token_mint, body.amount, body.slippage_bps
        ),
        None,
        Some(&signature),
        None,
        Some(&user_ctx.user_id),
        None,
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "signature": signature }
    }))
    .into_response())
}

// ============================================================================
// Pump.fun Handlers
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct CreatePumpFunLaunchRequest {
    pub token_name: String,
    pub token_symbol: String,
    #[serde(default)]
    pub token_description: String,
    #[serde(default)]
    pub image_url: String,
    pub creator_wallet_id: String,
    #[serde(default)]
    pub initial_buy_sol: f64,
    #[serde(default = "default_slippage")]
    pub slippage_bps: u16,
    pub twitter: Option<String>,
    pub telegram: Option<String>,
    pub website: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PumpFunLaunchResponse {
    pub id: String,
    pub token_name: String,
    pub token_symbol: String,
    pub token_description: String,
    pub image_url: String,
    pub token_mint: Option<String>,
    pub creator_wallet_id: String,
    pub initial_buy_sol: f64,
    pub status: String,
    pub tx_signature: Option<String>,
    pub bonding_curve: Option<String>,
    pub metadata_uri: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// POST /api/v1/trading/pump-fun — Create a Pump.fun launch record
pub async fn create_pump_fun_launch(
    State(state): State<TradingState>,
    Json(body): Json<CreatePumpFunLaunchRequest>,
) -> Result<Response, AppError> {
    // Validate
    if body.token_name.is_empty() || body.token_name.len() > 32 {
        return Err(AppError::bad_request("token_name must be 1-32 characters"));
    }
    if body.token_symbol.is_empty() || body.token_symbol.len() > 10 {
        return Err(AppError::bad_request(
            "token_symbol must be 1-10 characters",
        ));
    }
    if body.creator_wallet_id.is_empty() {
        return Err(AppError::bad_request("creator_wallet_id is required"));
    }
    if body.initial_buy_sol < 0.0 {
        return Err(AppError::bad_request(
            "initial_buy_sol must be non-negative",
        ));
    }

    let launch_id = uuid::Uuid::new_v4().to_string();
    let initial_buy_lamports = (body.initial_buy_sol * 1e9) as i64;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let id_clone = launch_id.clone();
    state
        .db
        .call(move |conn| {
            conn.execute(
                "INSERT INTO pump_fun_launches (id, token_name, token_symbol, token_description, image_url, creator_wallet_id, initial_buy_sol, status, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?8)",
                (
                    &id_clone,
                    &body.token_name,
                    &body.token_symbol,
                    &body.token_description,
                    &body.image_url,
                    &body.creator_wallet_id,
                    initial_buy_lamports,
                    now,
                ),
            )?;
            Ok(())
        })
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": launch_id,
            "status": "pending",
        }
    }))
    .into_response())
}

/// GET /api/v1/trading/pump-fun — List all Pump.fun launches
pub async fn list_pump_fun_launches(
    State(state): State<TradingState>,
) -> Result<Response, AppError> {
    let launches: Vec<PumpFunLaunchResponse> = state
        .db
        .call(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, token_name, token_symbol, token_description, image_url, token_mint, creator_wallet_id, initial_buy_sol, status, tx_signature, bonding_curve, metadata_uri, created_at, updated_at
                 FROM pump_fun_launches ORDER BY created_at DESC",
            )?;

            let rows = stmt.query_map([], |row| {
                let initial_buy_lamports: i64 = row.get(7)?;
                Ok(PumpFunLaunchResponse {
                    id: row.get(0)?,
                    token_name: row.get(1)?,
                    token_symbol: row.get(2)?,
                    token_description: row.get(3)?,
                    image_url: row.get(4)?,
                    token_mint: row.get(5)?,
                    creator_wallet_id: row.get(6)?,
                    initial_buy_sol: initial_buy_lamports as f64 / 1e9,
                    status: row.get(8)?,
                    tx_signature: row.get(9)?,
                    bonding_curve: row.get(10)?,
                    metadata_uri: row.get(11)?,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            })?;

            let mut launches = Vec::new();
            for row in rows {
                if let Ok(launch) = row {
                    launches.push(launch);
                }
            }
            Ok(launches)
        })
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

    Ok(Json(json!({ "success": true, "data": launches })).into_response())
}

#[derive(Debug, Deserialize)]
pub struct ConfirmationBody {
    #[serde(default)]
    pub confirmed: bool,
}

/// POST /api/v1/trading/pump-fun/:id/launch — Execute a Pump.fun launch on-chain
pub async fn execute_pump_fun_launch(
    State(state): State<TradingState>,
    Path(id): Path<String>,
    Json(confirm): Json<ConfirmationBody>,
) -> Result<Response, AppError> {
    if !confirm.confirmed {
        return Err(AppError::bad_request(
            "This action requires confirmation. Send { \"confirmed\": true } to proceed.",
        ));
    }

    // Load launch from DB
    let (token_name, token_symbol, token_description, image_url, creator_wallet_id, initial_buy_lamports, twitter, telegram, website): (
        String, String, String, String, String, i64, Option<String>, Option<String>, Option<String>,
    ) = state
        .db
        .call({
            let id = id.clone();
            move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT token_name, token_symbol, token_description, image_url, creator_wallet_id, initial_buy_sol, NULL, NULL, NULL FROM pump_fun_launches WHERE id = ? AND status = 'pending'",
                )?;
                let result = stmt.query_row([&id], |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                        row.get(7)?,
                        row.get(8)?,
                    ))
                })?;
                Ok(result)
            }
        })
        .await
        .map_err(|_| AppError::not_found("Launch not found or already executed"))?;

    // Get master encryption key
    let mek = state
        .master_key
        .read()
        .await
        .as_ref()
        .cloned()
        .ok_or_else(|| AppError::forbidden("App is locked"))?;

    // Decrypt creator wallet
    let creator_keypair = offivex_core::wallet::decrypt::decrypt_wallet_keypair(
        &state.db,
        &creator_wallet_id,
        &mek,
    )
    .await
    .map_err(|e| AppError::internal(&format!("Failed to decrypt wallet: {}", e)))?;

    // Get RPC client
    let (rpc_client, _) = state
        .rpc
        .get_client()
        .await
        .map_err(|e| AppError::internal(&format!("RPC error: {}", e)))?;

    // Update status to launching
    let id_for_update = id.clone();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    state
        .db
        .call(move |conn| {
            conn.execute(
                "UPDATE pump_fun_launches SET status = 'launching', updated_at = ? WHERE id = ?",
                (now, &id_for_update),
            )?;
            Ok(())
        })
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

    // Build launch config
    let config = offivex_core::trading::pump_fun::PumpFunLaunchConfig {
        name: token_name,
        symbol: token_symbol,
        description: token_description,
        image_url,
        twitter,
        telegram,
        website,
        initial_buy_sol: initial_buy_lamports as u64,
        slippage_bps: 500,
    };

    // Execute on-chain
    match offivex_core::trading::pump_fun::create_pump_fun_token(
        &creator_keypair,
        &config,
        &rpc_client,
    )
    .await
    {
        Ok((tx_sig, mint_addr, bonding_curve, metadata_uri)) => {
            // Clone for DB closure
            let db_mint = mint_addr.clone();
            let db_sig = tx_sig.clone();
            let db_curve = bonding_curve.clone();
            let db_uri = metadata_uri.clone();
            let id_for_success = id.clone();
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            state
                .db
                .call(move |conn| {
                    conn.execute(
                        "UPDATE pump_fun_launches SET status = 'launched', token_mint = ?, tx_signature = ?, bonding_curve = ?, metadata_uri = ?, updated_at = ? WHERE id = ?",
                        (&db_mint, &db_sig, &db_curve, &db_uri, now, &id_for_success),
                    )?;
                    Ok(())
                })
                .await
                .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

            crate::metrics::inc_pump_fun_launch();
            crate::audit::log_audit(
                &state.db,
                "pump_fun.launch",
                &format!("Launched {} (mint: {})", config.name, &mint_addr),
                Some(&creator_wallet_id),
                Some(&tx_sig),
            )
            .await;

            Ok(Json(json!({
                "success": true,
                "data": {
                    "launch_id": id,
                    "token_mint": mint_addr,
                    "bonding_curve": bonding_curve,
                    "tx_signature": tx_sig,
                    "metadata_uri": metadata_uri,
                    "status": "launched",
                }
            }))
            .into_response())
        }
        Err(e) => {
            // Update DB with failure
            let id_for_fail = id.clone();
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            let _ = state
                .db
                .call(move |conn| {
                    conn.execute(
                        "UPDATE pump_fun_launches SET status = 'failed', updated_at = ? WHERE id = ?",
                        (now, &id_for_fail),
                    )?;
                    Ok(())
                })
                .await;

            Err(AppError::internal(&format!("Pump.fun launch failed: {}", e)))
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct PumpFunBuyRequest {
    pub wallet_id: String,
    pub token_mint: String,
    pub amount_sol: f64,
    #[serde(default = "default_slippage")]
    pub slippage_bps: u16,
}

/// POST /api/v1/trading/pump-fun/buy — Buy a Pump.fun token
pub async fn buy_pump_fun_token(
    State(state): State<TradingState>,
    Json(body): Json<PumpFunBuyRequest>,
) -> Result<Response, AppError> {
    if body.wallet_id.is_empty() {
        return Err(AppError::bad_request("wallet_id is required"));
    }
    crate::validation::validate_solana_address(&body.token_mint)
        .map_err(|e| AppError::bad_request(&format!("Invalid token_mint: {}", e)))?;
    if body.amount_sol <= 0.0 {
        return Err(AppError::bad_request("amount_sol must be positive"));
    }

    let token_pubkey = body
        .token_mint
        .parse::<solana_sdk::pubkey::Pubkey>()
        .map_err(|_| AppError::bad_request("Invalid token mint pubkey"))?;

    let mek = state
        .master_key
        .read()
        .await
        .as_ref()
        .cloned()
        .ok_or_else(|| AppError::forbidden("App is locked"))?;

    let keypair = offivex_core::wallet::decrypt::decrypt_wallet_keypair(
        &state.db,
        &body.wallet_id,
        &mek,
    )
    .await
    .map_err(|e| AppError::internal(&format!("Failed to decrypt wallet: {}", e)))?;

    let (rpc_client, _) = state
        .rpc
        .get_client()
        .await
        .map_err(|e| AppError::internal(&format!("RPC error: {}", e)))?;

    let sol_lamports = (body.amount_sol * 1e9) as u64;
    let signature = offivex_core::trading::pump_fun::buy_pump_fun_token(
        &keypair,
        &token_pubkey,
        sol_lamports,
        body.slippage_bps,
        &rpc_client,
    )
    .await
    .map_err(|e| AppError::internal(&format!("Buy failed: {}", e)))?;

    Ok(Json(json!({
        "success": true,
        "data": { "signature": signature }
    }))
    .into_response())
}

#[derive(Debug, Deserialize)]
pub struct PumpFunSellRequest {
    pub wallet_id: String,
    pub token_mint: String,
    pub amount_tokens: f64,
    #[serde(default = "default_slippage")]
    pub slippage_bps: u16,
}

/// POST /api/v1/trading/pump-fun/sell — Sell a Pump.fun token
pub async fn sell_pump_fun_token(
    State(state): State<TradingState>,
    Json(body): Json<PumpFunSellRequest>,
) -> Result<Response, AppError> {
    if body.wallet_id.is_empty() {
        return Err(AppError::bad_request("wallet_id is required"));
    }
    crate::validation::validate_solana_address(&body.token_mint)
        .map_err(|e| AppError::bad_request(&format!("Invalid token_mint: {}", e)))?;
    if body.amount_tokens <= 0.0 {
        return Err(AppError::bad_request("amount_tokens must be positive"));
    }

    let token_pubkey = body
        .token_mint
        .parse::<solana_sdk::pubkey::Pubkey>()
        .map_err(|_| AppError::bad_request("Invalid token mint pubkey"))?;

    let mek = state
        .master_key
        .read()
        .await
        .as_ref()
        .cloned()
        .ok_or_else(|| AppError::forbidden("App is locked"))?;

    let keypair = offivex_core::wallet::decrypt::decrypt_wallet_keypair(
        &state.db,
        &body.wallet_id,
        &mek,
    )
    .await
    .map_err(|e| AppError::internal(&format!("Failed to decrypt wallet: {}", e)))?;

    let (rpc_client, _) = state
        .rpc
        .get_client()
        .await
        .map_err(|e| AppError::internal(&format!("RPC error: {}", e)))?;

    // Pump.fun tokens use 6 decimals
    let token_amount = (body.amount_tokens * 1e6) as u64;
    let signature = offivex_core::trading::pump_fun::sell_pump_fun_token(
        &keypair,
        &token_pubkey,
        token_amount,
        body.slippage_bps,
        &rpc_client,
    )
    .await
    .map_err(|e| AppError::internal(&format!("Sell failed: {}", e)))?;

    Ok(Json(json!({
        "success": true,
        "data": { "signature": signature }
    }))
    .into_response())
}
