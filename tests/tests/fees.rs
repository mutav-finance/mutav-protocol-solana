//! `contribute_fees` (spec §2.1, §3.11, §5.3; ADRs 0007, 0009; plan Task 4):
//! the take-rate split, the whitelisted treasury, per-invoice idempotency,
//! and that fees never mint shares and are never gated.

use anchor_lang::prelude::Pubkey;
use mutav::{constants::*, errors::MutavError, events::FeesContributed};
use mutav_tests::helpers::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

fn set_take(f: &mut Fixture, bps: u16) {
    let mut args = set_config_args(&f.config());
    args.fee_take_bps = bps;
    f.set_config(args).unwrap();
}

#[test]
fn contribute_splits_take_to_treasury_and_net_to_reserve() {
    // Test config: fee_take_bps = 2_000 (20%).
    let mut f = Fixture::new();
    set_time(&mut f.svm, 1_750_000_000);
    let source = f.operator_brs(10_000 * BRL);
    let treasury = f.config().treasury_account;
    let invoice = unique_hash();
    let ix = f.contribute_fees_ix(f.fee_accounts(source), invoice, 10_000 * BRL);
    let op = f.operator.insecure_clone();
    let meta = f.send(ix, &op).expect("contribute");

    assert_eq!(f.balance(&source), 0);
    assert_eq!(f.balance(&treasury), 2_000 * BRL);
    assert_eq!(f.balance(&f.pdas.reserve), 8_000 * BRL);
    let s = f.state();
    assert_eq!(s.brs_balance, 8_000 * BRL);
    assert_eq!(s.fees_in_total, 8_000 * BRL);
    assert_eq!(s.fee_take_total, 2_000 * BRL);

    let r = f.fee_receipt(&invoice);
    assert_eq!(
        (r.version, r.invoice_ref_hash),
        (PROGRAM_LAYOUT_VERSION, invoice)
    );
    assert_ne!(r.bump, 0);
    assert_eq!(
        (r.gross, r.take, r.net),
        (10_000 * BRL, 2_000 * BRL, 8_000 * BRL)
    );
    assert_eq!(r.slot, clock(&f.svm).slot);
    assert_eq!(r._reserved, [0; 64]);

    let ev = events::<FeesContributed>(&meta);
    assert_eq!(ev.len(), 1);
    let e = &ev[0];
    assert_eq!(
        (e.config, e.ts, e.invoice_ref_hash),
        (f.pdas.config, 1_750_000_000, invoice)
    );
    assert_eq!(
        (e.gross, e.take, e.net),
        (10_000 * BRL, 2_000 * BRL, 8_000 * BRL)
    );
}

/// Demo step: "a fee raises NAV". 100,000 shares at NAV 1.00; a R$2,000
/// guarantee fee at a 20% take adds R$1,600 to the reserve, so NAV per share
/// rises by exactly 1,600 / 100,000 = 0.016.
#[test]
fn demo_fee_raises_nav() {
    let mut f = Fixture::new();
    f.fund_reserve(100_000 * BRL);
    f.inject_shares(100_000 * BRL);
    assert_eq!(f.nav(), NAV_SCALE);
    let supply = f.share_supply();

    let (res, _) = f.contribute(2_000 * BRL);
    res.expect("contribute");
    assert_eq!(f.nav(), NAV_SCALE + 16_000_000); // 1.016
                                                 // The take never reached the reserve; fees minted no shares.
    assert_eq!(f.state().brs_balance, 101_600 * BRL);
    assert_eq!(f.state().shares_outstanding, 100_000 * BRL);
    assert_eq!(f.share_supply(), supply);
}

#[test]
fn take_rounds_down_in_the_reserves_favour() {
    // 7 base units × 20% = 1.4 → take 1, net 6.
    let mut f = Fixture::new();
    let (res, invoice) = f.contribute(7);
    res.unwrap();
    let r = f.fee_receipt(&invoice);
    assert_eq!((r.take, r.net), (1, 6));
    // 4 × 20% = 0.8 → take 0, all into the reserve.
    let (res, invoice) = f.contribute(4);
    res.unwrap();
    let r = f.fee_receipt(&invoice);
    assert_eq!((r.take, r.net), (0, 4));
    assert_eq!(f.state().brs_balance, 10);
    assert_eq!(f.balance(&f.config().treasury_account), 1);
}

