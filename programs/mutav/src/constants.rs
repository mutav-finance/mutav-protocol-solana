//! PDA seeds, program constants and the `ConfigUpdated` field-id table.
//!
//! Every value here is part of the frozen pilot layout (spec §14.2). Seeds and
//! field ids are append-only: never renumber or reuse one.

// ---------------------------------------------------------------------------
// PDA seeds (spec §3). Every PDA except `VaultConfig` includes the config key.
// ---------------------------------------------------------------------------

/// `VaultConfig`: `["config", reserve_mint]`.
pub const CONFIG_SEED: &[u8] = b"config";
/// `VaultState`: `["state", config]`.
pub const STATE_SEED: &[u8] = b"state";
/// Vault authority (no data): `["authority", config]`. Owns every reserve
/// token account and is the share mint's mint and freeze authority.
pub const AUTHORITY_SEED: &[u8] = b"authority";
/// Share mint: `["share_mint", config]`.
pub const SHARE_MINT_SEED: &[u8] = b"share_mint";
/// Liquid reserve (BRS): `["reserve", config]`.
pub const RESERVE_SEED: &[u8] = b"reserve";
/// Escrowed deposit requests (BRS): `["pending_deposits", config]`.
pub const PENDING_DEPOSITS_SEED: &[u8] = b"pending_deposits";
/// Escrowed redeem requests (shares): `["pending_redemptions", config]`.
pub const PENDING_REDEMPTIONS_SEED: &[u8] = b"pending_redemptions";
/// Assets owed on fulfilled redemptions (BRS): `["claims", config]`.
pub const CLAIMS_SEED: &[u8] = b"claims";

/// `Guarantee`: `["guarantee", config, id]` (spec §3.5).
pub const GUARANTEE_SEED: &[u8] = b"guarantee";
/// `AgencyExposure`: `["agency", config, agency_id]` (spec §3.4).
pub const AGENCY_SEED: &[u8] = b"agency";

/// `FeeReceipt`: `["fee", config, invoice_ref_hash]` (spec §3.11).
pub const FEE_SEED: &[u8] = b"fee";

/// `ClaimFiling`: `["claim", guarantee, notice_ref_hash]` (spec §3.6).
pub const CLAIM_SEED: &[u8] = b"claim";
/// `Payout`: `["payout", guarantee, notice_ref_hash]` (spec §3.7).
pub const PAYOUT_SEED: &[u8] = b"payout";

/// `DepositRequest`: `["deposit", config, seq]`, `seq` as `u64` LE (spec §3.8).
pub const DEPOSIT_SEED: &[u8] = b"deposit";
/// `RedeemRequest`: `["redeem", config, seq]`, `seq` as `u64` LE (spec §3.8).
pub const REDEEM_SEED: &[u8] = b"redeem";
/// `HolderState`: `["holder", config, owner]` (spec §3.10).
pub const HOLDER_SEED: &[u8] = b"holder";

/// Seed prefixes reserved for phase 2 (spec §14.2). No pilot PDA may use them.
/// (`"notice"` is used by the pilot `ClaimNotice`.)
pub const RESERVED_SEED_PREFIXES: [&[u8]; 3] = [b"exit_buffer", b"exit_limit", b"instant_exit"];

// ---------------------------------------------------------------------------
// Program constants (spec §8, §14).
// ---------------------------------------------------------------------------

/// Layout version written by `init` and accepted by this binary (spec §14.2 R1b).
pub const PROGRAM_LAYOUT_VERSION: u8 = 1;

/// Size of `VaultConfig.adapters`. Sizes `VaultConfig`; decided 2026-10-06
/// (spec §12 Q33).
pub const MAX_ADAPTERS: usize = 8;

/// `10_000` basis points = 100%.
pub const BPS_DENOMINATOR: u16 = 10_000;

/// Program maximum for `fee_take_bps` (30%).
pub const MAX_FEE_TAKE_BPS: u16 = 3_000;

/// Program minimum for `coverage_ratio_bps` (c ≥ 0.10; ADR 0016).
pub const MIN_COVERAGE_RATIO_BPS: u16 = 1_000;

