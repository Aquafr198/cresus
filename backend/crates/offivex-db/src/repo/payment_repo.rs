use tokio_rusqlite::Connection;
use crate::models::Payment;
use crate::DbError;

pub struct PaymentRepo;

/// All columns selected in the same order for every SELECT in this repo.
const PAYMENT_COLS: &str = "id, user_id, plan_id, provider, provider_payment_id,
     amount_usd_cents, currency_paid, amount_paid_crypto, tx_hash, status,
     created_at, confirmed_at, webhook_payload_json, webhook_received_at,
     solana_address, derivation_index, amount_lamports, amount_lamports_received,
     expires_at, sol_usd_rate_cents, reveal_key, reveal_key_expires_at";

fn row_to_payment(r: &rusqlite::Row) -> rusqlite::Result<Payment> {
    Ok(Payment {
        id: r.get(0)?,
        user_id: r.get(1)?,
        plan_id: r.get(2)?,
        provider: r.get(3)?,
        provider_payment_id: r.get(4)?,
        amount_usd_cents: r.get(5)?,
        currency_paid: r.get(6)?,
        amount_paid_crypto: r.get(7)?,
        tx_hash: r.get(8)?,
        status: r.get(9)?,
        created_at: r.get(10)?,
        confirmed_at: r.get(11)?,
        webhook_payload_json: r.get(12)?,
        webhook_received_at: r.get(13)?,
        solana_address: r.get(14)?,
        derivation_index: r.get(15)?,
        amount_lamports: r.get(16)?,
        amount_lamports_received: r.get(17)?,
        expires_at: r.get(18)?,
        sol_usd_rate_cents: r.get(19)?,
        reveal_key: r.get(20)?,
        reveal_key_expires_at: r.get(21)?,
    })
}

fn now_ts() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

/// Result of a watcher-side atomic confirm attempt.
#[derive(Debug, Clone)]
pub struct ConfirmOutcome {
    /// `true` if THIS call transitioned the payment to `confirmed`. `false`
    /// means another tick beat us to it (idempotent retry).
    pub claimed: bool,
}

#[allow(clippy::too_many_arguments)]
impl PaymentRepo {
    // ─── Legacy (Phase 1 NOWPayments shape, kept for back-compat) ────────

    /// Legacy insert (NOWPayments flavored). Kept so existing call sites compile.
    /// Phase 5 invoices use `create_invoice` below.
    pub async fn insert(
        conn: &Connection,
        id: &str,
        user_id: &str,
        plan_id: &str,
        provider: &str,
        provider_payment_id: Option<&str>,
        amount_usd_cents: i64,
    ) -> Result<Payment, DbError> {
        let id = id.to_string();
        let user_id = user_id.to_string();
        let plan_id = plan_id.to_string();
        let provider = provider.to_string();
        let provider_payment_id = provider_payment_id.map(|s| s.to_string());
        let row = conn
            .call(move |c| {
                let now = now_ts();
                c.execute(
                    "INSERT INTO payments
                     (id, user_id, plan_id, provider, provider_payment_id, amount_usd_cents, status, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7)",
                    rusqlite::params![id, user_id, plan_id, provider, provider_payment_id, amount_usd_cents, now],
                )?;
                Ok(Payment {
                    id,
                    user_id,
                    plan_id,
                    provider,
                    provider_payment_id,
                    amount_usd_cents,
                    currency_paid: None,
                    amount_paid_crypto: None,
                    tx_hash: None,
                    status: "pending".to_string(),
                    created_at: now,
                    confirmed_at: None,
                    webhook_payload_json: None,
                    webhook_received_at: None,
                    solana_address: None,
                    derivation_index: None,
                    amount_lamports: None,
                    amount_lamports_received: None,
                    expires_at: None,
                    sol_usd_rate_cents: None,
                    reveal_key: None,
                    reveal_key_expires_at: None,
                })
            })
            .await?;
        Ok(row)
    }

    // ─── Phase 5 — direct on-chain Solana flow ──────────────────────────

