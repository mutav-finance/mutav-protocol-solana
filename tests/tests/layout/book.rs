//! Golden layouts of the guarantee-book accounts (plan Tasks 3–5, carried
//! from 2a): size pins, frozen v1 offset tables, v1 bytes decoding under the
//! current structs, and frozen discriminators.

use anchor_lang::{AccountDeserialize, AnchorDeserialize, Discriminator, Space};
use mutav::{
    constants::*,
    state::{AgencyExposure, ClaimFiling, FeeReceipt, Guarantee, Payout},
};

use crate::{pattern, ser, spans, v1::*, zeroed};

macro_rules! guarantee_fields {
    ($t:ty) => {
        spans!($t;
            "version" => version, "bump" => bump, "id" => id, "agency_id" => agency_id,
            "refs_hash" => refs_hash, "rent" => rent,
            "default_multiplier_bps" => default_multiplier_bps,
            "exit_multiplier_bps" => exit_multiplier_bps,
            "default_cover" => default_cover, "exit_cover" => exit_cover,
            "default_paid" => default_paid, "exit_paid" => exit_paid,
            "provision_default" => provision_default, "provision_exit" => provision_exit,
            "open_claims" => open_claims, "status" => status,
            "registered_at" => registered_at, "closed_at" => closed_at,
            "_reserved" => _reserved,
        )
    };
}

macro_rules! agency_fields {
    ($t:ty) => {
        spans!($t;
            "version" => version, "bump" => bump, "agency_id" => agency_id,
            "outstanding_cover" => outstanding_cover,
            "active_guarantees" => active_guarantees,
            "claims_paid_total" => claims_paid_total, "_reserved" => _reserved,
        )
    };
}

/// Re-decodes v1 bytes under the current account type and checks nothing
/// moved.
fn v1_round_trip<
    V: AnchorDeserialize + anchor_lang::AnchorSerialize,
    T: AccountDeserialize + anchor_lang::AnchorSerialize + Discriminator,
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

#[test]
fn book_sizes_are_pinned() {
    assert_eq!(8 + Guarantee::INIT_SPACE, GUARANTEE_SIZE);
    assert_eq!(8 + AgencyExposure::INIT_SPACE, AGENCY_EXPOSURE_SIZE);
    assert_eq!(GUARANTEE_SIZE, 249);
    assert_eq!(AGENCY_EXPOSURE_SIZE, 126);
    assert_eq!(8 + ser(&zeroed::<Guarantee>()).len(), GUARANTEE_SIZE);
    assert_eq!(8 + ser(&zeroed::<GuaranteeV1>()).len(), GUARANTEE_SIZE);
    assert_eq!(
        8 + ser(&zeroed::<AgencyExposure>()).len(),
        AGENCY_EXPOSURE_SIZE
    );
    assert_eq!(
        8 + ser(&zeroed::<AgencyExposureV1>()).len(),
        AGENCY_EXPOSURE_SIZE
    );
}

#[test]
fn book_offsets_match_v1() {
    assert_eq!(guarantee_fields!(GuaranteeV1), GUARANTEE_V1.to_vec());
    assert_eq!(guarantee_fields!(Guarantee), GUARANTEE_V1.to_vec());
    assert_eq!(
        agency_fields!(AgencyExposureV1),
        AGENCY_EXPOSURE_V1.to_vec()
    );
    assert_eq!(agency_fields!(AgencyExposure), AGENCY_EXPOSURE_V1.to_vec());
}

#[test]
fn book_v1_bytes_decode_under_the_current_structs() {
    v1_round_trip::<GuaranteeV1, Guarantee>(GUARANTEE_SIZE);
    v1_round_trip::<AgencyExposureV1, AgencyExposure>(AGENCY_EXPOSURE_SIZE);
}

#[test]
fn book_discriminators_are_frozen() {
    // sha256("account:<Name>")[..8], computed independently and committed.
    assert_eq!(
        Guarantee::DISCRIMINATOR,
        &[198, 16, 124, 172, 230, 249, 200, 37]
    );
    assert_eq!(
        AgencyExposure::DISCRIMINATOR,
        &[1, 250, 85, 98, 115, 180, 168, 59]
    );
}

