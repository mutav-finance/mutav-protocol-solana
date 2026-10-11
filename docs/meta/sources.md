# Sources

This page lists the documents, code and external references the MUTAV documentation is built on. Each documentation page also ends with its own short source list.

**Precedence.** Where sources disagree, the newest decision wins. For the devnet release the order is:

1. The decisions of the devnet release design, indexed in [Decisions](decisions.md).
2. The ADRs in [`docs/decisions/`](../decisions/).
3. [`spec.md`](../spec.md), which is updated with each ADR.
4. The litepaper and the business documents in the `mutav` repository.

## MUTAV documents in this repository

| Document | Path | What it holds |
|---|---|---|
| Program specification | [`docs/spec.md`](../spec.md) | Source of truth for accounts, instructions, invariants, caps, events and errors. Key parts: [§1 Principles](../spec.md#1-principles), [§2 Roles and keys](../spec.md#2-roles-and-keys), [§4 Invariants and formulas](../spec.md#4-invariants-and-formulas), [§5 Instructions](../spec.md#5-instructions), [§8 Caps](../spec.md#8-caps), [§12 Open questions](../spec.md#12-open-questions), [§14 Upgrade readiness](../spec.md#14-upgrade-readiness), [§15 Glossary](../spec.md#15-glossary) |
| Architecture decision records | [`docs/decisions/`](../decisions/) | ADRs 0001 to 0029 (0013 is not used); see [Decisions](decisions.md) |
| Litepaper | [`docs/litepaper.md`](../litepaper.md) | The problem, the product, the reserve model, capital flows, risks and roadmap; appendix E lists its references |
| Implementation plan | [`docs/plan.md`](../plan.md) | Build tasks and their history |
| Development provenance | [`docs/provenance.md`](../provenance.md) | What was built during the hackathon, prior MUTAV work and third-party code |
| Repository README | [`README.md`](../../README.md) | Layout, build, test, deploy steps and devnet addresses |
| Pilot app specification | [`app/docs/spec.md`](../../app/docs/spec.md) | Routes and behaviour of the pilot web app |
| Licence and acknowledgements | [`README.md`, Licence and Acknowledgements](../../README.md#license), [`LICENSE`](../../LICENSE) | Code is MIT, Copyright (c) 2026 MUTAV; the MUTAV name and brand are not MIT-licensed. Third-party design references are acknowledged there and in [`docs/provenance.md`](../provenance.md) |

### Program code

| Area | Path |
|---|---|
| Program entry point and instruction list | [`programs/mutav/src/lib.rs`](../../programs/mutav/src/lib.rs) |
| Accounts | [`programs/mutav/src/state/`](../../programs/mutav/src/state/) |
| Instructions by role | [`programs/mutav/src/instructions/`](../../programs/mutav/src/instructions/) (`admin/`, `operator/`, `capital/`, `public/`, `reserve/`) |
| Coverage maths (required coverage, the coverage gate, underwater check) | [`programs/mutav/src/solvency.rs`](../../programs/mutav/src/solvency.rs), [`math.rs`](../../programs/mutav/src/math.rs) |
| Pricing | [`programs/mutav/src/pricing.rs`](../../programs/mutav/src/pricing.rs) |
| Mint and token-account guards | [`programs/mutav/src/token_guard.rs`](../../programs/mutav/src/token_guard.rs) |
| Allowlist proofs | [`programs/mutav/src/allowlist.rs`](../../programs/mutav/src/allowlist.rs) |
| Constants, events and errors | [`constants.rs`](../../programs/mutav/src/constants.rs), [`events.rs`](../../programs/mutav/src/events.rs), [`errors.rs`](../../programs/mutav/src/errors.rs) |
| Adapter interface and devnet mock | [`programs/mutav-adapter-interface/`](../../programs/mutav-adapter-interface/), [`programs/mutav-adapter-mock/`](../../programs/mutav-adapter-mock/) |
| Generated TypeScript client | `clients/js` (published as `@mutav-finance/mutav-protocol-solana`) |

The program code reflects the build at the time of writing. Where it differs from the devnet release design, the design described in these docs is the target.

## MUTAV business documents (`mutav-finance/mutav`)

These live in the separate `mutav` repository. They give the business, market and legal context; the program follows the spec, not these files.

| Document | Path in `mutav-finance/mutav` | Use |
|---|---|---|
| Repository overview | `README.md` | Entry point to the business documents |
| Protocol whitepaper | `docs/mutav-whitepaper.en.md` (also `.pt-br.md`, and `docs/mutav-whitepaper-v3.md`) | MUTAV as fiador under a fiança onerosa. It predates this program's design; where it differs, the spec wins |
| Compliance structure | `docs/operation/compliance-structure.md` | Operational flows, compliance processes and open decisions |
| Contract default scenarios | `docs/operation/contract-default-scenarios.md` | Guarantee and receivable lifecycle per lease: subrogation, cure after payment, closure |
| Default registration process | `docs/operation/default-registration-process.md` | The operational path for one default event |
| Pitch narrative | `docs/pitch-narrative.md` | Positioning |
| Reserve asset and on-chain ramp | `research/01-Protocol/reserve-asset-and-onchain-ramp.md` | Reserve asset options, BRS and the BRL ramp |
| Pay-in architecture | `research/01-Protocol/pay-in-architecture.md` | How guarantee fees are collected and reach the reserve |
| Brazilian rental market | `research/04-Brazil-Market-Regulation/brazil-rental-market-state.md` | Market context |
| Rental guarantee models | `research/04-Brazil-Market-Regulation/garantia-locaticia-models-and-industry.md` | The guarantee types agencies use today |
| Pilot legal requirements | `research/04-Brazil-Market-Regulation/pilot-minimal-legal-requirements.md` | The minimum legal checklist for the pilot |
| Counsel review of the legal form | `research/04-Brazil-Market-Regulation/recharacterization-counsel-review.md` | Questions for counsel on the fiança onerosa form |
| South region reserve scenarios | `research/04-Brazil-Market-Regulation/south-region-reserve-build-four-scenarios.md` | Reserve build-up scenarios for the pilot region |
| QuintoCred closure | `research/04-Brazil-Market-Regulation/quintocred-garantia-shutdown.md` | A market failure the product design responds to |
| Lei do Inquilinato source note | `research/06-Sources/lei-do-inquilinato-8245-1991.md` | Notes on Lei 8.245/1991 |
| Nora BRS source note | `research/06-Sources/nora-brs-stablecoin.md` | Notes on the reserve token's issuer |
| Governance and access security | `research/05-Security/Governance/` | Staff and admin access, custody and control frameworks |

## Solana and Anchor

| Reference | URL |
|---|---|
| Solana documentation | <https://solana.com/docs> |
| Accounts | <https://solana.com/docs/core/accounts> |
| Program derived addresses (PDAs) | <https://solana.com/docs/core/pda> |
| Cross-program invocation (CPI) | <https://solana.com/docs/core/cpi> |
| Transaction fees | <https://solana.com/docs/core/fees> |
| Tokens (SPL Token, associated token accounts) | <https://solana.com/docs/tokens> |
| Token-2022 extensions | <https://solana.com/docs/tokens/extensions> |
| Anchor framework (version 1.2.0 in this repo) | <https://www.anchor-lang.com/docs> |
| Verifiable builds (`solana-verify`) | <https://github.com/otter-sec/solana-verifiable-build> |
| LiteSVM (unit and integration tests) | <https://github.com/LiteSVM/litesvm> |
| Codama (client generation from the IDL) | <https://github.com/codama-idl/codama> |
| `solana-foundation/vault` (MIT; a design reference for the async deposit and redemption core, no code included) | <https://github.com/solana-foundation/vault> |

## Squads v4

The admin authority and the upgrade authority are Squads v4 multisigs with time locks.

| Reference | URL |
|---|---|
| Squads v4 program | <https://github.com/Squads-Protocol/v4> |
| Squads documentation | <https://docs.squads.so/> |

## Standards

| Standard | URL | Use |
|---|---|---|
| OWASP Smart Contract Top 10 (2026) | <https://scs.owasp.org/sctop10/> | Category checklist applied to the devnet release design |

## Brazilian legal references

Only the provisions cited in the spec or the litepaper are listed. The program records the fiança's ceiling, lifecycle and payments; the legal duties themselves sit with MUTAV (see [spec §2.2](../spec.md#22-mutav-as-fiador-off-chain-duties-adr-0012)). Items marked *[counsel]* in [spec §12](../spec.md#12-open-questions) are still under legal review.

| Law | Provisions cited | Topic in MUTAV | Text |
|---|---|---|---|
| Lei 8.245/1991 (Lei do Inquilinato) | art. 4 | Early-termination penalty (claim category 5, disabled by default) | <https://www.planalto.gov.br/ccivil_03/leis/l8245.htm> |
| | art. 17 | Rent cannot be set in foreign currency, so Brazilian guarantees stay in BRL | |
| | arts. 23 (I, III, V, VI, VIII, XII) and 25 | Tenant debts the claim categories map to | |
| | art. 37 II | The fiança as a lease guarantee; MUTAV's legal form | |
| | arts. 39 and 66 | Liability until the keys are returned; repossession after abandonment | |
| | art. 40 (II, X) | Replacing the guarantor; exoneration with 120 days' notice | |
| | art. 59 §1º IX | Eviction track when the guarantee is extinguished | |
| | art. 62 II | Court costs and fees owed by the tenant | |
| Código Civil (Lei 10.406/2002) | art. 206 §3º I | Three-year prescription of rent claims (bounds the claims tail) | <https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm> |
| | art. 308 | Payment to the creditor's representative (the agency under the landlord's mandate) | |
| | arts. 395 and 397 | Mora and its consequences; the payment term | |
| | arts. 818 to 839 (fiança) | 818, 820 the landlord as creditor; 819, 822, 823 the limited fiança and its ceiling; 821 liquidated debts; 826 replacing the fiador; 827 and 828 principal pagador; 831 to 833 subrogation; 835 exoneration; 838 release of the fiador | |
| | art. 955 | Insolvency, raised as a counsel question on public reserve figures | |
| STJ Súmula 214 | | No liability for addenda the fiador did not consent to | |
| Código de Defesa do Consumidor (Lei 8.078/1990) | art. 35 | Whether published payment targets bind MUTAV (litepaper, under counsel review) | <https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm> |

## Reserve token issuer

| Reference | Details |
|---|---|
| BRS by Nora | A BRL stablecoin on Solana and the pilot reserve's only asset ([ADR 0018](../decisions/0018-brs-only-pilot-reserve.md)). Documentation: <https://www.nora.finance/docs/integrate/core-concepts/brs-token> |
| Devnet mint | Nora's devnet BRS, `BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4`, classic SPL Token, 6 decimals ([explorer](https://explorer.solana.com/address/BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4?cluster=devnet)) |
| Mainnet mint | Set at deploy |
| Issuer income | Nora's revenue share reaches the reserve through the income inbox and `sweep_income` ([ADR 0017](../decisions/0017-brs-income-intake.md)). Its terms are open (spec §12 Q48) |
| First adapter candidate | Etherfuse stablebonds (TESOURO), pending a BRS path ([ADR 0018](../decisions/0018-brs-only-pilot-reserve.md)) and the items open with Etherfuse ([ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), [Open questions](open-questions.md#open-questions)): <https://etherfuse.com/products/stablebonds>, <https://docs.etherfuse.com/price-feeds> |

## Comparable programs studied for design patterns

MUTAV studied other Solana programs for patterns only. No third-party code is included; the design references are acknowledged in the [README](../../README.md#acknowledgements) and [`docs/provenance.md`](../provenance.md).

| Program | What was studied | Where it shows up in MUTAV |
|---|---|---|
| OnRe (`onre-finance/onre-sol`, read at commit `c049083`). Documentation: <https://docs.onre.finance/>, including the token configuration and reference pages. Code: <https://github.com/onre-finance/onre-sol> | A Solana program that mints a token at NAV and redeems through asynchronous requests, with a Squads-held admin authority, supply caps, per-purpose token accounts and reserved-byte account layouts | Partial fills per request ([ADR 0010](../decisions/0010-partial-fills-at-queue-head.md)); the convex exit haircut and reserved layouts ([ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)); two-step role handover ([ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md)); computing fees and rounding once per request, keeping cancel and claim open under pause and refusing zero-output fills ([ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)) |
| OnRe public audits | Public audit reports by Ackee Blockchain (November 2025), OtterSec (August 2026) and Quantstamp | Reviewed by issue class as an input to the devnet release design |
| `solana-foundation/vault` (MIT) | Account and authority structure and the async deposit and redemption lifecycle | A design reference; no code is included, and MUTAV has no unrestricted asset withdrawal ([README acknowledgements](../../README.md#acknowledgements)) |
| Request, cooldown and permissionless-exit patterns under timelocked governance (Ethena cooldowns, Marinade delayed-unstake tickets, the Maker governance security module) | How holders can always leave before a governance change takes effect | The exit fallback ([ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md)) |
| Kamino kVault and klend, Jupiter JLP, Sanctum Infinity, Voltr, Meteora's keeper | Multi-asset reserves: one token account and one config record per asset, targets and bands, rate-limited moves, a pinned price calculator, disable-only emergency powers | The proposed adapter model, liquidity floor, bands and emergency path ([ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), which lists every link) |
| Solana incident write-ups (Drift 2026, Mango, Solend, Cashio, SPL token-lending forks) | Losses that came from a corrupted NAV input or from admin powers with no time lock | The asymmetric time lock and the bounded TESOURO price ([ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md)) |
| OpenZeppelin `AccessControlDefaultAdminRules`; Anchor's `init_if_needed` warning; `coral-xyz/sealevel-attacks`; Neodyme's common pitfalls; Borsh enum encoding; OWASP Smart Contract Top 10 (2026) | Two-step admin transfer, safe account initialization, append-only enum evolution, access-control checks | The role handover ([ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md)) and the program simplification ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)) |

## Related sections

- [Introduction](../introduction/README.md)
- [Decisions](decisions.md)
- [Open questions and possible improvements](open-questions.md)

## Sources

- [`docs/provenance.md`](../provenance.md) and the [README acknowledgements](../../README.md#acknowledgements), for third-party design references.
- [`docs/litepaper.md`](../litepaper.md) appendix E, for external references.
- [`docs/spec.md`](../spec.md) §2.2, §3.13, §12 and §15, for the legal provisions cited.
- [`Anchor.toml`](../../Anchor.toml) and [`Cargo.toml`](../../Cargo.toml), for the toolchain versions.
- The `mutav-finance/mutav` repository (`docs/`, `research/`), for business context.
- The ADRs 0020 to 0029 in [`docs/decisions/`](../decisions/), which cite the comparable programs, audits and incident reports they draw on.
- The multi-asset research report `reports/Multi asset vaults on Solana.md` in the MUTAV workspace (not in this repository), summarized in [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md).

## Decisions

- [ADR 0001 Record architecture decisions](../decisions/0001-record-architecture-decisions.md): precedence of ADRs and spec.
- [ADR 0012 Guarantees aligned with a limited fiança onerosa](../decisions/0012-fianca-aligned-guarantee-lifecycle.md): the legal references.
- [ADR 0017 BRS income intake](../decisions/0017-brs-income-intake.md) and [ADR 0018 BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md): the issuer.
- [ADR 0010](../decisions/0010-partial-fills-at-queue-head.md) and [ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md): patterns from comparable programs.
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md): the two-step handover.
- [ADR 0025: Exit fallback: a cooldown exit after `max_queue_wait_secs`](../decisions/0025-exit-fallback-cooldown-exit.md): the exit patterns.
- [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md): the multi-asset references (proposed).
