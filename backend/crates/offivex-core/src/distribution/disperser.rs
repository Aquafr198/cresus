//! SOL dispersal execution engine.
//!
//! Takes a distribution plan (set of PlannedTransfers) and executes them
//! on-chain, respecting timing delays and recording results to the DB.

use rand::Rng;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_rusqlite::Connection;

use solana_sdk::{
    commitment_config::CommitmentConfig,
    pubkey::Pubkey,
    signer::Signer,
    system_instruction,
    transaction::Transaction,
};

use offivex_crypto::SecretBytes;
use offivex_db::models::{Distribution, DistributionTransfer};
use offivex_db::repo::distribution_repo::DistributionRepo;
use offivex_db::repo::wallet_repo::WalletRepo;

use crate::rpc::manager::RpcManager;
use crate::wallet::decrypt::{decrypt_wallet_keypair, DecryptError};
use super::anti_bubble::{AntiBubbleConfig, PlannedTransfer, plan_distribution};

#[derive(Debug, thiserror::Error)]
pub enum DistributionError {
    #[error("RPC error: {0}")]
    Rpc(#[from] crate::rpc::manager::RpcError),
    #[error("Database error: {0}")]
    Db(#[from] offivex_db::DbError),
    #[error("Crypto error: {0}")]
    Crypto(#[from] offivex_crypto::aes::CryptoError),
    #[error("Decrypt error: {0}")]
    Decrypt(#[from] DecryptError),
    #[error("App is locked")]
    Locked,
    #[error("Wallet not found: {0}")]
    WalletNotFound(String),
    #[error("{0}")]
    Other(String),
}

/// Request to create and execute a distribution.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DistributionRequest {
    /// Source wallet ID (funds come from here).
    pub source_wallet_id: String,
    /// Target wallet IDs to receive SOL.
    pub target_wallet_ids: Vec<String>,
    /// Total SOL to distribute (in lamports).
    pub total_lamports: u64,
    /// Anti-bubble configuration.
    pub config: AntiBubbleConfig,
}

/// Result of a distribution plan (before execution).
pub struct DistributionPlan {
    pub distribution_id: String,
    pub transfers: Vec<PlannedTransfer>,
    pub total_lamports: u64,
    pub num_transfers: usize,
    pub strategy: String,
}

/// Create a distribution plan and save it to the DB (without executing).
pub async fn create_plan(
    db: &Arc<Connection>,
    req: &DistributionRequest,
) -> Result<DistributionPlan, DistributionError> {
    let transfers = plan_distribution(
        &req.source_wallet_id,
        &req.target_wallet_ids,
        req.total_lamports,
        &req.config,
    );

    let dist_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    // Save distribution
    let distribution = Distribution {
        id: dist_id.clone(),
        source_wallet_id: req.source_wallet_id.clone(),
        strategy: req.config.strategy.name().to_string(),
        status: "planned".to_string(),
        total_sol: i64::try_from(req.total_lamports)
            .map_err(|_| DistributionError::Other("total_lamports exceeds i64 range".into()))?,
        config_json: serde_json::to_string(&req.config).unwrap_or_default(),
        result_json: None,
        error_message: None,
        created_at: now,
        executed_at: None,
    };
    DistributionRepo::create(db, distribution).await?;

    // Save individual transfers
    for t in &transfers {
        let transfer = DistributionTransfer {
            id: uuid::Uuid::new_v4().to_string(),
            distribution_id: dist_id.clone(),
            from_wallet_id: t.from_wallet_id.clone(),
            to_wallet_id: t.to_wallet_id.clone(),
            amount_lamports: i64::try_from(t.amount_lamports)
                .map_err(|_| DistributionError::Other("amount_lamports exceeds i64 range".into()))?,
            hop_index: t.hop_index as i64,
            delay_ms: t.delay_ms as i64,
            status: "pending".to_string(),
            tx_signature: None,
            error_message: None,
            executed_at: None,
        };
        DistributionRepo::create_transfer(db, transfer).await?;
    }

    let strategy = req.config.strategy.name().to_string();
    let num_transfers = transfers.len();

    Ok(DistributionPlan {
        distribution_id: dist_id,
        transfers,
        total_lamports: req.total_lamports,
        num_transfers,
        strategy,
    })
}

/// Execute a previously planned distribution.
pub async fn execute_distribution(
    db: &Arc<Connection>,
    rpc: &RpcManager,
    master_key: &Arc<RwLock<Option<SecretBytes>>>,
    distribution_id: &str,
) -> Result<(), DistributionError> {
    let mek = master_key
        .read()
        .await
        .clone()
        .ok_or(DistributionError::Locked)?;

    // Load transfers
    let transfers = DistributionRepo::list_transfers(db, distribution_id.to_string()).await?;

    if transfers.is_empty() {
        return Err(DistributionError::Other("No transfers found".into()));
    }

    // Update distribution status to executing
    DistributionRepo::update_status(
        db,
        distribution_id.to_string(),
        "executing".to_string(),
        None,
        None,
        None,
    ).await?;

    let mut completed = 0;
    let mut failed = 0;

    for transfer in &transfers {
        if transfer.status == "completed" {
            completed += 1;
            continue;
        }

        // Apply delay
        if transfer.delay_ms > 0 {
            let delay = u64::try_from(transfer.delay_ms).unwrap_or(0);
            tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
        }

        // Execute the transfer with retry
        match crate::rpc::retry::with_retry(3, 1000, || {
            execute_single_transfer(db, rpc, &mek, transfer)
        }).await {
            Ok(sig) => {
                DistributionRepo::update_transfer_status(
                    db,
                    transfer.id.clone(),
                    "completed".to_string(),
                    Some(sig),
                    None,
                    Some(chrono::Utc::now().timestamp()),
                ).await?;
                completed += 1;
            }
            Err(e) => {
                tracing::error!("Transfer {} failed: {:?}", transfer.id, e);
                DistributionRepo::update_transfer_status(
                    db,
                    transfer.id.clone(),
                    "failed".to_string(),
                    None,
                    Some(e.to_string()),
                    Some(chrono::Utc::now().timestamp()),
                ).await?;
                failed += 1;
            }
        }
    }

    // Update distribution final status
    let final_status = if failed == 0 { "completed" } else if completed == 0 { "failed" } else { "partial" };
    let result_json = serde_json::to_string(&serde_json::json!({
        "completed": completed,
        "failed": failed,
        "total": transfers.len(),
    })).ok();

    DistributionRepo::update_status(
        db,
        distribution_id.to_string(),
        final_status.to_string(),
        if failed > 0 { Some(format!("{} transfers failed", failed)) } else { None },
        result_json,
        Some(chrono::Utc::now().timestamp()),
    ).await?;

    Ok(())
}

/// Buy execution pattern — determines HOW the per-wallet swaps are sequenced
/// across time. This is the core anti-bubble lever on the buy side:
///   - `Parallel` lands all swaps in the same ~1-2 s window. Fast, but
///     Bubblemaps' "synchronized behavior" + "launch-block activity"
///     signals fire hard. Use only when speed beats stealth (panic deploy).
///   - `Staggered` waits a random delay between EACH buy. Defeats both
///     signals at the cost of total wall-clock time (~N × avg_delay).
///   - `Batched` is the Layered pattern applied to buys: small groups
///     fire in parallel, then wait between batches. Compromise between
///     wall-clock and stealth — keeps each batch tight while spreading
///     across multiple slot windows.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case", tag = "mode")]
pub enum BuyPattern {
    /// All buys fired concurrently via `join_all`. NOT anti-bubble safe.
    Parallel,
    /// Random delay in [min_delay_ms, max_delay_ms] between each buy.
    /// Defaults match the distribution's TimingVariation default.
    Staggered {
        min_delay_ms: u64,
        max_delay_ms: u64,
    },
    /// Buys grouped into batches of `batch_size`; each batch fires in
    /// parallel, then we wait `batch_delay_ms` (±30% randomized) before
    /// the next batch.
    Batched {
        batch_size: usize,
        batch_delay_ms: u64,
    },
}

impl Default for BuyPattern {
    fn default() -> Self {
        // Out-of-the-box anti-bubble. A user who doesn't specify a pattern
        // gets the safe choice, not the fast choice.
        Self::Staggered {
            min_delay_ms: 1_000,
            max_delay_ms: 8_000,
        }
    }
}

/// Chain-buy config — passed to `chain_buy_after_distribution` after a
/// successful SOL distribution to fan-out coordinated token buys on every
/// wallet that just received funds. Closes the Kinesis-style "distribute
/// funds AND buys" workflow gap in one server-side orchestration.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChainBuyConfig {
    /// SPL token to buy (mint address).
    pub mint: String,
    /// Percentage of each wallet's post-distribution SOL balance to spend.
    /// 1–100. The function reserves ~0.01 SOL per wallet for tx fees +
    /// ATA creation before applying the percent.
    pub percent: u8,
    /// Slippage tolerance in basis points (default 1500 = 15%).
    pub slippage_bps: u16,
    /// How the buys are sequenced. Default = `Staggered` for anti-bubble
    /// out-of-the-box.
    #[serde(default)]
    pub buy_pattern: BuyPattern,
    /// Per-wallet random variance applied to `percent`, in absolute
    /// percentage points. e.g. `percent=80, percent_variance=10` →
    /// each wallet spends uniformly in [70%, 90%] of its (post-reserve)
    /// balance. Defeats the "buy size fingerprint" signal (uniform N% spend
    /// across all wallets is a screenable pattern). Default 0 = uniform
    /// behavior (back-compat with prior callers).
    #[serde(default)]
    pub percent_variance: u8,
}

/// Per-wallet result of a chain-buy fan-out.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ChainBuyWalletResult {
    pub wallet_id: String,
    pub spent_lamports: u64,
    pub signature: Option<String>,
    pub error: Option<String>,
}

/// Aggregated chain-buy results — stored in the distribution row's
/// `result_json` blob so the frontend can poll status and render the
/// per-wallet outcome.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ChainBuyResults {
    pub mint: String,
    pub successful: usize,
    pub failed: usize,
    pub total_spent_lamports: u64,
    pub results: Vec<ChainBuyWalletResult>,
    pub elapsed_ms: u128,
}

