use axum::{
    extract::{Path, Query, State},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use tokio_rusqlite::Connection;

use crate::error::AppError;
use offivex_db::repo::dlq_repo::DlqRepo;

/// Shared state for DLQ handlers
#[derive(Clone)]
pub struct DlqState {
    pub db: Arc<Connection>,
}

#[derive(Debug, Deserialize)]
pub struct ListDlqQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
}

fn default_limit() -> i64 {
    50
}

/// GET /api/v1/dlq — List dead letter transactions
pub async fn list_dlq(
    State(state): State<DlqState>,
    Query(query): Query<ListDlqQuery>,
) -> Result<Response, AppError> {
    let entries = DlqRepo::list_all(&state.db, query.limit)
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

    let counts = DlqRepo::count_by_status(&state.db)
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

    let summary: serde_json::Map<String, serde_json::Value> = counts
        .into_iter()
        .map(|(k, v)| (k, serde_json::Value::from(v)))
        .collect();

    Ok(Json(json!({
        "success": true,
        "data": {
            "entries": entries,
            "summary": summary,
        }
    }))
    .into_response())
}

/// GET /api/v1/dlq/:id — Get a specific dead letter transaction
pub async fn get_dlq_entry(
    State(state): State<DlqState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let entry = DlqRepo::get_by_id(&state.db, id)
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?
        .ok_or_else(|| AppError::not_found("DLQ entry not found"))?;

    Ok(Json(json!({ "success": true, "data": entry })).into_response())
}

/// POST /api/v1/dlq/:id/dismiss — Dismiss a dead letter transaction
pub async fn dismiss_dlq_entry(
    State(state): State<DlqState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let dismissed = DlqRepo::dismiss(&state.db, id.clone())
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

    if !dismissed {
        return Err(AppError::bad_request(
            "Entry not found or not in dismissable state",
        ));
    }

    Ok(Json(json!({ "success": true, "data": { "id": id, "status": "dismissed" } })).into_response())
}

/// GET /api/v1/dlq/stats — Get DLQ summary statistics
pub async fn dlq_stats(State(state): State<DlqState>) -> Result<Response, AppError> {
    let counts = DlqRepo::count_by_status(&state.db)
        .await
        .map_err(|e| AppError::internal(&format!("Database error: {}", e)))?;

    let summary: serde_json::Map<String, serde_json::Value> = counts
        .into_iter()
        .map(|(k, v)| (k, serde_json::Value::from(v)))
        .collect();

    let total: i64 = summary.values().filter_map(|v| v.as_i64()).sum();

    Ok(Json(json!({
        "success": true,
        "data": {
            "total": total,
            "by_status": summary,
        }
    }))
    .into_response())
}
