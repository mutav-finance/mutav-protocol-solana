# 0019 — v1 layout for the devnet release

- **Status:** Accepted (Julia, 2026-10-10). Decided in the pre-devnet adversarial review walkthrough (2026-10-09/10: L-1, the payout-SLA decision, the per-agency cap removal, simplification A2–A4 and A9–A14, the claim-window and carve open points). Amends ADR 0016 (devnet caps: no per-agency cap; the claim cap is per 31-day window), ADR 0018 (no on-chain settlement floor and no inline adapter entries until adapters ship), ADR 0017 (no take on issuer income), ADR 0010 and ADR 0011 (partial fills, the phase-2 exit parameters and the buffer earmark leave the pilot layout and return as carves) and ADR 0012 (the `Payout` account is merged into `ClaimFiling`; the ADR 0012 fields are carved later from padding sized for them now). This is the last pre-freeze edit of the v1 layout.

## Context

The devnet deploy freezes the v1 layout (spec §14.2): from then on, a change is a carve from `_reserved` or a new account, never a resize, reorder or removal. Before the freeze the layout can still change, and the golden v1 fixtures can be regenerated.

The review found that the layout about to be frozen was the wrong one to keep:

- **L-1.** The spec said `Guarantee`, `ClaimFiling` and `Payout` "are re-pinned when ADR 0012 is implemented". After the freeze nothing can be re-pinned: per-lease accounts live at upgrade time cannot be migrated. Their padding had to be sized for the ADR 0012 fields before the freeze.
- **Fields that would be frozen with no use.** The devnet binary carried state for features it does not build: the phase-2 `ExitParams` (275 bytes) and buffer earmark, the TESOURO `PriceParams` and `tesouro_*` fields, eight inline `AdapterEntry` slots (1,416 bytes of a 2,756-byte `VaultConfig`), the settlement-floor complement, the partial-fill request fields, `HolderState` stamps, `pending_notices`, a take on issuer income, and errors and events no instruction could raise or emit. Each one is a field the audit must read, the client must decode and the app must show, and each would stay in the layout forever.
- **Rules that belong off-chain.** The payout SLA (`payout_sla_secs`, `Payout.late`, `late_payouts`, the late scan in `refresh`) measured MUTAV's own settlement against a deadline MUTAV sets. The real service level is review, information requests, approval and execution, which the operator platform runs. The per-agency cap (`max_cover_per_agency`, ADR 0016) was set at R$10M so that it never bound, and it cost an `AgencyExposure` account created with `init_if_needed` in every registration.
- **A claim cap with a gap.** The per-period cap was a tumbling window (`claim_period_start`, `claim_period_paid`, `claim_period_secs`): a compromised operator could pay the full cap just before a window boundary and again just after it, up to twice the cap in any 30-day span.
- **Decided fields with no home.** The review adopted fields for later upgrades (two-step role handover, guardians, the stress buffer, the exit fallback, reinstatement, claim approval). Carving them now, at zero, fixes their offsets before the freeze and costs nothing at runtime.

## Decision

### 1. The layout is fixed before the freeze (L-1)

Every account's padding is sized to hold every carve already planned for it, and the golden v1 fixtures (`tests/fixtures/layout/v1/`) and offset tables (`tests/tests/layout/v1.rs`) were regenerated for the last time. A layout test (`padding_holds_every_planned_carve`) asserts that each padding holds its planned carves:

