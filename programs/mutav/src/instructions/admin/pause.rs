//! `pause` / `unpause` (spec §5.1). While paused, capital flows, new
//! guarantees and allocation are rejected; fees, claims, settlement, claim
//! notices, `refresh`, `advance_queue_heads`, `cancel_*` and `claim_*` stay
//! open (ADRs 0008, 0009, 0011). Each gated instruction checks `config.paused`.

use anchor_lang::prelude::*;

use crate::{
    constants::{field, PROGRAM_LAYOUT_VERSION},
    errors::MutavError,
    events::{emit_config_changes, ConfigChanges, Paused, Unpaused},
    state::VaultConfig,
};

#[event_cpi]
#[derive(Accounts)]
pub struct Pause<'info> {
    /// The pauser or the admin. No time lock.
    pub signer: Signer<'info>,

    #[account(
        mut,
        constraint = config.version <= PROGRAM_LAYOUT_VERSION @ MutavError::UnsupportedVersion,
        constraint = config.is_pauser_or_admin(&signer.key()) @ MutavError::Unauthorized,
    )]
    pub config: Box<Account<'info, VaultConfig>>,
}

#[event_cpi]
#[derive(Accounts)]
pub struct Unpause<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        constraint = config.version <= PROGRAM_LAYOUT_VERSION @ MutavError::UnsupportedVersion,
        constraint = config.admin == admin.key() @ MutavError::Unauthorized,
    )]
    pub config: Box<Account<'info, VaultConfig>>,
}

pub fn handle_pause(ctx: Context<Pause>) -> Result<()> {
    let by = ctx.accounts.signer.key();
    let config = &mut ctx.accounts.config;
    let mut ch = ConfigChanges::default();
    ch.set(field::PAUSED, &mut config.paused, true);

    let config_key = config.key();
    let ts = Clock::get()?.unix_timestamp;
    emit_config_changes(&ctx.accounts.event_authority, config_key, ts, &ch)?;
    emit_cpi!(Paused {
        config: config_key,
        ts,
        by,
    });
    Ok(())
}

pub fn handle_unpause(ctx: Context<Unpause>) -> Result<()> {
    let by = ctx.accounts.admin.key();
    let config = &mut ctx.accounts.config;
    let mut ch = ConfigChanges::default();
    ch.set(field::PAUSED, &mut config.paused, false);

    let config_key = config.key();
    let ts = Clock::get()?.unix_timestamp;
    emit_config_changes(&ctx.accounts.event_authority, config_key, ts, &ch)?;
    emit_cpi!(Unpaused {
        config: config_key,
        ts,
        by,
    });
    Ok(())
}
