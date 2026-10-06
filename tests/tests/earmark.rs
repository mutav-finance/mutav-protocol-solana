//! The buffer earmark in the pilot (spec §4 invariants 13 and 17, §14.7
//! item 7; ADR 0011).
//!
//! Pilot: no instruction can raise `buffer_earmark` or set `INSTANT_EXIT`, so
//! after any sequence of pilot instructions `buffer_earmark == 0` and
//! `free_capital == surplus`.
//!
//! The injected-earmark tests that need gated instructions move to their
//! owning tasks (see `docs/plan.md`, "carried from 2a"): `register_guarantee`
//! (Task 3), `pay_claim` (Task 5), `fulfil_redeems` (Task 6), under-coverage
//! and the ratchet scope (Task 8), `allocate` (Task 9), `refresh` (Task 10).

use mutav::{
    constants::INSTANT_EXIT,
    solvency::{Solvency, SolvencyInputs},
    state::{VaultConfig, VaultState},
};
use mutav_tests::helpers::*;

/// The solvency snapshot an instruction would compute from these accounts.
/// The pilot holds no TESOURO, so the price terms are inert.
fn solvency(c: &VaultConfig, s: &VaultState) -> Solvency {
    Solvency::compute(&SolvencyInputs {
        brs_balance: s.brs_balance,
        tesouro_units: s.tesouro_units,
        tesouro_price: s.tesouro_price,
        price_scale: 1,
        remaining_cover_total: s.remaining_cover_total,
        coverage_ratio_bps: c.coverage_ratio_bps,
        provisions: s.provisions,
        buffer_earmark: s.buffer_earmark,
        feature_flags: c.feature_flags,
        head_starved: false,
    })
    .unwrap()
}

fn assert_pilot_earmark(f: &Fixture, at: &str) {
    let (c, s) = (f.config(), f.state());
    assert_eq!(c.feature_flags, 0, "{at}: feature flags");
    assert_eq!(s.buffer_earmark, 0, "{at}: stored earmark");
    let sol = solvency(&c, &s);
    assert_eq!(sol.earmark_eff, 0, "{at}");
    assert_eq!(sol.free_capital, sol.surplus, "{at}");
}

#[test]
fn earmark_stays_zero_through_any_pilot_sequence() {
    let mut f = Fixture::new();
    assert_pilot_earmark(&f, "init");
    let mut x: u64 = 0x2a2a_2a2a;
    for step in 0..40 {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        let mut ixs = f.pilot_instructions();
        let (name, ix, signer) = ixs.swap_remove((x % ixs.len() as u64) as usize);
        f.send(ix, &signer)
            .unwrap_or_else(|e| panic!("step {step} {name}: {:?}", e.err));
        assert_pilot_earmark(&f, &format!("step {step} {name}"));
    }
}

#[test]
fn set_config_cannot_enable_the_earmark() {
    let mut f = Fixture::new();
    let mut a = set_config_args(&f.config());
    a.feature_flags = INSTANT_EXIT;
    a.exit.buffer_target_bps = 500;
    assert!(f.set_config(a).is_err());
    assert_pilot_earmark(&f, "after refused enable");
}

#[test]
fn injected_earmark_with_the_flag_clear_has_no_effect() {
    // A stored level left by a newer binary, with the flag cleared (the
    // rollback path, spec §14.6): the pilot computes `earmark_eff = 0`, and no
    // pilot instruction reads or writes the stored level.
    let mut f = Fixture::new();
    let mut s = f.state();
    s.brs_balance = 1_000 * BRL;
    s.buffer_earmark = 300 * BRL;
    f.write_state(&s);
    let sol = solvency(&f.config(), &f.state());
    assert_eq!(sol.surplus, 1_000 * BRL);
    assert_eq!(sol.earmark_eff, 0);
    assert_eq!(sol.free_capital, sol.surplus);

    for (name, ix, signer) in f.pilot_instructions() {
        f.send(ix, &signer)
            .unwrap_or_else(|e| panic!("{name}: {:?}", e.err));
        assert_eq!(f.state().buffer_earmark, 300 * BRL, "{name} touched it");
    }

    // With the flag injected set, the same state reserves the stored level.
    let mut c = f.config();
    c.feature_flags = INSTANT_EXIT;
    let sol = solvency(&c, &f.state());
    assert_eq!(sol.earmark_eff, 300 * BRL);
    assert_eq!(sol.free_capital, 700 * BRL);
}
