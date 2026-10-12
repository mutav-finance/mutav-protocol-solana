//! `set_treasury_account` (spec §5.1; ADR 0026). The treasury receives the
//! fee take of `contribute_fees` (ADR 0007).

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    constants::CONFIG_SEED,
    errors::MutavError,
    events::TreasuryAccountUpdated,
    instructions::admin::{install_money_account, Installing},
    state::VaultConfig,
};

#[event_cpi]
#[derive(Accounts)]
pub struct SetTreasuryAccount<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.reserve_mint.as_ref()],
        bump = config.bump,
        constraint = config.is_supported() @ MutavError::UnsupportedVersion,
        constraint = config.admin == admin.key() @ MutavError::Unauthorized,
    )]
    pub config: Box<Account<'info, VaultConfig>>,

    /// The new treasury token account (BRS). Its owner is MUTAV's treasury
    /// wallet, an off-chain fact; the program records the account. It may
    /// not be owned by the operator (ADR 0020).
    pub treasury_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The current payments token account, to compare (spec §2.1). Read
    /// leniently in the handler (`load_money_account`): a closed account is
    /// skipped, so it never blocks replacing the treasury.
    /// CHECK: address-bound to `config.payments_account`; decoded in the handler.
    #[account(address = config.payments_account @ MutavError::InvalidPaymentsAccount)]
    pub payments_account: UncheckedAccount<'info>,
}

pub fn handle_set_treasury_account(ctx: Context<SetTreasuryAccount>) -> Result<()> {
    let a = &mut *ctx.accounts;
    let (old, new, ts) = install_money_account(
        &mut a.config,
        &a.treasury_account,
        &a.payments_account,
        Installing::Treasury,
        &a.event_authority,
    )?;
    emit_event!(
        ctx,
        TreasuryAccountUpdated {
            config: ctx.accounts.config.key(),
            ts,
            old,
            new,
        }
    );
    Ok(())
}