/// Reserved lamports per wallet to cover the swap's tx fee + ATA creation
/// rent. Jupiter swaps frequently include MULTIPLE ATA creations in the
/// same tx (target token, WSOL, intermediate pool token) — each costs
/// ~0.00204 SOL of rent. Worst case = 3 ATAs (~6.1M lamports) + tx fee
/// (5k) + priority fee (~30k) ≈ 6.2M lamports. We reserve 10M to keep a
/// safety margin against Jupiter route changes that introduce a 4th ATA.
const CHAIN_BUY_RESERVE_LAMPORTS: u64 = 10_000_000;

/// Fan-out parallel SOL → token swaps on every target wallet that
/// completed the preceding distribution. Called AFTER `execute_distribution`
/// has finished and committed transfers to the DB (their statuses are
/// already `"completed"` and `send_and_confirm_transaction` guarantees
/// on-chain landing).
///
/// Wallets that received 0 SOL, hit an RPC error during balance lookup,
/// or have balance ≤ reserve are skipped (recorded as failures). The
/// remaining wallets each execute one Jupiter swap in parallel via
/// `futures_util::future::join_all`.
pub async fn chain_buy_after_distribution(
    db: &Arc<Connection>,
    rpc: &RpcManager,
    master_key: &Arc<RwLock<Option<SecretBytes>>>,
    distribution_id: &str,
    config: &ChainBuyConfig,
) -> Result<ChainBuyResults, DistributionError> {
    let started = std::time::Instant::now();

    if !(1..=100).contains(&config.percent) {
        return Err(DistributionError::Other(
            "chain_buy.percent must be in 1..=100".to_string(),
        ));
    }
    let mint_pubkey: Pubkey = config
        .mint
        .parse()
        .map_err(|e| DistributionError::Other(format!("Invalid mint: {}", e)))?;

    let mek = master_key
        .read()
        .await
        .clone()
        .ok_or(DistributionError::Locked)?;

    // Targets = wallets whose transfer landed successfully. Pre-filter so
    // we don't issue buys on wallets that didn't actually receive funds.
    let transfers = DistributionRepo::list_transfers(db, distribution_id.to_string()).await?;
    let mut targets: Vec<String> = transfers
        .iter()
        .filter(|t| t.status == "completed")
        .map(|t| t.to_wallet_id.clone())
        .collect();
    targets.sort();
    targets.dedup();

    if targets.is_empty() {
        return Ok(ChainBuyResults {
            mint: config.mint.clone(),
            successful: 0,
            failed: 0,
            total_spent_lamports: 0,
            results: Vec::new(),
            elapsed_ms: started.elapsed().as_millis(),
        });
    }

    // Validate variance is reasonable. Capping at 50 prevents nonsense
    // configs like `percent=50, percent_variance=80` that would imply
    // negative spend on some wallets.
    if config.percent_variance > 50 {
        return Err(DistributionError::Other(
            "chain_buy.percent_variance must be in 0..=50".to_string(),
        ));
    }

    // Shared RPC client for the fan-out. RpcClient is Send/Sync; the
    // reqwest pool inside handles connection concurrency.
    let (rpc_client, _) = rpc.get_client().await?;
    let rpc_client = Arc::new(rpc_client);

    // Dispatch on buy_pattern. Each branch builds the same per-wallet
    // result vec; only the scheduling differs.
    let results: Vec<ChainBuyWalletResult> = match config.buy_pattern.clone() {
        BuyPattern::Parallel => {
            // All buys fire concurrently. NOT anti-bubble safe — kept for
            // explicit speed-over-stealth use cases (panic deploy, urgent
            // dev allocation against a moving price).
            let futures = targets.into_iter().map(|wallet_id| {
                execute_one_chain_buy(
                    Arc::clone(db),
                    Arc::clone(&rpc_client),
                    mek.clone(),
                    mint_pubkey,
                    wallet_id,
                    config.percent,
                    config.percent_variance,
                    config.slippage_bps,
                )
            });
            futures_util::future::join_all(futures).await
        }
        BuyPattern::Staggered { min_delay_ms, max_delay_ms } => {
            // Sequential with a random delay BEFORE each buy. The first
            // buy fires immediately (no leading delay) so total wall-clock
            // = sum of delays + sum of buy latencies; for 10 wallets with
            // [1, 8]s range expect ~35–80 s end-to-end.
            let (min, max) = if min_delay_ms <= max_delay_ms {
                (min_delay_ms, max_delay_ms)
            } else {
                (max_delay_ms, min_delay_ms)
            };
            let mut out = Vec::with_capacity(targets.len());
            for (idx, wallet_id) in targets.into_iter().enumerate() {
                if idx > 0 {
                    let delay = rand::thread_rng().gen_range(min..=max.max(min));
                    tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
                }
                out.push(
                    execute_one_chain_buy(
                        Arc::clone(db),
                        Arc::clone(&rpc_client),
                        mek.clone(),
                        mint_pubkey,
                        wallet_id,
                        config.percent,
                        config.percent_variance,
                        config.slippage_bps,
                    )
                    .await,
                );
            }
            out
        }
        BuyPattern::Batched { batch_size, batch_delay_ms } => {
            // Layered pattern applied to buys: small batches in parallel,
            // wait between batches with ±30% jitter on the delay so the
            // inter-batch spacing isn't a perfectly regular interval
            // (itself a fingerprint).
            let bs = batch_size.max(1);
            let mut out = Vec::with_capacity(targets.len());
            for (batch_idx, chunk) in targets.chunks(bs).enumerate() {
                if batch_idx > 0 {
                    let deviation = rand::thread_rng().gen_range(-0.3f64..=0.3);
                    let delay = ((batch_delay_ms as f64) * (1.0 + deviation)).max(0.0) as u64;
                    tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
                }
                let batch_futures = chunk.iter().map(|wallet_id| {
                    execute_one_chain_buy(
                        Arc::clone(db),
                        Arc::clone(&rpc_client),
                        mek.clone(),
                        mint_pubkey,
                        wallet_id.clone(),
                        config.percent,
                        config.percent_variance,
                        config.slippage_bps,
                    )
                });
                out.extend(futures_util::future::join_all(batch_futures).await);
            }
            out
        }
    };

    let successful = results.iter().filter(|r| r.signature.is_some()).count();
    let failed = results.len() - successful;
    let total_spent: u64 = results
        .iter()
        .filter(|r| r.signature.is_some())
        .map(|r| r.spent_lamports)
        .sum();

    Ok(ChainBuyResults {
        mint: config.mint.clone(),
        successful,
        failed,
        total_spent_lamports: total_spent,
        results,
        elapsed_ms: started.elapsed().as_millis(),
    })
}

