//! `fulfil_redeems(count, max_assets)` (spec §5.5; ADR 0010). Admin. Strict
//! FIFO from `redeem_head`, out of `free_capital` and `liquid_budget` only,
//! each fill at its own NAV.

use anchor_lang::prelude::*;
use anchor_spl::{
    token::Token,
    token_interface::{
        burn, transfer_checked, Burn, Mint, TokenAccount, TokenInterface, TransferChecked,
    },
};

use crate::{
    constants::*,
    errors::MutavError,
    events::{RedeemFilled, RedeemsFulfilled},
    instructions::capital::{load_slot, redeem_request_address, store, Slot},
    math::{assets_for, conversion_nav},
    solvency::{head_starved, Solvency, SolvencyInputs},
    state::{RedeemRequest, VaultConfig, VaultState},
};

/// Remaining accounts: the `RedeemRequest` PDAs from `redeem_head`, in `seq`
/// order, writable.
#[event_cpi]
#[derive(Accounts)]
pub struct FulfilRedeems<'info> {
    pub admin: Signer<'info>,

    #[account(
        constraint = config.is_supported() @ MutavError::UnsupportedVersion,
        constraint = admin.key() == config.admin @ MutavError::Unauthorized,
    )]
    pub config: Box<Account<'info, VaultConfig>>,

    #[account(
        mut,
        seeds = [STATE_SEED, config.key().as_ref()],
        bump = state.bump,
        constraint = state.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub state: Box<Account<'info, VaultState>>,

    #[account(mut, seeds = [RESERVE_SEED, config.key().as_ref()], bump)]
    pub reserve: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, seeds = [CLAIMS_SEED, config.key().as_ref()], bump)]
    pub claims: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, seeds = [PENDING_REDEMPTIONS_SEED, config.key().as_ref()], bump)]
    pub pending_redemptions: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, address = config.share_mint @ MutavError::InvalidMint)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: data-less PDA that owns the token accounts; signs the moves.
    #[account(seeds = [AUTHORITY_SEED, config.key().as_ref()], bump = config.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(address = config.reserve_mint @ MutavError::InvalidMint)]
    pub reserve_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(address = config.reserve_token_program @ MutavError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,

    pub share_token_program: Program<'info, Token>,
}

/// The error for a call that fills nothing: `InsufficientLiquidBalance` when
/// `liquid_budget` was the binding term of the budget, else
/// `InsufficientFreeCapital` (spec §5.5). With BRS only, `liquid_budget ≥
/// free_capital` holds at any `c`, because `coverage_required` includes the
/// provisions by construction (`max(ceil(c × remaining_cover_total),
/// provisions)`, ADR 0016), so the liquid term binds only once TESOURO is
/// held.
pub fn nothing_filled_error(admin_left: u64, free_capital: u64, liquid_budget: u64) -> MutavError {
    if liquid_budget < free_capital && liquid_budget < admin_left {
        MutavError::InsufficientLiquidBalance
    } else {
        MutavError::InsufficientFreeCapital
    }
}

/// One fill, for the per-fill event.
struct Fill {
    owner: Pubkey,
    seq: u64,
    shares: u64,
    assets: u64,
    nav: u64,
}

