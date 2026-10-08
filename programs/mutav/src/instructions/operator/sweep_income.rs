//! `sweep_income` (spec §5.3a; ADR 0017).
//!
//! Nora pays MUTAV's monthly BRS revenue share into the income inbox: the
//! vault authority's associated token account for the reserve mint, created
//! by `initialize`. The inbox counts toward nothing. Each month the operator
//! sweeps the amount on Nora's statement into `reserve` and books it, so NAV
//! and `stable_assets` rise only here, never on the raw transfer.

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::get_associated_token_address_with_program_id,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    constants::*,
    errors::MutavError,
    events::IncomeSwept,
    math::{mul_div, Rounding},
    state::{IncomeReceipt, VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
#[instruction(income_ref_hash: [u8; 32])]
pub struct SweepIncome<'info> {
    /// Signs the instruction. Moves nothing of its own: the vault authority
    /// signs both transfers.
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

    /// One per statement: a second sweep of the same reference fails here.
    #[account(
        init,
        payer = payer,
        space = INCOME_RECEIPT_SIZE,
        seeds = [INCOME_SEED, config.key().as_ref(), income_ref_hash.as_ref()],
        bump,
    )]
    pub income_receipt: Box<Account<'info, IncomeReceipt>>,

    /// The income inbox. Its address must be the vault authority's associated
    /// token account for the reserve mint (checked in the handler).
    #[account(
        mut,
        constraint = income_inbox.mint == config.reserve_mint @ MutavError::InvalidMint,
    )]
    pub income_inbox: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, seeds = [RESERVE_SEED, config.key().as_ref()], bump)]
    pub reserve: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: the whitelisted MUTAV treasury (address-checked); receives the
    /// take when `income_take_bps > 0`, and the token program validates it
    /// on that transfer. Not read when the take is 0.
    #[account(mut, address = config.treasury_account @ MutavError::InvalidTreasuryAccount)]
    pub treasury_account: UncheckedAccount<'info>,

    /// CHECK: data-less PDA; owns the inbox and `reserve` and signs the
    /// transfers.
    #[account(seeds = [AUTHORITY_SEED, config.key().as_ref()], bump = config.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(address = config.reserve_mint @ MutavError::InvalidMint)]
    pub reserve_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(address = config.reserve_token_program @ MutavError::InvalidMint)]
    pub token_program: Interface<'info, TokenInterface>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// `true` for a well-formed `YYYYMM` statement month.
pub fn is_valid_period(period: u32) -> bool {
    (200_001..=999_912).contains(&period) && (1..=12).contains(&(period % 100))
}

pub fn handle_sweep_income(
    ctx: Context<SweepIncome>,
    income_ref_hash: [u8; 32],
    period: u32,
    amount: u64,
) -> Result<()> {
    // Not paused, never solvency-gated, no mode check, not gated by claim
    // notices: money coming in is always accepted, as with `contribute_fees`
    // (ADR 0017). Reads neither the price nor `buffer_earmark`.
    require!(amount > 0, MutavError::InvalidParameter);
    require!(is_valid_period(period), MutavError::InvalidParameter);

    let a = &ctx.accounts;
    let inbox = get_associated_token_address_with_program_id(
        &a.vault_authority.key(),
        &a.config.reserve_mint,
        &a.config.reserve_token_program,
    );
    require_keys_eq!(a.income_inbox.key(), inbox, MutavError::InvalidIncomeSource);
    // The inbox holds nothing tracked, so its whole balance is untracked.
    require!(
        amount <= a.income_inbox.amount,
        MutavError::IncomeExceedsInbox
    );
    require!(
        !a.income_inbox.is_frozen() && !a.reserve.is_frozen(),
        MutavError::ReserveFrozen
    );

    let take = mul_div(
        amount,
        a.config.income_take_bps as u64,
        BPS_DENOMINATOR as u64,
        Rounding::Down,
    )?;
    let net = amount.checked_sub(take).ok_or(MutavError::MathOverflow)?;
    let reserve_before = a.reserve.amount;
    let inbox_before = a.income_inbox.amount;

    if take > 0 {
        let to = a.treasury_account.to_account_info();
        transfer_from_inbox(a, to, take)?;
    }
    if net > 0 {
        let to = a.reserve.to_account_info();
        transfer_from_inbox(a, to, net)?;
    }

    // Post-CPI check: `reserve` rose by exactly `net`, the inbox fell by
    // exactly `amount`.
    ctx.accounts.reserve.reload()?;
    ctx.accounts.income_inbox.reload()?;
    let reserve_after = ctx.accounts.reserve.amount;
    let inbox_after = ctx.accounts.income_inbox.amount;
    require!(
        reserve_before.checked_add(net) == Some(reserve_after)
            && inbox_before.checked_sub(amount) == Some(inbox_after),
        MutavError::PostCpiCheckFailed
    );

    let state = &mut ctx.accounts.state;
    state.brs_balance = state
        .brs_balance
        .checked_add(net)
        .ok_or(MutavError::MathOverflow)?;
    state.income_total = state
        .income_total
        .checked_add(net)
        .ok_or(MutavError::MathOverflow)?;
    state.income_take_total = state
        .income_take_total
        .checked_add(take)
        .ok_or(MutavError::MathOverflow)?;
    // A verified inflow: the NAV-move guard measures net of it.
    state.inflows_since_refresh = state
        .inflows_since_refresh
        .checked_add(net)
        .ok_or(MutavError::MathOverflow)?;

    let clock = Clock::get()?;
    let r = &mut ctx.accounts.income_receipt;
    r.version = PROGRAM_LAYOUT_VERSION;
    r.bump = ctx.bumps.income_receipt;
    r.income_ref_hash = income_ref_hash;
    r.period = period;
    r.gross = amount;
    r.take = take;
    r.net = net;
    r.slot = clock.slot;

    emit_cpi!(IncomeSwept {
        config: ctx.accounts.config.key(),
        ts: clock.unix_timestamp,
        income_ref_hash,
        period,
        gross: amount,
        take,
        net,
        inbox_after,
    });
    Ok(())
}

/// `transfer_checked` of `amount` BRS out of the income inbox, signed by the
/// vault authority.
fn transfer_from_inbox<'info>(
    a: &SweepIncome<'info>,
    to: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let config_key = a.config.key();
    let authority_seeds: &[&[u8]] = &[
        AUTHORITY_SEED,
        config_key.as_ref(),
        &[a.config.authority_bump],
    ];
    transfer_checked(
        CpiContext::new_with_signer(
            a.token_program.key(),
            TransferChecked {
                from: a.income_inbox.to_account_info(),
                mint: a.reserve_mint.to_account_info(),
                to,
                authority: a.vault_authority.to_account_info(),
            },
            &[authority_seeds],
        ),
        amount,
        a.reserve_mint.decimals,
    )
}

#[cfg(test)]
mod tests {
    use super::is_valid_period;

    #[test]
    fn periods_are_yyyymm() {
        assert!(is_valid_period(202_610));
        assert!(is_valid_period(202_601));
        assert!(is_valid_period(202_612));
        assert!(!is_valid_period(0));
        assert!(!is_valid_period(202_600));
        assert!(!is_valid_period(202_613));
        assert!(!is_valid_period(2_026));
        assert!(!is_valid_period(199_912));
        assert!(!is_valid_period(1_000_001));
    }
}
