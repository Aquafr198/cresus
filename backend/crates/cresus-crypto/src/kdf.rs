use argon2::{Argon2, Algorithm, Params, Version};
use rand::RngCore;
use zeroize::Zeroize;

use crate::aes::CryptoError;
use crate::secure_mem::SecretBytes;

/// Derive a 32-byte Master Encryption Key from a user password using Argon2id.
///
/// This is deliberately slow (~200ms) to resist brute-force attacks.
pub fn derive_master_key(password: &str, salt: &[u8]) -> Result<SecretBytes, CryptoError> {
    let params = Params::new(
        65536,  // 64 MiB memory cost
        3,      // 3 iterations
        1,      // 1 degree of parallelism
        Some(32),
    )
    .map_err(|_| CryptoError::EncryptionFailed)?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut output = [0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut output)
        .map_err(|_| CryptoError::EncryptionFailed)?;

    let result = SecretBytes::new(output.to_vec());
    output.zeroize();
    Ok(result)
}

/// Generate a random 16-byte salt for Argon2id.
pub fn generate_salt() -> [u8; 16] {
    let mut salt = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    salt
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_produces_32_bytes() {
        let key = derive_master_key("my-password", b"test-salt-16byte").unwrap();
        assert_eq!(key.as_ref().len(), 32);
    }

    #[test]
    fn same_input_same_output() {
        let k1 = derive_master_key("password", b"salt-1234567890!").unwrap();
        let k2 = derive_master_key("password", b"salt-1234567890!").unwrap();
        assert_eq!(k1.as_ref(), k2.as_ref());
    }

    #[test]
    fn different_password_different_output() {
        let k1 = derive_master_key("password-a", b"salt-1234567890!").unwrap();
        let k2 = derive_master_key("password-b", b"salt-1234567890!").unwrap();
        assert_ne!(k1.as_ref(), k2.as_ref());
    }
}
