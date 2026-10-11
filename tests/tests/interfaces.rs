//! The devnet-release interface changes (ADRs 0020, 0021, 0023, 0026):
//! `initialize` guards, close reasons, the frozen reserve in registration and
//! halt clearing, NAV bounds, price limits, owner token accounts created by
//! the program, the adapter prefix of remaining accounts, the lifetime
//! capital counters and the event fields.

use anchor_lang::prelude::Pubkey;
use anchor_spl::token::spl_token;
use litesvm_token::CreateMint;
use mutav::{
    constants::*,
    errors::MutavError,
    events::{
        DepositFilled, DepositsFulfilled, FeesContributed, FulfilHaltRaised, GuaranteeClosed,
        GuaranteeRegistered, IncomeSwept, RedeemsFulfilled, StateRefreshed,
    },
    NavBounds,
};
use mutav_tests::helpers::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

fn bounds(min: u64, max: u64) -> NavBounds {
    NavBounds { min, max }
}

/// A reserve with `n` allowlisted investors holding 30,000 BRS each, which
/// all deposited 10,000 (NAV 1.0).
fn holders(n: usize) -> (Fixture, Allowlist, Vec<Investor>) {
    let mut f = Fixture::new();
    let inv: Vec<Investor> = (0..n).map(|_| f.investor(30_000 * BRL)).collect();
    let keys: Vec<Pubkey> = inv.iter().map(|i| i.pubkey()).collect();
    let list = f.allowlist(&keys);
    for i in &inv {
        f.deposit(i, &list, 10_000 * BRL);
    }
    (f, list, inv)
}

// ===========================================================================
// initialize
// ===========================================================================

#[test]
fn initialize_creates_the_unsolicited_account() {
    let f = Fixture::new();
    let acc = f.svm.get_account(&f.pdas.unsolicited).expect("unsolicited");
    assert_eq!(acc.owner, TOKEN_PROGRAM);
    use anchor_lang::AccountDeserialize;
    let t = anchor_spl::token::TokenAccount::try_deserialize(&mut acc.data.as_slice()).unwrap();
    assert_eq!(t.mint, f.reserve_mint);
    assert_eq!(t.owner, f.pdas.authority);
    assert_eq!(t.amount, 0);
}

#[test]
fn initialize_refuses_a_mint_without_6_decimals() {
    for decimals in [0u8, 2, 9] {
        let (mut svm, payer) = setup();
        let freeze = Keypair::new();
        let mint = CreateMint::new(&mut svm, &payer)
            .authority(&payer.pubkey())
            .freeze_authority(&freeze.pubkey())
            .decimals(decimals)
            .send()
            .unwrap();
        let mut f = Fixture::with_mint(svm, payer, freeze, mint, TOKEN_PROGRAM);
        assert_mutav_err(f.initialize(f.init_args()), MutavError::InvalidMint);
        assert!(f.svm.get_account(&f.pdas.config).is_none());
    }
}

#[test]
fn initialize_refuses_money_accounts_the_operator_owns() {
    let mut f = Fixture::uninitialized();
    let op = f.operator.pubkey();
    f.treasury = f.token_account(&op);
    assert_mutav_err(
        f.initialize(f.init_args()),
        MutavError::InvalidTreasuryAccount,
    );
    let mut f = Fixture::uninitialized();
    let op = f.operator.pubkey();
    f.payments = f.token_account(&op);
    assert_mutav_err(
        f.initialize(f.init_args()),
        MutavError::InvalidPaymentsAccount,
    );
}