| Account | `_reserved` | Planned carves it must hold | Bytes | Spare after them |
|---|---|---|---|---|
| `VaultConfig` | 411 (512 before the decision 9 carves) | Phase-2 `ExitParams` (275) and the ADR 0012 config fields (57: `claims_tail_secs`, `payment_term_secs`, `optional_categories`, `backstop_amount`, `backstop_commitment_hash`) | 332 | 79 |
| `Caps` (nested) | 32 | Later caps for PC-43 (`max_guarantees`, a concentration limit, new cover per period) | ≥ 24 | 8 |
| `VaultState` | 224 (256 before the decision 9 counters) | Phase-2 `InstantExitState` (88), the buffer earmark (8), the claim-notice counter (4) and the ADR 0012 counters (16) | 116 | 108 |
| `Guarantee` | **203** (was 64; 192 plus the 12 bytes of the display fields removed by decision 8, less the `close_reason` carve of decision 9) | The ADR 0012 lifecycle fields: `contract_cap_hash`, `landlord_mandate_hash`, `exoneration_effective_ts`, `keys_returned_ts`, `claims_tail_until_ts` | 88 | 115 |
| `ClaimFiling` | **192** | The ADR 0012 claim fields (49: `category`, `accrued_until_ts`, `request_complete_ts`, `debt_calc_hash`) and the settlement fields the filing does not already carry (65: `flags`, `landlord_mandate_hash`, `quitacao_hash`) | 114 | 78 |
| `RedeemRequest` | 48 (64 before the `shares_filled` carve of decision 6 and the `min_assets_out` carve of decision 9) | The rest of the ADR 0010 partial-fill fields (`assets_claimed`, `fill_count`, `last_fill_at`); the remainder `shares − shares_filled` and the claimable amount are derived, never stored | 18 | 30 |
| `DepositRequest` | 56 (64 before the `min_shares_out` carve of decision 9) | None planned | 0 | 56 |
| `IncomeReceipt` | 64 | None planned | 0 | 64 |

The former `Payout` carve (74 bytes) repeated `category` and `request_complete_ts`, which the merged filing carries once, so the filing needs 114 bytes. Its padding is 192 so that about 78 bytes stay free after the freeze; the test requires at least 64 spare.

**Final sizes**, discriminator included, pinned in `constants.rs` (spec §14.2 R7) and checked against `8 + INIT_SPACE` and the v1 tables:

| Account | Size | Of which `_reserved` |
|---|---|---|
| `VaultConfig` | 1,181 bytes (was 2,756) | 411, plus `Caps` 106 bytes with its own `_reserved` 32 |
| `VaultState` | 688 bytes (was 480) | 224 |
| `Guarantee` | 377 bytes | 203 |
| `ClaimFiling` | 380 bytes | 192 |
| `IncomeReceipt` | 143 bytes | 64 |
| `DepositRequest` | 155 bytes | 56 |
| `RedeemRequest` | 155 bytes | 48 |

`AgencyExposure`, `Payout`, `HolderState` and `FeeReceipt` no longer exist (decisions 2–4).

### 2. The payout SLA leaves the program

Removed: `VaultConfig.payout_sla_secs`, `Payout.late`, `VaultState.late_payouts`, the late scan in `refresh`, the `PayoutLate` event and `PayoutSettled.late`. `refresh` now takes no remaining accounts. `ConfigUpdated` id 13 (`payout_sla_secs`) is retired.

The SLA belongs to the operator platform (mutav-app): review, information requests, approval and execution, against the contractual deadline with a 48-hour internal target. The reserve's only on-chain promise is this one: **within the caps, `pay_claim` is never refused.** `settle_payout` stays as the settlement record (the PIX end-to-end hash and its time), with no deadline.

### 3. No per-agency cap and no `AgencyExposure` (amends ADR 0016)

Removed: `caps.max_cover_per_agency`, the `AgencyExposure` account and its `init_if_needed` in `register_guarantee`, the error `AgencyCapExceeded`, and the agency account in `register_guarantee`, `pay_claim` and `close_guarantee`. `Guarantee.agency_id` stays: per-agency figures (outstanding cover, active guarantees, claims paid) are derived off-chain from the guarantee accounts and events. If a concentration limit is ever needed (PC-43), it returns as a new account, not as this one. The `"agency"` seed is retired (`RETIRED_SEEDS`) and `ConfigUpdated` id 102 is retired.

ADR 0016's devnet caps are otherwise unchanged; the claim cap now reads "R$20k per 31 days" (decision 5).

### 4. Simplification (review items A2–A4, A9–A14)

