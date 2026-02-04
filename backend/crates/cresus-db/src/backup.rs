//! Database backup and restore functionality using SQLite VACUUM INTO.
//!
//! This module provides safe, transactional backups of the SQLite database
//! without blocking ongoing operations.

use std::path::{Path, PathBuf};
use tokio_rusqlite::Connection;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum BackupError {
    #[error("Database error: {0}")]
    Database(#[from] tokio_rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Backup failed: {0}")]
    BackupFailed(String),
}

/// Configuration for database backups
#[derive(Debug, Clone)]
pub struct BackupConfig {
    /// Directory to store backups
    pub backup_dir: PathBuf,

    /// Maximum number of backups to retain (0 = unlimited)
    pub max_backups: usize,

    /// Whether to compress backups (using VACUUM which compacts the DB)
    pub compress: bool,
}

impl Default for BackupConfig {
    fn default() -> Self {
        Self {
            backup_dir: PathBuf::from("data/backups"),
            max_backups: 7, // Keep 7 days by default
            compress: true,
        }
    }
}

/// Backup the database to a timestamped file.
///
/// Uses SQLite's VACUUM INTO command which creates a clean, compacted copy
/// of the database without blocking ongoing operations.
///
/// # Arguments
/// * `conn` - Database connection
/// * `config` - Backup configuration
///
/// # Returns
/// Path to the created backup file
pub async fn backup_database(
    conn: &Connection,
    config: &BackupConfig,
) -> Result<PathBuf, BackupError> {
    // Create backup directory if it doesn't exist
    tokio::fs::create_dir_all(&config.backup_dir).await?;

    // Generate timestamped filename (includes milliseconds to avoid collisions)
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S_%3f");
    let backup_filename = format!("cresus_{}.db", timestamp);
    let backup_path = config.backup_dir.join(&backup_filename);

    // Validate path
    let backup_path_str = backup_path
        .to_str()
        .ok_or_else(|| BackupError::InvalidPath("Invalid UTF-8 in backup path".to_string()))?;

    tracing::info!(
        backup_path = %backup_path_str,
        compress = config.compress,
        "Creating database backup"
    );

    // Execute VACUUM INTO (creates a clean, compacted copy)
    let backup_path_clone = backup_path_str.to_string();
    conn.call(move |c| {
        c.execute(&format!("VACUUM INTO '{}'", backup_path_clone), [])?;
        Ok(())
    })
    .await
    .map_err(|e| BackupError::BackupFailed(e.to_string()))?;

    // Get backup file size
    let metadata = tokio::fs::metadata(&backup_path).await?;
    let size_mb = metadata.len() as f64 / 1_048_576.0;

    tracing::info!(
        backup_path = %backup_path_str,
        size_mb = format!("{:.2}", size_mb),
        "Database backup created successfully"
    );

    // Clean up old backups if max_backups is set
    if config.max_backups > 0 {
        cleanup_old_backups(&config.backup_dir, config.max_backups).await?;
    }

    Ok(backup_path)
}

/// Clean up old backups, keeping only the most recent N backups.
async fn cleanup_old_backups(backup_dir: &Path, max_backups: usize) -> Result<(), BackupError> {
    let mut backups = Vec::new();

    // Read all backup files
    let mut entries = tokio::fs::read_dir(backup_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("db") {
            if let Ok(metadata) = entry.metadata().await {
                backups.push((path, metadata.modified()?));
            }
        }
    }

    // Sort by modification time (newest first)
    backups.sort_by(|a, b| b.1.cmp(&a.1));

    // Remove old backups beyond max_backups
    if backups.len() > max_backups {
        let to_remove = &backups[max_backups..];

        for (path, _) in to_remove {
            tracing::info!(
                backup_path = %path.display(),
                "Removing old backup"
            );

            if let Err(e) = tokio::fs::remove_file(path).await {
                tracing::error!(
                    backup_path = %path.display(),
                    error = %e,
                    "Failed to remove old backup"
                );
            }
        }
    }

    Ok(())
}

/// Restore database from a backup file.
///
/// **WARNING**: This will overwrite the current database!
///
/// # Arguments
/// * `backup_path` - Path to the backup file
/// * `target_path` - Path where to restore the database
///
/// # Safety
/// The caller must ensure the database is not in use when calling this function.
pub async fn restore_database(
    backup_path: &Path,
    target_path: &Path,
) -> Result<(), BackupError> {
    if !backup_path.exists() {
        return Err(BackupError::InvalidPath(format!(
            "Backup file not found: {}",
            backup_path.display()
        )));
    }

    tracing::warn!(
        backup_path = %backup_path.display(),
        target_path = %target_path.display(),
        "Restoring database from backup (this will overwrite the current database)"
    );

    // Copy backup to target location
    tokio::fs::copy(backup_path, target_path).await?;

    tracing::info!(
        target_path = %target_path.display(),
        "Database restored successfully"
    );

    Ok(())
}

/// List all available backups in the backup directory.
pub async fn list_backups(backup_dir: &Path) -> Result<Vec<BackupInfo>, BackupError> {
    let mut backups = Vec::new();

    if !backup_dir.exists() {
        return Ok(backups);
    }

    let mut entries = tokio::fs::read_dir(backup_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("db") {
            let metadata = entry.metadata().await?;
            let size_bytes = metadata.len();
            let modified = metadata.modified()?;

            backups.push(BackupInfo {
                path,
                size_bytes,
                created_at: modified,
            });
        }
    }

    // Sort by creation time (newest first)
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(backups)
}

/// Information about a backup file.
#[derive(Debug, Clone)]
pub struct BackupInfo {
    pub path: PathBuf,
    pub size_bytes: u64,
    pub created_at: std::time::SystemTime,
}

impl BackupInfo {
    /// Get the size in megabytes.
    pub fn size_mb(&self) -> f64 {
        self.size_bytes as f64 / 1_048_576.0
    }

    /// Get a human-readable creation time.
    pub fn created_at_formatted(&self) -> String {
        use std::time::UNIX_EPOCH;

        if let Ok(duration) = self.created_at.duration_since(UNIX_EPOCH) {
            let timestamp = chrono::DateTime::from_timestamp(duration.as_secs() as i64, 0);
            if let Some(dt) = timestamp {
                return dt.format("%Y-%m-%d %H:%M:%S UTC").to_string();
            }
        }

        "Unknown".to_string()
    }
}

// ─── Off-site Backup (S3-compatible) ─────────────────────────────────────

/// Configuration for off-site backup uploads.
#[derive(Debug, Clone)]
pub struct OffSiteBackupConfig {
    /// Command template for uploading backups.
    /// `{file}` is replaced with the backup file path.
    /// Examples:
    ///   "aws s3 cp {file} s3://my-bucket/cresus-backups/"
    ///   "rclone copy {file} remote:cresus-backups/"
    ///   "mc cp {file} myminio/cresus-backups/"
    pub upload_command: String,
}

impl OffSiteBackupConfig {
    /// Create from the `CRESUS_BACKUP_UPLOAD_CMD` environment variable.
    /// Returns None if the env var is not set.
    pub fn from_env() -> Option<Self> {
        std::env::var("CRESUS_BACKUP_UPLOAD_CMD")
            .ok()
            .filter(|s| !s.is_empty())
            .map(|cmd| Self { upload_command: cmd })
    }
}

/// Upload a backup file to an off-site location using the configured command.
pub async fn upload_backup_offsite(
    backup_path: &Path,
    config: &OffSiteBackupConfig,
) -> Result<(), BackupError> {
    let path_str = backup_path
        .to_str()
        .ok_or_else(|| BackupError::InvalidPath("Invalid UTF-8 in backup path".to_string()))?;

    let command = config.upload_command.replace("{file}", path_str);

    tracing::info!(
        command = %command,
        "Uploading backup to off-site storage"
    );

    let output = tokio::process::Command::new("sh")
        .arg("-c")
        .arg(&command)
        .output()
        .await
        .map_err(|e| BackupError::BackupFailed(format!("Failed to run upload command: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::error!(
            command = %command,
            stderr = %stderr,
            "Off-site backup upload failed"
        );
        return Err(BackupError::BackupFailed(format!(
            "Upload command failed (exit {}): {}",
            output.status,
            stderr.trim()
        )));
    }

    tracing::info!(
        backup_path = %path_str,
        "Backup uploaded to off-site storage successfully"
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_backup_and_restore() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let backup_dir = temp_dir.path().join("backups");

        // Create test database
        let conn = Connection::open(&db_path).await.unwrap();
        conn.call(|c| {
            c.execute("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)", [])?;
            c.execute("INSERT INTO test (value) VALUES ('test data')", [])?;
            Ok(())
        })
        .await
        .unwrap();

        // Create backup
        let config = BackupConfig {
            backup_dir: backup_dir.clone(),
            max_backups: 5,
            compress: true,
        };

        let backup_path = backup_database(&conn, &config).await.unwrap();
        assert!(backup_path.exists());

        // List backups
        let backups = list_backups(&backup_dir).await.unwrap();
        assert_eq!(backups.len(), 1);
        assert!(backups[0].size_bytes > 0);

        // Restore to a new location
        let restored_path = temp_dir.path().join("restored.db");
        restore_database(&backup_path, &restored_path).await.unwrap();
        assert!(restored_path.exists());

        // Verify restored data
        let restored_conn = Connection::open(&restored_path).await.unwrap();
        let value: String = restored_conn
            .call(|c| {
                let mut stmt = c.prepare("SELECT value FROM test WHERE id = 1")?;
                let value: String = stmt.query_row([], |row| row.get(0))?;
                Ok(value)
            })
            .await
            .unwrap();

        assert_eq!(value, "test data");
    }

    #[tokio::test]
    async fn test_cleanup_old_backups() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let backup_dir = temp_dir.path().join("backups");

        let conn = Connection::open(&db_path).await.unwrap();
        conn.call(|c| {
            c.execute("CREATE TABLE test (id INTEGER PRIMARY KEY)", [])?;
            Ok(())
        })
        .await
        .unwrap();

        let config = BackupConfig {
            backup_dir: backup_dir.clone(),
            max_backups: 3,
            compress: true,
        };

        // Create 5 backups
        for _ in 0..5 {
            backup_database(&conn, &config).await.unwrap();
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }

        // Should only have 3 backups (max_backups)
        let backups = list_backups(&backup_dir).await.unwrap();
        assert_eq!(backups.len(), 3);
    }
}
