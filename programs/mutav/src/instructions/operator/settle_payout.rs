//! `settle_payout` (spec §5.4): records the PIX settlement of a paid claim on
//! its `ClaimFiling`. The program sets no settlement deadline: the payout SLA
//! belongs to the operator platform (ADR 0019).

use anchor_lang::prelude::*;

use crate::{
    constants::*,
    errors::MutavError,
    events::PayoutSettled,
    state::{ClaimFiling, Guarantee, VaultConfig},
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
        seeds = [CLAIM_SEED, guarantee.key().as_ref(), notice_ref_hash.as_ref()],
        bump = claim_filing.bump,
        constraint = claim_filing.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub claim_filing: Box<Account<'info, ClaimFiling>>,
}

pub fn handle_settle_payout(
    ctx: Context<SettlePayout>,
    notice_ref_hash: [u8; 32],
    pix_e2e_hash: [u8; 32],
) -> Result<()> {
    let x = &mut ctx.accounts.claim_filing;
    require!(x.status != CLAIM_SETTLED, MutavError::PayoutAlreadySettled);
    require!(x.status == CLAIM_PAID, MutavError::ClaimNotPaid);
    require!(pix_e2e_hash != [0; 32], MutavError::InvalidParameter);

    let now = Clock::get()?.unix_timestamp;
    x.status = CLAIM_SETTLED;
    x.pix_e2e_hash = pix_e2e_hash;
    x.settled_at = now;

    emit_cpi!(PayoutSettled {
        config: ctx.accounts.config.key(),
        ts: now,
        guarantee_id: ctx.accounts.guarantee.id,
        notice_ref_hash,
        pix_e2e_hash,
    });
    Ok(())
}
