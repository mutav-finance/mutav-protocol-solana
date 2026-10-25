# 0031 — Chain-neutral authority model and security levels

- **Status:** Proposed (2026-10-25), draft for comment. Decider: Julia (CTO). To be reviewed with the co-founder before acceptance. Acceptance gate: accepted, or replaced, before the real Solana deploy ([#91](https://github.com/mutav-finance/mutav-protocol-solana/issues/91)). Builds on ADR 0020 (role split, two multisigs, time locks) and ADR 0028 (pilot caps). The baseline itself is [`docs/security/baseline.md`](../security/baseline.md).

## Context

The protocol will run on more than one chain. Today the Solana program is the reference implementation and runs at devnet only; a Stellar contract exists and is dormant. The roles, custody and review rules for Solana are spread across the spec (§2, §14.5), ADR 0020, ADR 0028, the pilot start conditions and the security pages, and they are written in Solana terms (Squads, `VaultConfig`, `solana-verify`).

Without a shared baseline, each chain would set its own bar, and "mainnet-ready" would mean different things on different chains. The security level must be the same wherever MUTAV's reserve runs, and a reader must be able to check, chain by chain, whether a deployment meets it.

The same terms are also used loosely across repos: "admin" can mean the protocol multisig, the admin app, or a staff role in the back office. Only the first has on-chain authority.

## Proposed decision

1. **One authority model, without chain terms.** Five on-chain roles (protocol admin, upgrade authority, operator, pauser, guardians), each with its powers and its "must never" constraints, plus an off-chain layer (MUTAV staff and the admin app) with **no on-chain authority**. The model is defined once, in [`baseline.md`](../security/baseline.md#roles); the spec and the glossary map it to each chain.
2. **Three security levels.** **L0** testnet and devnet; **L1** capped pilot on mainnet with the guarantor's own capital; **L2** mainnet with outside capital. Each level is a MUST list across admin custody, time locks, operator custody and caps, verifiable builds, review, pauser separation and incident runbook, limits and monitoring. L1 collects what the repository already requires before real money; L2 is proposed in full.
3. **The rule.** A deployment on any chain may hold a level's capital only once that chain's conformance table is fully green for that level. Any exception at L1 or L2 needs an ADR naming the requirement, the reason, the compensating control and the end date.
4. **Conformance tables per chain.** Each chain has a table mapping every requirement to its mechanism and status. Solana's is filled in against the devnet test deploy. Stellar's is marked dormant and not assessed, and must be completed before any capital on Stellar.
5. **Adding a chain** follows the steps in the baseline, ending in an ADR that records the mapping.

### Points proposed beyond earlier decisions

These are new in this ADR and are open for comment:

- L0 exceptions may be recorded in the deployment record instead of an ADR.
- L1: each multisig member key is held by a different person; the operator key is never a plain key file used by hand; the pauser key is not held by the operator's custodian; a runbook drill before capital; monitoring live as a launch gate; the real-pilot NAV-move guard value set by ADR before the deploy.
- L2 in full: an independent signer and a threshold that tolerates one lost key; the exit fallback built and enabled; a full external audit with its report published and a bug bounty; an automated guardian; caps and limits re-set by ADR for outside capital; 24/7 alerting.

## Alternatives considered

- **Keep the rules per chain, in each chain's spec.** Simpler today, but the bar drifts between chains and nobody can compare deployments. Rejected.
- **Put the baseline only in the private operations repo.** Keeps custody details private, but holders and reviewers could not check the bar a deployment claims to meet. Rejected: the baseline and the conformance status are public; who holds which key and how stays in a private operational companion.
- **Two levels (test, mainnet).** Hides the difference between a capped pilot on the guarantor's own money and a reserve holding outside capital. Rejected.

## Consequences

- **Positive.** One public bar for every chain; a checklist that shows, row by row, what stands between devnet and the pilot; one vocabulary for "admin" across repos.
- **Negative.** Another page to keep in step with the spec and the deployment records. The Solana table goes stale unless every deploy and review updates it.
- **Neutral.** No program change. No economic behaviour changes: the roles, caps and locks are those already decided; the new MUSTs are operational gates.
- **Docs.** The glossary's Authority section becomes the Solana mapping of the roles; `CLAUDE.md`, `app/CLAUDE.md`, the README and the security index point to the baseline.
- **Before acceptance.** Review with the co-founder; decide the L1 NAV-move guard value and whether the L1 independent review must be a full audit; re-check the Solana table on the mainnet deploy.

## References

- [`docs/security/baseline.md`](../security/baseline.md)
- Spec §2, §14.5. ADRs 0020, 0021, 0025, 0027, 0028.
- [Brazil pilot §8 Start conditions](../pilot/brazil-pilot.md#8-start-conditions-kpis-and-status), [Governance and keys](../security/governance-and-keys.md), [Reviews and audits](../security/reviews-and-audits.md).
