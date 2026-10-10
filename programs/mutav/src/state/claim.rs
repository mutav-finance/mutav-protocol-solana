//! `ClaimFiling` (spec §3.6): one per claim notice, from filing to PIX
//! settlement. It carries the provision while the claim is open, then the
//! payment and its settlement (the former `Payout` account, merged in by
//! ADR 0019).

use anchor_lang::prelude::*;

use crate::constants::{
    CLAIM_FILED, CLAIM_FILING_SIZE, CLAIM_PAID, CLAIM_SETTLED, LEG_DEFAULT, LEG_EXIT,
    PROGRAM_LAYOUT_VERSION,
};

/// Seeds: `["claim", guarantee, notice_ref_hash]`. Created by `file_claim`;
/// `pay_claim` releases its provision and records the payment, which makes
/// payment idempotent per notice; `settle_payout` records the PIX
/// settlement. Never closed, so the public claims history stays readable.
#[account]
#[derive(InitSpace)]
pub struct ClaimFiling {
    pub version: u8,
    pub bump: u8,
    pub guarantee: Pubkey,
    /// `LEG_DEFAULT` / `LEG_EXIT`.
    pub leg: u8,
    pub notice_ref_hash: [u8; 32],
    /// Provision booked by `file_claim`. Released by `pay_claim`.
    pub provision: u64,
    pub filed_at: i64,
    /// `CLAIM_FILED` / `CLAIM_PAID` / `CLAIM_WITHDRAWN` / `CLAIM_SETTLED`.
    /// `PAID` and `SETTLED` are terminal; `WITHDRAWN` returns to `FILED` only
    /// through an explicit re-file (a later upgrade).
    pub status: u8,
    /// Amount paid by `pay_claim`. `0` until paid.
    pub paid_amount: u64,
    /// `0` until paid.
    pub paid_at: i64,
    /// Destination at payment time. Default until paid.
    pub payments_account: Pubkey,
    /// Hash of the PIX end-to-end ID. Zero until settled.
    pub pix_e2e_hash: [u8; 32],
    /// `0` until settled.
    pub settled_at: i64,
    /// The exact amount the reserve admin approved for a claim above
    /// `max_claim_per_call` (`approve_claim`, a later upgrade). `0` = not
    /// approved. Written zero and not read by this binary.
    pub approved_amount: u64,
    /// Zeroed. Never read or written by logic. Holds the ADR 0012 claim and
    /// settlement fields (114 bytes) with room to spare after the freeze,
    /// without a migration (spec §14.2, ADR 0019).
    pub _reserved: [u8; 192],
}

const _: () = assert!(8 + ClaimFiling::INIT_SPACE == CLAIM_FILING_SIZE);

impl ClaimFiling {
    /// Version guard (spec §14.2 R1b): known version, leg and status.
    ///
    /// `CLAIM_WITHDRAWN` is deliberately not accepted yet: no instruction in
    /// this binary writes it, so a withdrawn filing can only come from a
    /// newer binary, and this one fails closed on it. The upgrade that adds
    /// the withdrawal accepts it here (ADR 0019).
    pub fn is_supported(&self) -> bool {
        self.version <= PROGRAM_LAYOUT_VERSION
            && matches!(self.leg, LEG_DEFAULT | LEG_EXIT)
            && matches!(self.status, CLAIM_FILED | CLAIM_PAID | CLAIM_SETTLED)
    }
}
