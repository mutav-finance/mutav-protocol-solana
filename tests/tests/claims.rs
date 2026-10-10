//! `file_claim`, `pay_claim` and `settle_payout` (spec §3.6, §3.7, §4, §5.4;
//! ADR 0003; plan Task 5). Claim notices are deferred (plan, "Built later").

use mutav::{
    constants::*,
    errors::MutavError,
    events::{ClaimFiled, ClaimPaid, PayoutSettled},
    solvency::{Solvency, SolvencyInputs},
    state::{VaultConfig, VaultState},
    RegisterGuaranteeArgs,
};
use mutav_tests::helpers::*;
use proptest::prelude::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

/// A reserve holding exactly `capital` with one guarantee of
/// `default_cover` + `exit_cover` registered.
fn book(capital: u64, default_cover: u64, exit_cover: u64) -> (Fixture, RegisterGuaranteeArgs) {
    let mut f = Fixture::new();
    f.fund_reserve(capital);
    let args = guarantee_args(unique_hash(), default_cover, exit_cover);
    f.register(args.clone()).expect("register");
    (f, args)
}

fn solvency(c: &VaultConfig, s: &VaultState) -> Solvency {
    Solvency::compute(&SolvencyInputs {
        brs_balance: s.brs_balance,
        remaining_cover_total: s.remaining_cover_total,
        coverage_ratio_bps: c.coverage_ratio_bps,
        provisions: s.provisions,
    })
    .unwrap()
}

fn stranger_signers(f: &Fixture) -> Vec<Keypair> {
    vec![
        f.admin.insecure_clone(),
        f.pauser.insecure_clone(),
        Keypair::new(),
    ]
}

// ---------------------------------------------------------------------------
// file_claim
// ---------------------------------------------------------------------------

#[test]
fn file_claim_books_the_provision() {
    let (mut f, g) = book(30_000 * BRL, 20_000 * BRL, 10_000 * BRL);
    set_time(&mut f.svm, 1_760_000_000);
    let before = f.state();
    let c = Claim::on(&g, 6_000 * BRL).leg(LEG_EXIT);
    let meta = f.file_claim(c).expect("file");

    let x = f.claim_filing(&c);
    assert_eq!(
        (x.version, x.leg, x.status),
        (PROGRAM_LAYOUT_VERSION, LEG_EXIT, CLAIM_FILED)
    );
    assert_ne!(x.bump, 0);
    assert_eq!(x.guarantee, guarantee_pda(&f.pdas.config, &g.id));
    assert_eq!(
        (x.notice_ref_hash, x.provision, x.filed_at),
        (c.notice, 6_000 * BRL, 1_760_000_000)
    );
    assert_eq!(x._reserved, [0; 192]);

    let gg = f.guarantee(&g.id);
    assert_eq!(
        (gg.provision_exit, gg.provision_default, gg.open_claims),
        (6_000 * BRL, 0, 1)
    );
    let s = f.state();
    assert_eq!(s.provisions, 6_000 * BRL);
    // Not counted twice (invariant 6): stable assets and cover unchanged.
    assert_eq!(s.brs_balance, before.brs_balance);
    assert_eq!(s.remaining_cover_total, before.remaining_cover_total);
    assert_eq!(s.coverage_required, before.coverage_required);

    let ev = events::<ClaimFiled>(&meta);
    assert_eq!(ev.len(), 1);
    let e = &ev[0];
    assert_eq!(
        (e.config, e.ts, e.guarantee_id),
        (f.pdas.config, 1_760_000_000, g.id)
    );
    assert_eq!(
        (e.leg, e.amount, e.notice_ref_hash),
        (LEG_EXIT, 6_000 * BRL, c.notice)
    );
}

/// Demo step: "a filed claim lowers NAV". 100,000 shares at NAV 1.00; a
/// R$2,000 claim filed today lowers NAV to 0.98 immediately, before any
/// payment, while `stable_assets` is unchanged.
#[test]
fn demo_filed_claim_lowers_nav() {
    let (mut f, g) = book(100_000 * BRL, 20_000 * BRL, 0);
    f.inject_shares(100_000 * BRL);
    assert_eq!(f.nav(), NAV_SCALE);
    let stable = solvency(&f.config(), &f.state()).stable_assets;

    f.file_claim(Claim::on(&g, 2_000 * BRL)).expect("file");
    assert_eq!(f.nav(), 980_000_000); // 0.98
    assert_eq!(solvency(&f.config(), &f.state()).stable_assets, stable);
}

