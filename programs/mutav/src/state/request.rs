//! `DepositRequest` and `RedeemRequest` (spec §3.8; ADR 0010).
//!
//! Async request skeleton adapted from `solana-foundation/vault`
//! (`programs/async_vault/src/state/`, commit c359962), MIT License,
//! Copyright (c) 2026 Solana Foundation. See `NOTICE`.
//! Changes: one PDA per FIFO `seq` (not per owner), `u8` statuses, the
//! partial-fill fields of ADR 0010 and `_reserved` padding.

use anchor_lang::prelude::*;

use crate::constants::{
    DEPOSIT_FULFILLED, DEPOSIT_PENDING, DEPOSIT_REQUEST_SIZE, PROGRAM_LAYOUT_VERSION,
    REDEEM_CANCELLED, REDEEM_FILLED, REDEEM_PARTIALLY_FILLED, REDEEM_PENDING, REDEEM_REQUEST_SIZE,
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

/// Seeds: `["redeem", config, seq]` (`seq` as `u64` little-endian). Supports
/// partial fills at the queue head (ADR 0010); the pilot binary fills whole
/// requests only, but every partial-fill field is real from the pilot, since
/// requests live at an upgrade cannot be migrated (spec §14.2).
#[account]
#[derive(InitSpace)]
pub struct RedeemRequest {
    pub version: u8,
    pub bump: u8,
    pub owner: Pubkey,
    /// FIFO position. Never changes.
    pub seq: u64,
    /// Shares escrowed by `request_redeem`. Immutable.
    pub shares_requested: u64,
    /// Escrowed in `pending_redemptions`, not yet filled. `0` after a cancel.
    pub shares_remaining: u64,
    /// Cumulative shares burned by fills.
    pub shares_filled: u64,
    /// Cumulative BRS moved to `claims`, each fill at its own NAV.
    pub assets_filled: u64,
    /// BRS in `claims` owed to this request and not yet claimed.
    pub assets_claimable: u64,
    pub fill_count: u16,
    /// Conversion price at the last fill (`NAV_SCALE`).
    pub last_fill_nav: u64,
    pub requested_at: i64,
    /// `0` until the first fill.
    pub last_fill_at: i64,
    /// `REDEEM_PENDING` / `REDEEM_PARTIALLY_FILLED` / `REDEEM_FILLED` /
    /// `REDEEM_CANCELLED`.
    pub status: u8,
    /// Zeroed. Never read or written by logic.
    pub _reserved: [u8; 64],
}

const _: () = assert!(8 + RedeemRequest::INIT_SPACE == REDEEM_REQUEST_SIZE);

impl RedeemRequest {
    /// Version guard (spec §14.2 R1b): known version and status.
    pub fn is_supported(&self) -> bool {
        self.version <= PROGRAM_LAYOUT_VERSION
            && matches!(
                self.status,
                REDEEM_PENDING | REDEEM_PARTIALLY_FILLED | REDEEM_FILLED | REDEEM_CANCELLED
            )
    }
}
