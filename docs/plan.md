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
| Oct 2 | 1 — core state, initialize, roles, pause · 2 — math and solvency · 2a — upgrade readiness |
| Oct 3 | 3 — register/close guarantee · 4 — guarantee fees |
| Oct 4 | 5 — claims and payouts |
| Oct 4–5 | 6 — async deposits and redemptions · 7 — MUTAV capital |
| Oct 6 | 8 — under-coverage mode and price safety |
| Oct 6–7 | 9 — adapters · 10 — refresh and events |
| Oct 7–8 | 11 — Codama client · 12 — devnet deploy under Squads |
| Oct 8–9 | 13 — Surfpool fork tests · 14–18 — mutav-app integration |
| Oct 10–11 | 19–21 — videos, go-to-market, provenance |
| Oct 12 | 22 — buffer and submission |
| Post-pilot | P2-1…P2-8 — phase 2, instant exit (not in the hackathon window) |

### Rescheduled (2026-10-06)

Program work started on Oct 6, so the hackathon build runs in five phases, with one branch and one PR per phase. The task definitions below are unchanged; this table only sets the order and the scope.

| Phase | Dates | Tasks | Done when |
|---|---|---|---|
| **A — Foundation** | Oct 6–7 | 1, 2, 2a | Account layouts frozen for devnet; math module covered by property tests |
| **B — Guarantee book** | Oct 7–8 | 3, 4, 5 (`file_claim`, `pay_claim`, `settle_payout`) | Every demo step has a LiteSVM test: refused registration, fee, claim, payout while under-covered |
| **C — Capital and safety** | Oct 8–9 | 6 (whole fills only), 7, 8 (BRS only), 10 | Deposit → shares → redeem in FIFO order; under-coverage mode; `refresh` and event audit |
| **D — Ship** | Oct 9–10 | 11, 12, 13 (one happy path), minimal 14 and 18 [mutav-app] | Devnet deploy with Squads as upgrade authority; client published; demo runs on Nora's devnet BRS |
| **E — Submit** | Oct 10–12 | 19–22 | Submitted before Oct 12, 23:59 BRT |

**Built later** (designed in the ADRs, labelled "not built" in the README and litepaper):

