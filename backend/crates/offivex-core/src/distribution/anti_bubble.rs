//! Anti-bubble map detection evasion patterns.
//!
//! BubbleMaps and similar tools track on-chain SOL flows to link wallets.
//! These strategies break the visible connection between source and destination
//! wallets by introducing variation in amounts, timing, and routing.

use rand::Rng;
use serde::{Deserialize, Serialize};

/// Solana base transaction fee in lamports (5000 lamports = 0.000005 SOL).
const TX_FEE_LAMPORTS: u64 = 5000;

/// Distribution strategy — determines how SOL is dispersed.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DistributionStrategy {
    /// Direct: single-hop transfers from source to each target.
    Direct,
    /// Multi-hop: SOL passes through intermediate wallets.
    MultiHop {
        /// Number of intermediate hops (1 = one relay wallet).
        hops: usize,
    },
    /// Layered: split into batches with timing delays between batches.
    Layered {
        /// Number of wallets per batch.
        batch_size: usize,
        /// Delay in ms between batches (base, actual is randomized).
        batch_delay_ms: u64,
    },
}

impl Default for DistributionStrategy {
    fn default() -> Self {
        Self::Direct
    }
}

impl DistributionStrategy {
    pub fn name(&self) -> &'static str {
        match self {
            Self::Direct => "direct",
            Self::MultiHop { .. } => "multi_hop",
            Self::Layered { .. } => "layered",
        }
    }
}

/// Configuration for amount variation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AmountVariation {
    /// Whether to randomize amounts (if false, equal split).
    pub enabled: bool,
    /// Maximum percentage deviation from the mean amount (e.g., 0.20 = ±20%).
    pub max_deviation_pct: f64,
}

impl Default for AmountVariation {
    fn default() -> Self {
        Self {
            enabled: true,
            max_deviation_pct: 0.15,
        }
    }
}

/// Configuration for timing variation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimingVariation {
    /// Whether to add random delays between transfers.
    pub enabled: bool,
    /// Minimum delay between transfers (ms).
    pub min_delay_ms: u64,
    /// Maximum delay between transfers (ms).
    pub max_delay_ms: u64,
}

impl Default for TimingVariation {
    fn default() -> Self {
        Self {
            enabled: true,
            min_delay_ms: 500,
            max_delay_ms: 5000,
        }
    }
}

/// Full anti-bubble configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AntiBubbleConfig {
    pub strategy: DistributionStrategy,
    pub amount_variation: AmountVariation,
    pub timing_variation: TimingVariation,
}

impl Default for AntiBubbleConfig {
    fn default() -> Self {
        Self {
            strategy: DistributionStrategy::default(),
            amount_variation: AmountVariation::default(),
            timing_variation: TimingVariation::default(),
        }
    }
}

/// A single planned transfer in the distribution.
#[derive(Debug, Clone)]
pub struct PlannedTransfer {
    pub from_wallet_id: String,
    pub to_wallet_id: String,
    pub amount_lamports: u64,
    pub hop_index: usize,
    pub delay_ms: u64,
}

/// Split `total_lamports` into `n` amounts with optional variation.
///
/// **Zero-drift guarantee** : `amounts.iter().sum() == total_lamports` exactly.
/// All arithmetic is integer (u64 / u128 intermediate). Weights are expressed in
/// basis points (1 bp = 0.01%) so the random deviation never touches f64 in the
/// hot path. Only the config value `max_deviation_pct` is read as f64 once.
pub fn split_amounts(total_lamports: u64, n: usize, variation: &AmountVariation) -> Vec<u64> {
    if n == 0 {
        return vec![];
    }
    if n == 1 {
        return vec![total_lamports];
    }

    // Uniform split (no variation): integer division + remainder distribution.
    if !variation.enabled || variation.max_deviation_pct <= 0.0 {
        let each = total_lamports / n as u64;
        let remainder = total_lamports - each * n as u64;
        let mut amounts: Vec<u64> = vec![each; n];
        for amount in amounts.iter_mut().take(remainder as usize) {
            *amount += 1;
        }
        return amounts;
    }

    // Weighted split with random per-recipient deviation, integer math.
    //
    // Weights are in basis points: 10_000 = 1.0 (no deviation). max_deviation_pct
    // is converted to bps once at entry. The minimum weight is clamped to 1_000
    // (10%) to avoid pathologically tiny shares.
    let max_dev_bps: i32 = (variation.max_deviation_pct * 10_000.0).round() as i32;
    const MIN_WEIGHT_BPS: i32 = 1_000;

    let mut rng = rand::thread_rng();
    let weights_bps: Vec<u64> = (0..n)
        .map(|_| {
            let dev = if max_dev_bps > 0 {
                rng.gen_range(-max_dev_bps..=max_dev_bps)
            } else {
                0
            };
            (10_000 + dev).max(MIN_WEIGHT_BPS) as u64
        })
        .collect();

    let weight_sum: u128 = weights_bps.iter().map(|w| *w as u128).sum();
    debug_assert!(weight_sum > 0, "weight_sum cannot be zero (MIN_WEIGHT_BPS > 0)");

    // amount[i] = total * weight[i] / weight_sum (u128 intermediate, no overflow).
    let mut amounts: Vec<u64> = weights_bps
        .iter()
        .map(|w| {
            ((total_lamports as u128).saturating_mul(*w as u128) / weight_sum) as u64
        })
        .collect();

    // Integer truncation leaves a remainder; distribute it deterministically.
    let sum: u64 = amounts.iter().sum();
    let remainder = total_lamports.saturating_sub(sum);
    for amount in amounts.iter_mut().take(remainder as usize) {
        *amount += 1;
    }

    amounts
}

