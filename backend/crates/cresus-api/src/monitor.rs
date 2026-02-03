use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use futures_util::{SinkExt, StreamExt};

use cresus_core::monitor::event_bus::EventBus;
use cresus_core::monitor::subscriber::Subscriber;

/// Shared state for monitor handlers.
#[derive(Clone)]
pub struct MonitorState {
    pub event_bus: Arc<EventBus>,
    pub subscriber: Arc<Subscriber>,
}

#[derive(Debug, Deserialize)]
pub struct SubscribeRequest {
    pub mint_address: String,
}

#[derive(Debug, Deserialize)]
pub struct UnsubscribeRequest {
    pub mint_address: String,
}

/// POST /api/v1/monitor/subscribe — Subscribe to a mint address.
pub async fn subscribe(
    State(state): State<MonitorState>,
    Json(body): Json<SubscribeRequest>,
) -> Response {
    if let Err(e) = crate::validation::validate_solana_address(&body.mint_address) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": format!("Invalid mint_address: {}", e) })),
        )
            .into_response();
    }
    match state.subscriber.subscribe(&body.mint_address).await {
        Ok(()) => Json(json!({
            "success": true,
            "data": { "mint_address": body.mint_address, "status": "subscribed" }
        }))
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// POST /api/v1/monitor/unsubscribe — Unsubscribe from a mint address.
pub async fn unsubscribe(
    State(state): State<MonitorState>,
    Json(body): Json<UnsubscribeRequest>,
) -> Response {
    state.subscriber.unsubscribe(&body.mint_address);
    Json(json!({
        "success": true,
        "data": { "mint_address": body.mint_address, "status": "unsubscribed" }
    }))
    .into_response()
}

/// GET /api/v1/monitor/subscriptions — List active subscriptions.
pub async fn list_subscriptions(State(state): State<MonitorState>) -> Response {
    let subs = state.subscriber.active_subscriptions();
    Json(json!({
        "success": true,
        "data": subs,
    }))
    .into_response()
}

/// GET /ws/monitor — WebSocket endpoint for real-time events.
///
/// Client sends JSON messages:
///   { "type": "subscribe", "mint_address": "..." }
///   { "type": "unsubscribe", "mint_address": "..." }
///
/// Server sends events:
///   { "type": "event", "data": { ...MonitorEvent... } }
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<MonitorState>,
) -> Response {
    ws.on_upgrade(move |socket| handle_ws_connection(socket, state))
}

async fn handle_ws_connection(socket: WebSocket, state: MonitorState) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let mut event_rx = state.event_bus.subscribe();

    // Track which mints this WS client is interested in
    let subscribed_mints: Arc<dashmap::DashSet<String>> = Arc::new(dashmap::DashSet::new());
    let mints_for_reader = subscribed_mints.clone();

    // Spawn a task to forward events to the WS client
    let forward_task = tokio::spawn(async move {
        loop {
            match event_rx.recv().await {
                Ok(event) => {
                    // Only forward events for mints this client cares about
                    if subscribed_mints.is_empty() || subscribed_mints.contains(&event.mint_address) {
                        let msg = json!({
                            "type": "event",
                            "data": event,
                        });
                        if ws_tx
                            .send(Message::Text(msg.to_string().into()))
                            .await
                            .is_err()
                        {
                            break; // Client disconnected
                        }
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!("WS client lagged by {} events", n);
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                    break;
                }
            }
        }
    });

    // Read client messages
    while let Some(Ok(msg)) = ws_rx.next().await {
        match msg {
            Message::Text(text) => {
                if let Ok(cmd) = serde_json::from_str::<serde_json::Value>(&text) {
                    let msg_type = cmd.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    let mint = cmd
                        .get("mint_address")
                        .and_then(|m| m.as_str())
                        .unwrap_or("");

                    match msg_type {
                        "subscribe" if !mint.is_empty() => {
                            mints_for_reader.insert(mint.to_string());
                            // Also trigger backend subscription
                            let _ = state.subscriber.subscribe(mint).await;
                        }
                        "unsubscribe" if !mint.is_empty() => {
                            mints_for_reader.remove(mint);
                        }
                        _ => {}
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    forward_task.abort();
}
