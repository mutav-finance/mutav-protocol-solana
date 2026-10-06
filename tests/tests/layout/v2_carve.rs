//! v1 → v2 carve (spec §13.2, §14.1, §14.7 item 2): a test-only phase-2
//! `VaultState` with `InstantExitState` carved from the front of
//! `_reserved` reads every live v1 account with all carved fields at zero and
//! every v1 field at its value and offset. The carve sizes are pinned here,
//! not by hand.
//!
//! `HolderStateV2` (per-wallet exit counters) lands with `HolderState` in
//! Task 6.

use anchor_lang::{prelude::*, AccountDeserialize, Discriminator};
use mutav::{constants::VAULT_STATE_SIZE, state::VaultState};
use mutav_tests::helpers::*;

use super::{pattern, ser, span, spans, v1::*, vault_state_fields, zeroed, Sentinel, STATE_BOOLS};

/// Phase-2 instant-exit counters (spec §13.2). Zero is the correct starting
/// value of every field.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct InstantExitState {
    pub exit_epoch_start: i64,
    pub exit_curr: u64,
    pub exit_prev: u64,
    pub exit_period_start: i64,
    pub exit_period_paid: u64,
    pub instant_assets_total: u64,
    pub instant_shares_total: u64,
    pub haircut_total: u64,
    pub buffer_funded_total: u64,
    pub buffer_released_total: u64,
    pub last_instant_ts: i64,
}

impl Sentinel for InstantExitState {
    fn sentinel() -> Self {
        Self {
            exit_epoch_start: !0,
            exit_curr: !0,
            exit_prev: !0,
            exit_period_start: !0,
            exit_period_paid: !0,
            instant_assets_total: !0,
            instant_shares_total: !0,
            haircut_total: !0,
            buffer_funded_total: !0,
            buffer_released_total: !0,
            last_instant_ts: !0,
        }
    }
}

/// `VaultStateV1` with `InstantExitState` carved from `_reserved`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct VaultStateV2 {
    pub version: u8,
    pub bump: u8,
    pub mode: u8,
    pub brs_balance: u64,
    pub tesouro_units: u64,
    pub tesouro_price: u64,
    pub tesouro_price_ts: i64,
    pub stable_assets: u64,
    pub remaining_cover_total: u64,
    pub coverage_required: u64,
    pub provisions: u64,
    pub shares_outstanding: u64,
    pub nav_per_share: u64,
    pub pending_deposits_total: u64,
    pub pending_redeem_shares: u64,
    pub claimable_assets_total: u64,
    pub buffer_earmark: u64,
    pub pending_notices: u32,
    pub active_guarantees: u32,
    pub next_deposit_seq: u64,
    pub deposit_head: u64,
    pub next_redeem_seq: u64,
    pub redeem_head: u64,
    pub claim_period_start: i64,
    pub claim_period_paid: u64,
    pub fees_in_total: u64,
    pub fee_take_total: u64,
    pub claims_paid_total: u64,
    pub late_payouts: u32,
    pub fulfil_halted: bool,
    pub last_refresh_ts: i64,
    pub last_refresh_slot: u64,
    // -- carved from `_reserved` --
    pub instant_exit: InstantExitState,
    pub _reserved: [u8; 168],
}

/// Decodes v2 from account bytes (discriminator skipped).
fn v2(account: &[u8]) -> VaultStateV2 {
    assert_eq!(&account[..8], VaultState::DISCRIMINATOR);
    VaultStateV2::deserialize(&mut &account[8..]).unwrap()
}

#[test]
fn carve_sizes_are_pinned() {
    assert_eq!(ser(&InstantExitState::default()).len(), 88);
    assert_eq!(ser(&zeroed::<VaultStateV2>()._reserved).len(), 168);
    assert_eq!(8 + ser(&zeroed::<VaultStateV2>()).len(), VAULT_STATE_SIZE);
    // The carve starts where v1 `_reserved` starts.
    let (_, reserved_at, reserved_len) = *VAULT_STATE_V1.last().unwrap();
    assert_eq!(reserved_len, 256);
    assert_eq!(
        span::<VaultStateV2>(|x| x.instant_exit = Sentinel::sentinel()),
        (reserved_at, 88)
    );
    assert_eq!(
        spans!(VaultStateV2; "_reserved" => _reserved),
        vec![("_reserved", reserved_at + 88, 168)]
    );
}

