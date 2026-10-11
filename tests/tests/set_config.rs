//! `set_config(params)`, `set_payments_account` and `set_treasury_account`
//! (spec §5.1, §2.1, §14.3; ADR 0026).

use anchor_lang::prelude::Pubkey;
use mutav::{
    constants::*,
    errors::MutavError,
    events::{ConfigUpdated, PaymentsAccountUpdated, TreasuryAccountUpdated},
    ConfigParam::{self, *},
};
use mutav_tests::helpers::*;
use solana_signer::Signer;

fn fields(meta: &litesvm::types::TransactionMetadata) -> Vec<u16> {
    events::<ConfigUpdated>(meta)
        .iter()
        .map(|e| e.field)
        .collect()
}

#[test]
fn unchanged_params_change_nothing() {
    let mut f = Fixture::new();
    let before = f.config();
    let meta = f.set_config(all_params(&before)).expect("no-op set_config");
    assert!(events::<ConfigUpdated>(&meta).is_empty());
    assert_eq!(f.config().caps, before.caps);
    // An empty list is refused: a proposal that changes nothing is a
    // mistake.
    assert_mutav_err(f.set_config(vec![]), MutavError::InvalidParameter);
}

#[test]
fn only_the_listed_fields_change() {
    let mut f = Fixture::new();
    let before = f.config();
    let meta = f
        .set_config(vec![
            MaxTvl(before.caps.max_tvl + 1),
            FeeTakeBps(before.fee_take_bps),
            StressBuffer(19_000 * BRL),
        ])
        .expect("set_config");
    let c = f.config();
    assert_eq!(c.caps.max_tvl, before.caps.max_tvl + 1);
    assert_eq!(c.caps.stress_buffer, 19_000 * BRL);
    // One event per changed field, none for the unchanged value, in order.
    assert_eq!(
        fields(&meta),
        vec![field::CAPS_MAX_TVL, field::CAPS_STRESS_BUFFER]
    );
    let mut expect = before.clone();
    expect.caps.max_tvl += 1;
    expect.caps.stress_buffer = 19_000 * BRL;
    assert_eq!(format!("{:?}", c.caps), format!("{:?}", expect.caps));
    assert_eq!(c.coverage_ratio_bps, before.coverage_ratio_bps);
    assert_eq!(c.treasury_account, before.treasury_account);
}

#[test]
fn the_carved_caps_are_settable() {
    let mut f = Fixture::new();
    f.set_config(vec![
        StressBuffer(19_000 * BRL),
        MaxQueueWaitSecs(7 * 86_400),
        MaxReinstateAge(30 * 86_400),
    ])
    .expect("carved caps");
    let k = f.config().caps;
    assert_eq!(
        (k.stress_buffer, k.max_queue_wait_secs, k.max_reinstate_age),
        (19_000 * BRL, 7 * 86_400, 30 * 86_400)
    );
    for p in [
        MaxQueueWaitSecs(-1),
        MaxReinstateAge(-1),
        MaxReinstateAge(i64::MIN),
    ] {
        assert_mutav_err(f.set_config(vec![p]), MutavError::InvalidParameter);
    }
}

#[test]
fn duplicates_and_long_lists_are_refused() {
    let mut f = Fixture::new();
    let c = f.config();
    assert_mutav_err(
        f.set_config(vec![MaxTvl(1), MinRequest(1), MaxTvl(2)]),
        MutavError::DuplicateParam,
    );
    // The same value twice is still a duplicate.
    assert_mutav_err(
        f.set_config(vec![FeeTakeBps(0), FeeTakeBps(0)]),
        MutavError::DuplicateParam,
    );
    // More than 16 params, even with no duplicate field among the first 16.
    let mut long = all_params(&c);
    long.extend(
        all_params(&c)
            .into_iter()
            .take(MAX_CONFIG_PARAMS - long.len() + 1),
    );
    assert_eq!(long.len(), MAX_CONFIG_PARAMS + 1);
    assert_mutav_err(f.set_config(long), MutavError::InvalidParameter);
    assert_eq!(f.config().caps, c.caps);
}

#[test]
fn reserve_mint_and_token_program_never_change() {
    let mut f = Fixture::new();
    let before = f.config();
    // `set_config` carries no mint, token program, decimals or share mint;
    // change everything it can and check those stay put.
    let mut params = all_params(&before);
    params[0] = CoverageRatioBps(5_000);
    params[1] = FeeTakeBps(100);
    params[3] = MutavCapitalWallet(Pubkey::new_unique());
    params[4] = MaxTvl(before.caps.max_tvl + 1);
    f.set_config(params).expect("set_config");
    let c = f.config();
    assert_eq!(c.reserve_mint, before.reserve_mint);
    assert_eq!(c.reserve_token_program, before.reserve_token_program);
    assert_eq!(c.reserve_decimals, before.reserve_decimals);
    assert_eq!(c.share_mint, before.share_mint);
    assert_eq!(c.admin, before.admin);
    assert_eq!(f.pdas.config, Pdas::new(&before.reserve_mint).config);
}

