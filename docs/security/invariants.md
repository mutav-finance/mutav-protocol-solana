# Invariants

These are the rules the mutav program keeps after every instruction in the devnet release design. The specification asserts its invariants in tests after every instruction. Invariants added by the 2026-10-10 decisions are tested in the change that builds them.

Each invariant has a stable number on this page. The "Basis" column points to the specification invariant or the decision it comes from.

## Terms

| Term | Meaning |
|---|---|
| `stable_assets` | Tracked BRS in `reserve` plus the bounded value of any priced asset (none in v1). A frozen reserve counts as 0. |
| `remaining_cover_total` | Sum of the remaining cover of every guarantee that is not closed. |
| `provisions` | Sum of the provisions of every filed, unpaid claim. |
| `coverage_required` | `max(ceil(c × remaining_cover_total), provisions + min(stress_buffer, remaining_cover_total − provisions))`. |
| `free_capital` | `max(0, stable_assets − coverage_required)` in v1. |
| `net_assets` | `max(0, stable_assets − provisions)`. |

## A. Accounting

| # | Invariant | Basis |
|---|---|---|
| 1 | `stable_assets` uses only tracked balances (and a bounded price for a priced asset). It never reads raw token balances. | Spec invariant 1; [ADR 0004](../decisions/0004-onchain-nav-internal-accounting.md) |
| 2 | Token balances are at least the tracked totals: `reserve ≥ brs_balance`, `pending_deposits ≥ pending_deposits_total`, `claims ≥ claimable_assets_total`, `pending_redemptions ≥ pending_redeem_shares`. The income inbox and the `unsolicited` account track nothing. | Spec invariant 4 |
| 3 | With no outside transfers into `reserve`, `reserve.amount == brs_balance` after any sequence of instructions. | Spec invariant 25 |
| 4 | Share supply plus shares owed on filled, unclaimed deposits equals `shares_outstanding`. Escrowed redeem shares stay in `shares_outstanding` until a fill burns them. | Spec invariant 5 |
| 5 | `Σ shares_remaining` over open redeem requests equals `pending_redeem_shares`. `Σ assets_claimable` equals `claimable_assets_total`. | Spec invariants 8, 9 |
| 6 | A frozen reserve token account counts as 0 BRS in every solvency computation that reads it (`refresh`, `register_guarantee`, `clear_fulfil_halt`). | Decision 2026-10-10 (frozen reserve in register and halt clear) |

## B. Guarantees and cover

| # | Invariant | Basis |
|---|---|---|
| 7 | On each leg of each guarantee: `leg_paid ≤ leg_cover` and `leg_provision ≤ leg_cover − leg_paid`, with any number of open filings. | Spec invariant 2; [ADR 0014](../decisions/0014-pay-claim-bound-with-concurrent-filings.md) |
| 8 | `remaining_cover_total` equals the sum of remaining cover over guarantees that are not closed. `provisions` equals the sum of the provisions of filings in status FILED. | Spec invariant 3 |
| 9 | `default_cover` and `exit_cover` never change after registration. | Spec invariant 19 |
| 10 | A guarantee closes only when it is active and has no open claim. A VOID close also needs nothing paid on either leg. | Spec invariant 21 (v1 form); devnet release decision (2026-10-09) |
| 11 | A close is reversible: `reinstate_guarantee` returns a closed guarantee to ACTIVE, restoring its cover, only within the admin-set `max_reinstate_age`. | Pending ADR: Operator/admin separation |

## C. Coverage and solvency

