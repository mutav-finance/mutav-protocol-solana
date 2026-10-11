//! `refresh()` (spec §5.8, §6, §7). Anyone. Detects frozen reserve token
//! accounts, recomputes and publishes the spec §4 quantities, runs the
//! NAV-move guard and sets `mode`. It takes no remaining accounts.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    constants::*,
    errors::MutavError,
    events::{FulfilHaltRaised, ModeChanged, ReserveFrozenDetected, StateRefreshed},
    pricing::{guard_nav, nav_move_exceeds, published_nav},
    solvency::{Solvency, SolvencyInputs},
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

    /// The four reserve token accounts (spec §3.3), for freeze detection.
    #[account(seeds = [RESERVE_SEED, config.key().as_ref()], bump)]
    pub reserve: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(seeds = [PENDING_DEPOSITS_SEED, config.key().as_ref()], bump)]
    pub pending_deposits: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(seeds = [PENDING_REDEMPTIONS_SEED, config.key().as_ref()], bump)]
    pub pending_redemptions: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(seeds = [CLAIMS_SEED, config.key().as_ref()], bump)]
    pub claims: Box<InterfaceAccount<'info, TokenAccount>>,
}

pub fn handle_refresh(ctx: Context<Refresh>) -> Result<()> {
    let config = &ctx.accounts.config;
    let config_key = config.key();
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // 1. Frozen reserve token accounts: reported, and a frozen `reserve`
    // does not count in `stable_assets` (fail closed). The tracked
    // `brs_balance` is unchanged.
    // No adapter in this binary: a reserve with adapters fails closed.
    crate::instructions::capital::split_adapter_accounts(config, ctx.remaining_accounts)?;
    let a = &ctx.accounts;
    let mut reserve_frozen = false;
    for (account, counts) in [
        (&a.reserve, true),
        (&a.pending_deposits, false),
        (&a.pending_redemptions, false),
        (&a.claims, false),
    ] {
        if account.is_frozen() {
            reserve_frozen |= counts;
            emit_cpi!(ReserveFrozenDetected {
                config: config_key,
                ts: now,
                token_account: account.key(),
            });
        }
    }

    // 2. The spec §4 quantities.
    let state = &ctx.accounts.state;
    let sol = Solvency::compute(&SolvencyInputs {
        brs_balance: if reserve_frozen { 0 } else { state.brs_balance },
        remaining_cover_total: state.remaining_cover_total,
        coverage_ratio_bps: config.coverage_ratio_bps,
        provisions: state.provisions,
    })?;
    let nav = published_nav(sol.net_assets, state.shares_outstanding)?;

    let max_nav_move_bps = config.caps.max_nav_move_bps;
    let state = &mut ctx.accounts.state;

    // 3. NAV-move guard (spec §7): measured against the last published NAV,
    // which is 0 only when no shares were outstanding, and net of the NAV per
    // share that verified inflows added since then (ADR 0017), so guarantee
    // fees and swept income never trip it, even when fills changed the share
    // count in between. A frozen reserve counted as 0 is a measured move, and
    // so is the thaw. Only the admin's `clear_fulfil_halt` clears the flag
    // (ADR 0015).
    let (prev_nav, inflow) = (state.nav_per_share, state.inflow_nav);
    let moved_nav = guard_nav(nav, inflow);
    let exceeded = nav_move_exceeds(prev_nav, moved_nav, max_nav_move_bps);
    let raised = exceeded && !state.fulfil_halted;
    if exceeded {
        state.fulfil_halted = true;
    }
    // The published NAV below includes the inflows: they start the next
    // window at zero.
    state.inflow_nav = 0;

    // 4. Mode (spec §6).
    let (from, to) = (state.mode, sol.mode());

    state.coverage_required = sol.coverage_required;
    state.nav_per_share = nav;
    state.mode = to;
    state.last_refresh_ts = now;
    state.last_refresh_slot = clock.slot;
    let (provisions, shares_outstanding, fulfil_halted) = (
        state.provisions,
        state.shares_outstanding,
        state.fulfil_halted,
    );
    if raised {
        emit_cpi!(FulfilHaltRaised {
            config: config_key,
            ts: now,
            prev_nav_per_share: prev_nav,
            guard_nav: moved_nav,
            inflow_nav: inflow,
            max_nav_move_bps,
            source: HALT_SOURCE_REFRESH,
        });
    }

    if from != to {
        emit_cpi!(ModeChanged {
            config: config_key,
            ts: now,
            from,
            to,
            deficit: sol.deficit(),
        });
    }
    emit_cpi!(StateRefreshed {
        config: config_key,
        ts: now,
        stable_assets: sol.stable_assets,
        coverage_required: sol.coverage_required,
        surplus: sol.surplus,
        provisions,
        nav_per_share: nav,
        mode: to,
        prev_nav_per_share: prev_nav,
        inflow_nav: inflow,
        guard_nav: moved_nav,
        shares_outstanding,
        net_assets: sol.net_assets,
        fulfil_halted,
    });
    Ok(())
}