#[test]
fn single_field_bounds() {
    let mut f = Fixture::new();

    assert_mutav_err(
        f.set_config(vec![FeeTakeBps(MAX_FEE_TAKE_BPS + 1)]),
        MutavError::InvalidParameter,
    );
    f.set_config(vec![FeeTakeBps(MAX_FEE_TAKE_BPS)])
        .expect("3_000 bps allowed");
    f.set_config(vec![FeeTakeBps(0)]).expect("0 bps allowed");

    // 0.10 ≤ c ≤ 1.0.
    for c in [MIN_COVERAGE_RATIO_BPS, 5_000, MAX_COVERAGE_RATIO_BPS] {
        f.set_config(vec![CoverageRatioBps(c)])
            .expect("c inside the bounds");
        assert_eq!(f.config().coverage_ratio_bps, c);
    }
    let refused: Vec<ConfigParam> = vec![
        CoverageRatioBps(MIN_COVERAGE_RATIO_BPS - 1),
        CoverageRatioBps(0),
        CoverageRatioBps(MAX_COVERAGE_RATIO_BPS + 1),
        CoverageRatioBps(u16::MAX),
        MaxNavMoveBps(10_001),
        MaxTvl(0),
        MaxCoverPerGuarantee(0),
        MaxClaimPerCall(0),
        MinRequest(0),
        MutavCapitalWallet(Pubkey::default()),
    ];
    for p in refused {
        assert_mutav_err(f.set_config(vec![p]), MutavError::InvalidParameter);
    }
    f.set_config(vec![MaxNavMoveBps(10_000)])
        .expect("100% NAV move bound");
}

#[test]
fn cross_field_rules_hold_whatever_is_listed() {
    let mut f = Fixture::new();
    let k = f.config().caps;

    // min_request ≤ max_request, from either side.
    assert_mutav_err(
        f.set_config(vec![MinRequest(k.max_request + 1)]),
        MutavError::InvalidParameter,
    );
    assert_mutav_err(
        f.set_config(vec![MaxRequest(k.min_request - 1)]),
        MutavError::InvalidParameter,
    );
    f.set_config(vec![MinRequest(k.max_request)])
        .expect("min = max");

    // max_claim_per_period ≥ max_claim_per_call, from either side.
    assert_mutav_err(
        f.set_config(vec![MaxClaimPerCall(k.max_claim_per_period + 1)]),
        MutavError::InvalidParameter,
    );
    assert_mutav_err(
        f.set_config(vec![MaxClaimPerPeriod(k.max_claim_per_call - 1)]),
        MutavError::InvalidParameter,
    );
    // Both in one call: checked on the result, not field by field.
    f.set_config(vec![
        MaxClaimPerCall(k.max_claim_per_period + 1),
        MaxClaimPerPeriod(k.max_claim_per_period + 1),
    ])
    .expect("raise both");
    let k2 = f.config().caps;
    assert_eq!(k2.max_claim_per_call, k2.max_claim_per_period);

    // A refused call changes nothing at all.
    let before = f.config().caps;
    assert_mutav_err(
        f.set_config(vec![MaxTvl(1), MinRequest(0)]),
        MutavError::InvalidParameter,
    );
    assert_eq!(f.config().caps, before);
}

#[test]
fn unsupported_feature_bits_fail_closed() {
    let mut f = Fixture::new();
    for bit in 0..64 {
        assert_mutav_err(
            f.set_config(vec![FeatureFlags(1u64 << bit)]),
            MutavError::FeatureNotSupported,
        );
    }
    for flags in [INSTANT_EXIT, u64::MAX] {
        assert_mutav_err(
            f.set_config(vec![FeatureFlags(flags)]),
            MutavError::FeatureNotSupported,
        );
    }
    assert_eq!(f.config().feature_flags, 0);
}

