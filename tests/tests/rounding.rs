//! Rounding and share-conversion properties of the math module (spec §4,
//! plan Task 2). Pure functions, no LiteSVM.

use mutav::{
    constants::VIRTUAL_OFFSET as V,
    coverage::is_underwater,
    math::{assets_for, mul_div, shares_for, Rounding},
};
use proptest::prelude::*;

fn cfg() -> ProptestConfig {
    ProptestConfig {
        cases: 256,
        failure_persistence: None,
        ..ProptestConfig::default()
    }
}

/// A reserve snapshot: `(shares_outstanding, net_assets)`, up to ~R$10^9.
///
/// Any pair is a state the program can hold (net assets fall independently
/// of shares on a default), but not every conversion runs from every state;
/// the properties below restrict the *operation* to what the program allows:
/// see [`redeem_case`] and [`minted`].
fn reserve() -> impl Strategy<Value = (u64, u64)> {
    (0u64..=1u64 << 50, 0u64..=1u64 << 50)
}

/// A reserve snapshot plus a redemption `sh ≤ shares_outstanding`.
///
/// `shares_outstanding` is the share mint's supply: only `fulfil_deposits`
/// (mint) and `fulfil_redeems` (burn) move it, so a redemption, escrowed or
/// sized by `request_redeem`, never names more shares than it. With
/// `sh ≤ s`, `assets_for` is `floor(sh × (n + 1) / (s + 1)) ≤ n` and cannot
/// overflow; the CI failure `(s, n) = (0, 26266), sh = 702278298766877`
/// redeemed shares that do not exist (see the regression test below).
fn redeem_case() -> impl Strategy<Value = ((u64, u64), u64)> {
    reserve().prop_flat_map(|(s, n)| (Just((s, n)), 0..=s))
}

/// The shares a deposit of `x` mints at `(s, n)`, or `None` where the program
/// cannot fill it, after checking that it is refused rather than wrapped:
///
/// - an underwater reserve (`n × NAV_SCALE < s`, ADR 0022/0029) is refused by
///   `fulfil_deposits` (`ReserveUnderwater`) before any pricing, e.g. the
///   20k-case find `(s, n) = (453558799475303, 0), x = 40671`;
/// - a fill whose shares would take the supply past `u64::MAX` is an error
///   (`MathOverflow` in `shares_for` or the `shares_outstanding` add), never
///   a wrap; the request stays pending and its owner can cancel it.
fn minted(x: u64, s: u64, n: u64) -> Option<u64> {
    if is_underwater(n, s) {
        return None;
    }
    let exact = x as u128 * (s as u128 + V as u128) / (n as u128 + 1);
    if s as u128 + exact > u64::MAX as u128 {
        assert!(shares_for(x, s, n).map_or(true, |sh| s.checked_add(sh).is_none()));
        return None;
    }
    Some(shares_for(x, s, n).unwrap())
}

