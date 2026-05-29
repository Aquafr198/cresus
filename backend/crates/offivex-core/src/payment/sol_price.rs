//! SOL/USD price oracle for invoice creation.
//!
//! Primary source: **CoinGecko** (`/api/v3/simple/price`). Free, no API key,
//! deterministic shape, ~30 req/min rate limit — covered by our 60s cache.
//!
//! The price is **locked at invoice creation time** in `payments.sol_usd_rate_cents`.
//! The watcher NEVER re-fetches the rate when confirming — the user always pays
//! the lamport amount that was set at invoice creation.
//!
//! NOTE: we deliberately do NOT route through `crate::trading::price_feed` here.
//! That module uses the deprecated Jupiter v4 endpoint and is kept for backward
//! compatibility with trading bots only. Payments need their own resilient path.

use std::sync::OnceLock;
use std::time::Duration;

use moka::future::Cache;
use serde::Deserialize;

/// Wrapped SOL (WSOL) mint — kept as a public constant for callers that want
/// to use it with other oracles (e.g. trading bots).
pub const WSOL_MINT: &str = "So11111111111111111111111111111111111111112";

/// Cache TTL — short enough that the price stays fresh, long enough to absorb
/// bursts of invoice creation and stay well under CoinGecko's free rate limit.
const CACHE_TTL_SECS: u64 = 60;

/// CoinGecko free-tier endpoint (no API key required).
const COINGECKO_URL: &str =
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";

#[derive(Debug, thiserror::Error)]
pub enum SolPriceError {
    #[error("HTTP request failed: {0}")]
    Http(String),
    #[error("price oracle returned non-success status: {0}")]
    BadStatus(u16),
    #[error("price oracle response could not be parsed: {0}")]
    Parse(String),
    #[error("price oracle response missing sol price")]
    MissingPrice,
    #[error("price oracle returned non-positive price: {0}")]
    InvalidPrice(f64),
}

/// Single shared cache. Key = "sol_usd". Value = (price_f64, fetched_at_unix_secs).
fn cache() -> &'static Cache<&'static str, (f64, u64)> {
    static CACHE: OnceLock<Cache<&'static str, (f64, u64)>> = OnceLock::new();
    CACHE.get_or_init(|| {
        Cache::builder()
            .max_capacity(8)
            .time_to_live(Duration::from_secs(CACHE_TTL_SECS))
            .build()
    })
}

/// Long-lived "last good price" store. Separate from the 60s `cache` above
/// so a CoinGecko outage can fall back to a stale but realistic price
/// instead of failing every invoice. Wiped only on process restart.
fn stale_fallback() -> &'static std::sync::RwLock<Option<(f64, u64)>> {
    static FALLBACK: OnceLock<std::sync::RwLock<Option<(f64, u64)>>> = OnceLock::new();
    FALLBACK.get_or_init(|| std::sync::RwLock::new(None))
}

