//! Solvency quantities (spec §4, §13.3; ADR 0011).
//!
//! Pure functions over plain numbers, no accounts: instructions read their
//! accounts, call these and act on the result. Every instruction that reads
//! `free_capital` recomputes `earmark_eff` here, inline.
//!
//! ```text
//! tesouro_value     = floor(tesouro_units × bounded_price / PRICE_SCALE)
//! stable_assets     = brs_balance + tesouro_value
//! coverage_required = max(ceil(c × remaining_cover_total / 10_000), provisions)
//! surplus           = max(0, stable_assets − coverage_required)
//! earmark_eff       = 0 if INSTANT_EXIT is clear or the head is starved,
//!                     else min(buffer_earmark, surplus, max(0, brs_balance − provisions))
//! free_capital      = surplus − earmark_eff
//! liquid_budget     = max(0, brs_balance − provisions − earmark_eff)
//! net_assets        = max(0, stable_assets − provisions)
//! nav_per_share     = floor(net_assets × NAV_SCALE / shares_outstanding)
//! PRICE_SCALE = NAV_SCALE = 10^9 (spec §8)
//! ```

use anchor_lang::prelude::*;

use crate::{
    constants::{BPS_DENOMINATOR, INSTANT_EXIT, NAV_SCALE, PRICE_SCALE},
    errors::MutavError,
    math::{mul_div, Rounding},
};

/// Value of the TESOURO position in BRS base units, rounded down.
///
/// `bounded_price` is BRS base units per TESOURO unit, scaled by
/// [`PRICE_SCALE`] (spec §3.2, §7, §8).
pub fn tesouro_value(tesouro_units: u64, bounded_price: u64) -> Result<u64> {
    mul_div(tesouro_units, bounded_price, PRICE_SCALE, Rounding::Down)
}

/// `brs_balance + tesouro_value`, from tracked balances only (invariant 1).
pub fn stable_assets(brs_balance: u64, tesouro_value: u64) -> Result<u64> {
    brs_balance
        .checked_add(tesouro_value)
        .ok_or_else(|| error!(MutavError::MathOverflow))
}

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

/// The queue head is starved when it has waited longer than
/// `buffer_release_after_secs`, and that parameter is set:
/// `now − head_requested_at > buffer_release_after_secs > 0` (spec §4).
///
/// `head_requested_at` is `None` when the instruction does not hold the head
/// (or the queue is empty); only instructions that receive the head apply the
/// starvation term.
pub fn head_starved(
    now: i64,
    head_requested_at: Option<i64>,
    buffer_release_after_secs: i64,
) -> bool {
    match head_requested_at {
        Some(at) if buffer_release_after_secs > 0 => {
            (now as i128 - at as i128) > buffer_release_after_secs as i128
        }
        _ => false,
    }
}

/// Inputs of the effective earmark.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct EarmarkInputs {
    /// `VaultConfig.feature_flags`.
    pub feature_flags: u64,
    /// `VaultState.buffer_earmark`, the stored level (0 in the pilot).
    pub buffer_earmark: u64,
    /// `surplus` computed from the same state.
    pub surplus: u64,
    pub brs_balance: u64,
    pub provisions: u64,
    /// See [`head_starved`].
    pub head_starved: bool,
}

/// The effective earmark (spec §4, ADR 0011): `0` with `INSTANT_EXIT` clear or
/// a starved head, else `min(buffer_earmark, surplus, max(0, brs_balance −
/// provisions))`. No headroom term: see spec §4.
pub fn earmark_eff(i: &EarmarkInputs) -> u64 {
    if i.feature_flags & INSTANT_EXIT == 0 || i.head_starved {
        return 0;
    }
    i.buffer_earmark
        .min(i.surplus)
        .min(i.brs_balance.saturating_sub(i.provisions))
}

/// `surplus − earmark_eff`. `earmark_eff ≤ surplus` by construction; this
/// saturates anyway.
pub fn free_capital(surplus: u64, earmark_eff: u64) -> u64 {
    surplus.saturating_sub(earmark_eff)
}

/// Liquid BRS a redemption fill may use: `max(0, brs_balance − provisions −
/// earmark_eff)`. Filed claims and the earmark come first.
pub fn liquid_budget(brs_balance: u64, provisions: u64, earmark_eff: u64) -> u64 {
    brs_balance
        .saturating_sub(provisions)
        .saturating_sub(earmark_eff)
}

/// `max(0, stable_assets − provisions)`.
pub fn net_assets(stable_assets: u64, provisions: u64) -> u64 {
    stable_assets.saturating_sub(provisions)
}

