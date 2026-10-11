//! Admin and role instructions (spec §5.1; ADR 0020, ADR 0026). Planned
//! later: `whitelist_adapter`, `remove_adapter`.

pub mod clear_fulfil_halt;
pub mod initialize;
pub mod pause;
pub mod revoke_operator;
pub mod roles;
pub mod set_allowlist_root;
pub mod set_config;
pub mod set_payments_account;
pub mod set_treasury_account;

pub use clear_fulfil_halt::*;
pub use initialize::*;
pub use pause::*;
pub use revoke_operator::*;
pub use roles::*;
pub use set_allowlist_root::*;
pub use set_config::*;
pub use set_payments_account::*;
pub use set_treasury_account::*;

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    constants::{
        AUTHORITY_SEED, BPS_DENOMINATOR, MAX_COVERAGE_RATIO_BPS, MAX_FEE_TAKE_BPS,
        MIN_COVERAGE_RATIO_BPS, ROLE_ADMIN, ROLE_OPERATOR, ROLE_PAUSER, SUPPORTED_FEATURES,
    },
    errors::MutavError,
    state::VaultConfig,
};

/// Roles are set (non-default) and distinct (spec §2, §5.1). `initialize`.
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

/// `key` may take `role` (`ROLE_OPERATOR`, `ROLE_PAUSER` or `ROLE_ADMIN`)
/// in `c` (ADR 0020): it is not the default key, it differs from the keys of
/// the two other roles, and it is not a guardian. Checked when a handover is
/// proposed and again when it is accepted, since the other roles may have
/// changed in between. An unknown role is `InvalidParameter`.
pub(crate) fn validate_role_key(c: &VaultConfig, role: u8, key: &Pubkey) -> Result<()> {
    require_keys_neq!(*key, Pubkey::default(), MutavError::InvalidParameter);
    let others = match role {
        ROLE_OPERATOR => [c.admin, c.pauser],
        ROLE_PAUSER => [c.admin, c.operator],
        ROLE_ADMIN => [c.operator, c.pauser],
        _ => return err!(MutavError::InvalidParameter),
    };
    require!(
        !others.contains(key) && !c.is_guardian(key),
        MutavError::RolesNotDistinct
    );
    Ok(())
}

/// Program bounds on the whole config, after `initialize` writes it or
/// `set_config` applies its params (spec §5.1, §7, §8; ADRs 0021, 0022, 0026).
pub(crate) fn validate_config(c: &VaultConfig) -> Result<()> {
    // Feature bits this binary does not support fail closed (spec §14.3).
    // Clearing a bit is always allowed.
    require!(
        c.feature_flags & !SUPPORTED_FEATURES == 0,
        MutavError::FeatureNotSupported
    );
    require!(
        c.fee_take_bps <= MAX_FEE_TAKE_BPS,
        MutavError::InvalidParameter
    );
    // 0.10 ≤ c ≤ 1.0 (ADR 0016, ADR 0022): above 1.0 the reserve would hold
    // more than every cover it backs.
    require!(
        (MIN_COVERAGE_RATIO_BPS..=MAX_COVERAGE_RATIO_BPS).contains(&c.coverage_ratio_bps),
        MutavError::InvalidParameter
    );
    let k = &c.caps;
    require!(
        k.max_nav_move_bps <= BPS_DENOMINATOR,
        MutavError::InvalidParameter
    );
    require!(
        k.max_tvl > 0 && k.max_cover_per_guarantee > 0,
        MutavError::InvalidParameter
    );
    // A zero per-call cap would block every claim payment (F7).
    require!(
        k.max_claim_per_call > 0 && k.max_claim_per_period >= k.max_claim_per_call,
        MutavError::InvalidParameter
    );
    require!(
        k.min_request > 0 && k.min_request <= k.max_request,
        MutavError::InvalidParameter
    );
    require!(
        k.max_queue_wait_secs >= 0 && k.max_reinstate_age >= 0,
        MutavError::InvalidParameter
    );
    require_keys_neq!(
        c.mutav_capital_wallet,
        Pubkey::default(),
        MutavError::InvalidParameter
    );
    Ok(())
}

/// The three MUTAV money flows stay apart (spec §2.1): the treasury and
/// payments token accounts are different BRS accounts, the capital wallet owns
/// neither of them, neither is one of the reserve's own token accounts (owned
/// by the vault authority PDA), and the operator owns neither (ADR 0020):
/// claim payments and the fee take never land in an account the operator
/// controls. A revoked operator (the default key) is not compared. Neither
/// account may have a delegate or a close authority (someone other than the
/// owner could move or close it) or be frozen (a frozen payments account
/// would stop `pay_claim` until it is replaced).
pub(crate) fn validate_money_accounts(
    reserve_mint: &Pubkey,
    treasury: &InterfaceAccount<TokenAccount>,
    payments: &InterfaceAccount<TokenAccount>,
    mutav_capital_wallet: &Pubkey,
    vault_authority: &Pubkey,
    operator: &Pubkey,
) -> Result<()> {
    require_keys_eq!(treasury.mint, *reserve_mint, MutavError::InvalidMint);
    require_keys_eq!(payments.mint, *reserve_mint, MutavError::InvalidMint);
    require_keys_neq!(treasury.key(), payments.key(), MutavError::InvalidParameter);
    require_plain_account(treasury, MutavError::InvalidTreasuryAccount)?;
    require_plain_account(payments, MutavError::InvalidPaymentsAccount)?;
    require!(
        *mutav_capital_wallet != treasury.owner && *mutav_capital_wallet != payments.owner,
        MutavError::InvalidParameter
    );
    require!(
        *vault_authority != treasury.owner && *vault_authority != payments.owner,
        MutavError::InvalidParameter
    );
    require_not_operator_owned(treasury, payments, operator)
}

/// `a` has no delegate, no close authority and is not frozen.
fn require_plain_account(a: &InterfaceAccount<TokenAccount>, err: MutavError) -> Result<()> {
    if a.delegate.is_some() || a.close_authority.is_some() || a.is_frozen() {
        return Err(error!(err));
    }
    Ok(())
}

/// Neither money account is owned by `operator` (ADR 0020). Also checked
/// when a new operator accepts its role.
pub(crate) fn require_not_operator_owned(
    treasury: &InterfaceAccount<TokenAccount>,
    payments: &InterfaceAccount<TokenAccount>,
    operator: &Pubkey,
) -> Result<()> {
    if *operator == Pubkey::default() {
        return Ok(());
    }
    require_keys_neq!(
        treasury.owner,
        *operator,
        MutavError::InvalidTreasuryAccount
    );
    require_keys_neq!(
        payments.owner,
        *operator,
        MutavError::InvalidPaymentsAccount
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
