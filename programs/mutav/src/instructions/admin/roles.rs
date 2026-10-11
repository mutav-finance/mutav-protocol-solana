//! Role handover and guardians (spec §2, §5.1; ADR 0020).
//!
//! Every role changes in two steps, so a mistyped key never takes a role:
//! the admin proposes a key, and that key accepts by signing within
//! `HANDOVER_WINDOW_SECS` (72 h).
//!
//! - `propose_role(role, key)` / `accept_role(role)`: operator and pauser,
//!   each with its own pending key and expiry.
//! - `propose_admin(key)` / `accept_admin()`: the admin (the Squads vault).
//! - `cancel_pending(role)`: the admin clears a pending handover.
//! - `set_guardians(keys)`: the admin sets up to three pause-only guardian
//!   keys in one step; a guardian can only `pause`.
//!
//! None of them is pause-gated (ADR 0020).

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::constants::CONFIG_SEED;
use crate::{
    constants::{field, HANDOVER_WINDOW_SECS, ROLE_ADMIN, ROLE_OPERATOR, ROLE_PAUSER},
    errors::MutavError,
    events::{
        emit_config_changes, ConfigChanges, GuardiansUpdated, HandoverCancelled, RoleAccepted,
        RoleProposed,
    },
    instructions::admin::{require_not_operator_owned, validate_role_key},
    state::VaultConfig,
};

/// The pending slot of `role`: `(pending key, expiry, ConfigUpdated id of
/// the pending key)`. `InvalidParameter` for an unknown role.
fn pending_mut(c: &mut VaultConfig, role: u8) -> Result<(&mut Pubkey, &mut i64, u16)> {
    match role {
        ROLE_OPERATOR => Ok((
            &mut c.pending_operator,
            &mut c.pending_operator_expires_at,
            field::PENDING_OPERATOR,
        )),
        ROLE_PAUSER => Ok((
            &mut c.pending_pauser,
            &mut c.pending_pauser_expires_at,
            field::PENDING_PAUSER,
        )),
        ROLE_ADMIN => Ok((
            &mut c.pending_admin,
            &mut c.pending_admin_expires_at,
            field::PENDING_ADMIN,
        )),
        _ => err!(MutavError::InvalidParameter),
    }
}

/// Records `key` as pending for `role`, expiring `HANDOVER_WINDOW_SECS` from
/// now. Refused with `HandoverPending` while an unexpired handover waits for
/// that role: the admin cancels it first (`cancel_pending`, which may be in
/// the same proposal). An expired one is replaced.
fn propose(config: &mut VaultConfig, role: u8, key: Pubkey, ch: &mut ConfigChanges) -> Result<i64> {
    validate_role_key(config, role, &key)?;
    let now = Clock::get()?.unix_timestamp;
    let expires_at = now
        .checked_add(HANDOVER_WINDOW_SECS)
        .ok_or(MutavError::MathOverflow)?;
    let (pending, expiry, id) = pending_mut(config, role)?;
    require!(
        *pending == Pubkey::default() || now > *expiry,
        MutavError::HandoverPending
    );
    ch.set(id, pending, key);
    *expiry = expires_at;
    Ok(expires_at)
}

/// Checks that `signer` is the unexpired pending key of `role`, re-validates
/// it against the current roles, and clears the pending slot. Returns the
/// accepted key.
fn take_pending(
    config: &mut VaultConfig,
    role: u8,
    signer: &Pubkey,
    ch: &mut ConfigChanges,
) -> Result<Pubkey> {
    let now = Clock::get()?.unix_timestamp;
    let (pending, expiry, _) = pending_mut(config, role)?;
    let key = *pending;
    let expires_at = *expiry;
    require_keys_neq!(key, Pubkey::default(), MutavError::NoPendingHandover);
    require_keys_eq!(*signer, key, MutavError::Unauthorized);
    require!(now <= expires_at, MutavError::HandoverExpired);
    // The other roles may have changed since the proposal.
    validate_role_key(config, role, &key)?;
    let (pending, expiry, id) = pending_mut(config, role)?;
    ch.set(id, pending, Pubkey::default());
    *expiry = 0;
    Ok(key)
}

// ---------------------------------------------------------------------------
// propose_role / propose_admin / cancel_pending / set_guardians (admin)
// ---------------------------------------------------------------------------

#[event_cpi]
#[derive(Accounts)]
pub struct AdminRoleUpdate<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.reserve_mint.as_ref()],
        bump = config.bump,
        constraint = config.is_supported() @ MutavError::UnsupportedVersion,
        constraint = config.admin == admin.key() @ MutavError::Unauthorized,
    )]
    pub config: Box<Account<'info, VaultConfig>>,
}

/// Proposes `key` as the next operator (`ROLE_OPERATOR`) or pauser
/// (`ROLE_PAUSER`). Any other role value fails.
pub fn handle_propose_role(ctx: Context<AdminRoleUpdate>, role: u8, key: Pubkey) -> Result<()> {
    require!(
        role == ROLE_OPERATOR || role == ROLE_PAUSER,
        MutavError::InvalidParameter
    );
    emit_proposal(ctx, role, key)
}

/// Proposes `key` as the next admin.
pub fn handle_propose_admin(ctx: Context<AdminRoleUpdate>, key: Pubkey) -> Result<()> {
    emit_proposal(ctx, ROLE_ADMIN, key)
}

