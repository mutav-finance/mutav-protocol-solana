//! `cancel_deposit()` (spec §5.5; ADR 0023). The request's owner or the
//! admin. Never pausable.
//!
//! The admin path removes a de-listed or unreachable investor's deposit from
//! the queue: the BRS and the request's rent go back to the owner, never to
//! the signer. The BRS lands in the owner's associated token account for the
//! reserve mint, created here if needed with the signer paying its rent. If
//! the issuer froze that account, the refund cannot complete and the request
//! stays pending (a runbook case).

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    constants::*,
    errors::MutavError,
    events::DepositCancelled,
    instructions::capital::{create_owner_ata, owner_ata},
    state::{DepositRequest, VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
pub struct CancelDeposit<'info> {
    /// The request's owner or the admin. Pays the rent of the owner's token
    /// account if it has to be created.
    #[account(
        mut,
        constraint = signer.key() == deposit_request.owner || signer.key() == config.admin
            @ MutavError::Unauthorized,
    )]
    pub signer: Signer<'info>,

    /// The request's owner; receives the request's rent.
    /// CHECK: bound by address to `deposit_request.owner`; receives lamports
    /// only.
    #[account(mut, address = deposit_request.owner @ MutavError::Unauthorized)]
    pub owner: UncheckedAccount<'info>,

    #[account(
        seeds = [CONFIG_SEED, reserve_mint.key().as_ref()],
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
        mut,
        close = owner,
        seeds = [DEPOSIT_SEED, config.key().as_ref(), deposit_request.seq.to_le_bytes().as_ref()],
        bump = deposit_request.bump,
        constraint = deposit_request.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub deposit_request: Box<Account<'info, DepositRequest>>,

    /// The owner's associated token account for the reserve mint; created
    /// idempotently in the handler.
    /// CHECK: address-bound to the owner's associated token account.
    #[account(
        mut,
        address = owner_ata(&deposit_request.owner, &config.reserve_mint, &config.reserve_token_program)
            @ MutavError::Unauthorized,
    )]
    pub destination: UncheckedAccount<'info>,

    #[account(mut, seeds = [PENDING_DEPOSITS_SEED, config.key().as_ref()], bump)]
    pub pending_deposits: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: data-less PDA that owns `pending_deposits`; signs the refund.
    #[account(seeds = [AUTHORITY_SEED, config.key().as_ref()], bump = config.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(address = config.reserve_mint @ MutavError::InvalidMint)]
    pub reserve_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(address = config.reserve_token_program @ MutavError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_cancel_deposit(ctx: Context<CancelDeposit>) -> Result<()> {
    // Never paused. Only this request changes; `deposit_head` moves later
    // (`fulfil_deposits` or `advance_queue_head`).
    let r = &ctx.accounts.deposit_request;
    require!(
        r.status == DEPOSIT_PENDING,
        MutavError::InvalidRequestStatus
    );
    let (seq, assets, owner) = (r.seq, r.assets, r.owner);
    let a = &ctx.accounts;

    create_owner_ata(
        a.signer.to_account_info(),
        a.destination.to_account_info(),
        a.owner.to_account_info(),
        a.reserve_mint.to_account_info(),
        a.system_program.to_account_info(),
        a.token_program.to_account_info(),
        a.associated_token_program.key(),
    )?;

    let config_key = a.config.key();
    let authority_seeds: &[&[u8]] = &[
        AUTHORITY_SEED,
        config_key.as_ref(),
        &[a.config.authority_bump],
    ];
    transfer_checked(
        CpiContext::new_with_signer(
            a.token_program.key(),
            TransferChecked {
                from: a.pending_deposits.to_account_info(),
                mint: a.reserve_mint.to_account_info(),
                to: a.destination.to_account_info(),
                authority: a.vault_authority.to_account_info(),
            },
            &[authority_seeds],
        ),
        assets,
        a.reserve_mint.decimals,
    )?;

    let by = a.signer.key();
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
        by,
    });
    Ok(())
}
