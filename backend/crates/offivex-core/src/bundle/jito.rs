//! Jito bundle submission, tip account selection, and status polling.
//!
//! Submits a set of transactions as an atomic Jito bundle. All transactions
//! in the bundle either succeed or fail together — no front-running window.

use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    system_instruction,
    transaction::Transaction,
};
use serde::{Deserialize, Serialize};

/// Jito Block Engine endpoint.
pub const JITO_BLOCK_ENGINE_URL: &str = "https://mainnet.block-engine.jito.wtf";

/// Well-known Jito tip accounts (mainnet).
const JITO_TIP_ACCOUNTS: &[&str] = &[
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvQss8hp11i4bPYoTWqjh9epaSqnQ2BFKY",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADaUMid9yfUytqMBgopwjb2DTLSLcjCQM2Zg9Ss4rm35",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];

#[derive(Debug, thiserror::Error)]
pub enum JitoError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Jito API error: {0}")]
    Api(String),
    #[error("Bundle not landed after max retries")]
    NotLanded,
    #[error("Bundle dropped: {0}")]
    Dropped(String),
    #[error("Serialization error: {0}")]
    Serialize(String),
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BundleStatus {
    pub bundle_id: String,
    pub status: String,
    pub landed_slot: Option<u64>,
}

/// Pre-parsed Jito tip accounts (parsed once at first use).
static JITO_TIP_PUBKEYS: std::sync::LazyLock<Vec<Pubkey>> = std::sync::LazyLock::new(|| {
    JITO_TIP_ACCOUNTS
        .iter()
        .map(|s| s.parse().expect("Invalid hardcoded Jito tip account"))
        .collect()
});

/// Pick a random Jito tip account.
pub fn random_tip_account() -> Pubkey {
    use rand::Rng;
    let idx = rand::thread_rng().gen_range(0..JITO_TIP_PUBKEYS.len());
    JITO_TIP_PUBKEYS[idx]
}

/// Build a tip instruction (simple SOL transfer to a Jito tip account).
pub fn build_tip_instruction(payer: &Pubkey, tip_lamports: u64) -> Instruction {
    let tip_account = random_tip_account();
    system_instruction::transfer(payer, &tip_account, tip_lamports)
}

/// Submit a bundle of serialized transactions to the Jito Block Engine.
///
/// Returns the bundle ID on success.
pub async fn submit_bundle(
    transactions: &[Transaction],
    block_engine_url: Option<&str>,
) -> Result<String, JitoError> {
    let url = block_engine_url.unwrap_or(JITO_BLOCK_ENGINE_URL);
    let client = crate::http::shared();

    // Serialize transactions to base58
    let encoded_txs: Result<Vec<String>, JitoError> = transactions
        .iter()
        .map(|tx| {
            let bytes = bincode::serialize(tx)
                .map_err(|e| JitoError::Serialize(e.to_string()))?;
            Ok(bs58::encode(bytes).into_string())
        })
        .collect();
    let encoded_txs = encoded_txs?;

    let payload = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sendBundle",
        "params": [encoded_txs]
    });

    let resp = client
        .post(&format!("{}/api/v1/bundles", url))
        .json(&payload)
        .send()
        .await?;

    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(JitoError::Api(text));
    }

    let body: serde_json::Value = resp.json().await?;

    if let Some(error) = body.get("error") {
        return Err(JitoError::Api(error.to_string()));
    }

    let bundle_id = body["result"]
        .as_str()
        .ok_or_else(|| JitoError::Api("No bundle ID in response".into()))?
        .to_string();

    Ok(bundle_id)
}

/// Poll the Jito Block Engine for bundle status.
pub async fn get_bundle_status(
    bundle_id: &str,
    block_engine_url: Option<&str>,
) -> Result<BundleStatus, JitoError> {
    let url = block_engine_url.unwrap_or(JITO_BLOCK_ENGINE_URL);
    let client = crate::http::shared();

    let payload = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getBundleStatuses",
        "params": [[bundle_id]]
    });

    let resp = client
        .post(&format!("{}/api/v1/bundles", url))
        .json(&payload)
        .send()
        .await?;

    let body: serde_json::Value = resp.json().await?;

    if let Some(error) = body.get("error") {
        return Err(JitoError::Api(error.to_string()));
    }

    let statuses = body["result"]["value"]
        .as_array()
        .ok_or_else(|| JitoError::Api("Invalid status response".into()))?;

    if statuses.is_empty() {
        return Ok(BundleStatus {
            bundle_id: bundle_id.to_string(),
            status: "pending".into(),
            landed_slot: None,
        });
    }

    let status = &statuses[0];
    let confirmation = status["confirmation_status"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();
    let landed_slot = status["slot"].as_u64();

    Ok(BundleStatus {
        bundle_id: bundle_id.to_string(),
        status: confirmation,
        landed_slot,
    })
}

