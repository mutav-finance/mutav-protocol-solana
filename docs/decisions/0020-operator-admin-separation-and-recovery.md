# 0020 — Operator/admin separation and operator-compromise recovery

- **Status:** Accepted (2026-10-10), decided by the founders. Amends ADR 0003 (what the operator may do and what a compromised operator can cost), ADR 0008 and ADR 0009 (pause scope for the new instructions), ADR 0012 (close reasons, settlement attestation) and ADR 0015 (`clear_fulfil_halt` reads the reserve). Closes spec §12 Q15 with option (b). The layout carves are in ADR 0019.

## Context

The program has two working roles. The **operator** knows the rental contracts. It registers guarantees, books guarantee fees and income, and runs the claim cycle. The **reserve admin** looks after the reserve as a whole: its caps, its capital flows and its security settings. Today MUTAV holds both roles. Later they may be held by two separate companies, for example a platform company that runs the contracts and a reserve manager that runs the capital.

The founders set four design goals for the devnet release:

- **Clear duties.** The operator owns contract facts. The admin judges financial health through ceilings, never the merits of a single contract.
- **A known worst case.** The most a lost or misused operator key can cost the reserve must be a number the admin sets in advance.
- **Recovery without new powers.** Undoing a wrong registry entry should use the same instructions the operator already has, so the admin never needs a rollback tool that could itself be misused.
- **No stuck money and no stuck roles.** Every key can be rotated, and a mistyped address must not lock a role.

The operator is a hot key held in a KMS by mutav-app. The admin is a Squads multisig with a time lock. The pauser is a separate key that can act at once.

## Decision

### 1. The principle

- **Operator:** contracts and the guarantee and claim cycle. It holds the information about leases, agencies and claims.
- **Reserve admin:** financial health and security, through ceilings. It sets caps, approves amounts that leave the reserve above the per-call cap (ADR 0021), runs capital flows and manages roles.
- The two roles may be held by separate companies. No instruction assumes they are the same party.

### 2. The worst case is the claim caps

- The only irreversible operator action is `pay_claim`. It is bounded by `max_claim_per_call`, the sliding `max_claim_per_period` (ADR 0021) and the admin's `approve_claim` above the per-call cap. It always pays the whitelisted `payments_account`, which is not owned by the operator (checked in `initialize`, `set_config`, `set_payments_account`, `set_treasury_account` and at role acceptance).
- **The maximum loss from a compromised operator is therefore the admin-set claim caps.** The money lands in MUTAV's own `payments_account`.
- Every other registry change is reversible by another operator action:

| Action | Reversed by |
|---|---|
| `register_guarantee` | `close_guarantee(VOID)` |
| `close_guarantee` | `reinstate_guarantee` |
| `file_claim` | `amend_claim(0)`, which sets the filing to `WITHDRAWN` (ADR 0021) |
| `amend_claim` | another `amend_claim` |

### 3. Close reasons and reinstatement

- `close_guarantee(id, reason)` takes a reason:
  - **`VOID`**: the guarantee is `ACTIVE`, nothing has been paid on either leg, and no claim is open. It is the reversal of a registration.
  - **`RELEASED`**: no claim is open. In the pilot the guarantee must be `ACTIVE`; the claims tail and the other ADR 0012 states apply when that lifecycle lands.
- `reinstate_guarantee(id)` is an **operator** instruction. It returns a `CLOSED` guarantee to `ACTIVE` and restores its remaining cover in `coverage_required`. It is allowed only while `now − closed_at ≤ max_reinstate_age`, an admin-set value in `Caps`, **30 days**. It emits `GuaranteeReinstated`. It has no solvency gate and no cap check, because it restores a liability that already existed.

### 4. Recovery runbook: freeze, appoint, reconcile

1. **Freeze.** The pauser (or the admin) calls `revoke_operator`, and `pause` if capital flows should stop too. `revoke_operator` also clears the pending operator key (decision 6). If the pauser key is itself in doubt, the admin removes it at once with `revoke_pauser`.
2. **Appoint.** The admin proposes a new operator with `propose_role(OPERATOR)`, and the new key accepts. If the pauser key is also in doubt, the same Squads proposal proposes a new pauser.
3. **Reconcile.** The new operator compares the platform's contract registry with on-chain events since the suspected compromise. It corrects every wrong entry with ordinary operator actions: `close_guarantee(VOID)` for false registrations, `reinstate_guarantee` for wrong closes, `amend_claim` for wrong filings. Claim payments made in the window are the accepted loss.
4. Until reconciliation is done, the admin signs no redemption fills. This is a runbook rule, not a program check.

There are no admin rollback instructions and no `since_ts` arguments.

### 5. Pause scope

