# Function-by-function comparison: OnRe, Kamino kVault, Solana Foundation vault standard, SVS and Voltr vs MUTAV

Research date: 2026-10-10.

MUTAV's devnet design was set against five Solana vault programs, one function at a time. The comparison fed ADRs 0019 to 0027. This page records where the designs agree, which patterns MUTAV adopted, what it deliberately does differently, and what is deferred.

## 1. Scope and method

| Program | Repo and commit | Licence | What was read | Status |
|---|---|---|---|---|
| **OnRe** (`onreapp`) | `onre-finance/onre-sol` @ `c049083` (2026-09-21) | MIT | Full source, plus the Ackee (Nov 2025) and OtterSec (Aug 2026) audit reports | Mainnet |
| **Kamino kVault** (Kamino Earn) | `Kamino-Finance/kvault` @ `2dadf94` (2026-10-09) | BUSL-1.1, GPL-2.0-or-later from 2029-05-20 | Full source (reuse restricted until the change date) | Mainnet |
| **Solana Foundation `async_vault`** (SF) | `solana-foundation/vault` @ `c359962` (2026-10-01) | MIT | Full source, design docs, Cantina APEX scan (2026-06-22) | Reference implementation, devnet; "not audited for mainnet use" |
| **SVS-10 / SVS-11** (Superteam Brazil Solana Vault Standard) | `solanabr/solana-vault-standard` @ `ceb54f3` (2026-04-10) | MIT | Full source of SVS-10 (async) and SVS-11 (credit/RWA) | Devnet; internal audit rounds only |
| **Voltr** (now Ranger) | `@voltr/vault-sdk` 2.1.1 (npm), `voltrxyz/vault-sdk` @ `508bb4a`, `voltrxyz/vault-cpi` @ `033038d`, `voltrxyz/docs` @ `5a8db0b` | SDK MIT | **Interface only** (IDL, client, docs); program source is not public | Mainnet; audited by Sec3, FYEO and Certora |
| **MUTAV** | Devnet design in ADRs 0019 to 0027 | | The decided design | Pre-deploy |

There is no ratified Solana vault standard. SF is the main "standard" column because the Solana Foundation owns it and its async request, approve and claim flow fits an RWA reserve; SVS is the alternate.

Method: each OnRe instruction was mapped to its MUTAV counterpart and the closest function in each reference, then checked for signer, arguments, accounts, zero-value semantics, events and audit history. Nothing was built or run.

## 2. Master tables

Column key: **SF** = Solana Foundation `async_vault`; **SVS** = SVS-10 / SVS-11; **Voltr** = interface only.

### 2.1 Governance and roles

