use serde::{Deserialize, Serialize};
use solana_sdk::pubkey::Pubkey;
use thiserror::Error;
use crate::errors::{CategorizedError, ErrorCategory};
use std::time::Duration;

/// Jupiter API base URLs (v6)
/// Update these if Jupiter releases a new API version
const JUPITER_QUOTE_API: &str = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP_API: &str = "https://quote-api.jup.ag/v6/swap";

/// Jupiter API errors
#[derive(Debug, Error)]
pub enum JupiterError {
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),

    #[error("Quote not found for the given token pair")]
    NoQuote,

    #[error("Jupiter API error: {0}")]
    ApiError(String),

    #[error("Deserialization failed: {0}")]
    DeserializationError(String),

    #[error("RPC error: {0}")]
    RpcError(String),

    #[error("Transaction signing failed: {0}")]
    SigningError(String),
}

impl CategorizedError for JupiterError {
    fn category(&self) -> ErrorCategory {
        match self {
            // Network errors - retry
            JupiterError::HttpError(_) => ErrorCategory::Retryable,
            JupiterError::RpcError(_) => ErrorCategory::Retryable,

            // No quote might be temporary (low liquidity) - retry
            JupiterError::NoQuote => ErrorCategory::Retryable,

            // Rate limiting - retry
            JupiterError::ApiError(msg) if msg.contains("rate limit") => ErrorCategory::Retryable,
            JupiterError::ApiError(msg) if msg.contains("429") => ErrorCategory::Retryable,
            JupiterError::ApiError(msg) if msg.contains("Too Many Requests") => ErrorCategory::Retryable,

            // Temporary API issues - retry
            JupiterError::ApiError(msg) if msg.contains("timeout") => ErrorCategory::Retryable,
            JupiterError::ApiError(msg) if msg.contains("503") => ErrorCategory::Retryable,
            JupiterError::ApiError(msg) if msg.contains("502") => ErrorCategory::Retryable,
            JupiterError::ApiError(msg) if msg.contains("500") => ErrorCategory::Retryable,

            // Fatal errors - do not retry
            JupiterError::DeserializationError(_) => ErrorCategory::Fatal, // API changed
            JupiterError::SigningError(_) => ErrorCategory::Fatal, // Keypair issue
            JupiterError::ApiError(_) => ErrorCategory::Fatal, // Unknown API errors are fatal
        }
    }

    fn retry_delay(&self) -> Duration {
        match self {
            // Fast retry for no quote (liquidity might appear quickly)
            JupiterError::NoQuote => Duration::from_secs(3),

            // Long delay for rate limiting
            JupiterError::ApiError(msg) if msg.contains("rate limit") => Duration::from_secs(60),
            JupiterError::ApiError(msg) if msg.contains("429") => Duration::from_secs(60),

            // Medium delay for server errors
            JupiterError::ApiError(msg) if msg.contains("timeout") => Duration::from_secs(10),
            JupiterError::ApiError(msg) if msg.contains("503") => Duration::from_secs(10),
            JupiterError::ApiError(msg) if msg.contains("502") => Duration::from_secs(10),
            JupiterError::ApiError(msg) if msg.contains("500") => Duration::from_secs(10),

            // Default delay for network errors
            JupiterError::HttpError(_) => Duration::from_secs(5),
            JupiterError::RpcError(_) => Duration::from_secs(5),

            // Should not be called for fatal errors, but provide default
            _ => Duration::from_secs(5),
        }
    }

    fn max_retries(&self) -> u32 {
        match self {
            // More retries for quote not found (might be temporary liquidity)
            JupiterError::NoQuote => 5,

            // Fewer retries for rate limiting (long delays)
            JupiterError::ApiError(msg) if msg.contains("rate limit") => 2,
            JupiterError::ApiError(msg) if msg.contains("429") => 2,

            // Standard retries for everything else
            _ => 3,
        }
    }

    fn user_message(&self) -> String {
        match self {
            JupiterError::HttpError(e) => format!("Network error connecting to Jupiter: {}", e),
            JupiterError::NoQuote => "No swap route found. Retrying...".to_string(),
            JupiterError::ApiError(msg) if msg.contains("rate limit") => {
                "Rate limited by Jupiter API. Waiting before retry...".to_string()
            }
            JupiterError::ApiError(msg) => format!("Jupiter API error: {}", msg),
            JupiterError::DeserializationError(_) => "Jupiter API response format changed. Please update the application.".to_string(),
            JupiterError::RpcError(msg) => format!("Solana network error: {}", msg),
            JupiterError::SigningError(msg) => format!("Transaction signing failed: {}", msg),
        }
    }
}

