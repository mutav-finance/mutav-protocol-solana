# Implementation plan — hackathon build

*Window: 2026-10-01 → 2026-10-12. Submission due **2026-10-12, 23:59 BRT**. Business rules: [`spec.md`](spec.md). Decisions: [`decisions/`](decisions/).*

## How to use this plan

- Tasks run in order; later tasks build on earlier ones. Each task is one PR (or a few bounded commits on one branch).
- **TDD:** write the listed tests first, watch them fail, then implement.
- Tests run on LiteSVM with `RUST_TEST_THREADS=4 CARGO_BUILD_JOBS=4`. One heavy process at a time. No watch mode.
- Where the spec says **TBD**, implement the fail-closed behaviour and leave `TODO(spec: …)`; don't choose a value.
- Tasks marked **[mutav-app]** happen in the `mutav-finance/mutav-app` repo, not here. They consume the client published in Task 11.

## Schedule

| Dates | Tasks |
|---|---|
| Oct 1 | 0 — scaffold and docs |
| Oct 2 | 1 — core state, initialize, roles, pause · 2 — math and solvency |
| Oct 3 | 3 — register/close guarantee · 4 — guarantee fees |
| Oct 4 | 5 — claims and payouts |
| Oct 4–5 | 6 — async deposits and redemptions · 7 — MUTAV capital |
| Oct 6 | 8 — under-coverage mode and price safety |
| Oct 6–7 | 9 — adapters · 10 — refresh and events |
| Oct 7–8 | 11 — Codama client · 12 — devnet deploy under Squads |
| Oct 8–9 | 13 — Surfpool fork tests · 14–18 — mutav-app integration |
| Oct 10–11 | 19–21 — videos, go-to-market, provenance |
| Oct 12 | 22 — buffer and submission |

---

## Task 0 — Scaffold and docs (Oct 1)

- **Goal:** an Anchor 1.2.0 workspace that builds, with CI green, and the docs that drive the build.
- **Files:** `Anchor.toml`, `Cargo.toml`, `rust-toolchain.toml`, `programs/*`, `tests/`, `clients/js/`, `.github/workflows/ci.yml`, `.gitignore`; `README.md`, `CLAUDE.md`, `NOTICE`, `SECURITY.md`, `docs/*`.
- **Tests first:** a smoke test that loads the program into LiteSVM.
- **Done when:** `anchor build` and `cargo test` pass locally and in CI; docs merged.

## Task 1 — Core state, initialize, roles, pause (Oct 2)

- **Goal:** `VaultConfig`, `VaultState`, vault authority, the five token accounts and the share mint; `initialize`, `set_config`, `set_roles`, `set_payments_account`, `set_allowlist_root`, `pause`, `unpause`, `revoke_operator`. Fork the account and authority skeleton from `solana-foundation/vault` (MIT; attribution header + `NOTICE`), removing its unrestricted asset withdrawal.
- **Files:** `programs/mutav/src/{lib.rs,constants.rs,errors.rs,events.rs}`, `state/{config.rs,state.rs}`, `instructions/admin/*`, `token_guard.rs`; `tests/roles_pause.rs`, `tests/common/` (LiteSVM harness, mock BRS mint: classic SPL, 6 dp, freeze authority held by the test).
- **Tests first:**
  - `initialize` only by the upgrade authority; second `initialize` fails.
  - Mint guard rejects Token-2022 mints with `PermanentDelegate`, `TransferHook`, non-zero `TransferFee`, `NonTransferable`, `DefaultAccountState = Frozen`.
  - `fee_take_bps > 3_000` rejected; roles must be distinct.
  - Every admin instruction rejects a non-admin signer; `pause` accepts pauser or admin; `unpause` admin only.
  - `revoke_operator` blocks operator instructions until `set_roles`.
  - `reserve_mint` cannot change after init.
- **Done when:** all tests pass; account sizes include `_reserved` padding; events emitted via `emit_cpi!`.

## Task 2 — Math and solvency module (Oct 2)

- **Goal:** pure functions for `u128` `mul_div` with explicit rounding, share conversion with a virtual offset, `stable_assets`, `coverage_required`, `free_capital`, `net_assets`, NAV per share.
- **Files:** `programs/mutav/src/{math.rs,solvency.rs}`; `tests/rounding.rs`, unit tests in-module.
- **Tests first:**
  - Property tests: `assets_for(shares_for(x)) ≤ x`; rounding always favours the reserve; no overflow at `u64::MAX` inputs (errors, never wraps).
  - `coverage_required` rounds up; `free_capital` saturates at 0; `net_assets` saturates at 0.
  - First-depositor inflation attempt does not zero a second depositor.
