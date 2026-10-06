//! `refresh()` (spec §5.8, §6, §7). Anyone. Recomputes and publishes the
//! spec §4 quantities, sets `mode` and runs the NAV-move guard.

use anchor_lang::prelude::*;

use crate::{
    constants::*,
    errors::MutavError,
    events::{ModeChanged, StateRefreshed},
    instructions::operator::solvency_snapshot,
    pricing::{nav_move_exceeds, published_nav},
    state::{VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
pub struct Refresh<'info> {
    #[account(constraint = config.is_supported() @ MutavError::UnsupportedVersion)]
    pub config: Box<Account<'info, VaultConfig>>,

    #[account(
        mut,
        seeds = [STATE_SEED, config.key().as_ref()],
        bump = state.bump,
        constraint = state.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub state: Box<Account<'info, VaultState>>,
}

pub fn handle_refresh(ctx: Context<Refresh>) -> Result<()> {
    let config = &ctx.accounts.config;
    // TODO(plan: TESOURO pricing built later, Tasks 8–9) — the spec records
    // and flags a stale price instead of failing; with no price source yet,
    // a TESOURO position fails closed with `StalePrice` here too.
    let sol = solvency_snapshot(config, &ctx.accounts.state)?;
    let max_nav_move_bps = config.price.max_nav_move_bps;
    let config_key = config.key();
    let clock = Clock::get()?;

    let state = &mut ctx.accounts.state;
    let nav = published_nav(sol.net_assets, state.shares_outstanding)?;

    // NAV-move guard (spec §7): measured against the last published NAV,
    // which is 0 only when no shares were outstanding.
    // Only the admin's `clear_fulfil_halt` clears the flag (ADR 0015).
    if nav_move_exceeds(state.nav_per_share, nav, max_nav_move_bps) {
        state.fulfil_halted = true;
    }

    // Mode (spec §6).
    let (from, to) = (state.mode, sol.mode());

    state.stable_assets = sol.stable_assets;
    state.coverage_required = sol.coverage_required;
    state.nav_per_share = nav;
    state.mode = to;
    // Ratchet (spec §4): `refresh` holds no queue head.
    state.buffer_earmark = sol.earmark_eff;
    state.last_refresh_ts = clock.unix_timestamp;
    state.last_refresh_slot = clock.slot;
    let (provisions, tesouro_price) = (state.provisions, state.tesouro_price);

    if from != to {
        emit_cpi!(ModeChanged {
            config: config_key,
            ts: clock.unix_timestamp,
            from,
            to,
            deficit: sol.deficit(),
        });
    }
    emit_cpi!(StateRefreshed {
        config: config_key,
        ts: clock.unix_timestamp,
        stable_assets: sol.stable_assets,
        coverage_required: sol.coverage_required,
        surplus: sol.surplus,
        buffer_earmark: sol.earmark_eff,
        free_capital: sol.free_capital,
        provisions,
        nav_per_share: nav,
        mode: to,
        tesouro_price,
        price_stale: false,
    });
    Ok(())
}
