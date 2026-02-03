use axum::{
    extract::{Path, State},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_rusqlite::Connection;

use crate::error::AppError;
use cresus_core::bundle::builder::{self, LaunchConfig, SnipeBuyEntry};
use cresus_core::rpc::manager::RpcManager;
use cresus_crypto::SecretBytes;
use cresus_db::repo::bundle_repo::BundleRepo;

/// Shared state needed by bundle handlers.
#[derive(Clone)]
pub struct BundleState {
    pub db: Arc<Connection>,
    pub rpc: RpcManager,
    pub master_key: Arc<RwLock<Option<SecretBytes>>>,
}

#[derive(Debug, Deserialize)]
pub struct LaunchRequest {
    pub token_mint: String,
    pub creator_wallet_id: String,
    pub sol_liquidity: u64,
    pub token_liquidity: u64,
    pub jito_tip_lamports: u64,
    pub base_lot_size: Option<u64>,
    pub quote_lot_size: Option<u64>,
    pub snipe_buys: Vec<SnipeBuyRequest>,
}

#[derive(Debug, Deserialize)]
pub struct SnipeBuyRequest {
    pub wallet_id: String,
    pub sol_amount: u64,
    pub min_token_out: Option<u64>,
}

/// POST /api/v1/bundles/launch — Execute an atomic token launch bundle.
pub async fn launch(
    State(state): State<BundleState>,
    Json(body): Json<LaunchRequest>,
) -> Result<Response, AppError> {
    if let Err(e) = crate::validation::validate_solana_address(&body.token_mint) {
        return Err(AppError::bad_request(format!("Invalid token_mint: {}", e)));
    }
    let config = LaunchConfig {
        token_mint: body.token_mint,
        creator_wallet_id: body.creator_wallet_id,
        sol_liquidity: body.sol_liquidity,
        token_liquidity: body.token_liquidity,
        jito_tip_lamports: body.jito_tip_lamports,
        base_lot_size: body.base_lot_size.unwrap_or(1),
        quote_lot_size: body.quote_lot_size.unwrap_or(1),
        snipe_buys: body
            .snipe_buys
            .into_iter()
            .map(|s| SnipeBuyEntry {
                wallet_id: s.wallet_id,
                sol_amount: s.sol_amount,
                min_token_out: s.min_token_out,
            })
            .collect(),
    };

    let result =
        builder::execute_launch(&state.db, &state.rpc, &state.master_key, config).await?;
    Ok(Json(json!({ "success": true, "data": {
        "bundle_id": result.bundle_id,
        "market_address": result.market_address,
        "pool_address": result.pool_address,
        "status": result.status,
    }}))
    .into_response())
}

/// GET /api/v1/bundles — List all bundles.
pub async fn list_bundles(State(state): State<BundleState>) -> Result<Response, AppError> {
    let bundles = BundleRepo::list_all(&state.db).await.map_err(|e| {
        tracing::error!("DB error: {:?}", e);
        AppError::internal("Database error")
    })?;

    let data: Vec<_> = bundles
        .iter()
        .map(|b| {
            json!({
                "id": b.id,
                "token_id": b.token_id,
                "status": b.status,
                "jito_bundle_id": b.jito_bundle_id,
                "market_address": b.market_address,
                "pool_address": b.pool_address,
                "error_message": b.error_message,
                "created_at": b.created_at,
                "executed_at": b.executed_at,
            })
        })
        .collect();
    Ok(Json(json!({ "success": true, "data": data })).into_response())
}

/// GET /api/v1/bundles/:id — Get a single bundle.
pub async fn get_bundle(
    State(state): State<BundleState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let b = BundleRepo::get_by_id(&state.db, id)
        .await
        .map_err(|e| {
            tracing::error!("DB error: {:?}", e);
            AppError::internal("Database error")
        })?
        .ok_or_else(|| AppError::not_found("Bundle not found"))?;

    Ok(Json(json!({ "success": true, "data": {
        "id": b.id,
        "token_id": b.token_id,
        "config_json": b.config_json,
        "status": b.status,
        "jito_bundle_id": b.jito_bundle_id,
        "market_address": b.market_address,
        "pool_address": b.pool_address,
        "tx_signatures": b.tx_signatures,
        "error_message": b.error_message,
        "created_at": b.created_at,
        "executed_at": b.executed_at,
    }}))
    .into_response())
}