    /// Allocate the next derivation_index AND insert a pending invoice atomically.
    /// `derivation_index` is `max(existing)+1` (starts at 1; 0 reserved for treasury).
    /// Address is computed by the caller AFTER this returns, then `set_solana_address`
    /// is called — OR we accept the address as an argument here. We pick the latter:
    /// caller computes address from the allocated index in the SAME transaction-ish
    /// flow (we hand back the index, caller derives, caller calls set_address).
    /// Simpler & safer: caller passes BOTH index and address atomically here.
    pub async fn create_invoice(
        conn: &Connection,
        id: &str,
        user_id: &str,
        plan_id: &str,
        amount_usd_cents: i64,
        amount_lamports: i64,
        sol_usd_rate_cents: i64,
        expires_in_secs: i64,
    ) -> Result<(Payment, i64), DbError> {
        let id = id.to_string();
        let user_id = user_id.to_string();
        let plan_id = plan_id.to_string();
        let row_and_index = conn
            .call(move |c| {
                let tx = c.unchecked_transaction()?;
                let now = now_ts();
                let expires_at = now + expires_in_secs;

                // Allocate next derivation_index atomically; 0 is reserved for treasury.
                let next_index: i64 = tx
                    .query_row(
                        "SELECT COALESCE(MAX(derivation_index), 0) + 1 FROM payments",
                        [],
                        |r| r.get(0),
                    )?;

                tx.execute(
                    "INSERT INTO payments
                     (id, user_id, plan_id, provider, amount_usd_cents, currency_paid, status,
                      created_at, derivation_index, amount_lamports, expires_at, sol_usd_rate_cents)
                     VALUES (?1, ?2, ?3, 'solana', ?4, 'SOL', 'pending', ?5, ?6, ?7, ?8, ?9)",
                    rusqlite::params![
                        id, user_id, plan_id, amount_usd_cents, now, next_index,
                        amount_lamports, expires_at, sol_usd_rate_cents
                    ],
                )?;

                tx.commit()?;

                Ok((
                    Payment {
                        id: id.clone(),
                        user_id: user_id.clone(),
                        plan_id: plan_id.clone(),
                        provider: "solana".into(),
                        provider_payment_id: None,
                        amount_usd_cents,
                        currency_paid: Some("SOL".into()),
                        amount_paid_crypto: None,
                        tx_hash: None,
                        status: "pending".into(),
                        created_at: now,
                        confirmed_at: None,
                        webhook_payload_json: None,
                        webhook_received_at: None,
                        solana_address: None,
                        derivation_index: Some(next_index),
                        amount_lamports: Some(amount_lamports),
                        amount_lamports_received: None,
                        expires_at: Some(expires_at),
                        sol_usd_rate_cents: Some(sol_usd_rate_cents),
                        reveal_key: None,
                        reveal_key_expires_at: None,
                    },
                    next_index,
                ))
            })
            .await?;
        Ok(row_and_index)
    }

    /// Write the derived address after `create_invoice`. Only allowed if address is
    /// still NULL (one-shot setter) — guards against accidental overwrite.
    pub async fn set_solana_address(
        conn: &Connection,
        id: &str,
        solana_address: &str,
    ) -> Result<(), DbError> {
        let id = id.to_string();
        let solana_address = solana_address.to_string();
        conn.call(move |c| {
            let n = c.execute(
                "UPDATE payments SET solana_address = ?1
                 WHERE id = ?2 AND solana_address IS NULL",
                rusqlite::params![solana_address, id],
            )?;
            if n == 0 {
                return Err(tokio_rusqlite::Error::Rusqlite(
                    rusqlite::Error::QueryReturnedNoRows,
                ));
            }
            Ok(())
        })
        .await?;
        Ok(())
    }

    pub async fn get_by_id(conn: &Connection, id: &str) -> Result<Option<Payment>, DbError> {
        let id = id.to_string();
        let sql = format!("SELECT {PAYMENT_COLS} FROM payments WHERE id = ?1");
        let result = conn
            .call(move |c| {
                let row = c
                    .query_row(&sql, rusqlite::params![id], row_to_payment)
                    .ok();
                Ok(row)
            })
            .await?;
        Ok(result)
    }

    pub async fn find_by_provider_id(
        conn: &Connection,
        provider: &str,
        provider_payment_id: &str,
    ) -> Result<Option<Payment>, DbError> {
        let provider = provider.to_string();
        let pid = provider_payment_id.to_string();
        let sql = format!(
            "SELECT {PAYMENT_COLS} FROM payments WHERE provider = ?1 AND provider_payment_id = ?2"
        );
        let result = conn
            .call(move |c| {
                let row = c
                    .query_row(&sql, rusqlite::params![provider, pid], row_to_payment)
                    .ok();
                Ok(row)
            })
            .await?;
        Ok(result)
    }

