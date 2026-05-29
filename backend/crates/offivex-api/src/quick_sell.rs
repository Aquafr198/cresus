//! Quick-sell — panic-button endpoint that exits a token position in parallel
//! across every wallet that holds the mint.
//!
//! Driven by a global keyboard shortcut on the frontend (default F4 = sell-all,
//! F5 = sell-50%). The contract: one POST, atomically captured per-wallet
//! balances, parallel Jupiter swaps, return per-wallet results plus an
//! `elapsed_ms` measurement so the UI can show the latency it delivered.
//!
//! Each wallet sell runs as an independent `tokio` task — a failed leg does
//! not block the others (best-effort exit). The handler waits for all legs
//! to *submit* (not confirm), then returns. Confirmation polling is the
//! caller's responsibility (Solscan link per signature is the UX).

use axum::{
    extract::{Extension, State},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use std::time::Instant;

use crate::error::AppError;
use crate::trading::TradingState;
use crate::user::UserCtxExt;
use offivex_db::repo::audit_repo::AuditRepo;

#[derive(Debug, Deserialize)]
pub struct QuickSellRequest {
    /// SPL token mint to exit.
    pub mint: String,
    /// Percentage of each wallet's balance to sell. 1–100. 100 = sell-all.
    pub percent: u8,
    /// Slippage tolerance in basis points. UI defaults to 1500 (15%) which
    /// is the panic-exit baseline; users can override via Settings.
    #[serde(default = "default_slippage")]
    pub slippage_bps: u16,
    /// Optional wallet filter. If `Some`, only these wallet IDs are considered
    /// for the sell (still subject to "must hold the mint"). If `None`, the
    /// legacy behaviour applies: every wallet in the vault that holds the
    /// mint sells at `percent`%. Used by the launch dashboard per-wallet
    /// sell buttons.
    #[serde(default)]
    pub wallet_ids: Option<Vec<String>>,
}

fn default_slippage() -> u16 {
    1500
}

#[derive(Debug, Serialize)]
pub struct QuickSellPerWallet {
    pub wallet_id: String,
    pub public_key: String,
    /// Raw token units sold (UI amount × 10^decimals).
    pub token_amount: u64,
    pub signature: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct QuickSellResponse {
    pub mint: String,
    pub percent: u8,
    pub total_wallets: usize,
    pub successful: usize,
    pub failed: usize,
    pub elapsed_ms: u128,
    pub results: Vec<QuickSellPerWallet>,
}

/// POST /api/v1/trading/quick-sell
pub async fn quick_sell(
    State(state): State<TradingState>,
    Extension(user_ctx): Extension<UserCtxExt>,
    Json(body): Json<QuickSellRequest>,
) -> Result<Response, AppError> {
    let started = Instant::now();

    // Input validation.
    crate::validation::validate_solana_address(&body.mint)
        .map_err(|e| AppError::bad_request(format!("Invalid mint: {}", e)))?;
    if !(1..=100).contains(&body.percent) {
        return Err(AppError::bad_request("percent must be in 1..=100"));
    }
    if !(1..=5000).contains(&body.slippage_bps) {
        return Err(AppError::bad_request("slippage_bps must be in 1..=5000"));
    }

    let mint_pubkey = body
        .mint
        .parse::<solana_sdk::pubkey::Pubkey>()
        .map_err(|_| AppError::bad_request("Invalid mint pubkey"))?;

    // Require vault unlocked — same check as execute_swap.
    //
    // We DROP the read guard immediately and don't pre-clone the MEK at
    // handler scope. Each per-wallet task below clones fresh from
    // `state.master_key` so an admin `change_master_password` mid-flight
    // takes effect on subsequent decrypts (wallets are atomically re-
    // encrypted with the new key during rotation). Pre-cloning held the
    // OLD key bytes in 50+ in-flight tasks even after rotation, with the
    // risk of decrypt mismatches once the wallets had been re-encrypted.
    if state.master_key.read().await.is_none() {
        return Err(AppError::forbidden("App is locked"));
    }

    // Single RPC client shared across all parallel ops — RpcClient is
    // designed for concurrent use; the underlying reqwest pool fans out.
    let (rpc_client, _) = state
        .rpc
        .get_client()
        .await
        .map_err(|e| AppError::internal(format!("RPC error: {}", e)))?;
    let rpc_client = Arc::new(rpc_client);

    // List wallets — vault is single-tenant per install, so list_all is the
    // user's wallets. (Multi-tenant scoping is a pre-existing architectural
    // concern that the manual swap endpoint also doesn't filter on.)
    let wallets = offivex_db::repo::wallet_repo::WalletRepo::list_all(&state.db)
        .await
        .map_err(|e| AppError::internal(format!("Failed to list wallets: {}", e)))?;

    if wallets.is_empty() {
        return Err(AppError::bad_request("No wallets in vault"));
    }

    // Phase 1 — parallel balance lookup across all wallets. Each task returns
    // (wallet, holding_amount) if the wallet holds the mint, None otherwise.
    let balance_futures = wallets.into_iter().map(|wallet| {
        let rpc = Arc::clone(&rpc_client);
        let mint = body.mint.clone();
        async move {
            let pubkey = match wallet.public_key.parse::<solana_sdk::pubkey::Pubkey>() {
                Ok(p) => p,
                Err(_) => return None,
            };
            let balance = offivex_core::wallet::operations::get_balance(&rpc, &pubkey)
                .await
                .ok()?;
            balance
                .tokens
                .into_iter()
                .find(|t| t.mint == mint && t.amount > 0)
                .map(|t| (wallet, t.amount))
        }
    });
    let holders: Vec<_> = futures_util::future::join_all(balance_futures)
        .await
        .into_iter()
        .flatten()
        .collect();

    // Optional wallet filter. Used by the launch dashboard per-wallet sell
    // buttons (e.g. "sell 25% from wallet w-11 only"). When `None`, the
    // legacy behaviour applies: sell from every holder of the mint.
    let holders: Vec<_> = match &body.wallet_ids {
        Some(ids) if !ids.is_empty() => {
            let allow: std::collections::HashSet<&str> =
                ids.iter().map(String::as_str).collect();
            holders
                .into_iter()
                .filter(|(w, _)| allow.contains(w.id.as_str()))
                .collect()
        }
        _ => holders,
    };

    if holders.is_empty() {
        return Err(AppError::bad_request(format!(
            "No matching wallets hold mint {}",
            body.mint
        )));
    }

    // Phase 2 — parallel swap submission. Each task clones the MEK FRESH from
    // `state.master_key` so a concurrent `change_master_password` is honoured:
    // wallets are re-encrypted under the new key atomically with the rotation,
    // so any in-flight task that reads after the swap gets the matching key.
    let sell_futures = holders.into_iter().map(|(wallet, available)| {
        let db = Arc::clone(&state.db);
        let master_key = state.master_key.clone();
        let rpc = Arc::clone(&rpc_client);
        let mint_pk = mint_pubkey;
        let percent = body.percent;
        let slippage = body.slippage_bps;
        async move {
            let pct = percent.clamp(1, 100) as u128;
            let amount = ((available as u128).saturating_mul(pct) / 100) as u64;

            // Fresh MEK clone per task (held only across this one decrypt).
            let mek = match master_key.read().await.as_ref().cloned() {
                Some(m) => m,
                None => {
                    return QuickSellPerWallet {
                        wallet_id: wallet.id,
                        public_key: wallet.public_key,
                        token_amount: amount,
                        signature: None,
                        error: Some("vault locked mid-flight".into()),
                    };
                }
            };

            let keypair = match offivex_core::wallet::decrypt::decrypt_wallet_keypair(
                &db,
                &wallet.id,
                &mek,
            )
            .await
            {
                Ok(kp) => kp,
                Err(e) => {
                    return QuickSellPerWallet {
                        wallet_id: wallet.id,
                        public_key: wallet.public_key,
                        token_amount: amount,
                        signature: None,
                        error: Some(format!("decrypt failed: {}", e)),
                    };
                }
            };

            let result = offivex_core::trading::swap::sell_partial_balance(
                &keypair,
                &mint_pk,
                available,
                percent,
                slippage,
                &rpc,
            )
            .await;

            match result {
                Ok(sig) => QuickSellPerWallet {
                    wallet_id: wallet.id,
                    public_key: wallet.public_key,
                    token_amount: amount,
                    signature: Some(sig),
                    error: None,
                },
                Err(e) => QuickSellPerWallet {
                    wallet_id: wallet.id,
                    public_key: wallet.public_key,
                    token_amount: amount,
                    signature: None,
                    error: Some(e.to_string()),
                },
            }
        }
    });
    let results: Vec<QuickSellPerWallet> = futures_util::future::join_all(sell_futures).await;

    let successful = results.iter().filter(|r| r.signature.is_some()).count();
    let failed = results.len() - successful;
    let elapsed_ms = started.elapsed().as_millis();

    // Metrics + audit trail. We log one audit row per quick-sell call (the
    // per-wallet detail lives in `details`) rather than one per leg, to keep
    // the audit table from blowing up on multi-wallet exits.
    crate::metrics::add_swap(successful as u64);
    crate::metrics::add_swap_error(failed as u64);
    let signature_csv: String = results
        .iter()
        .filter_map(|r| r.signature.as_deref())
        .collect::<Vec<_>>()
        .join(",");
    let _ = AuditRepo::insert_full(
        &state.db,
        "user_op_quick_sell",
        &format!(
            "mint={} percent={} slippage_bps={} wallets={} ok={} fail={} elapsed_ms={}",
            body.mint,
            body.percent,
            body.slippage_bps,
            results.len(),
            successful,
            failed,
            elapsed_ms
        ),
        None,
        if signature_csv.is_empty() {
            None
        } else {
            Some(&signature_csv)
        },
        None,
        Some(&user_ctx.user_id),
        None,
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": QuickSellResponse {
            mint: body.mint,
            percent: body.percent,
            total_wallets: results.len(),
            successful,
            failed,
            elapsed_ms,
            results,
        }
    }))
    .into_response())
}
