//! Dead Letter Queue helper for failed transactions.
//!
//! Call `record_failed_transaction` whenever a transaction fails permanently
//! (after retries are exhausted) to persist it for later inspection or retry.

use std::sync::Arc;
use tokio_rusqlite::Connection;
use offivex_db::repo::dlq_repo::DlqRepo;
use offivex_db::models::DeadLetterTransaction;

use super::ErrorCategory;

/// Source of the failed transaction
#[derive(Debug, Clone, Copy)]
pub enum TxSource {
    Distribution,
    VolumeBot,
    BumperBot,
    Warmer,
    Manual,
}

impl TxSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            TxSource::Distribution => "distribution",
            TxSource::VolumeBot => "volume_bot",
            TxSource::BumperBot => "bumper_bot",
            TxSource::Warmer => "warmer",
            TxSource::Manual => "manual",
        }
    }
}

/// Type of transaction that failed
#[derive(Debug, Clone, Copy)]
pub enum TxType {
    SolTransfer,
    TokenSwap,
    TokenTransfer,
    Bundle,
}

impl TxType {
    pub fn as_str(&self) -> &'static str {
        match self {
            TxType::SolTransfer => "sol_transfer",
            TxType::TokenSwap => "token_swap",
            TxType::TokenTransfer => "token_transfer",
            TxType::Bundle => "bundle",
        }
    }
}

/// Record a failed transaction into the Dead Letter Queue.
///
/// This should be called after all retries are exhausted.
pub async fn record_failed_transaction(
    db: &Arc<Connection>,
    source: TxSource,
    source_id: Option<&str>,
    wallet_id: &str,
    tx_type: TxType,
    payload_json: &str,
    error_message: &str,
    category: ErrorCategory,
    max_retries: i64,
) {
    let now = chrono::Utc::now().timestamp();
    let category_str = match category {
        ErrorCategory::Retryable => "retryable",
        ErrorCategory::Fatal => "fatal",
        ErrorCategory::UserError => "user_error",
    };

    // For retryable errors, set next retry; for fatal, mark as exhausted
    let (status, next_retry_at) = match category {
        ErrorCategory::Retryable => ("pending".to_string(), Some(now + 300)), // retry in 5 min
        _ => ("exhausted".to_string(), None),
    };

    let entry = DeadLetterTransaction {
        id: uuid::Uuid::new_v4().to_string(),
        source: source.as_str().to_string(),
        source_id: source_id.map(|s| s.to_string()),
        wallet_id: wallet_id.to_string(),
        tx_type: tx_type.as_str().to_string(),
        payload_json: payload_json.to_string(),
        error_message: error_message.to_string(),
        error_category: category_str.to_string(),
        retry_count: 0,
        max_retries,
        last_attempt_at: now,
        next_retry_at,
        resolved_at: None,
        tx_signature: None,
        status,
        created_at: now,
    };

    if let Err(e) = DlqRepo::insert(db, entry).await {
        tracing::error!("Failed to record DLQ entry: {}", e);
    } else {
        tracing::warn!(
            source = source.as_str(),
            tx_type = tx_type.as_str(),
            wallet_id = wallet_id,
            "Failed transaction recorded in DLQ"
        );
    }
}