/// Share mint decimals (spec Conventions).
pub const SHARE_DECIMALS: u8 = 6;

/// Exponent `k` of the share-conversion virtual offset `V = 10^k` (spec §4).
/// Decided 2026-10-06 (spec §12 Q20): `k = 0`, so one share is worth 1 BRS at
/// launch (both mints have 6 decimals). No seed deposit is minted at
/// `initialize`.
pub const VIRTUAL_OFFSET_EXP: u32 = 0;
/// The virtual offset `V = 10^k` (spec §4).
pub const VIRTUAL_OFFSET: u64 = 10u64.pow(VIRTUAL_OFFSET_EXP);

/// Scale of `VaultState.tesouro_price` and every bounded TESOURO price: BRS
/// base units per TESOURO base unit, times `10^9` (spec §8, decided 2026-10-06).
pub const PRICE_SCALE: u64 = 1_000_000_000;
/// Scale of `nav_per_share` and `last_fill_nav`: BRS base units per share base
/// unit, times `10^9`, so `NAV_SCALE` is NAV 1.0 (spec §8, decided 2026-10-06).
pub const NAV_SCALE: u64 = 1_000_000_000;

/// Most `RedeemRequest` accounts one `fulfil_redeems` call may fill (spec §8).
// TODO(plan: Task 10 — pin from a Mollusk benchmark of `fulfil_redeems`
// through a Squads vault transaction; skipped for the hackathon build).
// Conservative until then; `tests/tests/compute.rs` checks that a full batch
// of whole fills fits the default 200k CU in LiteSVM.
pub const MAX_FULFIL_BATCH: u8 = 8;

/// Deepest allowlist Merkle proof accepted (2^32 leaves).
pub const MAX_ALLOWLIST_PROOF_LEN: usize = 32;

/// `feature_flags` bit 0: phase-2 instant exit (spec §14.3).
pub const INSTANT_EXIT: u64 = 1 << 0;
/// Feature bits this binary supports. The pilot supports none.
pub const SUPPORTED_FEATURES: u64 = 0;

// Statuses, legs and modes are `u8` constants, never Borsh enums (spec §14.2
// R2). A value this binary does not know fails closed with `UnsupportedVersion`.

/// `VaultState.mode` (spec §3.2, §6).
pub const MODE_NORMAL: u8 = 0;
pub const MODE_UNDER_COVERED: u8 = 1;

/// `Guarantee.status` (spec §3.5).
pub const GUARANTEE_ACTIVE: u8 = 0;
pub const GUARANTEE_CLOSED: u8 = 1;

/// `ClaimFiling.leg` / `Payout.leg` (spec §3.6).
pub const LEG_DEFAULT: u8 = 0;
pub const LEG_EXIT: u8 = 1;

/// `ClaimFiling.status` (spec §3.6).
pub const CLAIM_FILED: u8 = 0;
pub const CLAIM_PAID: u8 = 1;

/// `Payout.status` (spec §3.7).
pub const PAYOUT_PENDING: u8 = 0;
pub const PAYOUT_SETTLED: u8 = 1;

/// `DepositRequest.status` (spec §3.8).
pub const DEPOSIT_PENDING: u8 = 0;
pub const DEPOSIT_FULFILLED: u8 = 1;

/// `RedeemRequest.status` (spec §3.8).
pub const REDEEM_PENDING: u8 = 0;
pub const REDEEM_PARTIALLY_FILLED: u8 = 1;
pub const REDEEM_FILLED: u8 = 2;
pub const REDEEM_CANCELLED: u8 = 3;

/// `ClaimNoticeClosed.reason` (spec §9).
pub const NOTICE_CLOSED_PAID: u8 = 0;
pub const NOTICE_CLOSED_FULLY_PROVISIONED: u8 = 1;
pub const NOTICE_CLOSED_WITHDRAWN: u8 = 2;

