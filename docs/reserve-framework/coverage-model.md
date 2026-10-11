# Coverage model

The reserve does not hold the full cover of every lease. It holds a share of it, set by the coverage ratio `c`, or enough to pay every filed claim plus the claims that could be filed next, whichever is larger. The program computes this target on-chain and uses it to gate new guarantees and redemptions. It never uses it to refuse a claim payment.

## The formula

```text
remaining_cover(g)    = (default_cover − default_paid) + (exit_cover − exit_paid)
remaining_cover_total = Σ remaining_cover(g) over guarantees not CLOSED
unprovisioned_cover   = max(0, remaining_cover_total − provisions)

coverage_required = max( ceil(c × remaining_cover_total / 10_000),
                         provisions + min(stress_buffer, unprovisioned_cover) )
```

| Term | Meaning | Set by |
|---|---|---|
| `remaining_cover_total` | Cover not yet paid across every guarantee that is not closed | Operator actions (register, close, pay) |
| `c` (`coverage_ratio_bps`) | Share of remaining cover the reserve must hold. Program floor 0.10 (`MIN_COVERAGE_RATIO_BPS = 1_000`), upper cap 1.0 (10,000 bps) | Reserve admin, through `set_config` |
| `provisions` | Sum of open claim provisions | Operator actions (file, pay; amend and re-file come with Wave 2) |
| `stress_buffer` | A R$ amount for the claims that could be filed next. At most `max_tvl`; 0 turns the term off | Reserve admin, through `set_config` |
| `unprovisioned_cover` | Cover not yet paid and not already provisioned | Derived |

The two terms answer different questions.

- **The ratio term** is the long-run backing of the whole book. At `c = 0.25` (the devnet and pilot value, [ADR 0028](../decisions/0028-pilot-parameters.md)), R$1 of reserve backs R$4 of cover.
- **The claims term** makes sure filed claims are always held in full, plus a buffer for the next claims. It binds when the book is small or when many claims are open.

`coverage_required` is never below `provisions`. The `min` keeps the buffer from asking for more than the cover that could still be claimed.

### Worked examples

Values in R$, with `c = 0.25` and `stress_buffer = 19,000` (the devnet and pilot values).

| Book | Remaining cover | Provisions | Ratio term | Claims term | `coverage_required` |
|---|---|---|---|---|---|
| Small book | 60,000 | 4,000 | 15,000 | 4,000 + min(19,000, 56,000) = 23,000 | 23,000 (claims term binds) |
| Larger book | 1,000,000 | 5,000 | 250,000 | 5,000 + 19,000 = 24,000 | 250,000 (ratio term binds) |
| Book nearly claimed out | 10,000 | 6,000 | 2,500 | 6,000 + min(19,000, 4,000) = 10,000 | 10,000 (capped at remaining cover) |

## Why claims are per event

A claim is one event, not a full cover. A default claim is about one month's rent in arrears. An exit claim is one payment for end-of-occupation debts. The risk the reserve faces next is the claims that could be filed soon, not every full cover at once. That is what the stress buffer sizes.

## Sizing the stress buffer

The reserve admin sizes `stress_buffer` from the live book and resizes it with `set_config` as the book changes.

- **Rule used for devnet:** the three largest monthly rents in the book plus one exit payment.
- **Devnet and pilot value:** R$19,000, set at deploy and locked by the deploy check ([ADR 0028](../decisions/0028-pilot-parameters.md)).
- **Bounds:** `set_config` validates the whole resulting config: `stress_buffer ≤ max_tvl` (a buffer the reserve could never hold is a typo), and `0` turns the term off. `set_config` recomputes the cached `coverage_required` at once; a change of `stress_buffer` needs a `refresh` in the same slot.
- **On the claim path** (`file_claim`, `pay_claim`, `close_guarantee`) the stress term saturates and the cached `coverage_required` write saturates (`u64::MAX` on overflow), so they can never make those instructions fail. The `register_guarantee` gate and `set_config` use the checked form and fail closed.

One helper computes the formula wherever `coverage_required` is used: the `register_guarantee` gate, `refresh`, `fulfil_redeems`, `clear_fulfil_halt`, and the recompute after `file_claim`, `pay_claim`, `close_guarantee` and `set_config` ([ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md)). The Wave 2 instructions `amend_claim`, `refile_claim` and `reinstate_guarantee` will use it too.

The buffer gates new guarantees and redemptions. It never gates a claim payment.

## Coverage quantities

```text
stable_assets  = brs_balance (+ adapter value, 0 in this release)   // computed at every gate; 0 for a frozen reserve
surplus        = max(0, stable_assets − coverage_required)
free_capital   = surplus                                            // no phase-2 earmark in v1
liquid_budget  = max(0, brs_balance − provisions)
net_assets     = max(0, stable_assets − provisions)
```

