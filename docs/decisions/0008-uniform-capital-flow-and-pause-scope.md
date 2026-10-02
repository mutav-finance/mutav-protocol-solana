# 0008 — One capital flow for everyone; FIFO deposits; pause never blocks claims

- **Status:** accepted (2026-10-01)

## Context

The first spec draft gave MUTAV its own capital instructions, `contribute_capital` and `withdraw_surplus`. Their share treatment and destination were undefined. Three other rules were also left open:
- the order in which deposits are fulfilled;
- the scope of `pause`;
- whether deposits can be fulfilled in under-coverage.

## Decision

1. **MUTAV uses the same async deposit/redeem flow as investors.** Its wallet is allowlisted. It gets shares at the NAV at fulfil and redeems only from `free_capital`, in strict FIFO. `contribute_capital` and `withdraw_surplus` are removed.
2. **Deposits are fulfilled in strict FIFO**, the same as redemptions.
3. **`fulfil_deposits` is allowed in under-coverage mode.** New capital is the recapitalization path, and it is priced at a NAV that already reflects the loss.
4. **`pause` scope:**
   - **Stopped:** capital flows (`request_*`, `fulfil_*`), `register_guarantee` and `allocate`/`deallocate`. (`contribute_fees` was originally in this list; ADR 0009 moved it to stay open.)
   - **Stay open:** `contribute_fees` (per ADR 0009), `pay_claim`, `file_claim`, `settle_payout`, `close_guarantee`, `refresh`, and investors' `cancel_*`/`claim_*`. Claims are never blocked.

## Consequences

- **Smaller surface:** there are fewer instructions, and MUTAV can't move reserve capital outside the rules every investor follows.
- **MUTAV's capital is visible and comparable:** it is a share position like any other.
- **Recapitalizing takes a few steps:** after a loss, MUTAV (or an investor) requests a deposit and the admin fulfils it, all through the same flow.
- **A pause stays an emergency brake on capital, not on the guarantee itself.**
