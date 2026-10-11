# 0026 — Program simplification for the freeze

- **Status:** Accepted (2026-10-10), decided by the founders. Removes pilot-unused state described in ADR 0011 (phase-2 exit parameters and the buffer earmark), ADR 0017 (the income take) and ADR 0018 (inline adapter slots and the stored settlement-floor complement), and the `FeeReceipt` and `Payout` accounts. The designs stay; each returns later as a carve or a new account. Interface changes ship with ADR 0019's layout and the instructions of ADRs 0020 to 0024.

## Context

After the devnet deploy, v1 is frozen: account changes are carves from padding or new accounts, and existing instructions keep their arguments and account lists. Whatever the freeze carries, the program carries for its whole life. The founders want the frozen v1 to be:

- **small enough to audit**, holding only state the pilot uses;
- **safe to extend**: every later field reads zero as "off", and every later option is appended, never inserted;
- **within Solana's limits**: one transaction is at most 1,232 bytes, so instructions with many arguments must stay well under it;
- **clear about money**: instructions that touch money accounts, the allowlist or roles stay separate and explicit.

The plan was reviewed against Solana and Anchor guidance: Borsh enum evolution, Anchor's warning on `init_if_needed`, the sealevel-attacks catalogue, Neodyme's common pitfalls, OWASP Smart Contract Top 10 (2026) and OpenZeppelin's `AccessControlDefaultAdminRules`.

## Decision

### 1. A sparse `set_config`

- `set_config(params: Vec<ConfigParam>)`. `ConfigParam` is an enum with one variant per configurable field.
- **Variants are append-only.** Borsh encodes an enum by variant index, so a variant is never removed or reordered. The `idl-compat` CI check enforces it.
- **Duplicates are refused** with `DuplicateParam`. **At most 16** params per call, and at least one.
- A change of `coverage_ratio_bps`, `max_nav_move_bps` or `stress_buffer` needs a `refresh` in the same slot (`RefreshRequired`); `/admin` puts `refresh` first in the same transaction.
- The program applies the params to a copy and **validates the whole resulting config**: every bound of `validate_params`, the cross-field rules (for example `max_claim_per_period ≥ max_claim_per_call`), `feature_flags` fail-closed, and a recompute of `coverage_required`.
- One `ConfigUpdated` event per changed field.
- **Kept as separate instructions:** `set_payments_account`, a new `set_treasury_account` (both inspect the token account; neither may be owned by the operator), `set_allowlist_root`, and the role and guardian instructions (ADR 0020).

### 2. State removed from v1

| Removed | Returns as |
|---|---|
| Phase-2 `ExitParams` and the buffer earmark (`feature_flags` stays, fail-closed) | A carve; the padding test holds the 275 + 88 bytes it needs |
| Global TESOURO `PriceParams`, `tesouro_units`, `tesouro_price`, `tesouro_price_ts` (`max_nav_move_bps` stays) | The per-adapter `AdapterState` of ADR 0018 |
| The cached `stable_assets` | Nothing; it is computed at every gate |
| `HolderState` (both `init_if_needed` sites) | A new account if a holding period is needed; exit uses the share balance (ADR 0023) |
| `income_take_bps`, `income_take_total` and the treasury account in `sweep_income` | A carve when a take is decided (spec §12 Q47 stays 0) |
| Partial-fill request fields and `min_fill_assets` | Carves held by the padding test (ADR 0010) |
| `pending_notices` and its inert checks | The claim-notice gate (ADR 0025) |
| The settlement-floor field (`min_settlement_bps`) | Retired in v1: while the reserve holds BRS only, the floor is implicitly 100%. It returns as a carved field with the first adapter (ADR 0027) |
| Inline `adapters[8]` and `max_allocated_bps` | `adapter_count` and a bitmap carved at 0; adapter state in its own account |
| `FeeReceipt` | `IncomeReceipt` with `kind = FEE`, keeping the `"fee"` seed prefix (ADR 0024) |
| `Payout` | Fields on `ClaimFiling` (ADR 0021) |
| Dead errors, events and always-false fields | Renumbered now; append-only after the freeze |
| An on-chain dust threshold for unsolicited money | Nothing; R$10 is a runbook and app value (ADR 0024) |

### 3. Interface simplifications

- **One generic return:** `return_unsolicited` with a `Source` enum (`Unsolicited`, `PendingRedemptionsSurplus`, `Foreign`, `Lamports`; ADR 0024) replaces separate foreign-token, share-return and SOL-return instructions.
- **`advance_queue_head(queue: u8, max)`** advances one queue per call past closed requests, in place of a two-queue instruction.
- **`cancel_deposit`** is signed by the owner or the admin (ADR 0023), in place of a separate `refund_deposit`.
- **`amend_claim` and `refile_claim`** (ADR 0021) replace a separate `withdraw_claim`.
- **`propose_role` / `accept_role`** (ADR 0020) replace `set_roles`. Guardians are appointed by the admin in one step (ADR 0020), not through a handover.
- **Bounds in `validate_params`** include an upper cap on `c` of 10,000 bps (ADR 0022).
- No new `init_if_needed` on program state. Idempotent creation is kept only for associated token accounts.

## Alternatives considered

- **Keep every designed field in v1** so later features need no carve. Larger audit surface, more state that reads but never moves, and the same carve rules apply anyway. Rejected.
- **A full-struct `set_config`.** Every proposal must carry every field, and the transaction grows with the config. Rejected for sparse params.
- **One instruction per config field.** Many instructions with the same shape, and no single place to validate the whole config. Rejected.
- **Fold money accounts, the allowlist and roles into `set_config`.** Their checks differ (token-account inspection, two-step handover). Rejected; they stay separate.
- **Keep `HolderState` with `init_if_needed`.** Anchor warns that `init_if_needed` needs care against re-initialization, and the pilot needs no per-holder state. Rejected.

## Consequences

- **Positive.** A smaller v1 to audit and to freeze. Config proposals touch only the fields they change. Every later feature is a carve or a new account with zero meaning off.
- **Negative.** Features removed now need an upgrade to return. Their padding must stay reserved, which the layout test enforces.
- **Neutral.** The spec keeps the phase-2 and adapter designs as later work.
- **Program and client.** New `ConfigParam` enum and `DuplicateParam` error; `set_treasury_account`; `advance_queue_head`; the removed accounts, fields, errors and events; the Codama client is regenerated. `/admin` composes sparse `set_config` proposals and lists the edited fields in the proposal memo.
- **Spec.** §3, §5.1, §5.8, §8, §9, §10, §13 (marked as later work), §14.2.

## References

- Spec §3, §5.1, §13, §14.
- ADRs 0010, 0011, 0017, 0018, 0019, 0020, 0021, 0023, 0024, 0025.
- Borsh specification: enums are encoded by variant index (append-only evolution).
- Anchor documentation: the `init_if_needed` warning on re-initialization.
- `coral-xyz/sealevel-attacks` and Neodyme's common Solana pitfalls.
- OpenZeppelin `AccessControlDefaultAdminRules`.
- Solana transaction size limit of 1,232 bytes.
- OWASP Smart Contract Top 10 (2026 edition).
