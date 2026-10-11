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
| [`solana-foundation/vault`](https://github.com/solana-foundation/vault) | MIT | Design reference: account and authority structure, the async request lifecycle and the mint-extension guard. Early drafts (2026-10-06) were described as adapted; the code has since been rewritten for MUTAV and no upstream code remains (checked against commit `c359962` on 2026-10-10). The unrestricted asset withdrawal was never carried over |
| [`onre-finance/onre-sol`](https://github.com/onre-finance/onre-sol) | MIT | Patterns: Squads-held admin authority, supply caps, per-purpose token accounts. **Design reference for redemptions** (read at commit `c049083`): per-request partial fills (`RedemptionRequest.fulfilled_amount`, priced per fill) behind [ADR 0010](decisions/0010-partial-fills-at-queue-head.md); the Prop AMM sell (convex haircut kept in the vault, decayed exit-volume tracker, `minimum_out`) behind the phase-2 instant exit, and its `reserved`-byte layouts and `layout_compatibility.rs` test behind the upgrade-readiness rules ([ADR 0011](decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)). MUTAV changes the design: strict FIFO head-only fills, a separate earmark so instant exits never draw on queue capacity, a split-proof integral haircut, automatic disables. No OnRe code is copied |

Both are credited in the [README acknowledgements](../README.md#acknowledgements). Code copied from a third party in the future must carry its original licence header and be listed there.

## Built during the hackathon

*Fill in as work proceeds. One line per deliverable, with the PR or commit link.*

| Date | Deliverable | Link |
|---|---|---|
| 2026-10-01 | Repository created; Anchor workspace scaffold | |
| 2026-10-01 | Protocol spec, implementation plan, ADRs 0001–0006, repo docs | |
| 2026-10-02 | Redemption liquidity design: partial fills at the queue head, phase-2 instant exit, upgrade readiness (spec §5.5, §13, §14; ADRs 0010, 0011) | |
| 2026-10-06 | Task 1: core state (`VaultConfig`, `VaultState`), `initialize`, roles, pause, mint guard; account and authority skeleton adapted from `solana-foundation/vault` | |
| | | |
