# 0028 — Pilot parameters

- **Status:** Accepted (2026-10-11), decided by the founders. Supersedes the devnet caps of ADR 0016 and ADR 0022 (§5, "Devnet caps after this ADR") and the "Devnet values" of the earlier devnet handoff. The coverage formula of ADR 0016 / ADR 0022 is unchanged; only the values move. The devnet config (`scripts/devnet/devnet.example.json`), the values `verify.ts` locks (`scripts/devnet/lib/compare.ts`) and the reserve simulator follow this ADR.

## Context

The devnet caps were sized for `c` = 0.10, the program floor: a R$300k reserve, R$40k per guarantee, R$10k / R$20k of operator claim payments per call / per 31 days. They were a starting point for testing the mechanism, not a pilot plan. Before the devnet deploy the founders set the parameters they intend to run the pilot with, starting from the simulator's recommended pilot and adjusting the starting capital, the claim caps and the adapter share.

## Decision

### 1. On-chain values (devnet and pilot)

| Field | Value | Base units (6 dp) | Before |
|---|---|---|---|
| `coverage_ratio_bps` (`c`) | 0.25 | `2_500` | `1_000` (0.10) |
| `caps.max_tvl` | R$1,000,000 | `1_000_000_000_000` | R$300k |
| `caps.max_cover_per_guarantee` | R$120,000 | `120_000_000_000` | R$40k |
| `caps.max_claim_per_call` | R$15,000 | `15_000_000_000` | R$10k |
| `caps.max_claim_per_period` | R$20,000 per 31 days | `20_000_000_000` | unchanged |
| `caps.stress_buffer` | R$19,000 | `19_000_000_000` | R$19k planned, now set and locked |
| `caps.min_request` / `caps.max_request` | R$1,000 / R$100,000 | unchanged | unchanged (`max_request` ≤ `max_tvl`) |
| `caps.max_nav_move_bps` | `10_000` on devnet | unchanged | unchanged |
| `fee_take_bps` | `2_000` (20%) | unchanged | unchanged |
| Settlement floor | 100% BRS, adapter share 0% | — | unchanged (ADR 0018) |

MUTAV's fee take stays 2,000 bps. The 12% guarantee fee below is what agencies pay per month as a share of rent; it is a business input, not a program value.

### 2. Business plan (the simulator's "Pilot · recommended")

- Starting capital R$100k, plus R$100k a month from month 1, so month 1 opens at R$200k (the start plus the first raise) and R$700k is in by month 6.
- 10 new leases a month to a growth target of 60.
- Guarantee fee 12% of rent per month; rent R$2,200; cover 12× + 6× rent (R$39,600 per lease).
- Issuer income from Nora as a planning assumption (see 4); redemptions only above a 25% buffer over coverage required ("buffer").
- **Conservative variant:** the same at `c` = 0.50 and 5 new leases a month (30 leases).

Recomputed with the simulator's own model: every planned lease is admitted in both pilots. At `c` = 0.25 each lease needs R$9,900 of coverage required; 60 leases need R$594,000. At `c` = 0.50 each needs R$19,800; 30 leases need the same R$594,000. The R$100k start backs 10 leases at `c` = 0.25 (2 at `c` = 1.0); `max_tvl` backs about 101.

### 3. Why

- **Higher, safer coverage.** `c` = 0.25 holds a quarter of every lease's remaining cover, two and a half times the program floor. The first real book is small and its loss data is not ours yet, so the pilot keeps a margin well above the worst-case floor. This reverses the alternative ADR 0022 rejected ("raise `c`; `c` stays at the 0.10 floor"): ADR 0022 rejected raising `c` as a way to make room for the next claims, because it slows growth; here the founders choose the higher `c` for the pilot's safety, and the stress buffer stays as ADR 0022 defined it.
- **A capital plan instead of a single deposit.** Capital arrives with the book: R$100k a month backs about 10 new leases a month at `c` = 0.25. `max_tvl` (R$1M) is the ceiling of that plan, not a target, and it stops a raise from taking the reserve past what the founders want at risk.
- **Claim caps bound the operator.** The operator pays claims without the multisig up to R$15k per call and R$20k per 31 days. A 6×-rent eviction (R$13,200) fits the per-call cap, so the most common large claim is paid without waiting for the multisig. Claims above R$15k need an `approve_claim` approval of the exact amount (ADR 0021). The bounded loss from a compromised operator key stays R$20k per 31 days, about 2% of `max_tvl`.
- **Per-guarantee cap with room.** R$120k fits the working product (R$39,600) and leaves room for higher rents or covers without a cap change.
- **BRS only.** The pilot holds BRS only (ADR 0018); the adapter share stays 0% and the settlement floor 100% until an adapter exists. The 50% / 100% adapter cases stay in the simulator as what-ifs.