| Concern | OnRe | Kamino kVault | SF async_vault | SVS-10/11 | Voltr | MUTAV (devnet design) | Takeaway |
|---|---|---|---|---|---|---|---|
| Initialization | Boss; gated by upgrade authority only when one exists | Global config gated by upgrade authority; vaults permissionless | Permissionless `create_vault` | Permissionless per vault id | `init_protocol` + `initialize_vault` | Upgrade authority required; caps validated at birth; event emitted | One reserve per mint, created only by the upgrade authority |
| Top-role handover | `propose_boss` / `accept_boss`; no expiry or cancel (Ackee L1 fix) | Pending admin then accept; no expiry, no cancel | Invite then accept; no expiry | Request, accept, cancel; refuses to overwrite a pending transfer (V9-P8) | Pending admin then accept, with events | Propose, accept, cancel; per-role pending slot with 72 h expiry; keys re-validated at accept | Two-step with expiry is stricter than every reference |
| Lesser role (worker, manager, operator) | `set_worker`, one step; default key revokes | `AllocationAdmin`, one step | None (its `operator` is ERC-7540 user delegation) | `set_manager` / `set_vault_operator`, one step | `Manager`, one step | Operator and pauser appointed in two steps; the admin can remove either in one step | Appoint carefully, remove instantly |
| Global stop | Kill switch: admins enable, boss disables; blocks user cancels | No pause | Pause blocks cancel and claim | Pause blocks cancel; SVS-11 leaves claim open (V5-P24) | Protocol `operationalState` flags | Pauser, admin or guardian pause; admin unpauses; cancels, claims and `pay_claim` stay open | Pause stops new risk, never exits |
| Per-flow stop | Per-offer disable flags | Tighten/loosen asymmetry on allocation flags | Pausable subscription / redemption extensions | Investment window | `disabledOperations` bitmask carved from reserved bytes | One global `paused`; adapter disable in ADR 0027 | Per-flow stops are carved later when needed |
| Mints and mint authority | Mint swappable (`set_onyc_mint`, OtterSec ADV-03 class); authority movable back to the boss | Immutable; PDA | Immutable; handed to the vault at create | Immutable; program-created | Not visible | Mints immutable and in the seeds; PDA mint and freeze authority | No path for unbacked shares |
| Supply cap | `max_supply`, 0 = no cap (Ackee M3 fix review) | `deposit_cap` starts at `u64::MAX` | None in core | 0 = unlimited | 0 = zero capacity (documented) | `max_tvl > 0` required | Zero never means unlimited |
| Config update | One setter per field, immediate | One field per call, per-field authority matrix | `update_vault` | Separate setters; oracle change time-locked 24 h (C-3 fix) | One field per call | `set_config(Vec<ConfigParam>)`: append-only enum, whole result validated, Squads time lock | Validate the whole resulting config, not one field |

### 2.2 Deposits, pricing and NAV

| Concern | OnRe | Kamino kVault | SF async_vault | SVS-10/11 | Voltr | MUTAV (devnet design) | Takeaway |
|---|---|---|---|---|---|---|---|
| Entry flow | Sync `take_offer` at a scheduled price | Sync `deposit` | Request, approve, claim | Request, fulfill, claim | Sync `deposit_vault` | `request_deposit`, admin `fulfil_deposits` (FIFO), `claim_shares` | Async, ordered, admin-filled |
| Price source | Admin-set APR vectors | Computed AUM from lending marks | Authority-typed NAV, unbounded | SVS-10 caller price with deviation check; SVS-11 oracle with staleness and deviation | Adaptor-reported value, locked profit | Derived on-chain from tracked BRS minus provisions | No authority-set price |
| Fill price bound | None | None | Approval echoes a request snapshot | `max_price_per_share` (0 = off); deviation bound | `*_with_tolerance` variants | `nav_bounds` on every fill, plus the NAV-move guard | Every fill is priced inside a range the approver saw |
| Caller price limit | Only on the newest route (`open_swap_buy`) | `deposit_with_min_shares_out` added as a second instruction | None | None | Added as new instructions | Price limit argument on requests, 0 = off | Add the limit before the freeze, not as a v2 |
| Zero output | Refused (OtterSec SUG-00) | Error at zero AUM; 1:1 at zero supply | `NavIsNotSet` | Virtual shares | Not visible | Zero-share fills refused; `ReserveUnderwater` refuses fills at zero net assets | No mint of zero, no price of zero |
| Eligibility | Ed25519 approval with expiry, not bound to action (Ackee M2 partial fix) | Co-signing authority; default key = open | None (pairs with Token ACL) | SVS-11 attestation account with expiry and revocation, re-checked at approve | None visible | Merkle allowlist root, zero root = nobody; exits open to holders | Fail-closed allowlist; argument shaped for later attestations |
| New accounts over time | `take_offer_v2`, `get_tvl_v2`: new account lists forced new instructions (OtterSec SUG-02) | `update_reserve_allocation_v2` | TLV extensions | Modules via remaining accounts | Adaptor receipts as named accounts | Fixed remaining-account order: adapter accounts first, then request accounts | One account convention, no v2 instructions |
| TVL and supply | Supply minus a cached excluded balance (ADV-01 stale cache, SUG-05 donation deflation) | Tracked `shares_issued` | Mint supply | Stored totals | LP supply including fees | Tracked `shares_outstanding` and balances; untracked tokens go to `skim` | Tracked state, donation-proof |

