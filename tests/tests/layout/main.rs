//! Layout stability (spec §14.2, §14.7; plan Task 2a).
//!
//! - `v1`: frozen pilot structs and golden field-offset tables.
//! - `v2_carve`: a test-only phase-2 `VaultState` with `InstantExitState`
//!   carved from `_reserved`.
//!
//! `main.rs` holds the shared machinery and the tests that compare the
//! current program structs with the frozen v1 copies and the committed
//! fixtures in `tests/fixtures/layout/v1/`.

mod book;
mod capital;
mod v1;
mod v2_carve;

use std::path::PathBuf;

use anchor_lang::{
    prelude::Pubkey, AccountDeserialize, AnchorDeserialize, AnchorSerialize, Discriminator, Space,
};
use mutav::{
    constants::*,
    state::{AdapterEntry, Caps, ExitParams, PriceParams, VaultConfig, VaultState},
};
use mutav_tests::helpers::*;
use v1::*;

// ---------------------------------------------------------------------------
// Machinery
// ---------------------------------------------------------------------------

/// All-ones value of a field, used to find where the field's bytes are.
pub trait Sentinel {
    fn sentinel() -> Self;
}
macro_rules! sentinel_int {
    ($($t:ty),*) => {$(impl Sentinel for $t { fn sentinel() -> Self { !0 } })*};
}
sentinel_int!(u8, u16, u32, u64, i64);
impl Sentinel for bool {
    fn sentinel() -> Self {
        true
    }
}
impl Sentinel for Pubkey {
    fn sentinel() -> Self {
        Pubkey::new_from_array([0xff; 32])
    }
}
impl<T: Sentinel + Copy, const N: usize> Sentinel for [T; N] {
    fn sentinel() -> Self {
        [T::sentinel(); N]
    }
}

pub fn ser<T: AnchorSerialize>(x: &T) -> Vec<u8> {
    let mut v = Vec::new();
    x.serialize(&mut v).unwrap();
    v
}

/// `T` decoded from zero bytes.
pub fn zeroed<T: AnchorDeserialize>() -> T {
    T::deserialize(&mut &[0u8; 4096][..]).unwrap()
}

/// `(offset, size)` of the bytes `set` changes in a zeroed `T`.
pub fn span<T: AnchorSerialize + AnchorDeserialize>(set: impl Fn(&mut T)) -> (usize, usize) {
    let base = ser(&zeroed::<T>());
    let mut x = zeroed::<T>();
    set(&mut x);
    let after = ser(&x);
    assert_eq!(base.len(), after.len());
    let first = (0..base.len()).find(|i| base[*i] != after[*i]).unwrap();
    let last = (0..base.len()).rfind(|i| base[*i] != after[*i]).unwrap();
    (first, last - first + 1)
}

/// `(name, offset, size)` for each listed field path of `$t`.
#[macro_export]
macro_rules! spans {
    ($t:ty; $($name:literal => $($f:ident).+ $([$i:literal] $(.$g:ident)+)?),* $(,)?) => {
        vec![$({
            let (o, n) = $crate::span::<$t>(|x| {
                x.$($f).+ $([$i] $(.$g)+)? = $crate::Sentinel::sentinel();
            });
            ($name, o, n)
        }),*]
    };
}

