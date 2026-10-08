# MUTAV reserve program — specification

*Status: draft for the pilot build, 2026-10-01; revised 2026-10-02 for partial fills at the queue head ([ADR 0010](decisions/0010-partial-fills-at-queue-head.md)), the earmark-aware solvency formula, the phase-2 instant exit and upgrade readiness ([ADR 0011](decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)), and the alignment with a limited fiança onerosa, Lei 8.245/91 art. 37 II ([ADR 0012](decisions/0012-fianca-aligned-guarantee-lifecycle.md)); revised 2026-10-07 for the BRS income intake ([ADR 0017](decisions/0017-brs-income-intake.md)) and the BRS-only pilot reserve ([ADR 0018](decisions/0018-brs-only-pilot-reserve.md)). Derived from the MUTAV project document (§2–§7), the adversarial review and the mutav-app operations review. This file is the source of truth for the program's business rules. Any change to economic behaviour needs an ADR in [`decisions/`](decisions/).*

**Pilot assets.** The pilot reserve holds BRS only; more assets can be added through adapters (TESOURO is the first candidate, pending an Etherfuse BRS path; ADR 0018). The TESOURO fields, pricing (§7) and allocation instructions (§5.7) below define that first adapter; with no adapter whitelisted and the settlement floor at 100%, `tesouro_units` stays 0 and no price is read. **Allocation limits (design, ADR 0018):** a floor on the settlement token, `min_settlement_bps` (the minimum share of stable assets held in `reserve_mint`; pilot `10_000`), replaces `max_tesouro_share_bps` (equivalent to `10_000 − min_settlement_bps`; renamed in a follow-up PR). Each adapter has its own `cap`, `max_share_bps` and price feed, which ship with the first adapter upgrade. Derived from the MUTAV project document (§2–§7), the adversarial review and the mutav-app operations review. This file is the source of truth for the program's business rules. Any change to economic behaviour needs an ADR in [`decisions/`](decisions/).*

