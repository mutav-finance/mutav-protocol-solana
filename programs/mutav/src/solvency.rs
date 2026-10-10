//! Solvency quantities (spec §4).
//!
//! Pure functions over plain numbers, no accounts: instructions read their
//! accounts, call these and act on the result. The pilot reserve holds BRS
//! only (ADR 0018), so its stable assets are the tracked BRS balance; adapter
//! positions are valued here when they are built (ADR 0019).
//!
//! ```text
//! stable_assets     = brs_balance
//! coverage_required = max(ceil(c × remaining_cover_total / 10_000), provisions)
//! surplus           = max(0, stable_assets − coverage_required)
//! free_capital      = surplus
//! liquid_budget     = max(0, brs_balance − provisions)
//! net_assets        = max(0, stable_assets − provisions)
//! nav_per_share     = floor(net_assets × NAV_SCALE / shares_outstanding)
//! NAV_SCALE = 10^9 (spec §8)
//! ```

use anchor_lang::prelude::*;

use crate::{
    constants::{BPS_DENOMINATOR, NAV_SCALE},
    math::{mul_div, Rounding},
};

/// `max(ceil(c × remaining_cover_total / 10_000), provisions)` (spec §4,
/// ADR 0016). The ratio term is rounded up, in the reserve's favour. The
/// provisions term keeps filed claims fully covered when `c < 1`; at
/// `c ≥ 1` it never binds, because `provisions ≤ remaining_cover_total`.
pub fn coverage_required(
    remaining_cover_total: u64,
    coverage_ratio_bps: u16,
    provisions: u64,
) -> Result<u64> {
    let by_ratio = mul_div(
        remaining_cover_total,
        coverage_ratio_bps as u64,
        BPS_DENOMINATOR as u64,
        Rounding::Up,
    )?;
    Ok(by_ratio.max(provisions))
}

/// Capital above required coverage, saturating at 0.
pub fn surplus(stable_assets: u64, coverage_required: u64) -> u64 {
    stable_assets.saturating_sub(coverage_required)
}

/// Liquid BRS a redemption fill may use: `max(0, brs_balance − provisions)`.
/// Filed claims come first.
pub fn liquid_budget(brs_balance: u64, provisions: u64) -> u64 {
    brs_balance.saturating_sub(provisions)
}

/// `max(0, stable_assets − provisions)`.
pub fn net_assets(stable_assets: u64, provisions: u64) -> u64 {
    stable_assets.saturating_sub(provisions)
}

/// `floor(net_assets × NAV_SCALE / shares_outstanding)`. Pending deposits and
/// redemptions are excluded by the caller's inputs.
// TODO(spec: §4 — NAV per share with `shares_outstanding == 0` is undefined).
// Returns 0 (no published NAV) until the spec says otherwise; fills price
// through `assets_for` / `shares_for`, never through this value.
pub fn nav_per_share(net_assets: u64, shares_outstanding: u64) -> Result<u64> {
    if shares_outstanding == 0 {
        return Ok(0);
    }
    mul_div(net_assets, NAV_SCALE, shares_outstanding, Rounding::Down)
}

/// Everything §4 derives from one snapshot of state and config.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SolvencyInputs {
    pub brs_balance: u64,
    pub remaining_cover_total: u64,
    pub coverage_ratio_bps: u16,
    pub provisions: u64,
}

/// The §4 quantities for one snapshot.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Solvency {
    pub stable_assets: u64,
    pub coverage_required: u64,
    pub surplus: u64,
    pub free_capital: u64,
    pub liquid_budget: u64,
    pub net_assets: u64,
}

impl Solvency {
    pub fn compute(i: &SolvencyInputs) -> Result<Self> {
        let stable_assets = i.brs_balance;
        let coverage_required =
            coverage_required(i.remaining_cover_total, i.coverage_ratio_bps, i.provisions)?;
        let surplus = surplus(stable_assets, coverage_required);
        Ok(Self {
            stable_assets,
            coverage_required,
            surplus,
            free_capital: surplus,
            liquid_budget: liquid_budget(i.brs_balance, i.provisions),
            net_assets: net_assets(stable_assets, i.provisions),
        })
    }

    /// `true` when the reserve is under-covered (spec §6).
    pub fn under_covered(&self) -> bool {
        self.stable_assets < self.coverage_required
    }

    /// The `mode` this snapshot calls for (spec §6).
    pub fn mode(&self) -> u8 {
        if self.under_covered() {
            crate::constants::MODE_UNDER_COVERED
        } else {
            crate::constants::MODE_NORMAL
        }
    }

