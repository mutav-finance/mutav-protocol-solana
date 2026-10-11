//! The admin's cancel parks a request (ADR 0030; spec §5.5). A holder who
//! sets a price limit no fill can meet and then makes its own refund fail
//! (reassigning its associated token account with `SetAuthority`, closing
//! it, or requiring transfer memos on it) cannot wedge a queue: the admin
//! parks the head without touching the owner's accounts, the head moves,
//! later requests fill, and only the owner can collect the parked funds,
//! once its account accepts them.

use anchor_lang::prelude::Pubkey;
use anchor_spl::{
    token::spl_token::{
        self,
        instruction::{set_authority, AuthorityType},
    },
    token_2022::spl_token_2022::{
        self as t22,
        extension::{memo_transfer::instruction as memo, ExtensionType},
    },
};
use mutav::{
    constants::*,
    errors::MutavError,
    events::{DepositParked, RedeemFilled, RedeemParked},
};
use mutav_tests::helpers::{mints::*, *};
use solana_keypair::Keypair;
use solana_signer::Signer;

fn setup_with(f: Fixture, n: usize, brs: u64) -> (Fixture, Allowlist, Vec<Investor>) {
    let mut f = f;
    let invs: Vec<Investor> = (0..n).map(|_| f.investor(brs)).collect();
    let keys: Vec<Pubkey> = invs.iter().map(|i| i.pubkey()).collect();
    let list = f.allowlist(&keys);
    (f, list, invs)
}

/// Investors 0..n each deposit `each`, so every one holds shares at NAV 1.0.
fn holders(n: usize, each: u64) -> (Fixture, Allowlist, Vec<Investor>) {
    let (mut f, list, inv) = setup_with(Fixture::new(), n, each);
    for i in &inv {
        f.deposit(i, &list, each);
    }
    (f, list, inv)
}

/// `account` (a classic SPL token account of `owner`) now belongs to `to`.
fn reassign(f: &mut Fixture, account: &Pubkey, owner: &Keypair, to: &Pubkey) {
    let ix = set_authority(
        &spl_token::ID,
        account,
        Some(to),
        AuthorityType::AccountOwner,
        &owner.pubkey(),
        &[],
    )
    .unwrap();
    send_ix(&mut f.svm, ix, &[owner]).expect("SetAuthority(AccountOwner)");
}

fn token_owner(f: &Fixture, account: &Pubkey) -> Pubkey {
    let data = f.svm.get_account(account).expect("token account").data;
    Pubkey::try_from(&data[32..64]).unwrap()
}

#[test]
fn a_reassigned_share_account_cannot_wedge_the_redeem_queue() {
    let (mut f, list, inv) = holders(2, 10_000 * BRL);
    let (a, b) = (&inv[0], &inv[1]);
    let x = Keypair::new();
    f.svm.airdrop(&x.pubkey(), 1_000_000_000).unwrap();

    // The head: a limit no fill can meet, then the owner's canonical share
    // account handed to another key.
    let seq = f.state().next_redeem_seq;
    let ix = f.request_redeem_limit_ix(
        &a.pubkey(),
        &a.shares,
        3_000 * BRL,
        u64::MAX,
        list.proof(&a.pubkey()),
    );
    f.send_as(ix, &a.key).unwrap();
    reassign(&mut f, &a.shares, &a.key, &x.pubkey());
    let (r, seq_b) = f.request_redeem(b, &list, 2_000 * BRL);
    r.unwrap();
    assert_mutav_err(
        f.fulfil_redeems(2, u64::MAX, &[seq, seq_b]),
        MutavError::PriceLimitNotMet,
    );
    // A refund into the reassigned account fails (the associated token
    // program refuses an account with another owner).
    assert!(f.cancel_redeem(a, seq).is_err(), "owner's refund fails");

    // The admin parks the head without touching the owner's account.
    let admin = f.admin.pubkey();
    let meta = f.admin_cancel_redeem(a, seq).expect("admin parks");
    assert_eq!(events::<RedeemParked>(&meta)[0].by, admin);
    assert_eq!(f.redeem_request(seq).unwrap().status, REDEEM_CANCELLED);
    f.assert_capital_invariants("parked");

    // The head moves, and the next request fills and is claimed.
    f.advance_queue_head(QUEUE_REDEEM, 2, &[seq, seq_b])
        .unwrap();
    assert_eq!(f.state().redeem_head, seq_b);
    f.fulfil_redeems(1, u64::MAX, &[seq_b])
        .expect("the next request fills");
    f.claim_assets(b, seq_b).expect("claim");
    assert_eq!(f.state().redeem_head, seq_b + 1);
    // The parked shares are no fill: still escrowed, never claimable.
    assert_mutav_err(f.claim_assets(a, seq), MutavError::InvalidRequestStatus);
    assert_eq!(f.state().pending_redeem_shares, 3_000 * BRL);
    f.assert_capital_invariants("after the fill");

    // Still reassigned: the owner's collect fails and nothing changes.
    assert!(f.cancel_redeem(a, seq).is_err());
    // Handed back: the owner collects the shares and the rent.
    reassign(&mut f, &a.shares, &x, &a.pubkey());
    f.cancel_redeem(a, seq).expect("the owner collects");
    assert!(f.redeem_request(seq).is_none());
    assert_eq!(f.balance(&a.shares), 10_000 * BRL);
    assert_eq!(f.state().pending_redeem_shares, 0);
    f.assert_capital_invariants("collected");
}