### 4. Issuer income in the simulator

The simulator input "BRS yield" is renamed **"Issuer income (Nora), % of TVL a year"**. BRS itself pays no yield: Nora pays the reserve issuer partnership revenue in BRS, as an annual rate on the reserve's TVL. It reaches the reserve's income inbox and `sweep_income` books it on-chain (ADR 0017), all of it to NAV since the income take is 0.

The model is CDI-linked and tiered on the whole balance: inputs are CDI and up to four tiers (a balance threshold and a % of CDI). Each month the reserve's TVL selects the tier whose threshold it is strictly above, and income = TVL × (tier % × CDI) / 12. The public default is one tier at 70% of CDI (CDI = Selic − 0.10 pp, ≈ 9.6% a year: 0.70 × 13.65%), a planning assumption until the agreement with the issuer is signed. Whether tiers apply to the whole balance or marginally, and any holding-period rules, are to be confirmed with the issuer. Links from earlier versions that carry a flat `brsYieldPct` still work: a flat rate overrides the tiers.

### 5. Expected claims, a sanity check

60 leases × R$2,200 × 12 × 2.01% (rent arrears, Superlógica IIL RS apartments) ≈ **R$32k a year**, about R$2.7k a month. With evictions and other exit debts in scope B the simulator expects R$812 per lease-year, about R$48.7k a year for 60 leases (≈ R$4.1k a month). Both are well inside the R$20k per 31-day operator cap, and the simulator shows no month above it in either pilot.

**Amended 2026-10-11 (founders): base delinquency 2.5%.** The working figure for the starting region is a round 2.5% of annual rent, set above the measured 2.01% for RS apartments (South region 2.67%). At 2.5%: 60 × R$2,200 × 12 × 2.5% ≈ **R$39.6k a year** (≈ R$3.3k a month) of rent arrears; with evictions (0.25% a year at 6× rent) and other exit debts in scope B, R$942 per lease-year, about R$56.5k a year for 60 leases (≈ R$4.7k a month). Still well inside the R$20k per 31-day cap. The simulator default follows.

**Amended 2026-10-11 (founders): capital schedule.** Starting capital **R$120k**, plus R$100k a month **from month 2** (was R$100k plus R$100k from month 1). Under the old schedule month 1 opened at R$200k and the 25% buffer rule redeemed about R$80k the same month: capital went in and straight back out. Now month 1 runs on the start alone, which backs 12 leases at `c` = 0.25 and leaves about R$24k of headroom over coverage required as an operating margin. (The R$19k stress buffer is a floor inside coverage required, `max(c × cover, provisions + min(buffer, unprovisioned))`, so at `c` = 0.25 it binds only for a book of one or two leases and does not need this headroom.) R$620k is in by month 6, none of it redeemed, all 60 leases are admitted, and the modeled reserve return rises from 24.5% to 25.1%.

## Consequences

- `devnet.example.json` and `DEVNET_LOCKED` carry the values in 1; `verify.ts` fails a devnet deploy that holds the old ones. `stress_buffer` (R$19k) is now locked too.
- Spec §8, the README, the litepaper and the app spec quote these values. ADR 0016 and ADR 0022 keep their text as the record of the earlier values.
- The simulator's Default scenario mirrors the devnet config; its pilot scenarios carry the business plan in 2. Saved inputs from earlier versions are not reused.
- Raising any cap remains a time-locked multisig action.
