use serde::{Deserialize, Serialize};

/// Standard API success response.
#[derive(Debug, Serialize)]
pub struct ApiResponse<T: Serialize> {
    pub success: bool,
    pub data: T,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data,
        }
    }
}

// Request/Response DTOs

#[derive(Debug, Deserialize)]
pub struct CreateWalletRequest {
    pub name: Option<String>,
    pub group_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WalletResponse {
    pub id: String,
    pub name: Option<String>,
    pub public_key: String,
    pub group_id: Option<String>,
    pub parent_id: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateSubwalletsRequest {
    pub count: usize,
}

#[derive(Debug, Deserialize)]
pub struct UnlockRequest {
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct SetupPasswordRequest {
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateGroupRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct ExportWalletRequest {
    pub export_password: String,
}

#[derive(Debug, Deserialize)]
pub struct SendTransactionRequest {
    pub to_address: String,
    pub amount: u64,
    pub mint_address: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RestoreFromSeedRequest {
    pub mnemonic: String,
    pub password: String,
}
