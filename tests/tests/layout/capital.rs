//! Golden layouts of the investor-capital request accounts: size pins, frozen
//! v1 offset tables, v1 bytes decoding under the current structs, and frozen
//! discriminators.

use anchor_lang::{Discriminator, Space};
use mutav::{
    constants::*,
    state::{DepositRequest, RedeemRequest},
};

use crate::{book::v1_round_trip, ser, v1::*, zeroed};

#[test]
fn capital_sizes_are_pinned() {
    assert_eq!(8 + DepositRequest::INIT_SPACE, DEPOSIT_REQUEST_SIZE);
    assert_eq!(8 + RedeemRequest::INIT_SPACE, REDEEM_REQUEST_SIZE);
    assert_eq!((DEPOSIT_REQUEST_SIZE, REDEEM_REQUEST_SIZE), (155, 155));
    assert_eq!(8 + DEPOSIT_REQUEST_V1_LEN, DEPOSIT_REQUEST_SIZE);
    assert_eq!(8 + REDEEM_REQUEST_V1_LEN, REDEEM_REQUEST_SIZE);
    assert_eq!(
        8 + ser(&zeroed::<DepositRequest>()).len(),
        DEPOSIT_REQUEST_SIZE
    );
    assert_eq!(
        8 + ser(&zeroed::<RedeemRequest>()).len(),
        REDEEM_REQUEST_SIZE
    );
}

#[test]
fn capital_offsets_match_v1() {
    assert_eq!(
        deposit_request_fields!(DepositRequestV1),
        DEPOSIT_REQUEST_V1.to_vec()
    );
    assert_eq!(
        deposit_request_fields!(DepositRequest),
        DEPOSIT_REQUEST_V1.to_vec()
    );
    assert_eq!(
        redeem_request_fields!(RedeemRequestV1),
        REDEEM_REQUEST_V1.to_vec()
    );
    assert_eq!(
        redeem_request_fields!(RedeemRequest),
        REDEEM_REQUEST_V1.to_vec()
    );
}

#[test]
fn capital_v1_bytes_decode_under_the_current_structs() {
    v1_round_trip::<DepositRequestV1, DepositRequest>(DEPOSIT_REQUEST_SIZE);
    v1_round_trip::<RedeemRequestV1, RedeemRequest>(REDEEM_REQUEST_SIZE);
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
}

#[test]
fn request_statuses_are_pinned() {
    assert_eq!((DEPOSIT_PENDING, DEPOSIT_FULFILLED), (0, 1));
    assert_eq!((REDEEM_PENDING, REDEEM_FILLED), (0, 1));
}
