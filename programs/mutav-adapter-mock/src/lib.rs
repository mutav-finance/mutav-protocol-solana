//! Mock reserve adapter. Devnet and tests only; never deploy to mainnet.
//! Will implement `mutav-adapter-interface` once the interface is final.

use anchor_lang::prelude::*;

declare_id!("HnDdop5PFqvVKZNujsuakwm2K5GskAUk1GxzbDSdGuMo");

#[program]
pub mod mutav_adapter_mock {
    use super::*;

    /// No-op placeholder.
    pub fn noop(_ctx: Context<Noop>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Noop {}
