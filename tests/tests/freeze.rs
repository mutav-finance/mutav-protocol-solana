//! Issuer freezes (spec §3.3, §5.4 `pay_claim` errors; plan Task 5, payout
//! cases): a frozen `reserve` makes `pay_claim` fail cleanly with
//! `ReserveFrozen`, changing nothing, and the retry succeeds after a thaw.
//! Escrow cases: plan Task 6.

use anchor_spl::token::spl_token::instruction::{freeze_account, thaw_account};
use mutav::errors::MutavError;
use mutav_tests::helpers::*;
use solana_signer::Signer;

fn set_frozen(f: &mut Fixture, account: &anchor_lang::prelude::Pubkey, frozen: bool) {
    let auth = f.freeze_authority.insecure_clone();
    let build = if frozen { freeze_account } else { thaw_account };
    let ix = build(
        &TOKEN_PROGRAM,
        account,
        &f.reserve_mint,
        &auth.pubkey(),
        &[],
    )
    .unwrap();
    f.send(ix, &auth).expect("freeze/thaw");
}

#[test]
fn frozen_reserve_fails_pay_claim_cleanly_and_retry_succeeds_after_thaw() {
    let mut f = Fixture::new();
    f.fund_reserve(10_000 * BRL);
    let g = guarantee_args(unique_hash(), 10_000 * BRL, 0);
    f.register(g.clone()).unwrap();
    let c = Claim::on(&g, 3_000 * BRL);
    f.file_claim(c).unwrap();

    let reserve = f.pdas.reserve;
    set_frozen(&mut f, &reserve, true);
    let state = f.raw(&f.pdas.state);
    let guarantee = f.raw(&guarantee_pda(&f.pdas.config, &g.id));
    assert_mutav_err(f.pay_claim(c), MutavError::ReserveFrozen);
    assert_eq!(f.raw(&f.pdas.state), state);
    assert_eq!(f.raw(&guarantee_pda(&f.pdas.config, &g.id)), guarantee);
    assert_eq!(f.claim_filing(&c).status, mutav::constants::CLAIM_FILED);
    let payout = payout_pda(&guarantee_pda(&f.pdas.config, &g.id), &c.notice);
    assert!(f.svm.get_account(&payout).is_none(), "no payout recorded");

    set_frozen(&mut f, &reserve, false);
    f.pay_claim(c).expect("retry after thaw");
    assert_eq!(f.balance(&f.config().payments_account), 3_000 * BRL);
}

// ---------------------------------------------------------------------------
// Escrow cases (plan Task 6)
// ---------------------------------------------------------------------------

fn holder_with_request() -> (Fixture, Investor, u64) {
    let mut f = Fixture::new();
    let a = f.investor(10_000 * BRL);
    let list = f.allowlist(&[a.pubkey()]);
    f.deposit(&a, &list, 10_000 * BRL);
    let (r, seq) = f.request_redeem(&a, &list, 4_000 * BRL);
    r.unwrap();
    (f, a, seq)
}

#[test]
fn frozen_investor_destination_keeps_the_assets_claimable() {
    let (mut f, a, seq) = holder_with_request();
    f.fulfil_redeems(1, u64::MAX, &[seq]).unwrap();
    let brs = a.brs;
    set_frozen(&mut f, &brs, true);
    let (state, req) = (f.raw(&f.pdas.state), f.redeem_request(seq).unwrap());
    assert!(f.claim_assets(&a, seq).is_err(), "frozen destination");
    assert_eq!(f.raw(&f.pdas.state), state);
    let after = f.redeem_request(seq).expect("still open");
    assert_eq!(after.assets_claimable, req.assets_claimable);
    assert_eq!(after.status, mutav::constants::REDEEM_FILLED);
    set_frozen(&mut f, &brs, false);
    f.claim_assets(&a, seq).expect("claim after thaw");
    assert_eq!(f.balance(&a.brs), 4_000 * BRL);
    assert!(f.redeem_request(seq).is_none());
    // TODO(plan: partial fills deferred, ADR 0010) — the same case for a
    // `Cancelled` request with `assets_claimable > 0` needs a partial fill.
}

#[test]
fn frozen_reserve_fails_fulfils_cleanly() {
    let (mut f, a, seq) = holder_with_request();
    let reserve = f.pdas.reserve;
    set_frozen(&mut f, &reserve, true);
    let state = f.raw(&f.pdas.state);
    assert_mutav_err(
        f.fulfil_redeems(1, u64::MAX, &[seq]),
        MutavError::ReserveFrozen,
    );
    assert_eq!(f.raw(&f.pdas.state), state);
    let list = f.allowlist(&[a.pubkey()]);
    f.mint_brs(&a.brs, 1_000 * BRL);
    let (r, d) = f.request_deposit(&a, &list, 1_000 * BRL);
    r.unwrap();
    assert_mutav_err(f.fulfil_deposits(1, &[d]), MutavError::ReserveFrozen);
    set_frozen(&mut f, &reserve, false);
    f.fulfil_redeems(1, u64::MAX, &[seq]).expect("after thaw");
    f.fulfil_deposits(1, &[d]).expect("after thaw");
}

#[test]
fn frozen_escrow_fails_cancel_deposit_cleanly() {
    let mut f = Fixture::new();
    let a = f.investor(10_000 * BRL);
    let list = f.allowlist(&[a.pubkey()]);
    let (r, d) = f.request_deposit(&a, &list, 2_000 * BRL);
    r.unwrap();
    let escrow = f.pdas.pending_deposits;
    set_frozen(&mut f, &escrow, true);
    assert!(f.cancel_deposit(&a, d).is_err());
    assert!(f.deposit_request(d).is_some(), "request kept");
    set_frozen(&mut f, &escrow, false);
    f.cancel_deposit(&a, d).expect("after thaw");
    assert_eq!(f.balance(&a.brs), 10_000 * BRL);
}
