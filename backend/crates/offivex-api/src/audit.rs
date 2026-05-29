use std::sync::Arc;
use axum::{
    extract::{Query, State},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use tokio_rusqlite::Connection;

use crate::error::AppError;
use offivex_db::repo::audit_repo::AuditRepo;

#[derive(Clone)]
pub struct AuditState {
    pub db: Arc<Connection>,
}

#[derive(Debug, Deserialize)]
pub struct AuditQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_audit_log(
    State(state): State<AuditState>,
    Query(q): Query<AuditQuery>,
) -> Result<Response, AppError> {
    let limit = q.limit.unwrap_or(50).min(200);
    let offset = q.offset.unwrap_or(0);
    let entries = AuditRepo::list(&state.db, limit, offset).await
        .map_err(|e| AppError::internal(&format!("DB: {}", e)))?;
    Ok(Json(json!({ "success": true, "data": entries })).into_response())
}

/// Helper to log an audit entry from any handler that has access to a db connection.
pub async fn log_audit(
    db: &Connection,
    action: &str,
    detail: &str,
    wallet_id: Option<&str>,
    tx_signature: Option<&str>,
) {
    if let Err(e) = AuditRepo::insert(db, action, detail, wallet_id, tx_signature).await {
        tracing::warn!("Failed to write audit log: {}", e);
    }
}
