use reqwest::Client;
use serde::Deserialize;
use solana_sdk::pubkey::Pubkey;
use std::collections::HashMap;
use std::time::Duration;
use thiserror::Error;
use crate::errors::{CategorizedError, ErrorCategory};

/// Price feed errors
#[derive(Debug, Error)]
pub enum PriceFeedError {
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),

    #[error("Token not found in price feed")]
    TokenNotFound,

    #[error("Price API error: {0}")]
    ApiError(String),

    #[error("Invalid price value: {0}")]
    InvalidPrice(String),

    #[error("Deserialization failed: {0}")]
    DeserializationError(String),
}

impl CategorizedError for PriceFeedError {
    fn category(&self) -> ErrorCategory {
        match self {
            // Network errors - retry
            PriceFeedError::HttpError(_) => ErrorCategory::Retryable,

            // Token not found might be temporary (new token not indexed yet) - retry
            PriceFeedError::TokenNotFound => ErrorCategory::Retryable,

            // Rate limiting - retry
            PriceFeedError::ApiError(msg) if msg.contains("rate limit") => ErrorCategory::Retryable,
            PriceFeedError::ApiError(msg) if msg.contains("429") => ErrorCategory::Retryable,
            PriceFeedError::ApiError(msg) if msg.contains("Too Many Requests") => ErrorCategory::Retryable,

            // Temporary API issues - retry
            PriceFeedError::ApiError(msg) if msg.contains("timeout") => ErrorCategory::Retryable,
            PriceFeedError::ApiError(msg) if msg.contains("503") => ErrorCategory::Retryable,
            PriceFeedError::ApiError(msg) if msg.contains("502") => ErrorCategory::Retryable,

            // Fatal errors
            PriceFeedError::DeserializationError(_) => ErrorCategory::Fatal, // API changed
            PriceFeedError::InvalidPrice(_) => ErrorCategory::Fatal, // Bad data
            PriceFeedError::ApiError(_) => ErrorCategory::Fatal, // Unknown API errors
        }
    }

    fn retry_delay(&self) -> Duration {
        match self {
            // Fast retry for token not found
            PriceFeedError::TokenNotFound => Duration::from_secs(3),

            // Long delay for rate limiting
            PriceFeedError::ApiError(msg) if msg.contains("rate limit") => Duration::from_secs(60),
            PriceFeedError::ApiError(msg) if msg.contains("429") => Duration::from_secs(60),

            // Medium delay for server errors
            PriceFeedError::ApiError(msg) if msg.contains("timeout") => Duration::from_secs(10),
            PriceFeedError::ApiError(msg) if msg.contains("503") => Duration::from_secs(10),
            PriceFeedError::ApiError(msg) if msg.contains("502") => Duration::from_secs(10),

            // Default delay for network errors
            PriceFeedError::HttpError(_) => Duration::from_secs(5),

            // Should not be called for fatal errors
            _ => Duration::from_secs(5),
        }
    }

    fn max_retries(&self) -> u32 {
        match self {
            // More retries for token not found (might be indexing delay)
            PriceFeedError::TokenNotFound => 5,

            // Fewer retries for rate limiting (long delays)
            PriceFeedError::ApiError(msg) if msg.contains("rate limit") => 2,
            PriceFeedError::ApiError(msg) if msg.contains("429") => 2,

            // Standard retries
            _ => 3,
        }
    }

    fn user_message(&self) -> String {
        match self {
            PriceFeedError::HttpError(e) => format!("Network error fetching price: {}", e),
            PriceFeedError::TokenNotFound => "Token price not available. Retrying...".to_string(),
            PriceFeedError::ApiError(msg) if msg.contains("rate limit") => {
                "Rate limited by price API. Waiting before retry...".to_string()
            }
            PriceFeedError::ApiError(msg) => format!("Price API error: {}", msg),
            PriceFeedError::InvalidPrice(msg) => format!("Invalid price data: {}", msg),
            PriceFeedError::DeserializationError(_) => "Price API response format changed. Please update the application.".to_string(),
        }
    }
}