#[test]
fn a_stored_unsupported_bit_blocks_set_config_until_cleared() {
    // A bit written by a newer binary fails closed: every `set_config` is
    // refused until the call also clears it.
    let mut f = Fixture::new();
    let mut c = f.config();
    c.feature_flags = INSTANT_EXIT;
    f.write_config(&c);
    assert_mutav_err(
        f.set_config(vec![MaxTvl(c.caps.max_tvl + 1)]),
        MutavError::FeatureNotSupported,
    );
    let meta = f
        .set_config(vec![MaxTvl(c.caps.max_tvl + 1), FeatureFlags(0)])
        .expect("clear flags");
    assert_eq!(f.config().feature_flags, 0);
    assert_eq!(
        fields(&meta),
        vec![field::CAPS_MAX_TVL, field::FEATURE_FLAGS]
    );
}

#[test]
fn the_capital_wallet_owns_no_money_account() {
    let mut f = Fixture::new();
    for owner in [f.treasury_owner, f.payments_owner] {
        assert_mutav_err(
            f.set_config(vec![MutavCapitalWallet(owner)]),
            MutavError::InvalidParameter,
        );
    }
    let w = Pubkey::new_unique();
    f.set_config(vec![MutavCapitalWallet(w)]).unwrap();
    assert_eq!(f.config().mutav_capital_wallet, w);
}

#[test]
fn set_config_checks_its_money_accounts() {
    let mut f = Fixture::new();
    let admin = f.admin.insecure_clone();
    // A treasury other than the configured one.
    let mut ix = f.set_config_ix(&admin.pubkey(), vec![MaxTvl(1)]);
    ix.accounts[3].pubkey = f.token_account(&Pubkey::new_unique());
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidTreasuryAccount);
    let mut ix = f.set_config_ix(&admin.pubkey(), vec![MaxTvl(1)]);
    ix.accounts[4].pubkey = f.token_account(&Pubkey::new_unique());
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidPaymentsAccount);
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

    // Owned by the operator (ADR 0020).
    let operator = f.operator.pubkey();
    let owned_by_operator = f.token_account(&operator);
    let ix = f.set_payments_account_ix(&a, &owned_by_operator, &treasury);
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidPaymentsAccount);

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
    assert_eq!(fields(&meta), vec![field::PAYMENTS_ACCOUNT]);
}

#[test]
fn set_treasury_account_rules() {
    let mut f = Fixture::new();
    // Fees need shares outstanding (ADR 0023).
    f.inject_shares(1_000 * BRL);
    let admin = f.admin.insecure_clone();
    let a = admin.pubkey();
    let payments = f.payments;

    // Equal to the payments account.
    let ix = f.set_treasury_account_ix(&a, &payments);
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidParameter);
    // Owned by the capital wallet.
    let owned = f.token_account(&f.mutav_capital_wallet.pubkey());
    let ix = f.set_treasury_account_ix(&a, &owned);
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidParameter);
    // Owned by the operator (ADR 0020).
    let owned = f.token_account(&f.operator.pubkey());
    let ix = f.set_treasury_account_ix(&a, &owned);
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidTreasuryAccount);
    // A reserve account.
    for acct in [f.pdas.claims, f.pdas.reserve, f.pdas.unsolicited] {
        let ix = f.set_treasury_account_ix(&a, &acct);
        assert_mutav_err(f.send(ix, &admin), MutavError::InvalidParameter);
    }
    // Another mint.
    let payer = f.payer.insecure_clone();
    let other_mint = create_brs_mint(&mut f.svm, &payer, &Pubkey::new_unique());
    let wrong = create_token_account(
        &mut f.svm,
        &payer,
        &other_mint,
        &Pubkey::new_unique(),
        &TOKEN_PROGRAM,
    );
    let ix = f.set_treasury_account_ix(&a, &wrong);
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidMint);
    // A payments account other than the configured one.
    let new_treasury = f.token_account(&Pubkey::new_unique());
    let mut ix = f.set_treasury_account_ix(&a, &new_treasury);
    ix.accounts[3].pubkey = f.token_account(&Pubkey::new_unique());
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidPaymentsAccount);
    assert_eq!(f.config().treasury_account, f.treasury);

    // Valid.
    let ix = f.set_treasury_account_ix(&a, &new_treasury);
    let meta = f.send(ix, &admin).expect("move treasury");
    assert_eq!(f.config().treasury_account, new_treasury);
    assert_eq!(fields(&meta), vec![field::TREASURY_ACCOUNT]);
    let ev = events::<TreasuryAccountUpdated>(&meta);
    assert_eq!((ev[0].old, ev[0].new), (f.treasury, new_treasury));
    // The fee take follows the new treasury.
    let (res, _) = f.contribute(1_000 * BRL);
    res.expect("contribute");
    assert_eq!(f.balance(&new_treasury), 200 * BRL);
}

