use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;

use cresus_core::rpc::manager::RpcManager;

#[derive(Debug, Deserialize)]
pub struct AddEndpointRequest {
    pub name: String,
    pub url: String,
    pub ws_url: Option<String>,
    pub weight: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct SetActiveRequest {
    pub active: bool,
}

/// POST /api/v1/rpc — Add a new RPC endpoint.
pub async fn add_endpoint(
    State(mgr): State<RpcManager>,
    Json(body): Json<AddEndpointRequest>,
) -> Response {
    match mgr
        .add_endpoint(&body.name, &body.url, body.ws_url.as_deref(), body.weight.unwrap_or(1))
        .await
    {
        Ok(ep) => Json(json!({ "success": true, "data": {
            "id": ep.id, "name": ep.name, "url": ep.url,
            "ws_url": ep.ws_url, "weight": ep.weight,
            "is_active": ep.is_active, "created_at": ep.created_at,
        }}))
        .into_response(),
        Err(e) => {
            tracing::error!("RPC error: {:?}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

/// GET /api/v1/rpc — List all RPC endpoints.
pub async fn list_endpoints(State(mgr): State<RpcManager>) -> Response {
    match mgr.list_endpoints().await {
        Ok(endpoints) => {
            let data: Vec<_> = endpoints
                .iter()
                .map(|ep| {
                    json!({
                        "id": ep.id, "name": ep.name, "url": ep.url,
                        "ws_url": ep.ws_url, "weight": ep.weight,
                        "is_active": ep.is_active == 1,
                        "last_latency_ms": ep.last_latency_ms,
                        "created_at": ep.created_at,
                    })
                })
                .collect();
            Json(json!({ "success": true, "data": data })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// DELETE /api/v1/rpc/:id — Delete an RPC endpoint.
pub async fn delete_endpoint(
    State(mgr): State<RpcManager>,
    Path(id): Path<String>,
) -> Response {
    match mgr.delete_endpoint(&id).await {
        Ok(deleted) => Json(json!({ "success": true, "data": deleted })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// PUT /api/v1/rpc/:id/active — Toggle endpoint active state.
pub async fn set_active(
    State(mgr): State<RpcManager>,
    Path(id): Path<String>,
    Json(body): Json<SetActiveRequest>,
) -> Response {
    match mgr.set_active(&id, body.active).await {
        Ok(()) => Json(json!({ "success": true })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// POST /api/v1/rpc/health — Run health checks on all active endpoints.
pub async fn health_check(State(mgr): State<RpcManager>) -> Response {
    match mgr.health_check_all().await {
        Ok(results) => Json(json!({ "success": true, "data": results })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        )
            .into_response(),
    }
}
