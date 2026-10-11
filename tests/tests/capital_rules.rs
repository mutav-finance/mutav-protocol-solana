//! Capital rules of the claims-and-capital release (ADR 0022, ADR 0023):
//! the stress-buffer term of `coverage_required`, inflows refused at zero
//! supply, `ReserveUnderwater`, the fills' inline NAV-move guard and its
//! baseline, exit open to holders, the full exit below `min_request` and the
//! 0-asset fill of a head worth nothing.

use anchor_lang::prelude::Pubkey;
use anchor_spl::token::spl_token::instruction::transfer;
use mutav::{
    constants::*,
    errors::MutavError,
    events::{FulfilHaltRaised, RedeemFilled},
    math::assets_for,
    pricing::published_nav,
    solvency::{Solvency, SolvencyInputs},
    ConfigParam::*,
    RegisterGuaranteeArgs,
};
use mutav_tests::helpers::*;

const T0: i64 = 1_760_000_000;

/// A fresh reserve with `n` allowlisted investors holding `brs` BRS each.
fn setup(n: usize, brs: u64) -> (Fixture, Allowlist, Vec<Investor>) {
    let mut f = Fixture::new();
    set_time(&mut f.svm, T0);
    let invs: Vec<Investor> = (0..n).map(|_| f.investor(brs)).collect();
    let keys: Vec<Pubkey> = invs.iter().map(|i| i.pubkey()).collect();
    let list = f.allowlist(&keys);
    (f, list, invs)
}

/// `n` holders who deposited `each`.
fn holders(n: usize, each: u64) -> (Fixture, Allowlist, Vec<Investor>) {
    let (mut f, list, inv) = setup(n, each);
    for i in &inv {
        f.deposit(i, &list, each);
    }
    (f, list, inv)
}

fn solvency(f: &Fixture) -> Solvency {
    let (c, s) = (f.config(), f.state());
    Solvency::compute(&SolvencyInputs {
        brs_balance: s.brs_balance,
        remaining_cover_total: s.remaining_cover_total,
        coverage_ratio_bps: c.coverage_ratio_bps,
        provisions: s.provisions,
        stress_buffer: c.caps.stress_buffer,
    })
    .unwrap()
}

/// Moves `amount` shares from `from`'s share account to `to`, signed by the
/// owner of `from`.
fn send_shares(f: &mut Fixture, from: &Investor, to: &Pubkey, amount: u64) {
    let ix = transfer(
        &TOKEN_PROGRAM,
        &from.shares,
        to,
        &from.pubkey(),
        &[],
        amount,
    )
    .unwrap();
    f.send_as(ix, &from.key).expect("share transfer");
}

fn share_balance(f: &Fixture, account: &Pubkey) -> u64 {
    f.balance(account)
}

// ===========================================================================
// Stress buffer (ADR 0022)
// ===========================================================================

#[test]
fn the_registration_gate_counts_the_stress_buffer() {
    let mut f = Fixture::new();
    f.fund_reserve(18_000 * BRL);
    f.set_config(vec![CoverageRatioBps(1_000), StressBuffer(19_000 * BRL)])
        .unwrap();
    // c × 30,000 = 3,000, but the next claims need min(19,000, 30,000):
    // 19,000 > 18,000 of stable assets.
    let g = guarantee_args(unique_hash(), 30_000 * BRL, 0);
    assert_mutav_err(f.register(g), MutavError::InsufficientFreeCapital);

    f.set_config(vec![StressBuffer(15_000 * BRL)]).unwrap();
    f.register(guarantee_args(unique_hash(), 30_000 * BRL, 0))
        .expect("15,000 fits");
    assert_eq!(f.state().coverage_required, 15_000 * BRL);
}

