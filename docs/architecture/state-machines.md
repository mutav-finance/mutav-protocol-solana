# State machines

The lifecycles the program enforces in the devnet release: guarantees, claim filings with their payment and settlement, deposit and redemption requests, and the reserve-level flags that gate them. Statuses are `u8` constants. An unknown value fails closed.

## Guarantee

One `Guarantee` account per lease. It is never closed, so the public claims history stays readable.

```mermaid
stateDiagram-v2
  [*] --> ACTIVE: register_guarantee (operator, solvency-gated)
  ACTIVE --> CLOSED: close_guarantee(RELEASED)
  ACTIVE --> CLOSED: close_guarantee(VOID)
  CLOSED --> ACTIVE: reinstate_guarantee (within max_reinstate_age)
```

| Transition | Signer | Rules | Effect |
|---|---|---|---|
| Register | Operator | Not paused. Reserve not frozen (`ReserveFrozen`). Rent and cover above 0. Cover within `max_cover_per_guarantee`. Normal mode. The new `coverage_required` fits in stable assets | `ACTIVE`. Cover added to `remaining_cover_total` at once |
| Close, `RELEASED` | Operator | `ACTIVE`, no open claim | `CLOSED`, `closed_at = now`. Remaining cover released. Never solvency-gated |
| Close, `VOID` | Operator | `ACTIVE`, no open claim, and nothing paid on either leg | Same as above. Used when the lease never took effect or the registration was an error |
| Reinstate | Operator | `CLOSED`, and the close is no older than `max_reinstate_age` (30 days on devnet). Not pause-gated, not solvency-gated, no caps | `ACTIVE`, `closed_at = 0`, remaining cover restored. Emits `GuaranteeReinstated` |

Covers never change after registration. The two legs are sub-limits of one fiança: `default_cover` for rent and charges in arrears, `exit_cover` for end-of-occupation debts.

The fuller fiança lifecycle (exoneration notice, keys returned, claims tail, exhaustion) is planned work ([ADR 0012](../decisions/0012-fianca-aligned-guarantee-lifecycle.md)). Its fields fit in the grown `Guarantee` padding, and its states arrive as new status constants. In the pilot, `RELEASED` requires `ACTIVE`.

## Claim filing

A `ClaimFiling` is keyed by guarantee and `notice_ref_hash`. Each filing is one event, such as one month's rent. The filing also holds its payment and settlement record (`approved_amount`, `payments_account`, `paid_at`, `paid_amount`, `pix_e2e_hash`, `settled_at`); there is no separate payout account.

| Value | Status | Meaning |
|---|---|---|
| 0 | `FILED` | Provisioned, awaiting payment |
| 1 | `PAID` | Paid by the reserve to the payments account; no further amendment |
| 2 | `WITHDRAWN` | Provision released; may be re-filed |
| 3 | `SETTLED` | Payment recorded as delivered off-chain; terminal |

Status values are append-only.

```mermaid
stateDiagram-v2
  [*] --> FILED: file_claim (operator)
  FILED --> FILED: amend_claim to a new amount above 0 (operator), resets approval
  FILED --> FILED: approve_claim (admin), above the per-call cap
  FILED --> PAID: pay_claim (operator), exactly the provision
  FILED --> WITHDRAWN: amend_claim to 0 (operator)
  WITHDRAWN --> FILED: refile_claim (operator)
  PAID --> SETTLED: settle_payout(pix_e2e_hash) (operator)
  SETTLED --> [*]
```

| Transition | Signer | Rules | Effect |
|---|---|---|---|
| File | Operator | Guarantee `ACTIVE`. Amount above 0 and within the leg's unprovisioned cover (`leg_cover − leg_paid − leg_provision`). No cap on the filed amount. Never paused, never solvency-gated | `FILED`. Provision booked on the leg and in `provisions`. `open_claims` rises. NAV falls at once |
| Amend | Operator | `FILED`. A higher amount stays within the leg's unprovisioned cover. Refused on `PAID` and `SETTLED`. Not pause-gated | Lower: the difference is released. Higher: more is booked. `approved_amount` reset to 0. Emits `ClaimAmended { old, new }` |
| Withdraw (amend to 0) | Operator | `FILED`. Not pause-gated, never solvency-gated | `WITHDRAWN`. Whole provision released, `open_claims` falls, coverage recomputed. Emits `ClaimWithdrawn` |
| Approve | Admin | `FILED`. Needed only when the provision is above `max_claim_per_call`. Not pause-gated | Records `approved_amount`, binding that exact amount. The admin approves the amount leaving the reserve, not the claim's validity |
| Pay | Operator | `pay_claim(notice_ref_hash, expected_amount)`. `FILED`, leg matches, `expected_amount` equals the provision. At or below `max_claim_per_call`, or `approved_amount` equals the provision. Payments of the last 31 days plus this one within `max_claim_per_period`. Destination is the payments account. Reserve not frozen and enough liquid BRS. No solvency, mode, pause or NAV-guard check | `PAID`. Leg paid rises, provision released, BRS to the payments account. `paid_at`, `paid_amount` and `payments_account` recorded on the filing |
| Re-file | Operator | `refile_claim`, same arguments as `file_claim`. `WITHDRAWN` only | `FILED` again with a fresh `provision`, `filed_at` and `approved_amount = 0`. An old approval is never reused |
| Settle | Operator | `PAID` | `SETTLED`. `pix_e2e_hash` and `settled_at` recorded |

