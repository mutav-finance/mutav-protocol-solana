//! `register_guarantee` (spec §5.2): solvency-gated and capped.

use anchor_lang::prelude::*;

use crate::{
    constants::*,
    errors::MutavError,
    events::GuaranteeRegistered,
    instructions::operator::solvency_snapshot,
    solvency::coverage_required,
    state::{AgencyExposure, Guarantee, VaultConfig, VaultState},
};

/// Arguments of `register_guarantee`, in the spec's order (the wire format is
/// the same as positional arguments).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct RegisterGuaranteeArgs {
    pub id: [u8; 32],
    pub agency_id: [u8; 32],
    pub refs_hash: [u8; 32],
    pub rent: u64,
    /// Display only.
    pub default_multiplier_bps: u16,
    /// Display only.
    pub exit_multiplier_bps: u16,
    pub default_cover: u64,
    pub exit_cover: u64,
}

#[event_cpi]
#[derive(Accounts)]
#[instruction(args: RegisterGuaranteeArgs)]
pub struct RegisterGuarantee<'info> {
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
        init,
        payer = payer,
        space = GUARANTEE_SIZE,
        seeds = [GUARANTEE_SEED, config.key().as_ref(), args.id.as_ref()],
        bump,
    )]
    pub guarantee: Box<Account<'info, Guarantee>>,

    #[account(
        init_if_needed,
        payer = payer,
        space = AGENCY_EXPOSURE_SIZE,
        seeds = [AGENCY_SEED, config.key().as_ref(), args.agency_id.as_ref()],
        bump,
        constraint = agency_exposure.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub agency_exposure: Box<Account<'info, AgencyExposure>>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_register_guarantee(
    ctx: Context<RegisterGuarantee>,
    args: RegisterGuaranteeArgs,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let state = &mut ctx.accounts.state;
    let agency = &mut ctx.accounts.agency_exposure;

    // Rule 1: not paused, normal mode (stored, and checked inline, spec §6).
    require!(!config.paused, MutavError::Paused);
    require!(state.mode == MODE_NORMAL, MutavError::UnderCovered);
    let before = solvency_snapshot(config, state)?;
    require!(!before.under_covered(), MutavError::UnderCovered);

    // Rule 2: parameters.
    let new_cover = args
        .default_cover
        .checked_add(args.exit_cover)
        .ok_or(MutavError::MathOverflow)?;
    require!(new_cover > 0 && args.rent > 0, MutavError::InvalidParameter);

    // Rules 3 and 4: caps.
    require!(
        new_cover <= config.caps.max_cover_per_guarantee,
        MutavError::GuaranteeCapExceeded
    );
    let agency_after = agency
        .outstanding_cover
        .checked_add(new_cover)
        .ok_or(MutavError::MathOverflow)?;
    require!(
        agency_after <= config.caps.max_cover_per_agency,
        MutavError::AgencyCapExceeded
    );

    // Rule 5: solvency post-condition, against the earmark computed before
    // the registration (invariant 16).
    let cover_total_after = state
        .remaining_cover_total
        .checked_add(new_cover)
        .ok_or(MutavError::MathOverflow)?;
    let coverage_after = coverage_required(cover_total_after, config.coverage_ratio_bps)?;
    let needed = (coverage_after as u128) + (before.earmark_eff as u128);
    require!(
        needed <= before.stable_assets as u128,
        MutavError::InsufficientFreeCapital
    );

    // Effects, in place (spec §14.2 R6).
    let now = Clock::get()?.unix_timestamp;
    let g = &mut ctx.accounts.guarantee;
    g.version = PROGRAM_LAYOUT_VERSION;
    g.bump = ctx.bumps.guarantee;
    g.id = args.id;
    g.agency_id = args.agency_id;
    g.refs_hash = args.refs_hash;
    g.rent = args.rent;
    g.default_multiplier_bps = args.default_multiplier_bps;
    g.exit_multiplier_bps = args.exit_multiplier_bps;
    g.default_cover = args.default_cover;
    g.exit_cover = args.exit_cover;
    g.status = GUARANTEE_ACTIVE;
    g.registered_at = now;

    if agency.version == 0 {
        agency.version = PROGRAM_LAYOUT_VERSION;
        agency.bump = ctx.bumps.agency_exposure;
        agency.agency_id = args.agency_id;
    }
    agency.outstanding_cover = agency_after;
    agency.active_guarantees = agency
        .active_guarantees
        .checked_add(1)
        .ok_or(MutavError::MathOverflow)?;

    state.remaining_cover_total = cover_total_after;
    state.coverage_required = coverage_after;
    state.stable_assets = before.stable_assets;
    state.active_guarantees = state
        .active_guarantees
        .checked_add(1)
        .ok_or(MutavError::MathOverflow)?;
    // Ratchet (spec §4): the registration fit in `free_capital`, so the
    // effective earmark after it equals the one before.
    state.buffer_earmark = before.earmark_eff;

    emit_cpi!(GuaranteeRegistered {
        config: config.key(),
        ts: now,
        id: args.id,
        agency_id: args.agency_id,
        refs_hash: args.refs_hash,
        rent: args.rent,
        default_cover: args.default_cover,
        exit_cover: args.exit_cover,
    });
    Ok(())
}
