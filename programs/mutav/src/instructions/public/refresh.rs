//! `refresh()` (spec §5.8, §6, §7). Anyone. Detects frozen reserve token
//! accounts, recomputes and publishes the spec §4 quantities, runs the
//! NAV-move guard and sets `mode`. It takes no remaining accounts.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    constants::*,
    errors::MutavError,
    events::{ModeChanged, ReserveFrozenDetected, StateRefreshed},
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
    // TODO(plan: TESOURO pricing built later, Tasks 8–9) — the spec records
    // and flags a stale price instead of failing; with no price source yet,
    // a TESOURO position fails closed with `StalePrice` here too.
    let state = &ctx.accounts.state;
    require!(state.tesouro_units == 0, MutavError::StalePrice);
    let sol = Solvency::compute(&SolvencyInputs {
        brs_balance: if reserve_frozen { 0 } else { state.brs_balance },
        tesouro_units: state.tesouro_units,
        tesouro_price: state.tesouro_price,
        remaining_cover_total: state.remaining_cover_total,
        coverage_ratio_bps: config.coverage_ratio_bps,
        provisions: state.provisions,
        buffer_earmark: state.buffer_earmark,
        feature_flags: config.feature_flags,
        head_starved: false,
    })?;
    let nav = published_nav(sol.net_assets, state.shares_outstanding)?;

    let max_nav_move_bps = config.price.max_nav_move_bps;
    let state = &mut ctx.accounts.state;

    // 3. NAV-move guard (spec §7): measured against the last published NAV,
    // which is 0 only when no shares were outstanding, and net of the NAV per
    // share that verified inflows added since then (ADR 0017), so guarantee
    // fees and swept income never trip it, even when fills changed the share
    // count in between. A frozen reserve counted as 0 is a measured move, and
    // so is the thaw. Only the admin's `clear_fulfil_halt` clears the flag
    // (ADR 0015).
    let moved_nav = guard_nav(nav, state.inflow_nav);
    if nav_move_exceeds(state.nav_per_share, moved_nav, max_nav_move_bps) {
        state.fulfil_halted = true;
    }
    // The published NAV below includes the inflows: they start the next
    // window at zero.
    state.inflow_nav = 0;

    // 4. Mode (spec §6).
    let (from, to) = (state.mode, sol.mode());

    state.stable_assets = sol.stable_assets;
    state.coverage_required = sol.coverage_required;
    state.nav_per_share = nav;
    state.mode = to;
    // Ratchet (spec §4): `refresh` holds no queue head.
    state.buffer_earmark = sol.earmark_eff;
    state.last_refresh_ts = now;
    state.last_refresh_slot = clock.slot;
    let (provisions, tesouro_price) = (state.provisions, state.tesouro_price);

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