#[test]
fn file_claim_is_bounded_by_the_unprovisioned_cover_on_the_leg() {
    let (mut f, g) = book(30_000 * BRL, 10_000 * BRL, 5_000 * BRL);
    // leg_cover − leg_paid − leg_provision, one base unit above, then exact.
    assert_mutav_err(
        f.file_claim(Claim::on(&g, 10_000 * BRL + 1)),
        MutavError::ExceedsRemainingCover,
    );
    f.file_claim(Claim::on(&g, 4_000 * BRL)).unwrap();
    assert_mutav_err(
        f.file_claim(Claim::on(&g, 6_000 * BRL + 1)),
        MutavError::ExceedsRemainingCover,
    );
    f.file_claim(Claim::on(&g, 6_000 * BRL))
        .expect("rest of the default leg");
    assert_mutav_err(
        f.file_claim(Claim::on(&g, 1)),
        MutavError::ExceedsRemainingCover,
    );
    // The exit leg is separate.
    f.file_claim(Claim::on(&g, 5_000 * BRL).leg(LEG_EXIT))
        .unwrap();
    let gg = f.guarantee(&g.id);
    assert_eq!(
        (gg.provision_default, gg.provision_exit, gg.open_claims),
        (10_000 * BRL, 5_000 * BRL, 3)
    );
    assert_eq!(f.state().provisions, 15_000 * BRL);
}

#[test]
fn file_claim_rejects_bad_parameters() {
    let (mut f, g) = book(10_000 * BRL, 10_000 * BRL, 0);
    assert_mutav_err(f.file_claim(Claim::on(&g, 0)), MutavError::InvalidParameter);
    assert_mutav_err(
        f.file_claim(Claim::on(&g, BRL).leg(2)),
        MutavError::InvalidParameter,
    );
    assert_mutav_err(
        f.file_claim(Claim::on(&g, BRL).leg(u8::MAX)),
        MutavError::InvalidParameter,
    );
}

#[test]
fn file_claim_needs_an_active_guarantee() {
    let (mut f, g) = book(10_000 * BRL, 10_000 * BRL, 0);
    f.close_guarantee(g.id).unwrap();
    assert_mutav_err(
        f.file_claim(Claim::on(&g, BRL)),
        MutavError::GuaranteeNotActive,
    );
}

#[test]
fn the_same_notice_files_once() {
    let (mut f, g) = book(10_000 * BRL, 10_000 * BRL, 0);
    let c = Claim::on(&g, BRL);
    f.file_claim(c).unwrap();
    assert_already_in_use(f.file_claim(c.amount(2 * BRL)));
    assert_eq!(f.state().provisions, BRL);
}

#[test]
fn file_claim_rejects_a_non_operator() {
    let (mut f, g) = book(10_000 * BRL, 10_000 * BRL, 0);
    for k in stranger_signers(&f) {
        let ix = f.file_claim_ix(&k.pubkey(), Claim::on(&g, BRL));
        assert_mutav_err(f.send(ix, &k), MutavError::Unauthorized);
    }
}

#[test]
fn file_claim_works_while_paused_and_under_covered() {
    let (mut f, g) = book(10_000 * BRL, 10_000 * BRL, 0);
    let pauser = f.pauser.insecure_clone();
    f.send(f.pause_ix(&pauser.pubkey()), &pauser).unwrap();
    let mut s = f.state();
    s.mode = MODE_UNDER_COVERED;
    s.brs_balance = 0;
    f.write_state(&s);
    f.file_claim(Claim::on(&g, BRL)).expect("never gated");
}

#[test]
fn a_filed_claim_blocks_close_until_paid() {
    let (mut f, g) = book(10_000 * BRL, 10_000 * BRL, 0);
    let c = Claim::on(&g, 3_000 * BRL);
    f.file_claim(c).unwrap();
    assert_mutav_err(f.close_guarantee(g.id), MutavError::OpenClaims);
    f.pay_claim(c).unwrap();
    let meta = f.close_guarantee(g.id).expect("close after payment");
    let ev = events::<mutav::events::GuaranteeClosed>(&meta);
    assert_eq!(ev[0].released_cover, 7_000 * BRL);
    assert_eq!(f.state().remaining_cover_total, 0);
}

// ---------------------------------------------------------------------------
// pay_claim
// ---------------------------------------------------------------------------

