# 0023 — Capital flows and exit rights

- **Status:** Accepted (2026-10-10), decided by the founders. Amends ADR 0008 (who may cancel a deposit; exit for holders), ADR 0010 (whole fills in the pilot), ADR 0015 and ADR 0017 (the NAV-move guard also runs inline in fills) and resolves spec §12 Q27. Builds on ADR 0020 (pause scope) and ADR 0022 (`ReserveUnderwater`).

## Context

Capital enters and leaves the reserve through two FIFO queues: deposits are requested by investors and filled by the admin; redemptions likewise (ADR 0008). The founders set these goals for the devnet release:

- **Every fill gives value for value.** A deposit fill always mints shares, and the reserve is never valued by an empty share supply.
- **A fill is priced inside a range the admin agreed to.** The admin composes a fill proposal at one NAV and it executes later, after the time lock. The fill should run only if NAV is still near the proposed value, and never across a NAV move the guard would halt.
- **Exit is a right.** A wallet that holds shares can always ask to leave, even after it leaves the allowlist, and even for a balance below the minimum request.
- **One request never holds the queue.** A head request that can no longer be filled in full value is still resolved.
- **No stuck money.** A pending deposit can always go back to its owner.

## Decision

### 1. Fills

- `fulfil_deposits` refuses a fill that would mint **0 shares**.
- **Inflows wait for the first shares.** `contribute_fees`, `sweep_income` and `book_unsolicited` (ADR 0024) are refused while `shares_outstanding == 0`. Fees wait with the operator and income waits in the inbox until the first deposit is filled.
- **The NAV-move guard runs inline** in `fulfil_deposits` and `fulfil_redeems`, with the same rule as `refresh` (inflows counted per share, ADR 0017). A move beyond `max_nav_move_bps` refuses with `FulfilHalted`.
- **`nav_bounds (min, max)`** is a new argument of `fulfil_deposits` and `fulfil_redeems`. `/admin` composes it at proposal time around the NAV it shows. A fill at a NAV outside the bounds refuses with `NavOutOfBounds`.
- `fulfil_deposits` takes `count` between 1 and 8. Each fill emits `DepositFilled`, and a head that moves with no fill emits an event too.
- Devnet keeps `max_nav_move_bps = 10_000` for the demo; LiteSVM tests prove the guard. The real pilot lowers it.

### 2. Exit open to holders

- `request_redeem` does **not** check the allowlist when the wallet already holds shares. Entry is gated; exit is not.
- **A full exit below `min_request`** is allowed: when `shares` equals the owner's balance in the **canonical share associated token account**, `min_request` is skipped. The value must still be above 0 at request time. Partial exits and deposits keep `min_request`.
- **A 0-value head fills as 0 assets.** If the head redemption is worth 0 at fill time, `fulfil_redeems` burns its shares and closes the request with a 0-asset fill.
- `request_redeem` stays pause-gated (ADR 0020). `cancel_redeem` and `claim_assets` stay open.

### 3. Cancelling deposits

- `cancel_deposit` may be signed by the **owner or the admin**.
- The BRS and the request's rent go to the owner's associated token account for `reserve_mint`, created idempotently with the signer as payer. The owner account is not a signer when the admin cancels; it is bound to the address stored in the request.
- The instruction checks the config and mint seeds, is not pause-gated and emits an event that names who signed (`by`).
- This removes a de-listed or unreachable investor's deposit from the head of the queue. If the owner's token account is frozen by the issuer, the cancel cannot complete; the runbook covers that case.

### 4. Whole fills in the pilot

- Fills are whole. A head request larger than free capital waits. Request sizes on devnet stay below expected free capital (R$1k to R$100k), and `/operator` and `/admin` show what a stuck head needs against what is available.
- Partial fills (ADR 0010) come in the first upgrade after the hackathon. When they do, any fee or rounding is computed **once per request**, not per fill.

### 5. Sequence seeds and owner accounts