#[test]
fn initialize_applies_the_whole_config_bounds() {
    let cases: Vec<Box<dyn Fn(&mut mutav::InitializeArgs)>> = vec![
        Box::new(|a| a.coverage_ratio_bps = MAX_COVERAGE_RATIO_BPS + 1),
        Box::new(|a| a.caps.max_claim_per_call = 0),
        Box::new(|a| a.caps.max_claim_per_period = a.caps.max_claim_per_call - 1),
        Box::new(|a| a.caps.max_tvl = 0),
        Box::new(|a| a.caps.max_cover_per_guarantee = 0),
        Box::new(|a| a.caps.min_request = 0),
        Box::new(|a| a.caps.max_reinstate_age = -1),
        Box::new(|a| a.mutav_capital_wallet = Pubkey::default()),
    ];
    for case in cases {
        let mut f = Fixture::uninitialized();
        let mut a = f.init_args();
        case(&mut a);
        assert_mutav_err(f.initialize(a), MutavError::InvalidParameter);
    }
    // The carved caps are written at `initialize`.
    let mut f = Fixture::uninitialized();
    let mut a = f.init_args();
    a.caps.stress_buffer = 19_000 * BRL;
    a.caps.max_reinstate_age = 30 * 86_400;
    f.initialize(a).unwrap();
    let k = f.config().caps;
    assert_eq!(
        (k.stress_buffer, k.max_reinstate_age, k.max_queue_wait_secs),
        (19_000 * BRL, 30 * 86_400, 0)
    );
}

// ===========================================================================
// Money accounts: no delegate, no close authority, not frozen
// ===========================================================================

#[test]
fn a_money_account_may_not_have_a_delegate_a_close_authority_or_be_frozen() {
    let mut f = Fixture::new();
    let admin = f.admin.insecure_clone();
    let owner = Keypair::new();
    f.svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();
    let payer = f.payer.insecure_clone();

    let delegated = f.token_account(&owner.pubkey());
    let ix = spl_token::instruction::approve(
        &TOKEN_PROGRAM,
        &delegated,
        &Pubkey::new_unique(),
        &owner.pubkey(),
        &[],
        1,
    )
    .unwrap();
    send_ixs(&mut f.svm, &[ix], &[&payer, &owner]).unwrap();

    let closable = f.token_account(&owner.pubkey());
    let ix = spl_token::instruction::set_authority(
        &TOKEN_PROGRAM,
        &closable,
        Some(&Pubkey::new_unique()),
        spl_token::instruction::AuthorityType::CloseAccount,
        &owner.pubkey(),
        &[],
    )
    .unwrap();
    send_ixs(&mut f.svm, &[ix], &[&payer, &owner]).unwrap();

    let frozen = f.token_account(&owner.pubkey());
    f.set_frozen(&frozen, true);

    let treasury = f.config().treasury_account;
    for acct in [delegated, closable, frozen] {
        let ix = f.set_treasury_account_ix(&admin.pubkey(), &acct);
        assert_mutav_err(f.send(ix, &admin), MutavError::InvalidTreasuryAccount);
        let ix = f.set_payments_account_ix(&admin.pubkey(), &acct, &treasury);
        assert_mutav_err(f.send(ix, &admin), MutavError::InvalidPaymentsAccount);
    }
}

// ===========================================================================
// close_guarantee(id, reason)
// ===========================================================================

