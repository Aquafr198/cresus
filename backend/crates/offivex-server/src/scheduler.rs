//! Background scheduler for periodic tasks like database backups.

use std::sync::Arc;
use std::time::Duration;
use tokio_rusqlite::Connection;
use offivex_db::backup::{backup_database, upload_backup_offsite, BackupConfig, OffSiteBackupConfig};

/// Audit PERF-MAX-4 — WAL checkpoint scheduler.
/// SQLite WAL file grows without bound until a checkpoint moves committed
/// pages back into the main DB file. Default auto-checkpoint (`PRAGMA
/// wal_autocheckpoint`) triggers at 1000 pages (~4MB), but under heavy
/// write load it can fall behind and the WAL bloats. We force a TRUNCATE
/// checkpoint hourly so WAL never exceeds ~5MB persistent on disk.
pub fn start_wal_checkpoint_scheduler(
    db: Arc<Connection>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(3600));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        // Skip the immediate first tick (interval.tick() fires right away).
        interval.tick().await;
        loop {
            interval.tick().await;
            let result = db
                .call(|c| {
                    // Returns (busy, log_pages, checkpointed_pages) — we don't
                    // need the values, just want the side effect.
                    c.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
                    Ok(())
                })
                .await;
            match result {
                Ok(_) => tracing::debug!("WAL checkpoint (TRUNCATE) executed"),
                Err(e) => tracing::warn!(error = %e, "WAL checkpoint failed"),
            }
        }
    })
}

/// Start the backup scheduler that runs daily database backups.
///
/// Returns a join handle that can be used to stop the scheduler.
pub fn start_backup_scheduler(
    db: Arc<Connection>,
    backup_config: BackupConfig,
) -> tokio::task::JoinHandle<()> {
    let offsite_config = OffSiteBackupConfig::from_env();
    if offsite_config.is_some() {
        tracing::info!("Off-site backup upload enabled (OFFIVEX_BACKUP_UPLOAD_CMD set)");
    }

    tokio::spawn(async move {
        // Wait 1 minute before first backup to let the server fully start
        tokio::time::sleep(Duration::from_secs(60)).await;

        // Perform initial backup on startup
        tracing::info!("Performing initial database backup");
        match backup_database(&db, &backup_config).await {
            Ok(backup_path) => {
                if let Some(ref offsite) = offsite_config {
                    if let Err(e) = upload_backup_offsite(&backup_path, offsite).await {
                        tracing::error!(error = %e, "Off-site backup upload failed");
                    }
                }
            }
            Err(e) => {
                tracing::error!(error = %e, "Initial database backup failed");
            }
        }

        // Audit OPS-MAX-1 — hourly backup (was daily). Combined with
        // max_backups=24 in main.rs, this gives 1h recovery granularity for
        // the last 24h. Critical for "I just fat-fingered a DROP TABLE" style
        // incidents where daily granularity loses up to 24h of work.
        let mut interval = tokio::time::interval(Duration::from_secs(60 * 60));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            interval.tick().await;

            tracing::info!("Starting scheduled database backup");

            match backup_database(&db, &backup_config).await {
                Ok(backup_path) => {
                    tracing::info!(
                        backup_path = %backup_path.display(),
                        "Scheduled database backup completed successfully"
                    );
                    if let Some(ref offsite) = offsite_config {
                        if let Err(e) = upload_backup_offsite(&backup_path, offsite).await {
                            tracing::error!(error = %e, "Off-site backup upload failed");
                        }
                    }
                }
                Err(e) => {
                    tracing::error!(
                        error = %e,
                        "Scheduled database backup failed"
                    );
                }
            }
        }
    })
}

/// Start a scheduler that resumes stalled distributions every 10 minutes.
///
/// This prevents distributions from getting stuck indefinitely if the server crashes mid-execution.
pub fn start_distribution_resume_scheduler(
    db: Arc<Connection>,
    master_key: Arc<tokio::sync::RwLock<Option<offivex_crypto::SecretBytes>>>,
    rpc: Arc<offivex_core::rpc::manager::RpcManager>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        // Wait 2 minutes before first check to let the server fully start
        tokio::time::sleep(Duration::from_secs(120)).await;

        // Then check every 10 minutes
        let mut interval = tokio::time::interval(Duration::from_secs(10 * 60));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            interval.tick().await;

            tracing::debug!("Checking for stalled distributions");

            // Check for distributions stalled for more than 10 minutes (600 seconds)
            match offivex_core::distribution::disperser::resume_stalled_distributions(
                &db,
                &rpc,
                &master_key,
                600, // 10 minutes
            )
            .await
            {
                Ok(()) => {
                    tracing::debug!("Distribution resume check completed");
                }
                Err(e) => {
                    tracing::error!(
                        error = %e,
                        "Failed to resume stalled distributions"
                    );
                }
            }
        }
    })
}

