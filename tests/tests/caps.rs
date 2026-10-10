//! Guarantee caps (spec §5.2 rule 3, §8; plan Task 3):
//! `max_cover_per_guarantee` at the boundary, and the order in which
//! `register_guarantee` checks its rules. There is no per-agency cap
//! (ADR 0019).

use mutav::errors::MutavError;
use mutav_tests::helpers::*;

// Test caps (spec §8 proposed values): R$30k per guarantee.
const PER_GUARANTEE: u64 = 30_000 * BRL;

#[test]
fn per_guarantee_cap_at_the_boundary() {
    let mut f = Fixture::new();
    f.fund_reserve(200_000 * BRL);
    // Both legs count: default + exit.
    f.register(guarantee_args(
        unique_hash(),
        PER_GUARANTEE - 10_000 * BRL,
        10_000 * BRL,
    ))
    .expect("exactly the cap");
    assert_mutav_err(
        f.register(guarantee_args(
            unique_hash(),
            PER_GUARANTEE - 10_000 * BRL,
            10_000 * BRL + 1,
        )),
        MutavError::GuaranteeCapExceeded,
    );
    assert_mutav_err(
        f.register(guarantee_args(unique_hash(), 0, PER_GUARANTEE + 1)),
        MutavError::GuaranteeCapExceeded,
    );
}

#[test]
fn one_agency_is_bounded_only_by_free_capital() {
    // ADR 0019: guarantees of one agency are capped one by one, never
    // together. Five at the per-guarantee cap (R$150k, above the former
    // R$60k per-agency test cap) all register while free capital lasts.
    let mut f = Fixture::new();
    f.fund_reserve(5 * PER_GUARANTEE);
    let ag = unique_hash();
    for _ in 0..5 {
        f.register(guarantee_args(ag, PER_GUARANTEE, 0)).unwrap();
    }
    assert_mutav_err(
        f.register(guarantee_args(ag, 1, 0)),
        MutavError::InsufficientFreeCapital,
    );
}

#[test]
fn caps_follow_set_config() {
    let mut f = Fixture::new();
    f.fund_reserve(200_000 * BRL);
    let mut args = set_config_args(&f.config());
    args.caps.max_cover_per_guarantee = 5_000 * BRL;
    f.set_config(args).unwrap();
    let ag = unique_hash();
    assert_mutav_err(
        f.register(guarantee_args(ag, 5_000 * BRL + 1, 0)),
        MutavError::GuaranteeCapExceeded,
    );
    f.register(guarantee_args(ag, 5_000 * BRL, 0)).unwrap();
    f.register(guarantee_args(ag, 5_000 * BRL, 0)).unwrap();
}

#[test]
fn rules_are_checked_in_spec_order() {
    // Rule 1 (pause) before rule 2 (parameters) before rule 3 (per guarantee)
    // before rule 4 (solvency).
    let mut f = Fixture::new();
    let ag = unique_hash();
    f.fund_reserve(2 * PER_GUARANTEE);
    f.register(guarantee_args(ag, PER_GUARANTEE, 0)).unwrap();
    f.register(guarantee_args(ag, PER_GUARANTEE, 0)).unwrap();
    // No free capital left.

    // Over the per-guarantee cap and free capital.
    assert_mutav_err(
        f.register(guarantee_args(ag, PER_GUARANTEE + 1, 0)),
        MutavError::GuaranteeCapExceeded,
    );
    // Over free capital only.
    assert_mutav_err(
        f.register(guarantee_args(unique_hash(), 1, 0)),
        MutavError::InsufficientFreeCapital,
    );
    // Zero cover beats every cap.
    assert_mutav_err(
        f.register(guarantee_args(ag, 0, 0)),
        MutavError::InvalidParameter,
    );
    // Paused beats everything.
    let pauser = f.pauser.insecure_clone();
    f.send(f.pause_ix(&solana_signer::Signer::pubkey(&pauser)), &pauser)
        .unwrap();
    assert_mutav_err(f.register(guarantee_args(ag, 0, 0)), MutavError::Paused);
}