// ---------------------------------------------------------------------------
// Pinned account sizes, discriminator included (spec §14.2 R7). Asserted
// against `8 + INIT_SPACE` in `state/`.
// ---------------------------------------------------------------------------

pub const VAULT_CONFIG_SIZE: usize = 2_756;
pub const VAULT_STATE_SIZE: usize = 480;
pub const GUARANTEE_SIZE: usize = 249;
pub const AGENCY_EXPOSURE_SIZE: usize = 126;
pub const FEE_RECEIPT_SIZE: usize = 138;
pub const CLAIM_FILING_SIZE: usize = 156;
pub const PAYOUT_SIZE: usize = 229;
pub const DEPOSIT_REQUEST_SIZE: usize = 155;
pub const REDEEM_REQUEST_SIZE: usize = 181;
pub const HOLDER_STATE_SIZE: usize = 114;

// ---------------------------------------------------------------------------
// `ConfigUpdated.field` ids (spec §9). Append-only. Top-level fields use
// 1..99, `Caps` 100..199, `PriceParams` 200..299, `ExitParams` 300..399, so
// fields carved later from each nested `_reserved` get ids in their own range.
// `version`, `bump`, `authority_bump` and `_reserved` are bookkeeping, not
// configuration, and have no id. Adapter entries are reported by
// `AdapterWhitelisted` / `AdapterRemoved` (and `Allocated` / `Deallocated`).
// ---------------------------------------------------------------------------

pub mod field {
    pub const ADMIN: u16 = 1;
    pub const OPERATOR: u16 = 2;
    pub const PAUSER: u16 = 3;
    pub const RESERVE_MINT: u16 = 4;
    pub const RESERVE_TOKEN_PROGRAM: u16 = 5;
    pub const RESERVE_DECIMALS: u16 = 6;
    pub const SHARE_MINT: u16 = 7;
    pub const COVERAGE_RATIO_BPS: u16 = 8;
    pub const FEE_TAKE_BPS: u16 = 9;
    pub const PAYMENTS_ACCOUNT: u16 = 10;
    pub const TREASURY_ACCOUNT: u16 = 11;
    pub const INVESTOR_ALLOWLIST_ROOT: u16 = 12;
    pub const PAYOUT_SLA_SECS: u16 = 13;
    pub const PAUSED: u16 = 14;
    pub const FEATURE_FLAGS: u16 = 15;
    pub const MUTAV_CAPITAL_WALLET: u16 = 16;

    pub const CAPS_MAX_TVL: u16 = 100;
    pub const CAPS_MAX_COVER_PER_GUARANTEE: u16 = 101;
    pub const CAPS_MAX_COVER_PER_AGENCY: u16 = 102;
    pub const CAPS_MAX_CLAIM_PER_CALL: u16 = 103;
    pub const CAPS_MAX_CLAIM_PER_PERIOD: u16 = 104;
    pub const CAPS_CLAIM_PERIOD_SECS: u16 = 105;
    pub const CAPS_MAX_TESOURO_SHARE_BPS: u16 = 106;
    pub const CAPS_MIN_REQUEST: u16 = 107;
    pub const CAPS_MAX_REQUEST: u16 = 108;
    pub const CAPS_MIN_FILL_ASSETS: u16 = 109;

    pub const PRICE_TESOURO_PRICE_ACCOUNT: u16 = 200;
    pub const PRICE_P0: u16 = 201;
    pub const PRICE_T0: u16 = 202;
    pub const PRICE_Y_MAX_BPS: u16 = 203;
    pub const PRICE_MAX_STALENESS_SECS: u16 = 204;
    pub const PRICE_MAX_DEVIATION_BPS: u16 = 205;
    pub const PRICE_MAX_NAV_MOVE_BPS: u16 = 206;

