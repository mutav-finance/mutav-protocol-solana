# 0005 — Solvency gate scope: capital flows and new guarantees, never claim payments

- **Status:** Accepted
- **Date:** 2026-10-01

## Context

MUTAV's promise to agencies and landlords is that claims are paid. A gate that could stop a claim payment when the reserve is short would break that promise exactly when it matters. At the same time, capital must not leave, and new liability must not be taken on, while the reserve cannot cover the guarantees already registered.

## Decision

- Solvency rule: `stable_assets ≥ coverage_required`, where `coverage_required = c × Σ remaining cover of active guarantees` and `c` starts at 1.0.
- **Gated on `free_capital` and normal mode:** `register_guarantee`, `fulfil_redeems`, `withdraw_surplus`, `allocate`, `deallocate`.
- **Never solvency-gated:** `pay_claim`. It is bounded only by the guarantee's remaining cover on the leg and by the payment caps. A property test asserts that a payment is never refused for solvency.
- **Under-coverage mode:** when `stable_assets < coverage_required`, new guarantees, redemptions, surplus withdrawals and allocations freeze automatically; claim payments continue; admins are alerted by event.
- In under-coverage, `deallocate` is allowed only if it does not worsen coverage, so moving TESOURO into BRS remains possible.
- MUTAV's own funds, held outside the reserve, stand behind the reserve for its liability as fiador.

## Consequences

- The reserve can be drawn below its coverage target by claim payments. That is by design; the backstop and under-coverage mode handle it.
- Investors cannot exit from an under-covered reserve, and no new liability is added to it.
- Whether deposit fulfilment stays open in under-coverage is still open (spec §12).
