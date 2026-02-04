use super::CategorizedError;
use std::future::Future;
use std::time::Duration;

/// Retry an async operation with exponential backoff based on error category
///
/// This wrapper automatically retries operations that fail with retryable errors,
/// using exponential backoff to avoid hammering external services.
///
/// # Arguments
/// * `operation` - The async operation to retry
/// * `operation_name` - Human-readable name for logging
///
/// # Example
/// ```ignore
/// let result = retry_with_backoff(
///     || async {
///         swap_sol_to_token(&wallet, &token, amount, slippage, &rpc).await
///     },
///     "Volume bot buy"
/// ).await?;
/// ```
pub async fn retry_with_backoff<T, E, F, Fut>(
    mut operation: F,
    operation_name: &str,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: CategorizedError + std::fmt::Display,
{
    let mut attempt = 0;

    loop {
        match operation().await {
            Ok(result) => {
                if attempt > 0 {
                    tracing::info!(
                        operation = operation_name,
                        attempts = attempt + 1,
                        "Operation succeeded after retries"
                    );
                }
                return Ok(result);
            }
            Err(e) => {
                let max_retries = e.max_retries();
                let should_retry = e.should_retry();

                if !should_retry {
                    tracing::error!(
                        operation = operation_name,
                        error = %e,
                        category = ?e.category(),
                        "Operation failed with non-retryable error"
                    );
                    return Err(e);
                }

                if attempt >= max_retries {
                    tracing::error!(
                        operation = operation_name,
                        error = %e,
                        attempts = attempt + 1,
                        max_retries = max_retries,
                        "Operation failed after exhausting all retries"
                    );
                    return Err(e);
                }

                // Exponential backoff: base_delay * (attempt + 1)
                let base_delay = e.retry_delay();
                let backoff_multiplier = attempt + 1;
                let delay = base_delay * backoff_multiplier;

                tracing::warn!(
                    operation = operation_name,
                    error = %e,
                    attempt = attempt + 1,
                    max_retries = max_retries,
                    retry_delay_secs = delay.as_secs(),
                    "Operation failed, retrying after backoff"
                );

                tokio::time::sleep(delay).await;
                attempt += 1;
            }
        }
    }
}

/// Retry with custom configuration
///
/// Allows overriding the default retry behavior from the error type
pub async fn retry_with_config<T, E, F, Fut>(
    mut operation: F,
    operation_name: &str,
    max_retries: u32,
    base_delay: Duration,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: CategorizedError + std::fmt::Display,
{
    let mut attempt = 0;

    loop {
        match operation().await {
            Ok(result) => {
                if attempt > 0 {
                    tracing::info!(
                        operation = operation_name,
                        attempts = attempt + 1,
                        "Operation succeeded after retries"
                    );
                }
                return Ok(result);
            }
            Err(e) => {
                let should_retry = e.should_retry();

                if !should_retry {
                    tracing::error!(
                        operation = operation_name,
                        error = %e,
                        category = ?e.category(),
                        "Operation failed with non-retryable error"
                    );
                    return Err(e);
                }

                if attempt >= max_retries {
                    tracing::error!(
                        operation = operation_name,
                        error = %e,
                        attempts = attempt + 1,
                        max_retries = max_retries,
                        "Operation failed after exhausting all retries"
                    );
                    return Err(e);
                }

                let backoff_multiplier = attempt + 1;
                let delay = base_delay * backoff_multiplier;

                tracing::warn!(
                    operation = operation_name,
                    error = %e,
                    attempt = attempt + 1,
                    max_retries = max_retries,
                    retry_delay_secs = delay.as_secs(),
                    "Operation failed, retrying after backoff"
                );

                tokio::time::sleep(delay).await;
                attempt += 1;
            }
        }
    }
}

/// Retry with jitter to avoid thundering herd
///
/// Adds random jitter (±20%) to the backoff delay to prevent
/// multiple concurrent operations from retrying in lockstep
pub async fn retry_with_jitter<T, E, F, Fut>(
    mut operation: F,
    operation_name: &str,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: CategorizedError + std::fmt::Display,
{
    use rand::Rng;
    let mut attempt = 0;

    loop {
        match operation().await {
            Ok(result) => {
                if attempt > 0 {
                    tracing::info!(
                        operation = operation_name,
                        attempts = attempt + 1,
                        "Operation succeeded after retries"
                    );
                }
                return Ok(result);
            }
            Err(e) => {
                let max_retries = e.max_retries();
                let should_retry = e.should_retry();

                if !should_retry {
                    tracing::error!(
                        operation = operation_name,
                        error = %e,
                        category = ?e.category(),
                        "Operation failed with non-retryable error"
                    );
                    return Err(e);
                }

                if attempt >= max_retries {
                    tracing::error!(
                        operation = operation_name,
                        error = %e,
                        attempts = attempt + 1,
                        max_retries = max_retries,
                        "Operation failed after exhausting all retries"
                    );
                    return Err(e);
                }

                let base_delay = e.retry_delay();
                let backoff_multiplier = attempt + 1;
                let base_millis = (base_delay * backoff_multiplier).as_millis() as u64;

                // Add ±20% jitter
                let jitter_range = (base_millis as f64 * 0.2) as u64;
                let jitter = rand::thread_rng().gen_range(0..=jitter_range * 2);
                let delay_millis = base_millis.saturating_sub(jitter_range) + jitter;
                let delay = Duration::from_millis(delay_millis);

                tracing::warn!(
                    operation = operation_name,
                    error = %e,
                    attempt = attempt + 1,
                    max_retries = max_retries,
                    retry_delay_secs = delay.as_secs_f64(),
                    "Operation failed, retrying after jittered backoff"
                );

                tokio::time::sleep(delay).await;
                attempt += 1;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::ErrorCategory;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;
    use thiserror::Error;

    #[derive(Debug, Error)]
    enum TestError {
        #[error("Retryable error")]
        Retryable,

        #[error("Fatal error")]
        Fatal,
    }

    impl CategorizedError for TestError {
        fn category(&self) -> ErrorCategory {
            match self {
                TestError::Retryable => ErrorCategory::Retryable,
                TestError::Fatal => ErrorCategory::Fatal,
            }
        }

        fn retry_delay(&self) -> Duration {
            Duration::from_millis(10) // Fast for testing
        }

        fn max_retries(&self) -> u32 {
            3
        }
    }

    #[tokio::test]
    async fn test_retry_eventually_succeeds() {
        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let result = retry_with_backoff(
            || {
                let counter = counter_clone.clone();
                async move {
                    let count = counter.fetch_add(1, Ordering::SeqCst);
                    if count < 2 {
                        Err(TestError::Retryable)
                    } else {
                        Ok("success")
                    }
                }
            },
            "test_operation",
        )
        .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "success");
        assert_eq!(counter.load(Ordering::SeqCst), 3); // Failed twice, succeeded on third
    }

    #[tokio::test]
    async fn test_retry_exhausts_retries() {
        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let result = retry_with_backoff(
            || {
                let counter = counter_clone.clone();
                async move {
                    counter.fetch_add(1, Ordering::SeqCst);
                    Err::<(), _>(TestError::Retryable)
                }
            },
            "test_operation",
        )
        .await;

        assert!(result.is_err());
        // Initial attempt + 3 retries = 4 total attempts
        assert_eq!(counter.load(Ordering::SeqCst), 4);
    }

    #[tokio::test]
    async fn test_fatal_error_no_retry() {
        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let result = retry_with_backoff(
            || {
                let counter = counter_clone.clone();
                async move {
                    counter.fetch_add(1, Ordering::SeqCst);
                    Err::<(), _>(TestError::Fatal)
                }
            },
            "test_operation",
        )
        .await;

        assert!(result.is_err());
        assert_eq!(counter.load(Ordering::SeqCst), 1); // Only one attempt, no retries
    }
}
