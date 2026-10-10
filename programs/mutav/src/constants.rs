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
// `"agency"` was the seed of `AgencyExposure`, retired with the per-agency
// cap before the freeze (ADR 0019). Never reuse it: see `RETIRED_SEEDS`.

/// `IncomeReceipt` of a guarantee fee: `["fee", config, invoice_ref_hash]`
/// (spec §3.14, ADR 0019).
pub const FEE_SEED: &[u8] = b"fee";
/// `IncomeReceipt` of an issuer statement: `["income", config,
/// income_ref_hash]` (spec §3.14, ADR 0017).
pub const INCOME_SEED: &[u8] = b"income";

// `"payout"` was the seed of `Payout`, merged into `ClaimFiling` before the
// freeze (ADR 0019). Never reuse it: see `RETIRED_SEEDS`.

/// The `unsolicited` token account (BRS): `["unsolicited", config]`
/// (ADR 0019). Holds money sent to the reserve unasked until the reserve
/// admin books or returns it. The seed is reserved now; the account is
/// created by a later change.
pub const UNSOLICITED_SEED: &[u8] = b"unsolicited";

/// `ClaimFiling`: `["claim", guarantee, notice_ref_hash]` (spec §3.6).
pub const CLAIM_SEED: &[u8] = b"claim";

/// `DepositRequest`: `["deposit", config, seq]`, `seq` as `u64` LE (spec §3.8).
pub const DEPOSIT_SEED: &[u8] = b"deposit";
/// `RedeemRequest`: `["redeem", config, seq]`, `seq` as `u64` LE (spec §3.8).
pub const REDEEM_SEED: &[u8] = b"redeem";
// `"holder"` was the seed of `HolderState`, retired before the freeze
// (ADR 0019). Never reuse it: see `RETIRED_SEEDS`.

/// Seed prefixes reserved for later PDAs (spec §14.2). No pilot PDA may use
/// them: phase 2's instant exit, the per-adapter `AdapterState` at
/// `["adapter_state", config, adapter_program_id]` (ADR 0018), built with the
/// first adapter upgrade, and the claim notice (`["notice", guarantee,
/// notice_ref_hash]`), built with the claim-notice gate.
pub const RESERVED_SEED_PREFIXES: [&[u8]; 5] = [
    b"exit_buffer",
    b"exit_limit",
    b"instant_exit",
    b"adapter_state",
    b"notice",
];

/// Seeds of PDAs retired before the freeze (ADR 0019). No PDA may ever use
/// them again, so a stale client can never address a new account by mistake.
pub const RETIRED_SEEDS: [&[u8]; 3] = [b"agency", b"payout", b"holder"];

// ---------------------------------------------------------------------------
// Program constants (spec §8, §14).
// ---------------------------------------------------------------------------

/// Layout version written by `init` and accepted by this binary (spec §14.2 R1b).
pub const PROGRAM_LAYOUT_VERSION: u8 = 1;

/// Most adapters one reserve may whitelist: the width of
/// `VaultConfig.adapter_bitmap` (ADR 0018, ADR 0019).
pub const MAX_ADAPTERS: u8 = 8;

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

/// Scale of `nav_per_share`, `nav_at_fulfil` and `nav_at_fill`: BRS base units per share base
/// unit, times `10^9`, so `NAV_SCALE` is NAV 1.0 (spec §8, decided 2026-10-06).
pub const NAV_SCALE: u64 = 1_000_000_000;

/// Length of the claim-payment window in days (ADR 0019): `pay_claim` keeps
/// the payments of the last `CLAIM_WINDOW_DAYS` UTC days, one bucket per day,
/// within `caps.max_claim_per_period`.
pub const CLAIM_WINDOW_DAYS: usize = 31;
/// Seconds per day of the claim window.
pub const SECONDS_PER_DAY: i64 = 86_400;

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

/// `ClaimFiling.leg` (spec §3.6).
pub const LEG_DEFAULT: u8 = 0;
pub const LEG_EXIT: u8 = 1;

/// `ClaimFiling.status` (spec §3.6).
pub const CLAIM_FILED: u8 = 0;
pub const CLAIM_PAID: u8 = 1;
/// Reserved for the claim withdrawal of a later upgrade (ADR 0019). Not
/// written or accepted by this binary.
pub const CLAIM_WITHDRAWN: u8 = 2;
/// Paid and settled by PIX (`settle_payout`). Terminal.
pub const CLAIM_SETTLED: u8 = 3;

/// `IncomeReceipt.kind` (ADR 0019).
pub const INCOME_KIND_NORA_STATEMENT: u8 = 0;
pub const INCOME_KIND_FEE: u8 = 1;
/// Reserved for the unsolicited-funds instructions of a later upgrade.
pub const INCOME_KIND_UNSOLICITED: u8 = 2;
/// Reserved for MUTAV backstop contributions booked in a later upgrade.
pub const INCOME_KIND_BACKSTOP: u8 = 3;

