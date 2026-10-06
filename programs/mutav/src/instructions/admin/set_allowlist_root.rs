//! `set_allowlist_root` (spec §5.1).

use anchor_lang::prelude::*;

use crate::{
    constants::{field, PROGRAM_LAYOUT_VERSION},
    errors::MutavError,
    events::{emit_config_changes, AllowlistRootUpdated, ConfigChanges},
    state::VaultConfig,
};

#[event_cpi]
#[derive(Accounts)]
pub struct SetAllowlistRoot<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        constraint = config.version <= PROGRAM_LAYOUT_VERSION @ MutavError::UnsupportedVersion,
        constraint = config.admin == admin.key() @ MutavError::Unauthorized,
    )]
    pub config: Box<Account<'info, VaultConfig>>,
}

/// Sets the Merkle root of allowlisted investor wallets. A zero root
/// allowlists nobody.
pub fn handle_set_allowlist_root(ctx: Context<SetAllowlistRoot>, root: [u8; 32]) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let mut ch = ConfigChanges::default();
    ch.set(
        field::INVESTOR_ALLOWLIST_ROOT,
        &mut config.investor_allowlist_root,
        root,
    );

    let config_key = config.key();
    let ts = Clock::get()?.unix_timestamp;
    emit_config_changes(&ctx.accounts.event_authority, config_key, ts, &ch)?;
    emit_cpi!(AllowlistRootUpdated {
        config: config_key,
        ts,
        root,
    });
    Ok(())
}
