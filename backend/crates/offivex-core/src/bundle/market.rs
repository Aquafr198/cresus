//! OpenBook DEX v1 (Serum-compatible) market creation.
//!
//! Raydium AMM v4 requires an OpenBook v1 market. This module builds the
//! `InitializeMarket` instruction and the prerequisite account-creation
//! instructions (bids, asks, event queue, request queue).

use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
    system_instruction,
};

/// Well-known OpenBook DEX v1 program ID on mainnet.
pub const OPENBOOK_DEX_PROGRAM_ID: &str = "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX";

/// Accounts sizes for OpenBook market accounts.
const MARKET_STATE_LEN: u64 = 388;
const REQUEST_QUEUE_LEN: u64 = 5120 + 12;
const EVENT_QUEUE_LEN: u64 = 262144 + 12;
const BIDS_LEN: u64 = 65536 + 12;
const ASKS_LEN: u64 = 65536 + 12;

/// Parameters for creating an OpenBook market.
pub struct CreateMarketParams {
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub base_lot_size: u64,
    pub quote_lot_size: u64,
    pub fee_rate_bps: u16,
    pub vault_signer_nonce: u64,
    pub quote_dust_threshold: u64,
}

/// All keypairs generated for the market accounts (caller must sign with these).
pub struct MarketAccounts {
    pub market: Keypair,
    pub bids: Keypair,
    pub asks: Keypair,
    pub event_queue: Keypair,
    pub request_queue: Keypair,
    pub base_vault: Keypair,
    pub quote_vault: Keypair,
}

impl MarketAccounts {
    pub fn generate() -> Self {
        Self {
            market: Keypair::new(),
            bids: Keypair::new(),
            asks: Keypair::new(),
            event_queue: Keypair::new(),
            request_queue: Keypair::new(),
            base_vault: Keypair::new(),
            quote_vault: Keypair::new(),
        }
    }
}

/// Derive the vault signer PDA for the market.
pub fn find_vault_signer(market: &Pubkey, nonce: u64) -> Result<Pubkey, String> {
    let dex_program = *crate::solana_utils::OPENBOOK_DEX_PROGRAM;
    let seeds = &[market.as_ref(), &nonce.to_le_bytes()];
    let (pda, _bump) = Pubkey::try_find_program_address(seeds, &dex_program)
        .ok_or("Failed to find vault signer PDA")?;
    Ok(pda)
}

/// Find a valid vault signer nonce by iterating.
pub fn find_vault_signer_nonce(market: &Pubkey) -> Result<(u64, Pubkey), String> {
    let dex_program = *crate::solana_utils::OPENBOOK_DEX_PROGRAM;
    for nonce in 0..256u64 {
        let seeds = &[market.as_ref(), &nonce.to_le_bytes()];
        if let Some((pda, _)) = Pubkey::try_find_program_address(seeds, &dex_program) {
            return Ok((nonce, pda));
        }
    }
    Err("Could not find vault signer nonce".into())
}

