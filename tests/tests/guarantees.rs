//! `register_guarantee` and `close_guarantee` (spec §3.4, §3.5, §5.2; plan
//! Task 3): happy paths, every error, the role and pause rules, the version
//! guard, padding, and the `remaining_cover_total` invariant.

use mutav::{
    constants::*,
    errors::MutavError,
    events::{GuaranteeClosed, GuaranteeRegistered},
};
use mutav_tests::helpers::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

fn agency() -> [u8; 32] {
    unique_hash()
}

// ---------------------------------------------------------------------------
// register_guarantee
// ---------------------------------------------------------------------------

fn retired_agency_pda(
    config: &anchor_lang::prelude::Pubkey,
    agency_id: &[u8; 32],
) -> anchor_lang::prelude::Pubkey {
    anchor_lang::prelude::Pubkey::find_program_address(
        &[RETIRED_SEEDS[0], config.as_ref(), agency_id],
        &mutav::ID,
    )
    .0
}

#[test]
fn register_creates_the_guarantee_and_books_the_cover() {
    let mut f = Fixture::new();
    f.fund_reserve(50_000 * BRL);
    set_time(&mut f.svm, 1_700_000_000);
    let ag = agency();
    let args = guarantee_args(ag, 20_000 * BRL, 10_000 * BRL);
    let meta = f.register(args.clone()).expect("register");

    let g = f.guarantee(&args.id);
    assert_eq!(
        (g.version, g.status),
        (PROGRAM_LAYOUT_VERSION, GUARANTEE_ACTIVE)
    );
    assert_ne!(g.bump, 0);
    assert_eq!(
        (g.id, g.agency_id, g.refs_hash),
        (args.id, ag, args.refs_hash)
    );
    assert_eq!(
        (g.default_cover, g.exit_cover),
        (20_000 * BRL, 10_000 * BRL)
    );
    assert_eq!((g.default_paid, g.exit_paid), (0, 0));
    assert_eq!(
        (g.provision_default, g.provision_exit, g.open_claims),
        (0, 0, 0)
    );
    assert_eq!((g.registered_at, g.closed_at), (1_700_000_000, 0));

    // No per-agency account (ADR 0019): the retired seed stays empty.
    assert!(f
        .svm
        .get_account(&retired_agency_pda(&f.pdas.config, &ag))
        .is_none());

    let s = f.state();
    assert_eq!(s.remaining_cover_total, 30_000 * BRL);
    assert_eq!(s.coverage_required, 30_000 * BRL);
    assert_eq!(s.brs_balance, 50_000 * BRL);
    assert_eq!(s.active_guarantees, 1);

    let ev = events::<GuaranteeRegistered>(&meta);
    assert_eq!(ev.len(), 1);
    let e = &ev[0];
    assert_eq!((e.config, e.ts), (f.pdas.config, 1_700_000_000));
    assert_eq!(
        (e.id, e.agency_id, e.refs_hash),
        (args.id, ag, args.refs_hash)
    );
    assert_eq!(
        (e.default_cover, e.exit_cover),
        (20_000 * BRL, 10_000 * BRL)
    );
}

#[test]
fn guarantees_of_one_agency_are_not_capped_together() {
    // ADR 0019: only the per-guarantee cap applies. Three guarantees of one
    // agency at the per-guarantee cap all register.
    let mut f = Fixture::new();
    f.fund_reserve(90_000 * BRL);
    let ag = agency();
    for _ in 0..3 {
        f.register(guarantee_args(ag, 20_000 * BRL, 10_000 * BRL))
            .unwrap();
    }
    assert_eq!(f.state().active_guarantees, 3);
    assert_eq!(f.state().remaining_cover_total, 90_000 * BRL);
}

#[test]
fn duplicate_id_fails() {
    let mut f = Fixture::new();
    f.fund_reserve(60_000 * BRL);
    let args = guarantee_args(agency(), 10_000 * BRL, 0);
    f.register(args.clone()).unwrap();
    let before = f.state();
    // Same id, different agency and covers: still one guarantee per id.
    let mut again = guarantee_args(agency(), 5_000 * BRL, 0);
    again.id = args.id;
    assert_already_in_use(f.register(again));
    assert_eq!(
        f.state().remaining_cover_total,
        before.remaining_cover_total
    );
    assert_eq!(f.guarantee(&args.id).default_cover, 10_000 * BRL);
}

