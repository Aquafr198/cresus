mod auth;
mod config;
mod error;
mod metrics;
mod router;
mod state;
mod scheduler;

use std::sync::Arc;
use config::Config;
use tokio::sync::RwLock;
use tracing_subscriber::EnvFilter;
use cresus_db::backup::BackupConfig;

use crate::state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env file if present
    dotenvy::dotenv().ok();

    // Load configuration
    let config = Config::from_env();

    // Initialize structured logging
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new(&config.log_level)),
        )
        .with_target(true)
        .init();

    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        host = %config.host,
        port = config.port,
        db = %config.database_path,
        cluster = %config.solana_cluster,
        "Starting Cresus server"
    );

    if config.solana_cluster.is_devnet() {
        tracing::warn!("Running on DEVNET — set CRESUS_SOLANA_CLUSTER=mainnet for production");
    }

    // Validate config for production safety warnings
    config.validate();

    // Initialize metrics
    metrics::init();

    // Initialize database
    let db = cresus_db::init_db(&config.database_path).await?;
    tracing::info!(path = %config.database_path, "Database initialized");

    // Build shared state
    let db = Arc::new(db);
    let master_key = Arc::new(RwLock::new(None));
    let assets_dir = std::path::PathBuf::from(&config.assets_dir);
    let state = AppState::new(db, master_key, assets_dir, config.pinata_jwt.clone());

    // Initialize meme library (create assets dir)
    state.meme_mgr.init().await?;

    // Reset any bot tasks left in "running" state from a previous session
    scheduler::reset_stale_running_tasks(&state.distribution_state.db).await;

    // Start background schedulers
    let backup_config = BackupConfig {
        backup_dir: std::path::PathBuf::from("data/backups"),
        max_backups: 7, // Keep 7 days of backups
        compress: true,
    };

    let _backup_scheduler = scheduler::start_backup_scheduler(
        state.distribution_state.db.clone(),
        backup_config,
    );
    tracing::info!("Database backup scheduler started (daily backups enabled)");

    let _distribution_scheduler = scheduler::start_distribution_resume_scheduler(
        state.distribution_state.db.clone(),
        state.distribution_state.master_key.clone(),
        Arc::new(state.distribution_state.rpc.clone()),
    );
    tracing::info!("Distribution resume scheduler started (checks every 10 minutes)");

    // Start auto-lock scheduler
    let _auto_lock_scheduler = scheduler::start_auto_lock_scheduler(
        state.master_key.clone(),
        config.auto_lock_secs,
    );
    if config.auto_lock_secs > 0 {
        tracing::info!(
            timeout_secs = config.auto_lock_secs,
            "Auto-lock scheduler started"
        );
    }

    // Build router
    let app = router::build_router(state, &config);

    // Start server
    let addr = format!("{}:{}", config.host, config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(addr = %addr, "Cresus listening");

    axum::serve(listener, app).await?;

    Ok(())
}
