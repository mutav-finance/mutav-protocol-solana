# 0029 — Claims and capital rules in the program

- **Status:** Accepted (2026-10-11); amended the same day after the PR #43 review: underwater means a NAV below the smallest unit, a head worth 0 is never filled, and sub-minimum redemptions follow the size rule of decision 6. Per the founders, each choice follows the design references (decision 9). Implements ADR 0022 (stress buffer, underwater reserve) and the fill and exit rules of ADR 0023 in the devnet binary, and records the choices made while building them. Confirms that the claim rules of ADR 0021 shipped with ADR 0019 and ADR 0020 (#34, #37). Logic only: no account layout, instruction argument or account list changes; two errors are appended.

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

- **Underwater means NAV per share below the smallest published unit** while shares are outstanding: `net_assets × NAV_SCALE < shares_outstanding` (`coverage::is_underwater`). Net assets of exactly 0 are the extreme case. A reserve with BRS just above its provisions is underwater too: it would price a deposit near zero and pay redemption heads 0 or near 0.
- **Both fills refuse it** with the new error **`ReserveUnderwater`**. ADR 0022 relied on the solvency gate to hold redemptions, but a reserve whose BRS equals its provisions can be underwater without being under-covered.
- An empty reserve (no shares) is not underwater: the first deposit fills at 1.0.
- **Interim recovery, until the Wave 2 `BACKSTOP` booking (ADR 0024) ships:** MUTAV recapitalizes through `contribute_fees`.
  - It is signed by the operator from its own BRS account, under a fresh `invoice_ref_hash` that mutav-app records as a backstop.
  - No shares are minted, and it counts as a verified inflow for the NAV-move guard.
  - `fee_take_bps` of it goes to the treasury, so the operator sends `needed / (1 − take)`, rounded up.
  - `cancel_deposit` and `cancel_redeem` stay open throughout, so no request is held by the refusal.

### 4. The fills' inline NAV-move guard (ADR 0023 decision 1)

- Both fills evaluate the `refresh` rule before any fill: the published NAV now, net of `inflow_nav`, against the baseline `nav_per_share`. A move beyond `max_nav_move_bps` refuses with `FulfilHalted`.
- **The refusal does not latch the halt.** A failed instruction cannot write state, and a fill that returned success without filling would read as an executed proposal. The next `refresh`, which anyone can send, measures the same move and sets `fulfil_halted` (with `FulfilHaltRaised`, source `HALT_SOURCE_REFRESH`). The fill sources `HALT_SOURCE_FULFIL_DEPOSITS` and `HALT_SOURCE_FULFIL_REDEEMS` stay reserved.
- The check runs once, at the start of the batch: fills convert at the live NAV, which keeps NAV per share up to rounding in the reserve's favour.

### 5. The guard's baseline across an empty supply

- **Seeded on the first shares.** The `fulfil_deposits` batch that takes `shares_outstanding` from 0 sets `nav_per_share` to the published NAV after the batch and `inflow_nav = 0`. Without it the guard measured nothing until the first `refresh`: a shock right after the first deposit would have filled unmeasured.
- **Cleared at zero supply.** The `fulfil_redeems` batch that burns the last shares sets `nav_per_share = 0` and `inflow_nav = 0`, so the next first deposit seeds afresh and is never compared with a NAV that belonged to old holders.

### 6. Exit rights (ADR 0023 decision 2)

- **Holders skip the allowlist.** `request_redeem` checks eligibility only when the share token account it debits is empty, which a redemption could not use anyway. The `eligibility` argument stays in the interface.
- **The size rule** (`math::redeem_size_error`, on values in BRS at the current NAV):
  - `value == 0` is refused;
  - `value > max_request` is refused;
  - `value ≥ min_request` is a normal request.
  - **Below `min_request`, only an exit of the balance:**
    - the request debits the owner's canonical share associated token account;
    - it leaves a remainder there worth less than `min_request`;
    - it is worth at least `max(1, min_request / SUB_MINIMUM_EXIT_FLOOR_DIVISOR)`, with the divisor at 10 (R$100 at the devnet minimum).
