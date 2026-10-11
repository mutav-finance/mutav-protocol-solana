//! `request_redeem(shares, min_assets_out, eligibility)` (spec §5.5;
//! ADR 0023). Owner, never a delegate. `min_assets_out` is the owner's price
//! limit (`0` = none).
//!
//! **Exit is open to holders** (ADR 0023, AV-6): a wallet that holds shares
//! is not checked against the allowlist, so a de-listed holder can always
//! leave; `eligibility` is read only from a wallet with no shares (which then
//! has nothing to redeem). **An exit of the balance may be below
//! `min_request`** (Q-1, NEW-B; ADR 0029): from the owner's canonical share
//! associated token account, leaving less than `min_request` behind, and
//! worth at least the sub-minimum floor. Never 0 BRS; never above
//! `max_request`.

use anchor_lang::prelude::*;
use anchor_spl::{
    token::Token,
    token_interface::{transfer_checked, Mint, TokenAccount, TransferChecked},
};

use crate::{
    constants::*,
    errors::MutavError,
    events::RedeemRequested,
    instructions::capital::{owner_ata, require_eligible, Eligibility},
    instructions::operator::coverage_snapshot,
    math::{assets_for, redeem_size_error},
    state::{RedeemRequest, VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
pub struct RequestRedeem<'info> {
    /// The investor. Pays the request's rent.
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.reserve_mint.as_ref()],
        bump = config.bump,
        constraint = config.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub config: Box<Account<'info, VaultConfig>>,

    #[account(
        mut,
        seeds = [STATE_SEED, config.key().as_ref()],
        bump = state.bump,
        constraint = state.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub state: Box<Account<'info, VaultState>>,

    #[account(
        init,
        payer = owner,
        space = REDEEM_REQUEST_SIZE,
        seeds = [REDEEM_SEED, config.key().as_ref(), state.next_redeem_seq.to_le_bytes().as_ref()],
        bump,
    )]
    pub redeem_request: Box<Account<'info, RedeemRequest>>,

    /// The owner's share account. Owner, never delegate (spec §5): a delegate
    /// approved by another wallet fails here.
    #[account(
        mut,
        constraint = owner_shares.owner == owner.key() @ MutavError::Unauthorized,
        constraint = owner_shares.mint == config.share_mint @ MutavError::InvalidMint,
    )]
    pub owner_shares: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, seeds = [PENDING_REDEMPTIONS_SEED, config.key().as_ref()], bump)]
    pub pending_redemptions: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(address = config.share_mint @ MutavError::InvalidMint)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,

    pub share_token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_request_redeem(
    ctx: Context<RequestRedeem>,
    shares: u64,
    min_assets_out: u64,
    eligibility: Eligibility,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let owner = ctx.accounts.owner.key();
    require!(!config.paused, MutavError::Paused);
    // The share account's owner is the signer (account constraint). Entry is
    // gated, exit is not: a holder skips the allowlist (ADR 0023).
    let owner_shares = &ctx.accounts.owner_shares;
    if owner_shares.amount == 0 {
        require_eligible(config, &owner, &eligibility)?;
    }
    require!(shares > 0, MutavError::InvalidParameter);
    // Size in BRS at the current NAV; later NAV drift is ignored.
    let sol = coverage_snapshot(config, &ctx.accounts.state)?;
    let value = assets_for(
        shares,
        ctx.accounts.state.shares_outstanding,
        sol.net_assets,
    )?;
    // Below `min_request`, only an exit of the balance of the canonical
    // share account, above a floor (ADR 0029, `math::redeem_size_error`): a
    // balance cannot be split across token accounts into sub-minimum
    // requests, and a share sent into the account does not block the exit.
    let canonical = owner_ata(
        &owner,
        &config.share_mint,
        &ctx.accounts.share_token_program.key(),
    );
    let remainder = assets_for(
        owner_shares.amount.saturating_sub(shares),
        ctx.accounts.state.shares_outstanding,
        sol.net_assets,
    )?;
    if let Some(e) = redeem_size_error(
        value,
        remainder,
        owner_shares.key() == canonical,
        config.caps.min_request,
        config.caps.max_request,
    ) {
        return Err(e.into());
    }

    // Escrow with the owner as authority, never a delegate.
    transfer_checked(
        CpiContext::new(
            ctx.accounts.share_token_program.key(),
            TransferChecked {
                from: ctx.accounts.owner_shares.to_account_info(),
                mint: ctx.accounts.share_mint.to_account_info(),
                to: ctx.accounts.pending_redemptions.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        shares,
        ctx.accounts.share_mint.decimals,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let state = &mut ctx.accounts.state;
    let seq = state.next_redeem_seq;
    state.next_redeem_seq = seq.checked_add(1).ok_or(MutavError::MathOverflow)?;
    state.pending_redeem_shares = state
        .pending_redeem_shares
        .checked_add(shares)
        .ok_or(MutavError::MathOverflow)?;

    let r = &mut ctx.accounts.redeem_request;
    r.version = PROGRAM_LAYOUT_VERSION;
    r.bump = ctx.bumps.redeem_request;
    r.owner = owner;
    r.seq = seq;
    r.shares = shares;
    r.requested_at = now;
    r.min_assets_out = min_assets_out;
    r.status = REDEEM_PENDING;

    emit_cpi!(RedeemRequested {
        config: ctx.accounts.config.key(),
        ts: now,
        owner,
        seq,
        shares,
        min_assets_out,
    });
    Ok(())
}
