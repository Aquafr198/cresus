//! Background payment watcher — polls Solana RPC for confirmed transfers to
//! pending invoice addresses, then atomically marks payments confirmed and
//! activates the user's plan.
//!
//! Idempotency, anti-replay, and atomicity guarantees are documented in
//! `plans/salut-j-ai-perdu-mon-quirky-yao.md` section 13.

use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

use futures_util::stream::{self, StreamExt};
use solana_client::rpc_client::GetConfirmedSignaturesForAddress2Config;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Signature;
use solana_transaction_status::{
    EncodedConfirmedTransactionWithStatusMeta, EncodedTransaction, UiMessage,
    UiTransactionEncoding,
};

use offivex_db::models::Payment;
use offivex_db::repo::api_key_repo::ApiKeyRepo;
use offivex_db::repo::audit_repo::AuditRepo;
use offivex_db::repo::payment_repo::PaymentRepo;
use offivex_db::repo::plan_repo::PlanRepo;
use offivex_db::repo::subscription_repo::SubscriptionRepo;
use offivex_db::DbError;

use crate::payment::api_key_format;
use crate::rpc::manager::{RpcError, RpcManager};

// ─── Public types ────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum WatcherError {
    #[error("RPC error: {0}")]
    Rpc(String),
    #[error("RPC manager error: {0}")]
    RpcMgr(#[from] RpcError),
    #[error("DB error: {0}")]
    Db(#[from] DbError),
    #[error("Crypto error: {0}")]
    Crypto(String),
    #[error("invoice missing solana_address")]
    MissingAddress,
    #[error("invoice missing amount_lamports")]
    MissingAmount,
    #[error("invalid solana_address: {0}")]
    InvalidAddress(String),
    #[error("invalid signature: {0}")]
    InvalidSignature(String),
    #[error("plan no longer exists: {0}")]
    PlanGone(String),
    #[error("address not present in tx account_keys")]
    AddressNotInTx,
}

#[derive(Debug, Clone, Copy)]
pub struct WatcherConfig {
    /// Seconds between sweep_pending ticks.
    pub tick_interval_secs: u64,
    /// Delay before the first tick (let the server fully start).
    pub initial_delay_secs: u64,
    /// Max invoices processed per tick (parallel up to `max_concurrent_rpc`).
    pub batch_limit: i64,
    /// Max in-flight RPC calls per tick.
    pub max_concurrent_rpc: usize,
    /// Underpayment tolerance in basis points (50 = 0.5%).
    pub tolerance_bps: u32,
    /// Per-RPC-call deadline in seconds. Audit P2 PERF-7 — without an explicit
    /// timeout, a flaky endpoint can hold a sweep slot for up to 30s (solana
    /// client default), starving newer invoices.
    pub rpc_timeout_secs: u64,
}

impl Default for WatcherConfig {
    fn default() -> Self {
        Self {
            tick_interval_secs: 5,
            initial_delay_secs: 15,
            // Audit P2 PERF-7 — reduced from 50 → 30 to leave headroom under a
            // shared Helius key (limit ~2000 req/min; watcher alone was ~1200).
            batch_limit: 30,
            // Audit POST-7 — bumped from 8 → 16. With batch_limit=30 and
            // rpc_timeout_secs=5, worst-case sequential time was 30*5/8 ≈ 19s
            // if every slot stalls. At 16 concurrent slots this drops to ~10s.
            // RPC budget headroom: 30 invoices × 2 calls × 12 ticks/min = 720
            // ops/min, well under Helius shared 2000/min, so concurrency is
            // safe to bump.
            max_concurrent_rpc: 16,
            tolerance_bps: 50,
            rpc_timeout_secs: 5,
        }
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct SweepStats {
    pub expired: usize,
    pub confirmed: usize,
    pub new_keys_revealed: usize,
    pub underpaid: usize,
    pub gc_reveals: usize,
    pub skipped: usize,
    pub errors: usize,
}

#[derive(Debug)]
enum InvoiceOutcome {
    Confirmed { new_key_revealed: bool },
    ConfirmedActivationFailed,
    Underpaid,
    Skipped,
    AlreadyClaimed,
}

// ─── Entry point ────────────────────────────────────────────────────────

/// One full sweep: expire stale, gc old reveals, fetch pending batch, check each
/// against on-chain state, transition + activate.
///
/// `treasury_seed` is used by SEC-3 to encrypt freshly-generated reveal_keys
/// before they are stored in the DB.
pub async fn sweep_pending(
    db: &Arc<tokio_rusqlite::Connection>,
    rpc: &RpcManager,
    cfg: &WatcherConfig,
    treasury_seed: &Arc<offivex_crypto::SecretBytes>,
) -> Result<SweepStats, WatcherError> {
    let mut stats = SweepStats::default();

    // Phase A — DB-only cleanup
    stats.expired = PaymentRepo::mark_expired_atomic(db).await?;
    stats.gc_reveals = PaymentRepo::gc_expired_reveals(db).await?;

    // Phase B — Fetch hot batch
    let pending = PaymentRepo::find_pending_or_confirming(db, cfg.batch_limit).await?;
    if pending.is_empty() {
        return Ok(stats);
    }

    // Phase C — Per-invoice on-chain check (parallel bounded)
    let outcomes: Vec<Result<InvoiceOutcome, WatcherError>> = stream::iter(pending)
        .map(|p| async move { check_one_invoice(db, rpc, p, cfg, treasury_seed).await })
        .buffer_unordered(cfg.max_concurrent_rpc)
        .collect()
        .await;

    // Phase D — Aggregate
    for outcome in outcomes {
        match outcome {
            Ok(InvoiceOutcome::Confirmed { new_key_revealed }) => {
                stats.confirmed += 1;
                if new_key_revealed {
                    stats.new_keys_revealed += 1;
                }
            }
            Ok(InvoiceOutcome::ConfirmedActivationFailed) => stats.confirmed += 1, // count as confirmed; activation_failed audit logged
            Ok(InvoiceOutcome::Underpaid) => stats.underpaid += 1,
            Ok(InvoiceOutcome::Skipped) => stats.skipped += 1,
            Ok(InvoiceOutcome::AlreadyClaimed) => stats.skipped += 1,
            Err(e) => {
                tracing::warn!(error = %e, "watcher: per-invoice check failed");
                stats.errors += 1;
            }
        }
    }

    Ok(stats)
}

// ─── Per-invoice flow ───────────────────────────────────────────────────

async fn check_one_invoice(
    db: &Arc<tokio_rusqlite::Connection>,
    rpc: &RpcManager,
    payment: Payment,
    cfg: &WatcherConfig,
    treasury_seed: &Arc<offivex_crypto::SecretBytes>,
) -> Result<InvoiceOutcome, WatcherError> {
    let address_str = payment.solana_address.as_deref()
        .ok_or(WatcherError::MissingAddress)?;
    let expected_lamports = payment.amount_lamports
        .ok_or(WatcherError::MissingAmount)?;
    let pubkey: Pubkey = address_str
        .parse()
        .map_err(|_| WatcherError::InvalidAddress(address_str.to_string()))?;

    let (client, _ep) = rpc.get_client().await?;

    // Audit P2 PERF-7 — explicit per-call deadline. A flaky endpoint can hang
    // the default ~30s tokio-internal solana client; we cap at cfg.rpc_timeout_secs
    // so each invoice slot frees up predictably under pressure.
    let rpc_deadline = Duration::from_secs(cfg.rpc_timeout_secs);

    let sig_cfg = GetConfirmedSignaturesForAddress2Config {
        limit: Some(10),
        commitment: Some(CommitmentConfig::confirmed()),
        ..Default::default()
    };
    let sigs = tokio::time::timeout(
        rpc_deadline,
        client.get_signatures_for_address_with_config(&pubkey, sig_cfg),
    )
    .await
    .map_err(|_| WatcherError::Rpc(format!("get_signatures_for_address timed out after {rpc_deadline:?}")))?
    .map_err(|e| WatcherError::Rpc(e.to_string()))?;

    if sigs.is_empty() {
        return Ok(InvoiceOutcome::Skipped);
    }

    // Compute the minimum acceptable received amount in u64 throughout.
    // Pre-refactor this lived as `i64` with an `i128` intermediate; if
    // `tolerance_bps` is ever misconfigured above 10_000 (i.e., >100%
    // tolerance), the subtraction wrapped negative and the cast to `i64`
    // produced a value comparing as `received >= tolerance` for every
    // positive `received`, accepting any payment including 0. Saturating
    // subtraction in u128 + clamp at u64 is now overflow-safe end to end.
    let tolerance_bps_clamped = (cfg.tolerance_bps as u128).min(10_000);
    let tolerance_lamports: u64 = ((expected_lamports as u128)
        .saturating_mul(10_000u128.saturating_sub(tolerance_bps_clamped))
        / 10_000)
        .try_into()
        .unwrap_or(u64::MAX);

    for sig_info in sigs {
        if sig_info.err.is_some() {
            continue; // tx failed; can't credit
        }
        let sig = Signature::from_str(&sig_info.signature)
            .map_err(|_| WatcherError::InvalidSignature(sig_info.signature.clone()))?;

        let tx = tokio::time::timeout(
            rpc_deadline,
            client.get_transaction(&sig, UiTransactionEncoding::JsonParsed),
        )
        .await
        .map_err(|_| WatcherError::Rpc(format!("get_transaction timed out after {rpc_deadline:?}")))?
        .map_err(|e| WatcherError::Rpc(e.to_string()))?;

        let received: u64 = match extract_lamports_received(&tx, &pubkey) {
            // `extract_lamports_received` returns `i64` because a sender can
            // have a negative delta. We only care about credits — cast the
            // positive branch to u64 to compare against the u64 tolerance.
            Some(d) if d > 0 => d as u64,
            _ => continue, // outgoing transfer or zero delta (token transfer where address paid fees)
        };

        if received >= tolerance_lamports {
            // ─ CONFIRMED ─
            // PaymentRepo persists amounts as i64 for SQLite compatibility,
            // and Solana lamports always fit (max supply ~600M SOL ≈ 6e17
            // lamports, well under i64::MAX = 9.2e18). The cast is safe.
            let outcome = PaymentRepo::mark_confirmed_atomic(
                db,
                &payment.id,
                &sig_info.signature,
                received as i64,
            )
            .await?;

            if !outcome.claimed {
                return Ok(InvoiceOutcome::AlreadyClaimed);
            }

            return match activate_payment(db, &payment, &sig_info.signature, treasury_seed).await {
                Ok(stats) => Ok(InvoiceOutcome::Confirmed {
                    new_key_revealed: stats.new_key_revealed,
                }),
                Err(e) => {
                    tracing::error!(
                        payment_id = %payment.id,
                        user_id = %payment.user_id,
                        sig = %sig_info.signature,
                        error = %e,
                        "activation failed AFTER payment confirmed — admin recovery required"
                    );
                    let _ = AuditRepo::insert_full(
                        db,
                        "payment_activation_failed",
                        &format!("payment_id={} err={}", payment.id, e),
                        None,
                        Some(&sig_info.signature),
                        None,
                        Some(&payment.user_id),
                        None,
                    )
                    .await;
                    Ok(InvoiceOutcome::ConfirmedActivationFailed)
                }
            };
        } else {
            // ─ UNDERPAID ─
            let outcome = PaymentRepo::mark_underpaid_atomic(
                db,
                &payment.id,
                &sig_info.signature,
                received as i64,
            )
            .await?;
            if outcome.claimed {
                let _ = AuditRepo::insert_full(
                    db,
                    "payment_underpaid",
                    &format!(
                        "payment_id={} expected={} received={} tolerance={}",
                        payment.id, expected_lamports, received, tolerance_lamports
                    ),
                    None,
                    Some(&sig_info.signature),
                    None,
                    Some(&payment.user_id),
                    None,
                )
                .await;
            }
            return Ok(InvoiceOutcome::Underpaid);
        }
    }

    Ok(InvoiceOutcome::Skipped)
}

// ─── Activation (best-effort; loud on failure) ──────────────────────────

struct ActivationStats {
    new_key_revealed: bool,
}

async fn activate_payment(
    db: &Arc<tokio_rusqlite::Connection>,
    payment: &Payment,
    tx_signature: &str,
    treasury_seed: &Arc<offivex_crypto::SecretBytes>,
) -> Result<ActivationStats, WatcherError> {
    // 1. Load plan
    let plan = PlanRepo::get_by_id(db, &payment.plan_id)
        .await?
        .ok_or_else(|| WatcherError::PlanGone(payment.plan_id.clone()))?;

    // 2. Upsert active subscription (extends if active, creates if none)
    let sub_id = uuid::Uuid::new_v4().to_string();
    let duration_secs = plan.duration_days * 86_400;
    let _sub = SubscriptionRepo::upsert_active(
        db,
        &sub_id,
        &payment.user_id,
        &plan.id,
        duration_secs,
        &payment.id,
    )
    .await?;

    // 3. API key — generate fresh only if user has none active (decision: same key persists across renewals)
    let existing = ApiKeyRepo::find_active_by_user(db, &payment.user_id).await?;
    let mut new_key_revealed = false;
    if existing.is_none() {
        let plaintext = api_key_format::generate();
        let hash = offivex_crypto::hash_password_phc(&plaintext)
            .map_err(|e| WatcherError::Crypto(format!("{e}")))?;
        let prefix = api_key_format::parse_prefix(&plaintext)
            .ok_or_else(|| WatcherError::Crypto("generated key has no valid prefix".into()))?;
        let key_id = uuid::Uuid::new_v4().to_string();
        ApiKeyRepo::insert(db, &key_id, &payment.user_id, &hash, prefix).await?;

        // SEC-3 — encrypt the plaintext key at rest under a key derived from the
        // treasury seed. DB backup compromise alone is no longer sufficient to
        // exfiltrate freshly-issued API keys.
        let encrypted = crate::payment::reveal_crypto::encrypt_reveal(
            &plaintext,
            treasury_seed.as_ref(),
        )
        .map_err(|e| WatcherError::Crypto(format!("reveal_crypto encrypt: {e}")))?;
        PaymentRepo::set_reveal_key(db, &payment.id, &encrypted).await?;
        new_key_revealed = true;
    }

    // 4. Audit — pass the signature explicitly (F2 fix): `payment` was loaded
    // BEFORE `mark_confirmed_atomic` set tx_hash, so `payment.tx_hash` is None
    // here. The caller has the fresh sig.
    AuditRepo::insert_full(
        db,
        "payment_confirmed",
        &format!(
            "payment_id={} plan={} duration_days={} new_key={}",
            payment.id, plan.slug, plan.duration_days, new_key_revealed
        ),
        None,
        Some(tx_signature),
        None,
        Some(&payment.user_id),
        None,
    )
    .await?;

    Ok(ActivationStats { new_key_revealed })
}

// ─── Tx parsing primitive ───────────────────────────────────────────────

/// Compute the net SOL delta to `address` in the given confirmed transaction.
/// Returns `None` if the tx failed, the address isn't in `account_keys`, or
/// the encoding doesn't expose balances.
///
/// Returns the lamport delta as `i64` (can be negative if the address was a sender).
pub fn extract_lamports_received(
    tx: &EncodedConfirmedTransactionWithStatusMeta,
    address: &Pubkey,
) -> Option<i64> {
    let meta = tx.transaction.meta.as_ref()?;
    if meta.err.is_some() {
        return None;
    }

    let pre = &meta.pre_balances;
    let post = &meta.post_balances;
    if pre.len() != post.len() {
        return None;
    }

    let target = address.to_string();

    let idx = match &tx.transaction.transaction {
        EncodedTransaction::Json(ui_tx) => match &ui_tx.message {
            UiMessage::Parsed(parsed) => parsed
                .account_keys
                .iter()
                .position(|k| k.pubkey == target)?,
            UiMessage::Raw(raw) => raw.account_keys.iter().position(|k| k == &target)?,
        },
        _ => return None,
    };

    if idx >= pre.len() || idx >= post.len() {
        return None;
    }
    let delta = (post[idx] as i128) - (pre[idx] as i128);
    if delta > i64::MAX as i128 || delta < i64::MIN as i128 {
        return None;
    }
    Some(delta as i64)
}

// ─── Scheduler ───────────────────────────────────────────────────────────

/// Audit OPS-MAX-4 — sink trait for the watcher to publish health gauges to
/// the AppState (read by `GET /admin/watcher-status`). Defined here so
/// Offivex-core stays independent of Offivex-server's concrete type.
pub trait WatcherHealthSink: Send + Sync {
    fn record_tick(&self, started_at_unix: i64, duration_ms: u64, had_error: bool);
}

/// No-op sink for tests / contexts that don't care about health gauges.
pub struct NoopHealthSink;
impl WatcherHealthSink for NoopHealthSink {
    fn record_tick(&self, _: i64, _: u64, _: bool) {}
}

/// Start the background payment watcher. Returns a JoinHandle the caller may
/// drop or await; the task runs forever until aborted.
///
/// `treasury_seed` is threaded through to `activate_payment` to encrypt
/// freshly-issued API keys before persisting them (SEC-3).
/// `health_sink` receives a `record_tick` call after every sweep.
pub fn start_payment_watcher_scheduler(
    db: Arc<tokio_rusqlite::Connection>,
    rpc: Arc<RpcManager>,
    cfg: WatcherConfig,
    treasury_seed: Arc<offivex_crypto::SecretBytes>,
    health_sink: Arc<dyn WatcherHealthSink>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(cfg.initial_delay_secs)).await;
        let mut interval = tokio::time::interval(Duration::from_secs(cfg.tick_interval_secs));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        // Audit POST-8 — graceful shutdown.
        // Without this, on SIGINT/SIGTERM the runtime aborts mid-tick, leaving
        // a half-done sweep_pending() in indeterminate state (worst case: a
        // payment marked confirmed in DB but no API key generated — surfaced
        // by the `payment_activation_failed` audit log path).
        //
        // We race the tick against `ctrl_c` so a clean shutdown exits the
        // loop between ticks. Each `sweep_pending` is also short-bounded by
        // the per-RPC `rpc_timeout_secs`, so the worst-case shutdown latency
        // is `max_concurrent_rpc × rpc_timeout_secs` (≈10s with defaults).
        //
        // Note: `ctrl_c().await` only resolves on SIGINT (Unix) or Ctrl+C
        // (Windows). For docker `stop` (SIGTERM), tokio doesn't expose this
        // cross-platform; in that case the runtime still aborts the task.
        // Future Phase 7: add a unix-specific SIGTERM handler.
        let mut shutdown = Box::pin(tokio::signal::ctrl_c());

        loop {
            tokio::select! {
                _ = interval.tick() => {
                    // OPS-MAX-4 — measure + publish to health sink.
                    let tick_start = std::time::Instant::now();
                    let tick_start_unix = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs() as i64;
                    let result = sweep_pending(&db, &rpc, &cfg, &treasury_seed).await;
                    let duration_ms = tick_start.elapsed().as_millis() as u64;
                    let had_error = matches!(&result, Err(_));
                    health_sink.record_tick(tick_start_unix, duration_ms, had_error);

                    match result {
                        Ok(stats) => {
                            if stats.confirmed > 0
                                || stats.expired > 0
                                || stats.underpaid > 0
                                || stats.errors > 0
                            {
                                tracing::info!(
                                    confirmed = stats.confirmed,
                                    new_keys = stats.new_keys_revealed,
                                    expired = stats.expired,
                                    underpaid = stats.underpaid,
                                    errors = stats.errors,
                                    skipped = stats.skipped,
                                    gc_reveals = stats.gc_reveals,
                                    "payment watcher tick"
                                );
                            } else {
                                tracing::debug!(
                                    gc_reveals = stats.gc_reveals,
                                    "payment watcher tick (idle)"
                                );
                            }
                        }
                        Err(e) => {
                            tracing::error!(error = %e, "payment watcher tick failed");
                        }
                    }
                }
                _ = &mut shutdown => {
                    tracing::info!("payment watcher: shutdown signal received, exiting cleanly");
                    return;
                }
            }
        }
    })
}

