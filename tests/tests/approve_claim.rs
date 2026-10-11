//! `approve_claim(notice_ref_hash, amount)` (spec §5.4; ADR 0021 decisions 2
//! and 8): the reserve admin approves the exact amount a filed claim above
//! `max_claim_per_call` takes out of the reserve. Admin only, never paused,
//! never coverage-gated; moves no funds; the period cap is applied at payment.
//!
//! Test caps: R$10k per call, R$20k per 31-day window.

use anchor_lang::prelude::Pubkey;
use mutav::{
    constants::*,
    errors::MutavError,
    events::{ClaimApproved, ClaimPaid},
    ConfigParam, RegisterGuaranteeArgs,
};
use mutav_tests::helpers::*;
use proptest::prelude::*;
use solana_keypair::Keypair;
use litesvm::types::TransactionResult;
use solana_signer::Signer;

const OVER: u64 = 10_000 * BRL + 1;

/// A reserve holding exactly `capital` with one guarantee of
/// `default_cover` + `exit_cover` registered.
fn book(capital: u64, default_cover: u64, exit_cover: u64) -> (Fixture, RegisterGuaranteeArgs) {
    let mut f = Fixture::new();
    f.fund_reserve(capital);
    let args = guarantee_args(unique_hash(), default_cover, exit_cover);
    f.register(args.clone()).expect("register");
    (f, args)
}

/// A filed claim of `amount` on a reserve and guarantee of R$30k.
fn filed(amount: u64) -> (Fixture, RegisterGuaranteeArgs, Claim) {
    let (mut f, g) = book(30_000 * BRL, 30_000 * BRL, 0);
    let c = Claim::on(&g, amount);
    f.file_claim(c).expect("file");
    (f, g, c)
}