proptest! {
    #![proptest_config(cfg())]

    /// `assets_for(shares_for(x)) ≤ x` at a fixed state.
    #[test]
    fn round_trip_never_gains((s, n) in reserve(), x in 0u64..=1u64 << 50) {
        let Some(shares) = minted(x, s, n) else { return Ok(()) };
        let back = assets_for(shares, s, n).unwrap();
        prop_assert!(back <= x, "deposit {x} → {shares} sh → {back}");
    }

    /// A depositor who redeems right after the deposit (state updated) gets
    /// at most what they put in.
    #[test]
    fn deposit_then_redeem_never_gains((s, n) in reserve(), x in 0u64..=1u64 << 50) {
        let Some(shares) = minted(x, s, n) else { return Ok(()) };
        let back = assets_for(shares, s + shares, n + x).unwrap();
        prop_assert!(back <= x);
    }

    /// `shares_for(assets_for(sh)) ≤ sh` at a fixed state.
    #[test]
    fn redeem_round_trip_never_gains(((s, n), sh) in redeem_case()) {
        let a = assets_for(sh, s, n).unwrap();
        prop_assert!(shares_for(a, s, n).unwrap() <= sh);
    }

    /// Both conversions are the floor of the exact rational: never more than
    /// exact, and within one base unit of it.
    #[test]
    fn conversions_round_in_the_reserves_favour(
        ((s, n), burn) in redeem_case(),
        x in 0u64..=1u64 << 50,
    ) {
        let (sv, n1) = (s as u128 + V as u128, n as u128 + 1);
        if let Some(sh) = minted(x, s, n) {
            let sh = sh as u128;
            prop_assert!(sh * n1 <= x as u128 * sv);
            prop_assert!((sh + 1) * n1 > x as u128 * sv);
        }
        let a = assets_for(burn, s, n).unwrap() as u128;
        prop_assert!(a * sv <= burn as u128 * n1);
        prop_assert!((a + 1) * sv > burn as u128 * n1);
    }

    /// A deposit or a redemption at the conversion price never lowers the
    /// price per share of the holders who stay (invariant 12).
    #[test]
    fn conversions_never_dilute((s, n) in reserve(), x in 0u64..=1u64 << 50) {
        let p = |s: u64, n: u64| (n as u128 + 1, s as u128 + V as u128);
        let (num0, den0) = p(s, n);

        if let Some(sh) = minted(x, s, n) {
            let (num1, den1) = p(s + sh, n + x);
            prop_assert!(num1 * den0 >= num0 * den1, "deposit diluted");
        }

        let burn = x.min(s);
        let a = assets_for(burn, s, n).unwrap();
        prop_assert!(a <= n + 1);
        let (num2, den2) = p(s - burn, n.saturating_sub(a));
        if a <= n {
            prop_assert!(num2 * den0 >= num0 * den2, "redemption diluted");
        }
    }

    /// Over the whole `u64` domain, a redemption of shares that exist
    /// (`sh ≤ shares_outstanding`) always converts, to at most the net
    /// assets: `assets_for` has no reachable `MathOverflow`.
    #[test]
    fn redemption_of_existing_shares_never_errors(s: u64, n: u64, frac in 0u64..=1_000) {
        let sh = (s as u128 * frac as u128 / 1_000) as u64;
        for sh in [sh, s] {
            let a = assets_for(sh, s, n).unwrap();
            prop_assert!(a <= n, "redeem {sh} of {s} sh at {n} → {a}");
        }
    }

    /// At `u64` extremes the result is exact or an error, never a wrap.
    #[test]
    fn extremes_error_never_wrap(a: u64, b: u64, d in 1u64.., s: u64, n: u64) {
        let exact = a as u128 * b as u128 / d as u128;
        match mul_div(a, b, d, Rounding::Down) {
            Ok(q) => prop_assert_eq!(q as u128, exact),
            Err(_) => prop_assert!(exact > u64::MAX as u128),
        }
        let sv = s as u128 + V as u128;
        let n1 = n as u128 + 1;
        // Oracle in u128; `None` means the product itself overflows u128.
        let fits = |q: Option<u128>| q.filter(|q| *q <= u64::MAX as u128);
        let sh_oracle = (a as u128).checked_mul(sv).map(|p| p / n1);
        match shares_for(a, s, n) {
            Ok(q) => prop_assert_eq!(Some(q as u128), sh_oracle),
            Err(_) => prop_assert!(fits(sh_oracle).is_none()),
        }
        let a_oracle = (a as u128).checked_mul(n1).map(|p| p / sv);
        match assets_for(a, s, n) {
            Ok(q) => prop_assert_eq!(Some(q as u128), a_oracle),
            Err(_) => prop_assert!(fits(a_oracle).is_none()),
        }
    }

    /// First-depositor inflation at the pinned `V = 1` (spec §12 Q20): the
    /// attacker deposits 1 base unit into an empty reserve, then raises
    /// `net_assets` by `donation` (modelled directly; a raw token transfer does
    /// not even reach the tracked balance, and only the operator's
    /// `contribute_fees` can raise it). A victim depositing `x` with
    /// `donation + 2 ≤ 2·V·x` is never zeroed.
    #[test]
    fn inflation_attack_does_not_zero_the_next_depositor(
        x in 1u64..=1u64 << 40,
        frac in 0u64..=1_000,
    ) {
        let attacker = shares_for(1, 0, 0).unwrap();
        prop_assert_eq!(attacker, V);
        // Donation up to the largest value that leaves the victim ≥ 1 share.
        let max_donation = (2 * V as u128 * x as u128 - 2).min(1u128 << 60) as u64;
        let donation = (max_donation as u128 * frac as u128 / 1_000) as u64;
        let n = 1 + donation;

        let victim = shares_for(x, attacker, n).unwrap();
        prop_assert!(victim > 0, "victim zeroed: x={x} donation={donation}");

        let s = attacker + victim;
        let n = n + x;
        let attacker_out = assets_for(attacker, s, n).unwrap();
        prop_assert!(attacker_out as u128 <= 1 + donation as u128, "attack profitable");
    }

    /// At `V = 1`, for **any** donation (even one that zeroes the victim), the
    /// attacker never ends with more than they put in: the attack is never
    /// profitable, only griefing, and the donation itself is unreachable
    /// without the operator.
    #[test]
    fn inflation_attack_is_never_profitable(
        x in 1u64..=1u64 << 40,
        donation in 0u64..=1u64 << 60,
    ) {
        let attacker = shares_for(1, 0, 0).unwrap();
        let n = 1 + donation;
        let victim = shares_for(x, attacker, n).unwrap();
        let s = attacker + victim;
        let n = n + x;
        let attacker_out = assets_for(attacker, s, n).unwrap();
        prop_assert!(attacker_out as u128 <= 1 + donation as u128, "attack profitable");
        let victim_out = assets_for(victim, s, n).unwrap();
        prop_assert!(victim_out <= x);
    }
}

