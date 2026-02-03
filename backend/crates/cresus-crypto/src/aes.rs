use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};

use crate::secure_mem::SecretBytes;

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("Encryption failed")]
    EncryptionFailed,
    #[error("Decryption failed — wrong password or corrupted data")]
    DecryptionFailed,
    #[error("Invalid key length: expected 32 bytes")]
    InvalidKeyLength,
}

/// Encrypted data with its nonce, suitable for storage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedPayload {
    /// AES-256-GCM ciphertext
    pub ciphertext: Vec<u8>,
    /// 12-byte GCM nonce (unique per encryption)
    pub nonce: [u8; 12],
}

/// Encrypt plaintext bytes using AES-256-GCM with the given 32-byte key.
///
/// Generates a random 12-byte nonce for each call.
pub fn encrypt(plaintext: &[u8], key: &SecretBytes) -> Result<EncryptedPayload, CryptoError> {
    if key.as_ref().len() != 32 {
        return Err(CryptoError::InvalidKeyLength);
    }

    let cipher = Aes256Gcm::new_from_slice(key.as_ref())
        .map_err(|_| CryptoError::EncryptionFailed)?;

    let mut nonce_bytes = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| CryptoError::EncryptionFailed)?;

    Ok(EncryptedPayload {
        ciphertext,
        nonce: nonce_bytes,
    })
}

/// Decrypt an `EncryptedPayload` using AES-256-GCM with the given 32-byte key.
/// Returns `SecretBytes` so decrypted material is automatically zeroized on drop.
pub fn decrypt(payload: &EncryptedPayload, key: &SecretBytes) -> Result<SecretBytes, CryptoError> {
    if key.as_ref().len() != 32 {
        return Err(CryptoError::InvalidKeyLength);
    }

    let cipher = Aes256Gcm::new_from_slice(key.as_ref())
        .map_err(|_| CryptoError::DecryptionFailed)?;

    let nonce = Nonce::from_slice(&payload.nonce);

    cipher
        .decrypt(nonce, payload.ciphertext.as_slice())
        .map(SecretBytes::new)
        .map_err(|_| CryptoError::DecryptionFailed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kdf::derive_master_key;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key = derive_master_key("test-password", b"random-salt-1234").unwrap();
        let plaintext = b"solana-secret-key-bytes-here-64b";

        let encrypted = encrypt(plaintext, &key).unwrap();
        assert_ne!(encrypted.ciphertext, plaintext);

        let decrypted = decrypt(&encrypted, &key).unwrap();
        assert_eq!(decrypted.as_ref(), plaintext);
    }

    #[test]
    fn wrong_key_fails() {
        let key1 = derive_master_key("password-1", b"random-salt-1234").unwrap();
        let key2 = derive_master_key("password-2", b"random-salt-1234").unwrap();
        let plaintext = b"secret-data";

        let encrypted = encrypt(plaintext, &key1).unwrap();
        let result = decrypt(&encrypted, &key2);
        assert!(result.is_err());
    }
}
