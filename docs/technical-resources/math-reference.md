# Math reference

Every formula the `mutav` program computes in the devnet release design, with its rounding direction. The [client SDK](client-sdk.md) mirrors these formulas exactly in `bigint`.

## Conventions

| Item | Rule |
|---|---|
| Units | BRS base units (6 decimals). BRS is valued at par with BRL: 1 BRS = R$1. |
| Integers | Amounts are `u64`. Products are computed in `u128` and narrowed back to `u64`, failing with `MathOverflow` instead of truncating. |
| Scale | `NAV_SCALE = 10^9`. `BPS_DENOMINATOR = 10_000`. |
| Rounding | Always in the reserve's favour. **Down** for what the reserve pays or mints. **Up** for what it requires or is owed. |
| Inputs | Tracked balances only, never raw token balances. A token transfer straight into a reserve account never moves NAV. |

The core primitive is `mul_div(a, b, d, rounding)`: `a × b / d` in `u128`, rounded down (floor) or up (ceiling). It fails on `d = 0` and on overflow.

## Rounding summary

| Quantity | Formula | Rounding | Why |
|---|---|---|---|
| Ratio term of `coverage_required` | `c × remaining_cover_total / 10_000` | Up | The reserve requires it. |
| `shares_for` (deposit) | `assets × (S + V) / (N + 1)` | Down | The reserve mints it. |
| `assets_for` (redemption) | `shares × (N + 1) / (S + V)` | Down | The reserve pays it. |
| `conversion_nav` | `(N + 1) × 10^9 / (S + V)` | Down | Recorded price of a fill. |
| `published_nav` | `N × 10^9 / S` | Down, floored at 1 | Display and guard baseline. |
| Fee take | `amount × fee_take_bps / 10_000` | Down | The reserve keeps the remainder. |
| `inflow_nav` increment | `net × 10^9 / S` | Up | The guard nets out at least the real inflow. |
| Claim window | Exact sum of 31 daily buckets | None | No estimate: the sum is exact. |
| Adapter position value (adapter upgrade, none in v1) | `units × bounded_price / 10^9` | Down | The reserve counts no more than it holds. |

`S` is `shares_outstanding`, `N` is `net_assets`, `V = VIRTUAL_OFFSET = 1`.

## Solvency quantities

```text
stable_assets         = brs_balance + adapter_value
                        // tracked balances only; a frozen reserve counts as 0 BRS
                        // excludes pending_deposits_total and claimable_assets_total
                        // adapter_value = 0 in v1 (BRS only)
                        // computed at every gate, never cached

remaining_cover(g)    = (default_cover − default_paid) + (exit_cover − exit_paid)
remaining_cover_total = Σ remaining_cover(g) over guarantees not CLOSED
unprovisioned_cover   = remaining_cover_total − provisions

coverage_required     = max( ceil(coverage_ratio_bps × remaining_cover_total / 10_000),
                             provisions + min(stress_buffer, unprovisioned_cover) )

surplus               = max(0, stable_assets − coverage_required)
free_capital          = surplus
liquid_budget         = max(0, brs_balance − provisions)
net_assets            = max(0, stable_assets − provisions)
mode                  = UNDER_COVERED if stable_assets < coverage_required, else NORMAL
```

Notes:

- `coverage_required ≥ provisions` always. Filed claims are held in full.
- A provision lowers NAV (through `net_assets`), never `stable_assets`.
- On the `pay_claim` path the stress-buffer term and the cached `coverage_required` write saturate, so a claim payment never fails on them.
- `c = coverage_ratio_bps` lies in [1,000, 10,000] bps: the floor of ADR 0016 and the cap of ADR 0022 keep the gates' arithmetic within range.
- The phase-2 buffer earmark is not in v1. When phase 2 returns, it is subtracted from `free_capital` and `liquid_budget` again ([ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md), [ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)).

### Stress buffer

Claims arrive per event: one month's rent per default claim, one exit payment at the end of the occupation. The stress buffer is the R$ amount of the claims that could be filed next, not the full cover of every lease. The admin sizes it from the portfolio (for example the three largest rents plus one exit payment) and resizes it with `set_config`. Devnet: R$19,000.

