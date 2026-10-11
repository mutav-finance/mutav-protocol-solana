//! `pay_claim(notice_ref_hash, expected_amount)` (spec §5.4; ADR 0021): pays
//! a filed claim's provision, exactly, to the whitelisted payments account.
//! **Never solvency-gated, no mode check, not paused** (spec §1 principle 4).
//!
//! Above `max_claim_per_call` the filing needs the reserve admin's approval
//! of that exact amount (`ClaimFiling.approved_amount`, written by
//! `approve_claim`, a later upgrade). Until `approve_claim` ships, such a
//! claim is paid bank-first by MUTAV and stays filed; the reserve reimburses
//! `payments_account` once the approval exists (ADR 0021).

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    constants::*,
    errors::MutavError,
    events::ClaimPaid,
    solvency::coverage_required,
    state::{ClaimFiling, Guarantee, VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
#[instruction(notice_ref_hash: [u8; 32])]
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
}

pub fn handle_pay_claim(
    ctx: Context<PayClaim>,
    notice_ref_hash: [u8; 32],
    expected_amount: u64,
) -> Result<()> {
    // Rule 1: a filed claim.
    let filing_info = ctx.accounts.claim_filing.to_account_info();
    require!(
        *filing_info.owner == crate::ID && !filing_info.data_is_empty(),
        MutavError::ClaimNotFiled
    );
    let mut filing = ClaimFiling::try_deserialize(&mut &filing_info.try_borrow_data()?[..])?;
    require!(filing.is_supported(), MutavError::UnsupportedVersion);
    require!(filing.status == CLAIM_FILED, MutavError::ClaimNotFiled);
    let leg = filing.leg;

    // Rule 2 (ADR 0021): the payment is exactly the provision, and the
    // caller states it, so a filing changed after the caller read it is
    // never paid at an amount the caller did not see.
    require!(
        expected_amount == filing.provision,
        MutavError::ExpectedAmountMismatch
    );
    let amount = filing.provision;
    require!(amount > 0, MutavError::InvalidParameter);

    // Rule 3 (ADR 0014): `amount ≤ filing.provision + (leg_cover − leg_paid −
    // leg_provision)`, so the other open filings' provisions still fit in the
    // cover left after this payment (invariant 2). An exact payment always
    // meets it; checked throughout: an underflow means invariant 2 is already
    // broken, and must surface.
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

    // Rule 4: per-call cap. Above it, only the exact amount the reserve
    // admin approved (ADR 0021).
    let caps = &ctx.accounts.config.caps;
    if amount > caps.max_claim_per_call {
        require!(
            filing.approved_amount == amount,
            MutavError::ClaimCallCapExceeded
        );
    }

    // Rule 5: the sliding window (ADR 0019). The payments of the last
    // `CLAIM_WINDOW_DAYS` UTC days, this one included, stay within the cap.
    let now = Clock::get()?.unix_timestamp;
    let state = &mut ctx.accounts.state;
    // The effective day: a clock step back keeps the anchor's day, and the
    // payment is booked there.
    let day = state.roll_claim_window(now.div_euclid(SECONDS_PER_DAY));
    require!(
        state.claim_window_paid() + amount as u128 <= caps.max_claim_per_period as u128,
        MutavError::ClaimPeriodCapExceeded
    );

    // Rule 6 (destination) is an account constraint. Rule 7: liquid BRS;
    // nothing else is sold to pay a claim.
    require!(
        state.brs_balance >= amount,
        MutavError::InsufficientLiquidBalance
    );
    require!(!ctx.accounts.reserve.is_frozen(), MutavError::ReserveFrozen);
    // Rule 8: no solvency check, no mode check, no pause check.

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
    // The payment, recorded on the filing in place (R6): the padding is
    // re-written from the decoded value. A paid filing is never paid again.
    filing.status = CLAIM_PAID;
    filing.paid_amount = amount;
    filing.paid_at = now;
    filing.payments_account = ctx.accounts.payments_account.key();
    filing.try_serialize(&mut &mut filing_info.try_borrow_mut_data()?[..])?;

    state.provisions = state
        .provisions
        .checked_sub(released)
        .ok_or(MutavError::MathOverflow)?;
    state.brs_balance -= amount; // checked by rule 7
    state.remaining_cover_total = state
        .remaining_cover_total
        .checked_sub(amount)
        .ok_or(MutavError::MathOverflow)?;
    state.coverage_required = coverage_required(
        state.remaining_cover_total,
        ctx.accounts.config.coverage_ratio_bps,
        state.provisions,
    )?;
    let bucket = state.claim_bucket_mut(day);
    *bucket = bucket.checked_add(amount).ok_or(MutavError::MathOverflow)?;
    state.claims_paid_total = state
        .claims_paid_total
        .checked_add(amount)
        .ok_or(MutavError::MathOverflow)?;

    let window_paid = u64::try_from(state.claim_window_paid()).unwrap_or(u64::MAX);
    let (provisions_after, coverage_required_after, brs_balance_after, claims_paid_total) = (
        state.provisions,
        state.coverage_required,
        state.brs_balance,
        state.claims_paid_total,
    );
    let payments_account = ctx.accounts.payments_account.key();
    emit_cpi!(ClaimPaid {
        config: config_key,
        ts: now,
        guarantee_id: ctx.accounts.guarantee.id,
        leg,
        amount,
        notice_ref_hash,
        payments_account,
        provisions_after,
        coverage_required_after,
        window_paid,
        brs_balance_after,
        claims_paid_total,
    });
    Ok(())
}
