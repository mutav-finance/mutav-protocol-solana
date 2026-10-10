//! MUTAV capital (spec §2.1, §5.6; ADRs 0008, 0009; plan Task 7): MUTAV's
//! capital wallet uses the same async flow as every investor; deposits are
//! the recapitalization path in under-coverage; pause stops capital flows and
//! new guarantees but never fees, claims, settlement, the crank, `cancel_*`
//! or `claim_*`.

use mutav::{constants::*, errors::MutavError, events::DepositsFulfilled};
use mutav_tests::helpers::*;
use solana_signer::Signer;

#[test]
fn mutav_capital_wallet_deposits_and_redeems_through_the_queue() {
    let mut f = Fixture::new();
    let key = f.mutav_capital_wallet.insecure_clone();
    let m = f.investor_with(key, 30_000 * BRL);
    let other = f.investor(20_000 * BRL);
    let list = f.allowlist(&[m.pubkey(), other.pubkey()]);
    assert_eq!(m.pubkey(), f.config().mutav_capital_wallet);

    // Same flow as anyone: request, admin fulfil at NAV, claim.
    let shares = f.deposit(&m, &list, 30_000 * BRL);
    assert_eq!(shares, 30_000 * BRL);
    f.deposit(&other, &list, 20_000 * BRL);
    // Fees raise NAV for every holder pro rata, MUTAV included; they never
    // mint shares.
    f.contribute(5_000 * BRL).0.unwrap(); // net 4,000
    assert_eq!(f.state().shares_outstanding, 50_000 * BRL);
    assert_eq!(f.balance(&m.shares), 30_000 * BRL);

    // MUTAV's redemption waits in FIFO order behind an earlier request.
    let (_, first) = f.request_redeem(&other, &list, 10_000 * BRL);
    let (_, mine) = f.request_redeem(&m, &list, 20_000 * BRL);
    assert!(first < mine);
    // Free capital 54,000 − 40,000 of cover = 14,000: the earlier request
    // (≈10,800) fills, MUTAV's (≈21,600) does not; it is never jumped.
    let g1 = guarantee_args(unique_hash(), 20_000 * BRL, 0);
    f.register(g1.clone()).unwrap();
    f.register(guarantee_args(unique_hash(), 20_000 * BRL, 0))
        .unwrap();
    f.fulfil_redeems(2, u64::MAX, &[first, mine]).unwrap();
    assert_eq!(f.redeem_request(first).unwrap().status, REDEEM_FILLED);
    assert_eq!(f.redeem_request(mine).unwrap().status, REDEEM_PENDING);
    assert_mutav_err(
        f.fulfil_redeems(1, u64::MAX, &[mine]),
        MutavError::InsufficientFreeCapital,
    );
    // Run-off frees capital; then MUTAV is filled at the NAV of its fill.
    f.close_guarantee(g1.id).unwrap();
    f.fulfil_redeems(1, u64::MAX, &[mine])
        .expect("filled after run-off");
    let r = f.redeem_request(mine).unwrap();
    assert_eq!(r.status, REDEEM_FILLED);
    f.claim_assets(&m, mine).unwrap();
    assert_eq!(f.balance(&m.brs), r.assets_out);
    assert!(r.assets_out > 20_000 * BRL, "priced at NAV > 1.0");
    f.assert_capital_invariants("mutav capital");
}

