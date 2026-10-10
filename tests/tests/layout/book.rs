//! Golden layouts of the guarantee-book and receipt accounts: size pins,
//! frozen v1 offset tables, v1 bytes decoding under the current structs, and
//! frozen discriminators.

use anchor_lang::{AccountDeserialize, AnchorDeserialize, Discriminator, Space};
use mutav::{
    constants::*,
    state::{ClaimFiling, Guarantee, IncomeReceipt},
};

use crate::{pattern, ser, v1::*, zeroed};

/// Re-decodes v1 bytes under the current account type and checks nothing
/// moved.
pub fn v1_round_trip<
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
fn guarantee_layout_is_frozen() {
    assert_eq!(8 + Guarantee::INIT_SPACE, GUARANTEE_SIZE);
    assert_eq!(GUARANTEE_SIZE, 377);
    assert_eq!(8 + GUARANTEE_V1_LEN, GUARANTEE_SIZE);
    assert_eq!(8 + ser(&zeroed::<Guarantee>()).len(), GUARANTEE_SIZE);
    assert_eq!(guarantee_fields!(GuaranteeV1), GUARANTEE_V1.to_vec());
    assert_eq!(guarantee_fields!(Guarantee), GUARANTEE_V1.to_vec());
    v1_round_trip::<GuaranteeV1, Guarantee>(GUARANTEE_SIZE);
    // sha256("account:Guarantee")[..8], computed independently and committed.
    assert_eq!(
        Guarantee::DISCRIMINATOR,
        &[198, 16, 124, 172, 230, 249, 200, 37]
    );
}

#[test]
fn claim_filing_layout_is_frozen() {
    assert_eq!(8 + ClaimFiling::INIT_SPACE, CLAIM_FILING_SIZE);
    assert_eq!(CLAIM_FILING_SIZE, 380);
    assert_eq!(8 + CLAIM_FILING_V1_LEN, CLAIM_FILING_SIZE);
    assert_eq!(8 + ser(&zeroed::<ClaimFiling>()).len(), CLAIM_FILING_SIZE);
    assert_eq!(
        claim_filing_fields!(ClaimFilingV1),
        CLAIM_FILING_V1.to_vec()
    );
    assert_eq!(claim_filing_fields!(ClaimFiling), CLAIM_FILING_V1.to_vec());
    v1_round_trip::<ClaimFilingV1, ClaimFiling>(CLAIM_FILING_SIZE);
    assert_eq!(
        ClaimFiling::DISCRIMINATOR,
        &[177, 42, 215, 113, 249, 140, 198, 201]
    );
}

#[test]
fn income_receipt_layout_is_frozen() {
    assert_eq!(8 + IncomeReceipt::INIT_SPACE, INCOME_RECEIPT_SIZE);
    assert_eq!(INCOME_RECEIPT_SIZE, 143);
    assert_eq!(8 + INCOME_RECEIPT_V1_LEN, INCOME_RECEIPT_SIZE);
    assert_eq!(
        8 + ser(&zeroed::<IncomeReceipt>()).len(),
        INCOME_RECEIPT_SIZE
    );
    assert_eq!(
        income_receipt_fields!(IncomeReceiptV1),
        INCOME_RECEIPT_V1.to_vec()
    );
    assert_eq!(
        income_receipt_fields!(IncomeReceipt),
        INCOME_RECEIPT_V1.to_vec()
    );
    v1_round_trip::<IncomeReceiptV1, IncomeReceipt>(INCOME_RECEIPT_SIZE);
    // sha256("account:IncomeReceipt")[..8], computed independently.
    assert_eq!(
        IncomeReceipt::DISCRIMINATOR,
        &[33, 167, 246, 148, 183, 13, 0, 79]
    );
}

#[test]
fn receipt_kinds_are_pinned() {
    assert_eq!(
        (
            INCOME_KIND_NORA_STATEMENT,
            INCOME_KIND_FEE,
            INCOME_KIND_UNSOLICITED,
            INCOME_KIND_BACKSTOP
        ),
        (0, 1, 2, 3)
    );
}

#[test]
fn claim_statuses_are_pinned() {
    assert_eq!(
        (CLAIM_FILED, CLAIM_PAID, CLAIM_WITHDRAWN, CLAIM_SETTLED),
        (0, 1, 2, 3)
    );
}
