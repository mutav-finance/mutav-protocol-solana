//! Events (spec §9), emitted with `emit_cpi!` for the mutav-app indexer and the
//! public transparency page. Every event carries `config` and `ts`.
//!
//! The event set is frozen for the pilot (spec §14.2): existing events never
//! change fields; new information goes in a new event.

use anchor_lang::prelude::*;

// ---------------------------------------------------------------------------
// `ConfigUpdated` value encoding
// ---------------------------------------------------------------------------

/// Encodes a config value into `ConfigUpdated.old` / `.new`: integers
/// little-endian in the first bytes and zero-padded; `Pubkey`s and hashes as is.
pub trait FieldBytes {
    fn field_bytes(&self) -> [u8; 32];
}

macro_rules! int_field_bytes {
    ($($t:ty),*) => {$(
        impl FieldBytes for $t {
            fn field_bytes(&self) -> [u8; 32] {
                let mut out = [0u8; 32];
                let le = self.to_le_bytes();
                out[..le.len()].copy_from_slice(&le);
                out
            }
        }
    )*};
}
int_field_bytes!(u8, u16, u32, u64, i64);

impl FieldBytes for bool {
    fn field_bytes(&self) -> [u8; 32] {
        (*self as u8).field_bytes()
    }
}

impl FieldBytes for Pubkey {
    fn field_bytes(&self) -> [u8; 32] {
        self.to_bytes()
    }
}

impl FieldBytes for [u8; 32] {
    fn field_bytes(&self) -> [u8; 32] {
        *self
    }
}

/// Collects `(field, old, new)` for every config field an instruction changes,
/// writing each field in place (spec §14.2 R6). The handler emits one
/// `ConfigUpdated` per entry.
#[derive(Default)]
pub struct ConfigChanges(pub Vec<(u16, [u8; 32], [u8; 32])>);

impl ConfigChanges {
    /// Writes `new` into `slot` and records the change if the value differs.
    pub fn set<T: FieldBytes + PartialEq + Copy>(&mut self, id: u16, slot: &mut T, new: T) {
        if *slot != new {
            self.0.push((id, slot.field_bytes(), new.field_bytes()));
            *slot = new;
        }
    }
}

