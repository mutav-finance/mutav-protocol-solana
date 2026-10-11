# Invariants

These are the rules the mutav program keeps after every instruction in the devnet release design. The specification asserts its invariants in tests after every instruction. Invariants added by ADRs 0020 to 0029 are tested in the change that builds them. Rows marked *later* describe instructions that are decided but not in the devnet binary.

Each invariant has a stable number on this page. The "Basis" column points to the specification invariant or the decision it comes from.

## Terms

| Term | Meaning |
|---|---|
| `stable_assets` | Tracked BRS in `reserve` plus the bounded value of any priced asset (none in v1). A frozen reserve counts as 0. Computed at every gate; not stored. |
| `remaining_cover_total` | Sum of the remaining cover of every guarantee that is not closed. |
| `provisions` | Sum of the provisions of every filed, unpaid claim. |
| `coverage_required` | `max(ceil(c × remaining_cover_total / 10_000), provisions + min(stress_buffer, unprovisioned))`, with `unprovisioned = max(0, remaining_cover_total − provisions)` and `c` in basis points. `stress_buffer ≤ max_tvl`; 0 turns the stress term off. |
| `free_capital` | `max(0, stable_assets − coverage_required)` in v1. |
| `net_assets` | `max(0, stable_assets − provisions)`. |
| Underwater | NAV per share below the smallest published unit while shares are outstanding: `net_assets × NAV_SCALE < shares_outstanding`. An empty reserve is not underwater. |

## A. Accounting

| # | Invariant | Basis |
|---|---|---|
| 1 | `stable_assets` uses only tracked balances (and a bounded price for a priced asset). It never reads raw token balances. | Spec invariant 1; [ADR 0004](../decisions/0004-onchain-nav-internal-accounting.md) |
| 2 | Token balances are at least the tracked totals: `reserve ≥ brs_balance`, `pending_deposits ≥ pending_deposits_total`, `claims ≥ claimable_assets_total`, `pending_redemptions ≥ pending_redeem_shares`. The income inbox and the `unsolicited` account track nothing. | Spec invariant 4 |
| 3 | With no outside transfers into `reserve`, `reserve.amount == brs_balance` after any sequence of instructions. | Spec invariant 25 |
| 4 | Share supply plus shares owed on filled, unclaimed deposits equals `shares_outstanding`. Escrowed redeem shares stay in `shares_outstanding` until a fill burns them. | Spec invariant 5 |
| 5 | The shares of open redeem requests, pending or parked by the admin, sum to `pending_redeem_shares`. The assets owed on filled, unclaimed redemptions sum to `claimable_assets_total`. | Spec invariants 8, 9 |
| 6 | A frozen reserve token account counts as 0 BRS in every coverage computation that reads it (`refresh`, `register_guarantee`, `clear_fulfil_halt`). | [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md) decision 9 |

## B. Guarantees and cover

| # | Invariant | Basis |
|---|---|---|
| 7 | On each leg of each guarantee: `leg_paid ≤ leg_cover` and `leg_provision ≤ leg_cover − leg_paid`, with any number of open filings. | Spec invariant 2; [ADR 0014](../decisions/0014-pay-claim-bound-with-concurrent-filings.md) |
| 8 | `remaining_cover_total` equals the sum of remaining cover over guarantees that are not closed. `provisions` equals the sum of the provisions of filings in status FILED. | Spec invariant 3 |
| 9 | `default_cover` and `exit_cover` never change after registration. | Spec invariant 19 |
| 10 | A guarantee closes only when it is active and has no open claim. A VOID close also needs nothing paid on either leg. | Spec invariant 21 (v1 form); [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md) decision 3 |
| 11 | *Later:* a close is reversible: `reinstate_guarantee` returns a closed guarantee to ACTIVE, restoring its cover, only within the admin-set `max_reinstate_age` (0, off, on devnet). Not in the devnet binary. | [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md) |

## C. Coverage

| # | Invariant | Basis |
|---|---|---|
| 12 | `coverage_required ≥ provisions`, and `0.10 ≤ c ≤ 1.0` (`1,000 ≤ coverage_ratio_bps ≤ 10,000`). | Spec invariant 6; [ADR 0016](../decisions/0016-coverage-ratio-below-one.md) as amended by [ADR 0022](../decisions/0022-coverage-stress-buffer-underwater-reserve.md) |
| 13 | A provision lowers NAV only. It never lowers `stable_assets`, so nothing is counted twice against coverage. | Spec invariant 6 |
| 14 | Gated actions (`register_guarantee` and each redemption fill) fit within the free capital computed before them, and need mode normal. | Spec §4; [ADR 0005](../decisions/0005-solvency-gate-scope.md) |
| 15 | The coverage gate never refuses `pay_claim`. Pause, mode and the NAV guard do not apply to it either. Only the filing checks, the caps, liquid BRS or a frozen reserve can stop it. | Spec principle 4; [ADR 0005](../decisions/0005-solvency-gate-scope.md) |
| 16 | The claim path (`file_claim`, `pay_claim`, `close_guarantee`) cannot fail on the cached `coverage_required` write. The write saturates, including the stress buffer term. `register_guarantee` and `set_config` fail closed instead. | [ADR 0022](../decisions/0022-coverage-stress-buffer-underwater-reserve.md) decision 3; [ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md) |

