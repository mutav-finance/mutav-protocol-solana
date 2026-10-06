//! `clear_fulfil_halt` (spec §5.1, §5.8 step 3; ADR 0015, proposed).

use anchor_lang::prelude::*;

use crate::{
    constants::STATE_SEED,
    errors::MutavError,
    events::FulfilHaltCleared,
    instructions::operator::solvency_snapshot,
    pricing::published_nav,
    state::{VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
pub struct ClearFulfilHalt<'info> {
    pub admin: Signer<'info>,

    #[account(
        constraint = config.is_supported() @ MutavError::UnsupportedVersion,
        constraint = config.admin == admin.key() @ MutavError::Unauthorized,
    )]
    pub config: Box<Account<'info, VaultConfig>>,

    #[account(
        mut,
        seeds = [STATE_SEED, config.key().as_ref()],
        bump = state.bump,
        constraint = state.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub state: Box<Account<'info, VaultState>>,
}

/// Clears `fulfil_halted` after the admin has reviewed the NAV move, and
/// resets the guard's baseline to the NAV of now, so the next `refresh`
/// measures from the reviewed value. Only a set halt can be cleared: the
/// baseline cannot be moved without one.
pub fn handle_clear_fulfil_halt(ctx: Context<ClearFulfilHalt>) -> Result<()> {
    require!(
        ctx.accounts.state.fulfil_halted,
        MutavError::InvalidParameter
    );
    // Same price rule as `refresh`: a TESOURO position fails closed.
    let sol = solvency_snapshot(&ctx.accounts.config, &ctx.accounts.state)?;
    let state = &mut ctx.accounts.state;
    let nav = published_nav(sol.net_assets, state.shares_outstanding)?;
    state.fulfil_halted = false;
    state.nav_per_share = nav;

    emit_cpi!(FulfilHaltCleared {
        config: ctx.accounts.config.key(),
        ts: Clock::get()?.unix_timestamp,
        nav_per_share: nav,
    });
    Ok(())
}
