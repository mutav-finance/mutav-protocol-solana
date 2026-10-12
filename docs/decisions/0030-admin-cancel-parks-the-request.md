# 0030 — The admin's cancel parks the request

- **Status:** Accepted (2026-10-11), from the Wave 1 security audit (queue wedge, High). Amends ADR 0023 decision "who may cancel": the admin's `cancel_deposit` / `cancel_redeem` no longer refunds, it parks. Logic only: no account layout, instruction argument or account list change; one status value appended per request account and two events appended.

## Context

ADR 0023 lets the owner **or the admin** sign `cancel_deposit` and `cancel_redeem`, so a head that cannot fill (a de-listed investor, or a price limit no fill can meet) is removed and the queue behind it moves. Both paths refunded at once: they created the owner's associated token account idempotently and transferred the escrow into it.

The audit found that the owner controls whether that refund can succeed:

- BRS and the share mint are classic SPL Token, so an associated token account's owner can hand it to another key with `SetAuthority(AccountOwner)`. `create_idempotent` then fails with `InvalidOwner` and the cancel reverts.
- A Token-2022 reserve mint has the same failure through the `MemoTransfer` account extension (the program sends no memo), and an issuer freeze of the owner's account has it too.

A holder who requests with `min_assets_out = u64::MAX` (or `min_shares_out = u64::MAX`) and then breaks its own account stops every fill at its request (`PriceLimitNotMet`), makes every cancel revert, and `advance_queue_head` never skips a pending request. The queue is wedged until a program upgrade. That breaks the locked decisions: no stuck money, the exit right, and "admin cancel exists to unstick queues".

## Decision

1. **The admin's cancel always parks.** When the signer is the admin (not the owner) and the request is `PENDING`, the program sets a new status, `DEPOSIT_CANCELLED = 2` / `REDEEM_CANCELLED = 2`, and does nothing else: no account creation, no transfer, no close. It emits `DepositParked` / `RedeemParked { owner, seq, assets | shares, by }`. A request that is not `PENDING` is refused (`InvalidRequestStatus`), so the admin cannot park a filled or an already-parked request.
2. **Parked funds stay owed to the owner.** The BRS stays in `pending_deposits` and in `pending_deposits_total`; the shares stay in `pending_redemptions`, in `pending_redeem_shares` and in `shares_outstanding`. NAV, coverage, free capital and the TVL check are unchanged by a park: escrowed deposits were never in `stable_assets`, and escrowed shares still count in the supply until they leave.
3. **A parked request is dead for the queue.** `fulfil_deposits` and `fulfil_redeems` skip it (they fill only `PENDING`), and `advance_queue_head` moves past it (the deposit test becomes `status != PENDING`, as the redeem test already was). `claim_shares` and `claim_assets` refuse it, because they require `FULFILLED` / `FILLED`: parked funds can never be taken as a fill.
4. **Only the owner collects.** The owner's `cancel_*` accepts `PENDING` or the parked status: it creates its associated token account idempotently (the owner pays), returns the BRS or shares, decrements the pending total and closes the request (rent to the owner). It emits `DepositCancelled` / `RedeemCancelled` as before. If the owner's account still refuses the transfer, only the owner's own call fails; the queue is already moving.
5. **Never pausable**, as before (ADR 0008, ADR 0020).

## Alternatives considered

- **Admin refunds when it can, parks only on failure.** A failed CPI cannot be caught inside one instruction, so "on failure" would need a second instruction or a flag the admin chooses. More surface, same result. Rejected for the simpler rule the verifier recommended.
- **Admin refunds to another account** (a program escrow or the treasury). Moves the owner's money to an account the owner did not choose; rejected (money flows stay apart, ADR 0009).
- **Let `advance_queue_head` skip a pending request with an unmeetable limit.** Needs a judgement of "unmeetable" in a permissionless crank; rejected.
- **Bound the price limits at request time** (refuse `min_assets_out > assets_for(shares) × (1 + max_nav_move_bps)` at the current NAV, and likewise `min_shares_out`). Considered as defence in depth and **not adopted**: any limit just above the current price is equally unfillable while NAV is flat, so the bound does not close the wedge; only parking does. It would also refuse legitimate limits set in anticipation of NAV growth during a long wait, and with devnet `max_nav_move_bps = 10_000` it would allow 2× anyway.

## Consequences

- **Positive.** No owner action can stop the admin from moving a queue; parked funds are never lost, never filled and never claimable by anyone but the owner. The Token-2022 `MemoTransfer` and frozen-account cases are covered by the same rule.
- **Negative.** A de-listed investor's BRS is no longer pushed back to it by the admin: the investor collects it with its own `cancel_deposit`. `/investor` shows a parked request as "parked" with the owner's cancel action.
- **Program.** Status values `DEPOSIT_CANCELLED = 2` and `REDEEM_CANCELLED = 2` (accepted by the request version guards); events `DepositParked` and `RedeemParked` appended. `cancel_deposit` closes its request in the handler instead of through the `close` constraint. Account lists, arguments and layouts unchanged; `idl-compat` stays green.
- **No expiry, no sweep (accepted).** A parked request never expires and nothing sweeps it. If the owner never returns, its BRS stays in `pending_deposits` (counted in `pending_deposits_total`) or its shares stay in `pending_redemptions` (counted in `pending_redeem_shares` and `shares_outstanding`) indefinitely. Parked deposits are outside `stable_assets` and NAV; parked shares keep their pro-rata claim on net assets, exactly as if the owner still held them. A sweep would move an owner's funds without its signature, which this ADR exists to avoid.
- **Griefing churn.** An owner can loop: request with an unfillable limit, the admin parks it, the owner cancels and collects, and so on. Each round costs the owner only refundable capital and the request's rent (returned on collect), and costs the admin one timelocked transaction. The queue never stalls, so this is a nuisance, not a wedge. The runbook monitors repeat parks per owner (`DepositParked` / `RedeemParked` events) and, for a repeat offender, removes the wallet from the allowlist (its exit stays open).
- **Client.** Status constants and helpers (`DEPOSIT_*`, `REDEEM_*`, `isQueued`, `isParked`) in `clients/js`; queue-position reads already treat any non-pending status as dead. The new events shift the numeric values of the generated `MutavEvent` enum (see the client README).
- **Runbook.** When the admin parks a request, tell the owner how to collect it; watch for repeat parks by the same owner.

## References

- ADRs 0008, 0009, 0010, 0020, 0023, 0029.
- Wave 1 security audit: queue wedge via associated token account owner reassignment (High).
- Spec §3.8, §4, §5.5, §5.8, §9.
