# 0010 — Partial fills at the head of the redemption queue

- **Status:** accepted (2026-10-02). Resolves PC-29. Refines ADR 0008 (strict FIFO redemptions).

## Context

Redemptions are async, strict FIFO by `seq`, fulfilled by the admin only out of `free_capital`, at the NAV at fulfil (ADR 0008). The first spec draft filled whole requests only: the first request that did not fit stopped the batch.

That creates head-of-line blocking. A large request at the head holds the whole queue while surplus sits idle. In the Alice/Bob/Carol example (R$20k free capital; queue of R$15k, R$30k and R$2k), R$5k of surplus is idle in week 1 and R$16.6k in week 2, and Bob receives nothing until week 3.

OnRe's redemption queue (`onre-finance/onre-sol`, MIT) solves the idle-capital part with `RedemptionRequest.fulfilled_amount`: a request is filled in pieces, each at the NAV of its own fill. OnRe has no fill ordering, though: its worker may fill any request in any order. MUTAV keeps strict FIFO.

## Decision

1. **Partial fills, at the head only.** `fulfil_redeems(count, max_assets)` fills whole requests from the head while they fit the budget. It then makes **at most one partial fill of the head**, and the batch stops. At most one request is ever partially filled, and it is always the head. No later request is filled while an earlier one has shares remaining.
2. **Budget:** `min(max_assets, free_capital, liquid_budget)`, recomputed before every fill. `max_assets` lets the admin fulfil less than the budget; it never changes the order.
3. **Each fill is priced at the NAV of that fill.** Shares are burned per fill, and both conversions round down, in the reserve's favour.
4. **Dust rules.** A partial fill must be at least `caps.min_fill_assets` (proposed R$500) and must leave a remainder worth at least `caps.min_request` (proposed R$1,000), both checked on the rounded amounts actually moved. Otherwise the fill is trimmed, or the head is left untouched.
5. **Accrual and claim.** Filled BRS accrues on the request (`assets_claimable`). `claim_assets` works between fills, so the holder keeps the place in line.
6. **Cancel.** `cancel_redeem` is owner-only and never pausable. It returns only the unfilled remainder (`shares_remaining`). Assets already filled stay claimable, and the account closes once they are claimed. It changes only its own request and never moves `redeem_head`. There is no cooldown: the canceller only loses the place in line, and allowlisting and size limits bound spam. Request/cancel cycles cannot stall the timelocked admin, because a permissionless crank, `advance_queue_heads`, moves the heads over dead seqs (closed accounts or requests with nothing left), with an explicit skip proof, before each fill.
7. **`RedeemRequest` layout** gains `shares_requested`, `shares_remaining`, `shares_filled`, `assets_filled`, `assets_claimable`, `fill_count`, `last_fill_nav`, `last_fill_at` and a `u8` status (`Pending`, `PartiallyFilled`, `Filled`, `Cancelled`). These are real fields in the pilot, because requests pending at an upgrade cannot be migrated (ADR 0011).
8. **Events:** one `RedeemFilled` per fill, and the batch summary `RedeemsFulfilled` gains `head_partial` and `idle_free_capital`.

## Consequences

- **No idle surplus at the head.** Every real of `free_capital` goes to the head instead of waiting until the whole request fits. In the example, Bob receives R$5k in week 1 and R$16.6k by week 2.
- **Order is unchanged.** Carol still waits behind Bob. Splitting a request into smaller ones gains nothing under FIFO.
- **A request can exit at several NAVs.** Each fill is fair at its own NAV; shares that leave earlier stop sharing in later guarantee fees and later claims. The investor UX must say "each part is priced when it is paid" and show the blended price `assets_filled / shares_filled`.
- **`max_request` changes role.** It no longer fights head-of-line blocking; it limits how long one request can hold the head.
- **More state per request** (about 180 bytes with padding; rent refunded on close) and a slightly more complex `fulfil_redeems`. New invariants (spec §4, 8–12) are asserted after every instruction.
- **Liquidity for filed claims.** Fills are also capped by `liquid_budget = brs_balance − provisions − earmark_eff`, so a redemption cannot spend BRS that a filed claim is about to need. This adopts PC-13 for filed claims only; `pay_claim` itself is unchanged and never gated.
