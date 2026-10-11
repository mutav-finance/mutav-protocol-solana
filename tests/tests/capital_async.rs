//! Async deposits and redemptions (spec §3.8, §4 invariants 4–5 and 8–12,
//! §5.5, §5.8; ADR 0008; plan Task 6). Whole fills only: the partial fills
//! of ADR 0010 are carved from request padding when they are built
//! (ADR 0019).

use anchor_lang::prelude::Pubkey;
use anchor_spl::token::spl_token::instruction::approve;
use mutav::{
    constants::*,
    errors::MutavError,
    events::{
        AssetsClaimed, DepositCancelled, DepositRequested, DepositsFulfilled, QueueHeadsAdvanced,
        RedeemCancelled, RedeemFilled, RedeemRequested, RedeemsFulfilled, SharesClaimed,
    },
    math::{assets_for, conversion_nav, shares_for},
    solvency::{Solvency, SolvencyInputs},
    state::{VaultConfig, VaultState},
};
use mutav_tests::helpers::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

const T0: i64 = 1_760_000_000;

/// A fresh reserve with `n` allowlisted investors holding `brs` each.
fn setup(n: usize, brs: u64) -> (Fixture, Allowlist, Vec<Investor>) {
    let mut f = Fixture::new();
    set_time(&mut f.svm, T0);
    let invs: Vec<Investor> = (0..n).map(|_| f.investor(brs)).collect();
    let keys: Vec<Pubkey> = invs.iter().map(|i| i.pubkey()).collect();
    let list = f.allowlist(&keys);
    (f, list, invs)
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

fn net_assets(f: &Fixture) -> u64 {
    solvency(&f.config(), &f.state()).net_assets
}

fn lamports(f: &Fixture, k: &Pubkey) -> u64 {
    f.svm.get_account(k).map(|a| a.lamports).unwrap_or(0)
}

fn inject<F: FnOnce(&mut VaultState)>(f: &mut Fixture, edit: F) {
    let mut s = f.state();
    edit(&mut s);
    f.write_state(&s);
}

fn pause(f: &mut Fixture) {
    let admin = f.admin.insecure_clone();
    let ix = f.pause_ix(&admin.pubkey());
    f.send(ix, &admin).expect("pause");
}

// ===========================================================================
// request_deposit
// ===========================================================================

#[test]
fn request_deposit_escrows_and_queues() {
    let (mut f, list, inv) = setup(1, 50_000 * BRL);
    let a = &inv[0];
    let before = f.state();
    let (res, seq) = f.request_deposit(a, &list, 5_000 * BRL);
    let meta = res.expect("request_deposit");
    assert_eq!(seq, 0);

    let r = f.deposit_request(0).unwrap();
    assert_eq!(
        (r.version, r.owner, r.seq, r.assets, r.status),
        (
            PROGRAM_LAYOUT_VERSION,
            a.pubkey(),
            0,
            5_000 * BRL,
            DEPOSIT_PENDING
        )
    );
    assert_ne!(r.bump, 0);
    assert_eq!((r.shares_out, r.nav_at_fulfil, r.fulfilled_at), (0, 0, 0));
    assert_eq!(r.requested_at, T0);
    assert_eq!(r._reserved, [0; 56]);

    let s = f.state();
    assert_eq!(s.next_deposit_seq, 1);
    assert_eq!(s.deposit_head, 0);
    assert_eq!(s.pending_deposits_total, 5_000 * BRL);
    // Pending deposits are excluded from `stable_assets` and NAV.
    assert_eq!(s.brs_balance, before.brs_balance);
    assert_eq!(s.shares_outstanding, before.shares_outstanding);
    assert_eq!(solvency(&f.config(), &s).stable_assets, 0);

    assert_eq!(f.balance(&f.pdas.pending_deposits), 5_000 * BRL);
    assert_eq!(f.balance(&a.brs), 45_000 * BRL);

    let ev = events::<DepositRequested>(&meta);
    assert_eq!(ev.len(), 1);
    assert_eq!(
        (ev[0].config, ev[0].owner, ev[0].seq, ev[0].assets),
        (f.pdas.config, a.pubkey(), 0, 5_000 * BRL)
    );

    // A second request takes the next seq.
    set_time(&mut f.svm, T0 + 60);
    let (res, seq) = f.request_deposit(a, &list, 1_000 * BRL);
    res.unwrap();
    assert_eq!(seq, 1);
    assert_eq!(f.state().next_deposit_seq, 2);
    f.assert_capital_invariants("after requests");
}

#[test]
fn request_deposit_requires_an_allowlist_proof() {
    let (mut f, list, inv) = setup(3, 10_000 * BRL);
    let outsider = f.investor(10_000 * BRL);
    // Not in the tree.
    let ix = f.request_deposit_ix(&outsider.pubkey(), &outsider.brs, 1_000 * BRL, vec![]);
    assert_mutav_err(f.send_as(ix, &outsider.key), MutavError::NotAllowlisted);
    // Someone else's proof.
    let ix = f.request_deposit_ix(
        &outsider.pubkey(),
        &outsider.brs,
        1_000 * BRL,
        list.proof(&inv[0].pubkey()),
    );
    assert_mutav_err(f.send_as(ix, &outsider.key), MutavError::NotAllowlisted);
    // A wrong proof for a listed wallet.
    let ix = f.request_deposit_ix(&inv[1].pubkey(), &inv[1].brs, 1_000 * BRL, vec![[9; 32]]);
    assert_mutav_err(f.send_as(ix, &inv[1].key), MutavError::NotAllowlisted);
    // Every listed wallet passes.
    for i in &inv {
        f.request_deposit(i, &list, 1_000 * BRL).0.expect("listed");
    }
}

#[test]
fn a_zero_root_allowlists_nobody() {
    let mut f = Fixture::new();
    let a = f.investor(10_000 * BRL);
    let ix = f.request_deposit_ix(&a.pubkey(), &a.brs, 1_000 * BRL, vec![]);
    assert_mutav_err(f.send_as(ix, &a.key), MutavError::NotAllowlisted);
}

#[test]
fn request_deposit_size_limits() {
    let (mut f, list, inv) = setup(1, 100_000 * BRL);
    let a = &inv[0];
    assert_mutav_err(
        f.request_deposit(a, &list, 1_000 * BRL - 1).0,
        MutavError::RequestTooSmall,
    );
    assert_mutav_err(
        f.request_deposit(a, &list, 30_000 * BRL + 1).0,
        MutavError::RequestTooLarge,
    );
    f.request_deposit(a, &list, 1_000 * BRL).0.expect("min");
    f.request_deposit(a, &list, 30_000 * BRL).0.expect("max");
}

#[test]
fn request_deposit_is_paused() {
    let (mut f, list, inv) = setup(1, 10_000 * BRL);
    pause(&mut f);
    assert_mutav_err(
        f.request_deposit(&inv[0], &list, 1_000 * BRL).0,
        MutavError::Paused,
    );
}

#[test]
fn request_deposit_requires_the_source_owner_to_sign() {
    let (mut f, list, inv) = setup(2, 10_000 * BRL);
    let (a, b) = (&inv[0], &inv[1]);
    // B signs with A's BRS account, even with A's approval as delegate.
    let ix = approve(
        &TOKEN_PROGRAM,
        &a.brs,
        &b.pubkey(),
        &a.pubkey(),
        &[],
        5_000 * BRL,
    )
    .unwrap();
    f.send_as(ix, &a.key).expect("approve");
    let ix = f.request_deposit_ix(&b.pubkey(), &a.brs, 1_000 * BRL, list.proof(&b.pubkey()));
    assert_mutav_err(f.send_as(ix, &b.key), MutavError::Unauthorized);
    // A share account is not a BRS source.
    let ix = f.request_deposit_ix(&a.pubkey(), &a.shares, 1_000 * BRL, list.proof(&a.pubkey()));
    assert_mutav_err(f.send_as(ix, &a.key), MutavError::InvalidMint);
    assert_eq!(f.balance(&a.brs), 10_000 * BRL);
}

// ===========================================================================
// cancel_deposit
// ===========================================================================

#[test]
fn cancel_deposit_refunds_and_closes_while_paused() {
    let (mut f, list, inv) = setup(1, 10_000 * BRL);
    let a = &inv[0];
    let (res, seq) = f.request_deposit(a, &list, 4_000 * BRL);
    res.unwrap();
    pause(&mut f);
    let rent = lamports(&f, &deposit_pda(&f.pdas.config, seq));
    let sol_before = lamports(&f, &a.pubkey());
    let meta = f.cancel_deposit(a, seq).expect("cancel while paused");
    assert!(f.deposit_request(seq).is_none(), "closed");
    assert_eq!(f.balance(&a.brs), 10_000 * BRL);
    assert_eq!(f.balance(&f.pdas.pending_deposits), 0);
    let s = f.state();
    assert_eq!(s.pending_deposits_total, 0);
    assert_eq!(s.deposit_head, 0, "only fulfil / advance move the head");
    assert_eq!(s.next_deposit_seq, 1);
    // Rent back to the owner (who also paid this transaction's fee).
    assert_eq!(lamports(&f, &a.pubkey()), sol_before + rent - 5_000);
    let ev = events::<DepositCancelled>(&meta);
    assert_eq!(
        (ev[0].owner, ev[0].seq, ev[0].assets),
        (a.pubkey(), seq, 4_000 * BRL)
    );
    f.assert_capital_invariants("after cancel");
}

#[test]
fn cancel_deposit_is_owner_or_admin_and_pending_only() {
    let (mut f, list, inv) = setup(2, 10_000 * BRL);
    let (a, b) = (&inv[0], &inv[1]);
    let (res, seq) = f.request_deposit(a, &list, 2_000 * BRL);
    res.unwrap();
    // Another investor, the operator or the pauser cannot cancel.
    let ix = f.cancel_deposit_ix(&b.pubkey(), &a.pubkey(), seq, &a.brs);
    assert_mutav_err(f.send_as(ix, &b.key), MutavError::Unauthorized);
    for k in [f.operator.insecure_clone(), f.pauser.insecure_clone()] {
        let ix = f.cancel_deposit_ix(&k.pubkey(), &a.pubkey(), seq, &a.brs);
        assert_mutav_err(f.send(ix, &k), MutavError::Unauthorized);
    }
    // The refund goes to the owner's ATA only, and the rent to the owner.
    let ix = f.cancel_deposit_ix(&a.pubkey(), &a.pubkey(), seq, &b.brs);
    assert_mutav_err(f.send_as(ix, &a.key), MutavError::Unauthorized);
    let other = f.token_account(&a.pubkey());
    let ix = f.cancel_deposit_ix(&a.pubkey(), &a.pubkey(), seq, &other);
    assert_mutav_err(f.send_as(ix, &a.key), MutavError::Unauthorized);
    let ix = f.cancel_deposit_ix(&a.pubkey(), &b.pubkey(), seq, &b.brs);
    assert_mutav_err(f.send_as(ix, &a.key), MutavError::Unauthorized);
    f.fulfil_deposits(1, &[seq]).unwrap();
    assert_mutav_err(f.cancel_deposit(a, seq), MutavError::InvalidRequestStatus);
    assert_mutav_err(
        f.admin_cancel_deposit(a, seq),
        MutavError::InvalidRequestStatus,
    );
}

#[test]
fn the_admin_cancels_a_deposit_back_to_its_owner() {
    let (mut f, list, inv) = setup(2, 10_000 * BRL);
    let (a, b) = (&inv[0], &inv[1]);
    let (res, seq) = f.request_deposit(a, &list, 2_000 * BRL);
    res.unwrap();
    let (res, seq_b) = f.request_deposit(b, &list, 1_000 * BRL);
    res.unwrap();
    // The investor is de-listed and its BRS account closed: the admin's
    // cancel recreates the owner's ATA (the admin pays) and returns
    // everything to the owner, never to the signer. Paused: still allowed.
    let close = anchor_spl::token::spl_token::instruction::close_account(
        &TOKEN_PROGRAM,
        &a.brs,
        &a.pubkey(),
        &a.pubkey(),
        &[],
    )
    .unwrap();
    let bal = f.balance(&a.brs);
    let burn = anchor_spl::token::spl_token::instruction::burn(
        &TOKEN_PROGRAM,
        &a.brs,
        &f.reserve_mint,
        &a.pubkey(),
        &[],
        bal,
    )
    .unwrap();
    send_ixs(&mut f.svm, &[burn, close], &[&a.key]).expect("close the owner's ATA");
    assert!(f.svm.get_account(&a.brs).is_none_or(|x| x.data.is_empty()));
    f.allowlist(&[b.pubkey()]);
    let admin = f.admin.insecure_clone();
    f.send(f.pause_ix(&admin.pubkey()), &admin).unwrap();

    let owner_lamports = f.svm.get_account(&a.pubkey()).unwrap().lamports;
    let meta = f.admin_cancel_deposit(a, seq).expect("admin cancel");
    assert_eq!(f.balance(&a.brs), 2_000 * BRL, "refund in the owner's ATA");
    assert!(f.deposit_request(seq).is_none(), "request closed");
    assert!(
        f.svm.get_account(&a.pubkey()).unwrap().lamports > owner_lamports,
        "the request's rent goes to the owner"
    );
    let ev = events::<DepositCancelled>(&meta);
    assert_eq!(
        (ev[0].owner, ev[0].seq, ev[0].assets, ev[0].by),
        (a.pubkey(), seq, 2_000 * BRL, admin.pubkey())
    );
    // The head can now move past it to the next live request.
    f.advance_queue_head(QUEUE_DEPOSIT, 2, &[seq, seq_b])
        .unwrap();
    assert_eq!(f.state().deposit_head, seq_b);
    f.assert_capital_invariants("after the admin cancel");

    // The owner's own cancel, while paused, names the owner as `by`.
    let meta = f.cancel_deposit(b, seq_b).expect("owner cancel");
    assert_eq!(events::<DepositCancelled>(&meta)[0].by, b.pubkey());
    let _ = list;
}

// ===========================================================================
// fulfil_deposits and claim_shares
// ===========================================================================

#[test]
fn first_deposit_mints_one_share_per_base_unit() {
    let (mut f, list, inv) = setup(1, 10_000 * BRL);
    let a = &inv[0];
    let shares = f.deposit(a, &list, 10_000 * BRL);
    assert_eq!(shares, 10_000 * BRL);
    assert_eq!(f.balance(&a.shares), 10_000 * BRL);
    let s = f.state();
    assert_eq!(
        (s.brs_balance, s.shares_outstanding),
        (10_000 * BRL, 10_000 * BRL)
    );
    assert_eq!(f.nav(), NAV_SCALE);
    f.assert_capital_invariants("first deposit");
}

#[test]
fn fulfil_deposits_prices_at_the_nav_at_fulfil_in_fifo_order() {
    let (mut f, list, inv) = setup(3, 30_000 * BRL);
    f.deposit(&inv[0], &list, 10_000 * BRL);
    // B and C request at NAV 1.0 ...
    let (r, b_seq) = f.request_deposit(&inv[1], &list, 6_000 * BRL);
    r.unwrap();
    let (r, c_seq) = f.request_deposit(&inv[2], &list, 3_000 * BRL);
    r.unwrap();
    // ... then guarantee fees raise NAV before the admin fulfils.
    f.contribute(2_500 * BRL).0.unwrap(); // net 2,000 → NAV 1.2
    let (so, na) = (f.state().shares_outstanding, net_assets(&f));
    assert_eq!((so, na), (10_000 * BRL, 12_000 * BRL));
    let b_shares = shares_for(6_000 * BRL, so, na).unwrap();
    let c_shares = shares_for(3_000 * BRL, so + b_shares, na + 6_000 * BRL).unwrap();
    let nav_b = conversion_nav(so, na).unwrap();

    set_time(&mut f.svm, T0 + 100);
    let meta = f.fulfil_deposits(2, &[b_seq, c_seq]).expect("fulfil");
    let b = f.deposit_request(b_seq).unwrap();
    assert_eq!(
        (b.status, b.shares_out, b.nav_at_fulfil, b.fulfilled_at),
        (DEPOSIT_FULFILLED, b_shares, nav_b, T0 + 100)
    );
    assert_eq!(f.deposit_request(c_seq).unwrap().shares_out, c_shares);
    assert!(b_shares < 6_000 * BRL, "bought above 1.0");

    let s = f.state();
    assert_eq!(s.brs_balance, 21_000 * BRL);
    assert_eq!(s.pending_deposits_total, 0);
    assert_eq!(s.shares_outstanding, so + b_shares + c_shares);
    assert_eq!(s.deposit_head, c_seq + 1);
    assert_eq!(f.balance(&f.pdas.reserve), 21_000 * BRL);
    assert_eq!(f.balance(&f.pdas.pending_deposits), 0);
    // NAV per share never falls on a deposit (rounding favours the reserve).
    assert!(f.nav() >= 1_200_000_000 - 1);

    let ev = events::<DepositsFulfilled>(&meta);
    assert_eq!(ev.len(), 1);
    assert_eq!(
        (
            ev[0].from_seq,
            ev[0].to_seq,
            ev[0].assets,
            ev[0].shares,
            ev[0].nav
        ),
        (b_seq, c_seq, 9_000 * BRL, b_shares + c_shares, nav_b)
    );
    f.assert_capital_invariants("after fulfil");

    // Unclaimed shares already count; claiming mints them and closes.
    let before_sol = lamports(&f, &inv[1].pubkey());
    let rent = lamports(&f, &deposit_pda(&f.pdas.config, b_seq));
    set_time(&mut f.svm, T0 + 200);
    let meta = f.claim_shares(&inv[1], b_seq).expect("claim");
    assert_eq!(f.balance(&inv[1].shares), b_shares);
    assert!(f.deposit_request(b_seq).is_none());
    assert_eq!(lamports(&f, &inv[1].pubkey()), before_sol + rent - 5_000);
    let ev = events::<SharesClaimed>(&meta);
    assert_eq!(
        (ev[0].owner, ev[0].seq, ev[0].shares),
        (inv[1].pubkey(), b_seq, b_shares)
    );
    assert_eq!(f.state().shares_outstanding, so + b_shares + c_shares);
    f.assert_capital_invariants("after claim");
}

#[test]
fn fulfil_deposits_count_and_skip_proof() {
    let (mut f, list, inv) = setup(1, 100_000 * BRL);
    let a = &inv[0];
    for _ in 0..4 {
        f.request_deposit(a, &list, 1_000 * BRL).0.unwrap();
    }
    f.cancel_deposit(a, 1).unwrap(); // seq 1 is dead
                                     // `count` limits fills, not accounts: seq 0 filled, seq 1 skipped, seq 2
                                     // filled, then stop.
    f.fulfil_deposits(2, &[0, 1, 2, 3]).unwrap();
    assert_eq!(f.deposit_request(0).unwrap().status, DEPOSIT_FULFILLED);
    assert_eq!(f.deposit_request(2).unwrap().status, DEPOSIT_FULFILLED);
    assert_eq!(f.deposit_request(3).unwrap().status, DEPOSIT_PENDING);
    assert_eq!(f.state().deposit_head, 3);
    // A pending request is never skipped: starting past the head fails.
    assert_mutav_err(f.fulfil_deposits(1, &[4]), MutavError::QueueOrderViolation);
    // Out of order fails.
    f.request_deposit(a, &list, 1_000 * BRL).0.unwrap(); // seq 4
    assert_mutav_err(
        f.fulfil_deposits(2, &[4, 3]),
        MutavError::QueueOrderViolation,
    );
    f.fulfil_deposits(2, &[3, 4]).unwrap();
    assert_eq!(f.state().deposit_head, 5);
    f.assert_capital_invariants("after skips");
}

#[test]
fn fulfil_deposits_tvl_cap_at_the_boundary() {
    let (mut f, list, inv) = setup(4, 40_000 * BRL);
    for i in &inv[..3] {
        f.deposit(i, &list, 30_000 * BRL);
    }
    // stable_assets 90,000; max_tvl 100,000.
    let (r, seq) = f.request_deposit(&inv[3], &list, 10_000 * BRL + 1);
    r.unwrap();
    assert_mutav_err(f.fulfil_deposits(1, &[seq]), MutavError::TvlCapExceeded);
    f.cancel_deposit(&inv[3], seq).unwrap();
    let (r, seq) = f.request_deposit(&inv[3], &list, 10_000 * BRL);
    r.unwrap();
    f.fulfil_deposits(1, &[seq - 1, seq])
        .expect("exactly at the cap");
    assert_eq!(f.state().brs_balance, 100_000 * BRL);
}

#[test]
fn fulfil_deposits_gates() {
    let (mut f, list, inv) = setup(1, 10_000 * BRL);
    let (r, seq) = f.request_deposit(&inv[0], &list, 1_000 * BRL);
    r.unwrap();
    // Admin only.
    for s in [
        f.operator.insecure_clone(),
        f.pauser.insecure_clone(),
        Keypair::new(),
    ] {
        let ix = f.fulfil_deposits_ix(&s.pubkey(), 1, &[seq]);
        assert_mutav_err(f.send(ix, &s), MutavError::Unauthorized);
    }
    // NAV-move guard.
    inject(&mut f, |s| s.fulfil_halted = true);
    assert_mutav_err(f.fulfil_deposits(1, &[seq]), MutavError::FulfilHalted);
    inject(&mut f, |s| s.fulfil_halted = false);
    // Pause.
    pause(&mut f);
    assert_mutav_err(f.fulfil_deposits(1, &[seq]), MutavError::Paused);
    let admin = f.admin.insecure_clone();
    let ix = f.unpause_ix(&admin.pubkey());
    f.send(ix, &admin).unwrap();
    f.fulfil_deposits(1, &[seq]).expect("all gates open");
}

#[test]
fn claim_shares_is_owner_only_fulfilled_only_and_never_paused() {
    let (mut f, list, inv) = setup(2, 10_000 * BRL);
    let (a, b) = (&inv[0], &inv[1]);
    let (r, seq) = f.request_deposit(a, &list, 2_000 * BRL);
    r.unwrap();
    assert_mutav_err(f.claim_shares(a, seq), MutavError::InvalidRequestStatus);
    f.fulfil_deposits(1, &[seq]).unwrap();
    let ix = f.claim_shares_ix(&b.pubkey(), seq, &b.shares);
    assert_mutav_err(f.send_as(ix, &b.key), MutavError::Unauthorized);
    let ix = f.claim_shares_ix(&a.pubkey(), seq, &b.shares);
    assert_mutav_err(f.send_as(ix, &a.key), MutavError::Unauthorized);
    pause(&mut f);
    f.claim_shares(a, seq).expect("claim while paused");
    assert_eq!(f.balance(&a.shares), 2_000 * BRL);
}

// ===========================================================================
// request_redeem and cancel_redeem
// ===========================================================================

/// Investors 0..n each deposit `each`, so every one holds shares at NAV 1.0.
fn holders(n: usize, each: u64) -> (Fixture, Allowlist, Vec<Investor>) {
    let (mut f, list, inv) = setup(n, each);
    for i in &inv {
        f.deposit(i, &list, each);
    }
    (f, list, inv)
}

#[test]
fn request_redeem_escrows_shares() {
    let (mut f, list, inv) = holders(1, 10_000 * BRL);
    let a = &inv[0];
    set_time(&mut f.svm, T0 + 10);
    let (res, seq) = f.request_redeem(a, &list, 4_000 * BRL);
    let meta = res.expect("request_redeem");
    let r = f.redeem_request(seq).unwrap();
    assert_eq!(
        (r.version, r.owner, r.seq, r.status),
        (PROGRAM_LAYOUT_VERSION, a.pubkey(), 0, REDEEM_PENDING)
    );
    assert_eq!(r.shares, 4_000 * BRL);
    assert_eq!((r.shares_filled, r.shares_remaining()), (0, 4_000 * BRL));
    assert_eq!((r.assets_out, r.nav_at_fill, r.filled_at), (0, 0, 0));
    assert_eq!(r.requested_at, T0 + 10);
    assert_eq!(r._reserved, [0; 48]);
    let s = f.state();
    assert_eq!((s.next_redeem_seq, s.redeem_head), (1, 0));
    assert_eq!(s.pending_redeem_shares, 4_000 * BRL);
    // Escrowed shares stay outstanding until a fill burns them.
    assert_eq!(s.shares_outstanding, 10_000 * BRL);
    assert_eq!(f.balance(&f.pdas.pending_redemptions), 4_000 * BRL);
    assert_eq!(f.balance(&a.shares), 6_000 * BRL);
    let ev = events::<RedeemRequested>(&meta);
    assert_eq!(
        (ev[0].owner, ev[0].seq, ev[0].shares),
        (a.pubkey(), 0, 4_000 * BRL)
    );
    f.assert_capital_invariants("after request_redeem");
}

#[test]
fn request_redeem_rules() {
    let (mut f, list, inv) = holders(2, 30_000 * BRL);
    let a = &inv[0];
    // Size is checked in BRS at the current NAV (1.25 after fees).
    f.contribute(18_750 * BRL).0.unwrap(); // net 15,000 over 60,000 shares
    let (so, na) = (f.state().shares_outstanding, net_assets(&f));
    let min_shares = (1..=2_000 * BRL)
        .find(|sh| assets_for(*sh, so, na).unwrap() >= 1_000 * BRL)
        .unwrap();
    assert!(min_shares < 1_000 * BRL);
    assert_mutav_err(
        f.request_redeem(a, &list, min_shares - 1).0,
        MutavError::RequestTooSmall,
    );
    assert_mutav_err(
        f.request_redeem(a, &list, 24_000 * BRL + 1).0,
        MutavError::RequestTooLarge,
    );
    assert_mutav_err(
        f.request_redeem(a, &list, 0).0,
        MutavError::InvalidParameter,
    );
    let outsider = f.investor(0);
    let ix = f.request_redeem_ix(&outsider.pubkey(), &outsider.shares, min_shares, vec![]);
    assert_mutav_err(f.send_as(ix, &outsider.key), MutavError::NotAllowlisted);
    f.request_redeem(a, &list, min_shares).0.expect("min");
    f.request_redeem(a, &list, 24_000 * BRL).0.expect("max");
    pause(&mut f);
    assert_mutav_err(f.request_redeem(a, &list, min_shares).0, MutavError::Paused);
}

#[test]
fn a_delegate_cannot_redeem_another_wallets_shares() {
    // MUTAV's capital wallet approves a delegate on its share account; the
    // delegate (even allowlisted) cannot redeem those shares (spec §5).
    let mut f = Fixture::new();
    let mutav = f.mutav_capital_wallet.insecure_clone();
    let m = f.investor_with(mutav, 10_000 * BRL);
    let d = f.investor(0);
    let list = f.allowlist(&[m.pubkey(), d.pubkey()]);
    f.deposit(&m, &list, 10_000 * BRL);
    let ix = approve(
        &TOKEN_PROGRAM,
        &m.shares,
        &d.pubkey(),
        &m.pubkey(),
        &[],
        10_000 * BRL,
    )
    .unwrap();
    f.send_as(ix, &m.key).expect("approve");
    let ix = f.request_redeem_ix(&d.pubkey(), &m.shares, 5_000 * BRL, list.proof(&d.pubkey()));
    assert_mutav_err(f.send_as(ix, &d.key), MutavError::Unauthorized);
    assert_eq!(f.balance(&m.shares), 10_000 * BRL);
}

#[test]
fn cancel_redeem_returns_the_shares_closes_and_keeps_the_head() {
    let (mut f, list, inv) = holders(2, 10_000 * BRL);
    let (a, b) = (&inv[0], &inv[1]);
    let (r, seq) = f.request_redeem(a, &list, 3_000 * BRL);
    r.unwrap();
    f.request_redeem(b, &list, 2_000 * BRL).0.unwrap();
    // Not the owner.
    let ix = f.cancel_redeem_ix(&b.pubkey(), seq, &b.shares);
    assert_mutav_err(f.send_as(ix, &b.key), MutavError::Unauthorized);
    pause(&mut f);
    let rent = lamports(&f, &redeem_pda(&f.pdas.config, seq));
    let sol = lamports(&f, &a.pubkey());
    let meta = f.cancel_redeem(a, seq).expect("cancel while paused");
    assert!(f.redeem_request(seq).is_none(), "nothing claimable: closed");
    assert_eq!(lamports(&f, &a.pubkey()), sol + rent - 5_000);
    assert_eq!(f.balance(&a.shares), 10_000 * BRL);
    let s = f.state();
    assert_eq!(s.pending_redeem_shares, 2_000 * BRL);
    assert_eq!(s.redeem_head, 0, "cancel_redeem never moves the head");
    let ev = events::<RedeemCancelled>(&meta);
    assert_eq!(
        (ev[0].owner, ev[0].seq, ev[0].shares_returned),
        (a.pubkey(), seq, 3_000 * BRL)
    );
    f.assert_capital_invariants("after cancel_redeem");
}

// ===========================================================================
// fulfil_redeems (whole fills) and claim_assets
// ===========================================================================

/// Three holders of 30,000 each (90,000 at NAV 1.0) and a 30,000 guarantee:
/// `free_capital` 60,000.
fn queue_book() -> (Fixture, Allowlist, Vec<Investor>) {
    let (mut f, list, inv) = holders(3, 30_000 * BRL);
    f.register(guarantee_args(unique_hash(), 30_000 * BRL, 0))
        .unwrap();
    assert_eq!(solvency(&f.config(), &f.state()).free_capital, 60_000 * BRL);
    (f, list, inv)
}

#[test]
fn fulfil_redeems_fills_the_head_at_the_nav_of_the_fill() {
    let (mut f, list, inv) = queue_book();
    let a = &inv[0];
    let (r, seq) = f.request_redeem(a, &list, 20_000 * BRL);
    r.unwrap();
    // NAV moves between request and fulfil.
    f.contribute(3_750 * BRL).0.unwrap(); // net 3,000 → NAV 93/90
    let (so, na) = (f.state().shares_outstanding, net_assets(&f));
    let value = assets_for(20_000 * BRL, so, na).unwrap();
    let nav = conversion_nav(so, na).unwrap();
    assert!(value > 20_000 * BRL);

    set_time(&mut f.svm, T0 + 500);
    let meta = f.fulfil_redeems(1, u64::MAX, &[seq]).expect("fulfil");
    let r = f.redeem_request(seq).unwrap();
    assert_eq!(r.status, REDEEM_FILLED);
    assert_eq!((r.shares, r.assets_out), (20_000 * BRL, value));
    assert_eq!((r.shares_filled, r.shares_remaining()), (20_000 * BRL, 0));
    assert_eq!((r.nav_at_fill, r.filled_at), (nav, T0 + 500));

    let s = f.state();
    assert_eq!(s.brs_balance, 93_000 * BRL - value);
    assert_eq!(s.claimable_assets_total, value);
    assert_eq!(s.shares_outstanding, so - 20_000 * BRL);
    assert_eq!(s.pending_redeem_shares, 0);
    assert_eq!(s.redeem_head, seq + 1);
    assert_eq!(f.balance(&f.pdas.claims), value);
    assert_eq!(f.balance(&f.pdas.pending_redemptions), 0);
    assert_eq!(f.share_supply(), so - 20_000 * BRL);
    // A fill never lowers NAV per share.
    assert!(conversion_nav(s.shares_outstanding, net_assets(&f)).unwrap() >= nav);

    let filled = events::<RedeemFilled>(&meta);
    assert_eq!(filled.len(), 1);
    assert_eq!(
        (
            filled[0].owner,
            filled[0].seq,
            filled[0].shares,
            filled[0].assets
        ),
        (a.pubkey(), seq, 20_000 * BRL, value)
    );
    assert_eq!(filled[0].nav, nav);
    let batch = events::<RedeemsFulfilled>(&meta);
    assert_eq!(batch.len(), 1);
    assert_eq!(
        (
            batch[0].from_seq,
            batch[0].to_seq,
            batch[0].shares,
            batch[0].assets
        ),
        (seq, seq, 20_000 * BRL, value)
    );
    assert_eq!(
        batch[0].idle_free_capital,
        solvency(&f.config(), &f.state()).free_capital
    );
    f.assert_capital_invariants("after fill");

    // claim_assets pays the owner and closes the request.
    let rent = lamports(&f, &redeem_pda(&f.pdas.config, seq));
    let sol = lamports(&f, &a.pubkey());
    let meta = f.claim_assets(a, seq).expect("claim_assets");
    assert_eq!(f.balance(&a.brs), value);
    assert!(f.redeem_request(seq).is_none());
    assert_eq!(lamports(&f, &a.pubkey()), sol + rent - 5_000);
    assert_eq!(f.state().claimable_assets_total, 0);
    let ev = events::<AssetsClaimed>(&meta);
    assert_eq!(
        (ev[0].owner, ev[0].seq, ev[0].assets),
        (a.pubkey(), seq, value)
    );
    f.assert_capital_invariants("after claim_assets");
}

#[test]
fn whole_fills_stop_at_a_head_that_does_not_fit() {
    let (mut f, list, inv) = queue_book();
    let (a, b, c) = (&inv[0], &inv[1], &inv[2]);
    let (_, sa) = f.request_redeem(a, &list, 25_000 * BRL);
    let (_, sb) = f.request_redeem(b, &list, 30_000 * BRL);
    let (_, sc) = f.request_redeem(c, &list, 2_000 * BRL);
    // A second guarantee leaves free capital 30,000.
    f.register(guarantee_args(unique_hash(), 30_000 * BRL, 0))
        .unwrap();
    assert_eq!(solvency(&f.config(), &f.state()).free_capital, 30_000 * BRL);

    let meta = f
        .fulfil_redeems(3, u64::MAX, &[sa, sb, sc])
        .expect("A only");
    assert_eq!(f.redeem_request(sa).unwrap().status, REDEEM_FILLED);
    // B does not fit the 5k left: the batch stops; B and C are untouched,
    // although C alone would fit.
    let rb = f.redeem_request(sb).unwrap();
    assert_eq!(
        (rb.status, rb.shares, rb.assets_out),
        (REDEEM_PENDING, 30_000 * BRL, 0)
    );
    let rc = f.redeem_request(sc).unwrap();
    assert_eq!((rc.status, rc.assets_out), (REDEEM_PENDING, 0));
    assert_eq!(f.state().redeem_head, sb);
    assert_eq!(events::<RedeemFilled>(&meta).len(), 1);
    let batch = &events::<RedeemsFulfilled>(&meta)[0];
    assert_eq!(batch.idle_free_capital, 5_000 * BRL);

    // A call that fills nothing fails.
    assert_mutav_err(
        f.fulfil_redeems(3, u64::MAX, &[sb, sc]),
        MutavError::InsufficientFreeCapital,
    );
    f.assert_capital_invariants("after a blocked head");
}

#[test]
fn a_head_worth_zero_assets_is_not_filled() {
    // A head whose shares are worth 0 at the NAV of the fill stops the batch
    // untouched (spec §3.8).
    let (mut f, list, inv) = queue_book();
    let (_, seq) = f.request_redeem(&inv[0], &list, 20_000 * BRL);
    // Net assets 0 with shares outstanding (provisions = stable assets).
    inject(&mut f, |s| s.provisions = s.brs_balance);
    assert_eq!(net_assets(&f), 0);
    let before = f.state();
    assert_mutav_err(
        f.fulfil_redeems(1, u64::MAX, &[seq]),
        MutavError::RequestTooSmall,
    );
    let r = f.redeem_request(seq).unwrap();
    assert_eq!(
        (r.status, r.shares, r.assets_out),
        (REDEEM_PENDING, 20_000 * BRL, 0)
    );
    let s = f.state();
    assert_eq!(
        (
            s.redeem_head,
            s.shares_outstanding,
            s.claimable_assets_total
        ),
        (before.redeem_head, before.shares_outstanding, 0)
    );
}

#[test]
fn max_assets_limits_the_batch_never_the_order() {
    let (mut f, list, inv) = queue_book();
    let (_, sa) = f.request_redeem(&inv[0], &list, 10_000 * BRL);
    let (_, sb) = f.request_redeem(&inv[1], &list, 5_000 * BRL);
    // 12k admits A (10k) but not B (5k more).
    f.fulfil_redeems(2, 12_000 * BRL, &[sa, sb]).unwrap();
    assert_eq!(f.redeem_request(sa).unwrap().status, REDEEM_FILLED);
    assert_eq!(f.redeem_request(sb).unwrap().status, REDEEM_PENDING);
    // 4k admits nothing: B is not skipped for a later, smaller request.
    let (_, sc) = f.request_redeem(&inv[2], &list, 1_000 * BRL);
    assert_mutav_err(
        f.fulfil_redeems(2, 4_000 * BRL, &[sb, sc]),
        MutavError::InsufficientFreeCapital,
    );
    // `count` limits the fills.
    f.fulfil_redeems(1, u64::MAX, &[sb, sc]).unwrap();
    assert_eq!(f.redeem_request(sc).unwrap().status, REDEEM_PENDING);
    f.fulfil_redeems(1, u64::MAX, &[sc]).unwrap();
    assert_eq!(f.redeem_request(sc).unwrap().status, REDEEM_FILLED);
    f.assert_capital_invariants("after max_assets");
}

#[test]
fn fulfil_redeems_queue_order() {
    let (mut f, list, inv) = queue_book();
    let (_, s0) = f.request_redeem(&inv[0], &list, 2_000 * BRL);
    let (_, s1) = f.request_redeem(&inv[1], &list, 2_000 * BRL);
    let (_, s2) = f.request_redeem(&inv[2], &list, 2_000 * BRL);
    // Out of order, starting past the head, or a foreign account.
    assert_mutav_err(
        f.fulfil_redeems(3, u64::MAX, &[s1, s0]),
        MutavError::QueueOrderViolation,
    );
    assert_mutav_err(
        f.fulfil_redeems(3, u64::MAX, &[s1]),
        MutavError::QueueOrderViolation,
    );
    let admin = f.admin.insecure_clone();
    let mut ix = f.fulfil_redeems_ix(&admin.pubkey(), 1, u64::MAX, &[s0]);
    let last = ix.accounts.len() - 1;
    ix.accounts[last].pubkey = deposit_pda(&f.pdas.config, s0);
    assert_mutav_err(f.send(ix, &admin), MutavError::QueueOrderViolation);
    // A cancelled (closed) seq is skipped by the inline skip proof.
    f.cancel_redeem(&inv[1], s1).unwrap();
    f.fulfil_redeems(3, u64::MAX, &[s0, s1, s2]).unwrap();
    assert_eq!(f.redeem_request(s2).unwrap().status, REDEEM_FILLED);
    assert_eq!(f.state().redeem_head, s2 + 1);
    // Nothing live left: an empty batch is not a success.
    assert_mutav_err(
        f.fulfil_redeems(1, u64::MAX, &[]),
        MutavError::QueueOrderViolation,
    );
    f.assert_capital_invariants("after skips");
}

#[test]
fn fulfil_redeems_gates() {
    let (mut f, list, inv) = queue_book();
    // MUTAV's capital wallet at the head changes nothing.
    let mutav = f.mutav_capital_wallet.insecure_clone();
    let m = f.investor_with(mutav, 10_000 * BRL);
    let mut wallets: Vec<Pubkey> = inv.iter().map(|i| i.pubkey()).collect();
    wallets.push(m.pubkey());
    let list2 = f.allowlist(&wallets);
    let _ = list;
    f.deposit(&m, &list2, 10_000 * BRL);
    let (_, seq) = f.request_redeem(&m, &list2, 5_000 * BRL);
    for s in [
        f.operator.insecure_clone(),
        f.pauser.insecure_clone(),
        Keypair::new(),
    ] {
        let ix = f.fulfil_redeems_ix(&s.pubkey(), 1, u64::MAX, &[seq]);
        assert_mutav_err(f.send(ix, &s), MutavError::Unauthorized);
    }
    inject(&mut f, |s| s.mode = MODE_UNDER_COVERED);
    assert_mutav_err(
        f.fulfil_redeems(1, u64::MAX, &[seq]),
        MutavError::UnderCovered,
    );
    inject(&mut f, |s| s.mode = MODE_NORMAL);
    inject(&mut f, |s| s.fulfil_halted = true);
    assert_mutav_err(
        f.fulfil_redeems(1, u64::MAX, &[seq]),
        MutavError::FulfilHalted,
    );
    inject(&mut f, |s| s.fulfil_halted = false);
    assert_mutav_err(
        f.fulfil_redeems(MAX_FULFIL_BATCH + 1, u64::MAX, &[seq]),
        MutavError::InvalidParameter,
    );
    assert_mutav_err(
        f.fulfil_redeems(0, u64::MAX, &[seq]),
        MutavError::InvalidParameter,
    );
    pause(&mut f);
    assert_mutav_err(f.fulfil_redeems(1, u64::MAX, &[seq]), MutavError::Paused);
    let admin = f.admin.insecure_clone();
    let ix = f.unpause_ix(&admin.pubkey());
    f.send(ix, &admin).unwrap();
    f.fulfil_redeems(1, u64::MAX, &[seq])
        .expect("all gates open");
    assert_eq!(f.redeem_request(seq).unwrap().owner, m.pubkey());
}

#[test]
fn claim_assets_rules() {
    let (mut f, list, inv) = queue_book();
    let (a, b) = (&inv[0], &inv[1]);
    let (_, seq) = f.request_redeem(a, &list, 2_000 * BRL);
    // Nothing claimable yet.
    assert_mutav_err(f.claim_assets(a, seq), MutavError::InvalidRequestStatus);
    f.fulfil_redeems(1, u64::MAX, &[seq]).unwrap();
    let ix = f.claim_assets_ix(&b.pubkey(), seq, &b.brs);
    assert_mutav_err(f.send_as(ix, &b.key), MutavError::Unauthorized);
    let ix = f.claim_assets_ix(&a.pubkey(), seq, &b.brs);
    assert_mutav_err(f.send_as(ix, &a.key), MutavError::Unauthorized);
    pause(&mut f);
    f.claim_assets(a, seq).expect("claim while paused");
    assert_eq!(f.balance(&a.brs), 2_000 * BRL);
}

// ===========================================================================
// advance_queue_heads
// ===========================================================================

#[test]
fn the_head_crank_clears_request_cancel_cycles() {
    let (mut f, list, inv) = queue_book();
    let (spam, live) = (&inv[0], &inv[1]);
    // N request/cancel cycles in front of a live request.
    let n = 20u64;
    for _ in 0..n {
        let (r, seq) = f.request_redeem(spam, &list, 1_000 * BRL);
        r.unwrap();
        f.cancel_redeem(spam, seq).unwrap();
    }
    let (_, live_seq) = f.request_redeem(live, &list, 3_000 * BRL);
    assert_eq!(live_seq, n);
    assert_eq!(f.state().redeem_head, 0);
    // Lamports sent to a closed seq do not stop the skip proof.
    let closed = redeem_pda(&f.pdas.config, 3);
    f.svm.airdrop(&closed, 1_000_000).unwrap();

    // Anyone cranks, in a few transactions, while paused.
    pause(&mut f);
    let stranger = Keypair::new();
    f.svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    let ix = f.advance_queue_head_ix(QUEUE_REDEEM, 10, &(0..10).collect::<Vec<_>>());
    let meta = send_ix(&mut f.svm, ix, &[&stranger]).expect("crank 1");
    assert_eq!(f.state().redeem_head, 10);
    let ev = events::<QueueHeadsAdvanced>(&meta);
    assert_eq!((ev[0].redeem_head, ev[0].deposit_head), (10, 3));
    // The crank stops at the live request: it is never skipped.
    let seqs: Vec<u64> = (10..=n).collect();
    f.advance_queue_heads(seqs.len() as u8, &seqs, &[]).unwrap();
    assert_eq!(f.state().redeem_head, live_seq);
    f.advance_queue_heads(1, &[live_seq], &[]).unwrap();
    assert_eq!(f.state().redeem_head, live_seq, "live request not skipped");

    // The admin's fill is one transaction with one request account.
    let admin = f.admin.insecure_clone();
    let ix = f.unpause_ix(&admin.pubkey());
    f.send(ix, &admin).unwrap();
    f.fulfil_redeems(1, u64::MAX, &[live_seq])
        .expect("one-account fill");
    assert_eq!(f.redeem_request(live_seq).unwrap().status, REDEEM_FILLED);
}

#[test]
fn the_head_crank_rules() {
    let (mut f, list, inv) = queue_book();
    let a = &inv[0];
    f.mint_brs(&a.brs, 10_000 * BRL);
    let d0 = f.state().deposit_head;
    // Unknown queues fail; zero is never a queue.
    for q in [0u8, 3, u8::MAX] {
        assert_mutav_err(
            f.advance_queue_head(q, 4, &[0]),
            MutavError::InvalidParameter,
        );
    }
    // Never past the tail: the next seq's PDA is empty but is not a dead
    // request, so it is not matched.
    f.advance_queue_head(QUEUE_REDEEM, 4, &[0]).unwrap();
    f.advance_queue_head(QUEUE_DEPOSIT, 4, &[d0]).unwrap();
    assert_eq!((f.state().redeem_head, f.state().deposit_head), (0, d0));
    // An account that is not the queue's next seq is ignored: the crank
    // moves no funds, so a wrong list only wastes the caller's fee. A
    // deposit PDA in the redeem queue's list is such an account.
    f.advance_queue_head(QUEUE_REDEEM, 4, &[5]).unwrap();
    let config = f.pdas.config;
    let mut ix = f.advance_queue_head_ix(QUEUE_REDEEM, 4, &[]);
    ix.accounts
        .push(anchor_lang::prelude::AccountMeta::new_readonly(
            deposit_pda(&config, 0),
            false,
        ));
    let payer = f.payer.insecure_clone();
    f.send(ix, &payer).unwrap();
    assert_eq!((f.state().redeem_head, f.state().deposit_head), (0, d0));
    // A filled-but-unclaimed redeem request (nothing remaining) is dead.
    let (_, s0) = f.request_redeem(a, &list, 2_000 * BRL);
    let (_, s1) = f.request_redeem(a, &list, 2_000 * BRL);
    f.fulfil_redeems(1, u64::MAX, &[s0]).unwrap();
    // Rewind the head as if an older binary had left it behind.
    inject(&mut f, |s| s.redeem_head = s0);
    // One queue per call; the other head never moves.
    let (_, d) = f.request_deposit(a, &list, 1_000 * BRL);
    f.cancel_deposit(a, d).unwrap();
    let meta = f
        .advance_queue_head(QUEUE_REDEEM, 8, &[s0, s1, s1 + 1])
        .unwrap();
    assert_eq!(f.state().redeem_head, s1, "stops at the live request");
    assert_eq!(f.state().deposit_head, d0, "the deposit head is untouched");
    let ev = events::<QueueHeadsAdvanced>(&meta);
    assert_eq!((ev[0].redeem_head, ev[0].deposit_head), (s1, d0));
    f.advance_queue_head(QUEUE_DEPOSIT, 8, &[d]).unwrap();
    assert_eq!(f.state().deposit_head, d + 1);
    assert_eq!(f.state().redeem_head, s1);
    // `max` bounds the accounts read.
    let (_, d2) = f.request_deposit(a, &list, 1_000 * BRL);
    f.cancel_deposit(a, d2).unwrap();
    f.advance_queue_head(QUEUE_DEPOSIT, 0, &[d2]).unwrap();
    assert_eq!(f.state().deposit_head, d2, "max = 0 reads nothing");
    f.advance_queue_head(QUEUE_DEPOSIT, 1, &[d2]).unwrap();
    assert_eq!(f.state().deposit_head, d2 + 1);
}

// ===========================================================================
// Version guard on requests (spec §14.2 R1b)
// ===========================================================================

#[test]
fn unknown_request_status_or_version_is_refused() {
    let (mut f, list, inv) = queue_book();
    let a = &inv[0];
    f.mint_brs(&a.brs, 10_000 * BRL);
    let (_, rs) = f.request_redeem(a, &list, 2_000 * BRL);
    let (_, ds) = f.request_deposit(a, &list, 1_000 * BRL);
    for (version, status) in [(PROGRAM_LAYOUT_VERSION + 1, REDEEM_PENDING), (1, 9)] {
        let mut r = f.redeem_request(rs).unwrap();
        let orig = r.clone();
        r.version = version;
        r.status = status;
        f.write_redeem_request(&r);
        assert_mutav_err(f.cancel_redeem(a, rs), MutavError::UnsupportedVersion);
        assert_mutav_err(f.claim_assets(a, rs), MutavError::UnsupportedVersion);
        assert_mutav_err(
            f.fulfil_redeems(1, u64::MAX, &[rs]),
            MutavError::UnsupportedVersion,
        );
        assert_mutav_err(
            f.advance_queue_heads(1, &[rs], &[]),
            MutavError::UnsupportedVersion,
        );
        f.write_redeem_request(&orig);

        let mut d = f.deposit_request(ds).unwrap();
        let orig = d.clone();
        d.version = version;
        d.status = status;
        f.write_deposit_request(&d);
        assert_mutav_err(f.cancel_deposit(a, ds), MutavError::UnsupportedVersion);
        assert_mutav_err(f.claim_shares(a, ds), MutavError::UnsupportedVersion);
        let head = f.state().deposit_head;
        assert_mutav_err(
            f.fulfil_deposits(1, &(head..=ds).collect::<Vec<_>>()),
            MutavError::UnsupportedVersion,
        );
        f.write_deposit_request(&orig);
    }
}

// ===========================================================================
// Invariants 4, 5, 8, 9, 10 over random sequences
// ===========================================================================

#[test]
fn queue_invariants_hold_over_random_sequences() {
    let (mut f, list, inv) = holders(4, 20_000 * BRL);
    f.register(guarantee_args(unique_hash(), 30_000 * BRL, 0))
        .unwrap();
    let mut x: u64 = 0x9e37_79b9;
    let mut rnd = |m: u64| {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        x % m
    };
    for step in 0..120 {
        let i = &inv[rnd(4) as usize];
        let s = f.state();
        match rnd(7) {
            0 => {
                let held = f.balance(&i.shares);
                let sh = (1_000 + rnd(4_000)) * BRL;
                if held >= sh {
                    let _ = f.request_redeem(i, &list, sh).0;
                }
            }
            1 => {
                let _ = f.request_deposit(i, &list, (1_000 + rnd(3_000)) * BRL).0;
            }
            2 => {
                let seqs: Vec<u64> = (s.redeem_head..s.next_redeem_seq).collect();
                let n = seqs.len().min(MAX_FULFIL_BATCH as usize);
                let max = if rnd(2) == 0 {
                    u64::MAX
                } else {
                    rnd(20_000) * BRL
                };
                let _ = f.fulfil_redeems(MAX_FULFIL_BATCH, max, &seqs[..n]);
            }
            3 => {
                let seqs: Vec<u64> = (s.deposit_head..s.next_deposit_seq).take(8).collect();
                let _ = f.fulfil_deposits(seqs.len().max(1) as u8, &seqs);
            }
            4 => {
                for seq in 0..s.next_redeem_seq {
                    if let Some(r) = f.redeem_request(seq) {
                        if r.owner == i.pubkey() {
                            if r.assets_out > 0 {
                                f.claim_assets(i, seq).unwrap();
                            } else if r.status == REDEEM_PENDING && rnd(3) == 0 {
                                f.cancel_redeem(i, seq).unwrap();
                            }
                        }
                    }
                }
            }
            5 => {
                for seq in 0..s.next_deposit_seq {
                    if let Some(r) = f.deposit_request(seq) {
                        if r.owner == i.pubkey() {
                            if r.status == DEPOSIT_FULFILLED {
                                f.claim_shares(i, seq).unwrap();
                            } else if rnd(3) == 0 {
                                f.cancel_deposit(i, seq).unwrap();
                            }
                        }
                    }
                }
            }
            _ => {
                let r: Vec<u64> = (s.redeem_head..s.next_redeem_seq).take(6).collect();
                let d: Vec<u64> = (s.deposit_head..s.next_deposit_seq).take(6).collect();
                f.advance_queue_heads(12, &r, &d).unwrap();
            }
        }
        f.assert_capital_invariants(&format!("step {step}"));
        // Invariant 10 with whole fills: every pending request is at or past
        // the head and has no fill.
        let s = f.state();
        for seq in 0..s.next_redeem_seq {
            if let Some(r) = f.redeem_request(seq) {
                if r.status == REDEEM_PENDING {
                    assert_eq!(r.assets_out, 0, "step {step}");
                    assert!(seq >= s.redeem_head, "step {step}: live seq behind head");
                }
            }
        }
    }
}