#[test]
fn pay_claim_pays_the_payments_account_and_releases_the_provision() {
    let (mut f, g) = book(30_000 * BRL, 20_000 * BRL, 10_000 * BRL);
    let c = Claim::on(&g, 5_000 * BRL);
    f.file_claim(c).unwrap();
    set_time(&mut f.svm, 1_770_000_000);
    let payments = f.config().payments_account;
    let meta = f.pay_claim(c).expect("pay");

    assert_eq!(f.balance(&payments), 5_000 * BRL);
    assert_eq!(f.balance(&f.pdas.reserve), 25_000 * BRL);

    let x = f.claim_filing(&c);
    assert_eq!(x.status, CLAIM_PAID);
    let gg = f.guarantee(&g.id);
    assert_eq!(
        (gg.default_paid, gg.provision_default, gg.open_claims),
        (5_000 * BRL, 0, 0)
    );
    assert_eq!(gg.status, GUARANTEE_ACTIVE);

    let s = f.state();
    assert_eq!(s.brs_balance, 25_000 * BRL);
    assert_eq!(s.provisions, 0);
    assert_eq!(s.remaining_cover_total, 25_000 * BRL);
    assert_eq!(s.coverage_required, 25_000 * BRL);
    assert_eq!(s.claims_paid_total, 5_000 * BRL);
    assert_eq!(s.claim_window_paid(), 5_000 * BRL as u128);
    assert_eq!(s.claim_day_anchor, 1_770_000_000 / 86_400);

    let p = f.payout(&c);
    assert_eq!(
        (p.version, p.status, p.leg),
        (PROGRAM_LAYOUT_VERSION, CLAIM_PAID, LEG_DEFAULT)
    );
    assert_ne!(p.bump, 0);
    assert_eq!(p.guarantee, guarantee_pda(&f.pdas.config, &g.id));
    assert_eq!(
        (p.paid_amount, p.notice_ref_hash, p.payments_account),
        (5_000 * BRL, c.notice, payments)
    );
    assert_eq!(
        (p.paid_at, p.settled_at, p.pix_e2e_hash),
        (1_770_000_000, 0, [0; 32])
    );
    assert_eq!((p.provision, p.approved_amount), (5_000 * BRL, 0));
    assert_eq!(p._reserved, [0; 192]);

    let ev = events::<ClaimPaid>(&meta);
    assert_eq!(ev.len(), 1);
    let e = &ev[0];
    assert_eq!(
        (e.config, e.ts, e.guarantee_id),
        (f.pdas.config, 1_770_000_000, g.id)
    );
    assert_eq!(
        (e.leg, e.amount, e.notice_ref_hash, e.payments_account),
        (LEG_DEFAULT, 5_000 * BRL, c.notice, payments)
    );
}

#[test]
fn payment_may_differ_from_the_filed_provision() {
    // The payment is bounded by the leg's remaining cover, not by the
    // provision; the whole provision is released either way.
    let (mut f, g) = book(30_000 * BRL, 10_000 * BRL, 10_000 * BRL);
    let more = Claim::on(&g, 2_000 * BRL);
    f.file_claim(more).unwrap();
    f.pay_claim(more.amount(9_000 * BRL))
        .expect("more than the provision");
    let less = Claim::on(&g, 4_000 * BRL).leg(LEG_EXIT);
    f.file_claim(less).unwrap();
    f.pay_claim(less.amount(1_000 * BRL))
        .expect("less than the provision");
    let gg = f.guarantee(&g.id);
    assert_eq!((gg.default_paid, gg.exit_paid), (9_000 * BRL, 1_000 * BRL));
    assert_eq!((gg.provision_default, gg.provision_exit), (0, 0));
    assert_eq!(f.state().provisions, 0);
    assert_eq!(f.state().remaining_cover_total, 10_000 * BRL);
}

#[test]
fn pay_claim_is_bounded_by_the_remaining_cover_on_the_leg() {
    let (mut f, g) = book(30_000 * BRL, 8_000 * BRL, 2_000 * BRL);
    let c = Claim::on(&g, 1_000 * BRL);
    f.file_claim(c).unwrap();
    assert_mutav_err(
        f.pay_claim(c.amount(8_000 * BRL + 1)),
        MutavError::ExceedsRemainingCover,
    );
    f.pay_claim(c.amount(8_000 * BRL)).expect("exactly the leg");
    assert_eq!(f.guarantee(&g.id).default_paid, 8_000 * BRL);
    // Nothing left on the default leg to file against.
    assert_mutav_err(
        f.file_claim(Claim::on(&g, 1)),
        MutavError::ExceedsRemainingCover,
    );
}

