use axum::{
    extract::{Extension, State},
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
use offivex_core::meme::metadata_builder::{build_metaplex_json, MetaplexJsonInput};
use offivex_core::meme::pinning::PinningService;
use offivex_core::rpc::manager::RpcManager;
use offivex_core::token::mint::{self, MintParams};
use offivex_core::token::clone;
use offivex_core::token::vanity::{self, VanityConfig};
use offivex_crypto::SecretBytes;
use offivex_db::repo::audit_repo::AuditRepo;

/// Shared state needed by token handlers.
#[derive(Clone)]
pub struct TokenState {
    pub db: Arc<Connection>,
    pub rpc: RpcManager,
    pub master_key: Arc<RwLock<Option<SecretBytes>>>,
    /// Used by mint flow to auto-pin a Metaplex JSON when the caller supplies
    /// social fields (twitter/telegram/website/image) instead of a pre-pinned
    /// metadata_uri.
    pub pinning: PinningService,
}

#[derive(Debug, Deserialize)]
pub struct MintTokenRequest {
    pub name: String,
    pub symbol: String,
    pub decimals: Option<u8>,
    pub supply: u64,
    /// Pre-pinned Metaplex JSON URI. Mutually exclusive with the inline
    /// social fields below.
    pub metadata_uri: Option<String>,
    pub creator_wallet_id: String,
    // ── Inline metadata fields (auto-pinned to IPFS when set) ──────────────
    pub description: Option<String>,
    pub image_uri: Option<String>,
    pub twitter: Option<String>,
    pub telegram: Option<String>,
    pub website: Option<String>,
    /// Opt-in: keep the freeze authority on the creator wallet. Default
    /// `false` (anti-rug — RugCheck/DEXTools flag unrevoked freeze
    /// authority as critical).
    #[serde(default)]
    pub keep_freeze_authority: bool,
    /// Default `true`: atomically revoke mint authority as the last
    /// instruction of the mint tx. Set `false` if you want a mutable
    /// supply (rare, mostly for non-memecoin use cases).
    #[serde(default = "default_revoke_mint_authority")]
    pub revoke_mint_authority: bool,
}

fn default_revoke_mint_authority() -> bool {
    true
}

#[derive(Debug, Deserialize)]
pub struct CloneTokenRequest {
    pub mint_address: String,
}

/// POST /api/v1/tokens/mint — Create a new SPL token.
///
/// Metadata sources (mutually exclusive):
/// 1. `metadata_uri` set → used as-is.
/// 2. Any of `description` / `image_uri` / `twitter` / `telegram` / `website`
///    set → a Metaplex Token Standard JSON is built and pinned to IPFS via
///    Pinata, then the resulting URI is bound on-chain via
///    CreateMetadataAccountV3.
/// 3. Neither set → SPL mint with no on-chain Metaplex metadata (legacy path).
pub async fn mint_token(
    State(state): State<TokenState>,
    Extension(user_ctx): Extension<UserCtxExt>,
    Json(body): Json<MintTokenRequest>,
) -> Result<Response, AppError> {
    let creator_wallet_id = body.creator_wallet_id.clone();

    let has_inline_metadata = body.description.is_some()
        || body.image_uri.is_some()
        || body.twitter.is_some()
        || body.telegram.is_some()
        || body.website.is_some();

    // Reject conflicting inputs early — better than silently picking one.
    if body.metadata_uri.is_some() && has_inline_metadata {
        return Err(AppError::bad_request(
            "Provide `metadata_uri` OR inline social fields, not both",
        ));
    }

    // Resolve the final URI. If the user provided inline fields, build the
    // JSON and pin it to IPFS now (fail-fast — if pinning fails, the user
    // shouldn't pay for an on-chain mint with no metadata).
    let resolved_uri = if has_inline_metadata {
        let input = MetaplexJsonInput {
            name: &body.name,
            symbol: &body.symbol,
            description: body.description.as_deref(),
            image_uri: body.image_uri.as_deref(),
            twitter: body.twitter.as_deref(),
            telegram: body.telegram.as_deref(),
            website: body.website.as_deref(),
        };
        let json = build_metaplex_json(&input)
            .map_err(|e| AppError::bad_request(e.to_string()))?;
        let pin_name = format!("{}-metadata.json", body.symbol);
        let (_cid, uri) = state
            .pinning
            .pin_json_to_ipfs(&pin_name, &json)
            .await
            .map_err(|e| AppError::internal(format!("IPFS pinning failed: {e}")))?;
        Some(uri)
    } else {
        body.metadata_uri.clone()
    };

    let params = MintParams {
        name: body.name,
        symbol: body.symbol,
        decimals: body.decimals.unwrap_or(9),
        supply: body.supply,
        metadata_uri: resolved_uri,
        creator_wallet_id: body.creator_wallet_id,
        keep_freeze_authority: body.keep_freeze_authority,
        revoke_mint_authority: body.revoke_mint_authority,
    };

    let token = mint::create_token(&state.db, &state.rpc, &state.master_key, params).await?;

    // Audit SEC-MAX-3 — data-plane operation logged for forensic visibility.
    // Without this, a user disputing "I lost SOL on this mint" has no audit
    // trail from the platform side (only on-chain signature, which doesn't
    // capture user intent / params).
    let _ = AuditRepo::insert_full(
        &state.db,
        "user_op_mint",
        &format!(
            "token_id={} mint_addr={} creator_wallet={} supply={}",
            token.id, token.mint_address, creator_wallet_id, token.supply
        ),
        None,
        token.tx_signature.as_deref(),
        None,
        Some(&user_ctx.user_id),
        None,
    )
    .await;

    Ok(Json(json!({ "success": true, "data": {
        "id": token.id,
        "mint_address": token.mint_address,
        "name": token.name,
        "symbol": token.symbol,
        "decimals": token.decimals,
        "supply": token.supply,
        "metadata_uri": token.metadata_uri,
        "tx_signature": token.tx_signature,
        "created_at": token.created_at,
    }}))
    .into_response())
}

/// POST /api/v1/tokens/{mint}/revoke-mint-authority — Revoke the mint
/// authority on a token AFTER it was created (separate from the inline
/// revoke during mint). Use case: the user minted with a mutable supply
/// originally, ran out of need for it, wants to lock the supply now to
/// pass DEXTools/RugCheck.
///
/// Required: the token must be in our `tokens` table AND the caller's
/// vault must hold the creator wallet's keypair (otherwise nobody can
/// sign the SetAuthority instruction).
pub async fn revoke_mint_authority(
    State(state): State<TokenState>,
    Extension(user_ctx): Extension<UserCtxExt>,
    axum::extract::Path(mint_addr): axum::extract::Path<String>,
) -> Result<Response, AppError> {
    use offivex_db::repo::token_repo::TokenRepo;

    let token = TokenRepo::get_by_mint(&state.db, mint_addr.clone())
        .await
        .map_err(|e| AppError::internal(format!("DB error: {}", e)))?
        .ok_or_else(|| AppError::not_found("Token not in vault"))?;

    let creator_wallet_id = token
        .creator_wallet_id
        .clone()
        .ok_or_else(|| AppError::bad_request("Token has no creator wallet on record"))?;

    let sig = mint::revoke_mint_authority(
        &state.db,
        &state.rpc,
        &state.master_key,
        &creator_wallet_id,
        &mint_addr,
    )
    .await?;

    let _ = AuditRepo::insert_full(
        &state.db,
        "user_op_revoke_mint_authority",
        &format!("mint={} creator_wallet={}", mint_addr, creator_wallet_id),
        Some(&creator_wallet_id),
        Some(&sig),
        None,
        Some(&user_ctx.user_id),
        None,
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": { "mint": mint_addr, "signature": sig }
    }))
    .into_response())
}

