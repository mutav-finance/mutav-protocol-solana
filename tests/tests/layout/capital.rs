//! Golden layouts of the investor-capital accounts (plan Task 6, carried from
//! 2a): size pins, frozen v1 offset tables, v1 bytes decoding under the
//! current structs, frozen discriminators, and the test-only `HolderStateV2`
//! carve (per-wallet instant-exit counters, spec §3.10, §13.6).

use anchor_lang::{prelude::*, AccountDeserialize, Discriminator, Space};
use mutav::{
    constants::*,
    state::{DepositRequest, HolderState, RedeemRequest},
};
use mutav_tests::helpers::*;

use crate::{pattern, ser, span, spans, v1::*, zeroed, Sentinel};

fn v1_round_trip<
    V: AnchorDeserialize + AnchorSerialize,
    T: AccountDeserialize + AnchorSerialize + Discriminator,
>(
    size: usize,
) {
    let bytes = pattern(size - 8, &[]);
    let v1 = V::deserialize(&mut bytes.as_slice()).unwrap();
    assert_eq!(ser(&v1), bytes);
    let mut account = T::DISCRIMINATOR.to_vec();
    account.extend(&bytes);
    let cur = T::try_deserialize(&mut account.as_slice()).unwrap();
    assert_eq!(ser(&cur), bytes, "bytes moved");
}

macro_rules! deposit_fields {
    ($t:ty) => {
        spans!($t;
            "version" => version, "bump" => bump, "owner" => owner, "seq" => seq,
            "assets" => assets, "shares_out" => shares_out,
            "nav_at_fulfil" => nav_at_fulfil, "requested_at" => requested_at,
            "fulfilled_at" => fulfilled_at, "status" => status, "_reserved" => _reserved)
    };
}

macro_rules! redeem_fields {
    ($t:ty) => {
        spans!($t;
            "version" => version, "bump" => bump, "owner" => owner, "seq" => seq,
            "shares_requested" => shares_requested, "shares_remaining" => shares_remaining,
            "shares_filled" => shares_filled, "assets_filled" => assets_filled,
            "assets_claimable" => assets_claimable, "fill_count" => fill_count,
            "last_fill_nav" => last_fill_nav, "requested_at" => requested_at,
            "last_fill_at" => last_fill_at, "status" => status, "_reserved" => _reserved)
    };
}

macro_rules! holder_fields {
    ($t:ty) => {
        spans!($t;
            "version" => version, "bump" => bump, "owner" => owner,
            "last_shares_in_ts" => last_shares_in_ts, "_reserved" => _reserved)
    };
}

#[test]
fn capital_sizes_are_pinned() {
    assert_eq!(8 + DepositRequest::INIT_SPACE, DEPOSIT_REQUEST_SIZE);
    assert_eq!(8 + RedeemRequest::INIT_SPACE, REDEEM_REQUEST_SIZE);
    assert_eq!(8 + HolderState::INIT_SPACE, HOLDER_STATE_SIZE);
    assert_eq!(
        (DEPOSIT_REQUEST_SIZE, REDEEM_REQUEST_SIZE, HOLDER_STATE_SIZE),
        (155, 181, 114)
    );
    assert_eq!(
        8 + ser(&zeroed::<DepositRequestV1>()).len(),
        DEPOSIT_REQUEST_SIZE
    );
    assert_eq!(
        8 + ser(&zeroed::<RedeemRequestV1>()).len(),
        REDEEM_REQUEST_SIZE
    );
    assert_eq!(8 + ser(&zeroed::<HolderStateV1>()).len(), HOLDER_STATE_SIZE);
}

#[test]
fn capital_offsets_match_v1() {
    assert_eq!(
        deposit_fields!(DepositRequestV1),
        DEPOSIT_REQUEST_V1.to_vec()
    );
    assert_eq!(deposit_fields!(DepositRequest), DEPOSIT_REQUEST_V1.to_vec());
    assert_eq!(redeem_fields!(RedeemRequestV1), REDEEM_REQUEST_V1.to_vec());
    assert_eq!(redeem_fields!(RedeemRequest), REDEEM_REQUEST_V1.to_vec());
    assert_eq!(holder_fields!(HolderStateV1), HOLDER_STATE_V1.to_vec());
    assert_eq!(holder_fields!(HolderState), HOLDER_STATE_V1.to_vec());
}