## D. Claims

| # | Invariant | Basis |
|---|---|---|
| 17 | `pay_claim` pays exactly the filing's provision (the caller's `expected_amount` must equal it), only to `payments_account`, and at most once per filing: it moves the filing to `PAID`, which is terminal for amendments. To settle for less, the operator will amend the filing down first (`amend_claim`, Wave 2). | [ADR 0021](../decisions/0021-claims-approval-amendment-exact-payment.md) |
| 18 | A payment above `max_claim_per_call` needs an admin `approved_amount` on that filing. The approval binds an exact amount: `approved_amount == provision`. Only the admin's `approve_claim` writes it, with `amount == provision` and `expected_revision == filing.revision`; without it a payment above the per-call cap is refused (`ClaimCallCapExceeded`). | [ADR 0021](../decisions/0021-claims-approval-amendment-exact-payment.md) |
| 19 | *Later (Wave 2):* every `amend_claim`, including an amendment to 0 (which sets `WITHDRAWN`), resets any approval on that filing. `amend_claim` is refused on `PAID` and `SETTLED`. `refile_claim` accepts only a `WITHDRAWN` filing and resets `approved_amount`, `provision` and `filed_at`. | [ADR 0021](../decisions/0021-claims-approval-amendment-exact-payment.md) |
| 20 | Claim payments of the last 31 UTC days, counted in 31 daily buckets (`CLAIM_WINDOW_DAYS`), plus the payment being made stay within `max_claim_per_period`, approved payments included. So no 30-day span pays out more than the cap. | [ADR 0021](../decisions/0021-claims-approval-amendment-exact-payment.md) |
| 21 | The maximum financial loss from a compromised operator key is bounded by the claim caps (R$15k per call, R$20k per 31 days on devnet and the pilot). Every other change the operator can make is reversible by another operator action once Wave 2 ships; until then a fake filing stays provisioned and unpaid. | [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md) |

## E. Capital and NAV

| # | Invariant | Basis |
|---|---|---|
| 22 | Every fill is priced at the NAV of that fill and rounds in the reserve's favour, so it never lowers NAV per share. | Spec invariant 12 |
| 23 | Every deposit fill mints more than 0 shares. | [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md) |
| 24 | No inflow raises NAV while `shares_outstanding == 0`. `contribute_fees` and `sweep_income` are refused with `NoSharesOutstanding` until the first deposit is filled; the later `book_unsolicited` follows the same rule. | [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md); [ADR 0024](../decisions/0024-unsolicited-money-and-backstop.md); [ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md) |
| 25 | No deposit or redemption fill while the reserve is underwater (`ReserveUnderwater`). New money never pays for old losses. | [ADR 0022](../decisions/0022-coverage-stress-buffer-underwater-reserve.md); [ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md) |
| 26 | Every fill passes the NAV-move guard evaluated inline at batch start, and falls inside the `nav_bounds (min, max)` the admin set when composing the proposal. The inline refusal does not latch; `refresh` latches `fulfil_halted`, which is sticky until the admin clears it. The batch that mints the first shares seeds the guard's baseline; the batch that burns the last shares clears it. | [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md); [ADR 0015](../decisions/0015-admin-clear-fulfil-halt.md) |
| 27 | Strict FIFO: no request is filled while an earlier one still has shares remaining. v1 fills whole requests. A redeem head worth 0 BRS at fill time is never filled: the batch stops with the head untouched; the owner cancels it, or the admin parks it. | Spec invariant 10 (v1 form); [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md) |
| 28 | Entry is allowlisted. Exit is open to holders: `request_redeem` checks the allowlist only when the debited share account is empty. Below `min_request`, only an exit of the balance is accepted: from the owner's canonical share account, leaving a remainder worth less than `min_request`, and worth at least `max(1, min_request / 10)`. | [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md); [ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md) |
| 29 | NAV rises from guarantee fees only through `contribute_fees`, from issuer income only through `sweep_income`, and (later) from unsolicited or backstop money only through `book_unsolicited`, each by exactly its net amount. Until then MUTAV's backstop goes through `contribute_fees`. None of these mints shares. | Spec invariant 24; [ADR 0009](../decisions/0009-separate-mutav-money-flows.md), [ADR 0017](../decisions/0017-brs-income-intake.md) |
| 30 | `inflow_nav` is the sum of `ceil(net × 10^9 / shares_outstanding)` over inflows since the last `refresh` or halt clear, saturating. | Spec invariant 26 |

