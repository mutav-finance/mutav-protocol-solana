//! `HolderState` (spec §3.10): one per investor wallet.

use anchor_lang::prelude::*;

use crate::constants::{HOLDER_STATE_SIZE, PROGRAM_LAYOUT_VERSION};

/// Seeds: `["holder", config, owner]`. Created by `request_deposit` or
/// `claim_shares`, whichever comes first (payer = owner). Shipped in the pilot
/// so the phase-2 holding period (spec §13.6) has a stamp for every wallet
/// that held shares before the upgrade.
#[account]
#[derive(InitSpace)]
pub struct HolderState {
    pub version: u8,
    pub bump: u8,
    pub owner: Pubkey,
    /// Time of the owner's last `request_deposit` or `claim_shares`.
    pub last_shares_in_ts: i64,
    /// Zeroed. Phase 2 carves `exit_period_start: i64`,
    /// `exit_period_paid: u64` from the front.
    pub _reserved: [u8; 64],
}

const _: () = assert!(8 + HolderState::INIT_SPACE == HOLDER_STATE_SIZE);

impl HolderState {
    /// Version guard (spec §14.2 R1b). A just-created account reads
    /// `version == 0`, which passes.
    pub fn is_supported(&self) -> bool {
        self.version <= PROGRAM_LAYOUT_VERSION
    }

    /// Initializes a just-created account and stamps `last_shares_in_ts`.
    pub fn stamp(&mut self, bump: u8, owner: Pubkey, now: i64) {
        if self.version == 0 {
            self.version = PROGRAM_LAYOUT_VERSION;
            self.bump = bump;
            self.owner = owner;
        }
        self.last_shares_in_ts = now;
    }
}