pub fn handle_fulfil_redeems(
    ctx: Context<FulfilRedeems>,
    count: u8,
    max_assets: u64,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let state = &ctx.accounts.state;

    // Rules, in the spec's order.
    require!(!config.paused, MutavError::Paused);
    require!(
        count > 0 && count <= MAX_FULFIL_BATCH,
        MutavError::InvalidParameter
    );
    // TODO(plan: claim notices deferred) — no pilot instruction raises
    // `pending_notices` yet, so this gate always passes; it stays in place for
    // `flag_claim_notice`.
    require!(state.pending_notices == 0, MutavError::ClaimNoticePending);
    require!(state.mode == MODE_NORMAL, MutavError::UnderCovered);
    require!(!state.fulfil_halted, MutavError::FulfilHalted);
    // TODO(plan: TESOURO pricing built later, Tasks 8–9) — no price source is
    // read yet, so any TESOURO position fails closed with `StalePrice`.
    require!(state.tesouro_units == 0, MutavError::StalePrice);

    let snapshot = |brs_balance: u64, head_starved: bool| {
        Solvency::compute(&SolvencyInputs {
            brs_balance,
            tesouro_units: state.tesouro_units,
            tesouro_price: state.tesouro_price,
            remaining_cover_total: state.remaining_cover_total,
            coverage_ratio_bps: config.coverage_ratio_bps,
            provisions: state.provisions,
            buffer_earmark: state.buffer_earmark,
            feature_flags: config.feature_flags,
            head_starved,
        })
    };
    require!(
        !snapshot(state.brs_balance, false)?.under_covered(),
        MutavError::UnderCovered
    );

    let config_key = config.key();
    let now = Clock::get()?.unix_timestamp;
    let next_seq = state.next_redeem_seq;
    let mut seq = state.redeem_head;
    let mut brs_balance = state.brs_balance;
    let mut shares_outstanding = state.shares_outstanding;
    let (mut paid, mut burned) = (0u64, 0u64);
    let mut fills: Vec<Fill> = Vec::with_capacity(count as usize);
    let mut earmark_eff: Option<u64> = None;
    let mut blocked: Option<MutavError> = None;

    for info in ctx.remaining_accounts.iter() {
        if seq >= next_seq || fills.len() >= count as usize {
            break;
        }
        let expected = redeem_request_address(&config_key, seq);
        let mut r = match load_slot::<RedeemRequest>(info, &expected)? {
            // A closed seq passes the skip proof.
            Slot::Closed => {
                seq += 1;
                continue;
            }
            Slot::Open(r) => r,
        };
        require!(r.is_supported(), MutavError::UnsupportedVersion);
        require!(r.seq == seq, MutavError::QueueOrderViolation);
        if r.shares_remaining == 0 {
            // Filled or cancelled: dead for the queue.
            seq += 1;
            continue;
        }

        // The live head. Budget recomputed before every fill; the head is
        // passed, so the starvation term applies (spec §4).
        let starved = head_starved(
            now,
            Some(r.requested_at),
            config.exit.buffer_release_after_secs,
        );
        let sol = snapshot(brs_balance, starved)?;
        earmark_eff = Some(sol.earmark_eff);
        let admin_left = max_assets - paid; // paid ≤ max_assets by construction
        let budget = admin_left.min(sol.free_capital).min(sol.liquid_budget);
        let value = assets_for(r.shares_remaining, shares_outstanding, sol.net_assets)?;
        if value == 0 {
            // Worth nothing at this NAV: no fill. A fill always leaves
            // `assets_claimable > 0` (spec §3.8); a 0-asset fill would strand
            // a `Filled` account. Stop the batch with the head untouched.
            blocked = Some(MutavError::RequestTooSmall);
            break;
        }
        if value > budget {
            // TODO(plan: partial fills deferred, ADR 0010) — the pilot fills
            // whole requests only: a head that does not fit stops the batch
            // and is left untouched. Partial fills size `fill_max` here.
            blocked = Some(nothing_filled_error(
                admin_left,
                sol.free_capital,
                sol.liquid_budget,
            ));
            break;
        }

        // Whole fill at the NAV of this fill.
        let nav = conversion_nav(shares_outstanding, sol.net_assets)?;
        let shares = r.shares_remaining;
        r.shares_remaining = 0;
        r.shares_filled = r
            .shares_filled
            .checked_add(shares)
            .ok_or(MutavError::MathOverflow)?;
        r.assets_filled = r
            .assets_filled
            .checked_add(value)
            .ok_or(MutavError::MathOverflow)?;
        r.assets_claimable = r
            .assets_claimable
            .checked_add(value)
            .ok_or(MutavError::MathOverflow)?;
        r.fill_count = r
            .fill_count
            .checked_add(1)
            .ok_or(MutavError::MathOverflow)?;
        r.last_fill_nav = nav;
        r.last_fill_at = now;
        r.status = REDEEM_FILLED;
        store(info, &r)?;

        fills.push(Fill {
            owner: r.owner,
            seq,
            shares,
            assets: value,
            nav,
        });
        paid += value; // value ≤ admin_left
        burned = burned.checked_add(shares).ok_or(MutavError::MathOverflow)?;
        brs_balance -= value; // value ≤ liquid_budget ≤ brs_balance
        shares_outstanding = shares_outstanding
            .checked_sub(shares)
            .ok_or(MutavError::MathOverflow)?;
        // A completed request: the head moves past it.
        seq += 1;
    }

    // A call that fills nothing fails, so an empty batch is never recorded.
    if fills.is_empty() {
        return Err(blocked.unwrap_or(MutavError::QueueOrderViolation).into());
    }

    require!(
        !ctx.accounts.reserve.is_frozen() && !ctx.accounts.claims.is_frozen(),
        MutavError::ReserveFrozen
    );
    let authority_seeds: &[&[u8]] = &[
        AUTHORITY_SEED,
        config_key.as_ref(),
        &[config.authority_bump],
    ];
    burn(
        CpiContext::new_with_signer(
            ctx.accounts.share_token_program.key(),
            Burn {
                mint: ctx.accounts.share_mint.to_account_info(),
                from: ctx.accounts.pending_redemptions.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[authority_seeds],
        ),
        burned,
    )?;
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.reserve.to_account_info(),
                mint: ctx.accounts.reserve_mint.to_account_info(),
                to: ctx.accounts.claims.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[authority_seeds],
        ),
        paid,
        ctx.accounts.reserve_mint.decimals,
    )?;

    let idle_free_capital = snapshot(brs_balance, false)?.free_capital;
    let state = &mut ctx.accounts.state;
    state.brs_balance = brs_balance;
    state.claimable_assets_total = state
        .claimable_assets_total
        .checked_add(paid)
        .ok_or(MutavError::MathOverflow)?;
    state.shares_outstanding = shares_outstanding;
    state.pending_redeem_shares = state
        .pending_redeem_shares
        .checked_sub(burned)
        .ok_or(MutavError::MathOverflow)?;
    state.redeem_head = seq;
    // Ratchet (spec §4): every fill fit in the `free_capital` computed before
    // it, so the effective earmark is unchanged (invariant 16), unless the
    // head was starved.
    if let Some(e) = earmark_eff {
        state.buffer_earmark = e;
    }

    for x in &fills {
        emit_cpi!(RedeemFilled {
            config: config_key,
            ts: now,
            owner: x.owner,
            seq: x.seq,
            shares_filled: x.shares,
            assets: x.assets,
            nav: x.nav,
            shares_remaining: 0,
            partial: false,
        });
    }
    let (first, last) = (&fills[0], &fills[fills.len() - 1]);
    emit_cpi!(RedeemsFulfilled {
        config: config_key,
        ts: now,
        from_seq: first.seq,
        to_seq: last.seq,
        shares: burned,
        assets: paid,
        nav: last.nav,
        head_partial: false,
        idle_free_capital,
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_binding_term_names_the_error() {
        use MutavError::*;
        let e = |a, f, l| nothing_filled_error(a, f, l) as u32;
        assert_eq!(e(100, 50, 40), InsufficientLiquidBalance as u32);
        assert_eq!(e(100, 40, 50), InsufficientFreeCapital as u32);
        // A tie, or the admin limit binding, reports free capital.
        assert_eq!(e(100, 40, 40), InsufficientFreeCapital as u32);
        assert_eq!(e(10, 40, 30), InsufficientFreeCapital as u32);
    }
}
