//! Shared `reqwest::Client` for every outbound HTTP integration.
//!
//! Rationale:
//!   - **Timeouts** — every previous integration created a bare
//!     `reqwest::Client::new()` with no timeout, meaning a hung remote
//!     could pin a tokio task forever. We surface explicit deadlines.
//!   - **Connection pooling** — a single Client per process reuses TCP +
//!     TLS handshakes across calls (Jupiter / Jito / Pinata / CoinGecko
//!     / Telegram all hit `*.solana.com`, `*.jito.wtf`, `*.pinata.cloud`,
//!     `api.coingecko.com`, `api.telegram.org`), saving ~80–300 ms per
//!     warm call.
//!   - **Identity** — single `User-Agent` so providers can attribute
//!     traffic and reach out on quota issues instead of silently
//!     ratelimiting.
//!
//! We do NOT throttle outbound calls here. Some integrations have free-tier
//! quotas (Jupiter 60 req/min, CoinGecko 30 req/min) — those are handled at
//! the call-site with **on-429 backoff** so a burst of user actions never
//! gets artificially slowed by us. The provider's own 429 response is the
//! signal; we honour their `Retry-After` header.

use std::sync::OnceLock;
use std::time::Duration;

use reqwest::{Client, header::HeaderValue};

const DEFAULT_TIMEOUT_SECS: u64 = 20;
const DEFAULT_CONNECT_TIMEOUT_SECS: u64 = 5;
const USER_AGENT: &str = concat!("offivex/", env!("CARGO_PKG_VERSION"));

static SHARED: OnceLock<Client> = OnceLock::new();

/// Returns the process-wide shared `reqwest::Client`. Safe to call from
/// any async context — initialisation is one-shot and lock-free after.
pub fn shared() -> &'static Client {
    SHARED.get_or_init(|| {
        Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
            .connect_timeout(Duration::from_secs(DEFAULT_CONNECT_TIMEOUT_SECS))
            .pool_max_idle_per_host(16)
            .build()
            .expect("reqwest client build should not fail with rustls + default features")
    })
}

/// Parse the `Retry-After` HTTP header into a `Duration`. Honors both the
/// seconds-integer form and the HTTP-date form. Returns `None` if the
/// header is missing or unparseable.
///
/// Used by call sites that receive a 429 from a free-tier provider and
/// want to back off the exact amount the provider asks for, instead of a
/// blind exponential delay.
pub fn parse_retry_after(value: Option<&HeaderValue>) -> Option<Duration> {
    let v = value?.to_str().ok()?;
    if let Ok(secs) = v.parse::<u64>() {
        return Some(Duration::from_secs(secs.min(60)));
    }
    // HTTP-date — convert to delta seconds. We avoid pulling in chrono for
    // this; a coarse approximation via httpdate works.
    httpdate::parse_http_date(v).ok().and_then(|when| {
        let now = std::time::SystemTime::now();
        when.duration_since(now).ok().map(|d| d.min(Duration::from_secs(60)))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_returns_same_pointer_each_call() {
        let a = shared() as *const _;
        let b = shared() as *const _;
        assert_eq!(a, b);
    }

    #[test]
    fn retry_after_parses_seconds() {
        let h = HeaderValue::from_static("5");
        assert_eq!(parse_retry_after(Some(&h)), Some(Duration::from_secs(5)));
    }

    #[test]
    fn retry_after_clamps_to_60s() {
        let h = HeaderValue::from_static("9999");
        assert_eq!(parse_retry_after(Some(&h)), Some(Duration::from_secs(60)));
    }

    #[test]
    fn retry_after_none_on_missing() {
        assert_eq!(parse_retry_after(None), None);
    }
}
