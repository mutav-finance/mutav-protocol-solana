# Redemption economics: partial head fills and phase-2 instant exit

> **Research date:** 2026-10-02. **Curated:** 2026-10-10. Prior research by the MUTAV team, kept as written except for the edits noted in the [research index](README.md). Notes headed *Since this research* record later decisions. Not legal or investment advice.

This note was written as input to an ADR and to the [specification](../spec.md) (§3.2, §3.8, §4, §5.5, §6, §8, §9). Nothing in it changes behaviour on its own. Numbers are proposals for a R$100k pilot reserve; they are worked out in the examples and listed in §6.

**Sources read:** the specification (§3 accounts, §4 invariants, §5.5 capital, §6 under-coverage, §7 price safety, §8 caps), [ADR 0008](../decisions/0008-uniform-capital-flow-and-pause-scope.md), MUTAV's internal project document, the [OnRe comparable](onre-comparable.md), and OnRe's code ([`onre-finance/onre-sol`](https://github.com/onre-finance/onre-sol), MIT): `instructions/redemption/fulfill_redemption_request.rs` (partial fills via `fulfilled_amount`) and `docs/PROP_AMM_PRICING_MODEL.md` (dynamic-wall haircut).

> **Since this research:** most of this design was accepted on 2026-10-02 as [ADR 0010](../decisions/0010-partial-fills-at-queue-head.md) (partial fills) and [ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md) (earmark-aware solvency and a phase-2 instant exit, designed but shipped disabled). On 2026-10-10 the program was simplified for the v1 freeze: the pilot keeps whole fills ([ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)), and the partial-fill fields, the exit parameters, the buffer earmark, the claim-notice counter and the per-holder account were removed from v1 and return later as carves or new accounts ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md), ADR 0019). A cooldown exit after `max_queue_wait_secs` was added as the holder's guaranteed exit path ([ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md)). The notes below mark each point.

---

## 0. Summary of the design

| Topic | Recommendation |
|---|---|
| Partial fills | `fulfil_redeems` fills greedily from the head. Whole requests while they fit; then **one partial fill of the head**, which stops the batch. At most one partially filled request exists at any time, and it is always the head. Each fill is priced at the NAV at that fill. Filled assets accrue on the request and can be claimed between fills. `cancel_redeem` returns the unfilled shares and pays out anything accrued. |
| Dust | A partial fill must be ≥ `min_fill_assets` (R$500), and it must leave a remainder worth ≥ `min_request` (R$1,000). Otherwise it is trimmed, or skipped. |
| Solvency formula | `surplus = stable_assets − coverage_required`; `free_capital = max(0, surplus − earmark_eff)`; `earmark_eff ≤ surplus` always. In the pilot, `earmark_eff = 0`, so `free_capital = surplus` exactly as before. |
| Earmark when surplus shrinks | **Hybrid with a headroom (option C).** Free capital above a headroom absorbs the loss first. Then the earmark goes to zero **before** the last headroom slice of free capital. Instant exit is therefore off whenever `surplus < headroom`, well before under-coverage. The stored earmark only ratchets down; recovered surplus goes to free capital (the queue) first. |
| Queue vs buffer | **The FIFO queue has priority.** The buffer refills only when the redemption queue is empty. A buffer that sits idle while the head waits longer than `buffer_release_after_secs` (14 days) is released to free capital. Instant exits never change `free_capital`, so they never take capacity from the queue. |
| Instant-exit price | `out = raw − haircut`, with `raw` = shares at NAV. The haircut is the **integral of a convex marginal rate** over the buffer's utilization state `x = max(recent exit volume, target − earmark_eff)`. This makes it **split-proof inside a window**; OnRe's per-order endpoint formula is not. Pilot parameters: 50 bps floor, +600 bps at full use of the target, quadratic, 10% marginal cap. |
| Haircut proceeds | Stay in `reserve`. NAV rises for every remaining holder, including queued shares. `free_capital` is unchanged. |
| Gates | Off when: flag disabled, paused, `mode == UnderCovered`, `fulfil_halted`, stale price, `pending_notices > 0`, `surplus < headroom`, wallet barred (MUTAV capital wallet and affiliates), within the minimum holding period, or a per-period cap is reached. |

> **Since this research:** ADR 0011 kept the queue-first rule and the split-proof integral haircut, but dropped the headroom term from the solvency gates (a term that falls with surplus would let the queue drain the earmark step by step). Instant exit instead requires surplus to stay above the headroom after the exit. The instruction is named `instant_redeem`, and the stored earmark falls by `raw`, so the retained haircut becomes free capital ([ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)). None of this is in the v1 binary ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)).

---

## 1. Terms

```text
surplus        = max(0, stable_assets − coverage_required)          // the pre-earmark "free_capital"
earmark_eff    = see §3.2 (0 in the pilot)                           // ≤ surplus, ≤ liquid BRS net of provisions
free_capital   = surplus − earmark_eff                               // gates fulfil_redeems, register_guarantee, allocate
liquid_budget  = brs_balance − provisions − earmark_eff              // liquid BRS a queue fill may use (recommended, §2.6)
```

**Wording fix.** The brief said "earmark ≤ free_capital at all times". Once `free_capital` is defined *after* the earmark, that reads as `earmark ≤ surplus − earmark` and double-counts. The intended invariant is **`earmark_eff ≤ surplus`**. The spec should give the pre-earmark quantity its own name (`surplus`). Every existing gate keeps reading `free_capital`.

---

## 2. Partial fills at the head of the FIFO queue

### 2.1 Why

The spec rule at the time (§5.5) was that the first request that does not fit stops the batch. A large request at the head therefore blocks the queue while surplus sits idle. OnRe's `fulfill_redemption_request(amount)` lets the worker fill any part of a request (`fulfilled_amount`) and closes the account when the request is fully settled. MUTAV keeps the strict ordering that OnRe does not have, and borrows only the partial fill, applied **at the head only**.

Partial fills do **not** let later requests jump ahead. Carol still waits behind Bob. What they remove is idle surplus: every real of `free_capital` goes to the head instead of waiting until the head's whole request fits.

