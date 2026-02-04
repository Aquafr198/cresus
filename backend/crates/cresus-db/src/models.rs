use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Wallet {
    pub id: String,
    pub name: Option<String>,
    pub public_key: String,
    pub encrypted_secret: Vec<u8>,
    pub nonce: Vec<u8>,
    pub group_id: Option<String>,
    pub parent_id: Option<String>,
    pub derivation_index: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletGroup {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    pub id: String,
    pub mint_address: String,
    pub name: Option<String>,
    pub symbol: Option<String>,
    pub decimals: i64,
    pub supply: String,
    pub metadata_uri: Option<String>,
    pub creator_wallet_id: Option<String>,
    pub tx_signature: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bundle {
    pub id: String,
    pub token_id: Option<String>,
    pub config_json: String,
    pub status: String,
    pub jito_bundle_id: Option<String>,
    pub market_address: Option<String>,
    pub pool_address: Option<String>,
    pub tx_signatures: Option<String>,
    pub error_message: Option<String>,
    pub created_at: i64,
    pub executed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemeAsset {
    pub id: String,
    pub filename: String,
    pub mime_type: String,
    pub local_path: String,
    pub ipfs_cid: Option<String>,
    pub arweave_id: Option<String>,
    pub pinned_uri: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemeMetadata {
    pub id: String,
    pub name: String,
    pub symbol: String,
    pub description: Option<String>,
    pub image_asset_id: Option<String>,
    pub extra_json: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcEndpoint {
    pub id: String,
    pub name: String,
    pub url: String,
    pub ws_url: Option<String>,
    pub weight: i64,
    pub is_active: i64,
    pub last_latency_ms: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub task_type: String,
    pub status: String,
    pub progress: f64,
    pub result_json: Option<String>,
    pub error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Distribution {
    pub id: String,
    pub source_wallet_id: String,
    pub strategy: String,
    pub status: String,
    pub total_sol: i64,
    pub config_json: String,
    pub result_json: Option<String>,
    pub error_message: Option<String>,
    pub created_at: i64,
    pub executed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DistributionTransfer {
    pub id: String,
    pub distribution_id: String,
    pub from_wallet_id: String,
    pub to_wallet_id: String,
    pub amount_lamports: i64,
    pub hop_index: i64,
    pub delay_ms: i64,
    pub status: String,
    pub tx_signature: Option<String>,
    pub error_message: Option<String>,
    pub executed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletProfile {
    pub id: String,
    pub wallet_id: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub bio: Option<String>,
    pub twitter: Option<String>,
    pub telegram: Option<String>,
    pub website: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeadLetterTransaction {
    pub id: String,
    pub source: String,
    pub source_id: Option<String>,
    pub wallet_id: String,
    pub tx_type: String,
    pub payload_json: String,
    pub error_message: String,
    pub error_category: String,
    pub retry_count: i64,
    pub max_retries: i64,
    pub last_attempt_at: i64,
    pub next_retry_at: Option<i64>,
    pub resolved_at: Option<i64>,
    pub tx_signature: Option<String>,
    pub status: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: i64,
    pub action: String,
    pub detail: String,
    pub wallet_id: Option<String>,
    pub tx_signature: Option<String>,
    pub created_at: i64,
}
