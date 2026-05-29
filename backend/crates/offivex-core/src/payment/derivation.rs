//! SLIP-0010 ed25519 HD key derivation for Solana invoice addresses.
//!
//! Path used: `m / 44' / 501' / {derivation_index}' / 0'` (Solana standard,
//! all hardened — required by SLIP-0010 ed25519).
//!
//! `derivation_index = 0` is **reserved for the treasury** (sweep destination).
//! Invoice addresses start at `derivation_index = 1`.
//!
//! The implementation is intentionally minimal (~50 LoC) and depends only on
//! `hmac` + `sha2` (both already in workspace deps). No external HD crate.
//!
//! Spec reference: https://github.com/satoshilabs/slips/blob/master/slip-0010.md
//! Solana SLIP-0044 coin type: 501.

use hmac::{Hmac, Mac};
use sha2::Sha512;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::{Signer, SeedDerivable};
use zeroize::Zeroize;

type HmacSha512 = Hmac<Sha512>;

#[derive(Debug, thiserror::Error)]
pub enum DerivationError {
    #[error("SLIP-0010 HMAC failure")]
    HmacFailure,
    #[error("derivation_index 0 is reserved for the treasury")]
    ReservedIndex,
    #[error("invalid keypair bytes")]
    InvalidKeypair,
}

const SOLANA_PURPOSE: u32 = 44;
const SOLANA_COIN_TYPE: u32 = 501;
const HARDENED_OFFSET: u32 = 0x8000_0000;

/// SLIP-0010 master key derivation from a seed (BIP39 64-byte seed typically).
/// Returns (private_key_32, chain_code_32).
fn master_key_from_seed(seed: &[u8]) -> Result<([u8; 32], [u8; 32]), DerivationError> {
    let mut mac =
        HmacSha512::new_from_slice(b"ed25519 seed").map_err(|_| DerivationError::HmacFailure)?;
    mac.update(seed);
    let result = mac.finalize().into_bytes();
    let mut priv_key = [0u8; 32];
    let mut chain_code = [0u8; 32];
    priv_key.copy_from_slice(&result[0..32]);
    chain_code.copy_from_slice(&result[32..64]);
    Ok((priv_key, chain_code))
}

/// SLIP-0010 hardened child derivation. Only hardened paths are valid for ed25519.
/// `index` is the path component (caller must OR with HARDENED_OFFSET).
fn derive_hardened_child(
    parent_priv: &[u8; 32],
    parent_chain: &[u8; 32],
    index: u32,
) -> Result<([u8; 32], [u8; 32]), DerivationError> {
    let mut mac =
        HmacSha512::new_from_slice(parent_chain).map_err(|_| DerivationError::HmacFailure)?;
    mac.update(&[0u8]); // SLIP-0010 ed25519: 0x00 prefix for hardened
    mac.update(parent_priv);
    mac.update(&index.to_be_bytes());
    let result = mac.finalize().into_bytes();
    let mut child_priv = [0u8; 32];
    let mut child_chain = [0u8; 32];
    child_priv.copy_from_slice(&result[0..32]);
    child_chain.copy_from_slice(&result[32..64]);
    Ok((child_priv, child_chain))
}

/// Derive a Solana Keypair at the canonical Offivex path:
/// `m / 44' / 501' / {derivation_index}' / 0'`.
///
/// `derivation_index` 0 is **reserved for the treasury** — use [`derive_treasury_keypair`]
/// or [`derive_treasury_pubkey`] for that case. Use 1+ for invoice addresses.
pub fn derive_solana_keypair(
    seed: &[u8],
    derivation_index: u32,
) -> Result<Keypair, DerivationError> {
    let (mut priv_key, mut chain_code) = master_key_from_seed(seed)?;

    // Path: 44' / 501' / index' / 0' (all hardened)
    for component in [SOLANA_PURPOSE, SOLANA_COIN_TYPE, derivation_index, 0] {
        let (new_priv, new_chain) =
            derive_hardened_child(&priv_key, &chain_code, component | HARDENED_OFFSET)?;
        priv_key.zeroize();
        chain_code.zeroize();
        priv_key = new_priv;
        chain_code = new_chain;
    }

    // Solana's Keypair = ed25519 32-byte secret + 32-byte public.
    // Keypair::from_seed expands the 32-byte secret into the full ed25519 dalek pair.
    let kp = Keypair::from_seed(&priv_key).map_err(|_| DerivationError::InvalidKeypair)?;

    // zeroize sensitive material before exit
    priv_key.zeroize();
    chain_code.zeroize();

    Ok(kp)
}

