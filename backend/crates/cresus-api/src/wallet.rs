use axum::{
    extract::{Path, State},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

use crate::error::AppError;
use crate::types::*;
use cresus_core::wallet::manager::WalletManager;

fn to_response(w: &cresus_db::models::Wallet) -> WalletResponse {
    WalletResponse {
        id: w.id.clone(),
        name: w.name.clone(),
        public_key: w.public_key.clone(),
        group_id: w.group_id.clone(),
        parent_id: w.parent_id.clone(),
        created_at: w.created_at,
    }
}

/// POST /api/v1/auth/setup — First-time password setup.
pub async fn setup_password(
    State(mgr): State<WalletManager>,
    Json(body): Json<SetupPasswordRequest>,
) -> Result<Response, AppError> {
    if body.password.len() < 8 {
        return Err(AppError::bad_request(
            "Password must be at least 8 characters",
        ));
    }
    mgr.setup_password(&body.password).await?;
    Ok(Json(json!({ "success": true })).into_response())
}

/// POST /api/v1/auth/unlock — Unlock with password.
pub async fn unlock(
    State(mgr): State<WalletManager>,
    Json(body): Json<UnlockRequest>,
) -> Result<Response, AppError> {
    mgr.unlock(&body.password).await?;
    Ok(Json(json!({ "success": true })).into_response())
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
    if body.export_password.len() < 8 {
        return Err(AppError::bad_request(
            "Export password must be at least 8 characters",
        ));
    }
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
