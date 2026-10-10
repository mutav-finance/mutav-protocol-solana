//! `VaultState` (spec §3.2): the reserve's internal accounting.

use anchor_lang::prelude::*;

use crate::constants::{MODE_NORMAL, MODE_UNDER_COVERED, PROGRAM_LAYOUT_VERSION, VAULT_STATE_SIZE};

/// Seeds: `["state", config]`. Written by every state-changing instruction;
/// recomputed by `refresh`. Starts empty (all zero) at `initialize`.
#[account]
#[derive(InitSpace)]
pub struct VaultState {
    pub version: u8,
    pub bump: u8,
    /// `MODE_NORMAL` / `MODE_UNDER_COVERED`.
    pub mode: u8,
    /// Tracked BRS in `reserve` (internal accounting).
    pub brs_balance: u64,
    /// Tracked TESOURO held through adapters, in TESOURO base units.
    pub tesouro_units: u64,
    /// Last bounded TESOURO price (`PRICE_SCALE`).
    pub tesouro_price: u64,
    pub tesouro_price_ts: i64,
    pub stable_assets: u64,
    pub remaining_cover_total: u64,
    pub coverage_required: u64,
    pub provisions: u64,
    pub shares_outstanding: u64,
    /// Last published NAV per share (`NAV_SCALE`).
    pub nav_per_share: u64,
    pub pending_deposits_total: u64,
    pub pending_redeem_shares: u64,
    pub claimable_assets_total: u64,
    /// Stored instant-exit earmark. Always `0` in the pilot.
    pub buffer_earmark: u64,
    pub pending_notices: u32,
    pub active_guarantees: u32,
    pub next_deposit_seq: u64,
    pub deposit_head: u64,
    pub next_redeem_seq: u64,
    pub redeem_head: u64,
    pub claim_period_start: i64,
    pub claim_period_paid: u64,
    pub fees_in_total: u64,
    pub fee_take_total: u64,
    pub claims_paid_total: u64,
    pub fulfil_halted: bool,
    pub last_refresh_ts: i64,
    pub last_refresh_slot: u64,
    // -- carved from `_reserved` by ADR 0017 (24 bytes) --
    /// Lifetime net issuer income swept into `reserve` (`sweep_income`).
    pub income_total: u64,
    /// Lifetime take from issuer income sent to the treasury.
    pub income_take_total: u64,
    /// NAV per share (`NAV_SCALE`) added by verified inflows
    /// (`contribute_fees`, `sweep_income`) since the last `refresh`: the sum
    /// of `ceil(net × NAV_SCALE / shares_outstanding)` at each inflow
    /// (`pricing::inflow_nav`; `0` while no shares are outstanding),
    /// saturating. Per share, so fills in the window leave it exact. The
    /// NAV-move guard measures net of it; `refresh` and `clear_fulfil_halt`
    /// reset it to 0.
    pub inflow_nav: u64,
    /// Zeroed. Phase 2 carves `InstantExitState` (88 bytes) from the front.
    pub _reserved: [u8; 236],
}

const _: () = assert!(8 + VaultState::INIT_SPACE == VAULT_STATE_SIZE);

impl VaultState {
    /// Version guard (spec §14.2 R1b): a layout version this binary
    /// understands and a known `mode`. Instructions that read `VaultState`
    /// refuse anything else with `UnsupportedVersion`.
    pub fn is_supported(&self) -> bool {
        self.version <= PROGRAM_LAYOUT_VERSION
            && matches!(self.mode, MODE_NORMAL | MODE_UNDER_COVERED)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn zeroed() -> VaultState {
        let bytes = vec![0u8; VaultState::INIT_SPACE];
        VaultState::deserialize(&mut bytes.as_slice()).unwrap()
    }

    #[test]
    fn version_and_mode_guard() {
        let mut s = zeroed();
        s.version = PROGRAM_LAYOUT_VERSION;
        assert!(s.is_supported());
        s.mode = MODE_UNDER_COVERED;
        assert!(s.is_supported());
        s.mode = MODE_UNDER_COVERED + 1;
        assert!(!s.is_supported(), "unknown mode");
        s.mode = u8::MAX;
        assert!(!s.is_supported(), "unknown mode");
        s.mode = MODE_NORMAL;
        s.version = PROGRAM_LAYOUT_VERSION + 1;
        assert!(!s.is_supported(), "newer layout");
    }
}
