# 0006 — Per-lease coverage stored as absolute amounts

- **Status:** Accepted
- **Date:** 2026-10-01

## Context

Coverage varies per lease. The reference product is 3× rent of default cover plus 6× rent of exit cover, but platform products allow other terms, and product multipliers and pricing live in the MUTAV platform. The solvency gate needs the exact liability of every guarantee, and a claim's amount depends on the situation (one rent, several rents, exit costs).

## Decision

- Each `Guarantee` stores **`default_cover` and `exit_cover` as absolute `u64` amounts** in BRS base units, set at registration, plus `default_paid` and `exit_paid`.
- Multipliers are stored for display only and are never used in the program's maths.
- `coverage_required` sums each guarantee's own remaining legs.
- A claim payment may be any amount up to the remaining cover on its leg, within the payment caps.
- Per-guarantee and per-agency caps bound the absolute amounts.

## Consequences

- The platform can offer different products without a program change.
- The program never needs to know rent indexation or pricing rules; a rent change that should raise cover requires an explicit operator action (not yet specified).
- Liability is exactly recomputable from public state.
- Pricing rules for non-standard products remain a platform decision, still open.
