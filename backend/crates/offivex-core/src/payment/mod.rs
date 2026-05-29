//! Direct on-chain Solana payment infrastructure (Phase 5).
//!
//! - `derivation` — SLIP-0010 ed25519 BIP44 path derivation for invoice addresses
//! - `sol_price` — Jupiter-backed SOL/USD rate fetcher with cache
//! - `watcher`   — background poller that detects on-chain payments and triggers
//!                 plan activation + API key generation

pub mod api_key_format;
pub mod derivation;
pub mod reveal_crypto;
pub mod sol_price;
pub mod watcher;