| # | Invariant | Basis |
|---|---|---|
| 12 | `coverage_required ≥ provisions`, and `c ≥ 0.10` (`coverage_ratio_bps ≥ 1,000`). | Spec invariant 6; [ADR 0016](../decisions/0016-coverage-ratio-below-one.md) as amended by the coverage decision |
| 13 | A provision lowers NAV only. It never lowers `stable_assets`, so nothing is counted twice against coverage. | Spec invariant 6 |
| 14 | Gated actions (`register_guarantee` and each redemption fill) fit within the free capital computed before them, and need mode normal. | Spec §4; [ADR 0005](../decisions/0005-solvency-gate-scope.md) |
| 15 | The solvency gate never refuses `pay_claim`. Pause, mode and the NAV guard do not apply to it either. Only the filing checks, the caps, liquid BRS or a frozen reserve can stop it. | Spec principle 4; [ADR 0005](../decisions/0005-solvency-gate-scope.md) |
| 16 | `pay_claim` cannot fail on the cached `coverage_required` write. The write saturates, including the stress buffer term. | Devnet release decisions (2026-10-10) |

## D. Claims

| # | Invariant | Basis |
|---|---|---|
| 17 | `pay_claim` pays exactly the filing's provision, only to `payments_account`, and at most once per notice (one `Payout` account per notice). To settle for less, the operator amends the filing down first. | Pending ADR: Claims |
| 18 | A payment above `max_claim_per_call` needs an admin `approved_amount` on that filing. The approval binds an exact amount. | Pending ADR: Claims |
| 19 | `amend_claim`, `withdraw_claim` and a re-file each reset any approval on that filing. A re-file accepts only a WITHDRAWN filing and resets `approved_amount`, `provision` and `filed_at`. | Pending ADR: Claims |
| 20 | Total claim payments in any trailing `claim_period_secs` stay within `max_claim_per_period`, approved payments included. The window slides; the previous bucket's weight rounds up. | Pending ADR: Claims |
| 21 | The maximum financial loss from a compromised operator key is bounded by the claim caps. Every other change the operator can make is reversible by another operator action. | Pending ADR: Operator/admin separation |

## E. Capital and NAV

| # | Invariant | Basis |
|---|---|---|
| 22 | Every fill is priced at the NAV of that fill and rounds in the reserve's favour, so it never lowers NAV per share. | Spec invariant 12 |
| 23 | Every deposit fill mints more than 0 shares. | Devnet release decision (2026-10-09) |
| 24 | No inflow raises NAV while `shares_outstanding == 0`. `contribute_fees`, `sweep_income` and admin bookings are refused until the first deposit is filled. | Devnet release decision (2026-10-09); Pending ADR: Unsolicited money and backstop contributions |
| 25 | No deposit fill while net assets are 0 and shares are outstanding (`ReserveUnderwater`). New money never pays for old losses. | Pending ADR: Coverage |
| 26 | Every fill passes the NAV-move guard evaluated inline, and falls inside the `nav_bounds (min, max)` the admin set when composing the proposal. A halt is sticky until the admin clears it. | Devnet release decisions (2026-10-09/10); Pending ADR: Claims; [ADR 0015](../decisions/0015-admin-clear-fulfil-halt.md) |
| 27 | Strict FIFO: no request is filled while an earlier one still has shares remaining. v1 fills whole requests. A redeem head worth 0 fills as a 0-asset fill, which burns its shares and closes it. | Spec invariant 10 (v1 form); Pending ADR: Exit rights |
| 28 | Entry is allowlisted. Exit is open to any wallet that already holds shares. A full exit may be below `min_request`, only from the owner's canonical share account, and still needs a value above 0. | Pending ADR: Exit rights |
| 29 | NAV rises from guarantee fees only through `contribute_fees`, from issuer income only through `sweep_income`, and from unsolicited or backstop money only through an admin booking, each by exactly its net amount. None of these mints shares. | Spec invariant 24; [ADR 0009](../decisions/0009-separate-mutav-money-flows.md), [ADR 0017](../decisions/0017-brs-income-intake.md) |
| 30 | `inflow_nav` is the sum of `ceil(net × 10^9 / shares_outstanding)` over inflows since the last `refresh` or halt clear, saturating. | Spec invariant 26 |

## F. Money paths

