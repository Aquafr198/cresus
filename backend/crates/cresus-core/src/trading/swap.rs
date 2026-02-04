use solana_sdk::{
    pubkey::Pubkey,
    signature::Keypair,
};
use thiserror::Error;
use crate::errors::{CategorizedError, ErrorCategory};
use std::time::Duration;

#[derive(Debug, Error)]
pub enum SwapError {
    #[error("RPC error: {0}")]
    RpcError(String),

    #[error("Insufficient balance: {0}")]
    InsufficientBalance(String),

    #[error("Swap failed: {0}")]
    SwapFailed(String),

    #[error("Invalid token mint: {0}")]
    InvalidMint(String),

    #[error("Slippage exceeded")]
    SlippageExceeded,

    #[error("Other error: {0}")]
    Other(String),
}

impl CategorizedError for SwapError {
    fn category(&self) -> ErrorCategory {
        match self {
            // Network and temporary errors - retry
            SwapError::RpcError(_) => ErrorCategory::Retryable,
            SwapError::SlippageExceeded => ErrorCategory::Retryable,

            // Rate limiting - retry with longer delay
            SwapError::SwapFailed(msg) if msg.contains("rate limit") => ErrorCategory::Retryable,
            SwapError::SwapFailed(msg) if msg.contains("429") => ErrorCategory::Retryable,
            SwapError::SwapFailed(msg) if msg.contains("Too Many Requests") => ErrorCategory::Retryable,

            // Temporary Jupiter API issues - retry
            SwapError::SwapFailed(msg) if msg.contains("timeout") => ErrorCategory::Retryable,
            SwapError::SwapFailed(msg) if msg.contains("503") => ErrorCategory::Retryable,
            SwapError::SwapFailed(msg) if msg.contains("502") => ErrorCategory::Retryable,

            // Fatal errors - do not retry
            SwapError::InsufficientBalance(_) => ErrorCategory::Fatal,
            SwapError::SwapFailed(_) => ErrorCategory::Fatal, // Unknown swap failures are fatal

            // User input errors - do not retry
            SwapError::InvalidMint(_) => ErrorCategory::UserError,

            // Default to retryable for unknown errors
            SwapError::Other(_) => ErrorCategory::Retryable,
        }
    }

    fn retry_delay(&self) -> Duration {
        match self {
            // Fast retry for slippage (market might change quickly)
            SwapError::SlippageExceeded => Duration::from_secs(2),

            // Long delay for rate limiting
            SwapError::SwapFailed(msg) if msg.contains("rate limit") => Duration::from_secs(60),
            SwapError::SwapFailed(msg) if msg.contains("429") => Duration::from_secs(60),
            SwapError::SwapFailed(msg) if msg.contains("Too Many Requests") => Duration::from_secs(60),

            // Medium delay for temporary API issues
            SwapError::SwapFailed(msg) if msg.contains("timeout") => Duration::from_secs(10),
            SwapError::SwapFailed(msg) if msg.contains("503") => Duration::from_secs(10),
            SwapError::SwapFailed(msg) if msg.contains("502") => Duration::from_secs(10),

            // Default delay for other retryable errors
            _ => Duration::from_secs(5),
        }
    }

    fn max_retries(&self) -> u32 {
        match self {
            // More retries for slippage issues (common in volatile markets)
            SwapError::SlippageExceeded => 5,

            // Fewer retries for rate limiting (long delays)
            SwapError::SwapFailed(msg) if msg.contains("rate limit") => 2,
            SwapError::SwapFailed(msg) if msg.contains("429") => 2,

            // Standard retries for everything else
            _ => 3,
        }
    }