// ─── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use solana_transaction_status::{
        EncodedTransactionWithStatusMeta, UiAccountsList, UiCompiledInstruction,
        UiInnerInstructions, UiInstruction, UiParsedMessage, UiRawMessage,
        UiTransaction, UiTransactionStatusMeta,
    };

    fn mk_meta(pre: Vec<u64>, post: Vec<u64>, err: Option<solana_sdk::transaction::TransactionError>) -> UiTransactionStatusMeta {
        let status = match &err {
            Some(e) => Err(e.clone()),
            None => Ok(()),
        };
        UiTransactionStatusMeta {
            err,
            status,
            fee: 5000,
            pre_balances: pre,
            post_balances: post,
            inner_instructions: solana_transaction_status::option_serializer::OptionSerializer::None,
            log_messages: solana_transaction_status::option_serializer::OptionSerializer::None,
            pre_token_balances: solana_transaction_status::option_serializer::OptionSerializer::None,
            post_token_balances: solana_transaction_status::option_serializer::OptionSerializer::None,
            rewards: solana_transaction_status::option_serializer::OptionSerializer::None,
            loaded_addresses: solana_transaction_status::option_serializer::OptionSerializer::None,
            return_data: solana_transaction_status::option_serializer::OptionSerializer::None,
            compute_units_consumed: solana_transaction_status::option_serializer::OptionSerializer::None,
        }
    }

    fn mk_tx(account_keys: Vec<String>, meta: UiTransactionStatusMeta) -> EncodedConfirmedTransactionWithStatusMeta {
        let msg = UiRawMessage {
            header: solana_sdk::message::MessageHeader::default(),
            account_keys,
            recent_blockhash: "11111111111111111111111111111111".into(),
            instructions: vec![],
            address_table_lookups: None,
        };
        let ui_tx = UiTransaction {
            signatures: vec!["sig".into()],
            message: UiMessage::Raw(msg),
        };
        EncodedConfirmedTransactionWithStatusMeta {
            slot: 0,
            transaction: EncodedTransactionWithStatusMeta {
                transaction: EncodedTransaction::Json(ui_tx),
                meta: Some(meta),
                version: None,
            },
            block_time: Some(1_700_000_000),
        }
    }

    #[test]
    fn extract_simple_transfer() {
        let invoice_addr = solana_sdk::pubkey::Pubkey::new_unique();
        let sender = solana_sdk::pubkey::Pubkey::new_unique();
        let meta = mk_meta(
            vec![10_000_000_000, 0],         // pre: sender has 10 SOL, invoice has 0
            vec![8_999_995_000, 1_000_000_000], // post: sender -1 SOL -5k fee, invoice +1 SOL
            None,
        );
        let tx = mk_tx(vec![sender.to_string(), invoice_addr.to_string()], meta);
        let delta = extract_lamports_received(&tx, &invoice_addr);
        assert_eq!(delta, Some(1_000_000_000));
    }

    #[test]
    fn extract_multi_recipient_picks_our_address() {
        let invoice_addr = solana_sdk::pubkey::Pubkey::new_unique();
        let other = solana_sdk::pubkey::Pubkey::new_unique();
        let sender = solana_sdk::pubkey::Pubkey::new_unique();
        // sender → invoice 0.5 SOL, sender → other 1 SOL
        let meta = mk_meta(
            vec![10_000_000_000, 0, 0],
            vec![8_499_995_000, 500_000_000, 1_000_000_000],
            None,
        );
        let tx = mk_tx(
            vec![sender.to_string(), invoice_addr.to_string(), other.to_string()],
            meta,
        );
        let delta = extract_lamports_received(&tx, &invoice_addr);
        assert_eq!(delta, Some(500_000_000), "should pick OUR address, not other");
    }

    #[test]
    fn extract_failed_tx_returns_none() {
        let invoice_addr = solana_sdk::pubkey::Pubkey::new_unique();
        let meta = mk_meta(
            vec![1_000_000_000, 0],
            vec![1_000_000_000, 0],
            Some(solana_sdk::transaction::TransactionError::AccountInUse),
        );
        let tx = mk_tx(
            vec![solana_sdk::pubkey::Pubkey::new_unique().to_string(), invoice_addr.to_string()],
            meta,
        );
        assert_eq!(extract_lamports_received(&tx, &invoice_addr), None);
    }

    #[test]
    fn extract_address_not_in_tx_returns_none() {
        let invoice_addr = solana_sdk::pubkey::Pubkey::new_unique();
        let unrelated_a = solana_sdk::pubkey::Pubkey::new_unique();
        let unrelated_b = solana_sdk::pubkey::Pubkey::new_unique();
        let meta = mk_meta(vec![1_000_000_000, 0], vec![999_995_000, 1_000_000], None);
        let tx = mk_tx(vec![unrelated_a.to_string(), unrelated_b.to_string()], meta);
        assert_eq!(extract_lamports_received(&tx, &invoice_addr), None);
    }

    #[test]
    fn extract_outgoing_returns_negative() {
        let invoice_addr = solana_sdk::pubkey::Pubkey::new_unique();
        let receiver = solana_sdk::pubkey::Pubkey::new_unique();
        // invoice address SENDS 0.5 SOL out (delta = -0.5 SOL)
        let meta = mk_meta(
            vec![1_000_000_000, 0],
            vec![499_995_000, 500_000_000],
            None,
        );
        let tx = mk_tx(vec![invoice_addr.to_string(), receiver.to_string()], meta);
        let delta = extract_lamports_received(&tx, &invoice_addr);
        assert!(delta.unwrap() < 0, "outgoing must be negative, got {:?}", delta);
    }

    #[test]
    fn tolerance_math_at_99_5_percent() {
        // tolerance_bps = 50 ⇒ accept ≥ 99.5%
        let expected = 1_000_000_000_i64;
        let tolerance = ((expected as i128 * (10_000 - 50)) / 10_000) as i64;
        assert_eq!(tolerance, 995_000_000);
        assert!(995_000_000 >= tolerance);
        assert!(994_999_999 < tolerance);
    }

    #[test]
    fn tolerance_math_at_1_percent() {
        let expected = 1_000_000_000_i64;
        let tolerance = ((expected as i128 * (10_000 - 100)) / 10_000) as i64;
        assert_eq!(tolerance, 990_000_000);
    }

    #[test]
    fn watcher_config_defaults_are_sane() {
        let cfg = WatcherConfig::default();
        assert!(cfg.tick_interval_secs > 0);
        assert!(cfg.tick_interval_secs <= 60, "ticks should be sub-minute");
        assert_eq!(cfg.tolerance_bps, 50);
        assert!(cfg.batch_limit > 0);
        assert!(cfg.max_concurrent_rpc > 0);
    }

    // Suppress unused-import warnings for items only the unit-test build needs.
    #[allow(dead_code)]
    fn _silence(_: UiAccountsList, _: UiCompiledInstruction, _: UiInnerInstructions, _: UiInstruction, _: UiParsedMessage) {}
}
