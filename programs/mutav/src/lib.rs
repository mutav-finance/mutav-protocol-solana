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
    /// authority, the share mint, the four reserve token accounts, the
    /// `unsolicited` token account and the income inbox (ADR 0017). The
    /// reserve mint must have 6 decimals.
    /// Upgrade authority only.
    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        instructions::admin::initialize::handle_initialize(ctx, args)
    }

    /// Set the listed config fields (caps, the NAV-move bound, fee take,
    /// coverage ratio, feature flags, the MUTAV capital wallet), then check
    /// the whole resulting config (ADR 0026). At most 16 params, no field
    /// twice. Admin.
    pub fn set_config(ctx: Context<SetConfig>, params: Vec<ConfigParam>) -> Result<()> {
        instructions::admin::set_config::handle_set_config(ctx, params)
    }

    /// Propose the next operator (`ROLE_OPERATOR`) or pauser
    /// (`ROLE_PAUSER`); the key accepts within 72 hours (ADR 0020). Admin.
    pub fn propose_role(ctx: Context<AdminRoleUpdate>, role: u8, key: Pubkey) -> Result<()> {
        instructions::admin::roles::handle_propose_role(ctx, role, key)
    }

    /// Take a proposed operator or pauser role. The proposed key.
    pub fn accept_role(ctx: Context<AcceptRole>, role: u8) -> Result<()> {
        instructions::admin::roles::handle_accept_role(ctx, role)
    }

    /// Propose the next admin; it accepts within 72 hours (ADR 0020). Admin.
    pub fn propose_admin(ctx: Context<AdminRoleUpdate>, key: Pubkey) -> Result<()> {
        instructions::admin::roles::handle_propose_admin(ctx, key)
    }

    /// Take the proposed admin role. The proposed admin.
    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        instructions::admin::roles::handle_accept_admin(ctx)
    }

    /// Clear the pending handover of a role (`ROLE_OPERATOR`, `ROLE_PAUSER`
    /// or `ROLE_ADMIN`). Admin.
    pub fn cancel_pending(ctx: Context<AdminRoleUpdate>, role: u8) -> Result<()> {
        instructions::admin::roles::handle_cancel_pending(ctx, role)
    }

    /// Set the three pause-only guardian slots in one step; the default key
    /// empties a slot (ADR 0020). Admin.
    pub fn set_guardians(ctx: Context<AdminRoleUpdate>, guardians: [Pubkey; 3]) -> Result<()> {
        instructions::admin::roles::handle_set_guardians(ctx, guardians)
    }

    /// Remove the pauser at once and clear its pending handover (ADR 0020).
    /// Admin.
    pub fn revoke_pauser(ctx: Context<RevokePauser>) -> Result<()> {
        instructions::admin::revoke_operator::handle_revoke_pauser(ctx)
    }

    /// Whitelist the MUTAV payments token account. Admin.
    pub fn set_payments_account(ctx: Context<SetPaymentsAccount>) -> Result<()> {
        instructions::admin::set_payments_account::handle_set_payments_account(ctx)
    }

    /// Whitelist the MUTAV treasury token account. Admin.
    pub fn set_treasury_account(ctx: Context<SetTreasuryAccount>) -> Result<()> {
        instructions::admin::set_treasury_account::handle_set_treasury_account(ctx)
    }

    /// Set the investor allowlist Merkle root. Admin.
    pub fn set_allowlist_root(ctx: Context<SetAllowlistRoot>, root: [u8; 32]) -> Result<()> {
        instructions::admin::set_allowlist_root::handle_set_allowlist_root(ctx, root)
    }

    /// Clear `fulfil_halted` and reset the NAV-move guard's baseline to the
    /// current NAV, which must lie within `nav_bounds` (ADR 0015, ADR 0023).
    /// Admin.
    pub fn clear_fulfil_halt(ctx: Context<ClearFulfilHalt>, nav_bounds: NavBounds) -> Result<()> {
        instructions::admin::clear_fulfil_halt::handle_clear_fulfil_halt(ctx, nav_bounds)
    }

    /// Pause capital flows and new guarantees. Pauser, admin or a guardian.
    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::admin::pause::handle_pause(ctx)
    }

    /// Lift the pause. Admin.
    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        instructions::admin::pause::handle_unpause(ctx)
    }

    /// Revoke the operator key immediately and clear the pending operator
    /// key. Pauser or admin.
    pub fn revoke_operator(ctx: Context<RevokeOperator>) -> Result<()> {
        instructions::admin::revoke_operator::handle_revoke_operator(ctx)
    }

    /// Register a guarantee: solvency-gated and capped per guarantee.
    /// Operator.
    pub fn register_guarantee(
        ctx: Context<RegisterGuarantee>,
        args: RegisterGuaranteeArgs,
    ) -> Result<()> {
        instructions::operator::register_guarantee::handle_register_guarantee(ctx, args)
    }

    /// Close an active guarantee with no open claims, releasing its remaining
    /// cover. `reason`: `CLOSE_RELEASED`, or `CLOSE_VOID` when nothing was
    /// paid (ADR 0020). Operator.
    pub fn close_guarantee(ctx: Context<CloseGuarantee>, id: [u8; 32], reason: u8) -> Result<()> {
        instructions::operator::close_guarantee::handle_close_guarantee(ctx, id, reason)
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

    /// Sweep one issuer income statement from the income inbox into the
    /// reserve and book it (ADR 0017): NAV rises, never shares. Never paused,
    /// never solvency-gated. Operator.
    pub fn sweep_income(
        ctx: Context<SweepIncome>,
        income_ref_hash: [u8; 32],
        period: u32,
        amount: u64,
    ) -> Result<()> {
        instructions::operator::sweep_income::handle_sweep_income(
            ctx,
            income_ref_hash,
            period,
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

    /// Pay a filed claim's provision, exactly (`expected_amount`), to the
    /// whitelisted payments account (ADR 0021). Never paused, never
    /// solvency-gated, no mode check. Operator.
    pub fn pay_claim(
        ctx: Context<PayClaim>,
        notice_ref_hash: [u8; 32],
        expected_amount: u64,
    ) -> Result<()> {
        instructions::operator::pay_claim::handle_pay_claim(ctx, notice_ref_hash, expected_amount)
    }

    /// Record the PIX settlement of a paid claim on its filing. Operator.
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
        min_shares_out: u64,
        eligibility: Eligibility,
    ) -> Result<()> {
        instructions::capital::request_deposit::handle_request_deposit(
            ctx,
            assets,
            min_shares_out,
            eligibility,
        )
    }

    /// Refund a pending deposit request to its owner and close it. Never
    /// paused. Owner or admin (ADR 0023).
    pub fn cancel_deposit(ctx: Context<CancelDeposit>) -> Result<()> {
        instructions::capital::cancel_deposit::handle_cancel_deposit(ctx)
    }

    /// Fulfil up to `count` deposit requests in FIFO order at the NAV at
    /// fulfil, inside `nav_bounds` (ADR 0023). Allowed in under-coverage.
    /// Admin.
    pub fn fulfil_deposits(
        ctx: Context<FulfilDeposits>,
        count: u8,
        nav_bounds: NavBounds,
    ) -> Result<()> {
        instructions::capital::fulfil_deposits::handle_fulfil_deposits(ctx, count, nav_bounds)
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
        min_assets_out: u64,
        eligibility: Eligibility,
    ) -> Result<()> {
        instructions::capital::request_redeem::handle_request_redeem(
            ctx,
            shares,
            min_assets_out,
            eligibility,
        )
    }

    /// Return a redeem request's unfilled shares. Never paused. Owner.
    pub fn cancel_redeem(ctx: Context<CancelRedeem>) -> Result<()> {
        instructions::capital::cancel_redeem::handle_cancel_redeem(ctx)
    }

    /// Fill redeem requests in strict FIFO order out of `free_capital` and
    /// `liquid_budget`, each at its own NAV inside `nav_bounds`, up to
    /// `max_assets`. Admin.
    pub fn fulfil_redeems(
        ctx: Context<FulfilRedeems>,
        count: u8,
        max_assets: u64,
        nav_bounds: NavBounds,
    ) -> Result<()> {
        instructions::capital::fulfil_redeems::handle_fulfil_redeems(
            ctx, count, max_assets, nav_bounds,
        )
    }

    /// Pay a redeem request's filled BRS to its owner. Never paused. Owner.
    pub fn claim_assets(ctx: Context<ClaimAssets>) -> Result<()> {
        instructions::capital::claim_assets::handle_claim_assets(ctx)
    }

    /// Move the head of one queue (`QUEUE_DEPOSIT` or `QUEUE_REDEEM`) over
    /// dead seqs (skip proof). Moves no funds. Never paused. Anyone.
    pub fn advance_queue_head(ctx: Context<AdvanceQueueHead>, queue: u8, max: u8) -> Result<()> {
        instructions::public::advance_queue_head::handle_advance_queue_head(ctx, queue, max)
    }

    /// Recompute and publish `coverage_required`, NAV per
    /// share and `mode`; run the NAV-move guard. Anyone.
    pub fn refresh(ctx: Context<Refresh>) -> Result<()> {
        instructions::public::refresh::handle_refresh(ctx)
    }
}
