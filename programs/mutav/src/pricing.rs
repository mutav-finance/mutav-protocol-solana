//! Price safety (spec §7).
//!
//! BRS is valued at par. TESOURO pricing (`min(on-chain price, accrual
//! curve)` with staleness and deviation bounds) is built later
//! (`TODO(plan: TESOURO pricing built later, Tasks 8–9)`): until then any
//! TESOURO position fails closed with `StalePrice`.
//!
//! The NAV-move guard: a NAV-per-share move of more than
//! `price.max_nav_move_bps` in one `refresh` sets `fulfil_halted`.

use anchor_lang::prelude::*;

use crate::{constants::BPS_DENOMINATOR, solvency::nav_per_share};

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
// TODO(adr 0013: inflow-adjusted NAV guard) — the move is measured gross, as
// the spec says today, so a large guarantee-fee batch also trips it. Measuring
// it net of inflows is pending an ADR.
pub fn nav_move_exceeds(prev: u64, next: u64, max_nav_move_bps: u16) -> bool {
    if prev == 0 || next == 0 {
        return false;
    }
    let moved = prev.abs_diff(next) as u128;
    // moved / prev > max_bps / 10_000, without division.
    moved * BPS_DENOMINATOR as u128 > max_nav_move_bps as u128 * prev as u128
}

#[cfg(test)]
mod tests {
    use super::*;

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