#[test]
fn close_reasons() {
    let mut f = Fixture::new();
    f.fund_reserve(50_000 * BRL);
    let op = f.operator.insecure_clone();

    // Unknown reasons, zero included.
    let g = guarantee_args(unique_hash(), 5_000 * BRL, 0);
    f.register(g.clone()).unwrap();
    for reason in [0u8, 3, u8::MAX] {
        let ix = f.close_guarantee_reason_ix(&op.pubkey(), g.id, reason);
        assert_mutav_err(f.send(ix, &op), MutavError::InvalidParameter);
    }

    // VOID: nothing paid. Stored on the guarantee, with totals in the event.
    let meta = f.close_guarantee_reason(g.id, CLOSE_VOID).expect("void");
    let gg = f.guarantee(&g.id);
    assert_eq!((gg.status, gg.close_reason), (GUARANTEE_CLOSED, CLOSE_VOID));
    let s = f.state();
    let ev = events::<GuaranteeClosed>(&meta);
    assert_eq!(
        (
            ev[0].reason,
            ev[0].released_cover,
            ev[0].remaining_cover_total,
            ev[0].coverage_required,
            ev[0].active_guarantees
        ),
        (
            CLOSE_VOID,
            5_000 * BRL,
            s.remaining_cover_total,
            s.coverage_required,
            s.active_guarantees
        )
    );
    assert_mutav_err(
        f.close_guarantee_reason(g.id, CLOSE_RELEASED),
        MutavError::GuaranteeNotActive,
    );

    // A paid claim forbids VOID, not RELEASED.
    let g = guarantee_args(unique_hash(), 5_000 * BRL, 0);
    f.register(g.clone()).unwrap();
    let c = Claim::on(&g, 1_000 * BRL);
    f.file_claim(c).unwrap();
    // An open claim forbids both.
    for reason in [CLOSE_VOID, CLOSE_RELEASED] {
        assert_mutav_err(
            f.close_guarantee_reason(g.id, reason),
            MutavError::OpenClaims,
        );
    }
    f.pay_claim(c).unwrap();
    assert_mutav_err(
        f.close_guarantee_reason(g.id, CLOSE_VOID),
        MutavError::GuaranteeHasPayments,
    );
    f.close_guarantee_reason(g.id, CLOSE_RELEASED)
        .expect("released");
    assert_eq!(f.guarantee(&g.id).close_reason, CLOSE_RELEASED);

    // A payment on the exit leg forbids VOID too.
    let g = guarantee_args(unique_hash(), 1_000 * BRL, 1_000 * BRL);
    f.register(g.clone()).unwrap();
    let c = Claim::on(&g, 500 * BRL).leg(LEG_EXIT);
    f.file_claim(c).unwrap();
    f.pay_claim(c).unwrap();
    assert_mutav_err(
        f.close_guarantee_reason(g.id, CLOSE_VOID),
        MutavError::GuaranteeHasPayments,
    );
}

#[test]
fn registration_events_carry_the_totals() {
    let mut f = Fixture::new();
    f.fund_reserve(50_000 * BRL);
    let meta = f
        .register(guarantee_args(unique_hash(), 5_000 * BRL, 1_000 * BRL))
        .unwrap();
    let s = f.state();
    let ev = events::<GuaranteeRegistered>(&meta);
    assert_eq!(
        (
            ev[0].remaining_cover_total,
            ev[0].coverage_required,
            ev[0].active_guarantees
        ),
        (s.remaining_cover_total, s.coverage_required, 1)
    );
}

// ===========================================================================
// A frozen reserve in register_guarantee and clear_fulfil_halt (ADR 0020)
// ===========================================================================

#[test]
fn a_frozen_reserve_refuses_new_guarantees() {
    let mut f = Fixture::new();
    f.fund_reserve(50_000 * BRL);
    let reserve = f.pdas.reserve;
    f.set_frozen(&reserve, true);
    assert_mutav_err(
        f.register(guarantee_args(unique_hash(), 1_000 * BRL, 0)),
        MutavError::ReserveFrozen,
    );
    // Another token account in its place fails the seeds check.
    let op = f.operator.insecure_clone();
    let mut ix = f.register_guarantee_ix(&op.pubkey(), guarantee_args(unique_hash(), BRL, 0));
    let i = ix
        .accounts
        .iter()
        .position(|m| m.pubkey == reserve)
        .unwrap();
    ix.accounts[i].pubkey = f.pdas.claims;
    assert_anchor_err(
        f.send(ix, &op),
        anchor_lang::error::ErrorCode::ConstraintSeeds,
    );
    f.set_frozen(&reserve, false);
    f.register(guarantee_args(unique_hash(), 1_000 * BRL, 0))
        .expect("thawed");
}

