# Governance and keys

The core security rule is the split between the operator and the reserve admin. The operator holds the information about contracts and runs the guarantee and claim cycle. The reserve admin looks after the reserve's financial health and security through ceilings, and does not judge contracts. They may be separate companies.

## Roles

| Role | Holder | May do | Cannot do |
|---|---|---|---|
| **Reserve admin** | Admin multisig vault (Squads v4, short time lock) | Set caps, coverage ratio, stress buffer and other config (sparse `set_config`); propose roles and a new admin, and cancel a pending handover; appoint guardians in one step; set the payments account, the treasury account and the allowlist root; fill the deposit and redemption queues (with `nav_bounds`); approve claim amounts above the per-call cap; cancel a pending deposit back to its owner; classify, book and return unsolicited money; book backstop money; clear a NAV halt; pause and unpause; revoke the operator. After the first adapter upgrade, it also moves assets between the reserve and adapters ([ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md)). | Register, close or reinstate guarantees; file, amend, re-file or pay claims. |
| **Program upgrade authority** | Upgrade multisig vault (Squads v4, long time lock), same members as the admin multisig | Sign `initialize` and program upgrades. | Anything inside the reserve. It is not `VaultConfig.admin`. |
| **Operator** | Hot key | Register, close (VOID or RELEASED) and reinstate guarantees; book guarantee fees (`contribute_fees`) and issuer income (`sweep_income`); file, amend (an amendment to 0 withdraws the filing), re-file and pay claims; record settlement (`settle_payout`). | Move money anywhere except a claim payment to the payments account; change caps or roles; fill queues; book unsolicited money. |
| **Pauser** | Separate key | `pause` and `revoke_operator`, with no time lock. After the first adapter upgrade, also the risk-reducing adapter actions listed for guardians. | Unpause, appoint, change config. |
| **Guardians** | Up to 3 keys, appointed by the admin in one step | `pause`. After the first adapter upgrade, also `disable_adapter`, `impair_adapter` (the haircut can only rise) and `emergency_deallocate` (impaired adapters only, proceeds pinned to `reserve`). | Revoke, unpause, lower a haircut, raise a limit, or move value anywhere except back into `reserve`. |
| **Capital provider** | Own wallet | Request deposits (allowlisted), request redemptions (open to holders), cancel, claim. | Act for another wallet. Delegates are never used. |
| **Anyone** | Any signer | `refresh`, `advance_queue_head`, `skim`. These need no judgment and move no tracked money. | Book or return money. |