#[test]
fn set_config_recomputes_coverage_with_the_stress_buffer() {
    let mut f = Fixture::new();
    f.fund_reserve(18_000 * BRL);
    f.set_config(vec![CoverageRatioBps(1_000)]).unwrap();
    f.register(guarantee_args(unique_hash(), 30_000 * BRL, 0))
        .unwrap();
    assert_eq!(f.state().coverage_required, 3_000 * BRL);

    f.set_config(vec![StressBuffer(19_000 * BRL)]).unwrap();
    assert_eq!(f.state().coverage_required, 19_000 * BRL, "cached at once");
    // The next `refresh` publishes the deficit; nothing else moved.
    f.refresh().unwrap();
    let s = f.state();
    assert_eq!(s.mode, MODE_UNDER_COVERED);
    assert_eq!(s.coverage_required, solvency(&f).coverage_required);

    f.set_config(vec![StressBuffer(0)]).unwrap();
    assert_eq!(f.state().coverage_required, 3_000 * BRL);
}

#[test]
fn the_stress_buffer_is_bounded_by_max_tvl() {
    let mut f = Fixture::new();
    let max_tvl = f.config().caps.max_tvl;
    assert_mutav_err(
        f.set_config(vec![StressBuffer(max_tvl + 1)]),
        MutavError::InvalidParameter,
    );
    f.set_config(vec![StressBuffer(max_tvl)])
        .expect("at the bound");
}

#[test]
fn file_claim_and_close_keep_the_stress_term_in_the_cache() {
    let mut f = Fixture::new();
    f.fund_reserve(30_000 * BRL);
    f.set_config(vec![CoverageRatioBps(1_000), StressBuffer(19_000 * BRL)])
        .unwrap();
    let g = guarantee_args(unique_hash(), 30_000 * BRL, 0);
    f.register(g.clone()).unwrap();
    assert_eq!(f.state().coverage_required, 19_000 * BRL);
    // 4,000 filed + min(19,000, 26,000 unprovisioned).
    let c = Claim::on(&g, 4_000 * BRL);
    f.file_claim(c).unwrap();
    assert_eq!(f.state().coverage_required, 23_000 * BRL);
    // Paid: 26,000 of cover left, nothing filed: the buffer alone.
    f.pay_claim(c).unwrap();
    assert_eq!(f.state().coverage_required, 19_000 * BRL);
    f.close_guarantee(g.id).unwrap();
    assert_eq!(
        f.state().coverage_required,
        0,
        "an empty book needs nothing"
    );
}

#[test]
fn a_claim_is_paid_when_the_stress_buffer_leaves_the_reserve_under_covered() {
    let mut f = Fixture::new();
    f.fund_reserve(20_000 * BRL);
    f.set_config(vec![CoverageRatioBps(1_000)]).unwrap();
    let g = guarantee_args(unique_hash(), 30_000 * BRL, 0);
    f.register(g.clone()).unwrap();
    let c = Claim::on(&g, 5_000 * BRL);
    f.file_claim(c).unwrap();
    f.set_config(vec![StressBuffer(25_000 * BRL)]).unwrap();
    f.refresh().unwrap();
    assert_eq!(f.state().mode, MODE_UNDER_COVERED);
    f.pay_claim(c)
        .expect("the stress term never gates a claim payment");
    assert_eq!(f.state().provisions, 0);
}

// ===========================================================================
// Inflows at zero supply (ADR 0023, F2)
// ===========================================================================

#[test]
fn inflows_are_refused_until_the_first_shares() {
    let (mut f, list, inv) = setup(1, 10_000 * BRL);
    assert_mutav_err(f.contribute(1_000 * BRL).0, MutavError::NoSharesOutstanding);
    f.pay_income(500 * BRL);
    let inbox = f.income_inbox();
    assert_mutav_err(f.sweep(500 * BRL).0, MutavError::NoSharesOutstanding);
    assert_eq!(f.balance(&inbox), 500 * BRL, "income waits in the inbox");
    assert_eq!(f.state().brs_balance, 0);

    f.deposit(&inv[0], &list, 10_000 * BRL);
    f.contribute(1_000 * BRL)
        .0
        .expect("fees after the first fill");
    f.sweep(500 * BRL).0.expect("income after the first fill");
}

// ===========================================================================
// Underwater reserve (ADR 0022)
// ===========================================================================

