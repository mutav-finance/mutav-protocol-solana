//! `ConfigUpdated` coverage (spec §9): walks the field-id table in
//! `constants.rs` and checks that every mutable `VaultConfig` field has an
//! event path, with the right id and the right old/new encoding.

use anchor_lang::{prelude::Pubkey, AccountDeserialize, AnchorSerialize, Discriminator};
use mutav::{
    constants::{field, CONFIG_FIELDS, INSTANT_EXIT},
    events::{ConfigUpdated, FieldBytes},
    state::VaultConfig,
    SetConfigArgs,
};
use mutav_tests::helpers::*;
use solana_signer::Signer;

/// The value of field `id` in `c`, encoded as `ConfigUpdated` encodes it.
/// Independent of the program's mapping, so a mis-wired id is caught.
fn value_bytes(c: &VaultConfig, id: u16) -> [u8; 32] {
    use field::*;
    match id {
        ADMIN => c.admin.field_bytes(),
        OPERATOR => c.operator.field_bytes(),
        PAUSER => c.pauser.field_bytes(),
        RESERVE_MINT => c.reserve_mint.field_bytes(),
        RESERVE_TOKEN_PROGRAM => c.reserve_token_program.field_bytes(),
        RESERVE_DECIMALS => c.reserve_decimals.field_bytes(),
        SHARE_MINT => c.share_mint.field_bytes(),
        COVERAGE_RATIO_BPS => c.coverage_ratio_bps.field_bytes(),
        FEE_TAKE_BPS => c.fee_take_bps.field_bytes(),
        PAYMENTS_ACCOUNT => c.payments_account.field_bytes(),
        TREASURY_ACCOUNT => c.treasury_account.field_bytes(),
        INVESTOR_ALLOWLIST_ROOT => c.investor_allowlist_root.field_bytes(),
        PAUSED => c.paused.field_bytes(),
        FEATURE_FLAGS => c.feature_flags.field_bytes(),
        MUTAV_CAPITAL_WALLET => c.mutav_capital_wallet.field_bytes(),
        CAPS_MAX_TVL => c.caps.max_tvl.field_bytes(),
        CAPS_MAX_COVER_PER_GUARANTEE => c.caps.max_cover_per_guarantee.field_bytes(),
        CAPS_MAX_CLAIM_PER_CALL => c.caps.max_claim_per_call.field_bytes(),
        CAPS_MAX_CLAIM_PER_PERIOD => c.caps.max_claim_per_period.field_bytes(),
        CAPS_MIN_REQUEST => c.caps.min_request.field_bytes(),
        CAPS_MAX_REQUEST => c.caps.max_request.field_bytes(),
        MAX_NAV_MOVE_BPS => c.caps.max_nav_move_bps.field_bytes(),
        other => panic!("field id {other} has no value mapping in this test"),
    }
}

/// Changes only field `id` in `set_config` args. Returns `false` if the field
/// is not a `set_config` field.
fn change_in_set_config(a: &mut SetConfigArgs, id: u16) -> bool {
    use field::*;
    match id {
        COVERAGE_RATIO_BPS => a.coverage_ratio_bps += 1,
        FEE_TAKE_BPS => a.fee_take_bps += 1,
        MUTAV_CAPITAL_WALLET => a.mutav_capital_wallet = Pubkey::new_unique(),
        CAPS_MAX_TVL => a.caps.max_tvl += 1,
        CAPS_MAX_COVER_PER_GUARANTEE => a.caps.max_cover_per_guarantee += 1,
        CAPS_MAX_CLAIM_PER_CALL => a.caps.max_claim_per_call += 1,
        CAPS_MAX_CLAIM_PER_PERIOD => a.caps.max_claim_per_period += 1,
        CAPS_MIN_REQUEST => a.caps.min_request += 1,
        CAPS_MAX_REQUEST => a.caps.max_request += 1,
        MAX_NAV_MOVE_BPS => a.caps.max_nav_move_bps += 1,
        _ => return false,
    }
    true
}

/// Writes `feature_flags` directly into the account, as a newer binary could.
fn inject_feature_flags(f: &mut Fixture, flags: u64) {
    let mut c = f.config();
    c.feature_flags = flags;
    let mut acc = f.svm.get_account(&f.pdas.config).unwrap();
    let mut data = VaultConfig::DISCRIMINATOR.to_vec();
    c.serialize(&mut data).unwrap();
    acc.data[..data.len()].copy_from_slice(&data);
    f.svm.set_account(f.pdas.config, acc).unwrap();
    assert_eq!(
        VaultConfig::try_deserialize(
            &mut f.svm.get_account(&f.pdas.config).unwrap().data.as_slice()
        )
        .unwrap()
        .feature_flags,
        flags
    );
}