- **Done when:** the module has no dependency on accounts and is fully covered by tests.

## Task 3 — Register and close guarantees (Oct 3)

- **Goal:** `Guarantee`, `AgencyExposure`; `register_guarantee` (solvency-gated, per-guarantee and per-agency caps) and `close_guarantee`.
- **Files:** `state/guarantee.rs`, `state/agency.rs`, `instructions/operator/{register_guarantee.rs,close_guarantee.rs}`; `tests/solvency_gate.rs`, `tests/caps.rs`.
- **Tests first:**
  - Registration succeeds exactly up to `free_capital` and fails one base unit above (`InsufficientFreeCapital`).
  - Duplicate `id` fails.
  - `GuaranteeCapExceeded`, `AgencyCapExceeded` at the boundary.
  - Non-operator signer rejected; rejected while paused.
  - `close_guarantee` releases the remaining cover; fails with `OpenClaims` when a claim is filed.
  - Invariant: `remaining_cover_total` equals the sum over active guarantees after any sequence.
- **Done when:** tests pass and the gate demo case ("an over-capacity registration is refused") is scripted.

## Task 4 — Guarantee fees (Oct 3)

- **Goal:** `contribute_fees` with the take-rate split.
- **Files:** `instructions/operator/contribute_fees.rs`; `tests/fees.rs`.
- **Tests first:**
  - `take = floor(amount × fee_take_bps / 10_000)` goes directly to `config.treasury_account`; the rest goes to `reserve`; NAV per share rises by the net amount.
  - A treasury account other than the whitelisted one is rejected.
  - `fee_take_bps = 0` and `= 3_000` edge cases.
  - Wrong mint rejected; non-operator rejected.
  - The take never touches `reserve` or `stable_assets`.
- **Done when:** tests pass; `FeesContributed` carries gross, take and net.

## Task 5 — Claims and payouts (Oct 4)

- **Goal:** `ClaimFiling`, `Payout`; `file_claim`, `pay_claim`, `settle_payout`.
- **Files:** `state/{claim.rs,payout.rs}`, `instructions/operator/{file_claim.rs,pay_claim.rs,settle_payout.rs}`; `tests/claims.rs`, `tests/freeze.rs` (payout cases).
- **Tests first:**
  - `file_claim` books the provision; NAV per share drops immediately; `stable_assets` unchanged.
  - `pay_claim` pays only `payments_account`; any other destination fails (`InvalidPaymentsAccount`).
  - `amount ≤ remaining cover on leg`; per-call and per-period caps at the boundary; the period window rolls.
  - Second `pay_claim` for the same notice fails (idempotency).
  - **Property test:** `pay_claim` is never refused for solvency or under-coverage (fuzz `stable_assets` below `coverage_required`).
  - At `c = 1.0`, paying a claim leaves `free_capital` unchanged.
  - Frozen `reserve` → `ReserveFrozen`, clean failure, retry succeeds after thaw.
  - `settle_payout` records `pix_e2e_hash`; late flag set when past the SLA; second settle fails.
- **Done when:** tests pass; the payout flow matches [ADR 0003](decisions/0003-payments-operated-by-mutav.md).

## Task 6 — Async deposits and redemptions (Oct 4–5)

- **Goal:** `request_deposit`, `cancel_deposit`, `fulfil_deposits`, `claim_shares`, `request_redeem`, `cancel_redeem`, `fulfil_redeems`, `claim_assets`, adapted from the `solana-foundation/vault` async core (MIT). Allowlist via Merkle proof. Strict FIFO for redemptions, from `free_capital` only, at the NAV at fulfil.
- **Files:** `state/request.rs`, `instructions/capital/*`; `tests/capital_async.rs`, `tests/freeze.rs` (escrow cases).
- **Tests first:**
  - Non-allowlisted wallet rejected; size limits enforced.
  - Pending deposits are excluded from `stable_assets` and NAV.
  - Fulfil prices at the NAV at fulfil (NAV moved between request and fulfil).
  - `fulfil_redeems` stops at the first request that exceeds `free_capital`; never skips; out-of-order accounts fail (`QueueOrderViolation`).
  - `max_tvl` blocks `fulfil_deposits` at the boundary.
  - `cancel_*` and `claim_*` work while paused.
  - Frozen investor destination: `claim_assets` fails, request stays `Fulfilled`, succeeds after thaw.
  - Request accounts close on claim/cancel, rent to owner.
