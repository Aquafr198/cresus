pub mod models;
pub mod repo;

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
    Ok(())
}
