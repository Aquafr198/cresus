use std::sync::Arc;
use std::str::FromStr;
use tokio::sync::RwLock;
use tokio_rusqlite::Connection;

use cresus_crypto::{SecretBytes, EncryptedPayload};
use cresus_crypto::kdf::{derive_master_key, generate_salt};
use cresus_db::models::{Wallet, WalletGroup};
use cresus_db::repo::wallet_repo::WalletRepo;
use cresus_db::repo::config_repo::ConfigRepo;
use cresus_db::DbError;

use super::keygen;
use super::encryption;
use super::subwallet;

#[derive(Debug, thiserror::Error)]
pub enum WalletError {
    #[error("Database error: {0}")]
    Db(#[from] DbError),
    #[error("Crypto error: {0}")]
    Crypto(#[from] cresus_crypto::aes::CryptoError),
    #[error("App is locked — unlock with password first")]
    Locked,
    #[error("Password already set")]
    PasswordAlreadySet,
    #[error("No password configured — run setup first")]
    NoPasswordConfigured,
    #[error("Invalid password")]
    InvalidPassword,
    #[error("Wallet not found")]
    NotFound,
    #[error("{0}")]
    Other(String),
}

/// Service layer for all wallet operations.
#[derive(Clone)]
pub struct WalletManager {
    db: Arc<Connection>,
    master_key: Arc<RwLock<Option<SecretBytes>>>,
}

impl WalletManager {
    pub fn new(db: Arc<Connection>, master_key: Arc<RwLock<Option<SecretBytes>>>) -> Self {
        Self { db, master_key }
    }

    /// Check if a password has been configured (first-time setup check).
    pub async fn is_password_set(&self) -> Result<bool, WalletError> {
        let salt = ConfigRepo::get(&self.db, "password_salt").await?;
        Ok(salt.is_some())
    }

    /// First-time setup: set the app password.
    /// Generates a BIP39 seed phrase, stores the salt and encrypted verification token.
    pub async fn setup_password(&self, password: &str) -> Result<String, WalletError> {
        if self.is_password_set().await? {
            return Err(WalletError::PasswordAlreadySet);
        }

        // Generate a 12-word BIP39 mnemonic
        let mnemonic = cresus_crypto::generate_mnemonic()?;

        let salt = generate_salt();
        let mek = derive_master_key(password, &salt)?;

        // Encrypt the mnemonic with the MEK
        let encrypted_mnemonic = cresus_crypto::encrypt_mnemonic(&mnemonic, &mek)?;
        let mnemonic_hex = hex::encode(
            serde_json::to_vec(&encrypted_mnemonic).map_err(|e| WalletError::Other(e.to_string()))?,
        );

        // Encrypt a known verification token so we can verify the password later
        let verify_token = b"CRESUS_VERIFY_OK";
        let encrypted = cresus_crypto::encrypt(verify_token, &mek)?;

        // Store salt, encrypted mnemonic, and encrypted verification token
        let salt_hex = hex::encode(salt);
        let verify_hex = hex::encode(
            serde_json::to_vec(&encrypted).map_err(|e| WalletError::Other(e.to_string()))?,
        );

        ConfigRepo::set(&self.db, "password_salt", &salt_hex).await?;
        ConfigRepo::set(&self.db, "password_verify", &verify_hex).await?;
        ConfigRepo::set(&self.db, "seed_phrase_encrypted", &mnemonic_hex).await?;

        // Unlock with the MEK
        let mut mk = self.master_key.write().await;
        *mk = Some(mek);

        // Return the mnemonic so it can be displayed to the user
        Ok(mnemonic)
    }

    /// Unlock the app with the user's password.
    pub async fn unlock(&self, password: &str) -> Result<(), WalletError> {
        let salt_hex = ConfigRepo::get(&self.db, "password_salt")
            .await?
            .ok_or(WalletError::NoPasswordConfigured)?;
        let verify_hex = ConfigRepo::get(&self.db, "password_verify")
            .await?
            .ok_or(WalletError::NoPasswordConfigured)?;

        let salt = hex::decode(&salt_hex).map_err(|e| WalletError::Other(e.to_string()))?;
        let mek = derive_master_key(password, &salt)?;

        // Verify the MEK by decrypting the stored token
        let verify_bytes =
            hex::decode(&verify_hex).map_err(|e| WalletError::Other(e.to_string()))?;
        let encrypted: EncryptedPayload = serde_json::from_slice(&verify_bytes)
            .map_err(|e| WalletError::Other(e.to_string()))?;

        let decrypted =
            cresus_crypto::decrypt(&encrypted, &mek).map_err(|_| WalletError::InvalidPassword)?;

        if decrypted.as_ref() != b"CRESUS_VERIFY_OK" {
            return Err(WalletError::InvalidPassword);
        }

        let mut mk = self.master_key.write().await;
        *mk = Some(mek);
        Ok(())
    }

    /// Lock the app (clear MEK from memory).
    pub async fn lock(&self) {
        let mut mk = self.master_key.write().await;
        *mk = None;
    }

    /// Check if the app is unlocked.
    pub async fn is_unlocked(&self) -> bool {
        self.master_key.read().await.is_some()
    }

    async fn require_mek(&self) -> Result<SecretBytes, WalletError> {
        self.master_key
            .read()
            .await
            .clone()
            .ok_or(WalletError::Locked)
    }

    /// Create a new wallet with a fresh keypair.
    pub async fn create_wallet(
        &self,
        name: Option<String>,
        group_id: Option<String>,
    ) -> Result<Wallet, WalletError> {
        let mek = self.require_mek().await?;
        let keypair = keygen::generate_keypair();
        let pubkey = keygen::pubkey_base58(&keypair);
        let secret = keygen::secret_bytes(&keypair);

        let encrypted = encryption::encrypt_secret_key(&secret, &mek)?;

        let now = chrono::Utc::now().timestamp();
        let wallet = Wallet {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            public_key: pubkey,
            encrypted_secret: encrypted.ciphertext,
            nonce: encrypted.nonce.to_vec(),
            group_id,
            parent_id: None,
            derivation_index: None,
            created_at: now,
        };

        WalletRepo::create(&self.db, wallet.clone()).await?;
        Ok(wallet)
    }

    /// List all wallets.
    pub async fn list_wallets(&self) -> Result<Vec<Wallet>, WalletError> {
        Ok(WalletRepo::list_all(&self.db).await?)
    }

    /// Get a wallet by ID.
    pub async fn get_wallet(&self, id: &str) -> Result<Wallet, WalletError> {
        WalletRepo::get_by_id(&self.db, id.to_string())
            .await?
            .ok_or(WalletError::NotFound)
    }

    /// Delete a wallet by ID.
    pub async fn delete_wallet(&self, id: &str) -> Result<bool, WalletError> {
        Ok(WalletRepo::delete(&self.db, id.to_string()).await?)
    }

    /// Generate sub-wallets for a parent wallet.
    pub async fn create_subwallets(
        &self,
        parent_id: &str,
        count: usize,
        group_id: Option<String>,
    ) -> Result<Vec<Wallet>, WalletError> {
        let mek = self.require_mek().await?;

        // Verify parent exists
        let _parent = self.get_wallet(parent_id).await?;

        let keypairs = subwallet::generate_subwallets(count);
        let now = chrono::Utc::now().timestamp();
        let mut wallets = Vec::with_capacity(count);

        for (i, kp) in keypairs.iter().enumerate() {
            let pubkey = keygen::pubkey_base58(kp);
            let secret = keygen::secret_bytes(kp);
            let encrypted = encryption::encrypt_secret_key(&secret, &mek)?;

            let wallet = Wallet {
                id: uuid::Uuid::new_v4().to_string(),
                name: Some(format!("sub-{}", i)),
                public_key: pubkey,
                encrypted_secret: encrypted.ciphertext,
                nonce: encrypted.nonce.to_vec(),
                group_id: group_id.clone(),
                parent_id: Some(parent_id.to_string()),
                derivation_index: Some(i as i64),
                created_at: now,
            };

            WalletRepo::create(&self.db, wallet.clone()).await?;
            wallets.push(wallet);
        }

        Ok(wallets)
    }

    /// Create a wallet group.
    pub async fn create_group(&self, name: &str) -> Result<WalletGroup, WalletError> {
        let group = WalletGroup {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            created_at: chrono::Utc::now().timestamp(),
        };
        WalletRepo::create_group(&self.db, group.clone()).await?;
        Ok(group)
    }

    /// List all wallet groups.
    pub async fn list_groups(&self) -> Result<Vec<WalletGroup>, WalletError> {
        Ok(WalletRepo::list_groups(&self.db).await?)
    }

    /// Export a wallet's secret key as encrypted JSON.
    /// Re-encrypts with a key derived from the export password.
    pub async fn export_secret_key(
        &self,
        id: &str,
        export_password: &str,
    ) -> Result<serde_json::Value, WalletError> {
        let mek = self.require_mek().await?;
        let wallet = self.get_wallet(id).await?;
        let nonce: [u8; 12] = wallet
            .nonce
            .try_into()
            .map_err(|_| WalletError::Other("Invalid nonce length".into()))?;
        let payload = EncryptedPayload {
            ciphertext: wallet.encrypted_secret,
            nonce,
        };
        let decrypted = encryption::decrypt_secret_key(&payload, &mek)?;

        // Re-encrypt with a key derived from the export password
        let export_salt = generate_salt();
        let export_key = derive_master_key(export_password, &export_salt)?;
        let export_payload = cresus_crypto::encrypt(decrypted.as_ref(), &export_key)?;

        Ok(serde_json::json!({
            "version": 1,
            "salt": hex::encode(export_salt),
            "nonce": hex::encode(export_payload.nonce),
            "ciphertext": hex::encode(export_payload.ciphertext),
        }))
    }

    /// Get the balance (SOL + tokens) for a wallet.
    pub async fn get_wallet_balance(
        &self,
        wallet_id: &str,
        rpc_client: &solana_client::nonblocking::rpc_client::RpcClient,
    ) -> Result<super::operations::WalletBalance, WalletError> {
        let wallet = self.get_wallet(wallet_id).await?;
        let pubkey = solana_sdk::pubkey::Pubkey::from_str(&wallet.public_key)
            .map_err(|e| WalletError::Other(format!("Invalid pubkey: {}", e)))?;

        super::operations::get_balance(rpc_client, &pubkey)
            .await
            .map_err(|e| WalletError::Other(e.to_string()))
    }

    /// Send SOL from a wallet to another address.
    pub async fn send_sol_from_wallet(
        &self,
        wallet_id: &str,
        to_address: &str,
        lamports: u64,
        rpc_client: &solana_client::nonblocking::rpc_client::RpcClient,
    ) -> Result<String, WalletError> {
        let mek = self.require_mek().await?;

        // Decrypt wallet keypair
        let keypair = super::decrypt::decrypt_wallet_keypair(&self.db, wallet_id, &mek).await
            .map_err(|e| WalletError::Other(e.to_string()))?;

        super::operations::send_sol(rpc_client, &keypair, to_address, lamports)
            .await
            .map_err(|e| WalletError::Other(e.to_string()))
    }

    /// Send SPL tokens from a wallet to another address.
    pub async fn send_token_from_wallet(
        &self,
        wallet_id: &str,
        to_address: &str,
        mint_address: &str,
        amount: u64,
        rpc_client: &solana_client::nonblocking::rpc_client::RpcClient,
    ) -> Result<String, WalletError> {
        let mek = self.require_mek().await?;

        // Decrypt wallet keypair
        let keypair = super::decrypt::decrypt_wallet_keypair(&self.db, wallet_id, &mek).await
            .map_err(|e| WalletError::Other(e.to_string()))?;

        super::operations::send_token(rpc_client, &keypair, to_address, mint_address, amount)
            .await
            .map_err(|e| WalletError::Other(e.to_string()))
    }

    /// Get the seed phrase (requires app to be unlocked).
    pub async fn get_seed_phrase(&self) -> Result<String, WalletError> {
        let mek = self.require_mek().await?;

        let mnemonic_hex = ConfigRepo::get(&self.db, "seed_phrase_encrypted")
            .await?
            .ok_or_else(|| WalletError::Other("No seed phrase found".to_string()))?;

        let mnemonic_bytes = hex::decode(&mnemonic_hex)
            .map_err(|e| WalletError::Other(e.to_string()))?;
        let encrypted: EncryptedPayload = serde_json::from_slice(&mnemonic_bytes)
            .map_err(|e| WalletError::Other(e.to_string()))?;

        let mnemonic = cresus_crypto::decrypt_mnemonic(&encrypted, &mek)?;
        Ok(mnemonic)
    }

    /// Restore from a seed phrase (used for account recovery).
    /// This replaces the existing encrypted seed phrase with a new one.
    pub async fn restore_from_seed_phrase(
        &self,
        mnemonic: &str,
        new_password: &str,
    ) -> Result<(), WalletError> {
        // Validate the mnemonic
        cresus_crypto::validate_mnemonic(mnemonic)?;

        // Generate new salt and MEK
        let salt = generate_salt();
        let mek = derive_master_key(new_password, &salt)?;

        // Encrypt the mnemonic with the new MEK
        let encrypted_mnemonic = cresus_crypto::encrypt_mnemonic(mnemonic, &mek)?;
        let mnemonic_hex = hex::encode(
            serde_json::to_vec(&encrypted_mnemonic)
                .map_err(|e| WalletError::Other(e.to_string()))?,
        );

        // Encrypt verification token
        let verify_token = b"CRESUS_VERIFY_OK";
        let encrypted = cresus_crypto::encrypt(verify_token, &mek)?;
        let verify_hex = hex::encode(
            serde_json::to_vec(&encrypted).map_err(|e| WalletError::Other(e.to_string()))?,
        );

        // Store new salt, verification, and seed phrase
        let salt_hex = hex::encode(salt);
        ConfigRepo::set(&self.db, "password_salt", &salt_hex).await?;
        ConfigRepo::set(&self.db, "password_verify", &verify_hex).await?;
        ConfigRepo::set(&self.db, "seed_phrase_encrypted", &mnemonic_hex).await?;

        // Unlock with the new MEK
        let mut mk = self.master_key.write().await;
        *mk = Some(mek);

        Ok(())
    }
}
