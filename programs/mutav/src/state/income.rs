//! `IncomeReceipt` (spec §3.14, ADR 0017): each issuer income statement
//! counts once.

use anchor_lang::prelude::*;

use crate::constants::INCOME_RECEIPT_SIZE;

/// Seeds: `["income", config, income_ref_hash]`. Created by `sweep_income`;
/// its existence makes each statement count exactly once. Never closed.
#[account]
#[derive(InitSpace)]
pub struct IncomeReceipt {
    pub version: u8,
    pub bump: u8,
    /// Commitment to the issuer's statement (amount and reference).
    pub income_ref_hash: [u8; 32],
    /// The statement's month, `YYYYMM`.
    pub period: u32,
    /// Amount swept out of the income inbox.
    pub gross: u64,
    /// MUTAV's take, sent to the treasury.
    pub take: u64,
    /// Net into `reserve`.
    pub net: u64,
    pub slot: u64,
    /// Zeroed. Never read or written by logic.
    pub _reserved: [u8; 64],
}

const _: () = assert!(8 + IncomeReceipt::INIT_SPACE == INCOME_RECEIPT_SIZE);
