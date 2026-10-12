//! Admin and role instructions (spec §5.1; ADR 0020, ADR 0026). Planned
//! later: `whitelist_adapter`, `remove_adapter`.

pub mod approve_claim;
pub mod clear_fulfil_halt;
pub mod initialize;
pub mod pause;
pub mod revoke_operator;
pub mod roles;
pub mod set_allowlist_root;
pub mod set_config;
pub mod set_payments_account;
pub mod set_treasury_account;

pub use approve_claim::*;
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
        field, AUTHORITY_SEED, BPS_DENOMINATOR, MAX_COVERAGE_RATIO_BPS, MAX_FEE_TAKE_BPS,
        MIN_COVERAGE_RATIO_BPS, ROLE_ADMIN, ROLE_OPERATOR, ROLE_PAUSER, SUPPORTED_FEATURES,
    },
    errors::MutavError,
    events::{emit_config_changes, ConfigChanges},
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
    // The stress buffer asks for capital the reserve could hold: never more
    // than `max_tvl` (ADR 0022). `0` = no stress term.
    require!(k.stress_buffer <= k.max_tvl, MutavError::InvalidParameter);
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

/// Which money account is being installed, and so has to be a plain account
/// (no delegate, no close authority, not frozen). The account already in
/// place is not re-checked for plainness: an issuer freeze or a delegate set
/// on it must not block replacing either account or changing the config.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Installing {
    /// `initialize`: both accounts are new.
    Both,
    /// `set_treasury_account`.
    Treasury,
    /// `set_payments_account`.
    Payments,
    /// `set_config`: neither; only the owner rules are re-checked.
    Neither,
}

/// One money account (treasury or payments) as the money-flow rules see it:
/// its address and, unless it is closed, its token account. The account
/// being installed is always decoded; a current one is read leniently
/// ([`load_money_account`]).
#[derive(Clone, Copy)]
pub(crate) struct Money<'a> {
    pub key: Pubkey,
    pub account: Option<&'a TokenAccount>,
}

impl<'a> Money<'a> {
    /// A decoded token account (the one being installed).
    pub fn of(a: &'a InterfaceAccount<TokenAccount>) -> Self {
        Self {
            key: a.key(),
            account: Some(a),
        }
    }

    /// A current account read with [`load_money_account`].
    pub fn loaded(key: Pubkey, account: &'a Option<TokenAccount>) -> Self {
        Self {
            key,
            account: account.as_ref(),
        }
    }
}

/// Reads a **current** money account (the one recorded in `VaultConfig`)
/// leniently, so a closed treasury or payments account never blocks
/// `set_config`, `accept_role` or replacing either account:
///
/// - owned by the system program with no data: closed, `None` (it may still
///   hold lamports, which anyone can send to a closed address);
/// - owned by `token_program`: decoded as a token account, else `err` (a mint
///   or a malformed account is refused);
/// - owned by any other program, with or without data: `err`.
pub(crate) fn load_money_account(
    info: &AccountInfo,
    token_program: &Pubkey,
    err: MutavError,
) -> Result<Option<TokenAccount>> {
    if *info.owner == anchor_lang::system_program::ID && info.data_is_empty() {
        return Ok(None);
    }
    require_keys_eq!(*info.owner, *token_program, err);
    let data = info.try_borrow_data()?;
    let a = TokenAccount::try_deserialize(&mut &data[..]).map_err(|_| error!(err))?;
    Ok(Some(a))
}