#[test]
fn clear_fulfil_halt_needs_a_thawed_reserve_and_a_nav_inside_the_bounds() {
    let (mut f, _, _) = holders(1);
    let mut s = f.state();
    s.fulfil_halted = true;
    f.write_state(&s);
    let reserve = f.pdas.reserve;
    let admin = f.admin.insecure_clone();

    f.set_frozen(&reserve, true);
    assert_mutav_err(f.clear_fulfil_halt(), MutavError::ReserveFrozen);
    f.set_frozen(&reserve, false);

    // NAV 1.0 with 10,000 shares: outside these bounds, refused.
    for b in [bounds(0, NAV_SCALE - 1), bounds(NAV_SCALE + 1, u64::MAX)] {
        let ix = f.clear_fulfil_halt_bounded_ix(&admin.pubkey(), b);
        assert_mutav_err(f.send(ix, &admin), MutavError::NavOutOfBounds);
    }
    let ix = f.clear_fulfil_halt_bounded_ix(&admin.pubkey(), bounds(NAV_SCALE, NAV_SCALE - 1));
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidParameter);
    assert!(f.state().fulfil_halted);
    let ix = f.clear_fulfil_halt_bounded_ix(&admin.pubkey(), bounds(NAV_SCALE, NAV_SCALE));
    f.send(ix, &admin).expect("at the exact NAV");
    assert!(!f.state().fulfil_halted);
}

// ===========================================================================
// nav_bounds on the fills (ADR 0023)
// ===========================================================================

#[test]
fn fills_refuse_a_nav_outside_the_bounds() {
    let (mut f, list, inv) = holders(2);
    let admin = f.admin.insecure_clone();
    let a = &inv[0];
    // Conversion NAV with 20,000 shares and 20,000 BRS: (20,000e6 + 1) /
    // (20,000e6 + 1) = 1.0.
    let (r, d) = f.request_deposit(a, &list, 1_000 * BRL);
    r.unwrap();
    for b in [bounds(0, NAV_SCALE - 1), bounds(NAV_SCALE + 1, u64::MAX)] {
        let ix = f.fulfil_deposits_bounded_ix(&admin.pubkey(), 1, b, &[d]);
        assert_mutav_err(f.send(ix, &admin), MutavError::NavOutOfBounds);
    }
    let ix = f.fulfil_deposits_bounded_ix(&admin.pubkey(), 1, bounds(2, 1), &[d]);
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidParameter);
    assert_eq!(f.deposit_request(d).unwrap().status, DEPOSIT_PENDING);
    let ix = f.fulfil_deposits_bounded_ix(&admin.pubkey(), 1, bounds(NAV_SCALE, NAV_SCALE), &[d]);
    f.send(ix, &admin).expect("inside the bounds");

    let (r, s) = f.request_redeem(a, &list, 2_000 * BRL);
    r.unwrap();
    for b in [bounds(0, NAV_SCALE - 1), bounds(NAV_SCALE + 1, u64::MAX)] {
        let ix = f.fulfil_redeems_bounded_ix(&admin.pubkey(), 1, u64::MAX, b, &[s]);
        assert_mutav_err(f.send(ix, &admin), MutavError::NavOutOfBounds);
    }
    let ix = f.fulfil_redeems_bounded_ix(&admin.pubkey(), 1, u64::MAX, bounds(9, 8), &[s]);
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidParameter);
    let ix = f.fulfil_redeems_bounded_ix(
        &admin.pubkey(),
        1,
        u64::MAX,
        bounds(NAV_SCALE, NAV_SCALE),
        &[s],
    );
    f.send(ix, &admin).expect("inside the bounds");
    assert_eq!(f.redeem_request(s).unwrap().status, REDEEM_FILLED);
}

// ===========================================================================
// Price limits on requests (ADR 0023)
// ===========================================================================

