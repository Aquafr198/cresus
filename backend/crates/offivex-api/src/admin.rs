//! Admin panel handlers — apply requests management (Phase 4).
//!
//! Wider admin surfaces (users/payments/plans/stats) land in Phase 7.

use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Extension, Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio_rusqlite::Connection;
use uuid::Uuid;

use crate::admin_auth::AdminCtxExt;
use crate::error::AppError;
use offivex_db::repo::api_key_repo::ApiKeyRepo;
use offivex_db::repo::apply_repo::ApplyRepo;
use offivex_db::repo::audit_repo::AuditRepo;
use offivex_db::repo::payment_repo::PaymentRepo;
use offivex_db::repo::plan_repo::PlanRepo;
use offivex_db::repo::subscription_repo::SubscriptionRepo;
use offivex_db::repo::user_repo::UserRepo;

/// Shared cache type alias — must match what `offivex_server::auth::require_api_key`
/// uses. We keep the type opaque here (it's just an Arc<DashMap>) so admin handlers
/// can `.clear()` it after revoke/rotate/suspend operations to drop stale UserCtx
/// entries on the user-side middleware.
pub type ApiKeyCacheRef =
    Arc<dashmap::DashMap<String, (crate::user::UserCtxExt, std::time::Instant)>>;

/// Drop every cached verification entry that belongs to `user_id`. Linear
/// scan over the cache (size bounded by 30-second TTL) — typically <500
/// entries even under heavy load. Used by admin endpoints that mutate a
/// single user's keys/status so that user's old credentials stop working
/// immediately, without nuking the rest of the platform's hot cache.
pub fn evict_cache_for_user(cache: &ApiKeyCacheRef, user_id: &str) {
    cache.retain(|_token_sha, (ctx, _ts)| ctx.user_id != user_id);
}

/// Audit OPS-MAX-4 — type alias for the watcher health gauges shared between
/// Offivex-server (writer) and admin handler (reader).
pub type WatcherHealthRef = Arc<dyn WatcherHealthRead + Send + Sync>;

pub trait WatcherHealthRead {
    fn last_tick_at(&self) -> i64;
    fn last_tick_duration_ms(&self) -> u64;
    fn total_ticks(&self) -> u64;
    fn total_errors(&self) -> u64;
}

/// Shared write-locked map of plan_slug → Plan. Same Arc as the user-side
/// `state.plan_cache` so a `/admin/plans/reload` write is observed by every
/// data-plane reader on the next request.
pub type PlanCacheRef =
    Arc<std::sync::RwLock<std::collections::HashMap<String, offivex_db::models::Plan>>>;

#[derive(Clone)]
pub struct AdminHandlerState {
    pub db: Arc<Connection>,
    /// Shared with offivex_server::auth::ApiKeyAuthState — admin handlers call
    /// `.clear()` after destructive ops (revoke/rotate/suspend) so user requests
    /// re-verify against the DB on the very next call instead of waiting 30s.
    pub api_key_cache: ApiKeyCacheRef,
    /// Audit OPS-MAX-4 — watcher health for /admin/watcher-status.
    pub watcher_health: WatcherHealthRef,
    /// Audit OPS-MAX-4 — treasury pubkey (logged at boot, exposed for status).
    pub treasury_pubkey: String,
    /// Required by master-password rotation — re-encrypts the seed phrase +
    /// every wallet secret with a fresh MEK derived from the new password.
    pub wallet_mgr: offivex_core::wallet::manager::WalletManager,
    /// Live plan cache shared with `UserHandlerState` — `/admin/plans/reload`
    /// reads PlanRepo::list_all and rebuilds this map so user-side reads see
    /// fresh prices on the next /user/me / /user/billing/* call instead of
    /// waiting for the next process restart.
    pub plan_cache: PlanCacheRef,
}

// ── List applies ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ListAppliesQuery {
    /// pending | approved | rejected | all (default: pending)
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize)]
struct ApplyView {
    id: String,
    telegram: String,
    email: String,
    project: String,
    plan_pref: Option<String>,
    status: String,
    submitted_at: i64,
    decided_at: Option<i64>,
    decided_by_admin_id: Option<String>,
    user_id_after_approval: Option<String>,
    ip: Option<String>,
    notes: Option<String>,
}