- `stable_assets` excludes pending deposits and BRS owed to holders on filled redemptions.
- A provision lowers `net_assets` (and so NAV) but never `stable_assets`. The claim is already inside the remaining cover, so nothing is counted twice.
- Rounding always favours the reserve: `coverage_required` rounds up.

## The coverage gate

| Instruction | Gate |
|---|---|
| `register_guarantee` | Mode normal, reserve not frozen (the instruction loads `reserve`; a frozen one counts as 0 and refuses with `ReserveFrozen`), and `coverage_required` after the new cover ≤ `stable_assets` |
| `fulfil_redeems` | Mode normal, not underwater (`ReserveUnderwater`, below), and each fill within `min(free_capital, liquid_budget)`. With adapters (ADR 0027, decided point), also never below the BRS liquidity floor while any adapter holds value |
| `fulfil_deposits` | Not coverage-gated. Allowed in under-coverage, because new capital is the recapitalisation path. Refused when the reserve is underwater (below) |
| `file_claim`, `pay_claim`, `settle_payout` (and the Wave 2 `amend_claim`, `refile_claim`, `approve_claim`) | Never gated |
| `contribute_fees`, `sweep_income`, `close_guarantee`, cancels (owner or admin), `claim_shares`, `claim_assets`, `refresh`, `advance_queue_head` | Never gated. `contribute_fees` and `sweep_income` wait for the first shares (`NoSharesOutstanding`, below); that is not a coverage check |

## Reserve modes

```mermaid
stateDiagram-v2
    [*] --> Normal
    Normal --> BelowTarget: stable_assets < coverage_required<br/>(claims paid, freeze, new provisions)
    BelowTarget --> Normal: fees, issuer income, deposits,<br/>backstop or run-off
    BelowTarget --> Underwater: NAV per share below the<br/>smallest unit, shares outstanding
    Underwater --> BelowTarget: MUTAV recapitalizes<br/>(contribute_fees today)
    note right of BelowTarget
        Program constant MODE_UNDER_COVERED.
        New guarantees and redemption fills stop.
        Claims keep being paid.
    end note
    note right of Underwater
        Deposit and redemption fills
        refused (ReserveUnderwater).
    end note
```

### Below target (under-coverage)

The mode is `MODE_UNDER_COVERED` when `stable_assets < coverage_required`. `refresh` records it and emits `ModeChanged`, and every gated instruction checks it inline. It can happen after claim payments (at `c < 1` a payment of `a` lowers stable assets by `a` but `coverage_required` only by about `c × a`), after new provisions, or after an issuer freeze.

| Stops | Keeps working |
|---|---|
| `register_guarantee`, `fulfil_redeems` | Every claim instruction, `contribute_fees`, `sweep_income`, `fulfil_deposits`, `close_guarantee`, cancels (owner or admin), `claim_shares` and `claim_assets`, cranks, admin configuration |

The reserve returns to normal on the next `refresh` once `stable_assets ≥ coverage_required` again: through guarantee fees, swept issuer income, new deposits, a MUTAV recapitalization, or the book running off.

Public surfaces label this state "reserve below target; MUTAV backstop active". Reserve health is an operational metric. The landlord's claim is against MUTAV Brasil as *fiador*, not against the reserve alone.

### Underwater

The reserve is underwater when NAV per share is below the smallest published unit while shares are outstanding: `net_assets × NAV_SCALE < shares_outstanding` ([ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md)). Net assets of exactly 0 are the extreme case; a reserve with BRS just above its provisions is underwater too, because it would price a deposit near zero and pay redemption heads 0 or near 0. An empty reserve (no shares) is not underwater: the first deposit fills at 1.0. Underwater is a separate test from the mode: a reserve whose BRS equals its provisions can be underwater without being under-covered. Published NAV is floored at 1 unit (10⁻⁹ BRS per share) whenever shares are outstanding.