#[test]
fn a_deposit_price_limit_stops_the_batch_at_its_request() {
    let (mut f, list, inv) = holders(2);
    let (a, b) = (&inv[0], &inv[1]);
    let admin = f.admin.insecure_clone();
    // a asks for at least 1 share more than 1,000 BRS buys at NAV 1.0.
    let ix = f.request_deposit_limit_ix(
        &a.pubkey(),
        &a.brs,
        1_000 * BRL,
        1_000 * BRL + 1,
        list.proof(&a.pubkey()),
    );
    let d0 = f.state().next_deposit_seq;
    f.send_as(ix, &a.key).unwrap();
    assert_eq!(
        f.deposit_request(d0).unwrap().min_shares_out,
        1_000 * BRL + 1
    );
    let (r, d1) = f.request_deposit(b, &list, 1_000 * BRL);
    r.unwrap();
    // The head's limit is not met: nothing fills, the head stays.
    assert_mutav_err(
        f.fulfil_deposits(2, &[d0, d1]),
        MutavError::PriceLimitNotMet,
    );
    assert_eq!(f.state().deposit_head, d0);
    // The owner (or the admin) cancels; the queue moves on.
    f.admin_cancel_deposit(a, d0).unwrap();
    f.fulfil_deposits(2, &[d0, d1])
        .expect("past the cancelled head");
    assert_eq!(f.deposit_request(d1).unwrap().status, DEPOSIT_FULFILLED);

    // A limit exactly met fills; a later request's unmet limit stops the
    // batch after the earlier fills, which stand.
    let ix = f.request_deposit_limit_ix(
        &a.pubkey(),
        &a.brs,
        1_000 * BRL,
        1_000 * BRL,
        list.proof(&a.pubkey()),
    );
    let d2 = f.state().next_deposit_seq;
    f.send_as(ix, &a.key).unwrap();
    let ix = f.request_deposit_limit_ix(
        &b.pubkey(),
        &b.brs,
        1_000 * BRL,
        u64::MAX,
        list.proof(&b.pubkey()),
    );
    let d3 = f.state().next_deposit_seq;
    f.send_as(ix, &b.key).unwrap();
    let ix = f.fulfil_deposits_ix(&admin.pubkey(), 2, &[d2, d3]);
    f.send(ix, &admin).expect("partial batch");
    assert_eq!(f.deposit_request(d2).unwrap().status, DEPOSIT_FULFILLED);
    assert_eq!(f.deposit_request(d3).unwrap().status, DEPOSIT_PENDING);
    assert_eq!(f.state().deposit_head, d3);
    f.assert_capital_invariants("after the limit");
}

#[test]
fn a_redeem_price_limit_stops_the_batch_at_its_request() {
    let (mut f, list, inv) = holders(2);
    let a = &inv[0];
    let ix = f.request_redeem_limit_ix(
        &a.pubkey(),
        &a.shares,
        1_000 * BRL,
        1_000 * BRL + 1,
        list.proof(&a.pubkey()),
    );
    let s0 = f.state().next_redeem_seq;
    f.send_as(ix, &a.key).unwrap();
    assert_eq!(
        f.redeem_request(s0).unwrap().min_assets_out,
        1_000 * BRL + 1
    );
    assert_mutav_err(
        f.fulfil_redeems(1, u64::MAX, &[s0]),
        MutavError::PriceLimitNotMet,
    );
    assert_eq!(f.redeem_request(s0).unwrap().status, REDEEM_PENDING);
    // NAV rises (a guarantee fee): the limit is met.
    f.contribute(1_000 * BRL).0.unwrap();
    f.fulfil_redeems(1, u64::MAX, &[s0]).expect("limit met");
    assert!(f.redeem_request(s0).unwrap().assets_out > 1_000 * BRL);
}

// ===========================================================================
// The program creates the owner's token accounts (ADR 0023)
// ===========================================================================

