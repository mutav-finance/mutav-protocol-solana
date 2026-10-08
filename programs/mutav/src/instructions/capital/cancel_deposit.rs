//! `cancel_deposit()` (spec §5.5). Owner only. Never pausable.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    constants::*,
    errors::MutavError,
    events::DepositCancelled,
    state::{DepositRequest, VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
pub struct CancelDeposit<'info> {
    /// The request's owner; receives the refund and the rent.
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
        close = owner,
        seeds = [DEPOSIT_SEED, config.key().as_ref(), deposit_request.seq.to_le_bytes().as_ref()],
        bump = deposit_request.bump,
        has_one = owner @ MutavError::Unauthorized,
        constraint = deposit_request.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub deposit_request: Box<Account<'info, DepositRequest>>,

    /// The owner's BRS account for the refund.
    #[account(
        mut,
        constraint = destination.owner == owner.key() @ MutavError::Unauthorized,
        constraint = destination.mint == config.reserve_mint @ MutavError::InvalidMint,
    )]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, seeds = [PENDING_DEPOSITS_SEED, config.key().as_ref()], bump)]
    pub pending_deposits: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: data-less PDA that owns `pending_deposits`; signs the refund.
    #[account(seeds = [AUTHORITY_SEED, config.key().as_ref()], bump = config.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(address = config.reserve_mint @ MutavError::InvalidMint)]
    pub reserve_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(address = config.reserve_token_program @ MutavError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_cancel_deposit(ctx: Context<CancelDeposit>) -> Result<()> {
    // Never paused. Only this request changes; `deposit_head` moves later
    // (`fulfil_deposits` or `advance_queue_heads`).
    let r = &ctx.accounts.deposit_request;
    require!(
        r.status == DEPOSIT_PENDING,
        MutavError::InvalidRequestStatus
    );
    let (seq, assets, owner) = (r.seq, r.assets, r.owner);

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
                from: ctx.accounts.pending_deposits.to_account_info(),
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
    state.pending_deposits_total = state
        .pending_deposits_total
        .checked_sub(assets)
        .ok_or(MutavError::MathOverflow)?;

    // The request closes on exit (`close = owner`), rent to the owner.
    emit_cpi!(DepositCancelled {
        config: config_key,
        ts: Clock::get()?.unix_timestamp,
        owner,
        seq,
        assets,
    });
    Ok(())
}