/// Per-wallet chain-buy executor — pulled out of `chain_buy_after_distribution`
/// so all 3 buy-pattern branches can call it. Same semantics in every mode:
/// lookup wallet → confirmed balance → reserve fees → apply percent (with
/// optional variance) → decrypt keypair → Jupiter swap.
#[allow(clippy::too_many_arguments)]
async fn execute_one_chain_buy(
    db: Arc<Connection>,
    rpc: Arc<solana_client::nonblocking::rpc_client::RpcClient>,
    mek: SecretBytes,
    mint_pk: Pubkey,
    wallet_id: String,
    base_percent: u8,
    percent_variance: u8,
    slippage_bps: u16,
) -> ChainBuyWalletResult {
    let wallet = match WalletRepo::get_by_id(&db, wallet_id.clone()).await {
        Ok(Some(w)) => w,
        Ok(None) => {
            return ChainBuyWalletResult {
                wallet_id,
                spent_lamports: 0,
                signature: None,
                error: Some("wallet not found".into()),
            };
        }
        Err(e) => {
            return ChainBuyWalletResult {
                wallet_id,
                spent_lamports: 0,
                signature: None,
                error: Some(format!("db error: {}", e)),
            };
        }
    };
    let pubkey: Pubkey = match wallet.public_key.parse() {
        Ok(p) => p,
        Err(e) => {
            return ChainBuyWalletResult {
                wallet_id,
                spent_lamports: 0,
                signature: None,
                error: Some(format!("invalid pubkey: {}", e)),
            };
        }
    };
    // `confirmed` commitment (not default `processed`): the chain-buy may
    // land on a DIFFERENT RpcManager-pooled RPC than the one that
    // confirmed the distribution transfer. `confirmed` waits for 66%
    // validator consensus = guaranteed visibility regardless of which
    // RPC node answers.
    let balance = match rpc
        .get_balance_with_commitment(&pubkey, CommitmentConfig::confirmed())
        .await
    {
        Ok(resp) => resp.value,
        Err(e) => {
            return ChainBuyWalletResult {
                wallet_id,
                spent_lamports: 0,
                signature: None,
                error: Some(format!("balance lookup failed: {}", e)),
            };
        }
    };
    if balance <= CHAIN_BUY_RESERVE_LAMPORTS {
        return ChainBuyWalletResult {
            wallet_id,
            spent_lamports: 0,
            signature: None,
            error: Some(format!(
                "insufficient balance ({}, need > {} reserve)",
                balance, CHAIN_BUY_RESERVE_LAMPORTS
            )),
        };
    }
    // Apply per-wallet variance so the "% of balance" fingerprint doesn't
    // repeat verbatim across wallets. The effective percent is sampled
    // uniformly in [base - variance, base + variance], clamped to [1, 100].
    let effective_percent: u8 = if percent_variance == 0 {
        base_percent
    } else {
        let base = base_percent as i32;
        let var = percent_variance as i32;
        let lo = (base - var).max(1);
        let hi = (base + var).min(100);
        if lo >= hi {
            base_percent
        } else {
            rand::thread_rng().gen_range(lo..=hi) as u8
        }
    };
    let spendable = balance - CHAIN_BUY_RESERVE_LAMPORTS;
    let spend =
        ((spendable as u128).saturating_mul(effective_percent as u128) / 100) as u64;
    if spend == 0 {
        return ChainBuyWalletResult {
            wallet_id,
            spent_lamports: 0,
            signature: None,
            error: Some("computed spend is zero".into()),
        };
    }

    let keypair = match decrypt_wallet_keypair(&db, &wallet_id, &mek).await {
        Ok(kp) => kp,
        Err(e) => {
            return ChainBuyWalletResult {
                wallet_id,
                spent_lamports: 0,
                signature: None,
                error: Some(format!("decrypt failed: {}", e)),
            };
        }
    };

    match crate::trading::swap::swap_sol_to_token(
        &keypair, &mint_pk, spend, slippage_bps, &rpc,
    )
    .await
    {
        Ok(sig) => ChainBuyWalletResult {
            wallet_id,
            spent_lamports: spend,
            signature: Some(sig),
            error: None,
        },
        Err(e) => ChainBuyWalletResult {
            wallet_id,
            spent_lamports: spend,
            signature: None,
            error: Some(e.to_string()),
        },
    }
}

