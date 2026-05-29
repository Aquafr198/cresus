use solana_sdk::signer::keypair::Keypair;

/// Generate N sub-wallets (fresh random keypairs).
///
/// In future, this could use deterministic derivation from a seed,
/// but for the MVP we generate independent random keypairs.
pub fn generate_subwallets(count: usize) -> Vec<Keypair> {
    (0..count).map(|_| Keypair::new()).collect()
}
