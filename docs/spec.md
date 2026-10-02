# MUTAV reserve program — specification

*Status: draft for the pilot build, 2026-10-01. Derived from the MUTAV project document (§2–§7), the adversarial review and the mutav-app operations review. This file is the source of truth for the program's business rules. Any change to economic behaviour needs an ADR in [`decisions/`](decisions/).*

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
   - The program's accounting is internal: it tracks the amounts it moved, not raw token-account balances, so a direct transfer into a reserve account does not move NAV.
   - The remaining trust in issuer backing (Nora for BRS, Etherfuse for TESOURO) is disclosed, not hidden.
3. **MUTAV operates every chain touchpoint.** Agencies, tenants and landlords never sign on-chain. The operator key is the only writer for guarantees, claims and payouts.
4. **The solvency gate protects the reserve. It never stops a claim payment.** It gates capital moving in and out, allocations, and new guarantees. `pay_claim` is never solvency-gated.
5. **No arbitrary outflows.** Reserve funds leave only to (a) investor claim escrows on fulfilled redemptions, (b) the whitelisted MUTAV payments account, or (c) a whitelisted adapter's capped sub-authority.
6. **Bound risk with caps and start tight.** Every outflow and every new liability is capped on-chain. Admins raise caps as the pilot proves itself.

## 2. Roles and keys

| Role | Key | May call |
|---|---|---|
| **Admin** | Squads v4 multisig vault, with a Squads time lock | `initialize`, `set_config`, `set_roles`, `set_payments_account`, `set_allowlist_root`, `whitelist_adapter`, `remove_adapter`, `unpause`, `fulfil_deposits`, `fulfil_redeems`, `allocate`, `deallocate`. Also the program's upgrade authority |
| **Operator** | Hot key held by mutav-app in KMS, used from Convex actions | `register_guarantee`, `close_guarantee`, `contribute_fees`, `file_claim`, `pay_claim`, `settle_payout` |
| **Pauser** | Separate key | `pause`, `revoke_operator` |
| **Investor** | Own wallet, on the allowlist (KYC done off-chain) | `request_deposit`, `cancel_deposit`, `claim_shares`, `request_redeem`, `cancel_redeem`, `claim_assets` |
| **Anyone** | — | `refresh` |

- The time lock is the Squads time lock on the admin multisig. Every admin action is time-locked except `pause` (pauser). Whether the program also enforces its own on-chain delay for privilege increases is **TBD**.
- Roles are distinct keys. `set_roles` rejects a configuration where the operator or pauser equals the admin.
- The pauser can revoke the operator immediately (`revoke_operator`). Appointing the replacement operator is an admin action (`set_roles`). Whether the pauser may also appoint the replacement is **TBD**.

## 3. Accounts

All program-owned accounts carry `version: u8`, `bump: u8` and a `_reserved` padding array so later layouts can migrate without re-initialization.

### 3.1 `VaultConfig`

Seeds: `["config", reserve_mint]`. One per reserve. Written only by admin instructions.

