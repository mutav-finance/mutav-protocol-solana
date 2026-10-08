//! `initialize` (spec §5.1): upgrade-authority gate, accounts created, bounds,
//! roles, MUTAV money-flow separation.

use anchor_lang::{prelude::Pubkey, AccountDeserialize};
use anchor_spl::token_interface::{Mint, TokenAccount};
use mutav::{constants::*, errors::MutavError, events::VaultInitialized};
use mutav_tests::helpers::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

fn mint_at(f: &Fixture, addr: &Pubkey) -> Mint {
    let acc = f.svm.get_account(addr).expect("mint");
    Mint::try_deserialize(&mut acc.data.as_slice()).expect("decode mint")
}

fn token_at(f: &Fixture, addr: &Pubkey) -> TokenAccount {
    let acc = f.svm.get_account(addr).expect("token account");
    TokenAccount::try_deserialize(&mut acc.data.as_slice()).expect("decode token account")
}

#[test]
fn initialize_creates_the_reserve() {
    let mut f = Fixture::uninitialized();
    let args = f.init_args();
    let meta = f.initialize(args.clone()).expect("initialize");
    let p = f.pdas;

    // VaultConfig.
    let acc = f.svm.get_account(&p.config).unwrap();
    assert_eq!(acc.owner, mutav::ID);
    assert_eq!(acc.data.len(), VAULT_CONFIG_SIZE);
    let c = f.config();
    assert_eq!(c.version, PROGRAM_LAYOUT_VERSION);
    let (_, config_bump) =
        Pubkey::find_program_address(&[CONFIG_SEED, f.reserve_mint.as_ref()], &mutav::ID);
    let (_, authority_bump) =
        Pubkey::find_program_address(&[AUTHORITY_SEED, p.config.as_ref()], &mutav::ID);
    assert_eq!(c.bump, config_bump);
    assert_eq!(c.authority_bump, authority_bump);
    assert_eq!(c.admin, args.admin);
    assert_eq!(c.operator, args.operator);
    assert_eq!(c.pauser, args.pauser);
    assert_eq!(c.reserve_mint, f.reserve_mint);
    assert_eq!(c.reserve_token_program, TOKEN_PROGRAM);
    assert_eq!(c.reserve_decimals, BRS_DECIMALS);
    assert_eq!(c.share_mint, p.share_mint);
    assert_eq!(c.coverage_ratio_bps, args.coverage_ratio_bps);
    assert_eq!(c.fee_take_bps, args.fee_take_bps);
    assert_eq!(c.payments_account, f.payments);
    assert_eq!(c.treasury_account, f.treasury);
    assert_eq!(c.investor_allowlist_root, [0; 32]);
    assert_eq!(c.caps.max_tvl, args.caps.max_tvl);
    assert_eq!(c.caps.min_fill_assets, args.caps.min_fill_assets);
    assert_eq!(c.price.p0, args.price.p0);
    assert_eq!(c.price.max_nav_move_bps, args.price.max_nav_move_bps);
    assert_eq!(c.payout_sla_secs, args.payout_sla_secs);
    assert!(!c.paused);
    assert_eq!(c.mutav_capital_wallet, args.mutav_capital_wallet);
    // Pilot defaults: no features, zeroed exit params, no adapters, zero padding.
    assert_eq!(c.feature_flags, 0);
    assert_eq!(c.exit.buffer_target_bps, 0);
    assert_eq!(c.exit.barred, [Pubkey::default(); 4]);
    assert_eq!(c.exit._reserved, [0; 32]);
    assert_eq!(c.caps._reserved, [0; 32]);
    assert_eq!(c.price._reserved, [0; 32]);
    assert_eq!(c.adapters.len(), MAX_ADAPTERS);
    assert!(c
        .adapters
        .iter()
        .all(|a| a.program_id == Pubkey::default() && !a.enabled && a._reserved == [0; 64]));
    assert_eq!(c._reserved, [0; 512]);

    // VaultState: empty.
    let acc = f.svm.get_account(&p.state).unwrap();
    assert_eq!(acc.owner, mutav::ID);
    assert_eq!(acc.data.len(), VAULT_STATE_SIZE);
    let s = f.state();
    assert_eq!(s.version, PROGRAM_LAYOUT_VERSION);
    assert_eq!(s.mode, MODE_NORMAL);
    assert_eq!(s.brs_balance, 0);
    assert_eq!(s.shares_outstanding, 0);
    assert_eq!(s.buffer_earmark, 0);
    assert_eq!(s.pending_notices, 0);
    assert_eq!(s.next_redeem_seq, 0);
    assert!(!s.fulfil_halted);
    assert_eq!(s._reserved, [0; 256]);

    // Share mint: 6 dp, mint and freeze authority = vault authority, no supply.
    let m = mint_at(&f, &p.share_mint);
    assert_eq!(m.decimals, SHARE_DECIMALS);
    assert_eq!(m.supply, 0);
    assert_eq!(m.mint_authority, Some(p.authority).into());
    assert_eq!(m.freeze_authority, Some(p.authority).into());
    assert_eq!(
        f.svm.get_account(&p.share_mint).unwrap().owner,
        TOKEN_PROGRAM
    );

    // Four token accounts, each a PDA owned by the vault authority.
    for (addr, mint) in [
        (p.reserve, f.reserve_mint),
        (p.pending_deposits, f.reserve_mint),
        (p.pending_redemptions, p.share_mint),
        (p.claims, f.reserve_mint),
    ] {
        let t = token_at(&f, &addr);
        assert_eq!(t.owner, p.authority);
        assert_eq!(t.mint, mint);
        assert_eq!(t.amount, 0);
    }
    // The vault authority holds no data.
    assert!(f
        .svm
        .get_account(&p.authority)
        .is_none_or(|a| a.data.is_empty()));

    // Event.
    let ev = events::<VaultInitialized>(&meta);
    assert_eq!(ev.len(), 1);
    assert_eq!(ev[0].config, p.config);
    assert_eq!(ev[0].admin, args.admin);
    assert_eq!(ev[0].operator, args.operator);
    assert_eq!(ev[0].pauser, args.pauser);
    assert_eq!(ev[0].reserve_mint, f.reserve_mint);
    assert_eq!(ev[0].share_mint, p.share_mint);
}