### 2.3 Redemptions and liquidity

| Concern | OnRe | Kamino kVault | SF async_vault | SVS-10/11 | Voltr | MUTAV (devnet design) | Takeaway |
|---|---|---|---|---|---|---|---|
| Request | Lock ONyc; client-chosen 32-byte id; no size bounds | None (sync) | Burns shares at request | Escrow; SVS-10 one request per user; SVS-11 attestation and freeze checks | Escrow LP; value fixed at request (by field name) | Escrow shares in `pending_redemptions`; global seq; size bounds; open to every holder | Exit is a holder right |
| Fill | Worker picks any request, any size, at the current price | Inline, serves what is available | One approval at a time; FIFO extension | Operator or manager fill; SVS-10 `cancel_after` deadline | User self-executes after a waiting period | Admin fills FIFO from the head, whole fills in the pilot, `nav_bounds` | Ordered and price-bounded |
| Payout | Push to the redeemer's ATA | Inline | Claim | Claim | Folded into withdraw | Pull: BRS to `claims`, owner calls `claim_assets` | One frozen account cannot block the queue |
| Request shape | Immutable `amount` + `fulfilled_amount` growing from 0 | None | One `amount` overwritten from assets to shares at approval | Separate locked and claimable fields | Escrowed LP + asset amount | Immutable `shares`, filled amount growing from 0, status | Remaining is derived, never stored |
| Cancel | Redeemer, worker or boss; blocked by kill switch; rent to worker | None | Owner; pause-gated | Owner; pause-gated | Owner | Owner only, never paused, rent to owner | Nobody else can cancel an exit |
| Admin custody | Boss can withdraw any vault, including escrow | Admin fee withdrawal only | `withdraw_assets` to any account | SVS-11 `draw_down` to any account | Manager via adaptors | No admin withdrawal path; escrow, owed BRS and liquidity in separate PDAs | Custody isolated from every role |
| Exit fallback | None | Always sync | None | Requests expire | Waiting period, then self-execute | Cooldown exit after `max_queue_wait_secs` (ADR 0025) | Matches Voltr's shape, priced at fill |
| Counters | Lifetime `executed_redemptions` | Cumulative fees and interest | `pending_async_requests: u16` | `total_fulfilled_deposits`, cumulative fees | `FeeState.accumulated*` | `u64` seqs and totals; lifetime capital counters from day one | Lifetime counters must start with the program |

### 2.4 NAV maintenance and losses

| Concern | OnRe | Kamino kVault | SF async_vault | SVS-10/11 | Voltr | MUTAV (devnet design) | Takeaway |
|---|---|---|---|---|---|---|---|
| Upkeep | Worker `settle_buffer`, kill-switch gated | Fees charged inside every op | None | None | `harvest_fee` | Permissionless `refresh`, never paused | Anyone can bring state current |
| Movement guard | None (manual kill switch) | None | None ("NAV anomaly threshold" listed as future work) | Deviation bound per fill | High-water mark | NAV-move guard, net of booked inflows; sticky halt; admin clears | Anyone raises the halt, only the admin clears it |
| Settle before change | Yes for APR and fees; not for main offer or vectors | Yes for every field | No | No | Not visible | `refresh` in the same transaction before a guard or coverage parameter changes | The window is judged by the rule it ran under |
| Zero baseline | Seeds on first supply | Seeds on first fee charge | NAV unset until first update | Deviation check skipped at zero supply | Not visible | Guard baseline seeded when supply goes from zero to positive | First window is measured |
| Halt clearing | Boss disables kill switch | n/a | n/a | n/a | n/a | `clear_fulfil_halt` with `nav_bounds` | A clearance executes only at the NAV the admin reviewed |
| Loss absorption | `burn_for_nav_increase` burns protocol-held shares | `give_up_pending_fees` | Authority lowers NAV | Oracle NAV | `calibrate_high_water_mark` | Losses booked as provisions inside NAV; backstop booked as a non-reimbursable receipt | Losses are on-ledger, one-way restorations |
| Events | `BufferAccruedEvent` carries old and new | `msg!` logs | No events | Events | Before/after totals on every value event | Value events carry post-state and running totals | Indexers read events, not accounts |

