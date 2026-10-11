# Demo: app and devnet requirements

What the pilot app and the staged devnet state must provide before the product demo is recorded. These are written requirements for the code sessions; owners are unassigned. The cut is described in [`script.md`](script.md) and [`storyboard.html`](storyboard.html) (v3).

The recording assumes the restyle in PR #45 (`feat/app-landing`) is merged with `main` and deployed to `reserve.mutav.finance` against the devnet program. A cleaned `/demo` is the optional alternative surface; the requirements below apply to whichever surface is recorded.

## Global (every beat)

| # | Requirement | Why |
|---|---|---|
| G1 | **Reais on `/reserve` (all tabs) and `/investment`** when recording: amounts shown as `R$` (e.g. `R$44,632.00`), not USD at a display rate. A config switch or env flag is enough; the chain amount is BRS 1:1 BRL. | The story is in reais; a USD conversion invites "which rate?" and hides the R$4,000 in → R$4,057.45 out payoff. |
| G2 | **Disclaimer line restored**, visible on `/investment` and in the `/reserve` footer or Capital tab: "Pilot capital is MUTAV's own; not open to outside investors." | Shown on screen during the capital payoff (F14). |
| G3 | **Persistent devnet badge** in the nav on every page (the cluster badge exists; it must be visible in the restyled nav). | Recommended: every frame says where it runs. |
| G4 | **Persistent coverage meter** in the nav or page header: `REQUIRED R$x / HELD R$y`, read from the same view as `/reserve`, updating on each poll. If not built, the editor overlays it from the numbers table. | The refusal beat shows the meter not moving. |
| G5 | Terminology in the UI: "coverage gate", "required coverage", "guarantee fee", "guarantor". No "solvency", "premium" or "insurance" in visible copy. | Consistent with the VO and captions. |
| G6 | Program error names surface in the transaction status (e.g. `Failed · InsufficientFreeCapital`), from the simulation logs. Exists today; keep it through the restyle. | F8. |

## Per beat

### Beat 1 · Hook (F1) · `/reserve` Overview
- Loads with no wallet; shows stable assets, coverage required, free capital, active guarantees, and the "live from devnet" line.

### Beat 2 · Agency side (F2–F3) · `app.mutav.finance`
- A demo agency account in the agency platform (mutav-app) with a fictional lease for "Ana", Passo Fundo, rent R$1,000, guarantor MUTAV. Fictional data only.
- On-screen label for the whole shot: "agency platform · built before the hackathon · not yet connected on-chain" (may be an editor overlay if the platform cannot show it).
- The architecture strip is an editor card; no app work.

