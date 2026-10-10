//! `Payout` (spec §3.7): one per paid notice, until PIX settlement.

use anchor_lang::prelude::*;

use crate::constants::{
    LEG_DEFAULT, LEG_EXIT, PAYOUT_PENDING, PAYOUT_SETTLED, PAYOUT_SIZE, PROGRAM_LAYOUT_VERSION,
};

/// Seeds: `["payout", guarantee, notice_ref_hash]`. Created by `pay_claim`;
/// the seed makes payment idempotent per notice.
#[account]
#[derive(InitSpace)]
pub struct Payout {
    pub version: u8,
    pub bump: u8,
    pub guarantee: Pubkey,
    /// As in `ClaimFiling`.
    pub leg: u8,
    pub amount: u64,
    pub notice_ref_hash: [u8; 32],
    /// Destination at payment time.
    pub payments_account: Pubkey,
    /// `PAYOUT_PENDING` / `PAYOUT_SETTLED`.
    pub status: u8,
    pub paid_at: i64,
    /// Hash of the PIX end-to-end ID. Zero while pending.
    pub pix_e2e_hash: [u8; 32],
    /// `0` while pending.
    pub settled_at: i64,
    /// Zeroed. Never read or written by logic. The 128-byte pilot budget
    /// (spec §14.2), plus the byte of the retired payout-SLA flag, holds the
    /// ADR 0012 settlement fields (74 bytes) without a migration; it was
    /// grown before the layout freeze (ADR 0019).
    pub _reserved: [u8; 129],
}

const _: () = assert!(8 + Payout::INIT_SPACE == PAYOUT_SIZE);

impl Payout {
    /// Version guard (spec §14.2 R1b): known version, leg and status.
    pub fn is_supported(&self) -> bool {
        self.version <= PROGRAM_LAYOUT_VERSION
            && matches!(self.leg, LEG_DEFAULT | LEG_EXIT)
            && matches!(self.status, PAYOUT_PENDING | PAYOUT_SETTLED)
    }
}