    pub const EXIT_BUFFER_TARGET_BPS: u16 = 300;
    pub const EXIT_BUFFER_HEADROOM_BPS: u16 = 301;
    pub const EXIT_BUFFER_RELEASE_AFTER_SECS: u16 = 302;
    pub const EXIT_CURVE_VERSION: u16 = 303;
    pub const EXIT_H_MIN_BPS: u16 = 304;
    pub const EXIT_H_PEG_BPS: u16 = 305;
    pub const EXIT_H_MAX_BPS: u16 = 306;
    pub const EXIT_PRESSURE_EPOCH_SECS: u16 = 307;
    pub const EXIT_MIN_INSTANT_ASSETS: u16 = 308;
    pub const EXIT_MAX_INSTANT_PER_TX: u16 = 309;
    pub const EXIT_MAX_INSTANT_PER_WALLET: u16 = 310;
    pub const EXIT_MAX_INSTANT_PER_PERIOD: u16 = 311;
    pub const EXIT_INSTANT_PERIOD_SECS: u16 = 312;
    pub const EXIT_MIN_HOLD_SECS: u16 = 313;
    pub const EXIT_MAX_PRICE_AGE_SECS: u16 = 314;
    pub const EXIT_ALLOWLIST_ROOT: u16 = 315;
    /// `exit.barred[i]` has id `EXIT_BARRED_0 + i`.
    pub const EXIT_BARRED_0: u16 = 316;
}

/// One row of the field-id table.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ConfigField {
    pub id: u16,
    pub name: &'static str,
    /// `false` for fields no instruction can change (fixed at `initialize`).
    pub mutable: bool,
}

const fn f(id: u16, name: &'static str) -> ConfigField {
    ConfigField {
        id,
        name,
        mutable: true,
    }
}

const fn fixed(id: u16, name: &'static str) -> ConfigField {
    ConfigField {
        id,
        name,
        mutable: false,
    }
}

