# Deposits and redemptions

During the pilot the reserve is not open to public investment.

Capital enters and leaves the reserve through two asynchronous, first-in first-out (FIFO) queues. A capital provider makes a request; the reserve admin fills the queue in order at the NAV of the fill; the provider then collects shares or BRS. Nobody, MUTAV included, can move capital in or out any other way.

## The two queues at a glance

| | Deposit | Redemption |
|---|---|---|
| Request | `request_deposit(assets, min_shares_out, eligibility)` | `request_redeem(shares, min_assets_out, eligibility)` |
| What is escrowed | BRS in `pending_deposits` | Shares in `pending_redemptions` |
| Who fills | Reserve admin, `fulfil_deposits(count, nav_bounds)` | Reserve admin, `fulfil_redeems(count, max_assets, nav_bounds)` |
| Price | NAV at the fill | NAV at the fill |
| Size of a fill | Whole request | Whole request in the pilot |
| Collect | `claim_shares()` | `claim_assets()` |
| Cancel before a fill | `cancel_deposit()`: the owner collects; the admin parks | `cancel_redeem()`: the owner collects; the admin parks |
| Entry check | Allowlist proof (`Eligibility::Merkle { proof }`) | Checked only when the debited share account is empty, so holders skip it |

Each request is its own PDA, seeded `["deposit", config, seq]` or `["redeem", config, seq]`. The `seq` comes from a counter in `VaultState` and is never reused. Two requests sent at the same moment can race for the same `seq`; the client retries with the next one.

## Deposit flow

```mermaid
sequenceDiagram
    participant P as Capital provider
    participant Prog as mutav program
    participant A as Reserve admin (Squads)
    P->>Prog: request_deposit(assets, min_shares_out, eligibility)
    Note over Prog: BRS escrowed in pending_deposits<br/>Not counted in NAV
    A->>Prog: fulfil_deposits(count, nav_bounds)
    Note over Prog: FIFO from deposit_head<br/>shares_out = shares_for(assets) at live NAV<br/>BRS moves to reserve
    P->>Prog: claim_shares()
    Note over Prog: Shares minted to the provider<br/>Request closed, rent returned
```

1. **Request.** The provider sends BRS from its own token account. The program checks that the reserve is not paused, that the Merkle proof is valid, and that the size is within `min_request` and `max_request`. `min_shares_out` is the provider's own price limit. The BRS waits in `pending_deposits`. It does not count in the reserve's assets or NAV.
2. **Fill.** The admin fills 1 to 8 requests per call (`count`), in strict FIFO order from `deposit_head`. Each fill mints shares at the live NAV and emits `DepositFilled`; a head that moves past closed requests with no fill emits an event too. A fill is refused when:
   - the reserve is paused, or fills are halted (`FulfilHalted`). The NAV-move guard also runs inside the fill, once at the start of the batch, with the same rule as `refresh`. An inline trip refuses the fill but does not latch the halt; the next `refresh`, which anyone can send, records it;
   - the live NAV falls outside the `nav_bounds` the admin's proposal fixed (`NavOutOfBounds`);
   - a reserve token account is frozen (`ReserveFrozen`);
   - the fill would take stable assets above `max_tvl` (`TvlCapExceeded`);
   - the reserve is underwater: NAV per share is below the smallest published unit while shares are outstanding (`ReserveUnderwater`).

   A request that would mint 0 shares, or would miss its `min_shares_out`, stops the batch there and stays pending; a batch that fills nothing fails (`RequestTooSmall` or `PriceLimitNotMet`). The batch that mints the first shares also seeds the NAV-move guard's baseline.
3. **Claim.** The provider calls `claim_shares` at any time after the fill. Shares from a filled but unclaimed deposit already count in `shares_outstanding`, so they share in every later NAV change.

Deposit fills are allowed while the reserve is below its coverage target. New capital is how the reserve recapitalises, and the new depositor buys at a NAV that already reflects the loss.

## Redemption flow

```mermaid
stateDiagram-v2
    [*] --> PENDING: request_redeem
    PENDING --> FILLED: fulfil_redeems (whole fill)
    PENDING --> CANCELLED: cancel_redeem
    FILLED --> [*]: claim_assets (closes)
    CANCELLED --> [*]: shares returned (closes)
```

