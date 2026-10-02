//! Interface between the MUTAV core program and reserve adapters.
//!
//! An adapter is a separate program that holds part of the reserve in an
//! external venue (for example a TESOURO position). The core program reaches
//! it only by CPI from its `reserve` instructions, signing with a per-adapter
//! sub-authority PDA. Adapters never pull funds on their own.
//!
//! This crate is a plain library, not a program. It will hold the instruction
//! discriminators and account layouts both sides agree on. Every adapter must
//! implement the three instructions below.
//!
//! # `deposit(amount: u64)`
//! Move `amount` of the reserve mint from the core program's escrow into the
//! venue. Callable only by the core program's sub-authority.
//!
//! # `withdraw(amount: u64)`
//! Return `amount` of the reserve mint from the venue to the core program's
//! escrow. Must deliver at least `amount` or fail; partial fills fail.
//!
//! # `report_value() -> u64`
//! Report the position's current value in reserve-mint base units, via return
//! data. The core program applies its own pricing bounds (`pricing.rs`) and
//! never trusts this figure blindly.

/// Instruction names every adapter exposes. Discriminators are derived from
/// these with Anchor's `sha256("global:<name>")[..8]` convention.
pub mod ix {
    pub const DEPOSIT: &str = "deposit";
    pub const WITHDRAW: &str = "withdraw";
    pub const REPORT_VALUE: &str = "report_value";
}
