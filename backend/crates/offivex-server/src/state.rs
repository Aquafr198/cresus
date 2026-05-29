use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_rusqlite::Connection;

use offivex_crypto::SecretBytes;
use offivex_core::wallet::manager::WalletManager;
use offivex_core::rpc::manager::RpcManager;
use offivex_core::meme::manager::MemeManager;
use offivex_core::meme::pinning::PinningService;
use offivex_core::monitor::event_bus::EventBus;
use offivex_core::monitor::subscriber::Subscriber;
use offivex_api::token::TokenState;
use offivex_api::bundle::BundleState;
use offivex_api::distribution::DistributionState;
use offivex_api::profile::ProfileState;
use offivex_api::monitor::MonitorState;
use offivex_api::stats::StatsState;
use solana_sdk::pubkey::Pubkey;

/// All shared application state, constructed once in main and split across routers.
#[derive(Clone)]
pub struct AppState {
    pub wallet_mgr: WalletManager,
    pub rpc_mgr: RpcManager,
    pub token_state: TokenState,
    pub meme_mgr: MemeManager,
    pub bundle_state: BundleState,
    pub distribution_state: DistributionState,
    pub profile_state: ProfileState,
    pub monitor_state: MonitorState,
    pub stats_state: StatsState,
    /// Exposed for auth middleware to check unlock status.
    pub master_key: Arc<RwLock<Option<SecretBytes>>>,
    /// Top-level DB handle for user-mgmt repos (Phase 1).
    pub db: Arc<Connection>,
    /// Treasury seed (BIP39 64-byte expanded), zeroized on drop via SecretBytes.
    /// Shared via Arc with payment handlers + watcher. Phase 5.6.
    pub treasury_seed: Arc<SecretBytes>,
    /// Treasury pubkey (derivation_index 0). Logged at startup, used by sweep flow.
    pub treasury_pubkey: Pubkey,
    /// Audit PERF-MAX-1 — plan cache loaded at boot. Plans (2-3 rows) change
    /// extremely rarely ; loading once eliminates a DB query per /user/billing/payments.
    /// Invalidated by an admin endpoint `POST /admin/plans/reload`.
    pub plan_cache: Arc<std::sync::RwLock<std::collections::HashMap<String, offivex_db::models::Plan>>>,
    /// Audit OPS-MAX-4 — watcher health gauges for /admin/watcher-status endpoint.
    pub watcher_health: Arc<WatcherHealth>,
}

/// Watcher health snapshot exposed by `GET /api/v1/admin/watcher-status`.
/// All fields use atomics so the watcher background task can write them
/// without locking.
pub struct WatcherHealth {
    pub last_tick_at: std::sync::atomic::AtomicI64,
    pub last_tick_duration_ms: std::sync::atomic::AtomicU64,
    pub total_ticks: std::sync::atomic::AtomicU64,
    pub total_errors: std::sync::atomic::AtomicU64,
}

impl WatcherHealth {
    pub fn new() -> Self {
        Self {
            last_tick_at: std::sync::atomic::AtomicI64::new(0),
            last_tick_duration_ms: std::sync::atomic::AtomicU64::new(0),
            total_ticks: std::sync::atomic::AtomicU64::new(0),
            total_errors: std::sync::atomic::AtomicU64::new(0),
        }
    }
}

impl offivex_api::admin::WatcherHealthRead for WatcherHealth {
    fn last_tick_at(&self) -> i64 {
        self.last_tick_at.load(std::sync::atomic::Ordering::Relaxed)
    }
    fn last_tick_duration_ms(&self) -> u64 {
        self.last_tick_duration_ms.load(std::sync::atomic::Ordering::Relaxed)
    }
    fn total_ticks(&self) -> u64 {
        self.total_ticks.load(std::sync::atomic::Ordering::Relaxed)
    }
    fn total_errors(&self) -> u64 {
        self.total_errors.load(std::sync::atomic::Ordering::Relaxed)
    }
}

impl offivex_core::payment::watcher::WatcherHealthSink for WatcherHealth {
    fn record_tick(&self, started_at_unix: i64, duration_ms: u64, had_error: bool) {
        use std::sync::atomic::Ordering;
        self.last_tick_at.store(started_at_unix, Ordering::Relaxed);
        self.last_tick_duration_ms.store(duration_ms, Ordering::Relaxed);
        self.total_ticks.fetch_add(1, Ordering::Relaxed);
        if had_error {
            self.total_errors.fetch_add(1, Ordering::Relaxed);
        }
    }
}

impl Default for WatcherHealth {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new(
        db: Arc<Connection>,
        master_key: Arc<RwLock<Option<SecretBytes>>>,
        assets_dir: PathBuf,
        pinata_jwt: Option<String>,
        treasury_seed: Arc<SecretBytes>,
        treasury_pubkey: Pubkey,
        telegram_bot_token: Option<String>,
        telegram_launch_channel_id: Option<String>,
    ) -> Self {
        let wallet_mgr = WalletManager::new(db.clone(), master_key.clone());
        let rpc_mgr = RpcManager::new(db.clone());
        let pinning = PinningService::new(pinata_jwt);
        let token_state = TokenState {
            db: db.clone(),
            rpc: rpc_mgr.clone(),
            master_key: master_key.clone(),
            pinning: pinning.clone(),
        };
        let bundle_state = BundleState {
            db: db.clone(),
            rpc: rpc_mgr.clone(),
            master_key: master_key.clone(),
            telegram_bot_token,
            telegram_launch_channel_id,
        };
        let distribution_state = DistributionState {
            db: db.clone(),
            rpc: rpc_mgr.clone(),
            master_key: master_key.clone(),
        };
        let profile_state = ProfileState {
            db: db.clone(),
        };
        // Audit POST-9 — bumped from 1024 → 4096. With 50+ WS clients
        // subscribed to multiple mints and bursty on-chain activity, 1024
        // could overflow and silently drop events for lagged clients (only
        // visible via `tracing::warn!("WS client lagged by N events")`).
        // 4096 gives ~4× headroom; cost is ~96KB of extra memory (4096 ×
        // sizeof(MonitorEvent) ≈ 24 bytes) — negligible.
        let event_bus = Arc::new(EventBus::new(4096));
        let subscriber = Arc::new(Subscriber::new(event_bus.clone()));
        let monitor_state = MonitorState {
            event_bus,
            subscriber,
        };
        let stats_state = StatsState {
            db: db.clone(),
        };
        let meme_mgr = MemeManager::new(db.clone(), assets_dir, pinning);
        Self {
            wallet_mgr,
            rpc_mgr,
            token_state,
            meme_mgr,
            bundle_state,
            distribution_state,
            profile_state,
            monitor_state,
            stats_state,
            master_key,
            db,
            treasury_seed,
            treasury_pubkey,
            // Plan cache starts empty; populated by main.rs after init_db.
            plan_cache: Arc::new(std::sync::RwLock::new(std::collections::HashMap::new())),
            watcher_health: Arc::new(WatcherHealth::new()),
        }
    }
}