It raises `coverage_required`, so it gates new guarantees and redemptions. It never gates a claim payment.

### Illustrative example

Not devnet data. With `c = 0.10`, `stress_buffer` = R$19,000:

| Input | Value |
|---|---|
| `remaining_cover_total` | R$400,000 |
| `provisions` | R$5,000 |
| `brs_balance` = `stable_assets` | R$100,000 |

| Output | Computation | Value |
|---|---|---|
| Ratio term | 0.10 × 400,000 | R$40,000 |
| Stress term | 5,000 + min(19,000, 395,000) | R$24,000 |
| `coverage_required` | max(40,000, 24,000) | R$40,000 |
| `surplus` = `free_capital` | 100,000 − 40,000 | R$60,000 |
| `liquid_budget` | 100,000 − 5,000 | R$95,000 |
| `net_assets` | 100,000 − 5,000 | R$95,000 |

A new guarantee of R$40,000 cover would raise the ratio term to R$44,000. It fits, because R$44,000 ≤ R$100,000.

## The solvency gate

| Instruction | Gate |
|---|---|
| `register_guarantee` | Mode normal, and `coverage_required` computed with the new cover `≤ stable_assets`. A frozen reserve counts as 0 BRS. |
| `fulfil_redeems` | Mode normal, and each fill `≤ min(max_assets − paid, free_capital, liquid_budget)`, recomputed before every fill. |
| Every other instruction | Not gated. In particular `file_claim`, `amend_claim`, `refile_claim`, `approve_claim`, `pay_claim`, `settle_payout`, `contribute_fees`, `sweep_income`, `close_guarantee`, `reinstate_guarantee`, owner cancels and claims, and the cranks. |

`fulfil_deposits` is not gated by coverage, because it brings capital in. It is refused when `net_assets == 0` with `shares_outstanding > 0` (`ReserveUnderwater`), so new money never pays for old losses, and by `stable_assets + Σ assets ≤ max_tvl`.

## NAV and share pricing

```text
V                  = 1                                              // virtual offset 10^0
shares_for(assets) = floor(assets × (shares_outstanding + V) / (net_assets + 1))
assets_for(shares) = floor(shares × (net_assets + 1) / (shares_outstanding + V))
conversion_nav     = floor((net_assets + 1) × 10^9 / (shares_outstanding + V))
published_nav      = 0                                              if shares_outstanding = 0
                   = max(1, floor(net_assets × 10^9 / shares_outstanding))   otherwise
```

- With `V = 1` and a 6-decimal share mint, one share is worth 1 BRS at launch.
- `net_assets` excludes pending deposits and claimable assets. Escrowed redeem shares stay in `shares_outstanding` until a fill burns them.
- `shares_outstanding` = minted share supply + shares owed on filled, unclaimed deposits.
- Every fill is priced at the NAV of that fill and rounds in the reserve's favour, so a fill never lowers NAV per share.
- Every deposit fill must mint more than 0 shares.
- A redemption head whose value has fallen to 0 fills as a 0-asset fill: its shares are burned and the request closes.

### Inflows with no shares outstanding

