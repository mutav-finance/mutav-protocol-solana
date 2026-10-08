//! Price safety (spec §7).
//!
//! BRS is valued at par. TESOURO pricing (`min(on-chain price, accrual
//! curve)` with staleness and deviation bounds) is built later
//! (`TODO(plan: TESOURO pricing built later, Tasks 8–9)`): until then any
//! TESOURO position fails closed with `StalePrice`.
//!
//! The NAV-move guard: a NAV-per-share move of more than
//! `price.max_nav_move_bps` in one `refresh` sets `fulfil_halted`, measured
//! net of the NAV per share that verified inflows added (ADR 0017).

use anchor_lang::prelude::*;

use crate::{
    constants::{BPS_DENOMINATOR, NAV_SCALE},
    math::{mul_div_u128, Rounding},
    solvency::nav_per_share,
};

/// The NAV per share `refresh` publishes and the guard compares (spec §7):
/// `0` exactly when no shares are outstanding, otherwise `nav_per_share`
/// floored at `1` (10⁻⁹ BRS per share). The floor makes `0` unambiguous, so a
/// collapse to NAV 0 with shares outstanding, and the recovery from it, are
/// measured moves rather than skipped ones.
pub fn published_nav(net_assets: u64, shares_outstanding: u64) -> Result<u64> {
    if shares_outstanding == 0 {
        return Ok(0);
    }
    Ok(nav_per_share(net_assets, shares_outstanding)?.max(1))
}

/// `true` when NAV per share moved from `prev` to `next` by strictly more
/// than `max_nav_move_bps` of `prev`, in either direction (spec §7). Both are
/// [`published_nav`] values, so `0` means no shares were (or are)
/// outstanding: then there is no NAV to protect and the move is not measured.
/// With shares outstanding on both sides, every move is measured, including
/// one to or from the floor of `1`.
///
/// `refresh` passes as `next` the NAV net of verified inflows
/// ([`guard_nav`], ADR 0017), so guarantee fees and swept income never trip
/// the guard; price and accounting shocks still do.
pub fn nav_move_exceeds(prev: u64, next: u64, max_nav_move_bps: u16) -> bool {
    if prev == 0 || next == 0 {
        return false;
    }
    let moved = prev.abs_diff(next) as u128;
    // moved / prev > max_bps / 10_000, without division.
    moved * BPS_DENOMINATOR as u128 > max_nav_move_bps as u128 * prev as u128
}

/// The NAV per share (`NAV_SCALE`) that a verified inflow of `net` BRS adds
/// when `shares_outstanding` shares are outstanding:
/// `ceil(net × NAV_SCALE / shares_outstanding)`, saturating at `u64::MAX`.
///
/// `contribute_fees` and `sweep_income` add it to `VaultState.inflow_nav`.
/// Measured per share at the moment of the inflow, it stays exact when shares
/// change later in the window: `fulfil_deposits` and `fulfil_redeems` convert
/// at the live NAV, which keeps NAV per share (up to their rounding), so the
/// inflow's share of the NAV is unchanged by the fill. (An amount in BRS
/// would not be: after a 90% redemption the same BRS is ten times more NAV
/// per share, and the guard would report a false fall.)
///
/// Rounded **up**, so the guard's NAV is never above the true NAV net of
/// inflows: a fall is never understated. The price is at most one NAV unit
/// (10⁻⁹ BRS per share) per inflow on a rise.
///
/// With **no shares outstanding** the inflow has no NAV per share to add and
/// adds `0` (fail closed): whatever NAV the next depositors receive is then
/// measured in full against the baseline, and halts if it moved beyond the
/// bound. When the baseline is also `0` (no shares at the last `refresh`),
/// the guard does not measure that window at all ([`nav_move_exceeds`]).
pub fn inflow_nav(net: u64, shares_outstanding: u64) -> u64 {
    if shares_outstanding == 0 {
        return 0;
    }
    // `net × NAV_SCALE` fits in `u128` and the divisor is non-zero.
    mul_div_u128(
        net as u128,
        NAV_SCALE as u128,
        shares_outstanding as u128,
        Rounding::Up,
    )
    .map_or(u64::MAX, |x| u64::try_from(x).unwrap_or(u64::MAX))
}

