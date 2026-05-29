use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tokio_rusqlite::Connection;
use rand::Rng;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::errors::{CategorizedError, ErrorCategory};
use offivex_crypto::SecretBytes;

#[derive(Debug, Error)]
pub enum WarmerError {
    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Wallet error: {0}")]
    WalletError(String),

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("Master key locked")]
    MasterKeyLocked,

    #[error("Other error: {0}")]
    Other(String),
}

impl From<tokio_rusqlite::Error> for WarmerError {
    fn from(e: tokio_rusqlite::Error) -> Self {
        WarmerError::DatabaseError(e.to_string())
    }
}

impl CategorizedError for WarmerError {
    fn category(&self) -> ErrorCategory {
        match self {
            // Database errors might be temporary (locks, etc.) - retry
            WarmerError::DatabaseError(msg) if msg.contains("locked") => ErrorCategory::Retryable,
            WarmerError::DatabaseError(msg) if msg.contains("busy") => ErrorCategory::Retryable,
            WarmerError::DatabaseError(_) => ErrorCategory::Fatal, // Other DB errors are fatal

            // Wallet/crypto errors are fatal
            WarmerError::WalletError(_) => ErrorCategory::Fatal,
            WarmerError::MasterKeyLocked => ErrorCategory::Fatal,

            // Configuration errors are user errors
            WarmerError::InvalidConfig(_) => ErrorCategory::UserError,

            // Unknown errors - retry by default
            WarmerError::Other(_) => ErrorCategory::Retryable,
        }
    }

    fn retry_delay(&self) -> Duration {
        match self {
            // Database lock - fast retry
            WarmerError::DatabaseError(msg) if msg.contains("locked") => Duration::from_millis(500),
            WarmerError::DatabaseError(msg) if msg.contains("busy") => Duration::from_millis(500),

            // Default delay
            _ => Duration::from_secs(5),
        }
    }

    fn max_retries(&self) -> u32 {
        match self {
            // Database locks - more retries with fast delay
            WarmerError::DatabaseError(msg) if msg.contains("locked") => 10,
            WarmerError::DatabaseError(msg) if msg.contains("busy") => 10,

            // Default retries
            _ => 3,
        }
    }

    fn user_message(&self) -> String {
        match self {
            WarmerError::DatabaseError(_) => "Database error. Retrying...".to_string(),
            WarmerError::WalletError(msg) => format!("Wallet error: {}", msg),
            WarmerError::InvalidConfig(msg) => format!("Invalid configuration: {}", msg),
            WarmerError::MasterKeyLocked => "Master encryption key is locked. Please unlock it first.".to_string(),
            WarmerError::Other(msg) => format!("Unexpected error: {}", msg),
        }
    }
}

/// Configuration for a wallet warmer task
#[derive(Debug, Clone)]
pub struct WarmerConfig {
    pub wallet_ids: Vec<String>,
    pub actions_count: u32,      // Total actions to perform
    pub min_delay_hours: u32,
    pub max_delay_hours: u32,
}

/// Type of warming action
#[derive(Debug, Clone)]
pub enum ActionType {
    SolTransfer,
    TokenSwap,
    NftInteraction,
}

impl ActionType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ActionType::SolTransfer => "sol_transfer",
            ActionType::TokenSwap => "token_swap",
            ActionType::NftInteraction => "nft_interaction",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "token_swap" => ActionType::TokenSwap,
            "nft_interaction" => ActionType::NftInteraction,
            _ => ActionType::SolTransfer,
        }
    }
}

/// Runtime state for wallet warmer persistence
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WarmerRuntimeState {
    pub actions_completed: u32,
    pub last_action_timestamp: i64,
}

/// Wallet warmer task
pub struct WalletWarmer {
    pub id: String,
    config: WarmerConfig,
    db: Arc<Connection>,
    rpc_client: Arc<solana_client::nonblocking::rpc_client::RpcClient>,
    master_key: Arc<RwLock<Option<SecretBytes>>>,
    // Runtime state for persistence
    actions_completed: Arc<RwLock<u32>>,
}

impl WalletWarmer {
    /// Create a new wallet warmer task
    pub async fn new(
        id: String,
        config: WarmerConfig,
        db: Arc<Connection>,
        rpc_client: Arc<solana_client::nonblocking::rpc_client::RpcClient>,
        master_key: Arc<RwLock<Option<SecretBytes>>>,
    ) -> Result<Self, WarmerError> {
        if config.wallet_ids.is_empty() {
            return Err(WarmerError::InvalidConfig(
                "At least one wallet required".into(),
            ));
        }
        if config.actions_count == 0 {
            return Err(WarmerError::InvalidConfig(
                "Actions count must be positive".into(),
            ));
        }
        if config.min_delay_hours >= config.max_delay_hours {
            return Err(WarmerError::InvalidConfig(
                "min_delay must be less than max_delay".into(),
            ));
        }

        Ok(Self {
            id,
            config,
            db,
            rpc_client,
            master_key,
            actions_completed: Arc::new(RwLock::new(0)),
        })
    }