#[test]
fn claim_and_cancel_create_the_owners_token_accounts() {
    let (mut f, list, inv) = holders(1);
    let a = &inv[0];
    // A wallet with no share or BRS ATA of its own at the claim.
    let k = Keypair::new();
    f.svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap();
    let brs = f.brs_ata(&k.pubkey());
    let shares = f.share_ata(&k.pubkey());
    let src = f.create_ata(
        &k.pubkey(),
        &f.reserve_mint.clone(),
        &f.token_program.clone(),
    );
    f.mint_brs(&src, 5_000 * BRL);
    let list = {
        let _ = list;
        f.allowlist(&[a.pubkey(), k.pubkey()])
    };
    let seq = f.state().next_deposit_seq;
    let ix = f.request_deposit_ix(&k.pubkey(), &src, 2_000 * BRL, list.proof(&k.pubkey()));
    f.send_as(ix, &k).unwrap();
    f.fulfil_deposits(1, &[seq]).unwrap();
    assert!(f.svm.get_account(&shares).is_none_or(|x| x.data.is_empty()));
    let ix = f.claim_shares_ix(&k.pubkey(), seq, &shares);
    f.send_as(ix, &k)
        .expect("claim_shares creates the share ATA");
    assert_eq!(f.balance(&shares), 2_000 * BRL);
    // Another account than the owner's ATA is refused.
    let wrong = f.token_account(&k.pubkey());
    let rseq = f.state().next_redeem_seq;
    let ix = f.request_redeem_ix(&k.pubkey(), &shares, 1_000 * BRL, list.proof(&k.pubkey()));
    f.send_as(ix, &k).unwrap();
    let ix = f.cancel_redeem_ix(&k.pubkey(), rseq, &wrong);
    assert_mutav_err(f.send_as(ix, &k), MutavError::Unauthorized);
    let ix = f.request_redeem_ix(&k.pubkey(), &shares, 1_000 * BRL, list.proof(&k.pubkey()));
    let rseq2 = f.state().next_redeem_seq;
    f.send_as(ix, &k).unwrap();
    // Close the BRS ATA (empty) before the assets are claimed.
    let bal = f.balance(&src);
    let burn =
        spl_token::instruction::burn(&TOKEN_PROGRAM, &src, &f.reserve_mint, &k.pubkey(), &[], bal)
            .unwrap();
    let close =
        spl_token::instruction::close_account(&TOKEN_PROGRAM, &src, &k.pubkey(), &k.pubkey(), &[])
            .unwrap();
    send_ixs(&mut f.svm, &[burn, close], &[&k]).unwrap();
    assert_eq!(src, brs);
    f.fulfil_redeems(1, u64::MAX, &[rseq]).unwrap();
    let ix = f.claim_assets_ix(&k.pubkey(), rseq, &brs);
    f.send_as(ix, &k)
        .expect("claim_assets recreates the BRS ATA");
    assert_eq!(f.balance(&brs), 1_000 * BRL);
    // cancel_redeem into the existing share ATA (idempotent create).
    let ix = f.cancel_redeem_ix(&k.pubkey(), rseq2, &shares);
    f.send_as(ix, &k).expect("cancel_redeem");
    assert_eq!(f.balance(&shares), 1_000 * BRL);
}

// ===========================================================================
// Remaining accounts: the adapter prefix (ADR 0018, ADR 0027)
// ===========================================================================

#[test]
fn a_reserve_with_adapters_fails_closed_in_this_binary() {
    let (mut f, list, inv) = holders(1);
    let (r, d) = f.request_deposit(&inv[0], &list, 1_000 * BRL);
    r.unwrap();
    // With no adapter (`adapter_count == 0`) every remaining account is a
    // request: the tests above. With one, this binary refuses the gates.
    let mut c = f.config();
    c.adapter_count = 1;
    f.write_config(&c);
    assert_mutav_err(f.refresh(), MutavError::FeatureNotSupported);
    assert_mutav_err(f.fulfil_deposits(1, &[d]), MutavError::FeatureNotSupported);
    assert_mutav_err(
        f.fulfil_redeems(1, u64::MAX, &[]),
        MutavError::FeatureNotSupported,
    );
    c.adapter_count = 0;
    f.write_config(&c);
    f.fulfil_deposits(1, &[d]).expect("no adapters");
}

// ===========================================================================
// Lifetime capital counters and event fields
// ===========================================================================