/// Jupiter Price API v4 Response
/// https://price.jup.ag/v4/price
#[derive(Debug, Deserialize)]
pub struct JupiterPriceResponse {
    pub data: HashMap<String, PriceData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_taken: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct PriceData {
    pub id: String,
    pub price: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra_info: Option<ExtraInfo>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtraInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_swapped_price: Option<LastSwappedPrice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quote_currency_price: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastSwappedPrice {
    pub last_jupiter_swap_price: String,
}

/// Get token price in SOL from Jupiter Price API
///
/// # Arguments
/// * `token_mint` - The SPL token mint address
///
/// # Returns
/// Price in SOL (e.g., 0.0001 SOL per token)
///
/// # Example
/// ```ignore
/// let bonk = Pubkey::from_str("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263").unwrap();
/// let price_in_sol = get_token_price_in_sol(&bonk).await.unwrap();
/// println!("BONK price: {} SOL", price_in_sol);
/// ```
pub async fn get_token_price_in_sol(token_mint: &Pubkey) -> Result<f64, PriceFeedError> {
    // Wrapped SOL mint address (used as quote currency)
    let wsol = "So11111111111111111111111111111111111111112";

    let url = format!(
        "https://price.jup.ag/v4/price?ids={}&vsToken={}",
        token_mint, wsol
    );

    tracing::debug!(
        token_mint = %token_mint,
        "Fetching price from Jupiter Price API"
    );

    let client = Client::new();
    let response = client.get(&url).send().await?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        tracing::error!(
            status = %status,
            error = %error_text,
            "Jupiter Price API error"
        );
        return Err(PriceFeedError::ApiError(format!(
            "Status: {}, Error: {}",
            status, error_text
        )));
    }

    let price_response: JupiterPriceResponse = response.json().await.map_err(|e| {
        tracing::error!(error = %e, "Failed to deserialize price response");
        PriceFeedError::DeserializationError(e.to_string())
    })?;

    let price_data = price_response
        .data
        .get(&token_mint.to_string())
        .ok_or_else(|| {
            tracing::warn!(
                token_mint = %token_mint,
                "Token not found in Jupiter price feed"
            );
            PriceFeedError::TokenNotFound
        })?;

    let price = price_data.price.parse::<f64>().map_err(|e| {
        tracing::error!(
            price_string = %price_data.price,
            error = %e,
            "Failed to parse price value"
        );
        PriceFeedError::InvalidPrice(e.to_string())
    })?;

    tracing::info!(
        token_mint = %token_mint,
        price_sol = price,
        "Price fetched successfully"
    );

    Ok(price)
}

/// Get token price in USD from Jupiter Price API
///
/// # Arguments
/// * `token_mint` - The SPL token mint address
///
/// # Returns
/// Price in USD
pub async fn get_token_price_in_usd(token_mint: &Pubkey) -> Result<f64, PriceFeedError> {
    let url = format!("https://price.jup.ag/v4/price?ids={}", token_mint);

    tracing::debug!(
        token_mint = %token_mint,
        "Fetching USD price from Jupiter Price API"
    );

    let client = Client::new();
    let response = client.get(&url).send().await?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(PriceFeedError::ApiError(format!(
            "Status: {}, Error: {}",
            status, error_text
        )));
    }

    let price_response: JupiterPriceResponse = response.json().await.map_err(|e| {
        PriceFeedError::DeserializationError(e.to_string())
    })?;

    let price_data = price_response
        .data
        .get(&token_mint.to_string())
        .ok_or(PriceFeedError::TokenNotFound)?;

    let price = price_data.price.parse::<f64>().map_err(|e| {
        PriceFeedError::InvalidPrice(e.to_string())
    })?;

    tracing::info!(
        token_mint = %token_mint,
        price_usd = price,
        "USD price fetched successfully"
    );

    Ok(price)
}

/// Get multiple token prices in a single request (batch)
///
/// # Arguments
/// * `token_mints` - Vector of SPL token mint addresses
///
/// # Returns
/// HashMap of mint address -> price in SOL
pub async fn get_multiple_prices_in_sol(
    token_mints: &[Pubkey],
) -> Result<HashMap<String, f64>, PriceFeedError> {
    if token_mints.is_empty() {
        return Ok(HashMap::new());
    }

    let wsol = "So11111111111111111111111111111111111111112";
    let ids = token_mints
        .iter()
        .map(|m| m.to_string())
        .collect::<Vec<_>>()
        .join(",");

    let url = format!("https://price.jup.ag/v4/price?ids={}&vsToken={}", ids, wsol);

    tracing::debug!(
        num_tokens = token_mints.len(),
        "Fetching batch prices from Jupiter Price API"
    );

    let client = Client::new();
    let response = client.get(&url).send().await?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(PriceFeedError::ApiError(format!(
            "Status: {}, Error: {}",
            status, error_text
        )));
    }

    let price_response: JupiterPriceResponse = response.json().await.map_err(|e| {
        PriceFeedError::DeserializationError(e.to_string())
    })?;

    let mut prices = HashMap::new();
    for (mint_str, price_data) in price_response.data {
        if let Ok(price) = price_data.price.parse::<f64>() {
            prices.insert(mint_str, price);
        }
    }

    tracing::info!(
        num_prices = prices.len(),
        "Batch prices fetched successfully"
    );

    Ok(prices)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[tokio::test]
    #[ignore] // Run manually: cargo test --package cresus-core --lib trading::price_feed::tests -- --ignored
    async fn test_get_token_price_in_sol() {
        // Test with BONK (a well-known SPL token)
        let bonk = Pubkey::from_str("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263").unwrap();

        let price = get_token_price_in_sol(&bonk).await;

        match price {
            Ok(p) => {
                println!("BONK price: {} SOL", p);
                assert!(p > 0.0, "Price should be positive");
            }
            Err(e) => {
                eprintln!("Price fetch failed: {}", e);
                panic!("Test failed");
            }
        }
    }

    #[tokio::test]
    #[ignore]
    async fn test_get_token_price_in_usd() {
        let usdc = Pubkey::from_str("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v").unwrap();

        let price = get_token_price_in_usd(&usdc).await;

        match price {
            Ok(p) => {
                println!("USDC price: ${}", p);
                assert!(p > 0.99 && p < 1.01, "USDC should be ~$1");
            }
            Err(e) => {
                eprintln!("Price fetch failed: {}", e);
                panic!("Test failed");
            }
        }
    }

    #[tokio::test]
    #[ignore]
    async fn test_batch_prices() {
        let bonk = Pubkey::from_str("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263").unwrap();
        let usdc = Pubkey::from_str("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v").unwrap();

        let prices = get_multiple_prices_in_sol(&[bonk, usdc]).await;

        match prices {
            Ok(p) => {
                println!("Fetched {} prices", p.len());
                assert!(p.len() >= 1, "Should fetch at least one price");
            }
            Err(e) => {
                eprintln!("Batch price fetch failed: {}", e);
                panic!("Test failed");
            }
        }
    }
}
