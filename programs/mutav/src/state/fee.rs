//! `FeeReceipt` (spec §3.11): each invoice's guarantee fee counts once.

use anchor_lang::prelude::*;

use crate::constants::FEE_RECEIPT_SIZE;

/// Seeds: `["fee", config, invoice_ref_hash]`. Created by `contribute_fees`;
/// its existence makes each invoice count exactly once. Never closed.
#[account]
#[derive(InitSpace)]
pub struct FeeReceipt {
    pub version: u8,
    pub bump: u8,
    pub invoice_ref_hash: [u8; 32],
    /// Amount received.
    pub gross: u64,
    /// MUTAV's take, sent to the treasury.
    pub take: u64,
    /// Net into `reserve`.
    pub net: u64,
    pub slot: u64,
    /// Zeroed. Never read or written by logic.
    pub _reserved: [u8; 64],
}

const _: () = assert!(8 + FeeReceipt::INIT_SPACE == FEE_RECEIPT_SIZE);