impl From<offivex_db::models::ApplyRequest> for ApplyView {
    fn from(a: offivex_db::models::ApplyRequest) -> Self {
        Self {
            id: a.id,
            telegram: a.telegram,
            email: a.email,
            project: a.project,
            plan_pref: a.plan_pref,
            status: a.status,
            submitted_at: a.submitted_at,
            decided_at: a.decided_at,
            decided_by_admin_id: a.decided_by_admin_id,
            user_id_after_approval: a.user_id_after_approval,
            ip: a.ip,
            notes: a.notes,
        }
    }
}

pub async fn list_applies(
    State(state): State<AdminHandlerState>,
    Extension(_ctx): Extension<AdminCtxExt>,
    Query(q): Query<ListAppliesQuery>,
) -> Result<Response, AppError> {
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let offset = q.offset.unwrap_or(0).max(0);

    let status_filter = match q.status.as_deref() {
        Some("all") | None | Some("") => None,
        Some("pending") => Some("pending"),
        Some("approved") => Some("approved"),
        Some("rejected") => Some("rejected"),
        Some(other) => {
            return Err(AppError::bad_request(format!(
                "invalid status filter: {other}"
            )));
        }
    };

    // Default filter = pending (most useful admin view)
    let effective_filter = match q.status.as_deref() {
        None => Some("pending"),
        Some("all") | Some("") => None,
        _ => status_filter,
    };

    let rows = ApplyRepo::list_paginated(&state.db, effective_filter, limit, offset).await?;
    let views: Vec<ApplyView> = rows.into_iter().map(Into::into).collect();

    Ok(Json(json!({ "success": true, "data": views })).into_response())
}

// ── Approve ─────────────────────────────────────────────────────────────

pub async fn approve_apply(
    State(state): State<AdminHandlerState>,
    Extension(ctx): Extension<AdminCtxExt>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let apply = ApplyRepo::get_by_id(&state.db, &id)
        .await?
        .ok_or_else(|| AppError::not_found("apply request not found"))?;

    if apply.status != "pending" {
        return Err(AppError::conflict(format!(
            "apply is already {}",
            apply.status
        )));
    }

    // If a user with this email already exists, link instead of creating duplicate.
    let (user_id, existed) = match UserRepo::find_by_email(&state.db, &apply.email).await? {
        Some(existing) => (existing.id, true),
        None => {
            let new_id = Uuid::new_v4().to_string();
            let _ = UserRepo::create(
                &state.db,
                &new_id,
                &apply.email,
                Some(&apply.telegram),
                Some(&apply.id),
            )
            .await?;
            (new_id, false)
        }
    };

    ApplyRepo::mark_approved(&state.db, &apply.id, &ctx.admin_id, &user_id).await?;

    // Phase 6.5 — if the apply carried a referral code that matches an existing
    // user (and the referee is NOT the referrer themselves), create the
    // referrer→referee link. Failure is non-fatal (already-referred, code
    // belongs to deleted user, etc.) — we just log it.
    //
    // Audit POST-2 — the existence-check alone does NOT prove the referrer
    // actually referred this user; a guessed code lets anyone self-attribute.
    // We log the referee's apply email+telegram into audit_log so admin can
    // manually verify (or future tooling can flag suspicious patterns like
    // many referrals from unrelated emails to the same referrer). The link is
    // still created (correct UX for the typical case where users share their
    // own code), but every link is auditable end-to-end.
    let mut referred_by_user_id: Option<String> = None;
    if let Some(ref code) = apply.referral_code {
        match offivex_db::repo::user_repo::UserRepo::find_by_referral_code(&state.db, code).await? {
            Some(referrer) if referrer.id != user_id => {
                let referral_id = Uuid::new_v4().to_string();
                match offivex_db::repo::referral_repo::ReferralRepo::insert(
                    &state.db,
                    &referral_id,
                    &referrer.id,
                    &user_id,
                )
                .await
                {
                    Ok(_) => {
                        referred_by_user_id = Some(referrer.id.clone());
                        // Audit POST-2 — include verifiable metadata (apply
                        // email + telegram + IP if present) so an admin can
                        // diagnose suspicious self-attribution.
                        let _ = AuditRepo::insert_full(
                            &state.db,
                            "referral_linked",
                            &format!(
                                "referrer={} referee={} code={} apply_email={} apply_telegram={} apply_ip={}",
                                referrer.id,
                                user_id,
                                code,
                                apply.email,
                                apply.telegram,
                                apply.ip.as_deref().unwrap_or("-")
                            ),
                            None,
                            None,
                            Some(&ctx.admin_id),
                            Some(&user_id),
                            apply.ip.as_deref(),
                        )
                        .await;
                    }
                    Err(e) => {
                        // UNIQUE collision (already-referred) or other — non-fatal
                        tracing::warn!(
                            error = %e,
                            referrer = %referrer.id,
                            referee = %user_id,
                            "referral link failed (likely UNIQUE collision)"
                        );
                    }
                }
            }
            Some(_) => {
                tracing::info!(code = %code, "self-referral ignored");
                // Audit SEC-MAX-6 — self-referral attempt visible to admin.
                let _ = AuditRepo::insert_full(
                    &state.db,
                    "apply_self_referral_attempt",
                    &format!(
                        "code={} apply_email={} apply_ip={}",
                        code,
                        apply.email,
                        apply.ip.as_deref().unwrap_or("-")
                    ),
                    None,
                    None,
                    Some(&ctx.admin_id),
                    Some(&user_id),
                    apply.ip.as_deref(),
                )
                .await;
            }
            None => {
                // Audit SEC-MAX-6 — referral code provided but not matching any
                // user. Could be a typo, but also could be enumeration attempt
                // (attacker scanning the code space). Logged at WARN + audit_log
                // so admin can detect a brute-force pattern via:
                //   sqlite3 offivex.db "SELECT created_at, details FROM audit_log
                //                       WHERE action = 'apply_invalid_referral_code'
                //                       ORDER BY created_at DESC LIMIT 100"
                tracing::warn!(
                    code = %code,
                    apply_email = %apply.email,
                    apply_ip = ?apply.ip,
                    "Apply submitted with unknown referral_code — possible enumeration"
                );
                let _ = AuditRepo::insert_full(
                    &state.db,
                    "apply_invalid_referral_code",
                    &format!(
                        "code={} apply_email={} apply_telegram={} apply_ip={}",
                        code,
                        apply.email,
                        apply.telegram,
                        apply.ip.as_deref().unwrap_or("-")
                    ),
                    None,
                    None,
                    Some(&ctx.admin_id),
                    Some(&user_id),
                    apply.ip.as_deref(),
                )
                .await;
            }
        }
    }

    let _ = AuditRepo::insert_full(
        &state.db,
        "apply_approved",
        &format!(
            "apply_id={} user_id={} existed={} referred_by={}",
            apply.id, user_id, existed,
            referred_by_user_id.as_deref().unwrap_or("-")
        ),
        None,
        None,
        Some(&ctx.admin_id),
        Some(&user_id),
        None,
    )
    .await;

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "data": {
                "apply_id": apply.id,
                "user_id": user_id,
                "user_already_existed": existed,
            }
        })),
    )
        .into_response())
}

