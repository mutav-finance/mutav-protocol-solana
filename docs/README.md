# MUTAV documentation

MUTAV is an institutional *fiador* for residential leases in Brazil: tenants get a paid rental guarantee (*fiança onerosa*) through the real-estate agencies that already run their leases, with no personal guarantor and no cash deposit. Every guarantee is backed by a BRL reserve held by a Solana program, `mutav`, which records the cover of every active guarantee, refuses any capital movement that would leave that cover under-backed, and never blocks a claim payment for solvency reasons. The reserve is operational infrastructure that keeps the guarantees healthy, not a yield product, and anyone can recompute its health from public on-chain state.

> These pages describe the design of the devnet release. The program is unaudited. Values marked "devnet" are starting values for the devnet deployment, not commercial terms. Nothing here is legal advice or an offer of securities.

## Start here

| You are | Read in this order |
|---|---|
| New to MUTAV | [Welcome](introduction/README.md), [What is MUTAV](introduction/what-is-mutav.md), [How it works](introduction/how-it-works.md), [Transparency](introduction/transparency.md), [Glossary](introduction/glossary.md) |
| A rental agency | [For rental agencies](for-agencies/README.md), [Guarantee lifecycle](for-agencies/guarantee-lifecycle.md), [Claims](for-agencies/claims.md), [Guarantee fees](for-agencies/fees.md) |
| A capital provider | [For capital providers](for-capital-providers/README.md), [Deposits and redemptions](for-capital-providers/deposits-and-redemptions.md), [Share value](for-capital-providers/share-value.md), [Risks](for-capital-providers/risks.md) |
| An integrator or auditor | [Reserve framework](reserve-framework/README.md), [Architecture](architecture/README.md), [Security and verification](security/README.md), [Technical resources](technical-resources/README.md), [Decisions](meta/decisions.md) |

The full table of contents is in [SUMMARY.md](SUMMARY.md).

## Reference documents

| Document | Role |
|---|---|
| [Specification](spec.md) | The program's business rules. Any change to economic behaviour needs an ADR. |
| [Architecture decision records](meta/decisions.md) | Every accepted and proposed ADR, the pending ADRs and the dated decision log for the devnet release. Where a page names a "Pending ADR", that decision supersedes older spec text until the spec is updated. |
| [Litepaper](litepaper.md) | The design and the business case in one document. |
| [Plan](plan.md) and [provenance](provenance.md) | The build plan and the separation of hackathon work, prior MUTAV work and third-party code. |

## Sources

- [Specification §1 Principles](spec.md#1-principles)
- [Litepaper](litepaper.md)
- [Repository README](../README.md)

## Decisions

- [Decisions index](meta/decisions.md)
- [ADR 0005: Solvency gate scope](decisions/0005-solvency-gate-scope.md)
- [ADR 0018: BRS-only pilot reserve](decisions/0018-brs-only-pilot-reserve.md)