/// The plan's worked case at `V = 1`: a 1-unit first deposit and a donation
/// equal to the victim's deposit still leave the victim with shares, and the
/// attacker loses at least as much as the victim.
#[test]
fn inflation_with_donation_equal_to_the_deposit() {
    let x = 1_000_000_000; // R$1,000.00
    let attacker = shares_for(1, 0, 0).unwrap();
    assert_eq!(attacker, 1);
    let victim = shares_for(x, attacker, 1 + x).unwrap();
    assert!(victim > 0);
    let (s, n) = (attacker + victim, 1 + 2 * x);
    let back = assets_for(victim, s, n).unwrap();
    let attacker_back = assets_for(attacker, s, n).unwrap();
    assert!(back <= x);
    // The attacker put in 1 + x and loses at least what the victim loses.
    assert!((1 + x) - attacker_back >= x - back);
}

/// Regression for the CI failure `(s, n) = (0, 26266), sh = 702278298766877`:
/// `assets_for` returned `MathOverflow` because the result,
/// `sh × 26267 ≈ 1.8447e19`, exceeds `u64::MAX`. The input redeems shares
/// from a reserve with none outstanding, which the program cannot reach
/// (`shares_outstanding` is the share supply); every redemption the program
/// can see converts, to at most the net assets.
#[test]
fn redeeming_more_shares_than_exist_is_the_only_overflow() {
    let (s, n, sh) = (0u64, 26_266u64, 702_278_298_766_877u64);
    assert!(sh > s, "the failing input redeems shares that do not exist");
    assert!(assets_for(sh, s, n).is_err(), "an error, never a wrap");
    // Every reachable redemption from that state, and at the u64 extremes.
    assert_eq!(assets_for(0, s, n).unwrap(), 0);
    assert_eq!(assets_for(u64::MAX, u64::MAX, u64::MAX).unwrap(), u64::MAX);
    assert_eq!(assets_for(1, 1, u64::MAX).unwrap(), 1 << 63);
}

/// Regression for the 20k-case find `(s, n) = (453558799475303, 0),
/// x = 40671`: a deposit priced into a reserve with shares and no net assets
/// mints `≈ x × s` shares and overflows the supply. That reserve is
/// underwater, and `fulfil_deposits` refuses it with `ReserveUnderwater`
/// before pricing (covered in `capital_rules.rs` / `capital_async.rs`).
#[test]
fn deposit_into_a_zero_nav_reserve_is_refused_upstream() {
    let (s, n, x) = (453_558_799_475_303u64, 0u64, 40_671u64);
    assert!(is_underwater(n, s));
    assert_eq!(minted(x, s, n), None);
}