The full instruction-by-role matrix is in the [specification](../spec.md#2-roles-and-keys) and the technical reference.

### Why the split matters

The operator key is a hot key. The design limits what it can do on its own:

- Every registry action is reversible by another operator action: `register_guarantee` by `close_guarantee(VOID)`, a close by `reinstate_guarantee` (within `max_reinstate_age`), ``file_claim` by `amend_claim(0)`, which sets the filing to `WITHDRAWN`, an amount by another `amend_claim`.
- Only `pay_claim` is irreversible. It pays only to MUTAV's payments account, within the admin's per-call cap and the cap per sliding 31-day window. A larger payment needs an admin `approve_claim` for that exact amount.
- Queue fills are admin actions and carry admin-set `nav_bounds`, so an operator change to the registry cannot move value through a fill.

The maximum financial loss from a compromised operator is therefore the admin-set claim caps.

## Multisigs and time locks

Two Squads v4 multisigs with the same members hold authority.

| Multisig | Holds | Devnet time lock | Real pilot and mainnet time lock |
|---|---|---|---|
| Admin multisig | `VaultConfig.admin` | 5 minutes | 24 hours |
| Upgrade multisig | Program upgrade authority | 1 hour | 7 days |

Rules:

- Every admin action is time-locked, the admin's own `pause` included; the pauser and guardians pause without delay. The Squads time lock counts from approval.
- Both multisigs have no config authority, so members, threshold and time lock change only through their own proposals.
- The deploy scripts check the exact member set, the exact threshold, that the multisig account is owned by Squads v4, and that the time lock meets the agreed floor (300 s and 3,600 s on devnet).
- On devnet the multisigs are 2-of-2, with two devnet wallets standing in for the founders. Hardware-held keys replace the stand-ins before real money.
- The upgrade time lock is at least the maximum queue wait of the exit fallback (7 days and 7 days on the real pilot), so holders can leave before an upgrade they disagree with takes effect. See [Known limitations](known-limitations.md) for when the exit fallback is built.

```mermaid
flowchart TB
    M1["Member key 1"] & M2["Member key 2"] --> AM["Admin multisig<br/>short time lock"]
    M1 & M2 --> UM["Upgrade multisig<br/>long time lock"]
    AM -->|"VaultConfig.admin"| CFG["VaultConfig"]
    UM -->|"upgrade authority"| PRG["mutav program"]
    AM -->|"propose_role"| PEND["pending operator / pauser<br/>(72 h expiry)"]
    PEND -->|"accept_role (new key signs)"| CFG
    PK["Pauser key"] -->|"pause, revoke_operator"| CFG
    GK["Guardian keys (up to 3)"] -->|"pause"| CFG
```

## Role changes

| Change | How | Notes |
|---|---|---|
| Operator or pauser | Admin `propose_role(role, key)`, then the new key signs `accept_role(role)`. | A typo can never appoint a dead address. Each role has its own pending key, which expires 72 hours after the proposal. Acceptance re-checks that the roles are distinct and not the default key. |
| Reserve admin | Admin `propose_admin(key)`, then the new admin signs `accept_admin`. | Its own pending key and expiry. Squads members are rotated through a Squads proposal while both old and new keys are live. |
| Cancel a handover | Admin `cancel_pending(role)`. | Clears the pending key for that role. |
| Remove the operator | Pauser or admin `revoke_operator`. | Immediate. Sets the operator to the default key and clears the pending operator and pauser keys. |
| Guardians | Admin appoints up to 3 keys in one step; the guardian does not accept. | Refuses the default key and every current role key (admin, operator, pauser). A mistyped guardian costs nothing the admin cannot fix in the next proposal. |
| Payments account | Admin `set_payments_account`. | BRS mint, distinct from the treasury, not owned by the operator, the capital wallet or the vault authority. |
| Treasury account | Admin `set_treasury_account`. | The token account is inspected; it may not be owned by the operator. |

All roles are distinct keys. The operator and pauser can never equal the admin or each other.

## Program-owned authority

| Authority | Holder | Purpose |
|---|---|---|
| Vault authority | PDA `["authority", config]`, no data | Owns every reserve token account. Mint and freeze authority of the share mint. Never passed into an adapter CPI. |
| Share mint authority | Vault authority PDA | Mints only in `claim_shares`. |
| Share freeze authority | Vault authority PDA | Unused in v1. Kept so share transfers can be restricted later without a new mint. |

The reserve's BRS is split across separate token accounts (`reserve`, `pending_deposits`, `pending_redemptions`, `claims`, `unsolicited`, plus the income inbox), so one freeze does not trap every balance.

## External authorities

| Authority | Holder | What it can do |
|---|---|---|
| BRS mint authority | The issuer's minting program | Mint BRS. |
| BRS freeze authority | A single issuer key | Freeze any BRS account, the reserve's included. See [Incident response](incident-response.md#frozen-reserve). |

This trust in the issuer is disclosed, not hidden. The single-key freeze authority is acceptable for devnet and is raised with the issuer before mainnet.

## Where keys live

No signing key exists in the program, the client or the pilot app.

| Surface | Rule | How it is checked |
|---|---|---|
| Program | Holds no keys. Authority comes from signers and PDAs. | Review. |
| TypeScript client (`@mutav-finance/mutav-protocol-solana`) | Composes instructions and reads accounts. Never signs. | [`scripts/check-no-keys.sh`](../../scripts/check-no-keys.sh) runs in CI. |
| Pilot app | The connected wallet signs. The server composes unsigned transactions. On devnet, transactions are sent through the wallet; the relay runs only on localnet and only forwards fully signed transactions. | Code review and app tests. |
| Deploy scripts | Only `deploy.ts` takes keypair paths. Keys inside the repository are refused. | Script tests. |
| Repository | No keypair files. `*.json` keypairs are gitignored. | [`SECURITY.md`](../../SECURITY.md) treats a committed key as a vulnerability. |

| Key | Devnet | Later |
|---|---|---|
| Operator | A keypair generated at deploy, stored outside the repository with owner-only file permissions, used by hand from the operator console. | A KMS-backed key in the MUTAV platform (`mutav-app`), used from Convex actions. |
| Pauser | A separate keypair generated at deploy, stored outside the repository. | Set at deploy for the real pilot. |
| Guardian | One key held by a founder, separate from the pauser. | An automated monitor may hold a guardian key. |
| Admin and upgrade members | Two devnet wallets standing in for the founders. | Hardware-held founder keys. |
| Program keypair | Outside the repository. | Same. |

## Sources

- [Specification §2 Roles and keys](../spec.md#2-roles-and-keys), [§2.1 Money flows](../spec.md#21-three-separate-mutav-money-flows-adr-0009-and-issuer-income-adr-0017), [§3.3 Vault authority and token accounts](../spec.md#33-vault-authority-and-token-accounts)
- [Specification §14.5 Upgrade runbook](../spec.md#145-upgrade-runbook)
- [`SECURITY.md`](../../SECURITY.md), [`CLAUDE.md`](../../CLAUDE.md) (no signing-key code)
- [`scripts/check-no-keys.sh`](../../scripts/check-no-keys.sh), [`scripts/devnet/`](../../scripts/devnet/)
- Code: [`programs/mutav/src/instructions/admin/`](../../programs/mutav/src/instructions/admin/), [`programs/mutav/src/state/config.rs`](../../programs/mutav/src/state/config.rs)
- Technical reference §2.5 and §3, devnet release design (branch `docs/protocol-reference`, PR #32)
- [Squads v4 documentation](https://docs.squads.so/)

## Decisions

- [ADR 0002: One core program plus adapter programs with capped sub-authorities](../decisions/0002-core-program-and-capped-adapters.md)
- [ADR 0003: Claim payments operated by MUTAV through a whitelisted payments account](../decisions/0003-payments-operated-by-mutav.md)
- [ADR 0009: Separate MUTAV money flows](../decisions/0009-separate-mutav-money-flows.md)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md)
- [ADR 0025: Exit fallback: a cooldown exit after `max_queue_wait_secs`](../decisions/0025-exit-fallback-cooldown-exit.md)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md)
- [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) (Proposed; who moves assets and the emergency path are decided)
