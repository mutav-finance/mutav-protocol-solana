//! Program error codes (spec §10). Keep a single `#[error_code]` block.
//!
//! Codes are numbered by enum order, so this list is **append-only** from the
//! first devnet deploy: new errors go at the end; none is reordered or removed.

use anchor_lang::prelude::*;

#[error_code]
pub enum MutavError {
    #[msg("Signer is not authorized for this instruction")]
    Unauthorized,
    #[msg("Roles must be distinct keys")]
    RolesNotDistinct,
    #[msg("The reserve is paused")]
    Paused,
    #[msg("Invalid parameter")]
    InvalidParameter,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Mint has an unsupported Token-2022 extension")]
    UnsupportedMintExtension,
    #[msg("A reserve token account is frozen")]
    ReserveFrozen,
    #[msg("The reserve is under-covered")]
    UnderCovered,
    #[msg("Insufficient free capital")]
    InsufficientFreeCapital,
    #[msg("Insufficient liquid balance")]
    InsufficientLiquidBalance,
    #[msg("Price is stale")]
    StalePrice,
    #[msg("Price deviation beyond the bound")]
    PriceDeviation,
    #[msg("Fulfilment is halted by the NAV-move guard")]
    FulfilHalted,
    #[msg("TVL cap exceeded")]
    TvlCapExceeded,
    #[msg("Per-guarantee cap exceeded")]
    GuaranteeCapExceeded,
    #[msg("Guarantee is not active")]
    GuaranteeNotActive,
    #[msg("Guarantee has open claims")]
    OpenClaims,
    #[msg("Amount exceeds the remaining cover")]
    ExceedsRemainingCover,
    #[msg("Claim has not been filed")]
    ClaimNotFiled,
    #[msg("Leg does not match the claim filing")]
    LegMismatch,
    #[msg("Per-call claim payment cap exceeded")]
    ClaimCallCapExceeded,
    #[msg("Per-period claim payment cap exceeded")]
    ClaimPeriodCapExceeded,
    #[msg("Invalid payments account")]
    InvalidPaymentsAccount,
    #[msg("Payout already settled")]
    PayoutAlreadySettled,
    #[msg("Wallet is not allowlisted")]
    NotAllowlisted,
    #[msg("Request is below the minimum")]
    RequestTooSmall,
    #[msg("Request is above the maximum")]
    RequestTooLarge,
    #[msg("Invalid request status")]
    InvalidRequestStatus,
    #[msg("Queue order violation")]
    QueueOrderViolation,
    #[msg("Adapter is not whitelisted")]
    AdapterNotWhitelisted,
    #[msg("Adapter cap exceeded")]
    AdapterCapExceeded,
    /// `allocate` would leave less than `min_settlement_bps` of stable assets
    /// in `reserve_mint` (ADR 0018). Same code as the former
    /// `TesouroShareCapExceeded`.
    #[msg("Allocation would breach the settlement-token floor")]
    SettlementFloorBreached,
    #[msg("Operation worsens coverage")]
    WorsensCoverage,
    #[msg("Post-CPI check failed")]
    PostCpiCheckFailed,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Feature not supported by this program version")]
    FeatureNotSupported,
    #[msg("Invalid treasury account")]
    InvalidTreasuryAccount,
    #[msg("A claim notice is pending")]
    ClaimNoticePending,
    #[msg("Claim notice is not resolved")]
    NoticeNotResolved,
    #[msg("Unsupported account version or status")]
    UnsupportedVersion,
    #[msg("Income source is not the reserve's income inbox")]
    InvalidIncomeSource,
    #[msg("Amount exceeds the income inbox balance")]
    IncomeExceedsInbox,
    #[msg("Token program is not the reserve's token program")]
    InvalidTokenProgram,
}
