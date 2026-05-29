// Minimal Solana address validation for frontend pre-flight checks (UX-3).
//
// A Solana address is a base58-encoded 32-byte ed25519 public key, typically
// 32-44 characters. This module provides a strict format + base58 decode +
// length check WITHOUT pulling in @solana/web3.js (which adds ~100KB to the
// bundle). The server still runs the authoritative `Pubkey::from_str` check.

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (let i = 0; i < BASE58_ALPHABET.length; i++) {
    m[BASE58_ALPHABET[i]] = i;
  }
  return m;
})();

/// Base58-decode a string into a Uint8Array. Returns null if the input
/// contains a non-base58 character.
export function base58Decode(s: string): Uint8Array | null {
  if (s.length === 0) return new Uint8Array();

  // Count leading '1's → leading zero bytes
  let zeros = 0;
  while (zeros < s.length && s[zeros] === "1") zeros++;

  // Decode the rest as a big-endian base58 number
  const bytes: number[] = [];
  for (let i = zeros; i < s.length; i++) {
    const c = s[i];
    const digit = BASE58_MAP[c];
    if (digit === undefined) return null;
    let carry = digit;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // bytes is little-endian; flip + prepend leading zero bytes
  const result = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[zeros + bytes.length - 1 - i] = bytes[i];
  }
  return result;
}

/// Returns true if `s` is a syntactically valid Solana address: base58, decodes
/// to exactly 32 bytes. Does NOT verify the bytes form a valid ed25519 point
/// (the server does that — typo detection is the goal here).
export function isValidSolanaAddress(s: string): boolean {
  if (typeof s !== "string") return false;
  const trimmed = s.trim();
  if (trimmed.length < 32 || trimmed.length > 44) return false;
  const decoded = base58Decode(trimmed);
  return decoded !== null && decoded.length === 32;
}
