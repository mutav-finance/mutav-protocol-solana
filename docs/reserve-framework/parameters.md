# Parameters

Every parameter of the reserve for the devnet release, with its value and who sets it. The values are the pilot parameters of [ADR 0028](../decisions/0028-pilot-parameters.md): devnet runs with the values the pilot will use, and the deploy check (`verify.ts`) refuses a devnet config that holds other ones.

Amounts are in R$ and in BRS base units (6 decimals, 1 BRS = R$1). "Admin" means the reserve admin multisig, acting through a time-locked Squads proposal. Most admin parameters change with a sparse `set_config(params)`: each call lists only the fields it changes (at most 16, no duplicates), the program validates the whole resulting config, and it emits one `ConfigUpdated { field, old, new }` per changed field. Money accounts, the allowlist, roles and guardians have their own instructions.

## Who can change what

| Who | How | Changes |
|---|---|---|
| Program upgrade authority (upgrade multisig) | `initialize`, once | Reserve mint, first roles, first parameters |
| Reserve admin (admin multisig) | `set_config` and dedicated instructions (`set_payments_account`, `set_treasury_account`, `set_allowlist_root`, role and guardian instructions), under the admin time lock | Coverage ratio, stress buffer, caps, fee take, NAV bound, reinstatement window, exit-fallback wait, accounts, allowlist, guardians, roles (two-step) |
| Program upgrade | A time-locked program upgrade | Program constants and bounds |
| Runbook | Operating procedure, not enforced by the program | Return window and dust threshold for unsolicited money |

## Coverage

| Parameter | Field | Devnet value | Base units | Set by |
|---|---|---|---|---|
| Coverage ratio `c` | `coverage_ratio_bps` | 0.25 | 2,500 bps | Admin. Floor 1,000 bps (0.10, program constant), cap 10,000 bps |
| Stress buffer | `caps.stress_buffer` | R$19,000 | 19,000,000,000 | Admin. Sized from the book (three largest rents plus one exit payment); set and locked on devnet. Must be ≤ `max_tvl`; 0 turns the term off |

## Reserve size and guarantees

| Parameter | Field | Devnet value | Base units | Set by |
|---|---|---|---|---|
| Maximum reserve | `caps.max_tvl` | R$1,000,000 | 1,000,000,000,000 | Admin. Must be > 0 |
| Cover per guarantee | `caps.max_cover_per_guarantee` | R$120,000 | 120,000,000,000 | Admin. Must be > 0 |
| Cover per agency | None | No per-agency cap in this release | n/a | n/a |
| Reinstatement window | `caps.max_reinstate_age` | 0 (`reinstate_guarantee` is not in this binary) | seconds | Admin. Field carved now; planned 30 days once `reinstate_guarantee` ships (Wave 2) |

At `c = 0.25`, a R$1,000,000 reserve backs about R$4,000,000 of cover. The founders' business plan for the pilot (R$39,600 of cover per lease, so R$9,900 of required coverage per lease) is a simulator input, not a program value ([ADR 0028](../decisions/0028-pilot-parameters.md)).

## Claims

| Parameter | Field | Devnet value | Base units | Set by |
|---|---|---|---|---|
| Claim payment per call | `caps.max_claim_per_call` | R$15,000 | 15,000,000,000 | Admin. Must be > 0 |
| Claim payments per sliding 31-day window | `caps.max_claim_per_period` | R$20,000 | 20,000,000,000 | Admin. Must be ≥ the per-call cap. Raised temporarily for a large approved claim, in the same proposal as `approve_claim` |
| Window length | None | 31 daily buckets | n/a | Program constant `CLAIM_WINDOW_DAYS = 31`; no parameter |
| Approval threshold | (same as `max_claim_per_call`) | R$15,000 | n/a | No separate parameter. Above it, `pay_claim` needs the admin's `approve_claim` of the exact amount; MUTAV may pay bank-first while the approval waits |
| Payout deadline | None | Not in the program. Kept in the MUTAV platform | n/a | n/a |

## Capital queue

| Parameter | Field | Devnet value | Base units | Set by |
|---|---|---|---|---|
| Smallest request | `caps.min_request` | R$1,000 | 1,000,000,000 | Admin. Must be > 0. Below it, only an exit of the balance worth at least `min_request / 10` (R$100) |
| Largest request | `caps.max_request` | R$100,000 | 100,000,000,000 | Admin. Must be ≥ `min_request` |
| Requests per fill call | `count` | 1 to 8 | n/a | Program constant `MAX_FULFIL_BATCH = 8` |
| Exit fallback wait | `caps.max_queue_wait_secs` | 0 (off) | seconds | Admin. Field carved now, feature built before outside capital. The upgrade time lock must be at least this wait once it is non-zero |

## Assets, fees and income

| Parameter | Field | Devnet value | Base units | Set by |
|---|---|---|---|---|
| Reserve mint | `reserve_mint` | Nora devnet BRS `BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4`, 6 decimals | n/a | Upgrade authority at `initialize`. Immutable |
| Settlement floor | None in v1 | 100% (BRS only; no adapter slots or allocation instructions) | n/a | Returns with the first adapter upgrade ([ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md)) |
| Guarantee-fee take | `fee_take_bps` | 20% | 2,000 bps | Admin. Program maximum 3,000 bps |
| Issuer-income take | None in v1 | 0 | n/a | No field. A take returns as a carve after a commercial decision (spec §12 Q47) |
| Treasury account | `treasury_account` | Set at deploy | n/a | Admin (`set_treasury_account`). A MUTAV BRS account; not owned by the operator, the capital wallet or the vault authority |
| Payments account | `payments_account` | Set at deploy | n/a | Admin (`set_payments_account`). Same ownership rules; different from the treasury |
| MUTAV capital wallet | `mutav_capital_wallet` | Set at deploy | n/a | Admin. Disclosed; no special treatment |

