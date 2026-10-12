# Demo: app and devnet requirements

What the pilot app, the capture harness and the staged devnet state must provide before the product demo is recorded. These are written requirements for the code sessions; owners are unassigned. The cut is described in [`script.md`](script.md) and [`storyboard.html`](storyboard.html) (v8).

The recording assumes the restyle in PR #45 (`feat/app-landing`) is merged with `main` and deployed to `reserve.mutav.finance` against the devnet program. The recording uses the real pages: `/` redirects to `/reserve` (the MUTAV landing is mutav.finance) and `/demo` redirects to `/operator`.

**v9 (scale framing):** no app change is needed for the scale framing: the scale caption, the ratio captions and the close card's pilot-plan line are edit overlays. Chapter 3 is re-run on localnet at the pilot plan's scale (v3 ledger, figures `[V3]` until it lands); its optional cutaways use the `/reserve` **Capital** tab (`/reserve/capital`, formerly "Money").

**v8 change (app team audit of v7 against production and the v2 simulation):** two earlier test claims (R$16,000 + R$2,000) are on the devnet timeline; F7 is rehearsed on localnet first. **v8.1:** the staged reserve holds R$44,500 after a booked guarantee-fee round, and the claim window on this demo deploy is R$50,000 per 31 days, so Ana's full R$1,500 claim can be retaken (see Devnet staging). Chapter 3 is the ledger-driven motion piece `ch3-flows` built from the v2 simulation ledger (three small claims, no `approve_claim`; share value 1.0000 → 1.1439; R$20,000 in → R$22,878.27 out); localnet app screenshots are optional cutaways, so M6 (in → out on `/capital`) is dropped. The on-chain proof becomes visible: Explorer flashes on devnet, a receipt card after each on-chain action and a transaction rail, from real `getTransaction` data; the refused MTV-PF-0101 is sent with skipPreflight so the refusal lands on-chain. The close cuts to `/reserve/verify`. The F7 VO now matches the app: "the PIX to the landlord". **v7:** the agency beat is a browser mockup of the agency dashboard; chapter 2 ends with F8b on `/reserve/risks` under an edit-overlay safeguards card; the `/operator` forms come prefilled; a "Refresh on-chain" button on `/operator` replaces the separate refresh step. **v6 (hybrid):** the cold open and chapters 1–2 are recorded live on devnet; the agency flash comes from a local copy of the agency platform with fictional data (off-chain); chapter 3 is a local simulation on an accelerated clock with a mock BRS mint (PR #72: `NEXT_PUBLIC_ACCELERATED_CLOCK=1` makes the banner read "Local simulation · accelerated clock" on every page, legal line kept). Chapter titles, the elapsed timer, the receipts, the rail, the cards and the honesty labels are **edit overlays, not app code**.

## Pending the app team (v8)

| # | Item | Needed for | Until it lands |
|---|---|---|---|
| P1 | **Publish the IDL on devnet** so Explorer decodes the MUTAV instructions and errors | F4, F6b, F7 Explorer flashes | Raw instruction data on Explorer (acceptable for a 2 s flash); the receipt card names the instruction |
| P2 | **Send the refused MTV-PF-0101 with skipPreflight** (operator console or harness) so the failed transaction lands on-chain with `InsufficientFreeCapital` | F6b; receipt 2; rail entry 2 | Drop F6b, keep the "Coverage gate · refused" chip, give the 2 s back to the F6 tail |
| P3 | **`tx-receipts.json`** from `getTransaction` for the five devnet transactions (instruction, signature, slot, blockTime, fee, status, error) | Receipt cards and rail (`production/tools/render.cjs receipts`) | Nothing in the cut: the sample PNGs carry placeholder values and must not be used |
| P4 | **`/reserve/risks` rows for the fixed payments account and the guardian pause** (app PR coming) | F8b | The safeguards card carries all five (all enforced by the program); in the shot notes these two are marked "(pending app row)" |
| P5 | **The F6 preview headline as required-vs-held** (the result line already reads "needs R$45,000 … holds R$44,500", matching the VO) | F6 | Capture what is live; keep the result line in frame |

## Must (before recording)

