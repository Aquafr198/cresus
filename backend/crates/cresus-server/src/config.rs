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
}

impl Config {
    /// Load configuration from environment variables with defaults.
    pub fn from_env() -> Self {
        let solana_cluster = match std::env::var("CRESUS_SOLANA_CLUSTER")
            .unwrap_or_else(|_| "devnet".into())
            .to_lowercase()
            .as_str()
        {
            "mainnet" | "mainnet-beta" => SolanaCluster::Mainnet,
            _ => SolanaCluster::Devnet,
        };

        Self {
            host: std::env::var("CRESUS_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
            port: std::env::var("CRESUS_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3001),
            database_path: std::env::var("CRESUS_DB_PATH")
                .unwrap_or_else(|_| "data/cresus.db".into()),
            log_level: std::env::var("CRESUS_LOG_LEVEL")
                .unwrap_or_else(|_| "info".into()),
            assets_dir: std::env::var("CRESUS_ASSETS_DIR")
                .unwrap_or_else(|_| "data/assets".into()),
            pinata_jwt: std::env::var("PINATA_JWT").ok(),
            cors_origins: std::env::var("CRESUS_CORS_ORIGINS")
                .unwrap_or_else(|_| "http://localhost:3000,http://127.0.0.1:3000".into())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            auto_lock_secs: std::env::var("CRESUS_AUTO_LOCK_SECS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(1800),
            solana_cluster,
            dev_mode: std::env::var("DEV_MODE")
                .unwrap_or_else(|_| "false".into())
                .eq_ignore_ascii_case("true"),
        }
    }

    /// Validate configuration for production safety.
    /// Logs warnings or errors for dangerous settings.
    pub fn validate(&self) {
        if !self.dev_mode && self.solana_cluster == SolanaCluster::Mainnet {
            // In production mainnet mode, warn about localhost CORS origins
            let has_localhost = self.cors_origins.iter().any(|o| {
                o.contains("localhost") || o.contains("127.0.0.1")
            });
            if has_localhost {
                tracing::warn!(
                    "CORS allows localhost origins on MAINNET — set CRESUS_CORS_ORIGINS to your production domain only"
                );
            }

            // Warn if listening on 0.0.0.0 without TLS
            if self.host == "0.0.0.0" {
                tracing::warn!(
                    "Listening on 0.0.0.0 on MAINNET — ensure a TLS reverse proxy (Caddy/nginx) is in front"
                );
            }
        }

        if self.dev_mode && self.solana_cluster == SolanaCluster::Mainnet {
            tracing::error!(
                "DEV_MODE=true with MAINNET cluster — this is dangerous! Disable DEV_MODE for mainnet."
            );
        }
    }
}
