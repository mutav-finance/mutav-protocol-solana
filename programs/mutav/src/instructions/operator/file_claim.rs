//! `file_claim` (spec §5.4): books the provision of an approved claim.

use anchor_lang::prelude::*;

use crate::{
    constants::*,
    errors::MutavError,
    events::ClaimFiled,
    solvency::coverage_required,
    state::{ClaimFiling, Guarantee, VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
#[instruction(leg: u8, amount: u64, notice_ref_hash: [u8; 32])]
pub struct FileClaim<'info> {
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
        seeds = [GUARANTEE_SEED, config.key().as_ref(), guarantee.id.as_ref()],
        bump = guarantee.bump,
        constraint = guarantee.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub guarantee: Box<Account<'info, Guarantee>>,

    #[account(
        init,
        payer = payer,
        space = CLAIM_FILING_SIZE,
        seeds = [CLAIM_SEED, guarantee.key().as_ref(), notice_ref_hash.as_ref()],
        bump,
    )]
    pub claim_filing: Box<Account<'info, ClaimFiling>>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_file_claim(
    ctx: Context<FileClaim>,
    leg: u8,
    amount: u64,
    notice_ref_hash: [u8; 32],
) -> Result<()> {
    // Never paused, never solvency-gated.
    // TODO(spec: §5.4, PC-2 — an on-chain check of the 15-day filing window
    // is TBD). The window is enforced in the platform.
    let g = &mut ctx.accounts.guarantee;
    require!(g.status == GUARANTEE_ACTIVE, MutavError::GuaranteeNotActive);
    require!(amount > 0, MutavError::InvalidParameter);
    let (cover, paid, provision) = g.leg(leg)?;
    let unprovisioned = cover
        .checked_sub(paid)
        .and_then(|x| x.checked_sub(provision))
        .ok_or(MutavError::MathOverflow)?;
    require!(amount <= unprovisioned, MutavError::ExceedsRemainingCover);

    let (_, leg_provision) = g.leg_mut(leg)?;
    *leg_provision = leg_provision
        .checked_add(amount)
        .ok_or(MutavError::MathOverflow)?;
    g.open_claims = g
        .open_claims
        .checked_add(1)
        .ok_or(MutavError::MathOverflow)?;

    let state = &mut ctx.accounts.state;
    state.provisions = state
        .provisions
        .checked_add(amount)
        .ok_or(MutavError::MathOverflow)?;
    // Below c = 1 the provisions can bind `coverage_required` (ADR 0016).
    state.coverage_required = coverage_required(
        state.remaining_cover_total,
        ctx.accounts.config.coverage_ratio_bps,
        state.provisions,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let guarantee_key = ctx.accounts.guarantee.key();
    let x = &mut ctx.accounts.claim_filing;
    x.version = PROGRAM_LAYOUT_VERSION;
    x.bump = ctx.bumps.claim_filing;
    x.guarantee = guarantee_key;
    x.leg = leg;
    x.notice_ref_hash = notice_ref_hash;
    x.provision = amount;
    x.filed_at = now;
    x.status = CLAIM_FILED;

    emit_cpi!(ClaimFiled {
        config: ctx.accounts.config.key(),
        ts: now,
        guarantee_id: ctx.accounts.guarantee.id,
        leg,
        amount,
        notice_ref_hash,
    });
    Ok(())
}