/// Submit a bundle and poll for confirmation with retries.
pub async fn submit_and_confirm(
    transactions: &[Transaction],
    max_poll_attempts: usize,
    poll_interval_ms: u64,
    block_engine_url: Option<&str>,
) -> Result<BundleStatus, JitoError> {
    let bundle_id = submit_bundle(transactions, block_engine_url).await?;
    tracing::info!(bundle_id = %bundle_id, "Jito bundle submitted");

    for attempt in 0..max_poll_attempts {
        tokio::time::sleep(std::time::Duration::from_millis(poll_interval_ms)).await;

        let status = match get_bundle_status(&bundle_id, block_engine_url).await {
            Ok(s) => s,
            Err(JitoError::Http(e)) => {
                tracing::warn!(attempt, error = %e, "Status poll HTTP error, retrying");
                continue;
            }
            Err(e) => return Err(e),
        };
        tracing::debug!(bundle_id = %bundle_id, attempt, status = %status.status, "Bundle poll");

        match status.status.as_str() {
            "confirmed" | "finalized" => return Ok(status),
            "failed" | "dropped" => return Err(JitoError::Dropped(status.status)),
            _ => continue,
        }
    }

    Err(JitoError::NotLanded)
}

/// Submit a bundle with retry on **connect-only** failures.
///
/// ⚠ **Critical safety**: a bundle that lands on Jito but whose HTTP
/// response is lost (read-timeout / 5xx / decode error) would, on naive
/// retry, be sent a second time → user pays the Jito tip twice and may
/// double-execute their swaps. Jito doesn't expose idempotency keys, so
/// we can only retry where we're CERTAIN the server didn't see the
/// payload: pure connect-time failures (`reqwest::Error::is_connect`).
///
/// All other errors (status, timeout-after-send, decode) return
/// immediately — the caller polls `get_bundle_status` and decides what
/// to do (the bundle might still be landing).
pub async fn submit_bundle_with_retry(
    transactions: &[Transaction],
    max_retries: usize,
    block_engine_url: Option<&str>,
) -> Result<String, JitoError> {
    let mut last_err = JitoError::Api("no attempts".into());

    for attempt in 0..max_retries {
        match submit_bundle(transactions, block_engine_url).await {
            Ok(id) => return Ok(id),
            Err(JitoError::Http(e)) if e.is_connect() => {
                // Connection never opened — bundle was NOT received. Safe
                // to retry.
                let delay = std::time::Duration::from_millis(500 * 2u64.pow(attempt as u32));
                tracing::warn!(
                    attempt,
                    error = %e,
                    delay_ms = delay.as_millis() as u64,
                    "Bundle submit connect-failed, retrying"
                );
                last_err = JitoError::Http(e);
                tokio::time::sleep(delay).await;
            }
            Err(JitoError::Http(e)) => {
                // Send happened — bundle might have landed on Jito's side.
                // Returning immediately avoids the double-tip footgun.
                tracing::warn!(
                    error = %e,
                    "Bundle submit non-connect failure — not retrying (might be in flight)"
                );
                return Err(JitoError::Http(e));
            }
            Err(e) => return Err(e),
        }
    }

    Err(last_err)
}

/// Full pipeline: submit with retry + poll for confirmation.
pub async fn submit_and_confirm_with_retry(
    transactions: &[Transaction],
    max_submit_retries: usize,
    max_poll_attempts: usize,
    poll_interval_ms: u64,
    block_engine_url: Option<&str>,
) -> Result<BundleStatus, JitoError> {
    let bundle_id = submit_bundle_with_retry(transactions, max_submit_retries, block_engine_url).await?;
    tracing::info!(bundle_id = %bundle_id, "Jito bundle submitted (with retry)");

    for attempt in 0..max_poll_attempts {
        tokio::time::sleep(std::time::Duration::from_millis(poll_interval_ms)).await;

        let status = match get_bundle_status(&bundle_id, block_engine_url).await {
            Ok(s) => s,
            Err(JitoError::Http(e)) => {
                tracing::warn!(attempt, error = %e, "Status poll HTTP error, retrying");
                continue;
            }
            Err(e) => return Err(e),
        };

        match status.status.as_str() {
            "confirmed" | "finalized" => return Ok(status),
            "failed" | "dropped" => return Err(JitoError::Dropped(status.status)),
            _ => continue,
        }
    }

    Err(JitoError::NotLanded)
}
