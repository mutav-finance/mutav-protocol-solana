//! The solvency gate on `register_guarantee` (spec §4, §5.2 rule 5; plan
//! Task 3): `coverage_required_after + earmark_eff_before ≤ stable_assets`,
//! at the boundary, with `c > 1`, with `c < 1` (ADR 0016), with provisions,
//! and with an injected earmark (invariant 16, carried from 2a).

use mutav::{
    constants::{INSTANT_EXIT, MIN_COVERAGE_RATIO_BPS},
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

/// c = 0.10 (ADR 0016): R$10k of capital backs R$100k of cover, and the
/// coverage ratio term rounds up at the boundary.
#[test]
fn registration_at_the_coverage_floor() {
    let mut f = Fixture::new();
    let mut args = set_config_args(&f.config());
    args.coverage_ratio_bps = MIN_COVERAGE_RATIO_BPS;
    f.set_config(args).unwrap();
    f.fund_reserve(10_000 * BRL);
    for _ in 0..3 {
        f.register(guarantee_args(unique_hash(), 30_000 * BRL, 0))
            .expect("R$30k at c = 0.10");
    }
    // R$90k of cover needs R$9k; R$10k more fills the reserve exactly.
    assert_eq!(f.state().coverage_required, 9_000 * BRL);
    assert_mutav_err(
        f.register(guarantee_args(unique_hash(), 10_000 * BRL + 1, 0)),
        MutavError::InsufficientFreeCapital,
    );
    f.register(guarantee_args(unique_hash(), 10_000 * BRL, 0))
        .expect("exactly at c = 0.10");
    let s = f.state();
    assert_eq!(s.remaining_cover_total, 100_000 * BRL);
    assert_eq!(s.coverage_required, 10_000 * BRL);
    assert_eq!(free_capital(&f), 0);
}

/// c = 0.10 (ADR 0016): `coverage_required` never falls below the open
/// provisions. Once filed claims exceed `stable_assets` the reserve is
/// under-covered and a registration the ratio term alone would allow is
/// refused.
#[test]
fn provisions_bind_coverage_below_one_and_block_registration() {
    let mut f = Fixture::new();
    let mut args = set_config_args(&f.config());
    args.coverage_ratio_bps = MIN_COVERAGE_RATIO_BPS;
    f.set_config(args).unwrap();
    f.fund_reserve(10_000 * BRL);
    let g1 = guarantee_args(unique_hash(), 30_000 * BRL, 0);
    let g2 = guarantee_args(unique_hash(), 30_000 * BRL, 0);
    f.register(g1.clone()).unwrap();
    f.register(g2.clone()).unwrap();
    assert_eq!(f.state().coverage_required, 6_000 * BRL);

    // R$9k filed: the provisions term binds (9k > 0.10 × 60k).
    f.file_claim(Claim::on(&g1, 6_000 * BRL)).unwrap();
    f.file_claim(Claim::on(&g2, 3_000 * BRL)).unwrap();
    let sol = solvency(&f.config(), &f.state());
    assert_eq!(sol.coverage_required, 9_000 * BRL);
    assert_eq!(f.state().coverage_required, 9_000 * BRL, "cached on file");
    assert_eq!(sol.free_capital, 1_000 * BRL);

    // While the provisions bind, new cover adds no coverage until the ratio
    // term catches up: R$30k more (0.10 × 90k = 9k) still fits.
    f.register(guarantee_args(unique_hash(), 30_000 * BRL, 0))
        .expect("ratio term still at or below the provisions");
    assert_eq!(f.state().coverage_required, 9_000 * BRL);

    // R$2k more filed: provisions of R$11k exceed the R$10k of stable
    // assets. The ratio term alone (0.10 × 91k = 9.1k) would allow the next
    // registration; the provisions term refuses it.
    f.file_claim(Claim::on(&g2, 2_000 * BRL)).unwrap();
    let sol = solvency(&f.config(), &f.state());
    assert_eq!(sol.coverage_required, 11_000 * BRL);
    assert!(sol.under_covered());
    let before = f.raw(&f.pdas.state);
    assert_mutav_err(
        f.register(guarantee_args(unique_hash(), 1_000 * BRL, 0)),
        MutavError::UnderCovered,
    );
    assert_eq!(f.raw(&f.pdas.state), before);
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
    // brs 50k, provisions 45k on 45k of remaining cover → the liquidity term
    // caps `earmark_eff` at 5k below the stored 10k.
    //
    // With BRS only, `coverage_required ≥ provisions` (ADR 0016), so
    // `liquid ≤ surplus` and the liquidity term binds together with the
    // surplus: `free_capital = 0`, no registration can succeed and apply the
    // ratchet. `refresh` stores the lower level.
    let mut f = Fixture::new();
    f.fund_reserve(50_000 * BRL);
    inject_earmark(&mut f, true, 10_000 * BRL);
    let mut s = f.state();
    s.provisions = 45_000 * BRL;
    s.remaining_cover_total = 45_000 * BRL;
    f.write_state(&s);
    let sol = solvency(&f.config(), &f.state());
    assert_eq!(sol.earmark_eff, 5_000 * BRL);
    assert_eq!(sol.free_capital, 0);

    f.refresh().unwrap();
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