/// Generate random delays for a set of transfers.
pub fn generate_delays(n: usize, timing: &TimingVariation) -> Vec<u64> {
    if !timing.enabled || n == 0 {
        return vec![0; n];
    }

    let mut rng = rand::thread_rng();
    (0..n)
        .map(|i| {
            if i == 0 {
                0
            } else {
                rng.gen_range(timing.min_delay_ms..=timing.max_delay_ms)
            }
        })
        .collect()
}

/// Plan transfers for a direct distribution (single hop).
pub fn plan_direct(
    source_wallet_id: &str,
    target_wallet_ids: &[String],
    total_lamports: u64,
    config: &AntiBubbleConfig,
) -> Vec<PlannedTransfer> {
    let amounts = split_amounts(total_lamports, target_wallet_ids.len(), &config.amount_variation);
    let delays = generate_delays(target_wallet_ids.len(), &config.timing_variation);

    target_wallet_ids
        .iter()
        .enumerate()
        .zip(amounts.iter())
        .zip(delays.iter())
        .map(|(((_, target), &amount), &delay)| PlannedTransfer {
            from_wallet_id: source_wallet_id.to_string(),
            to_wallet_id: target.clone(),
            amount_lamports: amount,
            hop_index: 0,
            delay_ms: delay,
        })
        .collect()
}

/// Plan transfers for a multi-hop distribution.
///
/// For each target wallet, creates a chain:
///   source → relay_1 → relay_2 → ... → target
///
/// Relay wallets are drawn from the target pool itself (wallets act as
/// relays for each other), creating a web of transfers that obscures
/// the source-target relationship.
pub fn plan_multi_hop(
    source_wallet_id: &str,
    target_wallet_ids: &[String],
    total_lamports: u64,
    hops: usize,
    config: &AntiBubbleConfig,
) -> Vec<PlannedTransfer> {
    if hops == 0 || target_wallet_ids.is_empty() {
        return plan_direct(source_wallet_id, target_wallet_ids, total_lamports, config);
    }

    // Deduct tx fees for intermediate hops from the distributable amount.
    // Each target requires (hops + 1) transactions; each costs TX_FEE_LAMPORTS.
    let total_hops_per_target = (hops + 1) as u64;
    let total_fee = TX_FEE_LAMPORTS
        .saturating_mul(total_hops_per_target)
        .saturating_mul(target_wallet_ids.len() as u64);
    let distributable = total_lamports.saturating_sub(total_fee);

    let amounts = split_amounts(distributable, target_wallet_ids.len(), &config.amount_variation);
    let mut rng = rand::thread_rng();
    let mut transfers = Vec::new();

    for (i, (target, &amount)) in target_wallet_ids.iter().zip(amounts.iter()).enumerate() {
        let mut chain: Vec<String> = vec![source_wallet_id.to_string()];

        let other_targets: Vec<&String> = target_wallet_ids
            .iter()
            .filter(|t| *t != target)
            .collect();

        for _ in 0..hops.min(other_targets.len()) {
            let relay_idx = rng.gen_range(0..other_targets.len());
            chain.push(other_targets[relay_idx].clone());
        }

        chain.push(target.clone());

        for hop_idx in 0..(chain.len() - 1) {
            let delay = if hop_idx == 0 && i == 0 {
                0
            } else if config.timing_variation.enabled {
                rng.gen_range(config.timing_variation.min_delay_ms..=config.timing_variation.max_delay_ms)
            } else {
                0
            };

            transfers.push(PlannedTransfer {
                from_wallet_id: chain[hop_idx].clone(),
                to_wallet_id: chain[hop_idx + 1].clone(),
                amount_lamports: amount,
                hop_index: hop_idx,
                delay_ms: delay,
            });
        }
    }

    transfers
}

