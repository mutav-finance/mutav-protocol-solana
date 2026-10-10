# Decisions

This page indexes every architecture decision behind the MUTAV reserve program. It has three parts:

1. [Architecture decision records](#architecture-decision-records) (ADRs 0001 to 0018) as they stand in [`docs/decisions/`](../decisions/).
2. [Pending ADRs](#pending-adrs): decisions taken for the devnet release that are not yet written as an ADR.
3. A [decision log](#decision-log) of the devnet release design, one row per decision.

Where a pending ADR changes an accepted one, the index says so. The accepted ADR keeps its text, because ADRs are never edited after acceptance except for their status ([ADR 0001](../decisions/0001-record-architecture-decisions.md)). The newer decision wins.

## How decisions are made

- Every change to economic behaviour needs a new ADR and a matching update to [`spec.md`](../spec.md) in the same pull request. Economic behaviour means reserve movements, NAV, coverage, free capital, gates, caps and roles.
- An ADR has three sections: **Context**, **Decision** and **Consequences**.
- A reversal is a new ADR that supersedes the old one.
- **Proposed** means written and pending founder confirmation. **Accepted** means confirmed.

## Architecture decision records

| ADR | Title | Status | Summary | Later changes |
|---|---|---|---|---|
| [0001](../decisions/0001-record-architecture-decisions.md) | Record architecture decisions | Accepted, 2026-10-01 | Decisions are recorded as numbered ADRs; any economic change needs an ADR and a spec update in the same PR | None |
| [0002](../decisions/0002-core-program-and-capped-adapters.md) | One core program plus adapter programs with capped sub-authorities | Accepted, 2026-10-01 | `mutav` is the single core program. Each external asset venue gets its own adapter program, acting through its own capped sub-authority PDA. The core re-checks every reserve account after each adapter CPI | Narrowed for the pilot by [0018](../decisions/0018-brs-only-pilot-reserve.md): no adapter is whitelisted |
| [0003](../decisions/0003-payments-operated-by-mutav.md) | Claim payments operated by MUTAV through a whitelisted payments account | Accepted, 2026-10-01 | `pay_claim` pays only `payments_account`. A `Payout` PDA per guarantee and notice makes payment idempotent. `settle_payout` records the PIX hash | Amended by [0012](../decisions/0012-fianca-aligned-guarantee-lifecycle.md). The payout SLA is removed (Pending ADR: Operator/admin separation and operator-compromise recovery). The admin path is replaced (Pending ADR: Claims) |
| [0004](../decisions/0004-onchain-nav-internal-accounting.md) | NAV computed on-chain with internal accounting, provisions at filing and bounded prices | Accepted, 2026-10-01 | The program computes NAV from amounts it moved itself. Direct transfers do not change NAV. A filing books a provision at once. Prices are bounded | Unsolicited transfers get an explicit path (Pending ADR: Unsolicited money and backstop contributions) |
| [0005](../decisions/0005-solvency-gate-scope.md) | Solvency gate scope: capital flows and new guarantees, never claim payments | Accepted, 2026-10-01 | `stable_assets ≥ coverage_required` gates new guarantees and redemptions. Claim payments are never refused for solvency | Formula amended by [0016](../decisions/0016-coverage-ratio-below-one.md) and by Pending ADR: Coverage |
| [0006](../decisions/0006-per-lease-absolute-coverage.md) | Per-lease coverage stored as absolute amounts | Accepted, 2026-10-01 | Each `Guarantee` stores `default_cover` and `exit_cover` as absolute BRS amounts. Multipliers are for display only | Amended by [0012](../decisions/0012-fianca-aligned-guarantee-lifecycle.md) and [0016](../decisions/0016-coverage-ratio-below-one.md). The per-agency cap is removed (Pending ADR 0019) |
| [0007](../decisions/0007-fee-take-direct-to-treasury.md) | MUTAV's fee take goes directly to the treasury | Accepted, 2026-10-01 | `contribute_fees` sends MUTAV's take straight to `treasury_account`. There is no fees account and no `withdraw_fees` | None |
| [0008](../decisions/0008-uniform-capital-flow-and-pause-scope.md) | One capital flow for everyone; FIFO deposits; pause never blocks claims | Accepted, 2026-10-01 | MUTAV enters and exits the reserve through the same async queue as every holder. Deposits fill in strict FIFO. Pause never blocks claims | Amended by [0009](../decisions/0009-separate-mutav-money-flows.md), [0010](../decisions/0010-partial-fills-at-queue-head.md) and [0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md) |
| [0009](../decisions/0009-separate-mutav-money-flows.md) | Guarantee fees, MUTAV operation and MUTAV's reserve share are separate flows | Accepted, 2026-10-01 | Net guarantee fees go to the reserve and never mint shares. MUTAV's take goes to the treasury. MUTAV's capital is an ordinary allowlisted wallet | Amended by [0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md) |
| [0010](../decisions/0010-partial-fills-at-queue-head.md) | Partial fills at the head of the redemption queue | Accepted, 2026-10-02 | At most one partial fill, always of the head, priced at the NAV of that fill, with dust rules | The devnet release fills whole requests only. Partial fills ship in the first upgrade after the hackathon; the fields exist, so no migration is needed |
| [0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md) | Phase-2 instant exit, earmark-aware solvency and upgrade readiness | Accepted, 2026-10-02 | Instant exit is designed and ships disabled. Solvency is earmark-aware from the pilot. Layout rules R1 to R8 and fixed padding keep accounts upgradeable | The claim-notice gate is built before outside capital enters |
| [0012](../decisions/0012-fianca-aligned-guarantee-lifecycle.md) | Guarantees aligned with a limited fiança onerosa | Accepted, 2026-10-02 | One limited fiança per lease, with the two legs as sub-limits of one ceiling. Claims name a category of debt. MUTAV is principal pagador. Bank-first payment is allowed | The admin payment path is replaced by `approve_claim` (Pending ADR: Claims). The `quitacao_hash` arrives later as a new instruction version |
| 0013 | *Number not used* | n/a | The inflow-adjusted NAV guard planned under this number landed as decision 4 of [0017](../decisions/0017-brs-income-intake.md) | n/a |
| [0014](../decisions/0014-pay-claim-bound-with-concurrent-filings.md) | `pay_claim` bound with concurrent filings on one leg | Proposed, 2026-10-06 | A payment may spend its own filing's provision plus the leg's unprovisioned cover, never another open filing's provision | Refined by Pending ADR: Claims (`pay_claim` pays exactly the provision; `amend_claim` books more within the unprovisioned cover) |
| [0015](../decisions/0015-admin-clear-fulfil-halt.md) | Admin clear for the NAV-move halt | Proposed, 2026-10-06 | `clear_fulfil_halt()`, signed by the admin multisig, clears the halt and resets the guard's baseline | Amended by [0017](../decisions/0017-brs-income-intake.md). Also checks for a frozen reserve (decision log) |
| [0016](../decisions/0016-coverage-ratio-below-one.md) | Coverage ratio below 1.0, with a 0.10 floor and a provisions term | Proposed, 2026-10-07 | `c ≥ 0.10`. `coverage_required = max(ceil(c × remaining cover), provisions)`. Devnet starts at `c = 0.10` | Amended by Pending ADR: Coverage (stress buffer) and Pending ADR 0019 (per-agency cap removed from the devnet caps) |
| [0017](../decisions/0017-brs-income-intake.md) | BRS income intake: an income inbox and `sweep_income` | Proposed, 2026-10-07 | Issuer income lands in an inbox outside NAV. The operator sweeps each statement once. The NAV guard is net of inflows per share. Mint guard on Token-2022 extensions | Inflows are refused while share supply is zero (Pending ADR: Operator/admin separation) |
| [0018](../decisions/0018-brs-only-pilot-reserve.md) | BRS-only pilot reserve; assets expand through adapters | Accepted for the pilot, 2026-10-07 | The pilot reserve holds BRS only. A settlement-token floor (`min_settlement_bps`, pilot 100%) and per-adapter limits replace the per-asset cap | None |

## Pending ADRs

These decisions are taken and bind the devnet release design. Each will be written as an ADR, with the matching spec update, in the pull request that implements it.

| Pending ADR | What it records | Amends |
|---|---|---|
| **0019 v1 layout for the devnet release** | Account padding sized so the guarantee, claim and payout lifecycles of ADR 0012 fit without a migration. The payout SLA fields return to padding. The per-agency cap, the `AgencyExposure` account and its seed are removed; `Guarantee.agency_id` stays. The new fields are carved from padding before the layout freeze: `ClaimFiling.approved_amount`, `stress_buffer` in the caps, the sliding claim-window buckets, pending role and admin keys with their expiry, `max_reinstate_age`, `max_queue_wait_secs` (value 0) and the `IncomeReceipt` kind | 0006, 0011, 0016 |
| **Operator/admin separation and operator-compromise recovery** | The operator runs contracts and the guarantee and claim cycle. The reserve admin runs financial health and security through ceilings. The maximum loss from a compromised operator is the admin-set claim caps, because every other registry action is reversible by another operator action. `close_guarantee(reason)` with `VOID` or `RELEASED`. `reinstate_guarantee` within `max_reinstate_age`. Two-step handover for roles and the admin. Pending keys expire and `revoke_operator` clears them. Up to three pause-only guardians. Two multisigs. Inflows refused while supply is zero. Payout SLA removed from the program | 0003, 0008, 0012 |
| **Claims: approval, amendment, exact payment, sliding window** | Above `max_claim_per_call` a claim needs `approve_claim`, which binds an exact amount and counts toward the period cap. `pay_claim` pays exactly the filing's provision. `amend_claim` and `withdraw_claim` are operator actions. A re-file is allowed only from `WITHDRAWN` and resets approval, provision and filing time. The claim window is a strict sliding 30 days. Deposit and redemption fills carry NAV bounds set when they are proposed | 0003, 0012, 0014 |
| **Coverage: stress buffer and underwater reserve** | `coverage_required = max(ceil(c × remaining cover), provisions + min(stress_buffer, unprovisioned cover))`, with an admin-set R$ `stress_buffer`. `c` stays 0.10. Deposit fills are refused with `ReserveUnderwater` when net assets are zero with shares outstanding. MUTAV's backstop is booked with receipt kind `BACKSTOP` and mints no shares | 0016 |
| **Exit rights** | Exit stays open for wallets that already hold shares, even if they leave the allowlist. A full exit is allowed below `min_request`, from the owner's canonical share account only. A zero-value head fills as zero. `refund_deposit` (admin) returns a pending deposit to its owner. The owner's token account is created idempotently on cancel, claim and refund | 0008, 0010 |
| **Unsolicited money and backstop contributions** | A separate `unsolicited` PDA. Permissionless `skim` moves untracked balances there. The admin classifies, books (`UNSOLICITED` or `BACKSTOP`), returns to the source, or returns foreign classic SPL tokens. Runbook: return within 30 days, otherwise book; dust below R$10 is booked directly | 0004, 0017 |
| **Exit fallback** | After `max_queue_wait_secs` anyone may fill the head redemption under the same rules as the admin (free capital, FIFO, NAV guard, notice gate, pause). The upgrade time lock is at least the wait. The field is carved now with value 0 (off); the instruction is built before outside capital enters | 0008, 0011 |

## Decision log

Decisions for the devnet release, taken in the design walkthrough of 2026-10-09 and the follow-up passes of 2026-10-10. Later entries supersede earlier ones. "Governs" names the spec sections each decision changes; the documentation pages that describe these areas follow the same sections.

A code simplification pass for the devnet release is in progress. Where it changes account shapes or instruction names, the pending ADRs record the final form, and these pages are updated with them.

### Roles and governance

| Decision | Date | Rationale | Governs |
|---|---|---|---|
| The operator and the reserve admin are separate roles, and may be separate companies. The operator runs contracts, agencies and the guarantee and claim cycle. The admin runs reserve health and security through ceilings, not contract judgement | 2026-10-09 | Only the operator holds the contract information. The admin protects the reserve with limits it can set and check | [spec §2](../spec.md#2-roles-and-keys); roles and permissions |
| The maximum loss from a compromised operator is the admin-set claim caps. Every other registry change is reversible by an ordinary operator action | 2026-10-09 | Bounds operator risk to a number the admin controls. No money gets stuck | [spec §2](../spec.md#2-roles-and-keys), [§8](../spec.md#8-caps); security model |
| Recovery uses ordinary operator actions: register is undone by `close_guarantee(VOID)`, close by `reinstate_guarantee`, `file_claim` by `withdraw_claim`. Only `pay_claim` is irreversible. After a compromise: freeze, appoint a new operator, reconcile the platform registry against on-chain events, then correct. The admin signs no redemptions until reconciliation ends | 2026-10-09 | No admin rollback instructions and no time-window arguments are needed. The admin role stays financial | [spec §5.2](../spec.md#52-guarantees-operator), [§5.4](../spec.md#54-claims-and-payouts-operator); runbook |
| Role and admin handovers are two-step: `propose_roles` / `accept_role` and `propose_admin` / `accept_admin`. Pending keys expire, and `revoke_operator` clears them | 2026-10-10 | A mistyped address cannot be appointed. The admin can rotate without a program upgrade | [spec §5.1](../spec.md#51-admin-and-roles) |
| Up to three pause-only guardian keys, set by the admin. A guardian can only `pause` | 2026-10-10 | Faster pause without widening any other power | [spec §2](../spec.md#2-roles-and-keys), [§5.1](../spec.md#51-admin-and-roles) |
| Two multisigs with the same members: an admin multisig with a short time lock and an upgrade multisig with a long one. Devnet: 5 minutes and 1 hour. Real pilot: 24 hours and 7 days | 2026-10-10 | Closes open question Q15. Routine admin changes stay quick; code changes stay slow | [spec §2](../spec.md#2-roles-and-keys), [§12](../spec.md#12-open-questions) |
| Pause stops only capital flows (`request_*`, `fulfil_*`) and new guarantees. Every claim, correction, refund, unsolicited-money and handover instruction stays open | 2026-10-10 | Claims are never blocked, and holders can always cancel and claim | [spec §5](../spec.md#5-instructions); pause scope |
| The treasury and payments accounts may not be owned by the operator | 2026-10-10 | Keeps the operator out of the destinations of reserve outflows | [spec §5.1](../spec.md#51-admin-and-roles) |

### Guarantees

| Decision | Date | Rationale | Governs |
|---|---|---|---|
| `close_guarantee(reason)` closes as `VOID` (active, nothing paid, no open claim) or `RELEASED` (active, no open claim, in the pilot) | 2026-10-09 | One instruction with an explicit reason; closes are reversible, so no release cap is needed | [spec §5.2](../spec.md#52-guarantees-operator) |
| `reinstate_guarantee` is an operator action, allowed only within the admin-set `max_reinstate_age`, and emits `GuaranteeReinstated` | 2026-10-10 | Makes a close reversible while keeping the window short and visible in the activity feed | [spec §5.2](../spec.md#52-guarantees-operator), [§9](../spec.md#9-events) |
| The per-agency cap, the `AgencyExposure` account and its seed are removed. `Guarantee.agency_id` stays, and the app derives per-agency figures from guarantee accounts | 2026-10-10 | Simpler accounts; a future concentration limit can return as a new account | [spec §3](../spec.md#3-accounts), [§8](../spec.md#8-caps); Pending ADR 0019 |
| `register_guarantee` and `clear_fulfil_halt` read the `reserve` account and treat a frozen reserve as zero liquid BRS | 2026-10-10 | Gates use the same view of the reserve as `refresh` | [spec §5.1](../spec.md#51-admin-and-roles), [§5.2](../spec.md#52-guarantees-operator) |

### Claims

| Decision | Date | Rationale | Governs |
|---|---|---|---|
| A claim above `max_claim_per_call` needs `approve_claim(notice_ref_hash, amount)` from the admin multisig, binding an exact amount. Approved amounts count toward the period cap. For a large claim the admin raises the period cap in the same proposal and lowers it later | 2026-10-09 | The admin approves the amount leaving the reserve, not the validity of the claim. Replaces `pay_claim_admin` | [spec §5.4](../spec.md#54-claims-and-payouts-operator), [§8](../spec.md#8-caps) |
| `pay_claim` pays exactly the filing's provision | 2026-10-10 | No payment releases provision silently. To settle for less, amend down, then pay | [spec §5.4](../spec.md#54-claims-and-payouts-operator) |
| `amend_claim(notice, new_amount)` is an operator action. Lower releases the difference; higher books more, within the leg's unprovisioned cover. It emits `ClaimAmended` and resets any approval | 2026-10-10 | Corrections happen in the open, and an approval always matches the amount paid | [spec §5.4](../spec.md#54-claims-and-payouts-operator), [§9](../spec.md#9-events) |
| `withdraw_claim` is an operator action that releases the provision and sets status `WITHDRAWN`. A re-file on the same notice is accepted only from `WITHDRAWN` and resets the approval, provision and filing time | 2026-10-09, refined 2026-10-10 | Every filing is reversible, and an old approval can never apply to a new filing | [spec §5.4](../spec.md#54-claims-and-payouts-operator) |
| The claim period cap uses a strict sliding 30-day window (two buckets, the previous one weighted and rounded up) | 2026-10-09 | No 30-day span can exceed `max_claim_per_period` | [spec §8](../spec.md#8-caps) |
| MUTAV may pay the agency by PIX from its own bank account first; the reserve then reimburses `payments_account` through `pay_claim` | 2026-10-09 | Claims above the caps are paid on time while the approval runs | [spec §2.2](../spec.md#22-mutav-as-fiador-off-chain-duties-adr-0012), [§5.4](../spec.md#54-claims-and-payouts-operator) |
| The payout SLA is removed from the program. `settle_payout` stays as the settlement record. The service levels live in the operator platform | 2026-10-09 | The reserve's on-chain promise is that, within the caps, `pay_claim` is never refused | [spec §3.7](../spec.md#37-payout), [§5.4](../spec.md#54-claims-and-payouts-operator), [§9](../spec.md#9-events) |
| `settle_payout` keeps only `pix_e2e_hash` in the pilot. The `quitacao_hash` arrives with ADR 0012 as a new instruction version, and attestation becomes required once operator and admin are separate companies | 2026-10-09 | Keeps the pilot simple while MUTAV holds both roles | [spec §5.4](../spec.md#54-claims-and-payouts-operator) |

### Coverage

| Decision | Date | Rationale | Governs |
|---|---|---|---|
| `coverage_required = max(ceil(c × remaining cover), provisions + min(stress_buffer, unprovisioned cover))`, with `stress_buffer` an admin-set R$ amount | 2026-10-09 | Claims are per event (one month's rent, or one exit payment), so stress means the claims that could be filed next, not every full cover | [spec §4](../spec.md#4-invariants-and-formulas), [§8](../spec.md#8-caps) |
| `c` stays 0.10 | 2026-10-09 | Confirms [ADR 0016](../decisions/0016-coverage-ratio-below-one.md) for devnet | [spec §4](../spec.md#4-invariants-and-formulas) |
| Deposit fills are refused with `ReserveUnderwater` when net assets are zero with shares outstanding. MUTAV's backstop is booked by the admin with receipt kind `BACKSTOP`; no shares are minted | 2026-10-09 | New capital never buys into an empty reserve. The backstop restores the reserve without diluting holders | [spec §5.5](../spec.md#55-investor-capital-async), [§6](../spec.md#6-under-coverage-mode) |

### Capital

| Decision | Date | Rationale | Governs |
|---|---|---|---|
| A deposit fill must mint more than zero shares. `contribute_fees` and `sweep_income` are refused while share supply is zero; money waits in the inbox until the first deposit is filled | 2026-10-09 | No inflow is ever priced against an empty supply | [spec §5.3](../spec.md#53-guarantee-fees-operator), [§5.3a](../spec.md#53a-issuer-income-operator), [§5.5](../spec.md#55-investor-capital-async) |
| `fulfil_deposits` and `fulfil_redeems` check the NAV-move guard inline and take `nav_bounds (min, max)`, composed when the admin proposes them; outside the bounds they refuse with `NavOutOfBounds` | 2026-10-09, 2026-10-10 | A fill executes at the NAV the signers saw. This keeps the operator's maximum impact within the claim caps | [spec §5.5](../spec.md#55-investor-capital-async), [§7](../spec.md#7-price-safety) |
| Exit stays open: `request_redeem` skips the allowlist for wallets that already hold shares. `refund_deposit(seq)` (admin) returns a pending deposit to its owner and unblocks the queue | 2026-10-09 | A holder who is de-listed can still leave, and a stuck deposit can always be returned | [spec §5.5](../spec.md#55-investor-capital-async) |
| A full exit (all of the owner's shares) is allowed below `min_request`, from the owner's canonical share account only. A zero-value head fills as a zero-asset fill | 2026-10-09, 2026-10-10 | Dust can always leave, and a tiny request never stops the queue | [spec §5.5](../spec.md#55-investor-capital-async) |
| The devnet release fills whole requests only. Partial fills ([ADR 0010](../decisions/0010-partial-fills-at-queue-head.md)) ship in the first upgrade after the hackathon | 2026-10-09 | Fewer moving parts for the demo; the fields already exist | [spec §5.5](../spec.md#55-investor-capital-async) |
| Request PDAs keep global sequence seeds; the client retries with the next sequence. `cancel_*`, `claim_*` and `refund_deposit` create the owner's token account idempotently | 2026-10-10 | Closes open question Q27; holders never need a separate setup step to receive money | [spec §3.8](../spec.md#38-depositrequest-and-redeemrequest), [§5.5](../spec.md#55-investor-capital-async) |
| Exit fallback: after `max_queue_wait_secs` anyone may fill the head redemption under the same rules. The field is carved now with value 0; the instruction is built before outside capital | 2026-10-10 | Follows established practice for timelocked governance: holders can leave before any upgrade takes effect | [spec §5.5](../spec.md#55-investor-capital-async), [§14](../spec.md#14-upgrade-readiness) |

### Unsolicited money

| Decision | Date | Rationale | Governs |
|---|---|---|---|
| A dedicated `unsolicited` PDA, separate from the income inbox. Returns can leave only from it | 2026-10-09 | Issuer income can never be "returned"; unsolicited money has one place and one owner, the reserve admin | [spec §3.3](../spec.md#33-vault-authority-and-token-accounts) |
| `skim(account)` is permissionless. It moves the untracked balance of `reserve`, `pending_deposits` and `claims` into `unsolicited`, refuses frozen accounts and emits `UnsolicitedSkimmed` | 2026-10-09 | Tracked accounts hold only tracked money; anyone, including a monitor, can tidy them | [spec §5.8](../spec.md#58-public) |
| The admin classifies (`classify_unsolicited`), books (`book_unsolicited`, kind `UNSOLICITED` or `BACKSTOP`), returns to the source (`return_unsolicited`), or returns foreign classic SPL tokens (`return_foreign`). The operator keeps only `sweep_income` | 2026-10-09 | No stuck money; every movement is an admin decision with a reference hash | [spec §5.1](../spec.md#51-admin-and-roles), [§3.14](../spec.md#314-incomereceipt) |
| Runbook: return if the sender is identified and asks within 30 days, otherwise book. Dust below R$10 is booked directly | 2026-10-10 | A clear, short rule the admin can follow | Runbook |

### Deferred features

| Decision | Date | Rationale | Governs |
|---|---|---|---|
| A cumulative NAV-guard baseline ships with the first post-hackathon upgrade, with the real-pilot `max_nav_move_bps` | 2026-10-09 | Carved from padding, so no migration | [spec §7](../spec.md#7-price-safety) |
| Redemption price protection (`min_assets_out`) is deferred to a later ADR | 2026-10-10 | Not needed while the admin composes `nav_bounds` | [spec §5.5](../spec.md#55-investor-capital-async) |
| The claim-notice gate ([ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md) decision 5a) is built before outside capital. Until then the runbook files the claim before any fill | 2026-10-10 | MUTAV is the only capital provider on devnet | [spec §3.12](../spec.md#312-claimnotice) |
| Share transferability (PC-32): shares are transfer-restricted on mainnet, decided before mainnet `initialize`. Devnet keeps classic SPL shares | 2026-10-10 | Interacts with the open-exit rule | [spec §11](../spec.md#11-requirements-from-the-adversarial-review) |
| The income take cap (Q47) stays 0 until a commercial decision | 2026-10-10 | Fails closed: all issuer income builds the reserve | [spec §12](../spec.md#12-open-questions) |

### Devnet values

| Parameter | Value | Date |
|---|---|---|
| Coverage ratio `c` | 0.10 | 2026-10-10 |
| `max_tvl` | R$300k | 2026-10-10 |
| Cover per guarantee | R$40k | 2026-10-10 |
| Claim caps | R$10k per call; R$20k per sliding 30 days | 2026-10-10 |
| Request size | R$1k to R$100k | 2026-10-10 |
| Settlement floor | 100% | 2026-10-10 |
| `max_nav_move_bps` | 10000 (lowered for the real pilot) | 2026-10-10 |
| `stress_buffer` | R$19k | 2026-10-10 |
| `fee_take_bps` | 2000 | 2026-10-10 |
| Guardians | 1 | 2026-10-10 |
| Reserve mint | Nora's devnet BRS, classic SPL Token, 6 decimals | 2026-10-09 |
| Time locks | Admin multisig 5 minutes; upgrade multisig 1 hour | 2026-10-10 |
| Operator and pauser keys | Generated at deploy | 2026-10-09 |

### Pilot app

| Decision | Date | Rationale | Governs |
|---|---|---|---|
| On devnet the app sends transactions through the connected wallet. The server relay runs only on localnet | 2026-10-09 | The app holds no transaction path it does not need | [app spec](../../app/docs/spec.md) |
| Reads use the public devnet RPC with short CDN caching | 2026-10-09 | No private RPC key in the app | [app spec](../../app/docs/spec.md) |
| The admin screen scans every live Squads proposal and can reject or cancel them | 2026-10-09 | Signers see every pending change, not only the latest | [app spec](../../app/docs/spec.md) |
| Safe response headers now; a full CSP header in report-only mode, enforced after the demo | 2026-10-09 | Protects the pages without breaking the demo | [app spec](../../app/docs/spec.md) |
| An operator-activity feed (registers, closes, filings, payments, reinstatements in the last 24 hours) on the reserve or admin page | 2026-10-09 | Early detection of unexpected operator actions | [app spec](../../app/docs/spec.md) |

## Related sections

- [Introduction](../introduction/README.md)
- [Reserve framework](../reserve-framework/README.md)
- [Architecture](../architecture/README.md)
- [Security and verification](../security/README.md)
- [Sources](../meta/sources.md)

## Sources

- [`docs/decisions/`](../decisions/): ADRs 0001 to 0018.
- [`spec.md`](../spec.md), in particular [§12 Open questions](../spec.md#12-open-questions) and [§14 Upgrade readiness](../spec.md#14-upgrade-readiness).
- [`plan.md`](../plan.md), for the history of ADR number 0013.
- [`app/docs/spec.md`](../../app/docs/spec.md), for the pilot app.
- Workspace design notes (not in this repository): the refactor handoff's locked decisions and the design walkthrough's decision log, 2026-10-09 and 2026-10-10.

## Decisions

This page indexes every decision. It is itself governed by:

- [ADR 0001 Record architecture decisions](../decisions/0001-record-architecture-decisions.md).
- Pending ADR: 0019 v1 layout for the devnet release.
- Pending ADR: Operator/admin separation and operator-compromise recovery.
- Pending ADR: Claims: approval, amendment, exact payment, sliding window.
- Pending ADR: Coverage: stress buffer and underwater reserve (amends 0016).
- Pending ADR: Exit rights.
- Pending ADR: Unsolicited money and backstop contributions.
- Pending ADR: Exit fallback.
