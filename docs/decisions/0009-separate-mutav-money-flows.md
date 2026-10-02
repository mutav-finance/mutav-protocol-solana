# 0009 — Guarantee fees, MUTAV operation and MUTAV's reserve share are separate flows

- **Status:** accepted (2026-10-01). Amends ADR 0008 (pause scope).

## Context

MUTAV interacts with the program as fee collector, as an operating company and as a capital provider. If these blur, three things can go wrong:
- guarantee fees could be mistaken for MUTAV capital;
- MUTAV could gain shares it did not pay for;
- fees could fail to reach the reserve.

## Decision

1. **Guarantee fees → reserve.**
   - `contribute_fees` moves each contract's net guarantee fee into `reserve`, raising NAV for all holders pro rata. It **never mints shares**.
   - Each invoice is recorded exactly once through a `FeeReceipt` PDA seeded by `invoice_ref_hash`, which mutav-app reconciles against its invoices.
   - Fees are accepted **during pause and under-coverage**, because fees only strengthen the reserve.
2. **MUTAV operation.** MUTAV's take (`fee_take_bps`) is transferred in the same instruction directly to `treasury_account` (ADR 0007). It is never reserve, NAV or capital.
3. **MUTAV's share of the reserve.** MUTAV acquires and exits its share only through `request_deposit` / `request_redeem` from its allowlisted capital wallet, at NAV, under the same FIFO and surplus rules as every investor (ADR 0008).
4. **Separate accounts.** `treasury_account` ≠ `payments_account`, enforced in `set_config`. MUTAV's capital wallet is a separate, ordinary investor wallet.

## Consequences

- **Every BRS in the reserve has a traceable source:** a net guarantee fee (`FeeReceipt`) or a capital deposit (`DepositRequest`).
- **MUTAV's economic interest is visible on-chain** as three separate numbers: operating revenue (the treasury take), its share position, and its exposure as payer of claims.
- **Pause no longer blocks fees.** This amends ADR 0008.
