//! The solvency gate on `register_guarantee` (spec §4, §5.2 rule 5; plan
//! Task 3): `coverage_required_after + earmark_eff_before ≤ stable_assets`,
//! at the boundary, with `c > 1`, with provisions, and with an injected
//! earmark (invariant 16, carried from 2a).

use mutav::{
    constants::INSTANT_EXIT,
    errors::MutavError,
    solvency::{Solvency, SolvencyInputs},
    state::{VaultConfig, VaultState},
};
use mutav_tests::helpers::*;

fn solvency(c: &VaultConfig, s: &VaultState) -> Solvency {
    Solvency::compute(&SolvencyInputs {
        brs_balance: s.brs_balance,
        tesouro_units: s.tesouro_units,
        tesouro_price: s.tesouro_price,
        remaining_cover_total: s.remaining_cover_total,
        coverage_ratio_bps: c.coverage_ratio_bps,
        provisions: s.provisions,
        buffer_earmark: s.buffer_earmark,
        feature_flags: c.feature_flags,
        head_starved: false,
    })
    .unwrap()
}

fn free_capital(f: &Fixture) -> u64 {
    solvency(&f.config(), &f.state()).free_capital
}

/// Demo step: "the gate refusing an over-capacity registration" (plan
/// Task 19). R$50k of capital backs R$50k of cover at `c = 1.0`; the next
/// registration is refused and changes nothing.
#[test]
fn demo_registration_over_capacity_is_refused() {
    let mut f = Fixture::new();
    f.fund_reserve(50_000 * BRL);
    f.register(guarantee_args(unique_hash(), 20_000 * BRL, 10_000 * BRL))
        .expect("R$30k");
    f.register(guarantee_args(unique_hash(), 20_000 * BRL, 0))
        .expect("R$20k, exactly the free capital");
    assert_eq!(free_capital(&f), 0);

    let before = (f.raw(&f.pdas.state), f.state().active_guarantees);
    let refused = guarantee_args(unique_hash(), 1_000 * BRL, 0);
    assert_mutav_err(
        f.register(refused.clone()),
        MutavError::InsufficientFreeCapital,
    );
    assert_eq!((f.raw(&f.pdas.state), f.state().active_guarantees), before);
    assert!(f
        .svm
        .get_account(&guarantee_pda(&f.pdas.config, &refused.id))
        .is_none());
}

#[test]
fn registration_fits_exactly_up_to_free_capital() {
    let mut f = Fixture::new();
    f.fund_reserve(12_345 * BRL + 678);
    let free = free_capital(&f);
    assert_mutav_err(
        f.register(guarantee_args(unique_hash(), free + 1, 0)),
        MutavError::InsufficientFreeCapital,
    );
    f.register(guarantee_args(unique_hash(), free, 0))
        .expect("exactly free capital");
    assert_eq!(free_capital(&f), 0);
    assert_mutav_err(
        f.register(guarantee_args(unique_hash(), 0, 1)),
        MutavError::InsufficientFreeCapital,
    );
}

#[test]
fn coverage_after_rounds_up_with_c_above_one() {
    // c = 1.5: R$30k of capital backs R$20k of cover. One more base unit
    // needs ceil(1.5 × 1) = 2 base units more coverage.
    let mut f = Fixture::new();
    let mut args = set_config_args(&f.config());
    args.coverage_ratio_bps = 15_000;
    f.set_config(args).unwrap();
    f.fund_reserve(30_000 * BRL);
    assert_mutav_err(
        f.register(guarantee_args(unique_hash(), 20_000 * BRL + 1, 0)),
        MutavError::InsufficientFreeCapital,
    );
    f.register(guarantee_args(unique_hash(), 20_000 * BRL, 0))
        .expect("exactly at c = 1.5");
    let s = f.state();
    assert_eq!(s.coverage_required, 30_000 * BRL);
    assert_eq!(s.remaining_cover_total, 20_000 * BRL);
}

#[test]
fn provisions_do_not_shrink_registration_capacity() {
    // Invariant 6: a provision lowers NAV, never `stable_assets`, so it is
    // not counted twice against coverage.
    let mut f = Fixture::new();
    f.fund_reserve(10_000 * BRL);
    let mut s = f.state();
    s.provisions = 4_000 * BRL;
    f.write_state(&s);
    f.register(guarantee_args(unique_hash(), 10_000 * BRL, 0))
        .expect("full capacity despite provisions");
}