// ── Reject ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct RejectBody {
    pub notes: Option<String>,
}

pub async fn reject_apply(
    State(state): State<AdminHandlerState>,
    Extension(ctx): Extension<AdminCtxExt>,
    Path(id): Path<String>,
    Json(body): Json<RejectBody>,
) -> Result<Response, AppError> {
    let apply = ApplyRepo::get_by_id(&state.db, &id)
        .await?
        .ok_or_else(|| AppError::not_found("apply request not found"))?;

    if apply.status != "pending" {
        return Err(AppError::conflict(format!(
            "apply is already {}",
            apply.status
        )));
    }

    let notes = body
        .notes
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    ApplyRepo::mark_rejected(&state.db, &apply.id, &ctx.admin_id, notes.as_deref()).await?;

    let _ = AuditRepo::insert_full(
        &state.db,
        "apply_rejected",
        &format!(
            "apply_id={} notes_len={}",
            apply.id,
            notes.as_deref().map(|s| s.len()).unwrap_or(0)
        ),
        None,
        None,
        Some(&ctx.admin_id),
        None,
        None,
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "apply_id": apply.id }
    }))
    .into_response())
}

// ── Pending count (for dashboard stub) ──────────────────────────────────

pub async fn dashboard_stats(
    State(state): State<AdminHandlerState>,
    Extension(_ctx): Extension<AdminCtxExt>,
) -> Result<Response, AppError> {
    let pending_applies = ApplyRepo::count_pending(&state.db).await?;
    let active_users = UserRepo::count_active(&state.db).await?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "pending_applies": pending_applies,
            "active_users": active_users,
        }
    }))
    .into_response())
}

// ── Payments list (admin dashboard payments view) ──────────────────────