/// Every `VaultConfig` field with a `ConfigUpdated` id. Tests walk this table
/// and assert each mutable field has an event path.
pub const CONFIG_FIELDS: &[ConfigField] = &[
    // `admin` is the Squads vault address; membership changes inside Squads
    // keep the address, so no instruction changes it.
    fixed(field::ADMIN, "admin"),
    f(field::OPERATOR, "operator"),
    f(field::PAUSER, "pauser"),
    fixed(field::RESERVE_MINT, "reserve_mint"),
    fixed(field::RESERVE_TOKEN_PROGRAM, "reserve_token_program"),
    fixed(field::RESERVE_DECIMALS, "reserve_decimals"),
    fixed(field::SHARE_MINT, "share_mint"),
    f(field::COVERAGE_RATIO_BPS, "coverage_ratio_bps"),
    f(field::FEE_TAKE_BPS, "fee_take_bps"),
    f(field::PAYMENTS_ACCOUNT, "payments_account"),
    f(field::TREASURY_ACCOUNT, "treasury_account"),
    f(field::INVESTOR_ALLOWLIST_ROOT, "investor_allowlist_root"),
    f(field::PAYOUT_SLA_SECS, "payout_sla_secs"),
    f(field::PAUSED, "paused"),
    f(field::FEATURE_FLAGS, "feature_flags"),
    f(field::MUTAV_CAPITAL_WALLET, "mutav_capital_wallet"),
    f(field::CAPS_MAX_TVL, "caps.max_tvl"),
    f(
        field::CAPS_MAX_COVER_PER_GUARANTEE,
        "caps.max_cover_per_guarantee",
    ),
    f(
        field::CAPS_MAX_COVER_PER_AGENCY,
        "caps.max_cover_per_agency",
    ),
    f(field::CAPS_MAX_CLAIM_PER_CALL, "caps.max_claim_per_call"),
    f(
        field::CAPS_MAX_CLAIM_PER_PERIOD,
        "caps.max_claim_per_period",
    ),
    f(field::CAPS_CLAIM_PERIOD_SECS, "caps.claim_period_secs"),
    f(
        field::CAPS_MAX_TESOURO_SHARE_BPS,
        "caps.max_tesouro_share_bps",
    ),
    f(field::CAPS_MIN_REQUEST, "caps.min_request"),
    f(field::CAPS_MAX_REQUEST, "caps.max_request"),
    f(field::CAPS_MIN_FILL_ASSETS, "caps.min_fill_assets"),
    f(
        field::PRICE_TESOURO_PRICE_ACCOUNT,
        "price.tesouro_price_account",
    ),
    f(field::PRICE_P0, "price.p0"),
    f(field::PRICE_T0, "price.t0"),
    f(field::PRICE_Y_MAX_BPS, "price.y_max_bps"),
    f(field::PRICE_MAX_STALENESS_SECS, "price.max_staleness_secs"),
    f(field::PRICE_MAX_DEVIATION_BPS, "price.max_deviation_bps"),
    f(field::PRICE_MAX_NAV_MOVE_BPS, "price.max_nav_move_bps"),
    f(field::EXIT_BUFFER_TARGET_BPS, "exit.buffer_target_bps"),
    f(field::EXIT_BUFFER_HEADROOM_BPS, "exit.buffer_headroom_bps"),
    f(
        field::EXIT_BUFFER_RELEASE_AFTER_SECS,
        "exit.buffer_release_after_secs",
    ),
    f(field::EXIT_CURVE_VERSION, "exit.curve_version"),
    f(field::EXIT_H_MIN_BPS, "exit.h_min_bps"),
    f(field::EXIT_H_PEG_BPS, "exit.h_peg_bps"),
    f(field::EXIT_H_MAX_BPS, "exit.h_max_bps"),
    f(field::EXIT_PRESSURE_EPOCH_SECS, "exit.pressure_epoch_secs"),
    f(field::EXIT_MIN_INSTANT_ASSETS, "exit.min_instant_assets"),
    f(field::EXIT_MAX_INSTANT_PER_TX, "exit.max_instant_per_tx"),
    f(
        field::EXIT_MAX_INSTANT_PER_WALLET,
        "exit.max_instant_per_wallet",
    ),
    f(
        field::EXIT_MAX_INSTANT_PER_PERIOD,
        "exit.max_instant_per_period",
    ),
    f(field::EXIT_INSTANT_PERIOD_SECS, "exit.instant_period_secs"),
    f(field::EXIT_MIN_HOLD_SECS, "exit.min_hold_secs"),
    f(field::EXIT_MAX_PRICE_AGE_SECS, "exit.max_price_age_secs"),
    f(field::EXIT_ALLOWLIST_ROOT, "exit.allowlist_root"),
    f(field::EXIT_BARRED_0, "exit.barred[0]"),
    f(field::EXIT_BARRED_0 + 1, "exit.barred[1]"),
    f(field::EXIT_BARRED_0 + 2, "exit.barred[2]"),
    f(field::EXIT_BARRED_0 + 3, "exit.barred[3]"),
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn field_ids_are_unique() {
        for (i, a) in CONFIG_FIELDS.iter().enumerate() {
            for b in &CONFIG_FIELDS[i + 1..] {
                assert_ne!(a.id, b.id, "{} and {} share an id", a.name, b.name);
            }
        }
    }

    #[test]
    fn pilot_seeds_avoid_reserved_prefixes() {
        let pilot = [
            CONFIG_SEED,
            STATE_SEED,
            AUTHORITY_SEED,
            SHARE_MINT_SEED,
            RESERVE_SEED,
            PENDING_DEPOSITS_SEED,
            PENDING_REDEMPTIONS_SEED,
            CLAIMS_SEED,
            DEPOSIT_SEED,
            REDEEM_SEED,
            HOLDER_SEED,
        ];
        for seed in pilot {
            for reserved in RESERVED_SEED_PREFIXES {
                assert!(
                    !seed.starts_with(reserved) && !reserved.starts_with(seed),
                    "{:?} collides with reserved {:?}",
                    std::str::from_utf8(seed),
                    std::str::from_utf8(reserved)
                );
            }
        }
        assert_eq!(
            RESERVED_SEED_PREFIXES,
            [&b"exit_buffer"[..], b"exit_limit", b"instant_exit"]
        );
    }

    #[test]
    fn instant_exit_is_not_supported_in_the_pilot() {
        assert_eq!(SUPPORTED_FEATURES & INSTANT_EXIT, 0);
    }
}