/// The NAV per share the guard compares (ADR 0017): the published NAV minus
/// `inflow_nav`, the NAV per share that verified inflows (`contribute_fees`,
/// `sweep_income`) added since the last `refresh`. Inflows are booked at the
/// instruction that moved them, so they are not a price or accounting shock.
///
/// `0` exactly when `published` is `0` (no shares outstanding). Otherwise
/// floored at `1`, like [`published_nav`], so a subtraction that saturates
/// (an inflow window followed by a loss, or a saturated counter) is a
/// measured fall rather than a skipped window: the guard fails closed.
pub fn guard_nav(published: u64, inflow_nav: u64) -> u64 {
    if published == 0 {
        return 0;
    }
    published.saturating_sub(inflow_nav).max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guard_nav_is_net_of_inflows() {
        let one = NAV_SCALE;
        // 9,500 shares at NAV 1.0, then a 500 fee: NAV 10,000 / 9,500.
        let published = published_nav(10_000, 9_500).unwrap();
        let added = inflow_nav(500, 9_500);
        assert_eq!(added, 52_631_579, "ceil(500 / 9,500 × 10⁹)");
        // Within one NAV unit of the baseline, never above it.
        let g = guard_nav(published, added);
        assert!(g <= one && one - g <= 1, "{g}");
        assert_eq!(guard_nav(one, 0), one);
        // A counter above the published NAV saturates at the floor of 1.
        assert_eq!(guard_nav(100, 500), 1);
        assert_eq!(guard_nav(0, 500), 0, "no shares: not measured");
    }

    #[test]
    fn inflow_nav_rounds_up_and_saturates() {
        assert_eq!(inflow_nav(1, 3), 333_333_334);
        assert_eq!(inflow_nav(3, 3), NAV_SCALE);
        assert_eq!(inflow_nav(0, 3), 0);
        // No shares: nothing to add (fail closed, see the doc).
        assert_eq!(inflow_nav(1_000, 0), 0);
        assert_eq!(inflow_nav(u64::MAX, 1), u64::MAX);
    }

    #[test]
    fn an_inflow_stays_exact_per_share_across_a_fill() {
        // ADR 0017 follow-up (#29): 30,000 shares at NAV 1.0, a 400 fee, then
        // 27,000 shares redeemed at the live NAV. Per share, the guard sees
        // no move; the old BRS counter saw a 12% fall.
        let (na0, s0, fee) = (30_000_000_000u64, 30_000_000_000u64, 400_000_000u64);
        let baseline = published_nav(na0, s0).unwrap();
        let added = inflow_nav(fee, s0);
        let na1 = na0 + fee;
        let paid = crate::math::assets_for(27_000_000_000, s0, na1).unwrap();
        let (na2, s2) = (na1 - paid, s0 - 27_000_000_000);
        let g = guard_nav(published_nav(na2, s2).unwrap(), added);
        assert!(!nav_move_exceeds(baseline, g, 1), "per share: {g}");
        let old = published_nav(na2 - fee, s2).unwrap();
        assert!(nav_move_exceeds(baseline, old, 1_000), "BRS counter: {old}");
    }

    #[test]
    fn strictly_more_than_the_bound_in_either_direction() {
        let one = 1_000_000_000;
        // 100 bps of 1.0 is 0.01.
        assert!(!nav_move_exceeds(one, one + 10_000_000, 100));
        assert!(nav_move_exceeds(one, one + 10_000_001, 100));
        assert!(!nav_move_exceeds(one, one - 10_000_000, 100));
        assert!(nav_move_exceeds(one, one - 10_000_001, 100));
        assert!(!nav_move_exceeds(one, one, 0));
        // A zero bound halts on any move (fail closed while X is TBD).
        assert!(nav_move_exceeds(one, one + 1, 0));
        assert!(!nav_move_exceeds(one, one + 1, 1));
    }

    #[test]
    fn published_nav_is_zero_only_without_shares() {
        assert_eq!(published_nav(1_000, 0).unwrap(), 0);
        assert_eq!(published_nav(0, 0).unwrap(), 0);
        assert_eq!(published_nav(0, 1_000).unwrap(), 1);
        assert_eq!(published_nav(1_000, 1_000).unwrap(), 1_000_000_000);
        // Collapse and recovery with shares outstanding are measured.
        let one = published_nav(1_000, 1_000).unwrap();
        let zero = published_nav(0, 1_000).unwrap();
        assert!(nav_move_exceeds(one, zero, 100));
        assert!(nav_move_exceeds(zero, one, 100));
    }

    #[test]
    fn no_shares_on_either_side_never_trips() {
        assert!(!nav_move_exceeds(0, 1_000_000_000, 100));
        assert!(!nav_move_exceeds(1_000_000_000, 0, 100));
    }

    #[test]
    fn extremes_do_not_overflow() {
        assert!(nav_move_exceeds(1, u64::MAX, 10_000));
        assert!(!nav_move_exceeds(u64::MAX, u64::MAX, 0));
        assert!(nav_move_exceeds(u64::MAX, 1, 9_999));
    }
}
