//! `refresh` (spec §5.8; plan Task 10): late-payout flags, freeze detection,
//! `StateRefreshed` and the earmark ratchet (carried from 2a). Mode and the
//! NAV-move guard are in `under_coverage.rs`.

use mutav::{
    constants::*,
    errors::MutavError,
    events::{ModeChanged, PayoutLate, PayoutSettled, ReserveFrozenDetected, StateRefreshed},
    solvency::{Solvency, SolvencyInputs},
    state::{VaultConfig, VaultState},
    RegisterGuaranteeArgs,
};
use mutav_tests::helpers::*;

const T0: i64 = 1_760_000_000;
const SLA: i64 = 10 * 86_400;

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
// Late payouts
// ---------------------------------------------------------------------------

#[test]
fn a_pending_payout_past_the_sla_is_flagged_once_and_counted() {
    let (mut f, g) = reserve();
    let late = paid_claim(&mut f, &g, 1_000 * BRL);
    set_time(&mut f.svm, T0 + 1);
    let on_time = paid_claim(&mut f, &g, 500 * BRL);

    // At exactly paid_at + SLA nothing is late yet.
    set_time(&mut f.svm, T0 + SLA);
    let meta = f.refresh_with(&[late, on_time]).unwrap();
    assert!(events::<PayoutLate>(&meta).is_empty());
    assert_eq!(f.payout(&late).late, 0);

    set_time(&mut f.svm, T0 + SLA + 1);
    let meta = f.refresh_with(&[late, on_time]).unwrap();
    assert_eq!(f.payout(&late).late, 1);
    assert_eq!(f.payout(&on_time).late, 0);
    assert_eq!(f.state().late_payouts, 1);
    let ev = events::<PayoutLate>(&meta);
    assert_eq!(ev.len(), 1);
    assert_eq!(
        (
            ev[0].config,
            ev[0].guarantee_id,
            ev[0].notice_ref_hash,
            ev[0].paid_at
        ),
        (f.pdas.config, g.id, late.notice, T0)
    );
    assert_eq!(ev[0].ts, T0 + SLA + 1);

    // Flagged once: a later refresh does not count it again.
    set_time(&mut f.svm, T0 + SLA + 2);
    let meta = f.refresh_with(&[late, on_time]).unwrap();
    assert_eq!(events::<PayoutLate>(&meta).len(), 1, "only the second one");
    assert_eq!(f.state().late_payouts, 2);
    let meta = f.refresh_with(&[late, on_time]).unwrap();
    assert!(events::<PayoutLate>(&meta).is_empty());
    assert_eq!(f.state().late_payouts, 2);

    // Settling a flagged payout keeps it late.
    let meta = f.settle_payout(late, unique_hash()).unwrap();
    assert!(events::<PayoutSettled>(&meta)[0].late);
    assert_eq!(f.payout(&late).late, 1);
}

#[test]
fn a_settled_payout_is_never_flagged() {
    let (mut f, g) = reserve();
    let c = paid_claim(&mut f, &g, 1_000 * BRL);
    f.settle_payout(c, unique_hash()).unwrap();
    set_time(&mut f.svm, T0 + 3 * SLA);
    let meta = f.refresh_with(&[c]).unwrap();
    assert!(events::<PayoutLate>(&meta).is_empty());
    assert_eq!((f.payout(&c).late, f.state().late_payouts), (0, 0));
}

#[test]
fn payout_pairs_must_match() {
    let (mut f, g) = reserve();
    let c = paid_claim(&mut f, &g, 1_000 * BRL);
    let g2 = guarantee_args(unique_hash(), 5_000 * BRL, 0);
    f.register(g2.clone()).unwrap();
    set_time(&mut f.svm, T0 + SLA + 1);
    // A payout paired with another guarantee.
    let config = f.pdas.config;
    let wrong = (
        guarantee_pda(&config, &g2.id),
        payout_pda(&guarantee_pda(&config, &g.id), &c.notice),
    );
    let ix = f.refresh_ix(&[wrong]);
    let payer = f.payer.insecure_clone();
    assert_mutav_err(f.send(ix, &payer), MutavError::InvalidParameter);
    // A non-payout account in the payout slot.
    let g1 = guarantee_pda(&config, &g.id);
    let ix = f.refresh_ix(&[(g1, g1)]);
    assert_mutav_err(f.send(ix, &payer), MutavError::InvalidParameter);
    assert_eq!(f.payout(&c).late, 0);
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
    assert_eq!(s.stable_assets, 0);
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
    let s = f.state();
    assert_eq!((s.stable_assets, s.mode), (30_000 * BRL, MODE_NORMAL));
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
    let s = f.state();
    assert_eq!((s.stable_assets, s.mode), (30_000 * BRL, MODE_NORMAL));
}

// ---------------------------------------------------------------------------
// StateRefreshed and the earmark ratchet (carried from 2a)
// ---------------------------------------------------------------------------

#[test]
fn state_refreshed_carries_surplus_and_the_earmark_and_the_ratchet_lowers_it() {
    let (mut f, g) = reserve();
    let mut c = f.config();
    c.feature_flags = INSTANT_EXIT;
    f.write_config(&c);
    let mut s = f.state();
    s.buffer_earmark = 8_000 * BRL;
    f.write_state(&s);

    // surplus 10,000 ≥ 8,000: the stored level stands.
    let meta = f.refresh().unwrap();
    let ev = &events::<StateRefreshed>(&meta)[0];
    assert_eq!((ev.surplus, ev.buffer_earmark), (10_000 * BRL, 8_000 * BRL));
    assert_eq!(ev.free_capital, 2_000 * BRL);
    assert_eq!(f.state().buffer_earmark, 8_000 * BRL);

    // The surplus falls (a higher coverage ratio: 30,000 − 23,000): the
    // ratchet lowers the stored level to it.
    let mut c = f.config();
    c.coverage_ratio_bps = 11_500;
    f.write_config(&c);
    f.refresh().unwrap();
    assert_eq!(f.state().buffer_earmark, 7_000 * BRL, "surplus term");

    // Liquidity falls too: a filed claim and BRS that left. With BRS only
    // the liquidity term (brs − provisions) never binds below the surplus
    // term (coverage ≥ provisions); the ratchet stores the minimum.
    let mut c = f.config();
    c.coverage_ratio_bps = 10_000;
    f.write_config(&c);
    f.file_claim(Claim::on(&g, 19_000 * BRL)).unwrap();
    let mut s = f.state();
    s.brs_balance = 24_000 * BRL; // tokens stay ≥ tracked (invariant 4)
    f.write_state(&s);
    let sol = solvency(&f.config(), &f.state());
    assert_eq!(sol.earmark_eff, 4_000 * BRL);
    f.refresh().unwrap();
    assert_eq!(f.state().buffer_earmark, 4_000 * BRL);

    // Flag cleared: the next refresh stores 0.
    let mut c = f.config();
    c.feature_flags = 0;
    f.write_config(&c);
    let meta = f.refresh().unwrap();
    assert_eq!(f.state().buffer_earmark, 0);
    assert_eq!(events::<StateRefreshed>(&meta)[0].buffer_earmark, 0);
}
