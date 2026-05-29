//! BIP39 mnemonic generation and seed derivation.

use bip39::{Mnemonic, Language};
use rand::{rngs::OsRng, RngCore};
use zeroize::Zeroize;

use crate::aes::{encrypt, decrypt, CryptoError, EncryptedPayload};
use crate::secure_mem::SecretBytes;

/// Generate a new 12-word BIP39 mnemonic phrase.
pub fn generate_mnemonic() -> Result<String, CryptoError> {
    // Generate 128 bits of entropy (12 words)
    let mut entropy = [0u8; 16];
    OsRng.fill_bytes(&mut entropy);

    let mnemonic = Mnemonic::from_entropy_in(Language::English, &entropy)
        .map_err(|e| CryptoError::Other(format!("Failed to generate mnemonic: {}", e)))?;

    Ok(mnemonic.to_string())
}

/// Validate a mnemonic phrase.
pub fn validate_mnemonic(phrase: &str) -> Result<(), CryptoError> {
    Mnemonic::parse_in(Language::English, phrase)
        .map_err(|e| CryptoError::Other(format!("Invalid mnemonic: {}", e)))?;
    Ok(())
}

/// Derive a 64-byte seed from a mnemonic phrase with optional passphrase.
pub fn mnemonic_to_seed(phrase: &str, passphrase: Option<&str>) -> Result<SecretBytes, CryptoError> {
    let mnemonic = Mnemonic::parse_in(Language::English, phrase)
        .map_err(|e| CryptoError::Other(format!("Invalid mnemonic: {}", e)))?;
    
    let seed = mnemonic.to_seed(passphrase.unwrap_or(""));
    let secret = SecretBytes::new(seed.to_vec());
    
    // Zeroize the seed
    let mut seed_mut = seed.to_vec();
    seed_mut.zeroize();
    
    Ok(secret)
}

/// Encrypt a mnemonic phrase with a master encryption key.
pub fn encrypt_mnemonic(phrase: &str, mek: &SecretBytes) -> Result<EncryptedPayload, CryptoError> {
    encrypt(phrase.as_bytes(), mek)
}

/// Decrypt a mnemonic phrase with a master encryption key.
///
/// Memory safety note: we consume `decrypted` via `into_inner()` so the
/// returned `String` reuses the SecretBytes-owned buffer without an extra
/// unzeroized `.to_vec()` copy. The returned `String` itself does NOT
/// automatically zeroize on drop — callers MUST treat the returned phrase
/// as sensitive and drop it ASAP (or wrap it in `zeroize::Zeroizing` if
/// they retain it across awaits).
pub fn decrypt_mnemonic(payload: &EncryptedPayload, mek: &SecretBytes) -> Result<String, CryptoError> {
    let decrypted = decrypt(payload, mek)?;
    String::from_utf8(decrypted.into_inner())
        .map_err(|e| CryptoError::Other(format!("Invalid UTF-8: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_mnemonic() {
        let mnemonic = generate_mnemonic().unwrap();
        let words: Vec<&str> = mnemonic.split_whitespace().collect();
        assert_eq!(words.len(), 12);
    }

    #[test]
    fn test_validate_valid_mnemonic() {
        let valid = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        assert!(validate_mnemonic(valid).is_ok());
    }

    #[test]
    fn test_validate_invalid_mnemonic() {
        let invalid = "invalid mnemonic phrase that should fail";
        assert!(validate_mnemonic(invalid).is_err());
    }

    #[test]
    fn test_mnemonic_to_seed() {
        let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let seed = mnemonic_to_seed(mnemonic, None).unwrap();
        assert_eq!(seed.as_ref().len(), 64);
    }

    #[test]
    fn test_mnemonic_with_passphrase() {
        let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let seed1 = mnemonic_to_seed(mnemonic, None).unwrap();
        let seed2 = mnemonic_to_seed(mnemonic, Some("test123")).unwrap();
        assert_ne!(seed1.as_ref(), seed2.as_ref());
    }

    #[test]
    fn test_encrypt_decrypt_mnemonic() {
        let mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let mek = SecretBytes::new(vec![0u8; 32]);
        
        let encrypted = encrypt_mnemonic(mnemonic, &mek).unwrap();
        let decrypted = decrypt_mnemonic(&encrypted, &mek).unwrap();
        
        assert_eq!(mnemonic, decrypted);
    }
}
