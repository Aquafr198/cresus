//! SOL dispersal execution engine.
//!
//! Takes a distribution plan (set of PlannedTransfers) and executes them
//! on-chain, respecting timing delays and recording results to the DB.

use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_rusqlite::Connection;

use solana_sdk::{
    pubkey::Pubkey,
    signer::Signer,
    system_instruction,
    transaction::Transaction,
};

use cresus_crypto::SecretBytes;
use cresus_db::models::{Distribution, DistributionTransfer};
use cresus_db::repo::distribution_repo::DistributionRepo;
use cresus_db::repo::wallet_repo::WalletRepo;

use crate::rpc::manager::RpcManager;
use crate::wallet::decrypt::{decrypt_wallet_keypair, DecryptError};
use super::anti_bubble::{AntiBubbleConfig, PlannedTransfer, plan_distribution};

#[derive(Debug, thiserror::Error)]
pub enum DistributionError {
    #[error("RPC error: {0}")]
    Rpc(#[from] crate::rpc::manager::RpcError),
    #[error("Database error: {0}")]
    Db(#[from] cresus_db::DbError),
    #[error("Crypto error: {0}")]
    Crypto(#[from] cresus_crypto::aes::CryptoError),
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

/// Execute a single SOL transfer.
async fn execute_single_transfer(
    db: &Arc<Connection>,
    rpc: &RpcManager,
    mek: &SecretBytes,
    transfer: &DistributionTransfer,
) -> Result<String, DistributionError> {
    // Get sender keypair
    let sender_keypair = decrypt_wallet_keypair(db, &transfer.from_wallet_id, mek).await?;

    // Get receiver public key
    let receiver = WalletRepo::get_by_id(db, transfer.to_wallet_id.clone())
        .await?
        .ok_or_else(|| DistributionError::WalletNotFound(transfer.to_wallet_id.clone()))?;
    let receiver_pubkey: Pubkey = receiver.public_key.parse()
        .map_err(|e| DistributionError::Other(format!("Invalid pubkey: {}", e)))?;

    // Build and send transfer
    let (client, _) = rpc.get_client().await?;
    let client = Arc::new(client);
    let blockhash = {
        let c = client.clone();
        tokio::task::spawn_blocking(move || c.get_latest_blockhash())
            .await
            .map_err(|e| DistributionError::Other(format!("spawn_blocking join: {}", e)))?
            .map_err(|e| DistributionError::Other(e.to_string()))?
    };

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

    let sig = {
        let c = client.clone();
        tokio::task::spawn_blocking(move || c.send_and_confirm_transaction(&tx))
            .await
            .map_err(|e| DistributionError::Other(format!("spawn_blocking join: {}", e)))?
            .map_err(|e| DistributionError::Other(e.to_string()))?
    };

    Ok(sig.to_string())
}

