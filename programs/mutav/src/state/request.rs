//! `DepositRequest` and `RedeemRequest` (spec §3.8).
//!
//! Async request skeleton adapted from `solana-foundation/vault`
//! (`programs/async_vault/src/state/`, commit c359962), MIT License,
//! Copyright (c) 2026 Solana Foundation. See `NOTICE`.
//! Changes: one PDA per FIFO `seq` (not per owner), `u8` statuses and
//! `_reserved` padding.

use anchor_lang::prelude::*;

use crate::constants::{
    DEPOSIT_FULFILLED, DEPOSIT_PENDING, DEPOSIT_REQUEST_SIZE, PROGRAM_LAYOUT_VERSION,
    REDEEM_FILLED, REDEEM_PENDING, REDEEM_REQUEST_SIZE,
};

/// Seeds: `["deposit", config, seq]` (`seq` as `u64` little-endian). Rent is
/// paid by the owner and returned on `claim_shares` or `cancel_deposit`.
#[account]
#[derive(InitSpace)]
pub struct DepositRequest {
    pub version: u8,
    pub bump: u8,
    pub owner: Pubkey,
    /// FIFO position.
    pub seq: u64,
    /// BRS escrowed in `pending_deposits`.
    pub assets: u64,
    /// Set at fulfil.
    pub shares_out: u64,
    /// Conversion price at fulfil (`NAV_SCALE`).
    pub nav_at_fulfil: u64,
    pub requested_at: i64,
    pub fulfilled_at: i64,
    /// `DEPOSIT_PENDING` / `DEPOSIT_FULFILLED`.
    pub status: u8,
    /// Zeroed. Never read or written by logic.
    pub _reserved: [u8; 64],
}

const _: () = assert!(8 + DepositRequest::INIT_SPACE == DEPOSIT_REQUEST_SIZE);

impl DepositRequest {
    /// Version guard (spec §14.2 R1b): known version and status.
    pub fn is_supported(&self) -> bool {
        self.version <= PROGRAM_LAYOUT_VERSION
            && matches!(self.status, DEPOSIT_PENDING | DEPOSIT_FULFILLED)
    }
}

/// Seeds: `["redeem", config, seq]` (`seq` as `u64` little-endian). Filled
/// whole, at the NAV of the fill; the partial fills of ADR 0010 are carved
/// from `_reserved` when they are built (ADR 0019). Rent is paid by the owner
/// and returned on `claim_assets` or `cancel_redeem`.
#[account]
#[derive(InitSpace)]
pub struct RedeemRequest {
    pub version: u8,
    pub bump: u8,
    pub owner: Pubkey,
    /// FIFO position. Never changes.
    pub seq: u64,
    /// Shares escrowed in `pending_redemptions`. Immutable.
    pub shares: u64,
    /// BRS moved to `claims` at the fill, owed to the owner. Set at fill.
    pub assets_out: u64,
    /// Conversion price at the fill (`NAV_SCALE`).
    pub nav_at_fill: u64,
    pub requested_at: i64,
    /// `0` until filled.
    pub filled_at: i64,
    /// `REDEEM_PENDING` / `REDEEM_FILLED`.
    pub status: u8,
    // -- carved from `_reserved` by ADR 0019 (8 bytes) --
    /// Shares burned by fills: `0` while pending, `shares` after the whole
    /// fill. The remainder is derived, `shares − shares_filled`, so the
    /// partial fills of ADR 0010 only add their own counters later.
    pub shares_filled: u64,
    /// Zeroed. Never read or written by logic. Holds the rest of the ADR 0010
    /// partial-fill fields without a migration (ADR 0019).
    pub _reserved: [u8; 56],
}

const _: () = assert!(8 + RedeemRequest::INIT_SPACE == REDEEM_REQUEST_SIZE);

impl RedeemRequest {
    /// Version guard (spec §14.2 R1b): known version and status.
    pub fn is_supported(&self) -> bool {
        self.version <= PROGRAM_LAYOUT_VERSION
            && matches!(self.status, REDEEM_PENDING | REDEEM_FILLED)
    }

    /// Shares still escrowed: `shares − shares_filled`.
    pub fn shares_remaining(&self) -> u64 {
        self.shares.saturating_sub(self.shares_filled)
    }
}