- partial fills at the queue head (ADR 0010; Task 6 ships whole fills only), with Task 6's partial-fill tests, the Alice/Bob/Carol scenario and the frozen-destination case for a `Cancelled` request that still has `assets_claimable > 0`;
- claim notices and their gate (Task 5's `flag_claim_notice` / `close_claim_notice`); `fulfil_deposits` and `fulfil_redeems` already check `pending_notices == 0`, which always passes until notices exist, and Task 6's claim-notice-gate tests run on an injected count;
- adapters, `allocate` / `deallocate` and TESOURO pricing (Task 9; parts of Tasks 8 and 13), with the TESOURO cap at 0% in the pilot;
- the lifecycle states beyond active and closed (ADR 0012, PR #4);
- the IDL-compatibility CI job (Task 11);
- phase 2 (P2-1…P2-8).

Layout fields for anything built later are carved from the `_reserved` padding (spec §14.2), so none of these need a migration.

---

## Task 0 — Scaffold and docs (Oct 1)

- **Goal:** an Anchor 1.2.0 workspace that builds, with CI green, and the docs that drive the build.
- **Files:** `Anchor.toml`, `Cargo.toml`, `rust-toolchain.toml`, `programs/*`, `tests/`, `clients/js/`, `.github/workflows/ci.yml`, `.gitignore`; `README.md`, `CLAUDE.md`, `NOTICE`, `SECURITY.md`, `docs/*`.
- **Tests first:** a smoke test that loads the program into LiteSVM.
- **Done when:** `anchor build` and `cargo test` pass locally and in CI; docs merged.

## Task 1 — Core state, initialize, roles, pause (Oct 2)

- **Goal:** `VaultConfig`, `VaultState`, vault authority, the four token accounts (spec §3.3) and the share mint; `initialize`, `set_config`, `set_roles`, `set_payments_account`, `set_allowlist_root`, `pause`, `unpause`, `revoke_operator`. Fork the account and authority skeleton from `solana-foundation/vault` (MIT; attribution header + `NOTICE`), removing its unrestricted asset withdrawal.
- **Files:** `programs/mutav/src/{lib.rs,constants.rs,errors.rs,events.rs}`, `state/{config.rs,state.rs}`, `instructions/admin/*`, `token_guard.rs`; `tests/roles_pause.rs`, `tests/common/` (LiteSVM harness, mock BRS mint: classic SPL, 6 dp, freeze authority held by the test).
- **Tests first:**
  - `initialize` only by the upgrade authority; second `initialize` fails.
  - Mint guard rejects Token-2022 mints with `PermanentDelegate`, `TransferHook`, non-zero `TransferFee`, `NonTransferable`, `DefaultAccountState = Frozen`.
  - `fee_take_bps > 3_000` rejected; roles must be distinct.
  - Every admin instruction rejects a non-admin signer; `pause` accepts pauser or admin; `unpause` admin only.
  - `revoke_operator` blocks operator instructions until `set_roles`.
  - `reserve_mint` cannot change after init.
  - `set_config` emits one `ConfigUpdated { field: u16, old: [u8; 32], new: [u8; 32] }` per changed field, for every `VaultConfig` field including `Pubkey`, hash and nested `Caps` / `PriceParams` / `ExitParams` fields (a test walks the field-id table and asserts every field has an event path).
  - `set_config` and `set_payments_account` both reject `payments_account == treasury_account` and a `mutav_capital_wallet` equal to either token account's owner.
- **Done when:** all tests pass; every account starts with `version`/`bump` and ends with the `_reserved` padding sized in spec §14.2 (`VaultConfig` 512, `VaultState` 256, others 64; `Caps`, `PriceParams`, `ExitParams` 32 each); statuses and modes are `u8` constants; `VaultConfig` carries `feature_flags`, `mutav_capital_wallet` and a zeroed `ExitParams`; events emitted via `emit_cpi!`. **Layout freeze checklist** (spec §14.2) ticked: `MAX_ADAPTERS` pinned (spec §12 Q33 answered: `MAX_ADAPTERS = 8`, `AdapterEntry._reserved` 64 bytes, decided 2026-10-06), nested tails present, event set and error list final. Layout tests are in Task 2a.

## Task 2 — Math and solvency module (Oct 2)

- **Goal:** pure functions for `u128` `mul_div` with explicit rounding, share conversion with a virtual offset, `stable_assets`, `coverage_required`, `surplus`, `earmark_eff` (stored level, headroom, liquidity and starvation terms), earmark-aware `free_capital`, `liquid_budget`, `net_assets`, NAV per share (spec §4).
- **Files:** `programs/mutav/src/{math.rs,solvency.rs}`; `tests/rounding.rs`, unit tests in-module.
- **Tests first:**
  - Property tests: `assets_for(shares_for(x)) ≤ x`; rounding always favours the reserve; no overflow at `u64::MAX` inputs (errors, never wraps).
  - `coverage_required` rounds up; `free_capital` saturates at 0; `net_assets` saturates at 0.
  - First-depositor inflation attempt does not zero a second depositor.
  - `earmark_eff = 0` whenever `buffer_earmark = 0`, so `free_capital == surplus` (property test).
  - With an injected earmark and `INSTANT_EXIT` set: `earmark_eff ≤ surplus`, `≤ brs_balance − provisions`, `≤ buffer_earmark`; `0` for a starved head; `free_capital + earmark_eff == surplus`. With the flag clear: `earmark_eff == 0` whatever the stored level.
  - **Sequential outflows never consume the earmark:** for any sequence of outflows each bounded by the `free_capital` computed before it, `earmark_eff` is unchanged (property test; spec invariant 16).
- **Done when:** the module has no dependency on accounts and is fully covered by tests.

## Task 2a — Upgrade readiness (Oct 2)

- **Goal:** layouts, flags and tests that let phase 2 ship to a live reserve with no migration (spec §14, [ADR 0011](decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)).
- **Files:** `state/*` (size consts), `constants.rs` (`INSTANT_EXIT = 1 << 0`, `SUPPORTED_FEATURES = 0`, reserved seed prefixes `"notice"`, `"exit_buffer"`, `"exit_limit"`, `"instant_exit"`), `errors.rs` (`FeatureNotSupported`, appended), `instructions/admin/set_config.rs`; `tests/layout/{v1.rs,v2_carve.rs}`, `tests/padding.rs`, `tests/earmark.rs`, `tests/fixtures/layout/v1/`.
- **Tests first:**
  - **Size pins:** `8 + INIT_SPACE` equals the committed constant for every account (`const` assert plus a test that the serialized length equals the allocation).
  - **Golden layout (OnRe pattern):** frozen `VaultConfigV1`, `VaultStateV1`, `RedeemRequestV1`, `DepositRequestV1`, `HolderStateV1`, … decode under the current structs; a field-offset table built from sentinel values matches.
  - **Layout stability v1 → v2:** test-only `VaultStateV2` (with `InstantExitState` carved from `_reserved`) and `HolderStateV2` (exit counters carved) deserialize v1 accounts produced by the pilot instructions; every carved field reads zero; every v1 field keeps its value and offset.
  - **Padding zero at init** for every `init`; **padding preservation:** random bytes injected into `_reserved` with `set_account` survive every instruction (in-place updates, R6).
  - **Feature flags fail closed:** `set_config` with `INSTANT_EXIT` or any undefined bit → `FeatureNotSupported`; `ExitParams` can be staged while the flag is off.
  - **Version guard (R1b):** an account injected with `version = 2`, or with an unknown status constant, is refused with `UnsupportedVersion`.
  - **Carve size pinned:** a test asserts the serialized size of the test-only `InstantExitState` (88 bytes) and the remaining `VaultState._reserved` (168).
  - **Earmark = 0 in the pilot:** after any sequence of pilot instructions, `buffer_earmark == 0` and `free_capital == surplus`.
  - **Injected earmark** (`set_account`, with the `INSTANT_EXIT` bit injected too): `register_guarantee`, `fulfil_redeems` and `allocate` capacity shrink by exactly `earmark_eff`; **two or more fills in one `fulfil_redeems` batch take at most `surplus − earmark_eff` in total**, and a registration that fits leaves `earmark_eff` unchanged; the ratchet lowers the stored level when surplus or liquidity falls; in under-coverage `earmark_eff == 0`; with the flag injected clear, the earmark has no effect and the next ratcheting instruction stores `0`; `pay_claim` neither reads nor writes `buffer_earmark` and is never refused (extend the Task 5 property test to fuzz the earmark).
  - **Ratchet scope:** with a stale price and `tesouro_units > 0`, `file_claim`, `contribute_fees`, `close_guarantee`, `flag_claim_notice`, `cancel_redeem` and `claim_assets` still succeed (they neither read nor write `buffer_earmark`).
- **Done when:** tests pass; no `Option`/`Vec`/`String` in any account; large accounts boxed in contexts; fixtures dumped at devnet launch (Task 12) are decoded in CI.
- **Built in 2a (2026-10-06)**, for the accounts and instructions that exist after Task 1 (`VaultConfig`, `VaultState`; the seven admin instructions): size pins, golden v1 layouts with offset tables, the `VaultStateV2` carve, padding zero at init and preserved, feature flags failing closed, the version guard (including unknown `mode`), carve sizes, earmark = 0 through the pilot instructions, and the IDL check for fixed-size types. Fixtures from a LiteSVM reserve are in `tests/fixtures/layout/v1/`. `Fixture::pilot_instructions()` lists one valid call of every instruction; each later task appends its instructions, so the padding, version and earmark tests cover them. The rest moved to the task that adds the instruction or account it needs, as bullets marked **carried from 2a**.

## Task 3 — Register and close guarantees (Oct 3)

- **Goal:** `Guarantee`, `AgencyExposure`; `register_guarantee` (solvency-gated, per-guarantee and per-agency caps) and `close_guarantee`.
- **Files:** `state/guarantee.rs`, `state/agency.rs`, `instructions/operator/{register_guarantee.rs,close_guarantee.rs}`; `tests/solvency_gate.rs`, `tests/caps.rs`.
- **Tests first:**
  - Registration succeeds exactly up to `free_capital` and fails one base unit above (`InsufficientFreeCapital`); the check is `coverage_required_after + earmark_eff_before ≤ stable_assets` (spec §5.2 rule 5), also with an injected earmark and flag.
  - Duplicate `id` fails.
  - `GuaranteeCapExceeded`, `AgencyCapExceeded` at the boundary.
  - Non-operator signer rejected; rejected while paused.
  - `close_guarantee` releases the remaining cover; fails with `OpenClaims` when a claim is filed.
  - Invariant: `remaining_cover_total` equals the sum over active guarantees after any sequence.
  - **Carried from 2a:**
    - Golden layout: `GuaranteeV1` and `AgencyExposureV1` with offset tables in `tests/tests/layout/v1.rs`; size pins; padding zero at init.
    - Add `register_guarantee` and `close_guarantee` to `Fixture::pilot_instructions()`, so padding preservation, the version guard and the pilot-earmark sequence cover them.
    - Version guard on `VaultState`: injected `version = 2` or an unknown `mode` is refused with `UnsupportedVersion` (`VaultState::is_supported`); an unknown `Guarantee` status is refused the same way.
    - Injected earmark (`INSTANT_EXIT` also injected): `register_guarantee` capacity shrinks by exactly `earmark_eff`; a registration that fits leaves `earmark_eff` unchanged; the ratchet stores `earmark_eff`, and lowers the stored level when surplus or liquidity has fallen. With the flag injected clear, the earmark has no effect and `register_guarantee` stores `0`.
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
  - The same `invoice_ref_hash` cannot be contributed twice (`FeeReceipt`).
  - Fees never mint shares. MUTAV's share balance changes only via deposit/redeem.
  - `contribute_fees` succeeds while paused and in under-coverage.
  - **Carried from 2a:** `FeeReceiptV1` golden layout and padding zero at init; `contribute_fees` added to `Fixture::pilot_instructions()` (padding preserved, version guard, `buffer_earmark` neither read nor written).
- **Done when:** tests pass; `FeesContributed` carries gross, take and net.

## Task 5 — Claims and payouts (Oct 4)

- **Goal:** `ClaimFiling`, `Payout`, `ClaimNotice`; `flag_claim_notice`, `close_claim_notice`, `file_claim`, `pay_claim`, `settle_payout` (spec §5.4).
- **Files:** `state/{claim.rs,payout.rs,notice.rs}`, `instructions/operator/{flag_claim_notice.rs,close_claim_notice.rs,file_claim.rs,pay_claim.rs,settle_payout.rs}`; `tests/claims.rs`, `tests/notices.rs`, `tests/freeze.rs` (payout cases).
- **Tests first:**
  - `file_claim` books the provision; NAV per share drops immediately; `stable_assets` unchanged.
  - `pay_claim` pays only `payments_account`; any other destination fails (`InvalidPaymentsAccount`).
  - `amount ≤ remaining cover on leg`; per-call and per-period caps at the boundary; the period window rolls.
  - Second `pay_claim` for the same notice fails (idempotency).
  - **Property test:** `pay_claim` is never refused for solvency or under-coverage (fuzz `stable_assets` below `coverage_required`).
  - At `c = 1.0`, paying a claim leaves `free_capital` unchanged.
  - Frozen `reserve` → `ReserveFrozen`, clean failure, retry succeeds after thaw.
  - **Carried from 2a:**
    - `ClaimFilingV1` and `PayoutV1` golden layouts; padding zero at init; unknown leg or status constants refused with `UnsupportedVersion`; `file_claim`, `pay_claim` and `settle_payout` added to `Fixture::pilot_instructions()`.
    - `pay_claim` neither reads nor writes `buffer_earmark` and is never refused: the solvency property test above also fuzzes an injected earmark with `INSTANT_EXIT` set (spec §4 invariant 14).
    - `ClaimNoticeV1` golden layout, with the claim notices (built later).
  - `settle_payout` records `pix_e2e_hash`; late flag set when past the SLA; second settle fails.
  - **Claim notices:** flag increments `pending_notices`; duplicate notice fails; close as `Paid` requires the `ClaimFiling` to be `PAID`; close as `FullyProvisioned` requires `leg_provision == leg_cover − leg_paid`; **a notice whose filing has a provision smaller than the eventual payment cannot be closed as filed** (`NoticeNotResolved`); close as `Withdrawn`; notices never affect `file_claim`, `pay_claim`, `settle_payout` or `close_guarantee`; flag and close work while paused and in under-coverage.
- **Done when:** tests pass; the payout flow matches [ADR 0003](decisions/0003-payments-operated-by-mutav.md).

## Task 6 — Async deposits and redemptions (Oct 4–5)

- **Goal:** `request_deposit`, `cancel_deposit`, `fulfil_deposits`, `claim_shares` (`request_deposit` and `claim_shares` stamp `HolderState`), `advance_queue_heads`, `request_redeem`, `cancel_redeem`, `fulfil_redeems(count, max_assets)`, `claim_assets`, adapted from the `solana-foundation/vault` async core (MIT). Allowlist via Merkle proof. Strict FIFO for redemptions, from `free_capital` and `liquid_budget` only, each fill at the NAV of that fill, with **partial fills at the head** ([ADR 0010](decisions/0010-partial-fills-at-queue-head.md), spec §5.5).
- **Files:** `state/request.rs`, `instructions/capital/*`; `tests/capital_async.rs`, `tests/freeze.rs` (escrow cases).
- **Tests first:**
  - Non-allowlisted wallet rejected; size limits enforced.
  - **Owner, never delegate:** a share account delegate approved by `mutav_capital_wallet` (or any wallet) cannot `request_redeem` its shares; `request_deposit` requires the source owner to sign.
  - **Claim-notice gate:** with `pending_notices > 0`, `fulfil_redeems` and `fulfil_deposits` fail with `ClaimNoticePending`, including when the head belongs to `mutav_capital_wallet`; they succeed once the notice is closed.
  - **Head crank:** after N request/cancel cycles, `advance_queue_heads` moves `redeem_head` to the live request and the admin's fill needs one transaction whatever N is; a closed seq with lamports sent to it still passes the skip proof; a live request is never skipped; `cancel_redeem` does not move `redeem_head`.
  - Pending deposits are excluded from `stable_assets` and NAV.
  - Fulfil prices at the NAV at fulfil (NAV moved between request and fulfil).
  - `fulfil_redeems` never skips a request with shares remaining; out-of-order accounts fail (`QueueOrderViolation`); closed or cancelled seqs are skipped.
  - **Partial fills:**
    - The head is filled as far as `min(max_assets, free_capital, liquid_budget)` allows; after one partial fill the batch stops; a later request is never touched while the head has shares remaining.
    - Each fill is priced at its own NAV (move NAV between two fills of the same request).
    - A partial fill below `min_fill_assets` does not happen (head untouched); a fill that would leave less than `min_request` is trimmed so the remainder is worth `min_request`; a head worth less than `min_request + min_fill_assets` is filled only whole.
    - **Rounding boundary:** with the budget exactly `min_fill_assets`, the rounded `assets` that would fall below `min_fill_assets` gives no fill; the remainder, valued with `assets_for`, is never below `min_request`.
    - `max_assets` limits the batch but never changes the order.
    - A call that fills nothing fails with `InsufficientFreeCapital` / `InsufficientLiquidBalance`.
    - Fills never spend `provisions`: with a filed claim, `liquid_budget` binds before `free_capital`.
    - `claim_assets` between fills pays the accrued amount and keeps the request (and its place) open; the account closes only when `shares_remaining == 0 && assets_claimable == 0`.
    - `cancel_redeem` on a partially filled head returns only `shares_remaining`, leaves filled assets claimable, sets `Cancelled`; the next live seq becomes the head after `advance_queue_heads` (or inline in the next `fulfil_redeems`).
    - Invariants 8–12 of spec §4 hold after every instruction (fuzzed sequences of request / fill / claim / cancel).
  - **Alice/Bob/Carol scenario** ([ADR 0010](decisions/0010-partial-fills-at-queue-head.md); one test, three weeks, asserting the figures below to the base unit after accounting for the virtual offset `V`; the test documents any rounding delta):
    - Start: `stable_assets` R$100,000, `coverage_required` R$80,000, 100,000 shares at NAV 1.00; queue #1 Alice 15,000 sh, #2 Bob 30,000 sh, #3 Carol 2,000 sh; `min_fill_assets` R$500, `min_request` R$1,000.
    - Week 1: Alice filled R$15,000; Bob partially filled 5,000 sh → R$5,000; `free_capital` 0; Carol untouched.
    - Week 2: R$1,600 net guarantee fees, a guarantee closes releasing R$10,000 of cover → NAV 1.02, free R$11,600; Bob partially filled 11,372.549020 sh → R$11,600; 13,627.450980 sh left.
    - Week 3: a guarantee closes releasing R$15,000, a R$2,000 claim is filed → NAV 0.990857, free R$15,000; Bob's remainder filled (R$13,502.86); Carol trimmed to R$981.71 (990.772780 sh) leaving R$1,000; R$515.43 stays idle; `RedeemsFulfilled.idle_free_capital` reports it.
    - Bob claims after each week; his blended price is `assets_filled / shares_filled` (≈ R$1.00343). Carol is never filled before Bob's request is complete.
  - `max_tvl` blocks `fulfil_deposits` at the boundary.
  - `cancel_*` and `claim_*` work while paused.
  - Frozen investor destination: `claim_assets` fails, `assets_claimable` and the status (`Filled` or `PartiallyFilled`) are unchanged, the account stays open, and the claim succeeds after thaw; same for a `Cancelled` request with `assets_claimable > 0`.
  - Request accounts close on claim/cancel, rent to owner.
  - `request_deposit` creates `HolderState` if needed and refreshes `last_shares_in_ts`; `claim_shares` refreshes it again.
  - **Carried from 2a:**
    - `DepositRequestV1`, `RedeemRequestV1` and `HolderStateV1` golden layouts; padding zero at init; unknown status constants refused with `UnsupportedVersion`; every capital instruction added to `Fixture::pilot_instructions()`.
    - Test-only `HolderStateV2` (per-wallet exit counters `exit_period_start: i64`, `exit_period_paid: u64` carved from `_reserved`) decodes v1 accounts produced by the pilot instructions, with a zero carve and unchanged v1 fields; carve size pinned (16 bytes, 48 left).
    - Injected earmark (`INSTANT_EXIT` also injected): `fulfil_redeems` capacity shrinks by exactly `earmark_eff`; **two or more fills in one batch take at most `surplus − earmark_eff` in total**; a starved head sees `earmark_eff = 0`; the ratchet stores `earmark_eff`.
    - `cancel_redeem` and `claim_assets` neither read nor write `buffer_earmark`.
- **Done when:** tests pass; forked files carry the MIT header; `NOTICE` updated.
- **Built in Phase C (2026-10-06), whole fills only.** All nine instructions, the allowlist Merkle proof (`allowlist.rs`: `leaf = sha256(0x00 ‖ owner)`, `node = sha256(0x01 ‖ min ‖ max)`, zero root allowlists nobody), the request and holder layouts with their golden tables and the `HolderStateV2` carve, and every capital instruction in `Fixture::pilot_instructions()`. `fulfil_redeems` fills whole requests from the head while they fit `min(max_assets − paid, free_capital, liquid_budget)`; the first head that does not fit stops the batch untouched (`TODO(plan: partial fills deferred, ADR 0010)` marks the sizing). The partial-fill layout fields and statuses are real, so ADR 0010 ships with no migration. Tests: `tests/capital_async.rs`, `tests/freeze.rs` (escrow cases), `tests/layout/capital.rs`. **Built later:** the partial-fill bullets above, the Alice/Bob/Carol scenario and the `Cancelled`-with-claimable freeze case; the claim-notice gate is tested on an injected `pending_notices`.

## Task 7 — MUTAV capital (Oct 5)

- **Goal:** none beyond Task 6. MUTAV uses the async deposit/redeem flow (ADR 0008).
- **Tests first:**
  - MUTAV's allowlisted wallet deposits, then redeems through the queue.
  - `fulfil_deposits` works in under-coverage (recapitalization).
  - Pause blocks capital flows and new guarantees, while `contribute_fees`, `file_claim`, `pay_claim`, `settle_payout`, `close_guarantee`, `flag_claim_notice`, `close_claim_notice`, `refresh`, `advance_queue_heads`, `cancel_*` and `claim_*` still succeed.
- **Done when:** tests pass.
- **Built in Phase C (2026-10-06):** `tests/mutav_capital.rs`. Under-coverage is reached by raising `coverage_ratio_bps`, with `mode` injected until `refresh` (Task 10) records it. The pause test covers `refresh` (from Task 8) and leaves out the claim-notice instructions (built later).

## Task 8 — Under-coverage mode and price safety (Oct 6)

- **Goal:** `mode` transitions; TESOURO valued at `min(on-chain price, accrual curve)` with staleness and deviation bounds; NAV-move guard halting fulfilment.
- **Files:** `pricing.rs`, `solvency.rs`; `tests/solvency_gate.rs`, `tests/pricing.rs`.
- **Tests first:**
  - A mark-down below `coverage_required` → `UnderCovered`: `register_guarantee`, `fulfil_redeems`, `allocate` fail; `pay_claim` succeeds.
  - Recovery returns `mode` to `Normal`.
  - Price above the accrual curve is capped; stale price → gated instructions fail with `StalePrice`; deviation beyond the bound rejected.
  - NAV move > threshold sets `fulfil_halted`; fulfils fail until cleared.
  - **Carried from 2a:**
    - In under-coverage with an injected earmark and flag, `earmark_eff == 0`, and the next ratcheting instruction stores `0`.
    - **Ratchet scope:** with a stale price and `tesouro_units > 0`, `file_claim`, `contribute_fees`, `close_guarantee`, `cancel_redeem`, `claim_assets` (and `flag_claim_notice`, when notices are built) still succeed; they neither read nor write `buffer_earmark`. This needs the TESOURO pricing, which is built later.
- **Done when:** tests pass using a mock price account (real layout pending Etherfuse, spec §12 Q2).
- **Built in Phase C (2026-10-06), BRS only.** The spec puts the mode transition and the NAV-move guard in `refresh`, so `refresh`'s core lands here: it recomputes and publishes `stable_assets`, `coverage_required` and NAV per share, sets `mode` (emitting `ModeChanged` on a transition), runs the guard and emits `StateRefreshed`. Task 10 adds freeze detection, late payouts and the event audit. `register_guarantee` and `fulfil_redeems` also check under-coverage inline; `pay_claim` and `fulfil_deposits` are never blocked. The guard trips on a move strictly above `max_nav_move_bps` of the last published NAV. It is skipped while either NAV is 0 (no shares, spec §4 TODO), and it measures the move gross, so a large fee batch trips it too (`TODO(adr 0013: inflow-adjusted NAV guard)`). Nothing clears `fulfil_halted` yet: it fails closed. Tests: `tests/under_coverage.rs`. **Built later:** TESOURO pricing (`tesouro_units > 0` fails closed with `StalePrice`, `refresh` included), the ratchet-scope test that needs a stale price, `allocate`.

## Task 9 — Adapter interface, mock adapter, allocate/deallocate (Oct 6–7)

- **Goal:** `mutav-adapter-interface` crate (discriminators, account layouts, `deposit`/`withdraw`/`position_value`), `mutav-adapter-mock` program, and `allocate`/`deallocate` through per-adapter capped sub-authorities. Adapter whitelist in `VaultConfig`.
- **Files:** `programs/mutav-adapter-interface/*`, `programs/mutav-adapter-mock/*`, `instructions/reserve/*`, `instructions/admin/whitelist_adapter.rs`; `tests/adapters.rs`.
- **Tests first:**
  - Non-whitelisted adapter program rejected.
  - The vault authority never appears as a signer in the CPI (inspect instruction accounts).
  - A malicious mock that moves extra tokens or mints shares fails the post-CPI check.
  - Adapter cap and TESOURO share cap at the boundary.
  - Allocation fails when it would breach the solvency post-condition, or the liquidity post-condition `brs_balance_after ≥ provisions + earmark_eff_before` (`InsufficientLiquidBalance`); with an injected earmark `E` (flag set), a failing allocation leaves `buffer_earmark` unchanged.
  - **CPI depth:** `allocate` and `deallocate` succeed when executed through a Squads v4 vault transaction (Task 13); the mock adapter makes one CPI level and emits no self-CPI events.
  - **Deallocate rule:** in under-coverage, deallocating TESOURO → BRS at or above its bounded value succeeds; a deallocation that lowers `stable_assets` fails with `WorsensCoverage`. In normal mode, any value loss must fit in `free_capital`.
  - **Carried from 2a:** with an injected earmark and flag, `allocate` capacity shrinks by exactly `earmark_eff`; `allocate`, `deallocate`, `whitelist_adapter` and `remove_adapter` added to `Fixture::pilot_instructions()`; adapter entry padding preserved.
- **Done when:** tests pass; [ADR 0002](decisions/0002-core-program-and-capped-adapters.md) holds in code.

## Task 10 — Refresh and events (Oct 7)

- **Goal:** permissionless `refresh`; freeze detection; late-payout flags; `StateRefreshed`, `ModeChanged`, `PayoutLate`, `ReserveFrozenDetected`. Audit that every token movement emits an event.
- **Files:** `instructions/public/refresh.rs`, `events.rs`; `tests/refresh.rs`, `tests/events.rs`.
- **Tests first:**
  - `refresh` by a random signer recomputes the public state exactly as the math module does.
  - Pending payout past the SLA is flagged late and counted.
  - Frozen reserve account detected; balance excluded; event emitted.
  - Event coverage test: every token movement is covered by an event whose amounts match (one `RedeemFilled` per fill, one `RedeemsFulfilled` per batch, one `FeesContributed` covering both of its transfers).
  - `StateRefreshed` carries `surplus` and `buffer_earmark`.
  - **Carried from 2a:** `refresh` with an injected earmark ratchets the stored level down when surplus or liquidity has fallen, and stores `0` with the flag injected clear; `refresh` and `advance_queue_heads` added to `Fixture::pilot_instructions()`, so the pilot-earmark sequence covers every instruction.
- **Done when:** tests pass; Mollusk CU benchmark recorded for `refresh`, `pay_claim`, `fulfil_redeems` (multi-fill batch with a partial head, `emit_cpi!` per fill, boxed `VaultConfig`), including the Borsh cost of the 512/256-byte padding; `MAX_FULFIL_BATCH` pinned from it.

## Task 11 — Codama client and publication (Oct 7–8)

- **Goal:** generate `@mutav-finance/mutav-protocol-solana` from the IDL with Codama for `@solana/kit`; add PDA helpers and read helpers (`VaultState`, guarantees, payouts, queue position) and a TS mirror of the math for previews. No signing code.
- **Files:** `clients/js/*`, `scripts/generate-client.ts`, CI Codama diff check.
- **Tests first:** client unit tests (Bun) for PDA derivation against known addresses, instruction encoding round-trips, math-mirror parity with Rust test vectors (including `earmark_eff`, `free_capital`, `liquid_budget` and the partial-fill sizing); a grep check that fails CI on secret-key APIs.
- **IDL compatibility:** an `idl-compat` CI job, active from the first tagged release, diffs `target/idl/mutav.json` against the last released IDL and fails on changed instruction args/accounts, account sizes, field offsets or types, renumbered errors, or changed events (spec §14.4).
- **Done when:** CI regenerates the client and finds no diff; package published (GitHub Packages or npm, under `@mutav-finance`) and installable from mutav-app.

## Task 12 — Devnet deploy with Squads as upgrade authority (Oct 7–8)

- **Goal:** program on devnet; Squads v4 multisig (with time lock) as upgrade authority and admin; operator and pauser set; caps configured; allowlist root set.
- **Files:** `scripts/devnet/{deploy.ts,init.ts,roles.ts,caps.ts,allowlist.ts}`, `.github/workflows/release.yml` (verified build with `solana-verify` in x86 CI → buffer → Squads upgrade proposal).
- **Release workflow** follows the spec §14.5 runbook from day one: `solana-verify build` → executable hash; ProgramData size check, with the extend instruction bundled into the Squads proposal where `ExtendProgramChecked` is active; buffer with authority set to the upgrade-authority vault; buffer hash must equal the executable hash; one Squads proposal bundling the upgrade, the Program Metadata IDL write and the verify-PDA write.
- **Tests first:** a script dry-run against a local validator; a check that the upgrade authority equals the Squads vault after deploy; a check that the Squads multisig has `config_authority == Pubkey::default()` and `time_lock ≥` the agreed floor; a check that `feature_flags == 0` and `buffer_earmark == 0` after `init`; a per-reserve address lookup table created for the static accounts of admin vault transactions.
- **Layout freeze:** re-tick the spec §14.2 checklist before the first deploy; from then on errors and events are append-only.
- **Done when:** program deployed and verified; upgrade authority = Squads vault; addresses recorded in `README.md`; live `VaultConfig`/`VaultState` dumped into `tests/fixtures/layout/v1/`; no keypair committed; the one-vs-two-multisig question (spec §12 Q15) answered or recorded as an open item.

## Task 13 — Surfpool fork tests (Oct 8–9)

- **Goal:** run the core flows against Nora's devnet BRS mint `BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4` and a Squads proposal flow on a fork.
- **Files:** `tests-fork/*`, `.github/workflows/fork.yml` (manual trigger).
- **Tests first:** initialize with the real mint; deposit → fulfil → claim; register → fee → file → pay → settle; admin fulfil executed through a Squads proposal, including a partial head fill; `allocate` and `deallocate` executed through a Squads proposal (CPI depth); a no-op program upgrade through a timelocked Squads proposal, after which every live account still decodes.
- **Done when:** the fork suite passes on demand; findings about the real mint's authorities recorded in the spec's open questions.

## Tasks 14–18 — mutav-app integration (Oct 8–9) [mutav-app]

These happen in `mutav-finance/mutav-app`, consuming `@mutav-finance/mutav-protocol-solana`. This repo only supplies the client and the program.

### Task 14 — Convex operator actions [mutav-app]

- **Goal:** KMS-backed Convex actions that call `register_guarantee` on activation, `close_guarantee` on close, `contribute_fees` when an invoice is paid, `file_claim`/`pay_claim` on claim approval, and `settle_payout` on PIX confirmation; a Solana event indexer.
- **Done when:** each lifecycle transition in the platform produces the matching instruction on devnet, idempotently; the indexer stores events for the transparency views, skips unknown event discriminators, and decodes accounts by discriminator (not `dataSize` alone), so a later program upgrade cannot break it.

### Task 15 — Admin Squads proposals in `apps/admin` [mutav-app]

- **Goal:** compose admin instructions (fulfil queues, allowlist, caps, payments account, adapters, allocate/deallocate, roles) as Squads v4 proposals, signed by each admin's own wallet.
- **Done when:** a fulfil executed end to end through a proposal on devnet.

### Task 16 — Investor flow in `apps/fund` [mutav-app]

- **Goal:** async deposit and redeem with queue position, cancel, claim, position and history; partial fills shown per fill ("each part is priced when it is paid"), claim between fills, and the blended exit price.
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

---

## Phase 2 — Instant exit (post-pilot)

*Not in the hackathon window. Designed in spec §13 and [ADR 0011](decisions/0011-phase2-instant-exit-and-upgrade-readiness.md); enabled on the live reserve through the spec §14.5 runbook. Starts only after the open questions it depends on (spec §12 Q15, Q24–Q31) are answered. Every task keeps the existing instructions, events, errors and layouts unchanged; `idl-compat` must stay green.*

### Task P2-1 — Carve phase-2 state

- **Goal:** carve `InstantExitState` from the front of `VaultState._reserved` and the exit counters from `HolderState._reserved` (`ClaimNotice` already exists from the pilot); set `SUPPORTED_FEATURES |= INSTANT_EXIT`; append the phase-2 errors in the spec §13.9 order.
- **Tests first:** the Task 2a golden tests and the devnet/mainnet fixtures still decode; carved fields read zero on v1 bytes; padding preservation for every new instruction; `idl-compat` passes; `pay_claim` has no diff.
- **Done when:** the pilot test suite passes unchanged on the new binary.

### Task P2-2 — Claim notices

- **Goal:** extend the pilot claim-notice gate (Task 5) to `instant_redeem`. No change to `flag_claim_notice` / `close_claim_notice`.
- **Tests first:** with a notice open, `instant_redeem` fails with `ClaimNoticePending`; after close (`Paid` / `FullyProvisioned` / `Withdrawn`) it resumes; a notice whose filing provision is below the eventual payment cannot reopen instant exit; notices still never affect `file_claim` or `pay_claim`.
- **Done when:** tests pass; mutav-app flags a notice at the first missed-rent signal (Convex action, [mutav-app]; already required by the pilot).

### Task P2-3 — Buffer instructions

- **Goal:** `fund_exit_buffer` (operator crank), `defund_exit_buffer` (admin or operator), `release_starved_buffer` (permissionless).
- **Tests first:** funding only by the operator, only when the queue is empty, not paused, normal mode, price fresh and `surplus ≥ headroom`; level capped at `min(E, surplus − headroom, brs_balance − provisions)`; funding never lowers the level; defund by admin or operator, allowed while paused and in under-coverage; lowering `buffer_target_bps` clamps the stored level to the new `E` on the next earmark instruction; starvation release only after `buffer_release_after_secs`, only with the true head (a non-head account or a head cancelled before release is rejected with `QueueOrderViolation` until `advance_queue_heads` runs), and inline in `fulfil_redeems`. Reserved earmark with `coverage_required` R$70,000, headroom R$7,000, stored earmark R$5,000: surplus R$30,000 → earmark 5,000 / free 25,000, instant exit can pay up to R$5,000; a R$25,000 fill then leaves surplus 5,000 → earmark 5,000 / free 0 (the fill took no earmark) and instant exit is off (surplus below earmark + headroom); a mark-down to surplus R$3,000 → earmark 3,000 / free 0; recovered surplus goes to free capital, not back to the earmark; clearing `INSTANT_EXIT` returns the earmark to free capital at once.
- **Done when:** tests pass; earmark invariants 13–17 hold with real (not injected) funding.

### Task P2-4 — Haircut math

- **Goal:** the integral curve (spec §13.4) in `u128` with an integer square root; epoch roll and `V_window`; Rust and TS mirror.
- **Tests first:** the spec §13.4 example table to the base unit; **split-proof property test** (any split of an exit within one epoch, with the stored level or `V_window` setting `x`, pays the same total ± `n` base units; when the surplus or liquidity term sets `earmark_eff`, splitting never saves more than `Σ haircut × h_max / 10_000`); the haircut is one exact rational rounded up once; monotone in `x` and `raw`; marginal cap respected; no overflow at bounds.
- **Done when:** Rust and TS agree on shared vectors; Mollusk CU recorded.

### Task P2-5 — `instant_redeem` and `quote_instant_redeem`

- **Goal:** the instruction and the view (spec §13.5).
- **Tests first:**
  - Each gate refuses with its error: flag off, paused, under-coverage, `fulfil_halted`, stale price (tighter bound), notice pending, MUTAV capital wallet and barred wallets, not allowlisted, holding period, min/per-tx/per-wallet/global caps, `raw > earmark_eff`, below headroom, `out == 0` even with `min_out = 0`, `out < min_out`.
  - Effects: shares burned, `out` paid directly, `buffer_earmark` falls by `raw`, `free_capital` rises by the haircut, NAV rises by `haircut / (S − s)` for every remaining share including queued shares, `haircut_total` separate from `fees_in_total`, nothing to the treasury.
  - Queue interaction: an instant exit never reduces a fill available to the queue head; a queue with waiting requests blocks refills; with the queue non-empty the head must be passed; **a starved head blocks `instant_redeem` without a prior `release_starved_buffer` crank** (`InsufficientExitBuffer`).
  - Delegates: a delegate approved by `mutav_capital_wallet` cannot instant-redeem its shares (owner must sign).
  - Holding period: a holder with old shares who requested a new deposit (fulfilled or not, claimed or not) is inside the holding period.
  - The `pay_claim` never-refused property test runs with instant exit enabled and a funded earmark.
  - The quote (same accounts and proof) equals the executed result in the same slot, including the `NotAllowlisted` case.
- **Done when:** tests pass; events match spec §13.8.

### Task P2-6 — Client and mutav-app [mutav-app]

- **Goal:** publish the client as a minor version; mutav-app deploys decoders and the indexer for the new fields and events **before** the program upgrade; the buffer crank; `apps/fund` shows the quote, slippage and the haircut breakdown; the transparency page shows the earmark, haircut totals and open notices with their age.
- **Done when:** the indexer handles a fork with the new program and old accounts.

### Task P2-7 — Rehearsal

- **Goal:** spec §14.5 rehearsal: Surfpool fork of the live cluster with the new `.so`; pending `RedeemRequest`s decode, cancel, fill and claim; then devnet with the production Squads threshold and time lock, end to end through `apps/admin`, including a rollback to the pilot binary.
- **Done when:** both rehearsals pass and the release notes record both hashes.

### Task P2-8 — Upgrade and enable

- **Goal:** mainnet upgrade per spec §14.5 (verified build, buffer hash check, one bundled timelocked Squads proposal, verify job, smoke checks with the feature off). After an observation period, separate timelocked proposals: `ExitParams` with conservative caps and the allowlist root; then the `INSTANT_EXIT` bit.
- **Done when:** instant exit is live with conservative caps, monitored by events, and the rollback paths are documented in the runbook (fast: pause → operator defund → clear flag; slow: pause → clear flag → assert `feature_flags == 0 && buffer_earmark == 0` → downgrade). Before each upgrade proposal is approved: `config_authority == Pubkey::default()`, every instruction of the vault-transaction message decoded, no Squads config change in flight.
