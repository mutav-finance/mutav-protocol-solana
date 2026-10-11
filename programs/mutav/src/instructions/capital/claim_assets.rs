//! `claim_assets()` (spec §5.5). Owner only. Never pausable. Works between
//! fills (ADR 0010).

use anchor_lang::{prelude::*, AccountsClose};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    constants::*,
    errors::MutavError,
    events::AssetsClaimed,
    instructions::capital::{create_owner_ata, owner_ata},
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

    /// The owner's associated token account for the reserve mint; created
    /// idempotently in the handler, the owner paying its rent (ADR 0023).
    /// CHECK: address-bound to the owner's associated token account.
    #[account(
        mut,
        address = owner_ata(&owner.key(), &config.reserve_mint, &config.reserve_token_program)
            @ MutavError::Unauthorized,
    )]
    pub destination: UncheckedAccount<'info>,

    #[account(mut, seeds = [CLAIMS_SEED, config.key().as_ref()], bump)]
    pub claims: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: data-less PDA that owns `claims`; signs the transfer.
    #[account(seeds = [AUTHORITY_SEED, config.key().as_ref()], bump = config.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(address = config.reserve_mint @ MutavError::InvalidMint)]
    pub reserve_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(address = config.reserve_token_program @ MutavError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_claim_assets(ctx: Context<ClaimAssets>) -> Result<()> {
    // Never paused. A frozen
    // destination fails the transfer, so nothing changes and the amount stays
    // claimable.
    let r = &ctx.accounts.redeem_request;
    require!(r.status == REDEEM_FILLED, MutavError::InvalidRequestStatus);
    let (seq, assets, owner) = (r.seq, r.assets_out, r.owner);
    let a = &ctx.accounts;
    create_owner_ata(
        a.owner.to_account_info(),
        a.destination.to_account_info(),
        a.owner.to_account_info(),
        a.reserve_mint.to_account_info(),
        a.system_program.to_account_info(),
        a.token_program.to_account_info(),
        a.associated_token_program.key(),
    )?;

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

    emit_cpi!(AssetsClaimed {
        config: config_key,
        ts: Clock::get()?.unix_timestamp,
        owner,
        seq,
        assets,
    });

    // A filled request closes once its assets are claimed (spec §3.8).
    ctx.accounts
        .redeem_request
        .close(ctx.accounts.owner.to_account_info())?;
    Ok(())
}
