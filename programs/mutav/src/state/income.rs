//! `IncomeReceipt` (spec §3.14, ADR 0017, ADR 0019): each inflow reference
//! counts once. One account type for every booked inflow, told apart by
//! `kind`: issuer income statements and guarantee fees today, unsolicited
//! funds and MUTAV backstop contributions in a later upgrade.

use anchor_lang::prelude::*;

use crate::constants::{INCOME_KIND_FEE, INCOME_KIND_NORA_STATEMENT, INCOME_RECEIPT_SIZE};

/// Seeds: `["income", config, ref_hash]` for issuer statements and
/// `["fee", config, ref_hash]` for guarantee fees (separate prefixes, so an
/// invoice and a statement can never collide). Never closed.
#[account]
#[derive(InitSpace)]
pub struct IncomeReceipt {
    pub version: u8,
    pub bump: u8,
    /// `INCOME_KIND_NORA_STATEMENT` (`sweep_income`) or `INCOME_KIND_FEE`
    /// (`contribute_fees`). `INCOME_KIND_UNSOLICITED` and
    /// `INCOME_KIND_BACKSTOP` are reserved for a later upgrade.
    pub kind: u8,
    /// Commitment to the issuer's statement or the fee invoice.
    pub ref_hash: [u8; 32],
    /// The statement's month, `YYYYMM`. `0` for a fee.
    pub period: u32,
    /// Amount received.
    pub gross: u64,
    /// MUTAV's take, sent to the treasury (fees only; `0` for income).
    pub take: u64,
    /// Net into `reserve`.
    pub net: u64,
    pub slot: u64,
    /// Zeroed. Never read or written by logic.
    pub _reserved: [u8; 64],
}

const _: () = assert!(8 + IncomeReceipt::INIT_SPACE == INCOME_RECEIPT_SIZE);

impl IncomeReceipt {
    /// Version guard (spec §14.2 R1b): a kind this binary writes.
    pub fn is_supported(&self) -> bool {
        self.version <= crate::constants::PROGRAM_LAYOUT_VERSION
            && matches!(self.kind, INCOME_KIND_NORA_STATEMENT | INCOME_KIND_FEE)
    }
}
