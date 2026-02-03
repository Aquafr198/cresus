mod auth;
mod config;
mod error;
mod router;
mod state;

use std::sync::Arc;
use config::Config;
use tokio::sync::RwLock;
use tracing_subscriber::EnvFilter;

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
        "Starting Cresus server"
    );

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

    // Build router
    let app = router::build_router(state);

    // Start server
    let addr = format!("{}:{}", config.host, config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(addr = %addr, "Cresus listening");

    axum::serve(listener, app).await?;

    Ok(())
}
