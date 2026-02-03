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

use cresus_api::{wallet, rpc_config, token, meme_library, bundle, distribution, profile, monitor, stats};

use crate::auth;
use crate::state::AppState;

/// Build the complete API router.
pub fn build_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list([
            "http://localhost:3000".parse::<HeaderValue>().unwrap(),
            "http://127.0.0.1:3000".parse::<HeaderValue>().unwrap(),
        ]))
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        .allow_headers(tower_http::cors::Any);

    let mk = state.master_key.clone();

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
        .with_state(state.wallet_mgr);

    // RPC management routes
    let rpc_routes = Router::new()
        .route("/rpc", get(rpc_config::list_endpoints).post(rpc_config::add_endpoint))
        .route("/rpc/{id}", delete(rpc_config::delete_endpoint))
        .route("/rpc/{id}/active", put(rpc_config::set_active))
        .route("/rpc/health", post(rpc_config::health_check))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(state.rpc_mgr);

    // Token routes
    let token_routes = Router::new()
        .route("/tokens", get(token::list_tokens))
        .route("/tokens/mint", post(token::mint_token))
        .route("/tokens/clone-info", post(token::clone_info))
        .route("/tokens/vanity/start", post(token::vanity_start))
        .route("/tokens/vanity/{task_id}", get(token::vanity_status))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(state.token_state);

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
    let bundle_routes = Router::new()
        .route("/bundles", get(bundle::list_bundles))
        .route("/bundles/{id}", get(bundle::get_bundle))
        .route("/bundles/launch", post(bundle::launch))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(state.bundle_state);

    // Distribution routes
    let distribution_routes = Router::new()
        .route("/distributions", get(distribution::list_distributions))
        .route("/distributions/plan", post(distribution::create_plan))
        .route("/distributions/{id}", get(distribution::get_distribution))
        .route("/distributions/{id}/execute", post(distribution::execute))
        .route("/distributions/{id}/resume", post(distribution::resume))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(state.distribution_state);

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

    let api = Router::new()
        .route("/health", get(health_check))
        .merge(auth_routes)
        .merge(wallet_routes)
        .merge(rpc_routes)
        .merge(token_routes)
        .merge(meme_routes)
        .merge(bundle_routes)
        .merge(distribution_routes)
        .merge(profile_routes)
        .merge(monitor_routes)
        .merge(stats_routes);

    Router::new()
        .nest("/api/v1", api)
        .merge(ws_routes)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
}

async fn health_check() -> Json<serde_json::Value> {
    Json(json!({
        "status": "ok",
        "service": "cresus",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}