    /// Save runtime state to database
    async fn persist_state(&self) -> Result<(), WarmerError> {
        let actions_completed = *self.actions_completed.read().await;

        let state = WarmerRuntimeState {
            actions_completed,
            last_action_timestamp: chrono::Utc::now().timestamp(),
        };

        let state_json = serde_json::to_string(&state)
            .map_err(|e| WarmerError::Other(format!("Failed to serialize state: {}", e)))?;

        let task_id = self.id.clone();
        self.db
            .call(move |conn| {
                conn.execute(
                    "UPDATE warmer_tasks SET runtime_state = ?, updated_at = ?, actions_completed = ? WHERE id = ?",
                    (&state_json, state.last_action_timestamp, actions_completed, &task_id),
                )?;
                Ok(())
            })
            .await?;

        tracing::debug!(task_id = %self.id, "Warmer task state persisted");
        Ok(())
    }

    /// Load runtime state from database and resume execution
    pub async fn resume(
        id: String,
        config: WarmerConfig,
        db: Arc<Connection>,
        rpc_client: Arc<solana_client::nonblocking::rpc_client::RpcClient>,
        master_key: Arc<RwLock<Option<SecretBytes>>>,
    ) -> Result<Self, WarmerError> {
        // Load runtime state from DB
        let task_id = id.clone();
        let runtime_state_json: Option<String> = db
            .call(move |conn| {
                let result: Result<String, _> = conn.query_row(
                    "SELECT runtime_state FROM warmer_tasks WHERE id = ?",
                    [&task_id],
                    |row| row.get(0),
                );
                Ok::<Option<String>, tokio_rusqlite::Error>(result.ok())
            })
            .await?;

        // Parse state if exists
        let actions_completed = if let Some(state_json) = runtime_state_json {
            if let Ok(state) = serde_json::from_str::<WarmerRuntimeState>(&state_json) {
                tracing::info!(
                    task_id = %id,
                    actions_completed = state.actions_completed,
                    "Resuming warmer task from saved state"
                );
                state.actions_completed
            } else {
                tracing::warn!(task_id = %id, "Failed to parse saved state, starting fresh");
                0
            }
        } else {
            tracing::info!(task_id = %id, "No saved state found, starting fresh");
            0
        };

        // Validate configuration (same as new())
        if config.wallet_ids.is_empty() {
            return Err(WarmerError::InvalidConfig(
                "At least one wallet required".into(),
            ));
        }
        if config.actions_count == 0 {
            return Err(WarmerError::InvalidConfig(
                "Actions count must be positive".into(),
            ));
        }
        if config.min_delay_hours >= config.max_delay_hours {
            return Err(WarmerError::InvalidConfig(
                "min_delay must be less than max_delay".into(),
            ));
        }

        Ok(Self {
            id,
            config,
            db,
            rpc_client,
            master_key,
            actions_completed: Arc::new(RwLock::new(actions_completed)),
        })
    }

    /// Schedule random actions for all wallets
    pub async fn schedule_actions(&self) -> Result<(), WarmerError> {
        let mut current_time = SystemTime::now();

        for _ in 0..self.config.actions_count {
            // Pick random wallet
            let wallet_id = &self.config.wallet_ids[
                rand::random::<usize>() % self.config.wallet_ids.len()
            ];

            // Pick random action type
            let action_type = match rand::random::<u8>() % 3 {
                0 => ActionType::SolTransfer,
                1 => ActionType::TokenSwap,
                _ => ActionType::NftInteraction,
            };

            // Random delay
            let delay_hours = rand::thread_rng().gen_range(
                self.config.min_delay_hours..=self.config.max_delay_hours,
            );
            current_time += Duration::from_secs(delay_hours as u64 * 3600);

            // Create action
            self.create_action(wallet_id, action_type, current_time).await?;
        }

        Ok(())
    }