/// `DepositRequest.status` (spec §3.8).
pub const DEPOSIT_PENDING: u8 = 0;
pub const DEPOSIT_FULFILLED: u8 = 1;

/// `RedeemRequest.status` (spec §3.8).
pub const REDEEM_PENDING: u8 = 0;
pub const REDEEM_FILLED: u8 = 1;

// ---------------------------------------------------------------------------
// Pinned account sizes, discriminator included (spec §14.2 R7). Asserted
// against `8 + INIT_SPACE` in `state/`.
// ---------------------------------------------------------------------------

pub const VAULT_CONFIG_SIZE: usize = 1_181;
pub const VAULT_STATE_SIZE: usize = 688;
pub const GUARANTEE_SIZE: usize = 377;
pub const CLAIM_FILING_SIZE: usize = 380;
pub const DEPOSIT_REQUEST_SIZE: usize = 155;
pub const REDEEM_REQUEST_SIZE: usize = 155;
pub const INCOME_RECEIPT_SIZE: usize = 143;

// ---------------------------------------------------------------------------
// `ConfigUpdated.field` ids (spec §9). Append-only. Top-level fields use
// 1..99 and `Caps` 100..199, so fields carved later from each `_reserved` get
// ids in their own range. `version`, `bump`, `authority_bump` and `_reserved`
// are bookkeeping, not configuration, and have no id. Retired ids are listed
// in `RETIRED_FIELD_IDS` and are never reused.
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
    pub const PAUSED: u16 = 14;
    pub const FEATURE_FLAGS: u16 = 15;
    pub const MUTAV_CAPITAL_WALLET: u16 = 16;

    pub const CAPS_MAX_TVL: u16 = 100;
    pub const CAPS_MAX_COVER_PER_GUARANTEE: u16 = 101;
    pub const CAPS_MAX_CLAIM_PER_CALL: u16 = 103;
    pub const CAPS_MAX_CLAIM_PER_PERIOD: u16 = 104;
    pub const CAPS_MIN_REQUEST: u16 = 107;
    pub const CAPS_MAX_REQUEST: u16 = 108;

    /// `caps.max_nav_move_bps`. Keeps the id it had as
    /// `price.max_nav_move_bps` before the price parameters were retired
    /// (ADR 0019): same field, same meaning.
    pub const MAX_NAV_MOVE_BPS: u16 = 206;
}

/// `ConfigUpdated` field ids of fields retired before the freeze (ADR 0019).
/// No field may ever take one of them: 13 `payout_sla_secs`, 17
/// `income_take_bps`, 102 `caps.max_cover_per_agency`, 106
/// `caps.min_settlement_bps`, 105 `caps.claim_period_secs`, 109
/// `caps.min_fill_assets`, 200–205 the TESOURO
/// price parameters, 300–319 the phase-2 exit parameters.
pub const RETIRED_FIELD_IDS: &[u16] = &[
    13, 17, 102, 105, 106, 109, 200, 201, 202, 203, 204, 205, 300, 301, 302, 303, 304, 305, 306,
    307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319,
];

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
    f(field::PAUSED, "paused"),
    f(field::FEATURE_FLAGS, "feature_flags"),
    f(field::MUTAV_CAPITAL_WALLET, "mutav_capital_wallet"),
    f(field::CAPS_MAX_TVL, "caps.max_tvl"),
    f(
        field::CAPS_MAX_COVER_PER_GUARANTEE,
        "caps.max_cover_per_guarantee",
    ),
    f(field::CAPS_MAX_CLAIM_PER_CALL, "caps.max_claim_per_call"),
    f(
        field::CAPS_MAX_CLAIM_PER_PERIOD,
        "caps.max_claim_per_period",
    ),
    f(field::CAPS_MIN_REQUEST, "caps.min_request"),
    f(field::CAPS_MAX_REQUEST, "caps.max_request"),
    f(field::MAX_NAV_MOVE_BPS, "caps.max_nav_move_bps"),
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
    fn retired_field_ids_are_never_reused() {
        for f in CONFIG_FIELDS {
            assert!(
                !RETIRED_FIELD_IDS.contains(&f.id),
                "{} reuses a retired id",
                f.name
            );
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
            FEE_SEED,
            INCOME_SEED,
            UNSOLICITED_SEED,
            GUARANTEE_SEED,
            CLAIM_SEED,
        ];
        for seed in pilot {
            for retired in RETIRED_SEEDS {
                assert!(
                    !seed.starts_with(retired) && !retired.starts_with(seed),
                    "{:?} collides with retired {:?}",
                    std::str::from_utf8(seed),
                    std::str::from_utf8(retired)
                );
            }
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
            [
                &b"exit_buffer"[..],
                b"exit_limit",
                b"instant_exit",
                b"adapter_state",
                b"notice"
            ]
        );
    }

    #[test]
    fn instant_exit_is_not_supported_in_the_pilot() {
        assert_eq!(SUPPORTED_FEATURES & INSTANT_EXIT, 0);
    }
}
