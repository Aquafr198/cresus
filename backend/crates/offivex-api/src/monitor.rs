use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use futures_util::{SinkExt, StreamExt};

use offivex_core::monitor::event_bus::EventBus;
use offivex_core::monitor::subscriber::Subscriber;
use offivex_core::payment::api_key_format;
use offivex_crypto::verify_password_phc;
use offivex_db::repo::{
    api_key_repo::ApiKeyRepo, subscription_repo::SubscriptionRepo, user_repo::UserRepo,
};
use tokio_rusqlite::Connection;

/// Shared state for monitor handlers.
#[derive(Clone)]
pub struct MonitorState {
    pub event_bus: Arc<EventBus>,
    pub subscriber: Arc<Subscriber>,
}

/// Shared state for the WebSocket handler. Bundles the monitor backplane with
/// the DB handle needed to verify the API key passed via the
/// `Sec-WebSocket-Protocol` header (browsers cannot send `Authorization: Bearer`
/// for WS upgrade).
#[derive(Clone)]
pub struct WsHandlerState {
    pub monitor: MonitorState,
    pub db: Arc<Connection>,
}

/// Subprotocol marker the server echoes back to the client on successful auth.
/// The actual API key is sent as a second subprotocol entry by the client and
/// is NEVER echoed in the response (would leak in reverse-proxy response logs).
const WS_ACCEPTED_PROTOCOL: &str = "ofx-bearer";

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
    State(state): State<WsHandlerState>,
    headers: HeaderMap,
) -> Response {
    // ── Authenticate via `Sec-WebSocket-Protocol` header ─────────────────
    // Browsers cannot send Authorization headers for WebSocket upgrades; the
    // only auth-data channel exposed to JS is the optional `protocols` array
    // passed as the 2nd argument of `new WebSocket(url, protocols)`. Those
    // values land in the `Sec-WebSocket-Protocol` request header.
    //
    // The client sends two subprotocols: `ofx-bearer` (marker) and the API key
    // itself (`ofx_live_<32 chars>`). The server reads the header, validates
    // the key, and on success echoes back ONLY `ofx-bearer` via the response
    // header — the secret value is NEVER reflected in response logs.
    //
    // This is significantly safer than `?token=` query strings, which are
    // logged by ~every reverse proxy / CDN / browser referer chain.
    let protocols_header = headers
        .get("sec-websocket-protocol")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let token = protocols_header
        .split(',')
        .map(|s| s.trim())
        .find(|s| s.starts_with("ofx_live_"))
        .unwrap_or("")
        .to_string();

    if !api_key_format::looks_valid(&token) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"success": false, "error": "Invalid API key format"})),
        )
            .into_response();
    }
    let prefix = match api_key_format::parse_prefix(&token) {
        Some(p) => p.to_string(),
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"success": false, "error": "Invalid API key format"})),
            )
                .into_response();
        }
    };
    let candidates = match ApiKeyRepo::find_active_by_prefix(&state.db, &prefix).await {
        Ok(c) => c,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "error": "Internal error"})),
            )
                .into_response();
        }
    };
    let mut matched = None;
    for c in candidates {
        if let Ok(true) = verify_password_phc(&token, &c.key_hash) {
            matched = Some(c);
            break;
        }
    }
    let api_key = match matched {
        Some(k) => k,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"success": false, "error": "Invalid API key"})),
            )
                .into_response();
        }
    };
    // User must be active
    match UserRepo::find_by_id(&state.db, &api_key.user_id).await {
        Ok(Some(u)) if u.status == "active" => {}
        _ => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"success": false, "error": "User suspended or missing"})),
            )
                .into_response();
        }
    }
    // Active subscription required (mirror require_active_plan policy)
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    match SubscriptionRepo::find_active_by_user(&state.db, &api_key.user_id).await {
        Ok(Some(s)) if s.status == "active" && s.expires_at.map(|e| e > now).unwrap_or(false) => {}
        _ => {
            return (
                StatusCode::PAYMENT_REQUIRED,
                Json(json!({"success": false, "error": "no_active_plan"})),
            )
                .into_response();
        }
    }
    // Auth passed — upgrade the connection.
    // Echo back ONLY the `ofx-bearer` marker subprotocol so the browser accepts
    // the connection. The API key subprotocol value is NOT reflected.
    let monitor = state.monitor.clone();
    ws.protocols([WS_ACCEPTED_PROTOCOL])
        .on_upgrade(move |socket| handle_ws_connection(socket, monitor))
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

    // Per-client subscription cap (audit P3 SEC-9). A misbehaving client could
    // otherwise grow the in-memory DashSet unbounded by spamming `subscribe`
    // commands with garbage strings.
    const MAX_SUBSCRIPTIONS_PER_CLIENT: usize = 50;

    // Audit SEC-MAX-2 — server-side WS rate limiting (token bucket).
    // Without this, a misbehaving client can spam subscribe/unsubscribe at
    // line rate, saturating the read loop and (worse) the AuditLog if we
    // were to log every message. We allow a small burst then sustain at
    // MAX_MSGS_PER_SEC.
    //
    // Bucket: cap=20, refill 10/sec. So a brief flurry of 20 msgs is fine
    // (user clicking subscribe rapidly on UI), but sustained > 10/sec
    // closes the socket with code 4002.
    const MAX_MSGS_PER_SEC: u64 = 10;
    const BURST_CAP: u64 = 20;
    let mut tokens: u64 = BURST_CAP;
    let mut last_refill = std::time::Instant::now();

    // Read client messages
    while let Some(Ok(msg)) = ws_rx.next().await {
        // Refill bucket based on elapsed time.
        let elapsed = last_refill.elapsed().as_millis() as u64;
        if elapsed > 0 {
            let refill = (elapsed * MAX_MSGS_PER_SEC) / 1000;
            if refill > 0 {
                tokens = (tokens + refill).min(BURST_CAP);
                last_refill = std::time::Instant::now();
            }
        }
        // Consume a token; if depleted, close with policy-violation code.
        if tokens == 0 {
            tracing::warn!(
                "WS client exceeded rate limit ({} msg/sec) — closing socket",
                MAX_MSGS_PER_SEC
            );
            break;
        }
        tokens -= 1;
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
                            // Audit P3 SEC-9 — validate format before insertion.
                            // Reuses the strict `Pubkey::from_str` checksum check
                            // from validation.rs (SEC-7), so a typo'd or garbage
                            // mint_address never reaches the DashSet.
                            if let Err(e) = crate::validation::validate_solana_address(mint) {
                                tracing::debug!(
                                    mint = %mint, err = %e,
                                    "WS subscribe rejected invalid mint_address"
                                );
                                continue;
                            }
                            if mints_for_reader.len() >= MAX_SUBSCRIPTIONS_PER_CLIENT {
                                tracing::warn!(
                                    cap = MAX_SUBSCRIPTIONS_PER_CLIENT,
                                    "WS client hit subscription cap; ignoring further subscribes"
                                );
                                continue;
                            }
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