- `pause` stops only **capital flows and new guarantees**: `request_deposit`, `request_redeem` (including a de-listed holder's exit, ADR 0023), `fulfil_deposits`, `fulfil_redeems` and `register_guarantee`.
- Everything else stays open, so claims are paid and records can be corrected during an incident: `pay_claim`, `approve_claim`, `amend_claim`, `refile_claim`, `close_guarantee`, `reinstate_guarantee`, `settle_payout`, `cancel_deposit`, `cancel_redeem`, `claim_shares`, `claim_assets`, `contribute_fees`, `sweep_income`, `skim` and the unsolicited-money instructions (ADR 0024), and every role instruction.
- The solvency gate is unchanged: it applies to `register_guarantee` and `fulfil_redeems`, never to claim payments (ADR 0005).
- Only the admin unpauses.

### 6. Two-step handover for every role

- **Operator and pauser:** `propose_role(role, key)` by the admin, then `accept_role(role)` signed by the new key. Each role has its own pending key and its own expiry time, **72 hours** after the proposal on devnet; an accept after expiry fails. Acceptance re-checks that the roles are distinct from each other and from the admin, and that none is the default key or a guardian. An unknown role value fails. A new proposal is refused while an unexpired one waits for the same role; the admin cancels it first, in the same proposal if needed. A new operator may not own the treasury or the payments account.
- **Admin:** `propose_admin(key)` by the current admin, then `accept_admin` signed by the new admin, with its own pending key and expiry. `cancel_pending(role)` by the admin clears a pending handover.
- `revoke_operator` (pauser or admin) clears the operator and the pending operator key. It leaves the pending pauser key alone, so a pauser in doubt cannot cancel its own replacement between the admin's proposal and the new pauser's acceptance.
- `revoke_pauser` (admin only, one step) clears the pauser and the pending pauser key. The admin and the guardians can still pause; a new pauser is proposed in the same proposal.
- These instructions replace `set_roles`.

### 7. Pause-only guardians

- Up to **3 guardian keys**, appointed by the admin in **one step** (no accept by the guardian). A guardian may call `pause` and nothing else, so a mistyped guardian key costs nothing that the admin cannot fix in the next proposal.
- The appointment refuses the default key and every current role key: admin, operator and pauser.
- Devnet: 1 guardian, a key separate from the pauser. A monitoring bot may hold a guardian key later.

### 8. Two Squads multisigs

- An **admin multisig** is `VaultConfig.admin`, with a short time lock.
- An **upgrade multisig** is the program's upgrade authority, with a long time lock. Both have the same members.
- Time locks: **devnet 5 minutes (admin) and 1 hour (upgrade)**, checked by the deploy scripts against floors of 300 s and 3,600 s. **Real pilot and mainnet: 24 hours (admin) and 7 days (upgrade).**
- On devnet the members are two wallet stand-ins. The real members and hardware keys come before real money.

### 9. A frozen reserve in registration and halt clearing

- `register_guarantee` and `clear_fulfil_halt` load the `reserve` token account (seeds checked). A frozen reserve counts as 0 liquid BRS, and both refuse with `ReserveFrozen`.

### 10. Attestation

- While MUTAV holds both roles, settlement stays simple: `settle_payout` records `pix_e2e_hash` only. The `quitacao_hash` of ADR 0012 arrives later as a new instruction version.
- Once operator and admin are separate companies, an attestation of the registry and of claim settlements becomes required before the admin relies on operator data. Its form is decided with that split.

## Alternatives considered

- **Admin rollback instructions with a `since_ts`** (reinstate and withdraw everything after a timestamp). They give the admin contract judgment it does not have, and they are a new power that can itself be misused. Rejected in favour of operator-only reversals.
- **A cap on how much cover the operator may release.** Not needed once every close is reversible. Rejected.
- **A per-agency exposure cap as an operator limit.** Removed (ADR 0019, ADR 0022). Agency concentration returns later as a separate account (PC-43).
- **One-step `set_roles`.** A mistyped key would appoint a dead address, which matters most during recovery. Rejected for the two-step form, as in OpenZeppelin's `AccessControlDefaultAdminRules` and OnRe's role handover.
- **One multisig for everything.** Every redemption fill would wait as long as an upgrade (spec §12 Q15). Rejected for option (b), two multisigs.
- **Letting the pauser appoint the next operator.** Faster, but it puts appointment power in a hot key. Rejected; appointment stays with the admin.

## Consequences

- **Positive.** The worst case of a lost operator key is a number the admin controls. Recovery uses tested, ordinary instructions. Every role, including the admin, can be rotated without an upgrade.
- **Negative.** Recovery needs a working new operator and a careful reconciliation. Claim payments made before the freeze are lost up to the caps. Two multisigs mean two sets of proposals to watch.
- **Neutral.** Claims are never stopped by a pause or by the solvency gate.
- **Program changes.** `close_guarantee` gains `reason`. `register_guarantee` and `clear_fulfil_halt` gain the `reserve` account. New instructions: `reinstate_guarantee`, `propose_role`, `accept_role`, `propose_admin`, `accept_admin`, `cancel_pending` and the one-step guardian appointment. `set_roles` is removed. `revoke_operator` clears the pending operator key; `revoke_pauser` is added. New fields (ADR 0019): pending keys with per-role expiry, `pending_admin` and its expiry, `guardians[3]`, `max_reinstate_age`. New events: `GuaranteeReinstated` and the role-handover events.
- **Spec.** §2 (roles table, two multisigs, guardians), §5.1, §5.2, invariant 21, §12 Q15 closed.
- **App and ops.** `/admin` composes role proposals and shows pending handovers with their expiry. An operator-activity feed on `/reserve` or `/admin` lists registrations, closes, filings and payments of the last 24 hours. A watcher alerts on a change of the payments account's owner. mutav-app keeps contracts and its audit trail where the operator key cannot write, so reconciliation has a source of truth. The deploy scripts verify both multisigs, their members, thresholds and time-lock floors.

## References

- Spec §2, §5.1, §5.2, §5.4, §12 Q15, §14.5.
- ADRs 0003, 0005, 0008, 0009, 0012, 0015, 0019, 0021, 0022, 0023, 0024.
- OpenZeppelin `AccessControlDefaultAdminRules` (two-step admin transfer with a delay).
- OnRe (`onre-finance/onre-sol`) role handover, and its audits by OtterSec and Ackee, used as a comparison.
- OWASP Smart Contract Top 10 (2026 edition), SC01 access control.
