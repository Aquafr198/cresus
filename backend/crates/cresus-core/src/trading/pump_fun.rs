//! Pump.fun integration module.
//!
//! Provides token creation on Pump.fun and buy/sell on bonding curves.
//! Token creation uses the Pump.fun program directly via solana-sdk.
//! Buy/sell delegates to Jupiter aggregator which routes through Pump.fun
//! bonding curves when they offer the best price.

use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
    system_program,
    transaction::Transaction,
};
use std::str::FromStr;
use std::time::Duration;
use thiserror::Error;

use crate::errors::{CategorizedError, ErrorCategory};

/// Pump.fun program ID on mainnet
pub const PUMP_FUN_PROGRAM_ID: &str = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

/// Pump.fun IPFS metadata upload endpoint
const PUMP_FUN_IPFS_API: &str = "https://pump.fun/api/ipfs";

/// Environment variable override for the Pump.fun metadata API URL.
/// Set `PUMPFUN_IPFS_API` to use a different endpoint (e.g., for testing).
fn metadata_api_url() -> String {
    std::env::var("PUMPFUN_IPFS_API").unwrap_or_else(|_| PUMP_FUN_IPFS_API.to_string())
}

/// Pump.fun global state account
const PUMP_FUN_GLOBAL: &str = "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf";

/// Pump.fun fee recipient
const PUMP_FUN_FEE_RECIPIENT: &str = "CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbCJ8apKsGky7D";

/// Pump.fun event authority
const PUMP_FUN_EVENT_AUTHORITY: &str = "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1";

/// Pump.fun mint authority
const PUMP_FUN_MINT_AUTHORITY: &str = "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM";

/// Token Metadata Program
const MPL_TOKEN_METADATA_ID: &str = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

/// Anchor create instruction discriminator: sha256("global:create")[..8]
const CREATE_DISCRIMINATOR: [u8; 8] = [24, 30, 200, 40, 5, 28, 7, 119];

#[derive(Debug, Error)]
pub enum PumpFunError {
    #[error("RPC error: {0}")]
    RpcError(String),

    #[error("API error: {0}")]
    ApiError(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Token creation failed: {0}")]
    CreateFailed(String),

    #[error("Metadata upload failed: {0}")]
    MetadataUploadFailed(String),

    #[error("Other: {0}")]
    Other(String),
}

impl CategorizedError for PumpFunError {
    fn category(&self) -> ErrorCategory {
        match self {
            PumpFunError::RpcError(_) => ErrorCategory::Retryable,
            PumpFunError::ApiError(msg) if msg.contains("rate limit") => ErrorCategory::Retryable,
            PumpFunError::ApiError(msg) if msg.contains("429") => ErrorCategory::Retryable,
            PumpFunError::ApiError(msg) if msg.contains("timeout") => ErrorCategory::Retryable,
            PumpFunError::ApiError(msg) if msg.contains("503") => ErrorCategory::Retryable,
            PumpFunError::ApiError(_) => ErrorCategory::Fatal,
            PumpFunError::InvalidInput(_) => ErrorCategory::UserError,
            PumpFunError::CreateFailed(_) => ErrorCategory::Fatal,
            PumpFunError::MetadataUploadFailed(msg) if msg.contains("timeout") => {
                ErrorCategory::Retryable
            }
            PumpFunError::MetadataUploadFailed(_) => ErrorCategory::Fatal,
            PumpFunError::Other(_) => ErrorCategory::Retryable,
        }
    }

    fn retry_delay(&self) -> Duration {
        match self {
            PumpFunError::ApiError(msg) if msg.contains("rate limit") => Duration::from_secs(60),
            PumpFunError::ApiError(msg) if msg.contains("429") => Duration::from_secs(60),
            PumpFunError::RpcError(_) => Duration::from_secs(5),
            _ => Duration::from_secs(5),
        }
    }

    fn max_retries(&self) -> u32 {
        match self {
            PumpFunError::ApiError(msg) if msg.contains("rate limit") => 2,
            PumpFunError::RpcError(_) => 3,
            _ => 3,
        }
    }