/// `floor(net_assets × NAV_SCALE / shares_outstanding)`. Pending deposits and
/// redemptions are excluded by the caller's inputs.
// TODO(spec: §4 — NAV per share with `shares_outstanding == 0` is undefined).
// Returns 0 (no published NAV) until the spec says otherwise; fills price
// through `assets_for` / `shares_for`, never through this value. Returning
// `NAV_SCALE` (1.0) is not implied by §4: with zero shares and
// `net_assets > 0` (e.g. fees before the first deposit) the conversion price
// is `(net_assets + 1) / V`, not 1.0.
pub fn nav_per_share(net_assets: u64, shares_outstanding: u64) -> Result<u64> {
    if shares_outstanding == 0 {
        return Ok(0);
    }
    mul_div(net_assets, NAV_SCALE, shares_outstanding, Rounding::Down)
}

/// Everything §4 derives from one snapshot of state, config and price.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SolvencyInputs {
    pub brs_balance: u64,
    pub tesouro_units: u64,
    /// Bounded TESOURO price (spec §7), scaled by [`PRICE_SCALE`].
    pub tesouro_price: u64,
    pub remaining_cover_total: u64,
    pub coverage_ratio_bps: u16,
    pub provisions: u64,
    pub buffer_earmark: u64,
    pub feature_flags: u64,
    pub head_starved: bool,
}

/// The §4 quantities for one snapshot.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Solvency {
    pub tesouro_value: u64,
    pub stable_assets: u64,
    pub coverage_required: u64,
    pub surplus: u64,
    pub earmark_eff: u64,
    pub free_capital: u64,
    pub liquid_budget: u64,
    pub net_assets: u64,
}

