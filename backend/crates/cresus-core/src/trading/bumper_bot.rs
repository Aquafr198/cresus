use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tokio_rusqlite::Connection;
use serde::{Deserialize, Serialize};
use solana_sdk::{pubkey::Pubkey, signature::Keypair};
use thiserror::Error;

use crate::trading::swap::{self, SwapError};
use crate::errors::{CategorizedError, ErrorCategory, retry_with_backoff};
use cresus_crypto::SecretBytes;

#[derive(Debug, Error)]
pub enum BumperBotError {
    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Wallet error: {0}")]
    WalletError(String),

    #[error("Swap error: {0}")]
    SwapError(#[from] SwapError),

    #[error("Price feed error: {0}")]
    PriceFeedError(#[from] super::price_feed::PriceFeedError),

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("Master key locked")]
    MasterKeyLocked,

    #[error("Rate limit exceeded")]
    RateLimitExceeded,

    #[error("Other error: {0}")]
    Other(String),
}

impl From<tokio_rusqlite::Error> for BumperBotError {
    fn from(e: tokio_rusqlite::Error) -> Self {
        BumperBotError::DatabaseError(e.to_string())
    }
}

impl CategorizedError for BumperBotError {
    fn category(&self) -> ErrorCategory {
        match self {
            // Database errors might be temporary (locks, etc.) - retry
            BumperBotError::DatabaseError(msg) if msg.contains("locked") => ErrorCategory::Retryable,
            BumperBotError::DatabaseError(msg) if msg.contains("busy") => ErrorCategory::Retryable,
            BumperBotError::DatabaseError(_) => ErrorCategory::Fatal, // Other DB errors are fatal

            // Wallet/crypto errors are fatal
            BumperBotError::WalletError(_) => ErrorCategory::Fatal,
            BumperBotError::MasterKeyLocked => ErrorCategory::Fatal,

            // Rate limiting is retryable
            BumperBotError::RateLimitExceeded => ErrorCategory::Retryable,

            // Swap errors - inherit from SwapError's categorization
            BumperBotError::SwapError(swap_err) => swap_err.category(),

            // Price feed errors - inherit from PriceFeedError's categorization
            BumperBotError::PriceFeedError(price_err) => price_err.category(),

            // Configuration errors are user errors
            BumperBotError::InvalidConfig(_) => ErrorCategory::UserError,

            // Unknown errors - retry by default
            BumperBotError::Other(_) => ErrorCategory::Retryable,
        }
    }

    fn retry_delay(&self) -> Duration {
        match self {
            // Database lock - fast retry
            BumperBotError::DatabaseError(msg) if msg.contains("locked") => Duration::from_millis(500),
            BumperBotError::DatabaseError(msg) if msg.contains("busy") => Duration::from_millis(500),

            // Rate limit - longer delay
            BumperBotError::RateLimitExceeded => Duration::from_secs(60),

            // Swap errors - inherit from SwapError
            BumperBotError::SwapError(swap_err) => swap_err.retry_delay(),

            // Price feed errors - inherit from PriceFeedError
            BumperBotError::PriceFeedError(price_err) => price_err.retry_delay(),

            // Default delay
            _ => Duration::from_secs(5),
        }
    }

    fn max_retries(&self) -> u32 {
        match self {
            // Database locks - more retries with fast delay
            BumperBotError::DatabaseError(msg) if msg.contains("locked") => 10,
            BumperBotError::DatabaseError(msg) if msg.contains("busy") => 10,

            // Rate limiting - fewer retries (long delays)
            BumperBotError::RateLimitExceeded => 2,

            // Swap errors - inherit from SwapError
            BumperBotError::SwapError(swap_err) => swap_err.max_retries(),

            // Price feed errors - inherit from PriceFeedError
            BumperBotError::PriceFeedError(price_err) => price_err.max_retries(),

            // Default retries
            _ => 3,
        }
    }

