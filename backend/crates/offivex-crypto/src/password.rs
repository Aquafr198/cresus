//! Argon2id-PHC password hashing for admin & user secrets.
//!
//! Separate from `kdf::derive_master_key` which is a raw-byte KDF for the wallet MEK.
//! Here we use the standard PHC string format (`$argon2id$v=19$m=...,t=...,p=...$salt$hash`)
//! so we can store one column in the DB and verify without re-deriving parameters.

use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
    Algorithm, Argon2, Params, Version,
};

use crate::aes::CryptoError;

/// Hash a password into a PHC string (`$argon2id$...`) using Argon2id.
/// Same cost profile as the wallet KDF (64 MiB, t=3, p=1) — deliberately slow.
pub fn hash_password_phc(password: &str) -> Result<String, CryptoError> {
    let salt = SaltString::generate(&mut OsRng);
    let params = Params::new(65536, 3, 1, Some(32))
        .map_err(|e| CryptoError::Other(format!("argon2 params: {e}")))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| CryptoError::Other(format!("argon2 hash: {e}")))
}

/// Verify a password against a stored PHC string. Returns Ok(true) on match,
/// Ok(false) on mismatch, Err on malformed hash.
pub fn verify_password_phc(password: &str, phc: &str) -> Result<bool, CryptoError> {
    let parsed = PasswordHash::new(phc)
        .map_err(|e| CryptoError::Other(format!("argon2 parse phc: {e}")))?;
    match Argon2::default().verify_password(password.as_bytes(), &parsed) {
        Ok(()) => Ok(true),
        Err(argon2::password_hash::Error::Password) => Ok(false),
        Err(e) => Err(CryptoError::Other(format!("argon2 verify: {e}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_roundtrip_ok() {
        let phc = hash_password_phc("correct horse battery staple").unwrap();
        assert!(phc.starts_with("$argon2id$"));
        assert!(verify_password_phc("correct horse battery staple", &phc).unwrap());
    }

    #[test]
    fn verify_rejects_wrong_password() {
        let phc = hash_password_phc("secret-12345").unwrap();
        assert!(!verify_password_phc("secret-12346", &phc).unwrap());
    }

    #[test]
    fn malformed_phc_errors() {
        let r = verify_password_phc("anything", "not-a-phc-string");
        assert!(r.is_err());
    }
}
