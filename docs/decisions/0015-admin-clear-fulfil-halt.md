# 0015 — Admin clear for the NAV-move halt

- **Status:** Proposed (2026-10-06), pending founder confirmation (Julia, Draau). Resolves the clearing path left TBD in spec §5.8 step 3.

## Context

`refresh` runs the NAV-move guard (spec §7): when NAV per share moves more than `price.max_nav_move_bps` since the last published NAV, it sets `VaultState.fulfil_halted`, and `fulfil_deposits` and `fulfil_redeems` refuse with `FulfilHalted`. Spec §5.8 step 3 said the flag is "cleared by admin `set_config`, TBD exact clearing path". Until now nothing cleared it, so the pilot failed closed: one tripped guard stopped both queues for good.

The guard also needs a baseline after a halt. If clearing only dropped the flag, the next `refresh` would compare against the NAV published at the halt. A move the admin has already reviewed could trip it again, or, after an intermediate refresh, the reviewed move would never be compared at all.

## Decision

A dedicated admin instruction, `clear_fulfil_halt()`:

- **Signer:** admin (the Squads multisig, under its time lock). **Accounts:** `config`, `state`.
- **Rules:** `fulfil_halted == true`, otherwise `InvalidParameter`: the baseline cannot be moved without a halt to clear. The price rule is the same as `refresh`'s (a TESOURO position needs a fresh price; until TESOURO pricing exists it fails closed with `StalePrice`).
- **Effects:** `fulfil_halted = false`; `nav_per_share` (the guard's baseline) is set to the published NAV of now (`0` with no shares outstanding, otherwise `nav_per_share` floored at `1`, spec §7). Nothing else changes: `mode`, `stable_assets` and the other published values are left to the next `refresh`.
- **Event:** `FulfilHaltCleared { nav_per_share }`, the new baseline.
- It is never paused (it only re-opens a guard; `pause` still stops fills on its own).

`set_config` stays a pure `VaultConfig` update. It has no `state` account and emits only `ConfigUpdated` for config fields.

## Alternatives considered

- **A `clear_fulfil_halt: bool` in `SetConfigArgs`** (the spec's original wording). It would add the `state` account and a non-config flag to `set_config`, and every clear would have to restate the whole config through the time lock, with the risk of changing an unrelated parameter by accident. Rejected in favour of the small-instruction style of `set_roles`, `set_payments_account` and `set_allowlist_root`.
- **Auto-clear** after a number of quiet refreshes or a fixed time. It needs a TBD policy, and a manipulated NAV could wait it out. Rejected: the guard exists to force a human review.
- **Clear without a baseline reset.** The next `refresh` could re-trip on the reviewed move, or miss it after an intermediate refresh. Rejected.

## Consequences

- One reviewed admin action re-opens the queues after a halt. The admin cannot silence a future move, because the instruction only works while halted and the baseline is the NAV of now.
- A new instruction, event and client builder (IDL change, client regenerated). No layout change.
- The time lock delays re-opening fills. That is acceptable: while halted, claims, fees and cancels still work, and only the queues wait.