    fn user_message(&self) -> String {
        match self {
            PumpFunError::RpcError(_) => "Network error. Retrying...".to_string(),
            PumpFunError::ApiError(msg) if msg.contains("rate limit") => {
                "Rate limited by Pump.fun API. Waiting...".to_string()
            }
            PumpFunError::InvalidInput(msg) => format!("Invalid input: {}", msg),
            PumpFunError::CreateFailed(msg) => format!("Token creation failed: {}", msg),
            PumpFunError::MetadataUploadFailed(_) => {
                "Failed to upload metadata to Pump.fun".to_string()
            }
            _ => self.to_string(),
        }
    }
}

/// Configuration for launching a token on Pump.fun
#[derive(Debug, Clone)]
pub struct PumpFunLaunchConfig {
    pub name: String,
    pub symbol: String,
    pub description: String,
    pub image_url: String,
    pub twitter: Option<String>,
    pub telegram: Option<String>,
    pub website: Option<String>,
    pub initial_buy_sol: u64, // lamports, 0 = no initial buy
    pub slippage_bps: u16,
}

/// Response from metadata upload
#[derive(Debug, serde::Deserialize)]
pub struct IpfsUploadResponse {
    pub metadata_uri: String,
}

/// Upload token metadata to Pump.fun IPFS
///
/// Sends a JSON payload with name, symbol, description, and image URL.
/// Returns the IPFS URI for the metadata.
pub async fn upload_metadata(
    config: &PumpFunLaunchConfig,
) -> Result<String, PumpFunError> {
    tracing::info!(
        name = %config.name,
        symbol = %config.symbol,
        "Uploading metadata to Pump.fun IPFS"
    );

    let client = reqwest::Client::new();

    // Build multipart form - Pump.fun expects form data
    let mut form = reqwest::multipart::Form::new()
        .text("name", config.name.clone())
        .text("symbol", config.symbol.clone())
        .text("description", config.description.clone())
        .text("showName", "true");

    if let Some(twitter) = &config.twitter {
        form = form.text("twitter", twitter.clone());
    }
    if let Some(telegram) = &config.telegram {
        form = form.text("telegram", telegram.clone());
    }
    if let Some(website) = &config.website {
        form = form.text("website", website.clone());
    }

    // If image_url is provided, download it and attach as file
    if !config.image_url.is_empty() {
        let img_bytes = client
            .get(&config.image_url)
            .send()
            .await
            .map_err(|e| PumpFunError::MetadataUploadFailed(format!("Failed to fetch image: {}", e)))?
            .bytes()
            .await
            .map_err(|e| PumpFunError::MetadataUploadFailed(format!("Failed to read image: {}", e)))?;

        let part = reqwest::multipart::Part::bytes(img_bytes.to_vec())
            .file_name("token.png")
            .mime_str("image/png")
            .map_err(|e| PumpFunError::MetadataUploadFailed(e.to_string()))?;

        form = form.part("file", part);
    }

    let api_url = metadata_api_url();
    let response = client
        .post(&api_url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| PumpFunError::MetadataUploadFailed(format!("HTTP error: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(PumpFunError::MetadataUploadFailed(format!(
            "Status {}: {}",
            status, body
        )));
    }

    let result: IpfsUploadResponse = response
        .json()
        .await
        .map_err(|e| PumpFunError::MetadataUploadFailed(format!("Invalid response: {}", e)))?;

    tracing::info!(uri = %result.metadata_uri, "Metadata uploaded to IPFS");
    Ok(result.metadata_uri)
}

/// Derive the bonding curve PDA for a given mint
fn derive_bonding_curve(mint: &Pubkey) -> (Pubkey, u8) {
    let program_id = Pubkey::from_str(PUMP_FUN_PROGRAM_ID).unwrap();
    Pubkey::find_program_address(&[b"bonding-curve", mint.as_ref()], &program_id)
}

