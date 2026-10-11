//! `contribute_fees` (spec §2.1, §5.3; ADRs 0007, 0009).

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    constants::*,
    errors::MutavError,
    events::FeesContributed,
    math::{mul_div, Rounding},
    pricing::inflow_nav,
    state::{IncomeReceipt, VaultConfig, VaultState},
};

#[event_cpi]
#[derive(Accounts)]
#[instruction(invoice_ref_hash: [u8; 32])]
pub struct ContributeFees<'info> {
    /// Signs the instruction and the BRS transfers from its own account.
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

    /// The fee's `IncomeReceipt` (kind `FEE`): one per invoice, so a second
    /// contribution of the same invoice fails here.
    #[account(
        init,
        payer = payer,
        space = INCOME_RECEIPT_SIZE,
        seeds = [FEE_SEED, config.key().as_ref(), invoice_ref_hash.as_ref()],
        bump,
    )]
    pub fee_receipt: Box<Account<'info, IncomeReceipt>>,

    /// The operator's own BRS token account (fees reach it via PIX → BRS).
    /// Must be owned by the operator: spending through a delegate is refused
    /// (spec §5.3).
    #[account(
        mut,
        constraint = source.mint == config.reserve_mint @ MutavError::InvalidMint,
        constraint = source.owner == operator.key() @ MutavError::InvalidParameter,
    )]
    pub source: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, seeds = [RESERVE_SEED, config.key().as_ref()], bump)]
    pub reserve: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The whitelisted MUTAV treasury: receives the take directly.
    #[account(mut, address = config.treasury_account @ MutavError::InvalidTreasuryAccount)]
    pub treasury_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(address = config.reserve_mint @ MutavError::InvalidMint)]
    pub reserve_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(address = config.reserve_token_program @ MutavError::InvalidTokenProgram)]
    pub token_program: Interface<'info, TokenInterface>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_contribute_fees(
    ctx: Context<ContributeFees>,
    invoice_ref_hash: [u8; 32],
    amount: u64,
) -> Result<()> {
    // Never paused, never solvency-gated (ADR 0009).
    require!(amount > 0, MutavError::InvalidParameter);

    let take = mul_div(
        amount,
        ctx.accounts.config.fee_take_bps as u64,
        BPS_DENOMINATOR as u64,
        Rounding::Down,
    )?;
    // `take ≤ amount × MAX_FEE_TAKE_BPS / 10_000 < amount`, so `net ≥ 1`.
    let net = amount.checked_sub(take).ok_or(MutavError::MathOverflow)?;

    // The take goes straight to the treasury; the program holds no fee
    // balance (ADR 0007). Then the net into the reserve.
    if take > 0 {
        let to = ctx.accounts.treasury_account.to_account_info();
        transfer_from_operator(&ctx.accounts, to, take)?;
    }
    let to = ctx.accounts.reserve.to_account_info();
    transfer_from_operator(&ctx.accounts, to, net)?;

    let state = &mut ctx.accounts.state;
    state.brs_balance = state
        .brs_balance
        .checked_add(net)
        .ok_or(MutavError::MathOverflow)?;
    state.fees_in_total = state
        .fees_in_total
        .checked_add(net)
        .ok_or(MutavError::MathOverflow)?;
    state.fee_take_total = state
        .fee_take_total
        .checked_add(take)
        .ok_or(MutavError::MathOverflow)?;
    // A verified inflow: the NAV-move guard measures net of the NAV per
    // share it adds (ADR 0017). Saturating, so an inflow is never refused;
    // a saturated counter reads as a fall and halts (fail closed).
    state.inflow_nav = state
        .inflow_nav
        .saturating_add(inflow_nav(net, state.shares_outstanding));

    let clock = Clock::get()?;
    let r = &mut ctx.accounts.fee_receipt;
    r.version = PROGRAM_LAYOUT_VERSION;
    r.bump = ctx.bumps.fee_receipt;
    r.kind = INCOME_KIND_FEE;
    r.ref_hash = invoice_ref_hash;
    r.gross = amount;
    r.take = take;
    r.net = net;
    r.slot = clock.slot;

    emit_cpi!(FeesContributed {
        config: ctx.accounts.config.key(),
        ts: clock.unix_timestamp,
        invoice_ref_hash,
        gross: amount,
        take,
        net,
        fees_in_total: ctx.accounts.state.fees_in_total,
        fee_take_total: ctx.accounts.state.fee_take_total,
        brs_balance: ctx.accounts.state.brs_balance,
    });
    Ok(())
}

/// `transfer_checked` of `amount` BRS from the operator's source account,
/// signed by the operator as owner.
fn transfer_from_operator<'info>(
    a: &ContributeFees<'info>,
    to: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    transfer_checked(
        CpiContext::new(
            a.token_program.key(),
            TransferChecked {
                from: a.source.to_account_info(),
                mint: a.reserve_mint.to_account_info(),
                to,
                authority: a.operator.to_account_info(),
            },
        ),
        amount,
        a.reserve_mint.decimals,
    )
}