Inflows that raise NAV without minting shares are `contribute_fees`, `sweep_income` and `book_unsolicited` (including backstop money). All three are refused while `shares_outstanding == 0`. The money waits (in the operator's account, the income inbox or `unsolicited`) until the first deposit is filled. So no inflow can be lost to share rounding, and the first deposit always mints at a meaningful price.

## Fee take and income intake

```text
guarantee fee:  take = floor(amount × fee_take_bps / 10_000)      → treasury_account
                net  = amount − take                              → reserve   (NAV rises, no shares)

issuer income:  amount                                            → reserve   (receipt kind NORA_STATEMENT)

unsolicited or backstop booking:  net = amount                    → reserve   (receipt kind UNSOLICITED or BACKSTOP)
```

Devnet `fee_take_bps = 2_000` (20%); the program maximum is 3,000. There is no take on issuer income in v1; one returns as a carve only if it is decided ([spec §12 Q47](../spec.md#12-open-questions)).

Issuer income is the issuer's partnership revenue, paid into the income inbox at an off-chain contractual rate. BRS itself bears no yield. Income is never a guarantee fee and never enters `fees_in_total`.

## NAV-move guard

The guard halts capital fills when NAV per share moves more than `max_nav_move_bps` and the move is not explained by verified inflows.

```text
at each inflow (contribute_fees, sweep_income, book_unsolicited):
    inflow_nav += ceil(net × 10^9 / shares_outstanding)              // saturating

guard_nav   = max(1, published_nav − inflow_nav)                     // 0 if no shares
halt if       |guard_nav − baseline| × 10_000 > max_nav_move_bps × baseline
              (only when baseline > 0 and guard_nav > 0)
```

- It is measured per share, so fills in the same window do not distort it.
- It is evaluated in `refresh` and inline in both `fulfil_deposits` and `fulfil_redeems`.
- The halt is sticky. Only the admin's `clear_fulfil_halt` clears it; that resets the baseline to the current published NAV and `inflow_nav` to 0. `refresh` also resets `inflow_nav` and moves the baseline.
- Devnet `max_nav_move_bps = 10_000` (100%), because one claim against a small demo reserve is a real NAV move. The real-pilot value is not decided yet ([open questions](../meta/open-questions.md#open-questions)).
- The guard compares each move with the last baseline. A cumulative baseline is planned for the first post-hackathon upgrade ([possible improvements](../meta/open-questions.md#possible-improvements)).

### Fill bounds

`fulfil_deposits` and `fulfil_redeems` also take `nav_bounds = (min, max)`, composed by the admin console when the proposal is created. The fill is refused with `NavOutOfBounds` if `conversion_nav` at execution is outside the range. This ties every fill to the NAV the admin signers saw, whatever happens between approval and execution.

## Claim bounds

Per guarantee and per leg (`default`, `exit`):

```text
unprovisioned(leg) = leg_cover − leg_paid − leg_provision

file_claim:   0 < amount ≤ unprovisioned(leg)
amend_claim:  increase ≤ unprovisioned(leg); a decrease releases the difference
amend_claim(0): status WITHDRAWN, the whole provision is released
pay_claim:    expected_amount == filing.provision      // pays exactly the provision
              provision ≤ max_claim_per_call  or  approved_amount == provision
              Σ last 31 daily buckets + provision ≤ max_claim_per_period
              provision ≤ brs_balance, reserve not frozen
```

Invariants: `leg_paid ≤ leg_cover` and `leg_provision ≤ leg_cover − leg_paid` on both legs, with any number of open filings. Covers never change after registration.

## Sliding claim window

The window is a ring of 31 daily buckets in `VaultState` (`claim_day_buckets`), indexed by day number, plus the day of the last write (`claim_day_anchor`). A bucket older than 31 days is cleared before it is reused.

```text
day      = floor(now / 86_400)
// clear every bucket whose day is more than 30 days before `day`
window   = Σ claim_day_buckets over the last 31 days, today included
require    window + amount ≤ max_claim_per_period
then       claim_day_buckets[day mod 31] += amount
```

The rule is exact: the payments of the last 31 days plus this one stay within `max_claim_per_period`, approved payments included. Because every 30-day span lies inside some 31-day window of whole days, no 30-day span ever pays out more than the cap. The window length is fixed by the bucket count; there is no period parameter. A property test checks the rule across bucket reuse and a cap change in the middle of a window ([ADR 0021](../decisions/0021-claims-approval-amendment-exact-payment.md)).

Devnet: R$10,000 per call, R$20,000 per sliding 31-day window.

A claim payment above `max_claim_per_call` needs `approve_claim`. If it would not fit in the window, the admin raises `max_claim_per_period` in the same proposal and lowers it back later.

## Caps

| Cap | Enforced in | Rule |
|---|---|---|
| `max_tvl` | `fulfil_deposits` | `stable_assets + Σ assets ≤ max_tvl` |
| `max_cover_per_guarantee` | `register_guarantee` | `default_cover + exit_cover ≤ cap` |
| `max_claim_per_call` | `pay_claim` | `> 0`. Exceeded only with an exact `approved_amount` |
| `max_claim_per_period` | `pay_claim` | Sliding 31-day window, strict, approved payments included. `≥ max_claim_per_call`. |
| `min_request`, `max_request` | `request_deposit`, `request_redeem` | `min ≤ value ≤ max`; a full exit skips `min_request` but needs a value above 0 |
| `stress_buffer` | Every gate, through `coverage_required` | See above |
| `max_nav_move_bps` | `refresh`, `fulfil_deposits`, `fulfil_redeems` | See the NAV-move guard |

There is no per-agency cap. The settlement floor is 100% in v1 because the reserve holds BRS only.

## BRS liquidity floor (proposed, adapter upgrade)

Not in v1. [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) proposes, for the first adapter upgrade, a floor on liquid BRS that keeps the larger of a share of stable assets and an obligations floor in reais:

```text
brs_floor         = max( ceil(min_settlement_bps × stable_assets / 10_000),
                         obligations_floor )
obligations_floor = provisions
                  + max_claim_per_period × max(1, ceil(exit_lead_time_secs / 31 days))   // recommended form
```

`allocate` refuses a move that would take BRS below `brs_floor`. `fulfil_redeems` refuses a fill that would take BRS below it while any adapter holds value (decided). `pay_claim` never reads the floor.

## Accounting invariants

Asserted in tests after every instruction.

- `stable_assets` uses only tracked balances, never raw token balances.
- Token balances are at least the tracked totals: `reserve ≥ brs_balance`, `pending_deposits ≥ pending_deposits_total`, `claims ≥ claimable_assets_total`, `pending_redemptions ≥ pending_redeem_shares`.
- With no outside transfers, `reserve.amount == brs_balance` after any instruction sequence.
- `remaining_cover_total` = Σ remaining cover of non-closed guarantees. `provisions` = Σ provision of `FILED` filings.
- Share supply + shares owed on filled, unclaimed deposits = `shares_outstanding`.
- Σ `shares` over pending redeem requests = `pending_redeem_shares`. Σ `assets_out` over filled, unclaimed redeem requests = `claimable_assets_total`.
- No inflow raises NAV while `shares_outstanding == 0`. No deposit fill while `net_assets == 0` and shares are outstanding.
- `inflow_nav` = Σ `ceil(net × 10^9 / shares_outstanding)` over inflows since the last refresh or halt clear, saturating.

## Sources

- [Specification §4 Invariants and formulas](../spec.md#4-invariants-and-formulas), [§6 Under-coverage mode](../spec.md#6-under-coverage-mode), [§7 Price safety](../spec.md#7-price-safety), [§8 Caps](../spec.md#8-caps)
- Program: [`programs/mutav/src/math.rs`](../../programs/mutav/src/math.rs), [`solvency.rs`](../../programs/mutav/src/solvency.rs), [`pricing.rs`](../../programs/mutav/src/pricing.rs), [`constants.rs`](../../programs/mutav/src/constants.rs)
- Client mirror: [`clients/js/src/math.ts`](../../clients/js/src/math.ts)
- Shared test vectors: [`tests/fixtures/client/vectors.json`](../../tests/fixtures/client/vectors.json)

## Decisions

- [ADR 0004: On-chain NAV with internal accounting](../decisions/0004-onchain-nav-internal-accounting.md)
- [ADR 0005: Solvency gate scope](../decisions/0005-solvency-gate-scope.md)
- [ADR 0006: Per-lease absolute coverage](../decisions/0006-per-lease-absolute-coverage.md)
- [ADR 0007: Fee take direct to treasury](../decisions/0007-fee-take-direct-to-treasury.md)
- [ADR 0014: `pay_claim` bound with concurrent filings](../decisions/0014-pay-claim-bound-with-concurrent-filings.md) (amended by exact payment)
- [ADR 0015: Admin clears the fulfil halt](../decisions/0015-admin-clear-fulfil-halt.md)
- [ADR 0016: Coverage ratio below one](../decisions/0016-coverage-ratio-below-one.md) (formula amended by the stress buffer)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md) (31-day window)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md) (amends 0016, caps `c`)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md) (`nav_bounds`, zero-share refusal, inflows wait for shares, zero-value head)
- [ADR 0024: Unsolicited money and backstop contributions](../decisions/0024-unsolicited-money-and-backstop.md)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md) (no income take, no cached `stable_assets`)
- [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) (Proposed; floor on `fulfil_redeems` decided)
