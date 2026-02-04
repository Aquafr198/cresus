use std::time::Duration;

use axum::{
    routing::{get, post, put, delete},
    middleware,
    Router,
    Json,
};
use serde_json::json;
use tower_http::cors::{CorsLayer, AllowOrigin};
use tower_http::trace::TraceLayer;
use axum::http::{HeaderValue, Method};

use cresus_api::{wallet, rpc_config, token, meme_library, bundle, distribution, profile, monitor, stats, trading, dlq, health, audit};

use std::sync::OnceLock;

use crate::auth;
use crate::config::Config;
use crate::state::AppState;

static CLUSTER: OnceLock<String> = OnceLock::new();

/// Build the complete API router.
pub fn build_router(state: AppState, config: &Config) -> Router {
    let origins: Vec<HeaderValue> = config
        .cors_origins
        .iter()
        .filter_map(|o| o.parse::<HeaderValue>().ok())
        .collect();

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
        ])
        .allow_credentials(true);

    let mk = state.master_key.clone();

    // Create states early (before fields are moved by .with_state())
    let trading_db = state.bundle_state.db.clone();
    let trading_rpc = state.rpc_mgr.clone();
    let dlq_db = state.distribution_state.db.clone();
    let audit_db = state.distribution_state.db.clone();
    let health_db = state.distribution_state.db.clone();
    let health_rpc = state.distribution_state.rpc.clone();

    // ── Auth routes (NO middleware — must be accessible while locked) ──
    // Rate-limit /auth/unlock to 5 requests per 60 seconds (brute-force protection)
    let unlock_limiter = auth::RateLimiter::new(5, Duration::from_secs(60));
    let unlock_route = Router::new()
        .route("/auth/unlock", post(wallet::unlock))
        .route_layer(middleware::from_fn_with_state(unlock_limiter, auth::rate_limit))
        .with_state(state.wallet_mgr.clone());

    let auth_routes = Router::new()
        .route("/auth/status", get(wallet::auth_status))
        .route("/auth/setup", post(wallet::setup_password))
        .route("/auth/lock", post(wallet::lock))
        .route("/auth/seed-phrase", get(wallet::get_seed_phrase))
        .route("/auth/restore", post(wallet::restore_from_seed))
        .with_state(state.wallet_mgr.clone())
        .merge(unlock_route);

    // ── Protected wallet routes (require unlock) ──
    let wallet_routes = Router::new()
        .route("/wallets", get(wallet::list_wallets).post(wallet::create_wallet))
        .route("/wallets/{id}", get(wallet::get_wallet).delete(wallet::delete_wallet))
        .route("/wallets/{id}/subwallets", post(wallet::create_subwallets))
        .route("/wallets/{id}/export", post(wallet::export_wallet))
        .route("/wallet-groups", get(wallet::list_groups).post(wallet::create_group))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(state.wallet_mgr.clone());

    // Wallet operations requiring RPC with rate limiting
    // Rate limit balance checks: 30 requests per 60 seconds
    let balance_limiter = auth::RateLimiter::new(30, Duration::from_secs(60));
    let balance_route = Router::new()
        .route("/wallets/{id}/balance", get(wallet::get_wallet_balance))
        .route_layer(middleware::from_fn_with_state(balance_limiter, auth::rate_limit))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state((state.wallet_mgr.clone(), state.rpc_mgr.clone()));

    // Rate limit send operations: 10 requests per 60 seconds (stricter)
    let send_limiter = auth::RateLimiter::new(10, Duration::from_secs(60));
    let send_route = Router::new()
        .route("/wallets/{id}/send", post(wallet::send_from_wallet))
        .route_layer(middleware::from_fn_with_state(send_limiter, auth::rate_limit))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state((state.wallet_mgr.clone(), state.rpc_mgr.clone()));

    let wallet_ops_routes = balance_route.merge(send_route);

    // RPC management routes
    let rpc_routes = Router::new()
        .route("/rpc", get(rpc_config::list_endpoints).post(rpc_config::add_endpoint))
        .route("/rpc/{id}", delete(rpc_config::delete_endpoint))
        .route("/rpc/{id}/active", put(rpc_config::set_active))
        .route("/rpc/health", post(rpc_config::health_check))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(state.rpc_mgr);

    // Token routes
    // Rate limit minting: 5 requests per 60 seconds (expensive on-chain operation)
    let mint_limiter = auth::RateLimiter::new(5, Duration::from_secs(60));
    let token_mint_route = Router::new()
        .route("/tokens/mint", post(token::mint_token))
        .route_layer(middleware::from_fn_with_state(mint_limiter, auth::rate_limit))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(state.token_state.clone());

    let token_routes = Router::new()
        .route("/tokens", get(token::list_tokens))
        .route("/tokens/clone-info", post(token::clone_info))
        .route("/tokens/vanity/start", post(token::vanity_start))
        .route("/tokens/vanity/{task_id}", get(token::vanity_status))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(state.token_state)
        .merge(token_mint_route);

    // Meme Library routes
    let meme_routes = Router::new()
        .route("/meme-library/assets", get(meme_library::list_assets).post(meme_library::upload_asset))
        .route("/meme-library/assets/{id}", delete(meme_library::delete_asset))
        .route("/meme-library/assets/{id}/pin", post(meme_library::pin_asset))
        .route("/meme-library/assets/{id}/serve", get(meme_library::serve_asset))
        .route("/meme-library/metadata", get(meme_library::list_metadata).post(meme_library::create_metadata))
        .route("/meme-library/metadata/{id}", delete(meme_library::delete_metadata))
        .route("/meme-library/metadata/{id}/json", get(meme_library::generate_metadata_json))
        .route("/meme-library/metadata/{id}/pin", post(meme_library::pin_metadata_json))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(state.meme_mgr);

    // Bundle routes
    // Rate limit bundle launch: 3 requests per 60 seconds (very expensive on-chain)
    let bundle_launch_limiter = auth::RateLimiter::new(3, Duration::from_secs(60));
    let bundle_launch_route = Router::new()
        .route("/bundles/launch", post(bundle::launch))
        .route_layer(middleware::from_fn_with_state(bundle_launch_limiter, auth::rate_limit))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(state.bundle_state.clone());

    let bundle_routes = Router::new()
        .route("/bundles", get(bundle::list_bundles))
        .route("/bundles/{id}", get(bundle::get_bundle))
        .route("/bundles/collect-fees", post(bundle::collect_fees))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(state.bundle_state)
        .merge(bundle_launch_route);

    // Distribution routes
    // Rate limit distribution execution: 5 requests per 60 seconds (on-chain transfers)
    let dist_execute_limiter = auth::RateLimiter::new(5, Duration::from_secs(60));
    let dist_execute_routes = Router::new()
        .route("/distributions/{id}/execute", post(distribution::execute))
        .route("/distributions/{id}/resume", post(distribution::resume))
        .route_layer(middleware::from_fn_with_state(dist_execute_limiter, auth::rate_limit))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(state.distribution_state.clone());

    let distribution_routes = Router::new()
        .route("/distributions", get(distribution::list_distributions))
        .route("/distributions/plan", post(distribution::create_plan))
        .route("/distributions/{id}", get(distribution::get_distribution))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(state.distribution_state)
        .merge(dist_execute_routes);

    // Profile routes
    let profile_routes = Router::new()
        .route("/profiles", get(profile::list_profiles))
        .route("/profiles/preview", get(profile::preview_random))
        .route("/profiles/randomize", post(profile::randomize_profile))
        .route("/profiles/randomize-batch", post(profile::randomize_batch))
        .route("/profiles/{wallet_id}", get(profile::get_profile).put(profile::update_profile).delete(profile::delete_profile))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(state.profile_state);

    // Stats routes (no auth required — just counts)
    let stats_routes = Router::new()
        .route("/stats", get(stats::get_stats))
        .with_state(state.stats_state);

    // Monitor routes (require unlock)
    let monitor_routes = Router::new()
        .route("/monitor/subscribe", post(monitor::subscribe))
        .route("/monitor/unsubscribe", post(monitor::unsubscribe))
        .route("/monitor/subscriptions", get(monitor::list_subscriptions))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(state.monitor_state.clone());

    // WebSocket route (outside /api/v1 namespace, still requires auth)
    let ws_routes = Router::new()
        .route("/ws/monitor", get(monitor::ws_handler))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(state.monitor_state);

    // Trading routes (require unlock)
    let trading_state = trading::TradingState {
        db: trading_db,
        rpc: trading_rpc,
        master_key: mk.clone(),
    };

    // Rate limit manual swaps: 10 requests per 60 seconds (on-chain txn)
    let swap_limiter = auth::RateLimiter::new(10, Duration::from_secs(60));
    let swap_route = Router::new()
        .route("/trading/swap", post(trading::execute_swap))
        .route_layer(middleware::from_fn_with_state(swap_limiter, auth::rate_limit))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(trading_state.clone());

    // Rate limit bot start/create operations: 10 requests per 60 seconds
    let trading_write_limiter = auth::RateLimiter::new(10, Duration::from_secs(60));
    let trading_write_routes = Router::new()
        .route("/trading/volume", post(trading::create_volume_task))
        .route("/trading/volume/{id}/start", post(trading::start_volume_task))
        .route("/trading/bumper", post(trading::create_bumper_task))
        .route("/trading/bumper/{id}/start", post(trading::start_bumper_task))
        .route("/trading/warmer", post(trading::create_warmer_task))
        .route("/trading/warmer/{id}/start", post(trading::start_warmer_task))
        .route_layer(middleware::from_fn_with_state(trading_write_limiter, auth::rate_limit))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(trading_state.clone());

    // Pump.fun routes
    // Rate limit launch: 3 requests per 60 seconds (expensive on-chain)
    let pump_fun_launch_limiter = auth::RateLimiter::new(3, Duration::from_secs(60));
    let pump_fun_launch_routes = Router::new()
        .route("/trading/pump-fun/{id}/launch", post(trading::execute_pump_fun_launch))
        .route_layer(middleware::from_fn_with_state(pump_fun_launch_limiter, auth::rate_limit))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(trading_state.clone());

    // Rate limit buy/sell: 10 requests per 60 seconds
    let pump_fun_trade_limiter = auth::RateLimiter::new(10, Duration::from_secs(60));
    let pump_fun_trade_routes = Router::new()
        .route("/trading/pump-fun/buy", post(trading::buy_pump_fun_token))
        .route("/trading/pump-fun/sell", post(trading::sell_pump_fun_token))
        .route_layer(middleware::from_fn_with_state(pump_fun_trade_limiter, auth::rate_limit))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(trading_state.clone());

    let pump_fun_routes = Router::new()
        .route("/trading/pump-fun", get(trading::list_pump_fun_launches).post(trading::create_pump_fun_launch))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(trading_state.clone())
        .merge(pump_fun_launch_routes)
        .merge(pump_fun_trade_routes);

    let trading_routes = Router::new()
        .route("/trading/volume", get(trading::list_volume_tasks))
        .route("/trading/volume/{id}/stop", post(trading::stop_volume_task))
        .route("/trading/volume/{id}/stats", get(trading::get_volume_stats))
        .route("/trading/bumper", get(trading::list_bumper_tasks))
        .route("/trading/bumper/{id}/stop", post(trading::stop_bumper_task))
        .route("/trading/warmer", get(trading::list_warmer_tasks))
        .route("/trading/warmer/{id}/stop", post(trading::stop_warmer_task))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(trading_state)
        .merge(trading_write_routes)
        .merge(swap_route)
        .merge(pump_fun_routes);

    // DLQ routes (require unlock)
    let dlq_state = dlq::DlqState {
        db: dlq_db,
    };
    let dlq_routes = Router::new()
        .route("/dlq", get(dlq::list_dlq))
        .route("/dlq/stats", get(dlq::dlq_stats))
        .route("/dlq/{id}", get(dlq::get_dlq_entry))
        .route("/dlq/{id}/dismiss", post(dlq::dismiss_dlq_entry))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(dlq_state);

    // Audit log routes (require unlock)
    let audit_state = audit::AuditState {
        db: audit_db,
    };
    let audit_routes = Router::new()
        .route("/audit", get(audit::list_audit_log))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(audit_state);

    // Detailed health check (require unlock)
    let health_state = health::HealthState {
        db: health_db,
        rpc: health_rpc,
    };
    let health_routes = Router::new()
        .route("/health/detailed", get(health::detailed_health))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(health_state);

    // Store cluster for the health endpoint
    let cluster_str: &'static str = match config.solana_cluster {
        crate::config::SolanaCluster::Mainnet => "mainnet",
        crate::config::SolanaCluster::Devnet => "devnet",
    };
    CLUSTER.get_or_init(|| cluster_str.to_string());

    let api = Router::new()
        .route("/health", get(health_check))
        .route("/metrics", get(crate::metrics::metrics_handler))
        .merge(auth_routes)
        .merge(wallet_routes)
        .merge(wallet_ops_routes)
        .merge(rpc_routes)
        .merge(token_routes)
        .merge(meme_routes)
        .merge(bundle_routes)
        .merge(distribution_routes)
        .merge(profile_routes)
        .merge(monitor_routes)
        .merge(trading_routes)
        .merge(stats_routes)
        .merge(dlq_routes)
        .merge(audit_routes)
        .merge(health_routes);

    Router::new()
        .nest("/api/v1", api)
        .merge(ws_routes)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(middleware::from_fn(crate::metrics::track_http))
}

async fn health_check() -> Json<serde_json::Value> {
    let cluster = CLUSTER.get().map(|s| s.as_str()).unwrap_or("unknown");
    Json(json!({
        "status": "ok",
        "service": "cresus",
        "version": env!("CARGO_PKG_VERSION"),
        "cluster": cluster,
    }))
}
