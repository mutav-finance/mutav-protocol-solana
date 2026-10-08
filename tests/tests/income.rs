//! Issuer income intake (spec §3.14, §5.3a; ADR 0017): the income inbox
//! created at `initialize`, and `sweep_income`, which moves one statement's
//! BRS from the inbox into the reserve and books it.

use anchor_lang::prelude::Pubkey;
use mutav::{
    constants::*,
    errors::MutavError,
    events::IncomeSwept,
    math::shares_for,
    solvency::{Solvency, SolvencyInputs},
    state::{VaultConfig, VaultState},
};
use mutav_tests::helpers::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

fn solvency(c: &VaultConfig, s: &VaultState) -> Solvency {
    Solvency::compute(&SolvencyInputs {
        brs_balance: s.brs_balance,
        tesouro_units: s.tesouro_units,
        tesouro_price: s.tesouro_price,
        remaining_cover_total: s.remaining_cover_total,
        coverage_ratio_bps: c.coverage_ratio_bps,
        provisions: s.provisions,
        buffer_earmark: s.buffer_earmark,
        feature_flags: c.feature_flags,
        head_starved: false,
    })
    .unwrap()
}

/// A reserve of 100,000 BRS behind 100,000 shares (NAV 1.0).
fn funded() -> Fixture {
    let mut f = Fixture::new();
    set_time(&mut f.svm, 1_760_000_000);
    f.fund_reserve(100_000 * BRL);
    f.inject_shares(100_000 * BRL);
    f
}

fn op(f: &Fixture) -> Keypair {
    f.operator.insecure_clone()
}

/// State, reserve and inbox balances, to assert a refused call changed
/// nothing.
fn snapshot(f: &Fixture) -> (Vec<u8>, u64, u64) {
    (
        f.raw(&f.pdas.state),
        f.balance(&f.pdas.reserve),
        f.balance(&f.income_inbox()),
    )
}

// ---------------------------------------------------------------------------
// The inbox at `initialize`
// ---------------------------------------------------------------------------

#[test]
fn initialize_creates_the_income_inbox() {
    let f = Fixture::new();
    let inbox = f.income_inbox();
    let acc = f.svm.get_account(&inbox).expect("inbox exists");
    assert_eq!(acc.owner, TOKEN_PROGRAM);
    assert_eq!(f.balance(&inbox), 0);
    // It is the associated token account, not one of the PDA token accounts.
    for pda in [
        f.pdas.reserve,
        f.pdas.pending_deposits,
        f.pdas.pending_redemptions,
        f.pdas.claims,
    ] {
        assert_ne!(inbox, pda);
    }
}

#[test]
fn initialize_succeeds_when_a_third_party_created_the_inbox_first() {
    let mut f = Fixture::uninitialized();
    let griefer = Keypair::new();
    f.svm.airdrop(&griefer.pubkey(), 1_000_000_000).unwrap();
    let ix = anchor_spl::associated_token::spl_associated_token_account::instruction::create_associated_token_account(
        &griefer.pubkey(),
        &f.pdas.authority,
        &f.reserve_mint,
        &TOKEN_PROGRAM,
    );
    send_ix(&mut f.svm, ix, &[&griefer]).expect("third party creates the inbox");
    let inbox = f.income_inbox();
    f.mint_brs(&inbox, 7); // and even sends dust to it
    f.initialize(f.init_args())
        .expect("idempotent create succeeds");
    assert_eq!(f.balance(&inbox), 7);
    // The dust is untracked: nothing counts toward NAV.
    assert_eq!(f.state().brs_balance, 0);
}

