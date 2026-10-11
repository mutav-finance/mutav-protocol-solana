//! `revoke_operator` and `revoke_pauser` (spec §5.1; ADR 0020).

use anchor_lang::prelude::*;

use crate::{
    constants::{field, CONFIG_SEED},
    errors::MutavError,
    events::{emit_config_changes, ConfigChanges, OperatorRevoked, PauserRevoked},
    state::VaultConfig,
};

#[event_cpi]
#[derive(Accounts)]
pub struct RevokeOperator<'info> {
    /// The pauser or the admin. No time lock.
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.reserve_mint.as_ref()],
        bump = config.bump,
        constraint = config.is_supported() @ MutavError::UnsupportedVersion,
        constraint = config.is_pauser_or_admin(&signer.key()) @ MutavError::Unauthorized,
    )]
    pub config: Box<Account<'info, VaultConfig>>,
}

/// Sets `operator = Pubkey::default()` and clears the pending operator key
/// (ADR 0020), so an operator key proposed before the incident cannot accept
/// afterwards. Operator instructions fail (`VaultConfig::is_operator`) until
/// the admin proposes a new operator and it accepts. Only the admin
/// appoints.
///
/// The pending **pauser** is left alone: a pauser that is itself in doubt
/// could otherwise cancel its own replacement by calling `revoke_operator`
/// between the admin's proposal and the new pauser's acceptance. The admin
/// removes a doubtful pauser at once with `revoke_pauser`.
pub fn handle_revoke_operator(ctx: Context<RevokeOperator>) -> Result<()> {
    let by = ctx.accounts.signer.key();
    let config = &mut ctx.accounts.config;
    let mut ch = ConfigChanges::default();
    ch.set(field::OPERATOR, &mut config.operator, Pubkey::default());
    ch.set(
        field::PENDING_OPERATOR,
        &mut config.pending_operator,
        Pubkey::default(),
    );
    config.pending_operator_expires_at = 0;

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

#[event_cpi]
#[derive(Accounts)]
pub struct RevokePauser<'info> {
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

/// Sets `pauser = Pubkey::default()` and clears the pending pauser key, in
/// one step (ADR 0020). Admin only. The admin and the guardians can still
/// `pause`; a new pauser is appointed with `propose_role` / `accept_role`,
/// which may follow in the same proposal.
pub fn handle_revoke_pauser(ctx: Context<RevokePauser>) -> Result<()> {
    let by = ctx.accounts.admin.key();
    let config = &mut ctx.accounts.config;
    let mut ch = ConfigChanges::default();
    ch.set(field::PAUSER, &mut config.pauser, Pubkey::default());
    ch.set(
        field::PENDING_PAUSER,
        &mut config.pending_pauser,
        Pubkey::default(),
    );
    config.pending_pauser_expires_at = 0;

    let config_key = config.key();
    let ts = Clock::get()?.unix_timestamp;
    emit_config_changes(&ctx.accounts.event_authority, config_key, ts, &ch)?;
    emit_cpi!(PauserRevoked {
        config: config_key,
        ts,
        by,
    });
    Ok(())
}
