use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tokio_rusqlite::Connection;
use rand::Rng;
use serde::{Deserialize, Serialize};
use solana_sdk::{pubkey::Pubkey, signature::Keypair, signer::Signer};
use thiserror::Error;

use crate::trading::swap::{self, SwapError};
use crate::errors::{CategorizedError, ErrorCategory, retry_with_backoff};
use cresus_crypto::SecretBytes;

#[derive(Debug, Error)]
pub enum VolumeBotError {
    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Wallet error: {0}")]
    WalletError(String),

    #[error("Swap error: {0}")]
    SwapError(#[from] SwapError),

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("Task not found: {0}")]
    TaskNotFound(String),

    #[error("Master key locked")]
    MasterKeyLocked,

    #[error("Other error: {0}")]
    Other(String),
}

impl From<tokio_rusqlite::Error> for VolumeBotError {
    fn from(e: tokio_rusqlite::Error) -> Self {
        VolumeBotError::DatabaseError(e.to_string())
    }
}

impl CategorizedError for VolumeBotError {
    fn category(&self) -> ErrorCategory {
        match self {
            // Database errors might be temporary (locks, etc.) - retry
            VolumeBotError::DatabaseError(msg) if msg.contains("locked") => ErrorCategory::Retryable,
            VolumeBotError::DatabaseError(msg) if msg.contains("busy") => ErrorCategory::Retryable,
            VolumeBotError::DatabaseError(_) => ErrorCategory::Fatal, // Other DB errors are fatal

            // Wallet/crypto errors are fatal
            VolumeBotError::WalletError(_) => ErrorCategory::Fatal,
            VolumeBotError::MasterKeyLocked => ErrorCategory::Fatal,

            // Swap errors - inherit from SwapError's categorization
            VolumeBotError::SwapError(swap_err) => swap_err.category(),

            // Configuration errors are user errors
            VolumeBotError::InvalidConfig(_) => ErrorCategory::UserError,
            VolumeBotError::TaskNotFound(_) => ErrorCategory::UserError,

            // Unknown errors - retry by default
            VolumeBotError::Other(_) => ErrorCategory::Retryable,
        }
    }

    fn retry_delay(&self) -> Duration {
        match self {
            // Database lock - fast retry
            VolumeBotError::DatabaseError(msg) if msg.contains("locked") => Duration::from_millis(500),
            VolumeBotError::DatabaseError(msg) if msg.contains("busy") => Duration::from_millis(500),

            // Swap errors - inherit from SwapError
            VolumeBotError::SwapError(swap_err) => swap_err.retry_delay(),

            // Default delay
            _ => Duration::from_secs(5),
        }
    }

    fn max_retries(&self) -> u32 {
        match self {
            // Database locks - more retries with fast delay
            VolumeBotError::DatabaseError(msg) if msg.contains("locked") => 10,
            VolumeBotError::DatabaseError(msg) if msg.contains("busy") => 10,

            // Swap errors - inherit from SwapError
            VolumeBotError::SwapError(swap_err) => swap_err.max_retries(),

            // Default retries
            _ => 3,
        }
    }

    fn user_message(&self) -> String {
        match self {
            VolumeBotError::DatabaseError(_) => "Database error. Retrying...".to_string(),
            VolumeBotError::WalletError(msg) => format!("Wallet error: {}", msg),
            VolumeBotError::SwapError(swap_err) => swap_err.user_message(),
            VolumeBotError::InvalidConfig(msg) => format!("Invalid configuration: {}", msg),
            VolumeBotError::TaskNotFound(id) => format!("Task not found: {}", id),
            VolumeBotError::MasterKeyLocked => "Master encryption key is locked. Please unlock it first.".to_string(),
            VolumeBotError::Other(msg) => format!("Unexpected error: {}", msg),
        }
    }
}

/// Configuration for a volume bot task
#[derive(Debug, Clone)]
pub struct VolumeBotConfig {
    pub token_mint: Pubkey,
    pub wallet_ids: Vec<String>,
    pub min_sol: u64,       // lamports
    pub max_sol: u64,       // lamports
    pub sell_percent: u8,   // 1-100
    pub min_delay_sec: u64,
    pub max_delay_sec: u64,
    pub slippage_bps: u16,  // basis points (e.g., 500 = 5%)
}

