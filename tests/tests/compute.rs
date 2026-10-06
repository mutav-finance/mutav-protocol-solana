//! Compute units measured in LiteSVM (not the plan's Mollusk benchmark,
//! which is skipped for the hackathon build; see `MAX_FULFIL_BATCH`).
//! A guard against regressions only: a Squads vault transaction adds its own
//! overhead on top of these figures.

use mutav::constants::MAX_FULFIL_BATCH;
use mutav_tests::helpers::*;
use solana_signer::Signer;

#[test]
fn a_full_fulfil_redeems_batch_fits_the_default_budget() {
    let mut f = Fixture::new();
    let n = MAX_FULFIL_BATCH as usize;
    let inv: Vec<Investor> = (0..n).map(|_| f.investor(5_000 * BRL)).collect();
    let keys: Vec<_> = inv.iter().map(|i| i.pubkey()).collect();
    let list = f.allowlist(&keys);
    for i in &inv {
        f.deposit(i, &list, 5_000 * BRL);
    }
    f.contribute(1_000 * BRL).0.unwrap();
    let seqs: Vec<u64> = inv
        .iter()
        .map(|i| f.request_redeem(i, &list, 2_000 * BRL).1)
        .collect();
    let admin = f.admin.insecure_clone();
    let ix = f.fulfil_redeems_ix(&admin.pubkey(), MAX_FULFIL_BATCH, u64::MAX, &seqs);
    let meta = f.send(ix, &admin).expect("full batch");
    let cu = meta.compute_units_consumed;
    println!("fulfil_redeems, {n} whole fills: {cu} CU");
    assert!(cu < 200_000, "{cu} CU");

    let meta = f.refresh().unwrap();
    println!("refresh: {} CU", meta.compute_units_consumed);
    let g = guarantee_args(unique_hash(), 10_000 * BRL, 0);
    f.register(g.clone()).unwrap();
    let c = Claim::on(&g, 1_000 * BRL);
    f.file_claim(c).unwrap();
    let meta = f.pay_claim(c).unwrap();
    println!("pay_claim: {} CU", meta.compute_units_consumed);
}