#[test]
fn zero_cover_is_invalid() {
    let mut f = Fixture::new();
    f.fund_reserve(10_000 * BRL);
    assert_mutav_err(
        f.register(guarantee_args(agency(), 0, 0)),
        MutavError::InvalidParameter,
    );
    // The smallest valid guarantee: one base unit of cover.
    f.register(guarantee_args(agency(), 0, 1))
        .expect("one base unit");
}

#[test]
fn cover_sum_overflow_errors() {
    let mut f = Fixture::new();
    f.fund_reserve(10_000 * BRL);
    assert_mutav_err(
        f.register(guarantee_args(agency(), u64::MAX, 1)),
        MutavError::MathOverflow,
    );
}

#[test]
fn register_rejects_a_non_operator() {
    let mut f = Fixture::new();
    f.fund_reserve(10_000 * BRL);
    let others = [
        f.admin.insecure_clone(),
        f.pauser.insecure_clone(),
        Keypair::new(),
    ];
    for k in &others {
        let ix = f.register_guarantee_ix(&k.pubkey(), guarantee_args(agency(), BRL, 0));
        assert_mutav_err(f.send(ix, k), MutavError::Unauthorized);
    }
    assert_eq!(f.state().active_guarantees, 0);
}

#[test]
fn register_is_refused_while_paused() {
    let mut f = Fixture::new();
    f.fund_reserve(10_000 * BRL);
    let pauser = f.pauser.insecure_clone();
    f.send(f.pause_ix(&pauser.pubkey()), &pauser).unwrap();
    let args = guarantee_args(agency(), 1_000 * BRL, 0);
    assert_mutav_err(f.register(args.clone()), MutavError::Paused);
    let admin = f.admin.insecure_clone();
    f.send(f.unpause_ix(&admin.pubkey()), &admin).unwrap();
    f.register(args).expect("after unpause");
}

#[test]
fn register_is_refused_in_under_coverage() {
    // Stored mode.
    let mut f = Fixture::new();
    f.fund_reserve(10_000 * BRL);
    let mut s = f.state();
    s.mode = MODE_UNDER_COVERED;
    f.write_state(&s);
    assert_mutav_err(
        f.register(guarantee_args(agency(), BRL, 0)),
        MutavError::UnderCovered,
    );

    // Checked inline (spec §6): `stable_assets < coverage_required` with the
    // stored mode still `Normal`.
    let mut f = Fixture::new();
    f.fund_reserve(10_000 * BRL);
    let mut s = f.state();
    s.remaining_cover_total = 10_000 * BRL + 1;
    f.write_state(&s);
    assert_mutav_err(
        f.register(guarantee_args(agency(), BRL, 0)),
        MutavError::UnderCovered,
    );
}

#[test]
fn close_releases_the_remaining_cover() {
    let mut f = Fixture::new();
    f.fund_reserve(60_000 * BRL);
    let ag = agency();
    let a1 = guarantee_args(ag, 20_000 * BRL, 10_000 * BRL);
    let a2 = guarantee_args(ag, 5_000 * BRL, 0);
    f.register(a1.clone()).unwrap();
    f.register(a2.clone()).unwrap();

    set_time(&mut f.svm, 1_800_000_000);
    let meta = f.close_guarantee(a1.id).expect("close");
    let g = f.guarantee(&a1.id);
    assert_eq!(g.status, GUARANTEE_CLOSED);
    assert_eq!(g.closed_at, 1_800_000_000);
    // The account stays, with its history.
    assert_eq!(g.default_cover, 20_000 * BRL);

    let s = f.state();
    assert_eq!(s.remaining_cover_total, 5_000 * BRL);
    assert_eq!(s.coverage_required, 5_000 * BRL);
    assert_eq!(s.active_guarantees, 1);

    let ev = events::<GuaranteeClosed>(&meta);
    assert_eq!(ev.len(), 1);
    assert_eq!((ev[0].id, ev[0].released_cover), (a1.id, 30_000 * BRL));
    assert_eq!((ev[0].config, ev[0].ts), (f.pdas.config, 1_800_000_000));
}

#[test]
fn close_releases_only_what_is_left_after_payments() {
    // `remaining_cover(g) = (default_cover − default_paid) + (exit_cover −
    // exit_paid)`. Payments are injected here; Task 5 pays them for real.
    let mut f = Fixture::new();
    f.fund_reserve(30_000 * BRL);
    let ag = agency();
    let args = guarantee_args(ag, 20_000 * BRL, 10_000 * BRL);
    f.register(args.clone()).unwrap();
    let mut g = f.guarantee(&args.id);
    g.default_paid = 4_000 * BRL;
    g.exit_paid = 1_000 * BRL;
    f.write_guarantee(&g);
    let mut s = f.state();
    s.remaining_cover_total -= 5_000 * BRL;
    f.write_state(&s);

    let meta = f.close_guarantee(args.id).unwrap();
    assert_eq!(
        events::<GuaranteeClosed>(&meta)[0].released_cover,
        25_000 * BRL
    );
    assert_eq!(f.state().remaining_cover_total, 0);
}

