//! `clear_fulfil_halt` (spec §5.1, §5.8 step 3; ADR 0015, proposed).

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::constants::CONFIG_SEED;
use crate::{
    constants::{RESERVE_SEED, STATE_SEED},
    errors::MutavError,
    events::FulfilHaltCleared,
    instructions::{capital::NavBounds, operator::solvency_snapshot},
    pricing::published_nav,
    state::{VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
pub struct ClearFulfilHalt<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.reserve_mint.as_ref()],
        bump = config.bump,
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

    /// Read for its freeze state (ADR 0020): a new baseline is never set
    /// while the reserve's BRS cannot move.
    #[account(seeds = [RESERVE_SEED, config.key().as_ref()], bump)]
    pub reserve: Box<InterfaceAccount<'info, TokenAccount>>,
}

/// Clears `fulfil_halted` after the admin has reviewed the NAV move, and
/// resets the guard's baseline to the NAV of now, so the next `refresh`
/// measures from the reviewed value. Only a set halt can be cleared: the
/// baseline cannot be moved without one. The new baseline must lie within
/// `nav_bounds`, composed by `/admin` around the NAV it showed when the
/// proposal was made (`NavOutOfBounds`), so a proposal that waits on the
/// time lock never resets the guard to a NAV the admin did not review. A
/// frozen `reserve` counts as 0 BRS,
/// so the instruction refuses with `ReserveFrozen` rather than publish a
/// baseline from BRS that cannot move (ADR 0020).
pub fn handle_clear_fulfil_halt(
    ctx: Context<ClearFulfilHalt>,
    nav_bounds: NavBounds,
) -> Result<()> {
    nav_bounds.validate()?;
    require!(
        ctx.accounts.state.fulfil_halted,
        MutavError::InvalidParameter
    );
    require!(!ctx.accounts.reserve.is_frozen(), MutavError::ReserveFrozen);
    // Same price rule as `refresh`: a TESOURO position fails closed.
    let sol = solvency_snapshot(&ctx.accounts.config, &ctx.accounts.state)?;
    let state = &mut ctx.accounts.state;
    let nav = published_nav(sol.net_assets, state.shares_outstanding)?;
    nav_bounds.check(nav)?;
    state.fulfil_halted = false;
    state.nav_per_share = nav;
    // The new baseline already includes every inflow so far, so the next
    // `refresh` must not subtract them again (ADR 0017).
    state.inflow_nav = 0;

    emit_cpi!(FulfilHaltCleared {
        config: ctx.accounts.config.key(),
        ts: Clock::get()?.unix_timestamp,
        nav_per_share: nav,
    });
    Ok(())
}
