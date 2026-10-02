use anchor_lang::prelude::*;

/// Per-reserve configuration. PDA seeds: `["config", reserve_mint]`.
///
/// Holds roles and the reserve mint. Caps, adapter whitelists and pause flags
/// are added in later PRs out of `_reserved`, so the account size stays fixed.
#[account]
#[derive(InitSpace)]
pub struct VaultConfig {
    /// Protocol admin (a Squads multisig vault in production).
    pub admin: Pubkey,
    /// Operator authority (mutav-app KMS-backed server wallet).
    pub operator: Pubkey,
    /// May pause the vault; cannot unpause or move funds.
    pub pauser: Pubkey,
    /// The reserve asset mint (BRS), SPL Token or Token-2022.
    pub reserve_mint: Pubkey,
    /// Canonical bump of this PDA.
    pub bump: u8,
    /// Padding for future fields without a realloc.
    pub _reserved: [u8; 128],
}
