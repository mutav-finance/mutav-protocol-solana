//! `VaultConfig` and its nested structs (spec §3.1, §3.9, §7, §8, §13.2).
//!
//! Account and authority skeleton adapted from `solana-foundation/vault`
//! (`programs/async_vault/src/state/async_vault.rs`, commit c359962), MIT
//! License, Copyright (c) 2026 Solana Foundation. See `NOTICE`.
//! Changes: per-reserve seeds, separate admin / operator / pauser roles, caps,
//! price and exit parameters, fixed-size layout with `_reserved` padding.

use anchor_lang::prelude::*;

use crate::{
    constants::{field, MAX_ADAPTERS, PROGRAM_LAYOUT_VERSION, VAULT_CONFIG_SIZE},
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
    /// Whitelisted adapters.
    pub adapters: [AdapterEntry; MAX_ADAPTERS],
    pub caps: Caps,
    pub price: PriceParams,
    /// Settlement SLA for payouts.
    pub payout_sla_secs: i64,
    /// Global pause flag.
    pub paused: bool,
    /// Bitmask of optional features. `0` in the pilot.
    pub feature_flags: u64,
    /// MUTAV's allowlisted capital wallet, disclosed on-chain.
    pub mutav_capital_wallet: Pubkey,
    /// Phase-2 instant-exit parameters. All zero in the pilot.
    pub exit: ExitParams,
    /// Zeroed. Never read or written by logic.
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
            field::CAPS_MAX_COVER_PER_AGENCY,
            &mut c.max_cover_per_agency,
            a.max_cover_per_agency,
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
        ch.set(
            field::CAPS_CLAIM_PERIOD_SECS,
            &mut c.claim_period_secs,
            a.claim_period_secs,
        );
        ch.set(
            field::CAPS_MAX_TESOURO_SHARE_BPS,
            &mut c.max_tesouro_share_bps,
            a.max_tesouro_share_bps,
        );
        ch.set(field::CAPS_MIN_REQUEST, &mut c.min_request, a.min_request);
        ch.set(field::CAPS_MAX_REQUEST, &mut c.max_request, a.max_request);
        ch.set(
            field::CAPS_MIN_FILL_ASSETS,
            &mut c.min_fill_assets,
            a.min_fill_assets,
        );
    }

    /// Writes `price` in place, field by field, recording changes.
    pub fn apply_price(&mut self, a: &PriceInput, ch: &mut ConfigChanges) {
        let p = &mut self.price;
        ch.set(
            field::PRICE_TESOURO_PRICE_ACCOUNT,
            &mut p.tesouro_price_account,
            a.tesouro_price_account,
        );
        ch.set(field::PRICE_P0, &mut p.p0, a.p0);
        ch.set(field::PRICE_T0, &mut p.t0, a.t0);
        ch.set(field::PRICE_Y_MAX_BPS, &mut p.y_max_bps, a.y_max_bps);
        ch.set(
            field::PRICE_MAX_STALENESS_SECS,
            &mut p.max_staleness_secs,
            a.max_staleness_secs,
        );
        ch.set(
            field::PRICE_MAX_DEVIATION_BPS,
            &mut p.max_deviation_bps,
            a.max_deviation_bps,
        );
        ch.set(
            field::PRICE_MAX_NAV_MOVE_BPS,
            &mut p.max_nav_move_bps,
            a.max_nav_move_bps,
        );
    }

    /// Writes `exit` in place, field by field, recording changes.
    pub fn apply_exit(&mut self, a: &ExitInput, ch: &mut ConfigChanges) {
        let e = &mut self.exit;
        ch.set(
            field::EXIT_BUFFER_TARGET_BPS,
            &mut e.buffer_target_bps,
            a.buffer_target_bps,
        );
        ch.set(
            field::EXIT_BUFFER_HEADROOM_BPS,
            &mut e.buffer_headroom_bps,
            a.buffer_headroom_bps,
        );
        ch.set(
            field::EXIT_BUFFER_RELEASE_AFTER_SECS,
            &mut e.buffer_release_after_secs,
            a.buffer_release_after_secs,
        );
        ch.set(
            field::EXIT_CURVE_VERSION,
            &mut e.curve_version,
            a.curve_version,
        );
        ch.set(field::EXIT_H_MIN_BPS, &mut e.h_min_bps, a.h_min_bps);
        ch.set(field::EXIT_H_PEG_BPS, &mut e.h_peg_bps, a.h_peg_bps);
        ch.set(field::EXIT_H_MAX_BPS, &mut e.h_max_bps, a.h_max_bps);
        ch.set(
            field::EXIT_PRESSURE_EPOCH_SECS,
            &mut e.pressure_epoch_secs,
            a.pressure_epoch_secs,
        );
        ch.set(
            field::EXIT_MIN_INSTANT_ASSETS,
            &mut e.min_instant_assets,
            a.min_instant_assets,
        );
        ch.set(
            field::EXIT_MAX_INSTANT_PER_TX,
            &mut e.max_instant_per_tx,
            a.max_instant_per_tx,
        );
        ch.set(
            field::EXIT_MAX_INSTANT_PER_WALLET,
            &mut e.max_instant_per_wallet,
            a.max_instant_per_wallet,
        );
        ch.set(
            field::EXIT_MAX_INSTANT_PER_PERIOD,
            &mut e.max_instant_per_period,
            a.max_instant_per_period,
        );
        ch.set(
            field::EXIT_INSTANT_PERIOD_SECS,
            &mut e.instant_period_secs,
            a.instant_period_secs,
        );
        ch.set(
            field::EXIT_MIN_HOLD_SECS,
            &mut e.min_hold_secs,
            a.min_hold_secs,
        );
        ch.set(
            field::EXIT_MAX_PRICE_AGE_SECS,
            &mut e.max_price_age_secs,
            a.max_price_age_secs,
        );
        ch.set(
            field::EXIT_ALLOWLIST_ROOT,
            &mut e.allowlist_root,
            a.allowlist_root,
        );
        for (i, (slot, new)) in e.barred.iter_mut().zip(a.barred).enumerate() {
            ch.set(field::EXIT_BARRED_0 + i as u16, slot, new);
        }
    }
}

