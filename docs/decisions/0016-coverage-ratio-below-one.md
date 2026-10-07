# 0016 — Coverage ratio below 1.0, with a 0.10 floor and a provisions term

- **Status:** Proposed (2026-10-07), pending founder confirmation (Julia, Draau). Resolves spec §12 Q17 and PC-14. Amends ADR 0006 (absolute per-lease coverage) on the value of `c`; the per-lease cover itself is unchanged.

## Context

The program sizes the reserve as `coverage_required = ceil(c × remaining_cover_total / 10_000)`, with `c = coverage_ratio_bps`. Until now `validate_params` refused any `c < 1.0`: the floor was open (§12 Q17, PC-14), so the program failed closed at the starting value.

At `c = 1.0` every real of cover is backed by a real of capital. That is the "full backing" sizing (Philosophy A in the business study, `mutav/docs/operation/40-reserve.md`). On a R$300k reserve it backs about **7 leases** (cover R$39,600 each: 12× + 6× of a R$2,200 rent): 108% worst-case coverage and 22.6 bad years covered.

The business side chose expected-loss sizing (Philosophy B), and item **9w** of `40-reserve.md` proposes the rule that limits the book: grow only while **worst-case coverage ≥ 10%** and **tail coverage ≥ 2.0×** (bad years paid from capital alone), with 1.0× of tail coverage as the hard floor. On R$300k the 10% floor binds first, at about **75 leases** (10.1% worst case, 2.1×). The pilot starts at 30 leases and grows to 60 after the month-3 checkpoint. Worst-case coverage is `reserve ÷ total cover`, which is exactly `c`. The 10% floor is therefore `c ≥ 0.10`, and the program cannot express it while it refuses `c < 1`.

Lowering `c` below 1 breaks one assumption the program relied on silently: `coverage_required ≥ provisions`. With `c ≥ 1` it held because a filed claim's provision is part of the remaining cover. With `c < 1` a large filed claim could exceed `c × remaining_cover_total`, and the reserve would report free capital that a filed claim already needs.

## Decision

1. **Floor.** A program constant `MIN_COVERAGE_RATIO_BPS = 1_000` (c ≥ 0.10). `validate_params` (shared by `initialize` and `set_config`) refuses `coverage_ratio_bps < 1_000` with `InvalidParameter`. There is no upper bound: a higher `c` only asks for more capital. The constant is not exported in the IDL.
2. **Provisions term.**

   ```text
   coverage_required = max(ceil(c × remaining_cover_total / 10_000), provisions)
   ```

   Filed claims stay fully covered at any `c`. At `c ≥ 1` nothing changes, because `provisions ≤ remaining_cover_total`. The term flows everywhere `coverage_required` is used: the `register_guarantee` gate (rule 5), the inline under-coverage check, `refresh`, the recompute in `file_claim`, `pay_claim` and `close_guarantee`, `fulfil_redeems`, and instant exit.
3. **Claim payments are never refused.** A claim payment of `a` lowers `stable_assets` by `a` but `coverage_required` only by `c × a`. With `c < 1` it lowers the surplus by `(1 − c) × a` and can tip the reserve into under-coverage. That is intended: the solvency gate never blocks a claim payment (spec §1 principle 4, §5.4 rule 7). The next `refresh` records `UnderCovered`, which freezes new guarantees and redemption fills until capital comes in or the book runs off. Invariant 7 is generalised accordingly.
4. **Devnet starts at `c = 0.10`**, the 9w floor, with caps sized to it: `max_tvl` R$300k, `max_cover_per_guarantee` R$40k, `max_cover_per_agency` R$3M (= `max_tvl / 0.10`, so it never binds while MUTAV's operator allocates every lease to one reserve), claim caps R$10k per call and R$20k per 30 days, requests R$1k–R$100k, `max_tesouro_share_bps = 0` (no adapter on devnet).
5. **No on-chain tail floor yet.** The 2.0× / 1.0× tail check of 9w stays an off-chain planning signal (shown by the simulator). A per-lease tail floor, `max(c × remaining cover, tail_floor × active leases)`, needs its own ADR after the hackathon.

## Alternatives considered

- **Keep the floor at 1.0 (PC-14 as a constant).** Full backing caps the R$300k pilot at about 7 leases. It does not prove the operation the pilot exists to prove, and it contradicts the sizing the business side chose. Rejected.
- **No program floor, only an admin choice.** A mistaken `set_config` could set `c = 0` and let the book grow on no capital. The 10% floor is the business minimum, so it belongs in the program. Rejected.
- **`c < 1` without the provisions term.** Free capital would include money already owed to filed claims, and the gate could register cover against it. Rejected.
- **Counting provisions on top of the ratio term (`c × cover + provisions`).** A filed claim's provision is already part of the remaining cover, so this counts it twice and changes behaviour at `c ≥ 1` (invariant 6 says provisions never shrink registration capacity at `c = 1`). Rejected in favour of the `max`.
- **Adding the tail floor now.** Its per-lease value depends on 9u, 9v and 9k, which are still open, and it adds a config field (layout change). Deferred.

## Consequences

- `c` can be set in `[0.10, ∞)`. At `c = 0.10` R$300k backs about R$3M of cover, about 75 leases at R$39,600.
- Claims can push the reserve into under-coverage at `c < 1`. That is the intended trade-off of thin capital: new guarantees stop, claims keep being paid, and recapitalization or run-off restores normal mode.
- With BRS only, `liquid_budget ≥ free_capital` keeps holding at any `c` (the provisions term guarantees it), so `fulfil_redeems`'s error choice is unchanged.
- No IDL or layout change: the constant is internal and the formula reuses existing fields. The client's math mirror (`clients/js`) and its vectors change to match.
- Publishing any coverage number is still gated by 9c (counsel). The `/reserve` page shows coverage once devnet is initialized; that is decided before the deploy, not here.
