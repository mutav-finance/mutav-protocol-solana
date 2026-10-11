# 0021 — Claims: approval, amendment and exact payment

- **Status:** Accepted (2026-10-10), decided by the founders. Supersedes, for the pilot, the `pay_claim_admin` path of ADR 0012 decision 3 and the separate `Payout` account of spec §3.7. Amends ADR 0014 (the payment amount is now the provision; amendment replaces payment above the provision). Builds on ADR 0020 (operator/admin separation). The layout carves are in ADR 0019.

## Context

A claim moves through three steps: the operator files it with an amount (the provision), the reserve pays it to the whitelisted `payments_account`, and the operator records the settlement off-chain (Pix). The founders set these goals for the claim cycle:

- **The admin controls what leaves the reserve, not the merits of a claim.** Above a per-call ceiling, the admin approves the exact amount. Below it, the operator pays alone.
- **The book always matches the money.** What a filing has provisioned is exactly what is paid. A claim that changes size is amended in the open, with an event, before it is paid.
- **Every filing can be corrected** by the operator (ADR 0020), and a correction never reuses an old approval.
- **Landlords are paid on time.** The program's caps must not delay a payment the contract owes. MUTAV can pay first from its bank account and be reimbursed by the reserve.
- **The period cap means what it says.** A ceiling per 30 days should hold over any 30 days, not only within calendar buckets.

## Decision

### 1. Claim statuses and one account per claim

`ClaimFiling` absorbs the `Payout` record. Its status is a `u8`, append-only:

| Value | Status | Meaning |
|---|---|---|
| 0 | `FILED` | Provisioned, awaiting payment |
| 1 | `PAID` | Paid by the reserve to `payments_account`; terminal for amendments |
| 2 | `WITHDRAWN` | Provision released; may be re-filed |
| 3 | `SETTLED` | Payment recorded as delivered off-chain; terminal |

New fields on `ClaimFiling`: `approved_amount`, `payments_account`, `paid_at`, `paid_amount`, `pix_e2e_hash`, `settled_at`. `settle_payout` writes the filing. There is no separate `Payout` account.

### 2. `approve_claim` above the per-call cap

- `approve_claim(notice_ref_hash, amount)` is an **admin** instruction (Squads, time-locked). It records `approved_amount = amount` on a `FILED` filing.
- The threshold is `max_claim_per_call`. No new parameter.
- The admin approves the amount that leaves the reserve. It does not judge whether the claim is valid; that stays with the operator.
- Approved payments **count toward** the sliding period cap (decision 5) and are checked against it. For an unusually large claim, the admin raises `max_claim_per_period` with `set_config`. `/admin` bundles that raise with `approve_claim` in one Squads proposal when the payment would not fit, and a later `set_config` lowers the cap back.
- Not pause-gated.

### 3. `pay_claim` pays exactly the provision

- `pay_claim(notice_ref_hash, expected_amount)`, operator.
- It pays **exactly** `filing.provision`, and refuses unless `expected_amount == filing.provision`. A payment never releases more provision than it pays.
- If `filing.provision > max_claim_per_call`, it also requires `approved_amount == filing.provision`.
- It applies the sliding period cap, the ADR 0014 bound (which an exact payment always meets), the category check of ADR 0012 and the liquid-BRS and frozen-reserve checks. It never applies the solvency gate or the pause (ADR 0005, ADR 0020).
- To settle a claim for less, the operator amends it down, then pays.

### 4. `amend_claim` and `refile_claim`

- **`amend_claim(notice_ref_hash, new_amount)`**, operator, not pause-gated.
  - Lower: releases the difference from `provisions`.
  - Higher: books more, up to the leg's unprovisioned cover (`leg_cover − leg_paid − leg_provision`).
  - `new_amount = 0`: sets the status to `WITHDRAWN`, releases the whole provision and emits `ClaimWithdrawn`.
  - Any amendment resets `approved_amount` to 0.
  - Refused on `PAID` and `SETTLED`.
  - Emits `ClaimAmended { old, new }`.
- **`refile_claim`**, operator, with the same arguments as `file_claim`. Accepts only a `WITHDRAWN` filing. It returns it to `FILED` and resets `approved_amount`, `provision` and `filed_at`. An old approval is never reused.
- These replace the admin `withdraw_claim` and the re-file-in-place designs discussed earlier.

### 5. A strict sliding window of 31 daily buckets

