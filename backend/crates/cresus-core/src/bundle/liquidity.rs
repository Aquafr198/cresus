//! Raydium AMM v4 pool initialization and liquidity addition.
//!
//! Raydium AMM v4 requires an existing OpenBook v1 market. This module builds
//! the `Initialize` and `Deposit` instructions from the Raydium AMM program IDL.

use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program,
    sysvar,
};

/// Raydium AMM v4 program ID on mainnet.
pub const RAYDIUM_AMM_PROGRAM_ID: &str = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";

/// Raydium AMM authority PDA seed.
pub const RAYDIUM_AMM_AUTHORITY_SEED: &[u8] = b"amm authority";

/// Wrapped SOL mint address.
pub const WSOL_MINT: &str = "So11111111111111111111111111111111111111112";

/// Parameters for initializing a Raydium AMM pool.
pub struct InitPoolParams {
    pub amm_id: Pubkey,
    pub amm_authority: Pubkey,
    pub amm_open_orders: Pubkey,
    pub amm_target_orders: Pubkey,
    pub lp_mint: Pubkey,
    pub coin_mint: Pubkey,   // base (token)
    pub pc_mint: Pubkey,     // quote (SOL/WSOL)
    pub coin_vault: Pubkey,
    pub pc_vault: Pubkey,
    pub market_program: Pubkey,
    pub market: Pubkey,
    /// Initial nonce for AMM authority derivation.
    pub nonce: u8,
    /// Initial SOL/token price: how many lamports per token base unit.
    pub init_coin_amount: u64,
    pub init_pc_amount: u64,
}

/// Derive all Raydium AMM PDAs for a given market.
pub struct RaydiumPDAs {
    pub amm_id: Pubkey,
    pub amm_authority: Pubkey,
    pub amm_open_orders: Pubkey,
    pub amm_target_orders: Pubkey,
    pub lp_mint: Pubkey,
    pub coin_vault: Pubkey,
    pub pc_vault: Pubkey,
    pub nonce: u8,
}

impl RaydiumPDAs {
    /// Derive all PDAs from the market address.
    pub fn derive(market: &Pubkey, coin_mint: &Pubkey, pc_mint: &Pubkey) -> Result<Self, String> {
        let amm_program = *crate::solana_utils::RAYDIUM_AMM_PROGRAM;

        // AMM ID = PDA([amm_program, market, "amm_associated_seed"], amm_program)
        let (amm_id, _) = Pubkey::find_program_address(
            &[amm_program.as_ref(), market.as_ref(), b"amm_associated_seed"],
            &amm_program,
        );

        // AMM authority
        let mut nonce = 0u8;
        let amm_authority = loop {
            if let Some((pda, _)) = Pubkey::try_find_program_address(
                &[b"amm authority", &[nonce]],
                &amm_program,
            ) {
                break pda;
            }
            nonce += 1;
            if nonce == 255 {
                return Err("Failed to find AMM authority nonce".into());
            }
        };

        let (amm_open_orders, _) = Pubkey::find_program_address(
            &[amm_program.as_ref(), market.as_ref(), b"open_order_associated_seed"],
            &amm_program,
        );

        let (amm_target_orders, _) = Pubkey::find_program_address(
            &[amm_program.as_ref(), market.as_ref(), b"target_associated_seed"],
            &amm_program,
        );

        let (lp_mint, _) = Pubkey::find_program_address(
            &[amm_program.as_ref(), market.as_ref(), b"lp_mint_associated_seed"],
            &amm_program,
        );

        let (coin_vault, _) = Pubkey::find_program_address(
            &[amm_program.as_ref(), market.as_ref(), b"coin_vault_associated_seed"],
            &amm_program,
        );

        let (pc_vault, _) = Pubkey::find_program_address(
            &[amm_program.as_ref(), market.as_ref(), b"pc_vault_associated_seed"],
            &amm_program,
        );

        Ok(Self {
            amm_id,
            amm_authority,
            amm_open_orders,
            amm_target_orders,
            lp_mint,
            coin_vault,
            pc_vault,
            nonce,
        })
    }
}