    fn user_message(&self) -> String {
        match self {
            SwapError::RpcError(_) => "Network connection issue. Retrying...".to_string(),
            SwapError::InsufficientBalance(_) => "Insufficient balance to complete swap".to_string(),
            SwapError::SlippageExceeded => "Price moved too much. Retrying with current price...".to_string(),
            SwapError::InvalidMint(_) => "Invalid token address provided".to_string(),
            SwapError::SwapFailed(msg) if msg.contains("rate limit") => {
                "Rate limited by swap provider. Waiting before retry...".to_string()
            }
            SwapError::SwapFailed(msg) => format!("Swap failed: {}", msg),
            SwapError::Other(msg) => format!("Unexpected error: {}", msg),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum SwapDirection {
    Buy,  // SOL → Token
    Sell, // Token → SOL
}

/// Swap configuration
#[derive(Debug, Clone, Copy)]
pub struct SwapConfig {
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub amount: u64,
    pub slippage_bps: u16, // basis points (e.g., 500 = 5%)
}

/// Execute a swap using Jupiter aggregator (FULLY IMPLEMENTED)
///
/// Steps:
/// 1. Get quote from Jupiter Quote API
/// 2. Get swap transaction from Jupiter Swap API
/// 3. Sign and send transaction
///
/// Returns the transaction signature
pub async fn execute_swap_jupiter(
    wallet: &Keypair,
    config: SwapConfig,
    rpc_client: &solana_client::nonblocking::rpc_client::RpcClient,
) -> Result<String, SwapError> {
    use super::jupiter;

    tracing::info!(
        input_mint = %config.input_mint,
        output_mint = %config.output_mint,
        amount = config.amount,
        slippage_bps = config.slippage_bps,
        "Executing Jupiter swap"
    );

    // Step 1: Get quote
    let quote = jupiter::get_quote(
        &config.input_mint,
        &config.output_mint,
        config.amount,
        config.slippage_bps,
    )
    .await
    .map_err(|e| SwapError::Other(format!("Jupiter quote failed: {}", e)))?;

    // Step 2: Execute swap with priority fee from env (default: 50_000 micro lamports ≈ competitive)
    let priority_fee = std::env::var("CRESUS_PRIORITY_FEE_MICRO_LAMPORTS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .or(Some(50_000)); // 50k micro lamports default

    let signature = jupiter::execute_swap(wallet, quote, rpc_client, priority_fee)
        .await
        .map_err(|e| SwapError::SwapFailed(format!("Jupiter swap failed: {}", e)))?;

    tracing::info!(
        signature = %signature,
        "Jupiter swap completed successfully"
    );

    Ok(signature)
}

/// Execute a swap using Raydium pool via Jupiter aggregator.
///
/// Jupiter aggregates Raydium pools alongside other DEXes, so this
/// delegates to Jupiter which will route through Raydium when it offers
/// the best price. The `pool_address` parameter is logged for tracing
/// but Jupiter handles routing automatically.
pub async fn execute_swap_raydium(
    wallet: &Keypair,
    pool_address: &Pubkey,
    config: SwapConfig,
    rpc_client: &solana_client::nonblocking::rpc_client::RpcClient,
) -> Result<String, SwapError> {
    tracing::info!(
        pool = %pool_address,
        input_mint = %config.input_mint,
        output_mint = %config.output_mint,
        amount = config.amount,
        "Raydium swap requested — routing through Jupiter aggregator"
    );

    // Jupiter aggregates Raydium pools and will route through them
    // when they offer the best price/liquidity
    execute_swap_jupiter(wallet, config, rpc_client).await
}

/// Helper: Create SOL → Token swap config
pub fn create_buy_config(
    token_mint: &Pubkey,
    sol_amount: u64,
    slippage_bps: u16,
) -> SwapConfig {
    SwapConfig {
        input_mint: solana_sdk::system_program::id(), // SOL (native)
        output_mint: *token_mint,
        amount: sol_amount,
        slippage_bps,
    }
}

/// Helper: Create Token → SOL swap config
pub fn create_sell_config(
    token_mint: &Pubkey,
    token_amount: u64,
    slippage_bps: u16,
) -> SwapConfig {
    SwapConfig {
        input_mint: *token_mint,
        output_mint: solana_sdk::system_program::id(), // SOL (native)
        amount: token_amount,
        slippage_bps,
    }
}

/// Convenience function: Swap SOL to Token
///
/// This is the most common operation for Volume Bots (buying)
pub async fn swap_sol_to_token(
    wallet: &Keypair,
    token_mint: &Pubkey,
    sol_amount_lamports: u64,
    slippage_bps: u16,
    rpc_client: &solana_client::nonblocking::rpc_client::RpcClient,
) -> Result<String, SwapError> {
    use std::str::FromStr;

    // Wrapped SOL mint address
    let wsol_mint = Pubkey::from_str("So11111111111111111111111111111111111111112")
        .map_err(|e| SwapError::InvalidMint(e.to_string()))?;

    let config = SwapConfig {
        input_mint: wsol_mint,
        output_mint: *token_mint,
        amount: sol_amount_lamports,
        slippage_bps,
    };

    execute_swap_jupiter(wallet, config, rpc_client).await
}

/// Convenience function: Swap Token to SOL
///
/// This is the most common operation for Volume Bots (selling)
pub async fn swap_token_to_sol(
    wallet: &Keypair,
    token_mint: &Pubkey,
    token_amount: u64,
    slippage_bps: u16,
    rpc_client: &solana_client::nonblocking::rpc_client::RpcClient,
) -> Result<String, SwapError> {
    use std::str::FromStr;

    // Wrapped SOL mint address
    let wsol_mint = Pubkey::from_str("So11111111111111111111111111111111111111112")
        .map_err(|e| SwapError::InvalidMint(e.to_string()))?;

    let config = SwapConfig {
        input_mint: *token_mint,
        output_mint: wsol_mint,
        amount: token_amount,
        slippage_bps,
    };

    execute_swap_jupiter(wallet, config, rpc_client).await
}
