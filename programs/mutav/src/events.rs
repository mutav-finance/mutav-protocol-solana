//! Events emitted for off-chain indexers (mutav-app Convex indexer).

use anchor_lang::prelude::*;

/// Emitted once when a vault's `VaultConfig` is created.
#[event]
pub struct VaultInitialized {
    pub config: Pubkey,
    pub reserve_mint: Pubkey,
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub pauser: Pubkey,
}