    /// Create a scheduled action
    async fn create_action(
        &self,
        wallet_id: &str,
        action_type: ActionType,
        scheduled_at: SystemTime,
    ) -> Result<(), WarmerError> {
        let action_id = uuid::Uuid::new_v4().to_string();
        let task_id = self.id.clone();
        let wallet_id = wallet_id.to_string();
        let action_type_str = action_type.as_str().to_string();
        let scheduled_timestamp = scheduled_at
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        // Generate random details based on action type
        let details = match action_type {
            ActionType::SolTransfer => {
                let amount = rand::thread_rng().gen_range(1000..10000); // 0.001-0.01 SOL
                serde_json::json!({
                    "amount_lamports": amount,
                    "memo": format!("test_{}", rand::random::<u16>()),
                })
            }
            ActionType::TokenSwap => {
                serde_json::json!({
                    "note": "Placeholder - would swap random token",
                })
            }
            ActionType::NftInteraction => {
                serde_json::json!({
                    "note": "Placeholder - would interact with NFT",
                })
            }
        };

        let details_str = details.to_string();

        self.db
            .call(move |conn| {
                conn.execute(
                    "INSERT INTO warmer_actions (id, task_id, wallet_id, action_type, details, scheduled_at, status)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending')",
                    (
                        &action_id,
                        &task_id,
                        &wallet_id,
                        &action_type_str,
                        &details_str,
                        scheduled_timestamp,
                    ),
                )?;
                Ok(())
            })
            .await?;

        Ok(())
    }

    /// Execute pending actions
    pub async fn run(&self) -> Result<(), WarmerError> {
        loop {
            // Check if task is completed
            let (status, actions_completed, total_actions) = self.get_task_status().await?;

            if status == "completed" || actions_completed >= total_actions {
                tracing::info!("Warmer task {} completed", self.id);
                self.update_task_status("completed").await?;
                break;
            }

            if status == "stopped" {
                tracing::info!("Warmer task {} stopped", self.id);
                break;
            }

            // Get next pending action
            if let Some((action_id, wallet_id, action_type, details)) =
                self.get_next_pending_action().await?
            {
                tracing::info!(
                    "Executing warming action {} for wallet {}",
                    action_type,
                    wallet_id
                );

                match self
                    .execute_action(&action_id, &wallet_id, &action_type, &details)
                    .await
                {
                    Ok(_) => {
                        self.mark_action_executed(&action_id).await?;
                        self.increment_actions_completed().await?;
                    }
                    Err(e) => {
                        tracing::error!("Action {} failed: {}", action_id, e);
                        self.mark_action_failed(&action_id).await?;
                    }
                }
            }

            // Wait before checking for next action
            tokio::time::sleep(Duration::from_secs(60)).await;
        }

        Ok(())
    }