> **Since this research:** partial fills at the head were accepted ([ADR 0010](../decisions/0010-partial-fills-at-queue-head.md)), then deferred: the pilot fills whole requests, keeps request sizes below expected free capital and shows a stuck head on `/operator` and `/admin`. Partial fills come in the first upgrade after the hackathon, with any fee or rounding computed once per request, not per fill ([ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)).

### 2.2 `RedeemRequest` layout (proposed replacement for spec §3.8, redeem column)

| Field | Type | Meaning |
|---|---|---|
| `owner` | `Pubkey` | |
| `seq` | `u64` | FIFO position. Never changes |
| `shares_requested` | `u64` | Original escrowed shares (immutable) |
| `shares_remaining` | `u64` | Escrowed, not yet filled |
| `shares_filled` | `u64` | Cumulative shares burned by fills |
| `assets_filled` | `u64` | Cumulative BRS paid into `claims` for this request (display and audit) |
| `assets_claimable` | `u64` | BRS in `claims` owed to this request and not yet claimed |
| `fills` | `u16` | Number of fills |
| `last_fill_nav` | `u64` | NAV per share at the last fill |
| `requested_at`, `last_fill_at` | `i64`, `i64` | |

There is no stored status; it is derived:
- `Pending`: `shares_filled == 0`.
- `PartiallyFilled`: `shares_filled > 0 && shares_remaining > 0`.
- `Filled`: `shares_remaining == 0`.

The account closes (rent to the owner) when `shares_remaining == 0 && assets_claimable == 0`, or on cancel. The blended exit price `assets_filled / shares_filled` is shown on the investor page.

> **Since this research:** ADR 0010 added a stored `u8` status (`Pending`, `PartiallyFilled`, `Filled`, `Cancelled`) and made these real fields. ADR 0026 then removed the partial-fill request fields from v1; the request padding holds room for them, enforced by a layout test ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)).

### 2.3 `fulfil_redeems(count, max_assets)`

- **Signer:** admin (unchanged). `max_assets` lets the admin fulfil *less* than all of the free capital, for example to keep room for a pipeline of new guarantees (an open question at the time; see §7). It can never change the order.
- **Gates (unchanged):** not paused; `mode == Normal`; `fulfil_halted == false`; price fresh.
- **Budget:** `budget = min(max_assets, free_capital, liquid_budget)`. It is recomputed after each fill. Paying a redemption at NAV reduces `stable_assets` and `free_capital` one-for-one and leaves `coverage_required` unchanged.
- **Loop**, starting at `redeem_head` and skipping closed or cancelled seqs (the account must be passed in seq order, or the call fails with `QueueOrderViolation`):
  1. `nav = current NAV`; `value = assets_for(shares_remaining)`.
  2. If `value ≤ budget`, do a **full fill** of the remainder, advance `redeem_head` and continue.
  3. Otherwise do a **partial fill** and stop:
     - `fill_assets_max = budget`;
     - if `value − fill_assets_max < min_request`, then `fill_assets_max = value − min_request` (the remainder must stay claimable as a normal-size request);
     - if `fill_assets_max < min_fill_assets`, then **no fill**; the batch stops with the head untouched;
     - `shares_fill = floor(fill_assets_max × (shares_outstanding + V) / (net_assets + 1))`;
     - `assets = assets_for(shares_fill)`, which is ≤ `fill_assets_max` because both round down, in the reserve's favour.
- **Effects per fill:**
  - burn `shares_fill` from `pending_redemptions`;
  - transfer `assets` from `reserve` to `claims`;
  - `brs_balance −= assets`;
  - `claimable_assets_total += assets`;
  - `shares_outstanding −= shares_fill`;
  - `pending_redeem_shares −= shares_fill`;
  - on the request: `shares_remaining −= shares_fill`, `shares_filled += shares_fill`, `assets_filled += assets`, `assets_claimable += assets`, `fills += 1`, `last_fill_nav = nav`, `last_fill_at = now`.
- **No weekly cap** (unchanged, per the project document).

> **Since this research:** every fill now also takes `nav_bounds (min, max)` composed by `/admin` at proposal time, and the NAV-move guard runs inline in both fills ([ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)).

### 2.4 `claim_assets` and `cancel_redeem`

- **`claim_assets()`** (owner; never pausable):
  - transfer `assets_claimable` from `claims` to the owner;
  - `claimable_assets_total −= it`; `assets_claimable = 0`;
  - close the account if `shares_remaining == 0`.
  - It works **between fills**, so Bob can collect his first partial fill without losing his place.
- **`cancel_redeem()`** (owner; never pausable; any status with `shares_remaining > 0`):
  - return `shares_remaining` to the owner;
  - pay any `assets_claimable`;
  - `pending_redeem_shares −= shares_remaining`;
  - close the account.
  - If it was the head, the next seq becomes the head.
  - A new `request_redeem` takes a fresh tail seq, so the place in line is lost.
  - **No cooldown needed.** Investors are allowlisted, a cancel only hurts the canceller, and the request-size limits bound spam.

> **Since this research:** in ADR 0010, `cancel_redeem` returns only the unfilled remainder; filled assets stay claimable and the account closes once they are claimed. Cancel never moves `redeem_head`; a permissionless crank advances the heads over dead seqs ([ADR 0010](../decisions/0010-partial-fills-at-queue-head.md)), simplified to `advance_queue_head(queue, max)` in [ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md).

### 2.5 Interaction with the per-request size cap

- **`max_request` no longer needs to fight head-of-line blocking.** Partial fills already route idle surplus to the head. Its job becomes limiting **concentration**: how long one request can hold the head, and how much of the queue one wallet takes.
- **Recommended pilot values:**
  - `max_request = R$30k` (30% of `max_tvl`). The Alice/Bob/Carol example below assumes this.
  - `min_request = R$1k`.
  - `min_fill_assets = R$500`.
- **Splitting is harmless under FIFO.** A holder who splits 30k into 2×15k gets the same outcome as one 30k request with partial fills, so there is nothing to gain by gaming the cap. Optionally, cap `pending requests per owner` (for example 3) to bound account spam.
- **Caps are checked in BRS at request time** (`assets_for(shares) ≤ max_request` at the then-current NAV), because requests are in shares. NAV drift afterwards is ignored.