/// Plan transfers for a layered/batched distribution.
pub fn plan_layered(
    source_wallet_id: &str,
    target_wallet_ids: &[String],
    total_lamports: u64,
    batch_size: usize,
    batch_delay_ms: u64,
    config: &AntiBubbleConfig,
) -> Vec<PlannedTransfer> {
    let amounts = split_amounts(total_lamports, target_wallet_ids.len(), &config.amount_variation);
    let mut rng = rand::thread_rng();
    let mut transfers = Vec::new();

    let batch_size = batch_size.max(1);

    for (batch_idx, chunk) in target_wallet_ids.chunks(batch_size).enumerate() {
        let base_delay = if batch_idx == 0 {
            0
        } else {
            let deviation = rng.gen_range(-0.3f64..=0.3);
            ((batch_delay_ms as f64) * (1.0 + deviation)).max(0.0) as u64
        };

        for (i, target) in chunk.iter().enumerate() {
            let global_idx = batch_idx * batch_size + i;
            if global_idx >= amounts.len() {
                break;
            }

            let individual_delay = if config.timing_variation.enabled && i > 0 {
                rng.gen_range(200..=1500)
            } else {
                0
            };

            transfers.push(PlannedTransfer {
                from_wallet_id: source_wallet_id.to_string(),
                to_wallet_id: target.clone(),
                amount_lamports: amounts[global_idx],
                hop_index: 0,
                delay_ms: base_delay + individual_delay,
            });
        }
    }

    transfers
}

#[cfg(test)]
mod tests {
    use super::*;

    fn variation_off() -> AmountVariation {
        AmountVariation { enabled: false, max_deviation_pct: 0.0 }
    }
    fn variation_15pct() -> AmountVariation {
        AmountVariation { enabled: true, max_deviation_pct: 0.15 }
    }

    #[test]
    fn split_zero_drift_uniform() {
        for &total in &[1u64, 100, 999, 1_000_000, 1_000_000_000, u64::MAX / 2] {
            for &n in &[1usize, 2, 3, 5, 13, 100] {
                let amounts = split_amounts(total, n, &variation_off());
                let sum: u128 = amounts.iter().map(|a| *a as u128).sum();
                assert_eq!(sum, total as u128, "uniform split drift (total={total}, n={n})");
                assert_eq!(amounts.len(), n);
            }
        }
    }

    #[test]
    fn split_zero_drift_weighted() {
        for &total in &[100u64, 9999, 1_000_000_000, 999_999_999_999_u64] {
            for &n in &[2usize, 3, 7, 50] {
                let amounts = split_amounts(total, n, &variation_15pct());
                let sum: u128 = amounts.iter().map(|a| *a as u128).sum();
                assert_eq!(sum, total as u128, "weighted split drift (total={total}, n={n})");
                assert_eq!(amounts.len(), n);
                // No amount should be zero with 15% deviation and reasonable total
                if total >= n as u64 * 10 {
                    for (i, a) in amounts.iter().enumerate() {
                        assert!(*a > 0, "amount[{i}] is zero (total={total}, n={n})");
                    }
                }
            }
        }
    }

    #[test]
    fn split_single_recipient() {
        assert_eq!(split_amounts(12345, 1, &variation_15pct()), vec![12345]);
        assert_eq!(split_amounts(0, 1, &variation_off()), vec![0]);
    }

    #[test]
    fn split_zero_recipients() {
        assert!(split_amounts(1000, 0, &variation_off()).is_empty());
    }

    #[test]
    fn split_small_total_n_recipients() {
        // 1 lamport split among 3 → one gets 1, others get 0
        let amounts = split_amounts(1, 3, &variation_off());
        assert_eq!(amounts.iter().sum::<u64>(), 1);
        assert_eq!(amounts.len(), 3);
    }
}

/// Top-level planner: dispatch to the correct strategy.
pub fn plan_distribution(
    source_wallet_id: &str,
    target_wallet_ids: &[String],
    total_lamports: u64,
    config: &AntiBubbleConfig,
) -> Vec<PlannedTransfer> {
    match &config.strategy {
        DistributionStrategy::Direct => {
            plan_direct(source_wallet_id, target_wallet_ids, total_lamports, config)
        }
        DistributionStrategy::MultiHop { hops } => {
            plan_multi_hop(source_wallet_id, target_wallet_ids, total_lamports, *hops, config)
        }
        DistributionStrategy::Layered { batch_size, batch_delay_ms } => {
            plan_layered(
                source_wallet_id,
                target_wallet_ids,
                total_lamports,
                *batch_size,
                *batch_delay_ms,
                config,
            )
        }
    }
}
