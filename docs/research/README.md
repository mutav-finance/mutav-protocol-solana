# Research

The research behind MUTAV's design: the BRL assets and rails available on Solana, comparable protocols, the economics of exits and upgrades, and the cost of a lease default in Brazil. Each page is dated. The pages are curated from the team's working notes and kept as written, with four kinds of edits:

- **Later decisions.** Where a decision changed what a page assumed or proposed, a note headed *Since this research* follows the original text and links the ADR. The history is not rewritten.
- **Citations.** Every source the notes cited is kept, and each page ends with its sources. A number with no source is marked "(unverified)".
- **Language.** Text describing MUTAV follows the project's terms: "reserve", "guarantee fee", "claim". Third-party names and quotes keep their own terms.
- **Removals.** Personal data, private partner terms, keys or addresses of personal wallets, legal advice and counsel material, and notes on defects in MUTAV's code (those are tracked in [reviews and audits](../security/reviews-and-audits.md) and [known limitations](../security/known-limitations.md)) are left out.

Nothing here is legal or investment advice. Business and legal research (pricing, partner terms, the counsel brief and MUTAV's regulatory analysis) stays private.

## Pages

| Page | Research date | Summary | Status |
|---|---|---|---|
| [BRL currencies on Solana](brl-currencies-on-solana.md) | 2026-10-01 | The live BRL economy on Solana is under R$2M with no two-sided DEX liquidity, so rails come from issuer APIs; BRS, TESOURO, BRZ and BRD compared, plus PIX ramps and the Brazilian rules on conversion legs | Curated; partly superseded (BRS-only pilot, income inbox, payout SLA) |
| [Multi-asset vaults on Solana](multi-asset-vaults-on-solana.md) | 2026-10-10 | How production Solana vaults hold several assets, why every major loss corrupted a NAV input, and why TESOURO should be priced from Etherfuse's BRL `BondPrice` behind a hard BRS liquidity floor | Current; input to ADR 0027 (proposed) |
| [OnRe (ONyc) as a comparable](onre-comparable.md) | 2026-09-30 (redemption deep dive 2026-10-01) | How OnRe's open-source program prices NAV, queues redemptions and runs its liquidity vault, mapped part by part to MUTAV's design, with what MUTAV adopted and what it did not | Curated; partly superseded (role handover, exit rights, cooldown exit, pause scope) |
| [Solana landscape and stack](solana-landscape-and-stack.md) | 2026-09-30 | Solana protocols close to MUTAV (RWA yield, BRL tokens, vaults, queues, attestations) and the stack choices for the program, client, tests and multisig | Curated; partly superseded (BRS-only pilot, allowlist root, two multisigs, simplification) |
| [Redemption economics: partial head fills and phase-2 instant exit](redemption-economics.md) | 2026-10-02 | How partial fills at the queue head and a buffer-backed instant exit would work, priced against comparable protocols, with the earmark that keeps claims first | Curated; largely superseded (whole fills in the pilot, phase-2 state removed for the freeze, cooldown exit) |
| [Upgrade readiness: adding partial fills and instant exit to a live reserve](upgrade-readiness.md) | 2026-10-01 to 2026-10-02 | What the v1 layout, events and governance must reserve so later features land by upgrade without migrating live accounts | Curated; largely superseded (v1 layout, two multisigs with time locks, simplification) |
| [Eviction and exit costs in South Brazil](brazil-eviction-and-exit-costs.md) | 2026-10-02 | How often leases in South Brazil end in eviction, how long and how much an eviction costs, and the exit costs of an ordinary move-out, from DataJud and public sources | Curated; claim sizing since refined (per-event claims, stress buffer) |
| [Function-by-function vault comparison](vault-function-comparison.md) | 2026-10-10 | OnRe, Kamino kVault, the Solana Foundation vault standard, SVS and Voltr compared with MUTAV instruction by instruction, with the patterns MUTAV adopted before the layout freeze | Current; inputs to ADRs 0019–0027 |
| [On-chain exposure and claims registries](onchain-exposure-and-claims-registries.md) | 2026-10-10 | Cover, credit, guarantee and lease registries on-chain and in Brazil: record models, capital requirements, losses, privacy, failures, and what MUTAV's guarantee registry should adopt or avoid | Current |

## Sources

- [Decisions index](../meta/decisions.md)
- [Open questions and possible improvements](../meta/open-questions.md)
- [Sources](../meta/sources.md)

## Decisions

- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) (proposed)
