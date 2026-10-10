# Guarantee fees

The guarantee fee (*taxa da fiança*) is what the tenant pays for the guarantee. This page covers who pays it, how the agency passes it to MUTAV, and where each real goes once it reaches the chain.

## Who pays whom

| Step | Who | How |
|---|---|---|
| 1 | Tenant to agency | The tenant pays the guarantee fee with the rent, in the agency's own rent flow |
| 2 | Agency to MUTAV | One consolidated bill a month for all the agency's guarantees, paid by boleto or Pix through a licensed payment provider |
| 3 | MUTAV to the chain | MUTAV converts the BRL 1:1 into BRS and the operator records the paid bill with `contribute_fees` |

## The fee amount

MUTAV sets each lease's fee in the platform at signing, by the tenant's score band. Final pricing is not decided. The business plan's working parameter is 9%, 12% or 15% of monthly rent by score band. It is a working parameter, not final pricing.

The program does not price anything. It records the amount of each paid bill and splits it. Pricing changes need no program change.

## The monthly agency bill

| Item | Rule |
|---|---|
| Issued | On the 1st of each month by the MUTAV platform, one per agency |
| Lines | One line per guarantee in force, guarantees in arrears included, plus a one-time activation line in a guarantee's first month (working parameter) |
| Due | On a fixed day set in the partnership agreement. The platform uses the 10th |
| Paid by | Boleto or Pix through a licensed payment provider |
| Paid in BRS (designed) | The platform shows a Solana Pay link or QR carrying the bill's reference. The agency transfers BRS to MUTAV's operator BRS account. It still never calls the program |
| Third-party charges | Any third-party charge on the same bill is passed to its owner at settlement. It never enters MUTAV's accounts, the reserve or its share value |

Status: bill generation runs in the platform and Pix settlement in sandbox. Boleto issuance, the payment provider, the minter integration, stablecoin payment and automated `contribute_fees` are not live yet.

## Where the money goes on-chain

Once a bill is paid and converted, the operator calls `contribute_fees(invoice_ref_hash, amount)` once for that bill, for its guarantee-fee lines only. One instruction splits it in two:

```mermaid
flowchart LR
  B[Paid agency bill, in BRS] -- "contribute_fees(invoice_ref_hash, amount)" --> P[[mutav program]]
  P -- "take = floor(amount x fee_take_bps / 10,000)" --> T[(MUTAV treasury)]
  P -- "net = amount - take" --> R[(Reserve)]
  P -. "FeeReceipt (counts once)" .-> FR[FeeReceipt PDA]
```

| Part | Destination | Effect |
|---|---|---|
| MUTAV's take (`fee_take_bps`) | MUTAV's treasury account, directly | MUTAV's operating revenue. Never part of the reserve |
| Net fee | The reserve | Strengthens the reserve that backs every guarantee. Raises the value of every reserve share. Never mints shares |

| Parameter | Value |
|---|---|
| `fee_take_bps` on devnet | 2,000 (20%) |
| Program maximum | 3,000 (30%) |
| Real-pilot take | TBD (spec §12 Q4) |

## Rules the program enforces

- **Each bill counts once.** `contribute_fees` creates a `FeeReceipt` account keyed by `invoice_ref_hash`. A second call for the same bill fails, even if a payment notice arrives twice.
- **Fees are always accepted.** Recording a fee is never paused and never solvency-gated, because fees only strengthen the reserve.
- **Fees wait for the first deposit.** While the reserve has no shares outstanding, `contribute_fees` is refused, so no fee can be lost to share rounding. The operator records the bill once the first deposit is filled.
- **Fees never mint shares and never count as MUTAV capital.** MUTAV's own capital enters the reserve only through the ordinary deposit queue, like any other capital.
- **Three separate MUTAV accounts.** The treasury (fee take), the payments account (claim payments) and MUTAV's capital wallet are distinct accounts.

