//! Layout stability (spec §14.2, §14.7; plan Task 2a; ADR 0019).
//!
//! - `v1`: frozen pilot structs and golden field-offset tables.
//! - `fields`: the field list of each v1 account, for the tables.
//! - `v2_carve`: a test-only phase-2 `VaultState` with `InstantExitState`
//!   carved from `_reserved`.
//! - `book`, `capital`: the per-record accounts.
//!
//! `main.rs` holds the shared machinery, the config and state tests, the
//! planned-carve padding test and the committed fixtures in
//! `tests/fixtures/layout/v1/`.

#[macro_use]
mod fields;
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
    state::{Caps, ClaimFiling, Guarantee, RedeemRequest, VaultConfig, VaultState},
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
/// Nested structs without `bool`s: every byte `0xff`.
macro_rules! sentinel_bytes {
    ($($t:ty),*) => {$(impl Sentinel for $t {
        fn sentinel() -> Self { <$t>::deserialize(&mut &[0xffu8; 4096][..]).unwrap() }
    })*};
}
sentinel_bytes!(Caps, CapsV1);

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

/// Offset of the one `bool` in each singleton (`paused`, `fulfil_halted`).
fn bool_at(t: OffsetTable, name: &str) -> usize {
    t.iter().find(|(n, _, _)| *n == name).unwrap().1
}

fn config_bools() -> Vec<usize> {
    vec![bool_at(VAULT_CONFIG_V1, "paused")]
}

pub fn state_bools() -> Vec<usize> {
    vec![bool_at(VAULT_STATE_V1, "fulfil_halted")]
}

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/layout/v1")
}

/// Length of the trailing `_reserved` of an offset table.
pub fn padding_of(t: OffsetTable) -> usize {
    let (name, _, n) = *t.last().unwrap();
    assert_eq!(name, "_reserved");
    n
}

// ---------------------------------------------------------------------------
// Size pins (R7)
// ---------------------------------------------------------------------------

#[test]
fn sizes_are_pinned() {
    assert_eq!(8 + VaultConfig::INIT_SPACE, VAULT_CONFIG_SIZE);
    assert_eq!(8 + VaultState::INIT_SPACE, VAULT_STATE_SIZE);
    assert_eq!(VAULT_CONFIG_SIZE, 1_181);
    assert_eq!(VAULT_STATE_SIZE, 688);
    assert_eq!(VAULT_CONFIG_SIZE, 8 + VAULT_CONFIG_V1_LEN);
    assert_eq!(VAULT_STATE_SIZE, 8 + VAULT_STATE_V1_LEN);
    // Serialized length (current and v1) equals the allocation.
    assert_eq!(8 + ser(&zeroed::<VaultConfig>()).len(), VAULT_CONFIG_SIZE);
    assert_eq!(8 + ser(&zeroed::<VaultState>()).len(), VAULT_STATE_SIZE);
    assert_eq!(8 + ser(&zeroed::<VaultConfigV1>()).len(), VAULT_CONFIG_SIZE);
    assert_eq!(8 + ser(&zeroed::<VaultStateV1>()).len(), VAULT_STATE_SIZE);
    assert_eq!(ser(&zeroed::<Caps>()).len(), CAPS_V1_LEN);
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
    assert_eq!(vault_state_fields!(VaultStateV1), table(VAULT_STATE_V1));
    assert_eq!(vault_config_fields!(VaultConfigV1), table(VAULT_CONFIG_V1));
    assert_eq!(caps_fields!(CapsV1), table(CAPS_V1));
}

#[test]
fn current_structs_keep_every_v1_offset() {
    assert_eq!(vault_state_fields!(VaultState), table(VAULT_STATE_V1));
    assert_eq!(vault_config_fields!(VaultConfig), table(VAULT_CONFIG_V1));
    assert_eq!(caps_fields!(Caps), table(CAPS_V1));
}

#[test]
fn v1_bytes_decode_under_the_current_structs() {
    // Every byte distinct-ish, so a shifted field would read different bytes.
    let state = pattern(VAULT_STATE_SIZE - 8, &state_bools());
    let v1 = VaultStateV1::deserialize(&mut state.as_slice()).unwrap();
    assert_eq!(ser(&v1), state);
    let mut account = VaultState::DISCRIMINATOR.to_vec();
    account.extend(&state);
    let cur = VaultState::try_deserialize(&mut account.as_slice()).unwrap();
    assert_eq!(ser(&cur), state, "VaultState bytes moved");
    assert_eq!(cur.inflow_nav, v1.inflow_nav);
    assert_eq!(cur.claim_day_buckets, v1.claim_day_buckets);
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
    assert_eq!(cur.guardians, v1.guardians);
    assert_eq!(cur.caps.max_nav_move_bps, v1.caps.max_nav_move_bps);
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
// Planned carves (ADR 0019): removed and later features still fit
// ---------------------------------------------------------------------------

/// Each account's padding holds every carve already planned for it, so the
/// features removed from v1 (or not built yet) return as carves, without a
/// migration of live accounts.
#[test]
fn padding_holds_every_planned_carve() {
    // Phase-2 `ExitParams` (spec §13.2) and the ADR 0012 config fields
    // (`claims_tail_secs`, `payment_term_secs`, `optional_categories`,
    // `backstop_amount`, `backstop_commitment_hash`).
    const EXIT_PARAMS: usize = 275;
    const ADR_0012_CONFIG: usize = 8 + 8 + 1 + 8 + 32;
    assert!(padding_of(VAULT_CONFIG_V1) >= EXIT_PARAMS + ADR_0012_CONFIG);
    // Later caps (PC-43: `max_guarantees`, a concentration limit, new cover
    // per period).
    assert!(padding_of(CAPS_V1) >= 3 * 8);
    // Phase-2 `InstantExitState` (88), the buffer earmark (8), the
    // claim-notice counter (4) and the ADR 0012 counters (16).
    assert!(padding_of(VAULT_STATE_V1) >= 88 + 8 + 4 + 16);
    // ADR 0012 lifecycle fields.
    assert!(padding_of(GUARANTEE_V1) >= 32 + 32 + 8 + 8 + 8);
    // ADR 0012 claim fields (49) and settlement fields (74).
    assert!(padding_of(CLAIM_FILING_V1) >= (1 + 8 + 8 + 32) + (1 + 1 + 8 + 32 + 32));
    // ADR 0010 partial fills: `shares_remaining`, `shares_filled`,
    // `assets_filled`, `fill_count`, `last_fill_at`.
    assert!(padding_of(REDEEM_REQUEST_V1) >= 8 + 8 + 8 + 2 + 8);
    // The current structs carry the same padding as the tables.
    assert_eq!(
        zeroed::<VaultConfig>()._reserved.len(),
        padding_of(VAULT_CONFIG_V1)
    );
    assert_eq!(
        zeroed::<VaultState>()._reserved.len(),
        padding_of(VAULT_STATE_V1)
    );
    assert_eq!(zeroed::<Caps>()._reserved.len(), padding_of(CAPS_V1));
    assert_eq!(
        zeroed::<Guarantee>()._reserved.len(),
        padding_of(GUARANTEE_V1)
    );
    assert_eq!(
        zeroed::<ClaimFiling>()._reserved.len(),
        padding_of(CLAIM_FILING_V1)
    );
    assert_eq!(
        zeroed::<RedeemRequest>()._reserved.len(),
        padding_of(REDEEM_REQUEST_V1)
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