    /// Watcher hot path: returns all payments still waiting for confirmation.
    /// Limits to a sane batch size so a single tick can't pin the executor.
    pub async fn find_pending_or_confirming(
        conn: &Connection,
        limit: i64,
    ) -> Result<Vec<Payment>, DbError> {
        let sql = format!(
            "SELECT {PAYMENT_COLS} FROM payments
             WHERE status IN ('pending', 'confirming')
             ORDER BY created_at ASC
             LIMIT ?1"
        );
        let result = conn
            .call(move |c| {
                let mut stmt = c.prepare(&sql)?;
                let rows = stmt
                    .query_map(rusqlite::params![limit], row_to_payment)?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await?;
        Ok(result)
    }

    /// Atomically transition `pending`/`confirming` → `expired` for invoices past
    /// their expiry. Returns the number of rows transitioned.
    pub async fn mark_expired_atomic(conn: &Connection) -> Result<usize, DbError> {
        let n = conn
            .call(|c| {
                let now = now_ts();
                let n = c.execute(
                    "UPDATE payments SET status = 'expired'
                     WHERE status IN ('pending', 'confirming')
                       AND expires_at IS NOT NULL AND expires_at < ?1",
                    rusqlite::params![now],
                )?;
                Ok(n)
            })
            .await?;
        Ok(n)
    }

    /// Atomic claim: only the first watcher tick that calls this for a given
    /// payment succeeds. Returns `claimed: true` on success, `false` if another
    /// tick already won. Idempotency relies on the WHERE status guard + the
    /// UNIQUE(tx_hash) index (set elsewhere).
    pub async fn mark_confirmed_atomic(
        conn: &Connection,
        id: &str,
        tx_hash: &str,
        amount_lamports_received: i64,
    ) -> Result<ConfirmOutcome, DbError> {
        let id = id.to_string();
        let tx_hash = tx_hash.to_string();
        let outcome = conn
            .call(move |c| {
                let now = now_ts();
                let n = c.execute(
                    "UPDATE payments
                     SET status = 'confirmed',
                         tx_hash = ?1,
                         amount_lamports_received = ?2,
                         confirmed_at = ?3
                     WHERE id = ?4
                       AND status IN ('pending', 'confirming')",
                    rusqlite::params![tx_hash, amount_lamports_received, now, id],
                )?;
                Ok(ConfirmOutcome { claimed: n == 1 })
            })
            .await?;
        Ok(outcome)
    }

    /// Atomic underpayment marker. Same guard semantics as `mark_confirmed_atomic`.
    pub async fn mark_underpaid_atomic(
        conn: &Connection,
        id: &str,
        tx_hash: &str,
        amount_lamports_received: i64,
    ) -> Result<ConfirmOutcome, DbError> {
        let id = id.to_string();
        let tx_hash = tx_hash.to_string();
        let outcome = conn
            .call(move |c| {
                let n = c.execute(
                    "UPDATE payments
                     SET status = 'underpaid',
                         tx_hash = ?1,
                         amount_lamports_received = ?2
                     WHERE id = ?3
                       AND status IN ('pending', 'confirming')",
                    rusqlite::params![tx_hash, amount_lamports_received, id],
                )?;
                Ok(ConfirmOutcome { claimed: n == 1 })
            })
            .await?;
        Ok(outcome)
    }

    /// Set the one-shot plaintext API key revealable to the user on /pay/status.
    /// `reveal_key_expires_at` = now + 86400 (24h GC ceiling).
    pub async fn set_reveal_key(
        conn: &Connection,
        id: &str,
        reveal_key: &str,
    ) -> Result<(), DbError> {
        let id = id.to_string();
        let reveal_key = reveal_key.to_string();
        conn.call(move |c| {
            let now = now_ts();
            c.execute(
                "UPDATE payments
                 SET reveal_key = ?1, reveal_key_expires_at = ?2
                 WHERE id = ?3 AND reveal_key IS NULL",
                rusqlite::params![reveal_key, now + 86_400, id],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    /// One-shot consume: returns the plaintext key (if any) and NULLs it in the
    /// same transaction so it can only be read ONCE.
    pub async fn consume_reveal_key(
        conn: &Connection,
        id: &str,
    ) -> Result<Option<String>, DbError> {
        let id = id.to_string();
        let result = conn
            .call(move |c| {
                let tx = c.unchecked_transaction()?;
                let key: Option<String> = tx
                    .query_row(
                        "SELECT reveal_key FROM payments WHERE id = ?1",
                        rusqlite::params![id],
                        |r| r.get(0),
                    )
                    .ok()
                    .flatten();
                if key.is_some() {
                    tx.execute(
                        "UPDATE payments SET reveal_key = NULL, reveal_key_expires_at = NULL
                         WHERE id = ?1 AND reveal_key IS NOT NULL",
                        rusqlite::params![id],
                    )?;
                }
                tx.commit()?;
                Ok(key)
            })
            .await?;
        Ok(result)
    }

    /// Garbage-collect expired reveal_keys (called by watcher periodically).
    pub async fn gc_expired_reveals(conn: &Connection) -> Result<usize, DbError> {
        let n = conn
            .call(|c| {
                let now = now_ts();
                let n = c.execute(
                    "UPDATE payments SET reveal_key = NULL, reveal_key_expires_at = NULL
                     WHERE reveal_key IS NOT NULL
                       AND reveal_key_expires_at IS NOT NULL
                       AND reveal_key_expires_at < ?1",
                    rusqlite::params![now],
                )?;
                Ok(n)
            })
            .await?;
        Ok(n)
    }

    /// List payments by user, newest first (for admin user detail page).
    pub async fn list_by_user(
        conn: &Connection,
        user_id: &str,
    ) -> Result<Vec<Payment>, DbError> {
        let user_id = user_id.to_string();
        let sql = format!(
            "SELECT {PAYMENT_COLS} FROM payments WHERE user_id = ?1 ORDER BY created_at DESC"
        );
        let result = conn
            .call(move |c| {
                let mut stmt = c.prepare(&sql)?;
                let rows = stmt
                    .query_map(rusqlite::params![user_id], row_to_payment)?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await?;
        Ok(result)
    }

    pub async fn list_paginated(
        conn: &Connection,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Payment>, DbError> {
        let sql = format!(
            "SELECT {PAYMENT_COLS} FROM payments
             ORDER BY created_at DESC LIMIT ?1 OFFSET ?2"
        );
        let result = conn
            .call(move |c| {
                let mut stmt = c.prepare(&sql)?;
                let rows = stmt
                    .query_map(rusqlite::params![limit, offset], row_to_payment)?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await?;
        Ok(result)
    }

    pub async fn count_confirmed_since(
        conn: &Connection,
        since_ts: i64,
    ) -> Result<i64, DbError> {
        let n = conn
            .call(move |c| {
                let n: i64 = c.query_row(
                    "SELECT COUNT(*) FROM payments
                     WHERE status = 'confirmed' AND confirmed_at IS NOT NULL AND confirmed_at >= ?1",
                    rusqlite::params![since_ts],
                    |r| r.get(0),
                )?;
                Ok(n)
            })
            .await?;
        Ok(n)
    }

    /// Idempotent status setter for ad-hoc admin overrides. Refuses to downgrade
    /// from terminal states.
    pub async fn update_status(
        conn: &Connection,
        id: &str,
        new_status: &str,
        tx_hash: Option<&str>,
        currency_paid: Option<&str>,
        amount_paid_crypto: Option<&str>,
        webhook_payload_json: Option<&str>,
    ) -> Result<bool, DbError> {
        let id = id.to_string();
        let new_status = new_status.to_string();
        let tx_hash = tx_hash.map(|s| s.to_string());
        let currency_paid = currency_paid.map(|s| s.to_string());
        let amount_paid_crypto = amount_paid_crypto.map(|s| s.to_string());
        let webhook_payload_json = webhook_payload_json.map(|s| s.to_string());
        let changed = conn
            .call(move |c| {
                let current: Option<String> = c
                    .query_row(
                        "SELECT status FROM payments WHERE id = ?1",
                        rusqlite::params![id],
                        |r| r.get(0),
                    )
                    .ok();
                let current = match current {
                    Some(s) => s,
                    None => return Ok(false),
                };
                let terminal = ["confirmed", "failed", "expired"];
                if terminal.contains(&current.as_str()) && current != new_status {
                    return Ok(false);
                }
                let now = now_ts();
                let confirmed_at: Option<i64> = if new_status == "confirmed" { Some(now) } else { None };
                let n = c.execute(
                    "UPDATE payments
                     SET status = ?1,
                         tx_hash = COALESCE(?2, tx_hash),
                         currency_paid = COALESCE(?3, currency_paid),
                         amount_paid_crypto = COALESCE(?4, amount_paid_crypto),
                         webhook_payload_json = COALESCE(?5, webhook_payload_json),
                         webhook_received_at = ?6,
                         confirmed_at = COALESCE(?7, confirmed_at)
                     WHERE id = ?8",
                    rusqlite::params![
                        new_status, tx_hash, currency_paid, amount_paid_crypto,
                        webhook_payload_json, now, confirmed_at, id
                    ],
                )?;
                Ok(n > 0)
            })
            .await?;
        Ok(changed)
    }

    /// Idempotent setter for provider_payment_id (legacy NOWPayments path).
    pub async fn set_provider_payment_id(
        conn: &Connection,
        id: &str,
        provider_payment_id: &str,
    ) -> Result<(), DbError> {
        let id = id.to_string();
        let provider_payment_id = provider_payment_id.to_string();
        conn.call(move |c| {
            c.execute(
                "UPDATE payments SET provider_payment_id = ?1
                 WHERE id = ?2 AND provider_payment_id IS NULL",
                rusqlite::params![provider_payment_id, id],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }
}