> **Since this research:** with whole fills, `max_request` again limits head-of-line blocking; devnet request sizes stay between R$1k and R$100k. A full exit (the whole balance of the owner's canonical share account) skips `min_request` ([ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)).

### 2.6 Liquidity seniority of claims (recommended)

- The spec at the time limited a fill to `brs_balance`. A queue fill could therefore spend liquid BRS that a filed (provisioned) claim was about to need. Claims are never *gated*, but they could still *fail* for lack of liquid BRS if it had been drained into `claims`.
- **Recommendation:** cap fills at `liquid_budget = brs_balance − provisions − earmark_eff`.
  - This touches only redemption code: `pay_claim` is unchanged and never reads it.
  - It amounts to making claims senior for liquidity, for filed claims only. It is flagged in §7.

> **Since this research:** adopted in [ADR 0010](../decisions/0010-partial-fills-at-queue-head.md) and [ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md) (claims-senior liquidity; `allocate` keeps `brs_balance ≥ provisions + earmark_eff`). The earmark term is 0 while the earmark is out of v1.

### 2.7 Events

| Event | Fields (besides `config`, `ts`) |
|---|---|
| `RedeemFilled` (one per fill) | `owner, seq, shares_filled, assets, nav, shares_remaining, partial: bool` |
| `RedeemsFulfilled` (batch summary, kept) | `from_seq, to_seq, shares, assets, nav, head_partial: bool, idle_free_capital` |
| `RedeemCancelled` | `owner, seq, shares_returned, assets_paid` |
| `AssetsClaimed` | `owner, seq, assets, closed: bool` |

`idle_free_capital` (free capital left after the batch) makes head-of-line blocking visible on the transparency page.

### 2.8 Invariants (proposed for spec §4)

1. `Σ shares_remaining` over open requests `= pending_redeem_shares ≤ pending_redemptions` balance.
2. `Σ assets_claimable = claimable_assets_total ≤ claims` balance.
3. **At most one request has `0 < shares_filled` and `shares_remaining > 0`, and it is the head** (the lowest open seq). No request with a higher seq than an unfilled request has any fill.
4. For each request, `shares_filled + shares_remaining = shares_requested` (until cancel closes it).
5. Every fill satisfies:
   - `assets ≤ budget` at the time of the fill;
   - `assets ≥ min_fill_assets` unless it is a full fill of the remainder;
   - after a partial fill, the remainder is worth ≥ `min_request`.
6. A fill never lowers NAV per share. It is priced at NAV, and rounding favours the reserve.

### 2.9 Worked example: Alice, Bob, Carol

**Start:**
- `stable_assets` R$100,000 (BRS R$60k, TESOURO R$40k); `coverage_required` R$80,000.
- `surplus = free_capital` R$20,000; earmark 0; no provisions.
- 100,000 shares; NAV R$1.00.
- Queue: #1 Alice 15,000 shares, #2 Bob 30,000 shares, #3 Carol 2,000 shares (values R$15k, R$30k, R$2k).
- `min_fill_assets` R$500; `min_request` R$1,000.

> **Since this research:** the pilot reserve holds BRS only; TESOURO and other assets arrive later through adapters ([ADR 0018](../decisions/0018-brs-only-pilot-reserve.md), [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), proposed). The asset split does not change the arithmetic below.

| Week | State before the fill | Partial fills (proposed) | Whole requests only (spec at the time) |
|---|---|---|---|
| **1** | NAV 1.000000 · free R$20,000 | Alice fully filled: 15,000 sh → **R$15,000**. Bob partially filled: 5,000 sh → **R$5,000**; 25,000 sh left (R$25,000). Free capital left: R$0 | Alice R$15,000. Bob needs R$30,000 > R$5,000, so the batch stops. **R$5,000 idle**; Carol blocked |
| **2** | +R$1,600 net guarantee fees (NAV ↑); a guarantee closes and releases R$10,000 of cover. Partial path: NAV 1.020000 · free R$11,600 | Bob partially filled: 11,372.549020 sh → **R$11,600** at 1.02; 13,627.450980 sh left (R$13,900) | NAV 1.018824 · free R$16,600. Bob needs R$30,564.71, so the batch stops. **R$16,600 idle** |
| **3** | A guarantee closes and releases R$15,000; a R$2,000 claim is filed and provisioned (NAV ↓, surplus unchanged, invariant 6). Partial path: NAV 0.990857 · free R$15,000 | Bob's remainder fully filled: **R$13,502.86**. Carol: R$1,497.14 of budget is left, but filling it would leave R$484.57 < `min_request`, so the fill is trimmed to **R$981.71** (990.772780 sh), leaving 1,009.227220 sh (R$1,000). R$515.43 stays idle (< `min_fill_assets`) | NAV 0.995294 · free R$31,600. Bob fully filled: **R$29,858.82**. Carol needs R$1,990.59 > R$1,741.18, so the batch stops. **R$1,741.18 idle** |

**What the example shows:**
- **Bob's money arrives earlier.** He gets R$5k in week 1 and R$16.6k by week 2, instead of nothing until week 3. He can `claim_assets` after each fill.
- **Every fill is at the NAV of its own moment.**
  - Bob's blended price is R$30,102.86 / 30,000 sh = R$1.00343 per share.
  - With whole fills he would have received R$29,858.82, all at 0.995294.
  - The difference is not a transfer between holders: each fill is fair at its own NAV. Shares that leave earlier stop sharing in later guarantee fees and later claims. Disclose this in the investor UX ("each part is priced when it is paid").
- **Carol is still strictly behind Bob in both cases.** Partial fills keep FIFO.
- **The dust rule trims Carol's fill rather than leaving her a R$485 tail.** If she does not want to wait for the last R$1,000, she can cancel the remainder.

---

## 3. The buffer earmark (phase 2)

> **Since this research:** the earmark-aware solvency formula was accepted in [ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md) and then removed from v1 together with the exit parameters; it returns as a carve when instant exit is built ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)). This whole section describes a later design.

