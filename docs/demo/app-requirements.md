# Demo: app and devnet requirements

What the pilot app, the capture harness and the staged devnet state must provide before the product demo is recorded. These are written requirements for the code sessions; owners are unassigned. The cut is described in [`script.md`](script.md) and [`storyboard.html`](storyboard.html) (v6).

The recording assumes the restyle in PR #45 (`feat/app-landing`) is merged with `main` and deployed to `reserve.mutav.finance` against the devnet program. A cleaned `/demo` is the optional alternative surface; the requirements below apply to whichever surface is recorded.

**v6 change (hybrid):** the cold open and chapters 1–2 are recorded live on devnet; the agency flash comes from a local copy of the agency platform with fictional data (off-chain); chapter 3 is a local simulation on an accelerated clock with a mock BRS mint, labelled by the app banner (PR #72: `NEXT_PUBLIC_ACCELERATED_CLOCK=1` makes the banner read "Local simulation · accelerated clock" on every page, legal line kept). No corner badges; a 1.5 s switch card is made in the editor. The devnet fee and withdrawal staging is dropped: the capital payoff is shown only in the local simulation. **Earlier (v5):** the demo is organised in three chapters, one per pitch pillar (programmable, transparent reserve · settled in minutes · capital efficiency). The claim now runs live on camera, so its confirmations must stay visible. Chapter titles, the elapsed timer, the coverage meter, the "Coverage gate · refused" chip, the cards and the honesty labels are **edit overlays, not app code**. The numbers are unchanged from v4 (6× + 6× cover, rent R$1,500).

## Must (before recording)

| # | Requirement | Why |
|---|---|---|
| M1 | **Reais on `/reserve` (all tabs) and `/capital`**: amounts shown as `R$` (e.g. `R$44,948.00`), not USD at a display rate. A config switch or env flag is enough; the chain amount is BRS 1:1 BRL. **Status (main):** met. Amounts always show in BRS (`fmtBrs`); on `/`, `/reserve/*` and `/capital` the main figures add a small muted `≈ US$` hint from BCB PTAX (`/api/fx`), display only. The hint may stay in frame; the VO and captions use reais. | The story is in reais. |
| M2 | **A clean refusal message** with the raw error collapsed: a human line (e.g. "Refused by the program: not enough free capital for this cover") with the program error name and the encoded Solana detail behind a disclosure. Today it is "InsufficientFreeCapital —" followed by about 8 lines of encoded text. | Pillar 1's climax (F6). |
| M3 | **The register form holds its "Confirmed" result**, with no red preview after it. Today it resets to the next reference at once and shows a red "Send anyway" preview under the result. | F3 holds on the confirmation. |
| M4 | **`pay_claim` and `settle_payout` keep a visible confirmation after sending**: the status, the signature and the before/after. Today the row disappears once sent and takes all three with it. | The claim runs live in pillar 2 (F7). |
| M5 | **`/reserve/claims` shows each claim's stage (needs approval → approved → paid → settled) and the filed, paid and settled timestamps** (to the second) and the filed → settled duration. Ana's R$1,500 claim is under the R$15k per-call cap, so it skips `approve_claim`. | F8 and [N]. |
| M6 | **In → out on `/capital`, in the localnet simulation only:** the capital provider's deposited and withdrawn amounts in reais (in the run: R$20,000 in → R$20,774.35 out), under the "Local simulation · accelerated clock" banner. No rate or APY. Fallback: an edit overlay from the two transaction amounts. | Chapter 3 end state (F13). |

## Covered by #59 (merged)

- **The disclaimer and the devnet badge:** the banner on every page, "PILOT DEMO · SOLANA DEVNET — Not open to public investment…". Keep `<DemoBanner />` in the root layout when #45 rebases.

## Should

| # | Requirement | Why |
|---|---|---|
| S1 | Visible copy uses coverage terms only. `main` is fixed (the Health kicker reads "Coverage" since #41); `feat/demo-capture` and #45 fix it by merging `main`. | Terminology: "coverage gate", "required coverage". |
| S2 | `/reserve` Overview shows the value per share and stable assets after a `refresh` (or the "now" value computed from accounts). | F12. |
| S3 | `/reserve/capital` shows the fee receipt row (gross, to the reserve, to the treasury). | F10. |
| S4 | Optional: publish the IDL so Explorer decodes the Guarantee account (upgrade Squads, 120 s time lock on this deploy). Raw bytes are acceptable. | F4. |

## Notes (no change needed)

- A frozen redemption shows "pending" with an amber note; v6 keeps the reserve covered, so it doesn't appear.
- The Explorer end state (F4) can't be tested on localnet; check it on devnet after staging.

## Per beat

| Beat | Frames | Route | Needs |
|---|---|---|---|
| Cold open | F1 | `/reserve` Overview | M1; #59 banner |
| Agency | F2 | Agency platform, a local copy with fictional data (guarantee detail) | Ana's fictional guarantee: Imobiliária Planalto, Ana Souza, status Active, tag MTV-PF-0100, rent R$1,500. Frame out the cover amount (the platform's default product shows R$45,000, not R$18,000); hide or crop the URL bar |
| 1 · Programmable, transparent reserve | F3–F6 | `/operator`, Explorer, `/reserve/coverage` | M2, M3; rent 1500, 6× + 6× in the register form |
| 2 · Settled in minutes | F7–F8 | `/operator`, `/reserve/claims` | M4, M5; the pay tab shows the R$15,000 per-call cap |
| 3 · Capital efficiency (localnet) | F9–F13 | `/reserve` (history chart, Month 1…6), `/reserve/capital`, `/reserve/claims`, `/capital` | M1, M6, S2, S3; PR #72 banner; the simulation below |
| Close | F14 | card | none |

## Capture harness → v6

The harness on `feat/demo-capture` (routes and locators in `app/e2e/demo/pages.ts`). A code session must provide:

1. **Devnet (done):** the staged reserve (see below). No `00-setup` run is needed on devnet.
2. **The 5 live actions on devnet, on camera:** register Ana (`MTV-PF-0100`), the refused send (`MTV-PF-0101`), `file_claim` R$1,500 (`NTC-PF-0001`), `pay_claim`, `settle_payout`. **One claim take** (R$2,000 left in the claim window); a retake uses a claim ≤ R$500. **Log each transaction's signature and on-chain block time**, for the timer and [N]. Rehearse on localnet first.
3. **The localnet simulation (chapter 3):** the same program on a local validator with a mock BRS mint and an accelerated clock; the app started with `NEXT_PUBLIC_ACCELERATED_CLOCK=1` (PR #72). Six simulated months: guarantee fees and issuer revenue landing, one claim above R$15,000 going filed → `approve_claim` (admin) → paid → settled, the coverage ceiling rising, the value per share rising, and one capital provider's withdrawal above its deposit. Done: the run's figures fill the storyboard's numbers table (three claims, C2 R$16,000 approved by the admin; R$20,000 in → R$20,774.35 out).
4. **Chapter 3 captures:** `/reserve` history chart (Month 1…6), the Capital tab flows, `/reserve/claims` (claim C2's four stages), `/reserve` (ceiling and value per share), `/capital` (in → out).
5. **F2 by hand** from the local copy of the agency platform (fictional data; cover amount framed out, URL bar cropped).
6. **The #45 routes:** `/reserve/coverage`, `/reserve/claims`, `/reserve/capital`, `/capital`, with locators for the restyled components.

Capture spec as built: Chromium's screencast delivers 1080p at 30 fps, and 2× stills are saved on holds only. Zooms over motion stay at or below 1.3×; zooms on holds can reach 2× using the stills.

## Devnet staging

**Staged state (done, 2026-10-12):** program `GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV`. Held R$44,000, cover R$144,000, required R$36,000, free R$8,000; 8 active leases `MTV-PF-0001…0008`. Value per share **0.600000** (earlier test claims), 73,333.33 shares outstanding (B holds 6,666.67). Ana is `MTV-PF-0100` (Imobiliária Planalto), the refused lease `MTV-PF-0101`; other agencies Casa Gaúcha Imóveis and Rio Grande Lar. An earlier R$18,000 test claim is on the public timeline and uses R$18,000 of the R$20,000 per-31-day cap: **the claim is one devnet take** (R$2,000 left); a retake uses a claim ≤ R$500. Time locks on this deploy: 60 s (admin), 120 s (upgrade). The recording browser must load the operator's agency records before capture.

Values from ADR 0028: c = 0.25, max_tvl R$1M, R$120k per guarantee, claim caps R$15k per call and R$20k per 31 days, requests R$1k–R$100k, fee take 20%. 

| # | Step | Signer | Wait |
|---|---|---|---|
| 1 | Deploy, `initialize`, `verify.ts` green. **Done 2026-10-12:** program [`GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV`](https://explorer.solana.com/address/GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV?cluster=devnet), the pilot demo reserve on devnet; test activity is visible. This test deploy runs 60 s / 120 s time locks, so the waits below are shorter | Upgrade Squads 2-of-2 | 120 s time lock (this deploy) |
| 2 | App deployed for devnet with M1–M6 and the #59 banner | App owner | — |
| 3 | Fund BRS: capital wallet A R$40,000, capital wallet B R$4,000, operator R$3,060 (+R$358 for the optional sweep); SOL for each | BRS holder | — |
| 4 | `00-setup`: `set_allowlist_root` with A and B (skip if set at `initialize`) | Admin Squads 2-of-2 | 60 s time lock |
| 5 | `00-setup`: `request_deposit` A 40,000, B 4,000 → `fulfil_deposits` (count 2) → `claim_shares` | A, B; Admin Squads 2-of-2 | 60 s time lock |
| 6 | `00-setup`: register 8 leases, rent 1,500, 6× + 6× (R$18,000 each), `MTV-PF-0001…0008`, agencies Imobiliária Planalto (Ana's), Casa Gaúcha Imóveis, Rio Grande Lar (fictional). Check: R$44,000 held, R$36,000 required, R$8,000 free, value per share 0.600000 | Operator | — |
| 7 | On camera: the 5 live actions (harness item 2), one claim take | Operator | — |
| 8 | Chapter 3 on localnet: the six-month simulation (harness item 3), `NEXT_PUBLIC_ACCELERATED_CLOCK=1` | Simulation script; local admin | local |

Free capital before Ana must be in [R$4,500, R$9,000) so that Ana fits and the next equal lease is refused. If staging drifts, close stray leases with `close_guarantee` VOID.

## Restore path

None is needed: the devnet reserve stays covered and ends with R$42,500 held, R$40,125 required, free capital R$2,375, mode Normal. If any take leaves it under-covered, restore with a deposit and a Squads `fulfil_deposits` (allowed while under-covered: `programs/mutav/src/instructions/capital/fulfil_deposits.rs` calls it the recapitalization path; it is gated only by pause, the fulfil halt and the TVL cap), then send `refresh`, the only instruction that changes the mode. The alternative without the multisig is `close_guarantee` RELEASED on demo leases, then `refresh`.

## Publicly visible afterwards (devnet)

- `/reserve`: covered, mode Normal, R$42,500 held, R$40,125 required, value per share 0.579545. The capital payoff is shown only in the local simulation.
- Ana's guarantee (`MTV-PF-0100`): active, default left R$7,500, exit left R$9,000, opaque id only.
- `/reserve/claims`: two claims: an earlier R$18,000 test claim and Ana's R$1,500, filed → paid → settled.
- The refused lease leaves nothing on-chain.
