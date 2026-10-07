//! `settle_payout` (spec §5.4): records the PIX settlement of a payout.

use anchor_lang::prelude::*;

use crate::{
    constants::*,
    errors::MutavError,
    events::PayoutSettled,
    state::{Guarantee, Payout, VaultConfig},
};

#[event_cpi]
#[derive(Accounts)]
#[instruction(notice_ref_hash: [u8; 32])]
pub struct SettlePayout<'info> {
    pub operator: Signer<'info>,

    #[account(
        constraint = config.is_supported() @ MutavError::UnsupportedVersion,
        constraint = config.is_operator(&operator.key()) @ MutavError::Unauthorized,
    )]
    pub config: Box<Account<'info, VaultConfig>>,

    #[account(
        seeds = [GUARANTEE_SEED, config.key().as_ref(), guarantee.id.as_ref()],
        bump = guarantee.bump,
        constraint = guarantee.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub guarantee: Box<Account<'info, Guarantee>>,

    #[account(
        mut,
        seeds = [PAYOUT_SEED, guarantee.key().as_ref(), notice_ref_hash.as_ref()],
        bump = payout.bump,
        constraint = payout.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub payout: Box<Account<'info, Payout>>,
}

pub fn handle_settle_payout(
    ctx: Context<SettlePayout>,
    notice_ref_hash: [u8; 32],
    pix_e2e_hash: [u8; 32],
) -> Result<()> {
    let p = &mut ctx.accounts.payout;
    require!(p.status == PAYOUT_PENDING, MutavError::PayoutAlreadySettled);
    require!(pix_e2e_hash != [0; 32], MutavError::InvalidParameter);

    let now = Clock::get()?.unix_timestamp;
    let deadline = p
        .paid_at
        .saturating_add(ctx.accounts.config.payout_sla_secs);
    let late = now > deadline;
    p.status = PAYOUT_SETTLED;
    p.pix_e2e_hash = pix_e2e_hash;
    p.settled_at = now;
    p.late = late as u8;

    emit_cpi!(PayoutSettled {
        config: ctx.accounts.config.key(),
        ts: now,
        guarantee_id: ctx.accounts.guarantee.id,
        notice_ref_hash,
        pix_e2e_hash,
        late,
    });
    Ok(())
}