#[test]
fn fills_refuse_an_underwater_reserve() {
    let (mut f, list, inv) = holders(2, 10_000 * BRL);
    let newcomer = f.investor(5_000 * BRL);
    let list = {
        let mut keys: Vec<Pubkey> = inv.iter().map(|i| i.pubkey()).collect();
        keys.push(newcomer.pubkey());
        let _ = list;
        f.allowlist(&keys)
    };
    let (r, dseq) = f.request_deposit(&newcomer, &list, 5_000 * BRL);
    r.unwrap();
    let (r, rseq) = f.request_redeem(&inv[0], &list, 5_000 * BRL);
    r.unwrap();
    // Net assets 0 with shares outstanding: provisions take every BRS.
    let mut s = f.state();
    s.provisions = s.brs_balance;
    s.remaining_cover_total = s.brs_balance;
    f.write_state(&s);
    assert_eq!(solvency(&f).net_assets, 0);
    assert!(!solvency(&f).under_covered());

    assert_mutav_err(f.fulfil_deposits(1, &[dseq]), MutavError::ReserveUnderwater);
    assert_mutav_err(
        f.fulfil_redeems(1, u64::MAX, &[rseq]),
        MutavError::ReserveUnderwater,
    );
    let r = f.redeem_request(rseq).unwrap();
    assert_eq!(r.status, REDEEM_PENDING, "no shares burned for nothing");
}

#[test]
fn a_first_deposit_into_an_empty_reserve_is_not_underwater() {
    // Zero shares and zero net assets is an empty reserve, not an
    // underwater one.
    let (mut f, list, inv) = setup(1, 10_000 * BRL);
    f.deposit(&inv[0], &list, 10_000 * BRL);
    assert_eq!(f.state().shares_outstanding, 10_000 * BRL);
}

// ===========================================================================
// Inline NAV-move guard and its baseline (ADR 0023, F4)
// ===========================================================================

#[test]
fn the_first_deposit_seeds_the_guard_and_the_last_redemption_clears_it() {
    let (mut f, list, inv) = setup(1, 10_000 * BRL);
    assert_eq!(f.state().nav_per_share, 0);
    f.deposit(&inv[0], &list, 10_000 * BRL);
    let s = f.state();
    assert_eq!(
        s.nav_per_share,
        published_nav(10_000 * BRL, 10_000 * BRL).unwrap()
    );
    assert_eq!((s.nav_per_share, s.inflow_nav), (NAV_SCALE, 0));

    let (r, seq) = f.request_redeem(&inv[0], &list, 10_000 * BRL);
    r.unwrap();
    f.fulfil_redeems(1, u64::MAX, &[seq]).unwrap();
    let s = f.state();
    assert_eq!(s.shares_outstanding, 0);
    assert_eq!((s.nav_per_share, s.inflow_nav), (0, 0));
}

/// Holders of 90,000 at NAV 1.0, a 30,000 guarantee and the guard at 1%.
fn guarded_book() -> (Fixture, Allowlist, Vec<Investor>, RegisterGuaranteeArgs) {
    let (mut f, list, inv) = holders(3, 30_000 * BRL);
    let g = guarantee_args(unique_hash(), 30_000 * BRL, 0);
    f.register(g.clone()).unwrap();
    assert_eq!(f.config().caps.max_nav_move_bps, 100);
    (f, list, inv, g)
}

#[test]
fn fills_refuse_a_nav_move_the_guard_would_halt_before_any_refresh() {
    let (mut f, list, inv, g) = guarded_book();
    let (r, rseq) = f.request_redeem(&inv[0], &list, 1_000 * BRL);
    r.unwrap();
    let newcomer = f.investor(5_000 * BRL);
    let keys: Vec<Pubkey> = inv
        .iter()
        .map(|i| i.pubkey())
        .chain([newcomer.pubkey()])
        .collect();
    let list = f.allowlist(&keys);
    let (r, dseq) = f.request_deposit(&newcomer, &list, 5_000 * BRL);
    r.unwrap();

    // A filed claim lowers NAV by 11%: no `refresh` has measured it yet.
    f.file_claim(Claim::on(&g, 10_000 * BRL)).unwrap();
    assert!(!f.state().fulfil_halted);
    assert_mutav_err(f.fulfil_deposits(1, &[dseq]), MutavError::FulfilHalted);
    assert_mutav_err(
        f.fulfil_redeems(1, u64::MAX, &[rseq]),
        MutavError::FulfilHalted,
    );
    // The refusal changes nothing; the next `refresh` raises the halt.
    assert!(!f.state().fulfil_halted);
    let meta = f.refresh().unwrap();
    let raised = events::<FulfilHaltRaised>(&meta);
    assert_eq!(raised.len(), 1);
    assert_eq!(raised[0].source, HALT_SOURCE_REFRESH);
    assert!(f.state().fulfil_halted);
}

