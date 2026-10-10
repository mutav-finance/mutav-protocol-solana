//! `pay_claim` (spec §5.4): pays a filed claim to the whitelisted payments
//! account. **Never solvency-gated, no mode check, not paused** (spec §1
//! principle 4). It reads neither the TESOURO price nor `buffer_earmark`.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    constants::*,
    errors::MutavError,
    events::ClaimPaid,
    solvency::coverage_required,
    state::{ClaimFiling, Guarantee, Payout, VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
#[instruction(leg: u8, amount: u64, notice_ref_hash: [u8; 32])]
pub struct PayClaim<'info> {
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

    /// CHECK: the `ClaimFiling` at `["claim", guarantee, notice_ref_hash]`.
    /// Decoded in the handler, so a missing filing fails with
    /// `ClaimNotFiled` (spec §5.4 rule 1) rather than a framework error.
    #[account(
        mut,
        seeds = [CLAIM_SEED, guarantee.key().as_ref(), notice_ref_hash.as_ref()],
        bump,
    )]
    pub claim_filing: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        space = PAYOUT_SIZE,
        seeds = [PAYOUT_SEED, guarantee.key().as_ref(), notice_ref_hash.as_ref()],
        bump,
    )]
    pub payout: Box<Account<'info, Payout>>,

    #[account(mut, seeds = [RESERVE_SEED, config.key().as_ref()], bump)]
    pub reserve: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Must be `config.payments_account` (spec §5.4 rule 5).
    #[account(
        mut,
        constraint = payments_account.key() == config.payments_account
            @ MutavError::InvalidPaymentsAccount,
    )]
    pub payments_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: data-less PDA that owns `reserve`; signs the transfer.
    #[account(seeds = [AUTHORITY_SEED, config.key().as_ref()], bump = config.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(address = config.reserve_mint @ MutavError::InvalidMint)]
    pub reserve_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(address = config.reserve_token_program @ MutavError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_pay_claim(
    ctx: Context<PayClaim>,
    leg: u8,
    amount: u64,
    notice_ref_hash: [u8; 32],
) -> Result<()> {
    // Rule 1: a filed claim on this leg.
    let filing_info = ctx.accounts.claim_filing.to_account_info();
    require!(
        *filing_info.owner == crate::ID && !filing_info.data_is_empty(),
        MutavError::ClaimNotFiled
    );
    let mut filing = ClaimFiling::try_deserialize(&mut &filing_info.try_borrow_data()?[..])?;
    require!(filing.is_supported(), MutavError::UnsupportedVersion);
    require!(filing.status == CLAIM_FILED, MutavError::ClaimNotFiled);
    require!(filing.leg == leg, MutavError::LegMismatch);

    // Rule 2 (ADR 0014): `0 < amount ≤ filing.provision + (leg_cover −
    // leg_paid − leg_provision)` — this filing's provision plus the leg's
    // unprovisioned cover, so the other open filings' provisions still fit in
    // the cover left after this payment (invariant 2). Checked throughout: an
    // underflow means invariant 2 is already broken, and must surface.
    require!(amount > 0, MutavError::InvalidParameter);
    let g = &ctx.accounts.guarantee;
    let (cover, paid, leg_provision) = g.leg(leg)?;
    let remaining = cover.checked_sub(paid).ok_or(MutavError::MathOverflow)?;
    let others = leg_provision
        .checked_sub(filing.provision)
        .ok_or(MutavError::MathOverflow)?;
    let bound = remaining
        .checked_sub(others)
        .ok_or(MutavError::MathOverflow)?;
    require!(amount <= bound, MutavError::ExceedsRemainingCover);

    // Rule 3: per-call cap.
    let caps = &ctx.accounts.config.caps;
    require!(
        amount <= caps.max_claim_per_call,
        MutavError::ClaimCallCapExceeded
    );

    // Rule 4: roll the window, then the per-period cap.
    let now = Clock::get()?.unix_timestamp;
    let state = &mut ctx.accounts.state;
    if now
        >= state
            .claim_period_start
            .saturating_add(caps.claim_period_secs)
    {
        state.claim_period_start = now;
        state.claim_period_paid = 0;
    }
    let period_paid = state
        .claim_period_paid
        .checked_add(amount)
        .ok_or(MutavError::MathOverflow)?;
    require!(
        period_paid <= caps.max_claim_per_period,
        MutavError::ClaimPeriodCapExceeded
    );

    // Rule 5 (destination) is an account constraint. Rule 6: liquid BRS;
    // TESOURO is never sold implicitly.
    require!(
        state.brs_balance >= amount,
        MutavError::InsufficientLiquidBalance
    );
    require!(!ctx.accounts.reserve.is_frozen(), MutavError::ReserveFrozen);
    // Rule 7: no solvency check, no mode check, no pause check.

    let config_key = ctx.accounts.config.key();
    let authority_seeds: &[&[u8]] = &[
        AUTHORITY_SEED,
        config_key.as_ref(),
        &[ctx.accounts.config.authority_bump],
    ];
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.reserve.to_account_info(),
                mint: ctx.accounts.reserve_mint.to_account_info(),
                to: ctx.accounts.payments_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[authority_seeds],
        ),
        amount,
        ctx.accounts.reserve_mint.decimals,
    )?;

    // Effects, in place.
    let released = filing.provision;
    let g = &mut ctx.accounts.guarantee;
    let (leg_paid, leg_prov) = g.leg_mut(leg)?;
    *leg_paid = leg_paid
        .checked_add(amount)
        .ok_or(MutavError::MathOverflow)?;
    *leg_prov = leg_prov
        .checked_sub(released)
        .ok_or(MutavError::MathOverflow)?;
    g.open_claims = g
        .open_claims
        .checked_sub(1)
        .ok_or(MutavError::MathOverflow)?;
    // In place (R6): only the status byte changes; padding is re-written
    // from the decoded value.
    filing.status = CLAIM_PAID;
    filing.try_serialize(&mut &mut filing_info.try_borrow_mut_data()?[..])?;

    state.provisions = state
        .provisions
        .checked_sub(released)
        .ok_or(MutavError::MathOverflow)?;
    state.brs_balance -= amount; // checked by rule 6
    state.remaining_cover_total = state
        .remaining_cover_total
        .checked_sub(amount)
        .ok_or(MutavError::MathOverflow)?;
    state.coverage_required = coverage_required(
        state.remaining_cover_total,
        ctx.accounts.config.coverage_ratio_bps,
        state.provisions,
    )?;
    state.claim_period_paid = period_paid;
    state.claims_paid_total = state
        .claims_paid_total
        .checked_add(amount)
        .ok_or(MutavError::MathOverflow)?;

    let guarantee_key = ctx.accounts.guarantee.key();
    let payments_account = ctx.accounts.payments_account.key();
    let p = &mut ctx.accounts.payout;
    p.version = PROGRAM_LAYOUT_VERSION;
    p.bump = ctx.bumps.payout;
    p.guarantee = guarantee_key;
    p.leg = leg;
    p.amount = amount;
    p.notice_ref_hash = notice_ref_hash;
    p.payments_account = payments_account;
    p.status = PAYOUT_PENDING;
    p.paid_at = now;

    emit_cpi!(ClaimPaid {
        config: config_key,
        ts: now,
        guarantee_id: ctx.accounts.guarantee.id,
        leg,
        amount,
        notice_ref_hash,
        payments_account,
    });
    Ok(())
}