/// Execute a single SOL transfer.
async fn execute_single_transfer(
    db: &Arc<Connection>,
    rpc: &RpcManager,
    mek: &SecretBytes,
    transfer: &DistributionTransfer,
) -> Result<String, DistributionError> {
    // Get sender keypair (from_wallet_id)
    let sender_keypair = decrypt_wallet_keypair(db, &transfer.from_wallet_id, mek).await?;

    // Get receiver public key (to_wallet_id)
    let receiver = WalletRepo::get_by_id(db, transfer.to_wallet_id.clone())
        .await?
        .ok_or_else(|| DistributionError::WalletNotFound(transfer.to_wallet_id.clone()))?;
    let receiver_pubkey: Pubkey = receiver.public_key.parse()
        .map_err(|e| DistributionError::Other(format!("Invalid pubkey: {}", e)))?;

    // Build and send transfer
    let (client, _) = rpc.get_client().await?;
    let blockhash = client
        .get_latest_blockhash()
        .await
        .map_err(|e| DistributionError::Other(e.to_string()))?;

    let lamports = u64::try_from(transfer.amount_lamports)
        .map_err(|_| DistributionError::Other("Negative amount_lamports in transfer".into()))?;
    let ix = system_instruction::transfer(
        &sender_keypair.pubkey(),
        &receiver_pubkey,
        lamports,
    );

    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&sender_keypair.pubkey()),
        &[&sender_keypair],
        blockhash,
    );

    let sig = client
        .send_and_confirm_transaction(&tx)
        .await
        .map_err(|e| DistributionError::Other(e.to_string()))?;

    Ok(sig.to_string())
}

