//! Generic retry helper with exponential backoff and jitter.

use std::future::Future;
use rand::Rng;

/// Execute an async operation with exponential backoff retry.
///
/// - `max_attempts`: Total number of tries (1 = no retry).
/// - `base_delay_ms`: Initial delay before first retry.
/// - `operation`: Closure that returns a Future yielding Result<T, E>.
///
/// Backoff formula: `base_delay_ms * 2^attempt` with ±25% jitter.
pub async fn with_retry<F, Fut, T, E>(
    max_attempts: usize,
    base_delay_ms: u64,
    operation: F,
) -> Result<T, E>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: std::fmt::Display,
{
    let mut last_err: Option<E> = None;

    for attempt in 0..max_attempts {
        match operation().await {
            Ok(val) => return Ok(val),
            Err(e) => {
                if attempt + 1 < max_attempts {
                    let delay = compute_backoff(base_delay_ms, attempt as u32);
                    tracing::warn!(
                        "Retry attempt {}/{} failed: {}. Retrying in {}ms",
                        attempt + 1,
                        max_attempts,
                        e,
                        delay,
                    );
                    tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
                }
                last_err = Some(e);
            }
        }
    }

    Err(last_err.expect("max_attempts must be >= 1"))
}

/// Compute backoff delay with jitter: base * 2^attempt ± 25%.
fn compute_backoff(base_ms: u64, attempt: u32) -> u64 {
    let exponential = base_ms.saturating_mul(1u64 << attempt.min(10));
    let jitter_range = exponential / 4; // ±25%
    if jitter_range == 0 {
        return exponential;
    }
    let jitter = rand::thread_rng().gen_range(0..=jitter_range * 2);
    exponential.saturating_sub(jitter_range).saturating_add(jitter)
}