#[test]
fn capital_v1_bytes_decode_under_the_current_structs() {
    v1_round_trip::<DepositRequestV1, DepositRequest>(DEPOSIT_REQUEST_SIZE);
    v1_round_trip::<RedeemRequestV1, RedeemRequest>(REDEEM_REQUEST_SIZE);
    v1_round_trip::<HolderStateV1, HolderState>(HOLDER_STATE_SIZE);
}

#[test]
fn capital_discriminators_are_frozen() {
    // sha256("account:<Name>")[..8], computed independently and committed.
    assert_eq!(
        DepositRequest::DISCRIMINATOR,
        &[86, 27, 56, 8, 25, 62, 62, 243]
    );
    assert_eq!(
        RedeemRequest::DISCRIMINATOR,
        &[103, 82, 139, 51, 199, 234, 111, 115]
    );
    assert_eq!(
        HolderState::DISCRIMINATOR,
        &[222, 82, 176, 75, 3, 75, 155, 184]
    );
}

// ---------------------------------------------------------------------------
// HolderStateV2: per-wallet exit counters carved from `_reserved`
// ---------------------------------------------------------------------------

/// Test-only phase-2 `HolderState` (spec §3.10, §13.6).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub struct HolderStateV2 {
    pub version: u8,
    pub bump: u8,
    pub owner: Pubkey,
    pub last_shares_in_ts: i64,
    // -- carved from `_reserved` --
    pub exit_period_start: i64,
    pub exit_period_paid: u64,
    pub _reserved: [u8; 48],
}

#[test]
fn holder_carve_size_is_pinned() {
    let (_, reserved_at, reserved_len) = *HOLDER_STATE_V1.last().unwrap();
    assert_eq!(reserved_len, 64);
    assert_eq!(8 + ser(&zeroed::<HolderStateV2>()).len(), HOLDER_STATE_SIZE);
    assert_eq!(
        span::<HolderStateV2>(|x| {
            x.exit_period_start = Sentinel::sentinel();
            x.exit_period_paid = Sentinel::sentinel();
        }),
        (reserved_at, 16)
    );
    assert_eq!(
        spans!(HolderStateV2; "_reserved" => _reserved),
        vec![("_reserved", reserved_at + 16, 48)]
    );
    let mut v1 = HOLDER_STATE_V1.to_vec();
    v1.pop();
    assert_eq!(
        spans!(HolderStateV2;
            "version" => version, "bump" => bump, "owner" => owner,
            "last_shares_in_ts" => last_shares_in_ts),
        v1
    );
}

#[test]
fn pilot_holder_accounts_read_as_v2() {
    let mut f = Fixture::new();
    set_time(&mut f.svm, 1_760_000_000);
    let a = f.investor(10_000 * BRL);
    let list = f.allowlist(&[a.pubkey()]);
    f.deposit(&a, &list, 5_000 * BRL);
    let raw = f.raw(&holder_pda(&f.pdas.config, &a.pubkey()));
    assert_eq!(&raw[..8], HolderState::DISCRIMINATOR);
    let v2 = HolderStateV2::deserialize(&mut &raw[8..]).unwrap();
    assert_eq!((v2.exit_period_start, v2.exit_period_paid), (0, 0));
    assert_eq!(v2._reserved, [0; 48]);
    assert_eq!(v2.owner, a.pubkey());
    assert_eq!(v2.last_shares_in_ts, 1_760_000_000);
    assert_eq!(v2.version, PROGRAM_LAYOUT_VERSION);

    // Rollback safety: v2 bytes survive a pilot decode and re-serialize.
    let mut x = v2;
    x.exit_period_start = 7;
    x.exit_period_paid = 9;
    let mut account = HolderState::DISCRIMINATOR.to_vec();
    account.extend(ser(&x));
    let pilot = HolderState::try_deserialize(&mut account.as_slice()).unwrap();
    let back = ser(&pilot);
    assert_eq!(HolderStateV2::deserialize(&mut back.as_slice()).unwrap(), x);
}
