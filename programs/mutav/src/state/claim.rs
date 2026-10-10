//! `ClaimFiling` (spec §3.6): carries the provision of a filed claim.

use anchor_lang::prelude::*;

use crate::constants::{
    CLAIM_FILED, CLAIM_FILING_SIZE, CLAIM_PAID, LEG_DEFAULT, LEG_EXIT, PROGRAM_LAYOUT_VERSION,
};

/// Seeds: `["claim", guarantee, notice_ref_hash]`. Created by `file_claim`;
/// `pay_claim` releases its provision.
// TODO(spec: §3.6, §12 Q13 — a "Released" state for withdrawn claims is
// TBD). A filed claim leaves only through `pay_claim`.
#[account]
#[derive(InitSpace)]
pub struct ClaimFiling {
    pub version: u8,
    pub bump: u8,
    pub guarantee: Pubkey,
    /// `LEG_DEFAULT` / `LEG_EXIT`.
    pub leg: u8,
    pub notice_ref_hash: [u8; 32],
    pub provision: u64,
    pub filed_at: i64,
    /// `CLAIM_FILED` / `CLAIM_PAID`.
    pub status: u8,
    /// Zeroed. Never read or written by logic. The 128-byte pilot budget
    /// (spec §14.2) holds the ADR 0012 claim fields (49 bytes) without a
    /// migration; it was grown from 64 before the layout freeze (ADR 0019).
    pub _reserved: [u8; 128],
}

const _: () = assert!(8 + ClaimFiling::INIT_SPACE == CLAIM_FILING_SIZE);

impl ClaimFiling {
    /// Version guard (spec §14.2 R1b): known version, leg and status.
    pub fn is_supported(&self) -> bool {
        self.version <= PROGRAM_LAYOUT_VERSION
            && matches!(self.leg, LEG_DEFAULT | LEG_EXIT)
            && matches!(self.status, CLAIM_FILED | CLAIM_PAID)
    }
}