#[test]
fn fulfil_deposits_works_in_under_coverage() {
    let mut f = Fixture::new();
    let a = f.investor(30_000 * BRL);
    let m = {
        let k = f.mutav_capital_wallet.insecure_clone();
        f.investor_with(k, 30_000 * BRL)
    };
    let list = f.allowlist(&[a.pubkey(), m.pubkey()]);
    f.deposit(&a, &list, 30_000 * BRL);
    f.register(guarantee_args(unique_hash(), 30_000 * BRL, 0))
        .unwrap();
    // The admin raises `c` to 1.5: coverage 45,000 > 30,000 of stable assets.
    let mut args = set_config_args(&f.config());
    args.coverage_ratio_bps = 15_000;
    f.set_config(args).unwrap();
    // `refresh` (Task 10) would record the mode; the gates also check inline.
    let mut s = f.state();
    s.mode = MODE_UNDER_COVERED;
    f.write_state(&s);

    // Redemptions and new guarantees are frozen ...
    let (_, r) = f.request_redeem(&a, &list, 5_000 * BRL);
    assert_mutav_err(
        f.fulfil_redeems(1, u64::MAX, &[r]),
        MutavError::UnderCovered,
    );
    assert_mutav_err(
        f.register(guarantee_args(unique_hash(), 1_000 * BRL, 0)),
        MutavError::UnderCovered,
    );
    // ... while MUTAV recapitalizes through the deposit queue, at the NAV.
    let (res, d) = f.request_deposit(&m, &list, 20_000 * BRL);
    res.unwrap();
    let meta = f.fulfil_deposits(1, &[d]).expect("recapitalization");
    assert_eq!(events::<DepositsFulfilled>(&meta)[0].assets, 20_000 * BRL);
    let s = f.state();
    assert_eq!(s.brs_balance, 50_000 * BRL);
    assert!(s.brs_balance >= s.coverage_required, "covered again");
    f.claim_shares(&m, d).unwrap();
    assert_eq!(f.balance(&m.shares), 20_000 * BRL);
}

#[test]
fn pause_blocks_capital_flows_and_new_guarantees_only() {
    let mut f = Fixture::new();
    let a = f.investor(40_000 * BRL);
    let list = f.allowlist(&[a.pubkey()]);
    f.deposit(&a, &list, 30_000 * BRL);
    let g = guarantee_args(unique_hash(), 10_000 * BRL, 0);
    f.register(g.clone()).unwrap();
    let c1 = Claim::on(&g, 1_000 * BRL);
    f.file_claim(c1).unwrap();
    f.pay_claim(c1).unwrap();
    let (_, r_cancel) = f.request_redeem(&a, &list, 2_000 * BRL);
    let (_, r_fill) = f.request_redeem(&a, &list, 2_000 * BRL);
    f.cancel_redeem(&a, r_cancel).unwrap();
    f.fulfil_redeems(2, u64::MAX, &[r_cancel, r_fill]).unwrap();
    let (_, r_live) = f.request_redeem(&a, &list, 2_000 * BRL);
    let (_, d_cancel) = f.request_deposit(&a, &list, 1_000 * BRL);
    let (_, d_fill) = f.request_deposit(&a, &list, 1_000 * BRL);
    f.fulfil_deposits(1, &[d_cancel]).unwrap();

    let pauser = f.pauser.insecure_clone();
    let ix = f.pause_ix(&pauser.pubkey());
    f.send(ix, &pauser).unwrap();

    // Blocked: capital flows and new guarantees.
    assert_mutav_err(
        f.request_deposit(&a, &list, 1_000 * BRL).0,
        MutavError::Paused,
    );
    assert_mutav_err(
        f.request_redeem(&a, &list, 2_000 * BRL).0,
        MutavError::Paused,
    );
    assert_mutav_err(f.fulfil_deposits(1, &[d_fill]), MutavError::Paused);
    assert_mutav_err(f.fulfil_redeems(1, u64::MAX, &[r_live]), MutavError::Paused);
    assert_mutav_err(
        f.register(guarantee_args(unique_hash(), 1_000 * BRL, 0)),
        MutavError::Paused,
    );

    // Open: fees, claims, settlement, closing, `refresh`, the crank,
    // cancel_* and claim_*. (Claim notices are built later.)
    f.contribute(1_000 * BRL).0.expect("contribute_fees");
    let c2 = Claim::on(&g, 500 * BRL);
    f.file_claim(c2).expect("file_claim");
    f.pay_claim(c2).expect("pay_claim");
    f.settle_payout(c1, unique_hash()).expect("settle_payout");
    f.settle_payout(c2, unique_hash()).expect("settle_payout");
    f.close_guarantee(g.id).expect("close_guarantee");
    f.advance_queue_heads(4, &[r_cancel, r_fill, r_live], &[d_cancel, d_fill])
        .expect("advance_queue_heads");
    f.cancel_redeem(&a, r_live).expect("cancel_redeem");
    f.cancel_deposit(&a, d_fill).expect("cancel_deposit");
    f.claim_assets(&a, r_fill).expect("claim_assets");
    f.claim_shares(&a, d_cancel).expect("claim_shares");
    f.assert_capital_invariants("paused");
}
