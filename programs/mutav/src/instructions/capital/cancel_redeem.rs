//! `cancel_redeem()` (spec §5.5; ADR 0010, ADR 0023, ADR 0030). The
//! request's owner or the admin. Never pausable.
//!
//! - **The owner** cancels a pending request, or collects a parked one: the
//!   shares go back into the owner's associated token account for the share
//!   mint, created here if needed with the owner paying its rent, and the
//!   request closes (rent to the owner).
//! - **The admin** removes a head that cannot fill (for example a
//!   `min_assets_out` no fill can meet) by **parking** it (ADR 0030):
//!   `status = REDEEM_CANCELLED`, nothing moves. The shares stay in
//!   `pending_redemptions`, still counted in `pending_redeem_shares` and
//!   `shares_outstanding`, owed to the owner, who alone collects them later.
//!   The admin path touches no account the owner controls, so the owner
//!   cannot make it fail (a share account reassigned with `SetAuthority`),
//!   and the queue behind it moves.

use anchor_lang::{prelude::*, AccountsClose};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::Token,
    token_interface::{transfer_checked, Mint, TokenAccount, TransferChecked},
};

use crate::{
    constants::*,
    errors::MutavError,
    events::{RedeemCancelled, RedeemParked},
    instructions::capital::{create_owner_ata, owner_ata},
    state::{RedeemRequest, VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
pub struct CancelRedeem<'info> {
    /// The request's owner or the admin. The owner pays the rent of its
    /// share token account if it has to be created; the admin only parks
    /// (ADR 0030).
    #[account(
        mut,
        constraint = signer.key() == redeem_request.owner || signer.key() == config.admin
            @ MutavError::Unauthorized,
    )]
    pub signer: Signer<'info>,

    /// The request's owner; receives the shares back and the request's rent.
    /// CHECK: bound by address to `redeem_request.owner`; receives lamports
    /// only.
    #[account(mut, address = redeem_request.owner @ MutavError::Unauthorized)]
    pub owner: UncheckedAccount<'info>,

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
        mut,
        seeds = [REDEEM_SEED, config.key().as_ref(), redeem_request.seq.to_le_bytes().as_ref()],
        bump = redeem_request.bump,
        constraint = redeem_request.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub redeem_request: Box<Account<'info, RedeemRequest>>,

    /// The owner's associated token account for the share mint; created
    /// idempotently in the handler on the owner's path (ADR 0023). Not
    /// touched by the admin's.
    /// CHECK: address-bound to the owner's associated token account.
    #[account(
        mut,
        address = owner_ata(&redeem_request.owner, &config.share_mint, &anchor_spl::token::ID)
            @ MutavError::Unauthorized,
    )]
    pub owner_shares: UncheckedAccount<'info>,

    #[account(mut, seeds = [PENDING_REDEMPTIONS_SEED, config.key().as_ref()], bump)]
    pub pending_redemptions: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: data-less PDA that owns `pending_redemptions`.
    #[account(seeds = [AUTHORITY_SEED, config.key().as_ref()], bump = config.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(address = config.share_mint @ MutavError::InvalidMint)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,

    pub share_token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_cancel_redeem(ctx: Context<CancelRedeem>) -> Result<()> {
    // Never paused. Only this request changes; `redeem_head` is not moved
    // here.
    let r = &ctx.accounts.redeem_request;
    let (seq, shares, owner, status) = (r.seq, r.shares, r.owner, r.status);
    let by = ctx.accounts.signer.key();
    let config_key = ctx.accounts.config.key();
    let ts = Clock::get()?.unix_timestamp;

    // The signer is the owner or the admin (account constraint).
    if by != owner {
        // The admin parks a pending request (ADR 0030): no transfer, no
        // account creation, no close. The shares stay owed to the owner.
        require!(status == REDEEM_PENDING, MutavError::InvalidRequestStatus);
        ctx.accounts.redeem_request.status = REDEEM_CANCELLED;
        emit_event!(
            ctx,
            RedeemParked {
                config: config_key,
                ts,
                owner,
                seq,
                shares,
                by,
            }
        );
        return Ok(());
    }

    // The owner: a pending or a parked request is returned and closed.
    require!(
        status == REDEEM_PENDING || status == REDEEM_CANCELLED,
        MutavError::InvalidRequestStatus
    );
    let a = &ctx.accounts;
    create_owner_ata(
        a.signer.to_account_info(),
        a.owner_shares.to_account_info(),
        a.owner.to_account_info(),
        a.share_mint.to_account_info(),
        a.system_program.to_account_info(),
        a.share_token_program.to_account_info(),
        a.associated_token_program.key(),
    )?;

    let authority_seeds: &[&[u8]] = &[
        AUTHORITY_SEED,
        config_key.as_ref(),
        &[a.config.authority_bump],
    ];
    transfer_checked(
        CpiContext::new_with_signer(
            a.share_token_program.key(),
            TransferChecked {
                from: a.pending_redemptions.to_account_info(),
                mint: a.share_mint.to_account_info(),
                to: a.owner_shares.to_account_info(),
                authority: a.vault_authority.to_account_info(),
            },
            &[authority_seeds],
        ),
        shares,
        a.share_mint.decimals,
    )?;

    let state = &mut ctx.accounts.state;
    state.pending_redeem_shares = state
        .pending_redeem_shares
        .checked_sub(shares)
        .ok_or(MutavError::MathOverflow)?;

    emit_event!(
        ctx,
        RedeemCancelled {
            config: config_key,
            ts,
            owner,
            seq,
            shares_returned: shares,
            by,
        }
    );

    // Nothing is left on the request: it closes, rent to the owner.
    ctx.accounts
        .redeem_request
        .close(ctx.accounts.owner.to_account_info())?;
    Ok(())
}