/// Changes field `id` through its instruction and returns the transaction.
fn change_field(f: &mut Fixture, id: u16) -> litesvm::types::TransactionMetadata {
    let admin = f.admin.insecure_clone();
    let a = admin.pubkey();
    let pauser = f.config().pauser;
    let operator = f.config().operator;
    match id {
        field::OPERATOR => {
            let ix = f.set_roles_ix(&a, Pubkey::new_unique(), pauser);
            f.send(ix, &admin)
        }
        field::PAUSER => {
            let ix = f.set_roles_ix(&a, operator, Pubkey::new_unique());
            f.send(ix, &admin)
        }
        field::PAYMENTS_ACCOUNT => {
            let new = f.token_account(&Pubkey::new_unique());
            let treasury = f.config().treasury_account;
            let ix = f.set_payments_account_ix(&a, &new, &treasury);
            f.send(ix, &admin)
        }
        field::TREASURY_ACCOUNT => {
            let new = f.token_account(&Pubkey::new_unique());
            let args = set_config_args(&f.config());
            let ix = f.set_config_ix(&a, args, &new);
            f.send(ix, &admin)
        }
        field::INVESTOR_ALLOWLIST_ROOT => {
            let ix = f.set_allowlist_root_ix(&a, [42; 32]);
            f.send(ix, &admin)
        }
        field::PAUSED => {
            let ix = f.pause_ix(&a);
            f.send(ix, &admin)
        }
        // The pilot cannot set a feature bit, but clearing one is always
        // allowed: inject `INSTANT_EXIT` as a newer binary would have, then
        // clear it.
        // (The caller injects the bit before taking its snapshot.)
        field::FEATURE_FLAGS => {
            let mut args = set_config_args(&f.config());
            args.feature_flags = 0;
            f.set_config(args)
        }
        id => {
            let mut args = set_config_args(&f.config());
            assert!(
                change_in_set_config(&mut args, id),
                "mutable field {id} has no event path"
            );
            f.set_config(args)
        }
    }
    .unwrap_or_else(|e| {
        panic!(
            "changing field {id}: {:?}\n{}",
            e.err,
            e.meta.logs.join("\n")
        )
    })
}

#[test]
fn every_mutable_config_field_emits_config_updated() {
    let mut f = Fixture::new();
    let mut covered = 0;
    for row in CONFIG_FIELDS {
        if row.id == field::FEATURE_FLAGS {
            inject_feature_flags(&mut f, INSTANT_EXIT);
        }
        let before = f.config();
        // Every row maps to a value (catches a table entry with no field).
        let _ = value_bytes(&before, row.id);
        if !row.mutable {
            continue;
        }
        let meta = change_field(&mut f, row.id);
        let after = f.config();
        let ev = events::<ConfigUpdated>(&meta);
        assert_eq!(
            ev.len(),
            1,
            "{}: expected one ConfigUpdated, got {:?}",
            row.name,
            ev.iter().map(|e| e.field).collect::<Vec<_>>()
        );
        let e = &ev[0];
        assert_eq!(e.field, row.id, "{}", row.name);
        assert_eq!(e.config, f.pdas.config);
        assert_eq!(e.old, value_bytes(&before, row.id), "{} old", row.name);
        assert_eq!(e.new, value_bytes(&after, row.id), "{} new", row.name);
        assert_ne!(e.old, e.new, "{}", row.name);
        covered += 1;
    }
    assert_eq!(
        covered,
        CONFIG_FIELDS.iter().filter(|r| r.mutable).count(),
        "every mutable field was exercised"
    );
}

#[test]
fn fixed_fields_have_no_path() {
    let fixed: Vec<&str> = CONFIG_FIELDS
        .iter()
        .filter(|r| !r.mutable)
        .map(|r| r.name)
        .collect();
    assert_eq!(
        fixed,
        vec![
            "admin",
            "reserve_mint",
            "reserve_token_program",
            "reserve_decimals",
            "share_mint"
        ]
    );
    // `set_config` args carry none of them (compile-time: `SetConfigArgs` has
    // no such fields); `reserve_mint_and_token_program_never_change` in
    // `set_config.rs` checks the values survive every update.
}

#[test]
fn many_fields_in_one_set_config() {
    let mut f = Fixture::new();
    let before = f.config();
    let mut args = set_config_args(&before);
    let ids: Vec<u16> = CONFIG_FIELDS
        .iter()
        .map(|r| r.id)
        .filter(|&id| {
            let mut probe = args.clone();
            change_in_set_config(&mut probe, id)
        })
        .collect();
    for &id in &ids {
        change_in_set_config(&mut args, id);
    }
    let admin = f.admin.insecure_clone();
    let treasury = before.treasury_account;
    let ix = f.set_config_ix(&admin.pubkey(), args, &treasury);
    let cu_ix = anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
        Pubkey::from_str_const("ComputeBudget111111111111111111111111111111"),
        &[&[2u8][..], &1_400_000u32.to_le_bytes()].concat(),
        vec![],
    );
    let payer = f.payer.insecure_clone();
    let meta = send_ixs(&mut f.svm, &[cu_ix, ix], &[&payer, &admin]).expect("bulk set_config");
    let got: Vec<u16> = events::<ConfigUpdated>(&meta)
        .iter()
        .map(|e| e.field)
        .collect();
    assert_eq!(got, ids, "one event per changed field, in table order");
    println!(
        "set_config changing {} fields: {} CU",
        ids.len(),
        meta.compute_units_consumed
    );
}
