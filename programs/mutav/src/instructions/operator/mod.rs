//! Operator instructions (spec §5.2–§5.4, §5.3a), signed by the mutav-app KMS key.
//! Every one checks `VaultConfig::is_operator`, so a revoked operator
//! (`revoke_operator`) is refused until a new operator accepts its role
//! (`propose_role` / `accept_role`, ADR 0020).

pub mod close_guarantee;
pub mod contribute_fees;
pub mod file_claim;
pub mod pay_claim;
pub mod register_guarantee;
pub mod settle_payout;
pub mod sweep_income;

pub use close_guarantee::*;
pub use contribute_fees::*;
pub use file_claim::*;
pub use pay_claim::*;
pub use register_guarantee::*;
pub use settle_payout::*;
pub use sweep_income::*;

use anchor_lang::prelude::*;

use crate::{
    solvency::{Solvency, SolvencyInputs},
    state::{VaultConfig, VaultState},
};

/// The spec §4 quantities for the current state.
pub(crate) fn solvency_snapshot(config: &VaultConfig, state: &VaultState) -> Result<Solvency> {
    Solvency::compute(&SolvencyInputs {
        brs_balance: state.brs_balance,
        remaining_cover_total: state.remaining_cover_total,
        coverage_ratio_bps: config.coverage_ratio_bps,
        provisions: state.provisions,
    })
}
