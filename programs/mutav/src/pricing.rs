//! Price safety (spec §7).
//!
//! BRS is valued at par. TESOURO pricing (`min(on-chain price, accrual
//! curve)` with staleness and deviation bounds) is built later
//! (`TODO(plan: TESOURO pricing built later, Tasks 8–9)`): until then any
//! TESOURO position fails closed with `StalePrice`.
//!
//! The NAV-move guard: a NAV-per-share move of more than
//! `price.max_nav_move_bps` in one `refresh` sets `fulfil_halted`.

use crate::constants::BPS_DENOMINATOR;

/// `true` when NAV per share moved from `prev` to `next` by strictly more
/// than `max_nav_move_bps` of `prev`, in either direction (spec §7). `false`
/// when either NAV is `0` (no published NAV: no shares outstanding, spec §4
/// TODO), since a relative move is undefined.
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
    fn undefined_nav_never_trips() {
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