#[test]
fn close_twice_fails() {
    let mut f = Fixture::new();
    let ag = agency();
    let args = f.funded_guarantee(ag, 1_000 * BRL);
    f.close_guarantee(args.id).unwrap();
    assert_mutav_err(f.close_guarantee(args.id), MutavError::GuaranteeNotActive);
}

#[test]
fn close_fails_with_open_claims() {
    // A filed claim is injected here; Task 5 files one for real.
    let mut f = Fixture::new();
    let ag = agency();
    let args = f.funded_guarantee(ag, 1_000 * BRL);
    let mut g = f.guarantee(&args.id);
    g.open_claims = 1;
    f.write_guarantee(&g);
    assert_mutav_err(f.close_guarantee(args.id), MutavError::OpenClaims);
    assert_eq!(f.guarantee(&args.id).status, GUARANTEE_ACTIVE);
}

#[test]
fn close_unknown_guarantee_fails() {
    let mut f = Fixture::new();
    let res = f.close_guarantee(unique_hash());
    assert_anchor_err(res, anchor_lang::error::ErrorCode::AccountNotInitialized);
}

#[test]
fn close_rejects_a_non_operator() {
    let mut f = Fixture::new();
    let ag = agency();
    let args = f.funded_guarantee(ag, 1_000 * BRL);
    for k in [
        f.admin.insecure_clone(),
        f.pauser.insecure_clone(),
        Keypair::new(),
    ] {
        let ix = f.close_guarantee_ix(&k.pubkey(), args.id);
        assert_mutav_err(f.send(ix, &k), MutavError::Unauthorized);
    }
}

#[test]
fn close_works_while_paused_and_in_under_coverage() {
    // Not solvency-gated, not paused: it only releases liability (spec §5.2,
    // ADR 0008).
    let mut f = Fixture::new();
    let ag = agency();
    let a1 = f.funded_guarantee(ag, 1_000 * BRL);
    let a2 = f.funded_guarantee(ag, 1_000 * BRL);
    let pauser = f.pauser.insecure_clone();
    f.send(f.pause_ix(&pauser.pubkey()), &pauser).unwrap();
    f.close_guarantee(a1.id).expect("paused");

    let mut s = f.state();
    s.mode = MODE_UNDER_COVERED;
    s.brs_balance = 0;
    f.write_state(&s);
    f.close_guarantee(a2.id).expect("under-covered");
    assert_eq!(f.state().remaining_cover_total, 0);
}

// ---------------------------------------------------------------------------
// Roles: revoke_operator blocks operator instructions (Task 1, deferred)
// ---------------------------------------------------------------------------

#[test]
fn revoke_operator_blocks_operator_instructions_until_a_new_operator_accepts() {
    let mut f = Fixture::new();
    let ag = agency();
    let live = f.funded_guarantee(ag, 1_000 * BRL);
    f.fund_reserve(10_000 * BRL);
    let old = f.operator.insecure_clone();
    let pauser = f.pauser.insecure_clone();
    f.send(f.revoke_operator_ix(&pauser.pubkey()), &pauser)
        .unwrap();

    let reg = f.register_guarantee_ix(&old.pubkey(), guarantee_args(ag, BRL, 0));
    assert_mutav_err(f.send(reg, &old), MutavError::Unauthorized);
    let close = f.close_guarantee_ix(&old.pubkey(), live.id);
    assert_mutav_err(f.send(close.clone(), &old), MutavError::Unauthorized);

    // The admin appoints a new operator; the old key stays refused.
    let new_op = Keypair::new();
    f.svm.airdrop(&new_op.pubkey(), 1_000_000_000).unwrap();
    f.handover(ROLE_OPERATOR, &new_op).unwrap();
    assert_mutav_err(f.send(close, &old), MutavError::Unauthorized);
    let reg = f.register_guarantee_ix(&new_op.pubkey(), guarantee_args(ag, BRL, 0));
    f.send(reg, &new_op).expect("new operator registers");
    let close = f.close_guarantee_ix(&new_op.pubkey(), live.id);
    f.send(close, &new_op).expect("new operator closes");
}

