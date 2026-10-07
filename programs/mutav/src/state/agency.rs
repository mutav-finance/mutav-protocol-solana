//! `AgencyExposure` (spec §3.4): per-agency outstanding cover, for the
//! per-agency cap.

use anchor_lang::prelude::*;

use crate::constants::{AGENCY_EXPOSURE_SIZE, PROGRAM_LAYOUT_VERSION};

/// Seeds: `["agency", config, agency_id]`. Created on the agency's first
/// `register_guarantee`.
#[account]
#[derive(InitSpace)]
pub struct AgencyExposure {
    pub version: u8,
    pub bump: u8,
    /// Stable public reference issued by the MUTAV platform.
    pub agency_id: [u8; 32],
    /// `Σ` remaining cover of this agency's active guarantees.
    pub outstanding_cover: u64,
    pub active_guarantees: u32,
    pub claims_paid_total: u64,
    /// Zeroed. Never read or written by logic.
    pub _reserved: [u8; 64],
}

const _: () = assert!(8 + AgencyExposure::INIT_SPACE == AGENCY_EXPOSURE_SIZE);

impl AgencyExposure {
    /// Version guard (spec §14.2 R1b). A just-created account reads
    /// `version == 0`, which passes.
    pub fn is_supported(&self) -> bool {
        self.version <= PROGRAM_LAYOUT_VERSION
    }
}