#[derive(Debug, Deserialize)]
pub struct ListPaymentsQuery {
    /// pending | confirming | confirmed | underpaid | expired | failed | all (default: all)
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize)]
struct AdminPaymentView {
    id: String,
    user_id: String,
    plan_id: String,
    provider: String,
    amount_usd_cents: i64,
    amount_lamports: Option<i64>,
    amount_lamports_received: Option<i64>,
    amount_sol_str: Option<String>,
    sol_usd_rate_cents: Option<i64>,
    status: String,
    solana_address: Option<String>,
    tx_hash: Option<String>,
    created_at: i64,
    confirmed_at: Option<i64>,
    expires_at: Option<i64>,
}

impl AdminPaymentView {
    fn from_model(p: offivex_db::models::Payment) -> Self {
        let amount_sol_str = p
            .amount_lamports
            .map(offivex_core::payment::sol_price::lamports_to_sol_str);
        Self {
            id: p.id,
            user_id: p.user_id,
            plan_id: p.plan_id,
            provider: p.provider,
            amount_usd_cents: p.amount_usd_cents,
            amount_lamports: p.amount_lamports,
            amount_lamports_received: p.amount_lamports_received,
            amount_sol_str,
            sol_usd_rate_cents: p.sol_usd_rate_cents,
            status: p.status,
            solana_address: p.solana_address,
            tx_hash: p.tx_hash,
            created_at: p.created_at,
            confirmed_at: p.confirmed_at,
            expires_at: p.expires_at,
        }
    }
}

pub async fn list_payments(
    State(state): State<AdminHandlerState>,
    Extension(_ctx): Extension<AdminCtxExt>,
    Query(q): Query<ListPaymentsQuery>,
) -> Result<Response, AppError> {
    let limit = q.limit.unwrap_or(100).clamp(1, 500);
    let offset = q.offset.unwrap_or(0).max(0);

    let rows =
        offivex_db::repo::payment_repo::PaymentRepo::list_paginated(&state.db, limit, offset)
            .await?;

    // Filter by status post-fetch (table is small for Phase 5/6). For larger
    // volumes push the filter to SQL.
    let filtered: Vec<AdminPaymentView> = match q.status.as_deref() {
        None | Some("") | Some("all") => {
            rows.into_iter().map(AdminPaymentView::from_model).collect()
        }
        Some(status) => rows
            .into_iter()
            .filter(|p| p.status == status)
            .map(AdminPaymentView::from_model)
            .collect(),
    };

    Ok(Json(json!({ "success": true, "data": filtered })).into_response())
}

// ═════════════════════════════════════════════════════════════════════════
// Section 16 — User management A→Z
// ═════════════════════════════════════════════════════════════════════════

fn now_ts() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

// ── Shared view types ───────────────────────────────────────────────────

#[derive(Debug, Serialize)]
struct SubSummary {
    plan_slug: String,
    plan_name: String,
    status: String,
    expires_at: Option<i64>,
}

#[derive(Debug, Serialize)]
struct AdminUserListView {
    id: String,
    email: String,
    telegram: Option<String>,
    status: String,
    created_at: i64,
    active_subscription: Option<SubSummary>,
    active_api_key_prefix: Option<String>,
}

#[derive(Debug, Serialize)]
struct SubscriptionWithPlan {
    id: String,
    plan_slug: String,
    plan_name: String,
    status: String,
    started_at: Option<i64>,
    expires_at: Option<i64>,
    current_payment_id: Option<String>,
    created_at: i64,
}