### 2.5 MUTAV-only: guarantee and claim registry

No reference has a guarantee or claim registry; OnRe settles claims off-chain, and SVS-11's credit exposure has no per-loan account. MUTAV keeps one `Guarantee` per lease and one `ClaimFiling` per notice, with provisions inside the NAV.

| Instruction | Reference pattern applied | MUTAV design |
|---|---|---|
| `register_guarantee` | OnRe per-call caps | Pause, mode and coverage gates; `max_cover_per_guarantee`; event with post-state |
| `close_guarantee(id, reason)` | No meaningful zero | Reason `RELEASED` or `VOID`, numbered from 1 and stored on the account |
| `reinstate_guarantee` | Age measured from a stored timestamp | Within `max_reinstate_age` of `closed_at`; resets the close fields |
| `file_claim`, `amend_claim`, `refile_claim` | SF request versioning | A `revision` counter grows with each amendment |
| `approve_claim(notice, amount, expected_revision)` | SF snapshot binding | Approval binds to the filing revision the admin saw |
| `pay_claim(notice, expected_amount)` | OnRe "one logical mint" cap | Pays exactly the provision; per-call and 31-day caps; never pause-gated |
| `settle_payout` | Receipt per reference | PIX end-to-end hash recorded; PAID to SETTLED |

## 3. Patterns MUTAV adopted

Each row is a design decision taken from this comparison. Where the ADR text does not carry it yet, the topic is named.