/// Status of a volume bot task
#[derive(Debug, Clone, PartialEq)]
pub enum TaskStatus {
    Stopped,
    Running,
    Paused,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskStatus::Stopped => "stopped",
            TaskStatus::Running => "running",
            TaskStatus::Paused => "paused",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "running" => TaskStatus::Running,
            "paused" => TaskStatus::Paused,
            _ => TaskStatus::Stopped,
        }
    }
}

/// Runtime state for volume bot persistence
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeBotRuntimeState {
    pub wallets: Vec<WalletRuntimeState>,
    pub last_trade_timestamp: i64,
    pub total_trades: usize,
    pub cycle: usize,
}

/// Runtime state for individual wallet in volume bot
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletRuntimeState {
    pub wallet_id: String,
    pub token_balance: u64,
    pub sol_balance: u64,
    pub next_action_at_unix: i64,
    pub trades_count: usize,
}

/// Wallet state for volume bot (in-memory, includes keypair)
struct WalletState {
    id: String,
    keypair: Keypair,
    token_balance: u64,
    next_action_at: SystemTime,
}

impl WalletState {
    /// Convert to serializable runtime state
    #[allow(dead_code)]
    fn to_runtime_state(&self, sol_balance: u64, trades_count: usize) -> WalletRuntimeState {
        WalletRuntimeState {
            wallet_id: self.id.clone(),
            token_balance: self.token_balance,
            sol_balance,
            next_action_at_unix: self.next_action_at
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64,
            trades_count,
        }
    }
}

/// Volume bot task
pub struct VolumeBot {
    pub id: String,
    config: VolumeBotConfig,
    db: Arc<Connection>,
    rpc_client: Arc<solana_client::nonblocking::rpc_client::RpcClient>,
    master_key: Arc<RwLock<Option<SecretBytes>>>,
    status: Arc<RwLock<TaskStatus>>,
    // Runtime state for persistence (used by persist_state)
    #[allow(dead_code)]
    total_trades: Arc<RwLock<usize>>,
    #[allow(dead_code)]
    last_trade_timestamp: Arc<RwLock<i64>>,
}

impl VolumeBot {
    /// Create a new volume bot task
    pub async fn new(
        id: String,
        config: VolumeBotConfig,
        db: Arc<Connection>,
        rpc_client: Arc<solana_client::nonblocking::rpc_client::RpcClient>,
        master_key: Arc<RwLock<Option<SecretBytes>>>,
    ) -> Result<Self, VolumeBotError> {
        // Validate configuration
        if config.wallet_ids.is_empty() {
            return Err(VolumeBotError::InvalidConfig(
                "At least one wallet required".into(),
            ));
        }
        if config.min_sol >= config.max_sol {
            return Err(VolumeBotError::InvalidConfig(
                "min_sol must be less than max_sol".into(),
            ));
        }
        if config.sell_percent == 0 || config.sell_percent > 100 {
            return Err(VolumeBotError::InvalidConfig(
                "sell_percent must be between 1 and 100".into(),
            ));
        }
        if config.min_delay_sec >= config.max_delay_sec {
            return Err(VolumeBotError::InvalidConfig(
                "min_delay must be less than max_delay".into(),
            ));
        }

        Ok(Self {
            id,
            config,
            db,
            rpc_client,
            master_key,
            status: Arc::new(RwLock::new(TaskStatus::Stopped)),
            total_trades: Arc::new(RwLock::new(0)),
            last_trade_timestamp: Arc::new(RwLock::new(0)),
        })
    }