### 3.1 What the earmark is

- **An accounting reservation of surplus, held as liquid BRS inside `reserve`.** It is not a separate token account, for three reasons:
  1. **It still counts in `stable_assets`,** so it still backs coverage.
  2. **`pay_claim` can always spend it.** Claims are never gated, and the claim path is left untouched.
  3. **A direct transfer cannot inflate it** (internal accounting, spec Principle 2).
- **It is not a pool investors deposit into.** It is funded only from surplus that the queue does not need.
- **Stored state:** `VaultState.buffer_earmark` (a stored level).
- **Config:**
  - `buffer_target_bps` (of `stable_assets`);
  - `buffer_headroom_bps` (of `coverage_required`);
  - `buffer_release_after_secs`.

### 3.2 The effective earmark (computed inline by every instruction that reads solvency)

```text
headroom      = ceil(coverage_required × buffer_headroom_bps / 10_000)
earmark_eff   = min( buffer_earmark,                                  // stored level
                     max(0, surplus − headroom),                      // surplus shape (option C)
                     max(0, brs_balance − provisions),                // must be liquid, after filed claims
                     head_starved ? 0 : ∞ )                           // queue-starvation release
head_starved  = queue non-empty && now − head.requested_at > buffer_release_after_secs
buffer_earmark := earmark_eff   // ratchet: whenever an instruction writes state, the stored level only moves down
```

`pay_claim` never computes this; it does not read the earmark at all. The next instruction that touches the earmark (or `refresh`) applies the ratchet.

> **Since this research:** ADR 0011 settled `earmark_eff = min(buffer_earmark, surplus, brs_balance − provisions)`, zero when the instant-exit flag is clear and zero for a starved head, without the headroom term in the gates. Only instructions that already read `free_capital` store the ratchet ([ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)).

### 3.3 When surplus shrinks: which absorbs first?

Surplus shrinks through:
- a TESOURO mark-down;
- an increase in `c`;
- a fulfilled redemption;
- a new guarantee;
- an instant exit.

At `c = 1.0`, paying a claim leaves surplus unchanged (spec invariant 7), but it reduces liquid BRS. That reduction binds through the liquidity term.

> **Since this research:** `c` is below 1.0 (floor 0.10) and `coverage_required` gained a stress-buffer term ([ADR 0016](../decisions/0016-coverage-ratio-below-one.md), [ADR 0022](../decisions/0022-coverage-stress-buffer-underwater-reserve.md)).

The pilot-scale example: `coverage_required` R$70,000, `headroom` 10% = R$7,000, stored earmark R$5,000.

| Surplus | **A. Clamp only** `min(earmark, surplus)` (free capital absorbs first) | **B. Earmark first** (earmark absorbs first) | **C. Headroom hybrid** (recommended) |
|---|---|---|---|
| R$30,000 | earmark 5,000 · free 25,000 | 5,000 · 25,000 | 5,000 · 25,000 |
| R$12,000 | 5,000 · 7,000 | 0 · 12,000 *(the earmark is gone at the first loss)* | 5,000 · 7,000 |
| R$10,000 | 5,000 · 5,000 | 0 · 10,000 | **3,000 · 7,000** |
| R$7,000 | 5,000 · 2,000 | 0 · 7,000 | **0 · 7,000; instant exit off** |
| R$4,000 | 4,000 · **0**; instant exit drains the last surplus while the queue is frozen at 0 | 0 · 4,000 | 0 · 4,000 |

*(Option B needs path-dependent state, because the earmark has to drop by each loss Δ. It is shown only for comparison.)*

- **Why A is rejected:** it is a run accelerator. Near under-coverage, the queue (at NAV, in strict order) has nothing left, and the haircut path still pays out the last surplus to whoever moves first.
- **Why B is rejected:** the buffer disappears at the first small loss, so the instant-exit feature is unreliable in normal operation. It also needs per-loss tracking.
- **Why C is chosen:**
  - **Normal fluctuations** come out of free capital, so the buffer stays usable.
  - **As surplus falls toward the headroom,** the earmark is consumed first, and **instant exit switches itself off before the reserve is anywhere near under-coverage.**
  - **The last slice of surplus always belongs to the FIFO queue at NAV.**
  - **It is stateless**: a `min()` of current quantities.
  - **The ratchet means recovered surplus goes to free capital (the queue) first.** The earmark refills only through §3.4.

> **Since this research:** ADR 0011 reached the same protection differently: the headroom check moved from the gates to `instant_redeem` itself (surplus must stay above the headroom after the exit), so the queue cannot erode the earmark step by step ([ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)).

### 3.4 Refill, release and the queue

- **`refill_exit_buffer()`** is permissionless. `refresh` may also do it inline.
  - **Requires all of:** `instant_exit_enabled`; not paused; `mode == Normal`; price fresh; **`pending_redeem_shares == 0` (the queue is empty)**; `surplus ≥ headroom`.
  - **Effect:** `buffer_earmark = min(target, buffer_earmark + free_capital, surplus − headroom, brs_balance − provisions)`, with `target = buffer_target_bps × stable_assets`.
  - **Event:** `ExitBufferRefilled { amount, level }`.
- **The FIFO queue has priority over refilling the buffer.** As long as anyone is waiting at NAV, surplus goes to them and not into a haircut product.
  - Conversely, an earmark that existed **before** a request arrived is not drained into the queue. It was reserved earlier, and queued holders can still choose to use it (at the haircut).
- **Starvation release.** If the head has waited longer than `buffer_release_after_secs` (pilot proposal: 14 days), `earmark_eff = 0`, and the ratchet moves the buffer into free capital for the next `fulfil_redeems`. A buffer cannot sit idle forever next to a starving queue. **Event:** `ExitBufferReleased { amount, reason: Starvation }`.
- **`release_exit_buffer(amount)`** (admin): lowers the stored level. It reduces risk, so it is allowed while paused; the timelock is optional. **Event:** `ExitBufferReleased { amount, reason: Admin }`.
- **New guarantees vs the buffer.** `register_guarantee` reads `free_capital`, which is after the earmark, so a filled buffer is senior to new guarantees. Because the buffer refills only when the queue is empty, and only up to 5% of TVL, the cost to underwriting is small. Whether redemptions or new guarantees come first was still open.
- **`allocate` must keep the earmark liquid.**
  - Add a post-condition: `brs_balance_after ≥ provisions + buffer_earmark` (and in the pilot, `≥ provisions`).
  - Otherwise moving BRS into TESOURO would silently zero the earmark through the liquidity term.

