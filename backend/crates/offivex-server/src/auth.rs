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
use offivex_crypto::SecretBytes;

/// Shared state for the auth middleware — just the master key lock.
pub type MasterKeyState = Arc<RwLock<Option<SecretBytes>>>;

/// Tracks the last authenticated activity (epoch seconds).
/// Updated by `require_unlocked` on every successful request.
pub static LAST_ACTIVITY: AtomicU64 = AtomicU64::new(0);

/// Tracks the last *admin* activity (epoch seconds). Updated only by `require_admin`
/// — separate from `LAST_ACTIVITY` so user-side API key traffic does not extend
/// the admin's unlock session and defeat auto-lock.
pub static LAST_ADMIN_ACTIVITY: AtomicU64 = AtomicU64::new(0);

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

// ── Admin authentication ────────────────────────────────────────────────

/// State for the admin auth middleware: DB handle + session TTL.
#[derive(Clone)]
pub struct AdminAuthState {
    pub db: Arc<tokio_rusqlite::Connection>,
    pub session_ttl_secs: i64,
}

/// Middleware: requires `Authorization: Bearer <token>` with a valid admin session.
/// On success, injects `offivex_api::admin_auth::AdminCtxExt` into request extensions
/// and updates `LAST_ADMIN_ACTIVITY` + slides the session window.
pub async fn require_admin(
    State(state): State<AdminAuthState>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    use offivex_db::repo::admin_repo::AdminRepo;
    use offivex_db::repo::admin_session_repo::AdminSessionRepo;
    use offivex_api::admin_auth::{sha256_hex, AdminCtxExt};

    let token = match extract_bearer(&request) {
        Some(t) => t,
        None => return unauthorized("Missing Authorization: Bearer <token>"),
    };
    let token_hash = sha256_hex(&token);

    let session = match AdminSessionRepo::find_by_token_hash(&state.db, &token_hash).await {
        Ok(Some(s)) => s,
        Ok(None) => return unauthorized("Invalid or expired session"),
        Err(e) => {
            tracing::error!("admin session lookup failed: {e}");
            return internal_error();
        }
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    if session.expires_at <= now {
        // Cleanup expired session opportunistically.
        let _ = AdminSessionRepo::delete_by_token_hash(&state.db, &token_hash).await;
        return unauthorized("Session expired");
    }

    let admin = match AdminRepo::find_by_id(&state.db, &session.admin_id).await {
        Ok(Some(a)) => a,
        Ok(None) => return unauthorized("Admin no longer exists"),
        Err(e) => {
            tracing::error!("admin lookup failed: {e}");
            return internal_error();
        }
    };

    // Slide the session window
    if let Err(e) =
        AdminSessionRepo::touch(&state.db, &token_hash, state.session_ttl_secs).await
    {
        tracing::warn!("failed to touch admin session: {e}");
    }
    LAST_ADMIN_ACTIVITY.store(now as u64, Ordering::Relaxed);

    request.extensions_mut().insert(AdminCtxExt {
        admin_id: admin.id,
        username: admin.username,
        token_hash,
    });

    next.run(request).await
}

/// Extract the Bearer token from an `Authorization` header.
fn extract_bearer(request: &Request<Body>) -> Option<String> {
    let val = request.headers().get(axum::http::header::AUTHORIZATION)?;
    let s = val.to_str().ok()?;
    let stripped = s.strip_prefix("Bearer ").or_else(|| s.strip_prefix("bearer "))?;
    let token = stripped.trim();
    if token.is_empty() {
        None
    } else {
        Some(token.to_string())
    }
}

fn unauthorized(msg: &str) -> Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(json!({ "success": false, "error": msg })),
    )
        .into_response()
}

fn internal_error() -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "success": false, "error": "Internal error" })),
    )
        .into_response()
}

// ── User API key authentication (Phase 6 minimal for frontend finalization) ──

/// Brute-force lockout state (audit SEC-MAX-4).
/// Per-prefix counter of invalid-key attempts. Reset on success.
/// Map key: API key prefix (`ofx_live_XXXXXXXX`, 17 chars). Value: (attempts, first_seen).
pub type PrefixLockoutMap =
    std::sync::Arc<dashmap::DashMap<String, (u32, std::time::Instant)>>;

const PREFIX_LOCKOUT_THRESHOLD: u32 = 10;       // invalid attempts before lockout
const PREFIX_LOCKOUT_WINDOW_SECS: u64 = 60;     // sliding window
const PREFIX_LOCKOUT_DURATION_SECS: u64 = 900;  // 15min lockout