macro_rules! vault_state_fields {
    ($t:ty) => {
        spans!($t;
            "version" => version, "bump" => bump, "mode" => mode,
            "brs_balance" => brs_balance, "tesouro_units" => tesouro_units,
            "tesouro_price" => tesouro_price, "tesouro_price_ts" => tesouro_price_ts,
            "stable_assets" => stable_assets,
            "remaining_cover_total" => remaining_cover_total,
            "coverage_required" => coverage_required, "provisions" => provisions,
            "shares_outstanding" => shares_outstanding, "nav_per_share" => nav_per_share,
            "pending_deposits_total" => pending_deposits_total,
            "pending_redeem_shares" => pending_redeem_shares,
            "claimable_assets_total" => claimable_assets_total,
            "buffer_earmark" => buffer_earmark, "pending_notices" => pending_notices,
            "active_guarantees" => active_guarantees,
            "next_deposit_seq" => next_deposit_seq, "deposit_head" => deposit_head,
            "next_redeem_seq" => next_redeem_seq, "redeem_head" => redeem_head,
            "claim_period_start" => claim_period_start,
            "claim_period_paid" => claim_period_paid, "fees_in_total" => fees_in_total,
            "fee_take_total" => fee_take_total, "claims_paid_total" => claims_paid_total,
            "late_payouts" => late_payouts, "fulfil_halted" => fulfil_halted,
            "last_refresh_ts" => last_refresh_ts, "last_refresh_slot" => last_refresh_slot,
        )
    };
}
pub(crate) use vault_state_fields;

macro_rules! vault_config_fields {
    ($t:ty) => {
        spans!($t;
            "version" => version, "bump" => bump, "authority_bump" => authority_bump,
            "admin" => admin, "operator" => operator, "pauser" => pauser,
            "reserve_mint" => reserve_mint, "reserve_token_program" => reserve_token_program,
            "reserve_decimals" => reserve_decimals, "share_mint" => share_mint,
            "coverage_ratio_bps" => coverage_ratio_bps, "fee_take_bps" => fee_take_bps,
            "payments_account" => payments_account, "treasury_account" => treasury_account,
            "investor_allowlist_root" => investor_allowlist_root,
            "adapters[0].program_id" => adapters[0].program_id,
            "adapters[7]._reserved" => adapters[7]._reserved,
            "caps.max_tvl" => caps.max_tvl, "caps._reserved" => caps._reserved,
            "price.tesouro_price_account" => price.tesouro_price_account,
            "price._reserved" => price._reserved,
            "payout_sla_secs" => payout_sla_secs, "paused" => paused,
            "feature_flags" => feature_flags, "mutav_capital_wallet" => mutav_capital_wallet,
            "exit.buffer_target_bps" => exit.buffer_target_bps,
            "exit._reserved" => exit._reserved,
            "_reserved" => _reserved,
        )
    };
}

macro_rules! caps_fields {
    ($t:ty) => {
        spans!($t;
            "max_tvl" => max_tvl, "max_cover_per_guarantee" => max_cover_per_guarantee,
            "max_cover_per_agency" => max_cover_per_agency,
            "max_claim_per_call" => max_claim_per_call,
            "max_claim_per_period" => max_claim_per_period,
            "claim_period_secs" => claim_period_secs,
            "max_tesouro_share_bps" => max_tesouro_share_bps,
            "min_request" => min_request, "max_request" => max_request,
            "min_fill_assets" => min_fill_assets, "_reserved" => _reserved,
        )
    };
}

macro_rules! price_fields {
    ($t:ty) => {
        spans!($t;
            "tesouro_price_account" => tesouro_price_account, "p0" => p0, "t0" => t0,
            "y_max_bps" => y_max_bps, "max_staleness_secs" => max_staleness_secs,
            "max_deviation_bps" => max_deviation_bps, "max_nav_move_bps" => max_nav_move_bps,
            "_reserved" => _reserved,
        )
    };
}

macro_rules! exit_fields {
    ($t:ty) => {
        spans!($t;
            "buffer_target_bps" => buffer_target_bps,
            "buffer_headroom_bps" => buffer_headroom_bps,
            "buffer_release_after_secs" => buffer_release_after_secs,
            "curve_version" => curve_version, "h_min_bps" => h_min_bps,
            "h_peg_bps" => h_peg_bps, "h_max_bps" => h_max_bps,
            "pressure_epoch_secs" => pressure_epoch_secs,
            "min_instant_assets" => min_instant_assets,
            "max_instant_per_tx" => max_instant_per_tx,
            "max_instant_per_wallet" => max_instant_per_wallet,
            "max_instant_per_period" => max_instant_per_period,
            "instant_period_secs" => instant_period_secs, "min_hold_secs" => min_hold_secs,
            "max_price_age_secs" => max_price_age_secs, "allowlist_root" => allowlist_root,
            "barred" => barred, "_reserved" => _reserved,
        )
    };
}

