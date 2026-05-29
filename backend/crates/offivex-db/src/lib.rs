pub mod models;
pub mod repo;
pub mod backup;

use std::path::Path;
use tokio_rusqlite::Connection;

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("Database error: {0}")]
    Rusqlite(#[from] rusqlite::Error),
    #[error("Async database error: {0}")]
    TokioRusqlite(#[from] tokio_rusqlite::Error),
    #[error("Not found")]
    NotFound,
}

/// Initialize the SQLite database, run migrations, and return a connection.
pub async fn init_db(db_path: &str) -> Result<Connection, DbError> {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(db_path).parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let conn = Connection::open(db_path).await?;

    // Enable WAL mode and run migrations
    conn.call(|conn| {
        // Enable WAL mode and verify it was set
        let mode: String = conn.query_row("PRAGMA journal_mode=WAL;", [], |r| r.get(0))?;
        if mode != "wal" {
            tracing::warn!("Failed to enable WAL mode, got: {}", mode);
        }
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;

        // Audit P3 PERF-9 — SQLite tuning for concurrent workloads.
        // - busy_timeout=5000: wait up to 5s for a contended lock before
        //   returning SQLITE_BUSY (default = 0 → fail immediately on contention).
        //   Removes spurious failures when watcher + API handlers contend on
        //   writes during spike load.
        // - synchronous=NORMAL: WAL-safe relaxed fsync. Crash-safe vs power
        //   loss within a single transaction; loses at most the last few
        //   committed transactions on hardware crash. ~10x faster writes than
        //   FULL on slow disks. Safe in WAL mode (SQLite docs).
        // - cache_size=-32000: 32 MB page cache (negative = KB unit). Default
        //   is ~2 MB; we have plenty of RAM and the working set fits easily.
        // - temp_store=MEMORY: keep temp B-trees/sort scratch in RAM rather
        //   than spilling to disk (irrelevant for our query shapes but cheap).
        conn.execute_batch(
            "PRAGMA busy_timeout=5000;
             PRAGMA synchronous=NORMAL;
             PRAGMA cache_size=-32000;
             PRAGMA temp_store=MEMORY;",
        )?;

        run_migrations(conn)?;
        validate_critical_indexes(conn);
        Ok(())
    })
    .await?;

    tracing::info!("Database initialized at {}", db_path);
    Ok(conn)
}

/// Audit POST-1 — runtime check that the indexes the hot-path queries depend on
/// actually exist after migrations have run. SQLite happily executes queries
/// without their index (just slow), so a missing index is otherwise silent until
/// production traffic starts grinding the DB. We log WARN per missing index so
/// it surfaces in observability dashboards.
fn validate_critical_indexes(conn: &rusqlite::Connection) {
    // (table, index_name) pairs that map to known hot queries.
    const CRITICAL_INDEXES: &[(&str, &str)] = &[
        // referral system (Phase 6.5 + audit PERF-1/3)
        ("payments", "idx_payments_user_confirmed"),
        ("subscriptions", "idx_subscriptions_user_created"),
        // user mgmt
        ("api_keys", "idx_api_keys_user_active"),
        // payment watcher anti-replay
        ("payments", "idx_payments_tx_hash"),
        ("payments", "idx_payments_derivation_index"),
        // referral table itself
        ("referrals", "idx_referrals_referrer"),
    ];

    for (table, idx) in CRITICAL_INDEXES {
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM sqlite_master
                    WHERE type = 'index' AND tbl_name = ?1 AND name = ?2
                )",
                rusqlite::params![table, idx],
                |r| r.get(0),
            )
            .unwrap_or(false);
        if !exists {
            tracing::warn!(
                table = %table,
                index = %idx,
                "Critical index missing — hot-path query will fall back to full table scan. \
                 Check migration history for partial/failed runs."
            );
        }
    }
}

