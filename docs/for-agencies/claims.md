# Claims

When a tenant defaults, the agency asks MUTAV to pay. This page follows that request from the agency to the payment, and shows what the program records at each step.

A **claim** is a payment request from the agency on the landlord's behalf. A **claim payment** is the money MUTAV pays from the reserve for it. Each claim is one event: for example one month's rent on the default leg, or one payment of end-of-occupation debts on the exit leg.

## The flow at a glance

```mermaid
sequenceDiagram
  participant Ag as Agency
  participant Pl as MUTAV platform
  participant Op as Operator key
  participant Ad as Reserve admin (multisig)
  participant Pr as mutav program
  participant PA as MUTAV payments account
  Ag->>Pl: Payment request + evidence
  Pl->>Pl: Review, information requests, approval
  Op->>Pr: file_claim(leg, amount, notice_ref_hash)
  Note over Pr: Provision booked at once
  opt Amount above max_claim_per_call
    Ad->>Pr: approve_claim(notice_ref_hash, amount), time-locked
  end
  Op->>Pr: pay_claim: exactly the provision
  Pr->>PA: BRS
  PA-->>Ag: Pix (BRL)
  Note over Ag: Agency pays the landlord under the mandate
  Op->>Pr: settle_payout(notice_ref_hash, pix_e2e_hash)
```

## 1. The agency files a payment request (off-chain)

The agency sends the payment request (*pedido de pagamento*) with its evidence in the MUTAV platform. MUTAV reviews it, asks for more information if needed, and approves or rejects it. This review is a platform duty. The program decides no claim.

The service levels for this work (review, information requests, approval, execution and the contractual deadline) live in the MUTAV platform, not in the program. The contractual payment term is TBD (spec §12 Q36). The agency's filing window is enforced in the platform; its length is to be reconciled between the working process and the spec (TBD, spec §12 Q14).

## 2. The operator files the claim (on-chain)

Once MUTAV approves the request, the operator calls `file_claim(leg, amount, notice_ref_hash)`. `notice_ref_hash` is a commitment to the agency's payment request. It links the filing, the payment and the settlement record of that request.

| Rule | Refused with |
|---|---|
| The guarantee is `ACTIVE` | `GuaranteeNotActive` |
| The amount is above 0 | `InvalidParameter` |
| The amount fits in the leg's cover that is not yet paid or set aside for another claim | `ExceedsRemainingCover` |

The program creates a `ClaimFiling` with status `FILED` and books the amount as a **provision**. The provision lowers the reserve's net asset value at once and is always held in full in the reserve's coverage requirement. A leg can carry several open filings, each for its own payment request.

Filing is never paused and never solvency-gated. The event `ClaimFiled` records it.

## 3. Approval above the per-call cap

The program limits how much the operator key can pay:

| Cap | Devnet value | Rule |
|---|---|---|
| `max_claim_per_call` | R$10,000 | The most one claim payment may be without approval |
| `max_claim_per_period` | R$20,000 per sliding 30 days | No 30-day span may exceed it, approved payments included |

A claim above the per-call cap needs the reserve admin's `approve_claim(notice_ref_hash, amount)`. The admin multisig signs it through its time lock (devnet 5 minutes; real pilot 24 hours). The approval records an exact `approved_amount` on the filing. The admin approves how much may leave the reserve, not whether the claim is valid. That judgment stays with the operator.

If the payment would not fit in the 30-day cap, the admin's proposal also raises `max_claim_per_period` in the same step, and a later configuration change lowers it back.

These caps bound what a compromised operator key could move. They do not limit what MUTAV owes the landlord under the guarantee. Large claims go through the approval, and MUTAV's bank-first payment (below) keeps the agency paid while the approval waits.

## 4. Payment: exactly the filed amount

The operator calls `pay_claim(leg, amount, notice_ref_hash)`. The payment must equal the filing's provision exactly. No part of a provision is ever released without being paid or explicitly amended.