/// The three MUTAV money flows stay apart (spec §2.1): the treasury and
/// payments token accounts are different BRS accounts, the capital wallet owns
/// neither of them, neither is one of the reserve's own token accounts (owned
/// by the vault authority PDA), and the operator owns neither (ADR 0020):
/// claim payments and the fee take never land in an account the operator
/// controls. A revoked operator (the default key) is not compared. The
/// account being installed (`installing`) may not have a delegate or a close
/// authority (someone other than the owner could move or close it) or be
/// frozen (a frozen payments account would stop `pay_claim` until it is
/// replaced). A closed current account has no owner to compare: its rules
/// are skipped, and the admin replaces it.
pub(crate) fn validate_money_accounts(
    reserve_mint: &Pubkey,
    treasury: Money,
    payments: Money,
    mutav_capital_wallet: &Pubkey,
    vault_authority: &Pubkey,
    operator: &Pubkey,
    installing: Installing,
) -> Result<()> {
    let (t, p) = (treasury.account, payments.account);
    for a in t.iter().chain(p.iter()) {
        require_keys_eq!(a.mint, *reserve_mint, MutavError::InvalidMint);
    }
    require_keys_neq!(treasury.key, payments.key, MutavError::InvalidParameter);
    if matches!(installing, Installing::Both | Installing::Treasury) {
        let a = t.ok_or(MutavError::InvalidTreasuryAccount)?;
        require_plain_account(a, MutavError::InvalidTreasuryAccount)?;
    }
    if matches!(installing, Installing::Both | Installing::Payments) {
        let a = p.ok_or(MutavError::InvalidPaymentsAccount)?;
        require_plain_account(a, MutavError::InvalidPaymentsAccount)?;
    }
    for a in t.iter().chain(p.iter()) {
        require!(
            *mutav_capital_wallet != a.owner,
            MutavError::InvalidParameter
        );
    }
    for a in t.iter().chain(p.iter()) {
        require!(*vault_authority != a.owner, MutavError::InvalidParameter);
    }
    require_not_operator_owned(t, p, operator)
}

/// The shared body of `set_treasury_account` (`side = Installing::Treasury`)
/// and `set_payments_account` (`side = Installing::Payments`). The two
/// instructions, their account lists and their events stay separate
/// (ADR 0026). Checks the new account against the current other one (read
/// leniently, [`load_money_account`]) with [`validate_money_accounts`],
/// writes it and emits its `ConfigUpdated`. Returns `(old, new, ts)` for the
/// caller's own event.
pub(crate) fn install_money_account(
    config: &mut Account<VaultConfig>,
    new_account: &InterfaceAccount<TokenAccount>,
    other: &AccountInfo,
    side: Installing,
    event_authority: &AccountInfo,
) -> Result<(Pubkey, Pubkey, i64)> {
    let treasury_side = side == Installing::Treasury;
    let config_key = config.key();
    let vault_authority = vault_authority_key(&config_key, config.authority_bump)?;
    let current = load_money_account(
        other,
        &config.reserve_token_program,
        if treasury_side {
            MutavError::InvalidPaymentsAccount
        } else {
            MutavError::InvalidTreasuryAccount
        },
    )?;
    let installed = Money::of(new_account);
    let in_place = Money::loaded(other.key(), &current);
    let (treasury, payments) = if treasury_side {
        (installed, in_place)
    } else {
        (in_place, installed)
    };
    validate_money_accounts(
        &config.reserve_mint,
        treasury,
        payments,
        &config.mutav_capital_wallet,
        &vault_authority,
        &config.operator,
        side,
    )?;

    let new = new_account.key();
    let (id, slot) = if treasury_side {
        (field::TREASURY_ACCOUNT, &mut config.treasury_account)
    } else {
        (field::PAYMENTS_ACCOUNT, &mut config.payments_account)
    };
    let old = *slot;
    let mut ch = ConfigChanges::default();
    ch.set(id, slot, new);
    let ts = Clock::get()?.unix_timestamp;
    emit_config_changes(event_authority, config_key, ts, &ch)?;
    Ok((old, new, ts))
}

/// `a` has no delegate, no close authority and is not frozen.
fn require_plain_account(a: &TokenAccount, err: MutavError) -> Result<()> {
    if a.delegate.is_some() || a.close_authority.is_some() || a.is_frozen() {
        return Err(error!(err));
    }
    Ok(())
}

/// Neither money account is owned by `operator` (ADR 0020). Also checked
/// when a new operator accepts its role. A closed account (`None`) is owned
/// by no one and passes.
pub(crate) fn require_not_operator_owned(
    treasury: Option<&TokenAccount>,
    payments: Option<&TokenAccount>,
    operator: &Pubkey,
) -> Result<()> {
    if *operator == Pubkey::default() {
        return Ok(());
    }
    if let Some(t) = treasury {
        require_keys_neq!(t.owner, *operator, MutavError::InvalidTreasuryAccount);
    }
    if let Some(p) = payments {
        require_keys_neq!(p.owner, *operator, MutavError::InvalidPaymentsAccount);
    }
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