fn emit_proposal(ctx: Context<AdminRoleUpdate>, role: u8, key: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let mut ch = ConfigChanges::default();
    let expires_at = propose(config, role, key, &mut ch)?;

    let config_key = config.key();
    let ts = Clock::get()?.unix_timestamp;
    emit_config_changes(&ctx.accounts.event_authority, config_key, ts, &ch)?;
    emit_cpi!(RoleProposed {
        config: config_key,
        ts,
        role,
        key,
        expires_at,
    });
    Ok(())
}

/// Clears the pending handover of `role` (`ROLE_OPERATOR`, `ROLE_PAUSER` or
/// `ROLE_ADMIN`). Fails with `NoPendingHandover` when none is recorded.
pub fn handle_cancel_pending(ctx: Context<AdminRoleUpdate>, role: u8) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let mut ch = ConfigChanges::default();
    let (pending, expiry, id) = pending_mut(config, role)?;
    let key = *pending;
    require_keys_neq!(key, Pubkey::default(), MutavError::NoPendingHandover);
    ch.set(id, pending, Pubkey::default());
    *expiry = 0;

    let config_key = config.key();
    let ts = Clock::get()?.unix_timestamp;
    emit_config_changes(&ctx.accounts.event_authority, config_key, ts, &ch)?;
    emit_cpi!(HandoverCancelled {
        config: config_key,
        ts,
        role,
        key,
    });
    Ok(())
}

/// Sets the three guardian slots in one step. `Pubkey::default()` empties a
/// slot. A set slot may not repeat another, nor hold the admin, operator or
/// pauser key (`RolesNotDistinct`).
pub fn handle_set_guardians(ctx: Context<AdminRoleUpdate>, guardians: [Pubkey; 3]) -> Result<()> {
    let config = &mut ctx.accounts.config;
    for (i, g) in guardians.iter().enumerate() {
        if *g == Pubkey::default() {
            continue;
        }
        require!(
            *g != config.admin
                && *g != config.operator
                && *g != config.pauser
                && !guardians[..i].contains(g),
            MutavError::RolesNotDistinct
        );
    }
    let mut ch = ConfigChanges::default();
    let ids = [field::GUARDIAN_0, field::GUARDIAN_1, field::GUARDIAN_2];
    for (i, g) in guardians.iter().enumerate() {
        ch.set(ids[i], &mut config.guardians[i], *g);
    }

    let config_key = config.key();
    let ts = Clock::get()?.unix_timestamp;
    emit_config_changes(&ctx.accounts.event_authority, config_key, ts, &ch)?;
    emit_cpi!(GuardiansUpdated {
        config: config_key,
        ts,
        guardians,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// accept_role (the proposed operator or pauser)
// ---------------------------------------------------------------------------

#[event_cpi]
#[derive(Accounts)]
pub struct AcceptRole<'info> {
    /// The proposed key.
    pub new_key: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.reserve_mint.as_ref()],
        bump = config.bump,
        constraint = config.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub config: Box<Account<'info, VaultConfig>>,

    /// The money accounts, to check a new operator owns neither (ADR 0020).
    #[account(address = config.treasury_account @ MutavError::InvalidTreasuryAccount)]
    pub treasury_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(address = config.payments_account @ MutavError::InvalidPaymentsAccount)]
    pub payments_account: Box<InterfaceAccount<'info, TokenAccount>>,
}

/// The pending operator or pauser takes its role.
pub fn handle_accept_role(ctx: Context<AcceptRole>, role: u8) -> Result<()> {
    require!(
        role == ROLE_OPERATOR || role == ROLE_PAUSER,
        MutavError::InvalidParameter
    );
    let signer = ctx.accounts.new_key.key();
    let config = &mut ctx.accounts.config;
    let mut ch = ConfigChanges::default();
    let key = take_pending(config, role, &signer, &mut ch)?;
    let old = if role == ROLE_OPERATOR {
        require_not_operator_owned(
            &ctx.accounts.treasury_account,
            &ctx.accounts.payments_account,
            &key,
        )?;
        let old = config.operator;
        ch.set(field::OPERATOR, &mut config.operator, key);
        old
    } else {
        let old = config.pauser;
        ch.set(field::PAUSER, &mut config.pauser, key);
        old
    };
    let config_key = config.key();
    let ts = Clock::get()?.unix_timestamp;
    emit_config_changes(&ctx.accounts.event_authority, config_key, ts, &ch)?;
    emit_cpi!(RoleAccepted {
        config: config_key,
        ts,
        role,
        old,
        new: key,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// accept_admin (the proposed admin)
// ---------------------------------------------------------------------------

#[event_cpi]
#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    /// The proposed admin.
    pub new_admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.reserve_mint.as_ref()],
        bump = config.bump,
        constraint = config.is_supported() @ MutavError::UnsupportedVersion,
    )]
    pub config: Box<Account<'info, VaultConfig>>,
}

/// The pending admin takes the admin role.
pub fn handle_accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
    let signer = ctx.accounts.new_admin.key();
    let config = &mut ctx.accounts.config;
    let mut ch = ConfigChanges::default();
    let key = take_pending(config, ROLE_ADMIN, &signer, &mut ch)?;
    let old = config.admin;
    ch.set(field::ADMIN, &mut config.admin, key);
    let config_key = config.key();
    let ts = Clock::get()?.unix_timestamp;
    emit_config_changes(&ctx.accounts.event_authority, config_key, ts, &ch)?;
    emit_cpi!(RoleAccepted {
        config: config_key,
        ts,
        role: ROLE_ADMIN,
        old,
        new: key,
    });
    Ok(())
}
