# 0029 — Claims and capital rules in the program

- **Status:** Accepted (2026-10-11). Implements ADR 0022 (stress buffer, underwater reserve) and the fill and exit rules of ADR 0023 in the devnet binary, and records the choices made while building them. Confirms that the claim rules of ADR 0021 shipped with ADR 0019 and ADR 0020 (#34, #37). Logic only: no account layout, instruction argument or account list changes; two errors are appended.

## Context

ADR 0022 and ADR 0023 decided the economics; the v1 layout (ADR 0019) and the frozen interfaces (#37) carved every field they need. This release turns them on. A few points were left for the build: where the inline guard's halt is recorded, how the guard's baseline behaves across an empty supply, what a fill does with a head worth 0 BRS, which account counts for a full exit, and how the stress buffer is bounded.

## Decision

### 1. Coverage with the stress buffer (ADR 0022)

- `coverage_required = max(ceil(c × remaining_cover_total / 10_000), provisions + min(stress_buffer, unprovisioned))`, with `unprovisioned = max(0, remaining_cover_total − provisions)`. One helper (`solvency::coverage_required`) computes it for every gate and every cached recompute: `register_guarantee`, `refresh`, `fulfil_redeems`, `request_redeem`'s sizing, `clear_fulfil_halt`, `file_claim`, `pay_claim`, `close_guarantee` and `set_config`.
- **The stress term saturates.** While invariant 2 holds it never exceeds `remaining_cover_total`, so the saturation never binds; it only keeps a broken state from wrapping.
- **The claim path never fails on it.** `pay_claim`, and also `file_claim` and `close_guarantee`, write the cached value through a saturating variant (`u64::MAX` on overflow). The `register_guarantee` gate and `set_config` keep the checked form: they fail closed.
- **`set_config` recomputes the cache** after any change, so a new `stress_buffer` (like a new `c`) is visible at once; `mode` stays with `refresh`. A change of `stress_buffer` already needs a `refresh` in the same slot (ADR 0026).
- **Bound:** `stress_buffer ≤ max_tvl`. A buffer the reserve could never hold is a typo, not a policy. `0` turns the term off.

### 2. Inflows wait for the first shares (ADR 0023 decision 1)

`contribute_fees` and `sweep_income` refuse with the new error **`NoSharesOutstanding`** while `shares_outstanding == 0`. Fees wait with the operator and income in the inbox. `book_unsolicited` (Wave 2) follows the same rule.

### 3. Underwater reserve (ADR 0022 decision 4)

- `fulfil_deposits` refuses with the new error **`ReserveUnderwater`** when `shares_outstanding > 0` and `net_assets == 0`.
- **`fulfil_redeems` refuses with it too.** ADR 0022 relied on the solvency gate to hold redemptions in this state, but a reserve whose BRS exactly equals its provisions is underwater without being under-covered. With the 0-asset fill of decision 6, every head would then be burned for nothing; the refusal keeps the shares until a MUTAV backstop restores NAV.
- An empty reserve (no shares, no net assets) is not underwater: the first deposit fills at 1.0.

### 4. The fills' inline NAV-move guard (ADR 0023 decision 1)

- Both fills evaluate the `refresh` rule before any fill: the published NAV now, net of `inflow_nav`, against the baseline `nav_per_share`. A move beyond `max_nav_move_bps` refuses with `FulfilHalted`.
- **The refusal does not latch the halt.** A failed instruction cannot write state, and a fill that returned success without filling would read as an executed proposal. The next `refresh`, which anyone can send, measures the same move and sets `fulfil_halted` (with `FulfilHaltRaised`, source `HALT_SOURCE_REFRESH`). The fill sources `HALT_SOURCE_FULFIL_DEPOSITS` and `HALT_SOURCE_FULFIL_REDEEMS` stay reserved.
- The check runs once, at the start of the batch: fills convert at the live NAV, which keeps NAV per share up to rounding in the reserve's favour.

### 5. The guard's baseline across an empty supply

- **Seeded on the first shares.** The `fulfil_deposits` batch that takes `shares_outstanding` from 0 sets `nav_per_share` to the published NAV after the batch and `inflow_nav = 0`. Without it the guard measured nothing until the first `refresh`: a shock right after the first deposit would have filled unmeasured.
- **Cleared at zero supply.** The `fulfil_redeems` batch that burns the last shares sets `nav_per_share = 0` and `inflow_nav = 0`, so the next first deposit seeds afresh and is never compared with a NAV that belonged to old holders.

### 6. Exit rights (ADR 0023 decision 2)

- **Holders skip the allowlist.** `request_redeem` checks eligibility only when the share token account it debits is empty, which a redemption could not use anyway. The `eligibility` argument stays in the interface.
- **Full exit below `min_request`:** when the request debits the owner's **canonical share associated token account** and `shares` equals its whole balance, `min_request` is skipped. The value must be above 0 at request time (`RequestTooSmall`) and `max_request` still applies. A balance in any other token account keeps both limits, so one balance cannot be split into many sub-minimum requests (NEW-B).
- **A head worth 0 fills as 0 assets.** In `fulfil_redeems`, a head whose shares are worth 0 BRS at fill time is filled: shares burned, `assets_out = 0`, status `FILLED`, the queue moves on, and `claim_assets` closes it. The owner's `min_assets_out` still applies first: an owner who set a limit never has shares burned for less (`PriceLimitNotMet`, then the owner or admin cancels).

### 7. Claims (ADR 0021): already in the binary

Exact payment of the provision (`expected_amount == provision`), the `approved_amount` requirement above `max_claim_per_call`, and the strict 31-day window of daily buckets (with its naive-oracle property test) shipped with #34 and #37. The two-bucket weighted window, and its "weight rounds up" rule, were superseded by the daily buckets before they were built. `approve_claim`, `amend_claim` and `refile_claim` remain Wave 2.

### 8. Events

The events of ADR 0023 are final since #37: `DepositFilled` per fill, `QueueHeadsAdvanced`, `FulfilHaltRaised` with a source, and `count` in `1..=8`. No event changes here: a 0-asset fill emits the usual `RedeemFilled` with `assets = 0`.

## Alternatives considered

- **Latch the halt inside the fill** (set `fulfil_halted`, emit `FulfilHaltRaised` with a fill source, return success with no fill). Records the move atomically, but a Squads proposal would show as executed when it moved nothing, and "a call that fills nothing fails" would no longer hold. Rejected; `refresh` latches it.
- **Leave `fulfil_redeems` to the solvency gate when underwater.** Misses the case where BRS equals provisions exactly. Rejected.
- **Keep a 0-value head blocking the queue** until the owner or admin cancels. One dust request could stop every redemption behind it. Rejected (NEW-B).
- **Full exit from any token account.** Lets a holder split a balance across accounts into many sub-minimum requests. Rejected for the canonical associated token account only.
- **No bound on `stress_buffer`.** Rejected: one bound against typos costs nothing.

## Consequences

- **Positive.** Coverage includes the next likely claims; a shock between two `refresh`es cannot be filled across; the first window after launch is measured; no dust request stops the queue; a de-listed holder can leave.
- **Negative.** A fill refused by the inline guard must be followed by a `refresh` to record the halt; `/admin` sends one. Fees and income before the first deposit wait off-reserve.
- **Program.** Errors `ReserveUnderwater` and `NoSharesOutstanding` appended (IDL change, client regenerated). No layout or interface change; `idl-compat` stays green.
- **Client.** `coverageRequired` and `computeSolvency` take the stress buffer (optional, `0n` by default, so existing callers compile; `solvencyFromAccounts` reads it from the decoded config). `previewRedeemFulfil` mirrors the 0-asset fill and `ReserveUnderwater`. Vectors cover the stress term.
- **Follow-ups.** Simulator parity with the stress term after PR #39 merges; the §8 `stress_buffer` row ("read by no rule yet") is edited in PR #39's section of the spec and is updated after it merges; `app/lib/gate.ts` passes the stress buffer to `coverageRequired`; the inline guard in the client previews (C2, Wave 2).

## References

- ADRs 0016, 0017, 0019, 0020, 0021, 0022, 0023, 0026.
- Adversarial review: F2, F3, F4, F6, AV-6, Q-1, NEW-B.
- Spec §3.2, §4, §5.1, §5.3, §5.3a, §5.5, §8, §10.
