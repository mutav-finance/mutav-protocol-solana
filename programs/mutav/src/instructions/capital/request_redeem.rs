//! `request_redeem(shares, proof)` (spec §5.5). Owner, never a delegate.

use anchor_lang::prelude::*;
use anchor_spl::{
    token::Token,
    token_interface::{transfer_checked, Mint, TokenAccount, TransferChecked},
};

use crate::{
    constants::*,
    errors::MutavError,
    events::RedeemRequested,
    instructions::capital::{require_allowlisted, require_request_size},
    instructions::operator::solvency_snapshot,
    math::assets_for,
    state::{RedeemRequest, VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
pub struct RequestRedeem<'info> {
    /// The investor. Pays the request's rent.
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(constraint = config.is_supported() @ MutavError::UnsupportedVersion)]
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
    proof: Vec<[u8; 32]>,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let owner = ctx.accounts.owner.key();
    require!(!config.paused, MutavError::Paused);
    require_allowlisted(config, &owner, &proof)?;
    // The share account's owner is the signer (account constraint).
    require!(shares > 0, MutavError::InvalidParameter);
    // Size in BRS at the current NAV; later NAV drift is ignored.
    let sol = solvency_snapshot(config, &ctx.accounts.state)?;
    let value = assets_for(
        shares,
        ctx.accounts.state.shares_outstanding,
        sol.net_assets,
    )?;
    require_request_size(config, value)?;

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
    r.status = REDEEM_PENDING;

    emit_cpi!(RedeemRequested {
        config: ctx.accounts.config.key(),
        ts: now,
        owner,
        seq,
        shares,
    });
    Ok(())
}