fn run_migrations(conn: &rusqlite::Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(include_str!("../migrations/001_create_wallets.sql"))?;
    conn.execute_batch(include_str!("../migrations/002_create_tokens.sql"))?;
    conn.execute_batch(include_str!("../migrations/003_create_bundles.sql"))?;
    conn.execute_batch(include_str!("../migrations/004_create_meme_library.sql"))?;
    conn.execute_batch(include_str!("../migrations/005_create_tasks.sql"))?;
    conn.execute_batch(include_str!("../migrations/006_create_distributions.sql"))?;
    conn.execute_batch(include_str!("../migrations/007_create_profiles.sql"))?;
    conn.execute_batch(include_str!("../migrations/008_add_indexes.sql"))?;
    conn.execute_batch(include_str!("../migrations/009_create_trading.sql"))?;
    conn.execute_batch(include_str!("../migrations/010_create_bumper.sql"))?;
    conn.execute_batch(include_str!("../migrations/011_create_warmer.sql"))?;

    // Migration 012: Add runtime_state columns idempotently.
    // SQLite lacks ALTER TABLE … ADD COLUMN IF NOT EXISTS, so we check first.
    add_column_if_not_exists(conn, "volume_tasks", "runtime_state", "TEXT")?;
    add_column_if_not_exists(conn, "bumper_tasks", "runtime_state", "TEXT")?;
    add_column_if_not_exists(conn, "warmer_tasks", "runtime_state", "TEXT")?;
    conn.execute_batch(include_str!("../migrations/012_add_bot_state.sql"))?;

    conn.execute_batch(include_str!("../migrations/013_create_dead_letter_queue.sql"))?;
    conn.execute_batch(include_str!("../migrations/014_create_pump_fun.sql"))?;
    conn.execute_batch(include_str!("../migrations/015_create_audit_log.sql"))?;

    // ── Phase 1 user-management migrations (016–023) ─────────────────────
    // Order matters: apply_requests (017) before users (018) because
    // users.created_from_apply_id references apply_requests(id).
    conn.execute_batch(include_str!("../migrations/016_create_admins.sql"))?;
    conn.execute_batch(include_str!("../migrations/017_create_apply_requests.sql"))?;
    conn.execute_batch(include_str!("../migrations/018_create_users.sql"))?;
    conn.execute_batch(include_str!("../migrations/019_create_plans.sql"))?;
    conn.execute_batch(include_str!("../migrations/020_create_subscriptions.sql"))?;
    conn.execute_batch(include_str!("../migrations/021_create_api_keys.sql"))?;
    conn.execute_batch(include_str!("../migrations/022_create_payments.sql"))?;

    // Migration 023: audit_log column additions (idempotent ALTER TABLE)
    add_column_if_not_exists(conn, "audit_log", "admin_id", "TEXT")?;
    add_column_if_not_exists(conn, "audit_log", "user_id", "TEXT")?;
    add_column_if_not_exists(conn, "audit_log", "ip", "TEXT")?;
    conn.execute_batch(include_str!("../migrations/023_add_audit_user_admin_cols.sql"))?;

    // Migration 024: payments table — direct on-chain Solana payment columns (Phase 5)
    add_column_if_not_exists(conn, "payments", "solana_address", "TEXT")?;
    add_column_if_not_exists(conn, "payments", "derivation_index", "INTEGER")?;
    add_column_if_not_exists(conn, "payments", "amount_lamports", "INTEGER")?;
    add_column_if_not_exists(conn, "payments", "amount_lamports_received", "INTEGER")?;
    add_column_if_not_exists(conn, "payments", "expires_at", "INTEGER")?;
    add_column_if_not_exists(conn, "payments", "sol_usd_rate_cents", "INTEGER")?;
    add_column_if_not_exists(conn, "payments", "reveal_key", "TEXT")?;
    add_column_if_not_exists(conn, "payments", "reveal_key_expires_at", "INTEGER")?;
    conn.execute_batch(include_str!("../migrations/024_alter_payments_for_solana.sql"))?;

    // Migration 025: referral system (Phase 6.5)
    // referral_code columns must exist on users + apply_requests BEFORE the
    // partial unique index is created in 025_create_referrals.sql.
    add_column_if_not_exists(conn, "users", "referral_code", "TEXT")?;
    add_column_if_not_exists(conn, "apply_requests", "referral_code", "TEXT")?;
    conn.execute_batch(include_str!("../migrations/025_create_referrals.sql"))?;

    // Migration 026: composite indexes for hot-path queries (audit P2 PERF-3+5).
    conn.execute_batch(include_str!("../migrations/026_indexes.sql"))?;

    // Migration 027: per-bundle snapshots of the creator wallet's token
    // balance, consumed by the dev_sold_detector to spot >20% drops.
    conn.execute_batch(include_str!(
        "../migrations/027_create_bundle_creator_snapshots.sql"
    ))?;

    // Migration 028: realized PNL events ledger for the Discord auto-card.
    conn.execute_batch(include_str!(
        "../migrations/028_create_realized_pnl_events.sql"
    ))?;

    // Migration 029: task templates — add config_blob column to existing
    // `tasks` table so the Mint Task / Bundle Task / Pump-Fun Task feature
    // can store a serialized launch payload to re-execute later. Uses the
    // idempotent helper because ALTER TABLE ADD COLUMN is not natively
    // re-runnable in SQLite.
    add_column_if_not_exists(conn, "tasks", "config_blob", "TEXT")?;

    Ok(())
}

