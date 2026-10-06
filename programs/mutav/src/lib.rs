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
#[allow(clippy::module_inception)]
pub mod state;
pub mod token_guard;

use anchor_lang::prelude::*;

pub use instructions::*;

declare_id!("8scC79jkU7SPM9v6M4nB833R8EeqKknfwdRdjn73Qqv9");

#[program]
pub mod mutav {
    use super::*;

    /// Create the reserve: `VaultConfig`, an empty `VaultState`, the vault
    /// authority, the share mint and the four reserve token accounts.
    /// Upgrade authority only.
    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        instructions::admin::initialize::handle_initialize(ctx, args)
    }

    /// Update caps, price bounds, exit parameters, fee take, coverage ratio,
    /// payout SLA, feature flags, treasury and the MUTAV capital wallet. Admin.
    pub fn set_config(ctx: Context<SetConfig>, args: SetConfigArgs) -> Result<()> {
        instructions::admin::set_config::handle_set_config(ctx, args)
    }

    /// Appoint the operator and the pauser. Admin.
    pub fn set_roles(ctx: Context<SetRoles>, operator: Pubkey, pauser: Pubkey) -> Result<()> {
        instructions::admin::set_roles::handle_set_roles(ctx, operator, pauser)
    }

    /// Whitelist the MUTAV payments token account. Admin.
    pub fn set_payments_account(ctx: Context<SetPaymentsAccount>) -> Result<()> {
        instructions::admin::set_payments_account::handle_set_payments_account(ctx)
    }

    /// Set the investor allowlist Merkle root. Admin.
    pub fn set_allowlist_root(ctx: Context<SetAllowlistRoot>, root: [u8; 32]) -> Result<()> {
        instructions::admin::set_allowlist_root::handle_set_allowlist_root(ctx, root)
    }

    /// Pause capital flows, new guarantees and allocation. Pauser or admin.
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::admin::pause::handle_pause(ctx)
    }

    /// Lift the pause. Admin.
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::admin::pause::handle_unpause(ctx)
    }

    /// Revoke the operator key immediately. Pauser or admin.
    pub fn revoke_operator(ctx: Context<RevokeOperator>) -> Result<()> {
        instructions::admin::revoke_operator::handle_revoke_operator(ctx)
    }

    /// Register a guarantee: solvency-gated, per-guarantee and per-agency
    /// capped. Operator.
    pub fn register_guarantee(
        ctx: Context<RegisterGuarantee>,
        args: RegisterGuaranteeArgs,
    ) -> Result<()> {
        instructions::operator::register_guarantee::handle_register_guarantee(ctx, args)
    }

    /// Close an active guarantee with no open claims, releasing its remaining
    /// cover. Operator.
    pub fn close_guarantee(ctx: Context<CloseGuarantee>, id: [u8; 32]) -> Result<()> {
        instructions::operator::close_guarantee::handle_close_guarantee(ctx, id)
    }

    /// Record one invoice's guarantee fee: MUTAV's take to the treasury, the
    /// rest to the reserve. Never paused, never solvency-gated. Operator.
    pub fn contribute_fees(
        ctx: Context<ContributeFees>,
        invoice_ref_hash: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        instructions::operator::contribute_fees::handle_contribute_fees(
            ctx,
            invoice_ref_hash,
            amount,
        )
    }
}