- Request PDAs keep the global sequence seeds. A client whose `seq` was taken by a concurrent request retries with the next one. A test covers the retry. This resolves spec §12 Q27.
- `cancel_deposit`, `cancel_redeem`, `claim_shares` and `claim_assets` create the owner's associated token account idempotently, with the caller paying rent.

### 6. Price limits and eligibility (added before the freeze)

- `request_deposit(assets, min_shares_out, eligibility)` and `request_redeem(shares, min_assets_out, eligibility)`. The limit is the fewest shares, or the least BRS, the owner accepts; `0` means no limit. It is stored in the request.
- At a fill, a request whose limit is not met **stops the batch at that request**: it is neither filled nor skipped. A batch that fills nothing fails with `PriceLimitNotMet`; after earlier fills it succeeds up to that request. The owner (or, for a deposit, the admin through `cancel_deposit`) cancels it, or it fills once the price recovers. A limit is never a maximum.
- `eligibility` is an append-only enum. Variant 0, `Merkle { proof }`, is today's allowlist proof. An attestation variant (the attester block carved in `VaultConfig`, ADR 0019) is appended when it is built. Until the exit-open rule of decision 2 lands, holders also pass a Merkle proof; afterwards a holder redeems with an empty one.
- `clear_fulfil_halt(nav_bounds)` takes the same bounds as the fills: the new baseline must lie within the range the admin reviewed.
- The first `adapter_count` remaining accounts of `refresh` and both fills are the `AdapterState` PDAs, in bitmap order, then the request PDAs. With `adapter_count == 0` nothing changes; a binary that values no adapter refuses a reserve with adapters (`FeatureNotSupported`).

## Alternatives considered

- **Price the first deposit 1:1 when supply is 0.** Lets income booked before any share reach the first depositor. Rejected for refusing inflows until shares exist.
- **The guard in `refresh` only.** One place to evaluate it, but a fill would rely on the last `refresh`. Rejected: every fill is checked at the NAV it uses.
- **No price range on fills.** The admin approves a fill without knowing the NAV at which it will run. Rejected for `nav_bounds`, which also covers moves too small for the guard.
- **Keep the allowlist on exits.** A de-listed holder could not leave. Rejected.
- **A per-holder account (`HolderState`) to record who holds shares.** Removed (ADR 0026); the share balance answers the question.
- **An admin-only `refund_deposit`.** A second instruction for what `cancel_deposit` already does. Rejected for one instruction with two signers.
- **Partial fills now.** The fields exist, but the logic needs its own review. Deferred.
- **Owner-and-nonce seeds for requests** (spec §12 Q27 alternative). Changes the seeds for a rare race. Rejected for client retry.

## Consequences

- **Positive.** A fill cannot mint nothing, cannot run across a halted move and cannot run outside the admin's range. Every holder can leave. Every pending deposit can be returned.
- **Negative.** Fill proposals carry a NAV range and fail if NAV moves out of it before execution; the admin then proposes again. Whole fills can leave a large head waiting.
- **Neutral.** Fees and income booked before the first fill wait outside the reserve.
- **Program changes.** `fulfil_deposits` and `fulfil_redeems` gain `nav_bounds`. `cancel_deposit` accepts the admin as signer. Owner token accounts are created idempotently in cancel and claim instructions. New errors `NavOutOfBounds` and the zero-share refusal. New events `DepositFilled` and the head-moved event. `HolderState` is removed (ADR 0019).
- **Spec.** §5.5, §5.8, §7, §12 Q27 closed, and the whole-fill deviation from ADR 0010.
- **App.** `/admin` composes `nav_bounds` for fill proposals. `/investor` adds "redeem all". `/operator` and `/admin` explain a stuck head.

## References

- Spec §5.5, §5.8, §7, §12 Q27.
- ADRs 0008, 0010, 0015, 0017, 0019, 0020, 0022, 0024, 0026.
- OtterSec audit of OnRe (Aug 2026), SUG-00 (zero output) and SUG-03 (per-fill rounding).
- OWASP Smart Contract Top 10 (2026 edition), SC02 and SC03.
