//! A.3 — Periodic creator-balance watcher.
//!
//! Every `TICK_SECS` the detector iterates over `bundles` rows in status
//! `confirmed` that declared a `creator_reserve_tokens` baseline and:
//!
//!   1. Reads the creator wallet's on-chain ATA balance for the bundle's
//!      token mint via [`wallet::operations::get_token_balance`].
//!   2. Compares to the prior snapshot (or to the reserve baseline if this
//!      is the first observation).
//!   3. If the drop crosses [`SELL_THRESHOLD_PCT`] → emits a `dev_sold`
//!      [`MonitorEvent`] on the WS bus and records `user_op_dev_sold_alert`
//!      in the audit log so it shows up in `/monitor`.
//!   4. Always persists the current balance to
//!      `bundle_creator_snapshots` for the next tick.
//!
//! The detector is best-effort — RPC failures, wallet-row absences and JSON
//! parse failures are logged and skipped without stalling the loop.

use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;
use solana_sdk::pubkey::Pubkey;
use tokio_rusqlite::Connection;

use offivex_db::repo::{
    audit_repo::AuditRepo, bundle_snapshot_repo::BundleSnapshotRepo, pnl_repo::PnlRepo,
    token_repo::TokenRepo,
};

use crate::payment::sol_price::{fetch_sol_usd_price, WSOL_MINT};
use crate::rpc::manager::RpcManager;
use crate::trading::jupiter::{self, JupiterQuote};
use crate::wallet::operations::get_token_balance;

use super::event_bus::{EventBus, MonitorEvent};

/// Sampling cadence. 5 min is the lowest interval that doesn't flood mainnet
/// RPC quotas when many bundles are active, while keeping alert latency
/// acceptable for memecoin-style sells (the dev usually sells in seconds —
/// users still see the alert within minutes).
const TICK_SECS: u64 = 300;

/// A balance drop must exceed 20 % of the prior snapshot to emit an event.
/// Below that we assume normal wallet activity (gas, small transfers).
const SELL_THRESHOLD_PCT: u64 = 20;

/// Minimal slice of the on-disk `LaunchConfig` we care about — kept narrow
/// so a non-essential schema change in `LaunchConfig` doesn't break the
/// detector at deserialization time.
#[derive(Debug, Deserialize)]
struct ConfigSlice {
    token_mint: String,
    creator_wallet_id: String,
    #[serde(default)]
    creator_reserve_tokens: Option<u64>,
    /// Lamports of SOL put on the LP at launch. Used as the reference price
    /// for the realized-PNL calculation.
    #[serde(default)]
    sol_liquidity: u64,
    /// Raw tokens (decimal-scaled) put on the LP at launch.
    #[serde(default)]
    token_liquidity: u64,
}

/// Slippage tolerance used when asking Jupiter for the sell-side estimate.
/// Generous (5%) because this is a quote-only call — we never actually send
/// the trade. Tight slippage here would just make Jupiter reject the route.
const PNL_QUOTE_SLIPPAGE_BPS: u16 = 500;

/// Spawn the detector loop. Returns the join handle so the caller can keep
/// it alive for the process lifetime.
pub fn spawn(
    db: Arc<Connection>,
    rpc: RpcManager,
    event_bus: Arc<EventBus>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(TICK_SECS));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        // Burn the immediate tick so we don't slam RPC the millisecond the
        // server boots — startup is already busy.
        interval.tick().await;
        loop {
            interval.tick().await;
            if let Err(e) = tick_once(&db, &rpc, &event_bus).await {
                tracing::warn!("dev_sold_detector tick failed: {e}");
            }
        }
    })
}

