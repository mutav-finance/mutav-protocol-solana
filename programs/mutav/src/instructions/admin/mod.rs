//! Admin and role instructions (spec §5.1). Planned later: `whitelist_adapter`,
//! `remove_adapter` (Task 9).

pub mod clear_fulfil_halt;
pub mod initialize;
pub mod pause;
pub mod revoke_operator;
pub mod set_allowlist_root;
pub mod set_config;
pub mod set_payments_account;
pub mod set_roles;

pub use clear_fulfil_halt::*;
pub use initialize::*;
pub use pause::*;
pub use revoke_operator::*;
pub use set_allowlist_root::*;
pub use set_config::*;
pub use set_payments_account::*;
pub use set_roles::*;

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    constants::{AUTHORITY_SEED, BPS_DENOMINATOR, MAX_FEE_TAKE_BPS, MIN_COVERAGE_RATIO_BPS},
    errors::MutavError,
    state::{CapsInput, PriceInput},
};

/// Roles are set (non-default) and distinct (spec §2, §5.1).
pub(crate) fn validate_roles(admin: &Pubkey, operator: &Pubkey, pauser: &Pubkey) -> Result<()> {
    for role in [admin, operator, pauser] {
        require_keys_neq!(*role, Pubkey::default(), MutavError::InvalidParameter);
    }
    require!(
        operator != admin && pauser != admin && operator != pauser,
        MutavError::RolesNotDistinct
    );
    Ok(())
}

/// Program bounds shared by `initialize` and `set_config` (spec §5.1, §7, §8).
pub(crate) fn validate_params(
    coverage_ratio_bps: u16,
    fee_take_bps: u16,
    payout_sla_secs: i64,
    caps: &CapsInput,
    price: &PriceInput,
) -> Result<()> {
    require!(
        fee_take_bps <= MAX_FEE_TAKE_BPS,
        MutavError::InvalidParameter
    );
    // c ≥ 0.10 (spec §12 Q17, ADR 0016). No upper bound: a higher c only
    // asks for more capital.
    require!(
        coverage_ratio_bps >= MIN_COVERAGE_RATIO_BPS,
        MutavError::InvalidParameter
    );
    for bps in [
        caps.max_tesouro_share_bps,
        price.max_deviation_bps,
        price.max_nav_move_bps,
        price.y_max_bps,
    ] {
        require!(bps <= BPS_DENOMINATOR, MutavError::InvalidParameter);
    }
    require!(
        caps.min_request <= caps.max_request,
        MutavError::InvalidParameter
    );
    // A zero window would reset the per-period claim cap on every call.
    require!(caps.claim_period_secs > 0, MutavError::InvalidParameter);
    require!(
        payout_sla_secs >= 0 && price.max_staleness_secs >= 0,
        MutavError::InvalidParameter
    );
    Ok(())
}

/// The three MUTAV money flows stay apart (spec §2.1): the treasury and
/// payments token accounts are different BRS accounts, the capital wallet owns
/// neither of them, and neither is one of the reserve's own token accounts
/// (owned by the vault authority PDA).
pub(crate) fn validate_money_accounts(
    reserve_mint: &Pubkey,
    treasury: &InterfaceAccount<TokenAccount>,
    payments: &InterfaceAccount<TokenAccount>,
    mutav_capital_wallet: &Pubkey,
    vault_authority: &Pubkey,
) -> Result<()> {
    require_keys_eq!(treasury.mint, *reserve_mint, MutavError::InvalidMint);
    require_keys_eq!(payments.mint, *reserve_mint, MutavError::InvalidMint);
    require_keys_neq!(treasury.key(), payments.key(), MutavError::InvalidParameter);
    require!(
        *mutav_capital_wallet != treasury.owner && *mutav_capital_wallet != payments.owner,
        MutavError::InvalidParameter
    );
    require!(
        *vault_authority != treasury.owner && *vault_authority != payments.owner,
        MutavError::InvalidParameter
    );
    Ok(())
}

/// The vault authority PDA of `config`, from its stored bump.
pub(crate) fn vault_authority_key(config_key: &Pubkey, authority_bump: u8) -> Result<Pubkey> {
    Pubkey::create_program_address(
        &[AUTHORITY_SEED, config_key.as_ref(), &[authority_bump]],
        &crate::ID,
    )
    .map_err(|_| error!(MutavError::InvalidParameter))
}
