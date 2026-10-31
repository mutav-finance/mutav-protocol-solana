# Open questions and possible improvements

This page is the single register of what the MUTAV reserve design has **not** decided yet, and of the features and hardening it deliberately leaves for later. Every other page links here instead of keeping its own list.

- **Open questions** are undecided items. Each has an owner and a milestone it must be settled before.
- **Possible improvements** are deferred features and hardening steps. The design already leaves room for most of them (a carve from padding or a new account), so none needs an account migration.

Decided items live in the [decision index](decisions.md) and the ADRs. When a question here is decided, it moves to an ADR (or a runbook or app rule) and its row is marked **Resolved** with a link to where it was decided, so the history stays readable.

## How to read the tables

| Column | Meaning |
|---|---|
| Owner | Who must answer or build it: **founders** (MUTAV's product and commercial decisions), **Etherfuse** (the TESOURO issuer), **Nora** (the BRS issuer), **counsel** (a legal opinion), **implementation** (settled while writing the program, client, app or scripts) |
| Needed before | **Deploy**: the devnet deploy. **Outside capital**: before any capital provider other than MUTAV can deposit. **Mainnet**: before the mainnet `initialize` and the real pilot with real BRS. **Later**: no milestone fixed |

## Open questions

### Commercial and economic parameters

| Item | Why it matters | Owner | Needed before | Source |
|---|---|---|---|---|
| **Resolved by [ADR 0028](../decisions/0028-pilot-parameters.md):** 2,000 bps (20%) for devnet and the pilot. Fee take for the real pilot (`fee_take_bps`; program maximum 30%) | Sets how each guarantee fee splits between MUTAV's treasury and the reserve | founders | Mainnet | [spec §12 Q4](../spec.md#12-open-questions), [Guarantee fees](../for-agencies/fees.md) |
| Take from issuer income (the cap and whether any take applies; v1 holds no income-take field, so all income builds the reserve) | A take returns only as a carve and an upgrade; it changes what holders earn. The tax treatment of income routed into the reserve also needs an opinion | founders, counsel | Later | [spec §12 Q47](../spec.md#12-open-questions), [ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md), [Assets and income](../reserve-framework/assets-and-income.md) |
| Final guarantee-fee pricing, and whether the working parameter (9%, 12% or 15% of rent by score band) may appear in public documentation | It is the agency offer; publishing a working figure can read as a commitment | founders | Deploy (publication) | [Guarantee fees](../for-agencies/fees.md) |
| Late-bill terms: grace period, late charges, when new registrations stop, who bears a defaulting tenant's fee | Belongs in the partnership agreement; the program has no rule for it | founders, counsel | Mainnet | [Guarantee fees](../for-agencies/fees.md) |
| **Resolved by [ADR 0028](../decisions/0028-pilot-parameters.md):** `c` 0.25, `max_tvl` R$1M, R$120k per guarantee, claim caps R$15k per call and R$20k per 31 days, requests R$1k to R$100k, `stress_buffer` R$19k (set and locked), for devnet and the pilot. Real-pilot cap values (`max_tvl`, cover per guarantee, claim caps, request sizes) and the real-pilot `stress_buffer` | The earlier devnet values were demo sizes; the pilot needed values sized from the planned book | founders | Mainnet | [spec §12 Q3](../spec.md#12-open-questions), [Parameters](../reserve-framework/parameters.md) |
| Real-pilot `max_nav_move_bps` (devnet 10,000, which never halts; still open after ADR 0028) | The NAV-move guard only protects fills once the bound is real | founders | Mainnet | [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md), [Parameters](../reserve-framework/parameters.md) |
| `max_queue_wait_secs` once the exit fallback is switched on (0 until then) | Sets how long a holder may wait before anyone can fill the head redemption, and the minimum upgrade time lock | founders | Outside capital | [ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md) |
| Time-lock values beyond those set: devnet 5 minutes and 1 hour and real pilot 24 hours and 7 days are decided; still open are the adapter `risk_delay_secs` and confirming the upgrade time lock against the chosen `max_queue_wait_secs` | Holders must be able to leave before a risk-adding change or an upgrade lands | founders | Outside capital | [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md), [ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md), [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) |
| MUTAV's backstop commitment: the amount, and when it is disclosed | Capital providers rely on it for an underwater reserve. How it is booked is settled by [ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md): through `contribute_fees` until the `BACKSTOP` booking ships | founders | Outside capital | [ADR 0022](../decisions/0022-coverage-stress-buffer-underwater-reserve.md), [Risks](../for-capital-providers/risks.md) |
| Remaining program questions in the spec: recoveries flowing back to the reserve (Q5), the NAV denominator for escrowed shares (Q12), the allocation gate (Q18), staleness and deviation bounds (Q21), the MUTAV bar when shares move (Q30), queue liveness under claim notices (Q32), and the review items still open in spec §11 (Q22 list) | Each changes a gate, a formula or a cap; each needs an ADR when decided | founders | Outside capital | [spec §11](../spec.md#11-requirements-from-the-adversarial-review), [spec §12](../spec.md#12-open-questions) |

### Capital and coverage rules resolved by ADR 0028 and ADR 0029

These were open in the spec and the earlier ADRs, and are now decided and in the devnet binary.

| Item | Resolution | Source |
|---|---|---|
| Pilot coverage ratio and stress buffer | **Resolved:** `c` = 0.25 (floor 0.10) and `stress_buffer` R$19k, set and locked | [ADR 0028](../decisions/0028-pilot-parameters.md) |
| The stress-buffer term in coverage required | **Resolved:** `max(ceil(c × remaining cover), provisions + min(stress_buffer, unprovisioned))`; the claim path saturates instead of failing; `stress_buffer ≤ max_tvl` | [ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md) decision 1 |
| What "underwater" means | **Resolved:** NAV per share below the smallest published unit while shares are outstanding; both fills refuse with `ReserveUnderwater`, cancels stay open; an empty reserve is not underwater | [ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md) decision 3 |
| Inflows while no shares exist | **Resolved:** `contribute_fees` and `sweep_income` refuse with `NoSharesOutstanding` | [ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md) decision 2 |
| A redemption head worth 0 BRS | **Resolved:** never filled; `fulfil_redeems` stops with the head untouched, and the owner cancels it, or the admin parks it | [ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md) decision 6; [ADR 0030](../decisions/0030-admin-cancel-parks-the-request.md) |
| Sub-minimum exits | **Resolved:** below `min_request`, only an exit of the balance from the canonical share account, leaving less than `min_request`, worth at least `max(1, min_request / 10)` (R$100); a smaller balance waits | [ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md) decision 6 |
| Exit open to holders | **Resolved:** `request_redeem` checks the allowlist only when the debited share account is empty | [ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md) decision 6 |
| How the inline NAV guard reports a move, and its baseline across an empty supply | **Resolved:** a fill refuses with `FulfilHalted` without latching, the next `refresh` latches; the baseline is seeded by the first minting fill and cleared by the last burning fill | [ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md) decisions 4 and 5 |

### Legal and agency terms

| Item | Why it matters | Owner | Needed before | Source |
|---|---|---|---|---|
| Contractual payment term N from a complete payment request, and what makes a request complete | Defines "paid on time" and the platform's service target (the program keeps no payout deadline) | counsel, founders | Mainnet | [spec §12 Q36](../spec.md#12-open-questions), [ADR 0021](../decisions/0021-claims-approval-amendment-exact-payment.md), [Claims](../for-agencies/claims.md) |
| Agency filing window: the working process (day 3 to day 9) against the spec's 15 days, and whether the program enforces it | Sets when the platform accepts a claim, and whether a late filing can be refused on-chain | founders, counsel | Mainnet | [spec §12 Q14](../spec.md#12-open-questions), [Claims](../for-agencies/claims.md) |
| Claims-tail length after the keys or an exoneration | Needed for the ADR 0012 lifecycle; until set, guarantees stay `ACTIVE` | counsel | Later (lifecycle upgrade) | [spec §12 Q35](../spec.md#12-open-questions), [Guarantee lifecycle](../for-agencies/guarantee-lifecycle.md) |
| A cover change after registration (rent change, addendum, renewal) needs an instruction that is not specified | Today a rent increase cannot raise a guarantee's cover; it must be closed and registered again | founders, implementation | Later | [spec §12 Q22](../spec.md#12-open-questions), [Guarantee lifecycle](../for-agencies/guarantee-lifecycle.md) |
| LGPD: re-identification risk of per-lease records, given that `agency_id` is public and lets anyone group guarantees by agency | Personal-data exposure of tenants and landlords through public accounts | counsel | Outside capital | [Guarantee lifecycle](../for-agencies/guarantee-lifecycle.md), [Transparency](../introduction/transparency.md) |
| Legal form of the fiança: under-coverage wording on `/reserve`, exhaustion, accessories inside the ceiling, discharge under the mandate, exoneration, CC 838 I consents (spec §12 Q37 to Q41, Q44 to Q46) | The instrument is signed on these answers, and the public disclosure follows them | counsel | Mainnet | [spec §12](../spec.md#12-open-questions), [What is MUTAV](../introduction/what-is-mutav.md) |
| Share transferability: the mechanism for transfer-restricted shares on mainnet (PC-32), which must keep exit open for holders | Decided before the mainnet `initialize`, because the share mint's setup cannot change afterwards | founders | Mainnet | [spec §11](../spec.md#11-requirements-from-the-adversarial-review), [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md), [Known limitations](../security/known-limitations.md) |

### Issuers: Nora (BRS) and Etherfuse (TESOURO)

| Item | Why it matters | Owner | Needed before | Source |
|---|---|---|---|---|
| Mainnet BRS mint: its address, whether it stays classic SPL Token with 6 decimals, and whether its mint-authority program can be upgraded | The program refuses any other mint shape; the mint rules apply to the reserve's only asset | Nora | Mainnet | [spec §12 Q34](../spec.md#12-open-questions), [Sources](sources.md) |
| BRS freeze authority: today a single Nora key can freeze any BRS account, the reserve's included. Move it to a multisig with published freeze criteria | A frozen reserve stops claim payments and new guarantees | Nora | Mainnet | [spec §12 Q34](../spec.md#12-open-questions), [Known limitations](../security/known-limitations.md) |
| Terms of Nora's revenue share (term, basis, rate, payment day, statement format, reference per payment) | Decides what `sweep_income` books and how statements are verified | Nora, founders | Mainnet | [spec §12 Q48](../spec.md#12-open-questions), [Assets and income](../reserve-framework/assets-and-income.md) |
| TESOURO redemption lead time, in writing, for the size MUTAV would hold | Sizes the BRS floor; the TESOURO cap stays 0 without it | Etherfuse | Later (TESOURO cap above 0) | [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) |
| The `BondPrice` field layout and how often it is updated | The primary TESOURO price source and its staleness limit | Etherfuse | Later (TESOURO cap above 0) | [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), [spec §12 Q2](../spec.md#12-open-questions) |
| Who holds TESOURO's mint authority, its interest-rate authority and the stablebond program's upgrade authority | Each can change the asset or its price under the reserve | Etherfuse | Later (TESOURO cap above 0) | [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) |
| Whether the redeeming party can be the Squads vault or a program PDA; if not, the admin needs a KYC'd account it controls | Decides the whitelisted destination of two-phase moves | Etherfuse | Later (TESOURO cap above 0) | [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) |
| A BRS or BRL route in and out of TESOURO | TESOURO waits on it | Etherfuse | Later (TESOURO cap above 0) | [ADR 0018](../decisions/0018-brs-only-pilot-reserve.md), [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), [spec §12 Q6](../spec.md#12-open-questions) |

### Adapter design (ADR 0027, proposed)

| Item | Why it matters | Owner | Needed before | Source |
|---|---|---|---|---|
| Acceptance of the proposed parts of ADR 0027 (the adapter model, bands, pricing and slow changes); the decided parts are who moves assets, the emergency path and the floor on `fulfil_redeems` | No adapter can be built until the design is accepted | founders | Later (first adapter upgrade) | [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) |
| Adapter floor parameters: the form of `obligations_floor` (the recommended form or the research form), `exit_lead_time_secs`, `target_bps`, `band_bps`, `cap`, `max_share_bps`, `max_in_transit`, `max_slippage_bps`, `max_emergency_discount_bps`, the rate band and the corridor bounds | Each sets how much of the reserve can sit outside BRS and how fast it can come back | founders | Later (first adapter upgrade) | [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), [Assets and income](../reserve-framework/assets-and-income.md) |

### Implementation and deploy

| Item | Why it matters | Owner | Needed before | Source |
|---|---|---|---|---|
| **Resolved for the devnet binary (the IDL fixes them):** `set_guardians` and `GuardiansUpdated`, `NoSharesOutstanding` ([ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md)), `ExpectedAmountMismatch`, `NoPendingHandover` and `HandoverExpired`, and the close reasons `RELEASED` = 1 and `VOID` = 2; the reinstatement-window error and the surplus-share burn arrive with their upgrades. Names not fixed by an ADR: the guardian-appointment instruction and its event, the head-moved event, the zero-share and supply-zero errors, the error for a `pay_claim` whose `expected_amount` is not the provision, the handover-expired and reinstatement-window errors, the numeric values of the close reasons `VOID` and `RELEASED`, whether burning surplus escrowed shares is its own instruction or a `return_unsolicited` option | The IDL of the first devnet deploy fixes them; the pages name them generically until then | implementation | Deploy | [Program reference](../technical-resources/program-reference.md) |
| **Resolved by [ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md):** `stress_buffer ≤ max_tvl` (0 turns it off); `max_staleness_secs` is not in v1. Upper bounds in `validate_params` for `stress_buffer` and `max_staleness_secs` | A bound keeps a mistyped proposal from disabling a gate | implementation | Deploy | [ADR 0022](../decisions/0022-coverage-stress-buffer-underwater-reserve.md), [Configuration and reference](../technical-resources/configuration-and-reference.md) |
| `invoice_ref_hash` as a keyed hash of the bill: confirm it is adopted | Agency privacy against self-verification of a fee receipt | founders, implementation | Deploy | [Guarantee fees](../for-agencies/fees.md) |
| Devnet role and account assignments still open: the pauser key, the guardian key, the MUTAV capital wallet, and the treasury and payments token accounts (none owned by the operator) | `initialize` and the deploy scripts need them | founders, implementation | Deploy | [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md), [Deployment and operations](../technical-resources/deployment-and-operations.md) |
| **Resolved for the devnet binary by [ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md):** the operator sends it with `contribute_fees`, with a fresh reference recorded as a backstop (no shares minted; the take applies, so MUTAV sends the amount needed divided by 1 − take); the route for `book_unsolicited` is settled when it ships. How MUTAV's backstop BRS reaches the `unsolicited` account before `book_unsolicited(kind = BACKSTOP)` books it (a plain transfer then `skim`, or a direct route) | The runbook and `/admin` must compose it the same way every time | implementation | Deploy | [ADR 0024](../decisions/0024-unsolicited-money-and-backstop.md), [Deployment and operations](../technical-resources/deployment-and-operations.md) |
| The runbook for a pending deposit whose owner token account the issuer has frozen, so `cancel_deposit` cannot complete | Such a deposit can sit at the head of the queue | founders, implementation | Outside capital | [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md) |
| Real members and hardware keys for both Squads multisigs, and who holds the real-pilot pauser and guardian keys (including whether a monitoring bot holds a guardian key) | Devnet uses wallet stand-ins and generated keys; real money needs the final key holders | founders | Mainnet | [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md), [Governance and keys](../security/governance-and-keys.md) |
| The internal security audit before the devnet deploy, and when its report is published | The public record of what was reviewed and fixed | founders, implementation | Deploy | [Reviews and audits](../security/reviews-and-audits.md) |
| **Resolved:** v1 stores no settlement floor; it returns with the first adapter upgrade. Whether v1 stores the settlement floor (`min_settlement_bps`) or drops the field until the first adapter upgrade. ADR 0026 removes only the stored complement; either way the pilot floor is 100% because the reserve holds BRS only | The deploy check and the parameter pages must match the frozen layout | implementation | Deploy | [ADR 0018](../decisions/0018-brs-only-pilot-reserve.md), [ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md), [Parameters](../reserve-framework/parameters.md) |
| **Resolved:** the sizes are fixed in `programs/mutav/src/constants.rs` and the golden layout fixtures. Exact account sizes, offsets and the padding left per account after the carves | The documentation tables must match the golden layout fixtures | implementation | Deploy | [ADR 0019](../decisions/0019-v1-layout-for-the-devnet-release.md), [Accounts](../architecture/accounts.md), [Configuration and reference](../technical-resources/configuration-and-reference.md) |
| Where the operator-activity feed sits (`/reserve` or `/admin`) | Early detection of unexpected operator actions | implementation | Deploy | [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md), [Transparency](../introduction/transparency.md) |
| The app's rate limit at the edge (a WAF rule on the proposal and transaction-build routes) needs the founders' confirmation before it is applied | Protects the public devnet RPC during the demo | founders | Deploy | [Deployment and operations](../technical-resources/deployment-and-operations.md) |

## Possible improvements

### Program features

| Item | Why it matters | Owner | Needed before | Source |
|---|---|---|---|---|
| Partial fills at the head of the redemption queue, with any fee or rounding computed once per request | A head request larger than free capital waits today | implementation | Later (first upgrade) | [ADR 0010](../decisions/0010-partial-fills-at-queue-head.md), [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md) |
| Build the exit fallback (the permissionless head fill after `max_queue_wait_secs`) | Gives outside holders an exit that does not depend on the admin | implementation | Outside capital | [ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md) |
| Build the claim-notice gate, together with the exit fallback. Until then the runbook files a claim before any fill | No one enters or leaves at a NAV that misses a known loss | implementation | Outside capital | [ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md), [spec §3.12](../spec.md#312-claimnotice) |
| A cumulative baseline for the NAV-move guard, carved from padding, with the real-pilot `max_nav_move_bps` | The guard compares each move with the last published NAV, so a slow drift across many refreshes is not caught | implementation | Mainnet | [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md), [Known limitations](../security/known-limitations.md) |
| Requester price protection: a `min_assets_out` carved from request padding, with its own ADR | Today a redemption fills inside the admin's `nav_bounds`, with no minimum set by the holder | founders, implementation | Later | [Known limitations](../security/known-limitations.md) |
| A holding period or timing guard against buying just before a monthly income step | Matters once outside investors can deposit | founders, implementation | Outside capital | [spec §12 Q49](../spec.md#12-open-questions) |
| A KYC attester whose signature is bound to an action and an amount | A finer gate than the allowlist root | founders, implementation | Later | [Security and verification](../security/README.md) |
| A `quote_nav` view instruction | Lets clients read a NAV quote computed by the program | implementation | Later | [Client SDK](../technical-resources/client-sdk.md) |
| Share-token metadata (`init_share_metadata`) | Wallets show a named share token | implementation | Later | [Client SDK](../technical-resources/client-sdk.md) |
| A share-supply drift check (the mint's supply against `shares_outstanding`) | Detects any mint or burn the program did not record | implementation | Later | [Invariants](../security/invariants.md) |
| A per-agency concentration limit as a new account (PC-43) | The per-agency cap was removed from v1; concentration is watched off-chain | founders, implementation | Later | [ADR 0022](../decisions/0022-coverage-stress-buffer-underwater-reserve.md) |
| The ADR 0012 lifecycle states: exoneration, lease end, exhaustion, the claims tail, claim categories, the `quitacao_hash` | Aligns the on-chain record with the full fiança lifecycle | implementation | Later | [ADR 0012](../decisions/0012-fianca-aligned-guarantee-lifecycle.md), [Known limitations](../security/known-limitations.md) |
| Adapters and a second reserve asset, per ADR 0027 once accepted | Expands the reserve beyond BRS | implementation | Later | [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) |
| A permissionless check that only flags due deallocations | Makes a BRS shortfall visible without moving value | implementation | Later | [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) |
| Phase-2 instant exit at a haircut | A priced exit with its own buffer | founders, implementation | Later | [ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md) |

### Operations and transparency

| Item | Why it matters | Owner | Needed before | Source |
|---|---|---|---|---|
| A `refresh` crank on a fixed cadence and a watcher for events and Squads proposals (including the alert on a change of the payments account's owner, and the `skim` monitor) | Keeps published NAV fresh and surfaces unexpected actions early | implementation | Outside capital | [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md), [ADR 0024](../decisions/0024-unsolicited-money-and-backstop.md), [Deployment and operations](../technical-resources/deployment-and-operations.md) |
| `/reserve` reads the role keys and authorities from chain and shows MUTAV's own share of the capital | The public page then cannot drift from the program's real configuration | implementation | Outside capital | [Transparency](../introduction/transparency.md) |
| An attestation of the registry and of claim settlements once operator and admin are separate companies | The admin then relies on operator data it did not produce | founders | Later (role split) | [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md) |

### Verification

| Item | Why it matters | Owner | Needed before | Source |
|---|---|---|---|---|
| A rehearsal of a program upgrade on a Surfpool fork | Proves that an upgrade keeps every account readable before it is done for real | implementation | Mainnet | [Upgrades and layout](../architecture/upgrades-and-layout.md) |
| Invariant fuzzing of the program | Searches for inputs that break an invariant the unit and property tests miss | implementation | Mainnet | [Reviews and audits](../security/reviews-and-audits.md) |
| An independent security audit: auditor, scope and date | Required before real capital beyond MUTAV's | founders | Mainnet | [Reviews and audits](../security/reviews-and-audits.md) |

## Related sections

- [Decisions](decisions.md)
- [Known limitations](../security/known-limitations.md)
- [Parameters](../reserve-framework/parameters.md)
- [Sources](sources.md)

## Sources

- [`spec.md` §11](../spec.md#11-requirements-from-the-adversarial-review) and [§12 Open questions](../spec.md#12-open-questions).
- The open items noted on every page of this documentation.
- [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), "Open items to confirm with Etherfuse".

## Decisions

- [ADR 0001: Record architecture decisions](../decisions/0001-record-architecture-decisions.md): an undecided item becomes an ADR when it is decided.
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md)
- [ADR 0025: Exit fallback: a cooldown exit after `max_queue_wait_secs`](../decisions/0025-exit-fallback-cooldown-exit.md)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md)
- [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) (Proposed, with decided points)
- [ADR 0028: Pilot parameters](../decisions/0028-pilot-parameters.md)
- [ADR 0029: Claims and capital rules in the program](../decisions/0029-claims-and-capital-rules-in-the-program.md)
