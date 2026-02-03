use tokio::sync::broadcast;
use serde::{Deserialize, Serialize};

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

/// Broadcast channel for real-time monitor events.
pub struct EventBus {
    sender: broadcast::Sender<MonitorEvent>,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<MonitorEvent> {
        self.sender.subscribe()
    }

    pub fn emit(&self, event: MonitorEvent) {
        let _ = self.sender.send(event);
    }
}