| Rule | Refused with |
|---|---|
| The filing is `FILED` and the leg matches | `ClaimNotFiled`, `LegMismatch` |
| The amount equals the filing's provision | Error pinned at implementation |
| The amount is within `max_claim_per_call`, or equals the admin's `approved_amount` | `ClaimCallCapExceeded` |
| The 30-day sliding total plus this payment is within `max_claim_per_period` | `ClaimPeriodCapExceeded` |
| The destination is MUTAV's whitelisted payments account | `InvalidPaymentsAccount` |
| The reserve holds enough liquid BRS | `InsufficientLiquidBalance` |
| The reserve's BRS account is not frozen | `ReserveFrozen` |
| The notice was not paid before | Account already in use |

`pay_claim` has **no** solvency check, no under-coverage check, no pause check and no share-value guard. Within the caps it is never refused because the reserve is below target.

The program sends BRS from the reserve to MUTAV's payments account, marks the filing `PAID`, releases its provision, lowers the guarantee's remaining cover, and creates a `Payout` record with status `PENDING`. The event `ClaimPaid` records it.

BRS can leave the reserve for a claim only to that one payments account. It never goes to an arbitrary wallet.

## 5. Pix to the agency, then the settlement record

MUTAV converts the BRS to BRL and pays the agency by Pix. The agency pays the landlord under the landlord's mandate to receive payments and give *quitação*.

The operator then calls `settle_payout(notice_ref_hash, pix_e2e_hash)`. It stores a hash of the Pix end-to-end ID and moves the `Payout` to `SETTLED` with a timestamp. This is a settlement record. The program has no payout deadline of its own. Deadlines live in the operator platform.

| `Payout` field | Meaning |
|---|---|
| `guarantee`, `leg`, `amount`, `notice_ref_hash` | What was paid, and for which request |
| `payments_account` | Where the BRS went |
| `status` | `PENDING` until the Pix is recorded, then `SETTLED` |
| `paid_at`, `settled_at` | On-chain timestamps of the payment and the settlement |
| `pix_e2e_hash` | Hash of the Pix end-to-end ID |

## Bank-first payment

MUTAV may pay the agency by Pix from its own bank account first. The reserve then reimburses MUTAV's payments account through the ordinary `pay_claim`. This keeps the agency paid on time when the reserve's payment is delayed, for example:

- while an approval above the per-call cap waits on the admin's time lock;
- while the 30-day cap is full;
- while the issuer has frozen the reserve's BRS account;
- while the operator key is being replaced.

The reimbursement follows every rule of `pay_claim`, so the reserve never pays more than the filed amount.

## Correcting a claim

Claims can change after filing. Both corrections are operator actions, and both run while the reserve is paused.

| Instruction | What it does |
|---|---|
| `amend_claim(notice_ref_hash, new_amount)` | Changes the filed amount. Lower releases the difference. Higher sets more aside, within the leg's cover that is not yet paid or set aside. Emits `ClaimAmended { old, new }`. Any approval on the filing is reset, so a new amount above the cap needs a new approval |
| `withdraw_claim(notice_ref_hash)` | Releases the whole provision and marks the filing `WITHDRAWN`. Use it for a mistaken filing, or when the tenant pays before the claim is paid |

To settle a claim for less than was filed, the operator amends it down, then pays the new amount.

A withdrawn notice can be filed again through an explicit re-file path. It accepts only a `WITHDRAWN` filing and resets the approval, the provision and the filing time, so an old approval is never reused.

```mermaid
stateDiagram-v2
  [*] --> FILED: file_claim
  FILED --> FILED: amend_claim (approval reset)
  FILED --> FILED: approve_claim (above the per-call cap)
  FILED --> PAID: pay_claim, exactly the provision
  FILED --> WITHDRAWN: withdraw_claim
  WITHDRAWN --> FILED: re-file (approval, provision and time reset)
  PAID --> [*]
```

## What can and cannot stop a claim payment

| Can stop a payment | Cannot stop a payment |
|---|---|
| The filing checks (status, leg, exact amount) | The solvency gate |
| The per-call cap without an approval | A pause |
| The sliding 30-day cap | The reserve being below target |
| Not enough liquid BRS | The share-value guard on capital fills |
| An issuer freeze of the reserve's BRS account | The state of the agency's monthly bill |

