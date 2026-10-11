//! `set_payments_account` (spec §5.1).

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::constants::CONFIG_SEED;
use crate::{
    constants::field,
    errors::MutavError,
    events::{emit_config_changes, ConfigChanges, PaymentsAccountUpdated},
    instructions::admin::{validate_money_accounts, vault_authority_key},
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

    /// The current treasury token account, to compare (spec §2.1).
    #[account(address = config.treasury_account @ MutavError::InvalidTreasuryAccount)]
    pub treasury_account: Box<InterfaceAccount<'info, TokenAccount>>,
}

pub fn handle_set_payments_account(ctx: Context<SetPaymentsAccount>) -> Result<()> {
    let vault_authority = vault_authority_key(
        &ctx.accounts.config.key(),
        ctx.accounts.config.authority_bump,
    )?;
    validate_money_accounts(
        &ctx.accounts.config.reserve_mint,
        &ctx.accounts.treasury_account,
        &ctx.accounts.payments_account,
        &ctx.accounts.config.mutav_capital_wallet,
        &vault_authority,
        &ctx.accounts.config.operator,
    )?;

    let new = ctx.accounts.payments_account.key();
    let config = &mut ctx.accounts.config;
    let old = config.payments_account;
    let mut ch = ConfigChanges::default();
    ch.set(field::PAYMENTS_ACCOUNT, &mut config.payments_account, new);

    let config_key = config.key();
    let ts = Clock::get()?.unix_timestamp;
    emit_config_changes(&ctx.accounts.event_authority, config_key, ts, &ch)?;
    emit_cpi!(PaymentsAccountUpdated {
        config: config_key,
        ts,
        old,
        new,
    });
    Ok(())
}
