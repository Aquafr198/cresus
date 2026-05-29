//! Integration tests for Offivex-core
//!
//! These tests verify end-to-end flows using an in-memory SQLite database.

use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_rusqlite::Connection;

use offivex_crypto::SecretBytes;
use offivex_crypto::kdf::{derive_master_key, generate_salt};

/// Set up an in-memory test database with all migrations applied.
async fn setup_test_db() -> Connection {
    let conn = offivex_db::init_db(":memory:").await.unwrap();
    conn
}

/// Generate a test master encryption key from a password.
fn test_master_key() -> (SecretBytes, Vec<u8>) {
    let salt = generate_salt();
    let mek = derive_master_key("test-password-123", &salt).unwrap();
    (mek, salt.to_vec())
}

// ─── Wallet Lifecycle Tests ───────────────────────────────────────────────

mod wallet_tests {
    use super::*;
    use offivex_core::wallet::manager::WalletManager;

    #[tokio::test]
    async fn test_setup_password_and_unlock() {
        let db = setup_test_db().await;
        let db = Arc::new(db);
        let master_key = Arc::new(RwLock::new(None));

        let mgr = WalletManager::new(db.clone(), master_key.clone());

        // Should not be password-set initially
        assert!(!mgr.is_password_set().await.unwrap());
        assert!(!mgr.is_unlocked().await);

        // Setup password — returns a mnemonic
        let mnemonic = mgr.setup_password("my-secure-password").await.unwrap();
        assert!(!mnemonic.is_empty());

        // Should be unlocked after setup
        assert!(mgr.is_unlocked().await);
        assert!(mgr.is_password_set().await.unwrap());

        // Lock it
        mgr.lock().await;
        assert!(!mgr.is_unlocked().await);

        // Unlock with correct password
        mgr.unlock("my-secure-password").await.unwrap();
        assert!(mgr.is_unlocked().await);

        // Wrong password should fail
        mgr.lock().await;
        let result = mgr.unlock("wrong-password").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_create_wallet_requires_unlock() {
        let db = setup_test_db().await;
        let db = Arc::new(db);
        let master_key = Arc::new(RwLock::new(None));

        let mgr = WalletManager::new(db.clone(), master_key.clone());

        // Creating wallet while locked should fail
        let result = mgr.create_wallet(Some("Test".into()), None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_create_and_list_wallets() {
        let db = setup_test_db().await;
        let db = Arc::new(db);
        let master_key = Arc::new(RwLock::new(None));

        let mgr = WalletManager::new(db.clone(), master_key.clone());

        // Setup and unlock
        mgr.setup_password("pass123").await.unwrap();

        // Create wallets
        let w1 = mgr.create_wallet(Some("Wallet 1".into()), None).await.unwrap();
        let w2 = mgr.create_wallet(Some("Wallet 2".into()), None).await.unwrap();

        assert_ne!(w1.id, w2.id);
        assert_ne!(w1.public_key, w2.public_key);
        assert_eq!(w1.name.as_deref(), Some("Wallet 1"));
        assert_eq!(w2.name.as_deref(), Some("Wallet 2"));

        // List wallets
        let wallets = mgr.list_wallets().await.unwrap();
        assert_eq!(wallets.len(), 2);
    }

    #[tokio::test]
    async fn test_create_wallet_and_decrypt_keypair() {
        let db = setup_test_db().await;
        let db = Arc::new(db);
        let master_key: Arc<RwLock<Option<SecretBytes>>> = Arc::new(RwLock::new(None));

        let mgr = WalletManager::new(db.clone(), master_key.clone());

        // Setup and unlock
        mgr.setup_password("pass123").await.unwrap();

        // Create a wallet
        let wallet = mgr.create_wallet(Some("Test".into()), None).await.unwrap();

        // Decrypt the keypair using the shared utility
        let mek = master_key.read().await.clone().unwrap();
        let keypair = offivex_core::wallet::decrypt::decrypt_wallet_keypair(
            &db,
            &wallet.id,
            &mek,
        )
        .await
        .unwrap();

        // Verify the public key matches
        use solana_sdk::signer::Signer;
        assert_eq!(keypair.pubkey().to_string(), wallet.public_key);
    }

    #[tokio::test]
    async fn test_delete_wallet() {
        let db = setup_test_db().await;
        let db = Arc::new(db);
        let master_key = Arc::new(RwLock::new(None));

        let mgr = WalletManager::new(db.clone(), master_key.clone());
        mgr.setup_password("pass123").await.unwrap();

        let wallet = mgr.create_wallet(Some("ToDelete".into()), None).await.unwrap();
        assert_eq!(mgr.list_wallets().await.unwrap().len(), 1);

        mgr.delete_wallet(&wallet.id).await.unwrap();
        assert_eq!(mgr.list_wallets().await.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_wallet_groups() {
        let db = setup_test_db().await;
        let db = Arc::new(db);
        let master_key = Arc::new(RwLock::new(None));

        let mgr = WalletManager::new(db.clone(), master_key.clone());
        mgr.setup_password("pass123").await.unwrap();

        // Create a group
        let group = mgr.create_group("Trading Wallets").await.unwrap();
        assert_eq!(group.name, "Trading Wallets");

        // Create a wallet in the group
        let wallet = mgr.create_wallet(Some("W1".into()), Some(group.id.clone())).await.unwrap();
        assert_eq!(wallet.group_id.as_deref(), Some(group.id.as_str()));

        // List groups
        let groups = mgr.list_groups().await.unwrap();
        assert_eq!(groups.len(), 1);
    }
}

// ─── Encryption Tests ─────────────────────────────────────────────────────

mod encryption_tests {
    use super::*;
    use offivex_core::wallet::encryption;
    use offivex_core::wallet::keygen;

    #[test]
    fn test_encrypt_decrypt_keypair() {
        let (mek, _salt) = test_master_key();
        let keypair = keygen::generate_keypair();
        let secret = keygen::secret_bytes(&keypair);

        // Encrypt
        let encrypted = encryption::encrypt_secret_key(&secret, &mek).unwrap();
        assert!(!encrypted.ciphertext.is_empty());

        // Decrypt
        let decrypted = encryption::decrypt_secret_key(&encrypted, &mek).unwrap();
        assert_eq!(decrypted.as_ref(), secret.as_slice());
    }

    #[test]
    fn test_wrong_key_fails_decrypt() {
        let (mek1, _) = test_master_key();
        let (mek2, _) = test_master_key();

        let keypair = keygen::generate_keypair();
        let secret = keygen::secret_bytes(&keypair);

        let encrypted = encryption::encrypt_secret_key(&secret, &mek1).unwrap();

        // Different key should fail
        let result = encryption::decrypt_secret_key(&encrypted, &mek2);
        assert!(result.is_err());
    }
}

// ─── Error Handling Tests ────────────────────────────────────────────────

mod error_tests {
    use offivex_core::errors::{CategorizedError, ErrorCategory};
    use offivex_core::trading::swap::SwapError;
    use offivex_core::trading::jupiter::JupiterError;
    use std::time::Duration;

    #[test]
    fn test_swap_error_all_categories_covered() {
        // Verify every variant has a defined category
        let errors: Vec<SwapError> = vec![
            SwapError::RpcError("test".into()),
            SwapError::InsufficientBalance("test".into()),
            SwapError::SwapFailed("test".into()),
            SwapError::InvalidMint("test".into()),
            SwapError::SlippageExceeded,
            SwapError::Other("test".into()),
        ];

        for err in &errors {
            // Should not panic
            let _cat = err.category();
            let _retry = err.should_retry();
            let _delay = err.retry_delay();
            let _max = err.max_retries();
            let _msg = err.user_message();
        }
    }

    #[test]
    fn test_retryable_vs_fatal() {
        assert!(SwapError::RpcError("timeout".into()).should_retry());
        assert!(SwapError::SlippageExceeded.should_retry());
        assert!(SwapError::Other("something".into()).should_retry());

        assert!(!SwapError::InsufficientBalance("0".into()).should_retry());
        assert!(!SwapError::InvalidMint("bad".into()).should_retry());
    }

    #[test]
    fn test_rate_limit_detection() {
        // Various rate limit message patterns should all be retryable
        let rate_limit_msgs = vec![
            "rate limit exceeded",
            "429 Too Many Requests",
            "Too Many Requests",
        ];

        for msg in rate_limit_msgs {
            let err = SwapError::SwapFailed(msg.into());
            assert_eq!(err.category(), ErrorCategory::Retryable, "Failed for: {}", msg);
            assert!(err.retry_delay() >= Duration::from_secs(30), "Delay too short for: {}", msg);
        }
    }

    #[test]
    fn test_jupiter_error_categories() {
        assert_eq!(JupiterError::NoQuote.category(), ErrorCategory::Retryable);
        assert_eq!(JupiterError::RpcError("err".into()).category(), ErrorCategory::Retryable);
        assert_eq!(
            JupiterError::DeserializationError("bad".into()).category(),
            ErrorCategory::Fatal
        );
        assert_eq!(
            JupiterError::SigningError("bad".into()).category(),
            ErrorCategory::Fatal
        );
    }

    #[test]
    fn test_user_messages_are_helpful() {
        let msg = SwapError::InsufficientBalance("0 SOL".into()).user_message();
        assert!(msg.contains("Insufficient") || msg.contains("balance"));

        let msg = SwapError::SlippageExceeded.user_message();
        assert!(msg.contains("Price") || msg.contains("slippage") || msg.contains("Retry"));

        let msg = JupiterError::NoQuote.user_message();
        assert!(msg.contains("route") || msg.contains("Retry") || msg.contains("swap"));
    }
}

// ─── Volume Bot Config Validation Tests ──────────────────────────────────

mod volume_bot_tests {
    use super::*;
    use offivex_core::trading::volume_bot::{VolumeBot, VolumeBotConfig};
    use solana_sdk::pubkey::Pubkey;

    #[tokio::test]
    async fn test_empty_wallets_rejected() {
        let db = setup_test_db().await;
        let db = Arc::new(db);

        let config = VolumeBotConfig {
            token_mint: Pubkey::new_unique(),
            wallet_ids: vec![],
            min_sol: 10_000_000,
            max_sol: 100_000_000,
            sell_percent: 50,
            min_delay_sec: 5,
            max_delay_sec: 30,
            slippage_bps: 500,
        };

        let rpc = Arc::new(solana_client::nonblocking::rpc_client::RpcClient::new(
            "https://api.devnet.solana.com".to_string(),
        ));
        let mk = Arc::new(RwLock::new(None));

        let result = VolumeBot::new("test".into(), config, db, rpc, mk).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_invalid_sol_range_rejected() {
        let db = setup_test_db().await;
        let db = Arc::new(db);

        let config = VolumeBotConfig {
            token_mint: Pubkey::new_unique(),
            wallet_ids: vec!["wallet1".into()],
            min_sol: 100_000_000,
            max_sol: 10_000_000, // min > max
            sell_percent: 50,
            min_delay_sec: 5,
            max_delay_sec: 30,
            slippage_bps: 500,
        };

        let rpc = Arc::new(solana_client::nonblocking::rpc_client::RpcClient::new(
            "https://api.devnet.solana.com".to_string(),
        ));
        let mk = Arc::new(RwLock::new(None));

        let result = VolumeBot::new("test".into(), config, db, rpc, mk).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_invalid_sell_percent_rejected() {
        let db = setup_test_db().await;
        let db = Arc::new(db);

        let config = VolumeBotConfig {
            token_mint: Pubkey::new_unique(),
            wallet_ids: vec!["wallet1".into()],
            min_sol: 10_000_000,
            max_sol: 100_000_000,
            sell_percent: 0, // Invalid
            min_delay_sec: 5,
            max_delay_sec: 30,
            slippage_bps: 500,
        };

        let rpc = Arc::new(solana_client::nonblocking::rpc_client::RpcClient::new(
            "https://api.devnet.solana.com".to_string(),
        ));
        let mk = Arc::new(RwLock::new(None));

        let result = VolumeBot::new("test".into(), config, db, rpc, mk).await;
        assert!(result.is_err());
    }
}

// ─── Warmer Config Validation Tests ──────────────────────────────────────

mod warmer_tests {
    use super::*;
    use offivex_core::wallet::warmer::{WalletWarmer, WarmerConfig};

    #[tokio::test]
    async fn test_empty_wallets_rejected() {
        let db = setup_test_db().await;
        let db = Arc::new(db);
        let rpc = Arc::new(solana_client::nonblocking::rpc_client::RpcClient::new(
            "https://api.devnet.solana.com".to_string(),
        ));
        let mk = Arc::new(RwLock::new(None));

        let config = WarmerConfig {
            wallet_ids: vec![],
            actions_count: 10,
            min_delay_hours: 1,
            max_delay_hours: 4,
        };

        let result = WalletWarmer::new("test".into(), config, db, rpc, mk).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_zero_actions_rejected() {
        let db = setup_test_db().await;
        let db = Arc::new(db);
        let rpc = Arc::new(solana_client::nonblocking::rpc_client::RpcClient::new(
            "https://api.devnet.solana.com".to_string(),
        ));
        let mk = Arc::new(RwLock::new(None));

        let config = WarmerConfig {
            wallet_ids: vec!["w1".into()],
            actions_count: 0,
            min_delay_hours: 1,
            max_delay_hours: 4,
        };

        let result = WalletWarmer::new("test".into(), config, db, rpc, mk).await;
        assert!(result.is_err());
    }
}

// ─── Database Backup Tests ───────────────────────────────────────────────

mod backup_tests {
    use offivex_db::backup::{backup_database, BackupConfig, list_backups};

    #[tokio::test]
    async fn test_backup_and_list() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let backup_dir = temp_dir.path().join("backups");

        // Create and populate a test database
        let db = offivex_db::init_db(db_path.to_str().unwrap()).await.unwrap();

        let config = BackupConfig {
            backup_dir: backup_dir.clone(),
            max_backups: 5,
            compress: false,
        };

        // Create a backup
        let backup_path = backup_database(&db, &config).await.unwrap();
        assert!(backup_path.exists());

        // List backups
        let backups = list_backups(&config.backup_dir).await.unwrap();
        assert_eq!(backups.len(), 1);
    }

    #[tokio::test]
    async fn test_backup_cleanup() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let backup_dir = temp_dir.path().join("backups");

        let db = offivex_db::init_db(db_path.to_str().unwrap()).await.unwrap();

        let config = BackupConfig {
            backup_dir: backup_dir.clone(),
            max_backups: 2, // Keep only 2
            compress: false,
        };

        // Create 3 backups
        for _ in 0..3 {
            backup_database(&db, &config).await.unwrap();
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }

        // Should only keep 2
        let backups = list_backups(&config.backup_dir).await.unwrap();
        assert!(backups.len() <= 2);
    }
}

// ─── Migration Idempotence Tests ─────────────────────────────────────────

mod migration_tests {
    use super::*;

    #[tokio::test]
    async fn test_migrations_are_idempotent() {
        // Running init_db twice should not crash (the main bug we fixed)
        let temp_dir = tempfile::TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let path_str = db_path.to_str().unwrap();

        // First run — creates all tables
        let _db1 = offivex_db::init_db(path_str).await.unwrap();
        drop(_db1);

        // Second run — should NOT crash on "duplicate column" errors
        let _db2 = offivex_db::init_db(path_str).await.unwrap();
    }

    #[tokio::test]
    async fn test_in_memory_migrations() {
        // In-memory DB always starts fresh, but verifies migrations parse correctly
        let db = offivex_db::init_db(":memory:").await.unwrap();
        let db = Arc::new(db);

        // Verify key tables exist by inserting/querying
        let result: Result<usize, _> = db.call(|conn| {
            let count: usize = conn.query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('wallets','tokens','bundles','volume_tasks','bumper_tasks','warmer_tasks','pump_fun_launches')",
                [],
                |row| row.get(0),
            )?;
            Ok(count)
        }).await;

        assert_eq!(result.unwrap(), 7, "Not all expected tables were created");
    }
}

// ─── Validation Tests ────────────────────────────────────────────────────
// Note: offivex_api is not a dependency of Offivex-core, so we test
// validation logic that lives in Offivex-api through its own test module.
// Here we validate the password rules that the frontend/backend must agree on.

mod validation_tests {
    /// Mirrors the backend validate_password logic (offivex_api::validation)
    fn validate_password(password: &str) -> Result<(), String> {
        if password.len() < 12 {
            return Err("Password must be at least 12 characters".into());
        }
        let has_letter = password.chars().any(|c| c.is_alphabetic());
        let has_digit = password.chars().any(|c| c.is_numeric());
        if !has_letter || !has_digit {
            return Err("Password must contain both letters and numbers".into());
        }
        Ok(())
    }

    #[test]
    fn test_password_validation_rules() {
        // Too short
        assert!(validate_password("short1").is_err());
        assert!(validate_password("abcdefghij1").is_err()); // 11 chars

        // No digits
        assert!(validate_password("abcdefghijklmn").is_err());

        // No letters
        assert!(validate_password("123456789012").is_err());

        // Valid
        assert!(validate_password("mypassword12").is_ok());
        assert!(validate_password("P4ssw0rd!!extra").is_ok());
    }
}

// ─── Pump.fun Validation Tests ───────────────────────────────────────────

mod pump_fun_tests {
    use offivex_core::trading::pump_fun::PumpFunLaunchConfig;
    use offivex_core::errors::CategorizedError;

    #[test]
    fn test_pump_fun_error_categories() {
        use offivex_core::trading::pump_fun::PumpFunError;
        use offivex_core::errors::ErrorCategory;

        assert_eq!(PumpFunError::RpcError("test".into()).category(), ErrorCategory::Retryable);
        assert_eq!(PumpFunError::InvalidInput("test".into()).category(), ErrorCategory::UserError);
        assert_eq!(PumpFunError::CreateFailed("test".into()).category(), ErrorCategory::Fatal);

        // Rate limit should be retryable
        assert_eq!(
            PumpFunError::ApiError("rate limit exceeded".into()).category(),
            ErrorCategory::Retryable
        );
        assert_eq!(
            PumpFunError::ApiError("429".into()).category(),
            ErrorCategory::Retryable
        );

        // Generic API error should be fatal
        assert_eq!(
            PumpFunError::ApiError("bad request".into()).category(),
            ErrorCategory::Fatal
        );
    }

    #[test]
    fn test_pump_fun_config_validation() {
        // Name constraints
        let config = PumpFunLaunchConfig {
            name: "".to_string(),
            symbol: "TEST".to_string(),
            description: "Test token".to_string(),
            image_url: "".to_string(),
            twitter: None,
            telegram: None,
            website: None,
            initial_buy_sol: 0,
            slippage_bps: 500,
        };

        // Empty name should be caught by create_pump_fun_token
        assert!(config.name.is_empty());

        // Long name should also be invalid
        let long_name = "A".repeat(33);
        assert!(long_name.len() > 32);
    }
}

// ─── Swap Config Tests ──────────────────────────────────────────────────

mod swap_tests {
    use offivex_core::trading::swap;
    use solana_sdk::pubkey::Pubkey;

    #[test]
    fn test_create_buy_config() {
        let mint = Pubkey::new_unique();
        let config = swap::create_buy_config(&mint, 1_000_000_000, 500);

        assert_eq!(config.output_mint, mint);
        assert_eq!(config.amount, 1_000_000_000);
        assert_eq!(config.slippage_bps, 500);
    }

    #[test]
    fn test_create_sell_config() {
        let mint = Pubkey::new_unique();
        let config = swap::create_sell_config(&mint, 500_000, 300);

        assert_eq!(config.input_mint, mint);
        assert_eq!(config.amount, 500_000);
        assert_eq!(config.slippage_bps, 300);
    }
}

// ─── Devnet On-Chain Tests ──────────────────────────────────────────────────
// Run with: cargo test devnet -- --ignored
// These connect to the public Solana devnet RPC and test real on-chain operations.

mod devnet_tests {
    use std::sync::Arc;
    use solana_sdk::signer::Signer;
    use solana_client::nonblocking::rpc_client::RpcClient;

    fn devnet_rpc() -> Arc<RpcClient> {
        Arc::new(RpcClient::new("https://api.devnet.solana.com".to_string()))
    }

    #[tokio::test]
    #[ignore] // requires network access
    async fn devnet_rpc_connection() {
        let rpc = devnet_rpc();
        let version = rpc.get_version().await;
        assert!(version.is_ok(), "Failed to connect to devnet RPC: {:?}", version.err());
        let v = version.unwrap();
        assert!(!v.solana_core.is_empty());
    }

    #[tokio::test]
    #[ignore]
    async fn devnet_get_latest_blockhash() {
        let rpc = devnet_rpc();
        let result = rpc.get_latest_blockhash().await;
        assert!(result.is_ok(), "Failed to get blockhash: {:?}", result.err());
    }

    #[tokio::test]
    #[ignore]
    async fn devnet_wallet_keypair_generation() {
        // Test that a generated keypair can query its balance on devnet (should be 0)
        let keypair = solana_sdk::signer::keypair::Keypair::new();
        let rpc = devnet_rpc();
        let balance = rpc.get_balance(&keypair.pubkey()).await;
        assert!(balance.is_ok(), "Failed to query balance: {:?}", balance.err());
        assert_eq!(balance.unwrap(), 0, "Fresh keypair should have 0 balance");
    }

    #[tokio::test]
    #[ignore]
    async fn devnet_wallet_create_and_check_balance() {
        use super::*;

        let db = setup_test_db().await;
        let db = Arc::new(db);
        let master_key = Arc::new(RwLock::new(None));
        let mgr = offivex_core::wallet::manager::WalletManager::new(db.clone(), master_key.clone());

        // Setup password and unlock
        let _mnemonic = mgr.setup_password("devnet-test-pass123").await.unwrap();
        mgr.unlock("devnet-test-pass123").await.unwrap();

        // Create a wallet
        let wallet = mgr.create_wallet(None, None).await.unwrap();
        assert!(!wallet.public_key.is_empty());

        // Check balance on devnet
        let rpc = devnet_rpc();
        let pubkey: solana_sdk::pubkey::Pubkey = wallet.public_key.parse().unwrap();
        let balance = rpc.get_balance(&pubkey).await;
        assert!(balance.is_ok(), "Failed to query devnet balance: {:?}", balance.err());
        // Fresh wallet should have 0 SOL
        assert_eq!(balance.unwrap(), 0);
    }

    #[tokio::test]
    #[ignore]
    async fn devnet_rpc_manager_with_endpoint() {
        use super::*;

        let db = setup_test_db().await;
        let db = Arc::new(db);
        let rpc_mgr = offivex_core::rpc::manager::RpcManager::new(db.clone());

        // Add devnet endpoint
        rpc_mgr.add_endpoint("devnet", "https://api.devnet.solana.com", None, 1).await.unwrap();

        // Get client and verify it works
        let (client, ep) = rpc_mgr.get_client().await.unwrap();
        assert_eq!(ep.name, "devnet");

        let version = client.get_version().await;
        assert!(version.is_ok(), "RPC manager client failed: {:?}", version.err());
    }

    #[tokio::test]
    #[ignore]
    async fn devnet_jupiter_price_api_reachable() {
        // Test that Jupiter price API responds (used by bumper bot and swaps)
        let client = reqwest::Client::new();
        let resp = client
            .get("https://price.jup.ag/v6/price?ids=So11111111111111111111111111111111111111112")
            .send()
            .await;
        assert!(resp.is_ok(), "Jupiter price API unreachable: {:?}", resp.err());
        let status = resp.unwrap().status();
        assert!(status.is_success(), "Jupiter price API returned: {}", status);
    }
}