#[test]
fn zero_take_sends_everything_to_the_reserve() {
    let mut f = Fixture::new();
    set_take(&mut f, 0);
    let treasury = f.config().treasury_account;
    let (res, invoice) = f.contribute(5_000 * BRL);
    res.unwrap();
    assert_eq!(f.balance(&treasury), 0);
    assert_eq!(f.state().brs_balance, 5_000 * BRL);
    assert_eq!(f.state().fee_take_total, 0);
    assert_eq!(f.fee_receipt(&invoice).take, 0);
}

#[test]
fn maximum_take_is_thirty_percent() {
    let mut f = Fixture::new();
    set_take(&mut f, MAX_FEE_TAKE_BPS);
    let treasury = f.config().treasury_account;
    let (res, invoice) = f.contribute(10_000 * BRL);
    res.unwrap();
    assert_eq!(f.balance(&treasury), 3_000 * BRL);
    assert_eq!(f.state().brs_balance, 7_000 * BRL);
    let r = f.fee_receipt(&invoice);
    assert_eq!((r.take, r.net), (3_000 * BRL, 7_000 * BRL));
}

#[test]
fn the_take_never_touches_stable_assets() {
    let mut f = Fixture::new();
    f.fund_reserve(50_000 * BRL);
    let (res, _) = f.contribute(1_000 * BRL);
    res.unwrap();
    let s = f.state();
    // Only the net (R$800) entered the tracked reserve and stable assets.
    assert_eq!(s.brs_balance, 50_800 * BRL);
    assert_eq!(f.balance(&f.pdas.reserve), 50_800 * BRL);
    // A registration now fits exactly R$50,800 of cover.
    f.register(guarantee_args(unique_hash(), 30_000 * BRL, 0))
        .unwrap();
    assert_mutav_err(
        f.register(guarantee_args(unique_hash(), 20_800 * BRL + 1, 0)),
        MutavError::InsufficientFreeCapital,
    );
    f.register(guarantee_args(unique_hash(), 20_800 * BRL, 0))
        .unwrap();
}

#[test]
fn the_same_invoice_counts_once() {
    let mut f = Fixture::new();
    let source = f.operator_brs(2_000 * BRL);
    let invoice = unique_hash();
    let op = f.operator.insecure_clone();
    f.send(
        f.contribute_fees_ix(f.fee_accounts(source), invoice, 1_000 * BRL),
        &op,
    )
    .unwrap();
    let before = f.state();
    // Same invoice, different amount: refused at `FeeReceipt` creation.
    assert_already_in_use(f.send(
        f.contribute_fees_ix(f.fee_accounts(source), invoice, 500 * BRL),
        &op,
    ));
    assert_eq!(f.state().brs_balance, before.brs_balance);
    assert_eq!(f.balance(&source), 1_000 * BRL);
    assert_eq!(f.fee_receipt(&invoice).gross, 1_000 * BRL);
}

#[test]
fn zero_amount_is_invalid() {
    let mut f = Fixture::new();
    let (res, _) = f.contribute(0);
    assert_mutav_err(res, MutavError::InvalidParameter);
}

#[test]
fn a_treasury_other_than_the_whitelisted_one_is_rejected() {
    let mut f = Fixture::new();
    let source = f.operator_brs(1_000 * BRL);
    let mut a = f.fee_accounts(source);
    for other in [f.payments, f.token_account(&Pubkey::new_unique())] {
        a.treasury = other;
        let ix = f.contribute_fees_ix(a, unique_hash(), 1_000 * BRL);
        let op = f.operator.insecure_clone();
        assert_mutav_err(f.send(ix, &op), MutavError::InvalidTreasuryAccount);
    }
    assert_eq!(f.balance(&source), 1_000 * BRL);
}

