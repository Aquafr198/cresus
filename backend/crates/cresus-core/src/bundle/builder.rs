//! ★ CRITICAL: Atomic Bundle Orchestration ★
//!
//! Assembles the full launch bundle:
//!   Tx 1: Create OpenBook Market
//!   Tx 2: Initialize Raydium AMM Pool + Add Liquidity
//!   Tx 3-N: Snipe Buys (one per sub-wallet)
//!   + Jito tip appended to the last transaction
//!
//! All transactions are submitted as a single Jito bundle.
//! They either all succeed or all fail — no front-running window.

use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_rusqlite::Connection;

use solana_sdk::{
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
    transaction::Transaction,
};

use cresus_crypto::SecretBytes;
use cresus_db::models::Bundle;
use cresus_db::repo::bundle_repo::BundleRepo;

use crate::rpc::manager::RpcManager;
use crate::solana_utils::{compute_ata, build_create_ata_idempotent};
use crate::wallet::decrypt::{decrypt_wallet_keypair, DecryptError};

use super::market::{self, CreateMarketParams, MarketAccounts, MarketRentLamports};
use super::liquidity::{self, RaydiumPDAs, InitPoolParams};
use super::snipe::{self, SnipeBuyConfig, SwapAccounts};
use super::jito;

#[derive(Debug, thiserror::Error)]
pub enum BundleError {
    #[error("RPC error: {0}")]
    Rpc(#[from] crate::rpc::manager::RpcError),
    #[error("Database error: {0}")]
    Db(#[from] cresus_db::DbError),
    #[error("Crypto error: {0}")]
    Crypto(#[from] cresus_crypto::aes::CryptoError),
    #[error("Jito error: {0}")]
    Jito(#[from] jito::JitoError),
    #[error("Decrypt error: {0}")]
    Decrypt(#[from] DecryptError),
    #[error("App is locked")]
    Locked,
    #[error("Wallet not found: {0}")]
    WalletNotFound(String),
    #[error("{0}")]
    Other(String),
}

/// Full configuration for a token launch bundle.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LaunchConfig {
    /// The token mint address (must already exist).
    pub token_mint: String,
    /// Creator wallet ID (pays for market + pool creation).
    pub creator_wallet_id: String,
    /// SOL amount (in lamports) to add as liquidity.
    pub sol_liquidity: u64,
    /// Token amount (raw, including decimals) to add as liquidity.
    pub token_liquidity: u64,
    /// Jito tip in lamports.
    pub jito_tip_lamports: u64,
    /// Snipe buy configs: wallet_id → SOL amount in lamports.
    pub snipe_buys: Vec<SnipeBuyEntry>,
    /// OpenBook market lot sizes.
    pub base_lot_size: u64,
    pub quote_lot_size: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SnipeBuyEntry {
    pub wallet_id: String,
    pub sol_amount: u64,
    /// Minimum token output for slippage protection. Defaults to 1 if not set.
    #[serde(default)]
    pub min_token_out: Option<u64>,
}

/// Result of a successful bundle launch.
pub struct LaunchResult {
    pub bundle_id: String,
    pub market_address: String,
    pub pool_address: String,
    pub status: String,
}

/// Build and submit the atomic launch bundle.
pub async fn execute_launch(
    db: &Arc<Connection>,
    rpc: &RpcManager,
    master_key: &Arc<RwLock<Option<SecretBytes>>>,
    config: LaunchConfig,
) -> Result<LaunchResult, BundleError> {
    let mek = master_key
        .read()
        .await
        .clone()
        .ok_or(BundleError::Locked)?;

    // Decrypt creator wallet
    let creator_keypair = decrypt_wallet_keypair(db, &config.creator_wallet_id, &mek).await?;

    // Get RPC client
    let (client, _) = rpc.get_client().await?;
    let recent_blockhash = client
        .get_latest_blockhash()
        .await
        .map_err(|e| BundleError::Other(e.to_string()))?;

    let token_mint: Pubkey = config.token_mint.parse()
        .map_err(|e| BundleError::Other(format!("Invalid mint: {}", e)))?;
    let wsol_mint = *crate::solana_utils::WSOL_MINT_PUBKEY;

    // ═══════════════════════════════════════════════════════════
    // TX 1: Create OpenBook Market
    // ═══════════════════════════════════════════════════════════
    let market_accounts = MarketAccounts::generate();
    let rent = MarketRentLamports::calculate(&client)
        .await
        .map_err(|e| BundleError::Other(e))?;

    let market_params = CreateMarketParams {
        base_mint: token_mint,
        quote_mint: wsol_mint,
        base_lot_size: config.base_lot_size,
        quote_lot_size: config.quote_lot_size,
        fee_rate_bps: 0,
        vault_signer_nonce: 0, // will be computed inside
        quote_dust_threshold: 2,
    };

    let market_ixs = market::build_create_market_instructions(
        &creator_keypair.pubkey(),
        &market_accounts,
        &market_params,
        &rent,
    ).map_err(|e| BundleError::Other(e))?;

    let tx1 = Transaction::new_signed_with_payer(
        &market_ixs,
        Some(&creator_keypair.pubkey()),
        &[
            &creator_keypair,
            &market_accounts.market,
            &market_accounts.request_queue,
            &market_accounts.event_queue,
            &market_accounts.bids,
            &market_accounts.asks,
            &market_accounts.base_vault,
            &market_accounts.quote_vault,
        ],
        recent_blockhash,
    );

    // ═══════════════════════════════════════════════════════════
    // TX 2: Initialize Raydium AMM Pool + Add Liquidity
    // ═══════════════════════════════════════════════════════════
    let market_pubkey = market_accounts.market.pubkey();
    let pdas = RaydiumPDAs::derive(&market_pubkey, &token_mint, &wsol_mint)
        .map_err(|e| BundleError::Other(e))?;

    // Compute user ATAs
    let user_coin_ata = compute_ata(&creator_keypair.pubkey(), &token_mint);
    let user_pc_ata = compute_ata(&creator_keypair.pubkey(), &wsol_mint);
    let user_lp_ata = compute_ata(&creator_keypair.pubkey(), &pdas.lp_mint);

    let pool_params = InitPoolParams {
        amm_id: pdas.amm_id,
        amm_authority: pdas.amm_authority,
        amm_open_orders: pdas.amm_open_orders,
        amm_target_orders: pdas.amm_target_orders,
        lp_mint: pdas.lp_mint,
        coin_mint: token_mint,
        pc_mint: wsol_mint,
        coin_vault: pdas.coin_vault,
        pc_vault: pdas.pc_vault,
        market_program: *crate::solana_utils::OPENBOOK_DEX_PROGRAM,
        market: market_pubkey,
        nonce: pdas.nonce,
        init_coin_amount: config.token_liquidity,
        init_pc_amount: config.sol_liquidity,
    };

    // Build LP init instructions: create ATAs + init pool
    let mut pool_ixs = Vec::new();

    // Create user ATAs (idempotent)
    pool_ixs.push(build_create_ata_idempotent(&creator_keypair.pubkey(), &creator_keypair.pubkey(), &token_mint));
    pool_ixs.push(build_create_ata_idempotent(&creator_keypair.pubkey(), &creator_keypair.pubkey(), &wsol_mint));
    pool_ixs.push(build_create_ata_idempotent(&creator_keypair.pubkey(), &creator_keypair.pubkey(), &pdas.lp_mint));

    // Wrap SOL for liquidity
    pool_ixs.push(solana_sdk::system_instruction::transfer(
        &creator_keypair.pubkey(),
        &user_pc_ata,
        config.sol_liquidity,
    ));
    pool_ixs.push(
        spl_token::instruction::sync_native(&spl_token::id(), &user_pc_ata)
            .map_err(|e| BundleError::Other(e.to_string()))?,
    );

    // Initialize pool
    pool_ixs.push(liquidity::build_initialize_pool_instruction(
        &creator_keypair.pubkey(),
        &pool_params,
        &user_coin_ata,
        &user_pc_ata,
        &user_lp_ata,
    ));

    let tx2 = Transaction::new_signed_with_payer(
        &pool_ixs,
        Some(&creator_keypair.pubkey()),
        &[&creator_keypair],
        recent_blockhash,
    );

    // ═══════════════════════════════════════════════════════════
    // TX 3-N: Snipe Buys
    // ═══════════════════════════════════════════════════════════
    let (_vault_signer_nonce, vault_signer) = market::find_vault_signer_nonce(&market_pubkey)
        .map_err(|e| BundleError::Other(e))?;

    let swap_accounts = SwapAccounts {
        amm_id: pdas.amm_id,
        amm_authority: pdas.amm_authority,
        amm_open_orders: pdas.amm_open_orders,
        amm_target_orders: pdas.amm_target_orders,
        coin_vault: pdas.coin_vault,
        pc_vault: pdas.pc_vault,
        market_program: *crate::solana_utils::OPENBOOK_DEX_PROGRAM,
        market: market_pubkey,
        market_bids: market_accounts.bids.pubkey(),
        market_asks: market_accounts.asks.pubkey(),
        market_event_queue: market_accounts.event_queue.pubkey(),
        market_coin_vault: market_accounts.base_vault.pubkey(),
        market_pc_vault: market_accounts.quote_vault.pubkey(),
        market_vault_signer: vault_signer,
        token_mint,
    };

    let mut snipe_txs = Vec::new();
    let mut snipe_keypairs = Vec::new();

    for entry in &config.snipe_buys {
        let keypair = decrypt_wallet_keypair(db, &entry.wallet_id, &mek).await?;
        let min_out = entry.min_token_out.unwrap_or(1);
        if min_out <= 1 {
            tracing::warn!(
                wallet_id = %entry.wallet_id,
                "Snipe buy min_token_out is {} — no slippage protection",
                min_out
            );
        }
        let buy_config = SnipeBuyConfig {
            wallet: Keypair::from_bytes(&keypair.to_bytes())
                .map_err(|e| BundleError::Other(format!("Keypair conversion: {}", e)))?,
            sol_amount: entry.sol_amount,
            min_token_out: min_out,
        };

        let ixs = snipe::build_snipe_buy_instructions(&buy_config, &swap_accounts)
            .map_err(|e| BundleError::Other(e))?;
        let tx = Transaction::new_signed_with_payer(
            &ixs,
            Some(&keypair.pubkey()),
            &[&keypair],
            recent_blockhash,
        );
        snipe_txs.push(tx);
        snipe_keypairs.push(keypair);
    }

    // ═══════════════════════════════════════════════════════════
    // Assemble all transactions + Jito tip
    // ═══════════════════════════════════════════════════════════
    let mut all_txs = vec![tx1, tx2];
    all_txs.extend(snipe_txs);

    // Add a dedicated tip transaction (creator pays the Jito tip)
    let tip_ix = jito::build_tip_instruction(&creator_keypair.pubkey(), config.jito_tip_lamports);
    let tip_tx = Transaction::new_signed_with_payer(
        &[tip_ix],
        Some(&creator_keypair.pubkey()),
        &[&creator_keypair],
        recent_blockhash,
    );
    all_txs.push(tip_tx);

    // ═══════════════════════════════════════════════════════════
    // Submit via Jito
    // ═══════════════════════════════════════════════════════════
    let jito_result = jito::submit_and_confirm(
        &all_txs,
        30,   // max poll attempts
        2000, // poll interval ms
        None, // use default block engine
    ).await?;

    // ═══════════════════════════════════════════════════════════
    // Persist to DB
    // ═══════════════════════════════════════════════════════════
    let bundle = Bundle {
        id: uuid::Uuid::new_v4().to_string(),
        token_id: None,
        config_json: serde_json::to_string(&config).unwrap_or_default(),
        status: jito_result.status.clone(),
        jito_bundle_id: Some(jito_result.bundle_id.clone()),
        market_address: Some(market_pubkey.to_string()),
        pool_address: Some(pdas.amm_id.to_string()),
        tx_signatures: None,
        error_message: None,
        created_at: chrono::Utc::now().timestamp(),
        executed_at: Some(chrono::Utc::now().timestamp()),
    };
    BundleRepo::create(db, bundle).await?;

    Ok(LaunchResult {
        bundle_id: jito_result.bundle_id,
        market_address: market_pubkey.to_string(),
        pool_address: pdas.amm_id.to_string(),
        status: jito_result.status,
    })
}

