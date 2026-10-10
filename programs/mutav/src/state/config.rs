//! `VaultConfig` and its nested `Caps` (spec §3.1, §8).
//!
//! Account and authority skeleton adapted from `solana-foundation/vault`
//! (`programs/async_vault/src/state/async_vault.rs`, commit c359962), MIT
//! License, Copyright (c) 2026 Solana Foundation. See `NOTICE`.
//! Changes: per-reserve seeds, separate admin / operator / pauser roles, caps,
//! fixed-size layout with `_reserved` padding.

use anchor_lang::prelude::*;

use crate::{
    constants::{field, PROGRAM_LAYOUT_VERSION, VAULT_CONFIG_SIZE},
    events::ConfigChanges,
};

/// Per-reserve configuration. Seeds: `["config", reserve_mint]`. Written only
/// by admin instructions (and `pause` / `revoke_operator`). Layout frozen for
/// the pilot: append-only, fields carved from `_reserved` (spec §14.2).
#[account]
#[derive(InitSpace)]
pub struct VaultConfig {
    /// Layout version (pilot = 1).
    pub version: u8,
    /// Bump of this PDA.
    pub bump: u8,
    /// Bump of the vault authority PDA `["authority", config]`, stored so
    /// signing CPIs need no `find_program_address`.
    pub authority_bump: u8,
    /// Squads vault address.
    pub admin: Pubkey,
    /// Operator key. `Pubkey::default()` when revoked.
    pub operator: Pubkey,
    /// Pauser key.
    pub pauser: Pubkey,
    /// BRS mint. Immutable after `initialize`.
    pub reserve_mint: Pubkey,
    /// Token program owning `reserve_mint`. Immutable.
    pub reserve_token_program: Pubkey,
    /// Immutable.
    pub reserve_decimals: u8,
    /// Share mint (authority = vault authority).
    pub share_mint: Pubkey,
    /// Coverage ratio `c` in bps.
    pub coverage_ratio_bps: u16,
    /// MUTAV's take from each guarantee fee, `<= MAX_FEE_TAKE_BPS`.
    pub fee_take_bps: u16,
    /// Whitelisted MUTAV payments token account (BRS).
    pub payments_account: Pubkey,
    /// Whitelisted MUTAV treasury token account (BRS).
    pub treasury_account: Pubkey,
    /// Merkle root of allowlisted investor wallets.
    pub investor_allowlist_root: [u8; 32],
    pub caps: Caps,
    /// Global pause flag.
    pub paused: bool,
    /// Bitmask of optional features. `0` in the pilot; bits outside
    /// `SUPPORTED_FEATURES` fail closed.
    pub feature_flags: u64,
    /// MUTAV's allowlisted capital wallet, disclosed on-chain.
    pub mutav_capital_wallet: Pubkey,
    // -- ADR 0019 carves. Each is written zero and read by no instruction of
    // this binary; the instructions that use them come later. Zero is the
    // pilot behaviour. --
    /// Number of whitelisted adapters (each described by its `AdapterState`
    /// PDA, ADR 0018). `0` = BRS only.
    pub adapter_count: u8,
    /// Bitmap of enabled adapter slots, `MAX_ADAPTERS` bits. `0` = none.
    pub adapter_bitmap: u8,
    /// Proposed new admin, waiting for its own acceptance.
    /// `Pubkey::default()` = none pending.
    pub pending_admin: Pubkey,
    /// When `pending_admin` expires (unix seconds). `0` = nothing pending.
    pub pending_admin_expires_at: i64,
    /// Proposed new operator, waiting for its own acceptance. Default = none.
    pub pending_operator: Pubkey,
    /// When `pending_operator` expires. `0` = nothing pending.
    pub pending_operator_expires_at: i64,
    /// Proposed new pauser, waiting for its own acceptance. Default = none.
    pub pending_pauser: Pubkey,
    /// When `pending_pauser` expires. `0` = nothing pending.
    pub pending_pauser_expires_at: i64,
    /// Pause-only guardian keys. `Pubkey::default()` = empty slot.
    pub guardians: [Pubkey; 3],
    /// Zeroed. Never read or written by logic. Holds the planned carves
    /// (phase-2 exit parameters, the ADR 0012 config fields) without a
    /// migration (spec §14.2, ADR 0019).
    pub _reserved: [u8; 512],
}

const _: () = assert!(8 + VaultConfig::INIT_SPACE == VAULT_CONFIG_SIZE);

impl VaultConfig {
    /// Version guard (spec §14.2 R1b). `VaultConfig` has no status fields.
    pub fn is_supported(&self) -> bool {
        self.version <= PROGRAM_LAYOUT_VERSION
    }

    /// `true` only for the current, non-revoked operator.
    pub fn is_operator(&self, key: &Pubkey) -> bool {
        self.operator != Pubkey::default() && *key == self.operator
    }

    /// `true` for the pauser or the admin.
    pub fn is_pauser_or_admin(&self, key: &Pubkey) -> bool {
        *key == self.pauser || *key == self.admin
    }

