mod auth;
mod config;
mod error;
mod metrics;
mod router;
mod state;
mod scheduler;
mod cli;

use std::sync::Arc;
use clap::Parser;
use config::Config;
use tokio::sync::RwLock;
use tracing_subscriber::EnvFilter;
use offivex_db::backup::BackupConfig;

use crate::state::AppState;

#[derive(Parser, Debug)]
#[command(
    name = "offivex",
    version,
    about = "Offivex server + admin / user operations"
)]
struct CliArgs {
    #[command(subcommand)]
    command: Option<cli::Command>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env file if present (used by both serve and CLI subcommands).
    dotenvy::dotenv().ok();

    let args = CliArgs::parse();

    match args.command {
        Some(cli::Command::Admin(admin_cmd)) => cli::run_admin(admin_cmd).await,
        Some(cli::Command::User(user_cmd)) => cli::run_user(user_cmd).await,
        Some(cli::Command::Serve) | None => run_server().await,
    }
}

async fn run_server() -> anyhow::Result<()> {
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
        "Starting Offivex server"
    );

    if config.solana_cluster.is_devnet() {
        tracing::warn!("Running on DEVNET — set OFFIVEX_SOLANA_CLUSTER=mainnet for production");
    }

    // Validate config for production safety. Hard-fails on dangerous combos
    // (SEC-6 wildcard/http CORS on mainnet, SEC-10 DEV_MODE+mainnet).
    if let Err(msg) = config.validate() {
        tracing::error!("Config validation failed: {msg}");
        return Err(anyhow::anyhow!("Config validation failed: {msg}"));
    }

    // Initialize metrics
    metrics::init();

    // Initialize database
    let db = offivex_db::init_db(&config.database_path).await?;
    tracing::info!(path = %config.database_path, "Database initialized");

    // Auto-seed the default cluster RPC if the user has none configured yet.
    // Without this, every fresh install lands on a /rpc page with a single
    // "Add Endpoint" button and an empty list — every on-chain call 500s
    // with "No active RPC endpoints configured" until the user manually
    // pastes a URL. Seeding the public Solana RPC for the active cluster
    // gives every install a working baseline; the /rpc page becomes
    // optional ("add YOUR private/Helius RPC for better latency").
    {
        let existing = offivex_db::repo::rpc_repo::RpcRepo::list_all(&db)
            .await
            .map_err(|e| anyhow::anyhow!("rpc_endpoints lookup failed: {e}"))?;
        if existing.is_empty() {
            let default_url = config.solana_cluster.default_rpc_url();
            let endpoint = offivex_db::models::RpcEndpoint {
                id: uuid::Uuid::new_v4().to_string(),
                name: format!("Solana {} (public)", config.solana_cluster),
                url: default_url.to_string(),
                ws_url: None,
                weight: 1,
                is_active: 1,
                last_latency_ms: None,
                created_at: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0),
            };
            offivex_db::repo::rpc_repo::RpcRepo::create(&db, endpoint)
                .await
                .map_err(|e| anyhow::anyhow!("rpc default-seed insert failed: {e}"))?;
            tracing::info!(
                cluster = %config.solana_cluster,
                url = %default_url,
                "Seeded default RPC endpoint on first boot (rpc_endpoints was empty)"
            );
        }
    }

    // ── Treasury seed validation (Phase 5.6 — fail-fast) ──────────────────
    if config.treasury_seed_phrase.is_empty() {
        tracing::error!(
            "OFFIVEX_TREASURY_SEED_PHRASE not set — refusing to start (Phase 5 requires the treasury seed to derive invoice addresses)"
        );
        return Err(anyhow::anyhow!("treasury seed not configured"));
    }
    offivex_crypto::mnemonic::validate_mnemonic(&config.treasury_seed_phrase)
        .map_err(|e| anyhow::anyhow!("invalid OFFIVEX_TREASURY_SEED_PHRASE: {e}"))?;
    let treasury_seed_bytes = offivex_crypto::mnemonic::mnemonic_to_seed(
        &config.treasury_seed_phrase,
        None,
    )
    .map_err(|e| anyhow::anyhow!("seed derivation failed: {e}"))?;
    let treasury_pubkey = offivex_core::payment::derivation::derive_treasury_pubkey(
        treasury_seed_bytes.as_ref(),
    )
    .map_err(|e| anyhow::anyhow!("treasury derivation failed: {e}"))?;
    tracing::info!(
        treasury_pubkey = %treasury_pubkey,
        invoice_ttl_secs = config.invoice_ttl_secs,
        "Treasury wallet derived; payment watcher will activate after boot"
    );
    let treasury_seed = Arc::new(treasury_seed_bytes);

    // Build shared state
    let db = Arc::new(db);
    let master_key = Arc::new(RwLock::new(None));
    let assets_dir = std::path::PathBuf::from(&config.assets_dir);
    let state = AppState::new(
        db,
        master_key,
        assets_dir,
        config.pinata_jwt.clone(),
        treasury_seed,
        treasury_pubkey,
        config.telegram_bot_token.clone(),
        config.telegram_launch_channel_id.clone(),
    );

    // Initialize meme library (create assets dir)
    state.meme_mgr.init().await?;

    // Audit PERF-MAX-1 — pre-load plans into in-memory cache.
    // Plans are read-only after seeding (admin can update prices but that's
    // rare). Eliminate a DB query per /user/billing/payments by serving from
    // memory. Admin endpoint `POST /admin/plans/reload` busts the cache.
    {
        let plans = offivex_db::repo::plan_repo::PlanRepo::list_all(&state.db).await
            .map_err(|e| anyhow::anyhow!("plan cache preload failed: {e}"))?;
        let mut guard = state.plan_cache.write().expect("plan_cache poisoned");
        for p in plans {
            guard.insert(p.id.clone(), p);
        }
        tracing::info!(count = guard.len(), "Plan cache preloaded");
    }

    // Reset any bot tasks left in "running" state from a previous session
    scheduler::reset_stale_running_tasks(&state.distribution_state.db).await;

    // Start background schedulers
    // Audit OPS-MAX-1 — hourly backups with 24 retention = 1 day of recovery
    // at hourly granularity. Configurable via OFFIVEX_BACKUP_DIR env var (TODO).
    let backup_config = BackupConfig {
        backup_dir: std::path::PathBuf::from("data/backups"),
        max_backups: 24, // 24 hourly backups = 24h recovery granularity
        compress: true,
    };

    let _backup_scheduler = scheduler::start_backup_scheduler(
        state.distribution_state.db.clone(),
        backup_config,
    );
    tracing::info!("Database backup scheduler started (daily backups enabled)");

    // Audit PERF-MAX-4 — WAL checkpoint hourly so the SQLite WAL file does
    // not grow without bound under write-heavy workloads.
    let _wal_scheduler = scheduler::start_wal_checkpoint_scheduler(state.db.clone());
    tracing::info!("WAL checkpoint scheduler started (hourly TRUNCATE)");

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

    // Start payment watcher (Phase 5.6 + SEC-3 audit P1 + OPS-MAX-4 audit final).
    let _payment_watcher = offivex_core::payment::watcher::start_payment_watcher_scheduler(
        state.db.clone(),
        Arc::new(state.rpc_mgr.clone()),
        offivex_core::payment::watcher::WatcherConfig::default(),
        state.treasury_seed.clone(),
        // OPS-MAX-4 — watcher publishes tick metrics to the shared
        // WatcherHealth, read by /admin/watcher-status.
        state.watcher_health.clone()
            as Arc<dyn offivex_core::payment::watcher::WatcherHealthSink>,
    );
    tracing::info!("Payment watcher scheduler started (tick=5s, batch=50, tolerance=0.5%)");

    // A.3 — dev-sold detector. Tick every 5 min, snapshots creator wallet
    // balance for each confirmed bundle, emits WS `dev_sold` events on >20%
    // drops. Runs forever; no shutdown handle wired since the process exits
    // when axum::serve returns.
    let _dev_sold_handle = offivex_core::monitor::dev_sold_detector::spawn(
        state.db.clone(),
        state.rpc_mgr.clone(),
        state.monitor_state.event_bus.clone(),
    );
    tracing::info!("Dev-sold detector started (tick=5min, threshold=20%)");

    // Build router
    let app = router::build_router(state, &config);

    // Start server
    let addr = format!("{}:{}", config.host, config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(addr = %addr, "Offivex listening");

    axum::serve(listener, app).await?;

    Ok(())
}