> **Since this research:** in ADR 0011 the refill is `fund_exit_buffer`, an operator crank (the operator or admin may defund at any time), not a permissionless instruction, and `instant_redeem` must present the queue head whenever the queue is non-empty ([ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)).

### 3.5 Earmark invariants

1. `0 ≤ earmark_eff ≤ buffer_earmark ≤ buffer_target`.
2. `earmark_eff ≤ surplus − headroom` (when positive), so `stable_assets − earmark_eff ≥ coverage_required + headroom` whenever `earmark_eff > 0`.
3. `earmark_eff ≤ brs_balance − provisions`.
4. `buffer_earmark` increases only through `refill_exit_buffer`, and only when `pending_redeem_shares == 0`.
5. `pay_claim` reads neither the earmark nor the instant-exit state. The existing property test is extended with a non-zero earmark and an enabled instant exit.
6. In the pilot: `instant_exit_enabled == false`, `buffer_earmark == 0`, so `free_capital == surplus`. That is the pilot behaviour, bit-for-bit.

---

## 4. Instant exit (phase 2, shipped disabled)

> **Since this research:** accepted as a phase-2 design that ships disabled and needs a later time-locked upgrade plus a flag change ([ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)); its state is out of v1 ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)). Before any outside capital, the guaranteed exit is a different mechanism: after `max_queue_wait_secs`, anyone may fill the head redemption under the normal rules ([ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md)). Instant exit stays a separate priced exit.

### 4.1 Flow

`instant_exit(shares, min_out, proof)`. The signer is an investor, the owner of the shares.

1. **Gates** (all of them):
   - `instant_exit_enabled`; not paused; `mode == Normal`; `fulfil_halted == false`;
   - TESOURO price fresh (when `tesouro_units > 0`);
   - **`pending_notices == 0`** (§4.5);
   - `surplus ≥ headroom`;
   - the signer is in `instant_exit_allowlist_root` and **not** in `config.instant_exit_barred[]`;
   - the minimum holding period has passed;
   - per-wallet and global per-period caps;
   - `raw ≥ min_instant_assets`.
2. `raw = assets_for(shares)` at the current NAV, rounded down.
3. `x = max(V_window, target − earmark_eff)` is the buffer's utilization state (§4.2).
4. `haircut = H(x + raw) − H(x)`, rounded **up**; `out = raw − haircut`. Require `raw ≤ earmark_eff` and `out ≥ min_out` (slippage protection, as in OnRe).
5. **Effects:**
   - burn `shares`;
   - transfer `out` from `reserve` to the holder (direct, atomic: no `claims` escrow);
   - `brs_balance −= out`; `shares_outstanding −= shares`; `buffer_earmark −= out`;
   - `V_curr += raw`;
   - update the period counters (global and per wallet);
   - `instant_exits_total += out`; `haircut_total += haircut`.
6. **Event:** `InstantExit { owner, shares, raw, haircut, out, nav_before, nav_after, x_before, earmark_after }`.
7. **View for the UI:** `quote_instant_exit(shares)` returns the same numbers without side effects, so the investor sees "you redeem R$2,500 → expect R$2,475.00, min R$2,470".

Instant exits are **not admin-fulfilled and not FIFO**. That is the deliberate exception to the project document's withdrawal rule; see §7.

> **Since this research:** the instruction is `instant_redeem(shares, min_out, proof)`; it burns only shares the signer owns, rejects `out == 0`, and lowers the stored earmark by `raw` rather than `out` ([ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)). The global TESOURO price fields were removed; asset prices live in per-adapter state ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md), [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), proposed).

### 4.2 Haircut curve: options

