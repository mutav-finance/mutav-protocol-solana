//! Rounding and share-conversion properties of the math module (spec §4,
//! plan Task 2). Pure functions, no LiteSVM.

use mutav::math::{assets_for, mul_div, shares_for, Rounding};
use proptest::prelude::*;

fn cfg() -> ProptestConfig {
    ProptestConfig {
        cases: 256,
        failure_persistence: None,
        ..ProptestConfig::default()
    }
}

/// Virtual offsets `V = 10^k` for several `k` (k itself is TBD, spec §12 Q20).
fn virtual_offset() -> impl Strategy<Value = u64> {
    prop::sample::select(vec![1u64, 1_000, 1_000_000, 1_000_000_000])
}

/// A reserve snapshot: `(shares_outstanding, net_assets)`, up to ~R$10^9.
fn reserve() -> impl Strategy<Value = (u64, u64)> {
    (0u64..=1u64 << 50, 0u64..=1u64 << 50)
}

proptest! {
    #![proptest_config(cfg())]

    /// `assets_for(shares_for(x)) ≤ x` at a fixed state.
    #[test]
    fn round_trip_never_gains((s, n) in reserve(), v in virtual_offset(), x in 0u64..=1u64 << 50) {
        let shares = shares_for(x, s, n, v).unwrap();
        let back = assets_for(shares, s, n, v).unwrap();
        prop_assert!(back <= x, "deposit {x} → {shares} sh → {back}");
    }

    /// A depositor who redeems right after the deposit (state updated) gets
    /// at most what they put in.
    #[test]
    fn deposit_then_redeem_never_gains((s, n) in reserve(), v in virtual_offset(), x in 0u64..=1u64 << 50) {
        let shares = shares_for(x, s, n, v).unwrap();
        let back = assets_for(shares, s + shares, n + x, v).unwrap();
        prop_assert!(back <= x);
    }

    /// `shares_for(assets_for(sh)) ≤ sh` at a fixed state.
    #[test]
    fn redeem_round_trip_never_gains((s, n) in reserve(), v in virtual_offset(), sh in 0u64..=1u64 << 50) {
        let a = assets_for(sh, s, n, v).unwrap();
        prop_assert!(shares_for(a, s, n, v).unwrap() <= sh);
    }

    /// Both conversions are the floor of the exact rational: never more than
    /// exact, and within one base unit of it.
    #[test]
    fn conversions_round_in_the_reserves_favour((s, n) in reserve(), v in virtual_offset(), x in 0u64..=1u64 << 50) {
        let (sv, n1) = (s as u128 + v as u128, n as u128 + 1);
        let sh = shares_for(x, s, n, v).unwrap() as u128;
        prop_assert!(sh * n1 <= x as u128 * sv);
        prop_assert!((sh + 1) * n1 > x as u128 * sv);
        let a = assets_for(x, s, n, v).unwrap() as u128;
        prop_assert!(a * sv <= x as u128 * n1);
        prop_assert!((a + 1) * sv > x as u128 * n1);
    }

    /// A deposit or a redemption at the conversion price never lowers the
    /// price per share of the holders who stay (invariant 12).
    #[test]
    fn conversions_never_dilute((s, n) in reserve(), v in virtual_offset(), x in 0u64..=1u64 << 50) {
        let p = |s: u64, n: u64| (n as u128 + 1, s as u128 + v as u128);
        let (num0, den0) = p(s, n);

        let sh = shares_for(x, s, n, v).unwrap();
        let (num1, den1) = p(s + sh, n + x);
        prop_assert!(num1 * den0 >= num0 * den1, "deposit diluted");

        let burn = x.min(s);
        let a = assets_for(burn, s, n, v).unwrap();
        prop_assert!(a <= n + 1);
        let (num2, den2) = p(s - burn, n.saturating_sub(a));
        if a <= n {
            prop_assert!(num2 * den0 >= num0 * den2, "redemption diluted");
        }
    }

    /// At `u64` extremes the result is exact or an error, never a wrap.
    #[test]
    fn extremes_error_never_wrap(a: u64, b: u64, d in 1u64.., s: u64, n: u64, v in 1u64..) {
        let exact = a as u128 * b as u128 / d as u128;
        match mul_div(a, b, d, Rounding::Down) {
            Ok(q) => prop_assert_eq!(q as u128, exact),
            Err(_) => prop_assert!(exact > u64::MAX as u128),
        }
        let sv = s as u128 + v as u128;
        let n1 = n as u128 + 1;
        // Oracle in u128; `None` means the product itself overflows u128.
        let fits = |q: Option<u128>| q.filter(|q| *q <= u64::MAX as u128);
        let sh_oracle = (a as u128).checked_mul(sv).map(|p| p / n1);
        match shares_for(a, s, n, v) {
            Ok(q) => prop_assert_eq!(Some(q as u128), sh_oracle),
            Err(_) => prop_assert!(fits(sh_oracle).is_none()),
        }
        let a_oracle = (a as u128).checked_mul(n1).map(|p| p / sv);
        match assets_for(a, s, n, v) {
            Ok(q) => prop_assert_eq!(Some(q as u128), a_oracle),
            Err(_) => prop_assert!(fits(a_oracle).is_none()),
        }
    }

    /// First-depositor inflation: the attacker deposits 1 base unit into an
    /// empty reserve, then raises `net_assets` by `donation` (modelled
    /// directly; a raw token transfer does not even reach the tracked
    /// balance). A victim depositing `x` with `donation + 2 ≤ 2·V·x` is never
    /// zeroed, and the attacker never ends with more than they put in.
    #[test]
    fn inflation_attack_does_not_zero_the_next_depositor(
        v in virtual_offset(),
        x in 1u64..=1u64 << 40,
        frac in 0u64..=1_000,
    ) {
        let attacker = shares_for(1, 0, 0, v).unwrap();
        prop_assert_eq!(attacker, v);
        // Donation up to the largest value that leaves the victim ≥ 1 share.
        let max_donation = (2 * v as u128 * x as u128 - 2).min(1u128 << 60) as u64;
        let donation = (max_donation as u128 * frac as u128 / 1_000) as u64;
        let n = 1 + donation;

        let victim = shares_for(x, attacker, n, v).unwrap();
        prop_assert!(victim > 0, "victim zeroed: x={x} donation={donation} V={v}");

        let s = attacker + victim;
        let n = n + x;
        let attacker_out = assets_for(attacker, s, n, v).unwrap();
        prop_assert!(attacker_out as u128 <= 1 + donation as u128, "attack profitable");
    }
}

/// The plan's worked case: a 1-unit first deposit and a donation equal to the
/// victim's deposit still leave the victim with shares, at every `V`.
#[test]
fn inflation_with_donation_equal_to_the_deposit() {
    for v in [1u64, 1_000, 1_000_000] {
        let x = 1_000_000_000; // R$1,000.00
        let attacker = shares_for(1, 0, 0, v).unwrap();
        let victim = shares_for(x, attacker, 1 + x, v).unwrap();
        assert!(victim > 0, "V={v}");
        // With a larger V the victim keeps more of their deposit.
        let back = assets_for(victim, attacker + victim, 1 + 2 * x, v).unwrap();
        assert!(back <= x);
        if v >= 1_000 {
            assert!(back >= x - x / 1_000, "V={v}: victim got back {back}");
        }
    }
}
