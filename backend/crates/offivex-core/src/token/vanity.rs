use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use rayon::prelude::*;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;
use tokio::sync::RwLock;
use tokio_rusqlite::Connection;
use zeroize::Zeroizing;

use offivex_crypto::SecretBytes;
use offivex_db::repo::task_repo::TaskRepo;
use offivex_db::models::Task;

/// Result of a successful vanity grind.
#[derive(Debug, Clone)]
pub struct VanityResult {
    pub public_key: String,
    pub secret_key: Zeroizing<Vec<u8>>,
}

/// Configuration for vanity grinding.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct VanityConfig {
    /// Prefix the address should start with (base58 characters).
    pub prefix: Option<String>,
    /// Suffix the address should end with (base58 characters).
    pub suffix: Option<String>,
    /// Whether matching is case-insensitive.
    #[serde(default)]
    pub case_insensitive: bool,
    /// Number of threads to use (0 = all available).
    #[serde(default)]
    pub threads: usize,
}

#[derive(Debug, thiserror::Error)]
pub enum VanityError {
    #[error("No prefix or suffix specified")]
    NoPattern,
    #[error("Invalid base58 characters in pattern: {0}")]
    InvalidChars(String),
    #[error("Grind cancelled")]
    Cancelled,
    #[error("Database error: {0}")]
    Db(String),
}

const BASE58_CHARS: &str = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

fn validate_base58(s: &str) -> Result<(), VanityError> {
    for ch in s.chars() {
        if !BASE58_CHARS.contains(ch) {
            return Err(VanityError::InvalidChars(format!("'{}' is not valid base58", ch)));
        }
    }
    Ok(())
}

/// Estimate difficulty (number of expected attempts) for the given pattern.
pub fn estimate_difficulty(config: &VanityConfig) -> u64 {
    let mut chars = 0usize;
    if let Some(ref p) = config.prefix {
        chars += p.len();
    }
    if let Some(ref s) = config.suffix {
        chars += s.len();
    }
    if chars == 0 {
        return 1;
    }
    let base = if config.case_insensitive { 34u64 } else { 58u64 };
    base.saturating_pow(chars as u32)
}

/// Synchronous grind — runs on rayon thread pool. Returns the first match.
/// `cancel` can be set to true to abort early. `attempts` is incremented atomically.
pub fn grind(
    config: &VanityConfig,
    cancel: &AtomicBool,
    attempts: &AtomicU64,
) -> Result<VanityResult, VanityError> {
    let prefix = config.prefix.clone().unwrap_or_default();
    let suffix = config.suffix.clone().unwrap_or_default();

    if prefix.is_empty() && suffix.is_empty() {
        return Err(VanityError::NoPattern);
    }

    if !prefix.is_empty() {
        validate_base58(&prefix)?;
    }
    if !suffix.is_empty() {
        validate_base58(&suffix)?;
    }

    let case_insensitive = config.case_insensitive;

    let match_prefix = if case_insensitive {
        prefix.to_lowercase()
    } else {
        prefix.clone()
    };
    let match_suffix = if case_insensitive {
        suffix.to_lowercase()
    } else {
        suffix.clone()
    };

    // Configure thread pool — clamp to available parallelism
    let max_threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let num_threads = if config.threads > 0 {
        config.threads.min(max_threads)
    } else {
        max_threads
    };

    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(num_threads)
        .build()
        .unwrap_or_else(|_| rayon::ThreadPoolBuilder::new().build().unwrap());

    let result: Option<VanityResult> = pool.install(|| {
        (0..num_threads).into_par_iter().find_map_any(|_| {
            loop {
                if cancel.load(Ordering::Relaxed) {
                    return None;
                }

                let kp = Keypair::new();
                let pubkey = kp.pubkey().to_string();
                attempts.fetch_add(1, Ordering::Relaxed);

                let check_str = if case_insensitive {
                    pubkey.to_lowercase()
                } else {
                    pubkey.clone()
                };

                let prefix_ok = match_prefix.is_empty() || check_str.starts_with(&match_prefix);
                let suffix_ok = match_suffix.is_empty() || check_str.ends_with(&match_suffix);

                if prefix_ok && suffix_ok {
                    return Some(VanityResult {
                        public_key: pubkey,
                        secret_key: Zeroizing::new(kp.to_bytes().to_vec()),
                    });
                }
            }
        })
    });

    result.ok_or(VanityError::Cancelled)
}

