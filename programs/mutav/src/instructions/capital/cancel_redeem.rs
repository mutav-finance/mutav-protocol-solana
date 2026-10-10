//! `cancel_redeem()` (spec §5.5; ADR 0010). Owner only. Never pausable.

use anchor_lang::{prelude::*, AccountsClose};
use anchor_spl::{
    token::Token,
    token_interface::{transfer_checked, Mint, TokenAccount, TransferChecked},
};

use crate::{
    constants::*,
    errors::MutavError,
    events::RedeemCancelled,
    state::{RedeemRequest, VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
pub struct CancelRedeem<'info> {
    /// The request's owner; receives the shares back (and the rent, on close).
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
        mut,
        seeds = [REDEEM_SEED, config.key().as_ref(), redeem_request.seq.to_le_bytes().as_ref()],
        bump = redeem_request.bump,
        has_one = owner @ MutavError::Unauthorized,
        constraint = redeem_request.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub redeem_request: Box<Account<'info, RedeemRequest>>,

    /// The owner's share account.
    #[account(
        mut,
        constraint = owner_shares.owner == owner.key() @ MutavError::Unauthorized,
        constraint = owner_shares.mint == config.share_mint @ MutavError::InvalidMint,
    )]
    pub owner_shares: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, seeds = [PENDING_REDEMPTIONS_SEED, config.key().as_ref()], bump)]
    pub pending_redemptions: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: data-less PDA that owns `pending_redemptions`.
    #[account(seeds = [AUTHORITY_SEED, config.key().as_ref()], bump = config.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(address = config.share_mint @ MutavError::InvalidMint)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,

    pub share_token_program: Program<'info, Token>,
}

pub fn handle_cancel_redeem(ctx: Context<CancelRedeem>) -> Result<()> {
    // Never paused. Only this request changes; `redeem_head` is not moved
    // here.
    let r = &ctx.accounts.redeem_request;
    require!(r.status == REDEEM_PENDING, MutavError::InvalidRequestStatus);
    let (seq, returned, owner) = (r.seq, r.shares, r.owner);

    let config_key = ctx.accounts.config.key();
    let authority_seeds: &[&[u8]] = &[
        AUTHORITY_SEED,
        config_key.as_ref(),
        &[ctx.accounts.config.authority_bump],
    ];
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.share_token_program.key(),
            TransferChecked {
                from: ctx.accounts.pending_redemptions.to_account_info(),
                mint: ctx.accounts.share_mint.to_account_info(),
                to: ctx.accounts.owner_shares.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[authority_seeds],
        ),
        returned,
        ctx.accounts.share_mint.decimals,
    )?;

    let state = &mut ctx.accounts.state;
    state.pending_redeem_shares = state
        .pending_redeem_shares
        .checked_sub(returned)
        .ok_or(MutavError::MathOverflow)?;

    emit_cpi!(RedeemCancelled {
        config: config_key,
        ts: Clock::get()?.unix_timestamp,
        owner,
        seq,
        shares_returned: returned,
    });

    // A pending request has nothing claimable: the account closes now.
    ctx.accounts
        .redeem_request
        .close(ctx.accounts.owner.to_account_info())?;
    Ok(())
}