/// Derive the metadata PDA for a given mint
fn derive_metadata(mint: &Pubkey) -> Pubkey {
    let metadata_program = Pubkey::from_str(MPL_TOKEN_METADATA_ID).unwrap();
    let (pda, _) = Pubkey::find_program_address(
        &[b"metadata", metadata_program.as_ref(), mint.as_ref()],
        &metadata_program,
    );
    pda
}

/// Build the Pump.fun create instruction
fn build_create_instruction(
    creator: &Pubkey,
    mint: &Pubkey,
    name: &str,
    symbol: &str,
    uri: &str,
) -> Instruction {
    let program_id = Pubkey::from_str(PUMP_FUN_PROGRAM_ID).unwrap();
    let global = Pubkey::from_str(PUMP_FUN_GLOBAL).unwrap();
    let _fee_recipient = Pubkey::from_str(PUMP_FUN_FEE_RECIPIENT).unwrap();
    let mint_authority = Pubkey::from_str(PUMP_FUN_MINT_AUTHORITY).unwrap();
    let event_authority = Pubkey::from_str(PUMP_FUN_EVENT_AUTHORITY).unwrap();
    let metadata_program = Pubkey::from_str(MPL_TOKEN_METADATA_ID).unwrap();

    let (bonding_curve, _) = derive_bonding_curve(mint);

    // Associated bonding curve token account
    let associated_bonding_curve =
        spl_associated_token_account::get_associated_token_address(&bonding_curve, mint);

    // Metadata PDA
    let metadata = derive_metadata(mint);

    // Serialize instruction data: discriminator + borsh-encoded (name, symbol, uri)
    let mut data = Vec::new();
    data.extend_from_slice(&CREATE_DISCRIMINATOR);

    // Borsh encoding: length-prefixed strings
    let name_bytes = name.as_bytes();
    data.extend_from_slice(&(name_bytes.len() as u32).to_le_bytes());
    data.extend_from_slice(name_bytes);

    let symbol_bytes = symbol.as_bytes();
    data.extend_from_slice(&(symbol_bytes.len() as u32).to_le_bytes());
    data.extend_from_slice(symbol_bytes);

    let uri_bytes = uri.as_bytes();
    data.extend_from_slice(&(uri_bytes.len() as u32).to_le_bytes());
    data.extend_from_slice(uri_bytes);

    let accounts = vec![
        AccountMeta::new(*mint, true),
        AccountMeta::new_readonly(mint_authority, false),
        AccountMeta::new(bonding_curve, false),
        AccountMeta::new(associated_bonding_curve, false),
        AccountMeta::new_readonly(global, false),
        AccountMeta::new_readonly(metadata_program, false),
        AccountMeta::new(metadata, false),
        AccountMeta::new(*creator, true),
        AccountMeta::new_readonly(system_program::id(), false),
        AccountMeta::new_readonly(spl_token::id(), false),
        AccountMeta::new_readonly(spl_associated_token_account::id(), false),
        AccountMeta::new_readonly(solana_sdk::sysvar::rent::id(), false),
        AccountMeta::new_readonly(event_authority, false),
        AccountMeta::new_readonly(program_id, false),
    ];

    Instruction::new_with_bytes(program_id, &data, accounts)
}