| Decision | Precedent | Where it lives |
|---|---|---|
| **Counters grow from zero.** A redemption request keeps immutable `shares` and a `shares_filled` that starts at 0 and is written on every fill; remaining is derived. A field carved later reads truthfully on old accounts. | OnRe `fulfilled_amount`; SF's overwritten `amount` as the counter-example | [ADR 0019](../decisions/0019-v1-layout-for-the-devnet-release.md) carves; [ADR 0010](../decisions/0010-partial-fills-at-queue-head.md) |
| **No meaningful zero for enums and ids.** Role ids (operator 1, pauser 2, admin 3) and close reasons start at 1; 0 is refused, so a defaulted argument is an error. | Ackee on OnRe `max_supply = 0`; Voltr's "0 means zero capacity" | [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md) |
| **Price limits on requests, 0 = off.** Deposits carry a minimum shares out, redemptions a minimum NAV. A head that misses its limit stops the batch until it is cancelled. Min-output semantics keep 0 safe. | Kamino `deposit_with_min_shares_out`; Voltr `*_with_tolerance`; SVS-10 `max_price_per_share` | Topic: investor price limit (Q-6), with [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md) |
| **Extensible eligibility argument.** Requests take an append-only `Eligibility` enum whose first variant is the Merkle proof; an attestation arrives as a new variant, not a new instruction. | OnRe's v1 keeping an ignored approval argument; SVS-11 attestations | Topic: eligibility argument, with [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md) |
| **Adapters-first remaining accounts.** Every gate that values the reserve reads `adapter_count` adapter accounts first, in bitmap order, then request accounts. With no adapters this is today's behaviour. | Kamino reserves-first prefix; OnRe's `take_offer_v2` | [ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md); [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) |
| **Events carry post-state and totals.** Fill, refresh, fee, income, claim and guarantee events carry the after-state (net assets, shares outstanding, provisions, `coverage_required`) and running totals; a halt event carries previous NAV, guard NAV and the bound. Final at the freeze. | Voltr before/after events; OnRe `BufferAccruedEvent` | Topic: event schemas for the freeze ([ADR 0019](../decisions/0019-v1-layout-for-the-devnet-release.md)) |
| **Two-step handover with per-role expiry; one-step pauser removal.** Each role has its own pending slot, expiring after 72 h. The admin can remove the pauser in one step so a replacement cannot be blocked; a removal cannot mistype into a dead role. | OnRe `remove_admin`; SVS cancel rule | [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md) |
| **Lifetime capital counters.** Deposited assets, minted shares, redeemed shares and redeemed assets are kept from the first deploy, so `shares_outstanding = minted − burned` holds over the whole history. | OnRe `executed_redemptions`; SVS-10 `total_fulfilled_deposits` | [ADR 0019](../decisions/0019-v1-layout-for-the-devnet-release.md) `VaultState` carves |
| **Close reason stored.** `close_guarantee` writes its reason to the account for the transparency page and reinstatement. | No-meaningful-zero rule | [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md) §3 |
| **Refresh before config change.** Changing the NAV-move bound, `c` or the stress buffer requires a `refresh` in the same slot, so the window is judged by the rule it ran under. | OnRe settle-before-change; Kamino `charge_fees` before config writes | Topic: guard window, with [ADR 0015](../decisions/0015-admin-clear-fulfil-halt.md), [ADR 0022](../decisions/0022-coverage-stress-buffer-underwater-reserve.md) |
| **`nav_bounds` on fills and halt clearing.** Fills and `clear_fulfil_halt` take a NAV range composed at proposal time, so a time-locked action runs only at the NAV the admin reviewed. | SF request snapshot; SVS deviation bounds | [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md); topic: bounded halt clearing ([ADR 0015](../decisions/0015-admin-clear-fulfil-halt.md)) |
| **Approvals bind a revision.** `approve_claim` names the filing revision it approves; every amendment moves it on. | SF `nav_update_version` | Topic: claim revision, with [ADR 0021](../decisions/0021-claims-approval-amendment-exact-payment.md) |
| **Zero-value heads close through the owner.** A redemption head worth 0 is marked filled; the owner's `claim_assets` closes it and gets the rent. | Counter-example: OnRe pays redeemer rent to the worker | [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md) |
| **One meaning for "backstop".** The `BACKSTOP` booking is a non-reimbursable contribution; the ADR 0012 bank-first advance is named separately. | One-way NAV restorations in OnRe and Kamino | [ADR 0024](../decisions/0024-unsolicited-money-and-backstop.md); [ADR 0012](../decisions/0012-fianca-aligned-guarantee-lifecycle.md) |
| **Plain money accounts.** Treasury and payments accounts are MUTAV-owned, distinct, unfrozen and carry no delegate or close authority. | OnRe wallet destinations | [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md) |

## 4. Where MUTAV is stronger, and what it deliberately does not do

The tables show MUTAV at least matching every reference on four properties no single reference combines: NAV is derived on-chain and never set by a key; custody has no admin withdrawal path; pause never blocks cancels, claims or `pay_claim` (SVS-11 reached this for claims only after an audit round, V5-P24); and every balance is tracked, so donations and stale caches (OnRe ADV-01, SUG-05) cannot move prices. MUTAV also refuses fills on an underwater reserve, which no reference does, and books every inflow with an idempotent receipt.

