//! Guarantee caps (spec §5.2 rules 3 and 4, §8; plan Task 3):
//! `max_cover_per_guarantee` and `max_cover_per_agency` at the boundary, and
//! the order in which `register_guarantee` checks its rules.

use mutav::errors::MutavError;
use mutav_tests::helpers::*;

// Test caps (spec §8 proposed values): R$30k per guarantee, R$60k per agency.
const PER_GUARANTEE: u64 = 30_000 * BRL;
const PER_AGENCY: u64 = 60_000 * BRL;

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
fn per_agency_cap_at_the_boundary() {
    let mut f = Fixture::new();
    f.fund_reserve(200_000 * BRL);
    let ag = unique_hash();
    let first = guarantee_args(ag, PER_GUARANTEE, 0);
    f.register(first.clone()).unwrap();
    f.register(guarantee_args(ag, PER_AGENCY - PER_GUARANTEE - BRL, 0))
        .unwrap();
    // R$1.00 left for this agency.
    assert_mutav_err(
        f.register(guarantee_args(ag, BRL + 1, 0)),
        MutavError::AgencyCapExceeded,
    );
    f.register(guarantee_args(ag, BRL, 0))
        .expect("exactly the cap");
    assert_eq!(f.agency(&ag).outstanding_cover, PER_AGENCY);
    assert_mutav_err(
        f.register(guarantee_args(ag, 1, 0)),
        MutavError::AgencyCapExceeded,
    );

    // Another agency is unaffected.
    f.register(guarantee_args(unique_hash(), PER_GUARANTEE, 0))
        .expect("other agency");

    // Closing releases room under the agency cap.
    f.close_guarantee(first.id, ag).unwrap();
    f.register(guarantee_args(ag, PER_GUARANTEE, 0))
        .expect("room after close");
    assert_mutav_err(
        f.register(guarantee_args(ag, 1, 0)),
        MutavError::AgencyCapExceeded,
    );
}

#[test]
fn caps_follow_set_config() {
    let mut f = Fixture::new();
    f.fund_reserve(200_000 * BRL);
    let mut args = set_config_args(&f.config());
    args.caps.max_cover_per_guarantee = 5_000 * BRL;
    args.caps.max_cover_per_agency = 8_000 * BRL;
    f.set_config(args).unwrap();
    let ag = unique_hash();
    assert_mutav_err(
        f.register(guarantee_args(ag, 5_000 * BRL + 1, 0)),
        MutavError::GuaranteeCapExceeded,
    );
    f.register(guarantee_args(ag, 5_000 * BRL, 0)).unwrap();
    assert_mutav_err(
        f.register(guarantee_args(ag, 3_000 * BRL + 1, 0)),
        MutavError::AgencyCapExceeded,
    );
    f.register(guarantee_args(ag, 3_000 * BRL, 0)).unwrap();
}

#[test]
fn rules_are_checked_in_spec_order() {
    // Rule 1 (pause) before rule 2 (parameters) before rule 3 (per guarantee)
    // before rule 4 (per agency) before rule 5 (solvency).
    let mut f = Fixture::new();
    let ag = unique_hash();
    f.fund_reserve(PER_AGENCY);
    f.register(guarantee_args(ag, PER_GUARANTEE, 0)).unwrap();
    f.register(guarantee_args(ag, PER_GUARANTEE, 0)).unwrap();
    // No free capital left and the agency is at its cap.

    // Over the per-guarantee cap, the agency cap and free capital.
    assert_mutav_err(
        f.register(guarantee_args(ag, PER_GUARANTEE + 1, 0)),
        MutavError::GuaranteeCapExceeded,
    );
    // Over the agency cap and free capital.
    assert_mutav_err(
        f.register(guarantee_args(ag, 1, 0)),
        MutavError::AgencyCapExceeded,
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