    /// Save runtime state to database
    #[allow(dead_code)]
    async fn persist_state(&self) -> Result<(), VolumeBotError> {
        let total_trades = *self.total_trades.read().await;
        let last_trade_timestamp = *self.last_trade_timestamp.read().await;

        let state = VolumeBotRuntimeState {
            wallets: vec![], // Simplified: not storing wallet states
            last_trade_timestamp,
            total_trades,
            cycle: 0,
        };

        let state_json = serde_json::to_string(&state)
            .map_err(|e| VolumeBotError::Other(format!("Failed to serialize state: {}", e)))?;

        let task_id = self.id.clone();
        self.db
            .call(move |conn| {
                conn.execute(
                    "UPDATE volume_tasks SET runtime_state = ?, updated_at = ?  WHERE id = ?",
                    (&state_json, chrono::Utc::now().timestamp(), &task_id),
                )?;
                Ok(())
            })
            .await?;

        tracing::debug!(task_id = %self.id, "Volume bot state persisted");
        Ok(())
    }

    /// Load runtime state from database and resume execution
    pub async fn resume(
        id: String,
        config: VolumeBotConfig,
        db: Arc<Connection>,
        rpc_client: Arc<solana_client::nonblocking::rpc_client::RpcClient>,
        master_key: Arc<RwLock<Option<SecretBytes>>>,
    ) -> Result<Self, VolumeBotError> {
        // Load runtime state from DB
        let task_id = id.clone();
        let runtime_state_json: Option<String> = db
            .call(move |conn| {
                let result: Result<String, _> = conn.query_row(
                    "SELECT runtime_state FROM volume_tasks WHERE id = ?",
                    [&task_id],
                    |row| row.get(0),
                );
                Ok::<Option<String>, tokio_rusqlite::Error>(result.ok())
            })
            .await?;

        // Parse state if exists
        let (total_trades, last_trade_timestamp) = if let Some(state_json) = runtime_state_json {
            if let Ok(state) = serde_json::from_str::<VolumeBotRuntimeState>(&state_json) {
                tracing::info!(
                    task_id = %id,
                    total_trades = state.total_trades,
                    "Resuming volume bot from saved state"
                );
                (state.total_trades, state.last_trade_timestamp)
            } else {
                tracing::warn!(task_id = %id, "Failed to parse saved state, starting fresh");
                (0, 0)
            }
        } else {
            tracing::info!(task_id = %id, "No saved state found, starting fresh");
            (0, 0)
        };

        // Validate configuration (same as new())
        if config.wallet_ids.is_empty() {
            return Err(VolumeBotError::InvalidConfig(
                "At least one wallet required".into(),
            ));
        }
        if config.min_sol >= config.max_sol {
            return Err(VolumeBotError::InvalidConfig(
                "min_sol must be less than max_sol".into(),
            ));
        }
        if config.sell_percent == 0 || config.sell_percent > 100 {
            return Err(VolumeBotError::InvalidConfig(
                "sell_percent must be between 1 and 100".into(),
            ));
        }
        if config.min_delay_sec >= config.max_delay_sec {
            return Err(VolumeBotError::InvalidConfig(
                "min_delay must be less than max_delay".into(),
            ));
        }

        Ok(Self {
            id,
            config,
            db,
            rpc_client,
            master_key,
            status: Arc::new(RwLock::new(TaskStatus::Stopped)),
            total_trades: Arc::new(RwLock::new(total_trades)),
            last_trade_timestamp: Arc::new(RwLock::new(last_trade_timestamp)),
        })
    }

    /// Start the volume bot task
    pub async fn start(&self) -> Result<(), VolumeBotError> {
        let mut status = self.status.write().await;
        if *status == TaskStatus::Running {
            return Ok(()); // Already running
        }
        *status = TaskStatus::Running;
        drop(status);

        // Update DB status
        self.update_db_status(TaskStatus::Running).await?;

        tracing::info!("Volume bot task {} started", self.id);
        Ok(())
    }

    /// Stop the volume bot task
    pub async fn stop(&self) -> Result<(), VolumeBotError> {
        let mut status = self.status.write().await;
        *status = TaskStatus::Stopped;
        drop(status);

        // Update DB status
        self.update_db_status(TaskStatus::Stopped).await?;

        tracing::info!("Volume bot task {} stopped", self.id);
        Ok(())
    }