## Price and NAV safety

| Parameter | Field | Devnet value | Base units | Set by |
|---|---|---|---|---|
| NAV-move bound | `caps.max_nav_move_bps` | 100% | 10,000 bps | Admin. Kept at 100% on devnet so a claim against a small demo reserve does not halt fills; lowered for the real pilot (value open) |
| Feature flags | `feature_flags` | None | 0 | Admin. Only flags in `SUPPORTED_FEATURES` (0 in this release) |

## Unsolicited money (runbook)

| Parameter | Value | Set by |
|---|---|---|
| Return window | 30 days from arrival. After it, the admin books the money | Runbook |
| Dust threshold | R$10. Below it, the admin books directly | Runbook and app setting. There is no on-chain field |

## Roles and governance

| Parameter | Devnet value | Set by |
|---|---|---|
| Admin multisig | Squads v4, 2-of-2, two devnet wallets standing in for the founders. Real keys replace them before real money | Set at deploy |
| Upgrade multisig | Same members as the admin multisig | Set at deploy |
| Admin time lock | 5 minutes on devnet; 24 hours on the real pilot | Squads multisig configuration |
| Upgrade time lock | 1 hour on devnet; 7 days on the real pilot | Squads multisig configuration |
| Operator | A key generated at deploy | Upgrade authority at `initialize`; then admin `propose_role(1, key)` and the new key's `accept_role(1)` within 72 hours. The pauser or the admin can `revoke_operator` at once |
| Pauser | A separate key generated at deploy | Same as operator, with role id 2. The admin can `revoke_pauser` at once |
| Guardians | 1 on devnet, separate from the pauser (program maximum 3). Pause only | Admin, in one step (`set_guardians`) |
| Pending handover expiry | 72 hours per role (operator, pauser, admin). `cancel_pending(role)` clears one earlier | Program |
| Admin rotation | `propose_admin`, then `accept_admin` by the new admin | Admin |
| Allowlist root | Set after deploy | Admin (`set_allowlist_root`) |

## Program constants

Changed only by a program upgrade.

| Constant | Value | Meaning |
|---|---|---|
| `MIN_COVERAGE_RATIO_BPS` | 1,000 | Floor on `c` (0.10) |
| `MAX_COVERAGE_RATIO_BPS` | 10,000 | Cap on `c` (1.0) |
| `MAX_FEE_TAKE_BPS` | 3,000 | Maximum guarantee-fee take (30%) |
| `BPS_DENOMINATOR` | 10,000 | 100% |
| `NAV_SCALE` | 10⁹ | Fixed-point scale of NAV per share |
| `VIRTUAL_OFFSET` | 1 | One share is worth 1 BRS at launch |
| `SHARE_DECIMALS` | 6 | Share mint decimals |
| `MAX_FULFIL_BATCH` | 8 | Most requests per fill call |
| `MAX_ADAPTERS` | 8 | Most adapters the `adapter_bitmap` can mark; `adapter_count` and the bitmap are 0 |
| `SUPPORTED_FEATURES` | 0 | No optional feature can be switched on |
| Maximum guardians | 3 | Pause-only keys |
| `CLAIM_WINDOW_DAYS` | 31 | Daily buckets in the sliding claim window |
| `SUB_MINIMUM_EXIT_FLOOR_DIVISOR` | 10 | An exit of the balance below `min_request` must be worth at least `max(1, min_request / 10)` |
| `MAX_CONFIG_PARAMS` | 16 | Most fields one `set_config` call may change |
| `HANDOVER_WINDOW_SECS` | 259,200 (72 hours) | How long a proposed role key has to accept |
| `PROGRAM_LAYOUT_VERSION` | 1 | Layout version written by every account init |

## Sources

- [Specification §8 Caps](../spec.md#8-caps), [§12 Open questions](../spec.md#12-open-questions) (Q3, Q4, Q34, Q47); open items are tracked in [Open questions](../meta/open-questions.md)
- Program: [`programs/mutav/src/constants.rs`](../../programs/mutav/src/constants.rs), [`programs/mutav/src/state/config.rs`](../../programs/mutav/src/state/config.rs) (`Caps`)
- [Squads v4 documentation](https://docs.squads.so/)

## Decisions

- [ADR 0016: Coverage ratio below one](../decisions/0016-coverage-ratio-below-one.md) (c floor; its per-agency cap is removed by ADR 0019 and ADR 0022; its devnet values superseded by ADR 0028)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md) (income take)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md) (settlement floor)
- [ADR 0007: Fee take direct to treasury](../decisions/0007-fee-take-direct-to-treasury.md)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md) (two-step roles, guardians, two multisigs, `max_reinstate_age`)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md) (31-day window)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md) (amends 0016; cap on `c`)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md) (exit of the balance below `min_request`)
- [ADR 0024: Unsolicited money and backstop contributions](../decisions/0024-unsolicited-money-and-backstop.md) (runbook values)
- [ADR 0025: Exit fallback: a cooldown exit after `max_queue_wait_secs`](../decisions/0025-exit-fallback-cooldown-exit.md)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md) (sparse `set_config`; removed fields)
- [ADR 0028: Pilot parameters](../decisions/0028-pilot-parameters.md) (the values on this page)
- [ADR 0029: Claims and capital rules in the program](../decisions/0029-claims-and-capital-rules-in-the-program.md) (`stress_buffer ≤ max_tvl`, the sub-minimum exit floor)
- ADR 0019: v1 layout for the devnet release (payout deadline and per-agency cap removed; `stress_buffer`, `max_reinstate_age`, window and exit-fallback fields carved)