// ---------------------------------------------------------------------------
// Version guard (spec §14.2 R1b; carried from 2a)
// ---------------------------------------------------------------------------

#[test]
fn a_newer_or_unknown_vault_state_is_refused() {
    for (version, mode) in [
        (PROGRAM_LAYOUT_VERSION + 1, MODE_NORMAL),
        (u8::MAX, MODE_NORMAL),
        (PROGRAM_LAYOUT_VERSION, MODE_UNDER_COVERED + 1),
        (PROGRAM_LAYOUT_VERSION, u8::MAX),
    ] {
        let mut f = Fixture::new();
        let ag = agency();
        let live = f.funded_guarantee(ag, 1_000 * BRL);
        f.fund_reserve(1_000 * BRL);
        let mut s = f.state();
        s.version = version;
        s.mode = mode;
        f.write_state(&s);
        let before = f.raw(&f.pdas.state);
        assert_mutav_err(
            f.register(guarantee_args(ag, BRL, 0)),
            MutavError::UnsupportedVersion,
        );
        assert_mutav_err(f.close_guarantee(live.id), MutavError::UnsupportedVersion);
        assert_eq!(f.raw(&f.pdas.state), before);
    }
}

#[test]
fn a_newer_or_unknown_guarantee_is_refused() {
    for (version, status) in [
        (PROGRAM_LAYOUT_VERSION + 1, GUARANTEE_ACTIVE),
        (PROGRAM_LAYOUT_VERSION, GUARANTEE_CLOSED + 1),
        (PROGRAM_LAYOUT_VERSION, u8::MAX),
    ] {
        let mut f = Fixture::new();
        let ag = agency();
        let args = f.funded_guarantee(ag, 1_000 * BRL);
        let mut g = f.guarantee(&args.id);
        g.version = version;
        g.status = status;
        f.write_guarantee(&g);
        assert_mutav_err(f.close_guarantee(args.id), MutavError::UnsupportedVersion);
    }
}

// ---------------------------------------------------------------------------
// Padding (spec §14.2 R4, R6; carried from 2a)
// ---------------------------------------------------------------------------

#[test]
fn guarantee_padding_is_zero_at_init_and_preserved() {
    let mut f = Fixture::new();
    f.fund_reserve(10_000 * BRL);
    let ag = agency();
    let args = guarantee_args(ag, 1_000 * BRL, 0);
    f.register(args.clone()).unwrap();
    assert_eq!(f.guarantee(&args.id)._reserved, [0; 203]);

    let mut g = f.guarantee(&args.id);
    g._reserved = [0xa5; 203];
    f.write_guarantee(&g);

    // A close updates the account in place.
    f.close_guarantee(args.id).unwrap();
    assert_eq!(f.guarantee(&args.id)._reserved, [0xa5; 203]);
}

// ---------------------------------------------------------------------------
// Invariant 3: remaining_cover_total = Σ remaining cover of active guarantees
// ---------------------------------------------------------------------------

#[test]
fn remaining_cover_total_matches_the_book_after_any_sequence() {
    let mut f = Fixture::new();
    f.fund_reserve(1_000_000 * BRL);
    let agencies: Vec<[u8; 32]> = (0..3).map(|_| agency()).collect();
    let mut book: Vec<([u8; 32], [u8; 32])> = Vec::new(); // (id, agency)
    let mut x: u64 = 0x9e37_79b9;
    for step in 0..60 {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        let close = !book.is_empty() && x % 3 == 0;
        if close {
            let i = (x / 3) as usize % book.len();
            let (id, _) = book.swap_remove(i);
            f.close_guarantee(id)
                .unwrap_or_else(|e| panic!("step {step} close: {:?}", e.err));
        } else {
            let ag = agencies[(x / 7) as usize % agencies.len()];
            let d = (x >> 8) % 8_000 * BRL;
            let e = (x >> 24) % 4_000 * BRL + 1;
            let args = guarantee_args(ag, d, e);
            // Refusals (caps, free capital) are fine; they must change nothing.
            if f.register(args.clone()).is_ok() {
                book.push((args.id, ag));
            }
        }

        let s = f.state();
        let total: u64 = book
            .iter()
            .map(|(id, _)| remaining_cover(&f.guarantee(id)))
            .sum();
        assert_eq!(s.remaining_cover_total, total, "step {step}");
        assert_eq!(s.coverage_required, total, "step {step} (c = 1.0)");
        assert_eq!(s.active_guarantees as usize, book.len(), "step {step}");
    }
}
