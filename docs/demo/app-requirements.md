# Demo: app and devnet requirements

What the pilot app, the capture harness and the staged devnet state must provide before the product demo is recorded. These are written requirements for the code sessions; owners are unassigned. The cut is described in [`script.md`](script.md) and [`storyboard.html`](storyboard.html) (v5).

The recording assumes the restyle in PR #45 (`feat/app-landing`) is merged with `main` and deployed to `reserve.mutav.finance` against the devnet program. A cleaned `/demo` is the optional alternative surface; the requirements below apply to whichever surface is recorded.

**v5 change:** the demo is organised in three chapters, one per pitch pillar (programmable, transparent reserve · settled in minutes · capital efficiency). The claim now runs live on camera, so its confirmations must stay visible. Chapter titles, the elapsed timer, the coverage meter, the "Coverage gate · refused" chip, the cards and the honesty labels are **edit overlays, not app code**. The numbers are unchanged from v4 (6× + 6× cover, rent R$1,500).

## Must (before recording)

| # | Requirement | Why |
|---|---|---|
| M1 | **Reais on `/reserve` (all tabs) and `/capital`**: amounts shown as `R$` (e.g. `R$44,948.00`), not USD at a display rate. A config switch or env flag is enough; the chain amount is BRS 1:1 BRL. **Status (#45):** met by leaving the FX rate unconfigured on the recording deployment; `useMoney` then falls back to reais. Check that `/api/fx` returns no rate before capture. | The story is in reais. |
| M2 | **A clean refusal message** with the raw error collapsed: a human line (e.g. "Refused by the program: not enough free capital for this cover") with the program error name and the encoded Solana detail behind a disclosure. Today it is "InsufficientFreeCapital —" followed by about 8 lines of encoded text. | Pillar 1's climax (F6). |
| M3 | **The register form holds its "Confirmed" result**, with no red preview after it. Today it resets to the next reference at once and shows a red "Send anyway" preview under the result. | F3 holds on the confirmation. |
| M4 | **`pay_claim` and `settle_payout` keep a visible confirmation after sending**: the status, the signature and the before/after. Today the row disappears once sent and takes all three with it. | The claim runs live in pillar 2 (F7). |
| M5 | **`/reserve/claims` shows the filed, paid and settled timestamps** (to the second) and the filed → settled duration. | F8 and the [N] minutes. |
| M6 | **An in → out position in reais on `/capital`** for the connected wallet: deposited and claimed (e.g. "Deposited R$4,000.00 · Claimed R$4,086.18"). No annual rate, APY or projection. Fallback if not built: an edit overlay from the two transaction amounts. | Pillar 3's end state (F12). |

## Covered by #59 (merged)

- **The disclaimer and the devnet badge:** the banner on every page, "PILOT DEMO · SOLANA DEVNET — Not open to public investment…". Keep `<DemoBanner />` in the root layout when #45 rebases.

## Should

| # | Requirement | Why |
|---|---|---|
| S1 | No "solvency" in visible copy. `main` is fixed (the Health kicker reads "Coverage" since #41); `feat/demo-capture` and #45 fix it by merging `main`. | Terminology: "coverage gate", "required coverage". |
| S2 | `/reserve` Overview shows the value per share and stable assets after a `refresh` (or the "now" value computed from accounts). | F11. |
| S3 | `/reserve/capital` shows the fee receipt row (gross, to the reserve, to the treasury). | F10. |
| S4 | Optional: publish the IDL so Explorer decodes the Guarantee account (upgrade Squads, 120 s time lock on this deploy). Raw bytes are acceptable. | F4. |

## Notes (no change needed)

- A frozen redemption shows "pending" with an amber note; v5 keeps the reserve covered, so it doesn't appear.
- The Explorer end state (F4) can't be tested on localnet; check it on devnet after staging.

## Per beat

| Beat | Frames | Route | Needs |
|---|---|---|---|
| Cold open | F1 | `/reserve` Overview | M1; #59 banner |
| Agency | F2 | `app.mutav.finance` | A demo agency account with Ana's fictional lease (rent R$1,500), or the harness's agency stub |
| 1 · Programmable, transparent reserve | F3–F6 | `/operator`, Explorer, `/reserve/coverage` | M2, M3; rent 1500, 6× + 6× in the register form |
| 2 · Settled in minutes | F7–F8 | `/operator`, `/reserve/claims` | M4, M5; the pay tab shows the R$15,000 per-call cap |
| 3 · Capital efficiency | F9–F12 | `/reserve`, `/reserve/capital`, `/capital` | M1, M6, S2, S3 |
| Close | F13 | card | none |

## Capture harness → v5

The harness on `feat/demo-capture` (routes and locators in `app/e2e/demo/pages.ts`) was built for v2 (the under-coverage take, c = 0.10). A code session must change:

1. **`00-setup` (off camera):** the ADR 0028 seed via `DEMO_PARAMS` (c = 0.25): deposits A R$40,000 and B R$4,000 with the Squads fill; 8 leases at rent 1500, 6× + 6×.
2. **The 5 live actions, on camera:** register Ana (`MTV-PF-0009`), the refused send (`MTV-PF-0010`), `file_claim` R$1,500 (`NTC-PF-0001`), `pay_claim`, `settle_payout`. **Log each transaction's signature and on-chain block time** to a file, for the elapsed-timer overlay and [N].
3. **Plates and end-state captures:** the F9 `/reserve` plate right after the refusal; Explorer on Ana's Guarantee PDA; and, after `05-offcamera`, the fee receipt (`/reserve/capital`), `/reserve` share value, and `/capital` in → out.
4. **`05-offcamera`:** `contribute_fees` R$3,060; B's `request_redeem` of all 6,666.67 shares → the admin `fulfil_redeems` fill → B's `claim_assets` (expected R$4,086.18); `refresh`.
5. **The agency stub** for F2, or a hand capture.
6. **The #45 routes:** `/reserve/coverage`, `/reserve/claims`, `/reserve/capital`, `/capital`, with locators for the restyled components.

Capture spec as built: Chromium's screencast delivers 1080p at 30 fps, and 2× stills are saved on holds only. Zooms over motion stay at or below 1.3×; zooms on holds can reach 2× using the stills.

## Devnet staging

**Staged state (done, 2026-10-12):** program `GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV`. Held R$44,000, cover R$144,000, required R$36,000, free R$8,000; 8 active leases `MTV-PF-0001…0008`. Value per share **0.600000** (earlier test claims), 73,333.33 shares outstanding (B holds 6,666.67). Ana is `MTV-PF-0009` (Imobiliária Planalto), the refused lease `MTV-PF-0010`; other agencies Casa Gaúcha Imóveis and Rio Grande Lar. An earlier R$18,000 test claim is on the public timeline and uses R$18,000 of the R$20,000 per-31-day cap: **only one R$1,500 claim can be paid** unless the admin raises `max_claim_per_period` (Squads `set_config`, 60 s time lock). Time locks on this deploy: 60 s (admin), 120 s (upgrade). The recording browser must load the operator's agency records before capture.

Values from ADR 0028: c = 0.25, max_tvl R$1M, R$120k per guarantee, claim caps R$15k per call and R$20k per 31 days, requests R$1k–R$100k, fee take 20%. Total devnet BRS needed ≈ R$47,060 (≈ R$47,418 with the optional issuer-revenue sweep).

| # | Step | Signer | Wait |
|---|---|---|---|
| 1 | Deploy, `initialize`, `verify.ts` green. **Done 2026-10-12:** program [`GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV`](https://explorer.solana.com/address/GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV?cluster=devnet), the pilot demo reserve on devnet; test activity is visible. This test deploy runs 60 s / 120 s time locks, so the waits below are shorter | Upgrade Squads 2-of-2 | 120 s time lock (this deploy) |
| 2 | App deployed for devnet with M1–M6 and the #59 banner | App owner | — |
| 3 | Fund BRS: capital wallet A R$40,000, capital wallet B R$4,000, operator R$3,060 (+R$358 for the optional sweep); SOL for each | BRS holder | — |
| 4 | `00-setup`: `set_allowlist_root` with A and B (skip if set at `initialize`) | Admin Squads 2-of-2 | 60 s time lock |
| 5 | `00-setup`: `request_deposit` A 40,000, B 4,000 → `fulfil_deposits` (count 2) → `claim_shares` | A, B; Admin Squads 2-of-2 | 60 s time lock |
| 6 | `00-setup`: register 8 leases, rent 1,500, 6× + 6× (R$18,000 each), `MTV-PF-0001…0008`, agencies Imobiliária Planalto (Ana's), Casa Gaúcha Imóveis, Rio Grande Lar (fictional). Check: R$44,000 held, R$36,000 required, R$8,000 free, value per share 0.600000 | Operator | — |
| 7 | On camera: the 5 live actions (harness item 2) | Operator | — |
| 8 | `05-offcamera`: fees, redemption with the Squads fill, `refresh` | Operator; B; Admin Squads 2-of-2; anyone | 60 s time lock |

Free capital before Ana must be in [R$4,500, R$9,000) so that Ana fits and the next equal lease is refused. If staging drifts, close stray leases with `close_guarantee` VOID.

## Restore path

None is needed: the reserve stays covered throughout and ends with free capital R$736.82, mode Normal. If any take leaves it under-covered, restore with a deposit and a Squads `fulfil_deposits` (allowed while under-covered: `programs/mutav/src/instructions/capital/fulfil_deposits.rs` calls it the recapitalization path; it is gated only by pause, the fulfil halt and the TVL cap), then send `refresh`, the only instruction that changes the mode. The alternative without the multisig is `close_guarantee` RELEASED on demo leases, then `refresh`.

## Publicly visible afterwards

- `/reserve`: covered, mode Normal, stable R$40,861.82, required R$40,125, value per share 0.612927.
- Ana's guarantee: active, default left R$7,500, exit left R$9,000, opaque id only.
- `/reserve/claims`: two claims: an earlier R$18,000 test claim and Ana's R$1,500, filed → paid → settled.
- `/reserve/capital`: deposits R$40,000 and R$4,000, one fee receipt, one claim payment, one redemption of R$4,086.18.
- The refused lease leaves nothing on-chain.
