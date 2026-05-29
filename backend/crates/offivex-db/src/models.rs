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
    /// Serialized JSON payload used by launch-template tasks (Mint Task /
    /// Bundle Task / Pump-Fun Task) — stores the full launch config so the
    /// task can be re-executed later. Empty for vanity-grind tasks.
    pub config_blob: Option<String>,
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
    pub admin_id: Option<String>,
    pub user_id: Option<String>,
    pub ip: Option<String>,
}

// ─── Phase 1 user-management models ─────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Admin {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub created_at: i64,
    pub last_login_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminSession {
    pub id: String,
    pub admin_id: String,
    pub token_hash: String,
    pub created_at: i64,
    pub expires_at: i64,
    pub last_seen_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplyRequest {
    pub id: String,
    pub telegram: String,
    pub email: String,
    pub project: String,
    pub plan_pref: Option<String>,
    pub status: String,
    pub submitted_at: i64,
    pub decided_at: Option<i64>,
    pub decided_by_admin_id: Option<String>,
    pub user_id_after_approval: Option<String>,
    pub ip: Option<String>,
    pub notes: Option<String>,
    /// Phase 6.5 — referral code captured at /apply submission (e.g. "OFX-A1B2C3").
    pub referral_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub telegram: Option<String>,
    pub email: String,
    pub status: String,
    pub created_at: i64,
    pub created_from_apply_id: Option<String>,
    pub notes: Option<String>,
    /// Phase 6.5 — opt-in referral code (lazily allocated on first GET /user/referral/code).
    pub referral_code: Option<String>,
}

/// Phase 6.5 — referral link between two users.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Referral {
    pub id: String,
    pub referrer_user_id: String,
    pub referee_user_id: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub price_usd_cents: i64,
    pub duration_days: i64,
    pub features_json: String,
    pub is_active: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscription {
    pub id: String,
    pub user_id: String,
    pub plan_id: String,
    pub status: String,
    pub started_at: Option<i64>,
    pub expires_at: Option<i64>,
    pub current_payment_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKey {
    pub id: String,
    pub user_id: String,
    pub key_hash: String,
    pub key_prefix: String,
    pub status: String,
    pub created_at: i64,
    pub last_used_at: Option<i64>,
    pub revoked_at: Option<i64>,
    pub revoked_by_admin_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Payment {
    pub id: String,
    pub user_id: String,
    pub plan_id: String,
    pub provider: String,
    pub provider_payment_id: Option<String>,
    pub amount_usd_cents: i64,
    pub currency_paid: Option<String>,
    pub amount_paid_crypto: Option<String>,
    pub tx_hash: Option<String>,
    pub status: String,
    pub created_at: i64,
    pub confirmed_at: Option<i64>,
    pub webhook_payload_json: Option<String>,
    pub webhook_received_at: Option<i64>,
    // Phase 5 — direct on-chain Solana payment
    pub solana_address: Option<String>,
    pub derivation_index: Option<i64>,
    pub amount_lamports: Option<i64>,
    pub amount_lamports_received: Option<i64>,
    pub expires_at: Option<i64>,
    pub sol_usd_rate_cents: Option<i64>,
    pub reveal_key: Option<String>,
    pub reveal_key_expires_at: Option<i64>,
}
