//! Payment HTTP handlers (Phase 5.5) — direct on-chain Solana invoice flow.
//!
//! Three endpoints:
//! - `POST /admin/users/{user_id}/invoices` (require_admin) — admin issues an invoice
//! - `GET  /pay/{invoice_id}` (public — invoice_id IS the secret) — initial render data
//! - `GET  /pay/{invoice_id}/status` (public, polling target) — one-shot api_key reveal post-confirm
//!
//! The `POST /user/pay` renewal endpoint is deferred to Phase 6 (depends on `require_api_key`).

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Extension, Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use solana_sdk::pubkey::Pubkey;
use tokio_rusqlite::Connection;
use uuid::Uuid;

use crate::admin_auth::AdminCtxExt;
use crate::error::AppError;
use offivex_core::payment::derivation;
use offivex_core::payment::sol_price;
use offivex_core::rpc::manager::RpcManager;
use offivex_crypto::SecretBytes;
use offivex_db::repo::audit_repo::AuditRepo;
use offivex_db::repo::payment_repo::PaymentRepo;
use offivex_db::repo::plan_repo::PlanRepo;
use offivex_db::repo::user_repo::UserRepo;

#[derive(Clone)]
pub struct PaymentHandlerState {
    pub db: Arc<Connection>,
    #[allow(dead_code)]
    pub rpc: Arc<RpcManager>,
    pub treasury_seed: Arc<SecretBytes>,
    pub treasury_pubkey: Pubkey,
    pub default_invoice_ttl_secs: i64,
}

// ─── POST /admin/users/{user_id}/invoices ───────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateInvoiceBody {
    pub plan_slug: String,
}

#[derive(Debug, Serialize)]
pub struct InvoiceCreatedView {
    pub invoice_id: String,
    pub address: String,
    pub amount_lamports: i64,
    pub amount_sol_str: String,
    pub amount_usd_cents: i64,
    pub sol_usd_rate_cents: i64,
    pub expires_at: i64,
    pub plan_slug: String,
    pub plan_name: String,
}

pub async fn admin_create_invoice(
    State(state): State<PaymentHandlerState>,
    Extension(admin): Extension<AdminCtxExt>,
    Path(user_id): Path<String>,
    Json(body): Json<CreateInvoiceBody>,
) -> Result<Response, AppError> {
    // 1. Validate user
    let user = UserRepo::find_by_id(&state.db, &user_id)
        .await?
        .ok_or_else(|| AppError::not_found("user not found"))?;
    if user.status != "active" {
        return Err(AppError::bad_request(format!(
            "user is {}",
            user.status
        )));
    }

    // 2. Load plan
    let plan_slug = body.plan_slug.trim();
    if plan_slug.is_empty() {
        return Err(AppError::bad_request("plan_slug is required"));
    }
    let plan = PlanRepo::get_by_slug(&state.db, plan_slug)
        .await?
        .ok_or_else(|| AppError::bad_request(format!("unknown plan: {plan_slug}")))?;
    if plan.is_active != 1 {
        return Err(AppError::bad_request(format!("plan is not active: {plan_slug}")));
    }

    // 3. Fetch SOL/USD rate (60s cached) — fail loud on oracle outage
    let sol_price_usd = sol_price::fetch_sol_usd_price().await.map_err(|e| {
        tracing::error!(error = %e, "SOL/USD price oracle unavailable");
        AppError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "Price oracle unavailable. Try again in a moment.",
        )
    })?;
    let sol_usd_rate_cents = sol_price::usd_price_to_cents(sol_price_usd);
    if sol_usd_rate_cents <= 0 {
        return Err(AppError::internal("price oracle returned invalid rate"));
    }
    let amount_lamports =
        sol_price::lamports_for_usd_cents(plan.price_usd_cents, sol_usd_rate_cents);
    if amount_lamports <= 0 {
        return Err(AppError::internal("amount computation returned non-positive lamports"));
    }

    // 4. Atomic create invoice (allocates derivation_index + inserts pending row)
    let invoice_id = Uuid::new_v4().to_string();
    let (payment, derivation_index) = PaymentRepo::create_invoice(
        &state.db,
        &invoice_id,
        &user.id,
        &plan.id,
        plan.price_usd_cents,
        amount_lamports,
        sol_usd_rate_cents,
        state.default_invoice_ttl_secs,
    )
    .await?;

    // 5. Derive the deposit address from derivation_index
    let derivation_index_u32 = u32::try_from(derivation_index).map_err(|_| {
        AppError::internal(format!(
            "derivation_index overflow: {derivation_index}",
        ))
    })?;
    // Arc<SecretBytes>::as_ref() → &SecretBytes ; then SecretBytes::as_ref() → &[u8]
    let seed_bytes: &[u8] = state.treasury_seed.as_ref().as_ref();
    let address_pubkey =
        derivation::derive_invoice_pubkey(seed_bytes, derivation_index_u32)
            .map_err(|e| {
                tracing::error!(error = %e, derivation_index, "invoice address derivation failed");
                AppError::internal("address derivation failed")
            })?;
    let address = address_pubkey.to_string();

    // 6. Set address on the payment row (one-shot setter)
    PaymentRepo::set_solana_address(&state.db, &invoice_id, &address).await?;

    // 7. Audit
    let _ = AuditRepo::insert_full(
        &state.db,
        "invoice_created",
        &format!(
            "invoice_id={} user_id={} plan={} amount_lamports={} rate_cents={}",
            invoice_id, user.id, plan.slug, amount_lamports, sol_usd_rate_cents
        ),
        None,
        None,
        Some(&admin.admin_id),
        Some(&user.id),
        None,
    )
    .await;

    let view = InvoiceCreatedView {
        invoice_id,
        address,
        amount_lamports,
        amount_sol_str: sol_price::lamports_to_sol_str(amount_lamports),
        amount_usd_cents: plan.price_usd_cents,
        sol_usd_rate_cents,
        expires_at: payment.expires_at.unwrap_or(0),
        plan_slug: plan.slug,
        plan_name: plan.name,
    };

    Ok((StatusCode::OK, Json(json!({ "success": true, "data": view }))).into_response())
}