/// Treasury = derivation_index 0 (reserved). This is the cold wallet sweep destination.
pub fn derive_treasury_keypair(seed: &[u8]) -> Result<Keypair, DerivationError> {
    derive_solana_keypair_internal(seed, 0)
}

pub fn derive_treasury_pubkey(seed: &[u8]) -> Result<Pubkey, DerivationError> {
    derive_treasury_keypair(seed).map(|kp| kp.pubkey())
}

/// Invoice address derivation. Refuses index 0 (treasury).
pub fn derive_invoice_keypair(
    seed: &[u8],
    derivation_index: u32,
) -> Result<Keypair, DerivationError> {
    if derivation_index == 0 {
        return Err(DerivationError::ReservedIndex);
    }
    derive_solana_keypair_internal(seed, derivation_index)
}

pub fn derive_invoice_pubkey(
    seed: &[u8],
    derivation_index: u32,
) -> Result<Pubkey, DerivationError> {
    derive_invoice_keypair(seed, derivation_index).map(|kp| kp.pubkey())
}

/// Internal: same as `derive_solana_keypair` but skips the index=0 guard.
fn derive_solana_keypair_internal(
    seed: &[u8],
    derivation_index: u32,
) -> Result<Keypair, DerivationError> {
    derive_solana_keypair(seed, derivation_index)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bs58;

    /// BIP39 24-word test mnemonic from the trezor test set (deterministic).
    /// Seed below was computed with `mnemonic_to_seed(phrase, "")`.
    /// We use a fixed seed bytes value here so the test is hermetic (no BIP39 dep needed).
    const TEST_SEED_HEX: &str =
        "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4";

    fn test_seed() -> Vec<u8> {
        hex::decode(TEST_SEED_HEX).unwrap()
    }

    #[test]
    fn master_key_from_known_seed_matches_slip0010_vector() {
        // SLIP-0010 ed25519 Test Vector 1
        // seed = 000102030405060708090a0b0c0d0e0f
        // expected master priv = 2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7
        let seed = hex::decode("000102030405060708090a0b0c0d0e0f").unwrap();
        let (priv_key, chain_code) = master_key_from_seed(&seed).unwrap();
        assert_eq!(
            hex::encode(priv_key),
            "2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7"
        );
        assert_eq!(
            hex::encode(chain_code),
            "90046a93de5380a72b5e45010748567d5ea02bbf6522f979e05c0d8d8ca9fffb"
        );
    }

    #[test]
    fn derivation_is_deterministic() {
        let seed = test_seed();
        let kp1 = derive_invoice_keypair(&seed, 1).unwrap();
        let kp2 = derive_invoice_keypair(&seed, 1).unwrap();
        assert_eq!(kp1.pubkey(), kp2.pubkey());
    }

    #[test]
    fn different_indices_yield_different_addresses() {
        let seed = test_seed();
        let kp1 = derive_invoice_keypair(&seed, 1).unwrap();
        let kp2 = derive_invoice_keypair(&seed, 2).unwrap();
        let kp3 = derive_invoice_keypair(&seed, 3).unwrap();
        assert_ne!(kp1.pubkey(), kp2.pubkey());
        assert_ne!(kp2.pubkey(), kp3.pubkey());
        assert_ne!(kp1.pubkey(), kp3.pubkey());
    }

    #[test]
    fn treasury_and_invoice_addresses_are_distinct() {
        let seed = test_seed();
        let treasury = derive_treasury_pubkey(&seed).unwrap();
        let invoice_1 = derive_invoice_pubkey(&seed, 1).unwrap();
        assert_ne!(treasury, invoice_1);
    }

    #[test]
    fn invoice_index_zero_is_rejected() {
        let seed = test_seed();
        match derive_invoice_keypair(&seed, 0) {
            Err(DerivationError::ReservedIndex) => (),
            other => panic!("expected ReservedIndex, got {:?}", other.err()),
        }
    }

    #[test]
    fn derived_address_is_valid_base58_solana_pubkey() {
        let seed = test_seed();
        let pubkey = derive_invoice_pubkey(&seed, 1).unwrap();
        let b58 = pubkey.to_string();
        // Solana addresses are base58 of 32 bytes → length 43 or 44 chars
        assert!((43..=44).contains(&b58.len()), "got length {}: {b58}", b58.len());
        // Round-trip
        let decoded = bs58::decode(&b58).into_vec().unwrap();
        assert_eq!(decoded.len(), 32);
    }

    #[test]
    fn different_seeds_yield_different_treasuries() {
        let seed_a = test_seed();
        let seed_b: Vec<u8> = (0u8..64).collect();
        assert_ne!(
            derive_treasury_pubkey(&seed_a).unwrap(),
            derive_treasury_pubkey(&seed_b).unwrap()
        );
    }
}
