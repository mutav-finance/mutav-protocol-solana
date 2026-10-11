//! `claim_shares()` (spec §5.5). Owner only. Never pausable.

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::Token,
    token_interface::{mint_to, Mint, MintTo},
};

use crate::{
    constants::*,
    errors::MutavError,
    events::SharesClaimed,
    instructions::capital::{create_owner_ata, owner_ata},
    state::{DepositRequest, VaultConfig},
};

#[event_cpi]
#[derive(Accounts)]
pub struct ClaimShares<'info> {
    /// The request's owner; receives the shares and the rent.
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(constraint = config.is_supported() @ MutavError::UnsupportedVersion)]
    pub config: Box<Account<'info, VaultConfig>>,

    #[account(
        mut,
        close = owner,
        seeds = [DEPOSIT_SEED, config.key().as_ref(), deposit_request.seq.to_le_bytes().as_ref()],
        bump = deposit_request.bump,
        has_one = owner @ MutavError::Unauthorized,
        constraint = deposit_request.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub deposit_request: Box<Account<'info, DepositRequest>>,

    #[account(mut, address = config.share_mint @ MutavError::InvalidMint)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The owner's associated token account for the share mint; created
    /// idempotently in the handler, the owner paying its rent (ADR 0023).
    /// CHECK: address-bound to the owner's associated token account.
    #[account(
        mut,
        address = owner_ata(&owner.key(), &config.share_mint, &anchor_spl::token::ID)
            @ MutavError::Unauthorized,
    )]
    pub owner_shares: UncheckedAccount<'info>,

    /// CHECK: data-less PDA; the share mint's mint authority.
    #[account(seeds = [AUTHORITY_SEED, config.key().as_ref()], bump = config.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    pub share_token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_claim_shares(ctx: Context<ClaimShares>) -> Result<()> {
    // Never paused. The shares already count in `shares_outstanding` since
    // fulfil (invariant 5); minting them changes no accounting.
    let r = &ctx.accounts.deposit_request;
    require!(
        r.status == DEPOSIT_FULFILLED,
        MutavError::InvalidRequestStatus
    );
    let (seq, shares, owner) = (r.seq, r.shares_out, r.owner);
    let a = &ctx.accounts;
    create_owner_ata(
        a.owner.to_account_info(),
        a.owner_shares.to_account_info(),
        a.owner.to_account_info(),
        a.share_mint.to_account_info(),
        a.system_program.to_account_info(),
        a.share_token_program.to_account_info(),
        a.associated_token_program.key(),
    )?;

    let config_key = ctx.accounts.config.key();
    let authority_seeds: &[&[u8]] = &[
        AUTHORITY_SEED,
        config_key.as_ref(),
        &[ctx.accounts.config.authority_bump],
    ];
    if shares > 0 {
        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.share_token_program.key(),
                MintTo {
                    mint: ctx.accounts.share_mint.to_account_info(),
                    to: ctx.accounts.owner_shares.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                &[authority_seeds],
            ),
            shares,
        )?;
    }

    let now = Clock::get()?.unix_timestamp;

    // The request closes on exit (`close = owner`), rent to the owner.
    emit_cpi!(SharesClaimed {
        config: config_key,
        ts: now,
        owner,
        seq,
        shares,
    });
    Ok(())
}
