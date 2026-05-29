// In-memory per-key cooldown tracker.
//
// Keys are typically `<command>:<userId>` or `<feature>:<userId>:<resourceId>`.
// The shape is intentionally minimal — we don't need percent-accurate rate
// limiting, just "is this user in cooldown right now?" so the abuse vector
// (spam-click giveaway button, /suggest flood, /ping flood) is closed.
//
// Memory bound: `MAX_ENTRIES`. When the map grows past that, we sweep
// expired entries opportunistically — costs O(N) once when crossing the
// threshold, but keeps the steady-state memory under control without a
// background timer thread.

const cooldowns = new Map();
const MAX_ENTRIES = 10_000;

/**
 * Check + arm a cooldown atomically.
 *
 * @param {string} key   Identity of the action being throttled.
 * @param {number} ttlMs How long until the same key can be used again.
 * @returns {{ onCooldown: boolean, retryInMs: number }}
 *          `onCooldown=true` → caller should reject (user already in cooldown).
 *          `onCooldown=false` → the cooldown is now armed for `ttlMs` ahead.
 */
function check(key, ttlMs) {
  const now = Date.now();
  const expiresAt = cooldowns.get(key);
  if (expiresAt && expiresAt > now) {
    return { onCooldown: true, retryInMs: expiresAt - now };
  }
  cooldowns.set(key, now + ttlMs);

  // Opportunistic prune so the map never grows forever even if expirations
  // are never read again (e.g., a user runs /ping once and never returns).
  if (cooldowns.size > MAX_ENTRIES) {
    for (const [k, v] of cooldowns.entries()) {
      if (v <= now) cooldowns.delete(k);
    }
  }

  return { onCooldown: false, retryInMs: 0 };
}

module.exports = { check };
