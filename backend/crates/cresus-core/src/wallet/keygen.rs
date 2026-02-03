use solana_sdk::signer::keypair::Keypair;
use solana_sdk::signer::Signer;
use zeroize::Zeroizing;

/// Generate a new random Ed25519 keypair.
pub fn generate_keypair() -> Keypair {
    Keypair::new()
}

/// Get the base58-encoded public key from a keypair.
pub fn pubkey_base58(keypair: &Keypair) -> String {
    keypair.pubkey().to_string()
}

/// Get the raw 64-byte secret key from a keypair.
/// Wrapped in `Zeroizing` to ensure automatic cleanup on drop.
pub fn secret_bytes(keypair: &Keypair) -> Zeroizing<Vec<u8>> {
    Zeroizing::new(keypair.to_bytes().to_vec())
}

/// Reconstruct a keypair from raw 64-byte secret key.
pub fn keypair_from_bytes(bytes: &[u8]) -> Result<Keypair, String> {
    Keypair::from_bytes(bytes).map_err(|e| format!("Invalid keypair bytes: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_and_reconstruct() {
        let kp = generate_keypair();
        let bytes = secret_bytes(&kp);
        let kp2 = keypair_from_bytes(&bytes).unwrap();
        assert_eq!(kp.pubkey(), kp2.pubkey());
    }
}