#[test]
fn wrong_mint_or_token_program_is_rejected() {
    let mut f = Fixture::new();
    let op = f.operator.insecure_clone();

    // A source holding another token.
    let payer = f.payer.insecure_clone();
    let other_mint = create_brs_mint(&mut f.svm, &payer, &Pubkey::new_unique());
    let other_source = create_token_account(
        &mut f.svm,
        &payer,
        &other_mint,
        &op.pubkey(),
        &TOKEN_PROGRAM,
    );
    let a = f.fee_accounts(other_source);
    assert_mutav_err(
        f.send(f.contribute_fees_ix(a, unique_hash(), 1), &op),
        MutavError::InvalidMint,
    );

    // The right source, but another mint account.
    let source = f.operator_brs(1_000 * BRL);
    let mut a = f.fee_accounts(source);
    a.reserve_mint = other_mint;
    assert_mutav_err(
        f.send(f.contribute_fees_ix(a, unique_hash(), 1), &op),
        MutavError::InvalidMint,
    );

    // Token-2022 instead of the configured classic SPL Token program.
    let mut a = f.fee_accounts(source);
    a.token_program = TOKEN_2022_PROGRAM;
    assert_mutav_err(
        f.send(f.contribute_fees_ix(a, unique_hash(), 1), &op),
        MutavError::InvalidMint,
    );
}

#[test]
fn only_the_reserve_receives_the_net() {
    let mut f = Fixture::new();
    let source = f.operator_brs(1_000 * BRL);
    let mut a = f.fee_accounts(source);
    a.reserve = f.pdas.claims; // another reserve token account
    let op = f.operator.insecure_clone();
    assert_anchor_err(
        f.send(f.contribute_fees_ix(a, unique_hash(), 1_000 * BRL), &op),
        anchor_lang::error::ErrorCode::ConstraintSeeds,
    );
}

#[test]
fn contribute_rejects_a_non_operator() {
    let mut f = Fixture::new();
    for k in [
        f.admin.insecure_clone(),
        f.pauser.insecure_clone(),
        Keypair::new(),
    ] {
        let source = f.token_account(&k.pubkey());
        f.mint_brs(&source, 1_000 * BRL);
        let mut a = f.fee_accounts(source);
        a.operator = k.pubkey();
        let ix = f.contribute_fees_ix(a, unique_hash(), 1_000 * BRL);
        assert_mutav_err(f.send(ix, &k), MutavError::Unauthorized);
    }
    assert_eq!(f.state().fees_in_total, 0);
}

#[test]
fn revoked_operator_cannot_contribute() {
    let mut f = Fixture::new();
    let source = f.operator_brs(1_000 * BRL);
    let pauser = f.pauser.insecure_clone();
    f.send(f.revoke_operator_ix(&pauser.pubkey()), &pauser)
        .unwrap();
    let op = f.operator.insecure_clone();
    let ix = f.contribute_fees_ix(f.fee_accounts(source), unique_hash(), 1_000 * BRL);
    assert_mutav_err(f.send(ix, &op), MutavError::Unauthorized);
}

#[test]
fn contribute_works_while_paused_and_in_under_coverage() {
    // Never paused, never solvency-gated (ADR 0009). It also reads neither the
    // price nor `buffer_earmark` (spec §4 ratchet scope).
    let mut f = Fixture::new();
    let pauser = f.pauser.insecure_clone();
    f.send(f.pause_ix(&pauser.pubkey()), &pauser).unwrap();
    f.contribute(1_000 * BRL).0.expect("paused");

    let mut c = f.config();
    c.feature_flags = INSTANT_EXIT;
    f.write_config(&c);
    let mut s = f.state();
    s.mode = MODE_UNDER_COVERED;
    s.remaining_cover_total = 1_000_000 * BRL;
    s.tesouro_units = 7; // a TESOURO position with no fresh price
    s.buffer_earmark = 123;
    f.write_state(&s);
    let (res, _) = f.contribute(1_000 * BRL);
    res.expect("under-covered, stale price, injected earmark");
    let s = f.state();
    assert_eq!(s.brs_balance, 1_600 * BRL);
    assert_eq!(s.buffer_earmark, 123);
    assert_eq!(s.mode, MODE_UNDER_COVERED);
}

#[test]
fn a_newer_vault_state_is_refused() {
    let mut f = Fixture::new();
    let mut s = f.state();
    s.version = PROGRAM_LAYOUT_VERSION + 1;
    f.write_state(&s);
    let (res, _) = f.contribute(1_000 * BRL);
    assert_mutav_err(res, MutavError::UnsupportedVersion);
}
