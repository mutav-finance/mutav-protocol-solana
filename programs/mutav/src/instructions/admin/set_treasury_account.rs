//! `set_treasury_account` (spec §5.1; ADR 0026). The treasury receives the
//! fee take of `contribute_fees` (ADR 0007).

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::constants::CONFIG_SEED;
use crate::{
    constants::field,
    errors::MutavError,
    events::{emit_config_changes, ConfigChanges, TreasuryAccountUpdated},
    instructions::admin::{
        load_money_account, validate_money_accounts, vault_authority_key, Installing, Money,
    },
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
    let vault_authority = vault_authority_key(
        &ctx.accounts.config.key(),
        ctx.accounts.config.authority_bump,
    )?;
    let payments = load_money_account(
        &ctx.accounts.payments_account,
        &ctx.accounts.config.reserve_token_program,
        MutavError::InvalidPaymentsAccount,
    )?;
    validate_money_accounts(
        &ctx.accounts.config.reserve_mint,
        Money::of(&ctx.accounts.treasury_account),
        Money::loaded(ctx.accounts.payments_account.key(), &payments),
        &ctx.accounts.config.mutav_capital_wallet,
        &vault_authority,
        &ctx.accounts.config.operator,
        Installing::Treasury,
    )?;

    let new = ctx.accounts.treasury_account.key();
    let config = &mut ctx.accounts.config;
    let old = config.treasury_account;
    let mut ch = ConfigChanges::default();
    ch.set(field::TREASURY_ACCOUNT, &mut config.treasury_account, new);

    let config_key = config.key();
    let ts = Clock::get()?.unix_timestamp;
    emit_config_changes(&ctx.accounts.event_authority, config_key, ts, &ch)?;
    emit_cpi!(TreasuryAccountUpdated {
        config: config_key,
        ts,
        old,
        new,
    });
    Ok(())
}
