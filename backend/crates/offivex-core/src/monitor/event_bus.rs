use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

/// A transaction event emitted by the monitor.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorEvent {
    pub signature: String,
    pub mint_address: String,
    pub event_type: String,
    pub direction: Option<String>,
    pub wallet: String,
    pub amount_token: Option<String>,
    pub amount_sol: Option<String>,
    pub timestamp: i64,
    pub slot: u64,
}

/// Max number of recent events kept per mint for the dashboard backfill.
/// Memory ceiling: N_mints × 100 × ~200 bytes ≈ ~20 KB per 100 mints.
const PER_MINT_BUFFER_CAP: usize = 100;

/// Broadcast channel for real-time monitor events, plus a bounded in-memory
/// ring buffer of the most recent events per mint (used by the launch
/// dashboard to backfill the activity feed on initial load).
pub struct EventBus {
    sender: broadcast::Sender<MonitorEvent>,
    /// Per-mint ring buffer of the most recent events. Newest-first.
    /// Bounded by `PER_MINT_BUFFER_CAP` per mint so memory is constant.
    recent: Mutex<HashMap<String, VecDeque<MonitorEvent>>>,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self {
            sender,
            recent: Mutex::new(HashMap::new()),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<MonitorEvent> {
        self.sender.subscribe()
    }

    pub fn emit(&self, event: MonitorEvent) {
        // Append to the per-mint ring buffer first so a synchronous reader
        // immediately after `emit` sees the new event.
        if let Ok(mut map) = self.recent.lock() {
            let buf = map.entry(event.mint_address.clone()).or_default();
            buf.push_front(event.clone());
            if buf.len() > PER_MINT_BUFFER_CAP {
                buf.truncate(PER_MINT_BUFFER_CAP);
            }
        }
        let _ = self.sender.send(event);
    }

    /// Newest-first snapshot of the last `limit` events for a given mint.
    /// Returns an empty vec if no events have ever been emitted for that mint.
    pub fn recent_for_mint(&self, mint: &str, limit: usize) -> Vec<MonitorEvent> {
        let Ok(map) = self.recent.lock() else {
            return Vec::new();
        };
        map.get(mint)
            .map(|buf| buf.iter().take(limit).cloned().collect())
            .unwrap_or_default()
    }
}