/// Build the Raydium AMM `Initialize` instruction.
///
/// This creates the pool and adds initial liquidity in one call.
pub fn build_initialize_pool_instruction(
    payer: &Pubkey,
    params: &InitPoolParams,
    user_coin_token_account: &Pubkey,
    user_pc_token_account: &Pubkey,
    user_lp_token_account: &Pubkey,
) -> Instruction {
    let amm_program = *crate::solana_utils::RAYDIUM_AMM_PROGRAM;
    let market_program = *crate::solana_utils::OPENBOOK_DEX_PROGRAM;

    // Initialize instruction data:
    // discriminant (1 byte) = 0 (Initialize)
    // nonce (1 byte)
    // open_time (8 bytes, u64) = 0 (open immediately)
    // init_pc_amount (8 bytes, u64)
    // init_coin_amount (8 bytes, u64)
    let mut data = Vec::with_capacity(26);
    data.push(0); // Initialize discriminant
    data.push(params.nonce);
    data.extend_from_slice(&0u64.to_le_bytes()); // open_time = now
    data.extend_from_slice(&params.init_pc_amount.to_le_bytes());
    data.extend_from_slice(&params.init_coin_amount.to_le_bytes());

    Instruction {
        program_id: amm_program,
        accounts: vec![
            // 0: token_program
            AccountMeta::new_readonly(spl_token::id(), false),
            // 1: system_program
            AccountMeta::new_readonly(system_program::id(), false),
            // 2: rent
            AccountMeta::new_readonly(sysvar::rent::id(), false),
            // 3: amm_id
            AccountMeta::new(params.amm_id, false),
            // 4: amm_authority
            AccountMeta::new_readonly(params.amm_authority, false),
            // 5: amm_open_orders
            AccountMeta::new(params.amm_open_orders, false),
            // 6: lp_mint
            AccountMeta::new(params.lp_mint, false),
            // 7: coin_mint
            AccountMeta::new_readonly(params.coin_mint, false),
            // 8: pc_mint
            AccountMeta::new_readonly(params.pc_mint, false),
            // 9: coin_vault
            AccountMeta::new(params.coin_vault, false),
            // 10: pc_vault
            AccountMeta::new(params.pc_vault, false),
            // 11: amm_target_orders
            AccountMeta::new(params.amm_target_orders, false),
            // 12: market_program
            AccountMeta::new_readonly(market_program, false),
            // 13: market
            AccountMeta::new_readonly(params.market, false),
            // 14: user_wallet (payer, signer)
            AccountMeta::new(*payer, true),
            // 15: user_coin_token_account
            AccountMeta::new(*user_coin_token_account, false),
            // 16: user_pc_token_account
            AccountMeta::new(*user_pc_token_account, false),
            // 17: user_lp_token_account
            AccountMeta::new(*user_lp_token_account, false),
        ],
        data,
    }
}

/// Build a Raydium AMM `SwapBaseIn` instruction (used for snipe buys).
pub fn build_swap_base_in_instruction(
    amm_id: &Pubkey,
    amm_authority: &Pubkey,
    amm_open_orders: &Pubkey,
    amm_target_orders: &Pubkey,
    coin_vault: &Pubkey,
    pc_vault: &Pubkey,
    market_program: &Pubkey,
    market: &Pubkey,
    market_bids: &Pubkey,
    market_asks: &Pubkey,
    market_event_queue: &Pubkey,
    market_coin_vault: &Pubkey,
    market_pc_vault: &Pubkey,
    market_vault_signer: &Pubkey,
    user_source: &Pubkey,  // user's SOL/WSOL account (input)
    user_dest: &Pubkey,    // user's token account (output)
    user_owner: &Pubkey,   // user wallet (signer)
    amount_in: u64,
    minimum_amount_out: u64,
) -> Instruction {
    let amm_program = *crate::solana_utils::RAYDIUM_AMM_PROGRAM;

    // SwapBaseIn instruction data:
    // discriminant (1 byte) = 9
    // amount_in (8 bytes, u64)
    // minimum_amount_out (8 bytes, u64)
    let mut data = Vec::with_capacity(17);
    data.push(9); // SwapBaseIn discriminant
    data.extend_from_slice(&amount_in.to_le_bytes());
    data.extend_from_slice(&minimum_amount_out.to_le_bytes());

    Instruction {
        program_id: amm_program,
        accounts: vec![
            // 0: token_program
            AccountMeta::new_readonly(spl_token::id(), false),
            // 1: amm_id
            AccountMeta::new(*amm_id, false),
            // 2: amm_authority
            AccountMeta::new_readonly(*amm_authority, false),
            // 3: amm_open_orders
            AccountMeta::new(*amm_open_orders, false),
            // 4: amm_target_orders
            AccountMeta::new(*amm_target_orders, false),
            // 5: pool_coin_vault
            AccountMeta::new(*coin_vault, false),
            // 6: pool_pc_vault
            AccountMeta::new(*pc_vault, false),
            // 7: market_program
            AccountMeta::new_readonly(*market_program, false),
            // 8: market
            AccountMeta::new(*market, false),
            // 9: market_bids
            AccountMeta::new(*market_bids, false),
            // 10: market_asks
            AccountMeta::new(*market_asks, false),
            // 11: market_event_queue
            AccountMeta::new(*market_event_queue, false),
            // 12: market_coin_vault
            AccountMeta::new(*market_coin_vault, false),
            // 13: market_pc_vault
            AccountMeta::new(*market_pc_vault, false),
            // 14: market_vault_signer
            AccountMeta::new_readonly(*market_vault_signer, false),
            // 15: user_source_token_account (WSOL in)
            AccountMeta::new(*user_source, false),
            // 16: user_dest_token_account (token out)
            AccountMeta::new(*user_dest, false),
            // 17: user_owner (signer)
            AccountMeta::new_readonly(*user_owner, true),
        ],
        data,
    }
}