// ---------------------------------------------------------------------------
// Injected earmark (ADR 0011; spec §4 invariants 13, 16, 17; carried from 2a)
// ---------------------------------------------------------------------------

/// Injects the `INSTANT_EXIT` bit (which `set_config` refuses in the pilot)
/// and a stored earmark.
fn inject_earmark(f: &mut Fixture, flag: bool, earmark: u64) {
    let mut c = f.config();
    c.feature_flags = if flag { INSTANT_EXIT } else { 0 };
    f.write_config(&c);
    let mut s = f.state();
    s.buffer_earmark = earmark;
    f.write_state(&s);
}

#[test]
fn injected_earmark_shrinks_capacity_by_exactly_earmark_eff() {
    let mut f = Fixture::new();
    f.fund_reserve(50_000 * BRL);
    inject_earmark(&mut f, true, 5_000 * BRL);
    let sol = solvency(&f.config(), &f.state());
    assert_eq!(sol.earmark_eff, 5_000 * BRL);
    assert_eq!(sol.free_capital, 45_000 * BRL);

    // Boundary: R$45k fits, one base unit more does not.
    f.register(guarantee_args(unique_hash(), 30_000 * BRL, 0))
        .unwrap();
    assert_mutav_err(
        f.register(guarantee_args(unique_hash(), 15_000 * BRL + 1, 0)),
        MutavError::InsufficientFreeCapital,
    );
    f.register(guarantee_args(unique_hash(), 15_000 * BRL, 0))
        .expect("exactly surplus − earmark_eff");

    // The registrations never consumed the earmark (invariant 16), and the
    // ratchet stored `earmark_eff`.
    let sol = solvency(&f.config(), &f.state());
    assert_eq!(sol.earmark_eff, 5_000 * BRL);
    assert_eq!(sol.surplus, 5_000 * BRL);
    assert_eq!(sol.free_capital, 0);
    assert_eq!(f.state().buffer_earmark, 5_000 * BRL);
}

#[test]
fn ratchet_lowers_the_stored_level_when_liquidity_fell() {
    // brs 50k, provisions 45k → the liquidity term caps `earmark_eff` at 5k
    // below the stored 10k. A registration that fits stores 5k.
    //
    // (A stored level above the surplus leaves `free_capital = 0`, so no
    // registration can succeed and apply the ratchet; `refresh`, Task 10,
    // covers that case.)
    let mut f = Fixture::new();
    f.fund_reserve(50_000 * BRL);
    inject_earmark(&mut f, true, 10_000 * BRL);
    let mut s = f.state();
    s.provisions = 45_000 * BRL;
    f.write_state(&s);
    let sol = solvency(&f.config(), &f.state());
    assert_eq!(sol.earmark_eff, 5_000 * BRL);
    assert_eq!(sol.free_capital, 45_000 * BRL);

    f.register(guarantee_args(unique_hash(), 10_000 * BRL, 0))
        .unwrap();
    assert_eq!(f.state().buffer_earmark, 5_000 * BRL);
    assert_eq!(solvency(&f.config(), &f.state()).earmark_eff, 5_000 * BRL);
}

#[test]
fn a_refused_registration_leaves_the_stored_level() {
    let mut f = Fixture::new();
    f.fund_reserve(10_000 * BRL);
    inject_earmark(&mut f, true, 30_000 * BRL);
    // earmark_eff = min(30k, surplus 10k, liquid 10k) = 10k → free 0.
    assert_mutav_err(
        f.register(guarantee_args(unique_hash(), 1, 0)),
        MutavError::InsufficientFreeCapital,
    );
    assert_eq!(f.state().buffer_earmark, 30_000 * BRL);
}

#[test]
fn with_the_flag_clear_the_earmark_has_no_effect_and_register_stores_zero() {
    let mut f = Fixture::new();
    f.fund_reserve(50_000 * BRL);
    inject_earmark(&mut f, false, 5_000 * BRL);
    assert_eq!(free_capital(&f), 50_000 * BRL);
    f.register(guarantee_args(unique_hash(), 30_000 * BRL, 0))
        .unwrap();
    f.register(guarantee_args(unique_hash(), 20_000 * BRL, 0))
        .expect("full surplus, no earmark");
    assert_eq!(f.state().buffer_earmark, 0);
}
