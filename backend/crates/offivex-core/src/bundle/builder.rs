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
    compute_budget::ComputeBudgetInstruction,
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
    transaction::Transaction,
};

// Compute budget parameters for bundle transactions.
//
// Solana docs (https://solana.com/docs/core/fees#prioritization-fees) explicitly
// recommend setting compute budget for any transaction competing for inclusion.
// Without these, Tx1 (market creation, ~8 account creations) and Tx2 (pool init
// with multiple CPIs) can be evicted in a congested block.
//
// Limits:
//   - Tx1 (market creation): 400k CU — measured ~250k in practice, 1.6× headroom.
//   - Tx2 (pool init + ATAs + wrap SOL + init pool): 600k CU — measured ~400k,
//     1.5× headroom; this Tx has multiple CPIs into the Raydium program.
//   - Snipe Txs: handled by the swap path which sets its own priority fees.
//
// Priority fee: 50k microlamports/CU = ~0.00002 SOL extra per tx. Empirically
// sufficient for inclusion in mainnet bundles outside of extreme congestion.
const BUNDLE_TX1_CU_LIMIT: u32 = 400_000;
const BUNDLE_TX2_CU_LIMIT: u32 = 600_000;
const BUNDLE_CU_PRICE_MICROLAMPORTS: u64 = 50_000;