fn approve_as(f: &mut Fixture, k: &Keypair, c: Claim, amount: u64) -> TransactionResult {
    let ix = f.approve_claim_ix(&k.pubkey(), c, amount);
    f.send(ix, k)
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

#[test]
fn approve_claim_records_the_exact_amount_and_unlocks_pay_claim() {
    let (mut f, g, c) = filed(OVER);
    set_time(&mut f.svm, 1_760_000_000);
    assert_mutav_err(f.pay_claim(c), MutavError::ClaimCallCapExceeded);

    let state_before = f.raw(&f.pdas.state);
    let config_before = f.raw(&f.pdas.config);
    let guarantee_before = f.guarantee(&g.id);
    let filing_before = f.claim_filing(&c);
    let reserve_before = f.balance(&f.pdas.reserve);

    let meta = f.approve_claim(c).expect("approve");

    // Only `approved_amount` changes, on the filing.
    let mut expected = filing_before.clone();
    expected.approved_amount = OVER;
    let x = f.claim_filing(&c);
    assert_eq!(x.approved_amount, OVER);
    assert_eq!(
        (x.status, x.provision, x.filed_at, x.paid_amount, x._reserved),
        (
            expected.status,
            expected.provision,
            expected.filed_at,
            expected.paid_amount,
            expected._reserved
        )
    );
    // No funds, no book: state, config, guarantee and reserve are untouched.
    assert_eq!(f.raw(&f.pdas.state), state_before);
    assert_eq!(f.raw(&f.pdas.config), config_before);
    let gg = f.guarantee(&g.id);
    assert_eq!(
        (gg.default_paid, gg.provision_default, gg.open_claims),
        (
            guarantee_before.default_paid,
            guarantee_before.provision_default,
            guarantee_before.open_claims
        )
    );
    assert_eq!(f.balance(&f.pdas.reserve), reserve_before);

    let ev = events::<ClaimApproved>(&meta);
    assert_eq!(ev.len(), 1);
    let e = &ev[0];
    assert_eq!(
        (e.config, e.ts, e.guarantee_id, e.leg, e.notice_ref_hash),
        (f.pdas.config, 1_760_000_000, g.id, LEG_DEFAULT, c.notice)
    );
    assert_eq!(
        (e.amount, e.previous_amount, e.max_claim_per_call),
        (OVER, 0, 10_000 * BRL)
    );

    // The operator now pays exactly the approved amount.
    let payments = f.config().payments_account;
    let meta = f.pay_claim(c).expect("approved above the per-call cap");
    assert_eq!(f.balance(&payments), OVER);
    assert_eq!(events::<ClaimPaid>(&meta)[0].amount, OVER);
    let x = f.claim_filing(&c);
    assert_eq!((x.status, x.paid_amount, x.approved_amount), (CLAIM_PAID, OVER, OVER));
}

#[test]
fn approve_claim_on_the_exit_leg() {
    let (mut f, g) = book(30_000 * BRL, 5_000 * BRL, 25_000 * BRL);
    let c = Claim::on(&g, 12_000 * BRL).leg(LEG_EXIT);
    f.file_claim(c).unwrap();
    let meta = f.approve_claim(c).unwrap();
    assert_eq!(events::<ClaimApproved>(&meta)[0].leg, LEG_EXIT);
    f.pay_claim(c).expect("approved exit-leg claim");
    assert_eq!(f.guarantee(&g.id).exit_paid, 12_000 * BRL);
}

#[test]
fn re_approving_the_same_amount_is_idempotent() {
    let (mut f, _, c) = filed(OVER);
    f.approve_claim(c).unwrap();
    // A later identical proposal (e.g. executed twice through the multisig)
    // records the same amount and reports the previous one.
    let meta = f.approve_claim(c).expect("same amount again");
    let e = &events::<ClaimApproved>(&meta)[0];
    assert_eq!((e.amount, e.previous_amount), (OVER, OVER));
    assert_eq!(f.claim_filing(&c).approved_amount, OVER);
    f.pay_claim(c).unwrap();
}

#[test]
fn an_approval_within_the_per_call_cap_is_recorded_and_changes_nothing() {
    // At or below the cap the operator pays alone; an approval there is
    // harmless (for instance, ahead of a later lower `max_claim_per_call`).
    for amount in [BRL, 10_000 * BRL] {
        let (mut f, _, c) = filed(amount);
        f.approve_claim(c).unwrap();
        assert_eq!(f.claim_filing(&c).approved_amount, amount);
        f.pay_claim(c).expect("within the cap");
    }
}

#[test]
fn an_approval_binds_one_filing() {
    // Two filings of the same amount on the same guarantee: approving one
    // does not let the other be paid.
    let (mut f, g, a) = filed(OVER);
    let b = Claim::on(&g, OVER);
    f.file_claim(b).unwrap();
    f.approve_claim(a).unwrap();
    assert_eq!(f.claim_filing(&b).approved_amount, 0);
    assert_mutav_err(f.pay_claim(b), MutavError::ClaimCallCapExceeded);
    f.pay_claim(a).unwrap();
}

#[test]
fn an_approval_survives_a_lower_per_call_cap() {
    // The approval is of the amount, not of a cap value: the admin may move
    // `max_claim_per_call` afterwards and the approved filing still pays.
    let (mut f, _, c) = filed(OVER);
    f.approve_claim(c).unwrap();
    f.set_config(vec![ConfigParam::MaxClaimPerCall(BRL)]).unwrap();
    f.pay_claim(c).expect("approved exactly");
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[test]
fn approve_claim_needs_the_admin() {
    let (mut f, _, c) = filed(OVER);
    let guardian = Keypair::new();
    f.svm.airdrop(&guardian.pubkey(), 1_000_000_000).unwrap();
    let admin = f.admin.insecure_clone();
    let ix = f.set_guardians_ix(
        &admin.pubkey(),
        [guardian.pubkey(), Pubkey::default(), Pubkey::default()],
    );
    f.send(ix, &admin).unwrap();

    // The operator files and pays; it never approves its own claim
    // (ADR 0020). Neither may the pauser, a guardian or a stranger.
    let stranger = Keypair::new();
    f.svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    for k in [
        f.operator.insecure_clone(),
        f.pauser.insecure_clone(),
        guardian,
        stranger,
    ] {
        assert_mutav_err(approve_as(&mut f, &k, c, OVER), MutavError::Unauthorized);
    }
    assert_eq!(f.claim_filing(&c).approved_amount, 0);
}

#[test]
fn a_replaced_admin_cannot_approve() {
    let (mut f, _, c) = filed(OVER);
    let old = f.admin.insecure_clone();
    let new = Keypair::new();
    f.svm.airdrop(&new.pubkey(), 1_000_000_000).unwrap();
    let ix = f.propose_admin_ix(&old.pubkey(), new.pubkey());
    f.send(ix, &old).unwrap();
    let ix = f.accept_admin_ix(&new.pubkey());
    f.send(ix, &new).unwrap();

    assert_mutav_err(approve_as(&mut f, &old, c, OVER), MutavError::Unauthorized);
    approve_as(&mut f, &new, c, OVER).expect("the new admin");
}

#[test]
fn approve_claim_must_name_the_exact_provision() {
    let (mut f, _, c) = filed(OVER);
    for amount in [OVER - 1, OVER + 1, 10_000 * BRL, u64::MAX] {
        let admin = f.admin.insecure_clone();
        assert_mutav_err(
            approve_as(&mut f, &admin, c, amount),
            MutavError::ExpectedAmountMismatch,
        );
    }
    // Zero is "not approved" (ADR 0019): never written as an approval.
    let admin = f.admin.insecure_clone();
    assert_mutav_err(
        approve_as(&mut f, &admin, c, 0),
        MutavError::InvalidParameter,
    );
    assert_eq!(f.claim_filing(&c).approved_amount, 0);
    assert_mutav_err(f.pay_claim(c), MutavError::ClaimCallCapExceeded);
}

#[test]
fn approve_claim_needs_a_filed_claim() {
    let (mut f, g) = book(30_000 * BRL, 30_000 * BRL, 0);
    // No filing for this notice.
    assert_anchor_err(
        f.approve_claim(Claim::on(&g, OVER)),
        anchor_lang::error::ErrorCode::AccountNotInitialized,
    );

    // Paid, then settled: an approval after payment is refused.
    let c = Claim::on(&g, BRL);
    f.file_claim(c).unwrap();
    f.pay_claim(c).unwrap();
    assert_mutav_err(f.approve_claim(c), MutavError::ClaimNotFiled);
    f.settle_payout(c, unique_hash()).unwrap();
    assert_mutav_err(f.approve_claim(c), MutavError::ClaimNotFiled);
}

#[test]
fn approve_claim_refuses_a_withdrawn_filing_in_this_binary() {
    // `CLAIM_WITHDRAWN` is written only by `amend_claim`, a later upgrade;
    // this binary fails closed on it (ADR 0019), so an approval can never
    // attach to a withdrawn filing that a re-file would revive (NEW-C).
    let (mut f, _, c) = filed(OVER);
    let mut x = f.claim_filing(&c);
    x.status = CLAIM_WITHDRAWN;
    f.write_claim_filing(&c, &x);
    assert_mutav_err(f.approve_claim(c), MutavError::UnsupportedVersion);
}

#[test]
fn approve_claim_refuses_unknown_layouts() {
    // Filing: newer version, unknown leg, unknown status.
    for (version, leg, status) in [
        (PROGRAM_LAYOUT_VERSION + 1, LEG_DEFAULT, CLAIM_FILED),
        (PROGRAM_LAYOUT_VERSION, LEG_EXIT + 1, CLAIM_FILED),
        (PROGRAM_LAYOUT_VERSION, LEG_DEFAULT, CLAIM_SETTLED + 1),
    ] {
        let (mut f, _, c) = filed(OVER);
        let mut x = f.claim_filing(&c);
        (x.version, x.leg, x.status) = (version, leg, status);
        f.write_claim_filing(&c, &x);
        assert_mutav_err(f.approve_claim(c), MutavError::UnsupportedVersion);
    }
    // Guarantee with an unknown status.
    let (mut f, g, c) = filed(OVER);
    let mut gg = f.guarantee(&g.id);
    gg.status = GUARANTEE_CLOSED + 1;
    f.write_guarantee(&gg);
    assert_mutav_err(f.approve_claim(c), MutavError::UnsupportedVersion);
    // A newer config is covered by `version_guard.rs` (pilot list).
}

#[test]
fn approve_claim_preserves_padding() {
    let (mut f, g, c) = filed(OVER);
    let mut x = f.claim_filing(&c);
    x._reserved = [0x3c; 192];
    f.write_claim_filing(&c, &x);
    let gg_before = f.raw(&guarantee_pda(&f.pdas.config, &g.id));
    f.approve_claim(c).unwrap();
    assert_eq!(f.claim_filing(&c)._reserved, [0x3c; 192]);
    assert_eq!(f.raw(&guarantee_pda(&f.pdas.config, &g.id)), gg_before);
}

// ---------------------------------------------------------------------------
// Gates: never paused, never coverage-gated
// ---------------------------------------------------------------------------

#[test]
fn approve_claim_works_while_paused_under_covered_and_halted() {
    let (mut f, _, c) = filed(OVER);
    let pauser = f.pauser.insecure_clone();
    f.send(f.pause_ix(&pauser.pubkey()), &pauser).unwrap();
    let mut s = f.state();
    s.mode = MODE_UNDER_COVERED;
    s.fulfil_halted = true;
    s.remaining_cover_total += 500_000 * BRL;
    f.write_state(&s);
    f.approve_claim(c).expect("never paused, never gated");
    f.pay_claim(c).expect("and paid");
}

#[test]
fn approve_claim_works_with_the_operator_revoked() {
    // Operator-compromise recovery (ADR 0020): approvals stay with the admin.
    let (mut f, _, c) = filed(OVER);
    let pauser = f.pauser.insecure_clone();
    f.send(f.revoke_operator_ix(&pauser.pubkey()), &pauser)
        .unwrap();
    f.approve_claim(c).expect("admin only");
}

// ---------------------------------------------------------------------------
// The period cap is applied at payment (ADR 0021 decision 2)
// ---------------------------------------------------------------------------

#[test]
fn an_approved_claim_still_counts_toward_the_period_cap() {
    // R$15k paid inside the window; an approved R$10k + 1 would take it to
    // R$25k + 1 > R$20k.
    let (mut f, g) = book(60_000 * BRL, 30_000 * BRL, 0);
    let g2 = guarantee_args(unique_hash(), 30_000 * BRL, 0);
    f.register(g2.clone()).unwrap();
    for k in [10_000 * BRL, 5_000 * BRL] {
        let c = Claim::on(&g2, k);
        f.file_claim(c).unwrap();
        f.pay_claim(c).unwrap();
    }
    let c = Claim::on(&g, OVER);
    f.file_claim(c).unwrap();
    f.approve_claim(c).expect("approval does not read the window");
    assert_mutav_err(f.pay_claim(c), MutavError::ClaimPeriodCapExceeded);
}

#[test]
fn an_approval_larger_than_the_period_cap_pays_after_a_bundled_raise() {
    // An unusually large claim: `/admin` bundles a `set_config` raise of
    // `max_claim_per_period` with the approval in one proposal.
    let (mut f, _, c) = filed(25_000 * BRL);
    f.approve_claim(c).unwrap();
    assert_mutav_err(f.pay_claim(c), MutavError::ClaimPeriodCapExceeded);

    let (mut f, _, c) = filed(25_000 * BRL);
    let admin = f.admin.insecure_clone();
    let payer = f.payer.insecure_clone();
    let ixs = [
        f.refresh_ix(),
        f.set_config_ix(
            &admin.pubkey(),
            vec![ConfigParam::MaxClaimPerPeriod(25_000 * BRL)],
        ),
        f.approve_claim_ix(&admin.pubkey(), c, 25_000 * BRL),
    ];
    send_ixs(&mut f.svm, &ixs, &[&payer, &admin]).expect("one proposal");
    f.pay_claim(c).expect("exactly the raised window");
    assert_eq!(f.state().claim_window_paid(), 25_000 * BRL as u128);
}

#[test]
fn approval_boundary_at_the_per_call_cap() {
    // At the cap: paid without approval. One base unit above: refused until
    // approved, then paid.
    let (mut f, g) = book(30_000 * BRL, 30_000 * BRL, 0);
    let at = Claim::on(&g, 10_000 * BRL);
    f.file_claim(at).unwrap();
    f.pay_claim(at).expect("exactly the cap, no approval");
    let over = Claim::on(&g, OVER);
    f.file_claim(over).unwrap();
    // R$10k paid: the window still has R$10k; OVER needs it raised by 1.
    f.set_config(vec![ConfigParam::MaxClaimPerPeriod(20_000 * BRL + 1)])
        .unwrap();
    assert_mutav_err(f.pay_claim(over), MutavError::ClaimCallCapExceeded);
    f.approve_claim(over).unwrap();
    f.pay_claim(over).expect("approved");
    assert_eq!(f.state().claims_paid_total, 20_000 * BRL + 1);
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 24, failure_persistence: None, ..ProptestConfig::default() })]

    /// An approved claim above the per-call cap is never refused for the
    /// coverage gate, under-coverage or the pause (spec §1 principle 4): the
    /// approval adds no gate, only the caps, liquid BRS and a freeze stop a
    /// payment.
    #[test]
    fn an_approved_claim_is_never_refused_for_coverage(
        over in 1u64..=10_000 * BRL,
        extra_cover in 0u64..=1u64 << 50,
        extra_provisions in 0u64..=1u64 << 50,
        under_covered: bool,
        paused: bool,
        stress_buffer in prop_oneof![Just(0u64), 0u64..=1u64 << 50, Just(u64::MAX)],
    ) {
        let amount = 10_000 * BRL + over; // above the per-call cap, within the window
        let (mut f, g) = book(30_000 * BRL, 30_000 * BRL, 0);
        let c = Claim::on(&g, amount);
        f.file_claim(c).unwrap();
        if paused {
            let pauser = f.pauser.insecure_clone();
            f.send(f.pause_ix(&pauser.pubkey()), &pauser).unwrap();
        }
        f.approve_claim(c).unwrap();
        let mut cfg = f.config();
        cfg.caps.stress_buffer = stress_buffer;
        f.write_config(&cfg);
        let mut s = f.state();
        s.mode = if under_covered { MODE_UNDER_COVERED } else { MODE_NORMAL };
        s.remaining_cover_total += extra_cover;
        s.provisions += extra_provisions;
        f.write_state(&s);

        let res = f.pay_claim(c);
        prop_assert!(res.is_ok(), "refused: {:?}", res.err().map(|e| e.err));
        prop_assert_eq!(f.state().brs_balance, s.brs_balance - amount);
    }
}