To settle a claim for less than filed, the operator amends it down, then pays. Until `approve_claim` ships, a claim above `max_claim_per_call` is paid by MUTAV from its bank first, and the reserve reimburses the payments account once the approval exists.

`settle_payout` records the hash of the Pix end-to-end ID after MUTAV pays the agency. It is a settlement record only. The program has no payout deadline; the payment service level (contractual term plus a 48-hour target) lives in the MUTAV platform. A settlement receipt hash (`quitacao_hash`) arrives later as a new instruction version.

### The sliding claim window

`VaultState` holds 31 daily buckets (`claim_day_buckets`), a ring of payment totals indexed by day number, and the day of the last write (`claim_day_anchor`). A bucket older than 31 days is cleared before it is reused. A payment passes only if:

```text
sum(payments of the last 31 days) + amount ≤ max_claim_per_period
```

The rule is exact: there is no weighting or estimate. Every 30-day span lies inside some 31-day window of whole days, so no 30-day span pays out more than the cap, approved payments included. The window length is fixed by the bucket count; there is no period parameter. On devnet the cap is R$20k per 31-day window.

## Deposit request

```mermaid
stateDiagram-v2
  [*] --> PENDING: request_deposit (owner, allowlisted)
  PENDING --> FULFILLED: fulfil_deposits (admin)
  PENDING --> Closed: cancel_deposit (owner or admin)
  FULFILLED --> Closed: claim_shares (owner)
  Closed --> [*]
```

| Transition | Signer | Rules | Effect |
|---|---|---|---|
| Request | Owner | Not paused. Allowlist proof. `min_request ≤ assets ≤ max_request` | BRS escrowed in `pending_deposits` at the next `seq` |
| Fill | Admin | Not paused. Strict FIFO from `deposit_head`. Not halted; the NAV-move guard runs inline. NAV inside `nav_bounds`. Reserve not frozen. Within `max_tvl`. Not underwater. Mints more than 0 shares. `count` from 1 to 8 | `FULFILLED`. Emits `DepositFilled` per fill, and an event when the head moves with no fill. BRS to `reserve`. `shares_out` owed at the fill's NAV |
| Claim | Owner | `FULFILLED`. Runs under pause | Shares minted to the owner's associated token account, created idempotently. Request closed, rent to the owner |
| Cancel | Owner or admin | `PENDING`. Runs under pause. Destination is the owner's own BRS associated token account, created idempotently with the signer as payer; the owner is bound to the address stored in the request | BRS and rent back to the owner. Request closed. The event names who signed (`by`). An admin cancel unblocks the queue when the owner is de-listed or unreachable |

## Redemption request

```mermaid
stateDiagram-v2
  [*] --> PENDING: request_redeem (owner)
  PENDING --> FILLED: fulfil_redeems (admin), whole fill
  PENDING --> Closed: cancel_redeem (owner)
  FILLED --> Closed: claim_assets (owner)
  Closed --> [*]
```

