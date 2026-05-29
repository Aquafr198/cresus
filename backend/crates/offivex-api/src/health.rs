use axum::{
    extract::State,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use std::sync::Arc;
use std::time::Instant;
use tokio_rusqlite::Connection;

use offivex_core::rpc::manager::RpcManager;
use offivex_db::repo::dlq_repo::DlqRepo;

use crate::error::AppError;

/// Shared state for health check
#[derive(Clone)]
pub struct HealthState {
    pub db: Arc<Connection>,
    pub rpc: RpcManager,
}

/// GET /api/v1/health/detailed — Detailed system health
pub async fn detailed_health(State(state): State<HealthState>) -> Result<Response, AppError> {
    let start = Instant::now();

    // 1. Database health
    let db_healthy = state
        .db
        .call(|c| {
            c.query_row("SELECT 1", [], |_| Ok(()))?;
            Ok(())
        })
        .await
        .is_ok();

    let db_latency_ms = start.elapsed().as_millis() as u64;

    // 2. RPC health
    let rpc_results = state.rpc.health_check_all().await.unwrap_or_default();
    let rpc_healthy = rpc_results.iter().any(|r| r.healthy);
    let rpc_endpoints_up = rpc_results.iter().filter(|r| r.healthy).count();
    let rpc_endpoints_total = rpc_results.len();

    // 3. DLQ stats
    let dlq_counts = DlqRepo::count_by_status(&state.db)
        .await
        .unwrap_or_default();
    let dlq_pending: i64 = dlq_counts
        .iter()
        .filter(|(s, _)| s == "pending")
        .map(|(_, c)| *c)
        .sum();
    let dlq_exhausted: i64 = dlq_counts
        .iter()
        .filter(|(s, _)| s == "exhausted")
        .map(|(_, c)| *c)
        .sum();

    // 4. Overall status
    let overall = if db_healthy && rpc_healthy {
        "healthy"
    } else if db_healthy {
        "degraded"
    } else {
        "unhealthy"
    };

    let total_latency_ms = start.elapsed().as_millis() as u64;

    Ok(Json(json!({
        "status": overall,
        "version": env!("CARGO_PKG_VERSION"),
        "checks": {
            "database": {
                "healthy": db_healthy,
                "latency_ms": db_latency_ms,
            },
            "rpc": {
                "healthy": rpc_healthy,
                "endpoints_up": rpc_endpoints_up,
                "endpoints_total": rpc_endpoints_total,
                "endpoints": rpc_results,
            },
            "dlq": {
                "pending": dlq_pending,
                "exhausted": dlq_exhausted,
                "attention_needed": dlq_pending + dlq_exhausted > 0,
            },
        },
        "response_time_ms": total_latency_ms,
    }))
    .into_response())
}
