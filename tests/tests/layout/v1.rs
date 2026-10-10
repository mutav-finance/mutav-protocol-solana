//! Frozen v1 layouts (spec §14.7 item 1, OnRe `layout_compatibility.rs`
//! pattern). These are copies of the pilot account structs as deployed. They
//! must never change: a diff here means a live account would be misread.
//!
//! Regenerated for the last time before the devnet layout freeze (ADR 0019):
//! the payout SLA, the per-agency cap, the phase-2 exit parameters, the
//! TESOURO price state, the inline adapters, `HolderState`, the separate
//! `Payout` and `FeeReceipt` accounts and the partial-fill request fields
//! were removed, and the decided fields were carved. From the devnet deploy
//! on, these copies only ever gain a `V2` sibling.

use anchor_lang::prelude::*;

/// Golden field-offset tables: `(field, offset, size)`, offsets within the
/// struct (the account adds the 8-byte discriminator in front). The tests
/// recompute them from sentinel serialization.
pub type OffsetTable = &'static [(&'static str, usize, usize)];

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct CapsV1 {
    pub max_tvl: u64,
    pub max_cover_per_guarantee: u64,
    pub max_claim_per_call: u64,
    pub max_claim_per_period: u64,
    pub min_request: u64,
    pub max_request: u64,
    pub max_nav_move_bps: u16,
    pub stress_buffer: u64,
    pub max_queue_wait_secs: i64,
    pub max_reinstate_age: i64,
    pub _reserved: [u8; 32],
}

pub const CAPS_V1: OffsetTable = &[
    ("max_tvl", 0, 8),
    ("max_cover_per_guarantee", 8, 8),
    ("max_claim_per_call", 16, 8),
    ("max_claim_per_period", 24, 8),
    ("min_request", 32, 8),
    ("max_request", 40, 8),
    ("max_nav_move_bps", 48, 2),
    ("stress_buffer", 50, 8),
    ("max_queue_wait_secs", 58, 8),
    ("max_reinstate_age", 66, 8),
    ("_reserved", 74, 32),
];

/// Serialized size of `CapsV1` (the account adds 8).
pub const CAPS_V1_LEN: usize = 106;

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
    pub caps: CapsV1,
    pub paused: bool,
    pub feature_flags: u64,
    pub mutav_capital_wallet: Pubkey,
    pub adapter_count: u8,
    pub adapter_bitmap: u8,
    pub pending_admin: Pubkey,
    pub pending_admin_expires_at: i64,
    pub pending_operator: Pubkey,
    pub pending_operator_expires_at: i64,
    pub pending_pauser: Pubkey,
    pub pending_pauser_expires_at: i64,
    pub guardians: [Pubkey; 3],
    pub _reserved: [u8; 512],
}

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
    ("caps", 296, 106),
    ("paused", 402, 1),
    ("feature_flags", 403, 8),
    ("mutav_capital_wallet", 411, 32),
    ("adapter_count", 443, 1),
    ("adapter_bitmap", 444, 1),
    ("pending_admin", 445, 32),
    ("pending_admin_expires_at", 477, 8),
    ("pending_operator", 485, 32),
    ("pending_operator_expires_at", 517, 8),
    ("pending_pauser", 525, 32),
    ("pending_pauser_expires_at", 557, 8),
    ("guardians", 565, 96),
    ("_reserved", 661, 512),
];

/// Serialized size of `VaultConfigV1` (the account adds 8).
pub const VAULT_CONFIG_V1_LEN: usize = 1173;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct VaultStateV1 {
    pub version: u8,
    pub bump: u8,
    pub mode: u8,
    pub brs_balance: u64,
    pub remaining_cover_total: u64,
    pub coverage_required: u64,
    pub provisions: u64,
    pub shares_outstanding: u64,
    pub nav_per_share: u64,
    pub pending_deposits_total: u64,
    pub pending_redeem_shares: u64,
    pub claimable_assets_total: u64,
    pub active_guarantees: u32,
    pub next_deposit_seq: u64,
    pub deposit_head: u64,
    pub next_redeem_seq: u64,
    pub redeem_head: u64,
    pub fees_in_total: u64,
    pub fee_take_total: u64,
    pub claims_paid_total: u64,
    pub fulfil_halted: bool,
    pub last_refresh_ts: i64,
    pub last_refresh_slot: u64,
    pub income_total: u64,
    pub inflow_nav: u64,
    pub claim_day_buckets: [u64; 31],
    pub claim_day_anchor: i64,
    pub _reserved: [u8; 256],
}

