# Demo: app and devnet requirements

What the pilot app, the capture harness and the staged devnet state must provide before the product demo is recorded. These are written requirements for the code sessions; owners are unassigned. The cut is described in [`script.md`](script.md) and [`storyboard.html`](storyboard.html) (v4).

The recording assumes the restyle in PR #45 (`feat/app-landing`) is merged with `main` and deployed to `reserve.mutav.finance` against the devnet program. A cleaned `/demo` is the optional alternative surface; the requirements below apply to whichever surface is recorded.

**v4 change:** the devnet badge, the coverage meter, the corner mini-map, the "Signed by …" chips, the "Coverage gate · refused" chip and the honesty labels are **edit overlays, not app code**. The numbers now use a 6× + 6× cover (rent R$1,500, R$18,000 per lease), so the register form needs no change.

## Must (before recording)

| # | Requirement | Why |
|---|---|---|
| M1 | **Reais on `/reserve` (all tabs) and `/investment`** when recording: amounts shown as `R$` (e.g. `R$44,948.00`), not USD at a display rate. A config switch or env flag is enough; the chain amount is BRS 1:1 BRL. | The story is in reais; the payoff (R$4,000 in → R$4,086.18 out) is shown on screen only. |
| M2 | **Disclaimer line restored**, visible on `/investment`: "Pilot capital is MUTAV's own; not open to outside investors." | It is F13's honesty label. |
| M3 | **`pay_claim` and `settle_payout` keep their confirmation visible after sending**: the status, the signature and the before/after table. Today the row disappears once sent, taking all three with it (found by the capture harness on localnet). | F9 and F10 need the confirmation on screen. Edit workaround meanwhile: grab the first frames after confirmation and let the meter carry the "after". |
| M4 | **A clean refusal error**: a human line (e.g. "Refused by the program: InsufficientFreeCapital, not enough free capital for this cover") with the raw details collapsed. Today it is "InsufficientFreeCapital —" followed by about 8 lines of encoded Solana error text. | F7 is the climax. Edit workaround meanwhile: crop to the first line. |
| M5 | **`register_guarantee` holds its success state**: keep "Confirmed" visible and don't pre-fill the next reference with a red "Send anyway" preview under it. Today the form resets at once and shows the red preview under the result. | F4 cuts on the confirmation. Edit workaround meanwhile: cut before the reset. |

## Should