    /// Get task status
    async fn get_task_status(&self) -> Result<(String, i64, i64), WarmerError> {
        let task_id = self.id.clone();
        let result = self.db
            .call(move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT status, actions_completed, actions_count FROM warmer_tasks WHERE id = ?",
                )?;
                let result = stmt.query_row([&task_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?))
                })?;
                Ok(result)
            })
            .await?;
        Ok(result)
    }

    /// Get next pending action that's due
    async fn get_next_pending_action(
        &self,
    ) -> Result<Option<(String, String, String, String)>, WarmerError> {
        let task_id = self.id.clone();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let result = self.db
            .call(move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT id, wallet_id, action_type, details
                     FROM warmer_actions
                     WHERE task_id = ? AND status = 'pending' AND scheduled_at <= ?
                     ORDER BY scheduled_at ASC
                     LIMIT 1",
                )?;

                let mut rows = stmt.query([&task_id, &now.to_string()])?;
                if let Some(row) = rows.next()? {
                    Ok(Some((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                    )))
                } else {
                    Ok(None)
                }
            })
            .await?;
        Ok(result)
    }

    /// Execute a warming action
    async fn execute_action(
        &self,
        _action_id: &str,
        wallet_id: &str,
        action_type: &str,
        details: &str,
    ) -> Result<(), WarmerError> {
        // Load wallet keypair
        let keypair = self.load_wallet_keypair(wallet_id).await?;

        // Parse details
        let details_json: serde_json::Value = serde_json::from_str(details)
            .map_err(|e| WarmerError::Other(format!("Invalid JSON: {}", e)))?;

        // Execute based on action type
        match action_type {
            "sol_transfer" => {
                let to_address = details_json["to"]
                    .as_str()
                    .ok_or(WarmerError::Other("Missing 'to' in details".into()))?;
                let amount_lamports = details_json["amount"]
                    .as_u64()
                    .unwrap_or(1000); // Default small amount

                super::operations::send_sol(&*self.rpc_client, &keypair, to_address, amount_lamports)
                    .await
                    .map_err(|e| WarmerError::Other(format!("SOL transfer failed: {}", e)))?;

                tracing::info!(
                    wallet_id = %wallet_id,
                    to = %to_address,
                    amount = amount_lamports,
                    "Warmer SOL transfer executed"
                );
            }
            "token_swap" => {
                use std::str::FromStr;
                use crate::trading::swap;

                let token_mint_str = details_json["token_mint"]
                    .as_str()
                    .ok_or(WarmerError::Other("Missing 'token_mint' in details".into()))?;
                let amount = details_json["amount"]
                    .as_u64()
                    .unwrap_or(10_000_000); // 0.01 SOL default
                let direction = details_json["direction"]
                    .as_str()
                    .unwrap_or("buy");

                let token_mint = solana_sdk::pubkey::Pubkey::from_str(token_mint_str)
                    .map_err(|e| WarmerError::Other(format!("Invalid mint: {}", e)))?;

                let config = if direction == "sell" {
                    swap::create_sell_config(&token_mint, amount, 500)
                } else {
                    swap::create_buy_config(&token_mint, amount, 500)
                };

                swap::execute_swap_jupiter(&keypair, config, &*self.rpc_client)
                    .await
                    .map_err(|e| WarmerError::Other(format!("Token swap failed: {}", e)))?;

                tracing::info!(
                    wallet_id = %wallet_id,
                    token = %token_mint_str,
                    direction = %direction,
                    amount = amount,
                    "Warmer token swap executed"
                );
            }
            "nft_interaction" => {
                // NFT interaction requires Metaplex SDK — not supported yet
                tracing::warn!(
                    wallet_id = %wallet_id,
                    "NFT interaction not supported yet — skipping action"
                );
            }
            _ => {
                return Err(WarmerError::Other(format!(
                    "Unknown action type: {}",
                    action_type
                )))
            }
        }

        Ok(())
    }

    /// Load wallet keypair using the shared decrypt utility.
    ///
    /// Returns a [`ZeroizingKeypair`] (SEC-2) so the secret is zeroed on Drop.
    async fn load_wallet_keypair(
        &self,
        wallet_id: &str,
    ) -> Result<super::ZeroizingKeypair, WarmerError> {
        use super::decrypt;

        let mek_guard = self.master_key.read().await;
        let mek = mek_guard.as_ref().ok_or(WarmerError::MasterKeyLocked)?;

        decrypt::decrypt_wallet_keypair(&self.db, wallet_id, mek)
            .await
            .map_err(|e| {
                tracing::error!(
                    wallet_id = %wallet_id,
                    error = %e,
                    "Failed to decrypt wallet keypair"
                );
                WarmerError::WalletError(format!("Decryption failed: {}", e))
            })
    }

    /// Mark action as executed
    async fn mark_action_executed(&self, action_id: &str) -> Result<(), WarmerError> {
        let action_id = action_id.to_string();
        let executed_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        self.db
            .call(move |conn| {
                conn.execute(
                    "UPDATE warmer_actions SET status = 'executed', executed_at = ? WHERE id = ?",
                    (executed_at, &action_id),
                )?;
                Ok(())
            })
            .await?;
        Ok(())
    }

    /// Mark action as failed
    async fn mark_action_failed(&self, action_id: &str) -> Result<(), WarmerError> {
        let action_id = action_id.to_string();
        self.db
            .call(move |conn| {
                conn.execute(
                    "UPDATE warmer_actions SET status = 'failed' WHERE id = ?",
                    [&action_id],
                )?;
                Ok(())
            })
            .await?;
        Ok(())
    }

    /// Increment completed actions counter
    async fn increment_actions_completed(&self) -> Result<(), WarmerError> {
        // Update internal state counter
        {
            let mut actions_completed = self.actions_completed.write().await;
            *actions_completed += 1;
        }

        // Persist state
        if let Err(e) = self.persist_state().await {
            tracing::error!("Failed to persist warmer task state: {}", e);
        }

        Ok(())
    }

    /// Update task status
    async fn update_task_status(&self, status: &str) -> Result<(), WarmerError> {
        let task_id = self.id.clone();
        let status = status.to_string();
        let updated_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        self.db
            .call(move |conn| {
                let completed_at = if status == "completed" {
                    Some(updated_at)
                } else {
                    None
                };

                conn.execute(
                    "UPDATE warmer_tasks SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?",
                    (&status, updated_at, completed_at, &task_id),
                )?;
                Ok(())
            })
            .await?;
        Ok(())
    }

    /// Start the warmer task
    pub async fn start(&self) -> Result<(), WarmerError> {
        self.update_task_status("running").await?;
        tracing::info!("Warmer task {} started", self.id);
        Ok(())
    }

    /// Stop the warmer task
    pub async fn stop(&self) -> Result<(), WarmerError> {
        self.update_task_status("stopped").await?;
        tracing::info!("Warmer task {} stopped", self.id);
        Ok(())
    }
}
