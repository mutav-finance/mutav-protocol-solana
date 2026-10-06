//! `Guarantee` (spec §3.5): one per lease.

use anchor_lang::prelude::*;

use crate::{
    constants::{GUARANTEE_ACTIVE, GUARANTEE_CLOSED, GUARANTEE_SIZE, LEG_DEFAULT, LEG_EXIT},
    errors::MutavError,
};

/// Seeds: `["guarantee", config, id]`. A second registration with the same
/// `id` fails at account creation. Kept after closing so the public claims
/// history stays readable.
// TODO(spec: §3.5 — whether and when a closed guarantee may be closed for
// rent is TBD). It is never closed.
#[account]
#[derive(InitSpace)]
pub struct Guarantee {
    pub version: u8,
    pub bump: u8,
    /// Guarantee reference from the platform.
    pub id: [u8; 32],
    pub agency_id: [u8; 32],
    /// Commitment to the lease, guarantee contract and landlord mandate.
    pub refs_hash: [u8; 32],
    /// Monthly rent at registration (display and audit).
    pub rent: u64,
    /// Display only. Never used in maths.
    pub default_multiplier_bps: u16,
    /// Display only. Never used in maths.
    pub exit_multiplier_bps: u16,
    /// Absolute default (rent-arrears) cover.
    pub default_cover: u64,
    /// Absolute exit (property-recovery) cover.
    pub exit_cover: u64,
    pub default_paid: u64,
    pub exit_paid: u64,
    /// Open provisions on the default leg.
    pub provision_default: u64,
    /// Open provisions on the exit leg.
    pub provision_exit: u64,
    /// Filed, unpaid claims.
    pub open_claims: u16,
    /// `GUARANTEE_ACTIVE` / `GUARANTEE_CLOSED`.
    pub status: u8,
    pub registered_at: i64,
    /// `0` while active.
    pub closed_at: i64,
    /// Zeroed. Never read or written by logic.
    pub _reserved: [u8; 64],
}

const _: () = assert!(8 + Guarantee::INIT_SPACE == GUARANTEE_SIZE);

impl Guarantee {
    /// Version guard (spec §14.2 R1b): a known layout version and status.
    pub fn is_supported(&self) -> bool {
        self.version <= crate::constants::PROGRAM_LAYOUT_VERSION
            && matches!(self.status, GUARANTEE_ACTIVE | GUARANTEE_CLOSED)
    }

    /// `remaining_cover(g) = (default_cover − default_paid) + (exit_cover −
    /// exit_paid)` (spec §4).
    pub fn remaining_cover(&self) -> Result<u64> {
        let d = self
            .default_cover
            .checked_sub(self.default_paid)
            .ok_or(MutavError::MathOverflow)?;
        let e = self
            .exit_cover
            .checked_sub(self.exit_paid)
            .ok_or(MutavError::MathOverflow)?;
        Ok(d.checked_add(e).ok_or(MutavError::MathOverflow)?)
    }

    /// `(cover, paid, provision)` of `leg`; `InvalidParameter` for an unknown
    /// leg.
    pub fn leg(&self, leg: u8) -> Result<(u64, u64, u64)> {
        match leg {
            LEG_DEFAULT => Ok((
                self.default_cover,
                self.default_paid,
                self.provision_default,
            )),
            LEG_EXIT => Ok((self.exit_cover, self.exit_paid, self.provision_exit)),
            _ => err!(MutavError::InvalidParameter),
        }
    }

    /// Mutable `(paid, provision)` of `leg`.
    pub fn leg_mut(&mut self, leg: u8) -> Result<(&mut u64, &mut u64)> {
        match leg {
            LEG_DEFAULT => Ok((&mut self.default_paid, &mut self.provision_default)),
            LEG_EXIT => Ok((&mut self.exit_paid, &mut self.provision_exit)),
            _ => err!(MutavError::InvalidParameter),
        }
    }
}