#[test]
fn initialize_fits_in_one_legacy_transaction() {
    let f = Fixture::uninitialized();
    let ix = initialize_ix(&f.init_accounts(), f.init_args());
    let size = tx_size(&[ix], &f.payer.pubkey(), 1);
    assert!(size <= 1_232, "initialize tx is {size} bytes");
}

#[test]
fn initialize_only_by_the_upgrade_authority() {
    let mut f = Fixture::uninitialized();
    let intruder = Keypair::new();
    let mut accts = f.init_accounts();
    accts.upgrade_authority = intruder.pubkey();
    let ix = initialize_ix(&accts, f.init_args());
    let payer = f.payer.insecure_clone();
    let res = send_ix(&mut f.svm, ix, &[&payer, &intruder]);
    assert_mutav_err(res, MutavError::Unauthorized);

    // A program with no upgrade authority (immutable) cannot be initialized.
    set_upgrade_authority(&mut f.svm, None);
    let res = f.initialize(f.init_args());
    assert_mutav_err(res, MutavError::Unauthorized);
}

#[test]
fn second_initialize_fails() {
    let mut f = Fixture::new();
    let res = f.initialize(f.init_args());
    assert!(res.is_err(), "second initialize must fail");
}

#[test]
fn fee_take_bounded_by_program_max() {
    let mut f = Fixture::uninitialized();
    let mut args = f.init_args();
    args.fee_take_bps = MAX_FEE_TAKE_BPS + 1;
    assert_mutav_err(f.initialize(args), MutavError::InvalidParameter);

    let mut args = f.init_args();
    args.fee_take_bps = MAX_FEE_TAKE_BPS;
    f.initialize(args).expect("3_000 bps is allowed");
    assert_eq!(f.config().fee_take_bps, 3_000);
}