#[test]
fn a_reassigned_brs_account_cannot_wedge_the_deposit_queue() {
    let (mut f, list, inv) = setup_with(Fixture::new(), 2, 10_000 * BRL);
    let (a, b) = (&inv[0], &inv[1]);
    let x = Keypair::new();
    f.svm.airdrop(&x.pubkey(), 1_000_000_000).unwrap();

    // The head escrows the owner's whole balance with an unmeetable limit,
    // then the empty BRS account is handed to another key.
    let seq = f.state().next_deposit_seq;
    let ix = f.request_deposit_limit_ix(
        &a.pubkey(),
        &a.brs,
        10_000 * BRL,
        u64::MAX,
        list.proof(&a.pubkey()),
    );
    f.send_as(ix, &a.key).unwrap();
    reassign(&mut f, &a.brs, &a.key, &x.pubkey());
    let (r, seq_b) = f.request_deposit(b, &list, 4_000 * BRL);
    r.unwrap();
    assert_mutav_err(
        f.fulfil_deposits(2, &[seq, seq_b]),
        MutavError::PriceLimitNotMet,
    );
    assert!(f.cancel_deposit(a, seq).is_err(), "owner's refund fails");

    let meta = f.admin_cancel_deposit(a, seq).expect("admin parks");
    let ev = events::<DepositParked>(&meta);
    assert_eq!((ev[0].seq, ev[0].assets), (seq, 10_000 * BRL));
    assert_eq!(f.deposit_request(seq).unwrap().status, DEPOSIT_CANCELLED);
    assert_eq!(token_owner(&f, &a.brs), x.pubkey(), "untouched");

    // The fill skips the parked request and fills the next one.
    f.fulfil_deposits(2, &[seq, seq_b])
        .expect("past the parked head");
    assert_eq!(f.deposit_request(seq_b).unwrap().status, DEPOSIT_FULFILLED);
    assert_eq!(f.state().deposit_head, seq_b + 1);
    assert_mutav_err(f.claim_shares(a, seq), MutavError::InvalidRequestStatus);
    let s = f.state();
    assert_eq!(s.pending_deposits_total, 10_000 * BRL, "still owed");
    assert_eq!(
        s.brs_balance,
        4_000 * BRL,
        "parked BRS is not in the reserve"
    );
    f.assert_capital_invariants("after the fill");

    // The other key closes the account: the owner's collect recreates its
    // canonical account and refunds into it.
    let close = spl_token::instruction::close_account(
        &spl_token::ID,
        &a.brs,
        &x.pubkey(),
        &x.pubkey(),
        &[],
    )
    .unwrap();
    send_ix(&mut f.svm, close, &[&x]).unwrap();
    f.cancel_deposit(a, seq).expect("the owner collects");
    assert_eq!(token_owner(&f, &a.brs), a.pubkey());
    assert_eq!(f.balance(&a.brs), 10_000 * BRL);
    assert!(f.deposit_request(seq).is_none());
    assert_eq!(f.state().pending_deposits_total, 0);
    f.assert_capital_invariants("collected");
}