    /// Writes `caps` in place, field by field, recording changes.
    pub fn apply_caps(&mut self, a: &CapsInput, ch: &mut ConfigChanges) {
        let c = &mut self.caps;
        ch.set(field::CAPS_MAX_TVL, &mut c.max_tvl, a.max_tvl);
        ch.set(
            field::CAPS_MAX_COVER_PER_GUARANTEE,
            &mut c.max_cover_per_guarantee,
            a.max_cover_per_guarantee,
        );
        ch.set(
            field::CAPS_MAX_CLAIM_PER_CALL,
            &mut c.max_claim_per_call,
            a.max_claim_per_call,
        );
        ch.set(
            field::CAPS_MAX_CLAIM_PER_PERIOD,
            &mut c.max_claim_per_period,
            a.max_claim_per_period,
        );
        ch.set(field::CAPS_MIN_REQUEST, &mut c.min_request, a.min_request);
        ch.set(field::CAPS_MAX_REQUEST, &mut c.max_request, a.max_request);
        ch.set(
            field::MAX_NAV_MOVE_BPS,
            &mut c.max_nav_move_bps,
            a.max_nav_move_bps,
        );
    }
}

/// Caps (spec §8). All values in BRS base units unless noted.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub struct Caps {
    pub max_tvl: u64,
    pub max_cover_per_guarantee: u64,
    pub max_claim_per_call: u64,
    /// The most `pay_claim` may pay in any `CLAIM_WINDOW_DAYS` (31) UTC days
    /// (ADR 0019).
    pub max_claim_per_period: u64,
    pub min_request: u64,
    pub max_request: u64,
    /// The NAV-move guard (spec §7): a NAV-per-share move of more than this,
    /// in bps, between two `refresh`es halts fulfilment.
    pub max_nav_move_bps: u16,
    // -- ADR 0019 carves: written zero, read by no instruction of this
    // binary; `set_config` and the rules that read them come later. Zero is
    // the pilot behaviour. --
    /// R$ amount of claims that could be filed next, for the stress term of
    /// `coverage_required`. `0` = no stress term.
    pub stress_buffer: u64,
    /// After this wait anyone may fill the head redemption under the same
    /// rules (exit fallback). `0` = off.
    pub max_queue_wait_secs: i64,
    /// How long after closing a guarantee may be reinstated. `0` = never.
    pub max_reinstate_age: i64,
    /// Zeroed. Later caps (PC-43) are carved here.
    pub _reserved: [u8; 32],
}

// ---------------------------------------------------------------------------
// Instruction arguments. Same fields as the nested structs, without
// `_reserved`, so an instruction can never write padding (spec §14.2 R4, R6).
// ---------------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct CapsInput {
    pub max_tvl: u64,
    pub max_cover_per_guarantee: u64,
    pub max_claim_per_call: u64,
    pub max_claim_per_period: u64,
    pub min_request: u64,
    pub max_request: u64,
    pub max_nav_move_bps: u16,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nested_sizes() {
        assert_eq!(Caps::INIT_SPACE, 106);
    }

    fn zeroed() -> VaultConfig {
        let bytes = vec![0u8; VaultConfig::INIT_SPACE];
        VaultConfig::deserialize(&mut bytes.as_slice()).unwrap()
    }

    #[test]
    fn version_guard() {
        let mut c = zeroed();
        c.version = PROGRAM_LAYOUT_VERSION;
        assert!(c.is_supported());
        c.version = PROGRAM_LAYOUT_VERSION + 1;
        assert!(!c.is_supported());
        c.version = u8::MAX;
        assert!(!c.is_supported());
    }

    #[test]
    fn revoked_operator_is_nobody() {
        let mut c = zeroed();
        assert!(!c.is_operator(&Pubkey::default()));
        let op = Pubkey::new_unique();
        c.operator = op;
        assert!(c.is_operator(&op));
        assert!(!c.is_operator(&Pubkey::new_unique()));
    }

    #[test]
    fn apply_never_touches_padding() {
        let mut c = zeroed();
        c.caps._reserved = [7; 32];
        c._reserved = [9; 512];
        // The ADR 0019 carves are not `set_config` fields yet.
        c.caps.stress_buffer = 11;
        c.caps.max_reinstate_age = 12;
        c.pending_admin = Pubkey::new_unique();
        c.guardians[2] = Pubkey::new_unique();
        let carved = (
            c.caps.stress_buffer,
            c.caps.max_reinstate_age,
            c.pending_admin,
            c.guardians,
        );
        let mut ch = ConfigChanges::default();
        c.apply_caps(
            &CapsInput {
                max_tvl: 1,
                max_nav_move_bps: 2,
                ..Default::default()
            },
            &mut ch,
        );
        assert_eq!(c.caps._reserved, [7; 32]);
        assert_eq!(c._reserved, [9; 512]);
        assert_eq!(
            (
                c.caps.stress_buffer,
                c.caps.max_reinstate_age,
                c.pending_admin,
                c.guardians
            ),
            carved
        );
        assert_eq!(ch.0.len(), 2);
    }
}