/// Emits one `ConfigUpdated` per recorded change through the event authority
/// self-CPI, in the exact wire format of `emit_cpi!` (event-ix tag,
/// discriminator, Borsh body).
///
/// `emit_cpi!` allocates a fresh instruction per event, and the program's bump
/// allocator never frees, so a `set_config` touching ~40 fields ran out of the
/// 32 KiB heap. This reuses one instruction buffer; each CPI then only costs
/// the runtime's copy of the ~110-byte instruction.
pub fn emit_config_changes(
    event_authority: &AccountInfo,
    config: Pubkey,
    ts: i64,
    changes: &ConfigChanges,
) -> Result<()> {
    use anchor_lang::{
        event::EVENT_IX_TAG_LE,
        solana_program::{
            instruction::{AccountMeta, Instruction},
            program::invoke_signed,
        },
        Discriminator,
    };
    if changes.0.is_empty() {
        return Ok(());
    }
    let mut ix = Instruction {
        program_id: crate::ID,
        accounts: vec![AccountMeta::new_readonly(*event_authority.key, true)],
        data: Vec::with_capacity(128),
    };
    let signer_seeds: &[&[u8]] = &[b"__event_authority", &[crate::EVENT_AUTHORITY_AND_BUMP.1]];
    for &(field, old, new) in &changes.0 {
        ix.data.clear();
        ix.data.extend_from_slice(EVENT_IX_TAG_LE);
        ix.data.extend_from_slice(ConfigUpdated::DISCRIMINATOR);
        ConfigUpdated {
            config,
            ts,
            field,
            old,
            new,
        }
        .serialize(&mut ix.data)?;
        invoke_signed(&ix, std::slice::from_ref(event_authority), &[signer_seeds])?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Admin and roles
// ---------------------------------------------------------------------------

#[event]
pub struct VaultInitialized {
    pub config: Pubkey,
    pub ts: i64,
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub pauser: Pubkey,
    pub reserve_mint: Pubkey,
    pub share_mint: Pubkey,
}

/// One per changed `VaultConfig` field. `field` ids: `constants::field`.
#[event]
pub struct ConfigUpdated {
    pub config: Pubkey,
    pub ts: i64,
    pub field: u16,
    pub old: [u8; 32],
    pub new: [u8; 32],
}

#[event]
pub struct RolesUpdated {
    pub config: Pubkey,
    pub ts: i64,
    pub operator: Pubkey,
    pub pauser: Pubkey,
}

#[event]
pub struct OperatorRevoked {
    pub config: Pubkey,
    pub ts: i64,
    pub by: Pubkey,
}

#[event]
pub struct PaymentsAccountUpdated {
    pub config: Pubkey,
    pub ts: i64,
    pub old: Pubkey,
    pub new: Pubkey,
}

#[event]
pub struct AllowlistRootUpdated {
    pub config: Pubkey,
    pub ts: i64,
    pub root: [u8; 32],
}

#[event]
pub struct Paused {
    pub config: Pubkey,
    pub ts: i64,
    pub by: Pubkey,
}

#[event]
pub struct Unpaused {
    pub config: Pubkey,
    pub ts: i64,
    pub by: Pubkey,
}

// ---------------------------------------------------------------------------
// Guarantees, fees, claims and payouts
// ---------------------------------------------------------------------------

#[event]
pub struct GuaranteeRegistered {
    pub config: Pubkey,
    pub ts: i64,
    pub id: [u8; 32],
    pub agency_id: [u8; 32],
    pub refs_hash: [u8; 32],
    pub rent: u64,
    pub default_cover: u64,
    pub exit_cover: u64,
}

#[event]
pub struct GuaranteeClosed {
    pub config: Pubkey,
    pub ts: i64,
    pub id: [u8; 32],
    pub released_cover: u64,
}

#[event]
pub struct FeesContributed {
    pub config: Pubkey,
    pub ts: i64,
    pub invoice_ref_hash: [u8; 32],
    pub gross: u64,
    pub take: u64,
    pub net: u64,
}

/// Issuer income swept from the income inbox into the reserve (ADR 0017).
/// `inbox_after` is what stays in the inbox, untracked and outside NAV.
#[event]
pub struct IncomeSwept {
    pub config: Pubkey,
    pub ts: i64,
    pub income_ref_hash: [u8; 32],
    pub period: u32,
    pub amount: u64,
    pub inbox_after: u64,
}

#[event]
pub struct ClaimFiled {
    pub config: Pubkey,
    pub ts: i64,
    pub guarantee_id: [u8; 32],
    pub leg: u8,
    pub amount: u64,
    pub notice_ref_hash: [u8; 32],
}

#[event]
pub struct ClaimPaid {
    pub config: Pubkey,
    pub ts: i64,
    pub guarantee_id: [u8; 32],
    pub leg: u8,
    pub amount: u64,
    pub notice_ref_hash: [u8; 32],
    pub payments_account: Pubkey,
}

#[event]
pub struct PayoutSettled {
    pub config: Pubkey,
    pub ts: i64,
    pub guarantee_id: [u8; 32],
    pub notice_ref_hash: [u8; 32],
    pub pix_e2e_hash: [u8; 32],
}

// ---------------------------------------------------------------------------
// Capital (async deposits and redemptions)
// ---------------------------------------------------------------------------

#[event]
pub struct DepositRequested {
    pub config: Pubkey,
    pub ts: i64,
    pub owner: Pubkey,
    pub seq: u64,
    pub assets: u64,
}

#[event]
pub struct DepositCancelled {
    pub config: Pubkey,
    pub ts: i64,
    pub owner: Pubkey,
    pub seq: u64,
    pub assets: u64,
}

#[event]
pub struct SharesClaimed {
    pub config: Pubkey,
    pub ts: i64,
    pub owner: Pubkey,
    pub seq: u64,
    pub shares: u64,
}

#[event]
pub struct DepositsFulfilled {
    pub config: Pubkey,
    pub ts: i64,
    pub from_seq: u64,
    pub to_seq: u64,
    pub assets: u64,
    pub shares: u64,
    pub nav: u64,
}

#[event]
pub struct RedeemRequested {
    pub config: Pubkey,
    pub ts: i64,
    pub owner: Pubkey,
    pub seq: u64,
    pub shares: u64,
}

/// One per fill.
#[event]
pub struct RedeemFilled {
    pub config: Pubkey,
    pub ts: i64,
    pub owner: Pubkey,
    pub seq: u64,
    pub shares: u64,
    pub assets: u64,
    pub nav: u64,
}

/// One per `fulfil_redeems` batch.
#[event]
pub struct RedeemsFulfilled {
    pub config: Pubkey,
    pub ts: i64,
    pub from_seq: u64,
    pub to_seq: u64,
    pub shares: u64,
    pub assets: u64,
    pub nav: u64,
    pub idle_free_capital: u64,
}

#[event]
pub struct RedeemCancelled {
    pub config: Pubkey,
    pub ts: i64,
    pub owner: Pubkey,
    pub seq: u64,
    pub shares_returned: u64,
}

#[event]
pub struct AssetsClaimed {
    pub config: Pubkey,
    pub ts: i64,
    pub owner: Pubkey,
    pub seq: u64,
    pub assets: u64,
}

#[event]
pub struct QueueHeadsAdvanced {
    pub config: Pubkey,
    pub ts: i64,
    pub redeem_head: u64,
    pub deposit_head: u64,
}

// ---------------------------------------------------------------------------
// Reserve allocation, refresh and mode
// ---------------------------------------------------------------------------

#[event]
pub struct StateRefreshed {
    pub config: Pubkey,
    pub ts: i64,
    pub stable_assets: u64,
    pub coverage_required: u64,
    pub surplus: u64,
    pub provisions: u64,
    pub nav_per_share: u64,
    pub mode: u8,
}

#[event]
pub struct ModeChanged {
    pub config: Pubkey,
    pub ts: i64,
    pub from: u8,
    pub to: u8,
    pub deficit: u64,
}

#[event]
pub struct ReserveFrozenDetected {
    pub config: Pubkey,
    pub ts: i64,
    pub token_account: Pubkey,
}

/// The admin cleared `fulfil_halted`; `nav_per_share` is the new baseline of
/// the NAV-move guard (ADR 0015).
#[event]
pub struct FulfilHaltCleared {
    pub config: Pubkey,
    pub ts: i64,
    pub nav_per_share: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn integers_encode_little_endian_zero_padded() {
        let b = 0x0102u16.field_bytes();
        assert_eq!(&b[..3], &[0x02, 0x01, 0x00]);
        assert!(b[2..].iter().all(|&x| x == 0));
        let b = (-1i64).field_bytes();
        assert_eq!(&b[..8], &[0xff; 8]);
        assert!(b[8..].iter().all(|&x| x == 0));
        assert_eq!(true.field_bytes()[0], 1);
    }

    #[test]
    fn changes_record_only_real_changes() {
        let mut ch = ConfigChanges::default();
        let mut v = 5u64;
        ch.set(1, &mut v, 5);
        assert!(ch.0.is_empty());
        ch.set(1, &mut v, 7);
        assert_eq!(v, 7);
        assert_eq!(ch.0, vec![(1, 5u64.field_bytes(), 7u64.field_bytes())]);
    }
}