- **What the rule prevents:**
  - **The remainder test:** a share someone sends into a holder's account cannot block the holder's exit, as an exact-balance test could.
  - **The canonical account:** a balance cannot be split across token accounts into sub-minimum requests.
  - **The floor:** many wallets cannot fill the queue with 1-unit exits. Below the floor a request costs about as much as a normal one.
- **Below the floor:** a balance worth less than the floor waits. It stays transferable and is valued in NAV.
- **A head worth 0 is never filled.** If a head is worth 0 BRS at fill time, `fulfil_redeems` stops the batch with the head untouched (`RequestTooSmall` when nothing was filled). The owner or the admin cancels it (ADR 0023 decision 3), and the shares go back to the owner. This replaces the 0-asset fill of the first version of this ADR: every reference refuses a zero output.

### 7. Claims (ADR 0021): already in the binary

Exact payment of the provision (`expected_amount == provision`), the `approved_amount` requirement above `max_claim_per_call`, and the strict 31-day window of daily buckets (with its naive-oracle property test) shipped with #34 and #37. The two-bucket weighted window, and its "weight rounds up" rule, were superseded by the daily buckets before they were built. `approve_claim`, `amend_claim` and `refile_claim` remain Wave 2.

### 8. Events

The events of ADR 0023 are final since #37: `DepositFilled` per fill, `QueueHeadsAdvanced`, `FulfilHaltRaised` with a source, and `count` in `1..=8`. No event changes here.

### 9. The design references, per decision

The founders asked for each open choice to follow the design references credited in the README:
- the solana-foundation/vault async vault (SF, @ c359962);
- OnRe (`onre-sol` @ c049083), with its OtterSec, Ackee and Quantstamp audits;
- MUTAV's own research under `docs/research/`.

- **Zero output.** All three references refuse a redemption that pays nothing:
  - SF: `calculate_assets` errors when `assets == 0` (`utils.rs:103-106`), and `create_redeem_request` requires `amount > 0`;
  - OnRe: `require!(result > 0)` (`redemption_utils.rs:102`), adopted after OtterSec SUG-00 ("Zero Outputs Bypass Redemption Safeguards");
  - Quantstamp 3f38 asked for the same on a buy amount that truncates to zero.

  **Followed:** decision 6, a head worth 0 is not filled, and `value > 0` at request.
- **Zero price.** SF refuses approvals until `nav > 0` (`approve_request.rs:164`, `NavIsNotSet`); OnRe refuses `price == 0` (`token_utils.rs:150`).

  **Followed, adapted:** our NAV is derived, not set, so "zero" means below the smallest unit we publish (`nav_per_share` floors at 10⁻⁹ BRS): decision 3.
- **Minimum redemption.**
  - SF's opt-in `MinRedemption` extension rejects any request below a threshold at request time (`extensions/min_redemption/processor.rs:28`), with no exemption for a full exit.
  - OnRe has no minimum size; it leaves dust to its backend ("will not fulfill dust amounts", OtterSec SUG-03).
  - ADR 0010, our own partial-fill design, never leaves a remainder below `min_request`.

  **Followed:** SF's threshold for normal requests (`min_request`), and ADR 0010's remainder rule to define an exit of the balance below it.