/// Build the set of instructions to create an OpenBook DEX v1 market.
///
/// Returns a vector of instructions that must all go in one transaction:
/// 1. Create accounts (market, bids, asks, event_queue, request_queue, base_vault, quote_vault)
/// 2. Initialize SPL token accounts for vaults
/// 3. InitializeMarket instruction
pub fn build_create_market_instructions(
    payer: &Pubkey,
    accounts: &MarketAccounts,
    params: &CreateMarketParams,
    rent_lamports: &MarketRentLamports,
) -> Result<Vec<Instruction>, String> {
    let dex_program = *crate::solana_utils::OPENBOOK_DEX_PROGRAM;
    let (vault_signer_nonce, vault_signer) = find_vault_signer_nonce(&accounts.market.pubkey())?;

    let mut ixs = Vec::new();

    // 1. Create all accounts
    ixs.push(system_instruction::create_account(
        payer, &accounts.market.pubkey(), rent_lamports.market, MARKET_STATE_LEN, &dex_program,
    ));
    ixs.push(system_instruction::create_account(
        payer, &accounts.request_queue.pubkey(), rent_lamports.request_queue, REQUEST_QUEUE_LEN, &dex_program,
    ));
    ixs.push(system_instruction::create_account(
        payer, &accounts.event_queue.pubkey(), rent_lamports.event_queue, EVENT_QUEUE_LEN, &dex_program,
    ));
    ixs.push(system_instruction::create_account(
        payer, &accounts.bids.pubkey(), rent_lamports.bids, BIDS_LEN, &dex_program,
    ));
    ixs.push(system_instruction::create_account(
        payer, &accounts.asks.pubkey(), rent_lamports.asks, ASKS_LEN, &dex_program,
    ));

    // Create vault token accounts (owned by the token program, then set authority to vault signer)
    let token_account_len = 165u64; // SPL Token Account size
    ixs.push(system_instruction::create_account(
        payer, &accounts.base_vault.pubkey(), rent_lamports.vault, token_account_len, &spl_token::id(),
    ));
    ixs.push(spl_token::instruction::initialize_account(
        &spl_token::id(), &accounts.base_vault.pubkey(), &params.base_mint, &vault_signer,
    ).map_err(|e| e.to_string())?);

    ixs.push(system_instruction::create_account(
        payer, &accounts.quote_vault.pubkey(), rent_lamports.vault, token_account_len, &spl_token::id(),
    ));
    ixs.push(spl_token::instruction::initialize_account(
        &spl_token::id(), &accounts.quote_vault.pubkey(), &params.quote_mint, &vault_signer,
    ).map_err(|e| e.to_string())?);

    // 2. InitializeMarket instruction
    let init_market_data = serialize_initialize_market(
        params.base_lot_size,
        params.quote_lot_size,
        params.fee_rate_bps,
        vault_signer_nonce,
        params.quote_dust_threshold,
    );

    ixs.push(Instruction {
        program_id: dex_program,
        accounts: vec![
            AccountMeta::new(accounts.market.pubkey(), false),
            AccountMeta::new(accounts.request_queue.pubkey(), false),
            AccountMeta::new(accounts.event_queue.pubkey(), false),
            AccountMeta::new(accounts.bids.pubkey(), false),
            AccountMeta::new(accounts.asks.pubkey(), false),
            AccountMeta::new_readonly(accounts.base_vault.pubkey(), false),
            AccountMeta::new_readonly(accounts.quote_vault.pubkey(), false),
            AccountMeta::new_readonly(params.base_mint, false),
            AccountMeta::new_readonly(params.quote_mint, false),
            // authority (open orders authority) — none
            AccountMeta::new_readonly(solana_sdk::sysvar::rent::id(), false),
        ],
        data: init_market_data,
    });

    Ok(ixs)
}

/// Rent lamports needed for each market account.
pub struct MarketRentLamports {
    pub market: u64,
    pub request_queue: u64,
    pub event_queue: u64,
    pub bids: u64,
    pub asks: u64,
    pub vault: u64,
}

impl MarketRentLamports {
    /// Calculate from RPC client.
    pub async fn calculate(client: &solana_client::nonblocking::rpc_client::RpcClient) -> Result<Self, String> {
        let calc = |size: u64| async move {
            client.get_minimum_balance_for_rent_exemption(size as usize)
                .await
                .map_err(|e| e.to_string())
        };
        Ok(Self {
            market: calc(MARKET_STATE_LEN).await?,
            request_queue: calc(REQUEST_QUEUE_LEN).await?,
            event_queue: calc(EVENT_QUEUE_LEN).await?,
            bids: calc(BIDS_LEN).await?,
            asks: calc(ASKS_LEN).await?,
            vault: calc(165).await?, // SPL Token Account
        })
    }

    pub fn total(&self) -> u64 {
        self.market + self.request_queue + self.event_queue + self.bids + self.asks + self.vault * 2
    }
}

/// Serialize the InitializeMarket instruction data.
/// OpenBook DEX v1 layout: discriminant(4 bytes, LE u32 = 0) + fields.
fn serialize_initialize_market(
    base_lot_size: u64,
    quote_lot_size: u64,
    fee_rate_bps: u16,
    vault_signer_nonce: u64,
    quote_dust_threshold: u64,
) -> Vec<u8> {
    let mut data = Vec::with_capacity(64);
    // Instruction discriminant: InitializeMarket = 0
    data.extend_from_slice(&0u32.to_le_bytes());
    // version padding
    data.extend_from_slice(&5u8.to_le_bytes()); // version = 5
    data.extend_from_slice(&[0u8; 4]); // padding
    data.extend_from_slice(&base_lot_size.to_le_bytes());
    data.extend_from_slice(&quote_lot_size.to_le_bytes());
    data.extend_from_slice(&(fee_rate_bps as u16).to_le_bytes());
    data.extend_from_slice(&vault_signer_nonce.to_le_bytes());
    data.extend_from_slice(&quote_dust_threshold.to_le_bytes());
    data
}

/// Total rent cost for creating all market accounts.
pub async fn total_market_rent(client: &solana_client::nonblocking::rpc_client::RpcClient) -> Result<u64, String> {
    let rents = MarketRentLamports::calculate(client).await?;
    Ok(rents.total())
}