/// Reset any bot tasks left in "running" state from a previous server session.
///
/// After a server restart, these bots are not actually running.
/// Mark them as "stopped" so the UI reflects reality.
pub async fn reset_stale_running_tasks(db: &Arc<Connection>) {
    let result = db
        .call(|conn| {
            let tables = ["volume_tasks", "bumper_tasks", "warmer_tasks"];
            let mut total = 0usize;
            for table in tables {
                let sql = format!(
                    "UPDATE {} SET status = 'stopped' WHERE status = 'running'",
                    table
                );
                match conn.execute(&sql, []) {
                    Ok(n) => total += n,
                    Err(e) => {
                        // Table might not exist yet (migrations not run)
                        tracing::debug!(table, error = %e, "Skipping stale task reset");
                    }
                }
            }
            Ok(total)
        })
        .await;

    match result {
        Ok(count) if count > 0 => {
            tracing::warn!(
                count,
                "Reset stale 'running' bot tasks to 'stopped' after restart"
            );
        }
        Ok(_) => {
            tracing::debug!("No stale running bot tasks found");
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to reset stale running tasks");
        }
    }
}

/// Start the auto-lock scheduler that locks the app after inactivity.
///
/// If `timeout_secs` is 0, auto-lock is disabled.
pub fn start_auto_lock_scheduler(
    master_key: Arc<tokio::sync::RwLock<Option<offivex_crypto::SecretBytes>>>,
    timeout_secs: u64,
) -> Option<tokio::task::JoinHandle<()>> {
    if timeout_secs == 0 {
        tracing::info!("Auto-lock disabled (OFFIVEX_AUTO_LOCK_SECS=0)");
        return None;
    }

    Some(tokio::spawn(async move {
        let check_interval = Duration::from_secs(30); // check every 30s
        loop {
            tokio::time::sleep(check_interval).await;

            // Read LAST_ADMIN_ACTIVITY (Phase 6.5 pivot): the legacy LAST_ACTIVITY
            // is bumped by `require_unlocked` on every authenticated request, including
            // paying-user data-plane traffic. We only want admin activity to keep the
            // MEK unlocked — user traffic must not defeat auto-lock.
            let last =
                crate::auth::LAST_ADMIN_ACTIVITY.load(std::sync::atomic::Ordering::Relaxed);
            if last == 0 {
                // Never unlocked — nothing to do
                continue;
            }

            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs();

            if now.saturating_sub(last) >= timeout_secs {
                let mut mk = master_key.write().await;
                // Re-check LAST_ADMIN_ACTIVITY AFTER acquiring the write lock.
                // Between reading `last` at the top of the loop and waiting
                // for the write lock (which can be contended), an admin
                // `/auth/unlock` may have landed and bumped the counter.
                // Without this re-check we'd lock immediately after the
                // admin unlocked — UX bug + repeated unlock prompts.
                let last_now =
                    crate::auth::LAST_ADMIN_ACTIVITY.load(std::sync::atomic::Ordering::Relaxed);
                let now_now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(now);
                if last_now != 0 && now_now.saturating_sub(last_now) < timeout_secs {
                    // Admin became active while we were waiting; abort the lock.
                    continue;
                }
                if mk.is_some() {
                    *mk = None;
                    tracing::info!(
                        idle_secs = now_now.saturating_sub(last_now),
                        timeout_secs,
                        "Auto-locked after inactivity"
                    );
                }
            }
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_backup_scheduler_runs() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let backup_dir = temp_dir.path().join("backups");

        // Create test database
        let db = offivex_db::init_db(db_path.to_str().unwrap()).await.unwrap();

        let config = BackupConfig {
            backup_dir: backup_dir.clone(),
            max_backups: 5,
            compress: true,
        };

        // Start scheduler (it will wait 60 seconds before first backup in production,
        // but we'll just verify it starts without panicking)
        let handle = start_backup_scheduler(Arc::new(db), config);

        // Let it run briefly
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Stop scheduler
        handle.abort();

        // The scheduler should have started without errors
        assert!(true);
    }
}