/// Add a column to a table only if it doesn't already exist.
/// SQLite lacks `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, so we query
/// `pragma_table_info` first.
///
/// Defence in depth: SQLite identifier parameters can't be bound (they're
/// part of the SQL grammar, not runtime values), so we still have to
/// interpolate. ALL callers in this crate pass string literals at compile
/// time, but a future refactor that takes operator-supplied input would
/// open a SQL injection. We whitelist identifiers to `[a-z_][a-z0-9_]*`
/// and col_type to a small uppercase grammar — any deviation hard-fails
/// at boot instead of producing a SQL string.
fn add_column_if_not_exists(
    conn: &rusqlite::Connection,
    table: &str,
    column: &str,
    col_type: &str,
) -> Result<(), rusqlite::Error> {
    fn is_valid_ident(s: &str) -> bool {
        let mut chars = s.chars();
        match chars.next() {
            Some(c) if c.is_ascii_lowercase() || c == '_' => {}
            _ => return false,
        }
        chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    }
    fn is_valid_col_type(s: &str) -> bool {
        // Allow: TYPE_NAME [(N)] [NOT NULL] [DEFAULT <literal>] [...]
        // We don't try to parse the full SQLite type grammar — we just
        // refuse anything containing a semicolon, parentheses with a
        // string inside, or characters not in a conservative allowlist.
        // Any rejection is a hard boot failure, so erring on the strict
        // side is fine.
        !s.is_empty()
            && !s.contains(';')
            && !s.contains('"')
            && !s.contains('\'')
            && !s.contains('`')
            && !s.contains('\n')
            && !s.contains('\r')
            && s.chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, ' ' | '(' | ')' | ',' | '_' | '-'))
    }
    if !is_valid_ident(table) {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "add_column_if_not_exists: invalid table identifier {table:?}"
        )));
    }
    if !is_valid_ident(column) {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "add_column_if_not_exists: invalid column identifier {column:?}"
        )));
    }
    if !is_valid_col_type(col_type) {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "add_column_if_not_exists: invalid col_type {col_type:?}"
        )));
    }

    let exists: bool = conn.query_row(
        &format!(
            "SELECT COUNT(*) > 0 FROM pragma_table_info('{}') WHERE name = ?",
            table
        ),
        [column],
        |row| row.get(0),
    )?;
    if !exists {
        conn.execute_batch(&format!(
            "ALTER TABLE {} ADD COLUMN {} {};",
            table, column, col_type
        ))?;
    }
    Ok(())
}
