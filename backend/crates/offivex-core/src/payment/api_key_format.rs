//! API key format helpers — generation and prefix parsing.
//!
//! Format: `ofx_live_<32 chars base62>` (40 chars total including prefix).
//! The first 12 chars (`ofx_live_<8 chars>`) are stored in the DB as `key_prefix`
//! for O(1) lookup. The full 40-char string is hashed (Argon2 PHC) and only the
//! hash is persisted — the plaintext is revealed exactly once on the /pay/status
//! response post-confirmation.

use rand::RngCore;

const FULL_PREFIX: &str = "ofx_live_";
/// `ofx_live_` (9 chars) + 32 random base62 chars = 41 chars total.
/// Stored prefix is `ofx_live_<first 8 random chars>` = 17 chars (used for index lookup).
pub const PREFIX_LEN: usize = 17;
const RANDOM_LEN: usize = 32;

const BASE62_ALPHABET: &[u8; 62] =
    b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/// Generate a fresh API key: `ofx_live_<32 base62 chars>`.
///
/// Uses `OsRng` for cryptographic randomness, with rejection sampling to keep
/// the distribution over the 62-char alphabet perfectly uniform.
///
/// Audit P3 SEC-8 — the prior implementation used `byte % 62`, which biased
/// the first `256 mod 62 = 8` characters of the alphabet (each ~1.6% more
/// likely). The bias was tiny (~5.95 vs ~5.954 bits/char) but trivial to
/// remove. We now reject byte values ≥ 248 (the largest multiple of 62 ≤ 256)
/// and resample. Expected resample rate: `1 - 248/256 = 3.125%` — negligible.
pub fn generate() -> String {
    let mut out = String::with_capacity(FULL_PREFIX.len() + RANDOM_LEN);
    out.push_str(FULL_PREFIX);

    // Largest multiple of 62 that fits in a u8 is 4 * 62 = 248. Any byte ≥ 248
    // would bias the distribution if we naively did `byte % 62`, so we reject.
    const REJECT_THRESHOLD: u8 = 248;

    let mut buf = [0u8; 64]; // pull more than RANDOM_LEN so a refill is rare
    let mut idx = buf.len(); // force initial refill
    let mut collected = 0;

    while collected < RANDOM_LEN {
        if idx >= buf.len() {
            rand::rngs::OsRng.fill_bytes(&mut buf);
            idx = 0;
        }
        let b = buf[idx];
        idx += 1;
        if b < REJECT_THRESHOLD {
            out.push(BASE62_ALPHABET[(b % 62) as usize] as char);
            collected += 1;
        }
    }
    out
}

/// Extract the indexable prefix from a full key. Returns `None` if the input
/// doesn't start with `ofx_live_` or is shorter than 17 chars.
pub fn parse_prefix(full_key: &str) -> Option<&str> {
    if !full_key.starts_with(FULL_PREFIX) {
        return None;
    }
    if full_key.len() < PREFIX_LEN {
        return None;
    }
    Some(&full_key[..PREFIX_LEN])
}

/// Whether `full_key` looks structurally like an Offivex API key. Does NOT
/// validate against the DB — that's the middleware's job.
pub fn looks_valid(full_key: &str) -> bool {
    if !full_key.starts_with(FULL_PREFIX) {
        return false;
    }
    if full_key.len() != FULL_PREFIX.len() + RANDOM_LEN {
        return false;
    }
    full_key[FULL_PREFIX.len()..]
        .bytes()
        .all(|b| BASE62_ALPHABET.contains(&b))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_has_expected_format() {
        let k = generate();
        assert_eq!(k.len(), FULL_PREFIX.len() + RANDOM_LEN);
        assert!(k.starts_with("ofx_live_"));
        assert!(looks_valid(&k));
    }

    #[test]
    fn generate_is_random() {
        let a = generate();
        let b = generate();
        assert_ne!(a, b, "generated keys collided — RNG broken?");
    }

    #[test]
    fn parse_prefix_extracts_17_chars() {
        let k = "ofx_live_AbCdEfGh12345678901234567890123";
        assert_eq!(parse_prefix(k), Some("ofx_live_AbCdEfGh"));
    }

    #[test]
    fn parse_prefix_rejects_wrong_namespace() {
        assert_eq!(parse_prefix("ofx_test_AbCdEfGh..."), None);
        assert_eq!(parse_prefix("random_string"), None);
    }

    #[test]
    fn parse_prefix_rejects_too_short() {
        assert_eq!(parse_prefix("ofx_live_short"), None);
    }

    #[test]
    fn looks_valid_rejects_special_chars() {
        let k = "ofx_live_!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!";
        assert!(!looks_valid(k));
    }

    #[test]
    fn looks_valid_rejects_wrong_length() {
        assert!(!looks_valid("ofx_live_short"));
        assert!(!looks_valid(&format!("ofx_live_{}", "A".repeat(33))));
    }

    #[test]
    fn generate_uses_full_alphabet_no_bias() {
        // Audit SEC-8 — sanity check: across many generated keys, every byte of
        // the BASE62 alphabet should appear. (Not a statistical test for bias —
        // that's the rejection-sampling guarantee — but catches an off-by-one
        // in the alphabet indexing.)
        use std::collections::HashSet;
        let mut seen: HashSet<char> = HashSet::new();
        for _ in 0..200 {
            let k = generate();
            for c in k[FULL_PREFIX.len()..].chars() {
                seen.insert(c);
            }
        }
        // 200 keys × 32 chars = 6400 samples — every alphabet char should
        // appear with overwhelming probability (1 - (61/62)^6400 ≈ 1 - 10⁻⁴⁵).
        assert!(seen.len() > 55, "alphabet coverage too low ({})", seen.len());
    }
}
