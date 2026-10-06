//! Issuer freezes (spec §3.3, §5.4 `pay_claim` errors; plan Task 5, payout
//! cases): a frozen `reserve` makes `pay_claim` fail cleanly with
//! `ReserveFrozen`, changing nothing, and the retry succeeds after a thaw.
//! Escrow cases land with Task 6.

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
