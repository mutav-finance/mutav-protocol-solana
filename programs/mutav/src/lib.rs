//! MUTAV core program: an on-chain, verifiable BRL guarantee reserve.
//!
//! `lib.rs` is thin dispatch only. Each handler lives under `instructions/`,
//! grouped by the role allowed to call it (admin, operator, capital, reserve,
//! public). Business logic lands in later PRs; see `docs/spec.md`.

pub mod allowlist;
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

    /// File an approved claim: books the provision, so NAV reflects it at
    /// once. Never paused, never solvency-gated. Operator.
    pub fn file_claim(
        ctx: Context<FileClaim>,
        leg: u8,
        amount: u64,
        notice_ref_hash: [u8; 32],
    ) -> Result<()> {
        instructions::operator::file_claim::handle_file_claim(ctx, leg, amount, notice_ref_hash)
    }

    /// Pay a filed claim to the whitelisted payments account. Never paused,
    /// never solvency-gated, no mode check. Operator.
    pub fn pay_claim(
        ctx: Context<PayClaim>,
        leg: u8,
        amount: u64,
        notice_ref_hash: [u8; 32],
    ) -> Result<()> {
        instructions::operator::pay_claim::handle_pay_claim(ctx, leg, amount, notice_ref_hash)
    }

    /// Record the PIX settlement of a payout. Operator.
    pub fn settle_payout(
        ctx: Context<SettlePayout>,
        notice_ref_hash: [u8; 32],
        pix_e2e_hash: [u8; 32],
    ) -> Result<()> {
        instructions::operator::settle_payout::handle_settle_payout(
            ctx,
            notice_ref_hash,
            pix_e2e_hash,
        )
    }

    /// Escrow BRS in `pending_deposits` and join the deposit queue. Not
    /// paused; allowlisted; size-limited; owner signs. Investor.
    pub fn request_deposit(
        ctx: Context<RequestDeposit>,
        assets: u64,
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::capital::request_deposit::handle_request_deposit(ctx, assets, proof)
    }

    /// Refund a pending deposit request and close it. Never paused. Owner.
    pub fn cancel_deposit(ctx: Context<CancelDeposit>) -> Result<()> {
        instructions::capital::cancel_deposit::handle_cancel_deposit(ctx)
    }

    /// Fulfil up to `count` deposit requests in FIFO order at the NAV at
    /// fulfil. Allowed in under-coverage. Admin.
    pub fn fulfil_deposits(ctx: Context<FulfilDeposits>, count: u8) -> Result<()> {
        instructions::capital::fulfil_deposits::handle_fulfil_deposits(ctx, count)
    }

    /// Mint a fulfilled request's shares to its owner and close it. Never
    /// paused. Owner.
    pub fn claim_shares(ctx: Context<ClaimShares>) -> Result<()> {
        instructions::capital::claim_shares::handle_claim_shares(ctx)
    }

    /// Escrow shares in `pending_redemptions` and join the redemption queue.
    /// Not paused; allowlisted; size-limited at the current NAV; owner, never
    /// a delegate. Investor.
    pub fn request_redeem(
        ctx: Context<RequestRedeem>,
        shares: u64,
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::capital::request_redeem::handle_request_redeem(ctx, shares, proof)
    }

    /// Return a redeem request's unfilled shares. Never paused. Owner.
    pub fn cancel_redeem(ctx: Context<CancelRedeem>) -> Result<()> {
        instructions::capital::cancel_redeem::handle_cancel_redeem(ctx)
    }

    /// Fill redeem requests in strict FIFO order out of `free_capital` and
    /// `liquid_budget`, each at its own NAV, up to `max_assets`. Admin.
    pub fn fulfil_redeems(ctx: Context<FulfilRedeems>, count: u8, max_assets: u64) -> Result<()> {
        instructions::capital::fulfil_redeems::handle_fulfil_redeems(ctx, count, max_assets)
    }

    /// Pay a redeem request's filled BRS to its owner. Never paused. Owner.
    pub fn claim_assets(ctx: Context<ClaimAssets>) -> Result<()> {
        instructions::capital::claim_assets::handle_claim_assets(ctx)
    }

    /// Move `redeem_head` / `deposit_head` over dead seqs (skip proof).
    /// Moves no funds. Never paused. Anyone.
    pub fn advance_queue_heads(ctx: Context<AdvanceQueueHeads>, max: u8) -> Result<()> {
        instructions::public::advance_queue_heads::handle_advance_queue_heads(ctx, max)
    }
}
