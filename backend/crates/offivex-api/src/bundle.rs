use axum::{
    extract::{Extension, Path, State},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_rusqlite::Connection;

use crate::error::AppError;
use crate::user::UserCtxExt;
use offivex_core::bundle::builder::{self, LaunchConfig, LpDisposition, SnipeBuyEntry};
use offivex_core::rpc::manager::RpcManager;
use offivex_crypto::SecretBytes;
use offivex_db::repo::audit_repo::AuditRepo;
use offivex_db::repo::bundle_repo::BundleRepo;

/// Shared state needed by bundle handlers.
#[derive(Clone)]
pub struct BundleState {
    pub db: Arc<Connection>,
    pub rpc: RpcManager,
    pub master_key: Arc<RwLock<Option<SecretBytes>>>,
    /// Optional Telegram bot token used to broadcast confirmed launches.
    /// `None` disables auto-post (the default in dev).
    pub telegram_bot_token: Option<String>,
    /// Optional public channel/chat where launch announcements are posted.
    /// `None` disables auto-post even if a bot token is present.
    pub telegram_launch_channel_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LaunchRequest {
    pub token_mint: String,
    pub creator_wallet_id: String,
    pub sol_liquidity: u64,
    pub token_liquidity: u64,
    pub jito_tip_lamports: u64,
    pub base_lot_size: Option<u64>,
    pub quote_lot_size: Option<u64>,
    pub snipe_buys: Vec<SnipeBuyRequest>,
    /// Tokens (raw, decimal-scaled) intentionally kept in the creator wallet
    /// at launch. Defines the baseline for the dev-sold detector.
    pub creator_reserve_tokens: Option<u64>,
    /// LP disposition: `burn` (default, anti-rug) or `keep`. See
    /// `LpDisposition` for the trade-offs.
    #[serde(default)]
    pub lp_disposition: LpDisposition,
    /// Must be true to execute on-chain. Prevents accidental launches.
    #[serde(default)]
    pub confirmed: bool,
}

#[derive(Debug, Deserialize)]
pub struct SnipeBuyRequest {
    pub wallet_id: String,
    pub sol_amount: u64,
    pub min_token_out: Option<u64>,
}

/// POST /api/v1/bundles/launch — Execute an atomic token launch bundle.
pub async fn launch(
    State(state): State<BundleState>,
    Extension(user_ctx): Extension<UserCtxExt>,
    Json(body): Json<LaunchRequest>,
) -> Result<Response, AppError> {
    if !body.confirmed {
        return Err(AppError::bad_request(
            "This action requires confirmation. Send { \"confirmed\": true } to proceed.",
        ));
    }
    if let Err(e) = crate::validation::validate_solana_address(&body.token_mint) {
        return Err(AppError::bad_request(format!("Invalid token_mint: {}", e)));
    }
    let creator_wallet_id = body.creator_wallet_id.clone();
    let token_mint_for_announce = body.token_mint.clone();
    let config = LaunchConfig {
        token_mint: body.token_mint,
        creator_wallet_id: body.creator_wallet_id,
        sol_liquidity: body.sol_liquidity,
        token_liquidity: body.token_liquidity,
        jito_tip_lamports: body.jito_tip_lamports,
        base_lot_size: body.base_lot_size.unwrap_or(1),
        quote_lot_size: body.quote_lot_size.unwrap_or(1),
        snipe_buys: body
            .snipe_buys
            .into_iter()
            .map(|s| SnipeBuyEntry {
                wallet_id: s.wallet_id,
                sol_amount: s.sol_amount,
                min_token_out: s.min_token_out,
            })
            .collect(),
        creator_reserve_tokens: body.creator_reserve_tokens,
        lp_disposition: body.lp_disposition,
    };

    let result =
        builder::execute_launch(&state.db, &state.rpc, &state.master_key, config).await?;

    // A.4 — fire-and-forget Telegram announcement for confirmed launches.
    // Skipped silently when the channel or bot token isn't configured. Errors
    // are logged but never block the response — the on-chain launch is the
    // source of truth.
    if result.status == "confirmed" {
        if let (Some(bot_token), Some(channel_id)) = (
            state.telegram_bot_token.clone(),
            state.telegram_launch_channel_id.clone(),
        ) {
            let token_mint = token_mint_for_announce.clone();
            let market = result.market_address.clone();
            let pool = result.pool_address.clone();
            let bundle_id = result.bundle_id.clone();
            tokio::spawn(async move {
                let esc = crate::telegram::escape_markdown_v2;
                let msg = format!(
                    "🚀 *New launch on Offivex*\n\n*Mint:* `{}`\n*Market:* `{}`\n*Pool:* `{}`\n*Bundle:* `{}`",
                    esc(&token_mint),
                    esc(&market),
                    esc(&pool),
                    esc(&bundle_id),
                );
                if let Err(e) =
                    crate::telegram::send_message(&bot_token, &channel_id, &msg).await
                {
                    tracing::warn!(
                        bundle_id = %bundle_id,
                        "Telegram launch announcement failed: {}",
                        e
                    );
                }
            });
        }
    }

    crate::metrics::inc_bundle_launch();
    crate::audit::log_audit(
        &state.db,
        "bundle.launch",
        &format!("Bundle {} — market: {}", &result.bundle_id, &result.market_address),
        Some(&creator_wallet_id),
        None,
    )
    .await;

    // Audit SEC-MAX-3 — data-plane forensic audit with user_id.
    let _ = AuditRepo::insert_full(
        &state.db,
        "user_op_bundle_launch",
        &format!(
            "bundle_id={} creator_wallet={} market={} pool={}",
            result.bundle_id, creator_wallet_id, result.market_address, result.pool_address
        ),
        None,
        None,
        None,
        Some(&user_ctx.user_id),
        None,
    )
    .await;

    Ok(Json(json!({ "success": true, "data": {
        "bundle_id": result.bundle_id,
        "market_address": result.market_address,
        "pool_address": result.pool_address,
        "status": result.status,
    }}))
    .into_response())
}

/// GET /api/v1/bundles — List all bundles.
pub async fn list_bundles(State(state): State<BundleState>) -> Result<Response, AppError> {
    let bundles = BundleRepo::list_all(&state.db).await.map_err(|e| {
        tracing::error!("DB error: {:?}", e);
        AppError::internal("Database error")
    })?;

    let data: Vec<_> = bundles
        .iter()
        .map(|b| {
            json!({
                "id": b.id,
                "token_id": b.token_id,
                "status": b.status,
                "jito_bundle_id": b.jito_bundle_id,
                "market_address": b.market_address,
                "pool_address": b.pool_address,
                "error_message": b.error_message,
                "created_at": b.created_at,
                "executed_at": b.executed_at,
            })
        })
        .collect();
    Ok(Json(json!({ "success": true, "data": data })).into_response())
}

/// GET /api/v1/bundles/:id — Get a single bundle.
pub async fn get_bundle(
    State(state): State<BundleState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let b = BundleRepo::get_by_id(&state.db, id)
        .await
        .map_err(|e| {
            tracing::error!("DB error: {:?}", e);
            AppError::internal("Database error")
        })?
        .ok_or_else(|| AppError::not_found("Bundle not found"))?;

    Ok(Json(json!({ "success": true, "data": {
        "id": b.id,
        "token_id": b.token_id,
        "config_json": b.config_json,
        "status": b.status,
        "jito_bundle_id": b.jito_bundle_id,
        "market_address": b.market_address,
        "pool_address": b.pool_address,
        "tx_signatures": b.tx_signatures,
        "error_message": b.error_message,
        "created_at": b.created_at,
        "executed_at": b.executed_at,
    }}))
    .into_response())
}

#[derive(Debug, Deserialize)]
pub struct CollectFeesRequest {
    pub pool_address: String,
    pub creator_wallet_id: String,
}

/// POST /api/v1/bundles/collect-fees — Collect LP fees from a Raydium pool.
pub async fn collect_fees(
    State(state): State<BundleState>,
    Json(body): Json<CollectFeesRequest>,
) -> Result<Response, AppError> {
    // Validate pool address
    if let Err(e) = crate::validation::validate_solana_address(&body.pool_address) {
        return Err(AppError::bad_request(format!("Invalid pool address: {}", e)));
    }

    let pool_address = body.pool_address.parse().map_err(|_| {
        AppError::bad_request("Invalid pool address format")
    })?;

    // Load creator wallet
    let mek_guard = state.master_key.read().await;
    let mek = mek_guard.as_ref().ok_or_else(|| {
        AppError::forbidden("Master key locked - unlock first")
    })?;

    let wallet_id = body.creator_wallet_id.clone();
    let (ciphertext, nonce_vec) = state
        .db
        .call(move |conn| {
            let mut stmt = conn
                .prepare("SELECT encrypted_secret, nonce FROM wallets WHERE id = ?")?;
            let ciphertext: Vec<u8> = stmt.query_row([&wallet_id], |row| row.get(0))?;
            let nonce_vec: Vec<u8> = stmt.query_row([&wallet_id], |row| row.get(1))?;
            Ok((ciphertext, nonce_vec))
        })
        .await
        .map_err(|e| {
            tracing::error!("DB error: {:?}", e);
            AppError::internal("Database error")
        })?;

    let mut nonce = [0u8; 12];
    if nonce_vec.len() != 12 {
        return Err(AppError::internal("Invalid nonce"));
    }
    nonce.copy_from_slice(&nonce_vec);

    let encrypted_payload = offivex_crypto::EncryptedPayload {
        ciphertext,
        nonce,
    };

    let decrypted = offivex_crypto::decrypt(&encrypted_payload, mek)
        .map_err(|_| AppError::internal("Decryption failed"))?;

    let creator_keypair = offivex_core::wallet::keygen::keypair_from_bytes(decrypted.as_ref())
        .map_err(|_| AppError::internal("Invalid keypair"))?;

    drop(mek_guard);

    // Get RPC client
    let (rpc_client, _) = state.rpc.get_client().await.map_err(|e| {
        AppError::internal(format!("RPC error: {}", e))
    })?;

    // Collect fees
    match offivex_core::token::fees::collect_creator_fees(
        &pool_address,
        &creator_keypair,
        &rpc_client,
    )
    .await
    {
        Ok(signature) => {
            tracing::info!("Fees collected: {}", signature);
            Ok(Json(json!({
                "success": true,
                "data": {
                    "signature": signature,
                    "pool_address": body.pool_address,
                }
            }))
            .into_response())
        }
        Err(e) => {
            tracing::warn!("Fee collection failed: {}", e);
            Err(AppError::internal(format!("Fee collection failed: {}", e)))
        }
    }
}
