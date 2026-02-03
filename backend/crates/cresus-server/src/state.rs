use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_rusqlite::Connection;

use cresus_crypto::SecretBytes;
use cresus_core::wallet::manager::WalletManager;
use cresus_core::rpc::manager::RpcManager;
use cresus_core::meme::manager::MemeManager;
use cresus_core::meme::pinning::PinningService;
use cresus_core::monitor::event_bus::EventBus;
use cresus_core::monitor::subscriber::Subscriber;
use cresus_api::token::TokenState;
use cresus_api::bundle::BundleState;
use cresus_api::distribution::DistributionState;
use cresus_api::profile::ProfileState;
use cresus_api::monitor::MonitorState;
use cresus_api::stats::StatsState;

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
}

impl AppState {
    pub fn new(
        db: Arc<Connection>,
        master_key: Arc<RwLock<Option<SecretBytes>>>,
        assets_dir: PathBuf,
        pinata_jwt: Option<String>,
    ) -> Self {
        let wallet_mgr = WalletManager::new(db.clone(), master_key.clone());
        let rpc_mgr = RpcManager::new(db.clone());
        let token_state = TokenState {
            db: db.clone(),
            rpc: rpc_mgr.clone(),
            master_key: master_key.clone(),
        };
        let bundle_state = BundleState {
            db: db.clone(),
            rpc: rpc_mgr.clone(),
            master_key: master_key.clone(),
        };
        let distribution_state = DistributionState {
            db: db.clone(),
            rpc: rpc_mgr.clone(),
            master_key: master_key.clone(),
        };
        let profile_state = ProfileState {
            db: db.clone(),
        };
        let event_bus = Arc::new(EventBus::new(1024));
        let subscriber = Arc::new(Subscriber::new(event_bus.clone()));
        let monitor_state = MonitorState {
            event_bus,
            subscriber,
        };
        let stats_state = StatsState {
            db: db.clone(),
        };
        let pinning = PinningService::new(pinata_jwt);
        let meme_mgr = MemeManager::new(db, assets_dir, pinning);
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
        }
    }
}
