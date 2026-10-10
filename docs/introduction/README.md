# Welcome to MUTAV

MUTAV is an institutional *fiador* for residential leases in Brazil. It gives tenants a paid rental guarantee (*fiança onerosa*) through the real-estate agencies that already run their leases. The tenant needs no personal guarantor and no cash deposit.

Every guarantee MUTAV gives is backed by a BRL reserve held by a Solana program, `mutav`. The program records the cover of every active guarantee. It refuses any capital movement that would leave that cover under-backed. It never blocks a claim payment for solvency reasons. Anyone can recompute the reserve's health from public on-chain state.

The reserve is operational infrastructure that keeps the guarantees healthy. It is not a yield product.

> These pages describe the design of the devnet release. The program is unaudited. Values marked "devnet" are the starting values for the devnet deployment, not commercial terms. Nothing here is legal advice or an offer of securities.

## Who MUTAV is for

| Audience | What MUTAV gives them | Do they touch the chain? |
|---|---|---|
| Tenants | A rental guarantee with no personal guarantor and no locked-up deposit. They pay a monthly guarantee fee with the rent. | No |
| Landlords | One guarantee per lease, from a guarantor whose reserve they can check. Claims are paid through the agency. | No |
| Real-estate agencies | A guarantee they can offer inside their normal workflow, one monthly bill, and a public view of the reserve and of every claim payment. | No. They work in the MUTAV platform. |
| Capital providers | Reserve shares, priced at an on-chain NAV, entered and exited through a public queue. During the pilot the only capital provider is MUTAV itself. | Yes, from their own wallet |
| Anyone else | A reserve whose rules are enforced by a program, and whose state anyone can read and recompute. | Read only, plus permissionless cranks |

## The idea in four sentences

1. MUTAV, as **operator**, records each lease's guarantee on-chain with its cover, the R$ ceiling of the fiança.
2. The **reserve** must hold a share of that cover, plus every filed claim in full, plus a stress buffer. A **solvency gate** checks this before any new guarantee and any capital exit.
3. When a tenant defaults, the operator files a **claim** and the program pays it from the reserve to MUTAV's payments account, within limits set by a separate **reserve admin**. MUTAV then pays the agency by Pix.
4. Every guarantee, provision, claim payment and capital movement is a public account or event.

## How these docs are organised

| Section | What it covers | Start here if you are |
|---|---|---|
| **Introduction** (this section) | What MUTAV is, the problem it solves, how it works end to end, what anyone can verify, and a glossary. | New to MUTAV |
| [For rental agencies](../for-agencies/README.md) | The guarantee lifecycle, claims and guarantee fees, from the agency's side. | A real-estate agency |
| [For capital providers](../for-capital-providers/README.md) | Deposits and redemptions, share value and the risks of holding reserve shares. | Providing capital to the reserve |
| [Reserve framework](../reserve-framework/README.md) | Coverage and the solvency gate, claims and payments, assets and income, unsolicited money, and every parameter. | Evaluating the design |
| [Architecture](../architecture/README.md) | Components, roles and trust, accounts, money flows, state machines, upgrades and the account layout. | Reviewing how the system is built |
| [Security and verification](../security/README.md) | Invariants, governance and keys, incident response, reviews and audits, known limitations. | Assessing risk |
| [Technical resources](../technical-resources/README.md) | Addresses and configuration, instructions, events and errors, the math, the TypeScript client, deployment and operations, FAQ. | Integrating or auditing |
| [Decisions and sources](../meta/decisions.md) | Every ADR and devnet release decision, and the bibliography. | Checking why something is the way it is |

The full table of contents is in [SUMMARY.md](../SUMMARY.md).

Pages in this section:

| Page | Summary |
|---|---|
| [What is MUTAV](what-is-mutav.md) | Rental guarantees in Brazil, the fiança, what fails today, and why an on-chain reserve helps. |
| [How it works](how-it-works.md) | Agencies, the operator, the reserve, claim payments and capital providers, with diagrams. |
| [Transparency](transparency.md) | What anyone can check on-chain and on the public `/reserve` page. |
| [Glossary](glossary.md) | Brazilian legal terms, protocol terms and role names. |

The binding sources behind every page are the [specification](../spec.md) and the [architecture decision records](../decisions/). Where a page and those files differ, the spec and the ADRs win. ADRs 0019 to 0027 record the devnet release design and supersede older spec text until the spec is updated. Items that are still undecided are listed in the [open questions register](../meta/open-questions.md).

## Where things live

| Thing | Location |
|---|---|
| Pilot app | [reserve.mutav.finance](https://reserve.mutav.finance). Until the reserve is initialized on devnet, its pages show a "being deployed" notice instead of numbers. |
| Program | `programs/mutav/` in this repository. Program ID `8scC79jkU7SPM9v6M4nB833R8EeqKknfwdRdjn73Qqv9` (declared; devnet deployment pending). |
| TypeScript client | `clients/js/`, published as `@mutav-finance/mutav-protocol-solana`. It composes transactions and never signs. |
| Reserve asset | BRS, a BRL stablecoin issued by Nora. Devnet mint `BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4`. |
| Reserve accounts, multisigs and role keys | Set at deploy. |

## Sources

- [Specification §1 Principles](../spec.md#1-principles) and [§2 Roles and keys](../spec.md#2-roles-and-keys)
- [Litepaper, Abstract and §2](../litepaper.md#2-mutav-in-one-page)
- [Repository README](../../README.md)
- [Pilot app spec](../../app/docs/spec.md)
- Program declaration: [`programs/mutav/src/lib.rs`](../../programs/mutav/src/lib.rs)

## Decisions

- [ADR 0001: Record architecture decisions](../decisions/0001-record-architecture-decisions.md)
- [ADR 0005: Solvency gate scope](../decisions/0005-solvency-gate-scope.md)
- [ADR 0016: Coverage ratio below 1.0](../decisions/0016-coverage-ratio-below-one.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md) (amends 0016)