### Beat 3 · Ana's lease on-chain (F4–F6) · `/operator`, Explorer, `/reserve/coverage`
- **R1. The register form accepts default cover up to 12× rent** (today's form caps both multipliers at 6×). Exit stays up to 6×. Alternatively, accept cover amounts directly. The program has no multiplier limit; the per-guarantee cap is R$120,000.
- The gate preview shows new cover, coverage required after (with `25%`), stable assets and headroom.
- **R2. A status chip after confirmation** with the short signature (`4kQm…x9Tz`) linking to Explorer on devnet. Exists as `TxStatus`; keep it prominent in the restyle.
- Explorer: optional, publish the IDL so the Guarantee account decodes. It needs the upgrade authority (upgrade Squads, 1 h lock). Raw bytes are acceptable.
- `/reserve/coverage` lists the new guarantee with default and exit cover left, and updates within one poll.

### Beat 4 · The refusal (F7–F8) · `/operator`
- The preview turns red with "Would be refused: InsufficientFreeCapital" and the shortfall (`R$1,000 short`).
- The "Send anyway" action stays available when the preview is red.
- **R3. A "Coverage gate · refused" chip** next to the failed status when the program error is `InsufficientFreeCapital` or `UnderCovered` (an editor overlay is the fallback).
- The coverage meter (G4) stays unchanged after the refusal.

### Beat 5 · Rent goes unpaid (F9–F11) · `/operator`, `/reserve/claims`
- `file_claim`, `pay_claim` and `settle_payout` tabs as today; the pay tab shows the per-call cap (R$15,000) and the period cap.
- **R4. `/reserve/claims` on devnet shows the line** "PIX transfer simulated on devnet · settlement recorded on-chain".
- The claims table shows filed, paid and settled timestamps and the filed → settled duration.

### Beat 6 · Capital payoff (F12–F14) · `/operator`, `/reserve`, `/investment`
- `contribute_fees` shows the split: 20% take to the treasury, the rest to the reserve.
- Optional `sweep_income`, captioned "issuer revenue · simulated on devnet".
- **R5. `/reserve` Overview shows NAV per share** and stable assets (and their history chart, if present) after a `refresh`. If the published value lags, show the "now" value computed from accounts.
- **R6. `/investment` shows the position in reais as in → out**: for the connected wallet, the BRS deposited (from its filled deposit requests) and the BRS claimed from redemptions, e.g. "Deposited R$4,000.00 · Claimed R$4,057.45". The redeem card's "You receive" shows reais at NAV now.
- **R7. No rate on investor pages:** no annual rate, APY or projected return.
- G2 disclaimer visible in the same frame.

### Beat 7 · Close (F15)
- Editor card; no app work.

## Devnet staging (before recording)

Values from ADR 0028: c = 0.25, max_tvl R$1M, R$120k per guarantee, claim caps R$15k per call and R$20k per 31 days, requests R$1k–R$100k, fee take 20%. Total devnet BRS needed ≈ R$46,040.

| # | Step | Signer | Wait |
|---|---|---|---|
| 1 | Deploy, `initialize`, `verify.ts` green | Upgrade Squads 2-of-2 | 1 h time lock |
| 2 | App env for devnet; G1–G4 deployed | App owner | — |
| 3 | Fund BRS: capital wallet A R$40,000, capital wallet B R$4,000, operator R$2,040 (+R$356 for the optional sweep); SOL for each | BRS holder | — |
| 4 | `set_allowlist_root` with A and B (skip if set at `initialize`) | Admin Squads 2-of-2 | 5 min time lock |
| 5 | `request_deposit`: A 40,000, B 4,000 | A, B | — |
| 6 | `fulfil_deposits` (count 2), then `claim_shares` from A and B | Admin Squads 2-of-2; A, B | 5 min time lock |
| 7 | Register 8 leases: rent 1,000, default 12×, exit 6× (R$18,000 cover each), references `MTV-PF-0001…0008`, 2–3 fictional agency names | Operator | — |
| 8 | Check: stable R$44,000, required R$36,000, free R$8,000, 8 active, NAV 1.000000 | Anyone | — |
| 9 | During recording: Ana (`MTV-PF-0009`), the refused `MTV-PF-0010`, claim R$1,000 (`NTC-PF-0001`), pay, settle, `contribute_fees` R$2,040, `refresh` | Operator; anyone for `refresh` | — |
| 10 | During recording: B `request_redeem` 4,000 shares → `fulfil_redeems` (count 1) → B `claim_assets` (R$4,057.45) | B; Admin Squads 2-of-2 | 5 min time lock |

Free capital before Ana must be in [R$4,500, R$9,000) so that Ana fits and the next equal lease is refused. If staging drifts, close stray leases with `close_guarantee` VOID.

## Restore path

None is needed for this cut: the reserve stays covered throughout and ends with free capital R$324.55, mode Normal. If any take leaves the reserve under-covered, restore it with a deposit and a Squads `fulfil_deposits` (allowed while under-covered: `programs/mutav/src/instructions/capital/fulfil_deposits.rs` calls it the recapitalization path; it is gated only by pause, the fulfil halt and the TVL cap), then send `refresh`, which is the only instruction that changes the mode. The alternative without the multisig is `close_guarantee` RELEASED on demo leases, then `refresh`.

## Publicly visible afterwards

- `/reserve`: covered, mode Normal, stable R$40,574.55, required R$40,250, NAV per share 1.014364.
- Ana's guarantee: active, default left R$11,000, exit left R$6,000, opaque id only.
- `/reserve/claims`: one claim, R$1,000, filed → paid → settled, with the simulated-PIX line (R4).
- `/reserve/capital`: deposits R$40,000 and R$4,000, one fee receipt, one claim payment, one redemption of R$4,057.45.
- The refused lease leaves nothing on-chain.
