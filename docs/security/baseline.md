# Authority model and security baseline (chain-neutral)

**Draft for comment · 2026-10-25 · proposed in [ADR 0031](../decisions/0031-chain-neutral-authority-model-and-security-levels.md)**

MUTAV will run on more than one chain. This page sets one authority model and one security baseline for every deployment, whatever the chain. It names the roles without chain terms, sets three security levels, and gives each chain a conformance table that maps every requirement to a mechanism on that chain.

> **Status.** Proposed, not accepted. It becomes binding when ADR 0031 is accepted, before the real Solana deploy ([#91](https://github.com/mutav-finance/mutav-protocol-solana/issues/91)). Until then [Governance and keys](governance-and-keys.md) and the [specification §2](../spec.md#2-roles-and-keys) describe what is built. Items marked **(proposed)** go beyond a decision already recorded in the spec or an ADR.

## The rule

A deployment on any chain may hold the capital of a level only once that chain's conformance table is fully green for that level. Any exception at L1 or L2 needs an ADR that names the requirement, the reason, the compensating control and the date it ends. At L0 an exception is recorded in the deployment record (`deployments/<cluster>.json`) **(proposed)**, as the 60 s and 120 s test locks are today.

## Roles

The model has five on-chain roles and one off-chain layer. A role is a power over the reserve program; a key or account holds it. Distinct roles are held by distinct keys, and the program refuses a key that would hold two of them.

### Protocol admin (the reserve admin)

Looks after the reserve's financial health and security through ceilings. It never judges a single contract ([ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md)).

| May | Must never |
|---|---|
| Set the limits: reserve cap, per-guarantee cap, claim caps per call and per window, request minimum and maximum, coverage ratio, stress buffer, NAV-move guard, fee take, queue wait and reinstatement age | Register or close guarantees, file or pay claims |
| Propose a new operator, pauser or admin (two-step handover with an expiring pending key) and cancel a pending handover | Act without its time lock. Every admin action waits it out, the admin's own pause included |
| Appoint the guardians in one step; remove the pauser at once | Move reserve money to any destination outside the program's fixed list |
| Set the payments account, the treasury account and the capital-provider allowlist | Change program code. That is the upgrade authority |
| Fill the deposit and redemption queues within NAV bounds it sets; park a pending request for its owner to collect; clear a NAV halt | Be held by a single key at L1 or above |
| Pause and unpause; revoke the operator | Sign anything it has not decoded, or pre-sign a transaction that stays valid for later use (the Drift lesson, [litepaper §6](../litepaper.md#6-governance-and-separation-of-powers)) |
| Approve the exact amount of a claim above the per-call cap | |
| Later: book and return unsolicited money; move assets between the reserve and adapters ([ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md)) | |

### Upgrade authority

Replaces the program's code. It is a separate authority from the protocol admin, with a longer time lock, so code changes only after public notice.

| May | Must never |
|---|---|
| Deploy and upgrade the program; sign its initialisation | Hold the protocol-admin role or any role inside the reserve |
| | Upgrade to a build whose hash does not match a published, reproducible build of a tagged commit |
| | Take effect sooner than its time lock; once the exit fallback is built, sooner than the longest queue wait, so holders can leave first ([governance](governance-and-keys.md#multisigs-and-time-locks)) |
| | Be held by a single key at L1 or above |

### Operator

Runs contracts, agencies and the guarantee and claim cycle. It holds the contract facts. It may be held by a separate company from the protocol admin ([ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md)).

| May | Must never |
|---|---|
| Register and close guarantees; record notices, exoneration and key returns | Move money anywhere except a claim payment to the payments account and the fee take to the treasury |
| Book guarantee fees and issuer income | Change limits, roles, money accounts or the allowlist |
| File and pay claims, within the claim caps per call and per window; record settlement | Fill capital queues or book unsolicited money |
| | Own the payments or treasury account |
| | Pay above the per-call cap without the admin's approval of the exact amount |
| | Be held as a plain key file or used by hand at L1 or above **(proposed; the spec already places it in a KMS)** |

Every operator registry action can be reversed by another operator action. Only the claim payment is irreversible, so the worst case of a lost operator key is the admin-set claim caps.

**Single-registrant assumption.** The pilot platform holds an offer's required coverage off-chain for 7 days before signatures (mutav-app ADR 0010). That is sound only because one operator is the sole caller of `register_guarantee` on a reserve, so the platform sees every consumer of free capital. **A reserve with more than one operator or registrant must move that hold on-chain** (a reservation with an expiry, by ADR and spec change) before the second registrant goes live.

### Pauser

A separate key for emergencies. It acts at once.

| May | Must never |
|---|---|
| Pause (capital flows and new guarantees only; claims stay open) | Unpause, appoint any key, or change any limit |
| Revoke the operator | Be the same key as the admin, the operator or a guardian |
| Later: the risk-reducing adapter actions listed for guardians | Be held by the same custodian as the operator key at L1 or above **(proposed)** |

### Guardians

Up to three keys, appointed by the protocol admin in one step.

| May | Must never |
|---|---|
| Pause | Revoke, unpause, change limits, or appoint |
| After the first adapter upgrade: disable an adapter, raise its haircut, and pull an impaired adapter's value back into the reserve | Move value anywhere except back into the reserve; lower a haircut or raise a limit |

### Off-chain: MUTAV staff and the admin app

MUTAV staff roles and the admin app (mutav-app's `apps/admin`) run the back office. **They hold no on-chain authority.** A staff role is not the protocol admin.

| May | Must never |
|---|---|
| Prove identity, run back-office workflows, prepare and display proposals | Hold, store or export a protocol key (admin member, upgrade member, pauser or guardian) |
| Ask the operator service to act, within the operator's own caps | Sign a protocol-admin action on a member's behalf. Members sign with their own wallets; an app only composes |

Capital providers act only for their own wallet, and anyone may run the permissionless cranks. Neither is an authority over the reserve.

## Security levels

| Level | Where | Capital it may hold |
|---|---|---|
| **L0** | Testnet or devnet | Test tokens only. No real value |
| **L1** | Capped pilot on mainnet | The guarantor's own capital, under the on-chain reserve cap (R$1M for the Brazil pilot, [ADR 0028](../decisions/0028-pilot-parameters.md)). Not open to public investment |
| **L2** | Mainnet with outside capital | Capital from parties other than the guarantor, under a regulated vehicle where the market requires one |

Each level includes every requirement of the level below. L1 collects what the repository already requires before real money (the [pilot start conditions](../pilot/brazil-pilot.md#8-start-conditions-kpis-and-status), [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md), [spec §14.5](../spec.md#145-upgrade-runbook)). L2 is **proposed** throughout.

### L0: testnet and devnet

- **Admin custody.** The protocol admin and the upgrade authority are threshold multisigs of the chain's standard kind, even with stand-in members.
- **Time locks.** Both run a time lock above zero, with the upgrade lock longer than the admin lock. Floors are set per chain (Solana: 300 s and 3,600 s).
- **Operator.** A separate key, stored outside the repository with owner-only permissions. Claim caps are set to the values planned for L1.
- **Builds.** The deployed executable's hash is recorded with the commit and the build method.
- **Review.** Internal review before each deploy.
- **Pauser.** A separate pauser key and at least one guardian.
- **Limits.** The reserve cap and claim caps are set to the L1 values.
- **Keys.** No signing key in the program, the client or the app; tooling refuses mainnet.

### L1: capped pilot on mainnet

- **Admin custody.**
  - Threshold multisig for the protocol admin and a second one for the upgrade authority.
  - Every member key on a hardware wallet. No stand-ins.
  - Each member key held by a different person, so no single person can act **(proposed wording; the spec says "real members" before real money)**.
  - The multisigs' own membership, threshold and time lock change only through their own time-locked proposals.
- **Time locks.** Protocol admin ≥ 24 hours; upgrade authority ≥ 7 days ([ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md)).
- **Operator.**
  - The key lives in a KMS and is used only by the operator service ([spec §2](../spec.md#2-roles-and-keys)).
  - Claim caps per call and per rolling window are set; a payment above the per-call cap needs the admin's approval of the exact amount (Brazil pilot: R$15k and R$20k per 31 days).
- **Builds.** A fresh deploy from a verifiable, reproducible release build of a tagged commit, under the program ID declared in the code. Its hash is published and anyone can reproduce it.
- **Review.**
  - An internal security audit of the exact release commit.
  - An independent security review by reviewers outside MUTAV. Whether it is a full audit is open.
- **Pauser.**
  - A pauser key distinct from every other role, plus at least one guardian.
  - A published incident runbook covering operator, pauser and admin compromise, a frozen reserve and an upgrade rollback ([Incident response](incident-response.md)).
  - A drill of that runbook before capital goes in **(proposed)**.
- **Limits.**
  - The on-chain reserve cap is set.
  - The NAV-move guard is set to a real pilot value below 100%. The value is set by ADR before the deploy **(proposed; the value is not decided)**.
- **Monitoring.**
  - An operator-activity feed (registrations, closes, filings and payments of the last 24 hours).
  - An alert on a change of the payments account's owner.
  - An alert when the reserve falls under required coverage.
  - Live before capital goes in **(proposed as a gate; ADR 0020 lists them as app and ops work)**.
- **Disclosure.** Committed capital is published before launch. The token issuer's trust (freeze authority) is disclosed and raised with the issuer.

### L2: outside capital (proposed)

- **Admin custody.**
  - At least one independent signer on both multisigs, with no employment or equity tie to the guarantor.
  - A threshold that tolerates the loss of one member key, for example 2-of-3, rather than 2-of-2.
- **Time locks.**
  - Upgrade authority ≥ 7 days and ≥ the exit fallback's longest queue wait. The exit fallback is built and enabled.
  - Admin time lock ≥ 24 hours.
- **Operator.**
  - If the operator is a separate company, an attestation of the registry and of claim settlements before the admin relies on operator data (decided in [ADR 0020 §10](../decisions/0020-operator-admin-separation-and-recovery.md); its form is open).
  - Claim caps sized against the outside capital, by ADR.
- **Builds.** As L1, with verification shown on public explorers.
- **Review.**
  - A full external audit of the release commit by a recognised firm.
  - Every Critical and High finding fixed and re-checked.
  - The report published.
  - A public bug bounty.
- **Pauser.**
  - A guardian held by an automated monitor that pauses on defined triggers.
  - A published, dated drill of the incident runbook.
- **Limits.** Reserve cap and NAV-move guard re-set by ADR for the outside capital; caps raised only in time-locked steps.
- **Monitoring.** 24/7 alerting with a named on-call rota, and public status for pauses and halts.

## Conformance: Solana

Status on 2026-10-25 against the devnet test deploy ([`deployments/devnet.json`](../../deployments/devnet.json), program `GhPkq95…`, release `v1.0.0-devnet`). "L1" says whether the requirement is met for the capped mainnet pilot. It is not met on any row that needs real members, real locks or a release build, because devnet is L0 by design.

| # | Requirement | Mechanism on Solana | Devnet today | L1 |
|---|---|---|---|---|
| 1 | Protocol admin is a threshold multisig | Squads v4 vault = `VaultConfig.admin`; deploy scripts check owner, members and threshold | 2-of-2 | Met in form |
| 2 | Upgrade authority is a separate multisig | Second Squads v4 vault = program upgrade authority | 2-of-2, same members | Met in form |
| 3 | Hardware keys, real members, separate custodians | Squads members | Stand-in devnet wallets | **Not met** |
| 4 | Admin time lock ≥ 24 h | Squads time lock, checked against a floor by the deploy scripts | 60 s (test exception; ADR 0020 floor is 300 s) | **Not met** |
| 5 | Upgrade time lock ≥ 7 d | Squads time lock on the upgrade multisig | 120 s (test exception; ADR 0020 floor is 3,600 s) | **Not met** |
| 6 | Multisig settings change only through their own proposals | Squads `configAuthority` unset, checked by `scripts/devnet/lib/squads.ts` | Checked | Met |
| 7 | Decode before signing; no durable-nonce pre-signing | Signer practice; `/admin` decodes proposals | Practice | Practice, not enforceable |
| 8 | Operator key in a KMS | mutav-app KMS, used from Convex actions | Key file used by hand from the operator console | **Not met** |
| 9 | Claim caps per call and per window; approval above | `caps.max_claim_per_call`, `caps.max_claim_per_period` (31 days), `approve_claim` | R$15k / R$20k, locked by `verify.ts` | Met |
| 10 | Distinct roles; two-step handover | Program checks (`RolesNotDistinct`, 72 h pending keys) | In the binary | Met |
| 11 | Separate pauser and a guardian | `VaultConfig.pauser`, `set_guardians` | Separate pauser key; one guardian | Met in form; L1 custody not set |
| 12 | Verifiable release build under the declared ID | `solana-verify` in `release.yml`; declared ID `8scC79jk…` | Local `anchor build` under a throwaway ID | **Not met** ([#91](https://github.com/mutav-finance/mutav-protocol-solana/issues/91)) |
| 13 | Published executable hash | `deployments/*.json`, `solana-verify get-program-hash` | Published for the local build | Met for L0 |
| 14 | Internal security audit of the release commit | [`protocol-audit`](reviews-and-audits.md) review, dated row in Reviews and audits | Audit #1 (2026-10-11) of the devnet code | **Not met** for the release commit |
| 15 | Independent security review | External reviewers | Not scheduled; auditor, scope and date not chosen | **Not met** |
| 16 | Incident runbook | [Incident response](incident-response.md) | Written | Met; drill **(proposed)** not run |
| 17 | Reserve cap | `caps.max_tvl` | R$1M | Met |
| 18 | NAV-move guard below 100% | `caps.max_nav_move_bps` | `10_000` (100%, guard off in effect) | **Not met** |
| 19 | Monitoring | Operator-activity feed in the app; payments-owner watcher; `ModeChanged` alert via the mutav-app indexer | Activity feed in the app; watcher and alerts not confirmed | **Not met** |
| 20 | No keys in the audited surface; mainnet refused by tooling | `check-no-keys.sh` in CI; `lib/cluster.ts` and script genesis checks | Enforced | Met |
| 21 | Issuer freeze authority disclosed and raised | Disclosure pages; issuer conversation | Disclosed | **Not met** (not yet raised) |

L1 is reached when rows 3, 4, 5, 8, 12, 14, 15, 18, 19 and 21 turn green on the mainnet deploy, and the start conditions outside security (counsel, instruments, payment provider, capital) are met.

## Conformance: Stellar

**Dormant. Not assessed.** The Stellar `Fund` contract (mutav-stellar) holds no capital and has no deployment at L1. This table must be completed, row by row against every requirement above, before any capital on Stellar.

| Requirement | Mechanism on Stellar | Status |
|---|---|---|
| Protocol admin and upgrade authority as threshold multisigs with time locks | Not assessed | Not assessed |
| Operator key custody and claim caps | Not assessed | Not assessed |
| Pauser and guardians | Not assessed | Not assessed |
| Verifiable builds | Not assessed | Not assessed |
| Review, runbook, limits, monitoring | Not assessed | Not assessed |

## Adding a chain

1. **Map the roles.** For each role above, name the account or contract that holds it on the new chain, and confirm the program refuses a key holding two roles. State how many operators can register against each reserve; more than one breaks the [single-registrant assumption](#operator).
2. **Check the program rules.** Confirm the coverage gate, claim caps, pause scope (claims never stopped), fixed outflow destinations and internal accounting hold as on the reference implementation, with tests.
3. **Pick the custody mechanisms.** A threshold multisig with a time lock for the admin, a second for upgrades, and a locked configuration for both. Record the floors the deploy tooling checks.
4. **Pick the build path.** A verifiable, reproducible build and a way for anyone to compare the deployed hash.
5. **Write the conformance table** on this page, one row per requirement, with the mechanism and its status.
6. **Record the mapping in an ADR**, together with any exception and its end date.
7. **Deploy at L0** and publish the deployment record.
8. **Move up a level** only when the table is green for it, under [the rule](#the-rule).
9. **Update the glossary** with the chain's names for each role.

## Sources

- [Specification §2 Roles and keys](../spec.md#2-roles-and-keys), [§14.5 Upgrade runbook](../spec.md#145-upgrade-runbook)
- [Governance and keys](governance-and-keys.md), [Incident response](incident-response.md), [Reviews and audits](reviews-and-audits.md), [Known limitations](known-limitations.md)
- [Brazil pilot §8 Start conditions](../pilot/brazil-pilot.md#8-start-conditions-kpis-and-status)
- [Litepaper §6 Governance and separation of powers](../litepaper.md#6-governance-and-separation-of-powers)
- [`deployments/devnet.json`](../../deployments/devnet.json), [`programs/mutav/src/constants.rs`](../../programs/mutav/src/constants.rs)

## Decisions

- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md)
- [ADR 0025: Exit fallback: a cooldown exit after `max_queue_wait_secs`](../decisions/0025-exit-fallback-cooldown-exit.md)
- [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) (Proposed)
- [ADR 0028: Pilot parameters](../decisions/0028-pilot-parameters.md)
- [ADR 0031: Chain-neutral authority model and security levels](../decisions/0031-chain-neutral-authority-model-and-security-levels.md) (Proposed)