| Reference behaviour | Why MUTAV does not |
|---|---|
| Permissionless vault creation (Kamino, SF, SVS) | One reserve per mint, created by the upgrade authority |
| Authority, oracle or adaptor-reported NAV (SF, SVS-11, Voltr) | NAV comes from what the program tracks |
| APR schedules, performance fees, high-water marks (OnRe, Kamino, Voltr) | Yield is realized from guarantee fees and income |
| Push payouts and operator-cancelled exits (OnRe) | Pull claims keep the FIFO moving; exit is a holder right |
| Pause gating cancel and claim (OnRe, SF, SVS) | Pause stops new risk, never exits |
| Strict, non-idempotent pause (SVS) | With several pause keys, a second pause should succeed |
| Request expiry (SVS-10) and request-time pricing (Voltr) | The cooldown exit gives a way out; pricing at the fill avoids exits at a stale NAV |
| Permissionless allocation crank (Kamino) | Off-chain-settled assets need the admin to execute moves (ADR 0027) |
| 1:1 pricing at zero supply (Kamino) | Rejected in ADR 0023 |
| `close_state` and lazy `init_if_needed` (OnRe) | No re-init path; lazy init produced OnRe's ADV-02 and ADV-06 |
| Off-ledger credit exposure (SVS-11) | Guarantees and claims are on-ledger by design |

## 5. Deferred ideas

New instructions, carves or checks that can land after the freeze without changing an existing interface.

- **Quote views.** `quote_nav` and `quote_redeem` running the program's own pricing, returned through `set_return_data` with a leading `version` byte (OnRe's quote shares its execution core but is unversioned).
- **Share-supply identity check.** `shares_outstanding == mint supply + unclaimed filled deposit shares`, asserted by a drift check or the quote view; it replaces OnRe's excluded-balance machinery.
- **Before/after balance checks.** Reload token accounts after every BRS move and require the exact delta, as `sweep_income` and Kamino's deposit do. Required before any Token-2022 adapter asset.
- **Attester design.** A second `Eligibility` variant bound to action, amount, nonce and expiry; expiry 0 refused and revocation checked (SVS-11); an attester epoch so rotation does not strand requests (Ackee M2). Room is planned in the `VaultConfig` padding.
- **Per-flow stops, handover hygiene and delays.** A `disabled_ops` byte (Voltr); refusing a proposal over an unexpired one (SVS V9-P8); a program-enforced delay on risk-adding config (SVS-11 oracle time lock, ADR 0027).
- **Claim on behalf and profit drip.** A permissionless `claim_assets_for(seq)` paying only the owner; a locked-profit drip (Voltr) if phase-2 instant exit ships.
- **Share-burn as first-loss (open founder question).** Letting MUTAV's disclosed capital wallet burn its own shares, so NAV rises without new BRS, as OnRe's `burn_for_nav_increase` does. It would turn MUTAV's pari-passu stake into optional first-loss capital: a business choice, still open.

## Sources