/// A whitelisted adapter, stored inline in `VaultConfig.adapters` (spec §3.9).
/// 177 bytes; `MAX_ADAPTERS × entry` is part of the `VaultConfig` layout.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub struct AdapterEntry {
    pub program_id: Pubkey,
    /// PDA `["adapter", config, program_id]` of the core program.
    pub sub_authority: Pubkey,
    pub asset_mint: Pubkey,
    /// Max BRS-equivalent value allocated through this adapter.
    pub cap: u64,
    /// Current BRS-equivalent value allocated.
    pub allocated: u64,
    pub enabled: bool,
    /// Zeroed. Room for adapter pinning (PC-27: deployed slot `u64` and
    /// upgrade authority `Pubkey`, 40 bytes) without a migration.
    pub _reserved: [u8; 64],
}

/// Caps (spec §8). All values in BRS base units unless noted.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub struct Caps {
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
    /// Zeroed. Later caps (PC-43) are carved here.
    pub _reserved: [u8; 32],
}

/// TESOURO price bounds (spec §7).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub struct PriceParams {
    pub tesouro_price_account: Pubkey,
    pub p0: u64,
    pub t0: i64,
    pub y_max_bps: u16,
    pub max_staleness_secs: i64,
    pub max_deviation_bps: u16,
    pub max_nav_move_bps: u16,
    /// Zeroed. E.g. a stale-price haircut (spec §12 Q21).
    pub _reserved: [u8; 32],
}

/// Phase-2 instant-exit and buffer parameters (spec §13.2). All zero in the
/// pilot; validated only when `INSTANT_EXIT` is on.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub struct ExitParams {
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
    /// Barred wallets in addition to `mutav_capital_wallet`;
    /// `Pubkey::default()` = empty slot.
    pub barred: [Pubkey; 4],
    /// Zeroed. Room for later exit parameters.
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
    pub max_cover_per_agency: u64,
    pub max_claim_per_call: u64,
    pub max_claim_per_period: u64,
    pub claim_period_secs: i64,
    pub max_tesouro_share_bps: u16,
    pub min_request: u64,
    pub max_request: u64,
    pub min_fill_assets: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct PriceInput {
    pub tesouro_price_account: Pubkey,
    pub p0: u64,
    pub t0: i64,
    pub y_max_bps: u16,
    pub max_staleness_secs: i64,
    pub max_deviation_bps: u16,
    pub max_nav_move_bps: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct ExitInput {
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nested_sizes() {
        assert_eq!(AdapterEntry::INIT_SPACE, 177);
        assert_eq!(Caps::INIT_SPACE, 106);
        assert_eq!(PriceParams::INIT_SPACE, 94);
        assert_eq!(ExitParams::INIT_SPACE, 275);
        assert_eq!(MAX_ADAPTERS, 8);
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
        c.price._reserved = [8; 32];
        c.exit._reserved = [9; 32];
        let mut ch = ConfigChanges::default();
        c.apply_caps(
            &CapsInput {
                max_tvl: 1,
                ..Default::default()
            },
            &mut ch,
        );
        c.apply_price(
            &PriceInput {
                p0: 1,
                ..Default::default()
            },
            &mut ch,
        );
        c.apply_exit(
            &ExitInput {
                barred: [Pubkey::new_unique(); 4],
                ..Default::default()
            },
            &mut ch,
        );
        assert_eq!(c.caps._reserved, [7; 32]);
        assert_eq!(c.price._reserved, [8; 32]);
        assert_eq!(c.exit._reserved, [9; 32]);
        assert_eq!(ch.0.len(), 6);
    }
}
