# Parameters

Every parameter of the reserve for the devnet release, with its value and who sets it.

Amounts are in R$ and in BRS base units (6 decimals, 1 BRS = R$1). "Admin" means the reserve admin multisig, acting through a time-locked Squads proposal. Most admin parameters change with `set_config`, which emits one `ConfigUpdated { field, old, new }` per changed field.

## Who can change what

| Who | How | Changes |
|---|---|---|
| Program upgrade authority (upgrade multisig) | `initialize`, once | Reserve mint, first roles, first parameters |
| Reserve admin (admin multisig) | `set_config` and dedicated instructions, under the admin time lock | Coverage ratio, stress buffer, caps, fee take, NAV bound, settlement floor, accounts, allowlist, guardians, roles (two-step) |
| Program upgrade | A time-locked program upgrade | Program constants and bounds |
| Runbook | Operating procedure, not enforced by the program | Return window and dust threshold for unsolicited money |

## Coverage

| Parameter | Field | Devnet value | Base units | Set by |
|---|---|---|---|---|
| Coverage ratio `c` | `coverage_ratio_bps` | 0.10 | 1,000 bps | Admin. Floor 1,000 bps (program constant). Upper bound pinned at implementation |
| Stress buffer | `caps.stress_buffer` | R$19,000 | 19,000,000,000 | Admin. Sized from the book (three largest rents plus one exit payment). Bounds pinned at implementation |

## Reserve size and guarantees

| Parameter | Field | Devnet value | Base units | Set by |
|---|---|---|---|---|
| Maximum reserve | `caps.max_tvl` | R$300,000 | 300,000,000,000 | Admin. Must be > 0 |
| Cover per guarantee | `caps.max_cover_per_guarantee` | R$40,000 | 40,000,000,000 | Admin |
| Cover per agency | None | No per-agency cap in this release | n/a | n/a |
| Reinstatement window | `max_reinstate_age` | Set at deploy (not fixed yet; 30 days given as an example) | seconds | Admin |

At `c = 0.10`, a R$300,000 reserve backs about R$3,000,000 of cover.

## Claims

| Parameter | Field | Devnet value | Base units | Set by |
|---|---|---|---|---|
| Claim payment per call | `caps.max_claim_per_call` | R$10,000 | 10,000,000,000 | Admin. Must be > 0 |
| Claim payments per sliding window | `caps.max_claim_per_period` | R$20,000 | 20,000,000,000 | Admin. Must be ≥ the per-call cap. Raised temporarily for a large approved claim |
| Window length | `caps.claim_period_secs` | 30 days | 2,592,000 s | Admin. Must be > 0 and ≤ 90 days |
| Approval threshold | (same as `max_claim_per_call`) | R$10,000 | n/a | No separate parameter |
| Payout deadline | None | Not in the program. Kept in the MUTAV platform | n/a | n/a |

## Capital queue

| Parameter | Field | Devnet value | Base units | Set by |
|---|---|---|---|---|
| Smallest request | `caps.min_request` | R$1,000 | 1,000,000,000 | Admin. Must be > 0. A full exit may be below it |
| Largest request | `caps.max_request` | R$100,000 | 100,000,000,000 | Admin. Must be ≥ `min_request` |
| Smallest partial fill | `caps.min_fill_assets` | R$500 | 500,000,000 | Admin. Unused while the pilot fills whole requests only |
| Requests per fill call | `count` | 1 to 8 | n/a | Program constant `MAX_FULFIL_BATCH = 8` |
| Exit fallback wait | `max_queue_wait_secs` | 0 (off) | seconds | Admin. Field reserved now, feature built before outside capital |

## Assets, fees and income

| Parameter | Field | Devnet value | Base units | Set by |
|---|---|---|---|---|
| Reserve mint | `reserve_mint` | Nora devnet BRS `BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4`, 6 decimals | n/a | Upgrade authority at `initialize`. Immutable |
| Settlement floor | `caps.min_settlement_bps` (stored as `max_allocated_bps`) | 100% | 10,000 bps (stored 0) | Admin |
| Guarantee-fee take | `fee_take_bps` | 20% | 2,000 bps | Admin. Program maximum 3,000 bps |
| Issuer-income take | `income_take_bps` | 0 | 0 bps | Admin. Program maximum 0 until decided (TBD, spec §12 Q47) |
| Treasury account | `treasury_account` | Set at deploy | n/a | Admin. A MUTAV BRS account; not owned by the operator, the capital wallet or the vault authority |
| Payments account | `payments_account` | Set at deploy | n/a | Admin (`set_payments_account`). Same ownership rules; different from the treasury |
| MUTAV capital wallet | `mutav_capital_wallet` | Set at deploy | n/a | Admin. Disclosed; no special treatment |

