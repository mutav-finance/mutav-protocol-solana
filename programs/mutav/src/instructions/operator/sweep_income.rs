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
    pricing::inflow_nav,
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

    /// The vault authority: owns the inbox and `reserve` and signs the
    /// transfers.
    /// CHECK: data-less PDA, seeds-checked.
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
    // (ADR 0017).
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
    // A frozen inbox cannot be a source of income: the issuer (or the
    // mint's freeze authority) stopped it. A frozen `reserve` is the reserve
    // freeze every inflow reports.
    require!(!a.income_inbox.is_frozen(), MutavError::InvalidIncomeSource);
    require!(!a.reserve.is_frozen(), MutavError::ReserveFrozen);

    // All issuer income builds the reserve: there is no take (ADR 0019).
    let net = amount;
    let reserve_before = a.reserve.amount;
    let inbox_before = a.income_inbox.amount;
    transfer_from_inbox(a, a.reserve.to_account_info(), net)?;

    // Post-CPI check: `reserve` rose and the inbox fell by exactly `amount`.
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
    // A verified inflow: the NAV-move guard measures net of the NAV per
    // share it adds (ADR 0017). Saturating, so an inflow is never refused;
    // a saturated counter reads as a fall and halts (fail closed).
    state.inflow_nav = state
        .inflow_nav
        .saturating_add(inflow_nav(net, state.shares_outstanding));

    let clock = Clock::get()?;
    let r = &mut ctx.accounts.income_receipt;
    r.version = PROGRAM_LAYOUT_VERSION;
    r.bump = ctx.bumps.income_receipt;
    r.kind = INCOME_KIND_ISSUER_STATEMENT;
    r.ref_hash = income_ref_hash;
    r.period = period;
    r.gross = amount;
    r.net = net;
    r.slot = clock.slot;

    emit_cpi!(IncomeSwept {
        config: ctx.accounts.config.key(),
        ts: clock.unix_timestamp,
        income_ref_hash,
        period,
        amount,
        inbox_after,
        income_total: ctx.accounts.state.income_total,
        brs_balance: ctx.accounts.state.brs_balance,
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