| Transition | Signer | Rules | Effect |
|---|---|---|---|
| Request | Owner, never a delegate | Not paused. Shares above 0. No proof needed for a wallet that already holds shares. Value at the current NAV within `min_request` and `max_request`, except that a full exit skips `min_request` (value above 0, from the owner's canonical share associated token account only) | Shares escrowed in `pending_redemptions` at the next `seq` |
| Fill | Admin | Not paused. Strict FIFO from `redeem_head`. Normal mode. Not halted; the guard runs inline. NAV inside `nav_bounds`. Each fill within `min(max_assets − paid, free_capital, liquid_budget)`. Whole fills only. Up to 8 per call. A call with no fill fails | `FILLED`. Escrowed shares burned, BRS moved to `claims` |
| 0-value head | Admin | The head request is worth 0 at the current NAV | Filled as a 0-asset fill: shares burned, request closed. The queue keeps moving |
| Claim | Owner | `FILLED`. Runs under pause | BRS from `claims` to the owner's associated token account, created idempotently. Request closed |
| Cancel | Owner | `PENDING`. Runs under pause | Escrowed shares returned to the owner. Request closed |

The devnet release fills whole requests only, so a head larger than the budget waits until free capital grows. The consoles show what a stuck head needs against what is available. Partial fills at the queue head ([ADR 0010](../decisions/0010-partial-fills-at-queue-head.md)) come in the first upgrade after the hackathon, as carves held by the padding test, with any fee or rounding computed once per request.

### Queue mechanics

- Each request is its own PDA at a monotonically increasing `seq`. A `seq` is never reused. Two requests sent at once may race for the same `seq`; the client retries with the next one.
- `advance_queue_head(queue, max)` (anyone) moves one queue's head over closed or empty requests and stops at the first live one. It moves no money.
- Cancels and claims never pause, so holders' money is never trapped by a pause.
- The owner's associated token account is created idempotently by `cancel_deposit`, `cancel_redeem`, `claim_shares` and `claim_assets`; the caller pays the rent.

### Exit fallback

When the head redemption has waited longer than `max_queue_wait_secs`, counted from the head request's own timestamp, anyone may fill it under the same rules as the admin: free capital, FIFO, the program's NAV guard and halt, the claim-notice gate and pause. A permissionless fill takes no `nav_bounds`; it relies on the program's guard. The field ships at 0 (off) in the devnet release. The fill path is built together with the claim-notice gate, before any outside capital. The upgrade time lock is kept at or above the wait (7 days and 7 days on a real pilot), so holders can leave before an upgrade executes.

## Reserve-level flags

Three independent flags gate what the program accepts.

```mermaid
stateDiagram-v2
  state Mode {
    [*] --> NORMAL
    NORMAL --> UNDER_COVERED: stable_assets below coverage_required
    UNDER_COVERED --> NORMAL: capital in or cover runs off
  }
  state FulfilHalted {
    [*] --> Running
    Running --> Halted: NAV-move guard trips
    Halted --> Running: clear_fulfil_halt (admin)
  }
  state Pause {
    [*] --> Open
    Open --> Paused: pause (pauser, guardian, admin)
    Paused --> Open: unpause (admin)
  }
```

| Flag | Set by | Cleared by | Stops |
|---|---|---|---|
| `mode = UNDER_COVERED` | `refresh`, when stable assets are below `coverage_required` | `refresh`, once capital comes in or cover runs off | New guarantees and redemption fills. Never claim payments. Public label: "reserve below target; MUTAV backstop active" |
| `fulfil_halted` | `refresh`, when NAV moves beyond `max_nav_move_bps` net of verified inflows. Both fill instructions also evaluate the guard inline and refuse with `FulfilHalted` | `clear_fulfil_halt` (admin), which resets the guard baseline. Refused with `ReserveFrozen` while the reserve is frozen | Deposit and redemption fills. The halt is sticky |
| `paused` | `pause` | `unpause` (admin) | Requests, fills and new guarantees only |

Coverage required is:

```text
unprovisioned     = remaining_cover_total − provisions
coverage_required = max( ceil(c × remaining_cover_total / 10_000),
                         provisions + min(stress_buffer, unprovisioned) )
```

with c = 0.10 (1,000 bps, capped at 10,000 bps) and `stress_buffer` = R$19k on devnet. When net assets are 0 while shares are outstanding, `fulfil_deposits` refuses with `ReserveUnderwater`; MUTAV recapitalizes with a backstop booked as `BACKSTOP`, which mints no shares. A frozen reserve counts as 0 BRS in every solvency computation that reads it. Devnet keeps `max_nav_move_bps` at 10,000 so a claim against a small demo reserve does not halt fills; the guard is proven in tests and is lowered for a real pilot.

## Sources

- [Protocol specification, §3.5.1 Guarantee lifecycle](../spec.md#351-lifecycle), [§5.4 Claims and payouts](../spec.md#54-claims-and-payouts-operator) (being updated to ADR 0021), [§5.5 Investor capital](../spec.md#55-investor-capital-async), [§6 Under-coverage mode](../spec.md#6-under-coverage-mode), [§8 Caps](../spec.md#8-caps)
- [Litepaper, §7 Guarantee lifecycle](../litepaper.md#7-guarantee-lifecycle) and [§9 Capital flows](../litepaper.md#9-capital-flows)
- Status constants: [`programs/mutav/src/constants.rs`](../../programs/mutav/src/constants.rs)
- Structs: [`state/guarantee.rs`](../../programs/mutav/src/state/guarantee.rs), [`state/claim.rs`](../../programs/mutav/src/state/claim.rs), [`state/request.rs`](../../programs/mutav/src/state/request.rs)

## Decisions

- [ADR 0005: Solvency gate scope](../decisions/0005-solvency-gate-scope.md)
- [ADR 0008: One capital flow for everyone; FIFO deposits; pause never blocks claims](../decisions/0008-uniform-capital-flow-and-pause-scope.md)
- [ADR 0010: Partial fills at the head of the redemption queue](../decisions/0010-partial-fills-at-queue-head.md) (deferred in the devnet release)
- [ADR 0012: Guarantees aligned with a limited fiança onerosa](../decisions/0012-fianca-aligned-guarantee-lifecycle.md)
- [ADR 0014: `pay_claim` bound with concurrent filings on one leg](../decisions/0014-pay-claim-bound-with-concurrent-filings.md)
- [ADR 0015: Admin clear for the NAV-move halt](../decisions/0015-admin-clear-fulfil-halt.md)
- [ADR 0016: Coverage ratio below 1.0](../decisions/0016-coverage-ratio-below-one.md)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md) (amends 0016)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md)
- [ADR 0025: Exit fallback: a cooldown exit after `max_queue_wait_secs`](../decisions/0025-exit-fallback-cooldown-exit.md)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md)
