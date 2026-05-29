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
use tower_http::compression::CompressionLayer;
use tower_http::request_id::{MakeRequestUuid, SetRequestIdLayer, PropagateRequestIdLayer};
use axum::http::{HeaderValue, Method};

use offivex_api::{wallet, rpc_config, token, meme_library, bundle, distribution, profile, monitor, stats, trading, quick_sell, launches, tasks, dlq, health, audit};
use offivex_api::admin_auth::{self, AdminAuthHandlerState};

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
    // Phase 5.5 — clone before state.rpc_mgr is moved later
    let payment_rpc = state.rpc_mgr.clone();

    // ── Shared api_key verification cache (Phase 6 + Section 16) ────────
    // One Arc<DashMap> shared between ApiKeyAuthState (middleware reads/writes)
    // and AdminHandlerState (admin revoke/rotate/suspend handlers clear it).
    // Created early so it can be cloned into each data-plane sub-router for
    // the triple-stack gating (require_api_key → require_active_plan → require_unlocked).
    let api_key_cache: offivex_api::admin::ApiKeyCacheRef =
        std::sync::Arc::new(dashmap::DashMap::new());
    // Audit SEC-MAX-4 — brute-force lockout map (per-prefix counter).
    let api_key_lockout: auth::PrefixLockoutMap =
        std::sync::Arc::new(dashmap::DashMap::new());
    let api_key_auth_state = auth::ApiKeyAuthState {
        db: state.db.clone(),
        cache: api_key_cache.clone(),
        lockout: api_key_lockout,
    };

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
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(state.wallet_mgr.clone());

    // Wallet operations requiring RPC with rate limiting
    // Rate limit balance checks: 30 requests per 60 seconds
    let balance_limiter = auth::RateLimiter::new(30, Duration::from_secs(60));
    let balance_route = Router::new()
        .route("/wallets/{id}/balance", get(wallet::get_wallet_balance))
        .route_layer(middleware::from_fn_with_state(balance_limiter, auth::rate_limit))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state((state.wallet_mgr.clone(), state.rpc_mgr.clone()));

    // Rate limit send operations: 10 requests per 60 seconds (stricter)
    let send_limiter = auth::RateLimiter::new(10, Duration::from_secs(60));
    let send_route = Router::new()
        .route("/wallets/{id}/send", post(wallet::send_from_wallet))
        .route_layer(middleware::from_fn_with_state(send_limiter, auth::rate_limit))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state((state.wallet_mgr.clone(), state.rpc_mgr.clone()));

    let wallet_ops_routes = balance_route.merge(send_route);

    // RPC management routes
    let rpc_routes = Router::new()
        .route("/rpc", get(rpc_config::list_endpoints).post(rpc_config::add_endpoint))
        .route("/rpc/{id}", delete(rpc_config::delete_endpoint))
        .route("/rpc/{id}/active", put(rpc_config::set_active))
        .route("/rpc/health", post(rpc_config::health_check))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(state.rpc_mgr);

    // Token routes
    // Rate limit minting: 5 requests per 60 seconds (expensive on-chain operation)
    let mint_limiter = auth::RateLimiter::new(5, Duration::from_secs(60));
    let token_mint_route = Router::new()
        .route("/tokens/mint", post(token::mint_token))
        // Post-mint mint-authority revocation. Same rate limit as mint
        // (it's also an on-chain tx). Doesn't need a body — uses the
        // creator wallet stored on the token row.
        .route(
            "/tokens/{mint}/revoke-mint-authority",
            post(token::revoke_mint_authority),
        )
        .route_layer(middleware::from_fn_with_state(mint_limiter, auth::rate_limit))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(state.token_state.clone());

    let token_routes = Router::new()
        .route("/tokens", get(token::list_tokens))
        .route("/tokens/clone-info", post(token::clone_info))
        .route("/tokens/vanity/start", post(token::vanity_start))
        .route("/tokens/vanity/{task_id}", get(token::vanity_status))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
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
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(state.meme_mgr);

    // Bundle routes
    // Rate limit bundle launch: 3 requests per 60 seconds (very expensive on-chain)
    let bundle_launch_limiter = auth::RateLimiter::new(3, Duration::from_secs(60));
    let bundle_launch_route = Router::new()
        .route("/bundles/launch", post(bundle::launch))
        .route_layer(middleware::from_fn_with_state(bundle_launch_limiter, auth::rate_limit))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(state.bundle_state.clone());

    let bundle_routes = Router::new()
        .route("/bundles", get(bundle::list_bundles))
        .route("/bundles/{id}", get(bundle::get_bundle))
        .route("/bundles/collect-fees", post(bundle::collect_fees))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
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
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(state.distribution_state.clone());

    let distribution_routes = Router::new()
        .route("/distributions", get(distribution::list_distributions))
        .route("/distributions/plan", post(distribution::create_plan))
        .route("/distributions/{id}", get(distribution::get_distribution))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
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
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(state.profile_state);

    // Stats routes (no auth required — just counts).
    // Bloc B — `/stats/history` is on the same router with the same StatsState.
    let pnl_db = state.stats_state.db.clone();
    let stats_routes = Router::new()
        .route("/stats", get(stats::get_stats))
        .route("/stats/history", get(stats::get_stats_history))
        .with_state(state.stats_state);

    // PNL routes — gated by the dedicated `OFFIVEX_BOT_PNL_TOKEN` (NOT the
    // user-facing api_key chain). Auth is done inline in each handler via
    // constant-time bearer compare. Routes are skipped entirely when the
    // token isn't configured (zero attack surface in dev).
    let pnl_routes_opt = config.bot_pnl_token.as_ref().map(|tok| {
        let pnl_state = stats::PnlBotState {
            db: pnl_db,
            bot_token: tok.clone(),
        };
        Router::new()
            .route("/pnl/recent", get(stats::get_recent_pnl_events))
            .route("/pnl/{id}/ack", post(stats::ack_pnl_event))
            .with_state(pnl_state)
    });

    // Monitor routes (require unlock)
    let monitor_routes = Router::new()
        .route("/monitor/subscribe", post(monitor::subscribe))
        .route("/monitor/unsubscribe", post(monitor::unsubscribe))
        .route("/monitor/subscriptions", get(monitor::list_subscriptions))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(state.monitor_state.clone());

    // WebSocket route (outside /api/v1 namespace).
    // Auth handled inside the handler via ?token=<api_key> query param —
    // browsers cannot send Authorization headers for WS upgrades. The handler
    // re-uses the same Argon2 verify + active-plan check as the HTTP
    // require_api_key + require_active_plan middlewares.
    // We do NOT layer require_unlocked here: WS events are public on-chain
    // data forwarded from the watcher; the handler doesn't decrypt any wallet
    // material itself.
    let ws_routes = Router::new()
        .route("/ws/monitor", get(monitor::ws_handler))
        .with_state(offivex_api::monitor::WsHandlerState {
            monitor: state.monitor_state.clone(),
            db: state.db.clone(),
        });

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
        // Quick-sell keybind panic-button: each call fans out to N wallets
        // server-side, so one HTTP call = one user "panic press". 10/min
        // matches the manual swap budget — enough for genuine retries, low
        // enough to detect a stuck keybind firing in a loop.
        .route("/trading/quick-sell", post(quick_sell::quick_sell))
        .route_layer(middleware::from_fn_with_state(swap_limiter, auth::rate_limit))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
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
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(trading_state.clone());

    // Pump.fun routes
    // Rate limit launch: 3 requests per 60 seconds (expensive on-chain)
    let pump_fun_launch_limiter = auth::RateLimiter::new(3, Duration::from_secs(60));
    let pump_fun_launch_routes = Router::new()
        .route("/trading/pump-fun/{id}/launch", post(trading::execute_pump_fun_launch))
        .route_layer(middleware::from_fn_with_state(pump_fun_launch_limiter, auth::rate_limit))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(trading_state.clone());

    // Rate limit buy/sell: 10 requests per 60 seconds
    let pump_fun_trade_limiter = auth::RateLimiter::new(10, Duration::from_secs(60));
    let pump_fun_trade_routes = Router::new()
        .route("/trading/pump-fun/buy", post(trading::buy_pump_fun_token))
        .route("/trading/pump-fun/sell", post(trading::sell_pump_fun_token))
        .route_layer(middleware::from_fn_with_state(pump_fun_trade_limiter, auth::rate_limit))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(trading_state.clone());

    let pump_fun_routes = Router::new()
        .route("/trading/pump-fun", get(trading::list_pump_fun_launches).post(trading::create_pump_fun_launch))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
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
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(trading_state.clone())
        .merge(trading_write_routes)
        .merge(swap_route)
        .merge(pump_fun_routes);

    // Launch dashboard — bundled GET endpoint that aggregates token details,
    // per-wallet holders, tasks filtered by mint, bonding curve state, and
    // recent activity from the event bus in one server-side parallel call.
    // Triple middleware: api_key → active_plan → unlocked, like the other
    // trading reads.
    let launches_state = launches::LaunchesState {
        db: trading_state.db.clone(),
        rpc: trading_state.rpc.clone(),
        event_bus: state.monitor_state.event_bus.clone(),
    };
    let launches_routes = Router::new()
        .route("/launches/{mint}/dashboard", get(launches::get_dashboard))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(launches_state);

    // Tasks (launch templates) — Kinesis-style Mint Task / Bundle Task /
    // Pump-Fun Task. Routes are READ-mostly so we keep them off the
    // require_unlocked layer; the actual on-chain execute still goes
    // through the canonical launch endpoints (which DO require unlock).
    let tasks_state = tasks::TasksState {
        db: trading_state.db.clone(),
    };
    // Tasks routes split into read (GET) and write (POST/DELETE) so the
    // mutation surface (create + delete + execute) is gated on
    // `require_unlocked`. Pre-refactor the entire group was off the unlock
    // layer with a comment claiming "actual execution goes through canonical
    // launch endpoints" — but the comment was wrong: /tasks/{id}/execute IS
    // the canonical entry, and `tasks::create` mutates the template store
    // too. Both are now behind unlock; reads stay open so the templates list
    // remains visible while the vault is locked.
    let tasks_read_routes = Router::new()
        .route("/tasks", get(tasks::list))
        .route("/tasks/{id}", get(tasks::get))
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(tasks_state.clone());

    let tasks_write_routes = Router::new()
        .route("/tasks", post(tasks::create))
        .route("/tasks/{id}", delete(tasks::delete))
        .route("/tasks/{id}/execute", post(tasks::execute))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(tasks_state);

    let tasks_routes = tasks_read_routes.merge(tasks_write_routes);

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
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(dlq_state);

    // Audit log routes (require unlock)
    let audit_state = audit::AuditState {
        db: audit_db,
    };
    let audit_routes = Router::new()
        .route("/audit", get(audit::list_audit_log))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .route_layer(middleware::from_fn(auth::require_active_plan))
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(audit_state);

    // Detailed health check — kept under `require_unlocked` only (admin diagnostic
    // endpoint, not a paying-user feature). The sidebar cluster badge uses the
    // public `/health` endpoint at line ~580.
    let health_state = health::HealthState {
        db: health_db,
        rpc: health_rpc,
    };
    let health_routes = Router::new()
        .route("/health/detailed", get(health::detailed_health))
        .route_layer(middleware::from_fn_with_state(mk.clone(), auth::require_unlocked))
        .with_state(health_state);

    // ── Admin authentication (Phase 1 user-mgmt) ────────────────────────
    let admin_auth_handler_state = AdminAuthHandlerState {
        db: state.db.clone(),
        session_ttl_secs: config.admin_session_ttl_secs,
    };
    let admin_mw_state = auth::AdminAuthState {
        db: state.db.clone(),
        session_ttl_secs: config.admin_session_ttl_secs,
    };

    // Login is public + rate-limited (brute-force protection)
    let admin_login_limiter = auth::RateLimiter::new(5, Duration::from_secs(60));
    let admin_login_route = Router::new()
        .route("/admin/login", post(admin_auth::admin_login))
        .route_layer(middleware::from_fn_with_state(admin_login_limiter, auth::rate_limit))
        .with_state(admin_auth_handler_state.clone());

    // Logout + me require a valid admin session
    let admin_session_routes = Router::new()
        .route("/admin/logout", post(admin_auth::admin_logout))
        .route("/admin/me", get(admin_auth::admin_me))
        .route_layer(middleware::from_fn_with_state(
            admin_mw_state.clone(),
            auth::require_admin,
        ))
        .with_state(admin_auth_handler_state);

    let admin_routes = admin_login_route.merge(admin_session_routes);

    // ── Admin apply management (Phase 4) + payments list (Phase 6) ──────
    let admin_handler_state = offivex_api::admin::AdminHandlerState {
        db: state.db.clone(),
        api_key_cache: api_key_cache.clone(),
        // OPS-MAX-4 — Arc<WatcherHealth> implements WatcherHealthRead so it
        // can be erased to the trait object.
        watcher_health: state.watcher_health.clone()
            as offivex_api::admin::WatcherHealthRef,
        treasury_pubkey: state.treasury_pubkey.to_string(),
        wallet_mgr: state.wallet_mgr.clone(),
        // Same Arc as `user_handler_state.plan_cache` so a /admin/plans/reload
        // write is visible to user-side reads on the very next request.
        plan_cache: state.plan_cache.clone(),
    };
    let admin_apply_routes = Router::new()
        .route("/admin/applies", get(offivex_api::admin::list_applies))
        .route(
            "/admin/applies/{id}/approve",
            post(offivex_api::admin::approve_apply),
        )
        .route(
            "/admin/applies/{id}/reject",
            post(offivex_api::admin::reject_apply),
        )
        .route("/admin/stats", get(offivex_api::admin::dashboard_stats))
        .route("/admin/payments", get(offivex_api::admin::list_payments))
        // Section 16 — admin user management A→Z
        .route("/admin/users", get(offivex_api::admin::list_users))
        .route(
            "/admin/users/{user_id}",
            get(offivex_api::admin::get_user_detail).patch(offivex_api::admin::update_user),
        )
        .route(
            "/admin/users/{user_id}/grant",
            post(offivex_api::admin::grant_user_access),
        )
        .route(
            "/admin/users/{user_id}/rotate-key",
            post(offivex_api::admin::rotate_user_api_key),
        )
        .route(
            "/admin/users/{user_id}/revoke-key",
            post(offivex_api::admin::revoke_user_api_key),
        )
        // OPS-MAX-4 — watcher health visibility
        .route(
            "/admin/watcher-status",
            get(offivex_api::admin::watcher_status),
        )
        // Wallet vault master password rotation (re-encrypts all wallets).
        .route(
            "/admin/master-password/change",
            post(offivex_api::admin::change_master_password),
        )
        // Plan cache reload — bumps the in-memory price map after a plan
        // edit so user-side billing reads see fresh prices immediately.
        .route(
            "/admin/plans/reload",
            post(offivex_api::admin::reload_plan_cache),
        )
        .route_layer(middleware::from_fn_with_state(
            admin_mw_state.clone(),
            auth::require_admin,
        ))
        .with_state(admin_handler_state);

    // ── User /me + billing + referral routes (Phase 6 + Phase 6.5) ──────
    let user_handler_state = offivex_api::user::UserHandlerState {
        db: state.db.clone(),
        plan_cache: state.plan_cache.clone(),
    };
    let user_routes = Router::new()
        .route("/user/me", get(offivex_api::user::user_me))
        .route(
            "/user/billing/payments",
            get(offivex_api::user::user_billing_payments),
        )
        .route(
            "/user/billing/subscription",
            get(offivex_api::user::user_billing_subscription),
        )
        .route(
            "/user/referral/code",
            get(offivex_api::user::user_referral_code),
        )
        .route(
            "/user/referral/stats",
            get(offivex_api::user::user_referral_stats),
        )
        .route(
            "/user/referral/list",
            get(offivex_api::user::user_referral_list),
        )
        .route_layer(middleware::from_fn_with_state(
            api_key_auth_state.clone(),
            auth::require_api_key,
        ))
        .with_state(user_handler_state);

    // ── Public apply endpoint (Phase 4) ─────────────────────────────────
    // Rate-limited 3/3600s to match the legacy Next.js per-IP cap.
    let apply_handler_state = offivex_api::apply::ApplyHandlerState {
        db: state.db.clone(),
        telegram: offivex_api::apply::TelegramConfig {
            bot_token: config.telegram_bot_token.clone(),
            chat_id: config.telegram_chat_id.clone(),
        },
    };
    let apply_limiter = auth::RateLimiter::new(3, Duration::from_secs(3600));
    let apply_routes = Router::new()
        .route("/apply", post(offivex_api::apply::submit_apply))
        .route_layer(middleware::from_fn_with_state(apply_limiter, auth::rate_limit))
        .with_state(apply_handler_state);

    // ── Payment invoice routes (Phase 5.5) ──────────────────────────────
    let payment_handler_state = offivex_api::payment::PaymentHandlerState {
        db: state.db.clone(),
        rpc: std::sync::Arc::new(payment_rpc),
        treasury_seed: state.treasury_seed.clone(),
        treasury_pubkey: state.treasury_pubkey,
        default_invoice_ttl_secs: config.invoice_ttl_secs,
    };
    // Admin issues invoices for users (require_admin)
    let admin_invoice_routes = Router::new()
        .route(
            "/admin/users/{user_id}/invoices",
            post(offivex_api::payment::admin_create_invoice),
        )
        .route_layer(middleware::from_fn_with_state(
            admin_mw_state.clone(),
            auth::require_admin,
        ))
        .with_state(payment_handler_state.clone());
    // Public: invoice info + status polling (invoice_id IS the auth)
    let public_invoice_routes = Router::new()
        .route("/pay/{invoice_id}", get(offivex_api::payment::get_invoice_public))
        .route(
            "/pay/{invoice_id}/status",
            get(offivex_api::payment::get_invoice_status),
        )
        .with_state(payment_handler_state);

    // Store cluster for the health endpoint
    let cluster_str: &'static str = match config.solana_cluster {
        crate::config::SolanaCluster::Mainnet => "mainnet",
        crate::config::SolanaCluster::Devnet => "devnet",
    };
    CLUSTER.get_or_init(|| cluster_str.to_string());

    // Audit OPS-MAX-3 — /readyz sub-router with its own state.
    let readyz_state = ReadyzState {
        db: state.db.clone(),
        master_key: mk.clone(),
        treasury_pubkey_set: !state.treasury_pubkey.to_string().is_empty(),
    };
    let readyz_route = Router::new()
        .route("/readyz", get(readyz_handler))
        .with_state(readyz_state);

    let mut api = Router::new()
        .route("/health", get(health_check))
        .route("/metrics", get(crate::metrics::metrics_handler))
        .merge(readyz_route)
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
        .merge(launches_routes)
        .merge(tasks_routes)
        .merge(stats_routes)
        .merge(dlq_routes)
        .merge(audit_routes)
        .merge(health_routes)
        .merge(admin_routes)
        .merge(admin_apply_routes)
        .merge(apply_routes)
        .merge(admin_invoice_routes)
        .merge(public_invoice_routes)
        .merge(user_routes);
    if let Some(pnl_routes) = pnl_routes_opt {
        api = api.merge(pnl_routes);
        tracing::info!("PNL bot routes mounted at /api/v1/pnl/*");
    }

    Router::new()
        .nest("/api/v1", api)
        .merge(ws_routes)
        // Layer order matters (outer → inner):
        // 1. SetRequestIdLayer — generate UUID per request, attach to headers
        // 2. TraceLayer — span carries the request_id via header
        // 3. CompressionLayer — gzip responses > ~1KB
        // 4. CorsLayer
        // 5. metrics + slow-query middleware (inner-most so it measures handler time only)
        .layer(cors)
        .layer(CompressionLayer::new())                     // PERF-MAX-2
        .layer(TraceLayer::new_for_http())
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))  // OPS-MAX-2
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(middleware::from_fn(crate::metrics::track_http))
        .layer(middleware::from_fn(crate::metrics::slow_query_log))  // PERF-MAX-3
}

