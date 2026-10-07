//! Under-coverage mode and the NAV-move guard (spec §6, §7; plan Task 8, BRS
//! only). `refresh` records `mode` and runs the guard; the gated instructions
//! also check under-coverage inline.
//!
//! Built later (plan, "Built later"): TESOURO pricing (accrual cap,
//! staleness, deviation) and the ratchet-scope test that needs a stale
//! price; `allocate` (Task 9). With BRS only, a coverage shortfall comes from
//! a higher coverage ratio (or, in Task 10, an issuer freeze).

use mutav::{
    constants::*,
    errors::MutavError,
    events::{FulfilHaltCleared, ModeChanged, StateRefreshed},
    solvency::{nav_per_share, Solvency, SolvencyInputs},
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

/// A reserve of 30,000 (A's deposit) backing a 30,000 guarantee, a second
/// allowlisted investor B with 40,000 BRS, and a pending redemption by A.
struct Book {
    f: Fixture,
    list: Allowlist,
    a: Investor,
    b: Investor,
    g: mutav::RegisterGuaranteeArgs,
    redeem: u64,
}

fn book() -> Book {
    let mut f = Fixture::new();
    set_time(&mut f.svm, 1_760_000_000);
    let a = f.investor(30_000 * BRL);
    let b = f.investor(40_000 * BRL);
    let list = f.allowlist(&[a.pubkey(), b.pubkey()]);
    f.deposit(&a, &list, 30_000 * BRL);
    let g = guarantee_args(unique_hash(), 20_000 * BRL, 0);
    f.register(g.clone()).unwrap();
    let (r, redeem) = f.request_redeem(&a, &list, 2_000 * BRL);
    r.unwrap();
    Book {
        f,
        list,
        a,
        b,
        g,
        redeem,
    }
}

fn set_coverage_ratio(f: &mut Fixture, bps: u16) {
    let mut args = set_config_args(&f.config());
    args.coverage_ratio_bps = bps;
    f.set_config(args).unwrap();
}

#[test]
fn a_shortfall_switches_mode_and_freezes_the_gated_instructions() {
    let Book {
        mut f,
        list,
        b,
        g,
        redeem,
        ..
    } = book();
    let c = Claim::on(&g, 3_000 * BRL);
    f.file_claim(c).unwrap();
    // c = 1.6: coverage 32,000 > 30,000.
    set_coverage_ratio(&mut f, 16_000);
    let meta = f.refresh().expect("refresh");
    let s = f.state();
    assert_eq!(s.mode, MODE_UNDER_COVERED);
    let ev = events::<ModeChanged>(&meta);
    assert_eq!(ev.len(), 1);
    assert_eq!(
        (ev[0].from, ev[0].to, ev[0].deficit),
        (MODE_NORMAL, MODE_UNDER_COVERED, 2_000 * BRL)
    );

    // Frozen: new guarantees and redemption fills.
    assert_mutav_err(
        f.register(guarantee_args(unique_hash(), 1_000 * BRL, 0)),
        MutavError::UnderCovered,
    );
    assert_mutav_err(
        f.fulfil_redeems(1, u64::MAX, &[redeem]),
        MutavError::UnderCovered,
    );
    // Never frozen: claim payments, fees, deposits (recapitalization), the
    // queues' own requests.
    f.pay_claim(c).expect("pay_claim is never blocked");
    f.contribute(500 * BRL).0.expect("contribute_fees");
    let (r, d) = f.request_deposit(&b, &list, 1_000 * BRL);
    r.expect("request_deposit");
    f.fulfil_deposits(1, &[d]).expect("fulfil_deposits");
    // A second refresh in the same mode emits no `ModeChanged`.
    let meta = f.refresh().unwrap();
    if f.state().mode == MODE_UNDER_COVERED {
        assert!(events::<ModeChanged>(&meta).is_empty());
    }
}

/// c < 1 (ADR 0016): a claim payment of `a` lowers `stable_assets` by `a`
/// but `coverage_required` only by `c × a`, so it can tip the reserve into
/// under-coverage. The payment is never refused; the next `refresh` records
/// the mode.
#[test]
fn below_one_a_claim_payment_tips_into_under_coverage_and_is_not_refused() {
    let mut f = Fixture::new();
    set_coverage_ratio(&mut f, MIN_COVERAGE_RATIO_BPS);
    f.fund_reserve(10_000 * BRL);
    let g = guarantee_args(unique_hash(), 30_000 * BRL, 0);
    f.register(g.clone()).unwrap();
    for _ in 0..2 {
        f.register(guarantee_args(unique_hash(), 30_000 * BRL, 0))
            .unwrap();
    }
    // R$90k of cover at c = 0.10: coverage R$9k, free capital R$1k.
    let sol = solvency(&f.config(), &f.state());
    assert_eq!((sol.coverage_required, sol.free_capital), (9_000 * BRL, 1_000 * BRL));

    let c = Claim::on(&g, 5_000 * BRL);
    f.file_claim(c).unwrap();
    let meta = f.pay_claim(c).expect("pay_claim is never refused for solvency");
    assert!(events::<ModeChanged>(&meta).is_empty(), "pay_claim does not switch mode");
    // stable 5k < coverage max(0.10 × 85k, 0) = 8.5k.
    let s = f.state();
    assert_eq!(s.coverage_required, 8_500 * BRL);
    assert_eq!(s.mode, MODE_NORMAL, "not refreshed yet");
    assert!(solvency(&f.config(), &s).under_covered());

    let meta = f.refresh().unwrap();
    assert_eq!(f.state().mode, MODE_UNDER_COVERED);
    let ev = events::<ModeChanged>(&meta);
    assert_eq!(
        (ev[0].from, ev[0].to, ev[0].deficit),
        (MODE_NORMAL, MODE_UNDER_COVERED, 3_500 * BRL)
    );

    // Under-covered: further claim payments still go through.
    let c2 = Claim::on(&g, 1_000 * BRL);
    f.file_claim(c2).unwrap();
    f.pay_claim(c2).expect("pay_claim is never blocked while under-covered");
}

#[test]
fn recovery_returns_mode_to_normal() {
    let Book {
        mut f,
        list,
        b,
        redeem,
        ..
    } = book();
    set_coverage_ratio(&mut f, 20_000); // coverage 40,000 > 30,000
    f.refresh().unwrap();
    assert_eq!(f.state().mode, MODE_UNDER_COVERED);
    // MUTAV-style recapitalization through the deposit queue: 15,000 more.
    let (r, d) = f.request_deposit(&b, &list, 15_000 * BRL);
    r.unwrap();
    f.fulfil_deposits(1, &[d]).unwrap();
    // Still stored as under-covered until `refresh` records the recovery.
    assert_mutav_err(
        f.fulfil_redeems(1, u64::MAX, &[redeem]),
        MutavError::UnderCovered,
    );
    let meta = f.refresh().unwrap();
    assert_eq!(f.state().mode, MODE_NORMAL);
    let ev = events::<ModeChanged>(&meta);
    assert_eq!(
        (ev[0].from, ev[0].to, ev[0].deficit),
        (MODE_UNDER_COVERED, MODE_NORMAL, 0)
    );
    f.fulfil_redeems(1, u64::MAX, &[redeem])
        .expect("open again");
    f.register(guarantee_args(unique_hash(), 1_000 * BRL, 0))
        .expect("open again");
}

#[test]
fn the_gates_check_under_coverage_inline_before_any_refresh() {
    let Book { mut f, redeem, .. } = book();
    set_coverage_ratio(&mut f, 16_000);
    assert_eq!(f.state().mode, MODE_NORMAL, "not refreshed");
    assert_mutav_err(
        f.register(guarantee_args(unique_hash(), 1_000 * BRL, 0)),
        MutavError::UnderCovered,
    );
    assert_mutav_err(
        f.fulfil_redeems(1, u64::MAX, &[redeem]),
        MutavError::UnderCovered,
    );
}

#[test]
fn in_under_coverage_the_earmark_is_zero_and_refresh_stores_zero() {
    let Book { mut f, .. } = book();
    let mut c = f.config();
    c.feature_flags = INSTANT_EXIT;
    f.write_config(&c);
    let mut s = f.state();
    s.buffer_earmark = 4_000 * BRL;
    f.write_state(&s);
    assert_eq!(solvency(&f.config(), &f.state()).earmark_eff, 4_000 * BRL);
    let mut c = f.config();
    c.coverage_ratio_bps = 16_000;
    f.write_config(&c);
    let sol = solvency(&f.config(), &f.state());
    assert!(sol.under_covered());
    assert_eq!((sol.surplus, sol.earmark_eff), (0, 0));
    let meta = f.refresh().unwrap();
    assert_eq!(f.state().buffer_earmark, 0, "ratchet stores 0");
    assert_eq!(events::<StateRefreshed>(&meta)[0].buffer_earmark, 0);
}

#[test]
fn refresh_publishes_the_math_modules_values() {
    let Book { mut f, g, .. } = book();
    f.file_claim(Claim::on(&g, 1_500 * BRL)).unwrap();
    f.contribute(1_000 * BRL).0.unwrap();
    set_time(&mut f.svm, 1_760_000_500);
    let meta = f.refresh().expect("any signer");
    let (c, s) = (f.config(), f.state());
    let sol = solvency(&c, &s);
    let nav = nav_per_share(sol.net_assets, s.shares_outstanding).unwrap();
    assert_eq!(s.stable_assets, sol.stable_assets);
    assert_eq!(s.coverage_required, sol.coverage_required);
    assert_eq!(s.nav_per_share, nav);
    assert_eq!(s.last_refresh_ts, 1_760_000_500);
    assert_eq!(s.last_refresh_slot, clock(&f.svm).slot);
    let ev = &events::<StateRefreshed>(&meta)[0];
    assert_eq!(
        (
            ev.stable_assets,
            ev.coverage_required,
            ev.surplus,
            ev.free_capital
        ),
        (
            sol.stable_assets,
            sol.coverage_required,
            sol.surplus,
            sol.free_capital
        )
    );
    assert_eq!(
        (ev.buffer_earmark, ev.provisions, ev.nav_per_share, ev.mode),
        (0, 1_500 * BRL, nav, MODE_NORMAL)
    );
    assert_eq!((ev.tesouro_price, ev.price_stale), (0, false));
    assert_eq!((ev.config, ev.ts), (f.pdas.config, 1_760_000_500));
    assert!(events::<ModeChanged>(&meta).is_empty());
}

#[test]
fn refresh_fails_closed_on_a_tesouro_position() {
    // TODO(plan: TESOURO pricing built later, Tasks 8–9) — no price source is
    // read yet, so `refresh` refuses rather than value TESOURO at zero or at
    // a stale price.
    let Book { mut f, .. } = book();
    let mut s = f.state();
    s.tesouro_units = 1;
    f.write_state(&s);
    assert_mutav_err(f.refresh(), MutavError::StalePrice);
}

// ---------------------------------------------------------------------------
// NAV-move guard (spec §7)
// ---------------------------------------------------------------------------

/// The `book()` reserve (30,000 at NAV 1.0), refreshed once (the guard's
/// baseline), with a 5,000 guarantee to file claims on and a pending deposit
/// and redemption.
fn guarded() -> (Fixture, mutav::RegisterGuaranteeArgs, u64, u64) {
    let Book {
        mut f,
        list,
        b,
        redeem,
        ..
    } = book();
    let g = guarantee_args(unique_hash(), 5_000 * BRL, 0);
    f.register(g.clone()).unwrap();
    let (r, d) = f.request_deposit(&b, &list, 1_000 * BRL);
    r.unwrap();
    // Baseline: the first refresh has no earlier NAV to compare with.
    f.refresh().unwrap();
    assert!(!f.state().fulfil_halted);
    assert_eq!(f.state().nav_per_share, NAV_SCALE);
    (f, g, d, redeem)
}

#[test]
fn a_nav_move_at_the_bound_does_not_halt() {
    let (mut f, g, d, redeem) = guarded();
    // A 300 provision on 30,000 is exactly the 100 bps bound.
    f.file_claim(Claim::on(&g, 300 * BRL)).unwrap();
    f.refresh().unwrap();
    assert!(!f.state().fulfil_halted);
    f.fulfil_deposits(1, &[d]).expect("not halted");
    f.fulfil_redeems(1, u64::MAX, &[redeem])
        .expect("not halted");
}

#[test]
fn a_nav_move_beyond_the_bound_halts_fulfilment() {
    let (mut f, g, d, redeem) = guarded();
    f.file_claim(Claim::on(&g, 300 * BRL + 1)).unwrap();
    f.refresh().unwrap();
    assert!(f.state().fulfil_halted);
    assert_mutav_err(f.fulfil_deposits(1, &[d]), MutavError::FulfilHalted);
    assert_mutav_err(
        f.fulfil_redeems(1, u64::MAX, &[redeem]),
        MutavError::FulfilHalted,
    );
    // Only the admin's `clear_fulfil_halt` clears it (ADR 0015): later
    // refreshes and `set_config` leave it set.
    f.refresh().unwrap();
    let args = set_config_args(&f.config());
    f.set_config(args).unwrap();
    assert!(f.state().fulfil_halted);
    assert_mutav_err(f.fulfil_deposits(1, &[d]), MutavError::FulfilHalted);
    // Claims are never halted.
    let c = Claim::on(&g, 100 * BRL);
    f.file_claim(c).unwrap();
    f.pay_claim(c).expect("pay_claim");
}

/// Net assets 0 with shares outstanding: provisions equal stable assets.
fn collapse_net_assets(f: &mut Fixture) {
    let mut s = f.state();
    s.provisions = s.brs_balance;
    f.write_state(&s);
}

#[test]
fn a_collapse_to_zero_nav_with_shares_outstanding_halts() {
    let (mut f, _, d, _) = guarded();
    assert!(f.state().shares_outstanding > 0);
    collapse_net_assets(&mut f);
    f.refresh().unwrap();
    let s = f.state();
    assert!(s.fulfil_halted, "a collapse to NAV 0 must trip the guard");
    // With shares outstanding the published NAV is floored at one unit, so 0
    // always means "no shares" (spec §7).
    assert_eq!(s.nav_per_share, 1);
    assert_mutav_err(f.fulfil_deposits(1, &[d]), MutavError::FulfilHalted);
}

#[test]
fn a_recovery_from_zero_nav_with_shares_outstanding_halts() {
    let (mut f, _, _, _) = guarded();
    collapse_net_assets(&mut f);
    f.refresh().unwrap();
    // Un-halt by hand, keeping the collapsed baseline.
    let mut s = f.state();
    s.fulfil_halted = false;
    s.provisions = 0;
    f.write_state(&s);
    f.refresh().unwrap();
    assert!(
        f.state().fulfil_halted,
        "a move up from a NAV-0 baseline must trip the guard"
    );
    assert_eq!(f.state().nav_per_share, NAV_SCALE);
}

#[test]
fn with_no_shares_outstanding_the_guard_does_not_apply() {
    // An empty reserve publishes NAV 0 and never trips; the first refresh
    // with shares has no earlier NAV to compare with.
    let mut f = Fixture::new();
    f.fund_reserve(10_000 * BRL);
    f.refresh().unwrap();
    assert_eq!(f.state().nav_per_share, 0);
    f.inject_shares(5_000 * BRL);
    f.refresh().unwrap();
    let s = f.state();
    assert!(!s.fulfil_halted);
    assert_eq!(s.nav_per_share, 2 * NAV_SCALE);
}

// ---------------------------------------------------------------------------
// clear_fulfil_halt (spec §5.1, §5.8; ADR 0015, proposed)
// ---------------------------------------------------------------------------

/// `guarded()` with a provision beyond the bound filed and refreshed: halted.
fn halted() -> (Fixture, mutav::RegisterGuaranteeArgs, u64, u64) {
    let (mut f, g, d, redeem) = guarded();
    f.file_claim(Claim::on(&g, 300 * BRL + 1)).unwrap();
    f.refresh().unwrap();
    assert!(f.state().fulfil_halted);
    (f, g, d, redeem)
}

#[test]
fn admin_clears_the_halt_and_resets_the_baseline() {
    let (mut f, _, d, redeem) = halted();
    // A further move after the halt: the clear takes the NAV of now as the
    // new baseline, not the one of the last refresh.
    let mut s = f.state();
    s.provisions += 50 * BRL;
    f.write_state(&s);
    let s = f.state();
    let sol = Solvency::compute(&SolvencyInputs {
        brs_balance: s.brs_balance,
        tesouro_units: s.tesouro_units,
        tesouro_price: s.tesouro_price,
        remaining_cover_total: s.remaining_cover_total,
        coverage_ratio_bps: f.config().coverage_ratio_bps,
        provisions: s.provisions,
        buffer_earmark: s.buffer_earmark,
        feature_flags: f.config().feature_flags,
        head_starved: false,
    })
    .unwrap();
    let nav = mutav::pricing::published_nav(sol.net_assets, s.shares_outstanding).unwrap();
    assert_ne!(nav, s.nav_per_share);

    let meta = f.clear_fulfil_halt().expect("admin clears");
    let s = f.state();
    assert!(!s.fulfil_halted);
    assert_eq!(s.nav_per_share, nav, "baseline reset to the current NAV");
    let ev = events::<FulfilHaltCleared>(&meta);
    assert_eq!(ev.len(), 1);
    assert_eq!((ev[0].config, ev[0].nav_per_share), (f.pdas.config, nav));

    // No move since the reset: a refresh keeps fulfilment open.
    f.refresh().unwrap();
    assert!(!f.state().fulfil_halted);
    f.fulfil_deposits(1, &[d]).expect("fills work again");
    f.fulfil_redeems(1, u64::MAX, &[redeem])
        .expect("fills work again");
}

#[test]
fn only_the_admin_clears_the_halt() {
    let (mut f, _, _, _) = halted();
    for k in [
        f.operator.insecure_clone(),
        f.pauser.insecure_clone(),
        solana_keypair::Keypair::new(),
    ] {
        use solana_signer::Signer;
        f.svm.airdrop(&k.pubkey(), 1_000_000_000).unwrap();
        let ix = f.clear_fulfil_halt_ix(&k.pubkey());
        assert_mutav_err(f.send(ix, &k), MutavError::Unauthorized);
    }
    assert!(f.state().fulfil_halted);
}

#[test]
fn clearing_needs_a_halt() {
    let (mut f, _, _, _) = guarded();
    assert_mutav_err(f.clear_fulfil_halt(), MutavError::InvalidParameter);
}

#[test]
fn a_large_fee_batch_above_the_bound_halts_fulfilment() {
    // TODO(adr 0013: inflow-adjusted NAV guard) — the spec measures the move
    // gross, so a guarantee-fee batch worth more than `max_nav_move_bps` of
    // NAV (here 400 net on 30,000: 133 bps) halts fulfilment, as specced.
    // ADR 0013 proposes measuring the move net of inflows; when it lands, this
    // test changes.
    let (mut f, _, d, _) = guarded();
    f.contribute(500 * BRL).0.unwrap();
    f.refresh().unwrap();
    assert!(f.state().fulfil_halted);
    assert_mutav_err(f.fulfil_deposits(1, &[d]), MutavError::FulfilHalted);
}
