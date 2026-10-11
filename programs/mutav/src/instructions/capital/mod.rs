//! Investor capital, async (spec §5.5, §5.6; ADRs 0008, 0010). MUTAV's
//! capital wallet uses the same flow as every investor.
//!
//! Design reference: the async request lifecycle of `solana-foundation/vault`;
//! no code is copied (see docs/provenance.md). Design notes: Merkle allowlist, request-size limits, strict FIFO queues by
//! `seq` with a skip proof, admin fulfilment at the NAV at fulfil, gated by
//! pause, the NAV-move guard, `free_capital` and
//! `liquid_budget`; owner-only debits.

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
use anchor_spl::associated_token::{self, get_associated_token_address_with_program_id};

use crate::{
    allowlist,
    constants::{DEPOSIT_SEED, REDEEM_SEED},
    errors::MutavError,
    state::VaultConfig,
};

/// The NAV per share range (`NAV_SCALE`) a fill may run at (ADR 0023).
/// `/admin` composes it at proposal time around the NAV it shows; a fill at
/// a NAV outside `[min, max]` refuses with `NavOutOfBounds`, so a proposal
/// that waits on the time lock never executes at a NAV the admin did not
/// agree to.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct NavBounds {
    pub min: u64,
    pub max: u64,
}

impl NavBounds {
    /// `min ≤ max`, else `InvalidParameter`.
    pub fn validate(&self) -> Result<()> {
        require!(self.min <= self.max, MutavError::InvalidParameter);
        Ok(())
    }

    /// `nav` is inside the bounds, else `NavOutOfBounds`.
    pub fn check(&self, nav: u64) -> Result<()> {
        require!(
            self.min <= nav && nav <= self.max,
            MutavError::NavOutOfBounds
        );
        Ok(())
    }
}

/// How an investor shows it may enter the reserve (spec §5.5).
///
/// **Append-only.** Borsh encodes the variant index, so a variant is never
/// removed or reordered; an attestation variant (`kyc_attester`, carved in
/// `VaultConfig`) is added at the end when it is built.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub enum Eligibility {
    /// A proof that the owner is a leaf of `investor_allowlist_root`.
    Merkle { proof: Vec<[u8; 32]> },
}

/// `owner` is eligible (spec §5.5): on the investor allowlist.
pub(crate) fn require_eligible(
    config: &VaultConfig,
    owner: &Pubkey,
    eligibility: &Eligibility,
) -> Result<()> {
    match eligibility {
        Eligibility::Merkle { proof } => require!(
            allowlist::verify(&config.investor_allowlist_root, owner, proof),
            MutavError::NotAllowlisted
        ),
    }
    Ok(())
}

/// The remaining accounts of a gate (`refresh`, `fulfil_deposits`,
/// `fulfil_redeems`): the first `config.adapter_count` are the `AdapterState`
/// PDAs in bitmap order (ADR 0018, ADR 0027), the rest follow (request PDAs).
/// This binary values no adapter, so a reserve with adapters fails closed
/// (`FeatureNotSupported`); with `adapter_count == 0` every remaining
/// account is passed through unchanged.
pub(crate) fn split_adapter_accounts<'a, 'info>(
    config: &VaultConfig,
    remaining: &'a [AccountInfo<'info>],
) -> Result<&'a [AccountInfo<'info>]> {
    require!(config.adapter_count == 0, MutavError::FeatureNotSupported);
    Ok(remaining)
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

/// The owner's associated token account for `mint` under `token_program`:
/// the only destination of a refund, a share mint or a redemption payout
/// (ADR 0023).
pub fn owner_ata(owner: &Pubkey, mint: &Pubkey, token_program: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(owner, mint, token_program)
}

/// Creates `ata` (the owner's associated token account for `mint`) if it
/// does not exist, with `payer` paying the rent (ADR 0023). Idempotent: an
/// existing account is left as is. The address is checked by the caller's
/// account constraint and again by the associated token program.
pub(crate) fn create_owner_ata<'info>(
    payer: AccountInfo<'info>,
    ata: AccountInfo<'info>,
    owner: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    associated_token_program: Pubkey,
) -> Result<()> {
    associated_token::create_idempotent(CpiContext::new(
        associated_token_program,
        associated_token::Create {
            payer,
            associated_token: ata,
            authority: owner,
            mint,
            system_program,
            token_program,
        },
    ))
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
