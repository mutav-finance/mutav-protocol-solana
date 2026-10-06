//! Operator instructions (spec §5.2–§5.4), signed by the mutav-app KMS key.
//! Every one checks `VaultConfig::is_operator`, so a revoked operator
//! (`revoke_operator`) is refused until `set_roles` appoints a new key.
//!
//! TODO(plan: claim notices deferred) — `flag_claim_notice` and
//! `close_claim_notice` are built later; `pending_notices` stays `0`.

pub mod close_guarantee;
pub mod register_guarantee;

pub use close_guarantee::*;
pub use register_guarantee::*;

use anchor_lang::prelude::*;

use crate::{
    errors::MutavError,
    solvency::{Solvency, SolvencyInputs},
    state::{VaultConfig, VaultState},
};

/// The spec §4 quantities for the current state, for an instruction that
/// reads `stable_assets` and does not hold the queue head.
///
/// Every such instruction needs a fresh TESOURO price when
/// `tesouro_units > 0` (spec §5, §7).
// TODO(plan: TESOURO pricing built later, Tasks 8–9) — no price source is
// read yet, so any TESOURO position fails closed with `StalePrice`.
pub(crate) fn solvency_snapshot(config: &VaultConfig, state: &VaultState) -> Result<Solvency> {
    require!(state.tesouro_units == 0, MutavError::StalePrice);
    Solvency::compute(&SolvencyInputs {
        brs_balance: state.brs_balance,
        tesouro_units: state.tesouro_units,
        tesouro_price: state.tesouro_price,
        remaining_cover_total: state.remaining_cover_total,
        coverage_ratio_bps: config.coverage_ratio_bps,
        provisions: state.provisions,
        buffer_earmark: state.buffer_earmark,
        feature_flags: config.feature_flags,
        head_starved: false,
    })
}
