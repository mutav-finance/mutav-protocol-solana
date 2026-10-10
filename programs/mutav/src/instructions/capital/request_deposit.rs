//! `request_deposit(assets, proof)` (spec §5.5).

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    constants::*,
    errors::MutavError,
    events::DepositRequested,
    instructions::capital::{require_allowlisted, require_request_size},
    state::{DepositRequest, VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
pub struct RequestDeposit<'info> {
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
        space = DEPOSIT_REQUEST_SIZE,
        seeds = [DEPOSIT_SEED, config.key().as_ref(), state.next_deposit_seq.to_le_bytes().as_ref()],
        bump,
    )]
    pub deposit_request: Box<Account<'info, DepositRequest>>,

    /// The owner's BRS account. Owner, never delegate (spec §5).
    #[account(
        mut,
        constraint = source.owner == owner.key() @ MutavError::Unauthorized,
        constraint = source.mint == config.reserve_mint @ MutavError::InvalidMint,
    )]
    pub source: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, seeds = [PENDING_DEPOSITS_SEED, config.key().as_ref()], bump)]
    pub pending_deposits: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(address = config.reserve_mint @ MutavError::InvalidMint)]
    pub reserve_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(address = config.reserve_token_program @ MutavError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

pub fn handle_request_deposit(
    ctx: Context<RequestDeposit>,
    assets: u64,
    proof: Vec<[u8; 32]>,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let owner = ctx.accounts.owner.key();
    require!(!config.paused, MutavError::Paused);
    require_allowlisted(config, &owner, &proof)?;
    require_request_size(config, assets)?;
    // The source's owner is the signer (account constraint).

    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.source.to_account_info(),
                mint: ctx.accounts.reserve_mint.to_account_info(),
                to: ctx.accounts.pending_deposits.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        assets,
        ctx.accounts.reserve_mint.decimals,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let state = &mut ctx.accounts.state;
    let seq = state.next_deposit_seq;
    state.next_deposit_seq = seq.checked_add(1).ok_or(MutavError::MathOverflow)?;
    state.pending_deposits_total = state
        .pending_deposits_total
        .checked_add(assets)
        .ok_or(MutavError::MathOverflow)?;

    let r = &mut ctx.accounts.deposit_request;
    r.version = PROGRAM_LAYOUT_VERSION;
    r.bump = ctx.bumps.deposit_request;
    r.owner = owner;
    r.seq = seq;
    r.assets = assets;
    r.requested_at = now;
    r.status = DEPOSIT_PENDING;

    emit_cpi!(DepositRequested {
        config: ctx.accounts.config.key(),
        ts: now,
        owner,
        seq,
        assets,
    });
    Ok(())
}