| # | Requirement | Why |
|---|---|---|
| M1 | **Reais on `/reserve` (all tabs) and `/capital`**: amounts shown as `R$`. **Status (main):** met. Amounts always show in BRS (`fmtBrs`); on `/`, `/reserve/*` and `/capital` the main figures add a small muted `≈ US$` hint from BCB PTAX (`/api/fx`), display only. The hint may stay in frame; the VO and captions use reais. | The story is in reais. |
| M2 | **A clean refusal message** with the raw error collapsed: a human line with the program error name and the encoded Solana detail behind a disclosure. **Status (v8 audit):** the result line reads "needs R$45,000 … holds R$44,500", matching the VO. | Pillar 1's climax (F6). |
| M3 | **The register form holds its "Confirmed" result**, with no red preview after it. Today it advances to the next prefilled reference (MTV-PF-0101) at once; F3 cuts before that. | F3 holds on the confirmation. |
| M4 | **`pay_claim` and `settle_payout` keep a visible confirmation after sending**: the status, the signature and the before/after. | The claim runs live in pillar 2 (F7). |
| M5 | **`/reserve/claims` shows each claim's stage and the filed, paid and settled timestamps** (to the second). **Status (v8 audit):** rows are newest first, so Ana's claim is on top; the page's "slowest filed → paid 1m 44s" summary comes from the two earlier test claims, so [N] is read from Ana's own timestamps. The page says "received by landlord (PIX)"; the VO now says "the PIX to the landlord". Ana's R$1,500 claim is under the R$15k per-call cap, so it skips `approve_claim`. | F8 and [N]. |
| M6 | ~~In → out on `/capital`~~ **Dropped in v8:** `/capital` has no in → out view; the chapter 3 motion piece's finale shows R$20,000 in → R$22,878.27 out from the ledger. | — |

## Covered by #59 (merged)

- **The disclaimer and the devnet badge:** the banner on every page, "PILOT DEMO · SOLANA DEVNET — Not open to public investment…". Keep `<DemoBanner />` in the root layout when #45 rebases.

## Should