#[test]
fn lifetime_capital_counters_and_fill_events() {
    let mut f = Fixture::new();
    let inv: Vec<Investor> = (0..2).map(|_| f.investor(30_000 * BRL)).collect();
    let keys: Vec<Pubkey> = inv.iter().map(|i| i.pubkey()).collect();
    let list = f.allowlist(&keys);
    let (_, d0) = f.request_deposit(&inv[0], &list, 3_000 * BRL);
    let (_, d1) = f.request_deposit(&inv[1], &list, 2_000 * BRL);
    let meta = f.fulfil_deposits(2, &[d0, d1]).unwrap();
    let s = f.state();
    assert_eq!(
        (s.deposited_assets_total, s.minted_shares_total),
        (5_000 * BRL, 5_000 * BRL)
    );
    let fills = events::<DepositFilled>(&meta);
    assert_eq!(fills.len(), 2);
    assert_eq!(
        (
            fills[0].seq,
            fills[0].assets,
            fills[0].shares_outstanding_after,
            fills[0].net_assets_after
        ),
        (d0, 3_000 * BRL, 3_000 * BRL, 3_000 * BRL)
    );
    assert_eq!(
        (fills[1].shares_outstanding_after, fills[1].net_assets_after),
        (5_000 * BRL, 5_000 * BRL)
    );
    let batch = events::<DepositsFulfilled>(&meta);
    assert_eq!(
        (
            batch[0].deposited_assets_total,
            batch[0].minted_shares_total
        ),
        (5_000 * BRL, 5_000 * BRL)
    );
    f.claim_shares(&inv[0], d0).unwrap();
    let (_, r0) = f.request_redeem(&inv[0], &list, 1_000 * BRL);
    let meta = f.fulfil_redeems(1, u64::MAX, &[r0]).unwrap();
    let s = f.state();
    assert_eq!(
        (s.redeemed_shares_total, s.redeemed_assets_total),
        (1_000 * BRL, 1_000 * BRL)
    );
    let ev = events::<RedeemsFulfilled>(&meta);
    assert_eq!(
        (ev[0].redeemed_shares_total, ev[0].redeemed_assets_total),
        (1_000 * BRL, 1_000 * BRL)
    );
    // Monotonic: a second deposit adds to the totals.
    let (_, d2) = f.request_deposit(&inv[1], &list, 1_000 * BRL);
    f.fulfil_deposits(1, &[d2]).unwrap();
    assert_eq!(f.state().deposited_assets_total, 6_000 * BRL);
}

#[test]
fn inflow_events_carry_the_running_totals() {
    let (mut f, _, _) = holders(1);
    let (res, _) = f.contribute(1_000 * BRL);
    let meta = res.unwrap();
    let s = f.state();
    let ev = events::<FeesContributed>(&meta);
    assert_eq!(
        (ev[0].fees_in_total, ev[0].fee_take_total, ev[0].brs_balance),
        (s.fees_in_total, s.fee_take_total, s.brs_balance)
    );
    f.pay_income(500 * BRL);
    let (res, _) = f.sweep(500 * BRL);
    let meta = res.unwrap();
    let s = f.state();
    let ev = events::<IncomeSwept>(&meta);
    assert_eq!(
        (ev[0].income_total, ev[0].brs_balance),
        (500 * BRL, s.brs_balance)
    );
}

#[test]
fn refresh_publishes_the_guard_inputs_and_raises_the_halt_once() {
    let (mut f, _, _) = holders(1);
    f.refresh().unwrap();
    let prev = f.state().nav_per_share;
    // A 50% loss with the test bound of 1%: the guard trips.
    let mut s = f.state();
    s.brs_balance /= 2;
    f.write_state(&s);
    let meta = f.refresh().unwrap();
    let st = f.state();
    let ev = events::<StateRefreshed>(&meta);
    assert_eq!(
        (
            ev[0].prev_nav_per_share,
            ev[0].inflow_nav,
            ev[0].guard_nav,
            ev[0].shares_outstanding,
            ev[0].net_assets,
            ev[0].fulfil_halted
        ),
        (
            prev,
            0,
            st.nav_per_share,
            st.shares_outstanding,
            5_000 * BRL,
            true
        )
    );
    let raised = events::<FulfilHaltRaised>(&meta);
    assert_eq!(raised.len(), 1);
    assert_eq!(
        (
            raised[0].prev_nav_per_share,
            raised[0].guard_nav,
            raised[0].inflow_nav,
            raised[0].max_nav_move_bps,
            raised[0].source
        ),
        (prev, st.nav_per_share, 0, 100, HALT_SOURCE_REFRESH)
    );
    // Already halted: a further move raises no second event.
    let mut s = f.state();
    s.brs_balance /= 2;
    f.write_state(&s);
    let meta = f.refresh().unwrap();
    assert!(events::<FulfilHaltRaised>(&meta).is_empty());
}