| `FeeReceipt` field | Meaning |
|---|---|
| `invoice_ref_hash` | Commitment to the bill |
| `gross` | Amount recorded |
| `take` | MUTAV's take, sent to the treasury |
| `net` | Amount sent to the reserve |
| `slot` | When it was recorded |

The event `FeesContributed { invoice_ref_hash, gross, take, net }` lets anyone check the split against `fee_take_bps`.

## Privacy of the bill

Only the bill's amount and a commitment to it go on-chain. The proposed design makes `invoice_ref_hash` a keyed hash of the bill's number, period and lines. The public then cannot link a receipt to an agency, while each agency, given its bill's reference data, can find its own receipt.

## If a bill is paid late

The guarantee stays in force. No claim, cover or payment rule depends on the bill being paid. An unpaid fee is MUTAV's own claim against the agency, never a defence against the landlord, and claim payments are never reduced by it.

On-chain, the guarantee's cover still counts in the reserve's coverage requirement, and no `FeeReceipt` exists for that bill until it is paid. Unpaid bills are never counted as reserve assets. Off-chain the bill is marked overdue.

The grace period, late charges, when MUTAV stops accepting an agency's new registrations, and who bears a defaulting tenant's fee belong in the partnership agreement. They are not decided yet (TBD).

## Reconciliation (proposed)

A bill is recorded on-chain only when the payment provider's settlement, or the BRS transfer carrying its reference, equals the bill's total. A mismatch or a reversal goes to manual review. At month end MUTAV compares totals billed, settled, converted and recorded on-chain. Converted BRS waits in the operator's public BRS account only until `contribute_fees`, normally the same day.

## Not a guarantee fee

The reserve also receives issuer income: the BRS issuer's monthly partnership revenue, booked with `sweep_income`. It is a separate, labelled flow. It never counts as a guarantee fee, never enters the fee totals and never enters the coverage math.

## Sources

- [Specification §2.1 Three separate MUTAV money flows](../spec.md#21-three-separate-mutav-money-flows-adr-0009-and-issuer-income-adr-0017), [§3.11 `FeeReceipt`](../spec.md#311-feereceipt), [§5.3 Guarantee fees (operator)](../spec.md#53-guarantee-fees-operator) and [§8 Caps](../spec.md#8-caps)
- [Specification §12 Open questions](../spec.md#12-open-questions) (Q4 take rate)
- [Litepaper §2.1 Business model in one table](../litepaper.md#21-business-model-in-one-table) and [§7 Monthly billing of partner agencies](../litepaper.md#monthly-billing-of-partner-agencies)
- Code: [`programs/mutav/src/instructions/operator/contribute_fees.rs`](../../programs/mutav/src/instructions/operator/contribute_fees.rs), [`programs/mutav/src/state/fee.rs`](../../programs/mutav/src/state/fee.rs), [`programs/mutav/src/constants.rs`](../../programs/mutav/src/constants.rs) (`MAX_FEE_TAKE_BPS`)
- Technical reference, devnet release design of 2026-10-10, §5.2 and §6.5 (branch `docs/protocol-reference`, `docs/technical-reference.html`)
- Devnet release decisions: pre-devnet refactor handoff, "Locked decisions" (fee take 2000 on devnet; inflows refused while supply is 0), and the adversarial review decisions log (internal notes, 2026-10-10)

## Decisions

- [ADR 0007: MUTAV's fee take goes directly to the treasury](../decisions/0007-fee-take-direct-to-treasury.md)
- [ADR 0009: Guarantee fees, MUTAV operation and MUTAV's reserve share are separate flows](../decisions/0009-separate-mutav-money-flows.md)
- [ADR 0004: NAV computed on-chain with internal accounting, provisions at filing and bounded prices](../decisions/0004-onchain-nav-internal-accounting.md)
- [ADR 0017: BRS income intake: an income inbox and `sweep_income`](../decisions/0017-brs-income-intake.md) (issuer income is kept apart from guarantee fees)
- Pending ADR: Operator/admin separation and operator-compromise recovery (fees and income refused while no shares are outstanding)