pub const VAULT_STATE_V1: OffsetTable = &[
    ("version", 0, 1),
    ("bump", 1, 1),
    ("mode", 2, 1),
    ("brs_balance", 3, 8),
    ("remaining_cover_total", 11, 8),
    ("coverage_required", 19, 8),
    ("provisions", 27, 8),
    ("shares_outstanding", 35, 8),
    ("nav_per_share", 43, 8),
    ("pending_deposits_total", 51, 8),
    ("pending_redeem_shares", 59, 8),
    ("claimable_assets_total", 67, 8),
    ("active_guarantees", 75, 4),
    ("next_deposit_seq", 79, 8),
    ("deposit_head", 87, 8),
    ("next_redeem_seq", 95, 8),
    ("redeem_head", 103, 8),
    ("fees_in_total", 111, 8),
    ("fee_take_total", 119, 8),
    ("claims_paid_total", 127, 8),
    ("fulfil_halted", 135, 1),
    ("last_refresh_ts", 136, 8),
    ("last_refresh_slot", 144, 8),
    ("income_total", 152, 8),
    ("inflow_nav", 160, 8),
    ("claim_day_buckets", 168, 248),
    ("claim_day_anchor", 416, 8),
    ("_reserved", 424, 256),
];

/// Serialized size of `VaultStateV1` (the account adds 8).
pub const VAULT_STATE_V1_LEN: usize = 680;

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
    pub _reserved: [u8; 192],
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
    ("_reserved", 177, 192),
];

/// Serialized size of `GuaranteeV1` (the account adds 8).
pub const GUARANTEE_V1_LEN: usize = 369;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct ClaimFilingV1 {
    pub version: u8,
    pub bump: u8,
    pub guarantee: Pubkey,
    pub leg: u8,
    pub notice_ref_hash: [u8; 32],
    pub provision: u64,
    pub filed_at: i64,
    pub status: u8,
    pub paid_amount: u64,
    pub paid_at: i64,
    pub payments_account: Pubkey,
    pub pix_e2e_hash: [u8; 32],
    pub settled_at: i64,
    pub approved_amount: u64,
    pub _reserved: [u8; 192],
}

pub const CLAIM_FILING_V1: OffsetTable = &[
    ("version", 0, 1),
    ("bump", 1, 1),
    ("guarantee", 2, 32),
    ("leg", 34, 1),
    ("notice_ref_hash", 35, 32),
    ("provision", 67, 8),
    ("filed_at", 75, 8),
    ("status", 83, 1),
    ("paid_amount", 84, 8),
    ("paid_at", 92, 8),
    ("payments_account", 100, 32),
    ("pix_e2e_hash", 132, 32),
    ("settled_at", 164, 8),
    ("approved_amount", 172, 8),
    ("_reserved", 180, 192),
];

/// Serialized size of `ClaimFilingV1` (the account adds 8).
pub const CLAIM_FILING_V1_LEN: usize = 372;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct IncomeReceiptV1 {
    pub version: u8,
    pub bump: u8,
    pub kind: u8,
    pub ref_hash: [u8; 32],
    pub period: u32,
    pub gross: u64,
    pub take: u64,
    pub net: u64,
    pub slot: u64,
    pub _reserved: [u8; 64],
}

pub const INCOME_RECEIPT_V1: OffsetTable = &[
    ("version", 0, 1),
    ("bump", 1, 1),
    ("kind", 2, 1),
    ("ref_hash", 3, 32),
    ("period", 35, 4),
    ("gross", 39, 8),
    ("take", 47, 8),
    ("net", 55, 8),
    ("slot", 63, 8),
    ("_reserved", 71, 64),
];

/// Serialized size of `IncomeReceiptV1` (the account adds 8).
pub const INCOME_RECEIPT_V1_LEN: usize = 135;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct DepositRequestV1 {
    pub version: u8,
    pub bump: u8,
    pub owner: Pubkey,
    pub seq: u64,
    pub assets: u64,
    pub shares_out: u64,
    pub nav_at_fulfil: u64,
    pub requested_at: i64,
    pub fulfilled_at: i64,
    pub status: u8,
    pub _reserved: [u8; 64],
}

pub const DEPOSIT_REQUEST_V1: OffsetTable = &[
    ("version", 0, 1),
    ("bump", 1, 1),
    ("owner", 2, 32),
    ("seq", 34, 8),
    ("assets", 42, 8),
    ("shares_out", 50, 8),
    ("nav_at_fulfil", 58, 8),
    ("requested_at", 66, 8),
    ("fulfilled_at", 74, 8),
    ("status", 82, 1),
    ("_reserved", 83, 64),
];

/// Serialized size of `DepositRequestV1` (the account adds 8).
pub const DEPOSIT_REQUEST_V1_LEN: usize = 147;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct RedeemRequestV1 {
    pub version: u8,
    pub bump: u8,
    pub owner: Pubkey,
    pub seq: u64,
    pub shares: u64,
    pub assets_out: u64,
    pub nav_at_fill: u64,
    pub requested_at: i64,
    pub filled_at: i64,
    pub status: u8,
    pub _reserved: [u8; 64],
}

pub const REDEEM_REQUEST_V1: OffsetTable = &[
    ("version", 0, 1),
    ("bump", 1, 1),
    ("owner", 2, 32),
    ("seq", 34, 8),
    ("shares", 42, 8),
    ("assets_out", 50, 8),
    ("nav_at_fill", 58, 8),
    ("requested_at", 66, 8),
    ("filled_at", 74, 8),
    ("status", 82, 1),
    ("_reserved", 83, 64),
];

/// Serialized size of `RedeemRequestV1` (the account adds 8).
pub const REDEEM_REQUEST_V1_LEN: usize = 147;