#[test]
fn payments_cannot_be_a_reserve_account() {
    let mut f = Fixture::new();
    let admin = f.admin.insecure_clone();
    let treasury = f.treasury;
    for acct in [f.pdas.claims, f.pdas.reserve, f.pdas.unsolicited] {
        let ix = f.set_payments_account_ix(&admin.pubkey(), &acct, &treasury);
        assert_mutav_err(f.send(ix, &admin), MutavError::InvalidParameter);
    }
    assert_eq!(f.config().payments_account, f.payments);
}

#[test]
fn a_new_coverage_ratio_recomputes_the_cached_coverage_required() {
    // #29: the cached `coverage_required` follows `c` at once instead of at
    // the next `refresh` (c 1.0 → 0.10 used to leave it 10× too high).
    let mut f = Fixture::new();
    f.fund_reserve(50_000 * BRL);
    f.register(guarantee_args(unique_hash(), 20_001 * BRL, 0))
        .unwrap();
    let s = f.state();
    let cover = s.remaining_cover_total;
    assert_eq!(s.coverage_required, cover, "c = 1.0");
    let mode = s.mode;

    f.set_config(vec![CoverageRatioBps(1_000)]).unwrap();
    let s = f.state();
    // ceil(0.10 × cover), in the reserve's favour.
    assert_eq!(s.coverage_required, cover.div_ceil(10));
    assert_eq!(s.mode, mode, "mode is left to refresh");

    // An unchanged `c` leaves it as it is.
    f.set_config(all_params(&f.config())).unwrap();
    assert_eq!(f.state().coverage_required, cover.div_ceil(10));
}

#[test]
fn a_change_to_c_the_nav_bound_or_the_stress_buffer_needs_a_refresh_first() {
    // These fields move the coverage figures or the NAV-move guard: the
    // admin bundles `refresh` before `set_config` in the same transaction.
    let mut f = Fixture::new();
    // Away from slot 0, where a never-refreshed state would look current.
    let mut clk = clock(&f.svm);
    clk.slot = 100;
    f.svm.set_sysvar(&clk);
    let k = f.config().caps;
    for p in [
        CoverageRatioBps(5_000),
        MaxNavMoveBps(k.max_nav_move_bps + 1),
        StressBuffer(1),
    ] {
        // A new slot: the last refresh is now in the past.
        let mut clk = clock(&f.svm);
        clk.slot += 1;
        f.svm.set_sysvar(&clk);
        assert_mutav_err(f.set_config_alone(vec![p]), MutavError::RefreshRequired);
        f.set_config(vec![p]).expect("with a refresh first");
    }
    // An unchanged value, or any other field, needs no refresh.
    let c = f.config();
    f.set_config_alone(vec![
        CoverageRatioBps(c.coverage_ratio_bps),
        StressBuffer(c.caps.stress_buffer),
        MaxTvl(c.caps.max_tvl + 1),
        FeeTakeBps(0),
    ])
    .expect("no refresh needed");
    // A refresh in an earlier slot does not count.
    f.refresh().unwrap();
    let mut clk = clock(&f.svm);
    clk.slot += 1;
    f.svm.set_sysvar(&clk);
    assert_mutav_err(
        f.set_config_alone(vec![CoverageRatioBps(6_000)]),
        MutavError::RefreshRequired,
    );
}

// ===========================================================================
// A closed money account never blocks recovery
// ===========================================================================

/// Closes `addr` as the token program would: no data, owned by the system
/// program. `lamports` may stay non-zero (anyone can send lamports to a
/// closed address).
fn close(f: &mut Fixture, addr: &Pubkey, lamports: u64) {
    let mut acc = f.svm.get_account(addr).expect("account");
    acc.data = vec![];
    acc.owner = anchor_lang::solana_program::system_program::ID;
    acc.lamports = lamports;
    f.svm.set_account(*addr, acc).expect("set_account");
}