macro_rules! adapter_fields {
    ($t:ty) => {
        spans!($t;
            "program_id" => program_id, "sub_authority" => sub_authority,
            "asset_mint" => asset_mint, "cap" => cap, "allocated" => allocated,
            "enabled" => enabled, "_reserved" => _reserved,
        )
    };
}

fn table(t: OffsetTable) -> Vec<(&'static str, usize, usize)> {
    t.to_vec()
}

/// Deterministic bytes where every byte differs from its neighbours; the
/// listed offsets are forced to `1` (Borsh `bool`s must be 0 or 1).
pub fn pattern(len: usize, bools: &[usize]) -> Vec<u8> {
    let mut v: Vec<u8> = (0..len).map(|i| (i * 31 + 7) as u8).collect();
    for b in bools {
        v[*b] = 1;
    }
    v
}

fn config_bools() -> Vec<usize> {
    let mut b: Vec<usize> = (0..MAX_ADAPTERS).map(|i| 296 + i * 177 + 112).collect();
    b.push(1920); // paused
    b
}

const STATE_BOOLS: &[usize] = &[199]; // fulfil_halted

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/layout/v1")
}

// ---------------------------------------------------------------------------
// Size pins (R7)
// ---------------------------------------------------------------------------

#[test]
fn sizes_are_pinned() {
    assert_eq!(8 + VaultConfig::INIT_SPACE, VAULT_CONFIG_SIZE);
    assert_eq!(8 + VaultState::INIT_SPACE, VAULT_STATE_SIZE);
    assert_eq!(VAULT_CONFIG_SIZE, 2_756);
    assert_eq!(VAULT_STATE_SIZE, 480);
    // Serialized length (current and v1) equals the allocation.
    assert_eq!(8 + ser(&zeroed::<VaultConfig>()).len(), VAULT_CONFIG_SIZE);
    assert_eq!(8 + ser(&zeroed::<VaultState>()).len(), VAULT_STATE_SIZE);
    assert_eq!(8 + ser(&zeroed::<VaultConfigV1>()).len(), VAULT_CONFIG_SIZE);
    assert_eq!(8 + ser(&zeroed::<VaultStateV1>()).len(), VAULT_STATE_SIZE);
    // Nested structs.
    assert_eq!(ser(&zeroed::<Caps>()).len(), 106);
    assert_eq!(ser(&zeroed::<PriceParams>()).len(), 94);
    assert_eq!(ser(&zeroed::<ExitParams>()).len(), 275);
    assert_eq!(ser(&zeroed::<AdapterEntry>()).len(), 177);
}

#[test]
fn allocations_match_the_pins() {
    let f = Fixture::new();
    assert_eq!(f.raw(&f.pdas.config).len(), VAULT_CONFIG_SIZE);
    assert_eq!(f.raw(&f.pdas.state).len(), VAULT_STATE_SIZE);
    // The decoded struct re-serializes to exactly the account bytes.
    let mut c = VaultConfig::DISCRIMINATOR.to_vec();
    c.extend(ser(&f.config()));
    assert_eq!(c, f.raw(&f.pdas.config));
    let mut s = VaultState::DISCRIMINATOR.to_vec();
    s.extend(ser(&f.state()));
    assert_eq!(s, f.raw(&f.pdas.state));
}

// ---------------------------------------------------------------------------
// Golden offsets
// ---------------------------------------------------------------------------