#[test]
fn v2_keeps_every_v1_offset() {
    let mut v1 = VAULT_STATE_V1.to_vec();
    v1.pop();
    assert_eq!(vault_state_fields!(VaultStateV2), v1);
}

#[test]
fn v1_bytes_read_as_v2_with_zero_carve() {
    // A v1 account: every v1 field set, padding zero (as the pilot writes).
    let mut bytes = pattern(VAULT_STATE_SIZE - 8, STATE_BOOLS);
    let (at, len) = (VAULT_STATE_V1.last().unwrap().1, 256);
    bytes[at..at + len].fill(0);
    let v1 = VaultStateV1::deserialize(&mut bytes.as_slice()).unwrap();
    let v2 = VaultStateV2::deserialize(&mut bytes.as_slice()).unwrap();
    assert_eq!(v2.instant_exit, InstantExitState::default());
    assert_eq!(v2._reserved, [0; 168]);
    assert_eq!(ser(&v2), bytes, "v2 re-serializes the v1 bytes unchanged");
    assert_eq!(v2.brs_balance, v1.brs_balance);
    assert_eq!(v2.buffer_earmark, v1.buffer_earmark);
    assert_eq!(v2.pending_notices, v1.pending_notices);
    assert_eq!(v2.fulfil_halted, v1.fulfil_halted);
    assert_eq!(v2.last_refresh_slot, v1.last_refresh_slot);
}

#[test]
fn pilot_accounts_read_as_v2() {
    // Accounts produced by the pilot program, with v1 fields injected, then
    // every instruction run.
    let mut f = Fixture::new();
    let mut s = f.state();
    s.brs_balance = 123;
    s.buffer_earmark = 0;
    s.pending_notices = 2;
    s.last_refresh_slot = 99;
    f.write_state(&s);
    // Building the list funds the reserve for the operator instructions.
    let ixs = f.pilot_instructions();
    assert!(f.state().brs_balance >= 123);
    for (name, ix, signer) in ixs {
        f.send(ix, &signer)
            .unwrap_or_else(|e| panic!("{name}: {:?}", e.err));
    }
    let raw = f.raw(&f.pdas.state);
    let v2 = v2(&raw);
    assert_eq!(v2.instant_exit, InstantExitState::default());
    assert_eq!(v2._reserved, [0; 168]);
    // Every v1 field reads the same through the v2 struct.
    let cur = f.state();
    assert_eq!(v2.brs_balance, cur.brs_balance);
    assert_eq!(v2.fees_in_total, cur.fees_in_total);
    assert_eq!(v2.remaining_cover_total, cur.remaining_cover_total);
    assert_eq!(v2.claims_paid_total, cur.claims_paid_total);
    assert_eq!(v2.claim_period_start, cur.claim_period_start);
    assert_eq!(v2.pending_notices, 2);
    assert_eq!(v2.last_refresh_slot, 99);
    assert_eq!(v2.version, s.version);

    // The committed fixture also reads as v2.
    let fixture = std::fs::read(super::fixtures_dir().join("vault_state.bin")).unwrap();
    let v2 = self::v2(&fixture);
    assert_eq!(v2.instant_exit, InstantExitState::default());
    assert_eq!(v2._reserved, [0; 168]);
}

#[test]
fn v2_bytes_survive_a_v1_decode_and_rewrite() {
    // Rollback safety (R6, spec §14.6): an account written by the phase-2
    // binary, decoded and re-serialized by the pilot struct, keeps the carved
    // counters byte for byte.
    let mut x = zeroed::<VaultStateV2>();
    x.version = 1;
    x.brs_balance = 5;
    x.instant_exit = InstantExitState {
        exit_curr: 7,
        haircut_total: 9,
        last_instant_ts: 11,
        ..Default::default()
    };
    let mut account = VaultState::DISCRIMINATOR.to_vec();
    account.extend(ser(&x));
    let pilot = VaultState::try_deserialize(&mut account.as_slice()).unwrap();
    assert_eq!(pilot.brs_balance, 5);
    let mut back = VaultState::DISCRIMINATOR.to_vec();
    back.extend(ser(&pilot));
    assert_eq!(v2(&back), x);
}