async fn health_check() -> Json<serde_json::Value> {
    let cluster = CLUSTER.get().map(|s| s.as_str()).unwrap_or("unknown");
    Json(json!({
        "status": "ok",
        "service": "Offivex",
        "version": env!("CARGO_PKG_VERSION"),
        "cluster": cluster,
    }))
}

// ─── Audit OPS-MAX-3 — readyz endpoint ─────────────────────────────────────

/// Readiness check state. Distinct from liveness (/health) because k8s/Caddy
/// should route traffic ONLY when ready (DB writable + MEK loaded + treasury
/// set), but should NOT kill the process unless /health fails.
#[derive(Clone)]
struct ReadyzState {
    db: std::sync::Arc<tokio_rusqlite::Connection>,
    master_key: auth::MasterKeyState,
    treasury_pubkey_set: bool,
}

async fn readyz_handler(
    axum::extract::State(state): axum::extract::State<ReadyzState>,
) -> axum::response::Response {
    use axum::response::IntoResponse;
    let mut checks = serde_json::Map::new();
    let mut all_ok = true;

    // 1. DB ping
    let db_ok = state
        .db
        .call(|c| {
            c.query_row("SELECT 1", [], |r| r.get::<_, i64>(0))?;
            Ok(())
        })
        .await
        .is_ok();
    checks.insert("db".into(), serde_json::Value::Bool(db_ok));
    if !db_ok { all_ok = false; }

    // 2. MEK loaded?
    let mek_ok = state.master_key.read().await.is_some();
    checks.insert("mek_unlocked".into(), serde_json::Value::Bool(mek_ok));
    if !mek_ok { all_ok = false; }

    // 3. Treasury pubkey set at boot?
    checks.insert(
        "treasury_pubkey_set".into(),
        serde_json::Value::Bool(state.treasury_pubkey_set),
    );
    if !state.treasury_pubkey_set { all_ok = false; }

    let status = if all_ok {
        axum::http::StatusCode::OK
    } else {
        axum::http::StatusCode::SERVICE_UNAVAILABLE
    };
    (
        status,
        Json(json!({
            "ready": all_ok,
            "checks": serde_json::Value::Object(checks),
        })),
    )
        .into_response()
}