In every case in the left column, MUTAV's bank-first payment can keep the agency paid while the cause is resolved.

## If the operator key is compromised

Every claim action except payment can be undone by another operator action: a false filing is withdrawn. Claim payments are the only irreversible operator action. They are bounded by the admin's caps and can only reach MUTAV's own payments account. The recovery steps are: revoke the operator key at once, appoint a new operator in two steps, reconcile the platform's records with on-chain events, and correct with ordinary operator actions.

## Planned

- **Claim categories and richer records.** With the ADR 0012 lifecycle, each claim names the guaranteed debt (rent arrears, charges, damage, court costs owed by the tenant, abandonment costs, other listed debts), and the records gain the time the request became complete, a commitment to the debt calculation, the landlord's receipt (*quitação*) and the mandate in force. Space is already reserved in the `ClaimFiling` and `Payout` accounts.
- **Settlement attestation.** It becomes required once the operator and the reserve admin are separate companies.
- **Claim notices.** A notice raised at the first missed rent, which holds capital fills while a known loss is not yet filed, is built before any outside capital.

## Sources

- [Specification §3.6 `ClaimFiling`](../spec.md#36-claimfiling-derived), [§3.7 `Payout`](../spec.md#37-payout), [§5.4 Claims and payouts](../spec.md#54-claims-and-payouts-operator) and [§8 Caps](../spec.md#8-caps)
- [Specification §2.2 MUTAV as fiador: off-chain duties](../spec.md#22-mutav-as-fiador-off-chain-duties-adr-0012) and [§12 Open questions](../spec.md#12-open-questions) (Q14, Q36)
- [Litepaper §7 Guarantee lifecycle](../litepaper.md#7-guarantee-lifecycle)
- Code: [`programs/mutav/src/state/claim.rs`](../../programs/mutav/src/state/claim.rs), [`programs/mutav/src/state/payout.rs`](../../programs/mutav/src/state/payout.rs), [`programs/mutav/src/instructions/operator/file_claim.rs`](../../programs/mutav/src/instructions/operator/file_claim.rs), [`programs/mutav/src/instructions/operator/pay_claim.rs`](../../programs/mutav/src/instructions/operator/pay_claim.rs), [`programs/mutav/src/instructions/operator/settle_payout.rs`](../../programs/mutav/src/instructions/operator/settle_payout.rs)
- Technical reference, devnet release design of 2026-10-10, §5.3, §7.2 and §9 (branch `docs/protocol-reference`, `docs/technical-reference.html`)
- Devnet release decisions: pre-devnet refactor handoff, "Locked decisions" (claims, devnet values), and the adversarial review decisions log, "Open ends" (`amend_claim`, exact payment) and the OWASP pass (re-file path) (internal notes, 2026-10-10)

## Decisions

- [ADR 0003: Claim payments operated by MUTAV through a whitelisted payments account](../decisions/0003-payments-operated-by-mutav.md) (its settlement deadline flag is removed)
- [ADR 0005: Solvency gate scope: capital flows and new guarantees, never claim payments](../decisions/0005-solvency-gate-scope.md)
- [ADR 0008: One capital flow for everyone; FIFO deposits; pause never blocks claims](../decisions/0008-uniform-capital-flow-and-pause-scope.md)
- [ADR 0012: Guarantees aligned with a limited fiança onerosa](../decisions/0012-fianca-aligned-guarantee-lifecycle.md) (bank-first reimbursement; its admin payment path is replaced by `approve_claim`)
- [ADR 0014: `pay_claim` bound with concurrent filings on one leg](../decisions/0014-pay-claim-bound-with-concurrent-filings.md) (superseded by exact payment)
- Pending ADR: Claims: approval, amendment, exact payment, sliding window
- Pending ADR: Operator/admin separation and operator-compromise recovery (`withdraw_claim`, two-step role handover)
- Pending ADR: 0019 v1 layout for the devnet release (payout SLA removed, `approved_amount` carved, padding for the ADR 0012 fields)