    /// `coverage_required − stable_assets`, saturating at 0 (`ModeChanged`).
    pub fn deficit(&self) -> u64 {
        self.coverage_required.saturating_sub(self.stable_assets)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::MIN_COVERAGE_RATIO_BPS;
    use proptest::prelude::*;

    fn cfg() -> ProptestConfig {
        ProptestConfig {
            cases: 256,
            failure_persistence: None,
            ..ProptestConfig::default()
        }
    }

    // -- point tests ------------------------------------------------------

    #[test]
    fn scales_are_pinned() {
        // Spec §8 (decided 2026-10-06).
        assert_eq!(NAV_SCALE, 1_000_000_000);
    }

    #[test]
    fn coverage_required_rounds_up() {
        assert_eq!(coverage_required(1, 10_000, 0).unwrap(), 1);
        // 1 × 1.5 = 1.5 → 2.
        assert_eq!(coverage_required(1, 15_000, 0).unwrap(), 2);
        // 3 × 0.3333 = 0.9999 → 1.
        assert_eq!(coverage_required(3, 3_333, 0).unwrap(), 1);
        assert_eq!(coverage_required(0, 15_000, 0).unwrap(), 0);
        assert_eq!(coverage_required(u64::MAX, 10_000, 0).unwrap(), u64::MAX);
        assert!(coverage_required(u64::MAX, 10_001, 0).is_err());
        // c = 0.10 (the floor): 11 × 0.1 = 1.1 → 2.
        assert_eq!(coverage_required(11, MIN_COVERAGE_RATIO_BPS, 0).unwrap(), 2);
    }

    #[test]
    fn coverage_required_is_never_below_provisions() {
        // ADR 0016. c = 0.10 on 100,000 of cover is 10,000.
        assert_eq!(coverage_required(100_000, 1_000, 4_000).unwrap(), 10_000);
        // Provisions above the ratio term bind.
        assert_eq!(coverage_required(100_000, 1_000, 25_000).unwrap(), 25_000);
        assert_eq!(coverage_required(0, 1_000, 7).unwrap(), 7);
        // At c ≥ 1, provisions ≤ remaining_cover_total never bind.
        assert_eq!(
            coverage_required(100_000, 10_000, 100_000).unwrap(),
            100_000
        );
        assert_eq!(
            coverage_required(100_000, 15_000, 100_000).unwrap(),
            150_000
        );
    }

    #[test]
    fn compute_below_one_with_provisions_binding() {
        let i = SolvencyInputs {
            brs_balance: 30_000,
            remaining_cover_total: 100_000,
            coverage_ratio_bps: 1_000,
            provisions: 2_000,
        };
        let s = Solvency::compute(&i).unwrap();
        assert_eq!(s.coverage_required, 10_000);
        assert_eq!(s.surplus, 20_000);
        assert_eq!(s.free_capital, 20_000);
        // BRS only: liquid_budget ≥ free_capital (fulfil_redeems relies on it).
        assert_eq!(s.liquid_budget, 28_000);

        let s = Solvency::compute(&SolvencyInputs {
            provisions: 18_000,
            ..i
        })
        .unwrap();
        assert_eq!(s.coverage_required, 18_000);
        assert_eq!(s.surplus, 12_000);
        assert_eq!(s.liquid_budget, 12_000);
        assert!(!s.under_covered());

        let s = Solvency::compute(&SolvencyInputs {
            provisions: 31_000,
            ..i
        })
        .unwrap();
        assert!(s.under_covered());
        assert_eq!(s.deficit(), 1_000);
    }

    #[test]
    fn mode_and_deficit() {
        use crate::constants::{MODE_NORMAL, MODE_UNDER_COVERED};
        let s = |stable_assets, coverage_required| Solvency {
            stable_assets,
            coverage_required,
            ..Default::default()
        };
        assert_eq!((s(10, 10).mode(), s(10, 10).deficit()), (MODE_NORMAL, 0));
        assert_eq!((s(11, 10).mode(), s(11, 10).deficit()), (MODE_NORMAL, 0));
        assert_eq!(
            (s(9, 10).mode(), s(9, 10).deficit()),
            (MODE_UNDER_COVERED, 1)
        );
    }

    #[test]
    fn surplus_free_capital_and_net_assets_saturate() {
        assert_eq!(surplus(10, 4), 6);
        assert_eq!(surplus(4, 10), 0);
        assert_eq!(net_assets(10, 3), 7);
        assert_eq!(net_assets(3, 10), 0);
        assert_eq!(liquid_budget(10, 3), 7);
        assert_eq!(liquid_budget(3, 10), 0);
    }

    #[test]
    fn nav_per_share_floors() {
        // 10 / 3 at NAV_SCALE = 3.333333333… → 3_333_333_333.
        assert_eq!(nav_per_share(10, 3).unwrap(), 3_333_333_333);
        // One share per BRS base unit is NAV 1.0.
        assert_eq!(nav_per_share(5_000_000, 5_000_000).unwrap(), NAV_SCALE);
        assert_eq!(nav_per_share(0, 3).unwrap(), 0);
        assert_eq!(nav_per_share(10, 0).unwrap(), 0);
        assert!(nav_per_share(u64::MAX, 1).is_err());
    }

    #[test]
    fn compute_matches_the_formulas() {
        let i = SolvencyInputs {
            brs_balance: 100_200,
            remaining_cover_total: 80_000,
            coverage_ratio_bps: 10_000,
            provisions: 2_000,
        };
        let s = Solvency::compute(&i).unwrap();
        assert_eq!(s.stable_assets, 100_200);
        assert_eq!(s.coverage_required, 80_000);
        assert_eq!(s.surplus, 20_200);
        assert_eq!(s.free_capital, 20_200);
        assert_eq!(s.liquid_budget, 98_200);
        assert_eq!(s.net_assets, 98_200);
        assert!(!s.under_covered());

        let under = Solvency::compute(&SolvencyInputs {
            remaining_cover_total: 200_000,
            ..i
        })
        .unwrap();
        assert!(under.under_covered());
        assert_eq!(under.surplus, 0);
        assert_eq!(under.free_capital, 0);
    }

    #[test]
    fn compute_saturates_never_wraps() {
        let i = SolvencyInputs {
            brs_balance: u64::MAX,
            remaining_cover_total: u64::MAX,
            coverage_ratio_bps: 10_000,
            provisions: u64::MAX,
        };
        let s = Solvency::compute(&i).unwrap();
        assert_eq!(s.stable_assets, u64::MAX);
        assert_eq!(s.surplus, 0);
        assert_eq!(s.net_assets, 0);
        assert!(Solvency::compute(&SolvencyInputs {
            coverage_ratio_bps: 10_001,
            ..i
        })
        .is_err());
    }

    // -- property tests ---------------------------------------------------

    fn inputs() -> impl Strategy<Value = SolvencyInputs> {
        (
            0u64..=1u64 << 50,
            0u64..=1u64 << 50,
            MIN_COVERAGE_RATIO_BPS..=20_000,
            0u64..=1u64 << 50,
        )
            .prop_map(|(brs, cover, c, prov)| SolvencyInputs {
                brs_balance: brs,
                remaining_cover_total: cover,
                coverage_ratio_bps: c,
                provisions: prov,
            })
    }

    /// Independent oracle for `surplus`, in `u128`.
    fn oracle_surplus(i: &SolvencyInputs) -> u64 {
        let cov = (i.remaining_cover_total as u128 * i.coverage_ratio_bps as u128)
            .div_ceil(10_000)
            .max(i.provisions as u128);
        (i.brs_balance as u128).saturating_sub(cov) as u64
    }

    proptest! {
        #![proptest_config(cfg())]

        /// BRS only: `free_capital == surplus` and the liquid budget is
        /// never below it (`fulfil_redeems` relies on it).
        #[test]
        fn free_capital_is_surplus(i in inputs()) {
            let s = Solvency::compute(&i).unwrap();
            prop_assert_eq!(s.surplus, oracle_surplus(&i));
            prop_assert_eq!(s.free_capital, s.surplus);
            prop_assert_eq!(s.liquid_budget, i.brs_balance.saturating_sub(i.provisions));
            prop_assert!(s.liquid_budget >= s.free_capital);
        }

        /// Invariant 7, generalised to any `c` (ADR 0016): a claim payment of
        /// `a` lowers `brs_balance` and `remaining_cover_total` by `a` and
        /// releases its provision (here equal to `a`). While the ratio term
        /// binds before and after, the
        /// surplus changes by `(c − 1)·a` (± 1 base unit of rounding): it
        /// grows for `c > 1`, is unchanged at `c = 1`, and shrinks for
        /// `c < 1`. When the provisions term binds, coverage never falls
        /// below the provisions still open.
        #[test]
        fn claim_payment_moves_surplus_by_c_minus_one(
            brs in 0u64..=1u64 << 50,
            cover in 1u64..=1u64 << 50,
            c in MIN_COVERAGE_RATIO_BPS..=20_000,
            other_prov_frac in 0u64..=100,
            a_frac in 1u64..=100,
        ) {
            let a = (brs.min(cover) * a_frac / 100).max(1).min(brs.min(cover));
            prop_assume!(a > 0);
            let other = (cover - a) * other_prov_frac / 100;
            let before_i = SolvencyInputs {
                brs_balance: brs,
                remaining_cover_total: cover,
                coverage_ratio_bps: c,
                provisions: other + a,
            };
            let after_i = SolvencyInputs {
                brs_balance: brs - a,
                remaining_cover_total: cover - a,
                provisions: other,
                ..before_i
            };
            let before = Solvency::compute(&before_i).unwrap();
            let after = Solvency::compute(&after_i).unwrap();
            prop_assert!(after.coverage_required >= after_i.provisions);
            let ratio = |cv: u64| (cv as u128 * c as u128).div_ceil(10_000);
            let ratio_binds = ratio(cover) >= before_i.provisions as u128
                && ratio(cover - a) >= after_i.provisions as u128;
            let stable_ok = before.stable_assets >= before.coverage_required
                && after.stable_assets >= after.coverage_required;
            if ratio_binds && stable_ok {
                let delta = after.surplus as i128 - before.surplus as i128;
                let expected = (c as i128 - 10_000) * a as i128 / 10_000;
                prop_assert!((delta - expected).abs() <= 1, "delta {} expected {}", delta, expected);
                if c == 10_000 {
                    prop_assert_eq!(delta, 0);
                }
            }
        }
    }
}