| # | Invariant | Basis |
|---|---|---|
| 31 | BRS leaves the reserve's token accounts only to: the payments account (claims), the treasury (fee take), the claims escrow and on to its owner, the owner of a refunded pending deposit, or, from `unsolicited` only, the original sender. | Spec principle 5; Pending ADRs: Exit rights, Unsolicited money |
| 32 | The income inbox's only exits are `reserve`, the treasury (take, 0 in v1) and `unsolicited`. Issuer income is never returned. | [ADR 0017](../decisions/0017-brs-income-intake.md); Pending ADR: Unsolicited money |
| 33 | The treasury and payments accounts are distinct BRS accounts, and neither is owned by the vault authority, the operator or the MUTAV capital wallet. | Spec §2.1; devnet release decision (2026-10-10) |

## G. Roles, pause and layout

| # | Invariant | Basis |
|---|---|---|
| 34 | Roles are distinct keys. A role changes only when the new key signs its acceptance. Pending keys expire. Revoking the operator is immediate and clears any pending role keys. | Pending ADR: Operator/admin separation |
| 35 | Pause stops only capital flows (`request_*`, `fulfil_*`) and new guarantees. Claim instructions, owner cancels and claims, and cranks stay open. | [ADR 0008](../decisions/0008-uniform-capital-flow-and-pause-scope.md); pause-scope decision 2026-10-10 |
| 36 | `_reserved` bytes are never read or written by logic and survive every instruction. An account with a version above 1, or an unknown status constant, is refused with `UnsupportedVersion`. | Spec §14.2 rules R1b, R4 |

## Planned invariants

The fiança lifecycle of ADR 0012 adds lifecycle invariants (spec invariants 18 to 23: coverage release by state, exhaustion, claims tail). They take effect when that lifecycle is built. See [Known limitations](known-limitations.md).

## Sources

- [Specification §4 Invariants and formulas](../spec.md#4-invariants-and-formulas)
- [Specification §1 Principles](../spec.md#1-principles), [§2.1 Money flows](../spec.md#21-three-separate-mutav-money-flows-adr-0009-and-issuer-income-adr-0017)
- [Specification §14.2 Padding and version](../spec.md#142-padding-and-version)
- Technical reference §6 and §8, devnet release design (branch `docs/protocol-reference`, PR #32)
- Pre-devnet design decisions log, 2026-10-09 to 2026-10-10 (internal notes)
- Code: [`programs/mutav/src/solvency.rs`](../../programs/mutav/src/solvency.rs), [`programs/mutav/src/math.rs`](../../programs/mutav/src/math.rs), [`programs/mutav/src/pricing.rs`](../../programs/mutav/src/pricing.rs)
- Tests: [`tests/tests/`](../../tests/tests/)

## Decisions

- [ADR 0004: NAV computed on-chain with internal accounting](../decisions/0004-onchain-nav-internal-accounting.md)
- [ADR 0005: Solvency gate scope](../decisions/0005-solvency-gate-scope.md)
- [ADR 0008: One capital flow for everyone; pause never blocks claims](../decisions/0008-uniform-capital-flow-and-pause-scope.md)
- [ADR 0009: Separate MUTAV money flows](../decisions/0009-separate-mutav-money-flows.md)
- [ADR 0010: Partial fills at the queue head](../decisions/0010-partial-fills-at-queue-head.md) (v1 fills whole requests)
- [ADR 0014: `pay_claim` bound with concurrent filings](../decisions/0014-pay-claim-bound-with-concurrent-filings.md) (the payment amount is narrowed to the exact provision by the pending claims ADR)
- [ADR 0015: Admin clear for the NAV-move halt](../decisions/0015-admin-clear-fulfil-halt.md)
- [ADR 0016: Coverage ratio below 1.0](../decisions/0016-coverage-ratio-below-one.md)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md)
- Pending ADR: Operator/admin separation and operator-compromise recovery
- Pending ADR: Claims: approval, amendment, exact payment, sliding window
- Pending ADR: Coverage: stress buffer and underwater reserve (amends 0016)
- Pending ADR: Exit rights (open exit, full exit below minimum, refunds)
- Pending ADR: Unsolicited money and backstop contributions
- Pending ADR: 0019 v1 layout for the devnet release