// ─── GET /pay/{invoice_id} ──────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct InvoicePublicView {
    pub invoice_id: String,
    pub status: String,
    pub address: Option<String>,
    pub amount_lamports: Option<i64>,
    pub amount_sol_str: Option<String>,
    pub amount_usd_cents: i64,
    pub sol_usd_rate_cents: Option<i64>,
    pub expires_at: Option<i64>,
    pub plan_slug: String,
    pub plan_name: String,
}

pub async fn get_invoice_public(
    State(state): State<PaymentHandlerState>,
    Path(invoice_id): Path<String>,
) -> Result<Response, AppError> {
    let payment = PaymentRepo::get_by_id(&state.db, &invoice_id)
        .await?
        .ok_or_else(|| AppError::not_found("invoice not found"))?;

    let plan = PlanRepo::get_by_id(&state.db, &payment.plan_id)
        .await?
        .ok_or_else(|| AppError::internal("plan vanished — admin must intervene"))?;

    let amount_sol_str = payment
        .amount_lamports
        .map(sol_price::lamports_to_sol_str);

    let view = InvoicePublicView {
        invoice_id: payment.id,
        status: payment.status,
        address: payment.solana_address,
        amount_lamports: payment.amount_lamports,
        amount_sol_str,
        amount_usd_cents: payment.amount_usd_cents,
        sol_usd_rate_cents: payment.sol_usd_rate_cents,
        expires_at: payment.expires_at,
        plan_slug: plan.slug,
        plan_name: plan.name,
    };

    Ok(Json(json!({ "success": true, "data": view })).into_response())
}

// ─── GET /pay/{invoice_id}/status ───────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct InvoiceStatusView {
    pub status: String,
    pub confirmed_at: Option<i64>,
    pub tx_hash: Option<String>,
    /// Set ONLY on the first GET post-confirm that finds a non-NULL reveal_key.
    /// Subsequent calls return null even if the payment is still confirmed.
    pub api_key: Option<String>,
}

pub async fn get_invoice_status(
    State(state): State<PaymentHandlerState>,
    Path(invoice_id): Path<String>,
) -> Result<Response, AppError> {
    let payment = PaymentRepo::get_by_id(&state.db, &invoice_id)
        .await?
        .ok_or_else(|| AppError::not_found("invoice not found"))?;

    let api_key = if payment.status == "confirmed" {
        // Atomic SELECT-then-NULL — at most one caller ever sees the ciphertext.
        let encrypted = PaymentRepo::consume_reveal_key(&state.db, &invoice_id).await?;
        // SEC-3 — decrypt with the treasury-derived key. If decryption fails
        // (corrupted ciphertext, seed rotation, etc.) we return None rather than
        // panic; the user must contact admin for rotation.
        match encrypted {
            Some(blob) => match offivex_core::payment::reveal_crypto::decrypt_reveal(
                &blob,
                state.treasury_seed.as_ref(),
            ) {
                Ok(plaintext) => Some(plaintext),
                Err(e) => {
                    tracing::error!(
                        invoice_id = %invoice_id,
                        error = %e,
                        "reveal_key decryption failed — admin recovery required"
                    );
                    None
                }
            },
            None => None,
        }
    } else {
        None
    };

    let view = InvoiceStatusView {
        status: payment.status,
        confirmed_at: payment.confirmed_at,
        tx_hash: payment.tx_hash,
        api_key,
    };

    Ok(Json(json!({ "success": true, "data": view })).into_response())
}
