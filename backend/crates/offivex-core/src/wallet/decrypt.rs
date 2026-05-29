//! Shared helper for decrypting wallet keypairs from the database.

use std::sync::Arc;
use tokio_rusqlite::Connection;

use solana_sdk::signature::Keypair;
use offivex_crypto::{EncryptedPayload, SecretBytes};
use offivex_db::repo::wallet_repo::WalletRepo;

use super::encryption;
use super::zeroizing_keypair::ZeroizingKeypair;

/// Error type for wallet decryption operations.
#[derive(Debug, thiserror::Error)]
pub enum DecryptError {
    #[error("Database error: {0}")]
    Db(#[from] offivex_db::DbError),
    #[error("Crypto error: {0}")]
    Crypto(#[from] offivex_crypto::aes::CryptoError),
    #[error("Wallet not found: {0}")]
    WalletNotFound(String),
    #[error("{0}")]
    Other(String),
}

/// Decrypt a wallet's keypair from the database using the master encryption key.
///
/// Returns a [`ZeroizingKeypair`] which zeroes its in-memory bytes on Drop.
/// Callers can `&*kp` to obtain the inner `&Keypair` where signing APIs expect it.
pub async fn decrypt_wallet_keypair(
    db: &Arc<Connection>,
    wallet_id: &str,
    mek: &SecretBytes,
) -> Result<ZeroizingKeypair, DecryptError> {
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
    let kp = Keypair::from_bytes(secret.as_ref())
        .map_err(|e| DecryptError::Other(format!("Invalid keypair: {}", e)))?;
    Ok(ZeroizingKeypair::new(kp))
}