## F. Money paths

| # | Invariant | Basis |
|---|---|---|
| 31 | BRS leaves the reserve's token accounts only to: the payments account (claims), the treasury (fee take), the claims escrow and on to its owner, or the owner of a cancelled pending deposit. A later upgrade adds a return from `unsolicited` only to the original sender. | Spec principle 5; [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md), [ADR 0024](../decisions/0024-unsolicited-money-and-backstop.md) |
| 32 | The income inbox's only exit is `reserve` (`sweep_income`); a later upgrade adds `unsolicited` (`classify_unsolicited`). There is no take on issuer income in v1. Issuer income is never returned. | [ADR 0017](../decisions/0017-brs-income-intake.md); [ADR 0024](../decisions/0024-unsolicited-money-and-backstop.md); [ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md) |
| 33 | The treasury and payments accounts are distinct BRS accounts, and neither is owned by the vault authority, the operator or the MUTAV capital wallet. | Spec §2.1; [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md) |

## G. Roles, pause and layout

| # | Invariant | Basis |
|---|---|---|
| 34 | Roles are distinct, non-default keys. The operator, pauser and admin change only when the new key signs its acceptance (`accept_role`, `accept_admin`); each pending key expires 72 hours after the proposal. `revoke_operator` (pauser or admin) is immediate and clears the pending operator key; `revoke_pauser` (admin) is immediate and clears the pending pauser key. Guardians, set in one step by `set_guardians`, are never a repeated key or a current role key; the default key marks an empty slot. | [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md) |
| 35 | Pause stops only capital flows (`request_*`, `fulfil_*`) and new guarantees. Claim instructions, cancels and claims, role instructions, cranks and (later) the unsolicited-money instructions stay open. | [ADR 0008](../decisions/0008-uniform-capital-flow-and-pause-scope.md); [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md) decision 5 |
| 36 | `_reserved` bytes are never read or written by logic and survive every instruction. An account with a version above 1, or an unknown status constant, is refused with `UnsupportedVersion`. | Spec §14.2 rules R1b, R4 |

## Planned invariants

The fiança lifecycle of ADR 0012 adds lifecycle invariants (spec invariants 18 to 23: coverage release by state, exhaustion, claims tail). They take effect when that lifecycle is built. See [Known limitations](known-limitations.md).

## Sources

- [Specification §4 Invariants and formulas](../spec.md#4-invariants-and-formulas)
- [Specification §1 Principles](../spec.md#1-principles), [§2.1 Money flows](../spec.md#21-three-separate-mutav-money-flows-adr-0009-and-issuer-income-adr-0017)
- [Specification §14.2 Padding and version](../spec.md#142-padding-and-version)
- Technical reference §6 and §8, devnet release design (branch `docs/protocol-reference`, PR #32)
- Code: [`programs/mutav/src/coverage.rs`](../../programs/mutav/src/coverage.rs), [`programs/mutav/src/math.rs`](../../programs/mutav/src/math.rs), [`programs/mutav/src/pricing.rs`](../../programs/mutav/src/pricing.rs)
- Tests: [`tests/tests/`](../../tests/tests/)

## Decisions

- [ADR 0004: NAV computed on-chain with internal accounting](../decisions/0004-onchain-nav-internal-accounting.md)
- [ADR 0005: Coverage gate scope](../decisions/0005-solvency-gate-scope.md)
- [ADR 0008: One capital flow for everyone; pause never blocks claims](../decisions/0008-uniform-capital-flow-and-pause-scope.md)
- [ADR 0009: Separate MUTAV money flows](../decisions/0009-separate-mutav-money-flows.md)
- [ADR 0010: Partial fills at the queue head](../decisions/0010-partial-fills-at-queue-head.md) (v1 fills whole requests)
- [ADR 0014: `pay_claim` bound with concurrent filings](../decisions/0014-pay-claim-bound-with-concurrent-filings.md) (the payment amount is narrowed to the exact provision by ADR 0021)
- [ADR 0015: Admin clear for the NAV-move halt](../decisions/0015-admin-clear-fulfil-halt.md)
- [ADR 0016: Coverage ratio below 1.0](../decisions/0016-coverage-ratio-below-one.md)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md) (amends 0016)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md)
- [ADR 0024: Unsolicited money and backstop contributions](../decisions/0024-unsolicited-money-and-backstop.md)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md)
- [ADR 0019: v1 layout for the devnet release](../decisions/0019-v1-layout-for-the-devnet-release.md)
- [ADR 0028: Pilot parameters](../decisions/0028-pilot-parameters.md)
- [ADR 0029: Claims and capital rules in the program](../decisions/0029-claims-and-capital-rules-in-the-program.md)
