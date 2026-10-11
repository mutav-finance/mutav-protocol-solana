# Table of contents

* [MUTAV documentation](README.md)

## Introduction

* [Welcome to MUTAV](introduction/README.md)
* [What is MUTAV](introduction/what-is-mutav.md)
* [How it works](introduction/how-it-works.md)
* [Transparency](introduction/transparency.md)
* [Glossary](introduction/glossary.md)

## For rental agencies

* [For rental agencies](for-agencies/README.md)
* [Guarantee lifecycle](for-agencies/guarantee-lifecycle.md)
* [Claims](for-agencies/claims.md)
* [Guarantee fees](for-agencies/fees.md)

## For capital providers

* [For capital providers](for-capital-providers/README.md)
* [Deposits and redemptions](for-capital-providers/deposits-and-redemptions.md)
* [Share value](for-capital-providers/share-value.md)
* [Risks](for-capital-providers/risks.md)

## Reserve framework

* [Reserve framework](reserve-framework/README.md)
* [Coverage model](reserve-framework/coverage-model.md)
* [Claims and payments](reserve-framework/claims-and-payments.md)
* [Assets and income](reserve-framework/assets-and-income.md)
* [Unsolicited money](reserve-framework/unsolicited-money.md)
* [Parameters](reserve-framework/parameters.md)

## Architecture

* [Architecture](architecture/README.md)
* [Components](architecture/components.md)
* [Roles and trust](architecture/roles-and-trust.md)
* [Accounts](architecture/accounts.md)
* [Money flows](architecture/money-flows.md)
* [State machines](architecture/state-machines.md)
* [Upgrades and layout](architecture/upgrades-and-layout.md)

## Security and verification

* [Security and verification](security/README.md)
* [Invariants](security/invariants.md)
* [Governance and keys](security/governance-and-keys.md)
* [Incident response](security/incident-response.md)
* [Reviews and audits](security/reviews-and-audits.md)
* [Known limitations](security/known-limitations.md)

## Technical resources

* [Technical resources](technical-resources/README.md)
* [Configuration and reference](technical-resources/configuration-and-reference.md)
* [Program reference](technical-resources/program-reference.md)
* [Math reference](technical-resources/math-reference.md)
* [Client SDK](technical-resources/client-sdk.md)
* [Deployment and operations](technical-resources/deployment-and-operations.md)
* [FAQ](technical-resources/faq.md)

## Research

* [Research](research/README.md)
  * [BRL currencies on Solana](research/brl-currencies-on-solana.md)
  * [Multi-asset vaults on Solana](research/multi-asset-vaults-on-solana.md)
  * [OnRe (ONyc) as a comparable](research/onre-comparable.md)
  * [Solana landscape and stack](research/solana-landscape-and-stack.md)
  * [Redemption economics: partial head fills and phase-2 instant exit](research/redemption-economics.md)
  * [Upgrade readiness: adding partial fills and instant exit to a live reserve](research/upgrade-readiness.md)
  * [Eviction and exit costs in South Brazil](research/brazil-eviction-and-exit-costs.md)
  * [Function-by-function vault comparison](research/vault-function-comparison.md)
  * [On-chain exposure and claims registries](research/onchain-exposure-and-claims-registries.md)

## Decisions and sources

* [Decisions](meta/decisions.md)
* [Open questions and possible improvements](meta/open-questions.md)
* [Sources](meta/sources.md)

## Reference documents

* [Specification](spec.md)
* [Architecture decision records](meta/decisions.md#architecture-decision-records)
  * [ADR 0001: Record architecture decisions](decisions/0001-record-architecture-decisions.md)
  * [ADR 0002: One core program plus adapter programs with capped sub-authorities](decisions/0002-core-program-and-capped-adapters.md)
  * [ADR 0003: Claim payments operated by MUTAV through a whitelisted payments account](decisions/0003-payments-operated-by-mutav.md)
  * [ADR 0004: NAV computed on-chain with internal accounting, provisions at filing and bounded prices](decisions/0004-onchain-nav-internal-accounting.md)
  * [ADR 0005: Solvency gate scope: capital flows and new guarantees, never claim payments](decisions/0005-solvency-gate-scope.md)
  * [ADR 0006: Per-lease coverage stored as absolute amounts](decisions/0006-per-lease-absolute-coverage.md)
  * [ADR 0007: MUTAV's fee take goes directly to the treasury](decisions/0007-fee-take-direct-to-treasury.md)
  * [ADR 0008: One capital flow for everyone; FIFO deposits; pause never blocks claims](decisions/0008-uniform-capital-flow-and-pause-scope.md)
  * [ADR 0009: Guarantee fees, MUTAV operation and MUTAV's reserve share are separate flows](decisions/0009-separate-mutav-money-flows.md)
  * [ADR 0010: Partial fills at the head of the redemption queue](decisions/0010-partial-fills-at-queue-head.md)
  * [ADR 0011: Phase-2 instant exit, earmark-aware solvency and upgrade readiness](decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)
  * [ADR 0012: Guarantees aligned with a limited fiança onerosa](decisions/0012-fianca-aligned-guarantee-lifecycle.md)
  * [ADR 0014: `pay_claim` bound with concurrent filings on one leg](decisions/0014-pay-claim-bound-with-concurrent-filings.md)
  * [ADR 0015: Admin clear for the NAV-move halt](decisions/0015-admin-clear-fulfil-halt.md)
  * [ADR 0016: Coverage ratio below 1.0, with a 0.10 floor and a provisions term](decisions/0016-coverage-ratio-below-one.md)
  * [ADR 0017: BRS income intake: an income inbox and `sweep_income`](decisions/0017-brs-income-intake.md)
  * [ADR 0018: BRS-only pilot reserve; assets expand through adapters](decisions/0018-brs-only-pilot-reserve.md)
  * [ADR 0019: v1 layout for the devnet release](decisions/0019-v1-layout-for-the-devnet-release.md)
  * [ADR 0020: Operator/admin separation and operator-compromise recovery](decisions/0020-operator-admin-separation-and-recovery.md)
  * [ADR 0021: Claims: approval, amendment and exact payment](decisions/0021-claims-approval-amendment-exact-payment.md)
  * [ADR 0022: Coverage: stress buffer and underwater reserve](decisions/0022-coverage-stress-buffer-underwater-reserve.md)
  * [ADR 0023: Capital flows and exit rights](decisions/0023-capital-flows-and-exit-rights.md)
  * [ADR 0024: Unsolicited money and backstop contributions](decisions/0024-unsolicited-money-and-backstop.md)
  * [ADR 0025: Exit fallback: a cooldown exit after `max_queue_wait_secs`](decisions/0025-exit-fallback-cooldown-exit.md)
  * [ADR 0026: Program simplification for the freeze](decisions/0026-program-simplification-for-the-freeze.md)
  * [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing (proposed)](decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md)
  * [ADR 0028: Pilot parameters](decisions/0028-pilot-parameters.md)
  * [ADR 0029: Claims and capital rules in the program](decisions/0029-claims-and-capital-rules-in-the-program.md)
* [Litepaper](litepaper.md)