- **Where the references are silent, flagged.** None of them exempts a full exit below the minimum (the founders' Q-1 decision does), and none addresses dust from many wallets or shares sent into a victim's account. The nearest behaviour is SF's threshold, and OnRe's minimum fee floor (`minimum_token_in_fee_amount`, `redemption_utils.rs:69-73`) is an absolute floor of the same kind. **The floor at `min_request / 10` is MUTAV's own value, not taken from a reference;** it keeps Q-1's exemption while bounding the spam the reviewers found.

## Alternatives considered

- **Latch the halt inside the fill** (set `fulfil_halted`, emit `FulfilHaltRaised` with a fill source, return success with no fill). Records the move atomically, but a Squads proposal would show as executed when it moved nothing, and "a call that fills nothing fails" would no longer hold. Rejected; `refresh` latches it.
- **Leave `fulfil_redeems` to the solvency gate when underwater.** Misses the case where BRS equals provisions exactly. Rejected.
- **Fill a 0-value head as a 0-asset fill** (this ADR's first version). It keeps the queue moving, but it burns shares for nothing, which every reference refuses, and in a near-underwater reserve it would burn most of the queue. Replaced by the refusal plus the cancel, and the sub-minimum floor keeps 0-value heads rare.
- **Underwater only at `net_assets == 0`** (this ADR's first version). With BRS one unit above provisions, heads below about half the supply were paid 0. Replaced by the smallest-unit test.
- **SF's threshold with no exemption.** It would leave every balance below `min_request` unable to exit, against the founders' Q-1 decision. Rejected for the exit-of-balance rule with a floor.
- **An exact-balance full exit** (this ADR's first version). One share sent into the account blocks it. Replaced by the remainder test.
- **Full exit from any token account.** Lets a holder split a balance across accounts into many sub-minimum requests. Rejected for the canonical associated token account only.
- **No bound on `stress_buffer`.** Rejected: one bound against typos costs nothing.

## Consequences

- **Positive.** Coverage includes the next likely claims; a shock between two `refresh`es cannot be filled across; the first window after launch is measured; no fill pays 0 or burns shares for nothing; dust cannot be split into the queue; a de-listed holder can leave.
- **Negative.** A fill refused by the inline guard must be followed by a `refresh` to record the halt; `/admin` sends one. Fees and income before the first deposit wait off-reserve. A head worth 0 at fill time (rare above the floor) needs a cancel. A balance below the floor cannot be redeemed until it grows or is transferred.
- **Program.** Errors `ReserveUnderwater` and `NoSharesOutstanding` appended (IDL change, client regenerated). No layout or interface change; `idl-compat` stays green.
- **Client.** `coverageRequired` and `computeSolvency` take the stress buffer (optional, `0n` by default, so existing callers compile; `solvencyFromAccounts` reads it from the decoded config). `isUnderwater` and `redeemSizeError` mirror decisions 3 and 6. `previewRedeemFulfil` stops at a 0-value head, honours `min_assets_out` and refuses an underwater reserve. `previewDepositFulfil` returns `{ fills, stoppedBy }` with the underwater, zero-share and price-limit stops. Vectors cover the stress term, the underwater test and the size rule.
- **Simulator.** It applies the stress term (devnet R$19k, a Specs input), with a parity test against the client.
- **Follow-ups.** `app/lib/gate.ts` passes the stress buffer to `coverageRequired` (with the rename PR); the inline guard in the client previews (C2, Wave 2); `book_unsolicited(BACKSTOP)` replaces the interim recovery (Wave 2).

## References

- ADRs 0010, 0016, 0017, 0019, 0020, 0021, 0022, 0023, 0024, 0026.
- solana-foundation/vault @ c359962: `utils.rs`, `approve_request.rs`, `create_redeem_request.rs`, `extensions/min_redemption/processor.rs`.
- OnRe `onre-sol` @ c049083: `redemption_utils.rs`, `token_utils.rs`; OtterSec (Aug 2026) SUG-00, SUG-03; Quantstamp 3f38.
- `docs/research/vault-function-comparison.md`, `onre-comparable.md`, `redemption-economics.md`.
- Adversarial review: F2, F3, F4, F6, AV-6, Q-1, NEW-B.
- Spec §3.2, §4, §5.1, §5.3, §5.3a, §5.5, §8, §10.
