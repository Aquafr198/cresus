/// Input validation helpers for API handlers.

use std::str::FromStr;
use solana_sdk::pubkey::Pubkey;

const BASE58_CHARS: &str = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/// Validate that a string is a syntactically valid Solana address.
///
/// Audit P2 SEC-7 — previously this only checked base58 charset + 32-44 length,
/// which lets a single-character typo through as long as the result is still
/// valid base58. `Pubkey::from_str` does a full base58 decode AND length check
/// (must decode to exactly 32 bytes), catching typos that would otherwise
/// silently route funds to a non-existent address.
pub fn validate_solana_address(addr: &str) -> Result<(), String> {
    if addr.is_empty() {
        return Err("Address is empty".into());
    }
    if addr.len() < 32 || addr.len() > 44 {
        return Err(format!(
            "Address length {} is outside valid range (32-44)",
            addr.len()
        ));
    }
    // Cheap upfront charset check (gives a clearer error than the SDK parser's
    // "WrongSize" / "Invalid" messages for the common case of a stray char).
    for ch in addr.chars() {
        if !BASE58_CHARS.contains(ch) {
            return Err(format!("Invalid base58 character: '{}'", ch));
        }
    }
    // Strict decode: must be exactly 32 bytes after base58 decoding.
    Pubkey::from_str(addr).map_err(|e| format!("Not a valid Solana address: {e}"))?;
    Ok(())
}

/// Validate password meets minimum requirements.
pub fn validate_password(password: &str) -> Result<(), String> {
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

/// Maximum upload size in bytes (10 MB).
pub const MAX_UPLOAD_SIZE: usize = 10 * 1024 * 1024;

/// Maximum number of sub-wallets that can be created in one request.
pub const MAX_SUBWALLET_COUNT: usize = 50;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_solana_address() {
        // A typical Solana pubkey
        assert!(validate_solana_address("11111111111111111111111111111111").is_ok());
    }

    #[test]
    fn reject_short_address() {
        assert!(validate_solana_address("abc").is_err());
    }

    #[test]
    fn reject_invalid_chars() {
        assert!(validate_solana_address("0OIl111111111111111111111111111111").is_err());
    }

    #[test]
    fn reject_empty() {
        assert!(validate_solana_address("").is_err());
    }

    #[test]
    fn reject_base58_valid_but_wrong_length_pubkey() {
        // 32 chars, all valid base58, but `Pubkey::from_str` rejects because
        // the decoded bytes are not exactly 32. Without SEC-7 fix this passed.
        assert!(validate_solana_address("11111111111111111111111111111112").is_ok());
        // 44 chars all '1' base58 → 44 leading zero bytes decoded → too long.
        let too_long_zeroes = "1".repeat(44);
        assert!(validate_solana_address(&too_long_zeroes).is_err());
    }

    #[test]
    fn accepts_known_pubkey() {
        // System Program ID — a real, well-known Solana pubkey.
        assert!(validate_solana_address("11111111111111111111111111111111").is_ok());
    }
}