#[test]
fn v1_offset_tables_match_the_frozen_structs() {
    assert_eq!(vault_state_fields!(VaultStateV1), {
        let mut t = table(VAULT_STATE_V1);
        t.pop(); // `_reserved` is checked below
        t
    });
    assert_eq!(
        spans!(VaultStateV1; "_reserved" => _reserved),
        vec![*VAULT_STATE_V1.last().unwrap()]
    );
    assert_eq!(vault_config_fields!(VaultConfigV1), table(VAULT_CONFIG_V1));
    assert_eq!(caps_fields!(CapsV1), table(CAPS_V1));
    assert_eq!(price_fields!(PriceParamsV1), table(PRICE_PARAMS_V1));
    assert_eq!(exit_fields!(ExitParamsV1), table(EXIT_PARAMS_V1));
    assert_eq!(adapter_fields!(AdapterEntryV1), table(ADAPTER_ENTRY_V1));
}

#[test]
fn current_structs_keep_every_v1_offset() {
    let mut state = vault_state_fields!(VaultState);
    state.extend(spans!(VaultState; "_reserved" => _reserved));
    assert_eq!(state, table(VAULT_STATE_V1));
    assert_eq!(vault_config_fields!(VaultConfig), table(VAULT_CONFIG_V1));
    assert_eq!(caps_fields!(Caps), table(CAPS_V1));
    assert_eq!(price_fields!(PriceParams), table(PRICE_PARAMS_V1));
    assert_eq!(exit_fields!(ExitParams), table(EXIT_PARAMS_V1));
    assert_eq!(adapter_fields!(AdapterEntry), table(ADAPTER_ENTRY_V1));
}

#[test]
fn v1_bytes_decode_under_the_current_structs() {
    // Every byte distinct-ish, so a shifted field would read different bytes.
    let state = pattern(VAULT_STATE_SIZE - 8, STATE_BOOLS);
    let v1 = VaultStateV1::deserialize(&mut state.as_slice()).unwrap();
    assert_eq!(ser(&v1), state);
    let mut account = VaultState::DISCRIMINATOR.to_vec();
    account.extend(&state);
    let cur = VaultState::try_deserialize(&mut account.as_slice()).unwrap();
    assert_eq!(ser(&cur), state, "VaultState bytes moved");
    assert_eq!(cur.buffer_earmark, v1.buffer_earmark);
    assert_eq!(cur.pending_notices, v1.pending_notices);
    assert_eq!(cur.last_refresh_slot, v1.last_refresh_slot);

    let config = pattern(VAULT_CONFIG_SIZE - 8, &config_bools());
    let v1 = VaultConfigV1::deserialize(&mut config.as_slice()).unwrap();
    assert_eq!(ser(&v1), config);
    let mut account = VaultConfig::DISCRIMINATOR.to_vec();
    account.extend(&config);
    let cur = VaultConfig::try_deserialize(&mut account.as_slice()).unwrap();
    assert_eq!(ser(&cur), config, "VaultConfig bytes moved");
    assert_eq!(cur.feature_flags, v1.feature_flags);
    assert_eq!(cur.mutav_capital_wallet, v1.mutav_capital_wallet);
    assert_eq!(cur.exit.barred, v1.exit.barred);
    assert_eq!(cur.adapters[7].cap, v1.adapters[7].cap);
}