#[test]
fn pay_claim_cannot_take_another_open_filings_provision() {
    // Two open filings on one leg (6k + 4k = the whole 10k cover). Paying the
    // first above 6k would leave the second's provision above the cover left
    // on the leg, breaking invariant 2. Bound: ADR 0014 (proposed).
    let (mut f, g) = book(30_000 * BRL, 10_000 * BRL, 0);
    let a = Claim::on(&g, 6_000 * BRL);
    let b = Claim::on(&g, 4_000 * BRL);
    f.file_claim(a).unwrap();
    f.file_claim(b).unwrap();
    assert_mutav_err(
        f.pay_claim(a.amount(6_000 * BRL + 1)),
        MutavError::ExceedsRemainingCover,
    );
    f.pay_claim(a).expect("its own provision's worth");
    f.pay_claim(b).expect("the other filing still pays in full");
    let gg = f.guarantee(&g.id);
    assert_eq!(
        (gg.default_paid, gg.provision_default, gg.open_claims),
        (10_000 * BRL, 0, 0)
    );
}

#[test]
fn pay_claim_surfaces_a_broken_leg_invariant_instead_of_masking_it() {
    // ADR 0014: the bound uses checked subtraction. If the leg's other
    // provisions already exceed its remaining cover (invariant 2 broken,
    // injected here), the payment fails with `MathOverflow`, not a clamp.
    let (mut f, g) = book(30_000 * BRL, 10_000 * BRL, 0);
    let a = Claim::on(&g, 6_000 * BRL);
    let b = Claim::on(&g, 4_000 * BRL);
    f.file_claim(a).unwrap();
    f.file_claim(b).unwrap();
    let mut gg = f.guarantee(&g.id);
    gg.default_paid = 7_000 * BRL; // remaining 3k < b's 4k provision
    f.write_guarantee(&gg);
    assert_mutav_err(f.pay_claim(a.amount(1)), MutavError::MathOverflow);
}

#[test]
fn pay_claim_only_to_the_payments_account() {
    let (mut f, g) = book(10_000 * BRL, 10_000 * BRL, 0);
    let c = Claim::on(&g, BRL);
    f.file_claim(c).unwrap();
    let op = f.operator.insecure_clone();
    let stranger = f.token_account(&op.pubkey());
    for dest in [f.config().treasury_account, stranger] {
        let ix = f.pay_claim_ix(&op.pubkey(), c, &dest);
        assert_mutav_err(f.send(ix, &op), MutavError::InvalidPaymentsAccount);
    }
    assert_eq!(f.state().brs_balance, 10_000 * BRL);
    f.pay_claim(c).expect("to payments_account");
}

#[test]
fn pay_claim_per_call_cap_at_the_boundary() {
    // Test caps: R$10k per call.
    let (mut f, g) = book(30_000 * BRL, 30_000 * BRL, 0);
    let c = Claim::on(&g, BRL);
    f.file_claim(c).unwrap();
    assert_mutav_err(
        f.pay_claim(c.amount(10_000 * BRL + 1)),
        MutavError::ClaimCallCapExceeded,
    );
    f.pay_claim(c.amount(10_000 * BRL))
        .expect("exactly the per-call cap");
}

#[test]
fn pay_claim_per_period_cap_over_31_sliding_days() {
    // Test caps: R$20k per 31-day window (ADR 0019): the payments of the
    // last 31 UTC days, this one included.
    const DAY: i64 = 86_400;
    let (mut f, g) = book(60_000 * BRL, 30_000 * BRL, 0);
    let g2 = guarantee_args(unique_hash(), 30_000 * BRL, 0);
    f.register(g2.clone()).unwrap();
    let t0 = 1_700_006_400; // the start of a UTC day
    set_time(&mut f.svm, t0);

    let claims: Vec<Claim> = [
        (&g, 10_000),
        (&g, 9_000),
        (&g2, 2_000),
        (&g2, 1_000),
        (&g2, 9_000),
    ]
    .iter()
    .map(|(g, k)| Claim::on(g, k * BRL))
    .collect();
    for c in &claims {
        f.file_claim(*c).unwrap();
    }
    f.pay_claim(claims[0]).unwrap();
    // Day 15: R$10k more is still inside the window with the first.
    set_time(&mut f.svm, t0 + 15 * DAY);
    f.pay_claim(claims[1]).unwrap();
    // R$19k paid: R$1k + 1 base unit is over, R$1k is exactly the cap.
    assert_mutav_err(
        f.pay_claim(claims[2].amount(1_000 * BRL + 1)),
        MutavError::ClaimPeriodCapExceeded,
    );
    f.pay_claim(claims[2].amount(1_000 * BRL))
        .expect("exactly the period cap");

    // The last second of day 30: the day-0 payment is still in the window.
    set_time(&mut f.svm, t0 + 31 * DAY - 1);
    assert_mutav_err(f.pay_claim(claims[3]), MutavError::ClaimPeriodCapExceeded);
    // Day 31: the day-0 R$10k leaves; the day-15 R$10k stays.
    set_time(&mut f.svm, t0 + 31 * DAY);
    f.pay_claim(claims[3]).expect("day 0 left the window");
    f.pay_claim(claims[4]).expect("R$20k in the last 31 days");
    assert_eq!(f.state().claim_window_paid(), 20_000 * BRL as u128);
    // Never more than the cap in any 31 days: a tumbling window would allow
    // R$40k across its boundary.
}