/// Resume stalled distributions that have been running for too long.
///
/// This function finds distributions that are stuck in "running" or "executing" status
/// and resumes them by:
/// 1. Checking if all transfers are complete -> mark distribution as completed
/// 2. If transfers are still pending -> resume execution
pub async fn resume_stalled_distributions(
    db: &Arc<Connection>,
    rpc: &RpcManager,
    master_key: &Arc<RwLock<Option<SecretBytes>>>,
    stall_seconds: i64,
) -> Result<(), DistributionError> {
    let stalled = DistributionRepo::find_stalled(db, stall_seconds).await?;

    if stalled.is_empty() {
        tracing::debug!("No stalled distributions found");
        return Ok(());
    }

    tracing::info!(
        count = stalled.len(),
        stall_seconds = stall_seconds,
        "Found stalled distributions, attempting to resume"
    );

    for dist in stalled {
        tracing::info!(
            distribution_id = %dist.id,
            status = %dist.status,
            created_at = dist.created_at,
            "Resuming stalled distribution"
        );

        // Check pending transfers
        let pending_transfers = DistributionRepo::find_pending_transfers(db, dist.id.clone()).await?;

        if pending_transfers.is_empty() {
            // All transfers complete, mark distribution as completed
            tracing::info!(
                distribution_id = %dist.id,
                "All transfers complete, marking distribution as completed"
            );

            let all_transfers = DistributionRepo::list_transfers(db, dist.id.clone()).await?;
            let completed = all_transfers.iter().filter(|t| t.status == "completed").count();
            let failed = all_transfers.iter().filter(|t| t.status == "failed").count();

            let final_status = if failed == 0 {
                "completed"
            } else if completed == 0 {
                "failed"
            } else {
                "partial"
            };

            let result_json = serde_json::to_string(&serde_json::json!({
                "completed": completed,
                "failed": failed,
                "total": all_transfers.len(),
                "resumed": true,
            })).ok();

            DistributionRepo::update_status(
                db,
                dist.id.clone(),
                final_status.to_string(),
                if failed > 0 { Some(format!("{} transfers failed", failed)) } else { None },
                result_json,
                Some(chrono::Utc::now().timestamp()),
            ).await?;
        } else {
            // Resume execution of pending transfers
            tracing::info!(
                distribution_id = %dist.id,
                pending_count = pending_transfers.len(),
                "Resuming execution of pending transfers"
            );

            match execute_remaining_transfers(db, rpc, master_key, &dist, &pending_transfers).await {
                Ok(()) => {
                    tracing::info!(
                        distribution_id = %dist.id,
                        "Successfully resumed and completed distribution"
                    );
                }
                Err(e) => {
                    tracing::error!(
                        distribution_id = %dist.id,
                        error = %e,
                        "Failed to resume distribution"
                    );
                }
            }
        }
    }

    Ok(())
}

