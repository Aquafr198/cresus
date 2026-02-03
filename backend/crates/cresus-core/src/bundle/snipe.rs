//! Multi-wallet snipe buy instructions.
//!
//! Builds swap transactions for each sub-wallet to buy the token
//! via Raydium AMM immediately after pool creation (same Jito bundle).

use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
    system_instruction,
};

use crate::solana_utils::{compute_ata, build_create_ata_idempotent, WSOL_MINT_PUBKEY};
use super::liquidity;

/// Configuration for a single snipe buy.
pub struct SnipeBuyConfig {
    /// The wallet keypair performing the buy.
    pub wallet: Keypair,
    /// Amount of SOL (in lamports) to spend on the buy.
    pub sol_amount: u64,
    /// Minimum token amount to receive (slippage protection).
    pub min_token_out: u64,
}

/// All the pool/market accounts needed for swap instructions.
pub struct SwapAccounts {
    pub amm_id: Pubkey,
    pub amm_authority: Pubkey,
    pub amm_open_orders: Pubkey,
    pub amm_target_orders: Pubkey,
    pub coin_vault: Pubkey,
    pub pc_vault: Pubkey,
    pub market_program: Pubkey,
    pub market: Pubkey,
    pub market_bids: Pubkey,
    pub market_asks: Pubkey,
    pub market_event_queue: Pubkey,
    pub market_coin_vault: Pubkey,
    pub market_pc_vault: Pubkey,
    pub market_vault_signer: Pubkey,
    pub token_mint: Pubkey,
}

/// Build a snipe buy transaction for a single wallet.
///
/// The transaction:
/// 1. Creates a WSOL token account (System transfer + init)
/// 2. Creates an ATA for the token mint
/// 3. Executes a Raydium SwapBaseIn (WSOL → Token)
/// 4. Closes the WSOL account (recover rent)
pub fn build_snipe_buy_instructions(
    config: &SnipeBuyConfig,
    swap_accounts: &SwapAccounts,
) -> Result<Vec<Instruction>, String> {
    let wallet_pubkey = config.wallet.pubkey();
    let wsol_mint = *WSOL_MINT_PUBKEY;

    // Compute WSOL temp account (we use a PDA-like approach via ATA)
    let wsol_ata = compute_ata(&wallet_pubkey, &wsol_mint);
    let token_ata = compute_ata(&wallet_pubkey, &swap_accounts.token_mint);

    let mut ixs = Vec::new();

    // 1. Create ATA for token (if not exists — idempotent create)
    ixs.push(build_create_ata_idempotent(
        &wallet_pubkey,
        &wallet_pubkey,
        &swap_accounts.token_mint,
    ));

    // 2. Create ATA for WSOL
    ixs.push(build_create_ata_idempotent(
        &wallet_pubkey,
        &wallet_pubkey,
        &wsol_mint,
    ));

    // 3. Transfer SOL to WSOL account
    ixs.push(system_instruction::transfer(
        &wallet_pubkey,
        &wsol_ata,
        config.sol_amount,
    ));

    // 4. Sync native (wraps the SOL into WSOL)
    ixs.push(
        spl_token::instruction::sync_native(&spl_token::id(), &wsol_ata)
            .map_err(|e| format!("sync_native: {}", e))?,
    );

    // 5. Raydium swap: WSOL → Token
    ixs.push(liquidity::build_swap_base_in_instruction(
        &swap_accounts.amm_id,
        &swap_accounts.amm_authority,
        &swap_accounts.amm_open_orders,
        &swap_accounts.amm_target_orders,
        &swap_accounts.coin_vault,
        &swap_accounts.pc_vault,
        &swap_accounts.market_program,
        &swap_accounts.market,
        &swap_accounts.market_bids,
        &swap_accounts.market_asks,
        &swap_accounts.market_event_queue,
        &swap_accounts.market_coin_vault,
        &swap_accounts.market_pc_vault,
        &swap_accounts.market_vault_signer,
        &wsol_ata,      // source: WSOL
        &token_ata,     // dest: Token
        &wallet_pubkey, // owner
        config.sol_amount,
        config.min_token_out,
    ));

    // 6. Close WSOL account (recover rent + any remaining WSOL)
    ixs.push(
        spl_token::instruction::close_account(
            &spl_token::id(),
            &wsol_ata,
            &wallet_pubkey, // destination for remaining lamports
            &wallet_pubkey, // owner
            &[],
        )
        .map_err(|e| format!("close_account: {}", e))?,
    );

    Ok(ixs)
}