#[test]
fn account_discriminators_are_frozen() {
    // Renaming an account struct changes its discriminator (R5):
    // sha256("account:<Name>")[..8], committed.
    assert_eq!(
        VaultConfig::DISCRIMINATOR,
        &[99, 86, 43, 216, 184, 102, 119, 77]
    );
    assert_eq!(
        VaultState::DISCRIMINATOR,
        &[228, 196, 82, 165, 98, 210, 235, 152]
    );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/// Writes `tests/fixtures/layout/v1/{vault_config,vault_state}.bin` from a
/// reserve built by the pilot instructions. Run by hand after a layout-neutral
/// change to the fixture recipe:
/// `cargo test -p mutav-tests --test layout -- --ignored write_fixtures`.
/// Task 12 adds the live devnet dumps next to them.
#[test]
#[ignore]
fn write_fixtures() {
    let mut f = Fixture::new();
    for (name, ix, signer) in f.pilot_instructions() {
        f.send(ix, &signer)
            .unwrap_or_else(|e| panic!("{name}: {:?}", e.err));
    }
    std::fs::create_dir_all(fixtures_dir()).unwrap();
    std::fs::write(
        fixtures_dir().join("vault_config.bin"),
        f.raw(&f.pdas.config),
    )
    .unwrap();
    std::fs::write(fixtures_dir().join("vault_state.bin"), f.raw(&f.pdas.state)).unwrap();
}

#[test]
fn committed_fixtures_decode() {
    let mut seen = 0;
    for entry in std::fs::read_dir(fixtures_dir()).expect("fixtures dir") {
        let path = entry.unwrap().path();
        if path.extension().is_none_or(|e| e != "bin") {
            continue;
        }
        let bytes = std::fs::read(&path).unwrap();
        let name = path.display();
        let disc = &bytes[..8];
        if disc == VaultConfig::DISCRIMINATOR {
            assert_eq!(bytes.len(), VAULT_CONFIG_SIZE, "{name}");
            let c = VaultConfig::try_deserialize(&mut bytes.as_slice()).expect("decode");
            assert!(c.is_supported(), "{name}");
            assert_eq!(c.feature_flags, 0, "{name}");
            assert_eq!(ser(&c), bytes[8..], "{name}: round trip");
            VaultConfigV1::deserialize(&mut &bytes[8..]).expect("v1 decode");
        } else if disc == VaultState::DISCRIMINATOR {
            assert_eq!(bytes.len(), VAULT_STATE_SIZE, "{name}");
            let s = VaultState::try_deserialize(&mut bytes.as_slice()).expect("decode");
            assert!(s.is_supported(), "{name}");
            assert_eq!(s.buffer_earmark, 0, "{name}");
            assert_eq!(ser(&s), bytes[8..], "{name}: round trip");
            VaultStateV1::deserialize(&mut &bytes[8..]).expect("v1 decode");
        } else {
            panic!("{name}: unknown discriminator");
        }
        seen += 1;
    }
    assert!(seen >= 2, "expected the committed v1 fixtures");
}

// ---------------------------------------------------------------------------
// Fixed-size types only (R2)
// ---------------------------------------------------------------------------

/// Walks the IDL: every account field is an integer, `bool`, `pubkey`, a
/// fixed array, or a struct of those. No `option`, `vec`, `string`, `bytes`
/// or enums.
#[test]
fn accounts_use_fixed_size_types_only() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../target/idl/mutav.json");
    let idl: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(&path).expect("target/idl/mutav.json; run `anchor build`"),
    )
    .unwrap();
    let types = idl["types"].as_array().unwrap();

    fn check(ty: &serde_json::Value, at: &str, types: &[serde_json::Value]) {
        const OK: &[&str] = &["u8", "u16", "u32", "u64", "i64", "bool", "pubkey"];
        match ty {
            serde_json::Value::String(s) => {
                assert!(OK.contains(&s.as_str()), "{at}: type {s}");
            }
            serde_json::Value::Object(o) if o.contains_key("array") => {
                check(&o["array"][0], at, types);
            }
            serde_json::Value::Object(o) if o.contains_key("defined") => {
                let name = o["defined"]["name"].as_str().unwrap();
                let def = types
                    .iter()
                    .find(|t| t["name"] == name)
                    .unwrap_or_else(|| panic!("type {name} not in IDL"));
                assert_eq!(
                    def["type"]["kind"], "struct",
                    "{at}: {name} is not a struct"
                );
                for field in def["type"]["fields"].as_array().unwrap() {
                    let f = field["name"].as_str().unwrap();
                    check(&field["type"], &format!("{at}.{f}"), types);
                }
            }
            other => panic!("{at}: unsupported type {other}"),
        }
    }

    let accounts = idl["accounts"].as_array().unwrap();
    assert!(accounts.len() >= 2);
    for acc in accounts {
        let name = acc["name"].as_str().unwrap();
        check(
            &serde_json::json!({ "defined": { "name": name } }),
            name,
            types,
        );
    }
}
