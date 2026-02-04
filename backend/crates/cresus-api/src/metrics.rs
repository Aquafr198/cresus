//! Application-level metric counters (atomics).
//!
//! These are incremented by API handlers and read by the server's `/metrics` endpoint.

use std::sync::atomic::{AtomicU64, Ordering};

pub static SWAPS_TOTAL: AtomicU64 = AtomicU64::new(0);
pub static SWAP_ERRORS_TOTAL: AtomicU64 = AtomicU64::new(0);
pub static BUNDLES_LAUNCHED: AtomicU64 = AtomicU64::new(0);
pub static PUMP_FUN_LAUNCHED: AtomicU64 = AtomicU64::new(0);
pub static AUTH_UNLOCK_ATTEMPTS: AtomicU64 = AtomicU64::new(0);
pub static AUTH_UNLOCK_FAILURES: AtomicU64 = AtomicU64::new(0);

pub fn inc_swap() {
    SWAPS_TOTAL.fetch_add(1, Ordering::Relaxed);
}

pub fn inc_swap_error() {
    SWAP_ERRORS_TOTAL.fetch_add(1, Ordering::Relaxed);
}

pub fn inc_bundle_launch() {
    BUNDLES_LAUNCHED.fetch_add(1, Ordering::Relaxed);
}

pub fn inc_pump_fun_launch() {
    PUMP_FUN_LAUNCHED.fetch_add(1, Ordering::Relaxed);
}

pub fn inc_unlock_attempt() {
    AUTH_UNLOCK_ATTEMPTS.fetch_add(1, Ordering::Relaxed);
}

pub fn inc_unlock_failure() {
    AUTH_UNLOCK_FAILURES.fetch_add(1, Ordering::Relaxed);
}
