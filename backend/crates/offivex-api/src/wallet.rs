use axum::{
    extract::{Path, State},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

use crate::error::AppError;
use crate::types::*;
use offivex_core::wallet::manager::WalletManager;

fn to_response(w: &offivex_db::models::Wallet) -> WalletResponse {
    WalletResponse {
        id: w.id.clone(),
        name: w.name.clone(),
        public_key: w.public_key.clone(),
        group_id: w.group_id.clone(),
        parent_id: w.parent_id.clone(),
        created_at: w.created_at,
    }
}

/// POST /api/v1/auth/setup — First-time password setup (returns seed phrase).
pub async fn setup_password(
    State(mgr): State<WalletManager>,
    Json(body): Json<SetupPasswordRequest>,
) -> Result<Response, AppError> {
    crate::validation::validate_password(&body.password)
        .map_err(|e| AppError::bad_request(&e))?;

    let mnemonic = mgr.setup_password(&body.password).await?;
    Ok(Json(json!({
        "success": true,
        "data": { "mnemonic": mnemonic }
    })).into_response())
}

/// POST /api/v1/auth/unlock — Unlock with password.
pub async fn unlock(
    State(mgr): State<WalletManager>,
    Json(body): Json<UnlockRequest>,
) -> Result<Response, AppError> {
    crate::metrics::inc_unlock_attempt();
    match mgr.unlock(&body.password).await {
        Ok(()) => Ok(Json(json!({ "success": true })).into_response()),
        Err(e) => {
            crate::metrics::inc_unlock_failure();
            Err(e.into())
        }
    }
}

/// POST /api/v1/auth/lock — Lock the app.
pub async fn lock(State(mgr): State<WalletManager>) -> Response {
    mgr.lock().await;
    Json(json!({ "success": true })).into_response()
}

/// GET /api/v1/auth/status — Check password setup and unlock status.
pub async fn auth_status(State(mgr): State<WalletManager>) -> Response {
    let password_set = mgr.is_password_set().await.unwrap_or(false);
    let unlocked = mgr.is_unlocked().await;
    Json(json!({
        "success": true,
        "data": {
            "password_set": password_set,
            "unlocked": unlocked,
        }
    }))
    .into_response()
}

/// POST /api/v1/wallets — Create a new wallet.
pub async fn create_wallet(
    State(mgr): State<WalletManager>,
    Json(body): Json<CreateWalletRequest>,
) -> Result<Json<ApiResponse<WalletResponse>>, AppError> {
    let w = mgr.create_wallet(body.name, body.group_id).await?;
    Ok(Json(ApiResponse::ok(to_response(&w))))
}

/// GET /api/v1/wallets — List all wallets.
pub async fn list_wallets(
    State(mgr): State<WalletManager>,
) -> Result<Json<ApiResponse<Vec<WalletResponse>>>, AppError> {
    let wallets = mgr.list_wallets().await?;
    let data: Vec<WalletResponse> = wallets.iter().map(to_response).collect();
    Ok(Json(ApiResponse::ok(data)))
}

/// GET /api/v1/wallets/:id — Get wallet by ID.
pub async fn get_wallet(
    State(mgr): State<WalletManager>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<WalletResponse>>, AppError> {
    let w = mgr.get_wallet(&id).await?;
    Ok(Json(ApiResponse::ok(to_response(&w))))
}

/// DELETE /api/v1/wallets/:id — Delete a wallet.
pub async fn delete_wallet(
    State(mgr): State<WalletManager>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let deleted = mgr.delete_wallet(&id).await?;
    Ok(Json(ApiResponse::ok(deleted)))
}

/// POST /api/v1/wallets/:id/subwallets — Generate sub-wallets.
pub async fn create_subwallets(
    State(mgr): State<WalletManager>,
    Path(id): Path<String>,
    Json(body): Json<CreateSubwalletsRequest>,
) -> Result<Json<ApiResponse<Vec<WalletResponse>>>, AppError> {
    if body.count == 0 || body.count > crate::validation::MAX_SUBWALLET_COUNT {
        return Err(AppError::bad_request(format!(
            "count must be between 1 and {}",
            crate::validation::MAX_SUBWALLET_COUNT
        )));
    }
    let wallets = mgr.create_subwallets(&id, body.count, None).await?;
    let data: Vec<WalletResponse> = wallets.iter().map(to_response).collect();
    Ok(Json(ApiResponse::ok(data)))
}

/// POST /api/v1/wallets/:id/export — Export secret key (encrypted with export password).
pub async fn export_wallet(
    State(mgr): State<WalletManager>,
    Path(id): Path<String>,
    Json(body): Json<ExportWalletRequest>,
) -> Result<Response, AppError> {
    crate::validation::validate_password(&body.export_password)
        .map_err(|e| AppError::bad_request(&format!("Export password invalid: {}", e)))?;

    let encrypted_export = mgr.export_secret_key(&id, &body.export_password).await?;
    Ok(Json(json!({ "success": true, "data": { "encrypted_key": encrypted_export } }))
        .into_response())
}

/// POST /api/v1/wallet-groups — Create a group.
pub async fn create_group(
    State(mgr): State<WalletManager>,
    Json(body): Json<CreateGroupRequest>,
) -> Result<Response, AppError> {
    let g = mgr.create_group(&body.name).await?;
    Ok(
        Json(json!({ "success": true, "data": { "id": g.id, "name": g.name, "created_at": g.created_at } }))
            .into_response(),
    )
}

/// GET /api/v1/wallet-groups — List groups.
pub async fn list_groups(
    State(mgr): State<WalletManager>,
) -> Result<Response, AppError> {
    let groups = mgr.list_groups().await?;
    let data: Vec<_> = groups
        .iter()
        .map(|g| json!({ "id": g.id, "name": g.name, "created_at": g.created_at }))
        .collect();
    Ok(Json(json!({ "success": true, "data": data })).into_response())
}

/// GET /api/v1/wallets/{id}/balance — Get wallet balance (SOL + tokens).
pub async fn get_wallet_balance(
    State((mgr, rpc_mgr)): State<(WalletManager, offivex_core::rpc::manager::RpcManager)>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let (rpc_client, _) = rpc_mgr.get_client().await
        .map_err(|e| AppError::internal(&format!("RPC error: {}", e)))?;

    let balance = mgr.get_wallet_balance(&id, &rpc_client).await?;
    Ok(Json(json!({ "success": true, "data": balance })).into_response())
}

/// POST /api/v1/wallets/{id}/send — Send SOL or tokens from wallet.
pub async fn send_from_wallet(
    State((mgr, rpc_mgr)): State<(WalletManager, offivex_core::rpc::manager::RpcManager)>,
    Path(id): Path<String>,
    Json(body): Json<SendTransactionRequest>,
) -> Result<Response, AppError> {
    // Validate recipient address
    crate::validation::validate_solana_address(&body.to_address)
        .map_err(|e| AppError::bad_request(&format!("Invalid recipient address: {}", e)))?;

    // Validate mint address if sending tokens
    if let Some(ref mint) = body.mint_address {
        crate::validation::validate_solana_address(mint)
            .map_err(|e| AppError::bad_request(&format!("Invalid mint address: {}", e)))?;
    }

    // Validate amount is not zero
    if body.amount == 0 {
        return Err(AppError::bad_request("Amount must be greater than zero"));
    }

    // Log the underlying RPC failure server-side. The generic 500 returned to
    // the browser is intentional (don't leak internals), but without a log on
    // this side the operator sees only `tower_http` "Status code: 500" with
    // no clue whether it was NoEndpoints, AllUnreachable, or a real RPC fault.
    let (rpc_client, _) = rpc_mgr.get_client().await.map_err(|e| {
        tracing::error!(
            wallet_id = %id,
            recipient = %body.to_address,
            "wallets/send: RPC get_client failed: {}",
            e
        );
        AppError::internal(format!("RPC error: {}", e))
    })?;

    let signature = if let Some(mint) = body.mint_address {
        // Send tokens
        mgr.send_token_from_wallet(&id, &body.to_address, &mint, body.amount, &rpc_client).await?
    } else {
        // Send SOL
        mgr.send_sol_from_wallet(&id, &body.to_address, body.amount, &rpc_client).await?
    };

    Ok(Json(json!({
        "success": true,
        "data": { "signature": signature }
    })).into_response())
}

/// GET /api/v1/auth/seed-phrase — Get the seed phrase (requires unlock).
///
/// The response sets `Cache-Control: no-store` so no intermediate proxy or
/// browser back-button cache ever persists the plaintext mnemonic.
pub async fn get_seed_phrase(
    State(mgr): State<WalletManager>,
) -> Result<Response, AppError> {
    let mnemonic = mgr.get_seed_phrase().await?;
    let mut response = Json(json!({
        "success": true,
        "data": { "mnemonic": mnemonic }
    }))
    .into_response();
    response.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-store, no-cache, must-revalidate, max-age=0"),
    );
    response.headers_mut().insert(
        axum::http::header::PRAGMA,
        axum::http::HeaderValue::from_static("no-cache"),
    );
    Ok(response)
}

/// POST /api/v1/auth/restore — Restore from seed phrase.
pub async fn restore_from_seed(
    State(mgr): State<WalletManager>,
    Json(body): Json<RestoreFromSeedRequest>,
) -> Result<Response, AppError> {
    crate::validation::validate_password(&body.password)
        .map_err(|e| AppError::bad_request(&e))?;

    mgr.restore_from_seed_phrase(&body.mnemonic, &body.password, body.wipe_old_wallets)
        .await?;
    Ok(Json(json!({ "success": true })).into_response())
}