| Option | Formula | Pros | Cons |
|---|---|---|---|
| 1. Flat fee | `h = h_min` | Trivial | Doesn't react to drain or run speed |
| 2. Linear in utilization | `h = h_min + k·u` | Simple | Too cheap at high utilization, too expensive at low |
| 3. Power, per order (OnRe's first version) | `h = h_min + h_peg·u^e`, `u = raw/E` | Convex | Ignores previous exits |
| 4. Dynamic wall, per order (OnRe today) | `W = E/(1+s·V/E)`, `u = raw/W`, `h = h_peg·u^e` | Reacts to recent volume | **Not split-proof.** With 50 bps floor, 300 bps peg, e = 2, s = 1, E = R$5k: one R$2,500 exit pays **R$54.69**, while 5 × R$500 back-to-back pays **R$15.54** in total. OnRe documents this limitation (`docs/PROP_AMM_PRICING_MODEL.md` in [onre-sol](https://github.com/onre-finance/onre-sol)) |
| **5. Integral over cumulative utilization (recommended)** | marginal `m(x) = min(h_max, h_min + h_peg·(x/E)^e)`; `H(x) = ∫₀ˣ m`; order pays `H(x+raw) − H(x)` | **Path-independent inside a window: splitting gains nothing.** Both utilization (depletion) and recent exit volume enter through `x`. Closed form; cheap in CUs | Needs a decay rule for `V_window` (below) |

**Option 5 in closed form** (quadratic `e = 2`; integer `u128` arithmetic, rounded up):

```text
E   = buffer_target (fixed reference, so quotes are predictable)
x*  = E × sqrt((h_max − h_min) / h_peg)                  // where the marginal hits the cap
H(x) = h_min·x + h_peg·x³/(3E²)                          for x ≤ x*
     = H(x*) + h_max·(x − x*)                            for x > x*
x   = max(V_window, E − earmark_eff)
V_window = V_prev × max(0, 1 − (now − epoch_start)/epoch) + V_curr   // two-bucket linear decay (as OnRe)
```

- **`V_window` measures how fast exits are happening:** a burst prices worse even after a refill.
- **`E − earmark_eff` measures how depleted the buffer actually is,** including depletion caused by surplus shrinkage. Using the max of the two means an exit can't get a cheap quote just because one of the two signals has reset.
- **Patience is rewarded:** waiting for the window to decay **and** for a refill (which happens only when the queue is empty) lowers the price. Splitting inside a window doesn't.

> **Since this research:** ADR 0011 adopted option 5, computed as one exact rational rounded up once, which makes it split-proof within an epoch up to rounding ([ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)). The parameters below remain open.

### 4.3 Calibration for the R$100k pilot

**Reasoning:**
- **Fee and yield drift.** The net NAV drift from guarantee fees and TESOURO accrual is about 1% per month. At pilot scale: about R$70k of cover at the reference 9× rent, so about R$7.8k of rent; 12% guarantee fee less the take; 40% of the reserve in TESOURO at about 11.6% a year (the on-chain TESOURO rate observed on 2026-10-01; see [BRL currencies on Solana](brl-currencies-on-solana.md)).
  - A **50 bps floor** plus a **30-day minimum holding period** makes deposit → fee batch → instant exit arbitrage unprofitable.
  - Without the holding period, it would be profitable: `contribute_fees` raises NAV immediately (fee smoothing was not adopted).
- **Front-running a claim can be worth much more than any acceptable haircut.**
  - One rent default is about 2.5% of NAV; a full exit cover (6× rent) is up to about 15%.
  - So the haircut **cannot** be the defence against informed exits. The notice gate (§4.5) is.
  - The haircut prices liquidity and run speed only.
- **Drain cost.** Draining the whole buffer should cost a few percent on average, and a burst beyond it should be expensive. That rules out a run through the side door.

> **Since this research:** the pilot holds no TESOURO ([ADR 0018](../decisions/0018-brs-only-pilot-reserve.md)), so pilot NAV drift comes from guarantee fees and BRS issuer income ([ADR 0017](../decisions/0017-brs-income-intake.md)).

**Proposed pilot parameters:**

| Parameter | Value |
|---|---|
| `buffer_target_bps` | 500 (5% of `stable_assets` ≈ R$5,000) |
| `buffer_headroom_bps` | 1,000 (10% of `coverage_required`) |
| `h_min` | 50 bps |
| `h_peg` | 600 bps (the marginal rate is 6.5% at `x = E`) |
| Curve exponent `e` | 2 |
| Marginal cap `h_max` | 1,000 bps (`x*` ≈ 1.26E) |
| Pressure epoch | 7 days |
| `min_instant_assets` | R$100 |
| Global cap | R$10,000 per 30 days (10% of TVL; about two buffer refills) |
| Per-wallet cap | R$2,500 per 30 days |
| Minimum holding period | 30 days since the wallet last received shares through `claim_shares` |
| `buffer_release_after_secs` | 14 days |

### 4.4 Worked examples (E = R$5,000; NAV R$1.00; 100,000 shares)

| Case | `x` before | `raw` | Haircut | Effective % | `out` | Marginal at end |
|---|---|---|---|---|---|---|
| Minimum exit | 0 | R$100 | R$0.50 | 0.50% | R$99.50 | 0.50% |
| Dan, small exit | 0 | R$500 | R$2.60 | 0.52% | R$497.40 | 0.56% |
| Dan, at per-wallet cap | 0 | R$2,500 | R$25.00 | 1.00% | R$2,475.00 | 2.00% |
| Same R$2,500 split 5 × R$500 in one window | 0 → 2,000 | 5 × R$500 | **R$25.00 total** | 1.00% | R$2,475.00 | split-proof |
| Erin R$2,000 right after Dan's R$500 | 500 | R$2,000 | R$22.40 | 1.12% | R$1,977.60 | 2.00% |
| Erin R$2,000 right after Dan's R$2,500 | 2,500 | R$2,000 | R$70.40 | 3.52% | R$1,929.60 | 5.36% |
| Whole buffer drained by several wallets in one window | 0 | R$5,000 | R$125.00 | 2.50% | R$4,875.00 | 6.50% |
| A burst past the target (after a refill inside the same window) | 5,000 | R$2,500 | R$226.54 | 9.06% | R$2,273.46 | 10.00% (cap) |

**NAV and solvency effects of Dan's R$2,500 exit:**
- 2,500 shares are burned and R$2,475 is paid out. The R$25 haircut stays in `reserve`, so NAV goes from R$1.000000 to **R$1.000256** for the 97,500 remaining shares, queued shares included.
- `surplus` falls by R$2,475 and `buffer_earmark` falls by R$2,475, so **`free_capital` is unchanged**. Instant exits never take capacity from the queue.
- Utilization after the exit is `x = max(V_window = 2,500, E − earmark = 2,475) = 2,500`.

**Decay example:**
- 3.5 days into the next epoch, Dan's R$2,500 has decayed to `V_window` = R$1,250.
- But no refill has happened, because Bob is queued, so the earmark is still R$2,525 and `x = max(1,250, 2,475) = 2,475`.
- **The price only resets when the queue empties and the buffer refills.**

**Gate examples:**
- **The MUTAV capital wallet** tries an instant exit and fails with `InstantExitBarred`. It redeems through the queue like any holder ([ADR 0008](../decisions/0008-uniform-capital-flow-and-pause-scope.md)).
- **A notice arrives.** The operator flags a missed-rent notice (`pending_notices = 1`). Every instant exit then fails with `ClaimNoticePending` until `file_claim` provisions it (NAV drops) or the notice is withdrawn. Then exits resume at the post-provision NAV.
- **TESOURO mark-down.** `surplus` falls from R$30k to R$9k with `headroom` R$7k, so `earmark_eff = min(5,000, 2,000) = 2,000`. Exits are capped at R$2,000. Below R$7k of surplus, they fail with `InsufficientExitBuffer`.

### 4.5 Anti-front-running rules

1. **Claim notices gate exits.** Add the operator instructions `flag_claim_notice(notice_ref_hash)` and `withdraw_claim_notice`, plus `pending_notices: u32` in `VaultState`.
   - `file_claim` clears the matching notice.
   - The operator flags a notice **as soon as the platform knows of a missed rent**, not when the 15-day filing is complete. A late flag is the main residual risk.
   - The flag gates only `instant_exit`, never `pay_claim` or `file_claim`.
   - An operator who abuses it can only push exits back to the queue at NAV.
   - **A service level applies:** a notice open longer than 15 days shows on the transparency page (counter `stale_notices`).

   > **Since this research:** ADR 0011 made claim notices gate both queues as well as instant exit, because MUTAV also times admin fills and runs the operator; a notice closes only when the claim is paid, the leg is fully provisioned, or the notice is withdrawn ([ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)). The `pending_notices` counter was then removed from v1, and the claim-notice gate is built together with the cooldown exit, before any outside capital ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md), [ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md)).

2. **Barred wallets.** `config.instant_exit_barred: [Pubkey; 4]` holds the MUTAV capital wallet and affiliated or insider wallets.
   - It is public, so anyone can verify the bar.
   - A separate `instant_exit_allowlist_root` lets eligibility for instant exit be narrower than deposit/redeem eligibility.
3. **Stale or moving prices.** Instant exit requires a fresh bounded TESOURO price and `fulfil_halted == false`.
   - **Recommendation:** add a tighter `instant_exit_max_price_age_secs`, because an atomic exit is more sensitive to a stale mark than an admin-timed fill.
4. **Minimum holding period.** Each wallet has a `HolderState` PDA `["holder", config, owner]` holding `last_shares_in_ts`, stamped by `claim_shares`.
   - Exits within 30 days fail.
   - **Ship the stamp in the pilot (upgrade readiness).** Otherwise, wallets that claimed shares before the upgrade have no stamp. Rule: a missing stamp counts as `ts = upgrade slot`.

   > **Since this research:** ADR 0011 shipped `HolderState`, stamped at `request_deposit` and `claim_shares`. ADR 0026 removed it from v1 (avoiding `init_if_needed` on program state); a holding period, if needed, returns as a new account, and exit rights read the share balance ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md), [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)).

