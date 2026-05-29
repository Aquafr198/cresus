//! User-facing handlers (Phase 6 minimal subset to support frontend finalization).
//!
//! For Phase 5.7-5.8 we need just `GET /user/me` — returns user identity + plan
//! status when the request carries a valid API key. The middleware `require_api_key`
//! lives in `Offivex-server/src/auth.rs` and injects `UserCtxExt` into request
//! extensions.
//!
//! 402 (Payment Required) is returned when the API key is valid but the user has
//! no active subscription — the frontend uses this to redirect to a renewal CTA.

use std::sync::Arc;

use axum::{
    extract::{Extension, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use serde_json::json;
use tokio_rusqlite::Connection;

use crate::error::AppError;
use offivex_db::repo::{
    plan_repo::PlanRepo, subscription_repo::SubscriptionRepo, user_repo::UserRepo,
};

/// Context injected by `offivex_server::auth::require_api_key` into request
/// extensions. The middleware crate cannot depend on this one (Offivex-server →
/// Offivex-api is the dep direction), so we declare the type here and the
/// middleware imports it from Offivex-api.
#[derive(Clone, Debug)]
pub struct UserCtxExt {
    pub user_id: String,
    pub api_key_id: String,
    pub api_key_prefix: String,
    pub subscription_id: Option<String>,
    pub plan_id: Option<String>,
    pub subscription_expires_at: Option<i64>,
}

/// Audit PERF-MAX-1 — type alias for the shared in-memory plan cache.
/// Owned by AppState (Offivex-server), shared into UserHandlerState.
pub type PlanCacheRef = Arc<std::sync::RwLock<std::collections::HashMap<String, offivex_db::models::Plan>>>;

#[derive(Clone)]
pub struct UserHandlerState {
    pub db: Arc<Connection>,
    pub plan_cache: PlanCacheRef,
}

#[derive(Debug, Serialize)]
pub struct UserMeSubscription {
    pub plan_slug: String,
    pub plan_name: String,
    pub status: String,
    pub started_at: Option<i64>,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct UserMeView {
    pub id: String,
    pub email: String,
    pub telegram: Option<String>,
    pub status: String,
    pub api_key_prefix: String,
    pub subscription: Option<UserMeSubscription>,
}

pub async fn user_me(
    State(state): State<UserHandlerState>,
    Extension(ctx): Extension<UserCtxExt>,
) -> Result<Response, AppError> {
    let user = UserRepo::find_by_id(&state.db, &ctx.user_id)
        .await?
        .ok_or_else(|| AppError::not_found("user vanished"))?;

    if user.status != "active" {
        return Ok((
            StatusCode::FORBIDDEN,
            Json(json!({
                "success": false,
                "error": "user_suspended"
            })),
        )
            .into_response());
    }

    // Load the LATEST subscription (may be expired/canceled/pending). We use
    // find_latest_by_user so we can return a "subscription history exists but
    // not active" hint to the frontend instead of just "no subscription".
    let latest_sub = SubscriptionRepo::find_latest_by_user(&state.db, &user.id).await?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let plan_active = match latest_sub.as_ref() {
        Some(s) => s.status == "active" && s.expires_at.map(|e| e > now).unwrap_or(false),
        None => false,
    };

    if !plan_active {
        // 402 Payment Required — key is valid but plan is expired/absent.
        // The frontend redirects to /pay or renewal CTA.
        return Ok((
            StatusCode::PAYMENT_REQUIRED,
            Json(json!({
                "success": false,
                "error": "no_active_plan",
                "data": {
                    "user_id": user.id,
                    "email": user.email,
                    "telegram": user.telegram,
                }
            })),
        )
            .into_response());
    }

    // Active plan — load plan details to return.
    // Audit PERF-MAX-1 — read from the in-memory plan cache (loaded at boot).
    // Eliminates 1 DB query per /user/me hit. `/user/me` is called by AuthGate
    // on every page mount, so this is hot. Cache is busted by admin endpoint
    // `POST /admin/plans/reload` if plans are edited.
    //
    // Audit L.1 — replaced `.expect()` and poison-`.expect()` with typed
    // errors. A `panic!` here would return a generic 500 with no client
    // hint; the typed `AppError::internal` keeps the response shape stable
    // and lets the frontend distinguish from network errors.
    let sub = latest_sub.ok_or_else(|| {
        AppError::internal("plan_active flag set but no latest subscription found")
    })?;
    let plan = {
        let guard = state
            .plan_cache
            .read()
            .map_err(|_| AppError::internal("plan_cache poisoned"))?;
        guard.get(&sub.plan_id).cloned().ok_or_else(|| {
            AppError::internal("plan referenced by subscription not in cache")
        })?
    };

    let view = UserMeView {
        id: user.id,
        email: user.email,
        telegram: user.telegram,
        status: user.status,
        api_key_prefix: ctx.api_key_prefix,
        subscription: Some(UserMeSubscription {
            plan_slug: plan.slug,
            plan_name: plan.name,
            status: sub.status,
            started_at: sub.started_at,
            expires_at: sub.expires_at,
        }),
    };

    Ok(Json(json!({ "success": true, "data": view })).into_response())
}

// ─────────────────────────────────────────────────────────────────────────
// Billing — payments + subscription (Phase 6.5)
// Gated by `require_api_key` only (NOT `require_active_plan`) so an expired
// user can still inspect their own history to make a renewal decision.
// ─────────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct UserPaymentView {
    pub id: String,
    pub plan_slug: String,
    pub plan_name: String,
    pub status: String,
    pub amount_usd_cents: i64,
    pub amount_lamports: Option<i64>,
    pub amount_sol_str: Option<String>,
    pub sol_usd_rate_cents: Option<i64>,
    pub tx_hash: Option<String>,
    pub created_at: i64,
    pub confirmed_at: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct UserSubscriptionView {
    pub status: String,
    pub plan_slug: String,
    pub plan_name: String,
    pub plan_price_usd_cents: i64,
    pub plan_duration_days: i64,
    pub started_at: Option<i64>,
    pub expires_at: Option<i64>,
    pub days_remaining: i64,
    pub active: bool,
}

pub async fn user_billing_payments(
    State(state): State<UserHandlerState>,
    Extension(ctx): Extension<UserCtxExt>,
) -> Result<Response, AppError> {
    use offivex_db::repo::payment_repo::PaymentRepo;

    // Audit PERF-MAX-1 — read from in-memory plan cache (loaded at boot).
    // Eliminates 1 DB query per /user/billing/payments request. Cache is busted
    // by admin endpoint `POST /admin/plans/reload` (rare).
    let plans_by_id: std::collections::HashMap<String, (String, String)> = {
        let guard = state.plan_cache.read().expect("plan_cache poisoned");
        guard
            .iter()
            .map(|(id, p)| (id.clone(), (p.slug.clone(), p.name.clone())))
            .collect()
    };

    let rows = PaymentRepo::list_by_user(&state.db, &ctx.user_id).await?;

    let views: Vec<UserPaymentView> = rows
        .into_iter()
        .map(|p| {
            let (plan_slug, plan_name) = plans_by_id
                .get(&p.plan_id)
                .cloned()
                .unwrap_or_else(|| ("unknown".to_string(), "Unknown plan".to_string()));
            let amount_sol_str = p
                .amount_lamports
                .map(offivex_core::payment::sol_price::lamports_to_sol_str);
            UserPaymentView {
                id: p.id,
                plan_slug,
                plan_name,
                status: p.status,
                amount_usd_cents: p.amount_usd_cents,
                amount_lamports: p.amount_lamports,
                amount_sol_str,
                sol_usd_rate_cents: p.sol_usd_rate_cents,
                tx_hash: p.tx_hash,
                created_at: p.created_at,
                confirmed_at: p.confirmed_at,
            }
        })
        .collect();

    Ok(Json(json!({ "success": true, "data": views })).into_response())
}

pub async fn user_billing_subscription(
    State(state): State<UserHandlerState>,
    Extension(ctx): Extension<UserCtxExt>,
) -> Result<Response, AppError> {
    let latest = SubscriptionRepo::find_latest_by_user(&state.db, &ctx.user_id).await?;

    let sub = match latest {
        Some(s) => s,
        None => {
            return Ok(Json(json!({
                "success": true,
                "data": null
            }))
            .into_response());
        }
    };

    let plan = PlanRepo::get_by_id(&state.db, &sub.plan_id)
        .await?
        .ok_or_else(|| AppError::internal("plan referenced by subscription vanished"))?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let expires = sub.expires_at.unwrap_or(0);
    let active = sub.status == "active" && expires > now;
    let days_remaining = if active {
        ((expires - now) + 86_399) / 86_400 // ceil
    } else {
        0
    };

    let view = UserSubscriptionView {
        status: sub.status,
        plan_slug: plan.slug,
        plan_name: plan.name,
        plan_price_usd_cents: plan.price_usd_cents,
        plan_duration_days: plan.duration_days,
        started_at: sub.started_at,
        expires_at: sub.expires_at,
        days_remaining,
        active,
    };

    Ok(Json(json!({ "success": true, "data": view })).into_response())
}

// ─────────────────────────────────────────────────────────────────────────
// Referral — code + stats + list (Phase 6.5)
// Gated by `require_api_key` only. A user without an active plan can still
// see their referral code (so they can share before paying themselves).
// ─────────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct UserReferralCodeView {
    pub code: String,
    pub share_url: String,
}

#[derive(Debug, Serialize)]
pub struct UserReferralStatsView {
    pub total_referees: i64,
    pub active_referees: i64,
    pub total_earnings_cents: i64,
}

#[derive(Debug, Serialize)]
pub struct UserReferralListItem {
    pub referee_id_masked: String,
    pub plan_slug: Option<String>,
    pub subscription_status: Option<String>,
    pub joined_at: i64,
    pub earnings_cents: i64,
}

/// Generate a fresh referral code of the form `OFX-XXXXXX` (6 chars, base36).
/// Collisions are vanishingly unlikely (36^6 ≈ 2.1 billion) but we retry on
/// UNIQUE violation as a safety net.
fn generate_referral_code() -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::thread_rng();
    let suffix: String = (0..6)
        .map(|_| CHARSET[rng.gen_range(0..CHARSET.len())] as char)
        .collect();
    format!("OFX-{suffix}")
}

const REFERRAL_EARNINGS_BPS: i64 = 1_000; // 10% commission (1000 bps)
const REFERRAL_SHARE_BASE: &str = "https://offivex.io/apply?ref=";

pub async fn user_referral_code(
    State(state): State<UserHandlerState>,
    Extension(ctx): Extension<UserCtxExt>,
) -> Result<Response, AppError> {
    use offivex_db::repo::user_repo::UserRepo;

    let user = UserRepo::find_by_id(&state.db, &ctx.user_id)
        .await?
        .ok_or_else(|| AppError::not_found("user vanished"))?;

    let code = match user.referral_code.clone() {
        Some(c) => c,
        None => {
            // Generate + persist; retry on UNIQUE collision.
            let mut code = String::new();
            for _ in 0..5 {
                let candidate = generate_referral_code();
                match UserRepo::set_referral_code(&state.db, &user.id, &candidate).await {
                    Ok(_) => {
                        code = candidate;
                        break;
                    }
                    Err(_) => continue,
                }
            }
            if code.is_empty() {
                return Err(AppError::internal("failed to allocate referral code"));
            }
            code
        }
    };

    let view = UserReferralCodeView {
        share_url: format!("{REFERRAL_SHARE_BASE}{code}"),
        code,
    };
    Ok(Json(json!({ "success": true, "data": view })).into_response())
}

pub async fn user_referral_stats(
    State(state): State<UserHandlerState>,
    Extension(ctx): Extension<UserCtxExt>,
) -> Result<Response, AppError> {
    use offivex_db::repo::referral_repo::ReferralRepo;

    let stats = ReferralRepo::stats_for_referrer(
        &state.db,
        &ctx.user_id,
        REFERRAL_EARNINGS_BPS,
    )
    .await?;

    let view = UserReferralStatsView {
        total_referees: stats.total_referees,
        active_referees: stats.active_referees,
        total_earnings_cents: stats.total_earnings_cents,
    };
    Ok(Json(json!({ "success": true, "data": view })).into_response())
}

pub async fn user_referral_list(
    State(state): State<UserHandlerState>,
    Extension(ctx): Extension<UserCtxExt>,
) -> Result<Response, AppError> {
    use offivex_db::repo::referral_repo::ReferralRepo;

    let rows = ReferralRepo::list_by_referrer(
        &state.db,
        &ctx.user_id,
        REFERRAL_EARNINGS_BPS,
    )
    .await?;

    let items: Vec<UserReferralListItem> = rows
        .into_iter()
        .map(|r| UserReferralListItem {
            referee_id_masked: mask_user_id(&r.referee_user_id),
            plan_slug: r.plan_slug,
            subscription_status: r.subscription_status,
            joined_at: r.joined_at,
            earnings_cents: r.earnings_cents,
        })
        .collect();

    Ok(Json(json!({ "success": true, "data": items })).into_response())
}

/// Mask a UUID-like user id for privacy: keep first 4 chars + last 2.
fn mask_user_id(id: &str) -> String {
    if id.len() <= 8 {
        return format!("user_{}", "*".repeat(id.len()));
    }
    let prefix: String = id.chars().take(4).collect();
    let suffix: String = id.chars().rev().take(2).collect::<Vec<_>>().into_iter().rev().collect();
    format!("user_{prefix}…{suffix}")
}
