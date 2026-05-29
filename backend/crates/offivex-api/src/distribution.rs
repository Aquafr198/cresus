use axum::{
    extract::{Extension, Path, State},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_rusqlite::Connection;

use crate::error::AppError;
use crate::user::UserCtxExt;
use offivex_core::distribution::anti_bubble::{
    AntiBubbleConfig, AmountVariation, DistributionStrategy, TimingVariation,
};
use offivex_core::distribution::disperser::{self, ChainBuyConfig, DistributionRequest};
use offivex_core::rpc::manager::RpcManager;
use offivex_crypto::SecretBytes;
use offivex_db::repo::audit_repo::AuditRepo;
use offivex_db::repo::distribution_repo::{DistributionClaim, DistributionRepo};

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
    // Belt-and-braces dust guard: a value like 1e-12 SOL passes the >0 check
    // above but rounds to 0 lamports via the (sol * 1e9) as u64 conversion.
    // Catch it here so the user gets a clear 400 instead of a silent zero-
    // SOL distribution that "succeeds" with no observable on-chain effect.
    let req = body.to_distribution_request();
    if req.total_lamports == 0 {
        return Err(AppError::bad_request(
            "total_sol rounds to 0 lamports — increase the amount",
        ));
    }

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

/// Optional body for the execute endpoint — when present, chains a
/// coordinated token buy on every target wallet right after the SOL
/// distribution lands. Closes the Kinesis-style "fonds ET achats"
/// workflow gap in one server-side orchestration so the user only
/// presses Execute once.
#[derive(Debug, Deserialize)]
pub struct ExecuteRequest {
    #[serde(default)]
    pub chain_buy: Option<ChainBuyConfig>,
}

/// POST /api/v1/distributions/:id/execute — Execute a planned distribution.
///
/// Optional body: `{ "chain_buy": { "mint": "...", "percent": 80,
/// "slippage_bps": 1500 } }`. When provided, each target wallet that
/// successfully received its share will fan out a Jupiter swap of
/// `percent`% of its post-distribution SOL balance into the mint.
pub async fn execute(
    State(state): State<DistributionState>,
    Extension(user_ctx): Extension<UserCtxExt>,
    Path(id): Path<String>,
    body: Option<Json<ExecuteRequest>>,
) -> Result<Response, AppError> {
    let chain_buy = body.and_then(|Json(b)| b.chain_buy);

    // Validate the chain_buy body before spawning so the user gets a 400
    // synchronously on bad input (rather than failing later in the
    // background task with no clear error path).
    if let Some(ref cb) = chain_buy {
        crate::validation::validate_solana_address(&cb.mint)
            .map_err(|e| AppError::bad_request(format!("chain_buy.mint invalid: {}", e)))?;
        if !(1..=100).contains(&cb.percent) {
            return Err(AppError::bad_request(
                "chain_buy.percent must be in 1..=100",
            ));
        }
        if !(1..=5000).contains(&cb.slippage_bps) {
            return Err(AppError::bad_request(
                "chain_buy.slippage_bps must be in 1..=5000",
            ));
        }
    }

    // Atomic status transition: claim ownership of this distribution by
    // updating status='planned' → 'executing' in a single UPDATE that returns
    // the number of rows touched. Whichever HTTP request hits the DB second
    // sees 0 rows changed and returns 409 Conflict — preventing the
    // duplicate-spend that the pre-refactor check-then-spawn allowed (two
    // concurrent POSTs both saw status='planned', both spawned executors,
    // both moved funds).
    let claimed = DistributionRepo::claim_for_execution(&state.db, id.clone())
        .await
        .map_err(|e| {
            tracing::error!("DB error claiming distribution {}: {:?}", id, e);
            AppError::internal("Database error")
        })?;
    let dist = match claimed {
        DistributionClaim::Claimed(d) => d,
        DistributionClaim::NotFound => return Err(AppError::not_found("Distribution not found")),
        DistributionClaim::WrongStatus(status) => {
            return Err(AppError::conflict(format!(
                "Distribution is {status}, not planned"
            )));
        }
    };

    // Audit SEC-MAX-3 — data-plane forensic audit. Logged AFTER the claim
    // succeeds so the audit row reflects the unique winning request. Failure
    // is now surfaced via warn instead of `let _ =` so operators see when
    // the audit pipeline silently drops events (DB locked, disk full).
    let chain_buy_audit = chain_buy
        .as_ref()
        .map(|cb| format!(" chain_buy=true mint={} percent={}", cb.mint, cb.percent))
        .unwrap_or_default();
    if let Err(e) = AuditRepo::insert_full(
        &state.db,
        "user_op_distribution_execute",
        &format!(
            "distribution_id={} source_wallet={} strategy={} total_sol={}{}",
            dist.id, dist.source_wallet_id, dist.strategy, dist.total_sol, chain_buy_audit
        ),
        None,
        None,
        None,
        Some(&user_ctx.user_id),
        None,
    )
    .await
    {
        tracing::warn!(
            distribution_id = %dist.id,
            user_id = %user_ctx.user_id,
            error = %e,
            "audit log insert failed for user_op_distribution_execute",
        );
    }

    // Spawn execution in background so the HTTP response returns immediately
    let db = state.db.clone();
    let rpc = state.rpc.clone();
    let master_key = state.master_key.clone();
    let dist_id = id.clone();
    let chain_buy_spawned = chain_buy.clone();

    tokio::spawn(async move {
        if let Err(e) =
            disperser::execute_distribution(&db, &rpc, &master_key, &dist_id).await
        {
            tracing::error!("Distribution {} execution error: {:?}", dist_id, e);
            return;
        }
        // After the SOL distribution lands, run the chain-buy fan-out if
        // requested. Results are persisted into the distribution row's
        // `result_json` blob so the frontend can poll status and render
        // per-wallet outcomes.
        if let Some(cb) = chain_buy_spawned {
            match disperser::chain_buy_after_distribution(&db, &rpc, &master_key, &dist_id, &cb)
                .await
            {
                Ok(buy_results) => {
                    tracing::info!(
                        distribution_id = %dist_id,
                        successful = buy_results.successful,
                        failed = buy_results.failed,
                        elapsed_ms = buy_results.elapsed_ms,
                        "chain_buy fan-out completed"
                    );
                    // Merge into result_json — preserve the existing
                    // distribution counts then append chain_buy block.
                    if let Ok(Some(current)) =
                        DistributionRepo::get_by_id(&db, dist_id.clone()).await
                    {
                        let mut blob: serde_json::Value = current
                            .result_json
                            .as_deref()
                            .and_then(|s| serde_json::from_str(s).ok())
                            .unwrap_or_else(|| serde_json::json!({}));
                        if let serde_json::Value::Object(ref mut map) = blob {
                            map.insert(
                                "chain_buy".to_string(),
                                serde_json::to_value(&buy_results).unwrap_or(
                                    serde_json::json!({"error": "serialize failed"}),
                                ),
                            );
                        }
                        let _ = DistributionRepo::update_status(
                            &db,
                            dist_id.clone(),
                            current.status,
                            current.error_message,
                            Some(blob.to_string()),
                            current.executed_at,
                        )
                        .await;
                    }
                }
                Err(e) => {
                    tracing::error!(
                        "Distribution {} chain_buy error: {:?}",
                        dist_id,
                        e
                    );
                }
            }
        }
    });

    Ok(Json(json!({
        "success": true,
        "data": { "distribution_id": id, "status": "executing", "chain_buy": chain_buy.is_some() }
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
