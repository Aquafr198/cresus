use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;
use tokio::sync::{Mutex, RwLock};
use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use cresus_crypto::SecretBytes;

/// Shared state for the auth middleware — just the master key lock.
pub type MasterKeyState = Arc<RwLock<Option<SecretBytes>>>;

/// Tracks the last authenticated activity (epoch seconds).
/// Updated by `require_unlocked` on every successful request.
pub static LAST_ACTIVITY: AtomicU64 = AtomicU64::new(0);

/// Middleware that rejects requests with 403 if the app is locked.
/// Applied to all routes except /auth/*, /health, and /stats.
/// Also updates the last-activity timestamp for auto-lock.
pub async fn require_unlocked(
    State(mk): State<MasterKeyState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if mk.read().await.is_some() {
        // Update last-activity timestamp
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        LAST_ACTIVITY.store(now, Ordering::Relaxed);
        next.run(request).await
    } else {
        (
            StatusCode::FORBIDDEN,
            Json(json!({
                "success": false,
                "error": "App is locked — unlock with password first"
            })),
        )
            .into_response()
    }
}

/// Simple sliding-window rate limiter state.
/// Tracks timestamps of recent requests within the window.
#[derive(Clone)]
pub struct RateLimiter {
    inner: Arc<Mutex<RateLimiterInner>>,
}

struct RateLimiterInner {
    timestamps: Vec<Instant>,
    max_requests: usize,
    window: std::time::Duration,
}

impl RateLimiter {
    /// Create a new rate limiter allowing `max_requests` within `window`.
    pub fn new(max_requests: usize, window: std::time::Duration) -> Self {
        Self {
            inner: Arc::new(Mutex::new(RateLimiterInner {
                timestamps: Vec::new(),
                max_requests,
                window,
            })),
        }
    }

    /// Returns `true` if the request is allowed, `false` if rate-limited.
    async fn check(&self) -> bool {
        let mut inner = self.inner.lock().await;
        let now = Instant::now();
        let window = inner.window;
        inner.timestamps.retain(|t| now.duration_since(*t) < window);
        if inner.timestamps.len() >= inner.max_requests {
            false
        } else {
            inner.timestamps.push(now);
            true
        }
    }
}

/// Middleware that rate-limits requests. Returns 429 if exceeded.
pub async fn rate_limit(
    State(limiter): State<RateLimiter>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if limiter.check().await {
        next.run(request).await
    } else {
        (
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({
                "success": false,
                "error": "Too many requests — try again later"
            })),
        )
            .into_response()
    }
}
