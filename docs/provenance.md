# Development provenance

This document separates the work done during the hackathon from prior MUTAV work and from third-party code, as the submission requires.

## Hackathon window

- **Hackathon:** Colosseum Crypto World's Fair (Solana track and Superteam BR Brazil track).
- **Window:** 2026-09-14 → 2026-10-12 (submission due 2026-10-12, 23:59 BRT).
- **This repository** (`mutav-finance/mutav-protocol-solana`) was **created on 2026-10-01**. Every commit in it falls inside the window.

## Prior MUTAV work

Work that existed before this repository and that this build relies on:

| Repository | What it holds | How it is used here |
|---|---|---|
| `mutav-finance/mutav` | Business model, market research, compliance work, pitch material | Source of the business rules that [`spec.md`](spec.md) implements |
| `mutav-finance/mutav-app` | The guarantee-operations platform: agency onboarding, leases and guarantees, pricing, claim verification, invoices and PIX collection, admin console | Consumes this repo's client; the integration tasks (plan Tasks 14–18) are built there |
| `mutav-finance/mutav-pulse` | An earlier reserve-vault prototype | Reference design for the reserve accounting, solvency gate and investor flows. Logic carried over from it is reimplemented for this program and noted here as it lands |

## Third-party code

| Source | License | Use |
|---|---|---|
| [`solana-foundation/vault`](https://github.com/solana-foundation/vault) | MIT | The async deposit/redemption core is forked and adapted. Its unrestricted asset withdrawal is removed. Affected files carry an attribution header |
| [`onre-finance/onre-sol`](https://github.com/onre-finance/onre-sol) | MIT | Patterns: Squads-held admin authority, supply caps, per-purpose token accounts. Any adapted code carries an attribution header |

Attributions are collected in [`NOTICE`](../NOTICE).

## Built during the hackathon

*Fill in as work proceeds. One line per deliverable, with the PR or commit link.*

| Date | Deliverable | Link |
|---|---|---|
| 2026-10-01 | Repository created; Anchor workspace scaffold | |
| 2026-10-01 | Protocol spec, implementation plan, ADRs 0001–0006, repo docs | |
| | | |
