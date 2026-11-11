# MUTAV reserve program: pre-devnet security review

*Review dates: 2026-10-09 to 2026-10-10. Commit reviewed: [`f30664a`](https://github.com/mutav-finance/mutav-protocol-solana/commit/f30664a) on `mutav-finance/mutav-protocol-solana` (`main`). Reviewed by the MUTAV team with AI-assisted adversarial review. This is an internal review, not an independent audit.*

## Contents

1. [Overview](#1-overview)
2. [Severity definitions](#2-severity-definitions)
3. [Summary of findings](#3-summary-of-findings)
4. [Detailed findings](#4-detailed-findings)
5. [Design decisions taken during the review](#5-design-decisions-taken-during-the-review)
6. [Confirmed-sound properties](#6-confirmed-sound-properties)
7. [OWASP Smart Contract Top 10 (2026) mapping](#7-owasp-smart-contract-top-10-2026-mapping)
8. [Comparison with a comparable program's audits](#8-comparison-with-a-comparable-programs-audits)
9. [Deferred items and residual risks](#9-deferred-items-and-residual-risks)
10. [Appendix: devnet parameters](#appendix-devnet-parameters)

---

## 1. Overview

### 1.1 Purpose

The review ran before the first devnet deploy of the MUTAV reserve program. After that deploy the v1 account layout is frozen: account changes must be carved from padding or added as new accounts, and existing instructions keep their arguments and account lists (CI `idl-compat`). The review therefore had two goals:

- find security and economic faults in the code at `f30664a`;
- find every change that touches layout or the interface of an existing instruction, so it lands before the freeze.

### 1.2 Scope

| Component | Path | Notes |
|---|---|---|
| Program | `programs/mutav` | 26 instructions, all state accounts, solvency, pricing, math, token guard |
| Client | `clients/js` | Codama-generated client, hand-written reads, math mirror, previews, PDA derivation, allowlist proofs |
| Devnet scripts | `scripts/devnet`, `scripts/release`, `scripts/check-no-keys.sh` | deploy, init, verify, Squads checks, upgrade proposals |
| Pilot app | `app/` | Next.js app: `/reserve`, `/operator`, `/investor`, `/admin`, API routes, transaction relay, Squads proposal composers |

Spec-only instructions that are not in the binary (`allocate`, `deallocate`, `whitelist_adapter`, `remove_adapter`, `pay_claim_admin`) were reviewed as design only. Third-party programs (Squads v4, the BRS issuer's mint program) were out of scope except where the reserve integrates with them.

### 1.3 Method

1. **Five parallel read-only adversarial reviews**, one per area:
   - program account checks and roles;
   - program economics and math;
   - program queue, lifecycle and layout;
   - client and scripts;
   - app.
2. **Main-session verification.** Every High and Medium finding in program, scripts and app code was re-checked against the source at `f30664a` before it was accepted. Findings that were plausible but not reproduced are marked as such.
3. **Comparable-program audit mapping.** All 59 findings from three published audits of a comparable Solana real-world-asset program (OnRe; OtterSec 16, Ackee 17, Quantstamp 26) were mapped to MUTAV by vulnerability class, followed by an area-by-area design comparison.
4. **OWASP Smart Contract Top 10 (2026) pass** over the code and over the target design produced by the review's decisions.
5. **Decision walkthrough.** Each finding that changes economic behaviour was resolved with the founders and recorded as a design decision (section 5). Decisions that need it get an ADR and a spec update in the fix PR.

### 1.4 Limitations

- No fuzzing, property-based invariant testing or formal verification was done in this review.
- Tests were not run during the review. Nothing was built or deployed. The last verified run at `f30664a` (283 LiteSVM tests, 50 program unit tests, 816 client tests, 39 script tests, 118 app tests, an 8/8 end-to-end smoke) predates the review.
- This is not an independent third-party audit. The reviewers had full access to the team's design intent, which can hide assumptions an outside auditor would question.
- Findings NEW-A to NEW-F concern the target design produced during the review, not code at `f30664a`. They must be re-checked against the fix PRs.

### 1.5 Result in one paragraph

The account validation, arithmetic and pause model at `f30664a` are sound. The main faults were economic: a claim payment could release more provision than it paid (F1), a claim window could pass twice its cap in minutes (F6), and an empty or underwater reserve priced deposits badly (F2, F3). The deploy scripts could reach mainnet through a cluster moniker (S1). The layout needed more padding before the freeze (L-1). The review also produced a governing principle for the protocol: the operator and the reserve admin are separate roles, every operator registry action is reversible by another operator action, and the maximum loss from a compromised operator key is the admin-set claim caps.

---

## 2. Severity definitions

| Severity | Meaning |
|---|---|
| **Critical** | Direct loss or permanent lock of reserve assets by an unprivileged party, with no precondition. None found. |
| **High** | Loss of reserve assets or an irreversible operational fault reachable through a normal path or a single compromised hot key, or a fault that would force a per-account migration after the freeze. |
| **Medium** | A broken invariant, a bypass of a cap or guard, a denial of service on a core flow, or a loss that needs an unusual but realistic condition. |
| **Low** | Defence in depth, a missing bound, an edge case with limited impact, or an operational hazard with a known workaround. |
| **Informational** | Documentation, test coverage, events or code quality, with no direct security impact. |

Where an internal working note gave a split rating (for example "Low to Medium"), this report uses the lower rating unless the finding breaks the cap-bounded-loss principle (section 5, decision 1).

---

## 3. Summary of findings

55 findings: **0 Critical, 3 High, 18 Medium, 28 Low, 6 Informational.**

Status for every finding is **Open, fix planned** unless marked otherwise. "Planned" names the wave and PR from the refactor plan:

- **Wave 1** lands before the devnet deploy (PR 1 layout, PR 2 interface changes, PR 3 claims and capital rules, PR 4 deploy scripts, PR 5 app).
- **Wave 2** ships as program upgrades during the hackathon (PR 6 claims instructions, PR 7 recovery and capital, PR 8 unsolicited money, PR 9 client).
- **Wave 3** lands after the hackathon, before outside capital.

"D-n" refers to the design decisions in section 5.

| ID | Title | Severity | Component | Resolution | Status | Decision |
|---|---|---|---|---|---|---|
| L-1 | Padding too small for the ADR 0012 lifecycle carves | High | Program | Planned: Wave 1 / PR 1 | Open, fix planned | ADR 0012 |
| F1 | `pay_claim` releases the whole provision whatever is paid | High | Program | Planned: Wave 1 / PR 3; Wave 2 / PR 6 | Open, fix planned | D-3 |
| S1 | Cluster guard accepts mainnet monikers and non-devnet hosts | High | Scripts | Planned: Wave 1 / PR 4 | Open, fix planned | |
| AV-1 | `close_guarantee` ignores the close reason rules | Medium | Program | Planned: Wave 1 / PR 2 | Open, fix planned | D-1, D-2 |
| F2 | First deposit after booked income can mint zero shares | Medium | Program | Planned: Wave 1 / PR 3 | Open, fix planned | D-1 |
| F4 | NAV-move guard only evaluated in `refresh` | Medium | Program | Planned: Wave 1 / PR 3 | Open, fix planned | |
| E-1 | Late payouts not counted before `refresh` | Medium | Program | Planned: Wave 1 / PR 1 (feature removed) | Open, fix planned | D-7 |
| AV-2 | No way to withdraw a mistaken or malicious filing | Medium | Program | Planned: Wave 2 / PR 6 (status carved in PR 1) | Open, fix planned | D-2, D-3 |
| AV-6 | De-listed investors cannot exit and block the deposit queue | Medium | Program | Planned: Wave 1 / PR 3; Wave 2 / PR 7 | Open, fix planned | D-6 |
| F3 | Deposits at NAV zero overflow; deposits into negative equity pay for old losses | Medium | Program | Planned: Wave 1 / PR 3; Wave 2 / PR 8 | Open, fix planned | D-4, D-5 |
| F6 | Tumbling claim window allows twice the period cap | Medium | Program | Planned: Wave 1 / PR 3 (field carved in PR 1) | Open, fix planned | D-3 |
| S2 | Upgrade-authority handover takes any key and has no recovery | Medium | Scripts | Planned: Wave 1 / PR 4 | Open, fix planned | |
| S4 | `verify` does not compare parameters with the config | Medium | Scripts | Planned: Wave 1 / PR 4 | Open, fix planned | |
| S5 | Squads check accepts any members, any threshold and any owner | Medium | Scripts | Planned: Wave 1 / PR 4 | Open, fix planned | D-8 |
| A1 | Relay forwards transactions unrelated to the reserve | Medium | App | Planned: Wave 1 / PR 5 | Open, fix planned | |
| A2 | Unauthenticated RPC-backed routes without caching or rate limits | Medium | App | Planned: Wave 1 / PR 5 | Open, fix planned | |
| A3 | Overlapping-proposal check scans only the last 10 proposals; no reject or cancel | Medium | App | Planned: Wave 1 / PR 5 | Open, fix planned | D-8 |
| A4 | App cluster check matches URL text only | Medium | App | Planned: Wave 1 / PR 5 | Open, fix planned | |
| A6 | No framing or content-type headers on admin pages | Medium | App | Planned: Wave 1 / PR 5 | Open, fix planned | |
| NEW-A | Compromised operator can move value through an accomplice's fill | Medium | Design | Planned: Wave 1 / PR 2 | Open, fix planned | D-1, D-3 |
| NEW-B | A zero-value redemption head stops the queue | Medium | Design | Planned: Wave 1 / PR 3 | Open, fix planned | D-6 |
| Q-1 | Dust below `min_request` cannot be redeemed | Low | Program | Planned: Wave 1 / PR 3 | Open, fix planned | D-6 |
| Q-2 | Whole fills only: one large head request stalls redemptions | Low | Program | Accepted for the pilot; partial fills in Wave 3 | Acknowledged, deferred | D-6 |
| F5 | Slow NAV drift passes the per-fill guard | Low | Program | Deferred to Wave 3 | Acknowledged, deferred | |
| F7 | `validate_params` missing lower and upper bounds | Low | Program | Planned: Wave 1 / PR 2 | Open, fix planned | |
| F9 | `coverage_required` cache write can fail on the claim payment path | Low | Program | Planned: Wave 1 / PR 2 | Open, fix planned | D-4 |
| AV-3 | Treasury or payments account may be owned by the operator | Low | Program | Planned: Wave 1 / PR 2 | Open, fix planned | D-1 |
| AV-4 | Mint guard accepts a Token-2022 transfer-fee authority | Low | Program | Planned: Wave 1 / PR 2 | Open, fix planned | |
| AV-7 | `fulfil_deposits` `count` unbounded; missing per-fill events | Low | Program | Planned: Wave 1 / PR 3 | Open, fix planned | |
| E-2 | `refresh` raises the fill halt without an event | Low | Program | Planned: Wave 1 / PR 3 | Open, fix planned | |
| Q-4 | Claim-notice gate is inert | Low | Program | Runbook now; built in Wave 3 | Acknowledged, deferred | |
| AV-5 | Compromised pauser key can stop claim payments until roles rotate | Low | Program | Runbook | Acknowledged | D-8 |
| F11 | BRS sent directly into `reserve` is untracked with no exit | Low | Program | Planned: Wave 2 / PR 8 (account carved in PR 1) | Open, fix planned | D-5 |
| Q-6 | No price protection for requesters | Low | Program | Deferred to Wave 3 | Acknowledged, deferred | |
| NEW-1 | `register_guarantee` and `clear_fulfil_halt` ignore a frozen reserve | Low | Program | Planned: Wave 1 / PR 2 | Open, fix planned | |
| NEW-2 | The admin key can only be rotated by a program upgrade | Low | Program | Planned: Wave 1 / PR 2 | Open, fix planned | D-8 |
| S3 | Reserve mint decimals not checked | Low | Scripts, Program | Planned: Wave 1 / PR 2 and PR 4 | Open, fix planned | |
| S6 | Key-scanning script misses common patterns and paths | Low | Scripts | Planned: Wave 1 / PR 4 | Open, fix planned | |
| S7 | Deploy accepts a payer key file readable by other users | Low | Scripts | Planned: Wave 1 / PR 4 | Open, fix planned | |
| S8 | Invalid `--vault-index` silently becomes 0 | Low | Scripts | Planned: Wave 1 / PR 4 | Open, fix planned | |
| C1 | Deposit preview ignores pause, halt, batch and TVL checks | Low | Client | Planned: Wave 2 / PR 9 | Open, fix planned | |
| C2 | Client NAV at zero assets differs from the program | Low | Client | Planned: Wave 2 / PR 9 | Open, fix planned | |
| C3 | `fetchReserve` reads config and state in two calls | Low | Client | Planned: Wave 2 / PR 9 | Open, fix planned | |
| A5 | RPC URL can leak in error messages | Low | App | Planned: Wave 1 / PR 5 | Open, fix planned | |
| A8 | Register form uses floating-point multiplier math | Low | App | Planned: Wave 1 / PR 5 | Open, fix planned | |
| A9 | Allowlist root composed from browser-supplied owners | Low | App | Planned: Wave 1 / PR 5 | Open, fix planned | |
| NEW-C | Re-filing a withdrawn notice could reuse an old approval | Low | Design | Planned: Wave 2 / PR 6 | Open, fix planned | D-3 |
| NEW-D | Pending role handovers survive `revoke_operator` and never expire | Low | Design | Planned: Wave 1 / PR 2 | Open, fix planned | D-8 |
| NEW-E | `reinstate_guarantee` has no age bound and no event | Low | Design | Planned: Wave 2 / PR 7 (field carved in PR 1) | Open, fix planned | D-2 |
| L-2 | Seed-collision test omits four seeds | Informational | Program | Planned: Wave 1 / PR 3 | Open, fix planned | |
| L-3 | Spec says `ClaimNotice` ships in the pilot; it does not | Informational | Program (spec) | Planned: Wave 1 (spec) | Open, fix planned | |
| C4 | Client vectors cover 17 of 26 instructions | Informational | Client | Planned: Wave 2 / PR 9 | Open, fix planned | |
| A7 | Forbidden-words test misses files and word forms | Informational | App | Planned: Wave 1 / PR 5 | Open, fix planned | |
| A10 | `/api/investor?owner=` reveals allowlist membership | Informational | App | Accepted for the pilot | Acknowledged | |
| NEW-F | Minor hardening items in the target design | Informational | Design | Planned: Wave 1 / PR 3, Wave 2 / PR 7 and PR 8 | Open, fix planned | |

---

## 4. Detailed findings

Locations refer to `f30664a`. Program paths are relative to `programs/mutav/src/`; app paths to `app/`.

### 4.1 Program

#### L-1. Padding too small for the ADR 0012 lifecycle carves

- **Severity:** High
- **Location:** `state/guarantee.rs:49`, `state/claim.rs:27`, `state/payout.rs:33`; `docs/spec.md:1384`
- **Description:** `Guarantee`, `ClaimFiling` and `Payout` each ship `_reserved: [u8; 64]`. Spec §3 and §14.2 require 192, 128 and 128 bytes to hold the ADR 0012 lifecycle fields (88, 49 and 74 bytes). `Guarantee` and `Payout` cannot hold them. The spec defers the growth to "when ADR 0012 is implemented".
- **Impact:** after the freeze, the ADR 0012 lifecycle would need a per-account migration of every live guarantee, filing and payout.
- **Failure scenario:** devnet runs with live records. The ADR 0012 upgrade cannot fit its fields, so each account must be reallocated and rewritten by a migration instruction, with the usual risks of partial migration.
- **Resolution:** grow the padding now (`GUARANTEE_SIZE` 377, `CLAIM_FILING_SIZE` 220, `PAYOUT_SIZE` 293), carve every field decided in this review at the same time (section 5), regenerate the v1 fixtures for the last time, and add a layout test that each account's padding is at least its ADR 0012 carve. Remove the deferral sentence from the spec.
- **Reference:** ADR 0012; spec §3, §14.

#### F1. `pay_claim` releases the whole provision whatever is paid

- **Severity:** High
- **Location:** `instructions/operator/pay_claim.rs:188-213`; `instructions/operator/file_claim.rs:73`
- **Description:** `pay_claim` pays `amount ≤ caps.max_claim_per_call` but releases the filing's entire `provision`. The spec's path for payments above the per-call cap, `pay_claim_admin`, is not in the binary.
- **Impact:** provisions are understated after a partial payment. The unpaid balance becomes free capital that `fulfil_redeems` can pay out, while the reserve still owes it.
- **Failure scenario:** a R$25k filing is paid at the R$10k per-call cap. All R$25k of provision is released. R$15k still owed to the landlord is now counted as surplus and can leave through redemptions.
- **Resolution (D-3):** `pay_claim` pays exactly the filing's provision, with no hidden release. A provision above `max_claim_per_call` requires an admin `approve_claim` that records `approved_amount` on the filing; approved payments count toward the strict per-period cap. The operator corrects amounts with `amend_claim`. `approve_claim` replaces `pay_claim_admin` as the over-cap path. Until `approve_claim` ships (Wave 2 / PR 6), MUTAV pays above-cap claims from its own bank account first and the reserve reimburses the payments account later. The exact-payment rule lands in PR 3; the new instructions in PR 6.
- **Reference:** claims ADR (new; amends ADR 0012's admin path); spec §5.4, §8.

#### AV-1. `close_guarantee` ignores the close reason rules

- **Severity:** Medium
- **Location:** `instructions/operator/close_guarantee.rs:52-54`
- **Description:** the instruction checks only `status == ACTIVE && open_claims == 0`. The spec's VOID rule (nothing paid) is not enforced and there is no `reason` argument.
- **Impact:** a compromised operator key can close every guarantee. Coverage required collapses and capital that backs real guarantees is reported as free.
- **Failure scenario:** a stolen operator key closes all active guarantees in one batch. Surplus jumps and redemptions drain capital that live contracts still need.
- **Resolution (D-1, D-2):** add `close_guarantee(id, reason)` now so the IDL does not break later. VOID requires nothing paid and no open claim; RELEASED requires no open claim (claims tail with ADR 0012). No release cap: closes are reversible by a new operator through `reinstate_guarantee`.
- **Reference:** separation ADR (new); spec §5.2.

#### F2. First deposit after booked income can mint zero shares

- **Severity:** Medium
- **Location:** `instructions/capital/fulfil_deposits.rs:90`; `math.rs:48-55`
- **Description:** if guarantee fees or issuer income are booked while no shares exist, net assets are positive with zero supply. A later deposit no larger than net assets rounds to zero shares.
- **Impact:** the depositor's assets enter the reserve and no shares are minted.
- **Failure scenario:** `contribute_fees` books R$5k before the capital wallet's first deposit is filled. A R$1k deposit is filled and mints 0 shares.
- **Resolution:** `require!(shares > 0)` in `fulfil_deposits`. The program refuses `contribute_fees` and `sweep_income` while `shares_outstanding == 0`; the money waits in the inbox until the first deposit is filled. No 1:1 pricing special case.
- **Reference:** separation ADR line; spec §5.3, §5.5.

#### F4. NAV-move guard only evaluated in `refresh`

- **Severity:** Medium
- **Location:** `instructions/capital/fulfil_deposits.rs:68`, `instructions/capital/fulfil_redeems.rs:112`; `instructions/public/refresh.rs:155`
- **Description:** the halt on a large NAV move is raised only by `refresh`. Fills read NAV directly and do not test the move.
- **Impact:** a fill placed right after a shock and before a `refresh` prices at the shocked NAV.
- **Failure scenario:** a large claim payment drops NAV. A redemption fill in the same slot window pays out at a NAV the guard would have halted.
- **Resolution:** evaluate `nav_move_exceeds` inline in both `fulfil_*` and refuse with `FulfilHalted`. Devnet keeps `maxNavMoveBps = 10_000` for the demo; the guard is proven in LiteSVM tests, and the real pilot uses a tight value.
- **Reference:** ADR 0017 (guard net of inflows); spec §7.

#### E-1. Late payouts not counted before `refresh`

- **Severity:** Medium
- **Location:** `instructions/operator/settle_payout.rs:50-57`
- **Description:** `settle_payout` sets `Payout.late` but does not increment `state.late_payouts`. A payout settled late before a `refresh` is never counted.
- **Impact:** the transparency page under-reports late payouts.
- **Resolution (D-7):** superseded. The payout deadline is removed from the program: `payout_sla_secs`, `Payout.late`, `late_payouts`, the late logic in `settle_payout` and the late scan in `refresh` are deleted and the bytes return to padding. `settle_payout` stays as the settlement record. Deadlines live in the operator platform.
- **Reference:** separation ADR line; spec §3, §5.4, §9, §10.

#### AV-2. No way to withdraw a mistaken or malicious filing

- **Severity:** Medium
- **Location:** `instructions/operator/file_claim.rs:56-106` (no counterpart instruction)
- **Description:** a filed claim stays `FILED` until paid. Nothing releases its provision.
- **Impact:** a compromised operator key can file claims on every guarantee. Provisions rise to the full filed amounts, the solvency gate closes, and new guarantees and redemptions stop with no on-chain way back.
- **Resolution (D-2, D-3):** a new operator instruction `withdraw_claim` releases the provision and sets status `CLAIM_WITHDRAWN = 2` (append-safe, carved in PR 1). It is not pause-gated. After a compromise, a newly appointed operator withdraws fake filings. The same notice can be re-filed (see NEW-C).
- **Reference:** claims ADR and separation ADR (new); spec §5.4.

#### AV-6. De-listed investors cannot exit and block the deposit queue

- **Severity:** Medium
- **Location:** `instructions/capital/request_redeem.rs:73`; `instructions/capital/fulfil_deposits.rs:80-81`
- **Description:** `request_redeem` requires a current allowlist proof. After `set_allowlist_root` drops a wallet, its shares cannot be redeemed. A pending deposit from that wallet also sits at the head of the strict FIFO deposit queue.
- **Impact:** holder assets are locked by an admin list change, and one stale deposit can block all later deposits.
- **Resolution (D-6):** exit open, entry gated. `request_redeem` skips the allowlist for a wallet that already holds shares. A new admin instruction `refund_deposit(seq)` returns a pending deposit to the owner's own BRS account (owner and mint checked), closes the request and unblocks the queue.
- **Reference:** exit-rights ADR (new); spec §5.5.

#### Q-1. Dust below `min_request` cannot be redeemed

- **Severity:** Low
- **Location:** `instructions/capital/mod.rs:53-55`; `instructions/capital/request_redeem.rs:83`
- **Description:** every redemption must be at least `min_request`. A holder whose balance is worth less cannot exit.
- **Resolution (D-6):** a full exit (`shares == owner balance`) skips `min_request`; value must still be above zero, and NEW-B covers the zero-value case. Partial exits and deposits keep the minimum. The app adds "Redeem all".
- **Reference:** exit-rights ADR; spec §5.5.

#### Q-2. Whole fills only: one large head request stalls redemptions

- **Severity:** Low
- **Location:** `instructions/capital/fulfil_redeems.rs` (whole-fill loop)
- **Description:** ADR 0010 specifies partial fills at the queue head; the pilot fills whole requests only. A R$100k head request blocks every later redemption until free capital reaches R$100k.
- **Resolution:** accepted for the pilot. The spec records the deviation; demo request sizes stay below free capital; `/operator` and `/admin` show why the head is stuck (needed versus available). ADR 0010 partial fills ship in Wave 3 with any fee or rounding computed once per request, not per fill. The fields already exist, so no migration.
- **Reference:** ADR 0010.

#### F3. Deposits at NAV zero overflow; deposits into negative equity pay for old losses

- **Severity:** Medium
- **Location:** `math.rs:48-55`, `math.rs:73`
- **Description:** with shares outstanding and net assets at zero, share pricing overflows. Below zero equity, new deposits buy into a reserve whose losses are not yet recognised in their price.
- **Impact:** deposits fail with an arithmetic error or transfer value from new depositors to existing holders.
- **Resolution (D-4, D-5):** deposit fills are refused with a named `ReserveUnderwater` error when net assets are zero with shares outstanding. Recovery is a MUTAV backstop contribution booked by the admin with receipt kind `BACKSTOP`, which mints no shares. A stress buffer in the coverage formula (D-4) makes the underwater state less likely.
- **Reference:** coverage ADR (new; amends ADR 0016); unsolicited money ADR (new); spec §4, §8.

#### F5. Slow NAV drift passes the per-fill guard

- **Severity:** Low
- **Location:** `pricing.rs:42`, `pricing.rs:71`
- **Description:** the guard compares each NAV with the previous one. A series of moves each just under `max_nav_move_bps` passes, so the total drift is unbounded.
- **Resolution:** deferred to Wave 3: a cumulative guard baseline carved from padding (no migration), introduced with the real-pilot `maxNavMoveBps`. Known gap until then.
- **Reference:** spec §7.

#### F6. Tumbling claim window allows twice the period cap

- **Severity:** Medium
- **Location:** `instructions/operator/pay_claim.rs:141-157`
- **Description:** the period cap uses a tumbling window that resets `claim_period_paid` to zero when the period ends.
- **Impact:** up to twice `max_claim_per_period` can leave within minutes across a window boundary. This breaks the bound on a compromised operator's loss.
- **Failure scenario:** R$20k is paid one minute before the window ends and another R$20k one minute after. R$40k leaves in two minutes against a R$20k cap.
- **Resolution (D-3):** a sliding 30-day window with two buckets, the previous period weighted by the time remaining (about 16 bytes carved from `VaultState` in PR 1). No 30-day span can exceed `max_claim_per_period`. The previous-bucket weight rounds up.
- **Reference:** claims ADR; spec §8.

#### F7. `validate_params` missing lower and upper bounds

- **Severity:** Low
- **Location:** `instructions/admin/mod.rs:44-80`
- **Description:** the shared parameter check allows `max_claim_per_call == 0` (blocks every claim payment), `max_claim_per_period < max_claim_per_call`, `max_tvl == 0`, `min_request == 0`, an unbounded `claim_period_secs` (an `i64::MAX` period stops the window from rolling) and an unbounded `max_staleness_secs`.
- **Resolution:** require claim caps above zero, `per_period ≥ per_call`, `max_tvl > 0`, `min_request > 0`, an upper bound on `claim_period_secs` (about 90 days) and on `max_staleness_secs`, a cap on `c`, and bounds on every new parameter (`stress_buffer`, sliding-window fields, unsolicited dust).
- **Reference:** spec §5.1, §8.

#### F9. `coverage_required` cache write can fail on the claim payment path

- **Severity:** Low
- **Location:** `instructions/operator/pay_claim.rs:219`; `solvency.rs:48`
- **Description:** `pay_claim` recomputes and caches `coverage_required` with checked math. A very large `c` times remaining cover can overflow and fail the payment.
- **Impact:** the "never refuse a claim payment within caps" invariant depends on parameter sizes.
- **Resolution:** saturate the cache write in `pay_claim` (including the stress-buffer term) and cap `c` in `validate_params`.
- **Reference:** spec §1 principle 4; ADR 0016.

#### AV-3. Treasury or payments account may be owned by the operator

- **Severity:** Low
- **Location:** `instructions/admin/mod.rs` (`validate_money_accounts`); `instructions/admin/initialize.rs:175-179`
- **Description:** the money-account check keeps the accounts apart from each other and from the capital wallet, but not from the operator.
- **Impact:** if the payments account belongs to the operator key, claim payments land where a compromised operator can take them.
- **Resolution:** refuse a treasury or payments account owned by the operator in `initialize`, `set_config`, `set_payments_account` and on every role change.
- **Reference:** separation ADR; spec §2.1.

#### AV-4. Mint guard accepts a Token-2022 transfer-fee authority

- **Severity:** Low
- **Location:** `token_guard.rs:34-54`
- **Description:** the guard refuses a non-zero transfer fee in either epoch, but accepts a mint with a transfer-fee config authority that could set a fee later.
- **Resolution:** refuse a mint with a transfer-fee authority, and keep extensions on an allowlist. Add `mint::decimals = 6` on `reserve_mint` (see S3).
- **Reference:** ADR 0017 (mint guard); spec §5.1.

#### AV-7. `fulfil_deposits` `count` unbounded; missing per-fill events

- **Severity:** Low
- **Location:** `instructions/capital/fulfil_deposits.rs:58-81`
- **Description:** `count` accepts any `u8`, there is no per-fill event, and the head can move with zero fills without an event.
- **Resolution:** bound `count` to 1 to 8, emit `DepositFilled` per fill, and emit an event when the head moves with zero fills.
- **Reference:** spec §5.5, §9.

#### E-2. `refresh` raises the fill halt without an event

- **Severity:** Low
- **Location:** `instructions/public/refresh.rs:152-156`
- **Resolution:** emit `FulfilHaltRaised` when `refresh` sets `fulfil_halted`.
- **Reference:** spec §9.

#### Q-4. Claim-notice gate is inert

- **Severity:** Low
- **Location:** `instructions/capital/fulfil_deposits.rs:65-67`, `instructions/capital/fulfil_redeems.rs:108-110`; `state/state.rs:35`
- **Description:** fills refuse while `pending_notices > 0`, but nothing increments `pending_notices` because `flag_claim_notice` is not built. A fill can price at a NAV that misses a known, not-yet-filed loss.
- **Resolution:** runbook rule until built: file the claim before any fill. The notice gate is built in Wave 3, before outside capital, together with the exit fallback.
- **Reference:** ADR 0011; spec §5.4.

#### AV-5. Compromised pauser key can stop claim payments until roles rotate

- **Severity:** Low
- **Location:** `instructions/admin/revoke_operator.rs:30`
- **Description:** the pauser can revoke the operator. A stolen pauser key can stop claim payments until the admin multisig appoints an operator through its time lock.
- **Resolution:** runbook rule: the admin replaces the pauser in the same role-change proposal that restores the operator. Bank-first payment covers the gap.
- **Reference:** ADR 0008, ADR 0009.

#### F11. BRS sent directly into `reserve` is untracked with no exit

- **Severity:** Low
- **Location:** `instructions/public/refresh.rs`; reserve token accounts (no `skim`)
- **Description:** internal accounting ignores direct transfers, which is correct for pricing. But the surplus has no exit and no booking path. A third party can also send tainted tokens into `reserve` to provoke an issuer freeze.
- **Resolution (D-5):** a dedicated `unsolicited` token account (PDA, seed reserved in PR 1). A permissionless `skim` moves untracked surplus from `reserve`, `pending_deposits` and `claims` into it. The admin books, returns to the original sender, or returns foreign tokens, under the rules in D-5.
- **Reference:** unsolicited money ADR (new).

#### Q-6. No price protection for requesters

- **Severity:** Low
- **Location:** `instructions/capital/request_deposit.rs`, `instructions/capital/request_redeem.rs`
- **Description:** a request is filled at the NAV of the fill, which the requester does not bound.
- **Resolution:** deferred to Wave 3: `min_assets_out` carved from request padding, with an ADR.

#### NEW-1. `register_guarantee` and `clear_fulfil_halt` ignore a frozen reserve

- **Severity:** Low
- **Location:** `instructions/operator/mod.rs:39-51` (`solvency_snapshot`); `instructions/operator/register_guarantee.rs`; `instructions/admin/clear_fulfil_halt.rs:38`
- **Description:** the snapshot uses tracked `brs_balance`. Neither instruction loads the `reserve` account, so a frozen reserve still counts as liquid. Only `refresh` counts it as zero.
- **Impact:** new guarantees can be registered, and a halt cleared, against capital that cannot move.
- **Resolution:** both instructions load a seeds-checked `reserve`; a frozen reserve counts as zero and the instruction refuses with `ReserveFrozen`. This changes account lists, so it lands before the freeze. Spec line only.

#### NEW-2. The admin key can only be rotated by a program upgrade

- **Severity:** Low
- **Location:** `instructions/admin/set_roles.rs:28` (no admin rotation)
- **Description:** `config.admin` has no setter.
- **Resolution (D-8):** two-step handover for every role: `propose_roles` and `accept_role`, `propose_admin` and `accept_admin`, with pending keys carved from `VaultConfig` padding. Runbook: rotate Squads members while both keys are live.
- **Reference:** separation ADR.

#### L-2. Seed-collision test omits four seeds

- **Severity:** Informational
- **Location:** `constants.rs:367-388`
- **Resolution:** add the guarantee, agency, claim and payout seeds to the test. The agency seed is removed with the per-agency cap (D-10), so the test also confirms its prefix stays reserved.

#### L-3. Spec says `ClaimNotice` ships in the pilot; it does not

- **Severity:** Informational
- **Location:** `docs/spec.md:417`, `docs/spec.md:717`
- **Resolution:** mark `ClaimNotice` and `flag_claim_notice` as built later (Wave 3).

### 4.2 Client

#### C1. Deposit preview ignores pause, halt, batch and TVL checks

- **Severity:** Low
- **Location:** `clients/js/src/preview.ts:61`, `clients/js/src/preview.ts:92`
- **Impact:** `/operator` can show fills that then revert.
- **Resolution:** the deposit preview applies the program's checks in program order; `paused` becomes a required input of the redeem preview.

#### C2. Client NAV at zero assets differs from the program

- **Severity:** Low
- **Location:** `clients/js/src/math.ts:192`
- **Description:** `navPerShare(0, s > 0)` returns 0; the program publishes at least 1.
- **Resolution:** a `publishedNav` helper with the program's floor, a mirror of the NAV guard, and a `previewRefresh` that honours a frozen reserve.

#### C3. `fetchReserve` reads config and state in two calls

- **Severity:** Low
- **Location:** `clients/js/src/reads.ts:67`
- **Impact:** a torn snapshot when a transaction lands between the two reads.
- **Resolution:** one `getMultipleAccounts` call.

#### C4. Client vectors cover 17 of 26 instructions

- **Severity:** Informational
- **Location:** `tests/fixtures/client/vectors.json`
- **Resolution:** vectors for every instruction, including the new ones and the `set_config` settlement-floor complement round trip.

### 4.3 Devnet scripts

#### S1. Cluster guard accepts mainnet monikers and non-devnet hosts

- **Severity:** High
- **Location:** `scripts/devnet/lib/cli.ts:47-54` (used by `scripts/devnet/deploy.ts`)
- **Description:** `guardCluster` refuses only URLs that contain "mainnet". The Solana CLI expands the moniker `m` to mainnet-beta, so `--url m --confirm-cluster devnet` passes. An empty URL falls back to the CLI config, which on the deploy machine defaults to mainnet (plausible, not reproduced). Provider hosts, IP addresses and custom domains also pass.
- **Impact:** a deploy or upgrade-authority change on mainnet from a script meant for devnet. The deploy key would pay real SOL and the program would be live on the wrong cluster.
- **Resolution:** parse the URL with `new URL()` and require http or https; refuse monikers and empty strings; check `getGenesisHash()` against the devnet hash and always refuse the mainnet hash; pass the normalised URL to the CLI. The same for `RELEASE_RPC_URL`. Tests cover `m`, an empty string, a provider host, an IP, uppercase "MAINNET", and a local stub that returns the mainnet hash.

#### S2. Upgrade-authority handover takes any key and has no recovery

- **Severity:** Medium
- **Location:** `scripts/devnet/deploy.ts:37`, `scripts/devnet/deploy.ts:45-49`
- **Description:** `--upgrade-authority` accepts any public key and passes `--skip-new-upgrade-authority-signer-check`. If `set-upgrade-authority` fails, the hot deploy key keeps the authority and no recovery step is printed.
- **Impact:** a typo hands the upgrade authority to a dead address, irreversibly. A failed handover leaves upgrade power on a hot key.
- **Resolution:** derive the Squads vault from config and require the argument to match it; check that the multisig account is owned by Squads v4; wrap the handover so a failure prints the exact retry command.

#### S3. Reserve mint decimals not checked

- **Severity:** Low (rated Medium before the devnet mint was confirmed)
- **Location:** `scripts/devnet/init.ts`, `scripts/devnet/verify.ts`; `instructions/admin/initialize.rs:201`
- **Description:** nothing requires 6 decimals. A stand-in mint created with default settings has 9, which shrinks every cap 1000× (`max_tvl` becomes R$300).
- **Resolution:** the devnet BRS mint was confirmed as classic SPL with 6 decimals, so the risk is low. Fail-closed guards stay: `init.ts` and `verify.ts` require 6 decimals, and `initialize` adds `mint::decimals = 6`.
- **Note:** the devnet BRS freeze authority is a single issuer key. A freeze blocks `pay_claim` (`ReserveFrozen`). Accepted for devnet; to be raised with the issuer before mainnet.

#### S4. `verify` does not compare parameters with the config

- **Severity:** Medium
- **Location:** `scripts/devnet/lib/checks.ts:30-50`, `scripts/devnet/verify.ts`
- **Description:** `verify` does not check `c`, the caps, the settlement floor, the income take, mint decimals or the money accounts against the config.
- **Impact:** a wrong parameter at `initialize` goes unnoticed.
- **Resolution:** compare every field with the config; on devnet, also assert the locked values (appendix).

#### S5. Squads check accepts any members, any threshold and any owner

- **Severity:** Medium
- **Location:** `scripts/devnet/lib/squads.ts:97-105`
- **Description:** the check accepts a 1-of-N multisig with any members and does not check the account owner.
- **Impact:** the admin or upgrade authority could be handed to a multisig the founders do not control.
- **Resolution:** the config lists the exact members and threshold for both multisigs (D-8); the check requires that exact set, that threshold, owner Squads v4, and the time-lock floors (300 s admin, 3600 s upgrade on devnet).

#### S6. Key-scanning script misses common patterns and paths

- **Severity:** Low
- **Location:** `scripts/check-no-keys.sh`
- **Description:** it scans only `clients/js/src` and misses `.tsx` files, `Bun.env`, `import.meta.env`, `Bun.file`, `tweetnacl`, `@noble` and `signMessage`.
- **Resolution:** extend the patterns and run the script on `app/` and `scripts/` in CI, with an allowlist for the localnet tooling in `app/scripts/`.

#### S7. Deploy accepts a payer key file readable by other users

- **Severity:** Low
- **Location:** `scripts/devnet/deploy.ts:45-49`
- **Resolution:** refuse a payer file with group or other permissions.

#### S8. Invalid `--vault-index` silently becomes 0

- **Severity:** Low
- **Location:** `scripts/release/upgrade-proposal.ts:84`
- **Description:** `Number()` of a bad value gives NaN, which later becomes vault index 0. Values above 255 are not refused.
- **Resolution:** refuse NaN and values above 255.

### 4.4 App

#### A1. Relay forwards transactions unrelated to the reserve

- **Severity:** Medium
- **Location:** `lib/server/relay.ts:13-18`, `lib/server/relay.ts:42-49`
- **Description:** the relay allows Squads instructions for any multisig and bare System and Token transfers.
- **Impact:** it works as a free public relay. No assets are at risk, because the server never signs.
- **Resolution:** on devnet the app sends through the wallet's `solana:signAndSendTransaction` and confirms through its read endpoint, with a clear error when the wallet is on another cluster. `/api/tx/send` is enabled only on localnet, where it requires the configured multisig, requires at least one MUTAV or own-multisig instruction, drops System and Token from the top-level set, and checks body size.

#### A2. Unauthenticated RPC-backed routes without caching or rate limits

- **Severity:** Medium
- **Location:** `app/api/ledger`, `app/api/operator`, `app/api/squads`, `app/api/tx/*`
- **Impact:** a request loop can exhaust the public devnet RPC during a demo.
- **Resolution:** CDN caching on read routes (`s-maxage=3, stale-while-revalidate=10`); a platform rate limit of 30 requests per minute per IP on `/api/squads` and `/api/tx/build`, applied after founder confirmation.

#### A3. Overlapping-proposal check scans only the last 10 proposals; no reject or cancel

- **Severity:** Medium
- **Location:** `lib/server/squads.ts:100`; `app/api/tx/build/route.ts:35`
- **Description:** an older approved `set_config` waiting on its time lock is not seen, and stale fields get reverted when a new proposal executes. There is no reject or cancel action, so a dead proposal blocks `set_config` forever.
- **Resolution:** scan every non-final proposal from `staleTransactionIndex + 1`; add reject and cancel to `/api/squads` and the Squads panel; record the edited fields in a memo and check for stale carried fields at execute time.

#### A4. App cluster check matches URL text only

- **Severity:** Medium
- **Location:** `lib/cluster.ts:31`, `lib/cluster.ts:38`
- **Description:** any URL that contains "devnet" skips the check. There is no genesis-hash check.
- **Resolution:** a genesis-hash assertion cached per instance. The app and scripts cannot import each other, so the helper is duplicated with its own test.

#### A5. RPC URL can leak in error messages

- **Severity:** Low
- **Location:** `lib/server/chain.ts:54`; error paths in `app/api/*`
- **Resolution:** redact the RPC URL to its host in errors, since a provider URL can carry an API key.

#### A6. No framing or content-type headers on admin pages

- **Severity:** Medium
- **Location:** `next.config.ts`
- **Description:** no CSP, no `frame-ancestors`, no `nosniff`, no referrer header.
- **Impact:** the `/admin` Approve and Execute buttons could be clickjacked inside a hostile frame.
- **Resolution:** now: `frame-ancestors 'none'`, `nosniff`, `no-referrer`, and a permissions header. A full CSP with a nonce (through `proxy.ts`) and script hashes for `simulator.html` runs in report-only mode and is enforced after the demo.

#### A7. Forbidden-words test misses files and word forms

- **Severity:** Informational
- **Location:** `lib/__tests__/guards.test.ts`
- **Description:** the test does not scan `public/` or `.html` files, its pattern misses a compound form of one forbidden term, and one Portuguese term from the project's forbidden list is absent. No hits today.
- **Resolution:** extend the scan and the patterns.

#### A8. Register form uses floating-point multiplier math

- **Severity:** Low
- **Location:** `components/demo/forms.tsx`; `lib/server/compose.ts`
- **Description:** a multiplier such as 1.15× fails a float comparison and disables the button.
- **Resolution:** parse the multiplier to integer basis points once, as a bigint.

#### A9. Allowlist root composed from browser-supplied owners

- **Severity:** Low
- **Location:** `lib/tx-kinds.ts:72`
- **Description:** the `set_allowlist_root` composer uses the owner list sent by the browser.
- **Resolution:** compose from the server's `ALLOWLIST` and refuse a mismatch.

#### A10. `/api/investor?owner=` reveals allowlist membership

- **Severity:** Informational
- **Location:** `app/api/investor/route.ts:7`
- **Resolution:** accepted for the pilot. The allowlist root is public on-chain and membership is not sensitive at pilot scale.

### 4.5 Design-level findings

These concern the target design produced by the decisions in section 5, not code at `f30664a`.

#### NEW-A. Compromised operator can move value through an accomplice's fill

- **Severity:** Medium
- **Location:** design: reversible filings (D-2) combined with fills at live NAV
- **Description:** filings and closes are reversible, and fills price at the current NAV. A compromised operator can push NAV down with fake filings, let an accomplice's deposit fill at the low price, then have the filings withdrawn. The loss is no longer bounded by the claim caps.
- **Resolution:** `fulfil_deposits` and `fulfil_redeems` take `nav_bounds (min, max)`, composed by `/admin` when the proposal is built, and refuse with `NavOutOfBounds` outside them. The admin signs no fills until reconciliation is done after a compromise (runbook). An interface change, so it lands before the freeze.
- **Reference:** claims ADR; OWASP SC03, SC02.

#### NEW-B. A zero-value redemption head stops the queue

- **Severity:** Medium
- **Location:** design: full exit below `min_request` (Q-1)
- **Description:** once full exits skip the minimum, a request worth zero assets can sit at the head; a fill that refuses zero output stops the queue. Splitting shares into dust accounts multiplies the effect.
- **Resolution:** a zero-value head is filled as a zero-asset fill (shares burned, request closed). A full exit is allowed only from the owner's canonical share token account.
- **Reference:** exit-rights ADR; OWASP SC02.

#### NEW-C. Re-filing a withdrawn notice could reuse an old approval

- **Severity:** Low
- **Location:** design: `withdraw_claim` and `approve_claim`
- **Resolution:** an explicit re-file path that accepts only a `WITHDRAWN` filing and resets `approved_amount`, `provision` and `filed_at`. No reuse of an old approval.
- **Reference:** claims ADR; OWASP SC10, SC01.

#### NEW-D. Pending role handovers survive `revoke_operator` and never expire

- **Severity:** Low
- **Location:** design: two-step handover (D-8)
- **Resolution:** `revoke_operator` also clears pending role keys; every pending handover carries `pending_expires_at`.
- **Reference:** separation ADR; OWASP SC01.

#### NEW-E. `reinstate_guarantee` has no age bound and no event

- **Severity:** Low
- **Location:** design: `reinstate_guarantee` (D-2)
- **Resolution:** reinstate only within `max_reinstate_age` (admin-set, carved in PR 1) and emit `GuaranteeReinstated` for the operator-activity feed.
- **Reference:** separation ADR; OWASP SC02.

#### NEW-F. Minor hardening items in the target design

- **Severity:** Informational
- **Items:**
  - the guardian check refuses the default (all-zero) key;
  - the stress-buffer term saturates on the `pay_claim` path;
  - the sliding-window previous-bucket weight rounds up, with a property test that includes a mid-window change of `claim_period_secs`;
  - a watcher alerts on any owner change of the payments account;
  - for future adapters: a reentrancy guard and post-CPI reload and delta checks;
  - `return_foreign` checks that the mint is owned by the classic SPL Token program.

---

## 5. Design decisions taken during the review

1. **Separation principle.** The operator and the reserve admin are separate roles and may later be separate companies. The operator runs contracts, agencies, and the guarantee and claim cycle; the admin protects the reserve's financial health through ceilings, not contract judgement. The maximum loss from a compromised operator key is the admin-set claim caps, so every other registry change must be reversible.
2. **Recovery model.** Only the operator knows the contracts, so every registry action is an operator action reversible by another operator action: register and `close_guarantee(VOID)`; close and `reinstate_guarantee`; `file_claim` and `withdraw_claim`. Only `pay_claim` is irreversible, and it is bounded by the caps. After a compromise: the pauser revokes the operator, the admin appoints a new one, and the new operator reconciles the platform's records against on-chain events. There are no admin rollback instructions.
3. **Claims.** `pay_claim` pays exactly the filing's provision. A provision above `max_claim_per_call` needs an admin `approve_claim`, which approves the amount leaving the reserve, not the claim's validity. The operator corrects amounts with `amend_claim` (down releases, up books more within the unprovisioned cover, and any approval resets). The period cap is a strict sliding 30-day window, and approved payments count toward it. For an unusually large claim, the admin raises the period cap in the same proposal and lowers it afterwards.
4. **Stress buffer.** Claims arrive per event (one month's rent per default, one exit payment at the end), so the near-term stress is the next claims, not full covers. `coverage_required = max(ceil(c × remaining_cover), provisions + min(stress_buffer, unprovisioned_cover))`, with `stress_buffer` admin-set from the portfolio. It gates new guarantees and redemptions, never claim payments. `c` stays 0.10.
5. **Unsolicited money and backstop.** Every unsolicited transfer is the admin's responsibility and nothing stays stuck. A permissionless `skim` moves untracked surplus into a dedicated `unsolicited` account; the admin classifies, books (`UNSOLICITED`, counted as an inflow by the NAV guard), or returns it only to the original sender after screening. MUTAV recapitalises an underwater reserve through a `BACKSTOP` booking that mints no shares. Booking is refused while share supply is zero.
6. **Exit rights.** Exit is open and entry is gated: holders redeem without a current allowlist proof, a full exit skips `min_request`, and the admin can refund a stuck pending deposit to its owner. Whole fills stay for the pilot as a documented deviation from ADR 0010.
7. **Payout deadline removed from the program.** Deadlines (review, information requests, approval, execution) live in the operator platform. The reserve's only on-chain promise is that, within caps, `pay_claim` is never refused. This supersedes E-1. MUTAV may pay from its own bank account first and be reimbursed by `pay_claim`.
8. **Governance.**
   - Two-step handover for every role and the admin (`propose_*` then `accept_*`), so a typo cannot appoint a dead address.
   - Up to three pause-only guardian keys, admin-set.
   - Two Squads multisigs with the same members: an admin multisig with a short time lock and an upgrade multisig with a long one.
   - Time locks: devnet 5 minutes (admin) and 1 hour (upgrade); real pilot and mainnet 24 hours and 7 days.
9. **Pause scope for new instructions.** Pause stops only capital flows (`request_*`, `fulfil_*`) and new guarantees. Claim corrections, reinstatement, refunds, unsolicited-money handling, handovers and guardian changes stay open. `cancel_*` and `claim_*` stay open under pause, as in ADR 0008. The solvency gate's scope is unchanged.
10. **Per-agency cap removed.** `max_cover_per_agency`, the `AgencyExposure` account, its seed and its `init_if_needed` are dropped. One reserve may serve a single agency, and the cap never bound at its devnet value. Per-agency figures are derived off-chain from guarantee accounts; a future concentration limit returns as a new account. Amends ADR 0016's devnet caps.
11. **Exit fallback.** After `max_queue_wait_secs`, anyone can fill the head redemption under the same rules (free capital, FIFO, NAV guard, notice gate, pause). The upgrade time lock is at least that wait, so holders can leave before a malicious upgrade executes. This follows established practice (timelocked governance plus a request, cooldown and permissionless exit). The field is carved now with value 0 (off) and the feature is built in Wave 3.
12. **Share transferability (PC-32).** Mainnet shares are transfer-restricted at the token level, with the mechanism chosen in the mainnet design. This gates the mainnet `initialize`. Devnet keeps classic SPL shares.
13. **Attestation.** For the pilot, `settle_payout` records only the payment reference hash. A settlement-document hash arrives with ADR 0012 as a new instruction version, and attestation becomes required once operator and admin are separate companies.
14. **Request sequence seeds.** Request PDAs keep global sequence seeds; the client retries with the next sequence when an account is already in use.
15. **Owner token accounts.** `cancel_*`, `claim_*` and `refund_deposit` create the owner's associated token account idempotently, with the caller paying rent.

---

## 6. Confirmed-sound properties

**Program**
- The solvency gate never refuses `pay_claim`. Only the filing check, the ADR 0014 bound, the caps, liquid BRS or a frozen reserve can stop a claim payment.
- Account validation is tight: seeds with canonical bumps, owners, mints, token-program checks (`InvalidTokenProgram`), `has_one` constraints, no re-initialisation through `init_if_needed`, and closed request slots cannot be spoofed.
- `initialize` cannot be front-run, because the upgrade authority signs it, and the admin is set straight to the Squads vault.
- Pause scope matches ADR 0008 and ADR 0009. The pauser can only `pause` and `revoke_operator`. Only the admin unpauses or clears the fill halt.
- u128 arithmetic is checked and rounds in the reserve's favour. `coverage_required` rounds up and is never below provisions. Overflow checks are on in release builds.
- No donation or inflation attack: pricing uses tracked balances only.
- `sweep_income` checks the inbox account, uses post-CPI deltas, refuses frozen accounts and is idempotent per receipt.
- The NAV guard counts inflows per share and rounds up; the halt is sticky.
- `VaultConfig` and `VaultState` padding fits the ADR 0012 carves. `AdapterEntry`, the request accounts and the holder account have room for phase 2.
- Transfer-hook mints are refused, and CPIs target pinned programs with errors propagated.

**Client**
- The math mirror is exact (bigint, u128 bound).
- PDA derivations match the program, including the income inbox with its token program.
- Allowlist proofs are domain-separated and match the program.
- No signing code.

**Scripts**
- Only `deploy.ts` takes key file paths, and key files inside the repository are refused.
- The devnet example values equal the decided caps at 6 decimals.

**App**
- The relay never signs and refuses unsigned transactions.
- `set_config` proposals carry every field from chain, enforced by a test against the program's field set.
- Concurrent proposal builds are serialised by Squads transaction indices.
- No keys; public environment variables expose only the cluster name.
- Amounts are bigint end to end.

---

## 7. OWASP Smart Contract Top 10 (2026) mapping

| Category | Solana translation | Status | References |
|---|---|---|---|
| SC01 Access Control | Signer and `has_one` checks, PDA authority, role separation, upgrade authority | Sound at `f30664a`. Role-handover and pending-key risks addressed in the target design | NEW-2, NEW-D, AV-3, AV-5, S2, S5, D-8 |
| SC02 Business Logic | Claim, provision, queue and lifecycle rules | Main area of findings | F1, F6, AV-1, AV-2, AV-6, Q-1, Q-2, NEW-A, NEW-B, NEW-E |
| SC03 Price Oracle Manipulation | No external oracle in the pilot. NAV is derived on-chain from tracked balances; the risk is NAV moved by privileged actions | No oracle read. NAV movement through reversible filings addressed | F4, F5, NEW-A |
| SC04 Flash Loan Attacks | Same-transaction manipulation of balances read for pricing | Not applicable: async request and fill queue, tracked balances, no live-balance reads | Section 6 |
| SC05 Lack of Input Validation | Parameter bounds, account constraints, mint checks | Account checks sound. Parameter bounds incomplete | F7, F9, S3, AV-4 |
| SC06 Unchecked External Calls | CPI to the token programs and, later, adapters | CPIs pinned and propagated; post-CPI deltas used | NEW-F (adapters) |
| SC07 Arithmetic Errors (Rounding and Precision) | Share pricing, rounding direction, zero outputs | Rounding favours the reserve. Zero-share and zero-NAV edges fixed | F2, F3, C2 |
| SC08 Reentrancy | CPI reentrancy is limited on Solana; relevant for future adapters | Not applicable to the pilot | NEW-F |
| SC09 Integer Overflow and Underflow | Release overflow checks, checked u128 math | Sound. Saturation added on the never-refuse claim path | F9 |
| SC10 Proxy and Upgradeability | Program upgrade authority, layout freeze, IDL compatibility, time locks | Layout padding and upgrade governance addressed | L-1, S2, S5, NEW-C, D-8, D-11 |

---

## 8. Comparison with a comparable program's audits

The review mapped all 59 findings from the published audits of a comparable Solana real-world-asset program (OnRe; OtterSec, August 2026: 16; Ackee, November 2025: 17; Quantstamp: 26) to MUTAV by vulnerability class, using the program's public source and documentation.

**Mapping result.** Nearly every finding was sound, not applicable, or already known in MUTAV. The structural difference explains most of the gap. The comparable program relies on a single multisig with broad power (withdrawals, minting and price vectors), has no on-chain time lock, reads live balances and handles losses off-chain. MUTAV keeps its rules on-chain: role separation, caps, provisions and internal accounting.

**Classes checked:** access control and authority scope; price setting and staleness; live-balance reads and donation attacks; per-fill rounding and fees; zero-output fills; kill-switch scope; queue ordering and starvation; account closure and re-initialisation; token-extension handling.

**Adopted patterns:**
1. Two-step role handover (D-8), so a typo cannot appoint a dead address.
2. For ADR 0010 partial fills: compute any fee or rounding once per request, not per fill. A per-fill round-up let a filler take a request as fees in the comparable program.
3. Keep `cancel_*` and `claim_*` open under pause (ADR 0008). The comparable program's kill switch blocks user cancels; MUTAV's deliberately does not.
4. Zero-output rejection, already adopted as F2's `shares > 0`.

**Not adopted:** admin-set price vectors (MUTAV derives NAV on-chain) and an AMM instant exit (MUTAV's phase-2 design stays).

**New findings from the comparison:** NEW-1 and NEW-2, plus the upper bounds added to F7.

---

## 9. Deferred items and residual risks

### 9.1 Wave 3: after the hackathon, before outside capital

- The exit fallback (D-11) and the claim-notice gate (Q-4).
- ADR 0010 partial fills, with fees computed once per request (Q-2).
- A cumulative NAV-guard baseline with the real-pilot `maxNavMoveBps` (F5).
- `min_assets_out` price protection (Q-6).
- A `quote_nav` view, a share-supply drift check, share metadata, and `/reserve` reading authorities from chain.
- An upgrade rehearsal on a forked validator, and invariant fuzzing.

### 9.2 Mainnet gates (before mainnet `initialize`)

- Transfer-restricted shares (PC-32, D-12).
- The real Squads multisigs with the founders' hardware wallets, replacing the devnet stand-in keys.
- Time locks of 24 hours (admin) and 7 days (upgrade), with the upgrade lock at least the exit-fallback wait.
- Attestation once operator and admin are separate companies (D-13).
- The BRS issuer's freeze and upgrade authorities moved to a multisig (S3 note).
- An independent audit.

### 9.3 Residual risks accepted for devnet and the pilot

- **Claim payments after an operator compromise are lost**, bounded by the claim caps (R$10k per call, R$20k per sliding 30 days on devnet).
- **The issuer can freeze BRS.** A frozen reserve blocks claim payments and, after NEW-1, new guarantees. This is disclosed issuer trust.
- **Slow NAV drift** passes the per-fill guard until Wave 3 (F5).
- **The claim-notice gate is inert** until Wave 3; the runbook requires filing before any fill (Q-4).
- **Head-of-line blocking** under whole fills (Q-2).
- **The devnet NAV guard is effectively off** (`maxNavMoveBps = 10_000`); the guard is proven in tests only.
- **A compromised pauser** can stop claim payments until the admin rotates roles; bank-first payment covers the gap (AV-5).
- **Off-chain dependencies:** reconciliation after a compromise depends on the operator platform's records; unsolicited-money returns depend on manual screening.

---

## Appendix: devnet parameters

Decided during the review. `verify` asserts these values on devnet (S4).

| Parameter | Devnet value | Note |
|---|---|---|
| Coverage ratio `c` | 0.10 (`1_000` bps) | Program floor 0.10 (ADR 0016) |
| `stress_buffer` | R$19,000 | Sized as the three largest rents plus one exit payment |
| `max_tvl` | R$300,000 | |
| `max_cover_per_guarantee` | R$40,000 | |
| Per-agency cap | Removed | D-10 |
| `max_claim_per_call` | R$10,000 | Above it, `approve_claim` |
| `max_claim_per_period` | R$20,000 per sliding 30 days | D-3 |
| Request size | R$1,000 to R$100,000 | A full exit may be below the minimum |
| `min_settlement_bps` | 10,000 (100% BRS) | BRS-only pilot (ADR 0018) |
| `fee_take_bps` | 2,000 | |
| `income_take_bps` | 0 | Until a commercial decision |
| `maxNavMoveBps` | 10,000 | Guard proven in tests; lowered for the real pilot |
| `max_queue_wait_secs` | 0 (off) | Exit fallback built in Wave 3 |
| Unsolicited dust threshold | R$10 | Booked directly |
| Unsolicited return window | 30 days | Runbook |
| `max_reinstate_age` | 30 days | NEW-E |
| Admin multisig | Squads v4 2-of-2, time lock 5 minutes (floor 300 s) | Devnet stand-in keys; founders' hardware wallets before real money |
| Upgrade multisig | Same members, time lock 1 hour (floor 3600 s) | |
| Pauser | Separate key | Generated at deploy |
| Guardians | 1, separate from the pauser | Up to 3; automated later |
| Operator | Hot key, operated by hand from `/operator` | Moves to a KMS-backed backend later |
| Treasury and payments accounts | BRS accounts not owned by the operator | AV-3 |
| Reserve mint | Devnet BRS `BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4`, classic SPL, 6 decimals | Freeze authority is a single issuer key (S3 note) |
| Cluster | Solana devnet, checked by genesis hash | S1, A4 |