#[test]
fn fee_receipt_layout_is_frozen() {
    assert_eq!(8 + FeeReceipt::INIT_SPACE, FEE_RECEIPT_SIZE);
    assert_eq!(FEE_RECEIPT_SIZE, 138);
    assert_eq!(8 + ser(&zeroed::<FeeReceipt>()).len(), FEE_RECEIPT_SIZE);
    assert_eq!(8 + ser(&zeroed::<FeeReceiptV1>()).len(), FEE_RECEIPT_SIZE);
    let fields = |t: Vec<(&'static str, usize, usize)>| t;
    assert_eq!(
        fields(spans!(FeeReceiptV1;
            "version" => version, "bump" => bump, "invoice_ref_hash" => invoice_ref_hash,
            "gross" => gross, "take" => take, "net" => net, "slot" => slot,
            "_reserved" => _reserved)),
        FEE_RECEIPT_V1.to_vec()
    );
    assert_eq!(
        fields(spans!(FeeReceipt;
            "version" => version, "bump" => bump, "invoice_ref_hash" => invoice_ref_hash,
            "gross" => gross, "take" => take, "net" => net, "slot" => slot,
            "_reserved" => _reserved)),
        FEE_RECEIPT_V1.to_vec()
    );
    v1_round_trip::<FeeReceiptV1, FeeReceipt>(FEE_RECEIPT_SIZE);
    assert_eq!(
        FeeReceipt::DISCRIMINATOR,
        &[135, 174, 32, 77, 183, 44, 26, 107]
    );
}

#[test]
fn claim_filing_layout_is_frozen() {
    assert_eq!(8 + ClaimFiling::INIT_SPACE, CLAIM_FILING_SIZE);
    assert_eq!(CLAIM_FILING_SIZE, 156);
    assert_eq!(8 + ser(&zeroed::<ClaimFiling>()).len(), CLAIM_FILING_SIZE);
    assert_eq!(8 + ser(&zeroed::<ClaimFilingV1>()).len(), CLAIM_FILING_SIZE);
    macro_rules! fields {
        ($t:ty) => {
            spans!($t;
                "version" => version, "bump" => bump, "guarantee" => guarantee, "leg" => leg,
                "notice_ref_hash" => notice_ref_hash, "provision" => provision,
                "filed_at" => filed_at, "status" => status, "_reserved" => _reserved)
        };
    }
    assert_eq!(fields!(ClaimFilingV1), CLAIM_FILING_V1.to_vec());
    assert_eq!(fields!(ClaimFiling), CLAIM_FILING_V1.to_vec());
    v1_round_trip::<ClaimFilingV1, ClaimFiling>(CLAIM_FILING_SIZE);
    assert_eq!(
        ClaimFiling::DISCRIMINATOR,
        &[177, 42, 215, 113, 249, 140, 198, 201]
    );
}

#[test]
fn payout_layout_is_frozen() {
    assert_eq!(8 + Payout::INIT_SPACE, PAYOUT_SIZE);
    assert_eq!(PAYOUT_SIZE, 229);
    assert_eq!(8 + ser(&zeroed::<Payout>()).len(), PAYOUT_SIZE);
    assert_eq!(8 + ser(&zeroed::<PayoutV1>()).len(), PAYOUT_SIZE);
    macro_rules! fields {
        ($t:ty) => {
            spans!($t;
                "version" => version, "bump" => bump, "guarantee" => guarantee, "leg" => leg,
                "amount" => amount, "notice_ref_hash" => notice_ref_hash,
                "payments_account" => payments_account, "status" => status,
                "paid_at" => paid_at, "pix_e2e_hash" => pix_e2e_hash,
                "settled_at" => settled_at, "late" => late, "_reserved" => _reserved)
        };
    }
    assert_eq!(fields!(PayoutV1), PAYOUT_V1.to_vec());
    assert_eq!(fields!(Payout), PAYOUT_V1.to_vec());
    v1_round_trip::<PayoutV1, Payout>(PAYOUT_SIZE);
    assert_eq!(
        Payout::DISCRIMINATOR,
        &[69, 45, 245, 131, 218, 101, 158, 228]
    );
}