/// State for the `require_api_key` middleware. The dashmap caches verified
/// API key tokens for 30s to skip Argon2 (~200ms) on hot keys.
///
/// **Cache-invalidation contract (audit P2 SEC-4)** : the cache MUST be cleared
/// whenever an `api_keys.status` or `users.status` change could invalidate a
/// previously-cached `UserCtxExt`. Confirmed call-sites (verified by grep
/// 2026-05-22) :
///
/// | Action                                         | Cache action |
/// |------------------------------------------------|--------------|
/// | `admin::update_user` with status change        | `cache.clear()` ([admin.rs](../../../Offivex-api/src/admin.rs)) |
/// | `admin::rotate_user_api_key`                   | `cache.clear()` (same) |
/// | `admin::revoke_user_api_key`                   | `cache.clear()` if any keys were revoked |
/// | `admin::grant_user_access` (NEW key only)      | no-op (fresh key not in cache) |
/// | `watcher::activate_payment` (NEW key only)     | no-op (fresh key not in cache) |
///
/// If a future endpoint mutates these tables (e.g. user-self rotate in Phase 7),
/// it MUST follow the same contract — otherwise a stale entry in this cache
/// will let a revoked/suspended user keep operating for up to 30s.
#[derive(Clone)]
pub struct ApiKeyAuthState {
    pub db: Arc<tokio_rusqlite::Connection>,
    pub cache: Arc<dashmap::DashMap<String, (offivex_api::user::UserCtxExt, std::time::Instant)>>,
    /// Audit SEC-MAX-4 — per-prefix invalid-attempt counter for lockout.
    pub lockout: PrefixLockoutMap,
}

/// Cache TTL for verified API keys. Below the Argon2 verification cost — keeps
/// the hot path fast even under polling load.
const API_KEY_CACHE_TTL_SECS: u64 = 30;