    fn user_message(&self) -> String {
        match self {
            BumperBotError::DatabaseError(_) => "Database error. Retrying...".to_string(),
            BumperBotError::WalletError(msg) => format!("Wallet error: {}", msg),
            BumperBotError::SwapError(swap_err) => swap_err.user_message(),
            BumperBotError::PriceFeedError(price_err) => price_err.user_message(),
            BumperBotError::InvalidConfig(msg) => format!("Invalid configuration: {}", msg),
            BumperBotError::MasterKeyLocked => "Master encryption key is locked. Please unlock it first.".to_string(),
            BumperBotError::RateLimitExceeded => "Too many buy attempts. Waiting before retry...".to_string(),
            BumperBotError::Other(msg) => format!("Unexpected error: {}", msg),
        }
    }
}

/// Configuration for a bumper bot task
#[derive(Debug, Clone)]
pub struct BumperBotConfig {
    pub token_mint: Pubkey,
    pub wallet_ids: Vec<String>,
    pub price_threshold: f64,  // SOL price threshold
    pub buy_amount: u64,       // lamports
    pub max_buys_hour: u32,
    pub check_interval_sec: u64,
}

/// Status of a bumper bot task
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

/// Runtime state for bumper bot persistence
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BumperBotRuntimeState {
    pub buys_count: usize,
    pub total_spent_sol: u64, // in lamports
    pub last_buy_timestamp: i64,
    pub recent_buy_timestamps: Vec<i64>, // Last hour of buy timestamps
}

/// Bumper bot task for price support
pub struct BumperBot {
    pub id: String,
    config: BumperBotConfig,
    db: Arc<Connection>,
    rpc_client: Arc<solana_client::nonblocking::rpc_client::RpcClient>,
    master_key: Arc<RwLock<Option<SecretBytes>>>,
    status: Arc<RwLock<TaskStatus>>,
    recent_buys: Arc<RwLock<Vec<SystemTime>>>, // Track recent buys for rate limiting
    // Runtime state for persistence
    buys_count: Arc<RwLock<usize>>,
    total_spent_sol: Arc<RwLock<u64>>,
}

impl BumperBot {
    /// Create a new bumper bot task
    pub async fn new(
        id: String,
        config: BumperBotConfig,
        db: Arc<Connection>,
        rpc_client: Arc<solana_client::nonblocking::rpc_client::RpcClient>,
        master_key: Arc<RwLock<Option<SecretBytes>>>,
    ) -> Result<Self, BumperBotError> {
        // Validate configuration
        if config.wallet_ids.is_empty() {
            return Err(BumperBotError::InvalidConfig(
                "At least one wallet required".into(),
            ));
        }
        if config.price_threshold <= 0.0 {
            return Err(BumperBotError::InvalidConfig(
                "Price threshold must be positive".into(),
            ));
        }
        if config.buy_amount == 0 {
            return Err(BumperBotError::InvalidConfig(
                "Buy amount must be positive".into(),
            ));
        }

        Ok(Self {
            id,
            config,
            db,
            rpc_client,
            master_key,
            status: Arc::new(RwLock::new(TaskStatus::Stopped)),
            recent_buys: Arc::new(RwLock::new(Vec::new())),
            buys_count: Arc::new(RwLock::new(0)),
            total_spent_sol: Arc::new(RwLock::new(0)),
        })
    }