#[test]
fn only_the_owner_collects_a_parked_request() {
    let (mut f, list, inv) = holders(2, 10_000 * BRL);
    let (a, b) = (&inv[0], &inv[1]);
    f.mint_brs(&a.brs, 1_000 * BRL);
    let (r, dseq) = f.request_deposit(a, &list, 1_000 * BRL);
    r.unwrap();
    let (r, rseq) = f.request_redeem(a, &list, 1_000 * BRL);
    r.unwrap();
    f.admin_cancel_deposit(a, dseq).unwrap();
    f.admin_cancel_redeem(a, rseq).unwrap();
    // Another investor, the operator or the pauser cannot touch it.
    for k in [
        b.key.insecure_clone(),
        f.operator.insecure_clone(),
        f.pauser.insecure_clone(),
    ] {
        let ix = f.cancel_deposit_ix(&k.pubkey(), &a.pubkey(), dseq, &a.brs);
        assert_mutav_err(f.send(ix, &k), MutavError::Unauthorized);
        let ix = f.cancel_redeem_ix(&k.pubkey(), &a.pubkey(), rseq, &a.shares);
        assert_mutav_err(f.send(ix, &k), MutavError::Unauthorized);
    }
    // The refund goes only to the owner's associated token account.
    let other = f.token_account(&a.pubkey());
    let ix = f.cancel_deposit_ix(&a.pubkey(), &a.pubkey(), dseq, &other);
    assert_mutav_err(f.send_as(ix, &a.key), MutavError::Unauthorized);
    // Alone at the head, a parked request fills nothing.
    assert_mutav_err(
        f.fulfil_redeems(1, u64::MAX, &[rseq]),
        MutavError::QueueOrderViolation,
    );
    // A fill passing from the head skips the parked request: it fills the
    // next one, burns none of the parked shares and moves the head past
    // both.
    let (r, bseq) = f.request_redeem(b, &list, 2_000 * BRL);
    r.unwrap();
    assert_eq!(f.state().redeem_head, rseq);
    let meta = f
        .fulfil_redeems(2, u64::MAX, &[rseq, bseq])
        .expect("fills past the parked head");
    let fills = events::<RedeemFilled>(&meta);
    assert_eq!(fills.len(), 1);
    assert_eq!((fills[0].seq, fills[0].owner), (bseq, b.pubkey()));
    assert_eq!(f.redeem_request(rseq).unwrap().status, REDEEM_CANCELLED);
    assert_eq!(f.redeem_request(bseq).unwrap().status, REDEEM_FILLED);
    assert_eq!(f.state().redeem_head, bseq + 1);
    assert_eq!(
        f.state().pending_redeem_shares,
        1_000 * BRL,
        "parked shares stay"
    );
    f.cancel_deposit(a, dseq).expect("owner collects BRS");
    f.cancel_redeem(a, rseq).expect("owner collects shares");
    assert_eq!(f.balance(&a.brs), 1_000 * BRL);
    assert_eq!(f.balance(&a.shares), 10_000 * BRL);
    f.assert_capital_invariants("collected");
}

/// A Token-2022 reserve: an investor whose BRS account requires transfer
/// memos cannot receive a refund (the program sends no memo). Parking needs
/// no transfer, so the same rule unwedges the deposit queue.
#[test]
fn a_memo_required_brs_account_cannot_wedge_the_deposit_queue() {
    let (mut svm, payer) = setup();
    let freeze = Keypair::new();
    let mint = create_token2022_mint(&mut svm, &payer, &freeze.pubkey(), &[]);
    let mut f = Fixture::with_mint(svm, payer, freeze, mint, TOKEN_2022_PROGRAM);
    f.initialize(f.init_args()).expect("initialize");
    let (mut f, list, inv) = setup_with(f, 2, 0);
    let (a, b) = (&inv[0], &inv[1]);
    let payer = f.payer.insecure_clone();
    for to in [a.brs, b.brs] {
        let ix = t22::instruction::mint_to(
            &TOKEN_2022_PROGRAM,
            &f.reserve_mint,
            &to,
            &payer.pubkey(),
            &[],
            10_000 * BRL,
        )
        .unwrap();
        send_ix(&mut f.svm, ix, &[&payer]).expect("mint Token-2022 BRS");
    }

    let realloc = t22::instruction::reallocate(
        &TOKEN_2022_PROGRAM,
        &a.brs,
        &a.pubkey(),
        &a.pubkey(),
        &[],
        &[ExtensionType::MemoTransfer],
    )
    .unwrap();
    let require_memos =
        memo::enable_required_transfer_memos(&TOKEN_2022_PROGRAM, &a.brs, &a.pubkey(), &[])
            .unwrap();
    send_ixs(&mut f.svm, &[realloc, require_memos], &[&a.key]).expect("require memos");

    let seq = f.state().next_deposit_seq;
    let ix = f.request_deposit_limit_ix(
        &a.pubkey(),
        &a.brs,
        5_000 * BRL,
        u64::MAX,
        list.proof(&a.pubkey()),
    );
    f.send_as(ix, &a.key).unwrap();
    let (r, seq_b) = f.request_deposit(b, &list, 4_000 * BRL);
    r.unwrap();
    assert_mutav_err(
        f.fulfil_deposits(2, &[seq, seq_b]),
        MutavError::PriceLimitNotMet,
    );
    assert!(f.cancel_deposit(a, seq).is_err(), "no memo: refund fails");

    f.admin_cancel_deposit(a, seq).expect("admin parks");
    f.fulfil_deposits(2, &[seq, seq_b])
        .expect("past the parked head");
    assert_eq!(f.deposit_request(seq_b).unwrap().status, DEPOSIT_FULFILLED);
    f.assert_capital_invariants("after the fill");

    let off = memo::disable_required_transfer_memos(&TOKEN_2022_PROGRAM, &a.brs, &a.pubkey(), &[])
        .unwrap();
    send_ix(&mut f.svm, off, &[&a.key]).unwrap();
    f.cancel_deposit(a, seq).expect("the owner collects");
    assert_eq!(f.balance(&a.brs), 10_000 * BRL);
    f.assert_capital_invariants("collected");
}
