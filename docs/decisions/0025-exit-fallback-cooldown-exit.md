# 0025 — Exit fallback: a cooldown exit after `max_queue_wait_secs`

- **Status:** Accepted (2026-10-10), decided by the founders. The field is carved now with value 0 (off); the instruction path is built together with the claim-notice gate, before any outside capital. Amends ADR 0008 (redemptions are filled by the admin) and ADR 0023. The layout carve is in ADR 0019.

## Context

Redemptions are filled only by the admin multisig (ADR 0008). That keeps fills priced and ordered under one accountable party. It also means a holder's exit depends on the admin acting. The founders want a holder's exit to stand on the program's rules alone, for two cases:

- the admin multisig is slow or unavailable for a long time;
- a program upgrade is scheduled that a holder does not accept. The upgrade time lock exists so that holders can leave first, and that only works if they can actually leave inside it.

Established practice pairs time-locked governance with an exit window: a request, a cooldown, then a completion anyone can run. Ethena's cooldown for staked USDe, Marinade's delayed-unstake tickets and Maker's Governance Security Module all follow this shape.

## Decision

1. **`max_queue_wait_secs`** is a `u64` in `Caps`, carved now. **Value 0 means off.** Devnet and the pilot ship with 0.
2. **Permissionless fill of the head.** When it is on and the head redemption has waited longer than `max_queue_wait_secs`, counted from the head request's own timestamp, **anyone** may fill that head request. The fill applies the same rules as an admin fill:
   - only out of free capital, and only the head, in FIFO order;
   - the program's NAV-move guard and the halt. A permissionless fill takes no `nav_bounds` from the caller; it relies on the program's guard;
   - the claim-notice gate;
   - the pause.
3. **The upgrade time lock is at least the wait.** The upgrade multisig's time lock must be ≥ `max_queue_wait_secs`, so a holder who requests at the start of an upgrade's time lock can be filled before it executes. Real pilot: 7 days and 7 days.
4. **Built with the claim-notice gate.** The notice gate stops a fill while a known claim is not yet filed. A permissionless fill must not run without it, so both are built together, after the hackathon and before outside capital (spec §12, Q-4 of the review).

## Alternatives considered

- **Admin fills only.** Simple, and fine while MUTAV is the only depositor. It gives outside holders no exit that does not depend on the admin. Kept for the pilot, replaced before outside capital.
- **An instant exit at a haircut** (ADR 0011). It is a priced exit with its own buffer, not a guarantee of exit. It stays a separate phase-2 design.
- **A pause on upgrades instead of an exit window.** It protects holders only from upgrades, not from an absent admin. Rejected.
- **Build it now.** Without the notice gate, a permissionless fill could run while a claim is known but not yet filed. Rejected; the field is carved now so the path needs no migration.

## Consequences

- **Positive.** Before outside capital, every holder has a path out that rests on program rules and a time limit, and every upgrade gives holders time to use it.
- **Negative.** The upgrade time lock cannot be shorter than the wait, so urgent upgrades are slower. A permissionless fill runs at the NAV of the moment it executes.
- **Neutral.** No change on devnet or in the pilot while the value is 0.
- **Program changes.** Now: the `Caps.max_queue_wait_secs` carve (ADR 0019). Later: the fallback path in `fulfil_redeems` or a new instruction, and the claim-notice gate. A permissionless fill relies on the program's NAV-move guard, not on caller-supplied `nav_bounds` (ADR 0023).
- **Ops.** The deploy scripts check that the upgrade time lock is ≥ `max_queue_wait_secs` once it is non-zero.
- **Spec.** §5.5, §8, §12 Q15, §14.5.

## References

- Spec §5.5, §8, §14.5.
- ADRs 0008, 0011, 0019, 0020, 0023.
- Ethena: cooldown for unstaking sUSDe.
- Marinade: delayed-unstake tickets.
- Maker: Governance Security Module (GSM) delay.
