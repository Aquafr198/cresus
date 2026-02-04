pub mod retry;
pub mod dlq;

pub use retry::{retry_with_backoff, retry_with_config, retry_with_jitter};
pub use dlq::{record_failed_transaction, TxSource, TxType};

use std::time::Duration;

/// Category of error for retry behavior
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCategory {
    /// Temporary errors that should be retried (network issues, rate limits, etc.)
    Retryable,

    /// Permanent errors that should not be retried (invalid keypair, insufficient balance, etc.)
    Fatal,

    /// User input errors that should not be retried
    UserError,
}

/// Trait for errors that can be categorized for retry logic
pub trait CategorizedError: std::error::Error {
    /// Get the category of this error
    fn category(&self) -> ErrorCategory;

    /// Whether this error should be retried
    fn should_retry(&self) -> bool {
        matches!(self.category(), ErrorCategory::Retryable)
    }

    /// How long to wait before retrying (base delay, will be multiplied by attempt number)
    fn retry_delay(&self) -> Duration {
        Duration::from_secs(5)
    }

    /// Maximum number of retries for this error
    fn max_retries(&self) -> u32 {
        3
    }

    /// Get a user-friendly error message
    fn user_message(&self) -> String {
        self.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::trading::swap::SwapError;
    use crate::trading::jupiter::JupiterError;

    #[test]
    fn test_swap_error_categories() {
        // Retryable errors
        assert_eq!(SwapError::RpcError("timeout".into()).category(), ErrorCategory::Retryable);
        assert_eq!(SwapError::SlippageExceeded.category(), ErrorCategory::Retryable);
        assert_eq!(SwapError::Other("something".into()).category(), ErrorCategory::Retryable);

        // Fatal errors
        assert_eq!(SwapError::InsufficientBalance("0".into()).category(), ErrorCategory::Fatal);
        assert_eq!(SwapError::SwapFailed("unknown".into()).category(), ErrorCategory::Fatal);

        // User errors
        assert_eq!(SwapError::InvalidMint("bad".into()).category(), ErrorCategory::UserError);

        // Rate limiting -> retryable
        assert_eq!(SwapError::SwapFailed("rate limit exceeded".into()).category(), ErrorCategory::Retryable);
        assert_eq!(SwapError::SwapFailed("429 Too Many Requests".into()).category(), ErrorCategory::Retryable);

        // Temporary API issues -> retryable
        assert_eq!(SwapError::SwapFailed("timeout error".into()).category(), ErrorCategory::Retryable);
        assert_eq!(SwapError::SwapFailed("503 Service Unavailable".into()).category(), ErrorCategory::Retryable);
        assert_eq!(SwapError::SwapFailed("502 Bad Gateway".into()).category(), ErrorCategory::Retryable);
    }

    #[test]
    fn test_swap_error_should_retry() {
        assert!(SwapError::RpcError("timeout".into()).should_retry());
        assert!(SwapError::SlippageExceeded.should_retry());
        assert!(!SwapError::InsufficientBalance("0".into()).should_retry());
        assert!(!SwapError::InvalidMint("bad".into()).should_retry());
    }

    #[test]
    fn test_swap_error_retry_delays() {
        // Slippage should have fast retry
        assert_eq!(SwapError::SlippageExceeded.retry_delay(), Duration::from_secs(2));

        // Rate limiting should have long delay
        assert_eq!(SwapError::SwapFailed("rate limit".into()).retry_delay(), Duration::from_secs(60));

        // Default delay for other retryable errors
        assert_eq!(SwapError::RpcError("err".into()).retry_delay(), Duration::from_secs(5));
    }

    #[test]
    fn test_swap_error_max_retries() {
        // Slippage gets more retries (volatile markets)
        assert_eq!(SwapError::SlippageExceeded.max_retries(), 5);

        // Rate limiting gets fewer retries (long delays)
        assert_eq!(SwapError::SwapFailed("rate limit".into()).max_retries(), 2);

        // Default retries
        assert_eq!(SwapError::RpcError("err".into()).max_retries(), 3);
    }

    #[test]
    fn test_swap_error_user_messages() {
        let msg = SwapError::InsufficientBalance("0 SOL".into()).user_message();
        assert!(msg.contains("Insufficient balance"));

        let msg = SwapError::SlippageExceeded.user_message();
        assert!(msg.contains("Price moved"));

        let msg = SwapError::SwapFailed("rate limit".into()).user_message();
        assert!(msg.contains("Rate limited"));
    }

    #[test]
    fn test_jupiter_error_categories() {
        // Retryable
        assert_eq!(JupiterError::NoQuote.category(), ErrorCategory::Retryable);
        assert_eq!(JupiterError::RpcError("err".into()).category(), ErrorCategory::Retryable);
        assert_eq!(JupiterError::ApiError("rate limit".into()).category(), ErrorCategory::Retryable);
        assert_eq!(JupiterError::ApiError("429".into()).category(), ErrorCategory::Retryable);
        assert_eq!(JupiterError::ApiError("500".into()).category(), ErrorCategory::Retryable);

        // Fatal
        assert_eq!(JupiterError::DeserializationError("bad json".into()).category(), ErrorCategory::Fatal);
        assert_eq!(JupiterError::SigningError("bad key".into()).category(), ErrorCategory::Fatal);
        assert_eq!(JupiterError::ApiError("unknown error".into()).category(), ErrorCategory::Fatal);
    }

    #[test]
    fn test_jupiter_error_no_quote_retries() {
        // No quote gets more retries (temporary liquidity issue)
        assert_eq!(JupiterError::NoQuote.max_retries(), 5);
        assert_eq!(JupiterError::NoQuote.retry_delay(), Duration::from_secs(3));
    }

    #[test]
    fn test_error_category_equality() {
        assert_eq!(ErrorCategory::Retryable, ErrorCategory::Retryable);
        assert_ne!(ErrorCategory::Retryable, ErrorCategory::Fatal);
        assert_ne!(ErrorCategory::Fatal, ErrorCategory::UserError);
    }
}
