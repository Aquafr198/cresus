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
        run_migrations(conn)?;
        Ok(())
    })
    .await?;

    tracing::info!("Database initialized at {}", db_path);
    Ok(conn)
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
    Ok(())
}

/// Add a column to a table only if it doesn't already exist.
/// SQLite lacks `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, so we query
/// `pragma_table_info` first.
fn add_column_if_not_exists(
    conn: &rusqlite::Connection,
    table: &str,
    column: &str,
    col_type: &str,
) -> Result<(), rusqlite::Error> {
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
