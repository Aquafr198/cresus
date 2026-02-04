use solana_sdk::{
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
};
use spl_associated_token_account::get_associated_token_address;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum FeeError {
    #[error("RPC error: {0}")]
    RpcError(String),

    #[error("Pool not found")]
    PoolNotFound,

    #[error("No fees available")]
    NoFeesAvailable,

    #[error("Transaction failed: {0}")]
    TransactionFailed(String),

    #[error("Other error: {0}")]
    Other(String),
}

/// Information about unclaimed LP fees
#[derive(Debug, Clone, serde::Serialize)]
pub struct UnclaimedFees {
    pub pool_address: String,
    pub token_fees: u64,
    pub sol_fees: u64,
    pub lp_mint: String,
    pub lp_balance: u64,
    pub lp_supply: u64,
}

/// Raydium AMM v4 pool state — partial layout for fee querying.
/// See: https://github.com/raydium-io/raydium-amm/blob/master/program/src/state.rs
///
/// Key offsets for AmmInfo (from Raydium v4 source):
///   offset 0:   status (u64)
///   offset 72:  lp_mint (Pubkey, 32 bytes)
///   offset 200: need_take_pnl_coin (u64) — uncollected fees in coin
///   offset 208: need_take_pnl_pc (u64) — uncollected fees in pc (SOL)
const AMM_STATE_MIN_LEN: usize = 752;
const OFFSET_LP_MINT: usize = 72;
const OFFSET_NEED_TAKE_PNL_COIN: usize = 200;
const OFFSET_NEED_TAKE_PNL_PC: usize = 208;

fn read_u64(data: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes(data[offset..offset + 8].try_into().unwrap())
}

fn read_pubkey(data: &[u8], offset: usize) -> Pubkey {
    Pubkey::new_from_array(data[offset..offset + 32].try_into().unwrap())
}

/// Query unclaimed fees from a Raydium AMM v4 pool.
///
/// Reads the pool account on-chain, extracts the fee accumulators
/// (`need_take_pnl_coin` and `need_take_pnl_pc`), and returns how
/// much of that the creator can claim based on their LP share.
pub async fn get_unclaimed_fees(
    pool_address: &Pubkey,
    creator_pubkey: &Pubkey,
    rpc_client: &solana_client::nonblocking::rpc_client::RpcClient,
) -> Result<UnclaimedFees, FeeError> {
    tracing::debug!("Querying unclaimed fees for pool {}", pool_address);

    // 1. Fetch pool account data
    let pool_account = rpc_client
        .get_account(pool_address)
        .await
        .map_err(|e| FeeError::RpcError(format!("Failed to fetch pool account: {}", e)))?;

    let data = &pool_account.data;
    if data.len() < AMM_STATE_MIN_LEN {
        return Err(FeeError::PoolNotFound);
    }

    // 2. Parse fee accumulators and LP mint from pool state
    let need_take_pnl_coin = read_u64(data, OFFSET_NEED_TAKE_PNL_COIN);
    let need_take_pnl_pc = read_u64(data, OFFSET_NEED_TAKE_PNL_PC);
    let lp_mint = read_pubkey(data, OFFSET_LP_MINT);

    // 3. Get LP token supply
    let lp_supply = match rpc_client
        .get_token_supply(&lp_mint)
        .await
    {
        Ok(supply) => supply.amount.parse::<u64>().unwrap_or(0),
        Err(_) => 0,
    };

    // 4. Get creator's LP token balance
    let creator_lp_ata = get_associated_token_address(creator_pubkey, &lp_mint);
    let lp_balance = match rpc_client
        .get_token_account_balance(&creator_lp_ata)
        .await
    {
        Ok(balance) => balance.amount.parse::<u64>().unwrap_or(0),
        Err(_) => 0,
    };

    // 5. Calculate creator's share of uncollected fees
    let (token_fees, sol_fees) = if lp_supply > 0 && lp_balance > 0 {
        let share = lp_balance as f64 / lp_supply as f64;
        (
            (need_take_pnl_coin as f64 * share) as u64,
            (need_take_pnl_pc as f64 * share) as u64,
        )
    } else {
        (0, 0)
    };

    tracing::info!(
        pool = %pool_address,
        token_fees,
        sol_fees,
        lp_balance,
        lp_supply,
        "Pool fee query complete"
    );

    Ok(UnclaimedFees {
        pool_address: pool_address.to_string(),
        token_fees,
        sol_fees,
        lp_mint: lp_mint.to_string(),
        lp_balance,
        lp_supply,
    })
}

/// Collect creator fees from a Raydium liquidity pool.
///
/// Automatic claiming requires building Raydium-specific instructions
/// which depend on the `raydium-amm` crate. For now, use
/// `get_unclaimed_fees()` to check available amounts and claim
/// manually via the Raydium UI.
pub async fn collect_creator_fees(
    pool_address: &Pubkey,
    creator_keypair: &Keypair,
    _rpc_client: &solana_client::nonblocking::rpc_client::RpcClient,
) -> Result<String, FeeError> {
    tracing::info!(
        "Fee collection requested for pool {} by {}",
        pool_address,
        creator_keypair.pubkey()
    );

    Err(FeeError::Other(
        "Automatic fee claiming requires the raydium-amm crate. Use get_unclaimed_fees() to check available amounts, then claim via the Raydium UI.".into(),
    ))
}

/// Check if a wallet has claimable fees from a pool
pub async fn has_claimable_fees(
    pool_address: &Pubkey,
    creator_pubkey: &Pubkey,
    rpc_client: &solana_client::nonblocking::rpc_client::RpcClient,
) -> Result<bool, FeeError> {
    let fees = get_unclaimed_fees(pool_address, creator_pubkey, rpc_client).await?;
    Ok(fees.token_fees > 0 || fees.sol_fees > 0)
}
