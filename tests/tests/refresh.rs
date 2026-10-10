//! `refresh` (spec §5.8; plan Task 10): freeze detection,
//! `StateRefreshed` and the earmark ratchet (carried from 2a). Mode and the
//! NAV-move guard are in `under_coverage.rs`.

use mutav::{
    constants::*,
    errors::MutavError,
    events::{ModeChanged, ReserveFrozenDetected, StateRefreshed},
    RegisterGuaranteeArgs,
};
use mutav_tests::helpers::*;

const T0: i64 = 1_760_000_000;

/// A 30,000 reserve (one depositor) with a 20,000 guarantee.
fn reserve() -> (Fixture, RegisterGuaranteeArgs) {
    let mut f = Fixture::new();
    set_time(&mut f.svm, T0);
    let a = f.investor(30_000 * BRL);
    let list = f.allowlist(&[a.pubkey()]);
    f.deposit(&a, &list, 30_000 * BRL);
    let g = guarantee_args(unique_hash(), 20_000 * BRL, 0);
    f.register(g.clone()).unwrap();
    (f, g)
}

fn paid_claim(f: &mut Fixture, g: &RegisterGuaranteeArgs, amount: u64) -> Claim {
    let c = Claim::on(g, amount);
    f.file_claim(c).unwrap();
    f.pay_claim(c).unwrap();
    c
}

// ---------------------------------------------------------------------------
// Payouts (ADR 0019: no payout SLA in the program)
// ---------------------------------------------------------------------------

#[test]
fn refresh_leaves_a_long_pending_payout_untouched() {
    let (mut f, g) = reserve();
    let c = paid_claim(&mut f, &g, 1_000 * BRL);
    let before = f.raw(&claim_pda(&guarantee_pda(&f.pdas.config, &g.id), &c.notice));
    set_time(&mut f.svm, T0 + 365 * 86_400);
    f.refresh().unwrap();
    let after = f.raw(&claim_pda(&guarantee_pda(&f.pdas.config, &g.id), &c.notice));
    assert_eq!(before, after, "refresh writes no payout");
    assert_eq!(f.payout(&c).status, CLAIM_PAID);
    // Settlement is still recorded, however late.
    f.settle_payout(c, unique_hash()).unwrap();
    assert_eq!(f.payout(&c).status, CLAIM_SETTLED);
}

// ---------------------------------------------------------------------------
// Freeze detection
// ---------------------------------------------------------------------------

#[test]
fn a_frozen_reserve_is_detected_and_excluded() {
    let (mut f, _) = reserve();
    f.refresh().unwrap();
    let reserve = f.pdas.reserve;
    f.set_frozen(&reserve, true);
    let meta = f.refresh().unwrap();
    let ev = events::<ReserveFrozenDetected>(&meta);
    assert_eq!(ev.len(), 1);
    assert_eq!(
        (ev[0].config, ev[0].token_account),
        (f.pdas.config, reserve)
    );
    // The frozen balance does not count: fail closed into under-coverage.
    let s = f.state();
    assert_eq!(s.brs_balance, 30_000 * BRL, "tracked balance unchanged");
    assert_eq!(s.mode, MODE_UNDER_COVERED);
    let mc = events::<ModeChanged>(&meta);
    assert_eq!(
        (mc[0].to, mc[0].deficit),
        (MODE_UNDER_COVERED, 20_000 * BRL)
    );
    assert_eq!(events::<StateRefreshed>(&meta)[0].stable_assets, 0);
    assert_mutav_err(
        f.register(guarantee_args(unique_hash(), 1_000 * BRL, 0)),
        MutavError::UnderCovered,
    );

    // After the thaw, the next refresh counts it again.
    f.set_frozen(&reserve, false);
    let meta = f.refresh().unwrap();
    assert!(events::<ReserveFrozenDetected>(&meta).is_empty());
    assert_eq!(
        events::<StateRefreshed>(&meta)[0].stable_assets,
        30_000 * BRL
    );
    assert_eq!(f.state().mode, MODE_NORMAL);
}

#[test]
fn a_freeze_and_the_thaw_both_trip_the_nav_move_guard() {
    // Spec §7: a frozen `reserve` counts as 0, so NAV collapses with shares
    // outstanding. The published NAV is floored at 1, so the freeze and the
    // thaw are both measured moves; a freeze cannot reset the baseline.
    let (mut f, _) = reserve();
    f.refresh().unwrap();
    assert_eq!(f.state().nav_per_share, NAV_SCALE);
    let reserve = f.pdas.reserve;

    f.set_frozen(&reserve, true);
    f.refresh().unwrap();
    let s = f.state();
    assert!(s.fulfil_halted, "the freeze trips the guard");
    assert_eq!(s.nav_per_share, 1);

    // Clearing while still frozen re-opens nothing for long: the baseline is
    // the tracked NAV, and the next refresh, still frozen, trips again.
    f.clear_fulfil_halt().expect("admin clears");
    assert_eq!(f.state().nav_per_share, NAV_SCALE);
    f.refresh().unwrap();
    assert!(f.state().fulfil_halted, "still frozen: halted again");

    // With the collapsed baseline kept, the thaw is a measured move too.
    let mut s = f.state();
    s.fulfil_halted = false;
    f.write_state(&s);
    f.set_frozen(&reserve, false);
    f.refresh().unwrap();
    let s = f.state();
    assert!(s.fulfil_halted, "the thaw trips the guard");
    assert_eq!(s.nav_per_share, NAV_SCALE);
}

#[test]
fn frozen_escrow_accounts_are_reported_but_not_in_stable_assets() {
    let (mut f, _) = reserve();
    let (claims, deposits) = (f.pdas.claims, f.pdas.pending_deposits);
    f.set_frozen(&claims, true);
    f.set_frozen(&deposits, true);
    let meta = f.refresh().unwrap();
    let ev: Vec<_> = events::<ReserveFrozenDetected>(&meta)
        .iter()
        .map(|e| e.token_account)
        .collect();
    assert_eq!(ev, vec![deposits, claims]);
    assert_eq!(
        events::<StateRefreshed>(&meta)[0].stable_assets,
        30_000 * BRL
    );
    assert_eq!(f.state().mode, MODE_NORMAL);
}

// ---------------------------------------------------------------------------
// StateRefreshed
// ---------------------------------------------------------------------------

#[test]
fn state_refreshed_carries_the_surplus() {
    let (mut f, _) = reserve();
    let meta = f.refresh().unwrap();
    let ev = &events::<StateRefreshed>(&meta)[0];
    assert_eq!(
        (ev.stable_assets, ev.coverage_required, ev.surplus),
        (30_000 * BRL, 20_000 * BRL, 10_000 * BRL)
    );
}