/// Middleware: requires `Authorization: Bearer ofx_live_<32-chars>` AND that the
/// key resolves to an active user. **Does NOT enforce active subscription** —
/// the handler (e.g. `user_me`) decides what to do with key-valid-but-no-plan.
/// This keeps the middleware single-responsibility and lets `/user/me` return
/// 402 with diagnostic info.
pub async fn require_api_key(
    State(state): State<ApiKeyAuthState>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    use offivex_api::user::UserCtxExt;
    use offivex_core::payment::api_key_format;
    use offivex_crypto::verify_password_phc;
    use offivex_db::repo::api_key_repo::ApiKeyRepo;
    use offivex_db::repo::subscription_repo::SubscriptionRepo;
    use offivex_db::repo::user_repo::UserRepo;

    let token = match extract_bearer(&request) {
        Some(t) => t,
        None => return unauthorized("Missing Authorization: Bearer <api key>"),
    };

    // Fast format check before any work
    if !api_key_format::looks_valid(&token) {
        return unauthorized("Invalid API key format");
    }

    let token_sha = sha256_hex_token(&token);

    // 30s cache fast-path: skip Argon2 verification on hot keys
    if let Some(entry) = state.cache.get(&token_sha) {
        if entry.1.elapsed() < std::time::Duration::from_secs(API_KEY_CACHE_TTL_SECS) {
            let ctx = entry.0.clone();
            drop(entry); // release dashmap ref before next.run
            request.extensions_mut().insert(ctx);
            return next.run(request).await;
        }
    }

    let prefix = match api_key_format::parse_prefix(&token) {
        Some(p) => p.to_string(),
        None => return unauthorized("Invalid API key format"),
    };

    // Audit SEC-MAX-4 — brute-force lockout check BEFORE expensive lookup/verify.
    // If this prefix has accumulated too many invalid attempts in the rolling
    // window, return 429 immediately without touching the DB or Argon2.
    if let Some(entry) = state.lockout.get(&prefix) {
        let (count, first_seen) = *entry;
        let elapsed = first_seen.elapsed().as_secs();
        if count >= PREFIX_LOCKOUT_THRESHOLD && elapsed < PREFIX_LOCKOUT_DURATION_SECS {
            tracing::warn!(
                prefix = %prefix,
                count,
                "API key prefix locked out (brute-force protection)"
            );
            return (
                StatusCode::TOO_MANY_REQUESTS,
                Json(json!({
                    "success": false,
                    "error": "rate_limited",
                    "message": "Too many invalid key attempts on this prefix. Try again later."
                })),
            )
                .into_response();
        }
        // Lockout window expired — reset counter on next attempt.
        if elapsed >= PREFIX_LOCKOUT_DURATION_SECS {
            drop(entry);
            state.lockout.remove(&prefix);
        }
    }

    let candidates = match ApiKeyRepo::find_active_by_prefix(&state.db, &prefix).await {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(error = %e, "api_key lookup failed");
            return internal_error();
        }
    };

    // Audit SEC-MAX-1 — Argon2 verification is CPU-intensive (~200ms by design).
    // Running it inline blocks the async runtime worker thread, which means
    // 8 concurrent invalid-key probes can saturate a typical tokio runtime.
    // We offload to `spawn_blocking` (dedicated blocking thread pool) so the
    // async runtime stays responsive.
    //
    // Also: iterate candidates with constant-time-style "no early exit" — verify
    // ALL candidates regardless of match position. Prevents timing oracle on
    // candidate position (defense-in-depth; the verify cost dominates anyway).
    let token_for_verify = token.clone();
    let verify_result: Option<offivex_db::models::ApiKey> = tokio::task::spawn_blocking(move || {
        let mut matched: Option<offivex_db::models::ApiKey> = None;
        for c in candidates {
            // Always verify (no short-circuit) until we've checked all candidates.
            let is_match = verify_password_phc(&token_for_verify, &c.key_hash)
                .unwrap_or(false);
            if is_match && matched.is_none() {
                matched = Some(c);
                // Do NOT break — continue iterating to keep timing constant.
            }
        }
        matched
    })
    .await
    .unwrap_or(None);
    let api_key = match verify_result {
        Some(k) => k,
        None => {
            // Audit SEC-MAX-4 — increment lockout counter for this prefix.
            // We use entry API for atomic counter increment.
            let now = std::time::Instant::now();
            state
                .lockout
                .entry(prefix.clone())
                .and_modify(|(count, first_seen)| {
                    // Reset if window expired
                    if first_seen.elapsed().as_secs() > PREFIX_LOCKOUT_WINDOW_SECS {
                        *count = 1;
                        *first_seen = now;
                    } else {
                        *count = count.saturating_add(1);
                    }
                })
                .or_insert((1, now));
            return unauthorized("Invalid API key");
        }
    };

    // Audit SEC-MAX-4 — successful auth clears the lockout counter for this prefix.
    state.lockout.remove(&prefix);

    // Load user
    let user = match UserRepo::find_by_id(&state.db, &api_key.user_id).await {
        Ok(Some(u)) if u.status == "active" => u,
        Ok(Some(_)) => return unauthorized("User suspended"),
        Ok(None) => return unauthorized("User no longer exists"),
        Err(e) => {
            tracing::error!(error = %e, "user lookup failed");
            return internal_error();
        }
    };

    // Load active subscription (may be None — handler decides what to do)
    let sub = match SubscriptionRepo::find_active_by_user(&state.db, &user.id).await {
        Ok(s) => s,
        Err(e) => {
            tracing::error!(error = %e, "subscription lookup failed");
            return internal_error();
        }
    };

    let ctx = UserCtxExt {
        user_id: user.id,
        api_key_id: api_key.id.clone(),
        api_key_prefix: api_key.key_prefix,
        subscription_id: sub.as_ref().map(|s| s.id.clone()),
        plan_id: sub.as_ref().map(|s| s.plan_id.clone()),
        subscription_expires_at: sub.as_ref().and_then(|s| s.expires_at),
    };

    state
        .cache
        .insert(token_sha, (ctx.clone(), std::time::Instant::now()));

    // Bump last_used_at fire-and-forget — never block the request
    let db = state.db.clone();
    let key_id = api_key.id;
    tokio::spawn(async move {
        let _ = ApiKeyRepo::mark_used(&db, &key_id).await;
    });

    request.extensions_mut().insert(ctx);
    next.run(request).await
}

fn sha256_hex_token(s: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    hex::encode(h.finalize())
}

/// Middleware: requires the request has already passed `require_api_key` AND the
/// user has an active subscription (`plan_id.is_some() && expires_at > now`).
/// Returns 402 PAYMENT_REQUIRED otherwise.
///
/// Layered AFTER `require_api_key` (so the UserCtxExt is present), BEFORE
/// `require_unlocked` (which also needs to pass for actual signing operations).
pub async fn require_active_plan(
    request: Request<Body>,
    next: Next,
) -> Response {
    use offivex_api::user::UserCtxExt;

    let ctx = match request.extensions().get::<UserCtxExt>() {
        Some(c) => c.clone(),
        None => {
            tracing::error!("require_active_plan called without UserCtxExt — middleware order bug");
            return internal_error();
        }
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let expires = ctx.subscription_expires_at.unwrap_or(0);

    if ctx.plan_id.is_none() || expires <= now {
        return (
            StatusCode::PAYMENT_REQUIRED,
            Json(json!({
                "success": false,
                "error": "no_active_plan",
                "message": "Your subscription is not active. Contact admin to renew."
            })),
        )
            .into_response();
    }

    next.run(request).await
}
