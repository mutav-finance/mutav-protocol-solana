//! Investor capital, async (spec §5.5, §5.6; ADRs 0008, 0010). MUTAV's
//! capital wallet uses the same flow as every investor.
//!
//! Async deposit/redeem core adapted from `solana-foundation/vault`
//! (`programs/async_vault/src/instructions/`, commit c359962), MIT License,
//! Copyright (c) 2026 Solana Foundation. See `NOTICE`.
//! Changes: Merkle allowlist, request-size limits, strict FIFO queues by
//! `seq` with a skip proof, admin fulfilment at the NAV at fulfil, gated by
//! pause, claim notices, the NAV-move guard, `free_capital` and
//! `liquid_budget`; owner-only debits; `HolderState` stamps.

pub mod cancel_deposit;
pub mod cancel_redeem;
pub mod claim_assets;
pub mod claim_shares;
pub mod fulfil_deposits;
pub mod fulfil_redeems;
pub mod request_deposit;
pub mod request_redeem;

pub use cancel_deposit::*;
pub use cancel_redeem::*;
pub use claim_assets::*;
pub use claim_shares::*;
pub use fulfil_deposits::*;
pub use fulfil_redeems::*;
pub use request_deposit::*;
pub use request_redeem::*;

use anchor_lang::{prelude::*, Discriminator};

use crate::{
    allowlist,
    constants::{DEPOSIT_SEED, REDEEM_SEED},
    errors::MutavError,
    state::VaultConfig,
};

/// `owner` is on the investor allowlist (spec §5.5).
pub(crate) fn require_allowlisted(
    config: &VaultConfig,
    owner: &Pubkey,
    proof: &[[u8; 32]],
) -> Result<()> {
    require!(
        allowlist::verify(&config.investor_allowlist_root, owner, proof),
        MutavError::NotAllowlisted
    );
    Ok(())
}

/// `caps.min_request ≤ assets ≤ caps.max_request` (spec §5.5, §8).
pub(crate) fn require_request_size(config: &VaultConfig, assets: u64) -> Result<()> {
    require!(
        assets >= config.caps.min_request,
        MutavError::RequestTooSmall
    );
    require!(
        assets <= config.caps.max_request,
        MutavError::RequestTooLarge
    );
    Ok(())
}

/// `DepositRequest` PDA of `seq`.
pub fn deposit_request_address(config: &Pubkey, seq: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[DEPOSIT_SEED, config.as_ref(), &seq.to_le_bytes()],
        &crate::ID,
    )
    .0
}

/// `RedeemRequest` PDA of `seq`.
pub fn redeem_request_address(config: &Pubkey, seq: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[REDEEM_SEED, config.as_ref(), &seq.to_le_bytes()],
        &crate::ID,
    )
    .0
}

/// One queue slot, read from a remaining account at the PDA of its `seq`.
pub(crate) enum Slot<T> {
    /// Closed: `owner == system_program && data_is_empty()`. Lamports may be
    /// non-zero (anyone can send lamports to a closed address).
    Closed,
    Open(T),
}

/// Reads the queue slot at `expected` (spec §5.8 skip proof, first half): the
/// account must be the PDA of the seq, and either closed or a decodable
/// request of this program. Anything else is `QueueOrderViolation`.
pub(crate) fn load_slot<T: AccountDeserialize + Discriminator>(
    info: &AccountInfo,
    expected: &Pubkey,
) -> Result<Slot<T>> {
    require_keys_eq!(*info.key, *expected, MutavError::QueueOrderViolation);
    if *info.owner == anchor_lang::system_program::ID && info.data_is_empty() {
        return Ok(Slot::Closed);
    }
    require_keys_eq!(*info.owner, crate::ID, MutavError::QueueOrderViolation);
    let data = info.try_borrow_data()?;
    let t =
        T::try_deserialize(&mut &data[..]).map_err(|_| error!(MutavError::QueueOrderViolation))?;
    Ok(Slot::Open(t))
}

/// Writes `t` back over its account, in place (spec §14.2 R6: the decoded
/// padding is re-written unchanged).
pub(crate) fn store<T: AccountSerialize>(info: &AccountInfo, t: &T) -> Result<()> {
    require!(info.is_writable, MutavError::QueueOrderViolation);
    t.try_serialize(&mut &mut info.try_borrow_mut_data()?[..])
}