#[test]
fn closed_money_accounts_block_neither_config_nor_roles_nor_replacement() {
    let mut f = Fixture::new();
    let admin = f.admin.insecure_clone();
    let a = admin.pubkey();
    let (treasury, payments) = (f.treasury, f.payments);
    close(&mut f, &treasury, 0);
    close(&mut f, &payments, 1_000_000);

    // set_config still works.
    let min = f.config().caps.min_request + 1;
    f.set_config(vec![MinRequest(min)])
        .expect("set_config with both money accounts closed");
    assert_eq!(f.config().caps.min_request, min);

    // A new operator and a new pauser still accept their roles.
    let op = solana_keypair::Keypair::new();
    f.svm.airdrop(&op.pubkey(), 1_000_000_000).unwrap();
    f.handover(ROLE_OPERATOR, &op).expect("operator handover");
    assert_eq!(f.config().operator, op.pubkey());
    let pauser = solana_keypair::Keypair::new();
    f.svm.airdrop(&pauser.pubkey(), 1_000_000_000).unwrap();
    f.handover(ROLE_PAUSER, &pauser).expect("pauser handover");

    // The treasury is replaced while the payments account is closed...
    let t2 = f.token_account(&Pubkey::new_unique());
    let ix = f.set_treasury_account_ix(&a, &t2);
    f.send(ix, &admin).expect("replace the treasury");
    assert_eq!(f.config().treasury_account, t2);
    // ...the new treasury's rules still hold (not the operator's account)...
    let owned = f.token_account(&op.pubkey());
    let ix = f.set_treasury_account_ix(&a, &owned);
    assert_mutav_err(f.send(ix, &admin), MutavError::InvalidTreasuryAccount);
    // ...and the payments account is replaced while the treasury is closed.
    close(&mut f, &t2, 0);
    let p2_owner = Pubkey::new_unique();
    let p2 = f.token_account(&p2_owner);
    let ix = f.set_payments_account_ix(&a, &p2, &t2);
    f.send(ix, &admin).expect("replace the payments account");
    assert_eq!(f.config().payments_account, p2);
    let t3 = f.token_account(&Pubkey::new_unique());
    let ix = f.set_treasury_account_ix(&a, &t3);
    f.send(ix, &admin).expect("replace the treasury again");

    // Open again: an open current account keeps its rules (the capital
    // wallet owns no money account).
    assert_mutav_err(
        f.set_config(vec![MutavCapitalWallet(p2_owner)]),
        MutavError::InvalidParameter,
    );
}

#[test]
fn an_open_operator_owned_money_account_still_blocks_the_operator() {
    // Only a closed account is skipped: an open one owned by the proposed
    // operator is still refused at acceptance (ADR 0020).
    let mut f = Fixture::new();
    let admin = f.admin.insecure_clone();
    let op = solana_keypair::Keypair::new();
    f.svm.airdrop(&op.pubkey(), 1_000_000_000).unwrap();
    let owned = f.token_account(&op.pubkey());
    let ix = f.set_payments_account_ix(&admin.pubkey(), &owned, &f.treasury.clone());
    f.send(ix, &admin).expect("payments owned by a future key");
    let treasury = f.treasury;
    close(&mut f, &treasury, 0);
    assert_mutav_err(
        f.handover(ROLE_OPERATOR, &op),
        MutavError::InvalidPaymentsAccount,
    );
}

#[test]
fn only_a_token_account_or_a_closed_account_passes_at_a_money_address() {
    // Only a system-owned account with no data counts as closed; anything
    // else at the address must decode as a token account of the reserve
    // mint.
    let refused = |edit: &dyn Fn(&mut Fixture, &Pubkey), err: MutavError| {
        let mut f = Fixture::new();
        let treasury = f.treasury;
        edit(&mut f, &treasury);
        let min = f.config().caps.min_request + 1;
        assert_mutav_err(f.set_config(vec![MinRequest(min)]), err);
    };
    // Data owned by the system program.
    refused(
        &|f, t| {
            let mut acc = f.svm.get_account(t).unwrap();
            acc.owner = anchor_lang::solana_program::system_program::ID;
            f.svm.set_account(*t, acc).unwrap();
        },
        MutavError::InvalidTreasuryAccount,
    );
    // An empty account owned by another program is not "closed".
    refused(
        &|f, t| {
            let mut acc = f.svm.get_account(t).unwrap();
            acc.data = vec![];
            acc.owner = mutav::ID;
            f.svm.set_account(*t, acc).unwrap();
        },
        MutavError::InvalidTreasuryAccount,
    );
    // A mint of the token program at the address.
    refused(
        &|f, t| {
            let mint = f.svm.get_account(&f.reserve_mint).unwrap();
            f.svm.set_account(*t, mint).unwrap();
        },
        MutavError::InvalidTreasuryAccount,
    );
    // A token account of another mint.
    refused(
        &|f, t| {
            let payer = f.payer.insecure_clone();
            let other_mint = create_brs_mint(&mut f.svm, &payer, &Pubkey::new_unique());
            let other = create_token_account(
                &mut f.svm,
                &payer,
                &other_mint,
                &Pubkey::new_unique(),
                &TOKEN_PROGRAM,
            );
            let acc = f.svm.get_account(&other).unwrap();
            f.svm.set_account(*t, acc).unwrap();
        },
        MutavError::InvalidMint,
    );
}