- OnRe: [github.com/onre-finance/onre-sol](https://github.com/onre-finance/onre-sol) @ `c0490831f438074562ebf51e437ca5f8e027596b`, `programs/onreapp/src/`: `instructions/offer/` (`make_offer.rs`, `take_offer.rs`, `add_offer_vector.rs`), `instructions/redemption/` (`create_redemption_request.rs`, `fulfill_redemption_request.rs`, `cancel_redemption_request.rs`, `redemption_offer_state.rs`, `redemption_utils.rs`), `instructions/prop_amm/` (`quote.rs`, `buy.rs`, `sell.rs`, `pricing.rs`), `instructions/buffer/` (`accrue_buffer.rs`, `accrual_utils.rs`, `burn_for_nav_increase.rs`, `set_buffer_gross_apr.rs`, `set_buffer_fee_config.rs`), `instructions/state_operations/` (`propose_boss.rs`, `accept_boss.rs`, `remove_admin.rs`, `set_worker.rs`, `set_kill_switch.rs`, `close_state.rs`, `set_main_offer.rs`), `instructions/market_info/`, `utils/approver/approver_utils.rs`, `utils/token_utils.rs`; `docs/BUFFER_ACCRUAL.md`, `TOKEN_FLOW_ROUTING.md`, `INTEGRATION_GUIDE.md`. Audit reports: Ackee Blockchain (Nov 2025), OtterSec (Aug 2026).
- Kamino kVault: [github.com/Kamino-Finance/kvault](https://github.com/Kamino-Finance/kvault) @ `2dadf9449d32cfaa2ad5d1540c8edff378512c8c`, `programs/kvault/src/`: `lib.rs`, `handlers/` (`handler_deposit.rs`, `handler_withdraw.rs`, `handler_invest.rs`, `handler_update_admin.rs`, `handler_update_vault_config.rs`, `handler_init_vault.rs`, `handler_initialize_global_config.rs`), `operations/vault_operations.rs`, `operations/vault_config_operations.rs`, `utils/permissioning_authority.rs`, `state/global_config.rs`.
- Solana Foundation vault standard: [github.com/solana-foundation/vault](https://github.com/solana-foundation/vault) @ `c35996268b52fef785c691938c54f643b2442880`, `programs/async_vault/src/`: `instructions/` (`create_vault.rs`, `update_nav.rs`, `invite_new_authority.rs`, `accept_authority_invitation.rs`, `approve_request.rs`, `cancel_request.rs`, `claim.rs`, `withdraw_assets.rs`, `create_redeem_request.rs`), `state/async_vault.rs`, `state/request.rs`, `extensions/` (pausable, fifo_queues); `DESIGN_DECISIONS.md`; `audits/apex-scan-june-22-2026.pdf`. Background: [Exo, "Solana needs something like ERC4626 vaults"](https://exo.beehiiv.com/p/solana-needs-something-like-erc4626-vaults).
- SVS: [github.com/solanabr/solana-vault-standard](https://github.com/solanabr/solana-vault-standard) @ `ceb54f34b683404f51459538777b85695018b28f`: `programs/svs-10/src/instructions/` (`fulfill_deposit.rs`, `cancel_redeem.rs`, `admin.rs`), `programs/svs-10/src/state.rs`, `programs/svs-11/src/instructions/` (`admin.rs`, `approve_deposit.rs`, `claim_redeem.rs`, `cancel_redeem.rs`, `compliance.rs`, `draw_down.rs`, `repay.rs`), `programs/svs-11/src/attestation.rs`, `programs/svs-11/src/oracle.rs`, `modules/svs-caps/src/functions.rs`, `modules/svs-math/src/lib.rs`.
- Voltr (Ranger): `@voltr/vault-sdk` 2.1.1 (npm), `src/generated/` (`accounts/vault.ts`, `accounts/protocol.ts`, `types/vaultConfiguration.ts`, `types/lockedProfitState.ts`, event types); [github.com/voltrxyz/vault-sdk](https://github.com/voltrxyz/vault-sdk) @ `508bb4a16a76eb79d45710db4ae54b29c966b3dc` (`src/idl/voltr_vault.json`); [github.com/voltrxyz/vault-cpi](https://github.com/voltrxyz/vault-cpi) @ `033038da28d2ddf033474f2c56d231a42b247545`; [github.com/voltrxyz/docs](https://github.com/voltrxyz/docs) @ `5a8db0bfe4b27bcd893ea092a9f6884a1d355df4` (`vault-owners/initialization/create-vault.mdx`, `docs/security/audits.mdx`).
- Related research: [OnRe (ONyc) as a comparable](onre-comparable.md), [Multi-asset vaults on Solana](multi-asset-vaults-on-solana.md).

## Decisions

- [ADR 0010: Partial fills at the queue head](../decisions/0010-partial-fills-at-queue-head.md)
- [ADR 0012: Fiança-aligned guarantee lifecycle](../decisions/0012-fianca-aligned-guarantee-lifecycle.md)
- [ADR 0015: Admin clears the fulfil halt](../decisions/0015-admin-clear-fulfil-halt.md)
- [ADR 0019: v1 layout for the devnet release](../decisions/0019-v1-layout-for-the-devnet-release.md)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md)
- [ADR 0024: Unsolicited money and backstop contributions](../decisions/0024-unsolicited-money-and-backstop.md)
- [ADR 0025: Exit fallback: a cooldown exit after `max_queue_wait_secs`](../decisions/0025-exit-fallback-cooldown-exit.md)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md)
- [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) (proposed)
