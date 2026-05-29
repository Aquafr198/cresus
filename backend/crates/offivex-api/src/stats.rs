use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tokio_rusqlite::Connection;
// tokio-rusqlite re-exports rusqlite::*, so we can alias for the macros.
use tokio_rusqlite as rusqlite;

use offivex_db::repo::pnl_repo::PnlRepo;

#[derive(Clone)]
pub struct StatsState {
    pub db: Arc<Connection>,
}

/// State shared by the bot-token-gated PNL endpoints. Kept in its own struct
/// so the bot token never lives on the general `StatsState` (defence in
/// depth — a bug routing PNL state into a user-facing handler still won't
/// leak the secret).
#[derive(Clone)]
pub struct PnlBotState {
    pub db: Arc<Connection>,
    pub bot_token: String,
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

// ───────────────────────────────────────────────────────────────────────
// Stats history endpoint (Bloc B) — time-series for the Kinesis dashboard.
// ───────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    /// Window size in days. Defaults to 30. Capped at 90.
    #[serde(default)]
    pub period: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct StatsReport {
    pub current: f64,
    pub previous: f64,
    pub delta_pct: f64,
    /// Daily values, length = period_days. Index 0 = oldest day, last = today.
    pub sparkline: Vec<f64>,
}

#[derive(Debug, Serialize)]
pub struct MintHistoryPoint {
    pub day: String,    // "YYYY-MM-DD"
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct EarningsReport {
    pub last_30d_cents: i64,
    pub today_cents: i64,
    pub sparkline: Vec<f64>,
}

#[derive(Debug, Serialize)]
pub struct StatsHistoryView {
    pub period_days: u32,
    pub coin_report: StatsReport,
    pub volume_report: StatsReport,
    pub earnings: EarningsReport,
    pub mint_history: Vec<MintHistoryPoint>,
}

/// GET /api/v1/stats/history?period=30 — daily aggregations for the dashboard.
///
/// Returns 4 series for the last `period` days (default 30, cap 90) :
///   * coin_report     — count of tokens minted per day + total + delta vs prior period
///   * volume_report   — sum of distribution SOL per day + total + delta vs prior period
///   * earnings        — referral earnings (Phase 6.5) — today + last 30d
///   * mint_history    — daily count for the bottom chart (always 30 points)
///
/// All queries are indexed (`tokens.created_at`, `distributions.created_at`).
/// Empty/missing days are zero-filled so the sparkline always has `period` points.
pub async fn get_stats_history(
    State(state): State<StatsState>,
    Query(q): Query<HistoryQuery>,
) -> Response {
    let period = q.period.unwrap_or(30).clamp(7, 90);
    let db = state.db.clone();

    let result = db
        .call(move |c| {
            // Compute boundaries (UTC day buckets).
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            let day_secs: i64 = 86_400;
            // Start of TODAY in UTC. Bucketing uses date() not strftime to align with this.
            let today_midnight = (now / day_secs) * day_secs;
            let window_start = today_midnight - (period as i64 - 1) * day_secs;
            let prev_window_start = window_start - period as i64 * day_secs;

            // ── 1. Coin report (tokens minted) ──
            // Audit PERF — query the larger of `period` and the fixed 30-day
            // mint_history window. Both sparklines are derived from the same
            // HashMap below, eliminating the previously-duplicated aggregation.
            let mint_days_back: i64 = 30;
            let mint_window_start = today_midnight - (mint_days_back - 1) * day_secs;
            let tokens_query_start = window_start.min(mint_window_start);
            let tokens_per_day: std::collections::HashMap<String, f64> = {
                let mut stmt = c.prepare(
                    "SELECT date(created_at, 'unixepoch') AS d, CAST(COUNT(*) AS REAL)
                     FROM tokens WHERE created_at >= ?1 GROUP BY d",
                )?;
                stmt.query_map(rusqlite::params![tokens_query_start], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?))
                })?
                .filter_map(Result::ok)
                .collect()
            };
            let prev_tokens_total: f64 = c.query_row(
                "SELECT CAST(COUNT(*) AS REAL) FROM tokens
                 WHERE created_at >= ?1 AND created_at < ?2",
                rusqlite::params![prev_window_start, window_start],
                |r| r.get(0),
            ).unwrap_or(0.0);