#[test]
fn pay_claim_is_idempotent_per_notice() {
    let (mut f, g) = book(10_000 * BRL, 10_000 * BRL, 0);
    let c = Claim::on(&g, BRL);
    f.file_claim(c).unwrap();
    f.pay_claim(c).unwrap();
    let before = f.state();
    // The filing records the payment: a second call finds it `Paid`.
    assert_mutav_err(f.pay_claim(c), MutavError::ClaimNotFiled);
    assert_eq!(f.state().brs_balance, before.brs_balance);
    assert_eq!(f.state().claims_paid_total, BRL);
}

#[test]
fn pay_claim_needs_a_filed_claim_on_the_same_leg() {
    let (mut f, g) = book(20_000 * BRL, 10_000 * BRL, 10_000 * BRL);
    // No filing for this notice.
    assert_mutav_err(f.pay_claim(Claim::on(&g, BRL)), MutavError::ClaimNotFiled);

    let c = Claim::on(&g, BRL);
    f.file_claim(c).unwrap();
    assert_mutav_err(f.pay_claim(c.leg(LEG_EXIT)), MutavError::LegMismatch);

    // A filing that is no longer `Filed`.
    let mut x = f.claim_filing(&c);
    x.status = CLAIM_PAID;
    f.write_claim_filing(&c, &x);
    assert_mutav_err(f.pay_claim(c), MutavError::ClaimNotFiled);
}

#[test]
fn pay_claim_rejects_zero() {
    let (mut f, g) = book(10_000 * BRL, 10_000 * BRL, 0);
    let c = Claim::on(&g, BRL);
    f.file_claim(c).unwrap();
    assert_mutav_err(f.pay_claim(c.amount(0)), MutavError::InvalidParameter);
}

#[test]
fn pay_claim_needs_liquid_brs() {
    // Rule 6: a claim is paid from liquid BRS only. Liquid BRS below the
    // amount is injected (the reserve token account still holds it).
    let (mut f, g) = book(10_000 * BRL, 10_000 * BRL, 0);
    let c = Claim::on(&g, 5_000 * BRL);
    f.file_claim(c).unwrap();
    let mut s = f.state();
    s.brs_balance = 5_000 * BRL - 1;
    f.write_state(&s);
    assert_mutav_err(f.pay_claim(c), MutavError::InsufficientLiquidBalance);
    let mut s = f.state();
    s.brs_balance = 5_000 * BRL;
    f.write_state(&s);
    f.pay_claim(c).expect("exactly the liquid balance");
    assert_eq!(f.state().brs_balance, 0);
}

#[test]
fn paying_at_c_one_leaves_free_capital_unchanged() {
    // Invariant 7: stable_assets and remaining_cover_total fall by the same
    // amount.
    let (mut f, g) = book(50_000 * BRL, 30_000 * BRL, 0);
    let c = Claim::on(&g, 7_000 * BRL);
    f.file_claim(c).unwrap();
    let before = solvency(&f.config(), &f.state());
    f.pay_claim(c).unwrap();
    let after = solvency(&f.config(), &f.state());
    assert_eq!(after.free_capital, before.free_capital);
    assert_eq!(after.free_capital, 20_000 * BRL);
    assert_eq!(before.stable_assets - after.stable_assets, 7_000 * BRL);
}