/// Admin override — if `OFFIVEX_FALLBACK_SOL_USD` is set in the env, that
/// price is used when CoinGecko is unreachable AND no stale value has
/// ever been cached. Lets ops keep invoices flowing during a long outage
/// without scrambling for a workaround.
fn admin_fallback() -> Option<f64> {
    std::env::var("OFFIVEX_FALLBACK_SOL_USD")
        .ok()
        .and_then(|s| s.parse::<f64>().ok())
        .filter(|p| p.is_finite() && *p > 0.0)
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

#[derive(Debug, Deserialize)]
struct CoinGeckoResp {
    solana: CoinGeckoSolana,
}

#[derive(Debug, Deserialize)]
struct CoinGeckoSolana {
    usd: f64,
}

/// Fetch the current SOL → USD price. Uses the cache when fresh, otherwise
/// hits CoinGecko's free public endpoint and stores the result.
///
/// **Resilience** — if CoinGecko fails (HTTP / parse / non-positive value)
/// the function falls back, in this order:
///   1. the last successful price ever fetched in this process (a stale
///      value is better than failing every invoice)
///   2. an admin-supplied `OFFIVEX_FALLBACK_SOL_USD` env value
///   3. error — only if neither of the above is set
///
/// Each fallback path logs a `warn!` so the operator notices.
pub async fn fetch_sol_usd_price() -> Result<f64, SolPriceError> {
    if let Some((price, _)) = cache().get("sol_usd").await {
        return Ok(price);
    }

    let resp_result = crate::http::shared()
        .get(COINGECKO_URL)
        .send()
        .await
        .map_err(|e| SolPriceError::Http(e.to_string()));

    let price_result: Result<f64, SolPriceError> = async {
        let resp = resp_result?;
        if !resp.status().is_success() {
            return Err(SolPriceError::BadStatus(resp.status().as_u16()));
        }
        let body: CoinGeckoResp = resp
            .json()
            .await
            .map_err(|e| SolPriceError::Parse(e.to_string()))?;
        let price = body.solana.usd;
        if !price.is_finite() || price <= 0.0 {
            return Err(SolPriceError::InvalidPrice(price));
        }
        Ok(price)
    }
    .await;

    match price_result {
        Ok(price) => {
            cache().insert("sol_usd", (price, now_secs())).await;
            if let Ok(mut guard) = stale_fallback().write() {
                *guard = Some((price, now_secs()));
            }
            Ok(price)
        }
        Err(e) => {
            // Try last-good-price fallback first.
            if let Ok(guard) = stale_fallback().read() {
                if let Some((stale_price, ts)) = *guard {
                    let age = now_secs().saturating_sub(ts);
                    tracing::warn!(
                        error = %e,
                        stale_price = stale_price,
                        age_secs = age,
                        "CoinGecko unreachable — falling back to last-known SOL/USD price",
                    );
                    return Ok(stale_price);
                }
            }
            // Then admin override.
            if let Some(admin) = admin_fallback() {
                tracing::warn!(
                    error = %e,
                    admin_fallback = admin,
                    "CoinGecko unreachable and no cached price — using OFFIVEX_FALLBACK_SOL_USD",
                );
                return Ok(admin);
            }
            Err(e)
        }
    }
}

/// Compute the exact lamport amount that satisfies a USD invoice at the given
/// SOL/USD rate. **All amounts are integer lamports — no f64 in DB.**
///
/// `usd_cents` — invoice price in USD cents (e.g. 100_000 for $1000)
/// `sol_usd_rate_cents` — locked rate in cents per 1 SOL (e.g. 17_500 for $175/SOL)
///
/// Returns `floor(usd_cents * 1e9 / sol_usd_rate_cents)` as `u64` lamports.
pub fn lamports_for_usd_cents(usd_cents: i64, sol_usd_rate_cents: i64) -> i64 {
    debug_assert!(usd_cents > 0);
    debug_assert!(sol_usd_rate_cents > 0);
    // lamports = (usd_cents / 100 USD) * (1 SOL / (rate_cents / 100 USD)) * 1e9
    //          = usd_cents * 1e9 / rate_cents
    // Use i128 to avoid overflow with prices like $7000 yearly + small rate cents.
    let lamports_i128 = (usd_cents as i128) * 1_000_000_000_i128 / (sol_usd_rate_cents as i128);
    lamports_i128 as i64
}

/// Convert a USD price (f64 from Jupiter) to integer cents, rounded to nearest.
/// `175.347` → `17_535`.
pub fn usd_price_to_cents(price_usd: f64) -> i64 {
    (price_usd * 100.0).round() as i64
}

/// Format lamports as a human-readable SOL string (max 9 decimals, trailing zeros stripped).
/// `11_451_000_000_lamports` → `"11.451"` ; `1_lamport` → `"0.000000001"`.
pub fn lamports_to_sol_str(lamports: i64) -> String {
    let abs = lamports.unsigned_abs() as u128;
    let sol_whole = abs / 1_000_000_000;
    let sol_frac = abs % 1_000_000_000;
    let sign = if lamports < 0 { "-" } else { "" };
    if sol_frac == 0 {
        format!("{}{}", sign, sol_whole)
    } else {
        let frac_str = format!("{:09}", sol_frac);
        let trimmed = frac_str.trim_end_matches('0');
        format!("{}{}.{}", sign, sol_whole, trimmed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lamports_for_1000_usd_at_175() {
        // $1,000 invoice, SOL = $175 → 1000/175 ≈ 5.71428571… SOL → 5_714_285_714 lamports
        let lamports = lamports_for_usd_cents(100_000, 17_500);
        assert_eq!(lamports, 5_714_285_714);
    }

    #[test]
    fn lamports_for_7000_usd_at_175() {
        // $7,000 invoice, SOL = $175 → 40 SOL → 40_000_000_000 lamports
        let lamports = lamports_for_usd_cents(700_000, 17_500);
        assert_eq!(lamports, 40_000_000_000);
    }

    #[test]
    fn lamports_floor_no_overflow_on_yearly_yield() {
        // Edge case: $7,000 at a very low SOL price ($0.50)
        let lamports = lamports_for_usd_cents(700_000, 50);
        // 7000/0.50 = 14000 SOL → 14_000_000_000_000 lamports — well within i64
        assert_eq!(lamports, 14_000_000_000_000);
    }

    #[test]
    fn usd_price_round_to_cents() {
        assert_eq!(usd_price_to_cents(175.347), 17_535);
        assert_eq!(usd_price_to_cents(175.0), 17_500);
        assert_eq!(usd_price_to_cents(0.01), 1);
    }

    #[test]
    fn lamports_to_sol_str_formatting() {
        assert_eq!(lamports_to_sol_str(11_451_000_000), "11.451");
        assert_eq!(lamports_to_sol_str(5_714_285_714), "5.714285714");
        assert_eq!(lamports_to_sol_str(1_000_000_000), "1");
        assert_eq!(lamports_to_sol_str(0), "0");
        assert_eq!(lamports_to_sol_str(1), "0.000000001");
        assert_eq!(lamports_to_sol_str(40_000_000_000), "40");
    }

    #[test]
    fn lamports_to_sol_str_roundtrip_high_precision() {
        // Match Kinesis-style display: 11.451 SOL → 11_451_000_000 lamports
        let lamports = 11_451_000_000_i64;
        let s = lamports_to_sol_str(lamports);
        assert_eq!(s, "11.451");
        // And the lamport precision keeps trailing micro-lamports visible
        assert_eq!(lamports_to_sol_str(11_451_000_001), "11.451000001");
    }
}