5. **Share transfers.** If shares can move freely, the holding period and per-wallet caps can be dodged by moving shares to another allowlisted wallet.
   - Requiring the allowlist on instant exit limits this to KYC'd identities.
   - Per-identity caps would need the allowlist leaf to carry an identity hash. **Recommendation:** leaf = `hash(wallet, identity_hash)`, and the caps are keyed by `identity_hash`.

   > **Since this research:** mainnet shares are to be transfer-restricted at the token level, with the mechanism decided before the mainnet `initialize` and exit kept open for holders; devnet keeps classic SPL shares ([open questions](../meta/open-questions.md)).

### 4.6 How the haircut accrues to NAV

```text
before:  NAV₀ = net_assets / S
exit:    burn s shares, pay out = s·NAV₀ − haircut
after:   NAV₁ = (net_assets − s·NAV₀ + haircut) / (S − s) = NAV₀ + haircut / (S − s)
```

- **Who receives the haircut.** It goes pro rata to every remaining share, including shares escrowed in the redemption queue. That holds because escrowed shares stay in `shares_outstanding` (spec §12 Q12). If Q12 is resolved the other way, queued holders would stop sharing in haircuts.
- **Where it doesn't go.**
  - It never goes to `treasury_account`; it is not MUTAV operating revenue.
  - It never counts as a guarantee fee. Track it as `haircut_total`, separate from `fees_in_total`, so the transparency page can show both.
- **MUTAV's stake.** MUTAV earns from haircuts only through its own shares, like every holder ([ADR 0009](../decisions/0009-separate-mutav-money-flows.md)). Because of that, it is barred from the exit side.

---

## 5. Upgrade readiness (economic fields only)

**Ship in the pilot:**

| Field | Where | Pilot value |
|---|---|---|
| `instant_exit_enabled` | `VaultConfig` | `false` |
| `ExitParams` struct: `buffer_target_bps u16`, `buffer_headroom_bps u16`, `buffer_release_after_secs i64`, `h_min_bps u16`, `h_peg_bps u16`, `h_max_bps u16`, `curve_exponent_scaled u32`, `pressure_epoch_secs i64`, `min_instant_assets u64`, `max_instant_per_period u64`, `max_instant_per_wallet u64`, `instant_period_secs i64`, `min_hold_secs i64`, `max_price_age_secs i64` | `VaultConfig` | zero / disabled; bounds checked only when enabled |
| `instant_exit_allowlist_root [u8;32]`, `instant_exit_barred [Pubkey;4]` | `VaultConfig` | zero |
| Partial-fill fields: `min_fill_assets u64` | `VaultConfig.caps` | R$500 |
| `buffer_earmark u64`, `pending_notices u32` | `VaultState` | 0 |

**Phase-2 state that fits `VaultState._reserved` (128 bytes):**
- `epoch_start i64`, `V_curr u64`, `V_prev u64`;
- `instant_period_start i64`, `instant_period_paid u64`;
- `instant_exits_total u64`, `haircut_total u64`;
- `stale_notices u32`.

That is about 60 bytes, which fits.

**New accounts created post-upgrade:** `ClaimNotice` PDAs; per-identity `ExitCounter` PDAs.

`HolderState` should already exist from the pilot (§4.5.4).

**Sizing note.** `ExitParams` is about 90 bytes and the barred list is 128 bytes. Together they exceed a 128-byte `VaultConfig._reserved`. They should be **real fields from day one**, not padding, which is what the brief decided. The `_reserved` arrays stay available for whatever phase 2 discovers.

**The pilot formula already reads `earmark_eff`.** With `buffer_earmark = 0`, it returns 0 at every step. The phase-2 upgrade then changes no solvency maths, only adds instructions.

> **Since this research:** ADR 0011 first took this route (real fields from the pilot, padding of 512 bytes on `VaultConfig` and 256 on `VaultState`). For the v1 freeze the founders chose the opposite trade-off: `ExitParams`, the buffer earmark, `min_fill_assets`, `pending_notices` and `HolderState` were removed, and the padding test reserves the bytes they need (275 + 88) so each returns as a carve without a migration. `feature_flags` stays and fails closed ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md), ADR 0019). See also [Upgrade readiness](upgrade-readiness.md).