#[derive(Debug, Serialize)]
struct ApiKeySummary {
    id: String,
    key_prefix: String,
    status: String,
    created_at: i64,
    last_used_at: Option<i64>,
    revoked_at: Option<i64>,
    revoked_by_admin_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct AdminUserDetailView {
    user: offivex_db::models::User,
    apply_origin: Option<offivex_db::models::ApplyRequest>,
    subscriptions: Vec<SubscriptionWithPlan>,
    payments: Vec<AdminPaymentView>,
    api_keys: Vec<ApiKeySummary>,
    audit_log: Vec<offivex_db::models::AuditEntry>,
}

// ── GET /admin/users ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ListUsersQuery {
    pub q: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_users(
    State(state): State<AdminHandlerState>,
    Extension(_ctx): Extension<AdminCtxExt>,
    Query(q): Query<ListUsersQuery>,
) -> Result<Response, AppError> {
    let limit = q.limit.unwrap_or(100).clamp(1, 500);
    let offset = q.offset.unwrap_or(0).max(0);

    let users = UserRepo::search_paginated(
        &state.db,
        q.q.as_deref(),
        q.status.as_deref(),
        limit,
        offset,
    )
    .await?;

    // Enrich each user with their active subscription + active api_key prefix.
    // This is N+1 — fine for admin panels with hundreds of users; if it grows
    // we can switch to a single JOIN query.
    let mut views = Vec::with_capacity(users.len());
    for u in users {
        let active_sub = SubscriptionRepo::find_active_by_user(&state.db, &u.id).await?;
        let sub_summary = match active_sub {
            Some(s) => {
                let plan = PlanRepo::get_by_id(&state.db, &s.plan_id).await?;
                plan.map(|p| SubSummary {
                    plan_slug: p.slug,
                    plan_name: p.name,
                    status: s.status,
                    expires_at: s.expires_at,
                })
            }
            None => None,
        };
        let active_key = ApiKeyRepo::find_active_by_user(&state.db, &u.id).await?;
        views.push(AdminUserListView {
            id: u.id,
            email: u.email,
            telegram: u.telegram,
            status: u.status,
            created_at: u.created_at,
            active_subscription: sub_summary,
            active_api_key_prefix: active_key.map(|k| k.key_prefix),
        });
    }

    Ok(Json(json!({ "success": true, "data": views })).into_response())
}

// ── GET /admin/users/{user_id} ──────────────────────────────────────────

pub async fn get_user_detail(
    State(state): State<AdminHandlerState>,
    Extension(_ctx): Extension<AdminCtxExt>,
    Path(user_id): Path<String>,
) -> Result<Response, AppError> {
    let view = build_user_detail(&state.db, &user_id).await?;
    Ok(Json(json!({ "success": true, "data": view })).into_response())
}

async fn build_user_detail(
    db: &Arc<Connection>,
    user_id: &str,
) -> Result<AdminUserDetailView, AppError> {
    let user = UserRepo::find_by_id(db, user_id)
        .await?
        .ok_or_else(|| AppError::not_found("user not found"))?;

    let apply_origin = match &user.created_from_apply_id {
        Some(id) => ApplyRepo::get_by_id(db, id).await?,
        None => None,
    };

    // Subscriptions with plan join
    let subs = SubscriptionRepo::list_by_user(db, &user.id).await?;
    let mut subs_view = Vec::with_capacity(subs.len());
    for s in subs {
        let plan = PlanRepo::get_by_id(db, &s.plan_id).await?;
        let (plan_slug, plan_name) = match plan {
            Some(p) => (p.slug, p.name),
            None => (s.plan_id.clone(), "(deleted)".into()),
        };
        subs_view.push(SubscriptionWithPlan {
            id: s.id,
            plan_slug,
            plan_name,
            status: s.status,
            started_at: s.started_at,
            expires_at: s.expires_at,
            current_payment_id: s.current_payment_id,
            created_at: s.created_at,
        });
    }

    // Payments for this user
    let payment_rows = PaymentRepo::list_by_user(db, &user.id).await?;
    let payments: Vec<AdminPaymentView> = payment_rows
        .into_iter()
        .map(AdminPaymentView::from_model)
        .collect();

    // API keys (all, newest first)
    let keys = ApiKeyRepo::list_by_user(db, &user.id).await?;
    let api_keys: Vec<ApiKeySummary> = keys
        .into_iter()
        .map(|k| ApiKeySummary {
            id: k.id,
            key_prefix: k.key_prefix,
            status: k.status,
            created_at: k.created_at,
            last_used_at: k.last_used_at,
            revoked_at: k.revoked_at,
            revoked_by_admin_id: k.revoked_by_admin_id,
        })
        .collect();

    // Audit log (last 50)
    let audit_log = AuditRepo::list_by_user(db, &user.id, 50, 0).await?;

    Ok(AdminUserDetailView {
        user,
        apply_origin,
        subscriptions: subs_view,
        payments,
        api_keys,
        audit_log,
    })
}

// ── PATCH /admin/users/{user_id} ────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct UpdateUserBody {
    pub status: Option<String>,
    pub notes: Option<String>,
}

