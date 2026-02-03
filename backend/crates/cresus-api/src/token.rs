use axum::{
    extract::State,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_rusqlite::Connection;

use crate::error::AppError;
use cresus_core::rpc::manager::RpcManager;
use cresus_core::token::mint::{self, MintParams};
use cresus_core::token::clone;
use cresus_core::token::vanity::{self, VanityConfig};
use cresus_crypto::SecretBytes;

/// Shared state needed by token handlers.
#[derive(Clone)]
pub struct TokenState {
    pub db: Arc<Connection>,
    pub rpc: RpcManager,
    pub master_key: Arc<RwLock<Option<SecretBytes>>>,
}

#[derive(Debug, Deserialize)]
pub struct MintTokenRequest {
    pub name: String,
    pub symbol: String,
    pub decimals: Option<u8>,
    pub supply: u64,
    pub metadata_uri: Option<String>,
    pub creator_wallet_id: String,
}

#[derive(Debug, Deserialize)]
pub struct CloneTokenRequest {
    pub mint_address: String,
}

/// POST /api/v1/tokens/mint — Create a new SPL token.
pub async fn mint_token(
    State(state): State<TokenState>,
    Json(body): Json<MintTokenRequest>,
) -> Result<Response, AppError> {
    let params = MintParams {
        name: body.name,
        symbol: body.symbol,
        decimals: body.decimals.unwrap_or(9),
        supply: body.supply,
        metadata_uri: body.metadata_uri,
        creator_wallet_id: body.creator_wallet_id,
    };

    let token = mint::create_token(&state.db, &state.rpc, &state.master_key, params).await?;
    Ok(Json(json!({ "success": true, "data": {
        "id": token.id,
        "mint_address": token.mint_address,
        "name": token.name,
        "symbol": token.symbol,
        "decimals": token.decimals,
        "supply": token.supply,
        "metadata_uri": token.metadata_uri,
        "tx_signature": token.tx_signature,
        "created_at": token.created_at,
    }}))
    .into_response())
}

/// POST /api/v1/tokens/clone-info — Fetch on-chain token info for cloning.
pub async fn clone_info(
    State(state): State<TokenState>,
    Json(body): Json<CloneTokenRequest>,
) -> Result<Response, AppError> {
    let (client, _ep) = state.rpc.get_client().await
        .map_err(|e| AppError::internal(e.to_string()))?;

    match clone::fetch_token_info(&client, &body.mint_address) {
        Ok(info) => Ok(Json(json!({ "success": true, "data": info })).into_response()),
        Err(e) => Err(AppError::bad_request(e)),
    }
}

/// GET /api/v1/tokens — List all created tokens.
pub async fn list_tokens(State(state): State<TokenState>) -> Result<Response, AppError> {
    use cresus_db::repo::token_repo::TokenRepo;

    let tokens = TokenRepo::list_all(&state.db).await.map_err(|e| {
        tracing::error!("DB error: {:?}", e);
        AppError::internal("Database error")
    })?;

    let data: Vec<_> = tokens
        .iter()
        .map(|t| {
            json!({
                "id": t.id,
                "mint_address": t.mint_address,
                "name": t.name,
                "symbol": t.symbol,
                "decimals": t.decimals,
                "supply": t.supply,
                "metadata_uri": t.metadata_uri,
                "creator_wallet_id": t.creator_wallet_id,
                "tx_signature": t.tx_signature,
                "created_at": t.created_at,
            })
        })
        .collect();
    Ok(Json(json!({ "success": true, "data": data })).into_response())
}

// --- Vanity address endpoints ---

#[derive(Debug, Deserialize)]
pub struct VanityStartRequest {
    pub prefix: Option<String>,
    pub suffix: Option<String>,
    #[serde(default)]
    pub case_insensitive: bool,
    #[serde(default)]
    pub threads: usize,
}

/// POST /api/v1/tokens/vanity/start — Start a vanity address grind task.
pub async fn vanity_start(
    State(state): State<TokenState>,
    Json(body): Json<VanityStartRequest>,
) -> Result<Response, AppError> {
    let config = VanityConfig {
        prefix: body.prefix,
        suffix: body.suffix,
        case_insensitive: body.case_insensitive,
        threads: body.threads,
    };

    let difficulty = vanity::estimate_difficulty(&config);
    let task_id = vanity::start_vanity_task(state.db, config, state.master_key).await?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "task_id": task_id,
            "estimated_difficulty": difficulty,
        }
    }))
    .into_response())
}

/// GET /api/v1/tokens/vanity/{task_id} — Check vanity grind status.
pub async fn vanity_status(
    State(state): State<TokenState>,
    axum::extract::Path(task_id): axum::extract::Path<String>,
) -> Result<Response, AppError> {
    use cresus_db::repo::task_repo::TaskRepo;

    let task = TaskRepo::get_by_id(&state.db, task_id)
        .await
        .map_err(|e| {
            tracing::error!("DB error: {:?}", e);
            AppError::internal("Database error")
        })?
        .ok_or_else(|| AppError::not_found("Task not found"))?;

    let result = task
        .result_json
        .as_deref()
        .and_then(|r| serde_json::from_str::<serde_json::Value>(r).ok());

    Ok(Json(json!({
        "success": true,
        "data": {
            "task_id": task.id,
            "status": task.status,
            "progress": task.progress,
            "result": result,
            "error": task.error,
            "created_at": task.created_at,
            "updated_at": task.updated_at,
        }
    }))
    .into_response())
}