Where a value or behaviour is not yet decided, this spec says **TBD** and lists it under [§12 Open questions](#12-open-questions). Items marked *(derived)* are not named in the project document but follow from a rule it states; they are the minimum the program needs to enforce that rule.

## Contents

1. [Principles](#1-principles)
2. [Roles and keys](#2-roles-and-keys)
3. [Accounts](#3-accounts)
4. [Invariants and formulas](#4-invariants-and-formulas)
5. [Instructions](#5-instructions)
6. [Under-coverage mode](#6-under-coverage-mode)
7. [Price safety](#7-price-safety)
8. [Caps](#8-caps)
9. [Events](#9-events)
10. [Errors](#10-errors)
11. [Requirements from the adversarial review](#11-requirements-from-the-adversarial-review)
12. [Open questions](#12-open-questions)
13. [Phase 2 — Instant exit (designed, disabled in the pilot)](#13-phase-2--instant-exit-designed-disabled-in-the-pilot)
14. [Upgrade readiness](#14-upgrade-readiness)
15. [Glossary](#15-glossary)

## Conventions

- **Amounts** are `u64` in base units. BRS has 6 decimals, so `1_000_000` = R$1.00. Every value in the reserve's accounting (`stable_assets`, `coverage_required`, covers, provisions, caps) is denominated in **BRS base units**, with BRS valued at par to BRL.
- **TESOURO quantities** are `u64` in TESOURO base units. They are converted to BRS base units only through the bounded price ([§7](#7-price-safety)).
- **Shares** are `u64` base units of the share mint (6 decimals).
- **Timestamps** are `i64` Unix seconds from the `Clock` sysvar.
- **Hashes** are `[u8; 32]`. They are commitments to off-chain records held by MUTAV (salted or HMAC'd where the preimage could identify a person). No personal data is stored on-chain.
- **Basis points** are `u16`, `10_000` = 100%.
- **Arithmetic** uses `u128` intermediates with explicit rounding, always in the reserve's favour. Overflow checks are on in release builds. Any overflow is an error, never a wrap.
- All PDAs include the `VaultConfig` address in their seeds (except `VaultConfig` itself) and use distinct string prefixes and fixed-width seed components.
- All token transfers use `transfer_checked`, and every instruction constrains the mint and token program against the values stored in `VaultConfig`.

---

## 1. Principles

1. **The business model is the fixed requirement.** The program implements it; it does not price, underwrite or decide claims. Those stay in the MUTAV platform (mutav-app).
2. **The reserve is on-chain and verifiable.**
   - Only holdings and prices verifiable on-chain count toward the reserve, NAV or coverage.
   - Off-chain items (fees in transit, recoveries, BRL at MUTAV's bank) count only once they settle on-chain.
   - Losses are recognized early: a filed claim is provisioned immediately.
   - The program's accounting is internal: it tracks the amounts it moved, not raw token-account balances, so a direct transfer into a reserve account does not move NAV. Issuer income enters NAV only when `sweep_income` books a statement (ADR 0017).
   - The remaining trust in issuer backing (Nora for BRS; Etherfuse for TESOURO, once an adapter adds it) is disclosed, not hidden.
3. **MUTAV operates every chain touchpoint.** Agencies, tenants and landlords never sign on-chain. The operator key is the only writer for guarantees and claims. It pays claims within its caps; a payment above them goes through the admin (`pay_claim_admin`, ADR 0012).
4. **The solvency gate protects the reserve. It never stops a claim payment.** It gates capital moving in and out, allocations, and new guarantees. `pay_claim` is never solvency-gated.
5. **No arbitrary outflows.** Reserve funds leave only to (a) investor claim escrows on fulfilled redemptions, (b) the whitelisted MUTAV payments account, (c) a whitelisted adapter's capped sub-authority, or (d) in phase 2 only, an instant redemption paid from the earmarked buffer to the redeeming holder ([§13](#13-phase-2--instant-exit-designed-disabled-in-the-pilot)). The income inbox (§3.3) is not reserve money; its only exits are `reserve` and, with a non-zero `income_take_bps`, the whitelisted treasury (ADR 0017).
6. **Bound risk with caps and start tight.** Every outflow and every new liability is capped on-chain. Admins raise caps as the pilot proves itself.
7. **The covers are the fiança's legal ceiling.** Each guarantee is one limited fiança onerosa (CC 823). Its valor afiançado is `default_cover + exit_cover`, and it includes interest, penalties, charges, court costs and fees. The signed instrument and the on-chain amounts are bound by `contract_cap_hash`. The operator caps limit what a compromised key can move. They never limit what MUTAV owes the landlord, so a payment above them has its own path ([§5.4](#54-claims-and-payouts-operator)).

## 2. Roles and keys

| Role | Key | May call |
|---|---|---|
| **Admin** | Squads v4 multisig vault, with a Squads time lock | `initialize`, `set_config`, `set_roles`, `set_payments_account`, `set_allowlist_root`, `clear_fulfil_halt`, `whitelist_adapter`, `remove_adapter`, `unpause`, `fulfil_deposits`, `fulfil_redeems`, `allocate`, `deallocate`, `pay_claim_admin`. Also the program's upgrade authority |
| **Operator** | Hot key held by mutav-app in KMS, used from Convex actions | `register_guarantee`, `notify_exoneration`, `record_keys_returned`, `close_guarantee`, `contribute_fees`, `sweep_income`, `flag_claim_notice`, `close_claim_notice`, `file_claim`, `pay_claim`, `settle_payout` |
| **Pauser** | Separate key | `pause`, `revoke_operator` |
| **Investor** | Own wallet, on the allowlist (KYC done off-chain) | `request_deposit`, `cancel_deposit`, `claim_shares`, `request_redeem`, `cancel_redeem`, `claim_assets` |
| **Anyone** | — | `refresh`, `advance_queue_heads` |

Phase-2 instructions ([§13](#13-phase-2--instant-exit-designed-disabled-in-the-pilot)), not in the pilot binary: operator `fund_exit_buffer`; admin or operator `defund_exit_buffer`; investor `instant_redeem`; anyone `release_starved_buffer`, `quote_instant_redeem`.

- The time lock is the Squads time lock on the admin multisig. Every admin action is time-locked except `pause` (pauser). Whether the program also enforces its own on-chain delay for privilege increases is **TBD**.
- Roles are distinct keys. `set_roles` rejects a configuration where the operator or pauser equals the admin.
- The pauser can revoke the operator immediately (`revoke_operator`). Appointing the replacement operator is an admin action (`set_roles`). Whether the pauser may also appoint the replacement is **TBD**.

### 2.1 Three separate MUTAV money flows (ADR 0009), and issuer income (ADR 0017)

MUTAV touches the program in three roles. They never mix:

| Flow | What it is | Instruction | Destination | Shares |
|---|---|---|---|---|
| **Guarantee fees → reserve** | The net guarantee fee from each contract after MUTAV's take. It belongs to the reserve and raises NAV for **all** shareholders pro rata | `contribute_fees` (operator) | `reserve` | **Never minted** |
| **MUTAV operation** | MUTAV's take (`fee_take_bps`): operating revenue | Same `contribute_fees` call, as a separate transfer | `treasury_account` (whitelisted) | None; never part of the reserve or NAV |
| **MUTAV's share of the reserve** | MUTAV as a capital provider | `request_deposit` / `request_redeem` from MUTAV's allowlisted capital wallet | `pending_deposits` → `reserve` | Minted at NAV at fulfil, like any investor |
| **Issuer income → reserve** (ADR 0017) | Nora's monthly BRS revenue share, paid under a commercial agreement to the income inbox (§3.3). MUTAV routes it into the reserve; it raises NAV for **all** shareholders pro rata | `sweep_income` (operator), one call per Nora statement; MUTAV's take (`income_take_bps`, `0` in the pilot) goes to `treasury_account` | income inbox → `reserve` | **Never minted** |

Rules:
- **Three different accounts.** `treasury_account`, `payments_account` (claim payouts) and MUTAV's capital wallet are three different accounts. Both `set_config` and `set_payments_account` reject `treasury_account == payments_account`. The capital wallet is an ordinary allowlisted investor wallet. Its address is recorded in `config.mutav_capital_wallet` for public disclosure and so the phase-2 instant exit can bar it (ADR 0011, amending ADR 0009); it gets no other special treatment. Because `mutav_capital_wallet` is a wallet and the other two are token accounts, the check compares owners: `set_config` and `set_payments_account` receive the treasury and payments token accounts and reject `mutav_capital_wallet` equal to either account's `owner` field. Neither may be one of the reserve's own token accounts (§3.3): `initialize`, `set_config` and `set_payments_account` reject a treasury or payments account whose `owner` is the vault authority PDA (`InvalidParameter`).
- **Fees never mint shares and never count as MUTAV capital.** MUTAV benefits from fees only through the shares it bought with its own capital, like every holder.
- **Separate on-chain accounting:** `fees_in_total` (net fees into the reserve), `fee_take_total` (to the treasury), `income_total` and `income_take_total` (issuer income, ADR 0017) and the deposit/redeem totals are tracked separately. Each has its own event (`FeesContributed`, `IncomeSwept`, `DepositsFulfilled`, `RedeemsFulfilled`).
- **Issuer income is not a guarantee fee.** It never counts in `fees_in_total`, and public copy labels it "issuer partnership revenue", a separate, removable line that never enters the base yield or the coverage math (ADR 0017).

### 2.2 MUTAV as fiador: off-chain duties (ADR 0012)

MUTAV Brasil is the fiador of each lease under a **limited fiança onerosa** (Lei 8.245/91 art. 37 II; CC 818, 823). The program records the fiança's ceiling, its lifecycle and its payments. The duties below sit with MUTAV and mutav-app, and the program cannot enforce them:

| Duty | Rule | What MUTAV does | On-chain trace |
|---|---|---|---|
| **The landlord is the creditor** | CC 818, 820 | The landlord signs the fiança instrument with MUTAV, or the agency signs under a special power from the landlord. The tenant's fee contract is separate | `refs_hash` (lease and instrument) |
| **Limited fiança** | CC 819, 822, 823 | The instrument states the valor afiançado, the leg sub-limits and the guaranteed categories, and says that accessories are **inside** the ceiling. Anything not listed is excluded. mutav-app refuses to register when the arguments differ from the signed schedule | `contract_cap_hash`, `default_cover`, `exit_cover` |
| **Principal pagador** | CC 827–828 | MUTAV waives the benefício de ordem. It pays within N days of a **complete payment request**, which means the agency's request together with the evidence list the instrument defines | `ClaimFiling.request_complete_ts`, `config.payment_term_secs` |
| **No mora from our own caps** | CC 395, 397 | Within the term, a payment above the operator's caps goes through the admin (`pay_claim_admin`). If the program cannot pay in time because of a cap, the time lock, low liquid BRS or a freeze, MUTAV advances the payment from its own funds, and the reserve then reimburses MUTAV's `payments_account` | `Payout.flags` |
| **Pay the creditor's representative** | CC 308 | MUTAV pays the agency under the landlord's mandate to receive payments and give quitação. The agency forwards the payment within K days, and MUTAV may pay the landlord directly. Settlement waits for the quitação | `landlord_mandate_hash`, `Payout.quitacao_hash` |
| **Liquidated debts only** | CC 821 | Every exit-leg payment needs a liquidated amount: a comparison of the move-in and move-out inspections, invoices or quotes, a cost bill, or a judgment | `ClaimFiling.debt_calc_hash`, `category` |
| **No unconsented moratória** | CC 838 I; Súmula 214 | A payment plan, grace period, waiver or addendum agreed with the tenant needs MUTAV's prior consent in the platform. Without that consent, MUTAV is released for the affected amounts. Agencies see this rule before they negotiate | None (off-chain consent record) |
| **Preserve subrogation** | CC 838 II, 831–833 | The landlord and the agency deliver the debt file and cooperate in recovery. MUTAV keeps a receivables ledger | None (PC-3, §12 Q5) |
| **Exoneration and keys** | LI 39, 40 X | MUTAV notifies the landlord in writing before an exoneration. The agency reports the key handover or the repossession, with evidence | `notify_exoneration`, `record_keys_returned` |
| **Extinction at exhaustion** | CC 823; LI 59 §1º IX | When the valor afiançado is exhausted, MUTAV notifies the landlord that the fiança is extinguished | `GuaranteeExhausted` |
| **Reserve health is not solvency** | CC 826, 955; LI 40 II | Public copy says "reserve below target; MUTAV backstop active", never "insolvent" or "uncovered". The instrument states that the coverage ratio is an operational metric and that the landlord's claim is against MUTAV Brasil's whole patrimony. The backstop is disclosed | `backstop_commitment_hash`, `backstop_amount` |

## 3. Accounts

All program-owned accounts carry `version: u8`, `bump: u8` as their first fields and a zeroed `_reserved` padding array as their last field, and follow the layout rules in [§14](#14-upgrade-readiness) so that later versions add fields without migrating or re-initializing live accounts. The tables below list these three fields only where they are discussed; every account has them. Padding sizes per account are listed in §14.2. Status and mode fields are stored as `u8` with explicit constants; a value the binary does not know fails closed with `UnsupportedVersion` (§14.2 R1b).

### 3.1 `VaultConfig`

Seeds: `["config", reserve_mint]`. One per reserve. Written only by admin instructions.

| Field | Type | Meaning |
|---|---|---|
| `version`, `bump` | `u8`, `u8` | Layout version (pilot = `1`, [§14](#14-upgrade-readiness)) and PDA bump |
| `authority_bump` | `u8` | Bump of the vault authority PDA ([§3.3](#33-vault-authority-and-token-accounts)), stored so signing CPIs need no `find_program_address`. Fixed at `initialize` |
| `admin` | `Pubkey` | Squads vault address |
| `operator` | `Pubkey` | Operator key. `Pubkey::default()` when revoked |
| `pauser` | `Pubkey` | Pauser key |
| `reserve_mint` | `Pubkey` | BRS mint. **Immutable after `initialize`** |
| `reserve_token_program` | `Pubkey` | Token program owning `reserve_mint`. Immutable |
| `reserve_decimals` | `u8` | Immutable |
| `share_mint` | `Pubkey` | Share mint (authority = vault authority PDA) |
| `coverage_ratio_bps` | `u16` | `c`. Program floor `MIN_COVERAGE_RATIO_BPS = 1_000` (0.10; ADR 0016). Starts at `1_000` on devnet |
| `fee_take_bps` | `u16` | MUTAV's take from each guarantee fee. `≤ MAX_FEE_TAKE_BPS = 3_000`. Value **TBD** |
| `payments_account` | `Pubkey` | The whitelisted MUTAV payments token account (BRS) |
| `treasury_account` | `Pubkey` | The whitelisted MUTAV treasury token account (BRS) that receives MUTAV's take. Changed only by the admin through the timelock |
| `investor_allowlist_root` | `[u8; 32]` | Merkle root of allowlisted investor wallets |
| `adapters` | `[AdapterEntry; MAX_ADAPTERS]` | Whitelisted adapters ([§3.9](#39-adapterentry)). `MAX_ADAPTERS = 8` (§12 Q33, decided 2026-10-06); it sets the size of `VaultConfig` (8 × 177 = 1,416 bytes) |
| `caps` | `Caps` | See [§8](#8-caps). Ends with its own `_reserved: [u8; 32]`, so later caps (PC-43) are carved inside it |
| `price` | `PriceParams` | See [§7](#7-price-safety). Ends with its own `_reserved: [u8; 32]` (e.g. a stale-price haircut, §12 Q21) |
| `payout_sla_secs` | `i64` | Settlement SLA for payouts. Proposed 10 days |
| `paused` | `bool` | Global pause flag. Granular flags **TBD** (PC-24) |
| `feature_flags` | `u64` | Bitmask of optional features. Bit 0 = `INSTANT_EXIT` ([§13](#13-phase-2--instant-exit-designed-disabled-in-the-pilot)); other bits reserved. **`0` in the pilot.** `set_config` rejects any bit outside the binary's `SUPPORTED_FEATURES` (pilot: `0`) with `FeatureNotSupported` ([§14.3](#143-feature-flags)). "`instant_exit_enabled`" means `feature_flags & INSTANT_EXIT != 0` |
| `mutav_capital_wallet` | `Pubkey` | MUTAV's allowlisted capital wallet, disclosed on-chain (PC-34). Barred from instant exit in phase 2. Gets no other special treatment |
| `exit` | `ExitParams` | Phase-2 instant-exit and buffer parameters ([§13.2](#132-parameters-exitparams)). **All zero in the pilot**; validated only when `INSTANT_EXIT` is enabled. Ends with its own `_reserved: [u8; 32]` |
| `claims_tail_secs` | `i64` | Length of the claims tail after the lease ends or an exoneration takes effect (ADR 0012). Value **TBD** (§12 Q35). `0` = not set: `notify_exoneration` and `record_keys_returned` fail with `ClaimsTailNotSet`, so no guarantee leaves `ACTIVE` except by exhaustion or `VOID` |
| `payment_term_secs` | `i64` | Contractual term N from a complete payment request to payment (principal pagador, §2.2). Disclosure only: the program never refuses a payment because of it. Value **TBD** (§12 Q36). `0` = not disclosed |
| `optional_categories` | `u8` | Bitmask of claim categories that are off by default. Bit 0 = `CAT_TERMINATION_PENALTY`. `0` = all optional categories disabled. `set_config` rejects bits outside `SUPPORTED_OPTIONAL_CATEGORIES` (pilot `0b1`) with `InvalidParameter` |
| `backstop_amount` | `u64` | MUTAV Brasil's disclosed backstop commitment, in BRS base units (PC-34). A separate layer: never counted in `stable_assets`, `coverage_required` or NAV. `0` = none disclosed |
| `backstop_commitment_hash` | `[u8; 32]` | Commitment to the signed backstop commitment and its latest attestation (e.g. quarterly: MUTAV Brasil's assets exceed its guarantee liabilities). Zero = none disclosed |
| `income_take_bps` | `u16` | MUTAV's take from issuer income swept by `sweep_income` (ADR 0017). `≤ MAX_INCOME_TAKE_BPS`, whose value is **TBD** (§12 Q47) and is `0` until decided, so the take fails closed at `0`. Pilot value `0`: all income builds the reserve. Separate from `fee_take_bps` |
| `_reserved` | `[u8; 453]` | Zeroed. The fields above are carved from the front of the original 512: the ADR 0017 field (2 bytes) first, because it ships in the devnet binary, then the ADR 0012 fields (57 bytes, built later). Room for later features ([§14.2](#142-padding-and-version)) |

Size: **2,756 bytes** including the 8-byte discriminator (`Caps` 106, `PriceParams` 94, `ExitParams` 275, `adapters` 1,416, the ADR 0012 fields 57, the ADR 0017 field 2, `_reserved` 453), pinned in `constants.rs` (§14.2 R7). Instructions take it boxed (R8).

### 3.2 `VaultState`

Seeds: `["state", config]`. Internal accounting. Written by every state-changing instruction; recomputed by `refresh`.

| Field | Type | Meaning |
|---|---|---|
| `version`, `bump` | `u8`, `u8` | |
| `mode` | `u8` (`MODE_NORMAL = 0`, `MODE_UNDER_COVERED = 1`) | [§6](#6-under-coverage-mode) |
| `brs_balance` | `u64` | Tracked BRS in `reserve` (internal accounting) |
| `tesouro_units` | `u64` | Tracked TESOURO held through adapters, in TESOURO base units |
| `tesouro_price` | `u64` | Last bounded TESOURO price, BRS base units per 1 TESOURO (scaled by `PRICE_SCALE`) |
| `tesouro_price_ts` | `i64` | Publish time of the price source used |
| `stable_assets` | `u64` | Last computed `stable_assets` ([§4](#4-invariants-and-formulas)) |
| `remaining_cover_total` | `u64` | `Σ` remaining cover of every guarantee that is not `CLOSED` (before applying `c`; §4 invariant 18) |
| `coverage_required` | `u64` | `max(c × remaining_cover_total rounded up, provisions)` (§4, ADR 0016) |
| `provisions` | `u64` | `Σ` open claim provisions |
| `shares_outstanding` | `u64` | Minted shares plus shares owed on fulfilled, unclaimed deposits |
| `nav_per_share` | `u64` | Last published NAV per share (scaled by `NAV_SCALE`). `0` exactly when no shares are outstanding; otherwise floored at `1`, so `0` is never a real NAV ([§7](#7-price-safety)) |
| `pending_deposits_total` | `u64` | BRS in `pending_deposits`. Excluded from `stable_assets` |
| `pending_redeem_shares` | `u64` | Shares in `pending_redemptions`. Counted in `shares_outstanding` until fulfilled (confirm, §12) |
| `claimable_assets_total` | `u64` | BRS in `claims` awaiting `claim_assets` (`Σ assets_claimable` over open redeem requests). Excluded from `stable_assets` |
| `buffer_earmark` | `u64` | Stored level of the instant-exit buffer earmark ([§4](#4-invariants-and-formulas), [§13.3](#133-the-buffer-earmark)). BRS inside `reserve`, reserved out of surplus. **Always `0` in the pilot**: no pilot instruction can raise it |
| `pending_notices` | `u32` | Open claim notices ([§5.4](#54-claims-and-payouts-operator)). While `> 0`, `fulfil_deposits`, `fulfil_redeems` and (phase 2) `instant_redeem` refuse |
| `active_guarantees` | `u32` | Guarantees not yet `CLOSED` (any of `ACTIVE`, `EXONERATING`, `LEASE_ENDED`, `EXHAUSTED`) |
| `next_deposit_seq`, `deposit_head` | `u64`, `u64` | FIFO sequence and head of the deposit queue |
| `next_redeem_seq`, `redeem_head` | `u64`, `u64` | FIFO sequence and head of the redemption queue. A head may lag over dead seqs until `fulfil_*` or `advance_queue_heads` moves it ([§5.8](#58-public)) |
| `claim_period_start` | `i64` | Start of the current claim-payment cap window |
| `claim_period_paid` | `u64` | Paid in the current window |
| `fees_in_total`, `fee_take_total` | `u64`, `u64` | Lifetime net fees into the reserve; lifetime take sent to the treasury |
| `claims_paid_total` | `u64` | Lifetime claim payments, both paths |
| `late_payouts` | `u32` | Payouts pending past the SLA, as last counted by `refresh` |
| `fulfil_halted` | `bool` | Set when the NAV-move guard trips ([§7](#7-price-safety)) |
| `last_refresh_ts`, `last_refresh_slot` | `i64`, `u64` | |
| `admin_claims_paid_total` | `u64` | Lifetime payments through `pay_claim_admin` (also counted in `claims_paid_total`; never in `claim_period_paid`) |
| `backstop_reimbursed_total` | `u64` | Lifetime payments flagged `PAYOUT_BACKSTOP_REIMBURSEMENT`: the reserve reimbursing MUTAV for payments it advanced from its own funds |
| `income_total`, `income_take_total` | `u64`, `u64` | Lifetime net issuer income swept into the reserve; lifetime take from it sent to the treasury (ADR 0017) |
| `inflows_since_refresh` | `u64` | Net verified inflows (`contribute_fees`, `sweep_income`) since the last `refresh`. The NAV-move guard measures net of them ([§7](#7-price-safety)); `refresh` and `clear_fulfil_halt` reset it to `0` (ADR 0017) |
| `_reserved` | `[u8; 216]` | Zeroed. The fields above are carved from the front of the original 256: the ADR 0017 fields (24 bytes) first, because they ship in the devnet binary, then the ADR 0012 fields (16 bytes, built later). Phase 2 carves `InstantExitState` next ([§13.2](#132-parameters-exitparams), [§14.2](#142-padding-and-version)) |

Size: **480 bytes** including the discriminator (the ADR 0012 fields 16, the ADR 0017 fields 24, `_reserved` 216), pinned in `constants.rs`.

### 3.3 Vault authority and token accounts

- **Vault authority**: PDA `["authority", config]`, no data. Owns every reserve token account and is the share mint's mint authority. It is never passed as a signer into an adapter CPI.
- **Share mint**: PDA `["share_mint", config]`, a classic SPL Token mint with 6 decimals, created by `initialize`. Mint authority and freeze authority are the vault authority; no pilot instruction uses the freeze authority (it keeps share-transfer gating, PC-32, possible without a new mint).
- **Token accounts** (each a PDA owned by the vault authority, so one issuer freeze does not trap every balance):

| Account | Seeds | Mint | Holds |
|---|---|---|---|
| `reserve` | `["reserve", config]` | BRS | The liquid reserve |
| `pending_deposits` | `["pending_deposits", config]` | BRS | Escrowed deposit requests |
| `pending_redemptions` | `["pending_redemptions", config]` | share | Escrowed redeem requests |
| `claims` | `["claims", config]` | BRS | Assets owed to investors on fulfilled redemptions |

- **Income inbox** (ADR 0017): the vault authority's **associated token account** for `reserve_mint` under `reserve_token_program`, created idempotently by `initialize` (it succeeds if a third party created it first). It is the address MUTAV gives Nora for the monthly revenue share. It is **not tracked**: nothing in it counts toward `stable_assets`, NAV or coverage, and `refresh` does not read it. `sweep_income` is its only program exit. `reserve` stays a PDA rather than the associated token account, so a mistaken send to the vault authority's "wallet" lands in the inbox, outside NAV.

TESOURO is held in each adapter's own staging/position accounts under the adapter's sub-authority ([§3.9](#39-adapterentry)), not by the vault authority.

### 3.4 `AgencyExposure` *(derived)*

Seeds: `["agency", config, agency_id]`. Created on the agency's first `register_guarantee`. Needed to enforce the per-agency cap.

| Field | Type |
|---|---|
| `version`, `bump` | `u8`, `u8` |
| `agency_id` | `[u8; 32]` (stable public reference issued by the MUTAV platform) |
| `outstanding_cover` | `u64` (`Σ` remaining cover of this agency's guarantees that are not `CLOSED`) |
| `active_guarantees` | `u32` |
| `claims_paid_total` | `u64` |
| `_reserved` | `[u8; 64]` |

### 3.5 `Guarantee`

Seeds: `["guarantee", config, id]`. One per lease: a second registration with the same `id` fails at account creation. Each `Guarantee` is the on-chain record of **one limited fiança onerosa** (ADR 0012). Its ceiling, the **valor afiançado**, is `default_cover + exit_cover`. The two legs are **sub-limits** of that one ceiling, not separate coverages.

| Field | Type | Meaning |
|---|---|---|
| `version`, `bump` | `u8`, `u8` | |
| `id` | `[u8; 32]` | Guarantee reference from the platform. Derivation (e.g. an HMAC of the lease identity) is off-chain |
| `agency_id` | `[u8; 32]` | |
| `refs_hash` | `[u8; 32]` | Commitment to the lease and the signed fiança instrument |
| `rent` | `u64` | Monthly rent at registration (display and audit) |
| `default_multiplier_bps` | `u16` | Display only (e.g. `30_000` = 3× rent). Never used in maths |
| `exit_multiplier_bps` | `u16` | Display only |
| `default_cover` | `u64` | Absolute default-leg sub-limit: rent and charges in arrears while the lease runs |
| `exit_cover` | `u64` | Absolute exit-leg sub-limit: the tenant's liquidated debts up to and at the end of occupation ([§3.13](#313-claim-categories)) |
| `default_paid` | `u64` | |
| `exit_paid` | `u64` | |
| `provision_default` | `u64` | Open provisions on the default leg |
| `provision_exit` | `u64` | Open provisions on the exit leg |
| `open_claims` | `u16` | Filed, unpaid claims |
| `status` | `u8` (`ACTIVE = 0`, `CLOSED = 1`, `EXONERATING = 2`, `LEASE_ENDED = 3`, `EXHAUSTED = 4`) | Lifecycle of [§3.5.1](#351-lifecycle). An unknown value fails closed (R1b) |
| `registered_at` | `i64` | |
| `closed_at` | `i64` | `0` until `CLOSED` |
| `contract_cap_hash` | `[u8; 32]` | Commitment to the signed instrument's cap schedule: the valor afiançado, the leg sub-limits, the guaranteed categories and any sub-limits for them, the clause that keeps accessories inside the ceiling, the waiver of the benefício de ordem, and a salt. Links the on-chain covers to the contract. Never zero after registration |
| `landlord_mandate_hash` | `[u8; 32]` | Commitment to the landlord's mandate for the agency to receive guarantee payments and give quitação (CC 308). Never zero after registration |
| `exoneration_effective_ts` | `i64` | `notice + EXONERATION_NOTICE_SECS` (120 days, LI 40 X). `0` = no exoneration notified |
| `keys_returned_ts` | `i64` | When the keys were returned or the unit was repossessed (LI 39). `0` = still occupied |
| `claims_tail_until_ts` | `i64` | Last moment a claim may be filed. Set by the transition to `EXONERATING` or `LEASE_ENDED`. `0` = no tail running |
| `_reserved` | `[u8; 104]` | The five fields above (88 bytes) are carved from the front of a 192-byte pilot budget. Before the freeze the padding grew from 64 bytes, so 104 bytes stay free (ADR 0012, §14.2) |

`provision = provision_default + provision_exit`. `valor_afiancado(g) = default_cover + exit_cover`, and no instruction changes it after registration. A change needs a signed addendum and an instruction that is not yet specified (ADR 0006, §12 Q22). **Liability end:** `liability_end(g)` is the earlier of the non-zero values of `keys_returned_ts` and `exoneration_effective_ts`, or "none" while both are `0`. The account is kept after closing so the public claims history stays readable. Whether and when it may be closed for rent is **TBD**.

#### 3.5.1 Lifecycle

```text
ACTIVE                              ── notify_exoneration ─────────────────────────────▶ EXONERATING
ACTIVE                              ── record_keys_returned ───────────────────────────▶ LEASE_ENDED
EXONERATING                         ── record_keys_returned (keys_ts < effective_ts) ──▶ LEASE_ENDED
ACTIVE | EXONERATING | LEASE_ENDED  ── pay_claim(_admin) reaches the valor afiançado ──▶ EXHAUSTED
EXONERATING | LEASE_ENDED           ── close_guarantee(RELEASED), after the tail ──────▶ CLOSED
EXHAUSTED                           ── close_guarantee(RELEASED) ──────────────────────▶ CLOSED
ACTIVE                              ── close_guarantee(VOID), nothing ever paid ───────▶ CLOSED
```

| State | Meaning | New claims (`file_claim`) | Cover counted in `remaining_cover_total` | Leaves by |
|---|---|---|---|---|
| `ACTIVE` | The lease is running and the fiança is live | Yes | All remaining cover | `notify_exoneration`, `record_keys_returned`, exhaustion, `close_guarantee(VOID)` |
| `EXONERATING` | MUTAV gave notice (LI 40 X). It stays liable for 120 days, then for debts accrued before `exoneration_effective_ts` | Yes, for debts accrued up to `exoneration_effective_ts`, until `claims_tail_until_ts` | All remaining cover | `record_keys_returned` (keys before the effective date), exhaustion, `close_guarantee(RELEASED)` after the tail |
| `LEASE_ENDED` | Keys returned or unit repossessed (LI 39) | Yes, for debts accrued up to `keys_returned_ts`, until `claims_tail_until_ts` | All remaining cover | Exhaustion, `close_guarantee(RELEASED)` after the tail |
| `EXHAUSTED` | Total paid equals the valor afiançado, so the fiança is extinguished (CC 823). `GuaranteeExhausted` was emitted | No (`InvalidGuaranteeStatus`) | `0` (nothing remains) | `close_guarantee(RELEASED)` |
| `CLOSED` | Final | No | `0` | — |

- **Filed claims always stay payable.** No transition and no tail expiry stops `pay_claim` of a claim filed in time, and `close_guarantee` requires `open_claims == 0`.
- **The tail is fixed at the transition.** `claims_tail_until_ts = liability_end + config.claims_tail_secs`, using the config value at that moment. A later `set_config` changes only later transitions, so the admin cannot shorten a tail that is already running. When `record_keys_returned` follows `notify_exoneration`, the liability end moves earlier, and the tail is recomputed from `keys_ts`.
- **EXHAUSTED is reached only by payment.** The transition happens inside the `pay_claim` or `pay_claim_admin` that brings `default_paid + exit_paid` to `valor_afiancado`. Because a filed provision never exceeds the remaining cover, no claim can be open at that point.

### 3.6 `ClaimFiling` *(derived)*

Seeds: `["claim", guarantee, notice_ref_hash]`. Created by `file_claim`. It carries the provision so that `pay_claim` can release it and so that the program can refuse to close a guarantee with an open claim.

| Field | Type |
|---|---|
| `version`, `bump` | `u8`, `u8` |
| `guarantee` | `Pubkey` |
| `leg` | `u8` (`LEG_DEFAULT = 0`, `LEG_EXIT = 1`) |
| `notice_ref_hash` | `[u8; 32]` |
| `provision` | `u64` |
| `filed_at` | `i64` |
| `status` | `u8` (`FILED = 0`, `PAID = 1`; a "Released" state for withdrawn claims is **TBD** and would be a new constant) |
| `category` | `u8`: the guaranteed debt ([§3.13](#313-claim-categories)). `0` = unspecified, never accepted by `file_claim` |
| `accrued_until_ts` | `i64`: the latest date the debt relates to (the last rent month or charge covered, the inspection date, the cost bill date). Must not be later than the guarantee's liability end |
| `request_complete_ts` | `i64`: when the agency's payment request became complete. Starts MUTAV's contractual payment clock (principal pagador, §2.2) |
| `debt_calc_hash` | `[u8; 32]`: commitment to the liquidated amount, such as an itemised calculation, an inspection comparison, invoices or a judgment (CC 821) |
| `_reserved` | `[u8; 79]`: the four fields above (49 bytes) are carved from a 128-byte pilot budget (ADR 0012) |

### 3.7 `Payout`

Seeds: `["payout", guarantee, notice_ref_hash]`. Created by `pay_claim`. The seed makes payment **idempotent per notice**.

| Field | Type | Meaning |
|---|---|---|
| `version`, `bump` | `u8`, `u8` | |
| `guarantee` | `Pubkey` | |
| `leg` | `u8` | As in `ClaimFiling` |
| `amount` | `u64` | |
| `notice_ref_hash` | `[u8; 32]` | |
| `payments_account` | `Pubkey` | Destination at payment time |
| `status` | `u8` (`PENDING = 0`, `SETTLED = 1`) | |
| `paid_at` | `i64` | |
| `pix_e2e_hash` | `[u8; 32]` | Hash of the PIX end-to-end ID. Zero while pending |
| `settled_at` | `i64` | `0` while pending |
| `late` | `u8` (`0`/`1`) | Set by `refresh` or `settle_payout` when settlement exceeded the SLA |
| `category` | `u8` | Copied from the `ClaimFiling` ([§3.13](#313-claim-categories)) |
| `flags` | `u8` | Bit 0 `PAYOUT_ADMIN_PATH`: paid by `pay_claim_admin`. Bit 1 `PAYOUT_BACKSTOP_REIMBURSEMENT`: MUTAV had already paid the landlord from its own funds, and this payment reimburses MUTAV's `payments_account`. `0` = an operator payment that MUTAV forwards after the offramp |
| `request_complete_ts` | `i64` | Copied from the `ClaimFiling`. The transparency page measures the contractual term from this field to `settled_at` |
| `landlord_mandate_hash` | `[u8; 32]` | The guarantee's mandate in force at settlement. Zero while pending |
| `quitacao_hash` | `[u8; 32]` | The landlord's receipt (quitação), given by the agency under the mandate. Zero while pending |
| `_reserved` | `[u8; 54]` | The five fields above (74 bytes) are carved from a 128-byte pilot budget (ADR 0012) |

### 3.8 `DepositRequest` and `RedeemRequest`

Seeds: `["deposit", config, seq]` and `["redeem", config, seq]`, `seq: u64` taken from `VaultState`. Rent is paid by the owner and returned to the owner on close.

**`DepositRequest`** (closed on `claim_shares` or `cancel_deposit`):

| Field | Type | Meaning |
|---|---|---|
| `version`, `bump` | `u8`, `u8` | |
| `owner` | `Pubkey` | |
| `seq` | `u64` | FIFO position |
| `assets` | `u64` | BRS escrowed |
| `shares_out` | `u64` | Set at fulfil |
| `nav_at_fulfil` | `u64` | |
| `requested_at`, `fulfilled_at` | `i64`, `i64` | |
| `status` | `u8` enum `RequestStatus { Pending = 0, Fulfilled = 1 }` | |
| `_reserved` | `[u8; 64]` | |

**`RedeemRequest`** — supports partial fills at the head of the queue ([ADR 0010](decisions/0010-partial-fills-at-queue-head.md)). Every fill burns part of the escrowed shares at the NAV of that fill and accrues the BRS on the request.

| Field | Type | Meaning |
|---|---|---|
| `version`, `bump` | `u8`, `u8` | |
| `owner` | `Pubkey` | |
| `seq` | `u64` | FIFO position. Never changes |
| `shares_requested` | `u64` | Shares escrowed by `request_redeem`. Immutable |
| `shares_remaining` | `u64` | Escrowed in `pending_redemptions`, not yet filled. Set to `0` by `cancel_redeem` |
| `shares_filled` | `u64` | Cumulative shares burned by fills |
| `assets_filled` | `u64` | Cumulative BRS moved to `claims` for this request, each fill at its own NAV (display and audit) |
| `assets_claimable` | `u64` | BRS in `claims` owed to this request and not yet claimed |
| `fill_count` | `u16` | Number of fills |
| `last_fill_nav` | `u64` | NAV per share at the last fill (`NAV_SCALE`) |
| `requested_at`, `last_fill_at` | `i64`, `i64` | `last_fill_at = 0` until the first fill |
| `status` | `u8` enum `RedeemStatus { Pending = 0, PartiallyFilled = 1, Filled = 2, Cancelled = 3 }` | `Pending`: no fill. `PartiallyFilled`: `shares_filled > 0 && shares_remaining > 0`. `Filled`: `shares_remaining == 0` by fills. `Cancelled`: the owner cancelled the remainder; only `assets_claimable` may be left |
| `_reserved` | `[u8; 64]` | |

- `shares_filled + shares_remaining = shares_requested`, except after a cancel, where `shares_filled + shares returned = shares_requested`.
- **Close rule:** the account closes (rent to the owner) when `shares_remaining == 0 && assets_claimable == 0`: on the `claim_assets` that empties a `Filled` or `Cancelled` request, or on a `cancel_redeem` with nothing left to claim. A fill never closes the account, because it always leaves `assets_claimable > 0`.
- The blended exit price shown to the investor is `assets_filled / shares_filled`.

### 3.9 `AdapterEntry`

Stored inline in `VaultConfig.adapters`.

| Field | Type | Meaning |
|---|---|---|
| `program_id` | `Pubkey` | Adapter program |
| `sub_authority` | `Pubkey` | PDA `["adapter", config, program_id]` of the core program. Owns only this adapter's staging account |
| `asset_mint` | `Pubkey` | Position asset (e.g. TESOURO) |
| `cap` | `u64` | Maximum BRS-equivalent value allocated through this adapter |
| `allocated` | `u64` | Current BRS-equivalent value allocated |
| `enabled` | `bool` | |
| `_reserved` | `[u8; 64]` | Fixed per entry, because `MAX_ADAPTERS × entry` is part of the `VaultConfig` layout. Sized so adapter pinning (PC-27: deployed slot `u64` plus upgrade authority `Pubkey`, 40 bytes) can be carved later without a migration; whether to pin is still open |

Entry size: 177 bytes.

**With the first adapter upgrade (ADR 0018, design).** `max_share_bps: u16` is carved from the front of `_reserved` (zero = nothing may be allocated), leaving 62 bytes for PC-27 pinning. The per-adapter price feed and position do not fit inline (86 bytes: price account, staleness and deviation bounds, accrual ceiling, units, last price and its time), so they live in a per-adapter PDA `AdapterState` at `["adapter_state", config, program_id]`, created by `whitelist_adapter` and closed by `remove_adapter`. It replaces the global TESOURO-named `PriceParams` price fields and `VaultState.tesouro_*`; `stable_assets = brs_balance + Σ adapter value`. `max_nav_move_bps` stays global.

### 3.10 `HolderState`

Seeds: `["holder", config, owner]`. One per investor wallet. Created by `request_deposit` or `claim_shares`, whichever comes first (`init_if_needed`, payer = owner). Shipped in the pilot so that the phase-2 holding period ([§13.6](#136-anti-front-running-rules)) has a stamp for every wallet that held shares before the upgrade.

| Field | Type | Meaning |
|---|---|---|
| `version`, `bump` | `u8`, `u8` | |
| `owner` | `Pubkey` | |
| `last_shares_in_ts` | `i64` | Time of the owner's last `request_deposit` or `claim_shares`. Stamped at the request too, because shares from a fulfilled but unclaimed deposit already earn NAV changes ([§13.6](#136-anti-front-running-rules) rule 4) |
| `_reserved` | `[u8; 64]` | Phase 2 carves the per-wallet instant-exit counters: `exit_period_start: i64`, `exit_period_paid: u64` |

### 3.11 `FeeReceipt`

Seeds: `["fee", config, invoice_ref_hash]`. Created by `contribute_fees`; its existence makes each invoice count exactly once. Never closed.

| Field | Type | Meaning |
|---|---|---|
| `version`, `bump` | `u8`, `u8` | |
| `invoice_ref_hash` | `[u8; 32]` | |
| `gross`, `take`, `net` | `u64` ×3 | Amount received, MUTAV's take, net into `reserve` |
| `slot` | `u64` | |
| `_reserved` | `[u8; 64]` | |

### 3.12 `ClaimNotice`

Seeds: `["notice", guarantee, notice_ref_hash]`. Created by `flag_claim_notice` at the first missed-rent signal; closed by `close_claim_notice` (rent to the operator). Shipped in the pilot because it also gates the redemption and deposit queues ([§5.4](#54-claims-and-payouts-operator)).

| Field | Type | Meaning |
|---|---|---|
| `version`, `bump` | `u8`, `u8` | |
| `guarantee` | `Pubkey` | |
| `notice_ref_hash` | `[u8; 32]` | Same hash the later `ClaimFiling` and `Payout` use |
| `flagged_at` | `i64` | |
| `_reserved` | `[u8; 64]` | |

### 3.13 Claim categories

Each claim names the tenant debt it pays (ADR 0012). One limited fiança guarantees the categories listed in the instrument, and the program enforces which leg may pay each category. `category` is a `u8` constant on `file_claim`, `pay_claim`, `pay_claim_admin`, `ClaimFiling` and `Payout`. The amount is always inside the valor afiançado, accessories included.

| Code | Constant | Debt (Lei 8.245/91) | Legs | Extra rule |
|---|---|---|---|---|
| `0` | `CAT_UNSPECIFIED` | — | none | Never accepted (`CategoryNotAllowed`). Zero-means-off |
| `1` | `CAT_RENT_ARREARS` | Rent until the keys are returned (art. 23 I) | default, exit | `accrued_until_ts ≤ liability_end` |
| `2` | `CAT_CHARGES` | Encargos passed to the tenant: ordinary condomínio, IPTU, utilities in the landlord's name (arts. 23 I, VIII, XII; 25) | default, exit | `accrued_until_ts ≤ liability_end` |
| `3` | `CAT_DAMAGE` | Damage beyond normal wear, including restoration of unauthorized alterations, proven against the move-in inspection (art. 23 III, V, VI) | exit | `keys_returned_ts != 0` (`KeysNotReturned`) |
| `4` | `CAT_COURT_COSTS` | Court costs and attorney fees **owed by the tenant**: sucumbência, or fees the lease charges to the tenant (CC 822; LI 62 II). Not the landlord's own costs | exit | — |
| `5` | `CAT_TERMINATION_PENALTY` | Early-termination penalty (art. 4) | exit | **Disabled by default.** Accepted only while `config.optional_categories & 1 != 0`; inclusion is undecided (§12 Q40) |
| `6` | `CAT_ABANDONMENT` | Abandonment and repossession costs owed by the tenant: lock change, cleaning, removal and storage of belongings (art. 66) | exit | `keys_returned_ts != 0` (the repossession is recorded as the key handover) |
| `7` | `CAT_OTHER` | Other tenant debts listed in the instrument | default, exit | `accrued_until_ts ≤ liability_end` |

- A category outside this table, or one used on a leg the table does not list, fails with `CategoryNotAllowed`.
- Any sub-limits per category live in the instrument and in `contract_cap_hash`. mutav-app enforces them. On-chain sub-limits per category are not adopted for the pilot.
- `debt_calc_hash` must be non-zero for every category. Exit-leg payments are therefore always tied to a liquidated amount (CC 821).

### 3.14 `IncomeReceipt`

Seeds: `["income", config, income_ref_hash]`. Created by `sweep_income` (ADR 0017); its existence makes each issuer statement count exactly once. Never closed.

| Field | Type | Meaning |
|---|---|---|
| `version`, `bump` | `u8`, `u8` | |
| `income_ref_hash` | `[u8; 32]` | Commitment to Nora's statement (amount and reference) |
| `period` | `u32` | The statement's month, `YYYYMM` |
| `gross`, `take`, `net` | `u64` ×3 | Amount swept out of the inbox, MUTAV's take, net into `reserve` |
| `slot` | `u64` | |
| `_reserved` | `[u8; 64]` | |

Size: 142 bytes including the discriminator.

---

## 4. Invariants and formulas

```text
tesouro_value      = tesouro_units × bounded_tesouro_price / PRICE_SCALE           // round down
stable_assets      = brs_balance + tesouro_value                                   // internal accounting
                     // excludes pending_deposits_total and claimable_assets_total
remaining_cover(g) = (g.default_cover − g.default_paid) + (g.exit_cover − g.exit_paid)
remaining_cover_total = Σ_{g.status != CLOSED} remaining_cover(g)                 // ADR 0012: every open state
coverage_required  = max(ceil(c × remaining_cover_total / 10_000), provisions)     // c = coverage_ratio_bps; ADR 0016
surplus            = max(0, stable_assets − coverage_required)                     // capital above required coverage
earmark_eff        = see below                                                     // 0 in the pilot
free_capital       = surplus − earmark_eff                                         // = max(0, stable_assets − coverage_required − earmark_eff)
liquid_budget      = max(0, brs_balance − provisions − earmark_eff)                // liquid BRS a redemption fill may use
net_assets         = stable_assets − provisions                                    // saturating at 0
NAV/share          = net_assets / shares_outstanding                               // pending deposits and redemptions excluded
```

**Effective earmark** (ADR 0011). The buffer earmark is BRS inside `reserve` that is reserved out of surplus for the phase-2 instant exit ([§13.3](#133-the-buffer-earmark)). It still counts in `stable_assets` and `net_assets`, so it backs coverage, and `pay_claim` can always spend it. It only reduces the surplus that can leave through the redemption queue or back new guarantees. Every instruction that reads `free_capital` computes it inline:

```text
earmark_eff  = 0                                    if feature_flags & INSTANT_EXIT == 0   // always, in the pilot
             = 0                                    if the instruction holds the queue head and it is starved:
                                                       now − head.requested_at > exit.buffer_release_after_secs > 0
             = min( state.buffer_earmark,           // stored level (0 in the pilot)
                    surplus,                        // never more than the surplus
                    max(0, brs_balance − provisions) )  // must be liquid, after filed claims
```

- **No headroom term in the gates.** The headroom (`exit.buffer_headroom_bps`) applies only to instant-exit availability and to funding ([§13.5](#135-instructions)). A term that falls with surplus would let every outflow re-derive a smaller earmark, so the queue and new guarantees could consume the earmark step by step. With this formula, every gated outflow or new liability is bounded by `free_capital` computed **before** it, which leaves `surplus_after ≥ earmark_eff_before`, so the earmark is unchanged (invariant 16). Only ungated events lower it: claim payments and filed provisions (through the liquidity term), price mark-downs (through the surplus term), the starvation release and an explicit defund.
- **The queue head** is the `RedeemRequest` at `seq == redeem_head` with `shares_remaining > 0`, after skipping dead seqs ([§5.5](#55-investor-capital-async), [§5.8](#58-public)). Only instructions that receive the head apply the starvation term: `fulfil_redeems`, phase-2 `release_starved_buffer`, and phase-2 `instant_redeem` / `quote_instant_redeem` whenever the queue is non-empty. `register_guarantee` and `allocate` do not; `release_starved_buffer`, cranked by mutav-app, is the canonical path that stores the release.
- **Ratchet:** `state.buffer_earmark := earmark_eff`. Applied only by instructions that already read the price and `free_capital`: `register_guarantee`, `fulfil_redeems`, `allocate`, `deallocate`, `refresh`, and in phase 2 `instant_redeem`, `fund_exit_buffer`, `defund_exit_buffer`, `release_starved_buffer`. Every other instruction (`pay_claim`, `pay_claim_admin`, `file_claim`, `settle_payout`, `contribute_fees`, `sweep_income`, `notify_exoneration`, `record_keys_returned`, `close_guarantee`, `fulfil_deposits`, `flag_claim_notice`, `close_claim_notice`, `advance_queue_heads`, `request_*`, `cancel_*`, `claim_*`) neither reads nor writes `buffer_earmark` and so needs no price for it. This is safe because `earmark_eff` is recomputed on every read.
- The pilot implements and tests this function exactly. With `INSTANT_EXIT` clear it returns `0`, so `free_capital = surplus` and `liquid_budget = brs_balance − provisions`; clearing the flag therefore releases any earmark at once, in every binary. Phase 2 changes no solvency formula; it only adds the instructions that raise the stored level.
- **`pay_claim` never reads or writes `buffer_earmark`.** The liquidity term clamps the effective earmark after a claim payment, and the next ratcheting instruction stores it. The claim path is therefore final from the pilot onwards.
- The stored level only moves down through the ratchet, `instant_redeem`, `defund_exit_buffer` and `release_starved_buffer`. It moves up only through the phase-2 `fund_exit_buffer`.

**Share conversion** (virtual offset `V = 10^k` with `k = 0`, so `V = 1`; decided 2026-10-06, [§12 Q20](#12-open-questions)). With the 6-decimal share mint, one share is worth 1 BRS at launch. No seed deposit is minted at `initialize`. A larger offset is not needed against first-depositor inflation: NAV uses internal accounting and ignores direct token transfers (invariant 1), so only the operator's `contribute_fees` and `sweep_income` (ADR 0017) can raise `net_assets` without minting shares, and deposits are allowlisted and fulfilled by the admin. At `V = 1` an inflation attempt is never profitable for the attacker.

```text
shares_for(assets) = floor(assets × (shares_outstanding + V) / (net_assets + 1))     // deposit: round down
assets_for(shares) = floor(shares × (net_assets + 1) / (shares_outstanding + V))     // redeem: round down
```

**Invariants** (asserted in tests after every instruction):

1. `stable_assets` uses only tracked balances and the bounded price, never raw token balances or unverifiable inputs.
2. For every guarantee: `default_paid ≤ default_cover`, `exit_paid ≤ exit_cover`, `provision_default ≤ default_cover − default_paid`, `provision_exit ≤ exit_cover − exit_paid`. These hold with several open filings on one leg too, because a payment never takes cover that another open filing has provisioned (§5.4 `pay_claim` rule 2).
3. `remaining_cover_total = Σ remaining_cover(g)` over guarantees that are not `CLOSED`; `provisions = Σ` open `ClaimFiling.provision`.
4. Token-account balances are at least the tracked amounts: `reserve ≥ brs_balance`, `pending_deposits ≥ pending_deposits_total`, `claims ≥ claimable_assets_total`, `pending_redemptions ≥ pending_redeem_shares`. The income inbox tracks nothing, so all of its balance is untracked until `sweep_income` moves a statement into `reserve` (ADR 0017).
5. `share_mint.supply + Σ shares_out of fulfilled, unclaimed deposits = shares_outstanding`. Shares escrowed in `pending_redemptions` are still minted, so they stay in `shares_outstanding` until a fill burns them (see §12, NAV denominator).
6. A provision reduces NAV only. It never reduces `stable_assets`, so nothing is counted twice against coverage: a filed-but-unpaid claim is already inside `remaining_cover_total`. `coverage_required` is never below `provisions` (ADR 0016): at `c ≥ 1` this always holds through the ratio term; below 1 the provisions term keeps filed claims fully covered.
7. Paying a claim reduces `stable_assets` and `remaining_cover_total` by the same amount `a`, and releases its provision. While the ratio term binds, `surplus` changes by `(c − 1) × a` (up to rounding): unchanged at `c = 1.0`, higher above it, and lower below it. Below 1 a claim payment can therefore move the reserve into under-coverage; it is still never refused (§5.4 rule 7), and the next `refresh` records the mode (ADR 0016).

**Redemption-queue invariants** (ADR 0010):

8. `Σ shares_remaining` over open `RedeemRequest`s `= pending_redeem_shares`.
9. `Σ assets_claimable` over open `RedeemRequest`s `= claimable_assets_total`.
10. **Head-only partial fills.** At most one request has `status == PartiallyFilled`, and it is the head (the lowest seq with `shares_remaining > 0`). `redeem_head` is at or below that seq; every seq between them passes the skip proof of `advance_queue_heads` ([§5.8](#58-public)). No request with a higher seq than a request that still has `shares_remaining > 0` has any fill.
11. For every open request that is not `Cancelled`: `shares_filled + shares_remaining = shares_requested`.
12. Every fill is priced at the NAV of that fill and rounds in the reserve's favour, so a fill never lowers NAV per share. Every fill satisfies `assets ≤ budget` at the time of the fill; a partial fill also satisfies `assets ≥ caps.min_fill_assets` and leaves a remainder worth at least `caps.min_request`.

**Earmark invariants** (ADR 0011; tested in the pilot with an earmark injected through LiteSVM `set_account`):

13. `0 ≤ earmark_eff ≤ buffer_earmark`; `earmark_eff ≤ surplus`; `earmark_eff ≤ brs_balance − provisions` (saturating); `earmark_eff = 0` whenever `INSTANT_EXIT` is clear.
14. `pay_claim` reads neither `buffer_earmark` nor any instant-exit state. The property test that `pay_claim` is never refused for solvency also fuzzes a non-zero earmark with the flag set.
15. In under-coverage, `earmark_eff = 0` and `buffer_earmark` cannot increase.
16. **Gated changes never consume the earmark.** `register_guarantee`, every fill of `fulfil_redeems`, `allocate` and `deallocate` must fit in `free_capital` (or, for `allocate`, the liquidity check) computed **before** the change, so `earmark_eff` after the change equals `earmark_eff` before it, unless a starvation release applies. With an injected earmark `E` and the flag set, their capacity shrinks by exactly `min(E, surplus, brs_balance − provisions)`, and any number of sequential fills in one batch takes at most `surplus − earmark_eff` in total.
17. In the pilot: `feature_flags == 0` and `buffer_earmark == 0`, so `free_capital == surplus`. With the flag clear, an injected earmark has no effect and the next ratcheting instruction stores `0`.

**Lifecycle invariants** (ADR 0012; [§3.5.1](#351-lifecycle)):

18. **Coverage release by state.** A guarantee in `ACTIVE`, `EXONERATING` or `LEASE_ENDED` contributes its full `remaining_cover(g)` to `remaining_cover_total`. Notifying an exoneration, recording the keys or the passing of `exoneration_effective_ts` releases nothing. Cover leaves `remaining_cover_total` only by payment (`pay_claim`, `pay_claim_admin`) or by `close_guarantee`. An `EXHAUSTED` guarantee contributes `0` because nothing remains, and a `CLOSED` one contributes `0` by definition.
19. **The ceiling is fixed.** `default_cover`, `exit_cover` and `contract_cap_hash` never change after registration, and `default_paid + exit_paid ≤ valor_afiancado(g)`.
20. `status == EXHAUSTED` exactly when `default_paid + exit_paid == valor_afiancado(g)` and the guarantee is not `CLOSED`. An `EXHAUSTED` guarantee has `open_claims == 0` and both provisions at `0`.
21. `close_guarantee` succeeds only when `open_claims == 0` and one of these holds: the status is `LEASE_ENDED` or `EXONERATING` and `now > claims_tail_until_ts`; the status is `EXHAUSTED`; or the status is `ACTIVE`, the reason is `VOID`, and `default_paid + exit_paid == 0`.
22. A `ClaimFiling` on a guarantee whose `liability_end` is set has `accrued_until_ts ≤ liability_end` (for the rent, charges and other categories) and `filed_at ≤ claims_tail_until_ts`. A `CAT_DAMAGE` or `CAT_ABANDONMENT` filing was made with `keys_returned_ts != 0`.
23. `exoneration_effective_ts`, `keys_returned_ts` and `claims_tail_until_ts` are written only by the transitions of §3.5.1. `claims_tail_until_ts` is non-zero exactly when the status is `EXONERATING`, `LEASE_ENDED`, or `EXHAUSTED`/`CLOSED` reached from one of them.

**Income invariants** (ADR 0017):

24. NAV and `stable_assets` rise from issuer income only through `sweep_income`, by exactly the swept `net`; a transfer into the inbox or into `reserve` moves neither. `income_total = Σ IncomeReceipt.net` and `income_take_total = Σ IncomeReceipt.take`.
25. With no outside transfers into `reserve`, `reserve.amount == brs_balance` after any sequence of pilot instructions (no drift).
26. `inflows_since_refresh` is the sum of the net of every `contribute_fees` and `sweep_income` since the last `refresh` or `clear_fulfil_halt`.

**Gated on `free_capital` (and `mode == Normal`):** `register_guarantee`, `fulfil_redeems`, `allocate`, `deallocate` (with the under-coverage exception in [§6](#6-under-coverage-mode)); in phase 2, `fund_exit_buffer`.

**Never solvency-gated:** `pay_claim`, `pay_claim_admin`, `file_claim`, `settle_payout`, `contribute_fees`, `sweep_income`, `fulfil_deposits`, `notify_exoneration`, `record_keys_returned`, `close_guarantee`, `flag_claim_notice`, `close_claim_notice`, investor `cancel_*` and `claim_*`, `refresh`, `advance_queue_heads`.

**Claim-notice gate** (ADR 0011, pilot): while `pending_notices > 0`, `fulfil_deposits` and `fulfil_redeems` (and in phase 2 `instant_redeem`) refuse with `ClaimNoticePending`, so nobody enters or leaves at a NAV that misses a known, unprovisioned loss. The gate never touches `file_claim`, `pay_claim` or any other claim-path instruction.

---

## 5. Instructions

Each instruction lists its signer, main accounts, arguments, rules (checked in this order) and effects. Every instruction that reads `stable_assets` requires a non-stale TESOURO price when `tesouro_units > 0` ([§7](#7-price-safety)), except `pay_claim`. Instructions outside the ratchet list in [§4](#4-invariants-and-formulas) do not compute `earmark_eff` and so do not need the price for it.

Common account rules:
- Every instruction rejects a program-owned account whose `version` is above the binary's `PROGRAM_LAYOUT_VERSION` (`UnsupportedVersion`, §14.2 R1b).
- **Owner, never delegate.** In every investor instruction the token account the program debits (`request_deposit`, `request_redeem`, phase-2 `instant_redeem`) must have `owner == signer`, `mint` equal to the configured mint and the token program equal to that mint's program; the program transfers or burns with the signer as owner authority only, never as an approved delegate. `HolderState` and request seeds use that same owner. A delegate approved by another wallet therefore cannot redeem that wallet's shares under its own name.

### 5.1 Admin and roles

#### `initialize(params)`

- **Signer:** the program's upgrade authority (checked against `ProgramData`), so no one can front-run initialization. `params.admin` is the Squads vault.
- **Accounts:** `config` (init), `state` (init), `ProgramData` of this program, vault authority, `reserve_mint`, `share_mint` (init, §3.3), the four token accounts of §3.3 (init), the income inbox (§3.3, created idempotently), the treasury and payments token accounts, token programs, system program, associated token account program.
- **Arguments:** `admin`, `operator`, `pauser`, `mutav_capital_wallet`, `coverage_ratio_bps`, `fee_take_bps`, `payout_sla_secs`, `caps`, `price`. The allowlist root starts at zero (nobody allowlisted) and is set with `set_allowlist_root`; `feature_flags`, `exit` and `adapters` start at zero.
- **Rules:** `reserve_mint` passes the mint guard: if Token-2022, reject `PermanentDelegate`, `TransferHook`, a non-zero `TransferFee` in either epoch configuration, `NonTransferable`, `DefaultAccountState = Frozen` (PC-19), and `ScaledUiAmount`, `InterestBearingConfig`, `Pausable` (ADR 0017: yield as a balance multiplier never changes the raw balances the program tracks, and a pausable mint could stop every reserve transfer). The income inbox account is the vault authority's associated token account for `reserve_mint` (`InvalidIncomeSource`). `fee_take_bps ≤ 3_000`. Roles set and distinct. Caps within program bounds: bps fields `≤ 10_000`, `min_request ≤ max_request`, `claim_period_secs > 0`, durations `≥ 0`, and `coverage_ratio_bps ≥ MIN_COVERAGE_RATIO_BPS` (`1_000`, c ≥ 0.10; §12 Q17, ADR 0016). Treasury and payments accounts as in `set_config` (§2.1).
- **Effects:** writes `VaultConfig` and an empty `VaultState`; creates the income inbox with an idempotent associated-token-account create, which also succeeds if someone created it first (ADR 0017). `income_take_bps` starts at `0`. Whether a seed deposit is minted to a dead address at init is **TBD**.
- **Errors:** `Unauthorized`, `UnsupportedMintExtension`, `InvalidParameter`, `RolesNotDistinct`, `InvalidIncomeSource`.
- **Event:** `VaultInitialized`.

#### `set_config(params)`

- **Signer:** admin. **Rules:** same bounds as `initialize`. `reserve_mint`, token program and decimals cannot change. **Events:** one `ConfigUpdated { field, old, new }` per changed field, including `Pubkey`, hash and nested `Caps` / `PriceParams` / `ExitParams` fields ([§9](#9-events)).
- **Feature flags:** `feature_flags & !SUPPORTED_FEATURES != 0` fails with `FeatureNotSupported`. The pilot binary's `SUPPORTED_FEATURES = 0`, so no feature can be switched on until a program upgrade supports it ([§14.3](#143-feature-flags)).
- **`ExitParams`:** may be written while `INSTANT_EXIT` is off (staging values for a later enable); bounds are checked only when the resulting config has `INSTANT_EXIT` on ([§13.2](#132-parameters-exitparams)).
- **ADR 0012 fields:** `optional_categories & !SUPPORTED_OPTIONAL_CATEGORIES == 0`; `0 ≤ claims_tail_secs ≤ MAX_CLAIMS_TAIL_SECS` (3 years, the prescription of rent claims, CC 206 §3º I); `payment_term_secs ≥ 0`. A change to `claims_tail_secs` applies only to later transitions (§3.5.1). Errors: `InvalidParameter`.
- **Income take** (ADR 0017): `income_take_bps ≤ MAX_INCOME_TAKE_BPS` (`InvalidParameter`). The cap is **TBD** (§12 Q47) and is `0` in this binary, so only `0` is accepted.
- **Accounts distinct:** receives the treasury and payments token accounts; `treasury_account != payments_account`, `mutav_capital_wallet` differs from both accounts' `owner`, and neither account's `owner` is the vault authority PDA, so no reserve token account can stand in for either (§2.1). Errors: `InvalidParameter`.

#### `set_roles(operator, pauser)`

- **Signer:** admin. **Rules:** distinct from admin and each other. **Event:** `RolesUpdated`.

#### `set_payments_account(token_account)`

- **Signer:** admin. **Rules:** token account mint = `reserve_mint`; `token_account != config.treasury_account`; `token_account.owner != config.mutav_capital_wallet`; neither `token_account.owner` nor the treasury's `owner` is the vault authority PDA (also receives the treasury token account to compare owners, §2.1). Owner is MUTAV's payments wallet (off-chain fact; the program records the account). **Errors:** `InvalidMint`, `InvalidParameter`. **Event:** `PaymentsAccountUpdated`.

#### `set_allowlist_root(root)`

- **Signer:** admin. **Event:** `AllowlistRootUpdated`.

#### `clear_fulfil_halt()`

Proposed in [ADR 0015](decisions/0015-admin-clear-fulfil-halt.md), pending founder confirmation.

- **Signer:** admin. **Accounts:** `config`, `state`. Never paused.
- **Rules:** `fulfil_halted == true` (otherwise `InvalidParameter`); price as for `refresh` ([§7](#7-price-safety)).
- **Effects:** `fulfil_halted = false`; `nav_per_share` (the NAV-move guard's baseline) is set to the published NAV of now ([§7](#7-price-safety)); `inflows_since_refresh = 0`, because the new baseline already includes them (ADR 0017). Nothing else changes.
- **Errors:** `Unauthorized`, `InvalidParameter`, `StalePrice`. **Event:** `FulfilHaltCleared { nav_per_share }`.

#### `whitelist_adapter(program_id, asset_mint, cap)` / `remove_adapter(program_id)`

- **Signer:** admin. **Rules:** `remove_adapter` requires `allocated == 0`. Pinning the adapter's deployed slot and upgrade authority (PC-27) is **TBD**. **Events:** `AdapterWhitelisted`, `AdapterRemoved`.

#### `pause()` / `unpause()`

- **Signer:** `pause`: pauser or admin, no time lock. `unpause`: admin.
- **Effects:** sets `config.paused`. While paused, these are rejected: capital flows (`request_*`, `fulfil_*`), new guarantees and `allocate`/`deallocate`; in phase 2 also `instant_redeem` and `fund_exit_buffer`. **These stay open** (ADRs 0008, 0009, 0011, 0012, 0017): `contribute_fees`, `sweep_income`, `pay_claim`, `pay_claim_admin`, `file_claim`, `settle_payout`, `notify_exoneration`, `record_keys_returned`, `close_guarantee`, `flag_claim_notice`, `close_claim_notice`, `refresh`, `advance_queue_heads`, and investor `cancel_*` and `claim_*`; in phase 2 also `defund_exit_buffer` and `release_starved_buffer`. Claims are never blocked.
- **Events:** `Paused { by }`, `Unpaused`.

#### `revoke_operator()`

- **Signer:** pauser or admin. **Effects:** `config.operator = Pubkey::default()`; operator instructions fail until `set_roles` appoints a new key. **Event:** `OperatorRevoked`.

### 5.2 Guarantees (operator)

#### `register_guarantee(id, agency_id, refs_hash, rent, default_multiplier_bps, exit_multiplier_bps, default_cover, exit_cover, contract_cap_hash, landlord_mandate_hash)`

- **Signer:** operator.
- **Accounts:** `config`, `state`, `guarantee` (init), `agency_exposure` (init-if-needed), payer.
- **Rules:**
  1. Not paused; `mode == Normal`.
  2. `default_cover + exit_cover > 0`; `rent > 0`; `contract_cap_hash != [0; 32]`; `landlord_mandate_hash != [0; 32]`.
  3. `default_cover + exit_cover ≤ caps.max_cover_per_guarantee`.
  4. `agency.outstanding_cover + default_cover + exit_cover ≤ caps.max_cover_per_agency`.
  5. **Solvency post-condition:** `coverage_required_after + earmark_eff_before ≤ stable_assets`, where `coverage_required_after = max(ceil(c × (remaining_cover_total + new_cover) / 10_000), provisions)` and `earmark_eff_before` is computed before the registration (§4). Equivalently, the added coverage fits in the `free_capital` computed before the registration, so a funded earmark is never consumed by new guarantees (invariant 16). In the pilot `earmark_eff_before = 0`.
- **Effects:** creates `Guarantee { status: Active }` and stores `default_cover` and `exit_cover` as the absolute **valor afiançado** of this lease's limited fiança and its leg sub-limits (ADR 0012), together with `contract_cap_hash` and `landlord_mandate_hash`. The lifecycle fields start at `0`. `remaining_cover_total += new_cover`; recompute `coverage_required`; `active_guarantees += 1`; agency `outstanding_cover += new_cover`, `active_guarantees += 1`.
- **Off-chain precondition:** mutav-app registers only when the arguments equal the signed instrument's cap schedule, which is the preimage of `contract_cap_hash` (§2.2). The program cannot check this; the hash makes any mismatch provable later.
- **Errors:** `Paused`, `UnderCovered`, `InvalidParameter`, `GuaranteeCapExceeded`, `AgencyCapExceeded`, `InsufficientFreeCapital`, `StalePrice`; account-already-in-use on a duplicate `id`.
- **Event:** `GuaranteeRegistered { id, agency_id, refs_hash, rent, default_cover, exit_cover, contract_cap_hash, landlord_mandate_hash }`.

#### `notify_exoneration(id, notice_hash)`

- **Signer:** operator, once MUTAV's written exoneration notice has reached the landlord (LI 40 X; CC 835). Whether the lease must already be in indefinite term is checked off-chain (§12 Q44).
- **Accounts:** `config`, `state`, `guarantee`.
- **Rules:** `status == ACTIVE` (`GuaranteeNotActive`); `notice_hash != [0; 32]`; `config.claims_tail_secs > 0` (`ClaimsTailNotSet`).
- **Effects:** `exoneration_effective_ts = now + EXONERATION_NOTICE_SECS` (constant, 120 days); `claims_tail_until_ts = exoneration_effective_ts + config.claims_tail_secs`; `status = EXONERATING`. **Cover is unchanged** (invariant 18). Calling it on-chain later than the notice was delivered only lengthens MUTAV's liability, which is the safe direction. Never paused, never solvency-gated.
- **Errors:** `GuaranteeNotActive`, `InvalidParameter`, `ClaimsTailNotSet`.
- **Event:** `ExonerationNotified { id, notice_hash, effective_ts, tail_until }`.

#### `record_keys_returned(id, evidence_hash, keys_ts)`

- **Signer:** operator, after the agency reports the key handover, or the repossession after abandonment or an eviction order, with evidence (LI 39, 66).
- **Accounts:** `config`, `state`, `guarantee`.
- **Rules:**
  1. `status ∈ {ACTIVE, EXONERATING}` (`InvalidGuaranteeStatus`).
  2. `evidence_hash != [0; 32]`; `registered_at ≤ keys_ts ≤ now` (`InvalidParameter`).
  3. If `EXONERATING`: `keys_ts < exoneration_effective_ts`. Otherwise the fiança already ended at the effective date, and the keys are irrelevant to it (`InvalidGuaranteeStatus`).
  4. `config.claims_tail_secs > 0` (`ClaimsTailNotSet`).
- **Effects:** `keys_returned_ts = keys_ts`; `claims_tail_until_ts = keys_ts + config.claims_tail_secs`; `status = LEASE_ENDED`. Cover is unchanged (invariant 18). Rent and charges accrued after `keys_ts` can no longer be filed (§5.4 `file_claim` rule 5). Never paused, never solvency-gated.
- **Errors:** `InvalidGuaranteeStatus`, `InvalidParameter`, `ClaimsTailNotSet`.
- **Event:** `KeysReturned { id, evidence_hash, keys_ts, tail_until }`.

#### `close_guarantee(id, reason)`

- **Signer:** operator.
- **Arguments:** `reason: u8`: `CLOSE_RELEASED = 0` (the fiança ended: lease ended, exoneration effective, or ceiling exhausted) or `CLOSE_VOID = 1` (the lease never took effect, or the registration was an error).
- **Rules** (ADR 0012; invariant 21):
  1. `open_claims == 0` (`OpenClaims`).
  2. `RELEASED`: either `status ∈ {LEASE_ENDED, EXONERATING}` and `now > claims_tail_until_ts` (`ClaimsTailNotElapsed`), or `status == EXHAUSTED`.
  3. `VOID`: `status == ACTIVE` and `default_paid + exit_paid == 0` (`InvalidGuaranteeStatus`). The operator records the evidence off-chain. Limits on this path, such as a time window after registration, are **TBD** (§12 Q43).
  4. Any other state or reason fails with `InvalidGuaranteeStatus`. In particular, an `ACTIVE` guarantee whose lease is running cannot be released.
- **Effects:** `remaining_cover_total −= remaining_cover(g)`; agency `outstanding_cover −= remaining_cover(g)`; counts decremented; `status = Closed`, `closed_at = now`. Not solvency-gated (it releases liability).
- **Errors:** `InvalidGuaranteeStatus`, `OpenClaims`, `ClaimsTailNotElapsed`, `InvalidParameter`.
- **Event:** `GuaranteeClosed { id, released_cover, reason, from_status }`.

### 5.3 Guarantee fees (operator)

#### `contribute_fees(invoice_ref_hash, amount)`

- **Signer:** operator, who also signs the BRS transfer from its own BRS token account (fees reach it via PIX → BRS mint off-chain). Batched per invoice.
- **Accounts:** adds `fee_receipt` (init) at seeds `["fee", config, invoice_ref_hash]`.
- **Rules:** `amount > 0`; source mint = `reserve_mint`; `fee_receipt` must not exist, so **each invoice is recorded exactly once**; `treasury_account` matches config. **Not paused, never solvency-gated:** fees are always accepted, including during pause and under-coverage (ADR 0009).
- **Effects:** creates the `FeeReceipt` ([§3.11](#311-feereceipt)), which mutav-app reconciles against its invoices. `take = floor(amount × fee_take_bps / 10_000)`; transfer `take` → `config.treasury_account` (directly; the program holds no fee balance); transfer `amount − take` → `reserve`; `brs_balance += amount − take`; `fees_in_total += amount − take`; `fee_take_total += take`; `inflows_since_refresh += amount − take` (ADR 0017). NAV rises immediately. Streaming fees into NAV (PC-15) is **not adopted**; see §12. Never mints shares.
- **Errors:** `InvalidParameter`, `InvalidMint`, `InvalidTreasuryAccount`; account-already-in-use on a duplicate `invoice_ref_hash`.
- **Event:** `FeesContributed { invoice_ref_hash, gross, take, net }`.

### 5.3a Issuer income (operator)

Proposed in [ADR 0017](decisions/0017-brs-income-intake.md), pending founder confirmation. Nora pays MUTAV's monthly BRS revenue share, under a commercial agreement, into the income inbox (§3.3) and sends a statement with the amount and a reference. The inbox counts toward nothing until the operator sweeps the statement.

#### `sweep_income(income_ref_hash, period, amount)`

- **Signer:** operator. The program owns both token accounts, and the vault authority signs the transfers.
- **Accounts:** `config`, `state`, `income_receipt` (init) at seeds `["income", config, income_ref_hash]`, `income_inbox`, `reserve`, `treasury_account`, vault authority, BRS mint, token program, payer, system program.
- **Arguments:** `income_ref_hash` commits to Nora's statement; `period` is the statement's month as a `u32` `YYYYMM`; `amount` is the amount on the statement.
- **Rules** (in order):
  1. `amount > 0`; `period` is a well-formed `YYYYMM` month (`InvalidParameter`).
  2. `income_inbox.mint == reserve_mint`, the mint account is `reserve_mint` and the token program is `reserve_token_program` (`InvalidMint`).
  3. `income_inbox` is the vault authority's associated token account for `reserve_mint` and `reserve_token_program`; a look-alike token account owned by the vault authority fails (`InvalidIncomeSource`).
  4. `amount ≤ income_inbox.amount` (`IncomeExceedsInbox`). The inbox holds nothing tracked, so its whole balance is untracked.
  5. Neither the inbox nor `reserve` is frozen (`ReserveFrozen`).
  6. `income_receipt` must not exist, so **each statement counts exactly once**; several statements in one `period` (e.g. a correction) each have their own reference.
  7. `treasury_account == config.treasury_account` (`InvalidTreasuryAccount`), checked whatever the take.
  8. After the transfers, `reserve.amount` rose by exactly `net` and the inbox fell by exactly `amount` (`PostCpiCheckFailed`).
  9. **Not paused, never solvency-gated, no `mode` check, not gated by claim notices.** Money coming in is always accepted, as with `contribute_fees`. It reads neither the TESOURO price nor `buffer_earmark`.
- **Effects:** `take = floor(amount × income_take_bps / 10_000)`, `net = amount − take`. The vault authority transfers `take` from the inbox to `treasury_account` and `net` from the inbox to `reserve`. `brs_balance += net`; `income_total += net`; `income_take_total += take`; `inflows_since_refresh += net`. Creates the `IncomeReceipt` ([§3.14](#314-incomereceipt)). NAV rises immediately; it never mints shares. Anything in the inbox not on a statement stays there, untracked.
- **Not for:** returned claim payments, recoveries or reversals (PC-3, §12 Q5); MUTAV capital (`request_deposit`, ADR 0008); guarantee fees (`contribute_fees`, ADR 0009). An admin-only recovery of untracked BRS (`recognize_untracked`) is designed for a later upgrade, not this binary (ADR 0017).
- **Errors:** `Unauthorized`, `InvalidParameter`, `InvalidMint`, `InvalidIncomeSource`, `IncomeExceedsInbox`, `ReserveFrozen`, `InvalidTreasuryAccount`, `PostCpiCheckFailed`, `UnsupportedVersion`; account-already-in-use on a duplicate `income_ref_hash`.
- **Event:** `IncomeSwept { income_ref_hash, period, gross, take, net, inbox_after }`. `inbox_after` is what stays in the inbox, untracked.

### 5.4 Claims and payouts (operator)

#### `flag_claim_notice(notice_ref_hash)` / `close_claim_notice(notice_ref_hash, reason)`

Shipped in the pilot (ADR 0011). MUTAV learns of a missed rent up to 15 days before `file_claim` books the provision, and MUTAV is both a queue participant (its capital wallet) and the party that times admin fills. The notice keeps the queues closed while a known loss is not yet in NAV.

- **Signer:** operator. Never paused, never solvency-gated. They gate only `fulfil_deposits`, `fulfil_redeems` and phase-2 `instant_redeem`; they never gate `file_claim`, `pay_claim`, `settle_payout` or `close_guarantee`, and `file_claim` does not require a notice.
- **Accounts:** `config`, `state`, `guarantee`, `claim_notice` (init on flag, close on close); on close also the `ClaimFiling` at `["claim", guarantee, notice_ref_hash]` when it exists.
- **`flag_claim_notice`:** guarantee `status ∈ {ACTIVE, EXONERATING, LEASE_ENDED}` and, when a tail is running, `now ≤ claims_tail_until_ts` (`InvalidGuaranteeStatus`). Creates `ClaimNotice` ([§3.12](#312-claimnotice)); `pending_notices += 1`. The operator flags **at the first missed-rent signal** in the platform, not when the 15-day filing is complete. Duplicate notice fails at account creation.
- **`close_claim_notice`:** `reason` is one of
  - `Paid`: the `ClaimFiling` exists and its status is `PAID`, so the whole payment is already out of NAV;
  - `FullyProvisioned`: the `ClaimFiling` exists, is `FILED`, and the leg is provisioned for its whole remaining cover (`leg_provision == leg_cover − leg_paid`), so no later payment on that leg can exceed what NAV already reflects (ties to PC-12, §12 Q13);
  - `Withdrawn`: MUTAV dropped the notice (rent was paid, or the claim was not approved).

  A notice is never closed merely because a smaller provision was filed: `pay_claim` may pay up to the filing's provision plus the leg's unprovisioned cover ([ADR 0014](decisions/0014-pay-claim-bound-with-concurrent-filings.md)), which can exceed the filed provision. Otherwise `NoticeNotResolved`. Closes the notice (rent to the operator); `pending_notices −= 1`.
- **Liveness:** while any notice is open the queues wait. MUTAV can always reopen them by provisioning the leg fully (`FullyProvisioned`), which only lowers NAV, in the reserve's favour. The transparency page shows every open notice and its age and flags any open longer than 15 days.
- **Errors:** `InvalidGuaranteeStatus`, `NoticeNotResolved`, `ClaimNotFiled`; account-already-in-use on a duplicate notice.
- **Events:** `ClaimNoticeFlagged { guarantee_id, notice_ref_hash }`, `ClaimNoticeClosed { guarantee_id, notice_ref_hash, reason }`.

#### `file_claim(leg, category, amount, notice_ref_hash, accrued_until_ts, request_complete_ts, debt_calc_hash)`

- **Signer:** operator, after MUTAV has verified and approved the payment request in the platform. The agency's 15-day filing window is enforced in the platform; an on-chain check (PC-2) is **TBD**.
- **Accounts:** `config`, `guarantee`, `claim_filing` (init), `state`.
- **Rules:**
  1. Guarantee `status ∈ {ACTIVE, EXONERATING, LEASE_ENDED}` (`InvalidGuaranteeStatus`). `EXHAUSTED` and `CLOSED` take no new claims.
  2. If `claims_tail_until_ts != 0`: `now ≤ claims_tail_until_ts` (`ClaimsTailExpired`).
  3. `category` is allowed on `leg` by the table in [§3.13](#313-claim-categories), and an optional category is enabled in `config.optional_categories` (`CategoryNotAllowed`).
  4. `amount > 0`; `debt_calc_hash != [0; 32]`; `request_complete_ts ≤ now`; `accrued_until_ts ≤ now` (`InvalidParameter`).
  5. For `CAT_RENT_ARREARS`, `CAT_CHARGES` and `CAT_OTHER`: when `liability_end(g)` is set, `accrued_until_ts ≤ liability_end(g)` (`AccruedAfterLiabilityEnd`). Debts that accrue after the keys or after an effective exoneration are not guaranteed.
  6. For `CAT_DAMAGE` and `CAT_ABANDONMENT`: `keys_returned_ts != 0` (`KeysNotReturned`). The debt can be liquidated only after the handover or repossession (CC 821).
  7. `amount ≤ (leg_cover − leg_paid − leg_provision)` (`ExceedsRemainingCover`).
- **Effects:** creates `ClaimFiling { status: Filed, provision: amount, filed_at: now, category, accrued_until_ts, request_complete_ts, debt_calc_hash }`; `leg_provision += amount`; `open_claims += 1`; `state.provisions += amount`. NAV reflects the claim immediately. Not solvency-gated.
- **Errors:** `InvalidGuaranteeStatus`, `ClaimsTailExpired`, `CategoryNotAllowed`, `InvalidParameter`, `AccruedAfterLiabilityEnd`, `KeysNotReturned`, `ExceedsRemainingCover`; account-already-in-use on a duplicate notice.
- **Event:** `ClaimFiled { guarantee_id, leg, category, amount, notice_ref_hash, accrued_until_ts, request_complete_ts, debt_calc_hash }`.

#### `pay_claim(leg, category, amount, notice_ref_hash, flags)`

- **Signer:** operator.
- **Accounts:** `config`, `state`, `guarantee`, `claim_filing`, `payout` (init), `reserve`, `payments_account`, vault authority, BRS mint, token program.
- **Arguments:** `flags` may only carry `PAYOUT_BACKSTOP_REIMBURSEMENT`, set when MUTAV has already paid the landlord from its own funds and this payment reimburses it (ADR 0012). Any other bit fails with `InvalidParameter`.
- **Rules:**
  1. `claim_filing.status == Filed`, `claim_filing.leg == leg` (`LegMismatch`) and `claim_filing.category == category` (`CategoryMismatch`).
  2. `amount > 0`; `amount ≤ filing.provision + (leg_cover − leg_paid − leg_provision)`: this filing's own provision plus the leg's unprovisioned cover, so a payment never spends cover another open filing has provisioned and invariant 2 holds ([ADR 0014](decisions/0014-pay-claim-bound-with-concurrent-filings.md), proposed). With one open filing this equals the leg's remaining cover.
  3. `amount ≤ caps.max_claim_per_call`.
  4. Roll the window if `now ≥ claim_period_start + caps.claim_period_secs`; then `claim_period_paid + amount ≤ caps.max_claim_per_period`.
  5. Destination equals `config.payments_account`.
  6. `brs_balance ≥ amount` (liquid BRS). TESOURO is not sold implicitly.
  7. **No solvency check. No `mode` check. No guarantee-status or tail check:** a claim filed in time stays payable in every state, and none of the ADR 0012 lifecycle rules can refuse it. A property test asserts that `pay_claim` is never refused because of solvency or under-coverage.
- **Effects:** transfer `amount` BRS `reserve` → `payments_account` (signed by vault authority); `leg_paid += amount`; release the filing's whole provision (`leg_provision −= filing.provision`, `state.provisions −= filing.provision`); `open_claims −= 1`; `filing.status = Paid`; `brs_balance −= amount`; `remaining_cover_total −= amount`; `claim_period_paid += amount`; `claims_paid_total += amount`; agency `outstanding_cover −= amount`, `claims_paid_total += amount`; if the reimbursement flag is set, `backstop_reimbursed_total += amount`; create `Payout { status: Pending, paid_at: now, category, flags, request_complete_ts: filing.request_complete_ts }`. **Exhaustion:** if afterwards `default_paid + exit_paid == valor_afiancado(g)`, set `status = EXHAUSTED` and emit `GuaranteeExhausted` (§3.5.1). This branch only writes; it never refuses.
- **Idempotency:** a second `pay_claim` for the same notice fails at `Payout` creation.
- **When the caps bind.** A payment that the operator caps would refuse, or would delay past the contractual term, goes through `pay_claim_admin`. If even that cannot pay in time, because of the time lock, low liquid BRS or a freeze, MUTAV advances the payment from its own funds, and `pay_claim` or `pay_claim_admin` with `PAYOUT_BACKSTOP_REIMBURSEMENT` later reimburses MUTAV. Neither path lets the reserve pay more than the remaining cover.
- **Errors:** `ClaimNotFiled`, `LegMismatch`, `CategoryMismatch`, `InvalidParameter`, `ExceedsRemainingCover`, `ClaimCallCapExceeded`, `ClaimPeriodCapExceeded`, `InvalidPaymentsAccount`, `InsufficientLiquidBalance`, `ReserveFrozen`.
- **Events:** `ClaimPaid { guarantee_id, leg, category, amount, notice_ref_hash, payments_account, flags }`; `GuaranteeExhausted { id, valor_afiancado }` on exhaustion.

#### `pay_claim_admin(leg, category, amount, notice_ref_hash, flags)`

The path for payments above the operator's caps (ADR 0012, amending ADR 0003). MUTAV is principal pagador, so a cap sized against a compromised hot key must not put MUTAV in mora toward the landlord (CC 397).

- **Signer:** admin (the Squads vault, through a timelocked proposal). Never paused, never solvency-gated.
- **Accounts:** as `pay_claim`.
- **Arguments:** `flags` may only carry `PAYOUT_BACKSTOP_REIMBURSEMENT`. The program sets `PAYOUT_ADMIN_PATH` itself.
- **Rules:** `pay_claim` rules 1, 2, 5, 6 and 7. Rules 3 and 4 (the per-call and per-period caps) do not apply.
- **Effects:** as `pay_claim`, except that `claim_period_paid` is **not** increased (the operator window measures the hot key only), `admin_claims_paid_total += amount`, and `Payout.flags |= PAYOUT_ADMIN_PATH`. The exhaustion rule applies the same way.
- **Latency.** The Squads time lock counts from approval, so this path is slower than the operator's (§12 Q42). The backstop advance covers that delay.
- **Errors:** `Unauthorized`, `ClaimNotFiled`, `LegMismatch`, `CategoryMismatch`, `InvalidParameter`, `ExceedsRemainingCover`, `InvalidPaymentsAccount`, `InsufficientLiquidBalance`, `ReserveFrozen`.
- **Events:** `ClaimPaid` (with `flags` carrying `PAYOUT_ADMIN_PATH`); `GuaranteeExhausted` on exhaustion.

#### `settle_payout(notice_ref_hash, pix_e2e_hash, quitacao_hash)`

- **Signer:** operator, after MUTAV has offramped BRS→BRL and paid the agency by PIX, and the agency, under the landlord's mandate, has given quitação (CC 308). For a backstop reimbursement, `pix_e2e_hash` is the PIX that MUTAV used for its advance.
- **Accounts:** `config`, `guarantee`, `payout`.
- **Rules:** `payout.status == Pending`; `pix_e2e_hash != [0; 32]`; `quitacao_hash != [0; 32]`.
- **Effects:** `status = Settled`; `settled_at = now`; `quitacao_hash` stored; `landlord_mandate_hash = guarantee.landlord_mandate_hash`; `late = settled_at > paid_at + payout_sla_secs`.
- **Errors:** `PayoutAlreadySettled`, `InvalidParameter`.
- **Event:** `PayoutSettled { guarantee_id, notice_ref_hash, pix_e2e_hash, quitacao_hash, landlord_mandate_hash, late }`.

### 5.5 Investor capital (async)

Investors are allowlisted: every `request_*` carries a Merkle proof of `owner` against `investor_allowlist_root`. Request-size limits are enforced (`caps.min_request`, `caps.max_request`; values **TBD**, proposed R$1,000 and R$30,000).

#### `request_deposit(assets, proof)` / `cancel_deposit()` / `claim_shares()`

- **Signer:** investor.
- **`request_deposit`:** not paused; allowlisted; size within limits; source BRS account `owner == signer`. Transfer `assets` BRS investor → `pending_deposits`; create `DepositRequest { seq: next_deposit_seq++, status: Pending }`; `pending_deposits_total += assets`; create the owner's `HolderState` if needed (payer = owner) and set `last_shares_in_ts = now`. Escrowed funds are excluded from `stable_assets` and solvency until fulfilled. **Event:** `DepositRequested`.
- **`cancel_deposit`:** owner; `status == Pending`. Refund BRS; close the request. Only this request changes; `deposit_head` is advanced later by `fulfil_deposits` or `advance_queue_heads`. Never pausable. **Event:** `DepositCancelled`.
- **`claim_shares`:** owner; `status == Fulfilled`. Mint `shares_out` to the owner's share token account; create the owner's `HolderState` if needed (payer = owner) and set `last_shares_in_ts = now`; close the request. Never pausable. **Event:** `SharesClaimed`.
- **Errors:** `NotAllowlisted`, `RequestTooSmall`, `RequestTooLarge`, `InvalidRequestStatus`, `Paused`.

#### `fulfil_deposits(count)`

- **Signer:** admin.
- **Accounts:** the next `count` `DepositRequest` accounts in **strict FIFO** `seq` order, starting at `deposit_head`. Dead seqs (cancelled and closed) are skipped under the skip proof of `advance_queue_heads` ([§5.8](#58-public)), and no pending request is ever skipped.
- **Rules:** not paused; `pending_notices == 0` (`ClaimNoticePending`); `fulfil_halted == false`; price fresh; `stable_assets + Σ assets ≤ caps.max_tvl`. Deposits **may** be fulfilled in under-coverage mode. They add capital and are the recapitalization path; the new depositor buys at the NAV, which already reflects the loss (ADR 0008).
- **Effects (per request, in order):** price at the NAV at fulfil: `shares_out = shares_for(assets)`; transfer BRS `pending_deposits` → `reserve`; `brs_balance += assets`; `pending_deposits_total −= assets`; `shares_outstanding += shares_out`; `status = Fulfilled`; advance `deposit_head`.
- **Errors:** `Unauthorized`, `Paused`, `ClaimNoticePending`, `FulfilHalted`, `StalePrice`, `TvlCapExceeded`, `QueueOrderViolation`.
- **Event:** `DepositsFulfilled { from_seq, to_seq, assets, shares, nav }`.

#### `request_redeem(shares, proof)`

- **Signer:** investor. **Rules:** not paused; allowlisted; share token account `owner == signer` (no delegate); `shares > 0`; size within limits, checked in BRS at the current NAV (`caps.min_request ≤ assets_for(shares) ≤ caps.max_request`; later NAV drift is ignored).
- **Effects:** transfer `shares` → `pending_redemptions`; create `RedeemRequest { seq: next_redeem_seq++, shares_requested = shares_remaining = shares, status: Pending }`; `pending_redeem_shares += shares`.
- **Event:** `RedeemRequested { owner, seq, shares }`.

#### `fulfil_redeems(count, max_assets)` — partial fills at the head (ADR 0010)

- **Signer:** admin.
- **Accounts:** the `RedeemRequest` accounts from `redeem_head` in strict `seq` order (up to `count`, at most `MAX_FULFIL_BATCH`). A seq is skipped only under the skip proof of `advance_queue_heads` ([§5.8](#58-public)); any other gap or reordering fails with `QueueOrderViolation`. In practice mutav-app cranks `advance_queue_heads` first, so the admin's batch starts at a live head and its size does not grow with the number of cancelled seqs. The Squads vault transaction references the static vault accounts through a per-reserve address lookup table.
- **Arguments:** `max_assets` lets the admin fulfil **less** than the available budget, for example to keep room for new guarantees (PC-30, §12). It can never change the order. `u64::MAX` means no admin limit.
- **Rules:** not paused; `pending_notices == 0` (`ClaimNoticePending`); `mode == Normal`; `fulfil_halted == false`; price fresh. There is no weekly cap. **Strict FIFO:** the head is filled as far as the budget allows, and no request is filled while an earlier one still has `shares_remaining > 0`.
- **Budget**, recomputed before every fill (paying a fill at NAV reduces `stable_assets`, `surplus` and `free_capital` one-for-one and leaves `coverage_required` unchanged):

  ```text
  budget = min(max_assets − assets_paid_in_this_call, free_capital, liquid_budget)
  ```

  The head request is passed, so `earmark_eff` includes the starvation term ([§4](#4-invariants-and-formulas)) and the ratchet applies.
- **Loop**, from the head:
  1. `value = assets_for(shares_remaining)` at the current NAV. If `value == 0`, there is **no fill**: the batch stops with the head untouched (a fill always leaves `assets_claimable > 0`, §3.8).
  2. **Full fill** if `value ≤ budget`: fill all of `shares_remaining` for `value`; continue with the next seq.
  3. Otherwise **partial fill, then stop the batch**:
     - `fill_max = budget`;
     - if `value − fill_max < caps.min_request`, then `fill_max = value − caps.min_request` (saturating at 0), so the remainder stays a normal-size request;
     - if `fill_max < caps.min_fill_assets`, there is **no fill**: the head is left untouched and the batch stops;
     - `shares_fill = floor(fill_max × (shares_outstanding + V) / (net_assets + 1))` and `assets = assets_for(shares_fill)`; both round down, so `assets ≤ fill_max`;
     - **checks on the rounded values:** while `assets_for(shares_remaining − shares_fill) < caps.min_request`, decrease `shares_fill` by 1 and recompute `assets`; then, if `assets < caps.min_fill_assets` or `assets == 0`, there is **no fill**. Invariant 12 therefore holds on the amounts actually moved.
  - A head whose value is below `caps.min_request + caps.min_fill_assets` can therefore only be filled whole.
- **Effects per fill:** burn `shares_fill` from `pending_redemptions`; transfer `assets` BRS `reserve` → `claims`; `brs_balance −= assets`; `claimable_assets_total += assets`; `shares_outstanding −= shares_fill`; `pending_redeem_shares −= shares_fill`. On the request: `shares_remaining −= shares_fill`, `shares_filled += shares_fill`, `assets_filled += assets`, `assets_claimable += assets`, `fill_count += 1`, `last_fill_nav = nav`, `last_fill_at = now`, `status = Filled` if `shares_remaining == 0` else `PartiallyFilled`. Advance `redeem_head` past a completed request.
- If the call makes no fill at all, it fails with `InsufficientFreeCapital` (or `InsufficientLiquidBalance` when `liquid_budget` was the binding term), so an empty batch is never recorded as a success.
- **Errors:** `Unauthorized`, `Paused`, `ClaimNoticePending`, `UnderCovered`, `FulfilHalted`, `StalePrice`, `InsufficientFreeCapital`, `InsufficientLiquidBalance`, `RequestTooSmall` (the head is worth 0 assets and nothing was filled), `QueueOrderViolation`.
- **Events:** one `RedeemFilled` per fill, then a batch summary `RedeemsFulfilled`.

#### `claim_assets()`

- **Signer:** owner. Never pausable. Works **between fills**: a holder whose request is `PartiallyFilled` collects what has been filled so far without losing the place in the queue.
- **Rules:** `assets_claimable > 0`.
- **Effects:** transfer `assets_claimable` from `claims` to the owner's BRS account (owner and mint checked); `claimable_assets_total −= assets_claimable`; `assets_claimable = 0`; close the account if `shares_remaining == 0`. A frozen destination fails cleanly and leaves the amount claimable later.
- **Event:** `AssetsClaimed { owner, seq, assets, closed }`.

#### `cancel_redeem()`

- **Signer:** owner. Never pausable. No cooldown: investors are allowlisted, a cancel only costs the canceller the place in line, and request-size limits bound spam. Request/cancel cycles cannot stall the admin: dead seqs are cleared by the permissionless `advance_queue_heads` crank, which moves no funds, so the number of timelocked admin transactions does not grow with the number of cancelled seqs.
- **Rules:** `shares_remaining > 0` (status `Pending` or `PartiallyFilled`).
- **Effects:** return `shares_remaining` shares from `pending_redemptions` to the owner; `pending_redeem_shares −= shares_remaining`; `shares_remaining = 0`; `status = Cancelled`. Assets already filled stay on the request: if `assets_claimable == 0` the account closes now, otherwise it stays open until `claim_assets` empties it. Only this request changes: `redeem_head` is not moved here (the instruction cannot see later seqs); `fulfil_redeems`, `advance_queue_heads` and phase-2 `release_starved_buffer` advance it. A new `request_redeem` takes a fresh tail seq.
- **Event:** `RedeemCancelled { owner, seq, shares_returned, assets_claimable }`.

### 5.6 MUTAV capital

MUTAV contributes and withdraws capital through the **same async flow as every investor** (ADR 0008). MUTAV's wallet is allowlisted, and it receives shares at the NAV at fulfil and redeems them only out of `free_capital`, in strict FIFO, with the same partial-fill rules. Because MUTAV also controls the admin multisig (which times fills) and the operator (which learns of missed rents first), the claim-notice gate ([§5.4](#54-claims-and-payouts-operator)) closes both queues while a known loss is not yet in NAV: neither MUTAV nor anyone else is filled at a NAV that misses it, and no depositor buys in at that NAV. The gate is only as good as the operator's flagging discipline, which the transparency page makes auditable (§12 Q29). There is no `contribute_capital` or `withdraw_surplus` instruction. Its address is recorded in `config.mutav_capital_wallet`, and in phase 2 it is **barred from instant exit** ([§13.6](#136-anti-front-running-rules)): MUTAV earns from instant-exit haircuts only through its shares, like every holder, so it never sits on the exit side.

### 5.7 Reserve allocation (admin, through adapters)

*Not in the pilot binary (ADR 0018).* This is how the reserve expands beyond BRS: a program upgrade adds these instructions, then Squads proposals whitelist an adapter with its cap and share limit, set its price feed, and lower the settlement floor below 100%. TESOURO is the first candidate.

The core never passes the vault authority or the share-mint authority into a CPI. Each adapter acts only through its own capped sub-authority PDA, which owns only that adapter's staging account.

**CPI depth.** Admin instructions run inside Squads `vault_transaction_execute`, so `allocate` is already Squads (1) → mutav (2) → adapter (3) → venue (4) → token program (5), the maximum invoke stack height. Adapter rule: an adapter makes at most one level of CPI into its venue, the venue path must not exceed one further CPI, and the adapter emits no events by self-CPI (the core emits them). Plan Tasks 13–14 test `allocate` / `deallocate` executed through a real Squads v4 vault transaction, not only `fulfil_redeems`.

#### `allocate(adapter_program, amount)`

- **Signer:** admin.
- **Rules:** not paused; `mode == Normal`; adapter whitelisted and enabled; `allocated + amount ≤ adapter.cap`; price fresh; after the move, the **settlement floor** `brs_balance ≥ min_settlement_bps × stable_assets / 10_000` (today's field: `Σ adapter value ≤ caps.max_tesouro_share_bps × stable_assets / 10_000`, ADR 0018) and the adapter's **share limit** `adapter value ≤ adapter.max_share_bps × stable_assets / 10_000` (with the first adapter upgrade); **solvency post-condition** `stable_assets_after ≥ coverage_required`, with `stable_assets_after` valued at the bounded price; **liquidity post-condition** `brs_balance_after ≥ provisions + earmark_eff_before`, with `earmark_eff_before` computed before the transfer (a value recomputed afterwards would be clamped by the same liquidity and make the check vacuous), so an allocation into TESOURO cannot spend BRS that filed claims or the buffer earmark rely on (ADR 0011). The ratchet is applied only after the check passes; a failing allocation leaves `buffer_earmark` unchanged. Whether `amount` itself must also fit in `free_capital` is **TBD**.
- **Effects:** core transfers `amount` BRS `reserve` → adapter staging (vault-authority signed); CPI `adapter.deposit` signed by the sub-authority only; reload accounts; record the received `tesouro_units`; update `brs_balance`, `tesouro_units`, `adapter.allocated`. **Post-CPI checks:** every vault token account and the share supply are unchanged except for the expected deltas.
- **Errors:** `AdapterNotWhitelisted`, `AdapterCapExceeded`, `TesouroShareCapExceeded`, `InsufficientFreeCapital`, `InsufficientLiquidBalance`, `UnderCovered`, `PostCpiCheckFailed`, `StalePrice`.
- **Event:** `Allocated { adapter, brs_out, tesouro_in }`.

#### `deallocate(adapter_program, tesouro_units)`

- **Signer:** admin.
- **Rules:** not paused; adapter whitelisted; price fresh. Let `value_before` and `value_after` be `stable_assets` before and after, both at the same bounded price.
  - **Normal mode:** `value_before − value_after ≤ free_capital` (any value lost in conversion must fit in surplus).
  - **Under-coverage mode:** allowed **only if it does not worsen coverage**: `value_after ≥ value_before`. Moving TESOURO into BRS at or above its bounded value is therefore allowed, and is the expected de-risking move. Any slippage tolerance is **TBD**.
- **Effects:** CPI `adapter.withdraw` via the sub-authority; BRS returns to `reserve`; update `tesouro_units`, `brs_balance`, `adapter.allocated`; post-CPI checks as for `allocate`.
- **Errors:** `AdapterNotWhitelisted`, `WorsensCoverage`, `InsufficientFreeCapital`, `PostCpiCheckFailed`, `StalePrice`.
- **Event:** `Deallocated { adapter, tesouro_out, brs_in }`.

An asynchronous conversion path for TESOURO (PC-18) is **TBD**; the pilot adapter interface is synchronous and the mock implements it.

### 5.8 Public

#### `refresh()`

- **Signer:** anyone.
- **Accounts:** `config`, `state`, the reserve token accounts, the TESOURO price account(s), and optionally any number of pending `Payout` accounts as remaining accounts.
- **Effects:**
  1. Detect frozen reserve token accounts and fail closed: emit `ReserveFrozenDetected`; frozen balances do not count in `stable_assets`.
  2. Read and bound the TESOURO price ([§7](#7-price-safety)); recompute `tesouro_value`, `stable_assets`, `coverage_required`, `surplus`, `earmark_eff` (and apply the ratchet), `free_capital`, `net_assets`, `nav_per_share`.
  3. If NAV per share, **net of `inflows_since_refresh`**, moved more than `price.max_nav_move_bps` since the last refresh, set `fulfil_halted = true` ([§7](#7-price-safety), ADR 0017). Then reset `inflows_since_refresh = 0`. Only the admin's [`clear_fulfil_halt`](#clear_fulfil_halt) clears the flag and resets the baseline (ADR 0015, proposed).
  4. Set `mode` ([§6](#6-under-coverage-mode)).
  5. For each passed `Payout` with `status == Pending` and `now > paid_at + payout_sla_secs`, set `late = true`; update `late_payouts`.
- **Errors:** none for stale prices: a stale price is recorded and flagged, and the gated instructions refuse to run on it.
- **Event:** `StateRefreshed { stable_assets, coverage_required, surplus, buffer_earmark, free_capital, provisions, nav_per_share, mode, tesouro_price, price_stale }`, plus `PayoutLate` per newly late payout and `ModeChanged` on a transition.

#### `advance_queue_heads(max)`

- **Signer:** anyone (a crank run by mutav-app before every admin fulfil). Moves no funds and involves no discretion. Never paused.
- **Accounts:** `config`, `state`, then up to `max` request accounts as remaining accounts, for the redeem queue from `redeem_head` and for the deposit queue from `deposit_head`, each at the PDA derived for that seq.
- **Skip proof**, per seq, in order:
  - the account address equals the PDA for `seq`, **and**
  - either the account is closed (`owner == system_program && data_is_empty()`; lamports may be non-zero, because anyone can send lamports to a closed address), **or** it decodes as a valid request of this config with nothing left in the queue (`RedeemRequest.shares_remaining == 0`; for deposits, `status == Fulfilled`).
- **Effects:** advances `redeem_head` / `deposit_head` over every seq that passes the proof and stops at the first seq that does not (a live request) or at `next_*_seq`. Seq numbers are never reused, so a closed seq can never come back to life.
- **Event:** `QueueHeadsAdvanced { redeem_head, deposit_head }`.

`fulfil_deposits` and `fulfil_redeems` apply the same skip proof inline. "The queue head" in §4 and §13 is the request at `seq == redeem_head` with `shares_remaining > 0`; an instruction that needs it fails with `QueueOrderViolation` if the passed account is not that request.

---

## 6. Under-coverage mode

- **Trigger:** `stable_assets < coverage_required`, for example after an adapter-asset mark-down, an issuer freeze or, at `c < 1`, claim payments (invariant 7) or filed provisions above stable assets (`coverage_required` is never below provisions, ADR 0016). Set by `refresh`, and checked inline by every gated instruction.
- **Frozen automatically:** `register_guarantee`, `fulfil_redeems`, `allocate`; in phase 2 also `instant_redeem` and `fund_exit_buffer`. Because `surplus = 0`, `earmark_eff = 0` and the ratchet releases any stored earmark.
- **Restricted:** `deallocate` only if it does not worsen coverage ([§5.7](#57-reserve-allocation-admin-through-adapters)).
- **Keeps working:** `pay_claim`, `pay_claim_admin`, `file_claim`, `settle_payout`, `contribute_fees`, `sweep_income`, `fulfil_deposits` (ADR 0008; still subject to the claim-notice gate), `notify_exoneration`, `record_keys_returned`, `close_guarantee`, `flag_claim_notice`, `close_claim_notice`, `refresh`, `advance_queue_heads`, investor `cancel_*` and `claim_*`, `request_*` (queued, not fulfilled).
- **Alert:** a `ModeChanged { to: UnderCovered, deficit }` event, consumed by the mutav-app indexer to alert admins.
- **Exit:** `refresh` sets `mode = Normal` once `stable_assets ≥ coverage_required` again (through fees, swept issuer income, capital contributions, a price recovery or run-off).
- **Disclosure: reserve health is not MUTAV's solvency** (ADR 0012). `MODE_UNDER_COVERED` stays the program constant, but public surfaces label it "reserve below target; MUTAV backstop active", never "insolvent", "uncovered" or "descoberto". The transparency page shows two separate layers:
  1. **Reserve health:** `stable_assets`, `coverage_required`, the coverage ratio and the mode, all from program state.
  2. **MUTAV's backstop:** `config.backstop_amount`, `config.backstop_commitment_hash` (the signed commitment and its latest attestation) and `state.backstop_reimbursed_total`.

  The backstop never counts in `stable_assets`, `coverage_required` or NAV. The landlord's claim is against MUTAV Brasil's whole patrimony, not against the reserve. This is meant to defuse an argument under CC 826 / 955 or LI 40 II that a public deficit proves the fiador insolvent. Whether it works is a question for counsel (§12 Q39).

## 7. Price safety

- **BRS** is valued at par: 1 BRS base unit = 1 unit of value.
- **TESOURO** is valued at `min(on-chain price, accrual curve)`:
  - `on-chain price`: read from Etherfuse's on-chain price account (the `BondPrice` PDA under the stablebond program). Account layout **TBD** (Etherfuse to confirm).
  - `accrual curve`: `p0 × (1 + y_max)^((t − t0) / year)`, a ceiling from a reference price `p0` at `t0` and a maximum annual yield `y_max`, all in `PriceParams`. Values **TBD**.
  - **Staleness bound:** if the price's publish time is older than `price.max_staleness_secs`, it is stale. Gated instructions fail with `StalePrice`; `pay_claim` never reads the price. Valuing a stale price with a haircut instead (PC-17) is **TBD**.
  - **Deviation bound:** if the on-chain price moved more than `price.max_deviation_bps` against the last accepted price, it is rejected as stale until admin review.
- **NAV-move guard:** a NAV-per-share move of more than `price.max_nav_move_bps` ("X%") in one refresh sets `fulfil_halted`, which pauses `fulfil_deposits` and `fulfil_redeems`. X is **TBD**. The move is measured from the last published NAV to the NAV **net of verified inflows**: `published_nav(net_assets − inflows_since_refresh, shares_outstanding)`, where `inflows_since_refresh` is the net of every `contribute_fees` and `sweep_income` since the last refresh (ADR 0017). Guarantee fees and swept income are booked by the instruction that moved them, so they never trip the guard; price and accounting shocks do, including a loss in the same window as an inflow. The NAV that `refresh` publishes still includes the inflows. A published NAV is `0` only when no shares are outstanding, and the guard skips a refresh only when the previous or the current published NAV is `0` (no shares behind it: nothing to protect). With shares outstanding the published NAV is floored at `1` (10⁻⁹ BRS per share), so a collapse to NAV 0 (provisions ≥ `stable_assets`, or frozen balances counted as 0) trips the guard, and so does the recovery from it.
- **Instant exit** (phase 2) uses the tighter bound `min(exit.max_price_age_secs, price.max_staleness_secs)` ([§13.6](#136-anti-front-running-rules)).
- Price-source changes are admin actions (time-locked).

`PriceParams` fields: `tesouro_price_account: Pubkey`, `p0: u64`, `t0: i64`, `y_max_bps: u16`, `max_staleness_secs: i64`, `max_deviation_bps: u16`, `max_nav_move_bps: u16`, `_reserved: [u8; 32]`.

## 8. Caps

All caps live in `VaultConfig.caps` and are admin-adjustable (time-locked). Values are the proposed pilot starting points; final values are **TBD**.

| Field | Type | Enforced in | Proposed |
|---|---|---|---|
| `max_tvl` | `u64` | `fulfil_deposits` | R$300k |
| `max_cover_per_guarantee` | `u64` | `register_guarantee` | R$40k |
| `max_cover_per_agency` | `u64` | `register_guarantee` | R$10M (well above `max_tvl / c` plus fee growth: never binds while one reserve serves the agency; ADR 0016) |
| `max_claim_per_call` | `u64` | `pay_claim` | R$10k |
| `max_claim_per_period` | `u64` | `pay_claim` | R$20k |
| `claim_period_secs` | `i64` | `pay_claim` | 30 days |
| `min_settlement_bps` (today `max_tesouro_share_bps = 10_000 − min_settlement_bps`) | `u16` | `allocate` | `10_000` in the pilot and on devnet: BRS only (ADR 0018). Proposed 5_000 (at least 50% in BRS) once an adapter is live. Per adapter: `cap` and `max_share_bps` |
| `min_request`, `max_request` | `u64`, `u64` | `request_deposit`, `request_redeem`; `min_request` also bounds a partial fill's remainder | TBD; proposed R$1,000 / R$100,000 |
| `min_fill_assets` | `u64` | `fulfil_redeems` (smallest partial fill) | TBD; proposed R$500 |
| `coverage_ratio_bps` (`c`) | `u16` | all gates | 1_000 (0.10, the program floor; ADR 0016) |
| `fee_take_bps` | `u16` | `contribute_fees` | TBD, program max 3_000 |
| `income_take_bps` (`VaultConfig`) | `u16` | `sweep_income` (ADR 0017) | `0` (all issuer income builds the reserve); program max TBD (§12 Q47), `0` until decided |
| `payout_sla_secs` | `i64` | `refresh`, `settle_payout` | 10 days |
| `claims_tail_secs` (`VaultConfig`) | `i64` | `notify_exoneration`, `record_keys_returned` (fixes `claims_tail_until_ts`); `0` blocks both | TBD (§12 Q35); never longer than the 3-year prescription of rent claims (CC 206 §3º I) |
| `payment_term_secs` (`VaultConfig`) | `i64` | Disclosure only (contractual term from a complete payment request) | TBD (§12 Q36) |
| `optional_categories` (`VaultConfig`) | `u8` | `file_claim` (bit 0 enables `CAT_TERMINATION_PENALTY`) | `0` (disabled) |

`Caps` ends with `_reserved: [u8; 32]`, so later caps (PC-43: `max_guarantees`, concentration, new coverage per period) are carved inside it.

Program constants: `MAX_FEE_TAKE_BPS = 3_000`, `MAX_INCOME_TAKE_BPS` (value **TBD**, §12 Q47; `0` until decided, ADR 0017), `MIN_COVERAGE_RATIO_BPS = 1_000` (c ≥ 0.10; ADR 0016), `EXONERATION_NOTICE_SECS = 120 × 86_400` (LI 40 X), `MAX_CLAIMS_TAIL_SECS = 3 × 365 × 86_400`, `SUPPORTED_OPTIONAL_CATEGORIES = 0b1`, the claim-category and `Payout.flags` constants of §3.7 and §3.13, `MAX_ADAPTERS = 8` (§12 Q33, decided 2026-10-06; it sizes `VaultConfig`), `PRICE_SCALE = 10^9` and `NAV_SCALE = 10^9` (decided 2026-10-06; `NAV_SCALE` is NAV 1.0), `VIRTUAL_OFFSET = 10^0 = 1` (§12 Q20, decided 2026-10-06), `INSTANT_EXIT = 1 << 0`, `SUPPORTED_FEATURES` (pilot `0`), `PROGRAM_LAYOUT_VERSION` (pilot `1`), `MAX_FULFIL_BATCH` (pinned from a Mollusk benchmark of `fulfil_redeems` through a Squads vault transaction, with three CPIs and one `emit_cpi!` per fill and the boxed `VaultConfig` decode).

The operator claim caps (`max_claim_per_call`, `max_claim_per_period`) bound what a compromised operator key can take. They do **not** bound MUTAV's legal liability, which the valor afiançado sets. Payments above them go through `pay_claim_admin` (ADR 0012). Size the per-period cap to the worst plausible month of approved claims, so the admin path stays the exception.

Instant-exit caps (per transaction, per wallet, global per period) live in `VaultConfig.exit` and apply only to the phase-2 instant exit ([§13.2](#132-parameters-exitparams)). The redemption queue keeps **no weekly cap**.

## 9. Events

Emitted with `emit_cpi!` for every token movement and every state change the mutav-app indexer and the public transparency page consume. Every event carries `config: Pubkey` and `ts: i64`.

| Event | Fields (besides `config`, `ts`) |
|---|---|
| `VaultInitialized` | `admin, operator, pauser, reserve_mint, share_mint` |
| `ConfigUpdated` | `field: u16, old: [u8; 32], new: [u8; 32]`. Integers are encoded little-endian in the first bytes and zero-padded; `Pubkey`s and hashes are carried as is. `field` ids form an append-only table in `constants.rs` that covers every `VaultConfig` field, including each `Caps`, `PriceParams` and `ExitParams` sub-field, each `exit.barred` slot, `mutav_capital_wallet`, `treasury_account`, `feature_flags` and `income_take_bps` (id 17, ADR 0017) |
| `RolesUpdated` / `OperatorRevoked` | `operator, pauser` / `by` |
| `PaymentsAccountUpdated` | `old, new` |
| `AllowlistRootUpdated` | `root` |
| `AdapterWhitelisted` / `AdapterRemoved` | `program_id, asset_mint, cap` |
| `Paused` / `Unpaused` | `by` |
| `GuaranteeRegistered` | `id, agency_id, refs_hash, rent, default_cover, exit_cover, contract_cap_hash, landlord_mandate_hash` |
| `ExonerationNotified` | `id, notice_hash, effective_ts, tail_until` |
| `KeysReturned` | `id, evidence_hash, keys_ts, tail_until` |
| `GuaranteeExhausted` | `id, valor_afiancado`. mutav-app sends the landlord the notice that the fiança is extinguished (§2.2) |
| `GuaranteeClosed` | `id, released_cover, reason: u8 { Released, Void }, from_status` |
| `FeesContributed` | `invoice_ref_hash, gross, take, net` |
| `IncomeSwept` | `income_ref_hash, period: u32, gross, take, net, inbox_after` (ADR 0017). `inbox_after` is the untracked balance left in the income inbox |
| `ClaimFiled` | `guarantee_id, leg, category, amount, notice_ref_hash, accrued_until_ts, request_complete_ts, debt_calc_hash` |
| `ClaimPaid` | `guarantee_id, leg, category, amount, notice_ref_hash, payments_account, flags` |
| `PayoutSettled` | `guarantee_id, notice_ref_hash, pix_e2e_hash, quitacao_hash, landlord_mandate_hash, late` |
| `PayoutLate` | `guarantee_id, notice_ref_hash, paid_at` |
| `DepositRequested` / `DepositCancelled` / `SharesClaimed` | `owner, seq, assets` / `owner, seq, assets` / `owner, seq, shares` |
| `DepositsFulfilled` | `from_seq, to_seq, assets, shares, nav` |
| `RedeemRequested` | `owner, seq, shares` |
| `RedeemFilled` (one per fill) | `owner, seq, shares_filled, assets, nav, shares_remaining, partial: bool` |
| `RedeemsFulfilled` (batch summary) | `from_seq, to_seq, shares, assets, nav, head_partial: bool, idle_free_capital` |
| `RedeemCancelled` | `owner, seq, shares_returned, assets_claimable` |
| `AssetsClaimed` | `owner, seq, assets, closed: bool` |
| `ClaimNoticeFlagged` / `ClaimNoticeClosed` | `guarantee_id, notice_ref_hash` / `guarantee_id, notice_ref_hash, reason: u8 { Paid, FullyProvisioned, Withdrawn }` |
| `QueueHeadsAdvanced` | `redeem_head, deposit_head` |
| `Allocated` / `Deallocated` | `adapter, brs_out, tesouro_in` / `adapter, tesouro_out, brs_in` |
| `StateRefreshed` | `stable_assets, coverage_required, surplus, buffer_earmark, free_capital, provisions, nav_per_share, mode, tesouro_price, price_stale` |
| `ModeChanged` | `from, to, deficit` |
| `FulfilHaltCleared` | `nav_per_share` (the guard's new baseline; ADR 0015) |
| `ReserveFrozenDetected` | `token_account` |

`idle_free_capital` (free capital left after a batch) makes head-of-line blocking visible on the transparency page. MUTAV capital is visible through `DepositsFulfilled` / `RedeemFilled` filtered by `mutav_capital_wallet`; there are no separate capital events (ADR 0008). Phase-2 events are listed in [§13.8](#138-events). The ADR 0012 fields on `GuaranteeRegistered`, `GuaranteeClosed`, `ClaimFiled`, `ClaimPaid` and `PayoutSettled` are part of the pilot's event set, which is final at the layout freeze. Existing events never change fields; new information goes in a new event ([§14.4](#144-client-and-idl-compatibility)), and the mutav-app indexer skips unknown event discriminators.

## 10. Errors

`Unauthorized`, `RolesNotDistinct`, `Paused`, `InvalidParameter`, `InvalidMint`, `UnsupportedMintExtension`, `ReserveFrozen`, `UnderCovered`, `InsufficientFreeCapital`, `InsufficientLiquidBalance`, `StalePrice`, `PriceDeviation`, `FulfilHalted`, `TvlCapExceeded`, `GuaranteeCapExceeded`, `AgencyCapExceeded`, `GuaranteeNotActive`, `OpenClaims`, `ExceedsRemainingCover`, `ClaimNotFiled`, `LegMismatch`, `ClaimCallCapExceeded`, `ClaimPeriodCapExceeded`, `InvalidPaymentsAccount`, `PayoutAlreadySettled`, `NotAllowlisted`, `RequestTooSmall`, `RequestTooLarge`, `InvalidRequestStatus`, `QueueOrderViolation`, `AdapterNotWhitelisted`, `AdapterCapExceeded`, `TesouroShareCapExceeded`, `WorsensCoverage`, `PostCpiCheckFailed`, `MathOverflow`, `FeatureNotSupported`, `InvalidTreasuryAccount`, `ClaimNoticePending`, `NoticeNotResolved`, `UnsupportedVersion`, `InvalidGuaranteeStatus`, `ClaimsTailNotSet`, `ClaimsTailNotElapsed`, `ClaimsTailExpired`, `CategoryNotAllowed`, `CategoryMismatch`, `AccruedAfterLiabilityEnd`, `KeysNotReturned`, `InvalidIncomeSource`, `IncomeExceedsInbox`.

The eight from `InvalidGuaranteeStatus` to `KeysNotReturned` are added by ADR 0012, and the last two by ADR 0017, before the layout freeze. The devnet binary ships the ADR 0017 errors directly after `UnsupportedVersion`, because the ADR 0012 lifecycle is built later; the ADR 0012 errors are then appended after them. Error codes are numbered by enum order, so the list is **append-only** from the first devnet deploy: new errors go at the end and none is reordered or removed. Phase 2 appends `FeatureDisabled`, `InstantExitBarred`, `InsufficientExitBuffer`, `SlippageExceeded`, `ZeroOutput`, `InstantExitCapExceeded`, `HoldingPeriodActive`, `QueueHeadNotStarved` ([§13.9](#139-errors)).

---

## 11. Requirements from the adversarial review

The adversarial review (four reviews, 79 findings) proposed 48 changes (PC-1…PC-48). The table maps those relevant to the program. **Status:** *Adopted* = in this spec; *Partial* = the core is in, details are TBD; *Not adopted* = the project document chose differently or has not decided; the item is listed in §12. Off-chain items (PC-25 multisig hygiene, PC-33 funding structure, PC-39 agency fee share, PC-41 tenant disclosures, PC-44–PC-48 instrument, pilot sizing, pitch and evidence) are out of the program's scope.

| PC | Requirement | Status | Spec |
|---|---|---|---|
| PC-1 | Payouts only to MUTAV's whitelisted payments account; `Payout` PDA; PIX settlement proof; SLA flag | Adopted (`agency_bank_hash` on `Payout` not adopted) | §3.7, §5.4 |
| PC-2 | Filings through the platform, operator is the only on-chain writer; `agency_id` on each guarantee; on-chain 15-day filing check; evidence/declaration hashes | Partial: operator-only and `agency_id` adopted; on-chain window and separate evidence hashes TBD | §2, §3.5, §5.4 |
| PC-3 | Recoveries and cures flow back to the reserve (`record_recovery`) | Not adopted (open decision) | §12 |
| PC-4 | Seasoning period and max rent per guarantee | Not adopted | §12 |
| PC-5 | One guarantee per lease, enforced by the PDA seed | Adopted (seed by `id`; `id` derivation off-chain) | §3.5 |
| PC-6 | Status lifecycle tied to legal release (Active → Defaulted → LeaseEnded → Settled) | Adopted in the fiança form (ADR 0012): `ACTIVE`, `EXONERATING`, `LEASE_ENDED`, `EXHAUSTED`, `CLOSED`, with a claims tail. No separate `Defaulted` state: open notices and filings carry the default | §3.5.1, §5.2 |
| PC-7 | No fee-current precondition on claims | Adopted (no such check) | §5.4 |
| PC-8 | Exit-draw preconditions (lease-end state, evidence hash) | Partial (ADR 0012): claim categories, `debt_calc_hash` on every filing, key handover required for damage and abandonment, no debts accrued after the liability end | §3.13, §5.4 |
| PC-9 | Exit deductible and per-unit cap | Not adopted | §12 |
| PC-10 | Gate scope: capital flows, new guarantees, allocations; never payouts; property test | Adopted | §1, §4, §5.4 |
| PC-11 | Under-coverage mode | Adopted | §6 |
| PC-12 | Provision booked at filing | Partial: provision = filed amount; full-leg and expected-exit terms TBD | §5.4 |
| PC-13 | Payouts senior to redemptions for the liquid buffer | Partial: redemption fills and allocations leave `provisions` (filed claims) in liquid BRS (`liquid_budget`, ADR 0011); while a claim notice is open (missed rent known, not yet provisioned) both queues are closed; unfiled exposure is not reserved | §4, §5.4, §5.5, §5.7, §12 |
| PC-14 | Coverage ratio floor as a program constant | *Proposed in ADR 0016, pending founder confirmation:* `MIN_COVERAGE_RATIO_BPS = 1_000` (0.10); `coverage_required` never below provisions | §3.1, §12 |
| PC-15 | Fees streamed into NAV over 30 days | Not adopted (fees raise NAV on receipt) | §5.3, §12 |
| PC-16 | Explicit TESOURO coverage weight | Not adopted: TESOURO counts toward coverage at its bounded price, capped at 50% of the reserve | §4, §8, §12 |
| PC-17 | Bounded TESOURO price (accrual ceiling, staleness, deviation) | Adopted; stale-haircut behaviour TBD | §7 |
| PC-18 | In-transit conversion bucket for TESOURO | Not adopted | §5.7, §12 |
| PC-19 | Mint-extension check at whitelisting | Adopted; extended by ADR 0017 to `ScaledUiAmount`, `InterestBearingConfig` and `Pausable` | §5.1 |
| PC-20 | Split reserve token accounts; freeze detection, fail closed | Adopted (proof-of-reserves breaker and second vault are off-program) | §3.3, §5.8 |
| PC-21 | Split operator roles across separate keys | Not adopted (single operator) | §12 |
| PC-22 | Multisig above a payout threshold | Adopted as an over-cap path (ADR 0012): the operator pays within its caps; above them, `pay_claim_admin` | §5.4 |
| PC-23 | Guardian that can only reduce privilege | Partial: pauser pauses and revokes the operator | §2, §5.1 |
| PC-24 | Granular pause that never traps funds | Partial: `cancel_*`/`claim_*` never pausable; granular flags TBD | §5.1 |
| PC-26 | Capped sub-authority per adapter; master authority never in a CPI | Adopted | §3.9, §5.7 |
| PC-27 | Pinned adapter code and post-CPI checks | Partial: post-CPI checks adopted; slot pinning TBD. Room is reserved: `AdapterEntry._reserved` is 64 bytes, enough for a pinned slot and upgrade authority without a migration | §3.9, §5.7 |
| PC-28 | Request size limits | Adopted (values TBD) | §5.5, §8 |
| PC-29 | Partial head fills and cancel semantics | Adopted (ADR 0010): head-only partial fills at the NAV of each fill, minimum fill and remainder, claim between fills, owner cancel of the remainder with no cooldown, a permissionless head-advance crank against cancel spam; fills refused while a claim notice is open (ADR 0011) | §3.8, §4, §5.4, §5.5, §5.8 |
| PC-30 | Queued redemptions take priority over new guarantees | Not decided | §12 |
| PC-31 | Fixed fulfil epochs with a permissionless fallback | Not adopted (admin fulfils at NAV at fulfil) | §12 |
| PC-32 | Share transfers gated to verified wallets | Not decided | §12 |
| PC-34 | MUTAV backstop disclosed on-chain | Adopted for disclosure (ADR 0012): `mutav_capital_wallet`, `backstop_amount`, `backstop_commitment_hash`, `backstop_reimbursed_total`. The commitment itself is off-chain | §3.1, §3.2, §6 |
| PC-35 | Junior/senior share classes | Not decided | §12 |
| PC-36 | Take-rate holdback, applied prospectively | Not adopted | §12 |
| PC-37 | Per-guarantee terms bounded by config maxima | Adopted as absolute per-lease covers (ADR 0006) | §3.5, §5.2 |
| PC-38 | Agency loss-ratio gate | Not adopted (pricing tiers stay off-chain) | §12 |
| PC-40 | Public claims ledger with an SLA clock | Partial: `Payout` timestamps, SLA flag, per-agency `claims_paid_total`; other counters TBD | §3.4, §3.7, §5.8 |
| PC-42 | Only hashes and amounts on-chain | Adopted | Conventions, §3 |
| PC-43 | Hard on-chain caps | Partial: TVL, per-guarantee, per-agency, per-call, per-period and the allocation limit (now the settlement floor, ADR 0018) adopted; `max_guarantees`, concentration and new-coverage-per-period caps TBD | §8 |

## 12. Open questions

**From the project document's open items (§8) that affect the program:**

1. **Nora PDA whitelist and CPI burn.** Can a program-owned (PDA) token account be a whitelisted BRS mint destination, and is `burn` callable via CPI? This decides whether fees can be minted straight into `reserve` and whether claim payments can burn in-program, or whether both keep going through MUTAV's operator and payments wallets as specified here.
2. **TESOURO price account layout.** The layout of Etherfuse's `BondPrice` account, how the price is published and how often, and whether TESOURO is fixed-rate (LTN) or Selic-linked. This sets `PriceParams` and the accrual-curve `y_max`. Until confirmed, the adapter ships as interface + mock only.
3. **Cap values.** Final values for every cap in §8, including `min_request` / `max_request`.
4. **Take rate.** The value of `fee_take_bps` (program maximum 30%).
5. **Recoveries.** Whether recoveries flow back to the reserve (would add a `record_recovery` instruction, PC-3).
6. **BRS↔TESOURO path.** No direct path exists on Solana today (Etherfuse mints and redeems against USDC). `allocate`/`deallocate` against a real venue may need an async conversion state (PC-18). Until a path exists the pilot reserve is BRS only (ADR 0018).

**Raised while writing this spec:**

7. **Share treatment of MUTAV capital.** *Resolved (ADR 0008):* MUTAV uses the async flow and holds shares like any investor.
8. **`withdraw_surplus` destination.** *Resolved:* the instruction is removed (ADR 0008).
9. **Withdrawing MUTAV's take.** *Resolved (ADR 0007):* `contribute_fees` sends the take directly to the whitelisted `treasury_account`. There is no `fees` account and no `withdraw_fees`.
10. **Pause scope.** *Resolved (ADR 0008):* pause stops capital flows, new guarantees and allocation; fees (ADR 0009), claims, settlement, claim notices, `refresh`, `cancel_*` and `claim_*` stay open. Granular flags (PC-24) are still optional.
11. **`fulfil_deposits` in under-coverage.** *Resolved (ADR 0008):* allowed. It is the recapitalization path.
12. **NAV denominator.** Whether shares escrowed in `pending_redemptions` stay in `shares_outstanding` until fulfilment (current text: yes, they are only removed when a fill burns them). This also decides whether queued holders share in phase-2 instant-exit haircuts (current text: they do).
13. **Provision formula.** Provision = filed amount (current text) or the full outstanding default leg plus an expected-exit term (PC-12). Also: how a filed claim that MUTAV later withdraws releases its provision.
14. **Filing window on-chain.** Enforce the 15-day filing window in the program (PC-2) or only in the platform.
15. **Program-level time lock and multisig split.** Rely on the Squads time lock only, or also delay privilege increases on-chain. The Squads v4 time lock applies to the **whole** multisig and counts from approval, so with one multisig every `fulfil_redeems` waits as long as a program upgrade. Options: (a) one multisig with a moderate time lock (e.g. 24 h; fills are priced at NAV at execution, so the delay only postpones them), or (b) an `upgrade` multisig as upgrade authority (72 h–7 d) and a separate `admin` multisig as `VaultConfig.admin` with a shorter time lock ([§14.5](#145-upgrade-runbook)). Needs an ADR.
16. **Pauser powers.** Can the pauser appoint the replacement operator, or only revoke? Can it unpause?
17. **`coverage_ratio_bps` floor.** *Proposed in ADR 0016, pending founder confirmation:* a program constant floor of 0.10 (`MIN_COVERAGE_RATIO_BPS = 1_000`, the worst-case floor of business rule 9w), with `coverage_required = max(ceil(c × remaining_cover_total), provisions)`. Devnet starts at 0.10. A per-lease tail floor is a later ADR.
18. **Allocation gate.** Must the allocated amount itself fit in `free_capital`, or is the solvency post-condition plus the settlement floor and the per-adapter limits enough?
19. **Per-invoice idempotency for fees.** *Resolved (ADR 0009):* a `FeeReceipt` PDA seeded by `invoice_ref_hash`.
20. **Virtual offset and seed deposit.** *Resolved (2026-10-06):* `k = 0`, so `V = 1`: one share is worth 1 BRS at launch with the 6-decimal share mint. No seed deposit is minted at `initialize`. Rationale: NAV ignores direct transfers (internal accounting, invariant 1), and deposits are allowlisted and fulfilled by the admin, so a larger offset is not needed against first-depositor inflation. `PRICE_SCALE = NAV_SCALE = 10^9` (§8).
21. **NAV-move threshold X**, staleness window, deviation bound and stale-price behaviour (fail vs haircut). The clearing path for `fulfil_halted` is proposed in ADR 0015: an admin `clear_fulfil_halt` that also resets the guard's baseline (pending founder confirmation). ADR 0017 proposes measuring the move net of verified inflows, so fees and swept income no longer trip it.
22. **Adversarial-review items not yet decided:** PC-4, PC-8 (beyond ADR 0012), PC-9, PC-13 (beyond filed claims), PC-15, PC-16, PC-21, PC-30, PC-31, PC-32, PC-35, PC-36, PC-38, PC-43 (extra caps). See §11. PC-29 is resolved by ADR 0010; PC-6, PC-22 and PC-34 by ADR 0012. Also open: an `amend_guarantee` for signed addenda (rent changes, renewals, a new cap schedule; Súmula 214) and for a change of the landlord's mandate.

**Raised by the redemption-liquidity design (ADRs 0010, 0011):**

23. **Partial fills (PC-29).** *Resolved (ADR 0010):* head-only partial fills, each at the NAV of its fill; claim between fills; owner cancel returns the unfilled remainder, keeps filled assets claimable, and needs no cooldown.
24. **Partial-fill floors.** Values of `min_fill_assets` (proposed R$500) and `min_request` / `max_request` (proposed R$1,000 / R$30,000). Whether a per-owner limit on open requests (e.g. 3) and a short re-request cooldown are wanted on top of the `advance_queue_heads` crank.
25. **`max_assets` and PC-30.** `fulfil_redeems(count, max_assets)` lets the admin hold surplus back from the queue to back new guarantees (discretion over *how much*, never over *order*), and a funded phase-2 earmark is senior to new guarantees because `register_guarantee` must fit in the `free_capital` computed before it (invariant 16). Confirm both; PC-30 itself stays open. Also for phase 2: whether "queue empty" for `fund_exit_buffer` should mean "no request older than a short grace period" instead of `pending_redeem_shares == 0`, so one small standing request cannot block refills.
26. **Claims-senior liquidity (PC-13, part).** `liquid_budget = brs_balance − provisions − earmark_eff` caps redemption fills, and `allocate` keeps `brs_balance ≥ provisions + earmark_eff`. This is new in the pilot even with the earmark at 0. Confirm.
27. **`RedeemRequest` seeds.** Seeding by `seq` makes concurrent `request_redeem` calls race on `next_redeem_seq` (one fails and retries). Alternative: seeds `["redeem", config, owner, client_nonce]` with `seq` still stored and checked by `fulfil_redeems`.
28. **Earmark form.** Accounting-only inside `reserve` (this spec) or a separate `["exit_buffer", config]` token account. The accounting form keeps the earmark spendable by `pay_claim` and adds no freeze-exposed account.
29. **Claim-notice definition.** On-chain meaning of "an unprovisioned claim is pending": the operator flag `flag_claim_notice` at the first missed-rent signal, **shipped in the pilot** and gating `fulfil_deposits`, `fulfil_redeems` and phase-2 `instant_redeem` ([§5.4](#54-claims-and-payouts-operator)). The flag's timing is the main residual front-running risk (MUTAV controls the operator); the notice SLA and how it shows on the transparency page need confirming.
30. **Effectiveness of the MUTAV bar.** If shares are freely transferable (PC-32), MUTAV or any holder can move shares to another allowlisted wallet and dodge the bar, the holding period and the per-wallet caps. Options: allowlist leaves of the form `hash(wallet, identity_hash)` with caps keyed by identity (LGPD review: a salted hash, not personal data), and/or restricting share transfers.
31. **Haircut curve.** The integral curve and pilot parameters in §13.4 (50 bps floor, +600 bps at the full target, quadratic, 10% marginal cap, 7-day pressure epoch) are proposals, to be re-calibrated before enabling.
32. **Queue liveness under notices.** While any notice is open the queues wait; a notice closes only when the claim is paid, the leg is fully provisioned, or the notice is withdrawn. Confirm that this delay is acceptable, or narrow the queue gate to requests owned by `mutav_capital_wallet` / `exit.barred` (instant exit keeps the global gate).
33. **`MAX_ADAPTERS`.** *Resolved (2026-10-06):* `MAX_ADAPTERS = 8`. `AdapterEntry._reserved` widened to 64 bytes so PC-27 pinning can be added later without a migration.

**Raised by the devnet fork test (plan Task 13):**

34. **Authorities of the devnet BRS mint.** Read on 2026-10-06 from devnet. `BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4` is a classic SPL Token mint (not Token-2022), with 6 decimals, so it passes the mint guard. Its **mint authority** is `7764rLMKF8fd4daejEESKBDPjE5EQBEQNgKCKNCpMwJv`, a 186-byte account owned by program `9fBSeVHUCaHHUzkktiRp5Yn35emxx3S1ERzn7oHsi8je` (presumably Nora's minting program). Its **freeze authority** is `nora7ZTxmDrLdVheVazpsthHFB8u3JzgHeyh9foTZWC`, a system-owned wallet, so a single key can freeze any BRS token account, the reserve's included. Freeze detection (`refresh`, Task 10) and the fail-closed `stable_assets` cover this. Still to confirm with Nora:
    - who holds the freeze key on mainnet, and under what policy (multisig, published freeze criteria);
    - whether the mainnet mint has the same authorities and stays classic SPL;
    - whether the mint authority's program can be upgraded (and so change mint policy).

**Raised by the fiança alignment (ADR 0012).** Items marked *[counsel]* need a legal opinion before the instrument is signed.

35. **Claims-tail length.** How long after the keys, or after an effective exoneration, may claims still be filed? It must cover debts that are liquidated late (inspections, cost bills, judgments). It can be no longer than the 3-year prescription of rent claims (CC 206 §3º I). Could the instrument set a shorter contractual filing period? *[counsel]* Until it is set, `claims_tail_secs = 0` keeps every guarantee `ACTIVE`.
36. **Payment term N** (`payment_term_secs`). Is a contractual term of N business days from a complete payment request effective against automatic mora (CC 397), now that MUTAV waives the benefício de ordem and is principal pagador? What evidence makes a request "complete"? *[counsel]*
37. **Exhaustion as extinção.** Does a limited fiança whose ceiling is exhausted count as "extinção" of the guarantee for the LI 59 §1º IX liminar? Can the instrument say so expressly? Does `EXHAUSTED` (and the notice that follows `GuaranteeExhausted`) change the eviction track as `12-eviction-cost-south.md` §6 assumes? *[counsel]*
38. **Accessories inside the ceiling.** Does a ceiling that expressly includes interest, penalties, court costs and fees fully displace CC 822? Will a court add monetary correction or fees on top of a fixed R$ ceiling? *[counsel]*
39. **Under-coverage and insolvency.** Can a landlord rely on CC 826 (insolvency without a judicial declaration) in a lease, or does LI 40 II displace it? Could a public reserve deficit serve as evidence of insolvency (CC 955)? Can the instrument waive CC 826 and keep only the LI 40 list? Is the two-layer disclosure (§6) enough? *[counsel]*
40. **Early-termination penalty** (LI 4). Should it be included, with a sub-limit, or only when the unit stays vacant? `CAT_TERMINATION_PENALTY` is reserved and disabled (`optional_categories = 0`) until this is decided.
41. **Discharge under the mandate.** Is payment to the agency under the landlord's mandate a full discharge (CC 308) even if the agency does not forward the money? Should the quitação be the agency's under the mandate (this spec, at settlement) or the landlord's own, in a second step (`confirm_receipt`) that keeps the SLA clock separate from the agency's forwarding time? Should the agency use a segregated account? *[counsel]*
42. **Admin-path latency.** The Squads time lock delays `pay_claim_admin`. Options: a claims multisig with a short time lock (ties Q15 option (b)), or rely on the backstop advance plus a later reimbursement. Also: should a backstop reimbursement require the operator caps or the admin path?
43. **`VOID` close.** Should `close_guarantee(VOID)` have a time window after registration, an evidence hash argument, or the admin as signer? Today it is open to the operator whenever nothing has been paid and no claim is open.
44. **Exoneration mechanics.** Does LI 40 X (120 days) displace CC 835 (60 days) in leases? Can MUTAV exonerate during the fixed term, or only after an indefinite extension? Does the on-chain `now` stand in for the delivery date of the notice? *[counsel]*
45. **Two legs or one.** Keep `default_cover` / `exit_cover` as sub-limits inside the one ceiling (this spec), or collapse to a single ceiling with category sub-limits only. The legs mirror today's product (3× + 6× rent) and the claim-notice rules. A single ceiling matches the instrument more simply.
46. **CC 838 I on-chain.** Should MUTAV's consents to payment plans and addenda be recorded on-chain (e.g. as amendment hashes), or does the platform record suffice? Can MUTAV waive the CC 838 I release in advance for agency-negotiated plans it later ratifies? *[counsel]*

**Raised by the BRS income intake (ADR 0017):**

47. **Cap on MUTAV's take from issuer income** (`MAX_INCOME_TAKE_BPS`). The pilot routes all income into the reserve (`income_take_bps = 0`). In phase 2 the vehicle's share is a term of the service agreement, set under an on-chain cap and the time lock. The cap's value is not decided, so the constant is `0` and `set_config` refuses any non-zero take until an upgrade sets it. Also: the tax treatment of income routed into the reserve (booked as MUTAV revenue, then contributed) *[counsel]*.
48. **Terms of Nora's revenue share.** The written agreement (term, termination, rate changes); whether Nora can allowlist the vault authority PDA as a mint destination or transfers from a treasury; the basis (average daily or month-end balance, over which of the reserve's addresses); the rate formula, whether it can be zero and who withholds tax; minted or transferred, and whether each payment can carry a reference for `income_ref_hash`; the cut-off, payment day, SLA and clawback policy; a per-partner statement or an on-chain record the program could verify; whether sBRS would take over the revenue share. Until answered, the operator sweeps only the amount on a statement.
49. **Recovery of untracked BRS and the phase-2 timing guard.** An admin-only, timelocked `recognize_untracked(ref_hash, kind, amount)` for BRS sent to `reserve` by mistake or to the inbox outside a statement, bounded by `reserve.amount − brs_balance` and never used for returned claim payments; and, once outside investors can deposit, a guard against buying just before a monthly NAV step (`min_hold_secs ≥` the income period, fulfilment after recognition, optional vesting). Neither is in the pilot binary.

---

## 13. Phase 2 — Instant exit (designed, disabled in the pilot)

*Status: designed now so that the pilot's layouts, solvency formula and pause/mode semantics already cover it ([ADR 0011](decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)). None of the instructions in this section exist in the pilot binary. Enabling it takes a Squads-timelocked program upgrade and then a separate timelocked `set_config` that sets the `INSTANT_EXIT` flag ([§14.5](#145-upgrade-runbook)). Design reference: OnRe's Prop AMM sell (`onre-finance/onre-sol`, MIT), adapted; see [`provenance.md`](provenance.md).*

### 13.1 What it is

- An allowlisted holder burns shares and receives BRS **immediately**, at NAV minus a convex **haircut**. There is no queue and no admin fulfilment.
- It pays **only** from the **buffer earmark**: BRS inside `reserve`, reserved out of surplus that the redemption queue does not need ([§13.3](#133-the-buffer-earmark)). Investors never deposit into the buffer.
- The haircut **stays in the reserve**: NAV rises for every remaining holder. It is never MUTAV revenue and never counts as a guarantee fee.
- It is **off automatically** when: the flag is off, the program is paused, `mode == UnderCovered`, `fulfil_halted`, the TESOURO price is stale, a claim notice is pending (an unprovisioned claim), the exit would take surplus below the headroom, or the queue head is starved. MUTAV's capital wallet and listed affiliates are barred.
- It is the one deliberate exception to "withdrawals are strict FIFO and admin-fulfilled" (ADR 0008, amended by ADR 0011). What is kept: exits come only from the earmarked surplus, and they never reduce `free_capital` (the haircut even adds to it), so they never take capacity from the queue.

### 13.2 Parameters (`ExitParams`)

`VaultConfig.exit` is a **real field from the pilot onwards**, all zero, so that phase 2 needs no layout change in `VaultConfig`. Every value is checked only when the resulting config has `INSTANT_EXIT` on; a zero cap makes a half-configured enable fail closed.

| Field | Type | Meaning | Enable-time rule | Proposed phase-2 start |
|---|---|---|---|---|
| `buffer_target_bps` | `u16` | Target earmark as a share of `stable_assets`; also the curve's reference size `E` | `0 < x ≤ MAX_BUFFER_TARGET_BPS` (1_000) | 500 (5%) |
| `buffer_headroom_bps` | `u16` | Headroom as a share of `coverage_required`. Instant exit requires `stable_assets − out ≥ coverage_required + headroom`, and funding stops at `surplus − headroom`. Not part of the gates' `earmark_eff` (§4) | `> 0` | 1_000 (10%) |
| `buffer_release_after_secs` | `i64` | Queue-head wait after which the earmark is released to the queue | `> 0` | 14 days |
| `curve_version` | `u8` | `1` = quadratic integral curve (§13.4). `0` = none | `== 1` | 1 |
| `h_min_bps`, `h_peg_bps`, `h_max_bps` | `u16` ×3 | Marginal haircut floor; added marginal rate at `x = E`; marginal cap | `0 < h_min ≤ h_max ≤ MAX_EXIT_HAIRCUT_BPS` (2_000); `h_peg > 0` | 50 / 600 / 1_000 |
| `pressure_epoch_secs` | `i64` | Decay epoch for recent exit volume | `> 0` | 7 days |
| `min_instant_assets` | `u64` | Smallest exit, in BRS at NAV | `> 0` | R$100 |
| `max_instant_per_tx` | `u64` | Largest single exit | `> 0` | R$2,500 |
| `max_instant_per_wallet` | `u64` | Per wallet, per `instant_period_secs` | `> 0`, `≤ max_instant_per_period` | R$2,500 |
| `max_instant_per_period` | `u64` | Global, per `instant_period_secs` | `> 0` | R$10,000 |
| `instant_period_secs` | `i64` | Cap window | `> 0` | 30 days |
| `min_hold_secs` | `i64` | Minimum time since the wallet's last `claim_shares` | `> 0` | 30 days |
| `max_price_age_secs` | `i64` | Tighter staleness bound for instant exit | `0 < x ≤ price.max_staleness_secs` | TBD |
| `allowlist_root` | `[u8; 32]` | Merkle root of wallets eligible for instant exit (may be narrower than `investor_allowlist_root`) | `!= [0; 32]` | — |
| `barred` | `[Pubkey; 4]` | Affiliated or insider wallets barred in addition to `mutav_capital_wallet`; `Pubkey::default()` = empty slot | — | — |
| `_reserved` | `[u8; 32]` | Room for later exit parameters | — | — |

Enabling also requires `mutav_capital_wallet != Pubkey::default()`.

**`InstantExitState`** — carved by the phase-2 binary from the front of `VaultState._reserved` (88 of the 216 bytes left after the ADR 0012 and ADR 0017 fields, leaving `[u8; 128]`; the number is pinned by a test of the serialized size, not by hand; zero is the correct starting value of every field). `pending_notices` is not here: it is a real `VaultState` field from the pilot (§3.2).

| Field | Type | Meaning |
|---|---|---|
| `exit_epoch_start` | `i64` | Start of the current pressure epoch |
| `exit_curr`, `exit_prev` | `u64`, `u64` | Exit volume (raw BRS) in the current and previous epoch |
| `exit_period_start`, `exit_period_paid` | `i64`, `u64` | Global cap window |
| `instant_assets_total`, `instant_shares_total`, `haircut_total` | `u64` ×3 | Lifetime BRS paid out, shares burned, haircut retained. `haircut_total` is separate from `fees_in_total` |
| `buffer_funded_total`, `buffer_released_total` | `u64`, `u64` | Lifetime earmark increases and releases |
| `last_instant_ts` | `i64` | |

**State created after the upgrade** (no migration; seed prefixes reserved now, [§14.2](#142-padding-and-version)). `ClaimNotice` is a pilot account ([§3.12](#312-claimnotice)).

| State | Where | Created by | Fields |
|---|---|---|---|
| Per-wallet counters | carved from `HolderState._reserved` | first `instant_redeem` | `exit_period_start: i64`, `exit_period_paid: u64` |

The earmark is **not** a separate token account: it is accounting inside `reserve`, so it still counts in `stable_assets`, `pay_claim` can always spend it, a direct transfer cannot inflate it, and no new freeze-exposed account appears. The prefix `"exit_buffer"` is reserved in case §12 Q28 decides otherwise.

### 13.3 The buffer earmark

The pilot already computes `earmark_eff` and the earmark-aware `free_capital` ([§4](#4-invariants-and-formulas)). Phase 2 only adds the instructions that move the stored level `buffer_earmark`.

- **Reserved, not soft.** `earmark_eff = min(buffer_earmark, surplus, brs_balance − provisions)`, `0` with the flag clear or for a starved head (§4). Every gated outflow and new liability (queue fills, `register_guarantee`, `allocate`, `deallocate`) must fit in the `free_capital` computed before it, so none of them can consume the earmark (invariant 16). Only claims and filed provisions (liquidity term), price mark-downs (surplus term), the starvation release and a defund lower it.
- **Headroom applies to instant exit only.** `instant_redeem` requires `stable_assets − out ≥ coverage_required + headroom`, so instant exit switches itself off **before** the reserve is anywhere near under-coverage, and `fund_exit_buffer` funds at most `surplus − headroom`. When surplus falls below `earmark + headroom` (a mark-down or claims), the earmark stays reserved but cannot be spent by instant exit; if the queue waits meanwhile, the starvation release (or a defund) returns it to free capital.
- **Clamp to the target.** Phase-2 instructions that touch the earmark (`instant_redeem`, `fund_exit_buffer`, `defund_exit_buffer`, `release_starved_buffer`) first store `buffer_earmark := min(buffer_earmark, E)`, with `E` from the current `exit.buffer_target_bps` (§13.4), so lowering the target lowers what instant exit can pay. `E` is not part of the gates' formula, because `E` falls with every outflow and would leak the earmark the same way a headroom term would.
- **Ratchet.** The ratcheting instructions of §4 store `buffer_earmark := earmark_eff`, so the stored level never rises by itself. Recovered surplus goes to free capital (the queue) first; the earmark rises again only through `fund_exit_buffer`.
- **Queue priority.** `fund_exit_buffer` runs only while the redemption queue is empty (`pending_redeem_shares == 0`). An earmark that existed before a request arrived is not drained into the queue, but once the queue head has waited longer than `buffer_release_after_secs`, the earmark is released to free capital (`release_starved_buffer`, and inline in `fulfil_redeems`), and `instant_redeem`, which must present the head whenever the queue is non-empty, sees `earmark_eff = 0` and refuses. A buffer can never be spent ahead of, or sit idle next to, a starving queue.
- **Seniority.** A funded earmark is senior to new guarantees (`register_guarantee` must fit in the `free_capital` computed before it) and junior to claims (`pay_claim` spends it without reading it). Because it refills only when the queue is empty and only up to `buffer_target_bps` of the reserve, the cost to new-guarantee capacity is small (PC-30, §12 Q25).
- `allocate` keeps the earmark liquid: `brs_balance_after ≥ provisions + earmark_eff_before` ([§5.7](#57-reserve-allocation-admin-through-adapters)).

### 13.4 Haircut

The haircut is the **integral of a convex marginal rate** over the buffer's utilization state. Both terms of `x` rise by exactly `raw` per exit (`exit_curr += raw`, and the stored earmark falls by `raw`, not by `out`), so inside one pressure epoch splitting an exit into pieces pays the same total as one exit, up to rounding and to the small drift of `E` with `stable_assets`. In the edge case where the surplus or liquidity term, not the stored level, sets `earmark_eff`, depletion rises by `out` only and splitting can save at most `Σ haircut × h_max / 10_000`, a second-order amount. (OnRe's per-order formula is not split-proof: with a 50 bps floor, a 300 bps peg, exponent 2 and a R$5,000 buffer, one R$2,500 exit pays R$54.69 while five R$500 exits pay R$15.54 in total.)

```text
E        = floor(stable_assets × buffer_target_bps / 10_000)             // reference size; E == 0 → refuse
raw      = assets_for(shares)                                            // NAV value, round down
V_window = exit_prev × max(0, pressure_epoch − (now − exit_epoch_start)) / pressure_epoch + exit_curr
x        = max(V_window, E − earmark_eff)                                // recent exit volume, or depletion, whichever is worse
m(x)     = min(h_max, h_min + h_peg × (x / E)²)                          // marginal rate (bps)
H(x)     = ∫₀ˣ m                                                         // closed form below
haircut  = ceil(H(x + raw) − H(x))                                       // one exact rational, rounded up once
out      = raw − haircut

x*   = floor(E × sqrt((h_max − h_min) / h_peg))                          // where the marginal hits the cap; floor = reserve's favour
H(x) = (h_min·x + h_peg·x³ / (3·E²)) / 10_000                            for x ≤ x*
     = H(x*) + h_max·(x − x*) / 10_000                                   for x > x*
```

- Arithmetic in `u128` with an integer square root. The haircut is computed as **one** exact rational and rounded up once, never as a difference of separately rounded `H` values: for `a = x`, `b = x + raw ≤ x*`, `haircut = ceil((h_min·raw·3E² + h_peg·(b³ − a³)) / (3E²·10_000))`; across or above `x*` the same is done piecewise with a common denominator. Tests pin the examples below to the base unit.
- **Epoch roll:** when `now ≥ exit_epoch_start + pressure_epoch`, `exit_prev = exit_curr`, `exit_curr = 0` and the epoch start moves forward by whole epochs; after two or more empty epochs, both are zero.
- `V_window` makes a burst price worse even after a refill; `E − earmark_eff` makes a depleted buffer (including depletion from surplus shrinkage) price worse. Patience — waiting for the window to decay **and** for a refill, which happens only when the queue is empty — lowers the price. Splitting does not.
- The haircut prices liquidity and run speed only. It is **not** the defence against exits by holders who know of a coming claim; the claim-notice gate is ([§13.6](#136-anti-front-running-rules)).

**Worked examples** (proposed parameters; `E` = R$5,000; NAV R$1.00; 100,000 shares):

| Case | `x` before | `raw` | Haircut | Effective | `out` |
|---|---|---|---|---|---|
| Minimum exit | 0 | R$100 | R$0.50 | 0.50% | R$99.50 |
| Small exit | 0 | R$500 | R$2.60 | 0.52% | R$497.40 |
| At the per-wallet cap | 0 | R$2,500 | R$25.00 | 1.00% | R$2,475.00 |
| Same R$2,500 as 5 × R$500 in one epoch | 0 → 2,000 | 5 × R$500 | R$25.00 total | 1.00% | R$2,475.00 |
| R$2,000 right after a R$2,500 exit | 2,500 | R$2,000 | R$70.40 | 3.52% | R$1,929.60 |
| Whole buffer drained by several wallets in one epoch | 0 | R$5,000 | R$125.00 | 2.50% | R$4,875.00 |
| Burst past the target after a refill, same epoch | 5,000 | R$2,500 | R$226.54 | 9.06% | R$2,273.46 |

After the R$2,500 exit: 2,500 shares burned, R$2,475 paid, the R$25 haircut stays in `reserve`, so NAV goes from R$1.000000 to R$1.000256 for the 97,500 remaining shares (queued shares included). `surplus` falls by R$2,475 and `buffer_earmark` by R$2,500, so `free_capital` rises by the R$25 haircut: the retained haircut goes to the queue, never back into the buffer.

### 13.5 Instructions

#### `instant_redeem(shares, min_out, proof)`

- **Signer:** investor (owner of the shares). The share token account must have `owner == signer`; shares are burned with the signer as owner authority, never as a delegate (§5 common rules), so the bars, the holding period and the caps apply to the real holder.
- **Accounts:** `config`, `state`, the owner's `HolderState`, owner share token account, owner BRS token account, `reserve`, share mint, BRS mint, vault authority, token programs, TESOURO price account(s); **the queue head `RedeemRequest` whenever `pending_redeem_shares > 0`** (checked as `seq == redeem_head` with `shares_remaining > 0`, otherwise `QueueOrderViolation`).
- **Rules (in order):**
  1. `INSTANT_EXIT` set (`FeatureDisabled`).
  2. Not paused; `mode == Normal`; `fulfil_halted == false`.
  3. TESOURO price fresh against `min(exit.max_price_age_secs, price.max_staleness_secs)` when `tesouro_units > 0` (`StalePrice`).
  4. `pending_notices == 0` (`ClaimNoticePending`).
  5. `owner != mutav_capital_wallet` and `owner ∉ exit.barred` (`InstantExitBarred`).
  6. Merkle proof of `owner` against `exit.allowlist_root` (`NotAllowlisted`).
  7. `HolderState` exists and `now − last_shares_in_ts ≥ min_hold_secs` (`HoldingPeriodActive`). The stamp is refreshed by `request_deposit` and `claim_shares`. A wallet that never requested a deposit is not eligible.
  8. `raw = assets_for(shares)`; `min_instant_assets ≤ raw ≤ max_instant_per_tx`; per-wallet and global period caps, after rolling their windows (`InstantExitCapExceeded`).
  9. Clamp the stored level to `E` (§13.3), then compute `earmark_eff` with the head (a starved head gives `0`). Require `raw ≤ earmark_eff` and `stable_assets − out ≥ coverage_required + headroom`, with `headroom = ceil(coverage_required × exit.buffer_headroom_bps / 10_000)` (`InsufficientExitBuffer`).
  10. Compute `haircut` and `out` (§13.4). `out > 0` (`ZeroOutput`), whatever `min_out` is; `out ≥ min_out` (`SlippageExceeded`). Both are checked before any transfer.
- **Effects:** apply the ratchet; burn `shares` from the owner; transfer `out` BRS `reserve` → owner (vault-authority signed, direct: no `claims` escrow); `brs_balance −= out`; `shares_outstanding −= shares`; `buffer_earmark −= raw` (the haircut is released to free capital); `exit_curr += raw`; period counters and `HolderState.exit_period_paid += raw`; `instant_assets_total += out`, `instant_shares_total += shares`, `haircut_total += haircut`; `last_instant_ts = now`.
- **Not** solvency-gated beyond rule 9. It never lowers `free_capital`: `surplus` falls by `out` and the earmark by `raw`, so `free_capital` rises by the haircut.
- **Event:** `InstantRedeemed`.

#### `quote_instant_redeem(owner, shares, proof)`

- **Signer:** none (view, run by simulation; returns data). Takes the same accounts as `instant_redeem`, including the queue head when the queue is non-empty, and applies rules 1–10 without side effects. Returns `{ raw, haircut, out, x_before, earmark_eff }`, or the error that would apply. The client sets `min_out` from it with a slippage tolerance.

#### `fund_exit_buffer()`

- **Signer:** operator (a crank run by mutav-app). It moves no tokens. Restricted to the operator so that nobody can lock surplus away from new guarantees, or from a wave of incoming requests, by funding at an inconvenient moment.
- **Rules:** `INSTANT_EXIT` set; not paused; `mode == Normal`; price fresh; **`pending_redeem_shares == 0`**; `surplus ≥ headroom`.
- **Effects:** clamp to `E`; `buffer_earmark = min(E, surplus − headroom, brs_balance − provisions)`, never lower than the current `earmark_eff`; `buffer_funded_total += increase`.
- **Event:** `ExitBufferFunded { amount, level }`.

#### `defund_exit_buffer(amount)`

- **Signer:** admin or operator. It only reduces risk (returns surplus to the queue), so the operator may run it without the admin time lock. Allowed while paused and in under-coverage.
- **Effects:** clamp to `E`; `buffer_earmark = earmark_eff − min(amount, earmark_eff)`; `buffer_released_total += released`.
- **Event:** `ExitBufferReleased { amount, level, reason: Defund }`.

#### `release_starved_buffer()`

- **Signer:** anyone (cranked by mutav-app; the canonical path that stores a starvation release). **Accounts:** the queue head `RedeemRequest`, checked as `seq == redeem_head` with `shares_remaining > 0` (`QueueOrderViolation` otherwise; run `advance_queue_heads` first if the head has died).
- **Rules:** `now − head.requested_at > buffer_release_after_secs` (`QueueHeadNotStarved`).
- **Effects:** `buffer_earmark = 0`; `buffer_released_total += released`. `fulfil_redeems` applies the same rule inline.
- **Event:** `ExitBufferReleased { amount, level: 0, reason: Starvation }`.

Claim notices (`flag_claim_notice`, `close_claim_notice`) are pilot instructions ([§5.4](#54-claims-and-payouts-operator)); phase 2 only adds `instant_redeem` to what they gate.

### 13.6 Anti-front-running rules

1. **Claim notices gate exits.** While any notice is open, every instant exit fails (as do queue fills and deposit fulfilments since the pilot, §5.4), so a holder cannot exit at a NAV that does not yet reflect a known missed rent. A notice closes only when the claim is paid, the leg is fully provisioned, or the notice is withdrawn, so exits resume at a NAV that already carries the whole possible payment on that leg. An operator who abuses the flag can only push exits back to the queue at NAV. The transparency page shows every open notice and its age from `ClaimNoticeFlagged` events, and flags any open longer than 15 days. A late flag is the main residual risk (§12 Q29).
2. **MUTAV and affiliates are barred.** `mutav_capital_wallet` and `exit.barred` are public, so anyone can verify the bar. MUTAV exits only through the queue, like any holder (ADR 0008).
3. **Price.** A fresh bounded TESOURO price within the tighter `max_price_age_secs`, and `fulfil_halted == false`: an atomic exit is more sensitive to a stale mark than an admin-timed fill.
4. **Holding period.** `HolderState.last_shares_in_ts` (stamped by `request_deposit` and `claim_shares` since the pilot) must be at least `min_hold_secs` old. `contribute_fees` raises NAV on receipt (PC-15 not adopted), so without it a deposit → fee batch → instant exit round trip could be profitable. Stamping at the request closes the variant where a holder with old shares leaves a new deposit fulfilled but unclaimed (its shares already earn the fee) and instant-exits the same amount of old shares.
5. **Caps.** Per transaction, per wallet and global per period. With freely transferable shares (PC-32) wallet-level rules can be dodged across allowlisted wallets (§12 Q30).

### 13.7 Interaction with the FIFO queue and NAV

- **Separate pots.** The queue pays only from `free_capital`, which excludes the earmark, and every fill must fit in the `free_capital` computed before it, so fills never eat into the earmark (invariant 16). Instant exit pays only from the earmark, never lowers `free_capital`, and refuses while the queue head is starved. The earmark refills only when the queue is empty. Unlike OnRe, where atomic sells and queued fills draw on one vault, an atomic exit cannot take what a waiting queue is owed.
- **Queue first.** Surplus goes to queued holders at NAV before it goes into the buffer; a starved head releases the buffer and blocks instant exit; retained haircuts go to free capital.
- **Queued shares** sit in `pending_redemptions` and cannot be instant-redeemed. A holder may `cancel_redeem` and then use instant exit, subject to every gate, losing the place in line.
- **NAV accrual of the haircut:**

  ```text
  before:  NAV₀ = net_assets / S
  exit:    burn s shares, pay out = s·NAV₀ − haircut
  after:   NAV₁ = (net_assets − s·NAV₀ + haircut) / (S − s) = NAV₀ + haircut / (S − s)
  ```

  The haircut goes pro rata to every remaining share, including shares escrowed in the queue (§12 Q12). It never goes to `treasury_account`, and it is tracked as `haircut_total`, separately from `fees_in_total`.

### 13.8 Events

| Event | Fields (besides `config`, `ts`) |
|---|---|
| `InstantRedeemed` | `owner, shares, raw, haircut, out, nav_before, nav_after, x_before, earmark_after` |
| `ExitBufferFunded` | `amount, level` |
| `ExitBufferReleased` | `amount, level, reason: u8 { Defund, Starvation }` |

`ClaimNoticeFlagged` / `ClaimNoticeClosed` are pilot events (§9).

A ratchet that lowers the stored level emits no event of its own; the level is visible in every `StateRefreshed { buffer_earmark }`. This keeps the pilot instructions that apply the ratchet unchanged in phase 2.

### 13.9 Errors

Appended after the pilot list, in this order: `FeatureDisabled`, `InstantExitBarred`, `InsufficientExitBuffer`, `SlippageExceeded`, `ZeroOutput`, `InstantExitCapExceeded`, `HoldingPeriodActive`, `QueueHeadNotStarved`.

---

## 14. Upgrade readiness

*Goal: phase 2 is enabled on a **live** reserve through a Squads-timelocked program upgrade, **with no account migration** and no change to any existing instruction, account layout, event or error ([ADR 0011](decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)). The patterns follow programs that have done this on live accounts: OnRe (fields carved from `reserved`, a layout-compatibility test), Kamino klend (a FIFO withdraw queue added to live reserves from padding, per-feature flags) and Drift (bit-flag features; new config PDAs once padding ran out).*

### 14.1 Principle: zero means off

Anchor 1.2 decodes `#[account]` structs with Borsh and ignores trailing bytes. Splitting `_reserved: [u8; N]` into `new_field: T, _reserved: [u8; N − size_of(T)]` therefore reads the same bytes on a live account, and the new field reads as zero. Every phase-2 field is designed so that **zero is the correct pilot behaviour** (`0` = disabled / empty / no notices, `Pubkey::default()` = unset, status constant 0 = the safe default). A field that cannot meet this would need a `version` bump and a one-shot initializer — a migration — and is not allowed in phase 2.

### 14.2 Padding and version

**Layout rules** for every program-owned account:

- **R1.** The first fields are `version: u8` (pilot = `1`) and `bump: u8`. `version` changes only for a real migration; phase 2 needs none.
- **R1b.** Every instruction requires `account.version ≤ PROGRAM_LAYOUT_VERSION` for every program-owned account it reads (`UnsupportedVersion` otherwise), and `init` writes `PROGRAM_LAYOUT_VERSION`. An older binary therefore refuses, instead of misreading, an account that a later migration rewrote. Unknown `u8` status or mode values fail the same way.
- **R2.** Fixed-size types only: integers, `Pubkey`, `[u8; N]`, fixed arrays of fixed structs. Statuses, legs and modes are `u8` with explicit constants, not Borsh enums, so a later state is a new constant that older decoders read without failing to deserialize. **No `Option`, `Vec`, `String` or enums with data**; use sentinels. Nested config structs (`Caps`, `PriceParams`, `ExitParams`) end with their own `_reserved: [u8; 32]`.
- **R3.** Fields carved from padding decode from zero to the pilot behaviour; carved flags are `u8` or bits in a `u64`, never `bool` (Borsh rejects any byte other than 0 or 1).
- **R4.** `_reserved` is the last field, initialized to `[0; N]`, never read or written by logic. Fields are carved from its front.
- **R5.** Append-only: never reorder, retype or delete fields; a retired field becomes `_deprecated_<name>`. Never rename an account struct (it changes the discriminator).
- **R6.** Code updates accounts **in place** (`config.field = x`) and never rebuilds a struct over an existing account, so bytes written by a newer binary survive a rollback.
- **R7.** Sizes are pinned: `const _: () = assert!(8 + T::INIT_SPACE == T_SIZE);` per account, with the constant committed.
- **R8.** Large accounts are boxed in instruction contexts (`Box<Account<'info, VaultConfig>>`); the SBF stack frame is 4 KiB.

**Padding per account** (sized at about 3× the known phase-2 need; rent is about 6,960 lamports per byte):

| Account | Pilot budget | Carved by ADR 0012 / ADR 0017 (pilot fields) | `_reserved` left | Phase-2 use |
|---|---|---|---|---|
| `VaultConfig` | 512 | `claims_tail_secs`, `payment_term_secs`, `optional_categories`, `backstop_amount`, `backstop_commitment_hash` (57); ADR 0017: `income_take_bps` (2) | `[u8; 453]` | None needed: `feature_flags`, `mutav_capital_wallet` and `ExitParams` are real fields from the pilot. Left for granular pause bits (PC-24), share classes (PC-35), a program-level time lock (§12 Q15) |
| `VaultState` | 256 | `admin_claims_paid_total`, `backstop_reimbursed_total` (16); ADR 0017: `income_total`, `income_take_total`, `inflows_since_refresh` (24) | `[u8; 216]` | `InstantExitState`, 88 bytes, leaving `[u8; 128]` ([§13.2](#132-parameters-exitparams)); the figure is pinned by a serialized-size test |
| `Guarantee` | **192** (was 64) | `contract_cap_hash`, `landlord_mandate_hash`, `exoneration_effective_ts`, `keys_returned_ts`, `claims_tail_until_ts` (88) | `[u8; 104]` | None planned. Room for `amend_guarantee` state (amendment count and last hash, 34 bytes) |
| `ClaimFiling` | **128** (was 64) | `category`, `accrued_until_ts`, `request_complete_ts`, `debt_calc_hash` (49) | `[u8; 79]` | None planned |
| `Payout` | **128** (was 64) | `category`, `flags`, `request_complete_ts`, `landlord_mandate_hash`, `quitacao_hash` (74) | `[u8; 54]` | None planned |
| `RedeemRequest`, `DepositRequest` | 64 | — | `[u8; 64]` | None planned. Per-request accounts live at upgrade time cannot be migrated, so the partial-fill fields are real from the pilot |
| `HolderState` | 64 | — | `[u8; 64]` | Per-wallet exit counters, 16 bytes |
| `AgencyExposure`, `FeeReceipt`, `ClaimNotice`, `IncomeReceipt` | 64 | — | `[u8; 64]` | None planned |
| `Caps`, `PriceParams`, `ExitParams` (nested in config) | 32 each | — | `[u8; 32]` each | Later caps (PC-43), stale-price haircut (Q21), later exit parameters |
| `AdapterEntry` (inline in config) | 64 per entry | — | `[u8; 64]` per entry | `max_share_bps` (2, ADR 0018) and PC-27 adapter pinning (deployed slot and upgrade authority, 40 bytes), if adopted. The per-adapter price feed and position (86 bytes) do not fit: they go in the `AdapterState` PDA (§3.9) |

**ADR 0017 carve rules.** Each field is safe at zero: `income_take_bps = 0` sends all income to the reserve; `income_total = income_take_total = 0` means no income swept yet; `inflows_since_refresh = 0` is the state after every `refresh`, so a guard reading it on an account written before ADR 0017 measures gross, exactly as before.

**ADR 0012 carve rules.** The ADR 0012 fields are real pilot fields placed at the front of each padding block, so the frozen layout already contains them. Each one is safe at zero: a zero hash means "not recorded"; a zero timestamp means "not happened" (no exoneration, keys not returned, no tail running); `category = 0` is never accepted; `flags = 0` is an ordinary operator payment; `claims_tail_secs = 0` blocks the end-of-lease transitions, which keeps cover in place; `optional_categories = 0` disables the termination penalty; `backstop_amount = 0` means nothing is disclosed. The status constants `2`–`4` are new, and an older binary fails closed on them (R1b). The padding of `Guarantee`, `ClaimFiling` and `Payout` grows before the freeze so that each account still has spare padding after the carve. From the first deploy onwards, sizes are pinned (R7).

**Real fields from the pilot** (read by pilot code, all in the pilot IDL): `VaultConfig.version`, `feature_flags`, `mutav_capital_wallet`, `exit: ExitParams`, `caps.min_fill_assets`; `VaultState.buffer_earmark`, `pending_notices`; the partial-fill fields of `RedeemRequest`; `HolderState`; `ClaimNotice`; `FeeReceipt`; `IncomeReceipt`; and the ADR 0012 and ADR 0017 fields in the table above.

**Pinned sizes** (discriminator included): `VaultConfig` 2,756 bytes (`MAX_ADAPTERS = 8`; `_reserved` 453 after the 57-byte ADR 0012 and 2-byte ADR 0017 carves), `VaultState` 480 bytes (`_reserved` 216 after the 16-byte ADR 0012 and 24-byte ADR 0017 carves), `IncomeReceipt` 142 bytes (ADR 0017). The carves come from padding, so neither total changes. **Carve order:** the ADR 0017 fields ship in the devnet binary and sit at the front of each padding block; the ADR 0012 fields, built later, are carved after them. Until then the devnet binary's `_reserved` is `[u8; 510]` in `VaultConfig` and `[u8; 232]` in `VaultState`. `Guarantee`, `ClaimFiling` and `Payout` grow by their padding increase (128, 64 and 64 bytes) and are re-pinned when ADR 0012 is implemented.

**Layout freeze** (checked in plan Tasks 1 and 12, before the first devnet deploy): `MAX_ADAPTERS` pinned (8); `Caps`, `PriceParams`, `ExitParams` carry their tails; every status is a `u8` constant (including the five `Guarantee` states, the claim categories and `Payout.flags`); every account has `version`, `bump` and `_reserved`; the event set (including `ConfigUpdated`'s final form) and the error list are final for append-only use.

**Reserved seed prefixes** — no pilot PDA may use them: `"exit_buffer"`, `"exit_limit"`, `"instant_exit"`, `"adapter_state"` (per-adapter price feed and position, ADR 0018). (`"notice"` is used by the pilot `ClaimNotice`, and `"income"` by the pilot `IncomeReceipt`, ADR 0017.) If padding ever runs out, new state goes in a new PDA (`["instant_exit", config]`), loaded as optional by code that runs before it exists.

**Realloc** (Anchor `realloc`, `Migration<From, To>`) is an emergency fallback for the singletons only. It cannot reach per-user accounts that are live at upgrade time, such as pending `RedeemRequest`s.

### 14.3 Feature flags

- `VaultConfig.feature_flags: u64`, bit 0 `INSTANT_EXIT`; other bits reserved. The pilot's `SUPPORTED_FEATURES = 0`.
- `set_config` rejects any bit outside `SUPPORTED_FEATURES` (`FeatureNotSupported`). Code paths for unsupported features do not exist in the binary.
- Turning a feature on takes **two separate timelocked proposals**: (1) the program upgrade that adds the feature to `SUPPORTED_FEATURES`, then, after an observation period with the code live and the feature off, (2) `set_config` that sets the bit (which validates the feature's parameters).
- Clearing a bit is always allowed. Combined with the pauser's untimelocked `pause`, it is the fast way to stop a feature. Clearing `INSTANT_EXIT` also makes `earmark_eff = 0` at once (§4), so the earmark returns to free capital without a separate defund, and the next ratcheting instruction stores `0`.

### 14.4 Client and IDL compatibility

| Change | Allowed? |
|---|---|
| New instruction, account type, event or error (appended) | Yes. Publish the client as a minor version |
| Field carved from `_reserved` | Yes. Size and offsets of existing fields unchanged; regenerate the client |
| Changing an existing instruction's args or accounts | **No.** Add a `_v2` instruction |
| Changing an existing event's fields | **No.** Add a new event |
| Reordering, retyping or removing fields or errors; changing an account's size | **No** |

- The IDL lives in a Program Metadata account written by the upgrade authority, so it is written inside the same Squads proposal as the upgrade.
- CI adds an `idl-compat` job from the first tagged release: it diffs `target/idl/mutav.json` against the last released IDL and fails on any change in the "No" rows.
- The mutav-app indexer skips unknown event discriminators and decodes accounts by discriminator, not by `dataSize` alone.

### 14.5 Upgrade runbook

**Before the PR merges.** ADR and spec update in the same PR. New fields carved from `_reserved`, new instructions added, `SUPPORTED_FEATURES` extended, and **no diff** in the `pay_claim` path. CI green: layout and fixture tests (§14.7), padding preservation, `idl-compat`, Codama regenerated with no diff, the full LiteSVM suite, Mollusk CU benchmarks. Review or audit of the diff. Client published as a minor version, and mutav-app deploys decoders that tolerate the new fields and events **before** the program changes.

**Rehearsal.** Surfpool fork of the live cluster: deploy the new `.so` over the forked program and run `tests-fork` against real accounts, including pending `RedeemRequest`s (decode, cancel, fill, claim). Then the full flow on devnet with the same Squads threshold and time lock, end to end through `apps/admin`.

**Build and buffer.**
1. `solana-verify build` in the x86 release workflow; record `solana-verify get-executable-hash target/deploy/mutav.so`.
2. `solana program show <PROGRAM_ID>`: if ProgramData is smaller than the new `.so`, it must be extended. Check the target cluster's feature set: where loader-v3 `ExtendProgramChecked` (SIMD-0164) is active, extending needs the upgrade authority's signature, so the extend instruction (signed by the upgrade-authority vault) goes **first in the same bundled Squads vault transaction**, before `Upgrade`; only where the unchecked variant still applies may it be run beforehand by any payer. The rehearsal asserts: new `.so` larger than ProgramData ⇒ the extend instruction is in the bundle.
3. `solana program write-buffer`, then `solana program set-buffer-authority <BUFFER> --new-buffer-authority <UPGRADE_VAULT>`, where `UPGRADE_VAULT` is the vault of the multisig that is the program's upgrade authority (the upgrade multisig under §12 Q15 option (b), not the admin multisig).
4. `solana-verify get-buffer-hash <BUFFER>` must equal step 1. The proposal memo carries both hashes, the git tag and the commit.
5. Write the IDL buffer and export the verify-PDA transaction (`solana-verify export-pda-tx … --uploader <UPGRADE_VAULT>`).

**Proposal.**
6. One Squads vault transaction bundling the BPF Loader Upgradeable `Upgrade` (plus `ExtendProgramChecked` first if needed), the Program Metadata IDL write and the verify-PDA write.
7. Each signer reproduces the executable hash from the tag and checks it against the buffer hash, **and decodes every instruction in the stored vault-transaction message**: the only allowed program IDs are BPF Loader Upgradeable (`Upgrade` with the expected program, buffer and spill accounts, and `ExtendProgramChecked`), Program Metadata and the verify program; any `SetAuthority` on the program, ProgramData or buffer, or any other instruction, is a reason to reject.
8. Before approving, check the multisig: `config_authority == Pubkey::default()` (a "controlled" multisig could change members, threshold or time lock without a timelocked proposal) and `time_lock ≥` the agreed floor. Both are also checked at launch (plan Task 12) and shown on the transparency page. No Squads config change is proposed during an upgrade window, because a config change makes in-flight proposals stale. Approve. **The time lock counts from approval.** MUTAV announces the pending upgrade on the transparency page with the commit link. Members can reject or cancel during the window; the pauser can `pause` at any time.

**Execute and verify.**
9. Execute after the time lock; the program is live from the next slot.
10. `solana-verify get-program-hash` equals step 1; `solana-verify remote submit-job`; explorers show "verified".
11. Smoke checks: `refresh` succeeds; `VaultConfig` and `VaultState` decode with the new client and every carved field reads zero; `buffer_earmark == 0`; `instant_redeem` fails with `FeatureDisabled`.

**Enable (separate, later proposals, each timelocked).**
12. `set_config` with `ExitParams` (conservative caps) and `exit.allowlist_root`; confirm every known missed rent is flagged (notices exist since the pilot).
13. `set_config` setting `INSTANT_EXIT`. Then `fund_exit_buffer` runs whenever the queue is empty.
14. Monitor events; raise caps gradually through further proposals.

### 14.6 Rollback

- **Fast:** the pauser runs `pause` (no time lock), which stops instant exit with the other capital flows; the operator may `defund_exit_buffer` at once; an admin proposal then clears `INSTANT_EXIT`, which by itself returns any earmark to free capital (§14.3).
- **Slow:** a timelocked upgrade back to the previous verified `.so` (keep its artefact and hash in the release notes), in this order: `pause` → clear `INSTANT_EXIT` (and let a ratcheting instruction store `buffer_earmark = 0`) → downgrade. The downgrade proposal is approved only after checking `feature_flags == 0 && buffer_earmark == 0`; otherwise the pilot `set_config` would reject every call that keeps the bit (`FeatureNotSupported`). Safe because the phase-2 binary adds no status constants to shared accounts, the pilot binary preserves `_reserved` bytes it does not understand (R6), and R1b refuses any account a later migration rewrote. Phase-2 state stays inert.

### 14.7 Layout-stability tests (pilot)

1. **Golden layout test** (OnRe `layout_compatibility.rs` pattern): frozen v1 copies of each struct (`VaultConfigV1`, `VaultStateV1`, `RedeemRequestV1`, `HolderStateV1`, …) in `tests/layout/v1.rs`. Assert `8 + INIT_SPACE` equals the committed constant; v1 bytes decode under the current struct; a field-offset table, computed by serializing sentinel values, matches.
2. **v1 → v2 decode:** a test-only `VaultStateV2` / `VaultConfigV2` with the §13.2 fields carved from `_reserved` decodes v1 bytes, every carved field reads zero, and every v1 field keeps its value and offset.
3. **Live fixtures:** at devnet and mainnet launch, dump live accounts into `tests/fixtures/layout/v1/` and decode them in CI.
4. **Padding preservation:** for every instruction, inject random bytes into `_reserved` with LiteSVM `set_account`, run it, and assert they are unchanged.
5. **Padding zero at init:** every `init` leaves `_reserved` all zero.
6. **Feature flags fail closed:** `set_config` with `INSTANT_EXIT` or any undefined bit fails `FeatureNotSupported`.
7. **Earmark at 0 and injected:** invariants 13–17 of §4, with the earmark injected both with `INSTANT_EXIT` clear (no effect) and set (capacity shrinks; sequential fills never consume it).
8. **Version guard:** an account injected with `version = 2` is refused with `UnsupportedVersion` by every pilot instruction that reads it; an unknown status constant is refused the same way.

---

## 15. Glossary

The program, the client and this spec use English protocol terms. Contracts, the fiança instrument and the pt-BR UI use the legal terms in the right-hand column. They never use insurance vocabulary, because MUTAV's guarantee is a fiança onerosa (Lei 8.245/91 art. 37 II) and not seguro-fiança (art. 41) (ADR 0012). The mapping is one-to-one, so a UI string can always be traced to a program field.

| English (protocol) | pt-BR (contract and UI) | Never use in pt-BR | Meaning |
|---|---|---|---|
| Guarantee | Fiança; garantia locatícia | Apólice, seguro | One limited fiança onerosa per lease (`Guarantee` account) |
| Cover (`default_cover + exit_cover`) | **Valor afiançado**; **limite da fiança** | Cobertura, importância segurada | The R$ ceiling of the fiança, accessories included (CC 823) |
| Default leg / exit leg | Sublimite para aluguéis e encargos em atraso / sublimite para débitos de saída | Cobertura de inadimplência, cobertura de saída | The two sub-limits inside the one ceiling |
| Remaining cover | Saldo do valor afiançado | Cobertura restante | `remaining_cover(g)` |
| Claim; claim notice | **Pedido de pagamento**; aviso de atraso | Sinistro, aviso de sinistro | A request from the agency, on the landlord's behalf, for MUTAV to pay a guaranteed debt (`ClaimFiling`, `ClaimNotice`) |
| Claim payment; payout | **Pagamento** (pela fiadora) | Indenização | `pay_claim`, `pay_claim_admin`, `Payout` |
| Complete payment request | Pedido de pagamento completo | — | Starts the contractual payment term (`request_complete_ts`) |
| Claim category | Débito garantido (categoria) | Risco coberto | §3.13 |
| Guarantee fee | **Taxa da fiança**; **taxa de garantia** | Prêmio | Paid by the tenant (`contribute_fees`) |
| Issuer income; issuer partnership revenue | Receita de parceria com o emissor | Rendimento do fundo, juros da reserva | Nora's monthly BRS revenue share, swept from the income inbox (`sweep_income`, ADR 0017). Never part of the guarantee fee |
| Settlement | Repasse; quitação | — | `settle_payout`: PIX to the agency and the landlord's receipt |
| Landlord mandate | Mandato (procuração) do locador à imobiliária para receber e dar quitação | — | `landlord_mandate_hash` |
| Exoneration | Exoneração da fiadora | Cancelamento da apólice | `notify_exoneration`; liable for 120 more days (LI 40 X) |
| Keys returned | Entrega das chaves; imissão na posse | — | `record_keys_returned` (LI 39, 66) |
| Exhausted | Valor afiançado esgotado; extinção da fiança | Perda total | `EXHAUSTED` |
| Claims tail | Prazo para pedidos de pagamento após o término | — | `claims_tail_secs`, `claims_tail_until_ts` |
| Principal payer; waiver of the benefit of order | Principal pagadora; renúncia ao benefício de ordem | — | CC 827–828 |
| Recovery | Sub-rogação; cobrança regressiva | Salvado, ressarcimento de sinistro | CC 831–833 |
| Reserve | Reserva | Fundo, provisão técnica | The program's assets |
| Under-coverage mode | Reserva abaixo da meta; suporte da MUTAV ativo | Insolvente, descoberto | `MODE_UNDER_COVERED` (§6) |
| MUTAV backstop | Compromisso de suporte da MUTAV | Resseguro | `backstop_amount`, `backstop_commitment_hash` |