pub async fn update_user(
    State(state): State<AdminHandlerState>,
    Extension(ctx): Extension<AdminCtxExt>,
    Path(user_id): Path<String>,
    Json(body): Json<UpdateUserBody>,
) -> Result<Response, AppError> {
    let user = UserRepo::find_by_id(&state.db, &user_id)
        .await?
        .ok_or_else(|| AppError::not_found("user not found"))?;

    let mut changes = Vec::<String>::new();

    if let Some(new_status) = body.status.as_deref() {
        if new_status != "active" && new_status != "suspended" {
            return Err(AppError::bad_request("status must be 'active' or 'suspended'"));
        }
        if new_status != user.status {
            UserRepo::set_status(&state.db, &user.id, new_status).await?;
            changes.push(format!("status:{}→{}", user.status, new_status));
        }
    }

    if let Some(new_notes) = body.notes.as_deref() {
        let trimmed = new_notes.trim();
        if trimmed.chars().count() > 2000 {
            return Err(AppError::bad_request("notes too long (max 2000 chars)"));
        }
        UserRepo::set_notes(&state.db, &user.id, trimmed).await?;
        changes.push(format!("notes:len={}", trimmed.chars().count()));
    }

    if !changes.is_empty() {
        let _ = AuditRepo::insert_full(
            &state.db,
            "admin_user_updated",
            &changes.join(" "),
            None,
            None,
            Some(&ctx.admin_id),
            Some(&user.id),
            None,
        )
        .await;
        // Bust cache entries for THIS user only so a suspend takes effect
        // immediately. Audit H.5 — previously `clear()` wiped every user's
        // cached verification, forcing a thundering herd of Argon2 re-verifies
        // across the platform every time any admin clicked Suspend.
        if body.status.is_some() {
            evict_cache_for_user(&state.api_key_cache, &user.id);
        }
    }

    let view = build_user_detail(&state.db, &user.id).await?;
    Ok(Json(json!({ "success": true, "data": view })).into_response())
}

// ── POST /admin/users/{user_id}/grant ───────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct GrantBody {
    pub plan_slug: String,
}

#[derive(Debug, Serialize)]
struct GrantResult {
    /// Plaintext API key — populated ONLY when a new key was generated.
    /// If the user already had an active key, this is null and existing key stays valid.
    api_key_plaintext: Option<String>,
    key_prefix: String,
    subscription: SubSummary,
    /// `true` if a new key was generated and revealed here (one-shot).
    new_key_revealed: bool,
}

pub async fn grant_user_access(
    State(state): State<AdminHandlerState>,
    Extension(ctx): Extension<AdminCtxExt>,
    Path(user_id): Path<String>,
    Json(body): Json<GrantBody>,
) -> Result<Response, AppError> {
    use offivex_core::payment::api_key_format;

    // 1. Validate user
    let user = UserRepo::find_by_id(&state.db, &user_id)
        .await?
        .ok_or_else(|| AppError::not_found("user not found"))?;
    if user.status != "active" {
        return Err(AppError::bad_request(format!(
            "cannot grant to user with status='{}'",
            user.status
        )));
    }

    // 2. Validate plan
    let plan = PlanRepo::get_by_slug(&state.db, body.plan_slug.trim())
        .await?
        .ok_or_else(|| AppError::bad_request(format!("unknown plan: {}", body.plan_slug)))?;
    if plan.is_active != 1 {
        return Err(AppError::bad_request("plan is not active"));
    }

    // 3. Extend / create active subscription (uses string literal "manual_grant" as payment id)
    let sub_id = Uuid::new_v4().to_string();
    let duration_secs = plan.duration_days * 86_400;
    let sub = SubscriptionRepo::upsert_active(
        &state.db,
        &sub_id,
        &user.id,
        &plan.id,
        duration_secs,
        "manual_grant",
    )
    .await?;

    // 4. Generate new key ONLY if user has no active key
    let existing = ApiKeyRepo::find_active_by_user(&state.db, &user.id).await?;
    let (plaintext, prefix, new_revealed) = match existing {
        Some(k) => (None, k.key_prefix, false),
        None => {
            let pt = api_key_format::generate();
            let hash = offivex_crypto::hash_password_phc(&pt)
                .map_err(|e| AppError::internal(format!("hash: {e}")))?;
            let key_prefix = api_key_format::parse_prefix(&pt)
                .ok_or_else(|| AppError::internal("generated key has no valid prefix"))?
                .to_string();
            let key_id = Uuid::new_v4().to_string();
            ApiKeyRepo::insert(&state.db, &key_id, &user.id, &hash, &key_prefix).await?;
            (Some(pt), key_prefix, true)
        }
    };

    // 5. Audit
    let _ = AuditRepo::insert_full(
        &state.db,
        "admin_granted_access",
        &format!(
            "user_id={} plan={} duration_days={} new_key={}",
            user.id, plan.slug, plan.duration_days, new_revealed
        ),
        None,
        None,
        Some(&ctx.admin_id),
        Some(&user.id),
        None,
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": GrantResult {
            api_key_plaintext: plaintext,
            key_prefix: prefix,
            subscription: SubSummary {
                plan_slug: plan.slug,
                plan_name: plan.name,
                status: sub.status,
                expires_at: sub.expires_at,
            },
            new_key_revealed: new_revealed,
        }
    }))
    .into_response())
}