            // ── 2. Volume report (distributions SOL) ──
            let volume_per_day: std::collections::HashMap<String, f64> = {
                let mut stmt = c.prepare(
                    "SELECT date(created_at, 'unixepoch') AS d,
                            CAST(COALESCE(SUM(total_sol), 0) AS REAL) / 1.0e9
                     FROM distributions WHERE created_at >= ?1 GROUP BY d",
                )?;
                stmt.query_map(rusqlite::params![window_start], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?))
                })?
                .filter_map(Result::ok)
                .collect()
            };
            let prev_volume_total: f64 = c.query_row(
                "SELECT CAST(COALESCE(SUM(total_sol), 0) AS REAL) / 1.0e9 FROM distributions
                 WHERE created_at >= ?1 AND created_at < ?2",
                rusqlite::params![prev_window_start, window_start],
                |r| r.get(0),
            ).unwrap_or(0.0);

            // ── 3. Mint history (last 30 days, always) — derived from the
            // same `tokens_per_day` HashMap built above to avoid a duplicate
            // aggregation. `mint_window_start` was already computed in §1.

            // Build zero-filled daily arrays.
            let mut coin_sparkline: Vec<f64> = Vec::with_capacity(period as usize);
            let mut volume_sparkline: Vec<f64> = Vec::with_capacity(period as usize);
            let mut mint_history: Vec<MintHistoryPoint> = Vec::with_capacity(30);

            for i in 0..(period as i64) {
                let day_ts = window_start + i * day_secs;
                let day_str = format_date(day_ts);
                coin_sparkline.push(*tokens_per_day.get(&day_str).unwrap_or(&0.0));
                volume_sparkline.push(*volume_per_day.get(&day_str).unwrap_or(&0.0));
            }
            for i in 0..mint_days_back {
                let day_ts = mint_window_start + i * day_secs;
                let day_str = format_date(day_ts);
                let count = *tokens_per_day.get(&day_str).unwrap_or(&0.0) as i64;
                mint_history.push(MintHistoryPoint { day: day_str, count });
            }

            let coin_current: f64 = coin_sparkline.iter().sum();
            let volume_current: f64 = volume_sparkline.iter().sum();

            // Earnings: Phase 6.5 referral aggregation is per-user; for the
            // dashboard we expose 0/0/[] until a per-user route is wired
            // (the per-user data is already served by /user/referral/stats).
            // The frontend can call BOTH and merge if needed.
            let earnings = EarningsReport {
                last_30d_cents: 0,
                today_cents: 0,
                sparkline: vec![0.0; 30],
            };

            Ok(StatsHistoryView {
                period_days: period,
                coin_report: StatsReport {
                    current: coin_current,
                    previous: prev_tokens_total,
                    delta_pct: pct_change(coin_current, prev_tokens_total),
                    sparkline: coin_sparkline,
                },
                volume_report: StatsReport {
                    current: volume_current,
                    previous: prev_volume_total,
                    delta_pct: pct_change(volume_current, prev_volume_total),
                    sparkline: volume_sparkline,
                },
                earnings,
                mint_history,
            })
        })
        .await;

    match result {
        Ok(view) => Json(json!({ "success": true, "data": view })).into_response(),
        Err(e) => {
            tracing::error!(error = ?e, "stats history query failed");
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Failed to fetch stats history" })),
            )
                .into_response()
        }
    }
}

