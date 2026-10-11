//! `pause` / `unpause` (spec §5.1; ADR 0020). While paused, capital flows
//! (`request_*`, `fulfil_*`) and new guarantees are rejected; fees, income,
//! claims, settlement, closes, `refresh`, `advance_queue_head`, `cancel_*`,
//! `claim_*` and every role instruction stay open (ADRs 0008, 0009, 0020).
//! Each gated instruction checks `config.paused`.

use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::{
    constants::field,
    errors::MutavError,
    events::{emit_config_changes, ConfigChanges, Paused, Unpaused},
    state::VaultConfig,
};

#[event_cpi]
#[derive(Accounts)]
pub struct Pause<'info> {
    /// The pauser, the admin or a guardian (ADR 0020). No time lock.
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED, config.reserve_mint.as_ref()],
        bump = config.bump,
        constraint = config.is_supported() @ MutavError::UnsupportedVersion,
        constraint = config.can_pause(&signer.key()) @ MutavError::Unauthorized,
    )]
    pub config: Box<Account<'info, VaultConfig>>,
}

#[event_cpi]
#[derive(Accounts)]
pub struct Unpause<'info> {
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
