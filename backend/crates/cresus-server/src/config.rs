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
}

impl Config {
    /// Load configuration from environment variables with defaults.
    pub fn from_env() -> Self {
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
        }
    }
}
