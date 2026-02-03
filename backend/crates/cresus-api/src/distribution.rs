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
use cresus_core::distribution::anti_bubble::{
    AntiBubbleConfig, AmountVariation, DistributionStrategy, TimingVariation,
};
use cresus_core::distribution::disperser::{self, DistributionRequest};
use cresus_core::rpc::manager::RpcManager;
use cresus_crypto::SecretBytes;
use cresus_db::repo::distribution_repo::DistributionRepo;

/// Shared state for distribution handlers.
#[derive(Clone)]
pub struct DistributionState {
    pub db: Arc<Connection>,
    pub rpc: RpcManager,
    pub master_key: Arc<RwLock<Option<SecretBytes>>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDistributionRequest {
    pub source_wallet_id: String,
    pub target_wallet_ids: Vec<String>,
    /// Total SOL to distribute (in SOL, will be converted to lamports).
    pub total_sol: f64,
    /// Strategy: "direct", "multi_hop", or "layered".
    pub strategy: Option<String>,
    /// Multi-hop: number of hops.
    pub hops: Option<usize>,
    /// Layered: batch size.
    pub batch_size: Option<usize>,
    /// Layered: delay between batches in ms.
    pub batch_delay_ms: Option<u64>,
    /// Whether to vary amounts.
    pub vary_amounts: Option<bool>,
    /// Amount deviation percentage (0.0–1.0).
    pub amount_deviation: Option<f64>,
    /// Whether to add timing delays.
    pub vary_timing: Option<bool>,
    /// Min delay ms.
    pub min_delay_ms: Option<u64>,
    /// Max delay ms.
    pub max_delay_ms: Option<u64>,
}

impl CreateDistributionRequest {
    fn to_distribution_request(&self) -> DistributionRequest {
        let total_lamports = (self.total_sol * 1e9) as u64;

        let strategy = match self.strategy.as_deref() {
            Some("multi_hop") => DistributionStrategy::MultiHop {
                hops: self.hops.unwrap_or(1),
            },
            Some("layered") => DistributionStrategy::Layered {
                batch_size: self.batch_size.unwrap_or(3),
                batch_delay_ms: self.batch_delay_ms.unwrap_or(10000),
            },
            _ => DistributionStrategy::Direct,
        };

        let amount_variation = AmountVariation {
            enabled: self.vary_amounts.unwrap_or(true),
            max_deviation_pct: self.amount_deviation.unwrap_or(0.15),
        };

        let timing_variation = TimingVariation {
            enabled: self.vary_timing.unwrap_or(true),
            min_delay_ms: self.min_delay_ms.unwrap_or(500),
            max_delay_ms: self.max_delay_ms.unwrap_or(5000),
        };

        DistributionRequest {
            source_wallet_id: self.source_wallet_id.clone(),
            target_wallet_ids: self.target_wallet_ids.clone(),
            total_lamports,
            config: AntiBubbleConfig {
                strategy,
                amount_variation,
                timing_variation,
            },
        }
    }
}

/// POST /api/v1/distributions/plan — Create a distribution plan (without executing).
pub async fn create_plan(
    State(state): State<DistributionState>,
    Json(body): Json<CreateDistributionRequest>,
) -> Result<Response, AppError> {
    if !body.total_sol.is_finite() || body.total_sol <= 0.0 {
        return Err(AppError::bad_request(
            "total_sol must be a positive finite number",
        ));
    }
    if body.target_wallet_ids.is_empty() {
        return Err(AppError::bad_request(
            "target_wallet_ids must not be empty",
        ));
    }
    let req = body.to_distribution_request();

    let plan = disperser::create_plan(&state.db, &req).await?;
    Ok(Json(json!({
        "success": true,
        "data": {
            "distribution_id": plan.distribution_id,
            "strategy": plan.strategy,
            "total_lamports": plan.total_lamports,
            "num_transfers": plan.num_transfers,
            "transfers": plan.transfers.iter().map(|t| json!({
                "from_wallet_id": t.from_wallet_id,
                "to_wallet_id": t.to_wallet_id,
                "amount_lamports": t.amount_lamports,
                "amount_sol": t.amount_lamports as f64 / 1e9,
                "hop_index": t.hop_index,
                "delay_ms": t.delay_ms,
            })).collect::<Vec<_>>(),
        }
    }))
    .into_response())
}

/// POST /api/v1/distributions/:id/execute — Execute a planned distribution.
pub async fn execute(
    State(state): State<DistributionState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let dist = DistributionRepo::get_by_id(&state.db, id.clone())
        .await
        .map_err(|e| {
            tracing::error!("DB error: {:?}", e);
            AppError::internal("Database error")
        })?
        .ok_or_else(|| AppError::not_found("Distribution not found"))?;

    if dist.status != "planned" {
        return Err(AppError::bad_request(format!(
            "Distribution is {}, not planned",
            dist.status
        )));
    }

    // Spawn execution in background so the HTTP response returns immediately
    let db = state.db.clone();
    let rpc = state.rpc.clone();
    let master_key = state.master_key.clone();
    let dist_id = id.clone();

    tokio::spawn(async move {
        if let Err(e) = disperser::execute_distribution(&db, &rpc, &master_key, &dist_id).await {
            tracing::error!("Distribution {} execution error: {:?}", dist_id, e);
        }
    });

    Ok(Json(json!({
        "success": true,
        "data": { "distribution_id": id, "status": "executing" }
    }))
    .into_response())
}

/// POST /api/v1/distributions/:id/resume — Resume a failed/partial/executing distribution.
pub async fn resume(
    State(state): State<DistributionState>,
    Path(id): Path<String>,
    Json(body): Json<ResumeRequest>,
) -> Result<Response, AppError> {
    let dist = DistributionRepo::get_by_id(&state.db, id.clone())
        .await
        .map_err(|e| {
            tracing::error!("DB error: {:?}", e);
            AppError::internal("Database error")
        })?
        .ok_or_else(|| AppError::not_found("Distribution not found"))?;

    match dist.status.as_str() {
        "partial" | "failed" | "executing" => {}
        other => {
            return Err(AppError::bad_request(format!(
                "Cannot resume distribution with status '{}'. Must be partial, failed, or executing.",
                other
            )));
        }
    }

    // Optionally reset failed transfers back to pending
    if body.retry_failed.unwrap_or(false) {
        let reset_count = DistributionRepo::reset_failed_transfers(&state.db, id.clone())
            .await
            .map_err(|e| {
                tracing::error!("DB error: {:?}", e);
                AppError::internal("Database error")
            })?;
        tracing::info!("Reset {} failed transfers to pending for distribution {}", reset_count, id);
    }

    // Spawn execution in background
    let db = state.db.clone();
    let rpc = state.rpc.clone();
    let master_key = state.master_key.clone();
    let dist_id = id.clone();

    tokio::spawn(async move {
        if let Err(e) = disperser::execute_distribution(&db, &rpc, &master_key, &dist_id).await {
            tracing::error!("Distribution {} resume error: {:?}", dist_id, e);
        }
    });

    Ok(Json(json!({
        "success": true,
        "data": { "distribution_id": id, "status": "resuming" }
    }))
    .into_response())
}

#[derive(Debug, Deserialize)]
pub struct ResumeRequest {
    /// If true, reset "failed" transfers to "pending" before resuming.
    pub retry_failed: Option<bool>,
}

/// GET /api/v1/distributions — List all distributions.
pub async fn list_distributions(
    State(state): State<DistributionState>,
) -> Result<Response, AppError> {
    let dists = DistributionRepo::list_all(&state.db).await.map_err(|e| {
        tracing::error!("DB error: {:?}", e);
        AppError::internal("Database error")
    })?;

    let data: Vec<_> = dists
        .iter()
        .map(|d| {
            json!({
                "id": d.id,
                "source_wallet_id": d.source_wallet_id,
                "strategy": d.strategy,
                "status": d.status,
                "total_sol": d.total_sol as f64 / 1e9,
                "total_lamports": d.total_sol,
                "error_message": d.error_message,
                "result_json": d.result_json.as_ref().and_then(|r| serde_json::from_str::<serde_json::Value>(r).ok()),
                "created_at": d.created_at,
                "executed_at": d.executed_at,
            })
        })
        .collect();
    Ok(Json(json!({ "success": true, "data": data })).into_response())
}

/// GET /api/v1/distributions/:id — Get distribution details with transfers.
pub async fn get_distribution(
    State(state): State<DistributionState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let dist = DistributionRepo::get_by_id(&state.db, id.clone())
        .await
        .map_err(|e| {
            tracing::error!("DB error: {:?}", e);
            AppError::internal("Database error")
        })?
        .ok_or_else(|| AppError::not_found("Distribution not found"))?;

    let transfers = DistributionRepo::list_transfers(&state.db, id)
        .await
        .map_err(|e| {
            tracing::error!("DB error: {:?}", e);
            AppError::internal("Database error")
        })?;

    let transfer_data: Vec<_> = transfers
        .iter()
        .map(|t| {
            json!({
                "id": t.id,
                "from_wallet_id": t.from_wallet_id,
                "to_wallet_id": t.to_wallet_id,
                "amount_lamports": t.amount_lamports,
                "amount_sol": t.amount_lamports as f64 / 1e9,
                "hop_index": t.hop_index,
                "delay_ms": t.delay_ms,
                "status": t.status,
                "tx_signature": t.tx_signature,
                "error_message": t.error_message,
                "executed_at": t.executed_at,
            })
        })
        .collect();

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": dist.id,
            "source_wallet_id": dist.source_wallet_id,
            "strategy": dist.strategy,
            "status": dist.status,
            "total_sol": dist.total_sol as f64 / 1e9,
            "config": dist.config_json.parse::<serde_json::Value>().ok(),
            "result": dist.result_json.as_ref().and_then(|r| r.parse::<serde_json::Value>().ok()),
            "error_message": dist.error_message,
            "created_at": dist.created_at,
            "executed_at": dist.executed_at,
            "transfers": transfer_data,
        }
    }))
    .into_response())
}
