# Known limitations

The devnet release leaves some designed features for later. None of the items below is a feature of this release. Where the layout needs room for a later feature, the room is already carved or reserved, so no account migration is needed.

## Timing labels

| Label | Meaning |
|---|---|
| First upgrade | The first program upgrade after the hackathon. |
| Before outside capital | Built before any capital provider other than MUTAV can deposit. |
| Before mainnet | Decided and built before the mainnet `initialize`. |
| Later | Planned, no milestone fixed. |

## Deferred features

| Item | v1 behaviour | Plan | Timing |
|---|---|---|---|
| **Partial fills at the queue head** ([ADR 0010](../decisions/0010-partial-fills-at-queue-head.md)) | Whole fills only. A head request larger than the fill budget waits until free capital grows. Demo request sizes stay below free capital, and the operator and admin consoles show what a stuck head needs against what is available. | Head-only partial fills at the NAV of each fill. The request fields already exist. Any rounding or fee is computed once per request, not once per fill. | First upgrade |
| **Exit fallback** | The field (`max_queue_wait_secs`) is carved with value 0, which means off. | After `max_queue_wait_secs`, anyone can fill the head redemption under the same rules as the admin: free capital, FIFO, NAV guard, claim-notice gate, pause. The upgrade time lock stays at least the maximum wait. | Before outside capital, together with the claim-notice gate |
| **Claim-notice gate** (`ClaimNotice`, `pending_notices`) | The gate exists in both fill instructions but is inert: `pending_notices` stays 0. Runbook: file the claim before any fill. | The operator flags a known missed rent before it is filed, and both queues refuse fills while a notice is open, so nobody enters or leaves at a NAV that misses a known loss. | Before outside capital |
| **Cumulative NAV-guard baseline** | The guard compares each move with the last published NAV, so a slow drift below the bound across many refreshes is not caught. On devnet `max_nav_move_bps` is 10,000 (100%), because a claim against a small demo reserve is a real NAV move; the guard is proven in LiteSVM tests. Admin `nav_bounds` on each fill still apply. | A cumulative baseline carved from padding, with a real-pilot `max_nav_move_bps`. | First upgrade |
| **Requester price protection** (`min_assets_out`) | A redemption fills at the NAV of the fill, inside the admin's `nav_bounds`. The requester sets no minimum. | A minimum carved from request padding. Needs its own ADR. | Later |
| **Transfer-restricted shares** | Devnet shares are classic SPL tokens and transfer freely. The share mint's freeze authority is the vault authority PDA and is unused. | Shares restricted at the token level. The mechanism is chosen with the mainnet design and must fit the open-exit rule. | Before mainnet |
| **Adapters and a second reserve asset** ([ADR 0002](../decisions/0002-core-program-and-capped-adapters.md), [ADR 0018](../decisions/0018-brs-only-pilot-reserve.md)) | BRS only. The settlement floor is 100%. Adapter slots are all zero. | A program upgrade adds allocation instructions and the `AdapterState` account, with capped sub-authorities, a reentrancy guard and post-CPI reload and delta checks. | Later |
| **Phase-2 instant exit** ([ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)) | Designed and disabled. `SUPPORTED_FEATURES = 0`, so it cannot be switched on. | A time-locked upgrade, then a separate time-locked config change after an observation period. | Later |
| **Fiança lifecycle states** ([ADR 0012](../decisions/0012-fianca-aligned-guarantee-lifecycle.md)) | Guarantees are ACTIVE or CLOSED. Close needs no open claim; VOID also needs nothing paid. `settle_payout` records only the Pix hash. | Exoneration, lease end, exhaustion, a claims tail, claim categories and the settlement receipt hash, carved into the grown padding of `Guarantee`, `ClaimFiling` and `Payout`. Settlement attestation becomes required once the operator and the admin are separate companies. | Later |

## Accepted constraints of this release

| Item | Detail |
|---|---|
| Claim payments with the operator key are final | Bounded by the per-call and sliding 30-day caps. Everything else the operator does is reversible. See [Incident response](incident-response.md#operator-compromise). |
| Issuer freeze authority on a single key | The BRS issuer can freeze any BRS account. Acceptable for devnet; raised with the issuer before mainnet. |
| No on-chain per-agency concentration limit | The per-agency cap was removed. Per-agency figures are derived from guarantee accounts in the app. A future concentration limit would be a new account. |
| Take from issuer income | Fixed at 0. The cap is undecided (TBD, spec §12 Q47), so the program fails closed at 0. |
| Concurrent requests race on the sequence number | Request accounts use global sequence seeds. A client retries with the next sequence when the account is already in use. |
| Payout deadlines are off-chain | The program has no payout deadline. Deadlines live in the MUTAV platform. The program's promise is that, within the caps, `pay_claim` is never refused. |
| Unaudited | See [Reviews and audits](reviews-and-audits.md). |

## Sources

- [Specification §3.12 `ClaimNotice`](../spec.md#312-claimnotice), [§12 Open questions](../spec.md#12-open-questions), [§13 Phase 2](../spec.md#13-phase-2--instant-exit-designed-disabled-in-the-pilot), [§14.2 Padding and version](../spec.md#142-padding-and-version), [§14.3 Feature flags](../spec.md#143-feature-flags)
- Technical reference §13.2, devnet release design (branch `docs/protocol-reference`, PR #32)
- Pre-devnet design decisions log, 2026-10-09 to 2026-10-10 (internal notes): deferred items, exit fallback, transfer-restricted shares, agency cap removal, payout deadline removal
- Code: [`programs/mutav/src/constants.rs`](../../programs/mutav/src/constants.rs), [`programs/mutav/src/state/request.rs`](../../programs/mutav/src/state/request.rs)

## Decisions

- [ADR 0002: One core program plus adapter programs with capped sub-authorities](../decisions/0002-core-program-and-capped-adapters.md)
- [ADR 0010: Partial fills at the queue head](../decisions/0010-partial-fills-at-queue-head.md)
- [ADR 0011: Phase-2 instant exit and upgrade readiness](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)
- [ADR 0012: Guarantees aligned with a limited fiança onerosa](../decisions/0012-fianca-aligned-guarantee-lifecycle.md)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- Pending ADR: 0019 v1 layout for the devnet release (payout deadline removal, agency-cap removal, carved fields)
- Pending ADR: Exit fallback
- Pending ADR: Exit rights (open exit, full exit below minimum, refunds)