/// Spawn an async vanity grind task with progress tracking via the tasks table.
/// Returns the task_id immediately. The grind runs in a background thread.
/// The result secret key is encrypted with the MEK before being stored in the DB.
pub async fn start_vanity_task(
    db: Arc<Connection>,
    config: VanityConfig,
    master_key: Arc<RwLock<Option<SecretBytes>>>,
) -> Result<String, VanityError> {
    let task_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    let task = Task {
        id: task_id.clone(),
        task_type: "vanity_grind".to_string(),
        status: "running".to_string(),
        progress: 0.0,
        result_json: None,
        error: None,
        config_blob: None,
        created_at: now,
        updated_at: now,
    };

    TaskRepo::create(&db, task).await.map_err(|e| VanityError::Db(e.to_string()))?;

    let cancel = Arc::new(AtomicBool::new(false));
    let attempts = Arc::new(AtomicU64::new(0));
    let difficulty = estimate_difficulty(&config);
    let db_clone = db.clone();
    let task_id_clone = task_id.clone();
    let cancel_clone = cancel.clone();
    let attempts_clone = attempts.clone();

    // Spawn progress updater
    let db_progress = db.clone();
    let task_id_progress = task_id.clone();
    let attempts_progress = attempts.clone();
    let cancel_progress = cancel.clone();

    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            if cancel_progress.load(Ordering::Relaxed) {
                break;
            }
            let current = attempts_progress.load(Ordering::Relaxed);
            let progress = if difficulty > 0 {
                (current as f64 / difficulty as f64).min(0.99)
            } else {
                0.0
            };
            let _ = TaskRepo::update(
                &db_progress,
                task_id_progress.clone(),
                "running".to_string(),
                progress,
                None,
                None,
            )
            .await;
        }
    });

    // Spawn the actual grind on a blocking thread
    tokio::task::spawn_blocking(move || {
        let result = grind(&config, &cancel_clone, &attempts_clone);
        cancel_clone.store(true, Ordering::Relaxed);

        let rt = tokio::runtime::Handle::current();
        rt.block_on(async {
            match result {
                Ok(vanity) => {
                    // Encrypt the secret key with MEK before storing
                    let mek_guard = master_key.read().await;
                    let result_json = if let Some(ref mek) = *mek_guard {
                        match offivex_crypto::encrypt(vanity.secret_key.as_ref(), mek) {
                            Ok(encrypted) => {
                                serde_json::json!({
                                    "public_key": vanity.public_key,
                                    "encrypted_secret": hex::encode(&encrypted.ciphertext),
                                    "nonce": hex::encode(encrypted.nonce),
                                    "attempts": attempts_clone.load(Ordering::Relaxed),
                                })
                            }
                            Err(e) => {
                                let _ = TaskRepo::update(
                                    &db_clone,
                                    task_id_clone,
                                    "failed".to_string(),
                                    0.0,
                                    None,
                                    Some(format!("Encryption failed: {}", e)),
                                )
                                .await;
                                return;
                            }
                        }
                    } else {
                        let _ = TaskRepo::update(
                            &db_clone,
                            task_id_clone,
                            "failed".to_string(),
                            0.0,
                            None,
                            Some("App locked during grind — cannot encrypt result".to_string()),
                        )
                        .await;
                        return;
                    };
                    drop(mek_guard);

                    let _ = TaskRepo::update(
                        &db_clone,
                        task_id_clone,
                        "completed".to_string(),
                        1.0,
                        Some(result_json.to_string()),
                        None,
                    )
                    .await;
                }
                Err(e) => {
                    let _ = TaskRepo::update(
                        &db_clone,
                        task_id_clone,
                        "failed".to_string(),
                        0.0,
                        None,
                        Some(e.to_string()),
                    )
                    .await;
                }
            }
        });
    });

    Ok(task_id)
}
