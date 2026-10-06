//! `set_roles` (spec §5.1).

use anchor_lang::prelude::*;

use crate::{
    constants::field,
    errors::MutavError,
    events::{emit_config_changes, ConfigChanges, RolesUpdated},
    instructions::admin::validate_roles,
    state::VaultConfig,
};

#[event_cpi]
#[derive(Accounts)]
pub struct SetRoles<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        constraint = config.is_supported() @ MutavError::UnsupportedVersion,
        constraint = config.admin == admin.key() @ MutavError::Unauthorized,
    )]
    pub config: Box<Account<'info, VaultConfig>>,
}

/// Appoints the operator and the pauser. Also the only way to restore an
/// operator after `revoke_operator`.
pub fn handle_set_roles(ctx: Context<SetRoles>, operator: Pubkey, pauser: Pubkey) -> Result<()> {
    validate_roles(&ctx.accounts.config.admin, &operator, &pauser)?;

    let config = &mut ctx.accounts.config;
    let mut ch = ConfigChanges::default();
    ch.set(field::OPERATOR, &mut config.operator, operator);
    ch.set(field::PAUSER, &mut config.pauser, pauser);

    let config_key = config.key();
    let ts = Clock::get()?.unix_timestamp;
    emit_config_changes(&ctx.accounts.event_authority, config_key, ts, &ch)?;
    emit_cpi!(RolesUpdated {
        config: config_key,
        ts,
        operator,
        pauser,
    });
    Ok(())
}
