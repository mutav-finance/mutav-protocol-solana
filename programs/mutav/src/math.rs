//! Fixed-point math (spec §4, Conventions).
//!
//! Pure functions, no accounts. Every product is taken in `u128`, every
//! division rounds explicitly, and any result that does not fit is an error
//! (`MathOverflow`), never a wrap. Rounding is always in the reserve's favour:
//! down for what the reserve pays or mints, up for what it owes or requires.

use anchor_lang::prelude::*;

use crate::{constants::VIRTUAL_OFFSET, errors::MutavError};

/// Rounding direction of a division.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rounding {
    /// Floor: amounts the reserve pays out or mints.
    Down,
    /// Ceiling: amounts the reserve requires or is owed.
    Up,
}

/// `a × b / d` in `u128`, rounded as asked. Fails on `d == 0` or if the
/// product or the result does not fit in `u128`.
pub fn mul_div_u128(a: u128, b: u128, d: u128, rounding: Rounding) -> Result<u128> {
    require!(d != 0, MutavError::MathOverflow);
    let product = a.checked_mul(b).ok_or(MutavError::MathOverflow)?;
    let q = product / d;
    match rounding {
        Rounding::Down => Ok(q),
        Rounding::Up if product % d == 0 => Ok(q),
        Rounding::Up => Ok(q.checked_add(1).ok_or(MutavError::MathOverflow)?),
    }
}

/// `a × b / d` with a `u128` intermediate, rounded as asked. Fails on
/// `d == 0` or if the result does not fit in `u64`.
pub fn mul_div(a: u64, b: u64, d: u64, rounding: Rounding) -> Result<u64> {
    to_u64(mul_div_u128(a as u128, b as u128, d as u128, rounding)?)
}

/// Narrows to `u64`, failing instead of truncating.
pub fn to_u64(x: u128) -> Result<u64> {
    u64::try_from(x).map_err(|_| error!(MutavError::MathOverflow))
}

/// Shares minted for `assets` on a deposit (spec §4), rounded down:
/// `floor(assets × (shares_outstanding + V) / (net_assets + 1))`, with
/// `V = VIRTUAL_OFFSET` (`10^0 = 1`, spec §12 Q20).
pub fn shares_for(assets: u64, shares_outstanding: u64, net_assets: u64) -> Result<u64> {
    to_u64(mul_div_u128(
        assets as u128,
        shares_outstanding as u128 + VIRTUAL_OFFSET as u128,
        net_assets as u128 + 1,
        Rounding::Down,
    )?)
}

/// Assets paid for `shares` on a redemption (spec §4), rounded down:
/// `floor(shares × (net_assets + 1) / (shares_outstanding + V))`.
pub fn assets_for(shares: u64, shares_outstanding: u64, net_assets: u64) -> Result<u64> {
    to_u64(mul_div_u128(
        shares as u128,
        net_assets as u128 + 1,
        shares_outstanding as u128 + VIRTUAL_OFFSET as u128,
        Rounding::Down,
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    use crate::constants::VIRTUAL_OFFSET;

    #[test]
    fn virtual_offset_is_pinned_to_one() {
        // Spec §12 Q20 (decided 2026-10-06): k = 0, V = 10^0 = 1.
        assert_eq!(VIRTUAL_OFFSET, 1);
    }

    #[test]
    fn mul_div_rounds_as_asked() {
        assert_eq!(mul_div(7, 3, 2, Rounding::Down).unwrap(), 10);
        assert_eq!(mul_div(7, 3, 2, Rounding::Up).unwrap(), 11);
        // Exact divisions are the same either way.
        assert_eq!(mul_div(8, 3, 2, Rounding::Down).unwrap(), 12);
        assert_eq!(mul_div(8, 3, 2, Rounding::Up).unwrap(), 12);
        assert_eq!(mul_div(0, 3, 2, Rounding::Up).unwrap(), 0);
    }

    #[test]
    fn mul_div_uses_a_wide_intermediate() {
        // u64::MAX × u64::MAX overflows u64 but not u128.
        assert_eq!(
            mul_div(u64::MAX, u64::MAX, u64::MAX, Rounding::Down).unwrap(),
            u64::MAX
        );
        assert_eq!(
            mul_div(u64::MAX, 10_000, 10_000, Rounding::Up).unwrap(),
            u64::MAX
        );
    }

    #[test]
    fn mul_div_errors_never_wraps() {
        assert!(mul_div(u64::MAX, 2, 1, Rounding::Down).is_err());
        assert!(mul_div(u64::MAX, u64::MAX, 1, Rounding::Up).is_err());
        assert!(mul_div(1, 1, 0, Rounding::Down).is_err());
        // Ceil of a result just above u64::MAX.
        assert!(mul_div(u64::MAX, 3, 2, Rounding::Up).is_err());
        assert!(mul_div_u128(u128::MAX, 2, 1, Rounding::Down).is_err());
        assert!(mul_div_u128(1, 1, 0, Rounding::Up).is_err());
        assert_eq!(
            mul_div_u128(u128::MAX, 1, 1, Rounding::Up).unwrap(),
            u128::MAX
        );
    }

    #[test]
    fn empty_reserve_mints_one_share_per_base_unit() {
        // shares_for(a) = a × (0 + 1) / (0 + 1): one share = 1 BRS at launch
        // (both mints have 6 decimals).
        assert_eq!(shares_for(5_000_000, 0, 0).unwrap(), 5_000_000);
        assert_eq!(
            assets_for(5_000_000, 5_000_000, 5_000_000).unwrap(),
            5_000_000
        );
    }

    #[test]
    fn conversion_rounds_down() {
        // 10 × (100 + 1) / (333 + 1) = 3.02… → 3.
        assert_eq!(shares_for(10, 100, 333).unwrap(), 3);
        // 32 × (333 + 1) / (100 + 1) = 105.82… → 105.
        assert_eq!(assets_for(32, 100, 333).unwrap(), 105);
    }

    #[test]
    fn conversion_errors_at_extremes() {
        // A result above u64::MAX is an error.
        assert!(shares_for(u64::MAX, u64::MAX, 0).is_err());
        // u64::MAX inputs that fit still convert:
        // MAX × MAX / (MAX + 1) = MAX − 1, remainder 1.
        assert_eq!(
            assets_for(u64::MAX, u64::MAX, u64::MAX - 1).unwrap(),
            u64::MAX - 1
        );
        assert_eq!(
            shares_for(u64::MAX, u64::MAX - 1, u64::MAX).unwrap(),
            u64::MAX - 1
        );
    }

    proptest! {
        #![proptest_config(ProptestConfig { cases: 256, failure_persistence: None, ..ProptestConfig::default() })]

        #[test]
        fn mul_div_brackets_the_exact_quotient(a: u64, b: u64, d in 1u64..) {
            let exact = a as u128 * b as u128;
            let d128 = d as u128;
            if let Ok(lo) = mul_div(a, b, d, Rounding::Down) {
                prop_assert!(lo as u128 * d128 <= exact);
                prop_assert!((lo as u128 + 1) * d128 > exact);
            } else {
                prop_assert!(exact / d128 > u64::MAX as u128);
            }
            if let Ok(hi) = mul_div(a, b, d, Rounding::Up) {
                prop_assert!(hi as u128 * d128 >= exact);
                prop_assert!(hi == 0 || (hi as u128 - 1) * d128 < exact);
            } else {
                prop_assert!(exact.div_ceil(d128) > u64::MAX as u128);
            }
        }
    }
}