async fn tick_once(
    db: &Arc<Connection>,
    rpc: &RpcManager,
    event_bus: &EventBus,
) -> Result<(), String> {
    let bundles = load_confirmed_bundles(db).await?;
    if bundles.is_empty() {
        return Ok(());
    }

    let (client, _ep) = rpc.get_client().await.map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp();

    for (bundle_id, cfg) in bundles {
        let Some(reserve) = cfg.creator_reserve_tokens else {
            continue;
        };
        if reserve == 0 {
            continue;
        }

        let token_mint: Pubkey = match cfg.token_mint.parse() {
            Ok(p) => p,
            Err(e) => {
                tracing::debug!(bundle_id = %bundle_id, "bad token_mint: {e}");
                continue;
            }
        };

        let wallet_pubkey_str = match wallet_pubkey_for_id(db, &cfg.creator_wallet_id).await {
            Ok(Some(s)) => s,
            Ok(None) => continue,
            Err(e) => {
                tracing::debug!(bundle_id = %bundle_id, "wallet lookup failed: {e}");
                continue;
            }
        };
        let wallet_pubkey: Pubkey = match wallet_pubkey_str.parse() {
            Ok(p) => p,
            Err(_) => continue,
        };

        let balance = match get_token_balance(&client, &wallet_pubkey, &token_mint).await {
            Ok(b) => b,
            Err(e) => {
                tracing::debug!(bundle_id = %bundle_id, "balance query failed: {e}");
                continue;
            }
        };

        let prev = BundleSnapshotRepo::latest(db, bundle_id.clone())
            .await
            .map_err(|e| e.to_string())?
            .and_then(|s| s.balance_raw.parse::<u64>().ok());
        let baseline = prev.unwrap_or(reserve);

        if balance + 1 <= baseline {
            let drop = baseline.saturating_sub(balance);
            // Avoid div-by-zero when baseline=0 (shouldn't happen because of
            // the reserve > 0 guard above, but be defensive).
            let drop_pct = if baseline == 0 {
                0
            } else {
                (drop.saturating_mul(100)) / baseline
            };
            if drop_pct >= SELL_THRESHOLD_PCT {
                event_bus.emit(MonitorEvent {
                    signature: format!("dev_sold:{bundle_id}:{now}"),
                    mint_address: cfg.token_mint.clone(),
                    event_type: "dev_sold".into(),
                    direction: Some("sell".into()),
                    wallet: wallet_pubkey_str.clone(),
                    amount_token: Some(drop.to_string()),
                    amount_sol: None,
                    timestamp: now,
                    slot: 0,
                });
                let _ = AuditRepo::insert_full(
                    db,
                    "user_op_dev_sold_alert",
                    &format!(
                        "bundle_id={bundle_id} mint={} wallet={} drop_raw={} \
                         drop_pct={}% baseline={} balance={}",
                        cfg.token_mint, wallet_pubkey_str, drop, drop_pct, baseline, balance
                    ),
                    None,
                    None,
                    None,
                    None,
                    None,
                )
                .await;
                tracing::warn!(
                    bundle_id = %bundle_id,
                    drop_raw = drop,
                    drop_pct = drop_pct,
                    "dev_sold alert emitted"
                );

                // Realized-PNL ledger insert for the Discord auto-card. Cost
                // basis = launch reference price × tokens sold; proceeds =
                // Jupiter quote at the current market price. Only inserted
                // when PNL is strictly positive — losses are tracked nowhere
                // by design (we don't want a "rugged" banner spam).
                if let Some((invested, sold, mult_x100)) =
                    compute_pnl(&cfg, drop, &token_mint).await
                {
                    if sold > invested {
                        let pnl_signed = sold as i128 - invested as i128;
                        // `pnl_signed` is bounded by realistic memecoin sizes
                        // (≤ 1e9 SOL = 1e18 lamports). Fits i64 with margin.
                        let pnl_i64 = pnl_signed.try_into().unwrap_or(i64::MAX);
                        let usd_cents = fetch_sol_usd_price()
                            .await
                            .ok()
                            .map(|p| (p * 100.0).round() as i64);
                        let symbol = TokenRepo::get_by_mint(db, cfg.token_mint.clone())
                            .await
                            .ok()
                            .flatten()
                            .and_then(|t| t.symbol);
                        match PnlRepo::insert(
                            db,
                            bundle_id.clone(),
                            cfg.token_mint.clone(),
                            symbol,
                            wallet_pubkey_str.clone(),
                            invested,
                            sold,
                            pnl_i64,
                            mult_x100 as i64,
                            usd_cents,
                            now,
                        )
                        .await
                        {
                            Ok(id) => tracing::info!(
                                pnl_event_id = id,
                                bundle_id = %bundle_id,
                                invested_lamports = invested,
                                sold_lamports = sold,
                                multiplier_x100 = mult_x100,
                                "realized PNL event inserted"
                            ),
                            Err(e) => tracing::warn!(
                                bundle_id = %bundle_id,
                                "PNL event insert failed: {e}"
                            ),
                        }
                    }
                }
            }
        }

        if let Err(e) = BundleSnapshotRepo::insert(db, bundle_id.clone(), now, balance).await {
            tracing::debug!(bundle_id = %bundle_id, "snapshot insert failed: {e}");
        }
    }

    Ok(())
}

