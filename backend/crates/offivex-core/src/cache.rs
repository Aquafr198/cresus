//! In-memory caching layer using moka.
//!
//! Caches frequently accessed data to reduce RPC calls and external API hits.
//! All entries have TTLs and are automatically evicted.

use moka::future::Cache;
use solana_sdk::pubkey::Pubkey;
use std::sync::Arc;
use std::time::Duration;

use crate::trading::price_feed::{self, PriceFeedError};

/// Price cache entry
#[derive(Clone, Debug)]
pub struct CachedPrice {
    pub price_sol: f64,
}

/// Centralized cache for the Offivex platform.
#[derive(Clone)]
pub struct OffivexCache {
    /// Token price cache (mint address -> price in SOL)
    /// TTL: 30 seconds (prices are volatile)
    price_cache: Cache<String, CachedPrice>,

    /// SOL balance cache (pubkey -> lamports)
    /// TTL: 15 seconds
    balance_cache: Cache<String, u64>,
}

impl OffivexCache {
    pub fn new() -> Self {
        Self {
            price_cache: Cache::builder()
                .max_capacity(500)
                .time_to_live(Duration::from_secs(30))
                .build(),
            balance_cache: Cache::builder()
                .max_capacity(1000)
                .time_to_live(Duration::from_secs(15))
                .build(),
        }
    }

    /// Get token price in SOL, with caching.
    /// Cache hit avoids an external API call entirely.
    pub async fn get_price_sol(&self, token_mint: &Pubkey) -> Result<f64, PriceFeedError> {
        let key = token_mint.to_string();

        if let Some(cached) = self.price_cache.get(&key).await {
            tracing::trace!(token_mint = %key, "Price cache hit");
            return Ok(cached.price_sol);
        }

        tracing::trace!(token_mint = %key, "Price cache miss, fetching");
        let price = price_feed::get_token_price_in_sol(token_mint).await?;

        self.price_cache
            .insert(key, CachedPrice { price_sol: price })
            .await;

        Ok(price)
    }

    /// Get SOL balance with caching.
    pub async fn get_balance_cached(
        &self,
        rpc_client: &solana_client::nonblocking::rpc_client::RpcClient,
        pubkey: &Pubkey,
    ) -> Result<u64, String> {
        let key = pubkey.to_string();

        if let Some(cached) = self.balance_cache.get(&key).await {
            tracing::trace!(pubkey = %key, "Balance cache hit");
            return Ok(cached);
        }

        let balance = rpc_client
            .get_balance(pubkey)
            .await
            .map_err(|e| e.to_string())?;

        self.balance_cache.insert(key, balance).await;
        Ok(balance)
    }

    /// Invalidate a specific price entry (e.g., after a swap).
    pub async fn invalidate_price(&self, token_mint: &Pubkey) {
        self.price_cache.invalidate(&token_mint.to_string()).await;
    }

    /// Invalidate a specific balance entry (e.g., after a transfer).
    pub async fn invalidate_balance(&self, pubkey: &Pubkey) {
        self.balance_cache.invalidate(&pubkey.to_string()).await;
    }

    /// Get cache statistics for monitoring.
    pub fn stats(&self) -> CacheStats {
        CacheStats {
            price_entries: self.price_cache.entry_count(),
            balance_entries: self.balance_cache.entry_count(),
        }
    }
}

impl Default for OffivexCache {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CacheStats {
    pub price_entries: u64,
    pub balance_entries: u64,
}

/// Global cache instance — constructed once, shared via Arc.
pub fn create_cache() -> Arc<OffivexCache> {
    Arc::new(OffivexCache::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_cache_creation() {
        let cache = OffivexCache::new();
        let stats = cache.stats();
        assert_eq!(stats.price_entries, 0);
        assert_eq!(stats.balance_entries, 0);
    }

    #[tokio::test]
    async fn test_cache_invalidation() {
        let cache = OffivexCache::new();
        let mint = Pubkey::new_unique();
        let key = mint.to_string();

        // Insert a price
        cache
            .price_cache
            .insert(key.clone(), CachedPrice { price_sol: 1.5 })
            .await;

        assert!(cache.price_cache.get(&key).await.is_some());

        // Invalidate
        cache.invalidate_price(&mint).await;
        assert!(cache.price_cache.get(&key).await.is_none());
    }

    #[tokio::test]
    async fn test_balance_cache() {
        let cache = OffivexCache::new();
        let pubkey = Pubkey::new_unique();
        let key = pubkey.to_string();

        cache.balance_cache.insert(key.clone(), 1_000_000_000).await;

        let cached = cache.balance_cache.get(&key).await;
        assert_eq!(cached, Some(1_000_000_000));

        cache.invalidate_balance(&pubkey).await;
        assert!(cache.balance_cache.get(&key).await.is_none());
    }
}