/// POST /api/v1/tokens/clone-info — Fetch on-chain token info for cloning.
pub async fn clone_info(
    State(state): State<TokenState>,
    Json(body): Json<CloneTokenRequest>,
) -> Result<Response, AppError> {
    let (client, _ep) = state.rpc.get_client().await
        .map_err(|e| AppError::internal(e.to_string()))?;

    match clone::fetch_token_info(&client, &body.mint_address).await {
        Ok(info) => Ok(Json(json!({ "success": true, "data": info })).into_response()),
        Err(e) => Err(AppError::bad_request(e)),
    }
}

/// GET /api/v1/tokens — List all created tokens.
pub async fn list_tokens(State(state): State<TokenState>) -> Result<Response, AppError> {
    use offivex_db::repo::token_repo::TokenRepo;

    let tokens = TokenRepo::list_all(&state.db).await.map_err(|e| {
        tracing::error!("DB error: {:?}", e);
        AppError::internal("Database error")
    })?;

    let data: Vec<_> = tokens
        .iter()
        .map(|t| {
            json!({
                "id": t.id,
                "mint_address": t.mint_address,
                "name": t.name,
                "symbol": t.symbol,
                "decimals": t.decimals,
                "supply": t.supply,
                "metadata_uri": t.metadata_uri,
                "creator_wallet_id": t.creator_wallet_id,
                "tx_signature": t.tx_signature,
                "created_at": t.created_at,
            })
        })
        .collect();
    Ok(Json(json!({ "success": true, "data": data })).into_response())
}

// --- Vanity address endpoints ---

#[derive(Debug, Deserialize)]
pub struct VanityStartRequest {
    pub prefix: Option<String>,
    pub suffix: Option<String>,
    #[serde(default)]
    pub case_insensitive: bool,
    #[serde(default)]
    pub threads: usize,
}

/// POST /api/v1/tokens/vanity/start — Start a vanity address grind task.
pub async fn vanity_start(
    State(state): State<TokenState>,
    Json(body): Json<VanityStartRequest>,
) -> Result<Response, AppError> {
    let config = VanityConfig {
        prefix: body.prefix,
        suffix: body.suffix,
        case_insensitive: body.case_insensitive,
        threads: body.threads,
    };

    let difficulty = vanity::estimate_difficulty(&config);
    let task_id = vanity::start_vanity_task(state.db, config, state.master_key).await?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "task_id": task_id,
            "estimated_difficulty": difficulty,
        }
    }))
    .into_response())
}

/// GET /api/v1/tokens/vanity/{task_id} — Check vanity grind status.
pub async fn vanity_status(
    State(state): State<TokenState>,
    axum::extract::Path(task_id): axum::extract::Path<String>,
) -> Result<Response, AppError> {
    use offivex_db::repo::task_repo::TaskRepo;

    let task = TaskRepo::get_by_id(&state.db, task_id)
        .await
        .map_err(|e| {
            tracing::error!("DB error: {:?}", e);
            AppError::internal("Database error")
        })?
        .ok_or_else(|| AppError::not_found("Task not found"))?;

    let result = task
        .result_json
        .as_deref()
        .and_then(|r| serde_json::from_str::<serde_json::Value>(r).ok());

    Ok(Json(json!({
        "success": true,
        "data": {
            "task_id": task.id,
            "status": task.status,
            "progress": task.progress,
            "result": result,
            "error": task.error,
            "created_at": task.created_at,
            "updated_at": task.updated_at,
        }
    }))
    .into_response())
}