/// Jupiter Quote API v6 Response
/// https://quote-api.jup.ag/v6/quote
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JupiterQuote {
    pub input_mint: String,
    pub in_amount: String,
    pub output_mint: String,
    pub out_amount: String,
    pub other_amount_threshold: String,
    pub swap_mode: String,
    pub slippage_bps: u16,
    pub price_impact_pct: String,
    pub route_plan: Vec<RoutePlanStep>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_slot: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_taken: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutePlanStep {
    pub swap_info: SwapInfo,
    pub percent: u8,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapInfo {
    pub amm_key: String,
    pub label: String,
    pub input_mint: String,
    pub output_mint: String,
    pub in_amount: String,
    pub out_amount: String,
    pub fee_amount: String,
    pub fee_mint: String,
}

/// Jupiter Swap API v6 Response
/// https://quote-api.jup.ag/v6/swap
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JupiterSwapResponse {
    /// Base64 encoded serialized transaction
    pub swap_transaction: String,

    /// Last valid block height for this transaction
    pub last_valid_block_height: u64,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub prioritization_fee_lamports: Option<u64>,
}

/// Jupiter Swap API v6 Request
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JupiterSwapRequest {
    /// The quote response from the Quote API
    pub quote_response: JupiterQuote,

    /// The user's public key
    pub user_public_key: String,

    /// Wrap/unwrap SOL automatically
    #[serde(default = "default_wrap_unwrap_sol")]
    pub wrap_and_unwrap_sol: bool,

    /// Priority fee in micro lamports (1 lamport = 1,000,000 micro lamports)
    /// Optional: if not provided, Jupiter will use its own fee estimation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compute_unit_price_micro_lamports: Option<u64>,

    /// Dynamic compute unit limit
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dynamic_compute_unit_limit: Option<bool>,

    /// Use legacy transaction format (not versioned)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub use_legacy_transaction: Option<bool>,
}

#[allow(dead_code)]
fn default_wrap_unwrap_sol() -> bool {
    true
}

/// Get a quote from Jupiter aggregator
///
/// # Arguments
/// * `input_mint` - The token being sold/swapped from
/// * `output_mint` - The token being bought/swapped to
/// * `amount` - Amount in base units (lamports for SOL, smallest unit for tokens)
/// * `slippage_bps` - Slippage tolerance in basis points (500 = 5%)
///
/// # Returns
/// A quote containing the expected output amount and routing plan
pub async fn get_quote(
    input_mint: &Pubkey,
    output_mint: &Pubkey,
    amount: u64,
    slippage_bps: u16,
) -> Result<JupiterQuote, JupiterError> {
    let url = format!(
        "{}?inputMint={}&outputMint={}&amount={}&slippageBps={}",
        JUPITER_QUOTE_API, input_mint, output_mint, amount, slippage_bps
    );

    tracing::info!(
        input_mint = %input_mint,
        output_mint = %output_mint,
        amount = amount,
        slippage_bps = slippage_bps,
        "Fetching Jupiter quote"
    );

    let client = crate::http::shared();
    let response = client
        .get(&url)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        tracing::error!(
            status = %status,
            error = %error_text,
            "Jupiter quote API error"
        );
        return Err(JupiterError::ApiError(format!(
            "Status: {}, Error: {}",
            status, error_text
        )));
    }

    let quote: JupiterQuote = response.json().await.map_err(|e| {
        tracing::error!(error = %e, "Failed to deserialize Jupiter quote");
        JupiterError::DeserializationError(e.to_string())
    })?;

    tracing::info!(
        in_amount = %quote.in_amount,
        out_amount = %quote.out_amount,
        price_impact = %quote.price_impact_pct,
        route_steps = quote.route_plan.len(),
        "Jupiter quote received successfully"
    );

    Ok(quote)
}

/// Execute a swap using Jupiter aggregator
///
/// # Arguments
/// * `wallet` - The keypair to sign the transaction
/// * `quote` - The quote from `get_quote()`. **Must be fresh** — the quote
///   `otherAmountThreshold` encodes the slippage tolerance Jupiter will
///   enforce on-chain, but the *price* itself is from when the quote was
///   fetched. Best practice (Jupiter docs): call `get_quote` and
///   `execute_swap` back-to-back with no other async work between, so the
///   on-chain price doesn't drift outside the tolerance and revert the tx.
///   Callers that cache a quote longer than a few seconds should refetch.
/// * `rpc_client` - Solana RPC client for sending transactions
/// * `priority_fee_lamports` - Optional priority fee (if None, Jupiter estimates)
///
/// # Returns
/// Transaction signature string
pub async fn execute_swap(
    wallet: &solana_sdk::signature::Keypair,
    quote: JupiterQuote,
    rpc_client: &solana_client::nonblocking::rpc_client::RpcClient,
    priority_fee_lamports: Option<u64>,
) -> Result<String, JupiterError> {
    use solana_sdk::transaction::VersionedTransaction;
    use solana_sdk::signer::Signer;

    tracing::info!(
        user_pubkey = %wallet.pubkey(),
        priority_fee = ?priority_fee_lamports,
        "Requesting swap transaction from Jupiter"
    );

    // Build swap request
    let swap_request = JupiterSwapRequest {
        quote_response: quote,
        user_public_key: wallet.pubkey().to_string(),
        wrap_and_unwrap_sol: true,
        compute_unit_price_micro_lamports: priority_fee_lamports,
        dynamic_compute_unit_limit: Some(true),
        use_legacy_transaction: Some(false),
    };

    // Get swap transaction from Jupiter
    let client = crate::http::shared();
    let response = client
        .post(JUPITER_SWAP_API)
        .json(&swap_request)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        tracing::error!(
            status = %status,
            error = %error_text,
            "Jupiter swap API error"
        );
        return Err(JupiterError::ApiError(format!(
            "Status: {}, Error: {}",
            status, error_text
        )));
    }

    let swap_response: JupiterSwapResponse = response.json().await.map_err(|e| {
        tracing::error!(error = %e, "Failed to deserialize Jupiter swap response");
        JupiterError::DeserializationError(e.to_string())
    })?;

    tracing::debug!(
        last_valid_block = swap_response.last_valid_block_height,
        "Swap transaction received, deserializing"
    );

    // Deserialize transaction from base64
    use base64::Engine;
    let tx_bytes = base64::engine::general_purpose::STANDARD
        .decode(&swap_response.swap_transaction)
        .map_err(|e| {
        tracing::error!(error = %e, "Failed to decode base64 transaction");
        JupiterError::DeserializationError(format!("Base64 decode failed: {}", e))
    })?;

    let mut transaction: VersionedTransaction =
        bincode::deserialize(&tx_bytes).map_err(|e| {
            tracing::error!(error = %e, "Failed to deserialize transaction");
            JupiterError::DeserializationError(format!("Bincode deserialize failed: {}", e))
        })?;

    tracing::debug!(
        num_instructions = transaction.message.instructions().len(),
        "Transaction deserialized successfully"
    );

    // Get latest blockhash
    let latest_blockhash = rpc_client
        .get_latest_blockhash()
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to get latest blockhash");
            JupiterError::RpcError(e.to_string())
        })?;

    tracing::debug!(blockhash = %latest_blockhash, "Got latest blockhash");

    // Sign transaction
    // Note: Jupiter returns a partially built transaction that needs signing
    // The message is already populated, we just need to add signatures
    transaction.message.set_recent_blockhash(latest_blockhash);

    let signed_transaction = {
        let message = &transaction.message;
        let signature = wallet.try_sign_message(message.serialize().as_slice())
            .map_err(|e| JupiterError::SigningError(e.to_string()))?;

        let mut sigs = transaction.signatures.clone();
        if sigs.is_empty() {
            sigs.push(signature);
        } else {
            sigs[0] = signature;
        }

        VersionedTransaction {
            signatures: sigs,
            message: message.clone(),
        }
    };

    tracing::info!(
        signature = %signed_transaction.signatures[0],
        "Transaction signed, sending to network"
    );

    // Send and confirm transaction
    let signature = rpc_client
        .send_and_confirm_transaction(&signed_transaction)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "Transaction failed");
            JupiterError::RpcError(e.to_string())
        })?;

    tracing::info!(
        signature = %signature,
        "Swap transaction confirmed successfully"
    );

    Ok(signature.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[tokio::test]
    #[ignore] // Run manually: cargo test --package Offivex-core --lib trading::jupiter::tests -- --ignored
    async fn test_get_quote() {
        let wsol = Pubkey::from_str("So11111111111111111111111111111111111111112").unwrap();
        let usdc = Pubkey::from_str("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v").unwrap();

        // Get quote for 0.1 SOL → USDC
        let quote = get_quote(&wsol, &usdc, 100_000_000, 500).await;

        match quote {
            Ok(q) => {
                tracing::info!(
                    input_lamports = q.in_amount,
                    output_units = q.out_amount,
                    price_impact_pct = %q.price_impact_pct,
                    route_steps = q.route_plan.len(),
                    "Jupiter quote received"
                );
            }
            Err(e) => {
                tracing::error!("Jupiter quote failed: {}", e);
                panic!("Quote test failed");
            }
        }
    }
}