    /// Run the volume bot loop
    pub async fn run(&self) -> Result<(), VolumeBotError> {
        // Load wallets
        let mut wallet_states = self.load_wallets().await?;

        loop {
            // Check if stopped
            let status = self.status.read().await.clone();
            if status == TaskStatus::Stopped {
                break;
            }
            if status == TaskStatus::Paused {
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }

            // Find a wallet that's ready to act
            let ready_wallet = wallet_states
                .iter_mut()
                .find(|w| w.next_action_at <= SystemTime::now());

            if let Some(wallet) = ready_wallet {
                // Decide: Buy if no tokens, otherwise random buy/sell
                let should_buy = wallet.token_balance == 0 || rand::random::<bool>();

                let result = if should_buy {
                    self.execute_buy(wallet).await
                } else {
                    self.execute_sell(wallet).await
                };

                if let Err(e) = result {
                    tracing::error!("Trade failed for wallet {}: {}", wallet.id, e);
                }

                // Schedule next action
                let delay_secs = rand::thread_rng().gen_range(
                    self.config.min_delay_sec..=self.config.max_delay_sec,
                );
                wallet.next_action_at = SystemTime::now() + Duration::from_secs(delay_secs);
            } else {
                // No wallet ready, sleep briefly
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        }

        Ok(())
    }

    /// Execute a buy (SOL → Token)
    async fn execute_buy(&self, wallet: &mut WalletState) -> Result<(), VolumeBotError> {
        let sol_amount = rand::thread_rng().gen_range(self.config.min_sol..=self.config.max_sol);

        tracing::info!(
            wallet_id = %wallet.id,
            sol_amount_lamports = sol_amount,
            sol_amount_sol = sol_amount as f64 / 1e9,
            token_mint = %self.config.token_mint,
            "Executing volume bot buy"
        );

        let swap_config = swap::create_buy_config(
            &self.config.token_mint,
            sol_amount,
            self.config.slippage_bps,
        );

        // Clone necessary values for the retry closure
        let wallet_keypair = Keypair::from_bytes(&wallet.keypair.to_bytes())
            .map_err(|e| VolumeBotError::WalletError(format!("Failed to clone keypair: {}", e)))?;
        let rpc_client = self.rpc_client.clone();

        // Execute swap with automatic retry logic
        let signature = retry_with_backoff(
            || {
                let config = swap_config.clone();
                let keypair = Keypair::from_bytes(&wallet_keypair.to_bytes()).unwrap();
                let rpc = rpc_client.clone();
                async move {
                    swap::execute_swap_jupiter(&keypair, config, &rpc).await
                }
            },
            &format!("Volume bot buy (wallet: {})", wallet.id),
        )
        .await?;

        tracing::info!(
            wallet_id = %wallet.id,
            signature = %signature,
            "Buy executed successfully"
        );

        self.record_trade(&wallet.id, "buy", sol_amount, 0, Some(&signature))
            .await?;

        // Fetch actual token balance from chain after swap
        let actual_balance = crate::wallet::operations::get_token_balance(
            &self.rpc_client,
            &wallet.keypair.pubkey(),
            &self.config.token_mint,
        )
        .await
        .unwrap_or(wallet.token_balance);
        wallet.token_balance = actual_balance;

        Ok(())
    }

    /// Execute a sell (Token → SOL)
    async fn execute_sell(&self, wallet: &mut WalletState) -> Result<(), VolumeBotError> {
        if wallet.token_balance == 0 {
            return Ok(()); // Nothing to sell
        }

        let token_amount =
            (wallet.token_balance as f64 * (self.config.sell_percent as f64 / 100.0)) as u64;

        if token_amount == 0 {
            return Ok(());
        }

        tracing::info!(
            wallet_id = %wallet.id,
            token_amount = token_amount,
            token_mint = %self.config.token_mint,
            "Executing volume bot sell"
        );

        let swap_config = swap::create_sell_config(
            &self.config.token_mint,
            token_amount,
            self.config.slippage_bps,
        );

        // Clone necessary values for the retry closure
        let wallet_keypair = Keypair::from_bytes(&wallet.keypair.to_bytes())
            .map_err(|e| VolumeBotError::WalletError(format!("Failed to clone keypair: {}", e)))?;
        let rpc_client = self.rpc_client.clone();

        // Execute swap with automatic retry logic
        let signature = retry_with_backoff(
            || {
                let config = swap_config.clone();
                let keypair = Keypair::from_bytes(&wallet_keypair.to_bytes()).unwrap();
                let rpc = rpc_client.clone();
                async move {
                    swap::execute_swap_jupiter(&keypair, config, &rpc).await
                }
            },
            &format!("Volume bot sell (wallet: {})", wallet.id),
        )
        .await?;

        tracing::info!(
            wallet_id = %wallet.id,
            signature = %signature,
            "Sell executed successfully"
        );

        self.record_trade(&wallet.id, "sell", 0, token_amount, Some(&signature))
            .await?;

        wallet.token_balance -= token_amount;

        Ok(())
    }

    /// Load wallet keypairs from DB using the shared decrypt utility
    async fn load_wallets(&self) -> Result<Vec<WalletState>, VolumeBotError> {
        use crate::wallet::decrypt;

        let mek_guard = self.master_key.read().await;
        let mek = mek_guard
            .as_ref()
            .ok_or(VolumeBotError::MasterKeyLocked)?;

        let mut wallets = Vec::new();

        for wallet_id in &self.config.wallet_ids {
            // Decrypt wallet keypair using shared utility
            let keypair = decrypt::decrypt_wallet_keypair(&self.db, wallet_id, mek)
                .await
                .map_err(|e| {
                    tracing::error!(
                        wallet_id = %wallet_id,
                        error = %e,
                        "Failed to decrypt wallet keypair"
                    );
                    VolumeBotError::WalletError(format!("Decryption failed: {}", e))
                })?;

            // Fetch actual token balance from chain
            let token_balance = crate::wallet::operations::get_token_balance(
                &self.rpc_client,
                &keypair.pubkey(),
                &self.config.token_mint,
            )
            .await
            .unwrap_or(0);

            wallets.push(WalletState {
                id: wallet_id.clone(),
                keypair,
                token_balance,
                next_action_at: SystemTime::now(),
            });
        }

        Ok(wallets)
    }

    /// Record a trade in the database
    async fn record_trade(
        &self,
        wallet_id: &str,
        direction: &str,
        sol_amount: u64,
        token_amount: u64,
        tx_signature: Option<&str>,
    ) -> Result<(), VolumeBotError> {
        let trade_id = uuid::Uuid::new_v4().to_string();
        let task_id = self.id.clone();
        let wallet_id = wallet_id.to_string();
        let direction = direction.to_string();
        let tx_sig = tx_signature.map(|s| s.to_string());
        let executed_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        self.db
            .call(move |conn| {
                conn.execute(
                    "INSERT INTO volume_trades (id, task_id, wallet_id, direction, sol_amount, token_amount, tx_signature, executed_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    (
                        &trade_id,
                        &task_id,
                        &wallet_id,
                        &direction,
                        sol_amount as i64,
                        token_amount as i64,
                        &tx_sig,
                        executed_at,
                    ),
                )?;

                // Update task stats
                conn.execute(
                    "UPDATE volume_tasks SET trades_count = trades_count + 1, total_volume_sol = total_volume_sol + ? WHERE id = ?",
                    (sol_amount as i64, &task_id),
                )?;

                Ok(())
            })
            .await?;

        Ok(())
    }

    /// Update task status in database
    async fn update_db_status(&self, status: TaskStatus) -> Result<(), VolumeBotError> {
        let task_id = self.id.clone();
        let status_str = status.as_str().to_string();
        let updated_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        self.db
            .call(move |conn| {
                conn.execute(
                    "UPDATE volume_tasks SET status = ?, updated_at = ? WHERE id = ?",
                    (&status_str, updated_at, &task_id),
                )?;
                Ok(())
            })
            .await?;

        Ok(())
    }
}
