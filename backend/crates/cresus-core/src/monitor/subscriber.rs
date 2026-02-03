//! Solana WebSocket RPC subscriptions (logsSubscribe).
//!
//! Subscribes to Solana log events for specified mint addresses via the
//! Solana WS RPC, parses relevant events, and emits them to the EventBus.

use std::sync::Arc;
use tokio::sync::RwLock;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use dashmap::DashMap;

use super::event_bus::{EventBus, MonitorEvent};

#[derive(Debug, thiserror::Error)]
pub enum SubscriberError {
    #[error("WebSocket error: {0}")]
    WebSocket(#[from] tokio_tungstenite::tungstenite::Error),
    #[error("Connection failed: {0}")]
    Connection(String),
    #[error("No WS URL configured")]
    NoWsUrl,
}

/// Manages Solana WS subscriptions for monitoring mint addresses.
pub struct Subscriber {
    /// Active subscription IDs keyed by mint address.
    subscriptions: Arc<DashMap<String, u64>>,
    /// Event bus to emit parsed events to.
    event_bus: Arc<EventBus>,
    /// WS RPC URL.
    ws_url: Arc<RwLock<Option<String>>>,
    /// Handle to the background WS reader task.
    cancel: Arc<tokio::sync::Notify>,
}

impl Subscriber {
    pub fn new(event_bus: Arc<EventBus>) -> Self {
        Self {
            subscriptions: Arc::new(DashMap::new()),
            event_bus,
            ws_url: Arc::new(RwLock::new(None)),
            cancel: Arc::new(tokio::sync::Notify::new()),
        }
    }

    /// Set the WS RPC URL.
    pub async fn set_ws_url(&self, url: String) {
        *self.ws_url.write().await = Some(url);
    }

    /// Subscribe to logs for a mint address.
    ///
    /// Opens a WS connection if needed and sends a logsSubscribe request
    /// filtered by the mint address mention.
    pub async fn subscribe(&self, mint_address: &str) -> Result<(), SubscriberError> {
        if self.subscriptions.contains_key(mint_address) {
            return Ok(()); // Already subscribed
        }

        let ws_url = self.ws_url.read().await.clone()
            .ok_or(SubscriberError::NoWsUrl)?;

        let mint = mint_address.to_string();
        let subscriptions = self.subscriptions.clone();
        let event_bus = self.event_bus.clone();
        let cancel = self.cancel.clone();

        // Spawn a background task for this subscription with auto-reconnect
        tokio::spawn(async move {
            let mut attempt: u32 = 0;
            loop {
                match run_subscription(&ws_url, &mint, &subscriptions, &event_bus, &cancel).await {
                    Ok(false) => {
                        // Clean disconnect (cancelled or unsubscribed)
                        break;
                    }
                    Ok(true) => {
                        // Was connected but dropped — reset backoff
                        attempt = 0;
                        tracing::warn!("WS connection dropped for {}, reconnecting...", mint);
                    }
                    Err(e) => {
                        tracing::error!("Subscription error for {}: {:?}", mint, e);
                    }
                }

                // Check if we should stop reconnecting
                if !subscriptions.contains_key(&mint) {
                    break;
                }

                // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
                let delay_ms = std::cmp::min(1000u64 * 2u64.pow(attempt.min(10)), 30_000);
                tracing::warn!(
                    "Reconnecting WS for {} in {}ms (attempt {})",
                    mint, delay_ms, attempt + 1
                );

                tokio::select! {
                    _ = tokio::time::sleep(std::time::Duration::from_millis(delay_ms)) => {}
                    _ = cancel.notified() => { break; }
                }

                attempt += 1;
            }
            subscriptions.remove(&mint);
        });

        // Mark as subscribed (task will update with real sub ID)
        self.subscriptions.insert(mint_address.to_string(), 0);
        Ok(())
    }

    /// Unsubscribe from a mint address.
    pub fn unsubscribe(&self, mint_address: &str) {
        self.subscriptions.remove(mint_address);
    }

    /// Get list of active subscriptions.
    pub fn active_subscriptions(&self) -> Vec<String> {
        self.subscriptions.iter().map(|e| e.key().clone()).collect()
    }

