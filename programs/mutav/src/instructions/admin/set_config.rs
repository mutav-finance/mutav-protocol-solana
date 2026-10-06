//! `set_config` (spec §5.1, §14.3).

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    constants::{field, SUPPORTED_FEATURES},
    errors::MutavError,
    events::{emit_config_changes, ConfigChanges},
    instructions::admin::{validate_money_accounts, validate_params},
    state::{CapsInput, ExitInput, PriceInput, VaultConfig},
};

/// The full set of `VaultConfig` fields `set_config` manages. Roles, the
/// payments account, the allowlist root and the pause flag have their own
/// instructions; the reserve mint, its token program and decimals, the share
/// mint and the admin never change. The treasury is the `treasury_account`
/// passed to the instruction.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SetConfigArgs {
    pub coverage_ratio_bps: u16,
    pub fee_take_bps: u16,
    pub payout_sla_secs: i64,
    pub feature_flags: u64,
    pub mutav_capital_wallet: Pubkey,
    pub caps: CapsInput,
    pub price: PriceInput,
    pub exit: ExitInput,
}

#[event_cpi]
#[derive(Accounts)]
pub struct SetConfig<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        constraint = config.is_supported() @ MutavError::UnsupportedVersion,
        constraint = config.admin == admin.key() @ MutavError::Unauthorized,
    )]
    pub config: Box<Account<'info, VaultConfig>>,

    /// The treasury token account after this update (the current one, or a
    /// new one).
    pub treasury_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The current payments token account, to compare owners (spec §2.1).
    #[account(address = config.payments_account @ MutavError::InvalidPaymentsAccount)]
    pub payments_account: Box<InterfaceAccount<'info, TokenAccount>>,
}

pub fn handle_set_config(ctx: Context<SetConfig>, args: SetConfigArgs) -> Result<()> {
    // Feature bits this binary does not support fail closed (spec §14.3).
    // Clearing a bit is always allowed.
    require!(
        args.feature_flags & !SUPPORTED_FEATURES == 0,
        MutavError::FeatureNotSupported
    );
    // `ExitParams` may be staged while `INSTANT_EXIT` is off; their bounds are
    // checked only when the resulting config has the flag on, which no pilot
    // binary allows (spec §13.2).
    validate_params(
        args.coverage_ratio_bps,
        args.fee_take_bps,
        args.payout_sla_secs,
        &args.caps,
        &args.price,
    )?;
    validate_money_accounts(
        &ctx.accounts.config.reserve_mint,
        &ctx.accounts.treasury_account,
        &ctx.accounts.payments_account,
        &args.mutav_capital_wallet,
    )?;
    // TODO(spec: §5.8 step 3 — the exact clearing path for
    // `VaultState.fulfil_halted` is TBD). `set_config` does not clear it yet.

    let treasury = ctx.accounts.treasury_account.key();
    let config = &mut ctx.accounts.config;
    let mut ch = ConfigChanges::default();
    ch.set(
        field::COVERAGE_RATIO_BPS,
        &mut config.coverage_ratio_bps,
        args.coverage_ratio_bps,
    );
    ch.set(
        field::FEE_TAKE_BPS,
        &mut config.fee_take_bps,
        args.fee_take_bps,
    );
    ch.set(
        field::TREASURY_ACCOUNT,
        &mut config.treasury_account,
        treasury,
    );
    ch.set(
        field::PAYOUT_SLA_SECS,
        &mut config.payout_sla_secs,
        args.payout_sla_secs,
    );
    ch.set(
        field::FEATURE_FLAGS,
        &mut config.feature_flags,
        args.feature_flags,
    );
    ch.set(
        field::MUTAV_CAPITAL_WALLET,
        &mut config.mutav_capital_wallet,
        args.mutav_capital_wallet,
    );
    config.apply_caps(&args.caps, &mut ch);
    config.apply_price(&args.price, &mut ch);
    config.apply_exit(&args.exit, &mut ch);

    let config_key = config.key();
    let ts = Clock::get()?.unix_timestamp;
    emit_config_changes(&ctx.accounts.event_authority, config_key, ts, &ch)?;
    Ok(())
}