// ── POST /admin/users/{user_id}/rotate-key ──────────────────────────────

#[derive(Debug, Serialize)]
struct RotateResult {
    api_key_plaintext: String,
    key_prefix: String,
}

pub async fn rotate_user_api_key(
    State(state): State<AdminHandlerState>,
    Extension(ctx): Extension<AdminCtxExt>,
    Path(user_id): Path<String>,
) -> Result<Response, AppError> {
    use offivex_core::payment::api_key_format;

    let user = UserRepo::find_by_id(&state.db, &user_id)
        .await?
        .ok_or_else(|| AppError::not_found("user not found"))?;

    let plaintext = api_key_format::generate();
    let hash = offivex_crypto::hash_password_phc(&plaintext)
        .map_err(|e| AppError::internal(format!("hash: {e}")))?;
    let prefix = api_key_format::parse_prefix(&plaintext)
        .ok_or_else(|| AppError::internal("generated key has no valid prefix"))?
        .to_string();
    let new_id = Uuid::new_v4().to_string();

    // ApiKeyRepo::rotate is atomic (revoke old + insert new in single TX)
    ApiKeyRepo::rotate(&state.db, &user.id, &new_id, &hash, &prefix).await?;

    // Bust cache entries for THIS user only — the old key (if cached) is
    // now revoked. Targeted eviction avoids a thundering herd across the
    // platform.
    evict_cache_for_user(&state.api_key_cache, &user.id);

    let _ = AuditRepo::insert_full(
        &state.db,
        "admin_rotated_key",
        &format!("user_id={} new_key_prefix={}", user.id, prefix),
        None,
        None,
        Some(&ctx.admin_id),
        Some(&user.id),
        None,
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": RotateResult { api_key_plaintext: plaintext, key_prefix: prefix }
    }))
    .into_response())
}

// ── POST /admin/users/{user_id}/revoke-key ──────────────────────────────

pub async fn revoke_user_api_key(
    State(state): State<AdminHandlerState>,
    Extension(ctx): Extension<AdminCtxExt>,
    Path(user_id): Path<String>,
) -> Result<Response, AppError> {
    let user = UserRepo::find_by_id(&state.db, &user_id)
        .await?
        .ok_or_else(|| AppError::not_found("user not found"))?;

    // Revoke all active keys for this user (typically 1 due to partial UNIQUE index)
    let keys = ApiKeyRepo::list_by_user(&state.db, &user.id).await?;
    let mut revoked = 0i64;
    for k in keys {
        if k.status == "active" {
            ApiKeyRepo::revoke(&state.db, &k.id, Some(&ctx.admin_id)).await?;
            revoked += 1;
        }
    }

    // Bust cache entries for THIS user only — revoked keys must be
    // invalidated immediately, but no need to wipe the rest of the
    // platform's cached verifications.
    if revoked > 0 {
        evict_cache_for_user(&state.api_key_cache, &user.id);
    }

    let _ = AuditRepo::insert_full(
        &state.db,
        "admin_revoked_keys",
        &format!("user_id={} count={}", user.id, revoked),
        None,
        None,
        Some(&ctx.admin_id),
        Some(&user.id),
        None,
    )
    .await;

    // Suppress dead-code warning for now_ts in trivial branch
    let _ = now_ts;

    Ok(Json(json!({
        "success": true,
        "data": { "revoked": revoked }
    }))
    .into_response())
}

// ─── POST /admin/master-password/change ────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ChangeMasterPasswordBody {
    pub current_password: String,
    pub new_password: String,
}