#[test]
fn coverage_ratio_bounded_by_program_min() {
    // ADR 0016: c ≥ 0.10, so 999 is refused and 1_000 is the floor.
    assert_eq!(MIN_COVERAGE_RATIO_BPS, 1_000);
    let mut f = Fixture::uninitialized();
    let mut args = f.init_args();
    args.coverage_ratio_bps = MIN_COVERAGE_RATIO_BPS - 1;
    assert_mutav_err(f.initialize(args), MutavError::InvalidParameter);

    for c in [MIN_COVERAGE_RATIO_BPS, 5_000] {
        let mut f = Fixture::uninitialized();
        let mut args = f.init_args();
        args.coverage_ratio_bps = c;
        f.initialize(args).expect("c at or above the floor");
        assert_eq!(f.config().coverage_ratio_bps, c);
    }
}

#[test]
fn roles_must_be_distinct_and_set() {
    let mut f = Fixture::uninitialized();
    let base = f.init_args();

    let mut a = base.clone();
    a.operator = a.admin;
    assert_mutav_err(f.initialize(a), MutavError::RolesNotDistinct);

    let mut a = base.clone();
    a.pauser = a.admin;
    assert_mutav_err(f.initialize(a), MutavError::RolesNotDistinct);

    let mut a = base.clone();
    a.pauser = a.operator;
    assert_mutav_err(f.initialize(a), MutavError::RolesNotDistinct);

    for which in 0..3 {
        let mut a = base.clone();
        match which {
            0 => a.admin = Pubkey::default(),
            1 => a.operator = Pubkey::default(),
            _ => a.pauser = Pubkey::default(),
        }
        assert_mutav_err(f.initialize(a), MutavError::InvalidParameter);
    }
}

#[test]
fn params_out_of_program_bounds_rejected() {
    let mut f = Fixture::uninitialized();
    let base = f.init_args();
    let cases: Vec<Box<dyn Fn(&mut mutav::InitializeArgs)>> = vec![
        // Coverage ratio below the 0.10 floor (ADR 0016).
        Box::new(|a| a.coverage_ratio_bps = MIN_COVERAGE_RATIO_BPS - 1),
        Box::new(|a| a.coverage_ratio_bps = 0),
        Box::new(|a| a.caps.max_tesouro_share_bps = 10_001),
        Box::new(|a| a.price.max_deviation_bps = 10_001),
        Box::new(|a| a.price.max_nav_move_bps = 10_001),
        Box::new(|a| a.price.y_max_bps = 10_001),
        Box::new(|a| a.caps.min_request = a.caps.max_request + 1),
        Box::new(|a| a.caps.claim_period_secs = 0),
        Box::new(|a| a.payout_sla_secs = -1),
        Box::new(|a| a.price.max_staleness_secs = -1),
    ];
    for (i, case) in cases.iter().enumerate() {
        let mut a = base.clone();
        case(&mut a);
        let res = f.initialize(a);
        assert!(res.is_err(), "case {i} should fail");
        assert_mutav_err(res, MutavError::InvalidParameter);
    }
}

#[test]
fn treasury_and_payments_must_differ() {
    let mut f = Fixture::uninitialized();
    let mut accts = f.init_accounts();
    accts.payments = accts.treasury;
    let ix = initialize_ix(&accts, f.init_args());
    let payer = f.payer.insecure_clone();
    assert_mutav_err(
        send_ix(&mut f.svm, ix, &[&payer]),
        MutavError::InvalidParameter,
    );
}

