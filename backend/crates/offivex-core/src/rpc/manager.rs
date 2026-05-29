use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;
use tokio_rusqlite::Connection;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use dashmap::DashMap;

use offivex_db::models::RpcEndpoint;
use offivex_db::repo::rpc_repo::RpcRepo;
use offivex_db::DbError;

#[derive(Debug, thiserror::Error)]
pub enum RpcError {
    #[error("Database error: {0}")]
    Db(#[from] DbError),
    #[error("No active RPC endpoints configured")]
    NoEndpoints,
    #[error("All RPC endpoints are unreachable")]
    AllUnreachable,
    #[error("RPC error: {0}")]
    Rpc(String),
}

/// Cached RPC client entry
struct CachedClient {
    client: Arc<RpcClient>,
    #[allow(dead_code)]
    endpoint: RpcEndpoint,
    created_at: Instant,
}

/// Manages a pool of RPC endpoints with connection caching,
/// round-robin selection, and health checking with failover.
#[derive(Clone)]
pub struct RpcManager {
    db: Arc<Connection>,
    /// Cached clients keyed by endpoint ID
    pool: Arc<DashMap<String, CachedClient>>,
    /// Round-robin counter for load distribution
    round_robin: Arc<AtomicUsize>,
}

/// How long to keep a cached client before recreating (10 minutes)
const CLIENT_TTL_SECS: u64 = 600;

impl RpcManager {
    pub fn new(db: Arc<Connection>) -> Self {
        Self {
            db,
            pool: Arc::new(DashMap::new()),
            round_robin: Arc::new(AtomicUsize::new(0)),
        }
    }

    /// Get or create a cached RPC client for an endpoint.
    fn get_or_create_client(&self, ep: &RpcEndpoint) -> Arc<RpcClient> {
        // Check cache
        if let Some(cached) = self.pool.get(&ep.id) {
            if cached.created_at.elapsed().as_secs() < CLIENT_TTL_SECS {
                return cached.client.clone();
            }
        }

        // Create new client and cache it
        let client = Arc::new(RpcClient::new_with_commitment(
            ep.url.clone(),
            CommitmentConfig::confirmed(),
        ));

        self.pool.insert(
            ep.id.clone(),
            CachedClient {
                client: client.clone(),
                endpoint: ep.clone(),
                created_at: Instant::now(),
            },
        );

        client
    }

    /// Evict a client from the pool (e.g., after it fails health check).
    fn evict_client(&self, endpoint_id: &str) {
        self.pool.remove(endpoint_id);
    }

    /// Add a new RPC endpoint.
    pub async fn add_endpoint(
        &self,
        name: &str,
        url: &str,
        ws_url: Option<&str>,
        weight: i64,
    ) -> Result<RpcEndpoint, RpcError> {
        let ep = RpcEndpoint {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            url: url.to_string(),
            ws_url: ws_url.map(|s| s.to_string()),
            weight,
            is_active: 1,
            last_latency_ms: None,
            created_at: chrono::Utc::now().timestamp(),
        };
        RpcRepo::create(&self.db, ep.clone()).await?;
        Ok(ep)
    }

    /// List all endpoints.
    pub async fn list_endpoints(&self) -> Result<Vec<RpcEndpoint>, RpcError> {
        Ok(RpcRepo::list_all(&self.db).await?)
    }

    /// Delete an endpoint.
    pub async fn delete_endpoint(&self, id: &str) -> Result<bool, RpcError> {
        self.evict_client(id);
        Ok(RpcRepo::delete(&self.db, id.to_string()).await?)
    }

    /// Toggle endpoint active/inactive.
    pub async fn set_active(&self, id: &str, active: bool) -> Result<(), RpcError> {
        if !active {
            self.evict_client(id);
        }
        Ok(RpcRepo::set_active(&self.db, id.to_string(), active).await?)
    }

    /// Get the best available RPC client with health checking.
    /// Uses cached connections and falls back through endpoints.
    pub async fn get_client(&self) -> Result<(Arc<RpcClient>, RpcEndpoint), RpcError> {
        let endpoints = RpcRepo::list_active(&self.db).await?;
        if endpoints.is_empty() {
            return Err(RpcError::NoEndpoints);
        }

        for ep in &endpoints {
            let client = self.get_or_create_client(ep);
            let healthy = client.get_health().await.is_ok();
            if healthy {
                return Ok((client, ep.clone()));
            }
            // Evict unhealthy client so it gets recreated next time
            self.evict_client(&ep.id);
        }

        Err(RpcError::AllUnreachable)
    }

    /// Get a client using round-robin selection without health checking.
    /// Much faster than `get_client()` — use when latency matters
    /// and endpoints are known to be healthy (e.g., during bot trading loops).
    pub async fn get_client_fast(&self) -> Result<(Arc<RpcClient>, RpcEndpoint), RpcError> {
        let endpoints = RpcRepo::list_active(&self.db).await?;
        if endpoints.is_empty() {
            return Err(RpcError::NoEndpoints);
        }

        // Round-robin across active endpoints
        let idx = self.round_robin.fetch_add(1, Ordering::Relaxed) % endpoints.len();
        let ep = &endpoints[idx];
        let client = self.get_or_create_client(ep);

        Ok((client, ep.clone()))
    }

    /// Get the number of cached connections in the pool.
    pub fn pool_size(&self) -> usize {
        self.pool.len()
    }

    /// Health-check all active endpoints and update latencies in DB.
    pub async fn health_check_all(&self) -> Result<Vec<HealthResult>, RpcError> {
        let endpoints = RpcRepo::list_active(&self.db).await?;
        let mut results = Vec::new();

        for ep in endpoints {
            let client = self.get_or_create_client(&ep);

            let start = Instant::now();
            let healthy = client.get_health().await.is_ok();
            let ms = start.elapsed().as_millis() as i64;

            if healthy {
                RpcRepo::update_latency(&self.db, ep.id.clone(), ms)
                    .await
                    .ok();
            } else {
                self.evict_client(&ep.id);
                RpcRepo::update_latency(&self.db, ep.id.clone(), -1)
                    .await
                    .ok();
            }

            results.push(HealthResult {
                id: ep.id,
                name: ep.name,
                healthy,
                latency_ms: if healthy { Some(ms) } else { None },
            });
        }

        Ok(results)
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct HealthResult {
    pub id: String,
    pub name: String,
    pub healthy: bool,
    pub latency_ms: Option<i64>,
}
