use axum::{
    extract::State,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use std::sync::Arc;
use tokio_rusqlite::Connection;

#[derive(Clone)]
pub struct StatsState {
    pub db: Arc<Connection>,
}

/// GET /api/v1/stats — Dashboard overview stats.
pub async fn get_stats(State(state): State<StatsState>) -> Response {
    let db = state.db.clone();

    let result = db
        .call(move |c| {
            let wallet_count: i64 = c
                .query_row("SELECT COUNT(*) FROM wallets", [], |r| r.get(0))
                .unwrap_or(0);
            let token_count: i64 = c
                .query_row("SELECT COUNT(*) FROM tokens", [], |r| r.get(0))
                .unwrap_or(0);
            let bundle_count: i64 = c
                .query_row("SELECT COUNT(*) FROM bundles", [], |r| r.get(0))
                .unwrap_or(0);
            let bundle_confirmed: i64 = c
                .query_row(
                    "SELECT COUNT(*) FROM bundles WHERE status = 'confirmed'",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            let distribution_count: i64 = c
                .query_row("SELECT COUNT(*) FROM distributions", [], |r| r.get(0))
                .unwrap_or(0);
            let profile_count: i64 = c
                .query_row("SELECT COUNT(*) FROM wallet_profiles", [], |r| r.get(0))
                .unwrap_or(0);
            let rpc_count: i64 = c
                .query_row(
                    "SELECT COUNT(*) FROM rpc_endpoints WHERE is_active = 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            let asset_count: i64 = c
                .query_row("SELECT COUNT(*) FROM meme_assets", [], |r| r.get(0))
                .unwrap_or(0);

            Ok(json!({
                "wallets": wallet_count,
                "tokens": token_count,
                "bundles": bundle_count,
                "bundles_confirmed": bundle_confirmed,
                "distributions": distribution_count,
                "profiles": profile_count,
                "rpc_endpoints_active": rpc_count,
                "meme_assets": asset_count,
            }))
        })
        .await;

    match result {
        Ok(data) => Json(json!({ "success": true, "data": data })).into_response(),
        Err(e) => {
            tracing::error!("Stats query error: {:?}", e);
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to fetch stats" })),
            )
                .into_response()
        }
    }
}