#[test]
fn pay_claim_rejects_a_non_operator() {
    let (mut f, g) = book(10_000 * BRL, 10_000 * BRL, 0);
    let c = Claim::on(&g, BRL);
    f.file_claim(c).unwrap();
    let payments = f.config().payments_account;
    for k in stranger_signers(&f) {
        let ix = f.pay_claim_ix(&k.pubkey(), c, &payments);
        assert_mutav_err(f.send(ix, &k), MutavError::Unauthorized);
    }
}

/// Demo step: "`pay_claim` succeeds while under-covered". Cover injected far
/// above the stable assets leaves the reserve under-covered and paused; the
/// claim is still paid.
#[test]
fn demo_pay_claim_succeeds_while_under_covered() {
    let (mut f, g) = book(30_000 * BRL, 30_000 * BRL, 0);
    let c = Claim::on(&g, 8_000 * BRL);
    f.file_claim(c).unwrap();
    let pauser = f.pauser.insecure_clone();
    f.send(f.pause_ix(&pauser.pubkey()), &pauser).unwrap();
    let mut s = f.state();
    s.mode = MODE_UNDER_COVERED;
    s.remaining_cover_total += 50_000 * BRL; // coverage far above stable assets
    f.write_state(&s);
    assert!(solvency(&f.config(), &f.state()).under_covered());

    let payments = f.config().payments_account;
    f.pay_claim(c).expect("never refused for solvency");
    assert_eq!(f.balance(&payments), 8_000 * BRL);
    assert_eq!(f.state().mode, MODE_UNDER_COVERED);
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 32, failure_persistence: None, ..ProptestConfig::default() })]

    /// `pay_claim` is never refused for solvency or under-coverage (spec §1
    /// principle 4, §5.4 rule 7): fuzz `stable_assets` far below
    /// `coverage_required`, the stored mode, other provisions, the pause
    /// flag, any coverage ratio in `[0.10, 2.0]` (ADR 0016) and issuer
    /// income, partly swept and partly still in the inbox (ADR 0017).
    #[test]
    fn pay_claim_is_never_refused_for_solvency(
        cover in 1u64..=10_000,
        filed_frac in 1u64..=100,
        pay_frac in 1u64..=100,
        extra_cover in 0u64..=1u64 << 50,
        extra_provisions in 0u64..=1u64 << 50,
        under_covered: bool,
        paused: bool,
        drain in 0u64..=100,
        coverage_ratio_bps in MIN_COVERAGE_RATIO_BPS..=20_000,
        income in 0u64..=10_000,
    ) {
        let cover = cover * BRL;
        let (mut f, g) = book(cover, cover, 0);
        let filed = (cover * filed_frac / 100).max(1);
        let amount = (cover * pay_frac / 100).max(1);
        let c = Claim::on(&g, filed);
        f.file_claim(c).unwrap();
        // Issuer income: half swept into the reserve, the rest left in the
        // inbox, where `pay_claim` never reaches.
        let income = income * BRL;
        f.pay_income(income);
        if income / 2 > 0 {
            f.sweep(income / 2).0.unwrap();
        }
        let inbox = f.balance(&f.income_inbox());
        if paused {
            let pauser = f.pauser.insecure_clone();
            f.send(f.pause_ix(&pauser.pubkey()), &pauser).unwrap();
        }
        let mut cfg = f.config();
        // Any c the program accepts, below and above 1.0 (ADR 0016).
        cfg.coverage_ratio_bps = coverage_ratio_bps;
        f.write_config(&cfg);
        let mut s = f.state();
        s.mode = if under_covered { MODE_UNDER_COVERED } else { MODE_NORMAL };
        s.remaining_cover_total += extra_cover;
        s.provisions += extra_provisions;
        // Liquid BRS anywhere between the amount and the whole reserve.
        s.brs_balance = amount + (cover - amount) * drain / 100;
        f.write_state(&s);

        let res = f.pay_claim(c.amount(amount));
        prop_assert!(res.is_ok(), "refused: {:?}", res.err().map(|e| e.err));
        let after = f.state();
        prop_assert_eq!(after.mode, s.mode);
        prop_assert_eq!(after.brs_balance, s.brs_balance - amount);
        prop_assert_eq!(after.provisions, s.provisions - filed);
        prop_assert_eq!(f.balance(&f.income_inbox()), inbox);
    }
}

// ---------------------------------------------------------------------------
// settle_payout
// ---------------------------------------------------------------------------

