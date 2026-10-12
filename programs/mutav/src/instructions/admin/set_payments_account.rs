//! `set_payments_account` (spec §5.1).

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    constants::CONFIG_SEED,
    errors::MutavError,
    events::PaymentsAccountUpdated,
    instructions::admin::{install_money_account, Installing},
    state::VaultConfig,
};

#[event_cpi]
#[derive(Accounts)]
pub struct SetPaymentsAccount<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.reserve_mint.as_ref()],
        bump = config.bump,
        constraint = config.is_supported() @ MutavError::UnsupportedVersion,
        constraint = config.admin == admin.key() @ MutavError::Unauthorized,
    )]
    pub config: Box<Account<'info, VaultConfig>>,

    /// The new payments token account (BRS). Its owner is MUTAV's payments
    /// wallet, an off-chain fact; the program records the account. It may
    /// not be owned by the operator (ADR 0020).
    pub payments_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The current treasury token account, to compare (spec §2.1). Read
    /// leniently in the handler (`load_money_account`): a closed account is
    /// skipped, so it never blocks replacing the payments account.
    /// CHECK: address-bound to `config.treasury_account`; decoded in the handler.
    #[account(address = config.treasury_account @ MutavError::InvalidTreasuryAccount)]
    pub treasury_account: UncheckedAccount<'info>,
}

pub fn handle_set_payments_account(ctx: Context<SetPaymentsAccount>) -> Result<()> {
    let a = &mut *ctx.accounts;
    let (old, new, ts) = install_money_account(
        &mut a.config,
        &a.payments_account,
        &a.treasury_account,
        Installing::Payments,
        &a.event_authority,
    )?;
    emit_event!(
        ctx,
        PaymentsAccountUpdated {
            config: ctx.accounts.config.key(),
            ts,
            old,
            new,
        }
    );
    Ok(())
}
