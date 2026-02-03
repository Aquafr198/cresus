/// Input validation helpers for API handlers.

const BASE58_CHARS: &str = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/// Validate that a string looks like a valid Solana address (32–44 base58 chars).
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
    for ch in addr.chars() {
        if !BASE58_CHARS.contains(ch) {
            return Err(format!("Invalid base58 character: '{}'", ch));
        }
    }
    Ok(())
}

/// Validate password meets minimum requirements.
pub fn validate_password(password: &str) -> Result<(), String> {
    if password.len() < 8 {
        return Err("Password must be at least 8 characters".into());
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
}