/// Rotate the wallet vault master password. Verifies `current_password`,
/// derives a new MEK from `new_password`, then re-encrypts the seed phrase
/// + verify token + every wallet secret in a single SQL transaction. The
/// caller's vault must already be unlocked (defence in depth — an admin
/// session cookie alone shouldn't be enough to rotate the encryption key).
pub async fn change_master_password(
    State(state): State<AdminHandlerState>,
    Extension(ctx): Extension<AdminCtxExt>,
    Json(body): Json<ChangeMasterPasswordBody>,
) -> Result<Response, AppError> {
    if body.current_password.is_empty() || body.new_password.is_empty() {
        return Err(AppError::bad_request(
            "current_password and new_password must not be empty",
        ));
    }
    if body.current_password == body.new_password {
        return Err(AppError::bad_request(
            "new_password must differ from current_password",
        ));
    }
    if !state.wallet_mgr.is_unlocked().await {
        return Err(AppError::forbidden(
            "vault is locked — unlock it on the user app before rotating the master password",
        ));
    }

    match state
        .wallet_mgr
        .change_password(&body.current_password, &body.new_password)
        .await
    {
        Ok(()) => {}
        Err(e) => {
            use offivex_core::wallet::manager::WalletError;
            let msg = e.to_string();
            return match e {
                WalletError::InvalidPassword => {
                    Err(AppError::bad_request("current password is incorrect"))
                }
                WalletError::Other(_) if msg.contains("12 characters") => {
                    Err(AppError::bad_request(msg))
                }
                WalletError::Other(_) if msg.contains("letters and digits") => {
                    Err(AppError::bad_request(msg))
                }
                _ => {
                    tracing::error!(error = ?e, "change_master_password failed");
                    Err(AppError::internal(format!("rotation failed: {msg}")))
                }
            };
        }
    }

    let _ = AuditRepo::insert_full(
        &state.db,
        "admin_master_password_rotated",
        "wallet vault MEK rotated by admin",
        None,
        None,
        Some(&ctx.admin_id),
        None,
        None,
    )
    .await;

    Ok(Json(json!({ "success": true })).into_response())
}

// ─── Audit OPS-MAX-4 — watcher health ──────────────────────────────────────

/// GET /api/v1/admin/watcher-status — operational visibility on the payment
/// watcher background task. Lets admin see at-a-glance whether the watcher
/// is ticking, how long its sweeps take, and how many errors it has hit
/// without needing to grep server logs.
pub async fn watcher_status(
    State(state): State<AdminHandlerState>,
    Extension(_ctx): Extension<AdminCtxExt>,
) -> Result<Response, AppError> {
    use offivex_db::repo::payment_repo::PaymentRepo;

    // Pending invoice counts straight from DB (single COUNT query — cheap).
    let pending = PaymentRepo::find_pending_or_confirming(&state.db, 1000)
        .await
        .map(|v| v.len())
        .unwrap_or(0);

    let last_tick_at = state.watcher_health.last_tick_at();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let secs_since_last_tick = if last_tick_at > 0 { now - last_tick_at } else { -1 };

    Ok(Json(json!({
        "success": true,
        "data": {
            "treasury_pubkey": state.treasury_pubkey,
            "last_tick_at": last_tick_at,
            "secs_since_last_tick": secs_since_last_tick,
            "last_tick_duration_ms": state.watcher_health.last_tick_duration_ms(),
            "total_ticks_since_boot": state.watcher_health.total_ticks(),
            "total_errors_since_boot": state.watcher_health.total_errors(),
            "pending_or_confirming_count": pending,
            // Healthy if tick fired within the last 60s (interval is 5s default).
            "healthy": secs_since_last_tick >= 0 && secs_since_last_tick < 60,
        }
    }))
    .into_response())
}

// ─── Plan cache reload ─────────────────────────────────────────────────────

/// POST /api/v1/admin/plans/reload — re-read all plans from the DB and
/// atomically swap the in-memory cache. Without this endpoint, admin price
/// updates (done directly via DB or a future PATCH endpoint) only take
/// effect after a server restart because the boot-loaded `plan_cache` map
/// is otherwise read-only at runtime.
pub async fn reload_plan_cache(
    State(state): State<AdminHandlerState>,
    Extension(ctx): Extension<AdminCtxExt>,
) -> Result<Response, AppError> {
    let plans = offivex_db::repo::plan_repo::PlanRepo::list_all(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("plan_cache reload — PlanRepo::list_all failed: {:?}", e);
            AppError::internal("Database error")
        })?;
    let count = plans.len();
    {
        let mut guard = state
            .plan_cache
            .write()
            .map_err(|_| AppError::internal("plan_cache poisoned"))?;
        guard.clear();
        for plan in plans {
            guard.insert(plan.slug.clone(), plan);
        }
    }
    let _ = offivex_db::repo::audit_repo::AuditRepo::insert_full(
        &state.db,
        "admin_op_plan_cache_reload",
        &format!("admin={} plans_loaded={}", ctx.admin_id, count),
        None,
        None,
        Some(&ctx.admin_id),
        None,
        None,
    )
    .await;
    tracing::info!(admin_id = %ctx.admin_id, count, "plan_cache reloaded");
    Ok(Json(json!({ "success": true, "data": { "plans_loaded": count } })).into_response())
}
