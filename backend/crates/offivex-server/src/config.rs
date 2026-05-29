/// Solana cluster selector.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SolanaCluster {
    Mainnet,
    Devnet,
}

impl SolanaCluster {
    pub fn is_devnet(&self) -> bool {
        matches!(self, SolanaCluster::Devnet)
    }

    pub fn default_rpc_url(&self) -> &'static str {
        match self {
            SolanaCluster::Mainnet => "https://api.mainnet-beta.solana.com",
            SolanaCluster::Devnet => "https://api.devnet.solana.com",
        }
    }
}

impl std::fmt::Display for SolanaCluster {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SolanaCluster::Mainnet => write!(f, "mainnet"),
            SolanaCluster::Devnet => write!(f, "devnet"),
        }
    }
}

/// Application configuration loaded from environment variables.
#[derive(Debug, Clone)]
pub struct Config {
    /// Server bind address (default: 127.0.0.1)
    pub host: String,
    /// Server port (default: 3001)
    pub port: u16,
    /// SQLite database file path
    pub database_path: String,
    /// Log level (default: info)
    pub log_level: String,
    /// Assets directory for meme library (default: data/assets)
    pub assets_dir: String,
    /// Pinata JWT for IPFS pinning (optional)
    pub pinata_jwt: Option<String>,
    /// Allowed CORS origins (comma-separated, default: http://localhost:3000,http://127.0.0.1:3000)
    pub cors_origins: Vec<String>,
    /// Auto-lock timeout in seconds (0 = disabled, default: 1800 = 30 minutes)
    pub auto_lock_secs: u64,
    /// Solana cluster: "mainnet" or "devnet" (default: devnet for safety)
    pub solana_cluster: SolanaCluster,
    /// Development mode — relaxes some security checks (default: false)
    pub dev_mode: bool,
    /// Admin session TTL in seconds (default: 3600 = 1 hour, sliding window)
    pub admin_session_ttl_secs: i64,
    /// Telegram bot token for apply notifications (None disables Telegram delivery)
    pub telegram_bot_token: Option<String>,
    /// Telegram chat ID that receives apply notifications
    pub telegram_chat_id: Option<String>,
    /// Optional public channel/chat for launch announcements. Separate from
    /// `telegram_chat_id` so admin apply alerts and user-facing launch posts
    /// can be routed to different audiences.
    pub telegram_launch_channel_id: Option<String>,
    /// Bearer token for the Discord PNL poller. `None` disables the
    /// `/api/v1/pnl/*` routes entirely (zero attack surface in dev).
    /// Generated with `openssl rand -hex 32`.
    pub bot_pnl_token: Option<String>,
    /// Treasury seed phrase (BIP39 12 or 24 words). REQUIRED — boot fails if absent/invalid.
    /// Derives invoice addresses (HD path `m/44'/501'/{index}'/0'`) and the treasury sweep pubkey.
    pub treasury_seed_phrase: String,
    /// Invoice expiry window in seconds (Phase 5 locked decision: 1800 = 30 min).
    pub invoice_ttl_secs: i64,
}