#[test]
fn verified_inflows_do_not_trip_the_inline_guard() {
    let (mut f, list, inv, _) = guarded_book();
    let (r, rseq) = f.request_redeem(&inv[0], &list, 1_000 * BRL);
    r.unwrap();
    // A guarantee fee raises NAV by ~4%, booked by the instruction that moved
    // it (ADR 0017): the fill still runs.
    f.contribute(5_000 * BRL).0.unwrap();
    f.fulfil_redeems(1, u64::MAX, &[rseq])
        .expect("fees never trip the guard");
}

#[test]
fn a_move_within_the_bound_fills() {
    let (mut f, list, inv, g) = guarded_book();
    let (r, rseq) = f.request_redeem(&inv[0], &list, 1_000 * BRL);
    r.unwrap();
    // 900 of 90,000 is exactly 1%: not strictly beyond the bound.
    f.file_claim(Claim::on(&g, 900 * BRL)).unwrap();
    f.fulfil_redeems(1, u64::MAX, &[rseq])
        .expect("a 1% move is within a 1% bound");
}

// ===========================================================================
// Exit rights (ADR 0023, AV-6, Q-1, NEW-B)
// ===========================================================================

#[test]
fn a_delisted_holder_can_still_exit() {
    let (mut f, list, inv) = holders(2, 10_000 * BRL);
    // inv[0] leaves the allowlist.
    let _ = f.allowlist(&[inv[1].pubkey()]);
    let a = &inv[0];
    assert_mutav_err(
        f.request_deposit(a, &list, 1_000 * BRL).0,
        MutavError::NotAllowlisted,
    );
    let ix = f.request_redeem_ix(&a.pubkey(), &a.shares, 5_000 * BRL, vec![]);
    f.send_as(ix, &a.key).expect("exit is open to holders");
    // A wallet with no shares still needs a proof.
    let outsider = f.investor(0);
    let ix = f.request_redeem_ix(&outsider.pubkey(), &outsider.shares, 1, vec![]);
    assert_mutav_err(f.send_as(ix, &outsider.key), MutavError::NotAllowlisted);
}

#[test]
fn a_full_exit_from_the_canonical_account_skips_min_request() {
    let (mut f, list, inv) = holders(2, 10_000 * BRL);
    let (a, b) = (&inv[0], &inv[1]);
    // `a` keeps 500 BRL of shares, below the 1,000 minimum.
    send_shares(&mut f, a, &b.shares, 9_500 * BRL);
    let left = share_balance(&f, &a.shares);
    assert_eq!(left, 500 * BRL);
    // A partial exit below the minimum is refused.
    assert_mutav_err(
        f.request_redeem(a, &list, left / 2).0,
        MutavError::RequestTooSmall,
    );
    // The whole balance of the canonical account is a full exit.
    let (r, seq) = f.request_redeem(a, &list, left);
    r.expect("full exit below min_request");
    assert_eq!(f.redeem_request(seq).unwrap().shares, left);
    f.fulfil_redeems(1, u64::MAX, &[seq]).unwrap();
    assert_eq!(f.redeem_request(seq).unwrap().assets_out, 500 * BRL);
}

