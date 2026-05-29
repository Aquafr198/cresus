//! Lightweight Prometheus-compatible metrics.
//!
//! Exposes a `/metrics` endpoint in Prometheus text format.
//! HTTP-level counters live here; application counters live in `offivex_api::metrics`.

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

/// Audit PERF-MAX-3 — slow-query logging middleware.
/// Logs WARN if any HTTP request takes longer than this threshold. Catches
/// perf regressions before they hit production users.
const SLOW_REQ_THRESHOLD_MS: u128 = 500;

pub async fn slow_query_log(request: Request<Body>, next: Next) -> Response {
    let method = request.method().clone();
    let uri = request.uri().clone();
    let start = std::time::Instant::now();
    let response = next.run(request).await;
    let elapsed_ms = start.elapsed().as_millis();
    if elapsed_ms > SLOW_REQ_THRESHOLD_MS {
        tracing::warn!(
            method = %method,
            path = %uri.path(),
            status = %response.status().as_u16(),
            duration_ms = elapsed_ms,
            "Slow HTTP request (>{}ms)", SLOW_REQ_THRESHOLD_MS
        );
    }
    response
}

/// GET /api/v1/metrics — Prometheus text exposition format.
pub async fn metrics_handler() -> impl IntoResponse {
    use offivex_api::metrics as app;

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
        "# HELP OFFIVEX_http_requests_total Total HTTP requests received.\n\
         # TYPE OFFIVEX_http_requests_total counter\n\
         OFFIVEX_http_requests_total {}\n\
         # HELP OFFIVEX_http_errors_total Total HTTP 4xx/5xx errors.\n\
         # TYPE OFFIVEX_http_errors_total counter\n\
         OFFIVEX_http_errors_total {}\n\
         # HELP OFFIVEX_swaps_total Total on-chain swaps executed.\n\
         # TYPE OFFIVEX_swaps_total counter\n\
         OFFIVEX_swaps_total {}\n\
         # HELP OFFIVEX_swap_errors_total Total swap errors.\n\
         # TYPE OFFIVEX_swap_errors_total counter\n\
         OFFIVEX_swap_errors_total {}\n\
         # HELP OFFIVEX_bundles_launched_total Total bundles launched.\n\
         # TYPE OFFIVEX_bundles_launched_total counter\n\
         OFFIVEX_bundles_launched_total {}\n\
         # HELP OFFIVEX_pump_fun_launched_total Total Pump.fun tokens launched.\n\
         # TYPE OFFIVEX_pump_fun_launched_total counter\n\
         OFFIVEX_pump_fun_launched_total {}\n\
         # HELP OFFIVEX_auth_unlock_attempts_total Total auth unlock attempts.\n\
         # TYPE OFFIVEX_auth_unlock_attempts_total counter\n\
         OFFIVEX_auth_unlock_attempts_total {}\n\
         # HELP OFFIVEX_auth_unlock_failures_total Total auth unlock failures.\n\
         # TYPE OFFIVEX_auth_unlock_failures_total counter\n\
         OFFIVEX_auth_unlock_failures_total {}\n\
         # HELP OFFIVEX_uptime_seconds Seconds since server start.\n\
         # TYPE OFFIVEX_uptime_seconds gauge\n\
         OFFIVEX_uptime_seconds {}\n",
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