use offivex_crypto::SecretBytes;
use offivex_db::models::Bundle;
use offivex_db::repo::bundle_repo::BundleRepo;

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
    Db(#[from] offivex_db::DbError),
    #[error("Crypto error: {0}")]
    Crypto(#[from] offivex_crypto::aes::CryptoError),
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
    /// Tokens the creator deliberately keeps in their wallet at launch
    /// (raw amount including decimals). Sets the baseline for the dev-sold
    /// detector (see `monitor::dev_sold_detector`). When `None` the field
    /// is informational only and dev-sold detection is disabled for this
    /// bundle.
    #[serde(default)]
    pub creator_reserve_tokens: Option<u64>,
    /// What to do with the LP tokens minted by Raydium when the pool is
    /// initialized. Default: `Burn` (anti-rug, passes DEXTools/RugCheck).
    #[serde(default)]
    pub lp_disposition: LpDisposition,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SnipeBuyEntry {
    pub wallet_id: String,
    pub sol_amount: u64,
    /// Minimum token output for slippage protection. Defaults to 1 if not set.
    #[serde(default)]
    pub min_token_out: Option<u64>,
}

/// What happens to the LP tokens minted at pool init.
///
/// `Burn` is the default because RugCheck/DEXTools flag any launch where
/// LP is "Not Locked" as a critical rug-pull vector (creator can withdraw
/// all liquidity in one tx). Burning the LP tokens removes that vector
/// permanently — the only trade-off is the creator forfeits future LP fees.
/// For pure memecoins those fees are marginal; for serious projects that
/// want to migrate LP later, set `Keep`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LpDisposition {
    /// Append a burn instruction to the pool-init tx so all received LP
    /// tokens are destroyed atomically with pool creation. ✓ anti-rug.
    Burn,
    /// Leave LP tokens in the creator wallet (legacy behaviour). The
    /// creator can later transfer/lock/burn them off-platform.
    Keep,
}

impl Default for LpDisposition {
    fn default() -> Self {
        LpDisposition::Burn
    }
}

/// Integer square root for `u128`, used to estimate the LP amount Raydium
/// mints from a pool init (Raydium v4: `lp = sqrt(coin * pc) - MINIMUM_LIQUIDITY`).
/// Newton's method, converges in O(log log n) iterations.
fn integer_sqrt(n: u128) -> u128 {
    if n == 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

/// Conservative margin subtracted from the computed LP amount before burning.
/// Raydium v4 locks a `MINIMUM_LIQUIDITY` (~100 lamports) inside the pool,
/// and there's potential off-by-N in our formula vs. their on-chain math.
/// Margin > MINIMUM_LIQUIDITY guarantees the burn instruction never tries
/// to burn more than the user actually received (which would abort the
/// whole tx). A few thousand LP units out of millions is < 0.001% — keeps
/// the anti-rug guarantee intact.
const LP_BURN_SAFETY_MARGIN: u64 = 10_000;

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
    // Pre-flight invariant: creator_reserve + token_liquidity + Σ snipe_min_out
    // must not exceed the token total supply we read from DB. Catching this
    // before submission saves the Jito tip + market-creation rent on a launch
    // that would have failed under the hood with an opaque "insufficient
    // balance" error.
    if let Some(reserve) = config.creator_reserve_tokens {
        // Read supply + decimals in a single round-trip; if the token row is
        // missing we skip the invariant rather than failing (caller could be
        // launching a bundle for a token minted outside the platform — rare
        // but valid).
        let mint_addr = config.token_mint.clone();
        let token_row: Option<(String, i64)> = db
            .call(move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT supply, decimals FROM tokens WHERE mint_address = ?",
                )?;
                Ok(stmt
                    .query_row([&mint_addr], |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
                    })
                    .ok())
            })
            .await
            .map_err(|e| BundleError::Db(offivex_db::DbError::TokioRusqlite(e)))?;

        if let Some((supply_str, decimals_i64)) = token_row {
            // `tokens.supply` is stored as a display-unit u64 string (e.g.
            // "1000000000"). The on-chain raw amount = supply * 10^decimals.
            // The launch params (token_liquidity, snipe min_out, reserve) use
            // raw on-chain units, so we compare in that domain.
            let parsed_supply: u64 = supply_str
                .parse()
                .map_err(|e| BundleError::Other(format!("Bad supply in DB: {e}")))?;
            let decimals = decimals_i64.max(0) as u32;
            let scale = 10u64
                .checked_pow(decimals)
                .ok_or_else(|| BundleError::Other("decimals out of range".into()))?;
            let total_raw = parsed_supply
                .checked_mul(scale)
                .ok_or_else(|| BundleError::Other("total supply overflow u64".into()))?;

            let total_snipe_min_out: u64 = config
                .snipe_buys
                .iter()
                .map(|s| s.min_token_out.unwrap_or(0))
                .try_fold(0u64, |acc, m| acc.checked_add(m))
                .ok_or_else(|| BundleError::Other("snipe min_token_out overflow".into()))?;

            let used = reserve
                .checked_add(config.token_liquidity)
                .and_then(|x| x.checked_add(total_snipe_min_out))
                .ok_or_else(|| {
                    BundleError::Other("creator_reserve + liquidity + snipe overflow u64".into())
                })?;

            if used > total_raw {
                return Err(BundleError::Other(format!(
                    "creator_reserve_tokens ({}) + token_liquidity ({}) + Σ snipe_min_out ({}) = {} \
                     exceeds total supply ({})",
                    reserve, config.token_liquidity, total_snipe_min_out, used, total_raw
                )));
            }
        }
    }

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

    let core_market_ixs = market::build_create_market_instructions(
        &creator_keypair.pubkey(),
        &market_accounts,
        &market_params,
        &rent,
    ).map_err(|e| BundleError::Other(e))?;

    // Prepend compute budget (must be the first instructions per Solana spec)
    let mut market_ixs = Vec::with_capacity(core_market_ixs.len() + 2);
    market_ixs.push(ComputeBudgetInstruction::set_compute_unit_limit(BUNDLE_TX1_CU_LIMIT));
    market_ixs.push(ComputeBudgetInstruction::set_compute_unit_price(BUNDLE_CU_PRICE_MICROLAMPORTS));
    market_ixs.extend(core_market_ixs);

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

    // Build LP init instructions: compute budget + create ATAs + init pool
    let mut pool_ixs = Vec::new();

    // Prepend compute budget (must be the first instructions per Solana spec)
    pool_ixs.push(ComputeBudgetInstruction::set_compute_unit_limit(BUNDLE_TX2_CU_LIMIT));
    pool_ixs.push(ComputeBudgetInstruction::set_compute_unit_price(BUNDLE_CU_PRICE_MICROLAMPORTS));

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

    // Atomic LP burn (anti-rug). Raydium v4 mints `lp = sqrt(coin * pc)`
    // LP tokens to `user_lp_ata` during `initialize2`, minus a small
    // MINIMUM_LIQUIDITY lock baked into the program. We estimate the same
    // amount, subtract a conservative safety margin, and burn it in the
    // very next instruction — same tx, atomic with pool creation. After
    // this lands, no holder (including the creator) can withdraw the
    // pooled liquidity. Removes the "LP Not Locked" critical flag on
    // DEXTools/RugCheck.
    if matches!(config.lp_disposition, LpDisposition::Burn) {
        let liquidity_product =
            (config.token_liquidity as u128).saturating_mul(config.sol_liquidity as u128);
        let lp_estimate = integer_sqrt(liquidity_product) as u64;
        let lp_to_burn = lp_estimate.saturating_sub(LP_BURN_SAFETY_MARGIN);
        if lp_to_burn > 0 {
            pool_ixs.push(
                spl_token::instruction::burn(
                    &spl_token::id(),
                    &user_lp_ata,
                    &pdas.lp_mint,
                    &creator_keypair.pubkey(),
                    &[],
                    lp_to_burn,
                )
                .map_err(|e| BundleError::Other(e.to_string()))?,
            );
        } else {
            // Liquidity too small for the safety-margin subtraction to leave
            // anything positive. We could panic-fail, but skipping with a
            // loud warn is the more useful behaviour: tiny devnet test
            // launches still go through, and the operator gets a clear
            // signal that the anti-rug guarantee did NOT apply this time.
            tracing::warn!(
                token_liquidity = config.token_liquidity,
                sol_liquidity = config.sol_liquidity,
                lp_estimate,
                safety_margin = LP_BURN_SAFETY_MARGIN,
                "LP burn requested but liquidity too small — sqrt(coin*sol)={} < margin={}. \
                 LP tokens stay in creator wallet; token WILL fail RugCheck/DEXTools 'LP Locked' \
                 check. Use a larger token_liquidity × sol_liquidity product (≥ ~10^8) \
                 for the burn to apply on production launches.",
                lp_estimate,
                LP_BURN_SAFETY_MARGIN,
            );
        }
    }

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

