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

use cresus_crypto::SecretBytes;
use cresus_db::models::Token;
use cresus_db::repo::token_repo::TokenRepo;

use crate::rpc::manager::RpcManager;
use crate::solana_utils::{compute_ata, build_create_ata_idempotent};
use crate::wallet::decrypt::{decrypt_wallet_keypair, DecryptError};

#[derive(Debug, thiserror::Error)]
pub enum MintError {
    #[error("RPC error: {0}")]
    Rpc(#[from] crate::rpc::manager::RpcError),
    #[error("Database error: {0}")]
    Db(#[from] cresus_db::DbError),
    #[error("Crypto error: {0}")]
    Crypto(#[from] cresus_crypto::aes::CryptoError),
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
    pub metadata_uri: Option<String>,
    pub creator_wallet_id: String,
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
    let client = Arc::new(client);

    // Calculate rent for mint account
    let mint_rent = {
        let c = client.clone();
        tokio::task::spawn_blocking(move || {
            c.get_minimum_balance_for_rent_exemption(MINT_ACCOUNT_LEN)
        })
        .await
        .map_err(|e| MintError::Other(format!("spawn_blocking join: {}", e)))?
        .map_err(|e| MintError::Other(e.to_string()))?
    };

    // Build instructions
    let mut instructions = vec![
        // 1. Create account for mint
        system_instruction::create_account(
            &payer.pubkey(),
            &mint_pubkey,
            mint_rent,
            MINT_ACCOUNT_LEN as u64,
            &spl_token::id(),
        ),
        // 2. Initialize mint
        token_instruction::initialize_mint(
            &spl_token::id(),
            &mint_pubkey,
            &payer.pubkey(), // mint authority
            Some(&payer.pubkey()), // freeze authority
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

    // Build, sign, and send with retry (re-fetch blockhash on each attempt)
    let signature = crate::rpc::retry::with_retry(3, 1000, || {
        let c = client.clone();
        let ixs = instructions.clone();
        let payer_ref = &payer;
        let mint_ref = &mint_keypair;
        async move {
            let blockhash = tokio::task::spawn_blocking({
                let c2 = c.clone();
                move || c2.get_latest_blockhash()
            })
            .await
            .map_err(|e| MintError::Other(format!("spawn_blocking join: {}", e)))?
            .map_err(|e| MintError::Other(e.to_string()))?;

            let tx = Transaction::new_signed_with_payer(
                &ixs,
                Some(&payer_ref.pubkey()),
                &[payer_ref, mint_ref],
                blockhash,
            );

            tokio::task::spawn_blocking({
                let c2 = c.clone();
                move || c2.send_and_confirm_transaction(&tx)
            })
            .await
            .map_err(|e| MintError::Other(format!("spawn_blocking join: {}", e)))?
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

