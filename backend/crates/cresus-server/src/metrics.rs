//! Lightweight Prometheus-compatible metrics.
//!
//! Exposes a `/metrics` endpoint in Prometheus text format.
//! HTTP-level counters live here; application counters live in `cresus_api::metrics`.

use std::sync::atomic::{AtomicU64, Ordering};
use axum::{
    body::Body,
    http::Request,
    middleware::Next,
    response::{IntoResponse, Response},
};

// ── HTTP-level counters (tracked by middleware) ──

pub static HTTP_REQUESTS_TOTAL: AtomicU64 = AtomicU64::new(0);
pub static HTTP_ERRORS_TOTAL: AtomicU64 = AtomicU64::new(0);
static START_TIME: AtomicU64 = AtomicU64::new(0);

/// Call once at startup to record the start time.
pub fn init() {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    START_TIME.store(now, Ordering::Relaxed);
}

/// Middleware that counts HTTP requests and errors.
pub async fn track_http(request: Request<Body>, next: Next) -> Response {
    HTTP_REQUESTS_TOTAL.fetch_add(1, Ordering::Relaxed);
    let response = next.run(request).await;
    if response.status().is_client_error() || response.status().is_server_error() {
        HTTP_ERRORS_TOTAL.fetch_add(1, Ordering::Relaxed);
    }
    response
}

/// GET /api/v1/metrics — Prometheus text exposition format.
pub async fn metrics_handler() -> impl IntoResponse {
    use cresus_api::metrics as app;

    let uptime = {
        let start = START_TIME.load(Ordering::Relaxed);
        if start == 0 { 0 } else {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs();
            now.saturating_sub(start)
        }
    };

    let body = format!(
        "# HELP cresus_http_requests_total Total HTTP requests received.\n\
         # TYPE cresus_http_requests_total counter\n\
         cresus_http_requests_total {}\n\
         # HELP cresus_http_errors_total Total HTTP 4xx/5xx errors.\n\
         # TYPE cresus_http_errors_total counter\n\
         cresus_http_errors_total {}\n\
         # HELP cresus_swaps_total Total on-chain swaps executed.\n\
         # TYPE cresus_swaps_total counter\n\
         cresus_swaps_total {}\n\
         # HELP cresus_swap_errors_total Total swap errors.\n\
         # TYPE cresus_swap_errors_total counter\n\
         cresus_swap_errors_total {}\n\
         # HELP cresus_bundles_launched_total Total bundles launched.\n\
         # TYPE cresus_bundles_launched_total counter\n\
         cresus_bundles_launched_total {}\n\
         # HELP cresus_pump_fun_launched_total Total Pump.fun tokens launched.\n\
         # TYPE cresus_pump_fun_launched_total counter\n\
         cresus_pump_fun_launched_total {}\n\
         # HELP cresus_auth_unlock_attempts_total Total auth unlock attempts.\n\
         # TYPE cresus_auth_unlock_attempts_total counter\n\
         cresus_auth_unlock_attempts_total {}\n\
         # HELP cresus_auth_unlock_failures_total Total auth unlock failures.\n\
         # TYPE cresus_auth_unlock_failures_total counter\n\
         cresus_auth_unlock_failures_total {}\n\
         # HELP cresus_uptime_seconds Seconds since server start.\n\
         # TYPE cresus_uptime_seconds gauge\n\
         cresus_uptime_seconds {}\n",
        HTTP_REQUESTS_TOTAL.load(Ordering::Relaxed),
        HTTP_ERRORS_TOTAL.load(Ordering::Relaxed),
        app::SWAPS_TOTAL.load(Ordering::Relaxed),
        app::SWAP_ERRORS_TOTAL.load(Ordering::Relaxed),
        app::BUNDLES_LAUNCHED.load(Ordering::Relaxed),
        app::PUMP_FUN_LAUNCHED.load(Ordering::Relaxed),
        app::AUTH_UNLOCK_ATTEMPTS.load(Ordering::Relaxed),
        app::AUTH_UNLOCK_FAILURES.load(Ordering::Relaxed),
        uptime,
    );

    (
        [(axum::http::header::CONTENT_TYPE, "text/plain; version=0.0.4; charset=utf-8")],
        body,
    )
}
