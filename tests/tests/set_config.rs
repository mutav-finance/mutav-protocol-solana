//! `set_config` and `set_payments_account` (spec §5.1, §2.1, §14.3).

use anchor_lang::prelude::Pubkey;
use mutav::{
    constants::*,
    errors::MutavError,
    events::{ConfigUpdated, PaymentsAccountUpdated},
};
use mutav_tests::helpers::*;
use solana_signer::Signer;

#[test]
fn unchanged_args_change_nothing() {
    let mut f = Fixture::new();
    let before = f.config();
    let meta = f
        .set_config(set_config_args(&before))
        .expect("no-op set_config");
    assert!(events::<ConfigUpdated>(&meta).is_empty());
    let after = f.config();
    assert_eq!(after.caps, before.caps);
    assert_eq!(after.price, before.price);
    assert_eq!(after.exit, before.exit);
}

#[test]
fn reserve_mint_and_token_program_never_change() {
    let mut f = Fixture::new();
    let before = f.config();
    // `set_config` carries no mint, token program, decimals or share mint;
    // change everything it can and check those stay put.
    let mut a = set_config_args(&before);
    a.coverage_ratio_bps = 12_000;
    a.fee_take_bps = 100;
    a.caps.max_tvl += 1;
    a.price.p0 += 1;
    a.mutav_capital_wallet = Pubkey::new_unique();
    f.set_config(a).expect("set_config");
    let c = f.config();
    assert_eq!(c.reserve_mint, before.reserve_mint);
    assert_eq!(c.reserve_token_program, before.reserve_token_program);
    assert_eq!(c.reserve_decimals, before.reserve_decimals);
    assert_eq!(c.share_mint, before.share_mint);
    assert_eq!(c.admin, before.admin);
    // And the config PDA is still the one seeded by the original mint.
    assert_eq!(f.pdas.config, Pdas::new(&before.reserve_mint).config);
}

#[test]
fn same_bounds_as_initialize() {
    let mut f = Fixture::new();
    let base = set_config_args(&f.config());

    let mut a = base.clone();
    a.fee_take_bps = MAX_FEE_TAKE_BPS + 1;
    assert_mutav_err(f.set_config(a), MutavError::InvalidParameter);

    let mut a = base.clone();
    a.fee_take_bps = MAX_FEE_TAKE_BPS;
    f.set_config(a).expect("3_000 bps allowed");
    let mut a = base.clone();
    a.fee_take_bps = 0;
    f.set_config(a).expect("0 bps allowed");

    let cases: Vec<Box<dyn Fn(&mut mutav::SetConfigArgs)>> = vec![
        Box::new(|a| a.coverage_ratio_bps = 9_999),
        Box::new(|a| a.caps.max_tesouro_share_bps = 10_001),
        Box::new(|a| a.price.max_deviation_bps = 10_001),
        Box::new(|a| a.price.max_nav_move_bps = 10_001),
        Box::new(|a| a.caps.min_request = a.caps.max_request + 1),
        Box::new(|a| a.caps.claim_period_secs = 0),
        Box::new(|a| a.payout_sla_secs = -1),
        Box::new(|a| a.price.max_staleness_secs = -1),
    ];
    for case in cases {
        let mut a = base.clone();
        case(&mut a);
        assert_mutav_err(f.set_config(a), MutavError::InvalidParameter);
    }
}

#[test]
fn unsupported_feature_bits_fail_closed() {
    let mut f = Fixture::new();
    let base = set_config_args(&f.config());
    for flags in [INSTANT_EXIT, 1 << 1, 1 << 63, u64::MAX] {
        let mut a = base.clone();
        a.feature_flags = flags;
        assert_mutav_err(f.set_config(a), MutavError::FeatureNotSupported);
    }
    assert_eq!(f.config().feature_flags, 0);
}

#[test]
fn every_feature_bit_fails_closed_and_clearing_is_allowed() {
    let mut f = Fixture::new();
    let base = set_config_args(&f.config());
    for bit in 0..64 {
        let mut a = base.clone();
        a.feature_flags = 1u64 << bit;
        assert_mutav_err(f.set_config(a), MutavError::FeatureNotSupported);
    }
    // Zero (all bits clear) is always accepted.
    let mut a = base.clone();
    a.fee_take_bps += 1;
    a.feature_flags = 0;
    f.set_config(a).expect("clear flags");
    assert_eq!(f.config().feature_flags, 0);
}