fn paid(capital: u64, amount: u64) -> (Fixture, Claim) {
    let (mut f, g) = book(capital, capital, 0);
    let c = Claim::on(&g, amount);
    f.file_claim(c).unwrap();
    f.pay_claim(c).unwrap();
    (f, c)
}

/// Demo step: "`settle_payout` records the PIX e2e hash". MUTAV offramps
/// BRS→BRL, pays the agency by PIX and records the end-to-end ID's hash.
#[test]
fn demo_settle_payout_records_pix_e2e_hash() {
    let (mut f, c) = paid(10_000 * BRL, 4_000 * BRL);
    let paid_at = f.payout(&c).paid_at;
    set_time(&mut f.svm, paid_at + 3 * 86_400);
    let pix = unique_hash();
    let meta = f.settle_payout(c, pix).expect("settle");

    let p = f.payout(&c);
    assert_eq!(p.status, CLAIM_SETTLED);
    assert_eq!(p.pix_e2e_hash, pix);
    assert_eq!(p.settled_at, paid_at + 3 * 86_400);
    let ev = events::<PayoutSettled>(&meta);
    assert_eq!(ev.len(), 1);
    let e = &ev[0];
    assert_eq!((e.config, e.ts), (f.pdas.config, paid_at + 3 * 86_400));
    assert_eq!(
        (e.guarantee_id, e.notice_ref_hash, e.pix_e2e_hash),
        (c.id, c.notice, pix)
    );
}

/// ADR 0019: the program sets no settlement deadline. A payout settled a
/// year after payment records the same way as one settled the next day.
#[test]
fn settle_payout_has_no_deadline() {
    for delay in [86_400, 365 * 86_400] {
        let (mut f, c) = paid(10_000 * BRL, BRL);
        let paid_at = f.payout(&c).paid_at;
        set_time(&mut f.svm, paid_at + delay);
        let pix = unique_hash();
        let meta = f.settle_payout(c, pix).unwrap();
        let p = f.payout(&c);
        assert_eq!((p.status, p.settled_at), (CLAIM_SETTLED, paid_at + delay));
        assert_eq!(events::<PayoutSettled>(&meta)[0].pix_e2e_hash, pix);
    }
}

#[test]
fn settle_payout_twice_fails() {
    let (mut f, c) = paid(10_000 * BRL, BRL);
    let first = unique_hash();
    f.settle_payout(c, first).unwrap();
    assert_mutav_err(
        f.settle_payout(c, unique_hash()),
        MutavError::PayoutAlreadySettled,
    );
    assert_eq!(f.payout(&c).pix_e2e_hash, first);
}

#[test]
fn settle_payout_needs_a_hash() {
    let (mut f, c) = paid(10_000 * BRL, BRL);
    assert_mutav_err(f.settle_payout(c, [0; 32]), MutavError::InvalidParameter);
    assert_eq!(f.payout(&c).status, CLAIM_PAID);
}

#[test]
fn settle_payout_of_an_unknown_payout_fails() {
    let (mut f, g) = book(10_000 * BRL, 10_000 * BRL, 0);
    assert_anchor_err(
        f.settle_payout(Claim::on(&g, BRL), unique_hash()),
        anchor_lang::error::ErrorCode::AccountNotInitialized,
    );
}

#[test]
fn settle_payout_rejects_a_non_operator_and_works_while_paused() {
    let (mut f, c) = paid(10_000 * BRL, BRL);
    for k in stranger_signers(&f) {
        let ix = f.settle_payout_ix(&k.pubkey(), c, unique_hash());
        assert_mutav_err(f.send(ix, &k), MutavError::Unauthorized);
    }
    let pauser = f.pauser.insecure_clone();
    f.send(f.pause_ix(&pauser.pubkey()), &pauser).unwrap();
    f.settle_payout(c, unique_hash()).expect("paused");
}

// ---------------------------------------------------------------------------
// Roles, version guard, padding
// ---------------------------------------------------------------------------

#[test]
fn revoked_operator_cannot_file_pay_or_settle() {
    let (mut f, g) = book(20_000 * BRL, 20_000 * BRL, 0);
    let filed = Claim::on(&g, BRL);
    f.file_claim(filed).unwrap();
    let settle = Claim::on(&g, BRL);
    f.file_claim(settle).unwrap();
    f.pay_claim(settle).unwrap();

    let pauser = f.pauser.insecure_clone();
    f.send(f.revoke_operator_ix(&pauser.pubkey()), &pauser)
        .unwrap();
    let op = f.operator.insecure_clone();
    let payments = f.config().payments_account;
    for ix in [
        f.file_claim_ix(&op.pubkey(), Claim::on(&g, BRL)),
        f.pay_claim_ix(&op.pubkey(), filed, &payments),
        f.settle_payout_ix(&op.pubkey(), settle, unique_hash()),
    ] {
        assert_mutav_err(f.send(ix, &op), MutavError::Unauthorized);
    }
}