## Price and NAV safety

| Parameter | Field | Devnet value | Base units | Set by |
|---|---|---|---|---|
| NAV-move bound | `price.max_nav_move_bps` | 100% | 10,000 bps | Admin. Kept at 100% on devnet so a claim against a small demo reserve does not halt fills; lowered for the real pilot |
| Price staleness | `price.max_staleness_secs` | Placeholder (no priced asset held) | 86,400 s | Admin. Upper bound pinned at implementation |
| Feature flags | `feature_flags` | None | 0 | Admin. Only flags in `SUPPORTED_FEATURES` (0 in this release) |

## Unsolicited money (runbook)

| Parameter | Value | Set by |
|---|---|---|
| Return window | 30 days from arrival. After it, the admin books the money | Runbook |
| Dust threshold | R$10. Below it, the admin books directly | Runbook. Whether it is also enforced on-chain is pinned at implementation |

## Roles and governance

| Parameter | Devnet value | Set by |
|---|---|---|
| Admin multisig | Squads v4, 2-of-2, two devnet wallets standing in for the founders. Real keys replace them before real money | Set at deploy |
| Upgrade multisig | Same members as the admin multisig | Set at deploy |
| Admin time lock | 5 minutes on devnet; 24 hours on the real pilot | Squads multisig configuration |
| Upgrade time lock | 1 hour on devnet; 7 days on the real pilot | Squads multisig configuration |
| Operator | A key generated at deploy | Upgrade authority at `initialize`; then admin `propose_roles` and the new key's `accept_role` |
| Pauser | A separate key generated at deploy | Same as operator |
| Guardians | 1 on devnet (program maximum 3). Pause only | Admin |
| Allowlist root | Set after deploy | Admin (`set_allowlist_root`) |

## Program constants

Changed only by a program upgrade.

| Constant | Value | Meaning |
|---|---|---|
| `MIN_COVERAGE_RATIO_BPS` | 1,000 | Floor on `c` (0.10) |
| `MAX_FEE_TAKE_BPS` | 3,000 | Maximum guarantee-fee take (30%) |
| `MAX_INCOME_TAKE_BPS` | 0 | Maximum issuer-income take. Fails closed until decided |
| `BPS_DENOMINATOR` | 10,000 | 100% |
| `NAV_SCALE`, `PRICE_SCALE` | 10⁹ | Fixed-point scale of NAV per share and prices |
| `VIRTUAL_OFFSET` | 1 | One share is worth 1 BRS at launch |
| `SHARE_DECIMALS` | 6 | Share mint decimals |
| `MAX_FULFIL_BATCH` | 8 | Most requests per fill call |
| `MAX_ADAPTERS` | 8 | Adapter slots reserved in `VaultConfig` |
| `SUPPORTED_FEATURES` | 0 | No optional feature can be switched on |
| Maximum guardians | 3 | Pause-only keys |
| Maximum `claim_period_secs` | 90 days | Keeps the claim window rolling |
| `PROGRAM_LAYOUT_VERSION` | 1 | Layout version written by every account init |

## Sources

- [Specification §8 Caps](../spec.md#8-caps), [§12 Open questions](../spec.md#12-open-questions) (Q3, Q4, Q15, Q34, Q47)
- Devnet release design decisions of 2026-10-10: devnet values, time locks, guardians, unsolicited-money runbook values (MUTAV internal decision log)
- Program: [`programs/mutav/src/constants.rs`](../../programs/mutav/src/constants.rs), [`programs/mutav/src/state/config.rs`](../../programs/mutav/src/state/config.rs) (`Caps`, `PriceParams`)
- [Squads v4 documentation](https://docs.squads.so/)

## Decisions

- [ADR 0016: Coverage ratio below one](../decisions/0016-coverage-ratio-below-one.md) (c floor; its per-agency cap is removed by pending ADR 0019 and the coverage ADR)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md) (income take)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md) (settlement floor)
- [ADR 0007: Fee take direct to treasury](../decisions/0007-fee-take-direct-to-treasury.md)
- Pending ADR: 0019 v1 layout for the devnet release (payout deadline and per-agency cap removed; `stress_buffer`, `max_reinstate_age`, window and exit-fallback fields carved)
- Pending ADR: Coverage: stress buffer and underwater reserve (amends 0016)
- Pending ADR: Claims: approval, amendment, exact payment, sliding window
- Pending ADR: Operator/admin separation and operator-compromise recovery (two-step roles, guardians, two multisigs)
- Pending ADR: Exit rights (full exit below `min_request`)
- Pending ADR: Exit fallback (`max_queue_wait_secs`)
- Pending ADR: Unsolicited money and backstop contributions
