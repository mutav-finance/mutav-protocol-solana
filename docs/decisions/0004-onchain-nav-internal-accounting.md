# 0004 — NAV computed on-chain with internal accounting, provisions at filing and bounded prices

- **Status:** Accepted
- **Date:** 2026-10-01

## Context

The reserve's value must be verifiable by anyone. Raw token balances can be inflated by direct transfers (donation attacks), a claim known to the platform could let an informed investor exit before the loss lands, and TESOURO's price comes from an issuer-published account that could be wrong, stale or manipulated.

## Decision

- **NAV is computed on-chain** by the program (`refresh` and every gated instruction), not pushed by an admin.
- **Internal accounting:** the program tracks the BRS and TESOURO amounts it moved itself. Direct transfers into reserve accounts do not change NAV.
- **Provision at filing:** `file_claim` books a provision immediately, so NAV reflects an approved claim before it is paid. The provision reduces NAV only, never the `stable_assets` used for coverage (the claim is already inside the remaining cover).
- **Bounded prices:** BRS at par; TESOURO at `min(on-chain price, accrual curve)`, with staleness and deviation bounds. A NAV move above a threshold in one refresh halts deposit and redemption fulfilment.
- Pending deposits, assets owed on fulfilled redemptions, and MUTAV's fee take are excluded from the reserve.

## Consequences

- Anyone can recompute NAV, coverage and free capital from public state.
- Donation and first-depositor inflation attacks don't move NAV (with a virtual share offset).
- Investors can't front-run a known claim, because the loss is booked at filing.
- Reliance on Etherfuse's price account remains a disclosed trust assumption; its layout is still to be confirmed.
- The exact provision formula, the bound values and the NAV-move threshold are open (see spec §12).
