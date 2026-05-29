//! Encryption-at-rest for `payments.reveal_key` (SEC-3, audit P1).
//!
//! Before SEC-3, the freshly-generated user API key was stored as plaintext in
//! `payments.reveal_key` for up to 24h until the user fetched it or the GC
//! reaped the row. A DB backup / replication compromise during that window
//! exposed every newly-issued key.
//!
//! After SEC-3, the plaintext is wrapped with AES-256-GCM under a key derived
//! from the treasury seed (already loaded fail-fast at boot). The seed is
//! independent of the admin MEK lock state, so a paying user can always fetch
//! their key even if the admin has locked the wallet MEK.
//!
//! Storage format in the TEXT column: `base64(nonce[12] || ciphertext)`.
//!
//! Threat model:
//!   - DB backup compromise → attacker holds ciphertext only; needs the
//!     treasury seed (env var, never persisted with the DB) to decrypt.
//!   - Treasury seed compromise → catastrophic for funds anyway; reveal keys
//!     are the least of the concerns. Not a new attack surface.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use thiserror::Error;

use offivex_crypto::{aes, EncryptedPayload, SecretBytes};

#[derive(Debug, Error)]
pub enum RevealCryptoError {
    #[error("crypto error: {0}")]
    Crypto(#[from] offivex_crypto::aes::CryptoError),
    #[error("invalid stored payload (not base64 or too short)")]
    InvalidPayload,
    #[error("decrypted plaintext is not valid UTF-8")]
    NotUtf8,
}

/// Derive a 32-byte AES key from the treasury seed.
/// Uses HMAC-SHA256 with a domain-separation label so this key is distinct
/// from any other use of the treasury seed (e.g., HD derivation in
/// `payment::derivation`).
fn derive_aes_key(treasury_seed: &SecretBytes) -> SecretBytes {
    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(b"offivex-reveal-key-v1")
        .expect("HMAC accepts any key length");
    mac.update(treasury_seed.as_ref());
    let result = mac.finalize().into_bytes();
    SecretBytes::new(result.to_vec())
}

/// Encrypt a plaintext API key with the treasury-derived AES key.
/// Returns the base64-encoded `nonce[12] || ciphertext` blob suitable for
/// storage in the `payments.reveal_key` TEXT column.
pub fn encrypt_reveal(
    plaintext_api_key: &str,
    treasury_seed: &SecretBytes,
) -> Result<String, RevealCryptoError> {
    let key = derive_aes_key(treasury_seed);
    let payload = aes::encrypt(plaintext_api_key.as_bytes(), &key)?;
    let mut blob = Vec::with_capacity(12 + payload.ciphertext.len());
    blob.extend_from_slice(&payload.nonce);
    blob.extend_from_slice(&payload.ciphertext);
    Ok(B64.encode(blob))
}

/// Decrypt a base64 blob previously produced by [`encrypt_reveal`].
pub fn decrypt_reveal(
    b64: &str,
    treasury_seed: &SecretBytes,
) -> Result<String, RevealCryptoError> {
    let blob = B64.decode(b64).map_err(|_| RevealCryptoError::InvalidPayload)?;
    if blob.len() < 12 {
        return Err(RevealCryptoError::InvalidPayload);
    }
    let mut nonce = [0u8; 12];
    nonce.copy_from_slice(&blob[..12]);
    let payload = EncryptedPayload {
        nonce,
        ciphertext: blob[12..].to_vec(),
    };
    let key = derive_aes_key(treasury_seed);
    let plaintext = aes::decrypt(&payload, &key)?;
    let s = std::str::from_utf8(plaintext.as_ref())
        .map_err(|_| RevealCryptoError::NotUtf8)?
        .to_string();
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed() -> SecretBytes {
        SecretBytes::new(vec![0x42u8; 64])
    }

    #[test]
    fn roundtrip_plain_key() {
        let plaintext = "ofx_live_AbCdEfGh1234567890XyZaBcDeFgHiJkLm";
        let ct = encrypt_reveal(plaintext, &seed()).unwrap();
        let pt = decrypt_reveal(&ct, &seed()).unwrap();
        assert_eq!(pt, plaintext);
    }

    #[test]
    fn different_seeds_fail_decrypt() {
        let plaintext = "ofx_live_abc";
        let ct = encrypt_reveal(plaintext, &seed()).unwrap();
        let wrong_seed = SecretBytes::new(vec![0x00u8; 64]);
        assert!(decrypt_reveal(&ct, &wrong_seed).is_err());
    }

    #[test]
    fn ciphertext_different_on_each_call() {
        // Random nonce ⇒ ciphertext differs even for the same plaintext+key
        let plaintext = "ofx_live_abc";
        let ct1 = encrypt_reveal(plaintext, &seed()).unwrap();
        let ct2 = encrypt_reveal(plaintext, &seed()).unwrap();
        assert_ne!(ct1, ct2);
        // But both decrypt to the same thing
        assert_eq!(decrypt_reveal(&ct1, &seed()).unwrap(), plaintext);
        assert_eq!(decrypt_reveal(&ct2, &seed()).unwrap(), plaintext);
    }

    #[test]
    fn rejects_truncated_blob() {
        assert!(decrypt_reveal("AAAA", &seed()).is_err());
    }
}
