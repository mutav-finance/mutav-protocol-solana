# 0022 — Coverage: stress buffer and underwater reserve

- **Status:** Accepted (2026-10-10), decided by the founders. Amends ADR 0016: the `coverage_required` formula gains a stress-buffer term (`c` stays 0.10), and the devnet caps lose the per-agency row, per ADR 0019. Uses the receipt kinds of ADR 0024.

## Context

ADR 0016 sized the reserve as `max(ceil(c × remaining_cover_total / 10_000), provisions)` with `c ≥ 0.10`. At `c = 0.10` the reserve backs a tenth of the cover on the book, which is the business choice of expected-loss sizing.

Claims under a fiança arrive as **events**, not as whole covers at once:

- a default claim is usually one month's rent;
- an exit claim is one payment at the end of a lease.

So the near-term demand on the reserve is the set of claims that could be filed next, not the full remaining cover. The founders want three things from the sizing rule:

- capital set aside for the next likely claims, on top of the claims already filed, while the book is small and `c × cover` is thin;
- an amount the admin can size in reais from the portfolio and change with `set_config`;
- a clear rule for a reserve whose net assets reach zero while shares are outstanding, and a clean way for MUTAV to recapitalize it without diluting holders.

The claim-payment path must keep its guarantee: it is never refused for solvency (ADR 0005).

## Decision

### 1. The formula

```text
unprovisioned     = remaining_cover_total − provisions
coverage_required = max( ceil(c × remaining_cover_total / 10_000),
                         provisions + min(stress_buffer, unprovisioned) )
```

- `stress_buffer` is a `u64` in reais (BRS units), carved in `Caps` (ADR 0019) and set by the admin through `set_config`.
- The `min` keeps the term from asking for more than the book could ever claim.
- The formula applies wherever `coverage_required` is used: the `register_guarantee` gate, `refresh`, `fulfil_redeems` and the recompute after `file_claim`, `amend_claim`, `pay_claim`, `close_guarantee` and `reinstate_guarantee`.
- It gates new guarantees and redemptions. It never gates a claim payment.

### 2. Sizing the buffer

- The admin sizes `stress_buffer` from the portfolio's claim events: for example the three largest monthly rents (default claims) plus one exit payment.
- **Devnet value: R$19k.** It is resized with `set_config` as the book changes.
- `c` stays **0.10** (ADR 0016).

### 3. Never failing the claim path

- On the `pay_claim` path, the stress term and the cached `coverage_required` write **saturate** instead of failing on overflow. A claim payment can lower free capital and move the reserve into under-coverage; it is never refused for it (ADR 0016 decision 3).
- `validate_params` bounds `stress_buffer` and caps `c` at **10,000 bps** (1.0), so `c` lies in `[1_000, 10_000]` and the gates' arithmetic stays within range.

### 4. An underwater reserve

- When net assets are 0 while shares are outstanding, `fulfil_deposits` refuses with **`ReserveUnderwater`**. A new depositor never pays for losses that happened before the deposit.
- Redemptions are already held by the solvency gate in this state.
- **Recovery is a MUTAV backstop.** MUTAV sends BRS, and the admin books it into the reserve with receipt kind **`BACKSTOP`** (ADR 0024). No shares are minted, so the backstop restores NAV for existing holders. It counts as an inflow for the NAV-move guard (ADR 0017 decision 4, ADR 0023).
- Booking is refused while the share supply is 0 (ADR 0023).

### 5. Devnet caps after this ADR

ADR 0016 decision 4 stands, except:

- `max_cover_per_agency` is removed with the `AgencyExposure` account (ADR 0019). A future concentration limit returns as a new account (PC-43).
- `stress_buffer` = R$19k is added.

## Alternatives considered

- **Raise `c`** to make room for the next claims. It scales with the whole book and stops growth long before the next claims need it. Rejected; `c` stays at the 0.10 floor.
- **A tail floor per lease** (`tail_floor × active leases`, ADR 0016 decision 5). Needs inputs that are still open. Deferred.
- **Count the full remaining cover of the riskiest leases.** Overstates demand, because claims arrive one event at a time. Rejected for an admin-sized amount in reais.
- **Price deposits 1:1 when NAV is 0**, or a named `NavZero` error with recapitalization through `contribute_fees`. The first lets a depositor buy a reserve with filed claims at par; the second mixes a guarantee fee with MUTAV's capital. Rejected for `ReserveUnderwater` plus a `BACKSTOP` booking.
- **Mint shares for MUTAV's backstop.** It would dilute holders and turn a backstop into a deposit. Rejected.

## Consequences

- **Positive.** Filed claims plus the next likely claims are covered by capital even when `c × cover` is small. The admin can tune the buffer without an upgrade. An underwater reserve has a defined state and one recovery path.
- **Negative.** The buffer is a judgment the admin must keep current. A buffer set too low gives less protection; a buffer set too high slows new guarantees and exits.
- **Neutral.** At large book sizes `c × cover` dominates and the buffer has no effect.
- **Program changes.** New field `Caps.stress_buffer`, new error `ReserveUnderwater`, the formula in the shared coverage helper, saturating writes on the `pay_claim` path, new `validate_params` bounds.
- **Client and simulator.** The client's math mirror and its vectors follow the formula. The simulator follows too, with a parity test against the client. It keeps the "stable assets vs coverage required" view.
- **Spec.** §4 (formula, invariant 7), §6, §8 (remove `max_cover_per_agency`, add `stress_buffer`), §10.

## References

- Spec §4, §6, §8, §10.
- ADRs 0005, 0016, 0017, 0019, 0023, 0024.
- Business study `mutav/docs/operation/40-reserve.md` (sizing philosophies and item 9w).