| # | Requirement | Why |
|---|---|---|
| S1 | Visible copy uses coverage terms only. `main` is fixed (the Health kicker reads "Coverage" since #41). | Terminology: "coverage gate", "required coverage". |
| S2 | `/reserve` Overview shows the coverage line ("Covered: holds 1.2× the R$36,000 it must hold" before Ana) and the ceiling line after a `refresh`. | F5; optional F12 cutaway. |
| S3 | The `/reserve` **Capital** tab (`/reserve/capital`) shows the reserve balance chart (the six simulated months on localnet, no share-price line) and the "Share price" figure. | Optional F10 cutaway. |
| S4 | `/reserve/verify` lists every reserve account with its Explorer link (devnet). | F14a. |

## Notes (no change needed)

- **Before rolling:** set `localStorage` `mutav-transparency-intro-v1` = `1` in the recording browser (or click Skip on the intro); press **Refresh on-chain** on `/operator`; start each clip on the settled frame (the pages show about 0.5 s of skeleton on load).
- **F5 (after Ana's lease):** the ceiling line reads R$162k of cover in use and R$16k free (the reserve can back R$178k). The Coverage tab leads with "Allocated to coverage" and "Capacity left" (R$36,000 and R$34k before Ana; R$40,500 and R$16k after her lease). Guarantee rows are opaque hashes sorted by cover, so Ana's row position varies: the edit points to it with a callout.
- A frozen redemption shows "pending" with an amber note; the reserve stays covered, so it doesn't appear.
- `/operator` forms are prefilled for the demo (register: MTV-PF-0100, Imobiliária Planalto, R$1,500, 6× + 6×, then MTV-PF-0101; claim: R$1,500 with Ana preselected). F3, F6 and F7 have no typing and no jump cuts.
- A "Refresh on-chain" button on `/operator` sends the permissionless `refresh`. Press it right before recording.
- `/reserve/risks` (F8b) lists the program's limits on devnet: R$15,000 per payment, R$20,000 per 31 days and admin-multisig approval above the per-call cap; the fixed payments account and the guardian pause get rows in a coming app PR (P4). The safeguards card over it is an edit overlay (`production/overlays/safeguards-card.png`). The agency-platform → operator integration is roadmap, not live.

## Per beat

| Beat | Frames | Route | Needs |
|---|---|---|---|
| Cold open | F1 | `/reserve` Overview | M1; #59 banner; intro key set |
| Agency | F2 | Agency platform, a local copy with fictional data (dashboard) | KPI cards and the "Where the book sits" pipeline with fictional data; a browser mockup with no domain in the address bar; crop the user email, the empty "Book in force" chart and the guarantees table (`production/motion-spec.md`) |
| 1 · Programmable, transparent reserve | F3–F6b | `/operator`, Explorer, `/reserve/coverage`, `/reserve` Overview | M2, M3, S2; P1, P2, P3, P5; the register form prefilled |
| 2 · Programmable payments, settled in minutes | F7–F8b | `/operator`, Explorer, `/reserve/claims`, `/reserve/risks` | M4, M5; P1, P3, P4; the claim form prefilled (R$1,500, Ana); the pay tab shows the R$15,000 per-call cap |
| 3 · Capital efficiency (local simulation) | F9–F13 | the motion piece `ch3-flows`; optional localnet cutaways of the `/reserve` Capital tab (`/reserve/capital`), `/reserve/claims` and the Overview ceiling line | the v3 ledger at the pilot plan's scale (`[V3]` until it lands); S3 for the cutaways; PR #72 banner on any app cutaway |
| Close | F14a–F14 | `/reserve/verify` (devnet), card | S4 |

## Capture harness → v8

The harness on `feat/demo-capture` is **outdated: it targets pre-#45 routes and does not set the intro key. Capture by hand, or update it first.** If it is updated, it must provide:

1. **Devnet (done):** the staged reserve (see below). No `00-setup` run is needed on devnet.
2. **The 5 live actions on devnet, on camera:** register Ana (`MTV-PF-0100`), the refused send (`MTV-PF-0101`, with skipPreflight so it lands as a failed transaction), `file_claim` R$1,500 (`NTC-PF-0001`), `pay_claim`, `settle_payout`, all on prefilled forms. **Claim retakes fit:** R$32,000 of the R$50,000 per-31-day claim window is left on this demo deploy, so Ana's R$1,500 can be re-run in full. Rehearse on localnet first. Then the F8b plate (`/reserve/risks`, `e1-reserve-risks`) and the F14a plate (`/reserve/verify`, `h1-reserve-verify`). **Log each transaction's signature and on-chain block time and write `tx-receipts.json` from `getTransaction`**, for the timer, [N], the receipts and the rail.
3. **Explorer flashes (devnet):** register_guarantee (`x1-explorer-register`), the failed MTV-PF-0101 (`x2-explorer-refused`), pay_claim (`x3-explorer-pay`), settle_payout (`x4-explorer-settle`); settled frames, decoded once the IDL is on devnet.
4. **Chapter 3 (v3 in progress):** the localnet simulation at the pilot plan's scale and the motion piece re-rendered from its ledger (the v2 run stays until then). Optional cutaways (localnet, `NEXT_PUBLIC_ACCELERATED_CLOCK=1`): the `/reserve` Capital tab (`/reserve/capital`), `/reserve/claims` (the small claims), the Overview ceiling line.
5. **F2 by hand** from the local copy of the agency platform (fictional data): the dashboard, KPI cards → "Where the book sits", built into a browser mockup with no domain in the address bar.
6. **The #45 routes and the intro key:** `/reserve/coverage`, `/reserve/claims`, `/reserve/risks`, `/reserve/verify`, `/reserve/capital` (the Capital tab), with locators for the restyled components, and `mutav-transparency-intro-v1` = `1` set before each page load.

Capture spec as built: Chromium's screencast delivers 1080p at 30 fps, and 2× stills are saved on holds only. Zooms over motion stay at or below 1.3×; zooms on holds can reach 2× using the stills.

## Devnet staging

**Staged state (done, 2026-10-12):** program `GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV`. Held R$44,500, cover R$144,000, required R$36,000, free R$8,500; 8 active leases `MTV-PF-0001…0008`. Value per share **0.606818**, 0.6068 on screen (earlier test claims, then the fee round), 73,333.33 shares outstanding (B holds 6,666.67). Ana is `MTV-PF-0100` (Imobiliária Planalto), the refused lease `MTV-PF-0101`; other agencies Casa Gaúcha Imóveis and Rio Grande Lar. Two earlier test claims (R$16,000 and R$2,000) are on the public timeline. A guarantee-fee round is booked (R$625 gross over 3 invoices, R$500 net into the reserve). The claim cap on this demo deploy is R$50,000 per 31 days (raised from the pilot's R$20,000 for retakes; disclosed in the repo README): **R$32,000** is left, so Ana's R$1,500 and full retakes fit; after her claim the window reads R$19,500 / R$50,000. Time locks on this deploy: 60 s (admin), 120 s (upgrade). The recording browser must load the operator's agency records before capture.

Values from ADR 0028: c = 0.25, max_tvl R$1M, R$120k per guarantee, claim caps R$15k per call and R$20k per 31 days, requests R$1k–R$100k, fee take one fifth of each guarantee fee.

| # | Step | Signer | Wait |
|---|---|---|---|
| 1 | Deploy, `initialize`, `verify.ts` green. **Done 2026-10-12:** program [`GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV`](https://explorer.solana.com/address/GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV?cluster=devnet), the pilot demo reserve on devnet; test activity is visible. This test deploy runs 60 s / 120 s time locks | Upgrade Squads 2-of-2 | 120 s time lock (this deploy) |
| 2 | App deployed for devnet with M1–M5 and the #59 banner | App owner | — |
| 3 | Fund BRS: capital wallet A R$40,000, capital wallet B R$4,000, operator R$3,060; SOL for each | BRS holder | — |
| 4 | `00-setup`: `set_allowlist_root` with A and B (skip if set at `initialize`) | Admin Squads 2-of-2 | 60 s time lock |
| 5 | `00-setup`: `request_deposit` A 40,000, B 4,000 → `fulfil_deposits` (count 2) → `claim_shares` | A, B; Admin Squads 2-of-2 | 60 s time lock |
| 6 | `00-setup`: register 8 leases, rent 1,500, 6× + 6× (R$18,000 each), `MTV-PF-0001…0008`, agencies Imobiliária Planalto (Ana's), Casa Gaúcha Imóveis, Rio Grande Lar (fictional). Check: R$44,000 held, R$36,000 required, R$8,000 free, value per share 0.600000 | Operator | — |
| 7 | Guarantee-fee round (done): R$625 gross over 3 invoices, R$500 net into the reserve. Check: R$44,500 held, R$36,000 required, R$8,500 free, value per share 0.606818 (0.6068 on screen); can back R$178k, capacity left R$34k | Operator | — |
| 8 | Staging is done. Right before rolling, set the intro key and press "Refresh on-chain" on `/operator`. On camera: the 5 live actions (harness item 2); claim retakes fit | Operator | — |
| 9 | Publish the IDL on devnet (P1) for decoded Explorer flashes | Upgrade Squads 2-of-2 | 120 s time lock (this deploy) |

Free capital before Ana must be in [R$4,500, R$9,000) so that Ana fits and the next equal lease is refused. If staging drifts, close stray leases with `close_guarantee` VOID.

## Restore path

None is needed: the devnet reserve stays covered and ends with R$43,000 held, R$40,125 required, free capital R$2,875, mode Normal (each claim retake lowers held by R$1,500: re-read the figures). If any take leaves it under-covered, restore with a deposit and a Squads `fulfil_deposits` (allowed while under-covered: `programs/mutav/src/instructions/capital/fulfil_deposits.rs` calls it the recapitalization path; it is gated only by pause, the fulfil halt and the TVL cap), then send `refresh`, the only instruction that changes the mode. The alternative without the multisig is `close_guarantee` RELEASED on demo leases, then `refresh`.

## Publicly visible afterwards (devnet)

- `/reserve`: covered, mode Normal, R$43,000 held, R$40,125 required, value per share 0.586364. The capital payoff is shown only in the local simulation.
- Ana's guarantee (`MTV-PF-0100`): active, default left R$7,500, exit left R$9,000, opaque id only.
- `/reserve/claims`: three claims: the two earlier test claims (R$16,000, R$2,000) and Ana's R$1,500, filed → paid → settled (one more per claim retake).
- The refused lease: a failed `register_guarantee` transaction on Explorer (InsufficientFreeCapital); no Guarantee account.
- `/reserve/verify`: every reserve account with its Explorer link.