#[test]
fn unknown_leg_or_status_is_refused() {
    // ClaimFiling: newer version, unknown leg, unknown status.
    for (version, leg, status) in [
        (PROGRAM_LAYOUT_VERSION + 1, LEG_DEFAULT, CLAIM_FILED),
        (PROGRAM_LAYOUT_VERSION, LEG_EXIT + 1, CLAIM_FILED),
        (PROGRAM_LAYOUT_VERSION, LEG_DEFAULT, CLAIM_PAID + 1),
    ] {
        let (mut f, g) = book(10_000 * BRL, 10_000 * BRL, 0);
        let c = Claim::on(&g, BRL);
        f.file_claim(c).unwrap();
        let mut x = f.claim_filing(&c);
        x.version = version;
        x.leg = leg;
        x.status = status;
        f.write_claim_filing(&c, &x);
        assert_mutav_err(f.pay_claim(c), MutavError::UnsupportedVersion);
    }
    // Paid filing: newer version, a status this binary never writes
    // (`CLAIM_WITHDRAWN`, ADR 0019), an unknown status, an unknown leg.
    for (version, status, leg) in [
        (PROGRAM_LAYOUT_VERSION + 1, CLAIM_PAID, LEG_DEFAULT),
        (PROGRAM_LAYOUT_VERSION, CLAIM_WITHDRAWN, LEG_DEFAULT),
        (PROGRAM_LAYOUT_VERSION, CLAIM_SETTLED + 1, LEG_DEFAULT),
        (PROGRAM_LAYOUT_VERSION, CLAIM_PAID, u8::MAX),
    ] {
        let (mut f, c) = paid(10_000 * BRL, BRL);
        let mut p = f.payout(&c);
        p.version = version;
        p.status = status;
        p.leg = leg;
        f.write_claim_filing(&c, &p);
        assert_mutav_err(
            f.settle_payout(c, unique_hash()),
            MutavError::UnsupportedVersion,
        );
    }
    // Guarantee and VaultState read by every claim instruction.
    let (mut f, g) = book(10_000 * BRL, 10_000 * BRL, 0);
    let c = Claim::on(&g, BRL);
    f.file_claim(c).unwrap();
    let mut gg = f.guarantee(&g.id);
    gg.status = GUARANTEE_CLOSED + 1;
    f.write_guarantee(&gg);
    assert_mutav_err(
        f.file_claim(Claim::on(&g, BRL)),
        MutavError::UnsupportedVersion,
    );
    assert_mutav_err(f.pay_claim(c), MutavError::UnsupportedVersion);
    let mut gg = f.guarantee(&g.id);
    gg.status = GUARANTEE_ACTIVE;
    f.write_guarantee(&gg);
    let mut s = f.state();
    s.version = PROGRAM_LAYOUT_VERSION + 1;
    f.write_state(&s);
    assert_mutav_err(f.pay_claim(c), MutavError::UnsupportedVersion);
    assert_mutav_err(
        f.file_claim(Claim::on(&g, BRL)),
        MutavError::UnsupportedVersion,
    );
}

#[test]
fn claim_padding_is_preserved_in_place() {
    let (mut f, g) = book(10_000 * BRL, 10_000 * BRL, 0);
    let c = Claim::on(&g, BRL);
    f.file_claim(c).unwrap();
    let mut x = f.claim_filing(&c);
    x._reserved = [0x3c; 192];
    f.write_claim_filing(&c, &x);
    let mut gg = f.guarantee(&g.id);
    gg._reserved = [0xc3; 204];
    f.write_guarantee(&gg);
    f.pay_claim(c).unwrap();
    assert_eq!(f.claim_filing(&c)._reserved, [0x3c; 192]);
    assert_eq!(f.guarantee(&g.id)._reserved, [0xc3; 204]);
    let mut p = f.payout(&c);
    p._reserved = [0x77; 192];
    f.write_claim_filing(&c, &p);
    f.settle_payout(c, unique_hash()).unwrap();
    assert_eq!(f.payout(&c)._reserved, [0x77; 192]);
}