impl Config {
    /// Load configuration from environment variables with defaults.
    pub fn from_env() -> Self {
        let solana_cluster = match std::env::var("OFFIVEX_SOLANA_CLUSTER")
            .unwrap_or_else(|_| "devnet".into())
            .to_lowercase()
            .as_str()
        {
            "mainnet" | "mainnet-beta" => SolanaCluster::Mainnet,
            _ => SolanaCluster::Devnet,
        };

        Self {
            host: std::env::var("OFFIVEX_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
            port: std::env::var("OFFIVEX_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3001),
            database_path: std::env::var("OFFIVEX_DB_PATH")
                .unwrap_or_else(|_| "data/offivex.db".into()),
            log_level: std::env::var("OFFIVEX_LOG_LEVEL")
                .unwrap_or_else(|_| "info".into()),
            assets_dir: std::env::var("OFFIVEX_ASSETS_DIR")
                .unwrap_or_else(|_| "data/assets".into()),
            pinata_jwt: std::env::var("PINATA_JWT").ok(),
            cors_origins: std::env::var("OFFIVEX_CORS_ORIGINS")
                .unwrap_or_else(|_| "http://localhost:3000,http://127.0.0.1:3000".into())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            auto_lock_secs: std::env::var("OFFIVEX_AUTO_LOCK_SECS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(1800),
            solana_cluster,
            dev_mode: std::env::var("DEV_MODE")
                .unwrap_or_else(|_| "false".into())
                .eq_ignore_ascii_case("true"),
            admin_session_ttl_secs: std::env::var("OFFIVEX_ADMIN_SESSION_TTL_SECS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(3600),
            telegram_bot_token: std::env::var("OFFIVEX_TELEGRAM_BOT_TOKEN").ok().filter(|s| !s.is_empty()),
            telegram_chat_id: std::env::var("OFFIVEX_TELEGRAM_CHAT_ID").ok().filter(|s| !s.is_empty()),
            telegram_launch_channel_id: std::env::var("OFFIVEX_TELEGRAM_LAUNCH_CHANNEL_ID")
                .ok()
                .filter(|s| !s.is_empty()),
            bot_pnl_token: std::env::var("OFFIVEX_BOT_PNL_TOKEN")
                .ok()
                .filter(|s| !s.is_empty()),
            treasury_seed_phrase: std::env::var("OFFIVEX_TREASURY_SEED_PHRASE").unwrap_or_default(),
            invoice_ttl_secs: std::env::var("OFFIVEX_INVOICE_TTL_SECS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(1800),
        }
    }

    /// Validate configuration for production safety.
    ///
    /// Returns `Err(message)` when a hard-fail condition is detected so the
    /// caller can panic at boot rather than silently start in an unsafe state.
    /// Soft issues (e.g., listening on 0.0.0.0 without TLS in front) still go
    /// through `tracing::warn!`.
    ///
    /// Audit P3 SEC-6 — CORS origins validation. Previously we logged a warn
    /// when localhost was whitelisted on mainnet but never failed boot. The
    /// validator now hard-rejects:
    ///   - wildcard origins (`*`) on mainnet
    ///   - any `http://` scheme on mainnet (we expect TLS-terminated traffic)
    ///   - empty origins list on mainnet (would default to deny-all by axum CORS layer,
    ///     but signals a misconfiguration)
    ///
    /// Audit P4 SEC-10 — `DEV_MODE=true` on mainnet is now a hard panic.
    pub fn validate(&self) -> Result<(), String> {
        let is_mainnet = self.solana_cluster == SolanaCluster::Mainnet;

        // SEC-10 — DEV_MODE + Mainnet = catastrophic config mistake.
        if self.dev_mode && is_mainnet {
            return Err(
                "DEV_MODE=true with OFFIVEX_SOLANA_CLUSTER=mainnet — refusing to boot. \
                 Disable DEV_MODE or switch to devnet."
                    .into(),
            );
        }

        if is_mainnet {
            // SEC-6 — hard-fail on dangerous CORS shapes on mainnet.
            if self.cors_origins.is_empty() {
                return Err(
                    "OFFIVEX_CORS_ORIGINS empty on mainnet — explicit list required".into(),
                );
            }
            for origin in &self.cors_origins {
                if origin == "*" || origin.contains("*") {
                    return Err(format!(
                        "OFFIVEX_CORS_ORIGINS contains wildcard '{origin}' on mainnet — \
                         a strict allowlist of HTTPS origins is required"
                    ));
                }
                if origin.starts_with("http://") {
                    return Err(format!(
                        "OFFIVEX_CORS_ORIGINS contains insecure scheme '{origin}' on mainnet — \
                         use https:// only"
                    ));
                }
                let has_localhost = origin.contains("localhost") || origin.contains("127.0.0.1");
                if has_localhost {
                    return Err(format!(
                        "OFFIVEX_CORS_ORIGINS contains localhost-origin '{origin}' on mainnet — \
                         set to your production domain only"
                    ));
                }
            }

            // Soft warning — listening on 0.0.0.0 without TLS in front is risky
            // but sometimes intentional (TLS-terminating reverse proxy on the
            // same host). Warn but don't fail.
            if self.host == "0.0.0.0" {
                tracing::warn!(
                    "Listening on 0.0.0.0 on MAINNET — ensure a TLS reverse proxy (Caddy/nginx) is in front"
                );
            }
        }

        Ok(())
    }
}
