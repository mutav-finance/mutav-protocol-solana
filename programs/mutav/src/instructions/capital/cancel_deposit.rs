//! `cancel_deposit()` (spec §5.5; ADR 0023, ADR 0030). The request's owner
//! or the admin. Never pausable.
//!
//! - **The owner** cancels a pending request, or collects a parked one: the
//!   BRS goes back into the owner's associated token account for the reserve
//!   mint, created here if needed with the owner paying its rent, and the
//!   request closes (rent to the owner).
//! - **The admin** removes a pending request from the queue (a de-listed
//!   investor, or a `min_shares_out` no fill can meet) by **parking** it
//!   (ADR 0030): `status = DEPOSIT_CANCELLED`, nothing moves. The BRS stays
//!   in `pending_deposits`, still counted in `pending_deposits_total`, owed
//!   to the owner, who alone collects it later. The admin path touches no
//!   account the owner controls, so the owner cannot make it fail (an
//!   associated token account reassigned with `SetAuthority`, frozen, or
//!   requiring transfer memos), and the queue always moves.

use anchor_lang::{prelude::*, AccountsClose};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::instructions::vault_transfer;
use crate::{
    constants::*,
    errors::MutavError,
    events::{DepositCancelled, DepositParked},
    instructions::capital::{create_owner_ata, owner_ata},
    state::{DepositRequest, VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
pub struct CancelDeposit<'info> {
    /// The request's owner or the admin. The owner pays the rent of its token
    /// account if it has to be created; the admin only parks (ADR 0030).
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

    /// Closed by the owner's cancel (rent to the owner); parked, not closed,
    /// by the admin's (ADR 0030).
    #[account(
        mut,
        seeds = [DEPOSIT_SEED, config.key().as_ref(), deposit_request.seq.to_le_bytes().as_ref()],
        bump = deposit_request.bump,
        constraint = deposit_request.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub deposit_request: Box<Account<'info, DepositRequest>>,

    /// The owner's associated token account for the reserve mint; created
    /// idempotently in the handler on the owner's path. Not touched by the
    /// admin's.
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
    let (seq, assets, owner, status) = (r.seq, r.assets, r.owner, r.status);
    let by = ctx.accounts.signer.key();
    let config_key = ctx.accounts.config.key();
    let ts = Clock::get()?.unix_timestamp;

    // The signer is the owner or the admin (account constraint).
    if by != owner {
        // The admin parks a pending request (ADR 0030): no transfer, no
        // account creation, no close. The BRS stays owed to the owner.
        require!(status == DEPOSIT_PENDING, MutavError::InvalidRequestStatus);
        ctx.accounts.deposit_request.status = DEPOSIT_CANCELLED;
        emit_event!(
            ctx,
            DepositParked {
                config: config_key,
                ts,
                owner,
                seq,
                assets,
                by,
            }
        );
        return Ok(());
    }

    // The owner: a pending or a parked request is refunded and closed.
    require!(
        status == DEPOSIT_PENDING || status == DEPOSIT_CANCELLED,
        MutavError::InvalidRequestStatus
    );
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

    vault_transfer(
        a.token_program.key(),
        a.pending_deposits.to_account_info(),
        a.reserve_mint.to_account_info(),
        a.destination.to_account_info(),
        a.vault_authority.to_account_info(),
        &config_key,
        a.config.authority_bump,
        assets,
        a.reserve_mint.decimals,
    )?;

    let state = &mut ctx.accounts.state;
    state.pending_deposits_total = state
        .pending_deposits_total
        .checked_sub(assets)
        .ok_or(MutavError::MathOverflow)?;

    emit_event!(
        ctx,
        DepositCancelled {
            config: config_key,
            ts,
            owner,
            seq,
            assets,
            by,
        }
    );
    // Nothing is left on the request: it closes, rent to the owner.
    ctx.accounts
        .deposit_request
        .close(ctx.accounts.owner.to_account_info())?;
    Ok(())
}
