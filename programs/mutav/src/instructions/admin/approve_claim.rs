//! `approve_claim(notice_ref_hash, amount, expected_revision)` (spec §5.4; ADR 0021 decisions 2
//! and 8): the reserve admin approves the exact amount a filed claim takes
//! out of the reserve, so `pay_claim` can pay it above `max_claim_per_call`.
//!
//! The admin approves the amount, not the merits of the claim (ADR 0020).
//! Never paused, never coverage-gated. It moves no funds and reads no cap:
//! the sliding period cap applies when the claim is paid, and approved
//! payments count toward it.

use anchor_lang::prelude::*;

use crate::{
    constants::*,
    errors::MutavError,
    events::ClaimApproved,
    state::{ClaimFiling, Guarantee, VaultConfig},
};

#[event_cpi]
#[derive(Accounts)]
#[instruction(notice_ref_hash: [u8; 32])]
pub struct ApproveClaim<'info> {
    /// The admin (the Squads vault, through the admin time lock).
    pub admin: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED, config.reserve_mint.as_ref()],
        bump = config.bump,
        constraint = config.is_supported() @ MutavError::UnsupportedVersion,
        constraint = config.admin == admin.key() @ MutavError::Unauthorized,
    )]
    pub config: Box<Account<'info, VaultConfig>>,

    #[account(
        seeds = [GUARANTEE_SEED, config.key().as_ref(), guarantee.id.as_ref()],
        bump = guarantee.bump,
        constraint = guarantee.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub guarantee: Box<Account<'info, Guarantee>>,

    /// `is_supported` refuses `CLAIM_WITHDRAWN` in this binary (ADR 0019), so
    /// an approval never attaches to a withdrawn filing.
    #[account(
        mut,
        seeds = [CLAIM_SEED, guarantee.key().as_ref(), notice_ref_hash.as_ref()],
        bump = claim_filing.bump,
        constraint = claim_filing.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub claim_filing: Box<Account<'info, ClaimFiling>>,
}

pub fn handle_approve_claim(
    ctx: Context<ApproveClaim>,
    notice_ref_hash: [u8; 32],
    amount: u64,
    expected_revision: u16,
) -> Result<()> {
    let x = &mut ctx.accounts.claim_filing;
    // Rule 1: a filed claim. A paid or settled filing takes no approval.
    require!(x.status == CLAIM_FILED, MutavError::ClaimNotFiled);
    // Rule 2: `0` means "not approved" (ADR 0019) and is never written as an
    // approval.
    require!(amount > 0, MutavError::InvalidParameter);
    // Rule 3: the exact amount the claim pays, which is its provision
    // (ADR 0021 decision 3).
    require!(amount == x.provision, MutavError::ExpectedAmountMismatch);
    // Rule 4: the version of the filing the proposal was composed against.
    // An amendment X → Y → X restores the amount but not the revision, so an
    // approval proposed for the first X cannot execute on the second.
    require!(
        expected_revision == x.revision,
        MutavError::ClaimRevisionMismatch
    );

    let previous_amount = x.approved_amount;
    x.approved_amount = amount;

    emit_event!(
        ctx,
        ClaimApproved {
            config: ctx.accounts.config.key(),
            ts: Clock::get()?.unix_timestamp,
            guarantee_id: ctx.accounts.guarantee.id,
            leg: x.leg,
            notice_ref_hash,
            amount,
            revision: x.revision,
            previous_amount,
            max_claim_per_call: ctx.accounts.config.caps.max_claim_per_call,
        }
    );
    Ok(())
}