    /// Shutdown all subscriptions.
    pub fn shutdown(&self) {
        self.cancel.notify_waiters();
        self.subscriptions.clear();
    }
}

/// Run a single WS subscription for a mint address.
/// Returns `Ok(true)` if the connection was established and later dropped,
/// `Ok(false)` if cleanly cancelled, `Err` if connection failed.
async fn run_subscription(
    ws_url: &str,
    mint_address: &str,
    subscriptions: &DashMap<String, u64>,
    event_bus: &EventBus,
    cancel: &tokio::sync::Notify,
) -> Result<bool, SubscriberError> {
    let (ws_stream, _) = connect_async(ws_url).await
        .map_err(|e| SubscriberError::Connection(e.to_string()))?;

    let (mut write, mut read) = ws_stream.split();

    // Send logsSubscribe request
    let subscribe_msg = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "logsSubscribe",
        "params": [
            { "mentions": [mint_address] },
            { "commitment": "confirmed" }
        ]
    });

    write.send(Message::Text(subscribe_msg.to_string())).await?;
    tracing::info!("Subscribed to logs for mint: {}", mint_address);

    let mint = mint_address.to_string();
    let mut was_connected = false;

    loop {
        tokio::select! {
            _ = cancel.notified() => {
                tracing::info!("Subscription cancelled for {}", mint);
                return Ok(false);
            }
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        was_connected = true;
                        handle_ws_message(&text, &mint, subscriptions, event_bus);
                    }
                    Some(Ok(Message::Ping(data))) => {
                        let _ = write.send(Message::Pong(data)).await;
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        tracing::warn!("WS connection closed for {}", mint);
                        break;
                    }
                    Some(Err(e)) => {
                        tracing::error!("WS error for {}: {:?}", mint, e);
                        break;
                    }
                    _ => {}
                }
            }
        }

        // Check if we've been unsubscribed
        if !subscriptions.contains_key(&mint) {
            return Ok(false);
        }
    }

    Ok(was_connected)
}

/// Parse a WS message and emit events.
fn handle_ws_message(
    text: &str,
    mint_address: &str,
    subscriptions: &DashMap<String, u64>,
    event_bus: &EventBus,
) {
    let value: serde_json::Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return,
    };

    // Handle subscription confirmation
    if let Some(result) = value.get("result") {
        if let Some(sub_id) = result.as_u64() {
            subscriptions.insert(mint_address.to_string(), sub_id);
            tracing::debug!("Subscription confirmed for {}: sub_id={}", mint_address, sub_id);
            return;
        }
    }

    // Handle notification
    let params = match value.get("params") {
        Some(p) => p,
        None => return,
    };

    let result = match params.get("result") {
        Some(r) => r,
        None => return,
    };

    let context = result.get("context");
    let slot = context
        .and_then(|c| c.get("slot"))
        .and_then(|s| s.as_u64())
        .unwrap_or(0);

    let log_value = match result.get("value") {
        Some(v) => v,
        None => return,
    };

    let signature = log_value
        .get("signature")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();

    let logs = log_value
        .get("logs")
        .and_then(|l| l.as_array())
        .cloned()
        .unwrap_or_default();

    let _err = log_value.get("err");

    // Determine event type from logs
    let (event_type, direction) = classify_logs(&logs);

    let event = MonitorEvent {
        signature,
        mint_address: mint_address.to_string(),
        event_type,
        direction,
        wallet: extract_wallet_from_logs(&logs),
        amount_token: None,
        amount_sol: None,
        timestamp: chrono::Utc::now().timestamp(),
        slot,
    };

    event_bus.emit(event);
}

/// Classify transaction logs to determine event type and direction.
fn classify_logs(logs: &[serde_json::Value]) -> (String, Option<String>) {
    let log_text: Vec<&str> = logs
        .iter()
        .filter_map(|l| l.as_str())
        .collect();

    let joined = log_text.join(" ");

    if joined.contains("InitializeAccount") || joined.contains("InitializeMint") {
        return ("mint".to_string(), None);
    }
    if joined.contains("Transfer") && joined.contains("Swap") {
        if joined.contains("SwapBaseIn") || joined.contains("swap_base_in") {
            return ("swap".to_string(), Some("buy".to_string()));
        }
        return ("swap".to_string(), Some("sell".to_string()));
    }
    if joined.contains("Swap") || joined.contains("swap") {
        return ("swap".to_string(), None);
    }
    if joined.contains("Transfer") {
        return ("transfer".to_string(), None);
    }
    if joined.contains("Burn") || joined.contains("burn") {
        return ("burn".to_string(), None);
    }
    if joined.contains("AddLiquidity") || joined.contains("add_liquidity") {
        return ("add_liquidity".to_string(), None);
    }
    if joined.contains("RemoveLiquidity") || joined.contains("remove_liquidity") {
        return ("remove_liquidity".to_string(), None);
    }

    ("unknown".to_string(), None)
}

/// Try to extract a wallet address from logs (best-effort).
fn extract_wallet_from_logs(logs: &[serde_json::Value]) -> String {
    // Look for "Program log: " entries that might contain wallet info
    for log in logs {
        if let Some(s) = log.as_str() {
            // Simple heuristic: find base58-like strings of ~44 chars
            for word in s.split_whitespace() {
                if word.len() >= 32 && word.len() <= 44 && word.chars().all(|c| c.is_alphanumeric()) {
                    return word.to_string();
                }
            }
        }
    }
    "unknown".to_string()
}
