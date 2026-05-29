//! Admin authentication HTTP handlers: login / logout / me.
//!
//! Stateless: the issued token is the credential. We store `sha256(token)` in
//! `admin_sessions` and look it up on each protected request via the
//! `require_admin` middleware (in Offivex-server).
//!
//! NOTE: This module does NOT bake any rate-limiter — apply rate limiting
//! at the router level (see router.rs).

use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Extension, Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio_rusqlite::Connection;
use uuid::Uuid;

use crate::error::AppError;
use offivex_db::repo::admin_repo::AdminRepo;
use offivex_db::repo::admin_session_repo::AdminSessionRepo;
use offivex_db::repo::audit_repo::AuditRepo;

#[derive(Clone)]
pub struct AdminAuthHandlerState {
    pub db: Arc<Connection>,
    pub session_ttl_secs: i64,
}

// ── Login ───────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub expires_at: i64,
    pub admin: AdminMe,
}

pub async fn admin_login(
    State(state): State<AdminAuthHandlerState>,
    Json(body): Json<LoginRequest>,
) -> Result<Response, AppError> {
    let username = body.username.trim().to_string();
    if username.is_empty() || body.password.is_empty() {
        return Err(AppError::bad_request("username and password required"));
    }

    let admin = match AdminRepo::find_by_username(&state.db, &username).await? {
        Some(a) => a,
        None => {
            // Generic message to avoid leaking which usernames exist
            return Err(AppError::unauthorized("Invalid credentials"));
        }
    };

    let ok = offivex_crypto::verify_password_phc(&body.password, &admin.password_hash)
        .map_err(|e| AppError::internal(format!("password verify: {e}")))?;
    if !ok {
        return Err(AppError::unauthorized("Invalid credentials"));
    }

    // Issue a session token
    let token = crate::admin_auth::generate_session_token();
    let token_hash = sha256_hex(&token);
    let session_id = Uuid::new_v4().to_string();

    let session = AdminSessionRepo::create(
        &state.db,
        &session_id,
        &admin.id,
        &token_hash,
        state.session_ttl_secs,
    )
    .await?;

    AdminRepo::update_last_login(&state.db, &admin.id).await?;

    // Audit
    let _ = AuditRepo::insert_full(
        &state.db,
        "admin_login",
        &format!("admin '{}' logged in", admin.username),
        None,
        None,
        Some(&admin.id),
        None,
        None,
    )
    .await;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "data": LoginResponse {
                token,
                expires_at: session.expires_at,
                admin: AdminMe { id: admin.id, username: admin.username },
            }
        })),
    )
        .into_response())
}

// ── Logout ──────────────────────────────────────────────────────────────

pub async fn admin_logout(
    State(state): State<AdminAuthHandlerState>,
    Extension(ctx): Extension<AdminCtxExt>,
) -> Result<Response, AppError> {
    AdminSessionRepo::delete_by_token_hash(&state.db, &ctx.token_hash).await?;
    let _ = AuditRepo::insert_full(
        &state.db,
        "admin_logout",
        &format!("admin '{}' logged out", ctx.username),
        None,
        None,
        Some(&ctx.admin_id),
        None,
        None,
    )
    .await;
    Ok(Json(json!({ "success": true })).into_response())
}

// ── Me ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct AdminMe {
    pub id: String,
    pub username: String,
}

pub async fn admin_me(
    Extension(ctx): Extension<AdminCtxExt>,
) -> Result<Response, AppError> {
    Ok(Json(json!({
        "success": true,
        "data": AdminMe { id: ctx.admin_id, username: ctx.username }
    }))
    .into_response())
}

// ── Helpers ─────────────────────────────────────────────────────────────

/// Mirror of `offivex_server::auth::AdminCtx` exposed via request extensions.
/// We define our own type here so Offivex-api doesn't depend on Offivex-server.
/// The require_admin middleware in Offivex-server inserts THIS type into
/// extensions for handlers in Offivex-api to extract.
///
/// Includes `token_hash` so logout can invalidate the session without
/// re-extracting the bearer header.
#[derive(Clone, Debug)]
pub struct AdminCtxExt {
    pub admin_id: String,
    pub username: String,
    pub token_hash: String,
}

pub fn sha256_hex(token: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(token.as_bytes());
    hex::encode(h.finalize())
}

pub fn generate_session_token() -> String {
    use base64::Engine;
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}
