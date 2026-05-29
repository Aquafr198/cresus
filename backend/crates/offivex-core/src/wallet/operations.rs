//! Wallet operations: balance queries and transaction sending.

use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_instruction,
    transaction::Transaction,
};
use solana_client::nonblocking::rpc_client::RpcClient;
use std::str::FromStr;

#[derive(Debug, thiserror::Error)]
pub enum OperationError {
    #[error("RPC error: {0}")]
    Rpc(String),
    #[error("Invalid address: {0}")]
    InvalidAddress(String),
    #[error("Insufficient balance")]
    InsufficientBalance,
    #[error("{0}")]
    Other(String),
}

/// Balance information for a wallet.
#[derive(Debug, Clone, serde::Serialize)]
pub struct WalletBalance {
    pub lamports: u64,
    pub sol: f64,
    pub tokens: Vec<TokenBalance>,
}

/// Balance of a single SPL token.
#[derive(Debug, Clone, serde::Serialize)]
pub struct TokenBalance {
    pub mint: String,
    pub amount: u64,
    pub account: String,
}

/// Get the SOL balance and token accounts for a wallet.
pub async fn get_balance(
    rpc_client: &RpcClient,
    wallet_pubkey: &Pubkey,
) -> Result<WalletBalance, OperationError> {
    // Get SOL balance
    let lamports = rpc_client
        .get_balance(wallet_pubkey)
        .await
        .map_err(|e| OperationError::Rpc(e.to_string()))?;

    let sol = lamports as f64 / 1_000_000_000.0;

    // Get SPL token accounts
    let token_accounts = rpc_client
        .get_token_accounts_by_owner(
            wallet_pubkey,
            solana_client::rpc_request::TokenAccountsFilter::ProgramId(spl_token::id()),
        )
        .await
        .unwrap_or_default();

    let tokens: Vec<TokenBalance> = token_accounts
        .iter()
        .filter_map(|keyed| {
            // Parse the UiTokenAccount data
            if let solana_account_decoder::UiAccountData::Json(parsed) = &keyed.account.data {
                let info = parsed.parsed.get("info")?;
                let mint = info.get("mint")?.as_str()?.to_string();
                let token_amount = info.get("tokenAmount")?;
                let amount_str = token_amount.get("amount")?.as_str()?;
                let amount = amount_str.parse::<u64>().ok()?;

                if amount > 0 {
                    Some(TokenBalance {
                        mint,
                        amount,
                        account: keyed.pubkey.clone(),
                    })
                } else {
                    None
                }
            } else {
                None
            }
        })
        .collect();

    Ok(WalletBalance {
        lamports,
        sol,
        tokens,
    })
}

/// Get the token balance for a specific mint.
pub async fn get_token_balance(
    rpc_client: &RpcClient,
    wallet_pubkey: &Pubkey,
    token_mint: &Pubkey,
) -> Result<u64, OperationError> {
    let ata = spl_associated_token_account::get_associated_token_address(wallet_pubkey, token_mint);

    match rpc_client.get_token_account_balance(&ata).await {
        Ok(balance) => {
            balance.amount.parse::<u64>().map_err(|e| {
                OperationError::Other(format!("Failed to parse token balance: {}", e))
            })
        }
        Err(_) => Ok(0), // Account doesn't exist = 0 balance
    }
}

/// Send SOL from one wallet to another.
pub async fn send_sol(
    rpc_client: &RpcClient,
    from_keypair: &Keypair,
    to_address: &str,
    lamports: u64,
) -> Result<String, OperationError> {
    // Parse destination address
    let to_pubkey = Pubkey::from_str(to_address)
        .map_err(|_| OperationError::InvalidAddress(to_address.to_string()))?;

    // Check balance (including transaction fees ~5000 lamports)
    let balance = rpc_client
        .get_balance(&from_keypair.pubkey())
        .await
        .map_err(|e| OperationError::Rpc(e.to_string()))?;

    const ESTIMATED_FEE: u64 = 5000; // Transaction fee estimate in lamports
    let total_needed = lamports.checked_add(ESTIMATED_FEE)
        .ok_or_else(|| OperationError::Other("Amount overflow".to_string()))?;

    if balance < total_needed {
        return Err(OperationError::InsufficientBalance);
    }

    // Get recent blockhash
    let recent_blockhash = rpc_client
        .get_latest_blockhash()
        .await
        .map_err(|e| OperationError::Rpc(e.to_string()))?;

    // Create transaction
    let instruction = system_instruction::transfer(
        &from_keypair.pubkey(),
        &to_pubkey,
        lamports,
    );

    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&from_keypair.pubkey()),
        &[from_keypair],
        recent_blockhash,
    );

    // Send and confirm
    let signature = rpc_client
        .send_and_confirm_transaction(&transaction)
        .await
        .map_err(|e| OperationError::Rpc(e.to_string()))?;

    Ok(signature.to_string())
}

/// Send SPL tokens from one wallet to another.
pub async fn send_token(
    rpc_client: &RpcClient,
    from_keypair: &Keypair,
    to_address: &str,
    mint_address: &str,
    amount: u64,
) -> Result<String, OperationError> {
    // Parse addresses
    let to_pubkey = Pubkey::from_str(to_address)
        .map_err(|_| OperationError::InvalidAddress(to_address.to_string()))?;
    let mint_pubkey = Pubkey::from_str(mint_address)
        .map_err(|_| OperationError::InvalidAddress(mint_address.to_string()))?;

    // Get or create associated token accounts
    let from_ata = spl_associated_token_account::get_associated_token_address(
        &from_keypair.pubkey(),
        &mint_pubkey,
    );
    let to_ata = spl_associated_token_account::get_associated_token_address(
        &to_pubkey,
        &mint_pubkey,
    );

    // Check if destination ATA exists
    let to_ata_exists = rpc_client
        .get_account(&to_ata)
        .await
        .is_ok();

    let recent_blockhash = rpc_client
        .get_latest_blockhash()
        .await
        .map_err(|e| OperationError::Rpc(e.to_string()))?;

    let mut instructions = Vec::new();

    // Create destination ATA if it doesn't exist
    if !to_ata_exists {
        instructions.push(
            spl_associated_token_account::instruction::create_associated_token_account(
                &from_keypair.pubkey(),
                &to_pubkey,
                &mint_pubkey,
                &spl_token::id(),
            )
        );
    }

    // Transfer instruction
    instructions.push(
        spl_token::instruction::transfer(
            &spl_token::id(),
            &from_ata,
            &to_ata,
            &from_keypair.pubkey(),
            &[],
            amount,
        )
        .map_err(|e| OperationError::Other(e.to_string()))?,
    );

    let transaction = Transaction::new_signed_with_payer(
        &instructions,
        Some(&from_keypair.pubkey()),
        &[from_keypair],
        recent_blockhash,
    );

    let signature = rpc_client
        .send_and_confirm_transaction(&transaction)
        .await
        .map_err(|e| OperationError::Rpc(e.to_string()))?;

    Ok(signature.to_string())
}
