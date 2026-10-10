//! `close_guarantee` (spec §5.2). Not solvency-gated and not paused: it only
//! releases liability.

use anchor_lang::prelude::*;

use crate::{
    constants::*,
    errors::MutavError,
    events::GuaranteeClosed,
    solvency::coverage_required,
    state::{Guarantee, VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
#[instruction(id: [u8; 32])]
pub struct CloseGuarantee<'info> {
    pub operator: Signer<'info>,

    #[account(
        constraint = config.is_supported() @ MutavError::UnsupportedVersion,
        constraint = config.is_operator(&operator.key()) @ MutavError::Unauthorized,
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
        seeds = [GUARANTEE_SEED, config.key().as_ref(), id.as_ref()],
        bump = guarantee.bump,
        constraint = guarantee.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub guarantee: Box<Account<'info, Guarantee>>,
}

pub fn handle_close_guarantee(ctx: Context<CloseGuarantee>, id: [u8; 32]) -> Result<()> {
    let g = &mut ctx.accounts.guarantee;
    require!(g.status == GUARANTEE_ACTIVE, MutavError::GuaranteeNotActive);
    require!(g.open_claims == 0, MutavError::OpenClaims);

    let released = g.remaining_cover()?;
    let state = &mut ctx.accounts.state;
    state.remaining_cover_total = state
        .remaining_cover_total
        .checked_sub(released)
        .ok_or(MutavError::MathOverflow)?;
    state.coverage_required = coverage_required(
        state.remaining_cover_total,
        ctx.accounts.config.coverage_ratio_bps,
        state.provisions,
    )?;
    state.active_guarantees = state
        .active_guarantees
        .checked_sub(1)
        .ok_or(MutavError::MathOverflow)?;

    let now = Clock::get()?.unix_timestamp;
    g.status = GUARANTEE_CLOSED;
    g.closed_at = now;

    emit_cpi!(GuaranteeClosed {
        config: ctx.accounts.config.key(),
        ts: now,
        id,
        released_cover: released,
    });
    Ok(())
}
