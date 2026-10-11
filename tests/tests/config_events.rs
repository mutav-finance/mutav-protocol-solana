//! `ConfigUpdated` coverage (spec §9): walks the field-id table in
//! `constants.rs` and checks that every mutable `VaultConfig` field has an
//! event path, with the right id and the right old/new encoding.

use anchor_lang::{prelude::Pubkey, AccountDeserialize, AnchorSerialize, Discriminator};
use mutav::{
    constants::{field, CONFIG_FIELDS, INSTANT_EXIT, ROLE_OPERATOR, ROLE_PAUSER},
    events::{ConfigUpdated, FieldBytes},
    state::VaultConfig,
    ConfigParam,
};
use mutav_tests::helpers::*;
use solana_keypair::Keypair;
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
        PENDING_ADMIN => c.pending_admin.field_bytes(),
        PENDING_OPERATOR => c.pending_operator.field_bytes(),
        PENDING_PAUSER => c.pending_pauser.field_bytes(),
        GUARDIAN_0 => c.guardians[0].field_bytes(),
        GUARDIAN_1 => c.guardians[1].field_bytes(),
        GUARDIAN_2 => c.guardians[2].field_bytes(),
        CAPS_STRESS_BUFFER => c.caps.stress_buffer.field_bytes(),
        CAPS_MAX_QUEUE_WAIT_SECS => c.caps.max_queue_wait_secs.field_bytes(),
        CAPS_MAX_REINSTATE_AGE => c.caps.max_reinstate_age.field_bytes(),
        other => panic!("field id {other} has no value mapping in this test"),
    }
}

/// A `set_config` param that changes only field `id`, or `None` if the field
/// is not a `set_config` field.
fn change_in_set_config(c: &VaultConfig, id: u16) -> Option<ConfigParam> {
    use field::*;
    use ConfigParam::*;
    let k = &c.caps;
    Some(match id {
        COVERAGE_RATIO_BPS => CoverageRatioBps(c.coverage_ratio_bps - 1),
        FEE_TAKE_BPS => FeeTakeBps(c.fee_take_bps + 1),
        MUTAV_CAPITAL_WALLET => MutavCapitalWallet(Pubkey::new_unique()),
        CAPS_MAX_TVL => MaxTvl(k.max_tvl + 1),
        CAPS_MAX_COVER_PER_GUARANTEE => MaxCoverPerGuarantee(k.max_cover_per_guarantee + 1),
        CAPS_MAX_CLAIM_PER_CALL => MaxClaimPerCall(k.max_claim_per_call + 1),
        CAPS_MAX_CLAIM_PER_PERIOD => MaxClaimPerPeriod(k.max_claim_per_period + 1),
        CAPS_MIN_REQUEST => MinRequest(k.min_request + 1),
        CAPS_MAX_REQUEST => MaxRequest(k.max_request + 1),
        MAX_NAV_MOVE_BPS => MaxNavMoveBps(k.max_nav_move_bps + 1),
        CAPS_STRESS_BUFFER => StressBuffer(k.stress_buffer + 1),
        CAPS_MAX_QUEUE_WAIT_SECS => MaxQueueWaitSecs(k.max_queue_wait_secs + 1),
        CAPS_MAX_REINSTATE_AGE => MaxReinstateAge(k.max_reinstate_age + 1),
        _ => return None,
    })
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
    let fresh = |f: &mut Fixture| {
        let k = Keypair::new();
        f.svm.airdrop(&k.pubkey(), 1_000_000_000).unwrap();
        k
    };
    match id {
        // An acceptance changes the role and clears the pending key; a
        // proposal changes the pending key only.
        field::OPERATOR | field::PAUSER => {
            let role = if id == field::OPERATOR {
                ROLE_OPERATOR
            } else {
                ROLE_PAUSER
            };
            let k = fresh(f);
            let ix = f.propose_role_ix(&a, role, k.pubkey());
            f.send(ix, &admin).unwrap();
            let ix = f.accept_role_ix(&k.pubkey(), role);
            f.send(ix, &k)
        }
        field::PENDING_OPERATOR => {
            let ix = f.propose_role_ix(&a, ROLE_OPERATOR, Pubkey::new_unique());
            f.send(ix, &admin)
        }
        field::PENDING_PAUSER => {
            let ix = f.propose_role_ix(&a, ROLE_PAUSER, Pubkey::new_unique());
            f.send(ix, &admin)
        }
        field::PENDING_ADMIN => {
            let ix = f.propose_admin_ix(&a, Pubkey::new_unique());
            f.send(ix, &admin)
        }
        field::ADMIN => {
            let k = fresh(f);
            let ix = f.propose_admin_ix(&a, k.pubkey());
            f.send(ix, &admin).unwrap();
            let res = f.send(f.accept_admin_ix(&k.pubkey()), &k);
            f.admin = k;
            res
        }
        field::GUARDIAN_0 | field::GUARDIAN_1 | field::GUARDIAN_2 => {
            let mut g = f.config().guardians;
            g[(id - field::GUARDIAN_0) as usize] = Pubkey::new_unique();
            let ix = f.set_guardians_ix(&a, g);
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
            let ix = f.set_treasury_account_ix(&a, &new);
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
        // allowed: the caller injects `INSTANT_EXIT` as a newer binary would
        // have, then this clears it.
        field::FEATURE_FLAGS => f.set_config(vec![ConfigParam::FeatureFlags(0)]),
        id => {
            let p = change_in_set_config(&f.config(), id)
                .unwrap_or_else(|| panic!("mutable field {id} has no event path"));
            f.set_config(vec![p])
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
        // An acceptance also clears its pending key; every other path changes
        // one field. Either way the field appears exactly once.
        let ev: Vec<ConfigUpdated> = events::<ConfigUpdated>(&meta)
            .into_iter()
            .filter(|e| e.field == row.id)
            .collect();
        assert_eq!(ev.len(), 1, "{}: expected one ConfigUpdated", row.name);
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
            "reserve_mint",
            "reserve_token_program",
            "reserve_decimals",
            "share_mint"
        ]
    );
    // `set_config` args carry none of them (compile-time: `ConfigParam` has
    // no such variants); `reserve_mint_and_token_program_never_change` in
    // `set_config.rs` checks the values survive every update.
}

#[test]
fn many_fields_in_one_set_config() {
    let mut f = Fixture::new();
    let before = f.config();
    let params: Vec<ConfigParam> = CONFIG_FIELDS
        .iter()
        .filter_map(|r| change_in_set_config(&before, r.id))
        .collect();
    let ids: Vec<u16> = params.iter().map(|p| p.field()).collect();
    let admin = f.admin.insecure_clone();
    let ix = f.set_config_ix(&admin.pubkey(), params);
    let payer = f.payer.insecure_clone();
    let refresh = f.refresh_ix();
    let meta = send_ixs(&mut f.svm, &[refresh, ix], &[&payer, &admin]).expect("bulk set_config");
    let got: Vec<u16> = events::<ConfigUpdated>(&meta)
        .iter()
        .map(|e| e.field)
        .collect();
    assert_eq!(got, ids, "one event per changed field, in param order");
    println!(
        "set_config changing {} fields: {} CU",
        ids.len(),
        meta.compute_units_consumed
    );
}
