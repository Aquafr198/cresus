use offivex_crypto::{encrypt, decrypt, EncryptedPayload, SecretBytes};

/// Encrypt a wallet's secret key bytes using the Master Encryption Key.
pub fn encrypt_secret_key(
    secret_bytes: &[u8],
    master_key: &SecretBytes,
) -> Result<EncryptedPayload, offivex_crypto::aes::CryptoError> {
    encrypt(secret_bytes, master_key)
}

/// Decrypt a wallet's secret key bytes using the Master Encryption Key.
/// Returns `SecretBytes` — automatically zeroized on drop.
pub fn decrypt_secret_key(
    payload: &EncryptedPayload,
    master_key: &SecretBytes,
) -> Result<SecretBytes, offivex_crypto::aes::CryptoError> {
    decrypt(payload, master_key)
}