- `fulfil_deposits` and `fulfil_redeems` both refuse with `ReserveUnderwater`. New money never pays for old losses, and no head is paid 0.
- `cancel_deposit` and `cancel_redeem` stay open, so no request is held by the refusal.
- Claims keep being paid while liquid BRS is there. A filed claim already sits inside the provisions.
- **Recovery is MUTAV's recapitalization.** Until the backstop booking ships (Wave 2), MUTAV recapitalizes through `contribute_fees`: the operator signs from its own BRS account, under a fresh `invoice_ref_hash` that mutav-app records as a backstop. No shares are minted, and it counts as a verified inflow for the NAV-move guard. `fee_take_bps` of it goes to the treasury, so the operator sends `needed / (1 − take)`, rounded up. Later the reserve admin books MUTAV's BRS with `book_unsolicited`, receipt kind `BACKSTOP` (see [Unsolicited money](unsolicited-money.md#backstop-contributions)).

### Frozen reserve

The issuer of BRS can freeze any BRS account. A frozen `reserve` counts as 0 BRS in `refresh`, `register_guarantee` and `clear_fulfil_halt`. Registrations, fills and `clear_fulfil_halt` refuse with `ReserveFrozen`, and `refresh` emits `ReserveFrozenDetected`. A freeze also stops `pay_claim` from that account. MUTAV then pays the agency from its own bank account, and the reserve reimburses the payments account later ([Claims and payments](claims-and-payments.md#bank-first-payment-and-reimbursement)).

## Inflows and the share value

Inflows that raise NAV without minting shares are guarantee fees (`contribute_fees`) and issuer income (`sweep_income`); admin bookings of unsolicited or backstop money (`book_unsolicited`) join them in Wave 2. These rules keep them safe:

- **No inflow while no shares exist.** `contribute_fees` and `sweep_income` refuse with `NoSharesOutstanding` while `shares_outstanding == 0`: fees wait with the operator and income waits in the inbox, so the first deposit always mints at a meaningful price. `book_unsolicited` will follow the same rule. A deposit that would mint 0 shares is never filled.
- **NAV-move guard, net of verified inflows.** Each inflow adds `ceil(net × 10^9 / shares_outstanding)` to `inflow_nav`. The guard compares the published NAV net of `inflow_nav` with its baseline `nav_per_share`. It runs in `refresh`, which latches `fulfil_halted` on a trip, and inline at the start of both fill instructions. An inline trip refuses the fill with `FulfilHalted` but does not latch the halt (a failed instruction writes nothing); the next `refresh`, which anyone can send, records it. A latched halt stops fills until the admin runs `clear_fulfil_halt(nav_bounds)`. The baseline is seeded by the `fulfil_deposits` batch that mints the first shares and cleared to 0 by the `fulfil_redeems` batch that burns the last ones. On devnet the bound is 100% (`max_nav_move_bps = 10_000`); see [Parameters](parameters.md).
- **Price bounds on fills.** `fulfil_deposits` and `fulfil_redeems` take `nav_bounds: NavBounds { min, max }` composed when the admin proposal is built (`min > max` is `InvalidParameter`), and refuse with `NavOutOfBounds` if the live NAV is outside them.

## Not in this release

- An on-chain tail floor per lease (bad years paid from capital alone) is a planning signal in the simulator, not a program rule.
- A cumulative baseline for the NAV-move guard is planned for the first upgrade after the hackathon, with a tighter bound for the real pilot.
- The `BACKSTOP` booking (`book_unsolicited`) and the claim instructions `amend_claim`, `refile_claim` and `approve_claim` are Wave 2.

## Sources

- [Specification §4 Invariants and formulas](../spec.md#4-invariants-and-formulas), [§6 Under-coverage mode](../spec.md#6-under-coverage-mode), [§7 Price safety](../spec.md#7-price-safety)
- Coverage math: [`programs/mutav/src/coverage.rs`](../../programs/mutav/src/coverage.rs), constants in [`programs/mutav/src/constants.rs`](../../programs/mutav/src/constants.rs)
- [Litepaper, reserve sizing and under-coverage](../litepaper.md)

## Decisions

- [ADR 0004: On-chain NAV with internal accounting](../decisions/0004-onchain-nav-internal-accounting.md)
- [ADR 0005: Coverage gate scope](../decisions/0005-solvency-gate-scope.md)
- [ADR 0006: Per-lease absolute coverage](../decisions/0006-per-lease-absolute-coverage.md)
- [ADR 0008: Uniform capital flow and pause scope](../decisions/0008-uniform-capital-flow-and-pause-scope.md) (deposit fills allowed in under-coverage)
- [ADR 0015: Admin clears the fulfil halt](../decisions/0015-admin-clear-fulfil-halt.md)
- [ADR 0016: Coverage ratio below one](../decisions/0016-coverage-ratio-below-one.md) (c floor 0.10; formula amended by ADR 0022; devnet values superseded by ADR 0028)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md) (NAV-move guard net of inflows)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md) (frozen reserve in registration and halt clearing)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md) (amends 0016)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md) (inflows refused while no shares exist, inline guard, `nav_bounds`)
- [ADR 0024: Unsolicited money and backstop contributions](../decisions/0024-unsolicited-money-and-backstop.md)
- [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) (proposed; floor on `fulfil_redeems` decided)
- [ADR 0028: Pilot parameters](../decisions/0028-pilot-parameters.md) (`c = 0.25`, stress buffer R$19,000)
- [ADR 0029: Claims and capital rules in the program](../decisions/0029-claims-and-capital-rules-in-the-program.md) (stress buffer in the binary, underwater test, inline guard, baseline, interim recovery)
