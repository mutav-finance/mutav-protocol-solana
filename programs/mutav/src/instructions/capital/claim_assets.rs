//! `claim_assets()` (spec §5.5). Owner only. Never pausable. Works between
//! fills (ADR 0010).

use anchor_lang::{prelude::*, AccountsClose};
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    constants::*,
    errors::MutavError,
    events::AssetsClaimed,
    state::{RedeemRequest, VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
pub struct ClaimAssets<'info> {
    /// The request's owner; receives the BRS (and the rent, on close).
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

    /// The owner's BRS account (owner and mint checked).
    #[account(
        mut,
        constraint = destination.owner == owner.key() @ MutavError::Unauthorized,
        constraint = destination.mint == config.reserve_mint @ MutavError::InvalidMint,
    )]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, seeds = [CLAIMS_SEED, config.key().as_ref()], bump)]
    pub claims: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: data-less PDA that owns `claims`; signs the transfer.
    #[account(seeds = [AUTHORITY_SEED, config.key().as_ref()], bump = config.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(address = config.reserve_mint @ MutavError::InvalidMint)]
    pub reserve_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(address = config.reserve_token_program @ MutavError::InvalidMint)]
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_claim_assets(ctx: Context<ClaimAssets>) -> Result<()> {
    // Never paused. Neither reads nor writes `buffer_earmark`. A frozen
    // destination fails the transfer, so nothing changes and the amount stays
    // claimable.
    let r = &ctx.accounts.redeem_request;
    require!(r.assets_claimable > 0, MutavError::InvalidRequestStatus);
    let (seq, assets, owner) = (r.seq, r.assets_claimable, r.owner);

    let config_key = ctx.accounts.config.key();
    let authority_seeds: &[&[u8]] = &[
        AUTHORITY_SEED,
        config_key.as_ref(),
        &[ctx.accounts.config.authority_bump],
    ];
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.claims.to_account_info(),
                mint: ctx.accounts.reserve_mint.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[authority_seeds],
        ),
        assets,
        ctx.accounts.reserve_mint.decimals,
    )?;

    let state = &mut ctx.accounts.state;
    state.claimable_assets_total = state
        .claimable_assets_total
        .checked_sub(assets)
        .ok_or(MutavError::MathOverflow)?;

    let r = &mut ctx.accounts.redeem_request;
    r.assets_claimable = 0;
    let closed = r.shares_remaining == 0;

    emit_cpi!(AssetsClaimed {
        config: config_key,
        ts: Clock::get()?.unix_timestamp,
        owner,
        seq,
        assets,
        closed,
    });

    // Close rule (spec §3.8): `shares_remaining == 0 && assets_claimable == 0`.
    if closed {
        ctx.accounts
            .redeem_request
            .close(ctx.accounts.owner.to_account_info())?;
    }
    Ok(())
}
