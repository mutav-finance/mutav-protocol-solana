//! Mint guard (spec §5.1, PC-19): Token-2022 reserve mints with unsafe
//! extensions are rejected at `initialize`.

use anchor_spl::token_2022::spl_token_2022::state::AccountState;
use mutav::errors::MutavError;
use mutav_tests::helpers::{mints::*, *};
use solana_keypair::Keypair;
use solana_signer::Signer;

fn fixture_with(exts: &[Ext]) -> Fixture {
    let (mut svm, payer) = setup();
    let freeze = Keypair::new();
    let mint = create_token2022_mint(&mut svm, &payer, &freeze.pubkey(), exts);
    Fixture::with_mint(svm, payer, freeze, mint, TOKEN_2022_PROGRAM)
}

fn assert_rejected(exts: &[Ext]) {
    let mut f = fixture_with(exts);
    assert_mutav_err(
        f.initialize(f.init_args()),
        MutavError::UnsupportedMintExtension,
    );
    assert!(
        f.svm.get_account(&f.pdas.config).is_none(),
        "nothing created"
    );
}

fn assert_accepted(exts: &[Ext]) {
    let mut f = fixture_with(exts);
    f.initialize(f.init_args()).expect("initialize");
    let c = f.config();
    assert_eq!(c.reserve_token_program, TOKEN_2022_PROGRAM);
    assert_eq!(c.reserve_mint, f.reserve_mint);
}

#[test]
fn rejects_permanent_delegate() {
    assert_rejected(&[Ext::PermanentDelegate]);
}

#[test]
fn rejects_transfer_hook() {
    assert_rejected(&[Ext::TransferHook]);
}

#[test]
fn rejects_non_zero_transfer_fee() {
    assert_rejected(&[Ext::TransferFee(1)]);
}

#[test]
fn rejects_non_transferable() {
    assert_rejected(&[Ext::NonTransferable]);
}

#[test]
fn rejects_default_account_state_frozen() {
    assert_rejected(&[Ext::DefaultState(AccountState::Frozen)]);
}

#[test]
fn accepts_plain_token_2022_mint() {
    assert_accepted(&[]);
}

#[test]
fn accepts_zero_transfer_fee() {
    assert_accepted(&[Ext::TransferFee(0)]);
}

#[test]
fn accepts_default_account_state_initialized() {
    assert_accepted(&[Ext::DefaultState(AccountState::Initialized)]);
}