1. **Request.** The provider escrows shares from its own share token account; delegates are never used. The size is checked in BRS at the current NAV, `value = assets_for(shares)`: 0 is refused, above `max_request` is refused, and from `min_request` up is a normal request. Below `min_request` only an exit of the balance is allowed (see [Exit rights](#exit-rights)). `min_assets_out` is the provider's own price limit.
2. **Fill.** The admin fills up to 8 requests in strict FIFO order from `redeem_head`. Before every fill the program recomputes a budget:

   ```text
   budget = min(max_assets − assets_paid_in_this_call, free_capital, liquid_budget)
   ```

   - `free_capital` is the stable assets above what the guarantees require (`coverage_required`). Redemptions are paid only from this surplus.
   - `liquid_budget` is liquid BRS above the open claim provisions, so an exit never spends BRS a filed claim needs.
   - `max_assets` lets the admin fill less than the budget. It can never change the order.

   Each fill burns the escrowed shares and moves `assets_for(shares)` BRS into the `claims` escrow account. A fill is refused when the reserve is paused, below its coverage target (`UnderCovered`), underwater (`ReserveUnderwater`), halted by the NAV-move guard (evaluated inside the fill, without latching, as for deposits), outside `nav_bounds`, or frozen. A head that would miss its `min_assets_out` stops the batch. A call that fills nothing fails, so an empty batch is never recorded as a success. The batch that burns the last shares clears the guard's baseline to 0, so the next first deposit seeds it afresh.
3. **Claim.** The provider calls `claim_assets` to move the BRS from `claims` to its own BRS account.

### Whole fills in the pilot

The pilot fills whole requests only. If the head request is larger than the budget, the batch stops there and later requests wait. This is a deliberate pilot setting:

- request sizes in the pilot stay below the expected free capital;
- the operator and admin consoles show a stuck head with the amount needed and the amount available;
- partial fills at the head ([ADR 0010](../decisions/0010-partial-fills-at-queue-head.md)) come in the first upgrade after the hackathon. The request fields already exist, so no migration is needed. Any rounding or fee will be computed once per request, not once per fill.

### A head worth nothing

A head worth 0 BRS at the fill is never filled: no fill pays nothing or burns shares for nothing. `fulfil_redeems` stops the batch with the head untouched (`RequestTooSmall` when nothing was filled). The owner cancels it with `cancel_redeem` and the shares go back to it, or the admin parks it; either way the queue moves on. The sub-minimum floor below keeps such heads rare ([ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md)).

## NAV bounds on every fill

Fills are signed by the admin multisig and run after its time lock. The NAV can change between the proposal and the execution. So each `fulfil_deposits` and `fulfil_redeems` call carries `nav_bounds: NavBounds { min, max }`, composed by the admin console when the proposal is created (`min > max` is `InvalidParameter`). If the live NAV at execution is outside that range, the fill is refused with `NavOutOfBounds`. `clear_fulfil_halt` takes the same bounds. Every fill therefore happens at a price the signers saw and approved.

## Cancel and claim rights

These owner actions never depend on the admin, and a pause does not stop them. The admin can also remove a pending request from the queue: it **parks** it ([ADR 0030](../decisions/0030-admin-cancel-parks-the-request.md)), nothing moves, and the escrow stays yours to collect with the same cancel.

| Action | When | Effect |
|---|---|---|
| `cancel_deposit` | Request pending, or parked by the admin | BRS returned to the owner; request closed. The admin's cancel only parks a pending request |
| `claim_shares` | Deposit filled | Shares minted to the owner; request closed |
| `cancel_redeem` | Request pending, or parked by the admin | Shares returned to the owner; request closed. The admin's cancel only parks a pending request |
| `claim_assets` | Redemption filled | BRS paid from `claims` to the owner |

- `cancel_deposit`, `cancel_redeem`, `claim_shares` and `claim_assets` create the owner's associated token account if it does not exist. The caller pays its rent.
- Closed requests return their rent to the owner.
- A cancelled request leaves a gap in the queue. The permissionless `advance_queue_head(queue, max)` crank skips closed requests in one queue per call. It moves no money.

## Exit rights

Entry is gated; exit is open ([ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)).

| Situation | Rule |
|---|---|
| Holder removed from the allowlist | `request_redeem` checks eligibility only when the share token account it debits is empty, which a redemption could not use anyway. A holder can always ask to exit. |
| Pending deposit from a removed or unreachable wallet | The admin signs `cancel_deposit` for that request, which parks it ([ADR 0030](../decisions/0030-admin-cancel-parks-the-request.md)): nothing moves, `DepositParked` names the admin (`by`), and the deposit queue moves on. The BRS stays in escrow, owed to the owner, who collects it with its own `cancel_deposit` into its BRS associated token account. Nothing the owner does to its own token account (frozen, reassigned, memo-required) can stop the park. |
| Balance below `min_request` | Only an exit of the balance. The request must debit the owner's canonical share account (its associated token account), leave a remainder there worth less than `min_request`, and be worth at least `max(1, min_request / 10)` (R$100 at the R$1,000 minimum). A share sent into the account cannot block the exit, and a balance cannot be split across accounts into sub-minimum requests. Deposits keep the minimum. |
| Balance below the floor (`min_request / 10`) | It waits. It stays transferable and is valued in NAV, and can be redeemed once it grows or is combined. |
| Head worth 0 at the fill | Not filled. The owner cancels it and gets the shares back, or the admin parks it and the owner collects later. |
| Reserve paused | New requests wait. Cancels and claims stay open, so escrowed money is never trapped. |
| Reserve below its coverage target | Redemption fills stop until capital comes in or guarantees run off. Requests can still be made and cancelled. |
| Reserve underwater | Deposit and redemption fills stop until MUTAV recapitalizes the reserve. Cancels stay open. |

The app's investor view has a "Redeem all" button for the exit-of-balance case.

### What can delay an exit

An exit is a request, not an instant withdrawal. A filled redemption needs surplus over what the guarantees require. An exit waits when:

- there is not enough free capital or liquid BRS for the head request;
- the reserve is below its coverage target, or underwater;
- the head is worth 0 BRS and waits for a cancel;
- fills are halted by the NAV-move guard until the admin clears it;
- the reserve is paused;
- a reserve token account is frozen by the BRS issuer;
- the admin multisig has not yet filled the queue.

Two planned features shorten these waits: partial fills at the head (first upgrade), and the exit fallback ([ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md), before outside capital). With the exit fallback, once the head redemption has waited longer than `max_queue_wait_secs`, counted from its own request time, anyone can fill it under the same rules: free capital only, FIFO, the program's NAV-move guard and halt, the claim-notice gate and the pause. A permissionless fill carries no `nav_bounds`; it relies on the program's guard. The field is carved now with value 0 (off), and the upgrade time lock is at least as long as that wait (7 days and 7 days on the real pilot).

## Pause scope for capital

| Stopped by a pause | Always open |
|---|---|
| `request_deposit`, `request_redeem` (including a removed holder's), `fulfil_deposits`, `fulfil_redeems` (and `register_guarantee`) | `cancel_deposit`, `cancel_redeem`, `claim_shares`, `claim_assets`, `refresh`, `advance_queue_head`, and every claim and role instruction |

The pauser and up to three guardians can pause with no time lock; the admin can also pause, through its multisig's time lock. Only the admin unpauses.

## Sources

- [Spec §3.8, request accounts](../spec.md#38-depositrequest-and-redeemrequest)
- [Spec §5.5, investor capital](../spec.md#55-investor-capital-async)
- [Spec §5.8, public instructions](../spec.md#58-public)
- [Spec §6, under-coverage mode](../spec.md#6-under-coverage-mode)
- [Litepaper §9, capital flows](../litepaper.md#9-capital-flows)
- Program: [`programs/mutav/src/instructions/capital/`](../../programs/mutav/src/instructions/capital/), [`programs/mutav/src/state/request.rs`](../../programs/mutav/src/state/request.rs)

## Decisions

- [ADR 0008: one capital flow for everyone; FIFO deposits; pause scope](../decisions/0008-uniform-capital-flow-and-pause-scope.md)
- [ADR 0009: separate MUTAV money flows](../decisions/0009-separate-mutav-money-flows.md)
- [ADR 0010: partial fills at the queue head](../decisions/0010-partial-fills-at-queue-head.md) (deferred; the pilot fills whole requests)
- [ADR 0011: phase-2 instant exit and upgrade readiness](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md) (instant exit designed, disabled)
- [ADR 0015: admin clear for the NAV-move halt](../decisions/0015-admin-clear-fulfil-halt.md)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md) (pause scope)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md) (`ReserveUnderwater`)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md) (`nav_bounds`, inline guard, open exit, owner or admin cancel, whole fills)
- [ADR 0025: Exit fallback: a cooldown exit after `max_queue_wait_secs`](../decisions/0025-exit-fallback-cooldown-exit.md)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md) (`advance_queue_head`, no `refund_deposit`)
- [ADR 0029: Claims and capital rules in the program](../decisions/0029-claims-and-capital-rules-in-the-program.md) (underwater test, inline guard and baseline, exit size rule, a head worth 0)
- ADR 0019: v1 layout for the devnet release