#[test]
fn capital_wallet_cannot_own_treasury_or_payments() {
    let mut f = Fixture::uninitialized();
    let mut a = f.init_args();
    a.mutav_capital_wallet = f.treasury_owner;
    assert_mutav_err(f.initialize(a), MutavError::InvalidParameter);

    let mut a = f.init_args();
    a.mutav_capital_wallet = f.payments_owner;
    assert_mutav_err(f.initialize(a), MutavError::InvalidParameter);
}

#[test]
fn treasury_and_payments_must_hold_brs() {
    let mut f = Fixture::uninitialized();
    let payer = f.payer.insecure_clone();
    let other_mint = create_brs_mint(&mut f.svm, &payer, &Pubkey::new_unique());
    let wrong = create_token_account(
        &mut f.svm,
        &payer,
        &other_mint,
        &Pubkey::new_unique(),
        &TOKEN_PROGRAM,
    );

    let mut accts = f.init_accounts();
    accts.treasury = wrong;
    let ix = initialize_ix(&accts, f.init_args());
    assert_mutav_err(send_ix(&mut f.svm, ix, &[&payer]), MutavError::InvalidMint);

    let mut accts = f.init_accounts();
    accts.payments = wrong;
    let ix = initialize_ix(&accts, f.init_args());
    assert_mutav_err(send_ix(&mut f.svm, ix, &[&payer]), MutavError::InvalidMint);
}

#[test]
fn each_reserve_mint_gets_its_own_config() {
    let mut f = Fixture::new();
    let payer = f.payer.insecure_clone();
    let other_mint = create_brs_mint(&mut f.svm, &payer, &Pubkey::new_unique());
    let treasury = create_token_account(
        &mut f.svm,
        &payer,
        &other_mint,
        &Pubkey::new_unique(),
        &TOKEN_PROGRAM,
    );
    let payments = create_token_account(
        &mut f.svm,
        &payer,
        &other_mint,
        &Pubkey::new_unique(),
        &TOKEN_PROGRAM,
    );
    let accts = InitAccounts {
        payer: payer.pubkey(),
        upgrade_authority: payer.pubkey(),
        reserve_mint: other_mint,
        reserve_token_program: TOKEN_PROGRAM,
        treasury,
        payments,
    };
    let ix = initialize_ix(&accts, f.init_args());
    send_ix(&mut f.svm, ix, &[&payer]).expect("second reserve");
    assert_ne!(Pdas::new(&other_mint).config, f.pdas.config);
    assert_eq!(f.config().reserve_mint, f.reserve_mint);
}

#[test]
fn treasury_and_payments_cannot_be_reserve_accounts() {
    // The reserve's own token accounts are owned by the vault authority; none
    // may stand in for MUTAV's treasury or payments account (spec §2.1).
    let mut f = Fixture::uninitialized();
    let payer = f.payer.insecure_clone();
    let authority = f.pdas.authority;
    let reserve = f.pdas.reserve;

    // The `reserve` PDA created by this same instruction, as the treasury:
    // Anchor loads the treasury before `reserve` exists, so it is rejected
    // before the handler runs.
    let mut accts = f.init_accounts();
    accts.treasury = reserve;
    let ix = initialize_ix(&accts, f.init_args());
    assert_anchor_err(
        send_ix(&mut f.svm, ix, &[&payer]),
        anchor_lang::error::ErrorCode::AccountNotInitialized,
    );

    // Any BRS account owned by the vault authority, as treasury or payments.
    let owned = f.token_account(&authority);
    let mut accts = f.init_accounts();
    accts.treasury = owned;
    let ix = initialize_ix(&accts, f.init_args());
    assert_mutav_err(
        send_ix(&mut f.svm, ix, &[&payer]),
        MutavError::InvalidParameter,
    );

    let mut accts = f.init_accounts();
    accts.payments = owned;
    let ix = initialize_ix(&accts, f.init_args());
    assert_mutav_err(
        send_ix(&mut f.svm, ix, &[&payer]),
        MutavError::InvalidParameter,
    );

    // The valid accounts still initialize.
    f.initialize(f.init_args()).expect("initialize");
}
