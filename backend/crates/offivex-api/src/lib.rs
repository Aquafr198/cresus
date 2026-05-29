pub mod error;
pub mod wallet;
pub mod token;
pub mod bundle;
pub mod meme_library;
pub mod distribution;
pub mod monitor;
pub mod profile;
pub mod rpc_config;
pub mod stats;
pub mod telegram;
pub mod trading;
pub mod quick_sell;
pub mod launches;
pub mod tasks;
pub mod types;
pub mod validation;
pub mod dlq;
pub mod health;
pub mod audit;
pub mod metrics;

// Phase 1 user-management
pub mod admin_auth;
pub mod apply;
pub mod admin;
// Phase 5 — direct on-chain Solana payment
pub mod payment;
// Phase 6 minimal — user-facing /me handler
pub mod user;