---

## 6. Proposed parameter table (pilot)

| Parameter | Pilot | Phase-2 starting value |
|---|---|---|
| `min_request` / `max_request` | R$1,000 / R$30,000 | same |
| `min_fill_assets` | R$500 | same |
| `instant_exit_enabled` | **false** | true after a timelocked upgrade |
| `buffer_target_bps` / `buffer_headroom_bps` | 0 / 1,000 | 500 / 1,000 |
| `buffer_release_after_secs` | not set | 14 days |
| `h_min` / `h_peg` / `h_max` / `e` | not set | 50 / 600 / 1,000 bps / 2 |
| Pressure epoch | not set | 7 days |
| Instant caps | not set | R$100 min · R$2,500 per wallet per 30 days · R$10,000 global per 30 days |
| Minimum holding period | stamp recorded | 30 days |

> **Since this research:** the pilot has no `min_fill_assets` and no holding-period stamp (§5 note). Devnet request sizes run from R$1k to R$100k ([ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)).

---

## 7. Conflicts with decided rules and open questions (as flagged at the time)

1. **Instant exit vs "withdrawals are strict FIFO, admin-fulfilled".** This conflicts with the project document §3 and ADR 0008 and was decided as a phase-2 exception.
   - What is kept: exits come only from surplus (an earmark that is ≤ surplus − headroom), and they never reduce `free_capital`.
   - What is not kept: they are not FIFO and not admin-fulfilled.
   - **Needs an ADR that amends ADR 0008 and project document §3/§7.** The project document's mitigation for "investor timing" (provision at filing + admin-fulfilled FIFO) is weakened. The replacement mitigations are the notice gate, the holding period, the caps, and the headroom switch-off.
2. **ADR 0009 says the MUTAV capital wallet is "unknown to config".** Barring it from instant exit needs it, or a barred list, in config. Recommendation: the public `instant_exit_barred[]` list. It makes the exception explicit and verifiable, and it covers affiliates. ADR 0009 needs a one-line amendment.
3. **Partial fills were listed as "Not adopted"** in spec §5.5/§11, and the `RedeemRequest` layout in §3.8 changes. This needs an ADR and a spec update in the same PR (repo rule).
4. **"earmark ≤ free_capital"** should read **`earmark_eff ≤ surplus`** (§1). The spec should name the pre-earmark quantity `surplus`.
5. **Claims are never gated: preserved.**
   - `pay_claim` doesn't read the earmark, the notices or the instant-exit state.
   - The earmark is BRS inside `reserve` that claims can spend.
   - The notice flag gates only exits.
   - The recommended `liquid_budget = brs_balance − provisions − earmark_eff` cap on queue fills and instant exits makes claims senior for liquidity, in part. It is a new decision.
6. **"No weekly cap" on withdrawals: preserved for the queue.** Per-period caps apply only to the instant-exit path.
7. **Pause and under-coverage lists.** Add `instant_exit` and `refill_exit_buffer` to the paused and frozen lists (spec §5.1, §6). `release_exit_buffer` and `cancel_*`/`claim_*` stay open.
8. **Redemptions vs new guarantees is still open.**
   - A filled earmark is senior to new guarantees, because `register_guarantee` reads post-earmark `free_capital`.
   - The `max_assets` argument lets the admin hold surplus back from the queue for underwriting. That is admin discretion over *how much*, never over *order*.
   - The founders should confirm both.
9. **NAV-denominator question (spec §12 Q12)** decides whether queued holders share in haircuts.
10. **`allocate`** needs the new liquidity post-condition (§3.4), so a TESOURO allocation can't silently zero the buffer.
11. **Fee-batch arbitrage.** `contribute_fees` raises NAV immediately (fee smoothing not adopted). The holding period exists for that reason. If fee smoothing were adopted later, `h_min` could fall.
12. **Per-identity caps** need an identity hash in the allowlist leaf.
13. **Residual risk:** a missed rent known to the agency or the platform before the operator flags it. The mitigation is operational: flag at the first overdue signal, and show the notice service level publicly.

> **Since this research:** items 1 to 5 and 10 were settled by [ADR 0010](../decisions/0010-partial-fills-at-queue-head.md) and [ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md) (ADR 0011 amends ADR 0008 and ADR 0009 and records `mutav_capital_wallet` in config). The founders have since added an exit that does not depend on the admin, the cooldown exit of [ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md), and kept pause scope to capital flows and new guarantees ([ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md)).

## Sources

- [OnRe `onre-sol` repository](https://github.com/onre-finance/onre-sol) (MIT): `instructions/redemption/fulfill_redemption_request.rs` and `docs/PROP_AMM_PRICING_MODEL.md`
- [OnRe comparable](onre-comparable.md)
- [BRL currencies on Solana](brl-currencies-on-solana.md) (TESOURO on-chain rate)
- [Upgrade readiness](upgrade-readiness.md)
- [Specification](../spec.md) §3, §4, §5.5, §6, §7, §8, §12
- MUTAV's internal project document (not public)

## Decisions

- [ADR 0008: One capital flow for everyone; FIFO deposits; pause never blocks claims](../decisions/0008-uniform-capital-flow-and-pause-scope.md)
- [ADR 0009: Guarantee fees, MUTAV operation and MUTAV's reserve share are separate flows](../decisions/0009-separate-mutav-money-flows.md)
- [ADR 0010: Partial fills at the head of the redemption queue](../decisions/0010-partial-fills-at-queue-head.md)
- [ADR 0011: Phase-2 instant exit, earmark-aware solvency and upgrade readiness](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)
- [ADR 0018: BRS-only pilot reserve; assets expand through adapters](../decisions/0018-brs-only-pilot-reserve.md)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md)
- [ADR 0025: Exit fallback: a cooldown exit after `max_queue_wait_secs`](../decisions/0025-exit-fallback-cooldown-exit.md)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md)
- [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing (proposed)](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md)
- ADR 0019: v1 layout for the devnet release (recorded with the layout change)
