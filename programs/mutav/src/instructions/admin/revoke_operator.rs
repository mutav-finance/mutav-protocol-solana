//! `revoke_operator` (spec §5.1).

use anchor_lang::prelude::*;

use crate::{
    constants::{field, PROGRAM_LAYOUT_VERSION},
    errors::MutavError,
    events::{emit_config_changes, ConfigChanges, OperatorRevoked},
    state::VaultConfig,
};

#[event_cpi]
#[derive(Accounts)]
pub struct RevokeOperator<'info> {
    /// The pauser or the admin. No time lock.
    pub signer: Signer<'info>,

    #[account(
        mut,
        constraint = config.version <= PROGRAM_LAYOUT_VERSION @ MutavError::UnsupportedVersion,
        constraint = config.is_pauser_or_admin(&signer.key()) @ MutavError::Unauthorized,
    )]
    pub config: Box<Account<'info, VaultConfig>>,
}

/// Sets `operator = Pubkey::default()`. Operator instructions fail
/// (`VaultConfig::is_operator`) until `set_roles` appoints a new key.
// TODO(spec: §2 / §12 Q16 — whether the pauser may also appoint the
// replacement operator is TBD). Only the admin can, through `set_roles`.
pub fn handle_revoke_operator(ctx: Context<RevokeOperator>) -> Result<()> {
    let by = ctx.accounts.signer.key();
    let config = &mut ctx.accounts.config;
    let mut ch = ConfigChanges::default();
    ch.set(field::OPERATOR, &mut config.operator, Pubkey::default());

    let config_key = config.key();
    let ts = Clock::get()?.unix_timestamp;
    emit_config_changes(&ctx.accounts.event_authority, config_key, ts, &ch)?;
    emit_cpi!(OperatorRevoked {
        config: config_key,
        ts,
        by,
    });
    Ok(())
}