/// `unix_ts` → `"YYYY-MM-DD"` UTC.
fn format_date(unix_ts: i64) -> String {
    // Naive UTC conversion (no time-of-day) using day-since-epoch arithmetic.
    // Matches SQLite's `date(?, 'unixepoch')` behavior bit-for-bit.
    let days_since_epoch = unix_ts / 86_400;
    // 1970-01-01 was day 0 — use the standard Civil-from-Days algorithm
    // (Howard Hinnant, "date.h"). Constant-time, no external deps.
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

fn pct_change(current: f64, previous: f64) -> f64 {
    if previous == 0.0 {
        if current == 0.0 { 0.0 } else { 100.0 }
    } else {
        ((current - previous) / previous) * 100.0
    }
}

// ───────────────────────── Realized PNL events (bot) ─────────────────────────

#[derive(Debug, Deserialize)]
pub struct PnlRecentQuery {
    #[serde(default)]
    pub after_id: Option<i64>,
    #[serde(default)]
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct PnlEventView {
    pub id: i64,
    pub bundle_id: String,
    pub token_mint: String,
    pub token_symbol: Option<String>,
    pub creator_wallet: String,
    pub invested_sol: f64,
    pub sold_sol: f64,
    pub pnl_sol: f64,
    pub multiplier: f64,
    pub invested_usd: Option<f64>,
    pub sold_usd: Option<f64>,
    pub detected_at: i64,
}

/// Constant-time bearer-token check used by both PNL handlers. Returns the
/// `StatsState`-equivalent (a `&PnlBotState`) on success or a 401 Response
/// otherwise. We use `subtle::ConstantTimeEq` via byte-by-byte comparison
/// to keep the check side-channel-free.
fn check_bot_token(headers: &axum::http::HeaderMap, expected: &str) -> Option<()> {
    let header = headers.get(axum::http::header::AUTHORIZATION)?.to_str().ok()?;
    let token = header.strip_prefix("Bearer ")?;
    if token.len() != expected.len() {
        return None;
    }
    let mut diff = 0u8;
    for (a, b) in token.as_bytes().iter().zip(expected.as_bytes()) {
        diff |= a ^ b;
    }
    if diff == 0 { Some(()) } else { None }
}

fn lamports_to_sol(s: &str) -> f64 {
    s.parse::<i128>().unwrap_or(0) as f64 / 1_000_000_000.0
}

/// GET /api/v1/pnl/recent?after_id=…&limit=… — unposted profitable sells.
///
/// Auth: `Authorization: Bearer <OFFIVEX_BOT_PNL_TOKEN>`. Returns up to
/// `limit` (default 20, max 100) rows in `id ASC` order. Consumed by the
/// Discord bot poller.
pub async fn get_recent_pnl_events(
    State(state): State<PnlBotState>,
    headers: axum::http::HeaderMap,
    Query(q): Query<PnlRecentQuery>,
) -> Response {
    if check_bot_token(&headers, &state.bot_token).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(json!({"success": false, "error": "unauthorized"})))
            .into_response();
    }
    let after = q.after_id.unwrap_or(0);
    let limit = q.limit.unwrap_or(20);
    let rows = match PnlRepo::list_unposted_after(&state.db, after, limit).await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("pnl list failed: {e:?}");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"success": false, "error": "db error"})),
            )
                .into_response();
        }
    };
    let data: Vec<PnlEventView> = rows
        .into_iter()
        .map(|r| {
            let invested_sol = lamports_to_sol(&r.invested_sol_lamports);
            let sold_sol = lamports_to_sol(&r.sold_sol_lamports);
            let pnl_sol = lamports_to_sol(&r.pnl_sol_lamports);
            let multiplier = (r.pnl_multiplier_x100 as f64) / 100.0;
            let (invested_usd, sold_usd) = match r.sol_usd_rate_cents {
                Some(c) => {
                    let usd = c as f64 / 100.0;
                    (Some(invested_sol * usd), Some(sold_sol * usd))
                }
                None => (None, None),
            };
            PnlEventView {
                id: r.id,
                bundle_id: r.bundle_id,
                token_mint: r.token_mint,
                token_symbol: r.token_symbol,
                creator_wallet: r.creator_wallet,
                invested_sol,
                sold_sol,
                pnl_sol,
                multiplier,
                invested_usd,
                sold_usd,
                detected_at: r.detected_at,
            }
        })
        .collect();
    Json(json!({"success": true, "data": data})).into_response()
}

/// POST /api/v1/pnl/:id/ack — mark event as posted (idempotent). Called by
/// the bot after a successful Discord channel post.
pub async fn ack_pnl_event(
    State(state): State<PnlBotState>,
    headers: axum::http::HeaderMap,
    Path(id): Path<i64>,
) -> Response {
    if check_bot_token(&headers, &state.bot_token).is_none() {
        return (StatusCode::UNAUTHORIZED, Json(json!({"success": false, "error": "unauthorized"})))
            .into_response();
    }
    let now = chrono::Utc::now().timestamp();
    if let Err(e) = PnlRepo::mark_posted(&state.db, id, now).await {
        tracing::error!("pnl mark_posted failed: {e:?}");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"success": false, "error": "db error"})),
        )
            .into_response();
    }
    Json(json!({"success": true})).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_date_known_values() {
        // Sanity check against fixed Unix timestamps.
        assert_eq!(format_date(0), "1970-01-01");
        assert_eq!(format_date(86_400), "1970-01-02");
        assert_eq!(format_date(1_704_067_200), "2024-01-01"); // 2024-01-01 00:00 UTC
        assert_eq!(format_date(1_748_736_000), "2025-06-01"); // 2025-06-01 00:00 UTC
    }

    #[test]
    fn pct_change_edge_cases() {
        assert_eq!(pct_change(100.0, 50.0), 100.0);
        assert_eq!(pct_change(50.0, 100.0), -50.0);
        assert_eq!(pct_change(0.0, 0.0), 0.0);
        assert_eq!(pct_change(10.0, 0.0), 100.0);
    }
}