- **Done when:** tests pass; forked files carry the MIT header; `NOTICE` updated.

## Task 7 — MUTAV capital (Oct 5)

- **Goal:** none beyond Task 6. MUTAV uses the async deposit/redeem flow (ADR 0008).
- **Tests first:**
  - MUTAV's allowlisted wallet deposits, then redeems through the queue.
  - `fulfil_deposits` works in under-coverage (recapitalization).
  - Pause blocks capital flows, fees and new guarantees, while `pay_claim`, `settle_payout`, `refresh`, `cancel_*` and `claim_*` still succeed.
- **Done when:** tests pass.

## Task 8 — Under-coverage mode and price safety (Oct 6)

- **Goal:** `mode` transitions; TESOURO valued at `min(on-chain price, accrual curve)` with staleness and deviation bounds; NAV-move guard halting fulfilment.
- **Files:** `pricing.rs`, `solvency.rs`; `tests/solvency_gate.rs`, `tests/pricing.rs`.
- **Tests first:**
  - A mark-down below `coverage_required` → `UnderCovered`: `register_guarantee`, `fulfil_redeems`, `allocate` fail; `pay_claim` succeeds.
  - Recovery returns `mode` to `Normal`.
  - Price above the accrual curve is capped; stale price → gated instructions fail with `StalePrice`; deviation beyond the bound rejected.
  - NAV move > threshold sets `fulfil_halted`; fulfils fail until cleared.
- **Done when:** tests pass using a mock price account (real layout pending Etherfuse, spec §12 Q2).

## Task 9 — Adapter interface, mock adapter, allocate/deallocate (Oct 6–7)

- **Goal:** `mutav-adapter-interface` crate (discriminators, account layouts, `deposit`/`withdraw`/`position_value`), `mutav-adapter-mock` program, and `allocate`/`deallocate` through per-adapter capped sub-authorities. Adapter whitelist in `VaultConfig`.
- **Files:** `programs/mutav-adapter-interface/*`, `programs/mutav-adapter-mock/*`, `instructions/reserve/*`, `instructions/admin/whitelist_adapter.rs`; `tests/adapters.rs`.
- **Tests first:**
  - Non-whitelisted adapter program rejected.
  - The vault authority never appears as a signer in the CPI (inspect instruction accounts).
  - A malicious mock that moves extra tokens or mints shares fails the post-CPI check.
  - Adapter cap and TESOURO share cap at the boundary.
  - Allocation fails when it would breach the solvency post-condition.
  - **Deallocate rule:** in under-coverage, deallocating TESOURO → BRS at or above its bounded value succeeds; a deallocation that lowers `stable_assets` fails with `WorsensCoverage`. In normal mode, any value loss must fit in `free_capital`.
- **Done when:** tests pass; [ADR 0002](decisions/0002-core-program-and-capped-adapters.md) holds in code.

## Task 10 — Refresh and events (Oct 7)

- **Goal:** permissionless `refresh`; freeze detection; late-payout flags; `StateRefreshed`, `ModeChanged`, `PayoutLate`, `ReserveFrozenDetected`. Audit that every token movement emits an event.
- **Files:** `instructions/public/refresh.rs`, `events.rs`; `tests/refresh.rs`, `tests/events.rs`.
- **Tests first:**
  - `refresh` by a random signer recomputes the public state exactly as the math module does.
  - Pending payout past the SLA is flagged late and counted.
  - Frozen reserve account detected; balance excluded; event emitted.
  - Event coverage test: every instruction that moves tokens emits exactly one movement event with matching amounts.
- **Done when:** tests pass; Mollusk CU benchmark recorded for `refresh`, `pay_claim`, `fulfil_redeems`.

## Task 11 — Codama client and publication (Oct 7–8)

- **Goal:** generate `@mutav-finance/mutav-protocol-solana` from the IDL with Codama for `@solana/kit`; add PDA helpers and read helpers (`VaultState`, guarantees, payouts, queue position) and a TS mirror of the math for previews. No signing code.
- **Files:** `clients/js/*`, `scripts/generate-client.ts`, CI Codama diff check.
- **Tests first:** client unit tests (Bun) for PDA derivation against known addresses, instruction encoding round-trips, math-mirror parity with Rust test vectors; a grep check that fails CI on secret-key APIs.
- **Done when:** CI regenerates the client and finds no diff; package published (GitHub Packages or npm, under `@mutav-finance`) and installable from mutav-app.

