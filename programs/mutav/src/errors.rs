//! Program error codes. Keep a single `#[error_code]` block (Anchor v1).

use anchor_lang::prelude::*;

#[error_code]
pub enum MutavError {
    /// A role (admin, operator, pauser) was set to the default pubkey.
    #[msg("Role must not be the default pubkey")]
    InvalidRole,
}