- **Phase-2 exit state (A2; amends ADR 0011).** `VaultConfig.exit: ExitParams` and `VaultState.buffer_earmark` are removed, with the earmark terms of the solvency formula. `feature_flags` stays and still fails closed (`SUPPORTED_FEATURES = 0`). Phase 2 returns as a carve: `ExitParams` (275 bytes) fits `VaultConfig._reserved`, and `InstantExitState` (88) plus the earmark (8) fit `VaultState._reserved`. Its design stays in spec §13.
- **TESOURO pricing (A3).** `PriceParams`, `VaultState.tesouro_units`, `tesouro_price`, `tesouro_price_ts` and the cached `VaultState.stable_assets` are removed. The pilot is BRS only (ADR 0018), so `stable_assets = brs_balance`; it is still computed at every gate and published by `refresh`, just not cached. `max_nav_move_bps` moves into `Caps` and keeps `ConfigUpdated` id 206: same field, same meaning. Ids 200–205 (the other price parameters) are retired.
- **Inline adapters and the settlement floor (A14; amends ADR 0018).** `VaultConfig.adapters[8]` and `caps.max_allocated_bps` (the stored complement of `min_settlement_bps`) are removed; id 106 (`caps.min_settlement_bps`) is retired. `VaultConfig.adapter_count` and `adapter_bitmap` are carved, both `0`. When adapters are built, each one is described by its `AdapterState` PDA (ADR 0018, seed `"adapter_state"` reserved), and the bitmap (`MAX_ADAPTERS = 8` bits) records which slots are enabled. **There is no on-chain settlement floor until adapters ship**: with no adapter instructions in the binary, nothing can leave BRS. The floor and the per-adapter limits return with the adapter upgrade.
- **`Payout` merged into `ClaimFiling` (A4; amends ADR 0012).** One account per claim notice, from filing to settlement, at the same seeds `["claim", guarantee, notice_ref_hash]`. Statuses are `u8` constants, append-only: `FILED = 0`, `PAID = 1`, `WITHDRAWN = 2`, `SETTLED = 3`. `PAID` and `SETTLED` are terminal. `WITHDRAWN` is reserved and fails closed in this binary: `ClaimFiling::is_supported` does not accept it until the withdrawal and re-file instructions ship, so a withdrawn filing written by a later binary is refused with `UnsupportedVersion`. New fields: `paid_amount`, `paid_at`, `payments_account`, `pix_e2e_hash`, `settled_at` and the carve `approved_amount` (decision 6). `pay_claim` records the payment on the filing and drops the `payout`, `payer` and `system_program` accounts; its arguments (`leg`, `amount`, `notice_ref_hash`) stay until the interface PR. A second payment of the same notice fails because the filing is no longer `FILED` (`ClaimNotFiled`). `settle_payout` writes the filing: it requires `PAID` and refuses `SETTLED` with `PayoutAlreadySettled` and any other status with the new error `ClaimNotPaid`. The `"payout"` seed is retired.
- **`HolderState` (A9).** Removed, with both `init_if_needed` sites (`request_deposit`, `claim_shares`). The phase-2 holding period needs a per-wallet stamp; that returns with phase 2. A later rule that needs to know whether a wallet holds shares (exit stays open for de-listed holders) reads the share balance instead. The `"holder"` seed is retired.
- **Take on issuer income (A10; amends ADR 0017).** `income_take_bps` and `income_take_total` are removed: all issuer income builds the reserve. `ConfigUpdated` id 17 is retired. `sweep_income` no longer takes the `treasury_account` account (dropped with the interface changes of ADRs 0020–0026). `IncomeSwept` carries `amount` and `inbox_after` (no `gross`, `take`, `net`). A take, if MUTAV ever decides one (spec §12 Q47), returns as a carve.
- **Dead errors, events and fields (A11).** Removed errors no instruction can raise: `StalePrice`, `PriceDeviation`, `AdapterNotWhitelisted`, `AdapterCapExceeded`, `SettlementFloorBreached`, `WorsensCoverage`, `ClaimNoticePending`, `NoticeNotResolved` (and `AgencyCapExceeded`, decision 3). Removed events no instruction emits: `AdapterWhitelisted`, `AdapterRemoved`, `ClaimNoticeFlagged`, `ClaimNoticeClosed`, `Allocated`, `Deallocated`. Removed event fields that were always constant: `StateRefreshed.buffer_earmark`, `free_capital`, `tesouro_price`, `price_stale`; `RedeemFilled.shares_remaining`, `partial`; `RedeemsFulfilled.head_partial`; `RedeemCancelled.assets_claimable`; `AssetsClaimed.closed`. **Error codes are renumbered now** (they follow enum order); from the devnet deploy the list is append-only, and each later feature appends its own errors.
- **Partial-fill fields and the claim-notice counter (A12; amends ADR 0010).** `caps.min_fill_assets` (id 109, retired), the partial-fill request fields and `VaultState.pending_notices` with its inert checks in `fulfil_deposits` and `fulfil_redeems` are removed. `RedeemRequest` is now `shares`, `assets_out`, `nav_at_fill`, `requested_at`, `filled_at`, `status` (`PENDING = 0`, `FILLED = 1`). The pilot fills whole requests only (the first head that does not fit stops the batch); `claim_assets` and `cancel_redeem` close the request. ADR 0010 partial fills return in the first post-hackathon upgrade: `shares_filled` is carved now and written on every whole fill (decision 6), and the rest (18 bytes: `assets_claimed`, `fill_count`, `last_fill_at`) is carved then, with the remainder `shares − shares_filled` derived, never stored, and the claim-notice counter (4 bytes) with the notice instructions, before outside capital.
- **`FeeReceipt` folded into `IncomeReceipt` (A13).** One receipt type for every booked inflow, told apart by `kind`: `ISSUER_STATEMENT = 0`, `FEE = 1`, `UNSOLICITED = 2`, `BACKSTOP = 3` (the last two reserved for later instructions; `is_supported` accepts only 0 and 1). The reference field is `ref_hash`. The separate seed prefixes stay, `["fee", config, invoice_ref_hash]` and `["income", config, income_ref_hash]`, so an invoice and a statement can never collide.