/// Create a token on Pump.fun
///
/// Steps:
/// 1. Upload metadata to Pump.fun IPFS
/// 2. Generate mint keypair
/// 3. Build and send create transaction
/// 4. Optionally do initial buy via Jupiter
///
/// Returns (tx_signature, mint_address, bonding_curve_address, metadata_uri)
pub async fn create_pump_fun_token(
    creator: &Keypair,
    config: &PumpFunLaunchConfig,
    rpc_client: &solana_client::nonblocking::rpc_client::RpcClient,
) -> Result<(String, String, String, String), PumpFunError> {
    // Validate inputs
    if config.name.is_empty() || config.name.len() > 32 {
        return Err(PumpFunError::InvalidInput(
            "Name must be 1-32 characters".into(),
        ));
    }
    if config.symbol.is_empty() || config.symbol.len() > 10 {
        return Err(PumpFunError::InvalidInput(
            "Symbol must be 1-10 characters".into(),
        ));
    }

    // Step 1: Upload metadata
    let metadata_uri = upload_metadata(config).await?;

    // Step 2: Generate mint keypair
    let mint = Keypair::new();
    let mint_pubkey = mint.pubkey();

    tracing::info!(
        mint = %mint_pubkey,
        creator = %creator.pubkey(),
        "Creating Pump.fun token"
    );

    // Step 3: Build create instruction
    let create_ix = build_create_instruction(
        &creator.pubkey(),
        &mint_pubkey,
        &config.name,
        &config.symbol,
        &metadata_uri,
    );

    // Get recent blockhash
    let blockhash = rpc_client
        .get_latest_blockhash()
        .await
        .map_err(|e| PumpFunError::RpcError(format!("Failed to get blockhash: {}", e)))?;

    // Add compute budget instructions for priority on mainnet
    let priority_fee = std::env::var("CRESUS_PRIORITY_FEE_MICRO_LAMPORTS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(50_000); // 50k micro lamports default

    let compute_limit_ix =
        solana_sdk::compute_budget::ComputeBudgetInstruction::set_compute_unit_limit(250_000);
    let compute_price_ix =
        solana_sdk::compute_budget::ComputeBudgetInstruction::set_compute_unit_price(priority_fee);

    // Build and sign transaction with compute budget
    let tx = Transaction::new_signed_with_payer(
        &[compute_limit_ix, compute_price_ix, create_ix],
        Some(&creator.pubkey()),
        &[creator, &mint],
        blockhash,
    );

    // Send transaction
    let signature = rpc_client
        .send_and_confirm_transaction(&tx)
        .await
        .map_err(|e| PumpFunError::CreateFailed(format!("Transaction failed: {}", e)))?;

    let (bonding_curve, _) = derive_bonding_curve(&mint_pubkey);

    tracing::info!(
        signature = %signature,
        mint = %mint_pubkey,
        bonding_curve = %bonding_curve,
        "Pump.fun token created successfully"
    );

    // Step 4: Initial buy if requested
    if config.initial_buy_sol > 0 {
        tracing::info!(
            amount_lamports = config.initial_buy_sol,
            "Executing initial buy on Pump.fun token"
        );

        match super::swap::swap_sol_to_token(
            creator,
            &mint_pubkey,
            config.initial_buy_sol,
            config.slippage_bps,
            rpc_client,
        )
        .await
        {
            Ok(buy_sig) => {
                tracing::info!(signature = %buy_sig, "Initial buy completed");
            }
            Err(e) => {
                tracing::warn!(error = %e, "Initial buy failed (token was still created)");
            }
        }
    }

    Ok((
        signature.to_string(),
        mint_pubkey.to_string(),
        bonding_curve.to_string(),
        metadata_uri,
    ))
}

/// Buy a Pump.fun token via Jupiter aggregator.
///
/// Jupiter routes through Pump.fun bonding curves automatically.
pub async fn buy_pump_fun_token(
    wallet: &Keypair,
    token_mint: &Pubkey,
    sol_amount_lamports: u64,
    slippage_bps: u16,
    rpc_client: &solana_client::nonblocking::rpc_client::RpcClient,
) -> Result<String, PumpFunError> {
    super::swap::swap_sol_to_token(wallet, token_mint, sol_amount_lamports, slippage_bps, rpc_client)
        .await
        .map_err(|e| PumpFunError::Other(format!("Buy failed: {}", e)))
}

/// Sell a Pump.fun token via Jupiter aggregator.
///
/// Jupiter routes through Pump.fun bonding curves automatically.
pub async fn sell_pump_fun_token(
    wallet: &Keypair,
    token_mint: &Pubkey,
    token_amount: u64,
    slippage_bps: u16,
    rpc_client: &solana_client::nonblocking::rpc_client::RpcClient,
) -> Result<String, PumpFunError> {
    super::swap::swap_token_to_sol(wallet, token_mint, token_amount, slippage_bps, rpc_client)
        .await
        .map_err(|e| PumpFunError::Other(format!("Sell failed: {}", e)))
}
