# 0014 — `pay_claim` bound with concurrent filings on one leg

- **Status:** Proposed (2026-10-06), pending founder confirmation (Julia, Draau). Refines spec §5.4 `pay_claim` rule 2.

## Context

A leg can carry more than one open `ClaimFiling`: `file_claim` accepts a new filing while `amount ≤ leg_cover − leg_paid − leg_provision`, so two notices on the same leg can both be filed before either is paid.

The literal §5.4 rule 2 bounds a payment by the leg's remaining cover only: `amount ≤ leg_cover − leg_paid`. With two open filings that is not enough. Take a leg with cover R$10k and two filings of R$4k each (`leg_provision = 8k`). Rule 2 lets the first payment be R$10k. Afterwards `leg_paid = 10k`, the first filing's R$4k is released, and the second filing still holds a R$4k provision against zero remaining cover:

- `provision ≤ cover − paid` (invariant 2) is broken.
- The second filing can never be paid: any `amount > 0` exceeds the remaining cover. Its provision is stranded in `state.provisions`.
- `open_claims` never reaches 0, so `close_guarantee` refuses with `OpenClaims` and the guarantee can never close.

## Decision

`pay_claim` rule 2 becomes:

```text
0 < amount ≤ filing.provision + (leg_cover − leg_paid − leg_provision)
```

A payment may spend this filing's own provision plus the leg's **unprovisioned** cover. It may never spend cover that another open filing has provisioned.

Every term is computed with checked subtraction. The program keeps `leg_provision ≤ leg_cover − leg_paid` and `filing.provision ≤ leg_provision`, so an underflow means an invariant is already broken; the instruction fails with `MathOverflow` instead of clamping to zero and hiding it.

### Proof sketch

Write `R = leg_cover − leg_paid` (remaining cover), `P = leg_provision`, `p = filing.provision`, `a = amount`.

1. `file_claim` only adds a provision that fits in `R − P`, so `P ≤ R` holds after every filing. Each open filing's provision is part of `P`, so `p ≤ P`.
2. After the payment, `R' = R − a` and `P' = P − p`. Then `P' ≤ R'` ⟺ `P − p ≤ R − a` ⟺ `a ≤ p + (R − P)`, which is exactly the new bound. Invariant 2 is preserved.
3. Because `p ≤ P`, the bound implies `a ≤ R`, so `leg_paid ≤ leg_cover` also holds. The new rule is never looser than the literal one.
4. Because `R − P ≥ 0`, every open filing can always be paid at least its own provision, whatever was paid before it. `open_claims` can always reach 0, and the guarantee can always close.

With `FullyProvisioned` notices (`leg_provision == leg_cover − leg_paid`) the unprovisioned term is 0, so a payment cannot exceed the provision already reflected in NAV. That is what `close_claim_notice(FullyProvisioned)` assumes.

## Alternatives considered

- **The literal rule (`amount ≤ leg_cover − leg_paid`).** Simplest, but it strands other filings' provisions and can make a guarantee impossible to close (see Context). Rejected.
- **Pay only up to the filing's provision (`amount ≤ filing.provision`).** Safe, but too strict: a claim that grew after filing (more months of missed rent) would need a new notice and a new filing before it could be paid, even when the leg has unprovisioned cover. It also makes `close_claim_notice` with a partial provision pointless. Rejected.

## Consequences

- No economic change for a leg with a single open filing: there `filing.provision == leg_provision`, and the bound equals the leg's remaining cover.
- With several open filings, each one is guaranteed to be payable for at least its provision; together they can never pay more than the leg's cover.
- A randomized test interleaves `file_claim` and `pay_claim` (several filings per leg; partial, exact-provision and over-provision payments) and asserts after every step that `provisions = Σ` open provisions, invariant 2 per leg, `remaining_cover_total` matches the book, and each agency's `outstanding_cover` matches its guarantees.