- The per-period cap uses **31 daily buckets** in `VaultState`: a ring of 31 `u64` totals indexed by day number, plus the day of the last write. A bucket older than 31 days is cleared before it is reused.
- **A claim pays only if the payments of the last 31 days plus this one stay within `max_claim_per_period`.** The rule is exact: there is no weighting or estimate.
- Because every 30-day span lies inside some 31-day window of whole days, no 30-day span ever pays out more than the cap.
- The window length is fixed by the bucket count. `claim_period_secs` no longer sets it.
- `validate_params` requires `max_claim_per_call > 0` and `max_claim_per_period ≥ max_claim_per_call`.
- Devnet values: R$10k per call, R$20k per sliding window.

### 6. Bank-first payment, then reimbursement

- MUTAV may pay the agency by Pix from its own bank account first. The reserve then reimburses MUTAV's `payments_account` through an ordinary `pay_claim` (the backstop advance of ADR 0012).
- This keeps landlords paid on time when a claim needs `approve_claim` and the admin time lock.
- **Until `approve_claim` ships, claims above `max_claim_per_call` are paid bank-first.** There is no interim cap on `file_claim`: such a claim is filed and provisioned in full, and the reserve reimburses `payments_account` once the approval exists.

### 7. The payout SLA leaves the program

- Removed: `payout_sla_secs` (`VaultConfig`), `late` (`Payout`), `late_payouts` (`VaultState`), the late logic in `settle_payout` and the late scan in `refresh`.
- The service level (review, information requests, approval, execution, the contractual term plus a 48-hour target) lives in the operator platform, mutav-app.
- The reserve's only on-chain promise: **within the caps, `pay_claim` is never refused** for solvency or pause.

## Alternatives considered

- **`pay_claim_admin`** (ADR 0012): the admin pays above the cap itself. It needs a second payment path with the same rules, and the admin would execute payments, not only approve amounts. Rejected for `approve_claim` plus one `pay_claim`.
- **Partial payment that keeps the filing open** (`provision -= amount`). Workable, but a claim's status would no longer say whether it is done, and the book would hold half-paid filings. Rejected for exact payment plus amendment.
- **Payment up to the provision (ADR 0014's bound).** A payment below the provision would need a separate rule for the remainder. Rejected: amend first, then pay exactly.
- **An admin-only `withdraw_claim`.** Puts contract judgment in the admin. Rejected; withdrawal is `amend_claim(0)` by the operator (ADR 0020).
- **Re-filing a withdrawn notice in place**, keeping its old fields. It could carry an old approval into a new amount. Rejected for an explicit `refile_claim` that resets them.
- **A fixed 30-day bucket.** Simple, but it bounds each bucket, not every 30-day span. Rejected for the sliding window.
- **Two buckets with a weighted previous bucket.** Small, but an estimate: it treats the previous bucket as evenly spread, so it is not strict. Rejected.
- **An exact log of payment times.** Exact to the second, but it grows with the number of payments. Rejected for daily buckets, which are fixed in size and strict at a one-day grain.
- **Keeping the payout SLA on-chain.** The program can only count late settlements after the fact; the real service level is set in the platform. Removed.

## Consequences

- **Positive.** A filing's provision is always what will be paid, so free capital never includes money a filed claim needs. The admin's approval is bound to one amount and lapses on any change. Corrections are visible as events.
- **Negative.** Above the per-call cap, a claim waits for the admin time lock (24 hours in the real pilot); bank-first payment covers the gap. Settling for less takes two instructions.
- **The window is strict at a one-day grain.** It counts up to 31 calendar days, slightly more than 30, so it is never looser than a 30-day rule. A property test checks that no 30-day span of payments exceeds `max_claim_per_period`, including across bucket reuse and a cap change in the middle of a window.
- **Layout.** The 31 buckets and the day index take 256 bytes of `VaultState` (ADR 0019).
- **Program changes.** `pay_claim` gains `expected_amount`. New instructions: `approve_claim`, `amend_claim`, `refile_claim`. `settle_payout` writes the `ClaimFiling`. New events: `ClaimAmended`, `ClaimWithdrawn` and one for each approval. The `Payout` account, its seed and the SLA fields are removed (ADR 0019). Until `approve_claim` ships, the reserve cannot pay above `max_claim_per_call`; MUTAV pays those claims bank-first, and `file_claim` keeps no interim cap.
- **Spec.** §3.6, §3.7 removed, §5.4, §8, §9, §10, invariant list.
- **App.** `/operator` adds amend, withdraw and re-file. `/admin` adds an approval flow that bundles a period-cap raise when needed. `/reserve` drops the late-payout figure.

## References

- Spec §3.6, §3.7, §5.4, §8, §9.
- ADRs 0003, 0005, 0012, 0014, 0019, 0020.
- OWASP Smart Contract Top 10 (2026 edition), SC01 and SC10.
