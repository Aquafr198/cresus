use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_rusqlite::Connection;

use solana_sdk::{
    signature::Keypair,
    signer::Signer,
    system_instruction,
    transaction::Transaction,
};
use spl_token::instruction as token_instruction;

/// SPL Token Mint account size in bytes.
const MINT_ACCOUNT_LEN: usize = 82;

use offivex_crypto::SecretBytes;
use offivex_db::models::Token;
use offivex_db::repo::token_repo::TokenRepo;

use crate::rpc::manager::RpcManager;
use crate::solana_utils::{compute_ata, build_create_ata_idempotent};
use crate::wallet::decrypt::{decrypt_wallet_keypair, DecryptError};

#[derive(Debug, thiserror::Error)]
pub enum MintError {
    #[error("RPC error: {0}")]
    Rpc(#[from] crate::rpc::manager::RpcError),
    #[error("Database error: {0}")]
    Db(#[from] offivex_db::DbError),
    #[error("Crypto error: {0}")]
    Crypto(#[from] offivex_crypto::aes::CryptoError),
    #[error("Decrypt error: {0}")]
    Decrypt(#[from] DecryptError),
    #[error("App is locked")]
    Locked,
    #[error("Wallet not found")]
    WalletNotFound,
    #[error("{0}")]
    Other(String),
}

pub struct MintParams {
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub supply: u64,
    /// URI to a Metaplex-conformant JSON. If provided, used as-is and the
    /// CreateMetadataAccountV3 instruction is appended so the URI is bound
    /// on-chain (visible on Solscan/Phantom). If absent, no on-chain metadata
    /// account is created.
    pub metadata_uri: Option<String>,
    pub creator_wallet_id: String,
    /// Keep the freeze authority on the creator wallet. Default `false`
    /// because RugCheck / DEXTools flag unrevoked freeze authority as a
    /// critical red flag (creator can freeze any holder's tokens). The
    /// minority of legitimate use-cases (regulated tokens, anti-bot
    /// emergency freeze) can opt in.
    pub keep_freeze_authority: bool,
    /// Revoke the mint authority atomically as the last instruction of the
    /// mint transaction. `true` locks the supply forever — removes the
    /// "creator can mint more tokens" red flag. Set `false` only when you
    /// intentionally want a mutable supply.
    pub revoke_mint_authority: bool,
}

/// Create a new SPL Token: create mint account, initialize it, create ATA, and mint initial supply.
pub async fn create_token(
    db: &Arc<Connection>,
    rpc: &RpcManager,
    master_key: &Arc<RwLock<Option<SecretBytes>>>,
    params: MintParams,
) -> Result<Token, MintError> {
    let mek = master_key
        .read()
        .await
        .clone()
        .ok_or(MintError::Locked)?;

    // Decrypt the creator's keypair
    let payer = decrypt_wallet_keypair(db, &params.creator_wallet_id, &mek).await?;

    // Generate a new keypair for the mint account
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();

    let (client, _) = rpc.get_client().await?;

    // Calculate rent for mint account
    let mint_rent = client
        .get_minimum_balance_for_rent_exemption(MINT_ACCOUNT_LEN)
        .await
        .map_err(|e| MintError::Other(e.to_string()))?;

    // Pre-compute the payer pubkey so the borrow in `Some(&payer_pubkey)`
    // outlives the initialize_mint call (versus inlining `.pubkey()` which
    // returns a temporary that gets dropped before use).
    let payer_pubkey = payer.pubkey();
    let freeze_authority_opt = if params.keep_freeze_authority {
        Some(&payer_pubkey)
    } else {
        None
    };

    // Build instructions
    let mut instructions = vec![
        // 1. Create account for mint
        system_instruction::create_account(
            &payer_pubkey,
            &mint_pubkey,
            mint_rent,
            MINT_ACCOUNT_LEN as u64,
            &spl_token::id(),
        ),
        // 2. Initialize mint. Freeze authority is opt-in (default off) to
        // stay under RugCheck/DEXTools red-flag thresholds — most memecoins
        // never need it, and unrevoked freeze authority is a critical
        // detection signal.
        token_instruction::initialize_mint(
            &spl_token::id(),
            &mint_pubkey,
            &payer_pubkey, // mint authority
            freeze_authority_opt,
            params.decimals,
        )
        .map_err(|e| MintError::Other(e.to_string()))?,
    ];

    // 3. Create Associated Token Account for payer
    let ata_pubkey = compute_ata(&payer.pubkey(), &mint_pubkey);
    instructions.push(build_create_ata_idempotent(
        &payer.pubkey(),
        &payer.pubkey(),
        &mint_pubkey,
    ));

    // 4. Mint initial supply to the ATA (with overflow protection)
    let amount = 10u64
        .checked_pow(params.decimals as u32)
        .and_then(|base| params.supply.checked_mul(base))
        .ok_or_else(|| MintError::Other("Supply overflow: supply * 10^decimals exceeds u64".into()))?;
    instructions.push(
        token_instruction::mint_to(
            &spl_token::id(),
            &mint_pubkey,
            &ata_pubkey,
            &payer.pubkey(),
            &[],
            amount,
        )
        .map_err(|e| MintError::Other(e.to_string()))?,
    );

    // 5. Attach on-chain Metaplex metadata (name/symbol/URI). Without this
    //    the token shows up as "Unknown Token" in Phantom/Solscan and the
    //    metadata_uri stored in DB has no on-chain anchor. Skipped if no URI
    //    was provided so the legacy flow remains backwards-compatible.
    if let Some(uri) = params.metadata_uri.as_deref() {
        instructions.push(super::metadata::create_metadata_instruction(
            &payer.pubkey(),
            &mint_pubkey,
            &payer.pubkey(),
            &params.name,
            &params.symbol,
            uri,
        ));
    }

    // 6. Optionally revoke the mint authority atomically (same tx as the
    //    initial mint_to). After this lands, no further tokens of this
    //    mint can ever be minted — supply is locked. RugCheck/DEXTools
    //    flip this from "Mint Authority: Not Revoked" 🚨 to "Locked" ✓.
    //    Order matters: must come AFTER mint_to (instruction 4) so the
    //    initial supply is issued before authority is removed.
    if params.revoke_mint_authority {
        instructions.push(
            token_instruction::set_authority(
                &spl_token::id(),
                &mint_pubkey,
                None,
                spl_token::instruction::AuthorityType::MintTokens,
                &payer.pubkey(),
                &[],
            )
            .map_err(|e| MintError::Other(e.to_string()))?,
        );
    }

    // Build, sign, and send with retry (re-fetch blockhash on each attempt)
    let signature = crate::rpc::retry::with_retry(3, 1000, || {
        let c = client.clone();
        let ixs = instructions.clone();
        let payer_ref = &payer;
        let mint_ref = &mint_keypair;
        async move {
            let blockhash = c.get_latest_blockhash()
                .await
                .map_err(|e| MintError::Other(e.to_string()))?;

            let tx = Transaction::new_signed_with_payer(
                &ixs,
                Some(&payer_ref.pubkey()),
                &[payer_ref, mint_ref],
                blockhash,
            );

            c.send_and_confirm_transaction(&tx)
                .await
                .map_err(|e| MintError::Other(e.to_string()))
        }
    })
    .await?;

    // Store in DB
    let token = Token {
        id: uuid::Uuid::new_v4().to_string(),
        mint_address: mint_pubkey.to_string(),
        name: Some(params.name),
        symbol: Some(params.symbol),
        decimals: params.decimals as i64,
        supply: params.supply.to_string(),
        metadata_uri: params.metadata_uri,
        creator_wallet_id: Some(params.creator_wallet_id),
        tx_signature: Some(signature.to_string()),
        created_at: chrono::Utc::now().timestamp(),
    };

    TokenRepo::create(db, token.clone()).await?;
    Ok(token)
}

/// Revoke the mint authority on an already-existing token. Used by the
/// `POST /tokens/{mint}/revoke-mint-authority` endpoint when the user
/// wants to lock the supply AFTER mint (vs the inline `revoke_mint_authority`
/// param on the mint flow which does it atomically).
///
/// Requires the caller's vault to hold the creator wallet's keypair —
/// only the current mint authority can revoke itself.
pub async fn revoke_mint_authority(
    db: &Arc<Connection>,
    rpc: &RpcManager,
    master_key: &Arc<RwLock<Option<SecretBytes>>>,
    creator_wallet_id: &str,
    mint_addr: &str,
) -> Result<String, MintError> {
    let mek = master_key
        .read()
        .await
        .clone()
        .ok_or(MintError::Locked)?;

    let creator = decrypt_wallet_keypair(db, creator_wallet_id, &mek).await?;
    let mint_pubkey: solana_sdk::pubkey::Pubkey = mint_addr
        .parse()
        .map_err(|e| MintError::Other(format!("Invalid mint pubkey: {}", e)))?;

    let (client, _) = rpc.get_client().await?;

    // Same retry envelope as `create_token`: 3 attempts with exponential
    // backoff, re-fetching blockhash on each attempt so a stale-blockhash
    // failure on attempt 1 doesn't kill an otherwise-valid revoke.
    let signature = crate::rpc::retry::with_retry(3, 1000, || {
        let c = client.clone();
        let creator_ref = &creator;
        let mint_pk = mint_pubkey;
        async move {
            let ix = token_instruction::set_authority(
                &spl_token::id(),
                &mint_pk,
                None,
                spl_token::instruction::AuthorityType::MintTokens,
                &creator_ref.pubkey(),
                &[],
            )
            .map_err(|e| MintError::Other(e.to_string()))?;

            let blockhash = c
                .get_latest_blockhash()
                .await
                .map_err(|e| MintError::Other(format!("blockhash: {}", e)))?;
            let tx = Transaction::new_signed_with_payer(
                &[ix],
                Some(&creator_ref.pubkey()),
                &[creator_ref],
                blockhash,
            );
            c.send_and_confirm_transaction(&tx)
                .await
                .map_err(|e| MintError::Other(format!("revoke tx: {}", e)))
        }
    })
    .await?;

    Ok(signature.to_string())
}