**Zero means unset for the ADR 0012 carves.** When the ADR 0012 lifecycle is carved, `ClaimFiling.category = 0` and every zero hash or timestamp in the `Guarantee` carve mean "unset / legacy": a filing or guarantee created before that upgrade. The upgrade must read them that way (R3), never as a real category or date; `CAT_UNSPECIFIED = 0` already is never accepted by `file_claim`.

### 5. A sliding 31-day claim window

`caps.claim_period_secs`, `VaultState.claim_period_start` and `claim_period_paid` are replaced by a ring of 31 UTC daily buckets in `VaultState`: `claim_day_buckets: [u64; 31]` (indexed by `day % 31`, `day = unix_ts / 86_400`) and `claim_day_anchor: i64` (the day the ring was last rolled to). `pay_claim` enforces it in this PR: it rolls the ring to today (clearing the buckets of days that left the window; a clock step back keeps the anchor, so no bucket is reused early), requires **the payments of the last 31 days, this one included, ≤ `max_claim_per_period`**, and adds the payment to today's bucket. `max_claim_per_period` keeps its name and now means "per 31-day window"; id 105 (`claim_period_secs`) is retired.

The old fields are fully replaced, not kept beside the new ones. Unlike the former tumbling window, which allowed up to twice the cap across a boundary, **the payments of any 31 consecutive UTC days stay within the cap**, and so do those of any 30 × 24 h span (it touches at most 31 UTC days; a 31 × 24 h span can touch 32). A payment made while the clock reads earlier than the anchor is booked on the anchor's day, so it leaves the window 31 days after that day. A property test checks the ring against a naive `(day, amount)` oracle, with gaps of 31 days or more and clock steps back.

### 6. Carved fields