    /// Save runtime state to database
    async fn persist_state(&self) -> Result<(), BumperBotError> {
        let buys_count = *self.buys_count.read().await;
        let total_spent_sol = *self.total_spent_sol.read().await;

        let recent_buys = self.recent_buys.read().await;
        let recent_buy_timestamps: Vec<i64> = recent_buys
            .iter()
            .map(|t| t.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
            .collect();

        let last_buy_timestamp = recent_buy_timestamps.last().copied().unwrap_or(0);

        let state = BumperBotRuntimeState {
            buys_count,
            total_spent_sol,
            last_buy_timestamp,
            recent_buy_timestamps,
        };

        let state_json = serde_json::to_string(&state)
            .map_err(|e| BumperBotError::Other(format!("Failed to serialize state: {}", e)))?;

        let task_id = self.id.clone();
        self.db
            .call(move |conn| {
                conn.execute(
                    "UPDATE bumper_tasks SET runtime_state = ?, updated_at = ? WHERE id = ?",
                    (&state_json, chrono::Utc::now().timestamp(), &task_id),
                )?;
                Ok(())
            })
            .await?;

        tracing::debug!(task_id = %self.id, "Bumper bot state persisted");
        Ok(())
    }

    /// Load runtime state from database and resume execution
    pub async fn resume(
        id: String,
        config: BumperBotConfig,
        db: Arc<Connection>,
        rpc_client: Arc<solana_client::nonblocking::rpc_client::RpcClient>,
        master_key: Arc<RwLock<Option<SecretBytes>>>,
    ) -> Result<Self, BumperBotError> {
        // Load runtime state from DB
        let task_id = id.clone();
        let runtime_state_json: Option<String> = db
            .call(move |conn| {
                let result: Result<String, _> = conn.query_row(
                    "SELECT runtime_state FROM bumper_tasks WHERE id = ?",
                    [&task_id],
                    |row| row.get(0),
                );
                Ok::<Option<String>, tokio_rusqlite::Error>(result.ok())
            })
            .await?;

        // Parse state if exists
        let (buys_count, total_spent_sol, recent_buy_times) = if let Some(state_json) = runtime_state_json {
            if let Ok(state) = serde_json::from_str::<BumperBotRuntimeState>(&state_json) {
                let recent_buys: Vec<SystemTime> = state
                    .recent_buy_timestamps
                    .iter()
                    .filter_map(|&ts| {
                        UNIX_EPOCH.checked_add(Duration::from_secs(ts as u64))
                    })
                    .collect();

                tracing::info!(
                    task_id = %id,
                    buys_count = state.buys_count,
                    total_spent_sol = state.total_spent_sol,
                    "Resuming bumper bot from saved state"
                );
                (state.buys_count, state.total_spent_sol, recent_buys)
            } else {
                tracing::warn!(task_id = %id, "Failed to parse saved state, starting fresh");
                (0, 0, Vec::new())
            }
        } else {
            tracing::info!(task_id = %id, "No saved state found, starting fresh");
            (0, 0, Vec::new())
        };

        // Validate configuration (same as new())
        if config.wallet_ids.is_empty() {
            return Err(BumperBotError::InvalidConfig(
                "At least one wallet required".into(),
            ));
        }
        if config.price_threshold <= 0.0 {
            return Err(BumperBotError::InvalidConfig(
                "Price threshold must be positive".into(),
            ));
        }
        if config.buy_amount == 0 {
            return Err(BumperBotError::InvalidConfig(
                "Buy amount must be positive".into(),
            ));
        }

        Ok(Self {
            id,
            config,
            db,
            rpc_client,
            master_key,
            status: Arc::new(RwLock::new(TaskStatus::Stopped)),
            recent_buys: Arc::new(RwLock::new(recent_buy_times)),
            buys_count: Arc::new(RwLock::new(buys_count)),
            total_spent_sol: Arc::new(RwLock::new(total_spent_sol)),
        })
    }

    /// Start the bumper bot
    pub async fn start(&self) -> Result<(), BumperBotError> {
        let mut status = self.status.write().await;
        if *status == TaskStatus::Running {
            return Ok(());
        }
        *status = TaskStatus::Running;
        drop(status);

        self.update_db_status(TaskStatus::Running).await?;
        tracing::info!("Bumper bot task {} started", self.id);
        Ok(())
    }

    /// Stop the bumper bot
    pub async fn stop(&self) -> Result<(), BumperBotError> {
        let mut status = self.status.write().await;
        *status = TaskStatus::Stopped;
        drop(status);

        self.update_db_status(TaskStatus::Stopped).await?;
        tracing::info!("Bumper bot task {} stopped", self.id);
        Ok(())
    }

    /// Run the bumper bot loop
    pub async fn run(&self) -> Result<(), BumperBotError> {
        loop {
            // Check status
            let status = self.status.read().await.clone();
            if status == TaskStatus::Stopped {
                break;
            }
            if status == TaskStatus::Paused {
                tokio::time::sleep(Duration::from_secs(30)).await;
                continue;
            }

            // Fetch current price
            match self.fetch_token_price().await {
                Ok(current_price) => {
                    tracing::debug!(
                        "Current price for {}: {} SOL (threshold: {})",
                        self.config.token_mint,
                        current_price,
                        self.config.price_threshold
                    );

                    // If price is below threshold, execute buy
                    if current_price < self.config.price_threshold {
                        if self.can_buy().await {
                            if let Err(e) = self.execute_support_buy(current_price).await {
                                tracing::error!("Support buy failed: {}", e);
                            }
                        } else {
                            tracing::warn!("Rate limit reached, skipping buy");
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("Failed to fetch price: {}", e);
                }
            }

            // Wait before next check
            tokio::time::sleep(Duration::from_secs(self.config.check_interval_sec)).await;
        }

        Ok(())
    }

    /// Fetch current token price from Jupiter Price API with retry logic
    async fn fetch_token_price(&self) -> Result<f64, BumperBotError> {
        use super::price_feed;

        let token_mint = self.config.token_mint;

        // Fetch price with automatic retry logic
        let price = retry_with_backoff(
            || async move {
                price_feed::get_token_price_in_sol(&token_mint).await
            },
            &format!("Bumper bot price fetch (token: {})", token_mint),
        )
        .await?;

        Ok(price)
    }

    /// Check if we can execute a buy (rate limiting)
    async fn can_buy(&self) -> bool {
        let mut recent_buys = self.recent_buys.write().await;

        // Remove buys older than 1 hour
        let one_hour_ago = SystemTime::now() - Duration::from_secs(3600);
        recent_buys.retain(|&time| time > one_hour_ago);

        // Check if we're under the limit
        if recent_buys.len() >= self.config.max_buys_hour as usize {
            return false;
        }

        true
    }

    /// Execute a support buy
    async fn execute_support_buy(&self, current_price: f64) -> Result<(), BumperBotError> {
        // Select a random wallet
        let wallet_id = self.config.wallet_ids[
            rand::random::<usize>() % self.config.wallet_ids.len()
        ].clone();

        // Load wallet keypair
        let keypair = self.load_wallet_keypair(&wallet_id).await?;

        tracing::info!(
            wallet_id = %wallet_id,
            buy_amount_lamports = self.config.buy_amount,
            token_mint = %self.config.token_mint,
            current_price = current_price,
            "Executing bumper bot support buy"
        );

        let swap_config = swap::create_buy_config(
            &self.config.token_mint,
            self.config.buy_amount,
            500, // 5% slippage
        );

        // Clone necessary values for the retry closure
        let keypair_bytes = keypair.to_bytes();
        let rpc_client = self.rpc_client.clone();

        // Execute swap with automatic retry logic
        let signature = retry_with_backoff(
            || {
                let config = swap_config.clone();
                let keypair = Keypair::from_bytes(&keypair_bytes).unwrap();
                let rpc = rpc_client.clone();
                async move {
                    swap::execute_swap_jupiter(&keypair, config, &rpc).await
                }
            },
            &format!("Bumper bot support buy (wallet: {})", wallet_id),
        )
        .await?;

        tracing::info!(
            wallet_id = %wallet_id,
            signature = %signature,
            "Support buy executed successfully"
        );

        // Record buy in database
        self.record_buy(&wallet_id, current_price, Some(&signature))
            .await?;

        // Update recent buys for rate limiting
        let mut recent_buys = self.recent_buys.write().await;
        recent_buys.push(SystemTime::now());
        drop(recent_buys);

        // Update state counters
        {
            let mut buys_count = self.buys_count.write().await;
            *buys_count += 1;
        }
        {
            let mut total_spent = self.total_spent_sol.write().await;
            *total_spent += self.config.buy_amount;
        }

        // Persist state
        if let Err(e) = self.persist_state().await {
            tracing::error!("Failed to persist bumper bot state: {}", e);
        }

        Ok(())
    }

    /// Load a wallet keypair using the shared decrypt utility
    async fn load_wallet_keypair(&self, wallet_id: &str) -> Result<Keypair, BumperBotError> {
        use crate::wallet::decrypt;

        let mek_guard = self.master_key.read().await;
        let mek = mek_guard
            .as_ref()
            .ok_or(BumperBotError::MasterKeyLocked)?;

        decrypt::decrypt_wallet_keypair(&self.db, wallet_id, mek)
            .await
            .map_err(|e| {
                tracing::error!(
                    wallet_id = %wallet_id,
                    error = %e,
                    "Failed to decrypt wallet keypair"
                );
                BumperBotError::WalletError(format!("Decryption failed: {}", e))
            })
    }

    /// Record a buy in the database
    async fn record_buy(
        &self,
        wallet_id: &str,
        price: f64,
        tx_signature: Option<&str>,
    ) -> Result<(), BumperBotError> {
        let buy_id = uuid::Uuid::new_v4().to_string();
        let task_id = self.id.clone();
        let wallet_id = wallet_id.to_string();
        let tx_sig = tx_signature.map(|s| s.to_string());
        let executed_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        self.db
            .call(move |conn| {
                conn.execute(
                    "INSERT INTO bumper_buys (id, task_id, wallet_id, sol_amount, token_amount, price_at_buy, tx_signature, executed_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    (
                        &buy_id,
                        &task_id,
                        &wallet_id,
                        0i64, // token_amount (unknown until tx confirms)
                        0i64, // sol_amount (would calculate based on price)
                        price,
                        &tx_sig,
                        executed_at,
                    ),
                )?;

                // Update task stats
                conn.execute(
                    "UPDATE bumper_tasks SET buys_count = buys_count + 1, total_spent_sol = total_spent_sol + ? WHERE id = ?",
                    (0i64, &task_id), // Would update with actual spent amount
                )?;

                Ok(())
            })
            .await?;

        Ok(())
    }

    /// Update task status in database
    async fn update_db_status(&self, status: TaskStatus) -> Result<(), BumperBotError> {
        let task_id = self.id.clone();
        let status_str = status.as_str().to_string();
        let updated_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        self.db
            .call(move |conn| {
                conn.execute(
                    "UPDATE bumper_tasks SET status = ?, updated_at = ? WHERE id = ?",
                    (&status_str, updated_at, &task_id),
                )?;
                Ok(())
            })
            .await?;

        Ok(())
    }
}
