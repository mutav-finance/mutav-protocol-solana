//! `set_config` (spec §5.1, §14.3).
//!
//! Also recomputes the cached `VaultState.coverage_required` when the
//! coverage ratio `c` changes (#29), so readers of the cache see the new `c`
//! at once. `mode` stays `refresh`'s: it needs the bounded price and emits
//! `ModeChanged`. Every gate recomputes both, so neither cache is a safety
//! input.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    constants::{field, MAX_INCOME_TAKE_BPS, STATE_SEED, SUPPORTED_FEATURES},
    errors::MutavError,
    events::{emit_config_changes, ConfigChanges},
    instructions::admin::{validate_money_accounts, validate_params, vault_authority_key},
    solvency::coverage_required,
    state::{CapsInput, ExitInput, PriceInput, VaultConfig, VaultState},
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
    pub feature_flags: u64,
    pub mutav_capital_wallet: Pubkey,
    pub caps: CapsInput,
    pub price: PriceInput,
    pub exit: ExitInput,
    /// MUTAV's take from issuer income (ADR 0017), `<= MAX_INCOME_TAKE_BPS`.
    pub income_take_bps: u16,
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

    /// Its cached `coverage_required` follows a change of `c`.
    #[account(
        mut,
        seeds = [STATE_SEED, config.key().as_ref()],
        bump = state.bump,
        constraint = state.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub state: Box<Account<'info, VaultState>>,

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
    // MUTAV's take from issuer income: capped by a program constant (ADR 0017).
    require!(
        args.income_take_bps <= MAX_INCOME_TAKE_BPS,
        MutavError::InvalidParameter
    );
    validate_params(
        args.coverage_ratio_bps,
        args.fee_take_bps,
        &args.caps,
        &args.price,
    )?;
    let vault_authority = vault_authority_key(
        &ctx.accounts.config.key(),
        ctx.accounts.config.authority_bump,
    )?;
    validate_money_accounts(
        &ctx.accounts.config.reserve_mint,
        &ctx.accounts.treasury_account,
        &ctx.accounts.payments_account,
        &args.mutav_capital_wallet,
        &vault_authority,
    )?;
    // `VaultState.fulfil_halted` is cleared by `clear_fulfil_halt`, not here
    // (ADR 0015).

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
        field::FEATURE_FLAGS,
        &mut config.feature_flags,
        args.feature_flags,
    );
    ch.set(
        field::MUTAV_CAPITAL_WALLET,
        &mut config.mutav_capital_wallet,
        args.mutav_capital_wallet,
    );
    ch.set(
        field::INCOME_TAKE_BPS,
        &mut config.income_take_bps,
        args.income_take_bps,
    );
    config.apply_caps(&args.caps, &mut ch);
    config.apply_price(&args.price, &mut ch);
    config.apply_exit(&args.exit, &mut ch);

    // The cached `coverage_required` (spec §3.2) with the new `c`, as
    // `register_guarantee`, `file_claim`, `pay_claim` and `close_guarantee`
    // keep it. `mode` is left to `refresh` (see the module doc).
    let c = config.coverage_ratio_bps;
    let state = &mut ctx.accounts.state;
    state.coverage_required = coverage_required(state.remaining_cover_total, c, state.provisions)?;

    let config = &ctx.accounts.config;
    let config_key = config.key();
    let ts = Clock::get()?.unix_timestamp;
    emit_config_changes(&ctx.accounts.event_authority, config_key, ts, &ch)?;
    Ok(())
}