Each carved field reads zero as the pilot behaviour (off, unset, none). The role, guardian and caps carves are written by the interface instructions of ADRs 0020 and 0026 (`propose_role`, `accept_role`, `propose_admin`, `accept_admin`, `cancel_pending`, `set_guardians`, `revoke_operator`, `revoke_pauser`, `initialize` and `set_config`); the rules that read `stress_buffer`, `max_queue_wait_secs`, `max_reinstate_age` and `approved_amount` come later:

| Field | Account | For | Built in |
|---|---|---|---|
| `pending_admin`, `pending_admin_expires_at` | `VaultConfig` | Two-step admin handover with its own expiry | PR 2 |
| `pending_operator`, `pending_operator_expires_at`, `pending_pauser`, `pending_pauser_expires_at` | `VaultConfig` | Two-step operator and pauser handover, per-role expiry (72 h); `revoke_operator` clears the pending operator key, `revoke_pauser` the pending pauser key | PR 2 |
| `guardians: [Pubkey; 3]` | `VaultConfig` | Pause-only guardians, set in one step by the admin (default and current role keys refused) | PR 2 |
| `adapter_count`, `adapter_bitmap` | `VaultConfig` | Whitelisted adapters, each described by its `AdapterState` PDA | With adapters, later |
| `stress_buffer` | `Caps` | R$ stress term of `coverage_required` (claims that could be filed next) | PR 3 |
| `max_queue_wait_secs` | `Caps` | Exit fallback: after this wait anyone may fill the head redemption under the same rules | Before outside capital |
| `max_reinstate_age` | `Caps` | How long after closing a guarantee may be reinstated (30 days on devnet) | Wave 2 (`reinstate_guarantee`) |
| `approved_amount` | `ClaimFiling` | The amount the reserve admin approved for a claim above `max_claim_per_call` | Wave 2 (`approve_claim`) |

One carve is written from day one: **`RedeemRequest.shares_filled: u64`** (8 bytes, from the front of `_reserved`). It is `0` while the request is pending and `shares` after the whole fill, and the remainder is derived, `shares − shares_filled`. So when ADR 0010 partial fills ship, every live request already reads correctly (a pending one with every share remaining, a filled one with none) without a patch rule, and no stored remainder can disagree with `shares`. Partial fills then only add `assets_claimed`, `fill_count` and `last_fill_at`.

The `"unsolicited"` token account is created by `initialize` (ADR 0024); the instructions that move money in and out of it come later. The unsolicited dust threshold is an off-chain setting (runbook and app), not a carve.

### 9. Carves added with the interface changes (before the freeze)

Added in the same pre-freeze window as the interface changes of ADRs 0020–0026, each zero for "off" or "unset":

| Field | Account | For | Written by |
|---|---|---|---|
| `close_reason: u8` | `Guarantee` | `CLOSE_RELEASED = 1` or `CLOSE_VOID = 2`; `0` while active | `close_guarantee` |
| `deposited_assets_total`, `minted_shares_total`, `redeemed_shares_total`, `redeemed_assets_total` (`u64`) | `VaultState` | Lifetime capital counters for the transparency page and reconciliation | `fulfil_deposits`, `fulfil_redeems` |
| `disabled_ops: u8` | `VaultConfig` | Capital-flow directions stopped one by one, separate from `paused` | Nothing yet |
| `kyc_attester`, `attestation_program` (`Pubkey`), `required_attestation_type: [u8; 32]`, `attester_epoch: u32` | `VaultConfig` | KYC attestations of investors, an `Eligibility` variant appended later (ADR 0023) | Nothing yet |
| `min_shares_out: u64` | `DepositRequest` | The owner's price limit (ADR 0023) | `request_deposit` |
| `min_assets_out: u64` | `RedeemRequest` | The owner's price limit, after `shares_filled` | `request_redeem` |

