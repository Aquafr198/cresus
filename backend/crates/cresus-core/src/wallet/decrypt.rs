//! Shared helper for decrypting wallet keypairs from the database.

use std::sync::Arc;
use tokio_rusqlite::Connection;

use solana_sdk::signature::Keypair;
use cresus_crypto::{EncryptedPayload, SecretBytes};
use cresus_db::repo::wallet_repo::WalletRepo;

use super::encryption;

/// Error type for wallet decryption operations.
#[derive(Debug, thiserror::Error)]
pub enum DecryptError {
    #[error("Database error: {0}")]
    Db(#[from] cresus_db::DbError),
    #[error("Crypto error: {0}")]
    Crypto(#[from] cresus_crypto::aes::CryptoError),
    #[error("Wallet not found: {0}")]
    WalletNotFound(String),
    #[error("{0}")]
    Other(String),
}

/// Decrypt a wallet's keypair from the database using the master encryption key.
pub async fn decrypt_wallet_keypair(
    db: &Arc<Connection>,
    wallet_id: &str,
    mek: &SecretBytes,
) -> Result<Keypair, DecryptError> {
    let wallet = WalletRepo::get_by_id(db, wallet_id.to_string())
        .await?
        .ok_or_else(|| DecryptError::WalletNotFound(wallet_id.to_string()))?;

    let nonce: [u8; 12] = wallet
        .nonce
        .clone()
        .try_into()
        .map_err(|_| DecryptError::Other("Invalid nonce length".into()))?;
    let payload = EncryptedPayload {
        ciphertext: wallet.encrypted_secret.clone(),
        nonce,
    };
    let secret = encryption::decrypt_secret_key(&payload, mek)?;
    Keypair::from_bytes(secret.as_ref())
        .map_err(|e| DecryptError::Other(format!("Invalid keypair: {}", e)))
}