impl Solvency {
    pub fn compute(i: &SolvencyInputs) -> Result<Self> {
        let tesouro_value = tesouro_value(i.tesouro_units, i.tesouro_price)?;
        let stable_assets = stable_assets(i.brs_balance, tesouro_value)?;
        let coverage_required =
            coverage_required(i.remaining_cover_total, i.coverage_ratio_bps, i.provisions)?;
        let surplus = surplus(stable_assets, coverage_required);
        let earmark_eff = earmark_eff(&EarmarkInputs {
            feature_flags: i.feature_flags,
            buffer_earmark: i.buffer_earmark,
            surplus,
            brs_balance: i.brs_balance,
            provisions: i.provisions,
            head_starved: i.head_starved,
        });
        Ok(Self {
            tesouro_value,
            stable_assets,
            coverage_required,
            surplus,
            earmark_eff,
            free_capital: free_capital(surplus, earmark_eff),
            liquid_budget: liquid_budget(i.brs_balance, i.provisions, earmark_eff),
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
        assert_eq!(PRICE_SCALE, 1_000_000_000);
        assert_eq!(NAV_SCALE, 1_000_000_000);
    }

    #[test]
    fn tesouro_value_rounds_down() {
        // 3 units × 1.5 = 4.5 → 4.
        assert_eq!(tesouro_value(3, 1_500_000_000).unwrap(), 4);
        assert_eq!(tesouro_value(0, 1_500_000_000).unwrap(), 0);
        // Sub-unit price: 7 units × 0.000000001 = 0.000000007 → 0.
        assert_eq!(tesouro_value(7, 1).unwrap(), 0);
        assert_eq!(tesouro_value(u64::MAX, PRICE_SCALE).unwrap(), u64::MAX);
        assert!(tesouro_value(u64::MAX, 2 * PRICE_SCALE).is_err());
    }

    #[test]
    fn stable_assets_adds_and_errors_on_overflow() {
        assert_eq!(stable_assets(7, 5).unwrap(), 12);
        assert!(stable_assets(u64::MAX, 1).is_err());
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
            ..Default::default()
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
        assert_eq!(free_capital(6, 2), 4);
        assert_eq!(free_capital(0, 0), 0);
        assert_eq!(free_capital(1, 5), 0);
        assert_eq!(net_assets(10, 3), 7);
        assert_eq!(net_assets(3, 10), 0);
        assert_eq!(liquid_budget(10, 3, 2), 5);
        assert_eq!(liquid_budget(10, 9, 2), 0);
        assert_eq!(liquid_budget(3, 10, 0), 0);
    }

    #[test]
    fn head_starvation_term() {
        // Strictly longer than the release delay, and the delay must be set.
        assert!(head_starved(1_000, Some(0), 999));
        assert!(!head_starved(1_000, Some(0), 1_000));
        assert!(!head_starved(1_000, Some(0), 0));
        assert!(!head_starved(1_000, None, 10));
        assert!(!head_starved(i64::MIN, Some(i64::MAX), 1));
        assert!(head_starved(i64::MAX, Some(i64::MIN), 1));
    }

    #[test]
    fn earmark_point_cases() {
        let base = EarmarkInputs {
            feature_flags: INSTANT_EXIT,
            buffer_earmark: 50,
            surplus: 100,
            brs_balance: 200,
            provisions: 20,
            head_starved: false,
        };
        assert_eq!(earmark_eff(&base), 50);
        // Surplus term.
        assert_eq!(
            earmark_eff(&EarmarkInputs {
                surplus: 30,
                ..base
            }),
            30
        );
        // Liquidity term.
        assert_eq!(
            earmark_eff(&EarmarkInputs {
                provisions: 190,
                ..base
            }),
            10
        );
        assert_eq!(
            earmark_eff(&EarmarkInputs {
                provisions: 500,
                ..base
            }),
            0
        );
        // Flag clear, starved head.
        assert_eq!(
            earmark_eff(&EarmarkInputs {
                feature_flags: 0,
                ..base
            }),
            0
        );
        assert_eq!(
            earmark_eff(&EarmarkInputs {
                feature_flags: 1 << 1,
                ..base
            }),
            0
        );
        assert_eq!(
            earmark_eff(&EarmarkInputs {
                head_starved: true,
                ..base
            }),
            0
        );
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
            brs_balance: 60_000,
            tesouro_units: 40,
            tesouro_price: 1_005 * PRICE_SCALE,
            remaining_cover_total: 80_000,
            coverage_ratio_bps: 10_000,
            provisions: 2_000,
            buffer_earmark: 5_000,
            feature_flags: INSTANT_EXIT,
            head_starved: false,
        };
        let s = Solvency::compute(&i).unwrap();
        assert_eq!(s.tesouro_value, 40_200);
        assert_eq!(s.stable_assets, 100_200);
        assert_eq!(s.coverage_required, 80_000);
        assert_eq!(s.surplus, 20_200);
        assert_eq!(s.earmark_eff, 5_000);
        assert_eq!(s.free_capital, 15_200);
        assert_eq!(s.liquid_budget, 53_000);
        assert_eq!(s.net_assets, 98_200);
        assert!(!s.under_covered());

        let under = Solvency::compute(&SolvencyInputs {
            remaining_cover_total: 200_000,
            ..i
        })
        .unwrap();
        assert!(under.under_covered());
        assert_eq!(under.surplus, 0);
        assert_eq!(under.earmark_eff, 0);
        assert_eq!(under.free_capital, 0);
    }

    #[test]
    fn compute_errors_never_wraps() {
        let i = SolvencyInputs {
            brs_balance: u64::MAX,
            tesouro_units: 1,
            tesouro_price: PRICE_SCALE,
            ..Default::default()
        };
        assert!(Solvency::compute(&i).is_err());
        let i = SolvencyInputs {
            brs_balance: u64::MAX,
            remaining_cover_total: u64::MAX,
            coverage_ratio_bps: 10_000,
            provisions: u64::MAX,
            ..Default::default()
        };
        let s = Solvency::compute(&i).unwrap();
        assert_eq!(s.stable_assets, u64::MAX);
        assert_eq!(s.surplus, 0);
        assert_eq!(s.net_assets, 0);
    }

    // -- property tests ---------------------------------------------------

    fn inputs() -> impl Strategy<Value = SolvencyInputs> {
        (
            0u64..=1u64 << 50,
            0u64..=1u64 << 40,
            1u64..=1u64 << 40,
            0u64..=1u64 << 50,
            MIN_COVERAGE_RATIO_BPS..=20_000,
            0u64..=1u64 << 50,
            0u64..=1u64 << 50,
            any::<bool>(),
        )
            .prop_map(|(brs, units, price, cover, c, prov, earmark, flag)| {
                SolvencyInputs {
                    brs_balance: brs,
                    tesouro_units: units,
                    tesouro_price: price,
                    remaining_cover_total: cover,
                    coverage_ratio_bps: c,
                    provisions: prov,
                    buffer_earmark: earmark,
                    feature_flags: if flag { INSTANT_EXIT } else { 0 },
                    head_starved: false,
                }
            })
    }

    /// Independent oracle for `surplus`, in `u128`.
    fn oracle_surplus(i: &SolvencyInputs) -> u64 {
        let tv = i.tesouro_units as u128 * i.tesouro_price as u128 / PRICE_SCALE as u128;
        let stable = i.brs_balance as u128 + tv;
        let cov = (i.remaining_cover_total as u128 * i.coverage_ratio_bps as u128)
            .div_ceil(10_000)
            .max(i.provisions as u128);
        stable.saturating_sub(cov) as u64
    }

    proptest! {
        #![proptest_config(cfg())]

        /// Pilot: `buffer_earmark == 0` ⇒ `earmark_eff == 0` and
        /// `free_capital == surplus`, flag or not.
        #[test]
        fn zero_stored_earmark_means_free_capital_is_surplus(i in inputs()) {
            let s = Solvency::compute(&SolvencyInputs { buffer_earmark: 0, ..i }).unwrap();
            prop_assert_eq!(s.surplus, oracle_surplus(&i));
            prop_assert_eq!(s.earmark_eff, 0);
            prop_assert_eq!(s.free_capital, s.surplus);
        }

        /// Flag clear ⇒ the stored level has no effect.
        #[test]
        fn flag_clear_means_no_earmark(i in inputs(), stored: u64) {
            let s = Solvency::compute(&SolvencyInputs {
                feature_flags: 0,
                buffer_earmark: stored,
                ..i
            })
            .unwrap();
            prop_assert_eq!(s.earmark_eff, 0);
            prop_assert_eq!(s.free_capital, s.surplus);
            prop_assert_eq!(s.liquid_budget, i.brs_balance.saturating_sub(i.provisions));
        }

        /// Flag set: invariant 13 bounds, starved head, and the identity
        /// `free_capital + earmark_eff == surplus`.
        #[test]
        fn earmark_bounds_with_the_flag_set(i in inputs(), starved: bool) {
            let i = SolvencyInputs { feature_flags: INSTANT_EXIT, head_starved: starved, ..i };
            let s = Solvency::compute(&i).unwrap();
            prop_assert_eq!(s.surplus, oracle_surplus(&i));
            prop_assert!(s.earmark_eff <= s.surplus);
            prop_assert!(s.earmark_eff <= i.brs_balance.saturating_sub(i.provisions));
            prop_assert!(s.earmark_eff <= i.buffer_earmark);
            prop_assert_eq!(s.free_capital + s.earmark_eff, s.surplus);
            if starved {
                prop_assert_eq!(s.earmark_eff, 0);
            } else {
                prop_assert_eq!(
                    s.earmark_eff,
                    i.buffer_earmark
                        .min(s.surplus)
                        .min(i.brs_balance.saturating_sub(i.provisions))
                );
            }
            if s.under_covered() {
                prop_assert_eq!(s.earmark_eff, 0);
            }
            prop_assert!(s.free_capital <= s.surplus);
            prop_assert!(s.liquid_budget <= i.brs_balance);
        }

        /// Invariant 16: a sequence of gated outflows, each bounded by the
        /// capacity computed before it, never changes `earmark_eff`.
        ///
        /// Outflows: a redemption fill (`≤ min(free_capital, liquid_budget)`,
        /// pays BRS out), a new guarantee (`coverage_required_after +
        /// earmark_eff_before ≤ stable_assets`) and an allocation of BRS to
        /// TESOURO at par (`brs_after ≥ provisions + earmark_eff_before`).
        #[test]
        fn sequential_outflows_never_consume_the_earmark(
            i in inputs(),
            steps in prop::collection::vec((0u8..3, any::<u64>()), 1..24),
        ) {
            let mut i = SolvencyInputs {
                feature_flags: INSTANT_EXIT,
                tesouro_price: PRICE_SCALE, // par: 1 TESOURO = 1 BRS
                ..i
            };
            let e0 = Solvency::compute(&i).unwrap().earmark_eff;
            prop_assert_eq!(
                e0,
                i.buffer_earmark
                    .min(oracle_surplus(&i))
                    .min(i.brs_balance.saturating_sub(i.provisions))
            );
            for (kind, seed) in steps {
                let before = Solvency::compute(&i).unwrap();
                match kind {
                    0 => {
                        let cap = before.free_capital.min(before.liquid_budget);
                        if cap == 0 { continue; }
                        let a = seed % cap + 1;
                        i.brs_balance -= a;
                    }
                    1 => {
                        // Largest cover increment that keeps
                        // coverage_after + earmark_eff_before ≤ stable_assets.
                        let room = before.free_capital;
                        if room == 0 { continue; }
                        let add = seed % room + 1;
                        let after = coverage_required(
                            i.remaining_cover_total + add,
                            i.coverage_ratio_bps,
                            i.provisions,
                        ).unwrap();
                        if after + before.earmark_eff > before.stable_assets { continue; }
                        i.remaining_cover_total += add;
                    }
                    _ => {
                        let cap = i
                            .brs_balance
                            .saturating_sub(i.provisions + before.earmark_eff);
                        if cap == 0 { continue; }
                        let a = seed % cap + 1;
                        i.brs_balance -= a;
                        i.tesouro_units += a;
                    }
                }
                let after = Solvency::compute(&i).unwrap();
                prop_assert_eq!(after.earmark_eff, before.earmark_eff);
            }
            prop_assert_eq!(Solvency::compute(&i).unwrap().earmark_eff, e0);
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
                ..Default::default()
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