`ConfigUpdated` ids added for the written carves: 18 `pending_admin`, 19 `pending_operator`, 20 `pending_pauser`, 21–23 `guardians[0..3]`, 110 `caps.stress_buffer`, 111 `caps.max_queue_wait_secs`, 112 `caps.max_reinstate_age`; `admin` (1) becomes mutable through `accept_admin`. The pending keys' expiry times are bookkeeping announced by `RoleProposed` and have no id.

### 7. Retired seeds and ids are never reused

`RETIRED_SEEDS = ["agency", "payout", "holder"]` and `RETIRED_FIELD_IDS` (13, 17, 102, 105, 106, 109, 200–205, 300–319) are guarded by unit tests: no pilot seed may equal or prefix a retired or reserved seed, and no `ConfigUpdated` field may take a retired id. A stale client can therefore never address a new account, or misread a new field, through an old seed or id.

### 8. Data minimization: no personal data on-chain

Only the guarantee financial data the reserve maths needs goes on-chain: covers, amounts paid and provisioned, statuses and timestamps. Personal and commercial data stays with the operator platform.

- **Removed:** `Guarantee.rent`, `default_multiplier_bps` and `exit_multiplier_bps`. They were display-only, never used in maths, and the rent is commercial data about a private lease. They leave `register_guarantee`'s arguments, `GuaranteeRegistered` (`rent`) and the rule `rent > 0`; their 12 bytes return to `Guarantee._reserved` (204). The covers stay: they are the valor afiançado the reserve backs.
- **`Guarantee.id`** is an opaque random id assigned by the operator platform, never a contract number, lease reference or anything derived from personal data.
- **`Guarantee.agency_id`** is an opaque per-agency id assigned by the operator platform, never a CNPJ, a name or a hash of either. The mapping to the agency stays with the operator; per-agency figures on public pages are shown by that opaque id unless the agency agrees to be named.
- **`refs_hash`, `notice_ref_hash`, `pix_e2e_hash`** (and the ADR 0012 hashes when they ship) are salted or keyed hashes, domain-separated per field, whose salts and keys stay with the operator. A party given the document and its salt can verify the commitment; nobody can confirm a guessed lease, notice or PIX id without it.

The program cannot check any of this: it is an operator obligation, stated here and in the spec (§3.5) so that the platform and the audit hold the operator to it.

## Consequences

- **A smaller audited surface.** `VaultConfig` shrinks from 2,756 to 1,181 bytes; four account types, eight errors, six events and nine event fields leave the program, the client and the app. Every remaining field is read by this binary or is a documented zero carve.
- **Later features cost a carve, not a migration.** Phase 2, partial fills, the ADR 0012 lifecycle and settlement fields, the claim-notice counter, the stress buffer, role handover, guardians, reinstatement and claim approval all fit the frozen padding; the layout test proves it.
- **Upgrades re-add instructions and errors.** Each later feature appends its own errors and events (§14.4). Codes and ids removed here are gone; they are never reused.
- **The reserve makes one claim promise.** Settlement speed is MUTAV's operational commitment, measured by the platform and shown on the transparency page from `ClaimPaid` and `PayoutSettled`; the program no longer flags late payouts.
- **Per-agency exposure is off-chain.** The app and indexer derive it from `Guarantee.agency_id`. Nothing on-chain limits concentration in one agency; the per-guarantee cap and `max_tvl` bound it for the pilot.
- **No allocation guard in the binary.** With no adapter instructions there is nothing to guard. The settlement floor, per-adapter limits and price checks of ADR 0018 come back in the adapter upgrade, which must re-add them before any `allocate`.
- **A strict claim cap.** A compromised operator can take at most `max_claim_per_period` in any 31 consecutive UTC days (any 30 × 24 h span) (plus nothing above `max_claim_per_call` per call), against up to twice that before. The ring costs 256 bytes of `VaultState` and one bucket write per payment.
- **Docs, client, scripts and app follow.** The spec (§3–§10, §13, §14) is updated in the same PR; the Codama client and the devnet scripts follow in this PR; the pilot app follows separately (no late payouts, no agency exposure, no settlement-floor control).
