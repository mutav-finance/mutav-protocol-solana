# Chapter 3 simulation ledger

[`ch3-simulation-ledger.json`](ch3-simulation-ledger.json) is the receipt behind chapter 3 of the demo video: every figure in the chapter 3 motion piece and its captions comes from this file.

> **Simulation of reserve mechanics · not an expected return**

## What it is

A local simulation of six months of reserve activity, run against the real MUTAV program on a local Surfpool validator with an accelerated clock and a mock BRS mint. The clock is moved forward month by month, so every date is simulated chain time. Keys are throwaway and no real money is involved.

**The signatures in the file are local-chain signatures. They are not devnet or mainnet transactions and cannot be found on Solana Explorer.** Addresses in `meta` (program, config, mint, admin multisig, wallets) are local-run public keys.

**Period:** November 2026 to April 2027, on the simulated clock (statement months 1–6).

## Headline numbers

| Item | Value |
|---|---|
| Share price | 1.0000 → 1.1439 (rises every month, no dip) |
| Capital provider (investor-1) | R$20,000 in (2026-11-02, at 1.000000 per share) → R$22,878.27 out (2027-04-27, at 1.143913) |
| Claims | C1 R$1,800 (Dec), C2 R$2,800 (Feb), C3 R$2,300 (Mar), each filed → paid → settled; all under the R$15,000 per-call cap, so none needed admin approval |
| Coverage ceiling ("can back up to") | R$489.9k (end of Nov) → R$611.1k (end of Apr); it peaks at R$637.8k at the end of Mar |
| Reserve at the end | R$152,776.54 held; 20 leases, cover R$515,100; required R$128,775 |

The inputs (rents, fee rate, the reserve-yield assumption for the BRS issuer revenue, deposits, claims, the redemption) are listed in `meta.sim_config`. They are scenario choices for the simulation, not forecasts.

## The fields

The file has three top-level keys.

- **`meta`**: the title and disclaimer, the simulated start and end, the local-run addresses, `sim_config` (profile `v2`: coverage ratio 0.25, guarantee fee 12% of rent with one fifth taken by the MUTAV treasury, the leases, claims, deposits and redemptions the run scripted), `fields` (a definition for every op field) and `notes`.
- **`ops[]`**: one entry per reserve-affecting operation, in chain order: `deposit`, `fee`, `take_to_treasury`, `issuer_income`, `claim_filed`, `claim_paid`, `withdrawal`, `refresh`. Each entry has the simulated month and timestamp, the signed change to the reserve (`amount_brs`), the reserve state after it (`reserve_after`, `required_after`, `ceiling_after`, `free_capital_after`, `provisions_after`, `cover_in_force_after`, `active_leases_after`, `shares_outstanding_after`, `treasury_after`) and its local-chain `signature`. Lease registrations and `settle_payout` (which records the PIX reference and moves no money) are not listed.
- **`months[]`**: one summary per simulated month: fees gross and net, the treasury take, the BRS issuer revenue, claims filed and paid, deposits and withdrawals, the operating result, and the reserve, share price and ceiling at the start and end of the month.

Fields worth reading carefully:

| Field | Meaning |
|---|---|
| `nav_after` | The published share price after the op: net assets (reserve minus open claim provisions) divided by shares outstanding, computed live from the accounts. This is the "share value" in the video. |
| `conversion_nav_after` | The price deposits and redemptions convert at. It uses the program's virtual-offset conversion, so it can differ from `nav_after` in the last decimal place (for example 1.003759999 vs 1.003760000). |
| `provision_brs` | On `claim_filed`: the provision booked for the claim. It moves no BRS (`amount_brs` is 0) but lowers net assets, and so the share price, until the claim is paid. |
| `treasury_amount_brs` | On `take_to_treasury`: the part of a guarantee fee paid to the MUTAV treasury. It is moved in the same instruction as the fee (same signature) and never enters the reserve, so its `amount_brs` is 0. |

## How it was produced

By a simulation harness kept outside this repo (profile v2), which drives the MUTAV program on a local Surfpool validator, warps the clock month by month and reads the accounts after each operation. The chapter 3 motion piece is rendered from this file; nothing in it is typed by hand.

## Contrast with production

The live demo (the cold open and chapters 1–2) runs on Solana devnet: program `GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV`, with the reserve app at [reserve.mutav.finance](https://reserve.mutav.finance), where every account links to Explorer. This ledger is not devnet activity; it shows how the reserve mechanics behave over six months, nothing more.
