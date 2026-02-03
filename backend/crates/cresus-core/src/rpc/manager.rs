use std::sync::Arc;
use std::time::Instant;
use tokio_rusqlite::Connection;
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;

use cresus_db::models::RpcEndpoint;
use cresus_db::repo::rpc_repo::RpcRepo;
use cresus_db::DbError;

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

/// Manages a pool of RPC endpoints with health checking and failover.
#[derive(Clone)]
pub struct RpcManager {
    db: Arc<Connection>,
}

impl RpcManager {
    pub fn new(db: Arc<Connection>) -> Self {
        Self { db }
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
        Ok(RpcRepo::delete(&self.db, id.to_string()).await?)
    }

    /// Toggle endpoint active/inactive.
    pub async fn set_active(&self, id: &str, active: bool) -> Result<(), RpcError> {
        Ok(RpcRepo::set_active(&self.db, id.to_string(), active).await?)
    }

    /// Get the best available RPC client.
    /// Picks the highest-weight active endpoint, falls back through the list.
    pub async fn get_client(&self) -> Result<(RpcClient, RpcEndpoint), RpcError> {
        let endpoints = RpcRepo::list_active(&self.db).await?;
        if endpoints.is_empty() {
            return Err(RpcError::NoEndpoints);
        }

        for ep in &endpoints {
            let client =
                RpcClient::new_with_commitment(ep.url.clone(), CommitmentConfig::confirmed());
            let healthy = tokio::task::spawn_blocking(move || client.get_health().is_ok())
                .await
                .unwrap_or(false);
            if healthy {
                // Re-create client since the previous one was moved into spawn_blocking
                let client =
                    RpcClient::new_with_commitment(ep.url.clone(), CommitmentConfig::confirmed());
                return Ok((client, ep.clone()));
            }
        }

        Err(RpcError::AllUnreachable)
    }

    /// Get a client without health checking (for speed when you know the endpoint is good).
    pub async fn get_client_fast(&self) -> Result<(RpcClient, RpcEndpoint), RpcError> {
        let endpoints = RpcRepo::list_active(&self.db).await?;
        let ep = endpoints.first().ok_or(RpcError::NoEndpoints)?;
        let client =
            RpcClient::new_with_commitment(ep.url.clone(), CommitmentConfig::confirmed());
        Ok((client, ep.clone()))
    }

    /// Health-check all active endpoints and update latencies in DB.
    pub async fn health_check_all(&self) -> Result<Vec<HealthResult>, RpcError> {
        let endpoints = RpcRepo::list_active(&self.db).await?;
        let mut results = Vec::new();

        for ep in endpoints {
            let client =
                RpcClient::new_with_commitment(ep.url.clone(), CommitmentConfig::confirmed());

            let start = Instant::now();
            let healthy = tokio::task::spawn_blocking(move || client.get_health().is_ok())
                .await
                .unwrap_or(false);
            let ms = start.elapsed().as_millis() as i64;

            if healthy {
                RpcRepo::update_latency(&self.db, ep.id.clone(), ms)
                    .await
                    .ok();
            } else {
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