| # | Requirement | Why |
|---|---|---|
| S1 | No "solvency" in visible copy. Verified: `main` is fixed (the Health section's kicker reads "Coverage" since #41). The capture branch (`feat/demo-capture`, Health kicker "Solvency") and #45 (admin and `/demo` copy) are behind `main`; merging `main` fixes them. | Terminology: "coverage gate", "required coverage". |
| S2 | `/reserve` Overview shows the value per share and stable assets after a `refresh`; if the published value lags, show the "now" value computed from accounts. | F12. |
| S3 | `/investment` shows the wallet's position in reais as in → out (deposited, claimed), and "You receive" in reais at the current value. No annual rate, APY or projection. | F13. |
| S4 | `/reserve/claims` shows filed, paid and settled timestamps and the filed → settled duration. | F10; [N] is read from it. |
| S5 | Optional: publish the IDL so Explorer decodes the Guarantee account (needs the upgrade Squads, 1 h lock). Raw bytes are acceptable. | F4. |

## Notes (no change needed)

- **A frozen redemption** shows "pending" with an amber preview note. v4 keeps the reserve covered, so the capital beat isn't affected.
- **The Explorer shot (F4)** can't be tested on localnet; check it on devnet right after staging.
- The architecture mini-map, the badge, the meter, the chips and the labels are drawn in the edit.

## Per beat

### Beat 1 · The stakes (F1) · `/reserve` Overview
- Loads with no wallet: stable assets, coverage required, free capital, active guarantees.

### Beat 2 · Agency side (F2) · `app.mutav.finance`
- A demo agency account in the agency platform (mutav-app) with a fictional lease for "Ana", Passo Fundo, rent R$1,500, guarantor MUTAV. Fictional data only. Or the harness's agency stub.

### Beat 3 · Ana's lease on-chain (F3–F5) · `/operator`, Explorer, `/reserve/coverage`
- The register form with rent 1500, default 6×, exit 6×; the gate preview shows new cover, coverage required after (`25%`) and headroom.
- M5 applies. The signature is available for the "Signed by operator" chip and the Explorer link.
- `/reserve/coverage` lists the new guarantee and updates within one poll.

### Beat 4 · The refusal (F6–F7) · `/operator`
- The preview turns red with the shortfall (`R$1,000 short`); the send action stays available.
- M4 applies.

### Beat 5 · Rent goes unpaid (F8–F10) · `/operator`, `/reserve/claims`
- `file_claim`, `pay_claim` (with the R$15,000 per-call cap shown), `settle_payout`. M3 and S4 apply.

### Beat 6 · Capital payoff (F11–F13) · `/operator`, `/reserve`, `/investment`
- `contribute_fees` shows the split (20% take, the rest to the reserve). M1, M2, S2 and S3 apply.

### Beat 7 · Close (F14)
- Editor card; no app work.

## Capture harness → v4

The harness on `feat/demo-capture` (routes and locators in `app/e2e/demo/pages.ts`) was built for v2: the under-coverage take at c = 0.10, seeding c × R$100k. A code session must change:

1. **The take:** the stays-covered flow. Drop the under-coverage step; the reserve stays covered throughout.
2. **The numbers via `DEMO_PARAMS`:** an ADR 0028 seed (c = 0.25) with the v4 state: deposits A R$40,000 and B R$4,000; 8 leases at rent 1500, default 6×, exit 6×; then Ana (`MTV-PF-0009`), the refused `MTV-PF-0010`, claim R$1,500 (`NTC-PF-0001`), and fees R$3,060.
3. **The fee and payoff beats:** `contribute_fees`; `refresh`; on `/investment`, B's `request_redeem` of 4,000 shares, the admin `fulfil_redeems` fill and B's `claim_assets` (expected R$4,086.18).
4. **The agency stub** for F2 (or a hand capture from the agency platform).
5. **The #45 routes:** `/reserve/coverage`, `/reserve/claims`, `/investment`, with locators for the restyled components.
6. **Holds:** 2× stills on F4, F6, F7, F10, F12 and F13, where the edit zooms past 1.3×.

Capture spec as built: Chromium's screencast delivers 1080p at 30 fps, and 2× stills are saved on holds only. Zooms over motion stay at or below 1.3×; zooms on holds can reach 2× using the stills.

## Devnet staging (before recording)

Values from ADR 0028: c = 0.25, max_tvl R$1M, R$120k per guarantee, claim caps R$15k per call and R$20k per 31 days, requests R$1k–R$100k, fee take 20%. Total devnet BRS needed ≈ R$47,060 (≈ R$47,418 with the optional issuer-revenue sweep).

| # | Step | Signer | Wait |
|---|---|---|---|
| 1 | Deploy, `initialize`, `verify.ts` green | Upgrade Squads 2-of-2 | 1 h time lock |
| 2 | App deployed for devnet with M1–M5 | App owner | — |
| 3 | Fund BRS: capital wallet A R$40,000, capital wallet B R$4,000, operator R$3,060 (+R$358 for the optional sweep); SOL for each | BRS holder | — |
| 4 | `set_allowlist_root` with A and B (skip if set at `initialize`) | Admin Squads 2-of-2 | 5 min time lock |
| 5 | `request_deposit`: A 40,000, B 4,000 | A, B | — |
| 6 | `fulfil_deposits` (count 2), then `claim_shares` from A and B | Admin Squads 2-of-2; A, B | 5 min time lock |
| 7 | Register 8 leases: rent 1,500, default 6×, exit 6× (R$18,000 cover each), references `MTV-PF-0001…0008`, 2–3 fictional agency names | Operator | — |
| 8 | Check: stable R$44,000, required R$36,000, free R$8,000, 8 active, value per share 1.000000 | Anyone | — |
| 9 | During recording: Ana, the refused lease, claim R$1,500, pay, settle, `contribute_fees` R$3,060, `refresh` | Operator; anyone for `refresh` | — |
| 10 | During recording: B `request_redeem` 4,000 shares → `fulfil_redeems` (count 1) → B `claim_assets` (R$4,086.18) | B; Admin Squads 2-of-2 | 5 min time lock |

Free capital before Ana must be in [R$4,500, R$9,000) so that Ana fits and the next equal lease is refused. If staging drifts, close stray leases with `close_guarantee` VOID.

## Restore path

None is needed for this cut: the reserve stays covered throughout and ends with free capital R$736.82, mode Normal. If any take leaves the reserve under-covered, restore it with a deposit and a Squads `fulfil_deposits` (allowed while under-covered: `programs/mutav/src/instructions/capital/fulfil_deposits.rs` calls it the recapitalization path; it is gated only by pause, the fulfil halt and the TVL cap), then send `refresh`, which is the only instruction that changes the mode. The alternative without the multisig is `close_guarantee` RELEASED on demo leases, then `refresh`.

## Publicly visible afterwards

- `/reserve`: covered, mode Normal, stable R$40,861.82, required R$40,125, value per share 1.021545.
- Ana's guarantee: active, default left R$7,500, exit left R$9,000, opaque id only.
- `/reserve/claims`: one claim, R$1,500, filed → paid → settled.
- `/reserve/capital`: deposits R$40,000 and R$4,000, one fee receipt, one claim payment, one redemption of R$4,086.18.
- The refused lease leaves nothing on-chain.