| Field | Type | Meaning |
|---|---|---|
| `version`, `bump` | `u8`, `u8` | |
| `admin` | `Pubkey` | Squads vault address |
| `operator` | `Pubkey` | Operator key. `Pubkey::default()` when revoked |
| `pauser` | `Pubkey` | Pauser key |
| `reserve_mint` | `Pubkey` | BRS mint. **Immutable after `initialize`** |
| `reserve_token_program` | `Pubkey` | Token program owning `reserve_mint`. Immutable |
| `reserve_decimals` | `u8` | Immutable |
| `share_mint` | `Pubkey` | Share mint (authority = vault authority PDA) |
| `coverage_ratio_bps` | `u16` | `c`. Starts at `10_000` (1.0). Lower bound **TBD** (see PC-14) |
| `fee_take_bps` | `u16` | MUTAV's take from each guarantee fee. `≤ MAX_FEE_TAKE_BPS = 3_000`. Value **TBD** |
| `payments_account` | `Pubkey` | The whitelisted MUTAV payments token account (BRS) |
| `treasury_account` | `Pubkey` | The whitelisted MUTAV treasury token account (BRS) that receives MUTAV's take. Changed only by the admin through the timelock |
| `investor_allowlist_root` | `[u8; 32]` | Merkle root of allowlisted investor wallets |
| `adapters` | `[AdapterEntry; MAX_ADAPTERS]` | Whitelisted adapters ([§3.9](#39-adapterentry)) |
| `caps` | `Caps` | See [§8](#8-caps) |
| `price` | `PriceParams` | See [§7](#7-price-safety) |
| `payout_sla_secs` | `i64` | Settlement SLA for payouts. Proposed 10 days |
| `paused` | `bool` | Global pause flag. Granular flags **TBD** (PC-24) |
| `_reserved` | `[u8; 128]` | |

### 3.2 `VaultState`

Seeds: `["state", config]`. Internal accounting. Written by every state-changing instruction; recomputed by `refresh`.

| Field | Type | Meaning |
|---|---|---|
| `version`, `bump` | `u8`, `u8` | |
| `mode` | `enum Mode { Normal, UnderCovered }` | [§6](#6-under-coverage-mode) |
| `brs_balance` | `u64` | Tracked BRS in `reserve` (internal accounting) |
| `tesouro_units` | `u64` | Tracked TESOURO held through adapters, in TESOURO base units |
| `tesouro_price` | `u64` | Last bounded TESOURO price, BRS base units per 1 TESOURO (scaled by `PRICE_SCALE`) |
| `tesouro_price_ts` | `i64` | Publish time of the price source used |
| `stable_assets` | `u64` | Last computed `stable_assets` ([§4](#4-invariants-and-formulas)) |
| `remaining_cover_total` | `u64` | `Σ` remaining cover of all active guarantees (before applying `c`) |
| `coverage_required` | `u64` | `c × remaining_cover_total`, rounded up |
| `provisions` | `u64` | `Σ` open claim provisions |
| `shares_outstanding` | `u64` | Minted shares plus shares owed on fulfilled, unclaimed deposits |
| `nav_per_share` | `u64` | Last published NAV per share (scaled by `NAV_SCALE`) |
| `pending_deposits_total` | `u64` | BRS in `pending_deposits`. Excluded from `stable_assets` |
| `pending_redeem_shares` | `u64` | Shares in `pending_redemptions`. Counted in `shares_outstanding` until fulfilled (confirm, §12) |
| `claimable_assets_total` | `u64` | BRS in `claims` awaiting `claim_assets`. Excluded from `stable_assets` |
| `active_guarantees` | `u32` | |
| `next_deposit_seq`, `deposit_head` | `u64`, `u64` | FIFO sequence and head of the deposit queue |
| `next_redeem_seq`, `redeem_head` | `u64`, `u64` | FIFO sequence and head of the redemption queue |
| `claim_period_start` | `i64` | Start of the current claim-payment cap window |
| `claim_period_paid` | `u64` | Paid in the current window |
| `fees_in_total`, `fee_take_total` | `u64`, `u64` | Lifetime net fees into the reserve; lifetime take sent to the treasury |
| `claims_paid_total` | `u64` | Lifetime claim payments |
| `late_payouts` | `u32` | Payouts pending past the SLA, as last counted by `refresh` |
| `fulfil_halted` | `bool` | Set when the NAV-move guard trips ([§7](#7-price-safety)) |
| `last_refresh_ts`, `last_refresh_slot` | `i64`, `u64` | |
| `_reserved` | `[u8; 128]` | |

### 3.3 Vault authority and token accounts

- **Vault authority**: PDA `["authority", config]`, no data. Owns every reserve token account and is the share mint's mint authority. It is never passed as a signer into an adapter CPI.
- **Token accounts** (each a PDA owned by the vault authority, so one issuer freeze does not trap every balance):

| Account | Seeds | Mint | Holds |
|---|---|---|---|
| `reserve` | `["reserve", config]` | BRS | The liquid reserve |
| `pending_deposits` | `["pending_deposits", config]` | BRS | Escrowed deposit requests |
| `pending_redemptions` | `["pending_redemptions", config]` | share | Escrowed redeem requests |
| `claims` | `["claims", config]` | BRS | Assets owed to investors on fulfilled redemptions |

TESOURO is held in each adapter's own staging/position accounts under the adapter's sub-authority ([§3.9](#39-adapterentry)), not by the vault authority.

### 3.4 `AgencyExposure` *(derived)*

Seeds: `["agency", config, agency_id]`. Created on the agency's first `register_guarantee`. Needed to enforce the per-agency cap.

| Field | Type |
|---|---|
| `agency_id` | `[u8; 32]` (stable public reference issued by the MUTAV platform) |
| `outstanding_cover` | `u64` (`Σ` remaining cover of this agency's active guarantees) |
| `active_guarantees` | `u32` |
| `claims_paid_total` | `u64` |

### 3.5 `Guarantee`

Seeds: `["guarantee", config, id]`. One per lease: a second registration with the same `id` fails at account creation.

| Field | Type | Meaning |
|---|---|---|
| `id` | `[u8; 32]` | Guarantee reference from the platform. Derivation (e.g. an HMAC of the lease identity) is off-chain |
| `agency_id` | `[u8; 32]` | |
| `refs_hash` | `[u8; 32]` | Commitment to the lease, guarantee contract and landlord mandate |
| `rent` | `u64` | Monthly rent at registration (display and audit) |
| `default_multiplier_bps` | `u16` | Display only (e.g. `30_000` = 3× rent). Never used in maths |
| `exit_multiplier_bps` | `u16` | Display only |
| `default_cover` | `u64` | Absolute default (rent-arrears) cover |
| `exit_cover` | `u64` | Absolute exit (property-recovery) cover |
| `default_paid` | `u64` | |
| `exit_paid` | `u64` | |
| `provision_default` | `u64` | Open provisions on the default leg |
| `provision_exit` | `u64` | Open provisions on the exit leg |
| `open_claims` | `u16` | Filed, unpaid claims |
| `status` | `enum GuaranteeStatus { Active, Closed }` | Richer lifecycle **TBD** (PC-6) |
| `registered_at` | `i64` | |
| `closed_at` | `i64` | `0` while active |

`provision = provision_default + provision_exit`. The account is kept after closing so the public claims history stays readable. Whether and when it may be closed for rent is **TBD**.

### 3.6 `ClaimFiling` *(derived)*

Seeds: `["claim", guarantee, notice_ref_hash]`. Created by `file_claim`. It carries the provision so that `pay_claim` can release it and so that the program can refuse to close a guarantee with an open claim.

| Field | Type |
|---|---|
| `guarantee` | `Pubkey` |
| `leg` | `enum Leg { Default, Exit }` |
| `notice_ref_hash` | `[u8; 32]` |
| `provision` | `u64` |
| `filed_at` | `i64` |
| `status` | `enum ClaimStatus { Filed, Paid }` (a "Released" state for withdrawn claims is **TBD**) |

### 3.7 `Payout`

Seeds: `["payout", guarantee, notice_ref_hash]`. Created by `pay_claim`. The seed makes payment **idempotent per notice**.

| Field | Type | Meaning |
|---|---|---|
| `guarantee` | `Pubkey` | |
| `leg` | `Leg` | |
| `amount` | `u64` | |
| `notice_ref_hash` | `[u8; 32]` | |
| `payments_account` | `Pubkey` | Destination at payment time |
| `status` | `enum PayoutStatus { Pending, Settled }` | |
| `paid_at` | `i64` | |
| `pix_e2e_hash` | `[u8; 32]` | Hash of the PIX end-to-end ID. Zero while pending |
| `settled_at` | `i64` | `0` while pending |
| `late` | `bool` | Set by `refresh` or `settle_payout` when settlement exceeded the SLA |

### 3.8 `DepositRequest` and `RedeemRequest`

Seeds: `["deposit", config, seq]` and `["redeem", config, seq]`, `seq: u64` taken from `VaultState`. Closed (rent to the owner) on claim or cancel.

| Field | `DepositRequest` | `RedeemRequest` |
|---|---|---|
| `owner` | `Pubkey` | `Pubkey` |
| `seq` | `u64` (FIFO position) | `u64` (FIFO position) |
| amount in | `assets: u64` (BRS) | `shares: u64` |
| amount out | `shares_out: u64` (set at fulfil) | `assets_out: u64` (set at fulfil) |
| `nav_at_fulfil` | `u64` | `u64` |
| `requested_at`, `fulfilled_at` | `i64`, `i64` | `i64`, `i64` |
| `status` | `enum RequestStatus { Pending, Fulfilled }` | same |

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

---

## 4. Invariants and formulas

```text
tesouro_value      = tesouro_units × bounded_tesouro_price / PRICE_SCALE           // round down
stable_assets      = brs_balance + tesouro_value                                   // internal accounting
                     // excludes pending_deposits_total and claimable_assets_total
remaining_cover(g) = (g.default_cover − g.default_paid) + (g.exit_cover − g.exit_paid)
remaining_cover_total = Σ_{g active} remaining_cover(g)
coverage_required  = ceil(c × remaining_cover_total / 10_000)                      // c = coverage_ratio_bps
free_capital       = max(0, stable_assets − coverage_required)
net_assets         = stable_assets − provisions                                    // saturating at 0
NAV/share          = net_assets / shares_outstanding                               // pending deposits and redemptions excluded
```

**Share conversion** (virtual offset `V = 10^k`, `k` **TBD**, against first-depositor inflation):

```text
shares_for(assets) = floor(assets × (shares_outstanding + V) / (net_assets + 1))     // deposit: round down
assets_for(shares) = floor(shares × (net_assets + 1) / (shares_outstanding + V))     // redeem: round down
```

**Invariants** (asserted in tests after every instruction):

1. `stable_assets` uses only tracked balances and the bounded price, never raw token balances or unverifiable inputs.
2. For every guarantee: `default_paid ≤ default_cover`, `exit_paid ≤ exit_cover`, `provision_default ≤ default_cover − default_paid`, `provision_exit ≤ exit_cover − exit_paid`.
3. `remaining_cover_total = Σ remaining_cover(g)` over active guarantees; `provisions = Σ` open `ClaimFiling.provision`.
4. Token-account balances are at least the tracked amounts: `reserve ≥ brs_balance`, `pending_deposits ≥ pending_deposits_total`, `claims ≥ claimable_assets_total`.
5. `share_mint.supply + Σ shares_out of fulfilled, unclaimed deposits = shares_outstanding`. Shares escrowed in `pending_redemptions` are still minted, so they stay in `shares_outstanding` until `fulfil_redeems` burns them (see §12, NAV denominator).
6. A provision reduces NAV only. It never reduces `stable_assets`, so nothing is counted twice against coverage: a filed-but-unpaid claim is already inside `remaining_cover_total`.
7. Paying a claim reduces `stable_assets` and `remaining_cover_total` by the same amount. At `c = 1.0` it leaves `free_capital` unchanged.

**Gated on `free_capital` (and `mode == Normal`):** `register_guarantee`, `fulfil_redeems`, `allocate`, `deallocate` (with the under-coverage exception in [§6](#6-under-coverage-mode)).

**Never solvency-gated:** `pay_claim`, `file_claim`, `settle_payout`, `contribute_fees`, `fulfil_deposits`, `close_guarantee`, investor `cancel_*` and `claim_*`, `refresh`.

---

## 5. Instructions

Each instruction lists its signer, main accounts, arguments, rules (checked in this order) and effects. Every instruction that reads `stable_assets` requires a non-stale TESOURO price when `tesouro_units > 0` ([§7](#7-price-safety)), except `pay_claim`.

### 5.1 Admin and roles

#### `initialize(params)`

- **Signer:** the program's upgrade authority (checked against `ProgramData`), so no one can front-run initialization. `params.admin` is the Squads vault.
- **Accounts:** `config` (init), `state` (init), vault authority, `reserve_mint`, `share_mint` (init, authority = vault authority, 6 decimals), the five token accounts (init), token programs, system program.
- **Rules:** `reserve_mint` passes the mint guard: if Token-2022, reject `PermanentDelegate`, `TransferHook`, non-zero `TransferFee`, `NonTransferable`, `DefaultAccountState = Frozen` (PC-19). `fee_take_bps ≤ 3_000`. Roles distinct. Caps within program bounds.
- **Effects:** writes `VaultConfig` and an empty `VaultState`. Whether a seed deposit is minted to a dead address at init is **TBD**.
- **Errors:** `Unauthorized`, `UnsupportedMintExtension`, `InvalidParameter`, `RolesNotDistinct`.
- **Event:** `VaultInitialized`.

#### `set_config(params)`

- **Signer:** admin. **Rules:** same bounds as `initialize`. `reserve_mint`, token program and decimals cannot change. **Events:** `ConfigUpdated { field, old, new }` per changed field.

#### `set_roles(operator, pauser)`

- **Signer:** admin. **Rules:** distinct from admin and each other. **Event:** `RolesUpdated`.

#### `set_payments_account(token_account)`

- **Signer:** admin. **Rules:** token account mint = `reserve_mint`. Owner is MUTAV's payments wallet (off-chain fact; the program records the account). **Event:** `PaymentsAccountUpdated`.

#### `set_allowlist_root(root)`

- **Signer:** admin. **Event:** `AllowlistRootUpdated`.

#### `whitelist_adapter(program_id, asset_mint, cap)` / `remove_adapter(program_id)`

- **Signer:** admin. **Rules:** `remove_adapter` requires `allocated == 0`. Pinning the adapter's deployed slot and upgrade authority (PC-27) is **TBD**. **Events:** `AdapterWhitelisted`, `AdapterRemoved`.

#### `pause()` / `unpause()`

- **Signer:** `pause`: pauser or admin, no time lock. `unpause`: admin.
- **Effects:** sets `config.paused`. While paused, these are rejected: capital flows (`request_*`, `fulfil_*`), new guarantees, `contribute_fees` and `allocate`/`deallocate`. **These stay open** (ADR 0008): `pay_claim`, `file_claim`, `settle_payout`, `close_guarantee`, `refresh`, and investor `cancel_*` and `claim_*`. Claims are never blocked.
- **Events:** `Paused { by }`, `Unpaused`.

#### `revoke_operator()`

- **Signer:** pauser or admin. **Effects:** `config.operator = Pubkey::default()`; operator instructions fail until `set_roles` appoints a new key. **Event:** `OperatorRevoked`.

### 5.2 Guarantees (operator)

#### `register_guarantee(id, agency_id, refs_hash, rent, default_multiplier_bps, exit_multiplier_bps, default_cover, exit_cover)`

- **Signer:** operator.
- **Accounts:** `config`, `state`, `guarantee` (init), `agency_exposure` (init-if-needed), payer.
- **Rules:**
  1. Not paused; `mode == Normal`.
  2. `default_cover + exit_cover > 0`; `rent > 0`.
  3. `default_cover + exit_cover ≤ caps.max_cover_per_guarantee`.
  4. `agency.outstanding_cover + default_cover + exit_cover ≤ caps.max_cover_per_agency`.
  5. **Solvency post-condition:** `ceil(c × (remaining_cover_total + new_cover)) ≤ stable_assets`, i.e. the new cover fits in `free_capital`.
- **Effects:** creates `Guarantee { status: Active }`; `remaining_cover_total += new_cover`; recompute `coverage_required`; `active_guarantees += 1`; agency `outstanding_cover += new_cover`, `active_guarantees += 1`.
- **Errors:** `Paused`, `UnderCovered`, `InvalidParameter`, `GuaranteeCapExceeded`, `AgencyCapExceeded`, `InsufficientFreeCapital`, `StalePrice`; account-already-in-use on a duplicate `id`.
- **Event:** `GuaranteeRegistered { id, agency_id, refs_hash, rent, default_cover, exit_cover }`.

#### `close_guarantee(id)`

- **Signer:** operator.
- **Rules:** `status == Active`; `open_claims == 0`.
- **Effects:** `remaining_cover_total −= remaining_cover(g)`; agency `outstanding_cover −= remaining_cover(g)`; counts decremented; `status = Closed`, `closed_at = now`. Not solvency-gated (it releases liability).
- **Errors:** `GuaranteeNotActive`, `OpenClaims`.
- **Event:** `GuaranteeClosed { id, released_cover }`.

### 5.3 Guarantee fees (operator)

#### `contribute_fees(invoice_ref_hash, amount)`

- **Signer:** operator, who also signs the BRS transfer from its own BRS token account (fees reach it via PIX → BRS mint off-chain). Batched per invoice.
- **Rules:** `amount > 0`; source mint = `reserve_mint`.
- **Effects:** `take = floor(amount × fee_take_bps / 10_000)`; transfer `take` → `config.treasury_account` (directly; the program holds no fee balance); transfer `amount − take` → `reserve`; `brs_balance += amount − take`; `fees_in_total += amount − take`; `fee_take_total += take`. NAV rises immediately. Streaming fees into NAV (PC-15) is **not adopted**; see §12. Per-invoice idempotency on-chain is **TBD**.
- **Errors:** `Paused` (if fees are pausable, TBD), `InvalidParameter`, `InvalidMint`.
- **Event:** `FeesContributed { invoice_ref_hash, gross, take, net }`.

### 5.4 Claims and payouts (operator)

#### `file_claim(leg, amount, notice_ref_hash)`

- **Signer:** operator, after MUTAV has verified and approved the claim in the platform. The agency's 15-day filing window is enforced in the platform; an on-chain check (PC-2) is **TBD**.
- **Accounts:** `guarantee`, `claim_filing` (init), `state`.
- **Rules:** guarantee `Active`; `amount > 0`; `amount ≤ (leg_cover − leg_paid − leg_provision)`.
- **Effects:** creates `ClaimFiling { status: Filed, provision: amount, filed_at: now }`; `leg_provision += amount`; `open_claims += 1`; `state.provisions += amount`. NAV reflects the claim immediately. Not solvency-gated.
- **Errors:** `GuaranteeNotActive`, `InvalidParameter`, `ExceedsRemainingCover`; account-already-in-use on a duplicate notice.
- **Event:** `ClaimFiled { guarantee_id, leg, amount, notice_ref_hash }`.

#### `pay_claim(leg, amount, notice_ref_hash)`

- **Signer:** operator.
- **Accounts:** `config`, `state`, `guarantee`, `claim_filing`, `payout` (init), `reserve`, `payments_account`, vault authority, BRS mint, token program.
- **Rules:**
  1. `claim_filing.status == Filed` and `claim_filing.leg == leg`.
  2. `amount > 0`; `amount ≤ leg_cover − leg_paid` (remaining cover on the leg).
  3. `amount ≤ caps.max_claim_per_call`.
  4. Roll the window if `now ≥ claim_period_start + caps.claim_period_secs`; then `claim_period_paid + amount ≤ caps.max_claim_per_period`.
  5. Destination equals `config.payments_account`.
  6. `brs_balance ≥ amount` (liquid BRS). TESOURO is not sold implicitly.
  7. **No solvency check. No `mode` check.** A property test asserts that `pay_claim` is never refused because of solvency or under-coverage.
- **Effects:** transfer `amount` BRS `reserve` → `payments_account` (signed by vault authority); `leg_paid += amount`; release the filing's whole provision (`leg_provision −= filing.provision`, `state.provisions −= filing.provision`); `open_claims −= 1`; `filing.status = Paid`; `brs_balance −= amount`; `remaining_cover_total −= amount`; `claim_period_paid += amount`; `claims_paid_total += amount`; agency `outstanding_cover −= amount`, `claims_paid_total += amount`; create `Payout { status: Pending, paid_at: now }`.
- **Idempotency:** a second `pay_claim` for the same notice fails at `Payout` creation.
- **Errors:** `ClaimNotFiled`, `LegMismatch`, `ExceedsRemainingCover`, `ClaimCallCapExceeded`, `ClaimPeriodCapExceeded`, `InvalidPaymentsAccount`, `InsufficientLiquidBalance`, `ReserveFrozen`.
- **Event:** `ClaimPaid { guarantee_id, leg, amount, notice_ref_hash, payments_account }`.

#### `settle_payout(notice_ref_hash, pix_e2e_hash)`

- **Signer:** operator, after MUTAV has offramped BRS→BRL and paid the agency by PIX.
- **Rules:** `payout.status == Pending`; `pix_e2e_hash != [0; 32]`.
- **Effects:** `status = Settled`; `settled_at = now`; `late = settled_at > paid_at + payout_sla_secs`.
- **Errors:** `PayoutAlreadySettled`, `InvalidParameter`.
- **Event:** `PayoutSettled { guarantee_id, notice_ref_hash, pix_e2e_hash, late }`.

### 5.5 Investor capital (async)

Investors are allowlisted: every `request_*` carries a Merkle proof of `owner` against `investor_allowlist_root`. Request-size limits are enforced (`caps.min_request`, `caps.max_request`; values **TBD**).

#### `request_deposit(assets, proof)` / `cancel_deposit()` / `claim_shares()`

- **Signer:** investor.
- **`request_deposit`:** not paused; allowlisted; size within limits. Transfer `assets` BRS investor → `pending_deposits`; create `DepositRequest { seq: next_deposit_seq++, status: Pending }`; `pending_deposits_total += assets`. Escrowed funds are excluded from `stable_assets` and solvency until fulfilled. **Event:** `DepositRequested`.
- **`cancel_deposit`:** owner; `status == Pending`. Refund BRS; close the request. Never pausable. **Event:** `DepositCancelled`.
- **`claim_shares`:** owner; `status == Fulfilled`. Mint `shares_out` to the owner's share token account; close the request. Never pausable. **Event:** `SharesClaimed`.
- **Errors:** `NotAllowlisted`, `RequestTooSmall`, `RequestTooLarge`, `InvalidRequestStatus`, `Paused`.

#### `fulfil_deposits(count)`

- **Signer:** admin.
- **Accounts:** the next `count` `DepositRequest` accounts in **strict FIFO** `seq` order, starting at `deposit_head`. Cancelled sequences are skipped, and no pending request is ever skipped.
- **Rules:** not paused; `fulfil_halted == false`; price fresh; `stable_assets + Σ assets ≤ caps.max_tvl`. Deposits **may** be fulfilled in under-coverage mode. They add capital and are the recapitalization path; the new depositor buys at the NAV, which already reflects the loss (ADR 0008).
- **Effects (per request, in order):** price at the NAV at fulfil: `shares_out = shares_for(assets)`; transfer BRS `pending_deposits` → `reserve`; `brs_balance += assets`; `pending_deposits_total −= assets`; `shares_outstanding += shares_out`; `status = Fulfilled`; advance `deposit_head`.
- **Errors:** `Unauthorized`, `Paused`, `FulfilHalted`, `StalePrice`, `TvlCapExceeded`, `QueueOrderViolation`.
- **Event:** `DepositsFulfilled { from_seq, to_seq, assets, shares, nav }`.

#### `request_redeem(shares, proof)` / `cancel_redeem()` / `claim_assets()`

- **`request_redeem`:** investor; not paused; allowlisted; size within limits. Transfer `shares` → `pending_redemptions`; create `RedeemRequest { seq: next_redeem_seq++ }`; `pending_redeem_shares += shares`. **Event:** `RedeemRequested`.
- **`cancel_redeem`:** owner; `Pending`. Return shares; close. Never pausable. Queue-position and cooldown semantics (PC-29) are **TBD**. **Event:** `RedeemCancelled`.
- **`claim_assets`:** owner; `Fulfilled`. Transfer `assets_out` from `claims` to the owner's BRS account (owner and mint checked); `claimable_assets_total −= assets_out`; close. Never pausable. A frozen destination leaves the request `Fulfilled` and claimable later. **Event:** `AssetsClaimed`.

#### `fulfil_redeems(count)`

- **Signer:** admin.
- **Accounts:** the next `count` `RedeemRequest` accounts in strict `seq` order from `redeem_head`.
- **Rules:** not paused; `mode == Normal`; `fulfil_halted == false`; price fresh. **Strict FIFO:** requests are processed from the head and never skipped. For each request, `assets_out = assets_for(shares)` at the NAV at fulfil, and `assets_out ≤ free_capital` (recomputed after each fill) and `assets_out ≤ brs_balance`. The first request that does not fit stops the batch. Partial fills at the head (PC-29) are **TBD**. There is no weekly cap.
- **Effects (per request):** burn the escrowed shares; transfer BRS `reserve` → `claims`; `brs_balance −= assets_out`; `claimable_assets_total += assets_out`; `shares_outstanding −= shares`; `pending_redeem_shares −= shares`; `status = Fulfilled`; advance `redeem_head`.
- **Errors:** `Unauthorized`, `Paused`, `UnderCovered`, `FulfilHalted`, `StalePrice`, `InsufficientFreeCapital`, `InsufficientLiquidBalance`, `QueueOrderViolation`.
- **Event:** `RedeemsFulfilled { from_seq, to_seq, shares, assets, nav }`.

### 5.6 MUTAV capital

MUTAV contributes and withdraws capital through the **same async flow as every investor** (ADR 0008). MUTAV's wallet is allowlisted, and it receives shares at the NAV at fulfil and redeems them only out of `free_capital`, in strict FIFO. There is no `contribute_capital` or `withdraw_surplus` instruction.

### 5.7 Reserve allocation (admin, through adapters)

The core never passes the vault authority or the share-mint authority into a CPI. Each adapter acts only through its own capped sub-authority PDA, which owns only that adapter's staging account.

#### `allocate(adapter_program, amount)`

- **Signer:** admin.
- **Rules:** not paused; `mode == Normal`; adapter whitelisted and enabled; `allocated + amount ≤ adapter.cap`; price fresh; after the move, `tesouro_value ≤ caps.max_tesouro_share_bps × stable_assets / 10_000`; **solvency post-condition** `stable_assets_after ≥ coverage_required`, with `stable_assets_after` valued at the bounded price. Whether `amount` itself must also fit in `free_capital` is **TBD**.
- **Effects:** core transfers `amount` BRS `reserve` → adapter staging (vault-authority signed); CPI `adapter.deposit` signed by the sub-authority only; reload accounts; record the received `tesouro_units`; update `brs_balance`, `tesouro_units`, `adapter.allocated`. **Post-CPI checks:** every vault token account and the share supply are unchanged except for the expected deltas.
- **Errors:** `AdapterNotWhitelisted`, `AdapterCapExceeded`, `TesouroShareCapExceeded`, `InsufficientFreeCapital`, `UnderCovered`, `PostCpiCheckFailed`, `StalePrice`.
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
  2. Read and bound the TESOURO price ([§7](#7-price-safety)); recompute `tesouro_value`, `stable_assets`, `coverage_required`, `free_capital`, `net_assets`, `nav_per_share`.
  3. If NAV per share moved more than `price.max_nav_move_bps` since the last refresh, set `fulfil_halted = true` (cleared by admin `set_config`, TBD exact clearing path).
  4. Set `mode` ([§6](#6-under-coverage-mode)).
  5. For each passed `Payout` with `status == Pending` and `now > paid_at + payout_sla_secs`, set `late = true`; update `late_payouts`.
- **Errors:** none for stale prices: a stale price is recorded and flagged, and the gated instructions refuse to run on it.
- **Event:** `StateRefreshed { stable_assets, coverage_required, free_capital, provisions, nav_per_share, mode, tesouro_price, price_stale }`, plus `PayoutLate` per newly late payout and `ModeChanged` on a transition.

---

## 6. Under-coverage mode

- **Trigger:** `stable_assets < coverage_required`, for example after a TESOURO mark-down or an issuer freeze. Set by `refresh`, and checked inline by every gated instruction.
- **Frozen automatically:** `register_guarantee`, `fulfil_redeems`, `allocate`.
- **Restricted:** `deallocate` only if it does not worsen coverage ([§5.7](#57-reserve-allocation-admin-through-adapters)).
- **Keeps working:** `pay_claim`, `file_claim`, `settle_payout`, `contribute_fees`, `fulfil_deposits`, `close_guarantee`, `refresh`, investor `cancel_*` and `claim_*`, `request_*` (queued, not fulfilled). `fulfil_deposits` is **TBD**.
- **Alert:** a `ModeChanged { to: UnderCovered, deficit }` event, consumed by the mutav-app indexer to alert admins.
- **Exit:** `refresh` sets `mode = Normal` once `stable_assets ≥ coverage_required` again (through fees, capital contributions, a price recovery or run-off).

## 7. Price safety

- **BRS** is valued at par: 1 BRS base unit = 1 unit of value.
- **TESOURO** is valued at `min(on-chain price, accrual curve)`:
  - `on-chain price`: read from Etherfuse's on-chain price account (the `BondPrice` PDA under the stablebond program). Account layout **TBD** (Etherfuse to confirm).
  - `accrual curve`: `p0 × (1 + y_max)^((t − t0) / year)`, a ceiling from a reference price `p0` at `t0` and a maximum annual yield `y_max`, all in `PriceParams`. Values **TBD**.
  - **Staleness bound:** if the price's publish time is older than `price.max_staleness_secs`, it is stale. Gated instructions fail with `StalePrice`; `pay_claim` never reads the price. Valuing a stale price with a haircut instead (PC-17) is **TBD**.
  - **Deviation bound:** if the on-chain price moved more than `price.max_deviation_bps` against the last accepted price, it is rejected as stale until admin review.
- **NAV-move guard:** a NAV-per-share move of more than `price.max_nav_move_bps` ("X%") in one refresh sets `fulfil_halted`, which pauses `fulfil_deposits` and `fulfil_redeems`. X is **TBD**.
- Price-source changes are admin actions (time-locked).

`PriceParams` fields: `tesouro_price_account: Pubkey`, `p0: u64`, `t0: i64`, `y_max_bps: u16`, `max_staleness_secs: i64`, `max_deviation_bps: u16`, `max_nav_move_bps: u16`.

## 8. Caps

All caps live in `VaultConfig.caps` and are admin-adjustable (time-locked). Values are the proposed pilot starting points; final values are **TBD**.

| Field | Type | Enforced in | Proposed |
|---|---|---|---|
| `max_tvl` | `u64` | `fulfil_deposits` | R$100k |
| `max_cover_per_guarantee` | `u64` | `register_guarantee` | R$30k |
| `max_cover_per_agency` | `u64` | `register_guarantee` | R$60k |
| `max_claim_per_call` | `u64` | `pay_claim` | R$10k |
| `max_claim_per_period` | `u64` | `pay_claim` | R$20k |
| `claim_period_secs` | `i64` | `pay_claim` | 30 days |
| `max_tesouro_share_bps` | `u16` | `allocate` | 5_000 (min BRS buffer 50%) |
| `min_request`, `max_request` | `u64`, `u64` | `request_deposit`, `request_redeem` | TBD |
| `coverage_ratio_bps` (`c`) | `u16` | all gates | 10_000 |
| `fee_take_bps` | `u16` | `contribute_fees` | TBD, program max 3_000 |
| `payout_sla_secs` | `i64` | `refresh`, `settle_payout` | 10 days |

Program constants: `MAX_FEE_TAKE_BPS = 3_000`, `MAX_ADAPTERS` (TBD, small), `PRICE_SCALE`, `NAV_SCALE`.

## 9. Events

Emitted with `emit_cpi!` for every token movement and every state change the mutav-app indexer and the public transparency page consume. Every event carries `config: Pubkey` and `ts: i64`.

| Event | Fields (besides `config`, `ts`) |
|---|---|
| `VaultInitialized` | `admin, operator, pauser, reserve_mint, share_mint` |
| `ConfigUpdated` | `field: u8, old: u64, new: u64` |
| `RolesUpdated` / `OperatorRevoked` | `operator, pauser` / `by` |
| `PaymentsAccountUpdated` | `old, new` |
| `AllowlistRootUpdated` | `root` |
| `AdapterWhitelisted` / `AdapterRemoved` | `program_id, asset_mint, cap` |
| `Paused` / `Unpaused` | `by` |
| `GuaranteeRegistered` | `id, agency_id, refs_hash, rent, default_cover, exit_cover` |
| `GuaranteeClosed` | `id, released_cover` |
| `FeesContributed` | `invoice_ref_hash, gross, take, net` |
| `ClaimFiled` | `guarantee_id, leg, amount, notice_ref_hash` |
| `ClaimPaid` | `guarantee_id, leg, amount, notice_ref_hash, payments_account` |
| `PayoutSettled` | `guarantee_id, notice_ref_hash, pix_e2e_hash, late` |
| `PayoutLate` | `guarantee_id, notice_ref_hash, paid_at` |
| `DepositRequested` / `DepositCancelled` / `SharesClaimed` | `owner, seq, assets` / `owner, seq, assets` / `owner, seq, shares` |
| `DepositsFulfilled` | `from_seq, to_seq, assets, shares, nav` |
| `RedeemRequested` / `RedeemCancelled` / `AssetsClaimed` | `owner, seq, shares` / `owner, seq, shares` / `owner, seq, assets` |
| `RedeemsFulfilled` | `from_seq, to_seq, shares, assets, nav` |
| `CapitalContributed` / `SurplusWithdrawn` | `amount, shares` / `amount, destination` |
| `Allocated` / `Deallocated` | `adapter, brs_out, tesouro_in` / `adapter, tesouro_out, brs_in` |
| `StateRefreshed` | `stable_assets, coverage_required, free_capital, provisions, nav_per_share, mode, tesouro_price, price_stale` |
| `ModeChanged` | `from, to, deficit` |
| `ReserveFrozenDetected` | `token_account` |

## 10. Errors

`Unauthorized`, `RolesNotDistinct`, `Paused`, `InvalidParameter`, `InvalidMint`, `UnsupportedMintExtension`, `ReserveFrozen`, `UnderCovered`, `InsufficientFreeCapital`, `InsufficientLiquidBalance`, `StalePrice`, `PriceDeviation`, `FulfilHalted`, `TvlCapExceeded`, `GuaranteeCapExceeded`, `AgencyCapExceeded`, `GuaranteeNotActive`, `OpenClaims`, `ExceedsRemainingCover`, `ClaimNotFiled`, `LegMismatch`, `ClaimCallCapExceeded`, `ClaimPeriodCapExceeded`, `InvalidPaymentsAccount`, `PayoutAlreadySettled`, `NotAllowlisted`, `RequestTooSmall`, `RequestTooLarge`, `InvalidRequestStatus`, `QueueOrderViolation`, `AdapterNotWhitelisted`, `AdapterCapExceeded`, `TesouroShareCapExceeded`, `WorsensCoverage`, `PostCpiCheckFailed`, `MathOverflow`.

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
| PC-6 | Status lifecycle tied to legal release (Active → Defaulted → LeaseEnded → Settled) | Not adopted (`Active`/`Closed` only) | §12 |
| PC-7 | No fee-current precondition on claims | Adopted (no such check) | §5.4 |
| PC-8 | Exit-draw preconditions (lease-end state, evidence hash) | Not adopted | §12 |
| PC-9 | Exit deductible and per-unit cap | Not adopted | §12 |
| PC-10 | Gate scope: capital flows, new guarantees, allocations; never payouts; property test | Adopted | §1, §4, §5.4 |
| PC-11 | Under-coverage mode | Adopted | §6 |
| PC-12 | Provision booked at filing | Partial: provision = filed amount; full-leg and expected-exit terms TBD | §5.4 |
| PC-13 | Payouts senior to redemptions for the liquid buffer | Not adopted | §12 |
| PC-14 | Coverage ratio floor of 1.0 as a program constant | Not decided (`c` starts at 1.0, configurable) | §3.1, §12 |
| PC-15 | Fees streamed into NAV over 30 days | Not adopted (fees raise NAV on receipt) | §5.3, §12 |
| PC-16 | Explicit TESOURO coverage weight | Not adopted: TESOURO counts toward coverage at its bounded price, capped at 50% of the reserve | §4, §8, §12 |
| PC-17 | Bounded TESOURO price (accrual ceiling, staleness, deviation) | Adopted; stale-haircut behaviour TBD | §7 |
| PC-18 | In-transit conversion bucket for TESOURO | Not adopted | §5.7, §12 |
| PC-19 | Mint-extension check at whitelisting | Adopted | §5.1 |
| PC-20 | Split reserve token accounts; freeze detection, fail closed | Adopted (proof-of-reserves breaker and second vault are off-program) | §3.3, §5.8 |
| PC-21 | Split operator roles across separate keys | Not adopted (single operator) | §12 |
| PC-22 | Multisig above a payout threshold | Not adopted (operator pays within caps) | §12 |
| PC-23 | Guardian that can only reduce privilege | Partial: pauser pauses and revokes the operator | §2, §5.1 |
| PC-24 | Granular pause that never traps funds | Partial: `cancel_*`/`claim_*` never pausable; granular flags TBD | §5.1 |
| PC-26 | Capped sub-authority per adapter; master authority never in a CPI | Adopted | §3.9, §5.7 |
| PC-27 | Pinned adapter code and post-CPI checks | Partial: post-CPI checks adopted; slot pinning TBD | §5.7 |
| PC-28 | Request size limits | Adopted (values TBD) | §5.5, §8 |
| PC-29 | Partial head fills and cancel semantics | Not adopted (strict FIFO, whole requests) | §5.5, §12 |
| PC-30 | Queued redemptions take priority over new guarantees | Not decided | §12 |
| PC-31 | Fixed fulfil epochs with a permissionless fallback | Not adopted (admin fulfils at NAV at fulfil) | §12 |
| PC-32 | Share transfers gated to verified wallets | Not decided | §12 |
| PC-34 | MUTAV backstop disclosed on-chain | Partial: backstop is off-chain; on-chain disclosure TBD | §12 |
| PC-35 | Junior/senior share classes | Not decided | §12 |
| PC-36 | Take-rate holdback, applied prospectively | Not adopted | §12 |
| PC-37 | Per-guarantee terms bounded by config maxima | Adopted as absolute per-lease covers (ADR 0006) | §3.5, §5.2 |
| PC-38 | Agency loss-ratio gate | Not adopted (pricing tiers stay off-chain) | §12 |
| PC-40 | Public claims ledger with an SLA clock | Partial: `Payout` timestamps, SLA flag, per-agency `claims_paid_total`; other counters TBD | §3.4, §3.7, §5.8 |
| PC-42 | Only hashes and amounts on-chain | Adopted | Conventions, §3 |
| PC-43 | Hard on-chain caps | Partial: TVL, per-guarantee, per-agency, per-call, per-period and TESOURO share adopted; `max_guarantees`, concentration and new-coverage-per-period caps TBD | §8 |

## 12. Open questions

**From the project document's open items (§8) that affect the program:**

1. **Nora PDA whitelist and CPI burn.** Can a program-owned (PDA) token account be a whitelisted BRS mint destination, and is `burn` callable via CPI? This decides whether fees can be minted straight into `reserve` and whether claim payments can burn in-program, or whether both keep going through MUTAV's operator and payments wallets as specified here.
2. **TESOURO price account layout.** The layout of Etherfuse's `BondPrice` account, how the price is published and how often, and whether TESOURO is fixed-rate (LTN) or Selic-linked. This sets `PriceParams` and the accrual-curve `y_max`. Until confirmed, the adapter ships as interface + mock only.
3. **Cap values.** Final values for every cap in §8, including `min_request` / `max_request`.
4. **Take rate.** The value of `fee_take_bps` (program maximum 30%).
5. **Recoveries.** Whether recoveries flow back to the reserve (would add a `record_recovery` instruction, PC-3).
6. **BRS↔TESOURO path.** No direct path exists on Solana today (Etherfuse mints and redeems against USDC). `allocate`/`deallocate` against a real venue may need an async conversion state (PC-18).

**Raised while writing this spec:**

7. **Share treatment of MUTAV capital.** *Resolved (ADR 0008):* MUTAV uses the async flow and holds shares like any investor.
8. **`withdraw_surplus` destination.** *Resolved:* the instruction is removed (ADR 0008).
9. **Withdrawing MUTAV's take.** *Resolved (ADR 0007):* `contribute_fees` sends the take directly to the whitelisted `treasury_account`. There is no `fees` account and no `withdraw_fees`.
10. **Pause scope.** *Resolved (ADR 0008):* pause stops capital flows, new guarantees, fees and allocation; claims, settlement, `refresh`, `cancel_*` and `claim_*` stay open. Granular flags (PC-24) are still optional.
11. **`fulfil_deposits` in under-coverage.** *Resolved (ADR 0008):* allowed. It is the recapitalization path.
12. **NAV denominator.** Whether shares escrowed in `pending_redemptions` stay in `shares_outstanding` until fulfilment (current text: yes, they are only removed on fulfil).
13. **Provision formula.** Provision = filed amount (current text) or the full outstanding default leg plus an expected-exit term (PC-12). Also: how a filed claim that MUTAV later withdraws releases its provision.
14. **Filing window on-chain.** Enforce the 15-day filing window in the program (PC-2) or only in the platform.
15. **Program-level time lock.** Rely on the Squads time lock only, or also delay privilege increases on-chain.
16. **Pauser powers.** Can the pauser appoint the replacement operator, or only revoke? Can it unpause?
17. **`coverage_ratio_bps` floor.** Configurable from 1.0, or a program constant floor of 1.0 (PC-14).
18. **Allocation gate.** Must the allocated amount itself fit in `free_capital`, or is the solvency post-condition plus the TESOURO share cap enough?
19. **Per-invoice idempotency for fees.** Add a `FeeReceipt` PDA seeded by `invoice_ref_hash`, or rely on mutav-app's ledger.
20. **Virtual offset and seed deposit.** The value of `k` and whether a seed deposit is minted at `initialize`.
21. **NAV-move threshold X**, staleness window, deviation bound and stale-price behaviour (fail vs haircut).
22. **Adversarial-review items not yet decided:** PC-4, PC-6, PC-8, PC-9, PC-13, PC-15, PC-16, PC-21, PC-22, PC-29, PC-30, PC-31, PC-32, PC-34, PC-35, PC-36, PC-38, PC-43 (extra caps). See §11.
