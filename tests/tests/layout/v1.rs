//! Frozen v1 layouts (spec §14.7 item 1, OnRe `layout_compatibility.rs`
//! pattern). These are copies of the pilot account structs as deployed. They
//! must never change: a diff here means a live account would be misread.
//!
//! Accounts added in later tasks (`Guarantee`, `AgencyExposure`,
//! `ClaimFiling`, `Payout`, `DepositRequest`, `RedeemRequest`, `HolderState`,
//! `FeeReceipt`, `ClaimNotice`) get their `…V1` copy and offset table here in
//! the task that adds them.

use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct AdapterEntryV1 {
    pub program_id: Pubkey,
    pub sub_authority: Pubkey,
    pub asset_mint: Pubkey,
    pub cap: u64,
    pub allocated: u64,
    pub enabled: bool,
    pub _reserved: [u8; 64],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct CapsV1 {
    pub max_tvl: u64,
    pub max_cover_per_guarantee: u64,
    pub max_cover_per_agency: u64,
    pub max_claim_per_call: u64,
    pub max_claim_per_period: u64,
    pub claim_period_secs: i64,
    pub max_tesouro_share_bps: u16,
    pub min_request: u64,
    pub max_request: u64,
    pub min_fill_assets: u64,
    pub _reserved: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct PriceParamsV1 {
    pub tesouro_price_account: Pubkey,
    pub p0: u64,
    pub t0: i64,
    pub y_max_bps: u16,
    pub max_staleness_secs: i64,
    pub max_deviation_bps: u16,
    pub max_nav_move_bps: u16,
    pub _reserved: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExitParamsV1 {
    pub buffer_target_bps: u16,
    pub buffer_headroom_bps: u16,
    pub buffer_release_after_secs: i64,
    pub curve_version: u8,
    pub h_min_bps: u16,
    pub h_peg_bps: u16,
    pub h_max_bps: u16,
    pub pressure_epoch_secs: i64,
    pub min_instant_assets: u64,
    pub max_instant_per_tx: u64,
    pub max_instant_per_wallet: u64,
    pub max_instant_per_period: u64,
    pub instant_period_secs: i64,
    pub min_hold_secs: i64,
    pub max_price_age_secs: i64,
    pub allowlist_root: [u8; 32],
    pub barred: [Pubkey; 4],
    pub _reserved: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct VaultConfigV1 {
    pub version: u8,
    pub bump: u8,
    pub authority_bump: u8,
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub pauser: Pubkey,
    pub reserve_mint: Pubkey,
    pub reserve_token_program: Pubkey,
    pub reserve_decimals: u8,
    pub share_mint: Pubkey,
    pub coverage_ratio_bps: u16,
    pub fee_take_bps: u16,
    pub payments_account: Pubkey,
    pub treasury_account: Pubkey,
    pub investor_allowlist_root: [u8; 32],
    pub adapters: [AdapterEntryV1; 8],
    pub caps: CapsV1,
    pub price: PriceParamsV1,
    pub payout_sla_secs: i64,
    pub paused: bool,
    pub feature_flags: u64,
    pub mutav_capital_wallet: Pubkey,
    pub exit: ExitParamsV1,
    pub _reserved: [u8; 512],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct VaultStateV1 {
    pub version: u8,
    pub bump: u8,
    pub mode: u8,
    pub brs_balance: u64,
    pub tesouro_units: u64,
    pub tesouro_price: u64,
    pub tesouro_price_ts: i64,
    pub stable_assets: u64,
    pub remaining_cover_total: u64,
    pub coverage_required: u64,
    pub provisions: u64,
    pub shares_outstanding: u64,
    pub nav_per_share: u64,
    pub pending_deposits_total: u64,
    pub pending_redeem_shares: u64,
    pub claimable_assets_total: u64,
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
    pub late_payouts: u32,
    pub fulfil_halted: bool,
    pub last_refresh_ts: i64,
    pub last_refresh_slot: u64,
    pub _reserved: [u8; 256],
}

/// Golden field-offset tables: `(field, offset, size)`, offsets within the
/// struct (the account adds the 8-byte discriminator in front). Committed by
/// hand; the tests recompute them from sentinel serialization.
pub type OffsetTable = &'static [(&'static str, usize, usize)];

pub const VAULT_STATE_V1: OffsetTable = &[
    ("version", 0, 1),
    ("bump", 1, 1),
    ("mode", 2, 1),
    ("brs_balance", 3, 8),
    ("tesouro_units", 11, 8),
    ("tesouro_price", 19, 8),
    ("tesouro_price_ts", 27, 8),
    ("stable_assets", 35, 8),
    ("remaining_cover_total", 43, 8),
    ("coverage_required", 51, 8),
    ("provisions", 59, 8),
    ("shares_outstanding", 67, 8),
    ("nav_per_share", 75, 8),
    ("pending_deposits_total", 83, 8),
    ("pending_redeem_shares", 91, 8),
    ("claimable_assets_total", 99, 8),
    ("buffer_earmark", 107, 8),
    ("pending_notices", 115, 4),
    ("active_guarantees", 119, 4),
    ("next_deposit_seq", 123, 8),
    ("deposit_head", 131, 8),
    ("next_redeem_seq", 139, 8),
    ("redeem_head", 147, 8),
    ("claim_period_start", 155, 8),
    ("claim_period_paid", 163, 8),
    ("fees_in_total", 171, 8),
    ("fee_take_total", 179, 8),
    ("claims_paid_total", 187, 8),
    ("late_payouts", 195, 4),
    ("fulfil_halted", 199, 1),
    ("last_refresh_ts", 200, 8),
    ("last_refresh_slot", 208, 8),
    ("_reserved", 216, 256),
];

pub const VAULT_CONFIG_V1: OffsetTable = &[
    ("version", 0, 1),
    ("bump", 1, 1),
    ("authority_bump", 2, 1),
    ("admin", 3, 32),
    ("operator", 35, 32),
    ("pauser", 67, 32),
    ("reserve_mint", 99, 32),
    ("reserve_token_program", 131, 32),
    ("reserve_decimals", 163, 1),
    ("share_mint", 164, 32),
    ("coverage_ratio_bps", 196, 2),
    ("fee_take_bps", 198, 2),
    ("payments_account", 200, 32),
    ("treasury_account", 232, 32),
    ("investor_allowlist_root", 264, 32),
    ("adapters[0].program_id", 296, 32),
    ("adapters[7]._reserved", 296 + 7 * 177 + 113, 64),
    ("caps.max_tvl", 1712, 8),
    ("caps._reserved", 1712 + 74, 32),
    ("price.tesouro_price_account", 1818, 32),
    ("price._reserved", 1818 + 62, 32),
    ("payout_sla_secs", 1912, 8),
    ("paused", 1920, 1),
    ("feature_flags", 1921, 8),
    ("mutav_capital_wallet", 1929, 32),
    ("exit.buffer_target_bps", 1961, 2),
    ("exit._reserved", 1961 + 243, 32),
    ("_reserved", 2236, 512),
];

pub const CAPS_V1: OffsetTable = &[
    ("max_tvl", 0, 8),
    ("max_cover_per_guarantee", 8, 8),
    ("max_cover_per_agency", 16, 8),
    ("max_claim_per_call", 24, 8),
    ("max_claim_per_period", 32, 8),
    ("claim_period_secs", 40, 8),
    ("max_tesouro_share_bps", 48, 2),
    ("min_request", 50, 8),
    ("max_request", 58, 8),
    ("min_fill_assets", 66, 8),
    ("_reserved", 74, 32),
];

pub const PRICE_PARAMS_V1: OffsetTable = &[
    ("tesouro_price_account", 0, 32),
    ("p0", 32, 8),
    ("t0", 40, 8),
    ("y_max_bps", 48, 2),
    ("max_staleness_secs", 50, 8),
    ("max_deviation_bps", 58, 2),
    ("max_nav_move_bps", 60, 2),
    ("_reserved", 62, 32),
];

pub const EXIT_PARAMS_V1: OffsetTable = &[
    ("buffer_target_bps", 0, 2),
    ("buffer_headroom_bps", 2, 2),
    ("buffer_release_after_secs", 4, 8),
    ("curve_version", 12, 1),
    ("h_min_bps", 13, 2),
    ("h_peg_bps", 15, 2),
    ("h_max_bps", 17, 2),
    ("pressure_epoch_secs", 19, 8),
    ("min_instant_assets", 27, 8),
    ("max_instant_per_tx", 35, 8),
    ("max_instant_per_wallet", 43, 8),
    ("max_instant_per_period", 51, 8),
    ("instant_period_secs", 59, 8),
    ("min_hold_secs", 67, 8),
    ("max_price_age_secs", 75, 8),
    ("allowlist_root", 83, 32),
    ("barred", 115, 128),
    ("_reserved", 243, 32),
];

pub const ADAPTER_ENTRY_V1: OffsetTable = &[
    ("program_id", 0, 32),
    ("sub_authority", 32, 32),
    ("asset_mint", 64, 32),
    ("cap", 96, 8),
    ("allocated", 104, 8),
    ("enabled", 112, 1),
    ("_reserved", 113, 64),
];

// ---------------------------------------------------------------------------
// Guarantee book (Task 3)
// ---------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct GuaranteeV1 {
    pub version: u8,
    pub bump: u8,
    pub id: [u8; 32],
    pub agency_id: [u8; 32],
    pub refs_hash: [u8; 32],
    pub rent: u64,
    pub default_multiplier_bps: u16,
    pub exit_multiplier_bps: u16,
    pub default_cover: u64,
    pub exit_cover: u64,
    pub default_paid: u64,
    pub exit_paid: u64,
    pub provision_default: u64,
    pub provision_exit: u64,
    pub open_claims: u16,
    pub status: u8,
    pub registered_at: i64,
    pub closed_at: i64,
    pub _reserved: [u8; 64],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct AgencyExposureV1 {
    pub version: u8,
    pub bump: u8,
    pub agency_id: [u8; 32],
    pub outstanding_cover: u64,
    pub active_guarantees: u32,
    pub claims_paid_total: u64,
    pub _reserved: [u8; 64],
}

pub const GUARANTEE_V1: OffsetTable = &[
    ("version", 0, 1),
    ("bump", 1, 1),
    ("id", 2, 32),
    ("agency_id", 34, 32),
    ("refs_hash", 66, 32),
    ("rent", 98, 8),
    ("default_multiplier_bps", 106, 2),
    ("exit_multiplier_bps", 108, 2),
    ("default_cover", 110, 8),
    ("exit_cover", 118, 8),
    ("default_paid", 126, 8),
    ("exit_paid", 134, 8),
    ("provision_default", 142, 8),
    ("provision_exit", 150, 8),
    ("open_claims", 158, 2),
    ("status", 160, 1),
    ("registered_at", 161, 8),
    ("closed_at", 169, 8),
    ("_reserved", 177, 64),
];

pub const AGENCY_EXPOSURE_V1: OffsetTable = &[
    ("version", 0, 1),
    ("bump", 1, 1),
    ("agency_id", 2, 32),
    ("outstanding_cover", 34, 8),
    ("active_guarantees", 42, 4),
    ("claims_paid_total", 46, 8),
    ("_reserved", 54, 64),
];