#[test]
fn a_full_exit_from_another_share_account_keeps_min_request() {
    let (mut f, list, inv) = holders(1, 10_000 * BRL);
    let a = &inv[0];
    // A second, non-associated share account of the same owner.
    let payer = f.payer.insecure_clone();
    let share_mint = f.pdas.share_mint;
    let side = create_token_account(&mut f.svm, &payer, &share_mint, &a.pubkey(), &TOKEN_PROGRAM);
    send_shares(&mut f, a, &side, 500 * BRL);
    let ix = f.request_redeem_ix(&a.pubkey(), &side, 500 * BRL, list.proof(&a.pubkey()));
    assert_mutav_err(f.send_as(ix, &a.key), MutavError::RequestTooSmall);
}

/// A holder with a dust balance worth 1 base unit, requested as a full exit,
/// then NAV falls below 1.0 so the head is worth 0 at fill time. The guard
/// is opened wide (the devnet value) so the fall itself does not halt.
fn zero_value_head(min_assets_out: u64) -> (Fixture, Investor, u64) {
    let (mut f, _list, inv) = holders(2, 30_000 * BRL);
    f.set_config(vec![MaxNavMoveBps(10_000)]).unwrap();
    let (a, b) = (&inv[0], &inv[1]);
    send_shares(&mut f, a, &b.shares, 30_000 * BRL - 1);
    let ix = f.request_redeem_limit_ix(&a.pubkey(), &a.shares, 1, min_assets_out, vec![]);
    let seq = f.state().next_redeem_seq;
    f.send_as(ix, &a.key).expect("dust full exit");
    let g = guarantee_args(unique_hash(), 30_000 * BRL, 0);
    f.register(g.clone()).unwrap();
    f.file_claim(Claim::on(&g, 10_000 * BRL)).unwrap();
    let (so, na) = (f.state().shares_outstanding, solvency(&f).net_assets);
    assert_eq!(assets_for(1, so, na).unwrap(), 0, "worth 0 at fill time");
    let a = Investor {
        key: a.key.insecure_clone(),
        brs: a.brs,
        shares: a.shares,
    };
    (f, a, seq)
}

#[test]
fn a_head_worth_zero_fills_as_zero_assets_and_the_queue_moves() {
    let (mut f, a, seq) = zero_value_head(0);
    let before = f.state();
    let meta = f.fulfil_redeems(1, u64::MAX, &[seq]).expect("0-asset fill");
    let r = f.redeem_request(seq).unwrap();
    assert_eq!(
        (r.status, r.shares_filled, r.assets_out),
        (REDEEM_FILLED, 1, 0)
    );
    let s = f.state();
    assert_eq!(s.redeem_head, seq + 1);
    assert_eq!(s.shares_outstanding, before.shares_outstanding - 1);
    assert_eq!(s.brs_balance, before.brs_balance);
    let filled = events::<RedeemFilled>(&meta);
    assert_eq!((filled[0].shares, filled[0].assets), (1, 0));
    // The owner closes it; nothing moves.
    let brs = f.balance(&a.brs);
    f.claim_assets(&a, seq).expect("claim 0 assets");
    assert_eq!(f.balance(&a.brs), brs);
    assert!(f.redeem_request(seq).is_none());
}

#[test]
fn a_price_limit_still_protects_a_head_worth_zero() {
    let (mut f, _, seq) = zero_value_head(1);
    assert_mutav_err(
        f.fulfil_redeems(1, u64::MAX, &[seq]),
        MutavError::PriceLimitNotMet,
    );
    assert_eq!(f.redeem_request(seq).unwrap().status, REDEEM_PENDING);
}

#[test]
fn a_full_exit_worth_nothing_at_request_is_refused() {
    let (mut f, list, inv) = holders(2, 30_000 * BRL);
    f.set_config(vec![MaxNavMoveBps(10_000)]).unwrap();
    let (a, b) = (&inv[0], &inv[1]);
    send_shares(&mut f, a, &b.shares, 30_000 * BRL - 1);
    let g = guarantee_args(unique_hash(), 30_000 * BRL, 0);
    f.register(g.clone()).unwrap();
    f.file_claim(Claim::on(&g, 10_000 * BRL)).unwrap();
    assert_mutav_err(f.request_redeem(a, &list, 1).0, MutavError::RequestTooSmall);
}
