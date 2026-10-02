//! MUTAV core program: an on-chain, verifiable BRL guarantee reserve.
//!
//! `lib.rs` is thin dispatch only. Each handler lives under `instructions/`,
//! grouped by the role allowed to call it (admin, operator, capital, reserve,
//! public). Business logic lands in later PRs; see `docs/spec.md`.

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod math;
pub mod pricing;
pub mod solvency;
pub mod state;
pub mod token_guard;

use anchor_lang::prelude::*;

pub use instructions::*;

declare_id!("8scC79jkU7SPM9v6M4nB833R8EeqKknfwdRdjn73Qqv9");

#[program]
pub mod mutav {
    use super::*;

    /// Create the `VaultConfig` PDA for a reserve mint and record its roles.
    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        instructions::admin::initialize::handle_initialize(ctx, args)
    }
}