#[test]
fn exit_params_can_be_staged_while_the_flag_is_off() {
    let mut f = Fixture::new();
    let mut a = set_config_args(&f.config());
    a.exit.buffer_target_bps = 500;
    a.exit.h_max_bps = 1_000;
    a.exit.barred[2] = Pubkey::new_unique();
    let meta = f.set_config(a.clone()).expect("stage exit params");
    let c = f.config();
    assert_eq!(c.feature_flags, 0);
    assert_eq!(c.exit.buffer_target_bps, 500);
    assert_eq!(c.exit.h_max_bps, 1_000);
    assert_eq!(c.exit.barred[2], a.exit.barred[2]);
    let fields: Vec<u16> = events::<ConfigUpdated>(&meta)
        .iter()
        .map(|e| e.field)
        .collect();
    assert_eq!(
        fields,
        vec![
            field::EXIT_BUFFER_TARGET_BPS,
            field::EXIT_H_MAX_BPS,
            field::EXIT_BARRED_0 + 2
        ]
    );
}

#[test]
fn set_config_keeps_treasury_and_payments_apart() {
    let mut f = Fixture::new();
    let admin = f.admin.insecure_clone();
    let args = set_config_args(&f.config());
    let payments = f.payments;

    // Treasury equal to the payments account.
    let ix = f.set_config_ix(&admin.pubkey(), args.clone(), &payments);
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidParameter);

    // Capital wallet equal to either account's owner.
    let mut a = args.clone();
    a.mutav_capital_wallet = f.treasury_owner;
    assert_mutav_err(f.set_config(a), MutavError::InvalidParameter);
    let mut a = args.clone();
    a.mutav_capital_wallet = f.payments_owner;
    assert_mutav_err(f.set_config(a), MutavError::InvalidParameter);

    // A treasury holding another mint.
    let payer = f.payer.insecure_clone();
    let other_mint = create_brs_mint(&mut f.svm, &payer, &Pubkey::new_unique());
    let wrong = create_token_account(
        &mut f.svm,
        &payer,
        &other_mint,
        &Pubkey::new_unique(),
        &TOKEN_PROGRAM,
    );
    let ix = f.set_config_ix(&admin.pubkey(), args.clone(), &wrong);
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidMint);

    // A valid new treasury.
    let new_treasury = f.token_account(&Pubkey::new_unique());
    let ix = f.set_config_ix(&admin.pubkey(), args, &new_treasury);
    let meta = f.send(ix, &admin).expect("move treasury");
    assert_eq!(f.config().treasury_account, new_treasury);
    let ev = events::<ConfigUpdated>(&meta);
    assert_eq!(ev.len(), 1);
    assert_eq!(ev[0].field, field::TREASURY_ACCOUNT);
    assert_eq!(ev[0].old, f.treasury.to_bytes());
    assert_eq!(ev[0].new, new_treasury.to_bytes());
}

#[test]
fn set_payments_account_rules() {
    let mut f = Fixture::new();
    let admin = f.admin.insecure_clone();
    let a = admin.pubkey();
    let treasury = f.treasury;

    // Equal to the treasury.
    let ix = f.set_payments_account_ix(&a, &treasury, &treasury);
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidParameter);

    // Owned by the MUTAV capital wallet.
    let capital = f.mutav_capital_wallet.pubkey();
    let owned_by_capital = f.token_account(&capital);
    let ix = f.set_payments_account_ix(&a, &owned_by_capital, &treasury);
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidParameter);

    // Wrong mint.
    let payer = f.payer.insecure_clone();
    let other_mint = create_brs_mint(&mut f.svm, &payer, &Pubkey::new_unique());
    let wrong = create_token_account(
        &mut f.svm,
        &payer,
        &other_mint,
        &Pubkey::new_unique(),
        &TOKEN_PROGRAM,
    );
    let ix = f.set_payments_account_ix(&a, &wrong, &treasury);
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidMint);

    // A treasury account other than the configured one.
    let fake_treasury = f.token_account(&Pubkey::new_unique());
    let new_payments = f.token_account(&Pubkey::new_unique());
    let ix = f.set_payments_account_ix(&a, &new_payments, &fake_treasury);
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidTreasuryAccount);

    // Valid.
    let ix = f.set_payments_account_ix(&a, &new_payments, &treasury);
    let meta = f.send(ix, &admin).expect("set payments");
    assert_eq!(f.config().payments_account, new_payments);
    let ev = events::<PaymentsAccountUpdated>(&meta);
    assert_eq!(ev.len(), 1);
    assert_eq!((ev[0].old, ev[0].new), (f.payments, new_payments));
    let cu = events::<ConfigUpdated>(&meta);
    assert_eq!(cu.len(), 1);
    assert_eq!(cu[0].field, field::PAYMENTS_ACCOUNT);
}