## Task 12 — Devnet deploy with Squads as upgrade authority (Oct 7–8)

- **Goal:** program on devnet; Squads v4 multisig (with time lock) as upgrade authority and admin; operator and pauser set; caps configured; allowlist root set.
- **Files:** `scripts/devnet/{deploy.ts,init.ts,roles.ts,caps.ts,allowlist.ts}`, `.github/workflows/release.yml` (verified build with `solana-verify` in x86 CI → buffer → Squads upgrade proposal).
- **Tests first:** a script dry-run against a local validator; a check that the upgrade authority equals the Squads vault after deploy.
- **Done when:** program deployed and verified; upgrade authority = Squads vault; addresses recorded in `README.md`; no keypair committed.

## Task 13 — Surfpool fork tests (Oct 8–9)

- **Goal:** run the core flows against Nora's devnet BRS mint `BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4` and a Squads proposal flow on a fork.
- **Files:** `tests-fork/*`, `.github/workflows/fork.yml` (manual trigger).
- **Tests first:** initialize with the real mint; deposit → fulfil → claim; register → fee → file → pay → settle; admin fulfil executed through a Squads proposal.
- **Done when:** the fork suite passes on demand; findings about the real mint's authorities recorded in the spec's open questions.

## Tasks 14–18 — mutav-app integration (Oct 8–9) [mutav-app]

These happen in `mutav-finance/mutav-app`, consuming `@mutav-finance/mutav-protocol-solana`. This repo only supplies the client and the program.

### Task 14 — Convex operator actions [mutav-app]

- **Goal:** KMS-backed Convex actions that call `register_guarantee` on activation, `close_guarantee` on close, `contribute_fees` when an invoice is paid, `file_claim`/`pay_claim` on claim approval, and `settle_payout` on PIX confirmation; a Solana event indexer.
- **Done when:** each lifecycle transition in the platform produces the matching instruction on devnet, idempotently; the indexer stores events for the transparency views.

### Task 15 — Admin Squads proposals in `apps/admin` [mutav-app]

- **Goal:** compose admin instructions (fulfil queues, allowlist, caps, payments account, adapters, allocate/deallocate, roles) as Squads v4 proposals, signed by each admin's own wallet.
- **Done when:** a fulfil executed end to end through a proposal on devnet.

### Task 16 — Investor flow in `apps/fund` [mutav-app]

- **Goal:** async deposit and redeem with queue position, cancel, claim, position and history.
- **Done when:** an allowlisted wallet completes deposit → claim shares → redeem → claim assets on devnet.

### Task 17 — Agency transparency in `apps/agency` [mutav-app]

- **Goal:** replace the env-constant capacity panel with on-chain `stable_assets`, `coverage_required`, `free_capital` and the payouts ledger.
- **Done when:** the page reads only program state and indexed events.

### Task 18 — Public transparency route [mutav-app]

- **Goal:** an unauthenticated page for judges and landlords: reserve, coverage, surplus, guarantees, payouts with PIX settlement status and SLA flags. Which app hosts it is undecided.
- **Done when:** reachable without login and linked from the submission.

## Tasks 19–22 — Submission

### Task 19 — Videos (Oct 10–11)

- Pitch video (2–3 min) and demo video (≤ 3 min). Demo scope: guarantee registered, guarantee fee in, claim filed → paid to the payments account → PIX settlement proof on an SLA clock, the gate refusing an over-capacity registration, and the public transparency view.
- **Done when:** both uploaded and linked.

### Task 20 — Go-to-market (Oct 10–11)

- Go-to-market section from the business model and validation work (agency calls, LOIs if signed).
- **Done when:** written and linked from the submission.

### Task 21 — Provenance (Oct 10–11)

- Complete [`provenance.md`](provenance.md): fill "Built during the hackathon" from the git log and PRs.
- **Done when:** every in-window deliverable is listed with links; prior work clearly separated.

### Task 22 — Buffer and submit (Oct 12)

- Public repo, both videos, go-to-market, provenance, registrations on Superteam BR and Colosseum for every member.
- **Done when:** submitted before 23:59 BRT.