/// Execute the remaining pending transfers for a distribution.
async fn execute_remaining_transfers(
    db: &Arc<Connection>,
    rpc: &RpcManager,
    master_key: &Arc<RwLock<Option<SecretBytes>>>,
    dist: &Distribution,
    pending_transfers: &[DistributionTransfer],
) -> Result<(), DistributionError> {
    let mek = master_key
        .read()
        .await
        .clone()
        .ok_or(DistributionError::Locked)?;

    for transfer in pending_transfers {
        // Execute the transfer with retry
        match crate::rpc::retry::with_retry(3, 1000, || {
            execute_single_transfer(db, rpc, &mek, transfer)
        }).await {
            Ok(sig) => {
                tracing::info!(
                    transfer_id = %transfer.id,
                    signature = %sig,
                    "Transfer completed successfully"
                );

                DistributionRepo::update_transfer_status(
                    db,
                    transfer.id.clone(),
                    "completed".to_string(),
                    Some(sig),
                    None,
                    Some(chrono::Utc::now().timestamp()),
                ).await?;
            }
            Err(e) => {
                tracing::error!(
                    transfer_id = %transfer.id,
                    error = %e,
                    "Transfer failed"
                );
                DistributionRepo::update_transfer_status(
                    db,
                    transfer.id.clone(),
                    "failed".to_string(),
                    None,
                    Some(e.to_string()),
                    Some(chrono::Utc::now().timestamp()),
                ).await?;
            }
        }
    }

    // Update distribution final status
    let all_transfers = DistributionRepo::list_transfers(db, dist.id.clone()).await?;
    let total_completed = all_transfers.iter().filter(|t| t.status == "completed").count();
    let total_failed = all_transfers.iter().filter(|t| t.status == "failed").count();

    let final_status = if total_failed == 0 {
        "completed"
    } else if total_completed == 0 {
        "failed"
    } else {
        "partial"
    };

    let result_json = serde_json::to_string(&serde_json::json!({
        "completed": total_completed,
        "failed": total_failed,
        "total": all_transfers.len(),
        "resumed": true,
    })).ok();

    DistributionRepo::update_status(
        db,
        dist.id.clone(),
        final_status.to_string(),
        if total_failed > 0 { Some(format!("{} transfers failed", total_failed)) } else { None },
        result_json,
        Some(chrono::Utc::now().timestamp()),
    ).await?;

    Ok(())
}