/// Pull every `bundles` row in `status='confirmed'` and pre-parse the
/// minimum slice we need. Returns `(bundle_id, ConfigSlice)` tuples.
async fn load_confirmed_bundles(
    db: &Arc<Connection>,
) -> Result<Vec<(String, ConfigSlice)>, String> {
    let raw: Vec<(String, String)> = db
        .call(|c| {
            let mut stmt = c.prepare(
                "SELECT id, config_json FROM bundles WHERE status = 'confirmed'",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?;
            Ok(rows.collect::<Result<Vec<_>, _>>()?)
        })
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::with_capacity(raw.len());
    for (id, cfg_json) in raw {
        match serde_json::from_str::<ConfigSlice>(&cfg_json) {
            Ok(cfg) => out.push((id, cfg)),
            Err(e) => {
                tracing::debug!(bundle_id = %id, "config_json parse failed: {e}");
            }
        }
    }
    Ok(out)
}

async fn wallet_pubkey_for_id(
    db: &Arc<Connection>,
    wallet_id: &str,
) -> Result<Option<String>, String> {
    let id = wallet_id.to_string();
    db.call(move |c| {
        let mut stmt = c.prepare("SELECT public_key FROM wallets WHERE id = ?1")?;
        Ok(stmt
            .query_row([&id], |row| row.get::<_, String>(0))
            .ok())
    })
    .await
    .map_err(|e| e.to_string())
}

/// Compute (invested_lamports, sold_lamports, multiplier_x100) for a sell
/// of `tokens_sold` raw tokens, using the launch-time LP price as the cost
/// basis and the current Jupiter market price as the proceeds estimate.
///
/// Returns `None` when:
///  - the bundle didn't record a usable LP launch price, or
///  - Jupiter is unreachable / has no route for the mint.
///
/// In both cases the detector skips the PNL ledger insert — better no event
/// than a misleading one.
async fn compute_pnl(
    cfg: &ConfigSlice,
    tokens_sold: u64,
    token_mint: &Pubkey,
) -> Option<(u64, u64, u64)> {
    if cfg.sol_liquidity == 0 || cfg.token_liquidity == 0 || tokens_sold == 0 {
        return None;
    }
    // Cost basis. f64 is fine here — the worst-case error vs an i128 path
    // is sub-lamport on realistic memecoin sizes.
    let launch_price = cfg.sol_liquidity as f64 / cfg.token_liquidity as f64;
    let invested = (tokens_sold as f64 * launch_price).round() as u64;
    if invested == 0 {
        return None;
    }

    let wsol: Pubkey = WSOL_MINT.parse().ok()?;
    let quote: JupiterQuote =
        match jupiter::get_quote(token_mint, &wsol, tokens_sold, PNL_QUOTE_SLIPPAGE_BPS).await {
            Ok(q) => q,
            Err(e) => {
                tracing::debug!(mint = %token_mint, "Jupiter quote failed: {e}");
                return None;
            }
        };
    let sold: u64 = quote.out_amount.parse().ok()?;
    if sold <= invested {
        // Detector only emits profitable sells. A non-positive PNL is
        // surfaced by the `dev_sold` MonitorEvent on the WS bus but not in
        // the PNL ledger.
        return None;
    }
    let mult_x100 = sold.saturating_mul(100) / invested.max(1);
    Some((invested, sold, mult_x100))
}
