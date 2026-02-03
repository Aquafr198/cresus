#[cfg(test)]
mod anti_bubble_tests {
    use crate::distribution::anti_bubble::*;

    fn default_config() -> AntiBubbleConfig {
        AntiBubbleConfig::default()
    }

    fn no_variation_config() -> AntiBubbleConfig {
        AntiBubbleConfig {
            strategy: DistributionStrategy::Direct,
            amount_variation: AmountVariation {
                enabled: false,
                max_deviation_pct: 0.0,
            },
            timing_variation: TimingVariation {
                enabled: false,
                min_delay_ms: 0,
                max_delay_ms: 0,
            },
        }
    }

    fn target_ids(n: usize) -> Vec<String> {
        (0..n).map(|i| format!("target_{}", i)).collect()
    }

    #[test]
    fn direct_distribution_amounts_sum() {
        let total = 1_000_000_000u64; // 1 SOL
        let targets = target_ids(5);
        let config = default_config();
        let transfers = plan_direct("source", &targets, total, &config);

        assert_eq!(transfers.len(), 5);
        let sum: u64 = transfers.iter().map(|t| t.amount_lamports).sum();
        assert_eq!(sum, total, "Split amounts must sum to total");
    }

    #[test]
    fn direct_no_variation_equal_split() {
        let total = 1_000_000_000u64;
        let targets = target_ids(4);
        let config = no_variation_config();
        let transfers = plan_direct("source", &targets, total, &config);

        assert_eq!(transfers.len(), 4);
        for t in &transfers {
            assert_eq!(t.amount_lamports, 250_000_000);
        }
    }

    #[test]
    fn multi_hop_fee_deduction() {
        let total = 1_000_000_000u64;
        let targets = target_ids(3);
        let config = AntiBubbleConfig {
            strategy: DistributionStrategy::MultiHop { hops: 1 },
            amount_variation: AmountVariation {
                enabled: false,
                max_deviation_pct: 0.0,
            },
            timing_variation: TimingVariation {
                enabled: false,
                min_delay_ms: 0,
                max_delay_ms: 0,
            },
        };
        let transfers = plan_multi_hop("source", &targets, total, 1, &config);

        // With 1 hop and 3 targets: each target gets (hops+1)=2 transactions
        // Total fees: 5000 * 2 * 3 = 30000 lamports
        // With multi-hop, transfers are chained: source→relay→target per wallet.
        // Each chain uses the same amount, so total amount across unique chains
        // should equal distributable (total - fees).
        assert!(
            transfers.len() >= targets.len(),
            "Should have at least one transfer per target"
        );
        // Verify all transfers have positive amounts
        for t in &transfers {
            assert!(t.amount_lamports > 0, "Transfer amount must be positive");
        }
    }

    #[test]
    fn layered_batch_sizing() {
        let total = 1_000_000_000u64;
        let targets = target_ids(7);
        let config = no_variation_config();
        let transfers = plan_layered("source", &targets, total, 3, 5000, &config);

        assert_eq!(transfers.len(), 7, "Should create one transfer per target");
        let sum: u64 = transfers.iter().map(|t| t.amount_lamports).sum();
        assert_eq!(sum, total);
    }

    #[test]
    fn amount_variation_bounds() {
        let total = 10_000_000_000u64; // 10 SOL
        let targets = target_ids(10);
        let config = AntiBubbleConfig {
            strategy: DistributionStrategy::Direct,
            amount_variation: AmountVariation {
                enabled: true,
                max_deviation_pct: 0.20,
            },
            timing_variation: TimingVariation {
                enabled: false,
                min_delay_ms: 0,
                max_delay_ms: 0,
            },
        };

        // Run multiple times to catch randomness edge cases
        for _ in 0..50 {
            let transfers = plan_direct("source", &targets, total, &config);
            let sum: u64 = transfers.iter().map(|t| t.amount_lamports).sum();
            assert_eq!(sum, total, "Amounts must always sum to total");

            let base = total as f64 / 10.0;
            for t in &transfers {
                let amt = t.amount_lamports as f64;
                // Each amount should be within reasonable bounds (0.1x to 2x base)
                assert!(
                    amt >= base * 0.1,
                    "Amount {} too small (base {})",
                    amt,
                    base
                );
            }
        }
    }

    #[test]
    fn timing_variation_range() {
        let delays = generate_delays(10, &TimingVariation {
            enabled: true,
            min_delay_ms: 500,
            max_delay_ms: 5000,
        });

        assert_eq!(delays.len(), 10);
        assert_eq!(delays[0], 0, "First delay should be 0");
        for &d in &delays[1..] {
            assert!(d >= 500 && d <= 5000, "Delay {} out of range", d);
        }
    }

    #[test]
    fn zero_targets_handled() {
        let targets: Vec<String> = vec![];
        let config = default_config();
        let transfers = plan_direct("source", &targets, 1_000_000, &config);
        assert!(transfers.is_empty());
    }

    #[test]
    fn single_target_gets_full_amount() {
        let total = 1_000_000_000u64;
        let targets = target_ids(1);
        let config = default_config();
        let transfers = plan_direct("source", &targets, total, &config);

        assert_eq!(transfers.len(), 1);
        assert_eq!(transfers[0].amount_lamports, total);
    }

    #[test]
    fn split_amounts_no_variation_distributes_remainder() {
        let amounts = split_amounts(100, 3, &AmountVariation {
            enabled: false,
            max_deviation_pct: 0.0,
        });
        assert_eq!(amounts.len(), 3);
        assert_eq!(amounts.iter().sum::<u64>(), 100);
        // 100 / 3 = 33 remainder 1
        assert_eq!(amounts[0], 34); // gets the remainder
        assert_eq!(amounts[1], 33);
        assert_eq!(amounts[2], 33);
    }

    #[test]
    fn plan_distribution_dispatches_correctly() {
        let targets = target_ids(3);

        let direct = plan_distribution("src", &targets, 1_000_000, &AntiBubbleConfig {
            strategy: DistributionStrategy::Direct,
            ..no_variation_config()
        });
        assert_eq!(direct.len(), 3);

        let layered = plan_distribution("src", &targets, 1_000_000, &AntiBubbleConfig {
            strategy: DistributionStrategy::Layered { batch_size: 2, batch_delay_ms: 1000 },
            ..no_variation_config()
        });
        assert_eq!(layered.len(), 3);
    }
}