#[test]
fn initialize_refuses_another_inbox_address() {
    let mut f = Fixture::uninitialized();
    let mut ix = initialize_ix(&f.init_accounts(), f.init_args());
    let at = ix
        .accounts
        .iter()
        .position(|m| m.pubkey == f.income_inbox())
        .unwrap();
    ix.accounts[at].pubkey = Pubkey::new_unique();
    let payer = f.payer.insecure_clone();
    assert_mutav_err(
        send_ix(&mut f.svm, ix, &[&payer]),
        MutavError::InvalidIncomeSource,
    );
    assert!(f.svm.get_account(&f.pdas.config).is_none());
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

/// Demo step: "the reserve earns". Nora pays R$1,000 of revenue share into
/// the inbox; the operator sweeps the statement; NAV per share rises by
/// 1,000 / 100,000 = 0.01 and no share is minted.
#[test]
fn sweep_moves_the_statement_into_the_reserve_and_raises_nav() {
    let mut f = funded();
    let supply = f.share_supply();
    let nav_before = f.nav();
    assert_eq!(nav_before, NAV_SCALE);

    f.pay_income(1_000 * BRL);
    let r = unique_hash();
    let ix = f.sweep_income_ix(f.income_accounts(), r, 202_610, 1_000 * BRL);
    let meta = f.send(ix, &op(&f)).expect("sweep");

    let s = f.state();
    assert_eq!(s.brs_balance, 101_000 * BRL);
    assert_eq!(s.income_total, 1_000 * BRL);
    assert_eq!(s.income_take_total, 0);
    // The guard's counter is per share: 1,000 / 100,000 shares = 0.01.
    assert_eq!(s.inflow_nav, NAV_SCALE / 100);
    assert_eq!(s.fees_in_total, 0, "income is not a guarantee fee");
    assert_eq!(f.balance(&f.income_inbox()), 0);
    assert_eq!(f.balance(&f.pdas.reserve), 101_000 * BRL);
    assert_eq!(f.balance(&f.config().treasury_account), 0);
    // NAV rises by 1,000 / 100,000 (exact here); no shares minted.
    assert_eq!(f.nav(), NAV_SCALE + 10_000_000);
    assert_eq!(f.share_supply(), supply);
    assert_eq!(s.shares_outstanding, 100_000 * BRL);

    let rec = f.income_receipt(&r);
    assert_eq!(
        (rec.version, rec.income_ref_hash, rec.period),
        (PROGRAM_LAYOUT_VERSION, r, 202_610)
    );
    assert_ne!(rec.bump, 0);
    assert_eq!(
        (rec.gross, rec.take, rec.net),
        (1_000 * BRL, 0, 1_000 * BRL)
    );
    assert_eq!(rec.slot, clock(&f.svm).slot);

    let ev = events::<IncomeSwept>(&meta);
    assert_eq!(ev.len(), 1);
    let e = &ev[0];
    assert_eq!(
        (e.config, e.ts, e.income_ref_hash, e.period),
        (f.pdas.config, 1_760_000_000, r, 202_610)
    );
    assert_eq!(
        (e.gross, e.take, e.net, e.inbox_after),
        (1_000 * BRL, 0, 1_000 * BRL, 0)
    );
}

#[test]
fn nav_and_stable_assets_rise_only_on_the_sweep() {
    let mut f = funded();
    f.refresh().unwrap();
    let before = f.state();

    // Nora's raw transfer: nothing moves.
    f.pay_income(5_000 * BRL);
    f.refresh().unwrap();
    let mid = f.state();
    assert_eq!(mid.brs_balance, before.brs_balance);
    assert_eq!(mid.stable_assets, before.stable_assets);
    assert_eq!(mid.nav_per_share, before.nav_per_share);

    // A stray transfer straight into `reserve` does not move it either
    // (internal accounting, invariant 1).
    let reserve = f.pdas.reserve;
    f.mint_brs(&reserve, 3_000 * BRL);
    f.refresh().unwrap();
    assert_eq!(f.state().stable_assets, before.stable_assets);
    assert_eq!(f.state().nav_per_share, before.nav_per_share);

    // The sweep books it.
    f.sweep(5_000 * BRL).0.unwrap();
    f.refresh().unwrap();
    let after = f.state();
    assert_eq!(after.stable_assets, before.stable_assets + 5_000 * BRL);
    assert_eq!(after.nav_per_share, NAV_SCALE + 50_000_000);
    assert!(!after.fulfil_halted, "a 5% inflow does not trip the guard");
    // Invariant 4: the stray 3,000 stays untracked in `reserve`.
    assert_eq!(f.balance(&f.pdas.reserve), after.brs_balance + 3_000 * BRL);
}

#[test]
fn a_partial_sweep_leaves_the_rest_untracked() {
    let mut f = funded();
    // Nora pays the statement plus dust someone else sent.
    f.pay_income(2_000 * BRL + 37);
    let (res, r) = f.sweep(2_000 * BRL);
    let meta = res.unwrap();
    assert_eq!(f.balance(&f.income_inbox()), 37);
    assert_eq!(events::<IncomeSwept>(&meta)[0].inbox_after, 37);
    assert_eq!(f.state().brs_balance, 102_000 * BRL);
    assert_eq!(f.income_receipt(&r).gross, 2_000 * BRL);
    // The dust can be swept only with a statement of its own.
    f.sweep(37).0.unwrap();
    assert_eq!(f.balance(&f.income_inbox()), 0);
}

#[test]
fn sweeping_the_whole_inbox_and_one_more_unit() {
    let mut f = funded();
    f.pay_income(1_000 * BRL);
    let before = snapshot(&f);
    let (res, _) = f.sweep(1_000 * BRL + 1);
    assert_mutav_err(res, MutavError::IncomeExceedsInbox);
    assert_eq!(snapshot(&f), before);
    f.sweep(1_000 * BRL).0.expect("exactly the inbox");
}

#[test]
fn an_empty_inbox_refuses_any_sweep() {
    let mut f = funded();
    let (res, _) = f.sweep(1);
    assert_mutav_err(res, MutavError::IncomeExceedsInbox);
}

// ---------------------------------------------------------------------------
// Idempotency per statement
// ---------------------------------------------------------------------------

#[test]
fn each_statement_counts_once() {
    let mut f = funded();
    f.pay_income(3_000 * BRL);
    let r = unique_hash();
    let o = op(&f);
    f.send(
        f.sweep_income_ix(f.income_accounts(), r, 202_610, 1_000 * BRL),
        &o,
    )
    .unwrap();
    let before = snapshot(&f);
    // Same reference, any period or amount: refused at `IncomeReceipt`
    // creation.
    for (period, amount) in [(202_610, 1_000 * BRL), (202_611, 500 * BRL)] {
        assert_already_in_use(f.send(
            f.sweep_income_ix(f.income_accounts(), r, period, amount),
            &o,
        ));
        assert_eq!(snapshot(&f), before);
    }
    assert_eq!(f.income_receipt(&r).gross, 1_000 * BRL);
    // Another statement in the same period (e.g. a correction) has its own
    // reference and counts once too.
    f.send(
        f.sweep_income_ix(f.income_accounts(), unique_hash(), 202_610, 500 * BRL),
        &o,
    )
    .expect("second statement for the period");
    assert_eq!(f.state().income_total, 1_500 * BRL);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[test]
fn zero_amount_is_invalid() {
    let mut f = funded();
    f.pay_income(1_000 * BRL);
    let (res, _) = f.sweep(0);
    assert_mutav_err(res, MutavError::InvalidParameter);
}

#[test]
fn the_period_must_be_a_yyyymm_month() {
    let mut f = funded();
    f.pay_income(1_000 * BRL);
    let o = op(&f);
    for period in [0, 202_600, 202_613, 2_026, 199_912, 1_000_001] {
        let ix = f.sweep_income_ix(f.income_accounts(), unique_hash(), period, 1);
        assert_mutav_err(f.send(ix, &o), MutavError::InvalidParameter);
    }
    for period in [202_601, 202_612] {
        let ix = f.sweep_income_ix(f.income_accounts(), unique_hash(), period, 1);
        f.send(ix, &o).expect("valid month");
    }
}

#[test]
fn a_look_alike_source_is_refused() {
    // Token accounts owned by the vault authority that are not its
    // associated token account: a fresh keypair account, and each of the
    // reserve's own PDA token accounts.
    let mut f = funded();
    f.pay_income(1_000 * BRL);
    let authority = f.pdas.authority;
    let look_alike = f.token_account(&authority);
    f.mint_brs(&look_alike, 1_000 * BRL);
    let o = op(&f);
    for source in [look_alike, f.pdas.pending_deposits, f.pdas.claims] {
        let mut a = f.income_accounts();
        a.income_inbox = source;
        let before = snapshot(&f);
        let ix = f.sweep_income_ix(a, unique_hash(), PERIOD, 1);
        assert_mutav_err(f.send(ix, &o), MutavError::InvalidIncomeSource);
        assert_eq!(snapshot(&f), before);
    }
    // `reserve` itself as the source (it is also the destination): Anchor
    // refuses the duplicate writable account before the handler runs.
    let mut a = f.income_accounts();
    a.income_inbox = f.pdas.reserve;
    let ix = f.sweep_income_ix(a, unique_hash(), PERIOD, 1);
    assert_anchor_err(
        f.send(ix, &o),
        anchor_lang::error::ErrorCode::ConstraintDuplicateMutableAccount,
    );
}

#[test]
fn wrong_mint_or_token_program_is_refused() {
    let mut f = funded();
    f.pay_income(1_000 * BRL);
    let o = op(&f);
    let payer = f.payer.insecure_clone();
    let other_mint = create_brs_mint(&mut f.svm, &payer, &Pubkey::new_unique());

    // The vault authority's associated token account for another mint.
    let ix = anchor_spl::associated_token::spl_associated_token_account::instruction::create_associated_token_account(
        &payer.pubkey(),
        &f.pdas.authority,
        &other_mint,
        &TOKEN_PROGRAM,
    );
    send_ix(&mut f.svm, ix, &[&payer]).unwrap();
    let mut a = f.income_accounts();
    a.income_inbox = income_inbox_address(&f.pdas.authority, &other_mint, &TOKEN_PROGRAM);
    let ix = f.sweep_income_ix(a, unique_hash(), PERIOD, 1);
    assert_mutav_err(f.send(ix, &o), MutavError::InvalidMint);

    // Another mint account.
    let mut a = f.income_accounts();
    a.reserve_mint = other_mint;
    let ix = f.sweep_income_ix(a, unique_hash(), PERIOD, 1);
    assert_mutav_err(f.send(ix, &o), MutavError::InvalidMint);

    // Token-2022 instead of the configured classic SPL Token program.
    let mut a = f.income_accounts();
    a.token_program = TOKEN_2022_PROGRAM;
    let ix = f.sweep_income_ix(a, unique_hash(), PERIOD, 1);
    assert_mutav_err(f.send(ix, &o), MutavError::InvalidTokenProgram);
}

#[test]
fn only_the_reserve_receives_the_net_and_only_the_treasury_the_take() {
    let mut f = funded();
    f.pay_income(1_000 * BRL);
    let o = op(&f);
    let mut a = f.income_accounts();
    a.reserve = f.pdas.claims;
    let ix = f.sweep_income_ix(a, unique_hash(), PERIOD, 1);
    assert_anchor_err(
        f.send(ix, &o),
        anchor_lang::error::ErrorCode::ConstraintSeeds,
    );

    for other in [f.payments, f.token_account(&Pubkey::new_unique())] {
        let mut a = f.income_accounts();
        a.treasury = other;
        let ix = f.sweep_income_ix(a, unique_hash(), PERIOD, 1);
        assert_mutav_err(f.send(ix, &o), MutavError::InvalidTreasuryAccount);
    }

    let mut a = f.income_accounts();
    a.vault_authority = Pubkey::new_unique();
    let ix = f.sweep_income_ix(a, unique_hash(), PERIOD, 1);
    assert_anchor_err(
        f.send(ix, &o),
        anchor_lang::error::ErrorCode::ConstraintSeeds,
    );
}

#[test]
fn only_the_operator_may_sweep() {
    let mut f = funded();
    f.pay_income(1_000 * BRL);
    let investor = f.investor(1_000 * BRL);
    for k in [
        f.admin.insecure_clone(),
        f.pauser.insecure_clone(),
        investor.key.insecure_clone(),
        Keypair::new(),
    ] {
        let mut a = f.income_accounts();
        a.operator = k.pubkey();
        let ix = f.sweep_income_ix(a, unique_hash(), PERIOD, 1_000 * BRL);
        assert_mutav_err(f.send(ix, &k), MutavError::Unauthorized);
    }
    assert_eq!(f.state().income_total, 0);
    assert_eq!(f.balance(&f.income_inbox()), 1_000 * BRL);
}

#[test]
fn a_revoked_or_rotated_operator_cannot_sweep() {
    let mut f = funded();
    f.pay_income(1_000 * BRL);
    let old = op(&f);

    // Rotated by the admin: the old key is refused, the new one works.
    let admin = f.admin.insecure_clone();
    let new_op = Keypair::new();
    let pauser = f.config().pauser;
    f.send(
        f.set_roles_ix(&admin.pubkey(), new_op.pubkey(), pauser),
        &admin,
    )
    .unwrap();
    let ix = f.sweep_income_ix(f.income_accounts(), unique_hash(), PERIOD, 500 * BRL);
    assert_mutav_err(f.send(ix, &old), MutavError::Unauthorized);
    let mut a = f.income_accounts();
    a.operator = new_op.pubkey();
    f.send(
        f.sweep_income_ix(a, unique_hash(), PERIOD, 500 * BRL),
        &new_op,
    )
    .expect("new operator");

    // Revoked by the pauser: nobody can sweep.
    let pauser = f.pauser.insecure_clone();
    f.send(f.revoke_operator_ix(&pauser.pubkey()), &pauser)
        .unwrap();
    let mut a = f.income_accounts();
    a.operator = new_op.pubkey();
    let ix = f.sweep_income_ix(a, unique_hash(), PERIOD, 500 * BRL);
    assert_mutav_err(f.send(ix, &new_op), MutavError::Unauthorized);
}

#[test]
fn a_frozen_inbox_or_reserve_fails_closed_and_changes_nothing() {
    let mut f = funded();
    f.pay_income(1_000 * BRL);
    let inbox = f.income_inbox();
    // A frozen inbox is not a valid source; a frozen reserve is the usual
    // reserve freeze.
    for (frozen, err) in [
        (inbox, MutavError::InvalidIncomeSource),
        (f.pdas.reserve, MutavError::ReserveFrozen),
    ] {
        f.set_frozen(&frozen, true);
        let before = snapshot(&f);
        let (res, r) = f.sweep(1_000 * BRL);
        assert_mutav_err(res, err);
        assert_eq!(snapshot(&f), before);
        assert!(f
            .svm
            .get_account(&income_receipt_pda(&f.pdas.config, &r))
            .is_none());
        f.set_frozen(&frozen, false);
    }
    f.sweep(1_000 * BRL).0.expect("thawed");
}

#[test]
fn a_newer_vault_state_is_refused() {
    let mut f = funded();
    f.pay_income(1_000 * BRL);
    let mut s = f.state();
    s.version = PROGRAM_LAYOUT_VERSION + 1;
    f.write_state(&s);
    let (res, _) = f.sweep(1_000 * BRL);
    assert_mutav_err(res, MutavError::UnsupportedVersion);
}

// ---------------------------------------------------------------------------
// Always open
// ---------------------------------------------------------------------------

#[test]
fn sweep_works_while_paused_under_covered_with_notices_and_a_stale_price() {
    // Not paused, never solvency-gated, no mode check, not gated by claim
    // notices: money coming in is always accepted (ADR 0017). It reads
    // neither the price nor `buffer_earmark`.
    let mut f = funded();
    let pauser = f.pauser.insecure_clone();
    f.send(f.pause_ix(&pauser.pubkey()), &pauser).unwrap();
    f.pay_income(2_000 * BRL);
    f.sweep(1_000 * BRL).0.expect("paused");

    let mut c = f.config();
    c.feature_flags = INSTANT_EXIT;
    f.write_config(&c);
    let mut s = f.state();
    s.mode = MODE_UNDER_COVERED;
    s.remaining_cover_total = 10_000_000 * BRL;
    s.pending_notices = 2;
    s.tesouro_units = 7; // a TESOURO position with no fresh price
    s.buffer_earmark = 123;
    f.write_state(&s);
    f.sweep(1_000 * BRL)
        .0
        .expect("under-covered, notices pending, stale price, injected earmark");
    let s = f.state();
    assert_eq!(s.brs_balance, 102_000 * BRL);
    assert_eq!(s.buffer_earmark, 123, "earmark untouched");
    assert_eq!(s.mode, MODE_UNDER_COVERED, "mode is refresh's job");
    assert_eq!(s.pending_notices, 2);
}

#[test]
fn income_raises_free_capital_for_the_solvency_gate() {
    // c = 1.0: 100,000 of capital backs 100,000 of cover. A registration
    // that does not fit before the sweep fits after it.
    let mut f = funded();
    f.register(guarantee_args(unique_hash(), 30_000 * BRL, 0))
        .unwrap();
    f.register(guarantee_args(unique_hash(), 30_000 * BRL, 0))
        .unwrap();
    f.register(guarantee_args(unique_hash(), 30_000 * BRL, 0))
        .unwrap();
    let g = guarantee_args(unique_hash(), 12_000 * BRL, 0);
    assert_mutav_err(f.register(g.clone()), MutavError::InsufficientFreeCapital);

    // Unswept income in the inbox does not help.
    f.pay_income(2_000 * BRL);
    assert_mutav_err(f.register(g.clone()), MutavError::InsufficientFreeCapital);
    assert_eq!(solvency(&f.config(), &f.state()).free_capital, 10_000 * BRL);

    f.sweep(2_000 * BRL).0.unwrap();
    assert_eq!(solvency(&f.config(), &f.state()).free_capital, 12_000 * BRL);
    f.register(g).expect("fits after the sweep");
}

#[test]
fn pay_claim_is_unaffected_and_never_spends_the_inbox() {
    let mut f = funded();
    let g = guarantee_args(unique_hash(), 30_000 * BRL, 0);
    f.register(g.clone()).unwrap();
    let c = Claim::on(&g, 5_000 * BRL);
    f.file_claim(c).unwrap();
    f.pay_income(4_000 * BRL);
    f.sweep(1_000 * BRL).0.unwrap();
    f.pay_claim(c).expect("pay_claim");
    // The unswept 3,000 stays in the inbox; only tracked reserve BRS paid.
    assert_eq!(f.balance(&f.income_inbox()), 3_000 * BRL);
    assert_eq!(f.state().brs_balance, 96_000 * BRL);
    assert_eq!(f.balance(&f.pdas.reserve), 96_000 * BRL);
}

#[test]
fn a_large_income_payment_does_not_halt_fulfilment() {
    // ADR 0017: the NAV-move guard measures net of verified inflows. A 5%
    // income sweep (bound: 100 bps) does not set `fulfil_halted`.
    let mut f = funded();
    f.refresh().unwrap();
    f.pay_and_sweep(5_000 * BRL);
    f.refresh().unwrap();
    assert!(!f.state().fulfil_halted);
    assert_eq!(f.state().nav_per_share, NAV_SCALE + 50_000_000);
}

// ---------------------------------------------------------------------------
// MUTAV's take (`income_take_bps`, capped by `MAX_INCOME_TAKE_BPS`)
// ---------------------------------------------------------------------------

#[test]
fn set_config_refuses_any_take_above_the_program_cap() {
    let mut f = Fixture::new();
    assert_eq!(MAX_INCOME_TAKE_BPS, 0, "cap TBD: fails closed at 0");
    let mut args = set_config_args(&f.config());
    args.income_take_bps = MAX_INCOME_TAKE_BPS + 1;
    assert_mutav_err(f.set_config(args.clone()), MutavError::InvalidParameter);
    args.income_take_bps = MAX_INCOME_TAKE_BPS;
    f.set_config(args).expect("at the cap");
    assert_eq!(f.config().income_take_bps, 0);
}

#[test]
fn an_injected_take_goes_to_the_treasury_rounded_down() {
    // A take set by a later binary (25%): the split mirrors `contribute_fees`
    // and rounds the take down, in the reserve's favour.
    let mut f = funded();
    let mut c = f.config();
    c.income_take_bps = 2_500;
    f.write_config(&c);
    let treasury = c.treasury_account;
    f.pay_income(1_000 * BRL + 3);
    let (res, r) = f.sweep(1_000 * BRL + 3);
    let meta = res.unwrap();
    // take = floor(1,000.000003 × 0.25) = 250.000000 (0.75 base units drop).
    let take = 250 * BRL;
    let net = 750 * BRL + 3;
    assert_eq!(f.balance(&treasury), take);
    let s = f.state();
    assert_eq!(s.brs_balance, 100_000 * BRL + net);
    assert_eq!((s.income_total, s.income_take_total), (net, take));
    // ceil(750.000003 / 100,000 × 10⁹): rounded up (pricing::inflow_nav).
    assert_eq!(s.inflow_nav, 7_500_001);
    let rec = f.income_receipt(&r);
    assert_eq!((rec.gross, rec.take, rec.net), (1_000 * BRL + 3, take, net));
    let e = &events::<IncomeSwept>(&meta)[0];
    assert_eq!((e.take, e.net, e.inbox_after), (take, net, 0));
}

// ---------------------------------------------------------------------------
// Properties and scenarios
// ---------------------------------------------------------------------------

/// No drift: with no outside transfers into `reserve`, its balance equals
/// `brs_balance` after any random sequence of pilot instructions, and the
/// inbox only ever holds what Nora paid minus what was swept.
#[test]
fn no_drift_between_the_reserve_and_brs_balance() {
    let mut f = Fixture::new();
    let mut x: u64 = 0x1c0e_5eed;
    for step in 0..60 {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        let mut ixs = f.pilot_instructions();
        let (name, ix, signer) = ixs.swap_remove((x % ixs.len() as u64) as usize);
        let _ = f.send(ix, &signer);
        let s = f.state();
        assert_eq!(
            f.balance(&f.pdas.reserve),
            s.brs_balance,
            "step {step} {name}: reserve drifted from brs_balance"
        );
    }
    let s = f.state();
    assert!(s.income_total > 0, "the sequence swept income");
    assert_eq!(s.income_take_total, 0);
}

/// Timing scenario (documentation for the transparency copy): a deposit
/// fulfilled before an income sweep shares in it; one fulfilled after buys
/// at the higher NAV, so it does not.
#[test]
fn deposits_before_and_after_a_payment_get_the_expected_shares() {
    let mut f = Fixture::new();
    let a = f.investor(10_000 * BRL);
    let b = f.investor(11_000 * BRL);
    let list = f.allowlist(&[a.pubkey(), b.pubkey()]);
    let shares_a = f.deposit(&a, &list, 10_000 * BRL);
    assert_eq!(shares_a, 10_000 * BRL, "A buys at NAV 1.0");

    f.pay_and_sweep(1_000 * BRL);
    assert_eq!(f.nav(), NAV_SCALE + 100_000_000, "NAV 1.10");

    let s = f.state();
    let expected_b = shares_for(11_000 * BRL, s.shares_outstanding, s.brs_balance).unwrap();
    let shares_b = f.deposit(&b, &list, 11_000 * BRL);
    assert_eq!(shares_b, expected_b);
    // B paid 11,000 for the shares A got for 10,000: the income accrued to
    // A, who held shares when it was swept.
    assert_eq!(shares_b, shares_a);
    assert_eq!(
        f.nav(),
        NAV_SCALE + 100_000_000,
        "B's deposit is NAV-neutral"
    );
}
