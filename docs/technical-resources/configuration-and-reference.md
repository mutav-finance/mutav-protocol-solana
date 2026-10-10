# Configuration and reference

Every address, authority, parameter and constant of the `mutav` program in the devnet release design. Use this page to check what you are talking to before you read or sign anything.

> The program ID is declared in code but the program is not yet deployed to devnet. The reserve PDAs below are derived from the declared program ID and the devnet reserve mint. They become live accounts once `initialize` runs under that ID.

Explorer links follow the pattern `https://explorer.solana.com/address/<address>?cluster=devnet`.

## Program

| Component | Devnet address | Notes |
|---|---|---|
| Program ID | `8scC79jkU7SPM9v6M4nB833R8EeqKknfwdRdjn73Qqv9` | Declared in [`lib.rs`](../../programs/mutav/src/lib.rs) and `Anchor.toml`. Deploy pending. |
| Loader | `BPFLoaderUpgradeab1e11111111111111111111111` | BPF Loader Upgradeable. ProgramData is derived by the loader from the program ID. |
| Upgrade authority | Set at deploy | The vault of the upgrade multisig (Squads v4, long time lock). |
| IDL | Set at deploy | Program Metadata account, written by the upgrade authority in the same Squads proposal as each upgrade. |
| Event authority | `AquHfairQemYYusuBkppBWmgBK6zgmtw1vk5aoAZnHWx` | PDA `["__event_authority"]`, used by Anchor `emit_cpi!`. |

## Mints and token programs

| Component | Devnet address | Notes |
|---|---|---|
| Reserve mint (BRS) | `BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4` | The issuer's devnet BRS. Classic SPL Token, 6 decimals. Stored in `VaultConfig.reserve_mint`; immutable after `initialize`, which requires 6 decimals. |
| Reserve token program | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | Classic SPL Token. Stored as `reserve_token_program`. Any other program fails with `InvalidTokenProgram`. |
| Share mint | `EmusG8JSunj1ZWJTDQEyTE2jfg5wRojwhXWTmH39hqfs` | PDA `["share_mint", config]`. Classic SPL Token, 6 decimals. Mint and freeze authority: the vault authority PDA. |
| Associated Token program | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` | Derives the income inbox. |

The mint guard in `initialize` refuses a Token-2022 reserve mint with any of: permanent delegate, transfer hook, transfer fee or transfer-fee authority, non-transferable, default-frozen, scaled UI amount, interest-bearing or pausable.

## Reserve-level PDAs

Every PDA except `VaultConfig` includes the config address in its seeds. Seed strings are distinct.

| Name | Seeds | Devnet address | Purpose |
|---|---|---|---|
| `VaultConfig` | `["config", reserve_mint]` | `8CDkR7ausijvx2tY4qBLanZ4yxExZht4MrHeM87WC63u` | Configuration, roles, caps. One per reserve mint. |
| `VaultState` | `["state", config]` | `4bmZKvPDq8MWpVBbTBuQun4fexefRjzVcePWrT51npHi` | Internal accounting, queue heads, claim window. |
| Vault authority | `["authority", config]` | `BsVcrAmq5x1qD2anp2hHyWmabjLxRjHbmNUtiQXxqVK` | Holds no data. Owns every reserve token account. Mint and freeze authority of the share mint. |
| `reserve` | `["reserve", config]` | `7zEMG3rnN5VEmcBNECJmLg9nJqCKtxz7VK2kREWvjA5m` | Liquid reserve BRS. Tracked by `brs_balance`. |
| `pending_deposits` | `["pending_deposits", config]` | `4pS5twyH3icCja8kmEsTgFfEXyDZCjj7ajrb9AV2NJvS` | BRS escrowed by deposit requests. |
| `pending_redemptions` | `["pending_redemptions", config]` | `GsP2K22t8xqkVEWt82PCAGFSWp9uN4GifVNRLuw7q3PY` | Shares escrowed by redeem requests. |
| `claims` | `["claims", config]` | `5bMo1dQfWyS2bqpUGtmX528JF639HboVDZueTsAsSXv9` | BRS owed to holders on filled redemptions, waiting for `claim_assets`. |
| `unsolicited` | `["unsolicited", config]` | `maSJLaMsH4K9KJBDUyDhanMRwrbzXbn8vuGL5rJ4KvP` (if the seed is pinned as proposed) | Untracked BRS that arrived outside a booking path. The only account money can be returned to a sender from. Created at `initialize`. |
| Income inbox | ATA of (vault authority, token program, reserve mint) | `KLcyCunPGYocfRvAjWkLSPbMScHxcAuBfR56UqDA2NP` | Where the issuer pays its monthly revenue share. Untracked until `sweep_income` books a statement. |

The reserve's money is split across separate token accounts, so a freeze of one account does not trap every balance.

## Record PDAs

| Account | Seeds | Created by | Purpose |
|---|---|---|---|
| `Guarantee` | `["guarantee", config, id]` | `register_guarantee` | One per lease. A second registration of the same `id` fails at account creation. Never closed. |
| `ClaimFiling` | `["claim", guarantee, notice_ref_hash]` | `file_claim` | A filed claim: provision, status, approval. |
| `Payout` | `["payout", guarantee, notice_ref_hash]` | `pay_claim` | One per paid notice. Makes payment idempotent per notice. |
| `FeeReceipt` | `["fee", config, invoice_ref_hash]` | `contribute_fees` | Each invoice's guarantee fee counts once. Never closed. |
| `IncomeReceipt` | `["income", config, ref_hash]` | `sweep_income`, `book_unsolicited` | Each booked inflow counts once. Carries a `kind`. Never closed. |
| `DepositRequest` | `["deposit", config, seq]` (`seq` as u64 little-endian) | `request_deposit` | One FIFO deposit request. Closed on claim, cancel or refund. |
| `RedeemRequest` | `["redeem", config, seq]` (`seq` as u64 little-endian) | `request_redeem` | One FIFO redeem request. Closed when nothing is left. |
| `HolderState` | `["holder", config, owner]` | `request_deposit` or `claim_shares` | One per capital-provider wallet. |

### Reserved and retired seeds

| Seed | Status |
|---|---|
| `exit_buffer`, `exit_limit`, `instant_exit`, `adapter_state` | Reserved for later features. No v1 PDA uses them. |
| `notice` | Held for the planned `ClaimNotice` account. |
| `agency` | Retired. It was the seed of the per-agency exposure account, removed before the layout freeze. Never reused. |

## Authorities

| Authority | Holder | Devnet address | Can do |
|---|---|---|---|
| Program upgrade authority | Upgrade multisig vault (Squads v4) | Set at deploy | Sign `initialize` and program upgrades. |
| Reserve admin (`VaultConfig.admin`) | Admin multisig vault (Squads v4) | Set at deploy | Caps, coverage ratio, stress buffer, roles, money accounts, allowlist, capital fills, claim approvals above the per-call cap, unsolicited money, unpause, halt clearing. Rotated only by `propose_admin` then `accept_admin`. |
| Operator (`VaultConfig.operator`) | Hot key | Set at deploy | Guarantees, guarantee fees, issuer income, claims and settlement records. `Pubkey::default()` when revoked. On devnet a keypair generated at deploy and used by hand from the operator console. Later a KMS-backed key in the MUTAV platform. |
| Pauser (`VaultConfig.pauser`) | Separate key | Set at deploy | `pause` and `revoke_operator`, with no time lock. Generated at deploy. |
| Guardians (`VaultConfig.guardians`) | Up to 3 keys, admin-set | Set at deploy | `pause` only. Devnet starts with 1 guardian, a key separate from the pauser. |
| Share mint authority | Vault authority PDA | `BsVcrAmq5x1qD2anp2hHyWmabjLxRjHbmNUtiQXxqVK` | Mints shares only in `claim_shares`. |
| Share freeze authority | Vault authority PDA | `BsVcrAmq5x1qD2anp2hHyWmabjLxRjHbmNUtiQXxqVK` | Unused by v1. Kept so share-transfer restrictions stay possible without a new mint. |
| Reserve token accounts owner | Vault authority PDA | `BsVcrAmq5x1qD2anp2hHyWmabjLxRjHbmNUtiQXxqVK` | Owns `reserve`, `pending_deposits`, `pending_redemptions`, `claims`, `unsolicited` and the income inbox. |
| BRS mint authority (issuer) | Account owned by the issuer's minting program | `7764rLMKF8fd4daejEESKBDPjE5EQBEQNgKCKNCpMwJv` | Owner program `9fBSeVHUCaHHUzkktiRp5Yn35emxx3S1ERzn7oHsi8je`. Read 2026-10-06 ([spec §12 Q34](../spec.md#12-open-questions)). |
| BRS freeze authority (issuer) | Issuer wallet | `nora7ZTxmDrLdVheVazpsthHFB8u3JzgHeyh9foTZWC` | Can freeze any BRS token account, the reserve's included. Mainnet arrangements: TBD (spec §12 Q34). |
| Treasury account | MUTAV BRS token account | Set at deploy | Receives MUTAV's take of each guarantee fee. Not owned by the operator, the capital wallet or the vault authority. |
| Payments account | MUTAV BRS token account | Set at deploy | Only destination of claim payments. Same ownership rules as the treasury, and distinct from it. |
| MUTAV capital wallet | Allowlisted wallet | Set at deploy | Disclosed on-chain. Uses the same queues as any capital provider. |

Roles are distinct keys. A role changes only when the new key signs its acceptance. A pending handover expires, and `revoke_operator` clears any pending role key.

### Multisigs and time locks

| Multisig | Holds | Devnet | Real pilot and mainnet |
|---|---|---|---|
| Admin multisig | `VaultConfig.admin` | Squads v4, 2-of-2, time lock 5 min (floor 300 s checked by the scripts) | 24 h |
| Upgrade multisig | Program upgrade authority | Same members, 2-of-2, time lock 1 h (floor 3,600 s checked by the scripts) | 7 days |

On devnet the two members are two wallets standing in for the founders. Hardware-wallet keys replace them before real money. Both multisigs have no config authority, so members, threshold and time lock change only through their own proposals. The Squads time lock counts from approval.

## Devnet parameters

Amounts in R$ and in BRS base units (6 decimals).

| Parameter | Field | Devnet value | Base units |
|---|---|---|---|
| Coverage ratio `c` | `coverage_ratio_bps` | 0.10 | `1_000` bps |
| Stress buffer | `caps.stress_buffer` | R$19,000 | `19_000_000_000` |
| Max reserve size | `caps.max_tvl` | R$300,000 | `300_000_000_000` |
| Cover per guarantee | `caps.max_cover_per_guarantee` | R$40,000 | `40_000_000_000` |
| Claim payment per call | `caps.max_claim_per_call` | R$10,000 | `10_000_000_000` |
| Claim payments per sliding window | `caps.max_claim_per_period` | R$20,000 | `20_000_000_000` |
| Claim window length | `caps.claim_period_secs` | 30 days | `2_592_000` s |
| Request size | `caps.min_request` / `caps.max_request` | R$1,000 to R$100,000 | `1_000_000_000` / `100_000_000_000` |
| Smallest partial fill | `caps.min_fill_assets` | R$500 | `500_000_000` (partial fills are not built in v1) |
| Settlement floor | `caps.min_settlement_bps` | 100% (BRS only) | `10_000` bps |
| Unsolicited dust threshold | Runbook value; an on-chain field (`caps.unsolicited_dust`) only if the threshold is enforced on-chain, pinned at implementation | R$10 | `10_000_000` |
| Exit fallback wait | `max_queue_wait_secs` (location pinned at implementation) | 0 (off) | `0` |
| Reinstatement window | `max_reinstate_age` | Set at deploy (not fixed yet; 30 days given as an example) | Not fixed by the decisions |
| Fee take | `fee_take_bps` | 20% | `2_000` bps |
| Income take | `income_take_bps` | 0 | `0` (program maximum is 0, spec §12 Q47) |
| NAV-move bound | `price.max_nav_move_bps` | 100% | `10_000` bps |
| Price staleness | `price.max_staleness_secs` | Placeholder | `86_400` s (no priced asset is held) |
| Feature flags | `feature_flags` | None | `0` |
| Guardians | `guardians` | 1 | |

The devnet NAV-move bound is 100% on purpose. On a small demo reserve a single claim is a real NAV move and would halt fills. The guard is proven in LiteSVM tests and is lowered for the real pilot (value TBD). The real-pilot cap values are open ([spec §12 Q3](../spec.md#12-open-questions)).

## Program constants

| Constant | Value | Meaning |
|---|---|---|
| `PROGRAM_LAYOUT_VERSION` | 1 | Written by every `init`. Accounts with a higher version are refused. |
| `MIN_COVERAGE_RATIO_BPS` | 1,000 | Floor on `c` (0.10). |
| Upper bound on `coverage_ratio_bps` | Pinned at implementation | Keeps the cached `coverage_required` write from failing on the claim path. |
| `MAX_FEE_TAKE_BPS` | 3,000 | Maximum fee take (30%). |
| `MAX_INCOME_TAKE_BPS` | 0 | Maximum take from issuer income. Fails closed at 0 until decided. |
| `BPS_DENOMINATOR` | 10,000 | 100%. |
| `NAV_SCALE`, `PRICE_SCALE` | `10^9` | Fixed-point scale of NAV per share and prices. |
| `VIRTUAL_OFFSET` | 1 | `V = 10^0`. One share is worth 1 BRS at launch. |
| `SHARE_DECIMALS` | 6 | Share mint decimals. |
| `MAX_FULFIL_BATCH` | 8 | Most requests per fill call. `fulfil_deposits` takes `count` from 1 to 8. |
| `MAX_ADAPTERS` | 8 | Adapter slots inline in `VaultConfig`. All empty in v1. |
| `MAX_ALLOWLIST_PROOF_LEN` | 32 | Deepest Merkle proof (2^32 leaves). |
| `SUPPORTED_FEATURES` | 0 | No optional feature can be switched on in v1. |
| Maximum guardians | 3 | Pause-only keys. |
| Upper bound on `claim_period_secs` | 90 days | Keeps the claim window rolling. |
| Upper bound on `max_staleness_secs` | Pinned at implementation | |

## Status constants

Statuses, legs, kinds and modes are `u8` constants, never Borsh enums. An unknown value fails closed with `UnsupportedVersion`.

| Field | Values |
|---|---|
| `VaultState.mode` | `MODE_NORMAL = 0`, `MODE_UNDER_COVERED = 1` |
| `Guarantee.status` | `ACTIVE = 0`, `CLOSED = 1` |
| `close_guarantee` reason | `RELEASED` and `VOID`; constants pinned at implementation |
| `ClaimFiling.leg`, `Payout.leg` | `LEG_DEFAULT = 0` (rent and charges in arrears), `LEG_EXIT = 1` (end-of-occupation debts) |
| `ClaimFiling.status` | `FILED = 0`, `PAID = 1`, `WITHDRAWN = 2` |
| `Payout.status` | `PENDING = 0`, `SETTLED = 1` |
| `DepositRequest.status` | `PENDING = 0`, `FULFILLED = 1` |
| `RedeemRequest.status` | `PENDING = 0`, `PARTIALLY_FILLED = 1`, `FILLED = 2`, `CANCELLED = 3` |
| `IncomeReceipt.kind` | `NORA_STATEMENT = 0`, `UNSOLICITED`, `BACKSTOP` (non-zero values pinned at implementation) |

## Account sizes

Sizes include the 8-byte Anchor discriminator. Every program-owned account starts with `version: u8` and `bump: u8` and ends with a zeroed `_reserved` array. New fields are carved from the front of `_reserved`, so sizes never change after the freeze.

| Account | Size (bytes) | Padding budget | Notes |
|---|---|---|---|
| `VaultConfig` | 2,756 | 512 | Carves pending role keys, `pending_admin`, `pending_expires_at`, `guardians`, `max_reinstate_age`. The retired payout-SLA field returned its bytes to padding. |
| `VaultState` | 480 | 256 | Carves the sliding claim window's previous bucket. The retired late-payout counter returned its bytes. |
| `Guarantee` | 377 | 192 | Grown from 64 before the freeze, to hold the planned guarantee lifecycle fields without migration. |
| `ClaimFiling` | 220 | 128 | Grown from 64. Carves `approved_amount`. |
| `Payout` | 293 | 128 (+1 from the retired late flag) | Grown from 64. |
| `FeeReceipt` | 138 | 64 | |
| `IncomeReceipt` | 142 | 64 | Carves `kind`. |
| `DepositRequest` | 155 | 64 | |
| `RedeemRequest` | 181 | 64 | Partial-fill fields are real fields from v1. |
| `HolderState` | 114 | 64 | |
| Nested `Caps` | | 40 | Carves `stress_buffer` (and `unsolicited_dust`, if the dust threshold is enforced on-chain). Where `max_queue_wait_secs` and `max_reinstate_age` sit (`Caps` or `VaultConfig` padding) is pinned at implementation. |
| Nested `PriceParams`, `ExitParams` | | 32 each | |
| Nested `AdapterEntry` (×8) | | 64 each | `max_share_bps` carved; 62 bytes left. |

Exact field offsets are pinned by the golden layout test against `tests/fixtures/layout/v1/`.

## Sources

- [Specification §3 Accounts](../spec.md#3-accounts), [§8 Caps](../spec.md#8-caps), [§12 Open questions](../spec.md#12-open-questions), [§14.2 Padding and version](../spec.md#142-padding-and-version)
- Program constants and seeds: [`programs/mutav/src/constants.rs`](../../programs/mutav/src/constants.rs)
- Program ID: [`programs/mutav/src/lib.rs`](../../programs/mutav/src/lib.rs)
- Devnet config template: [`scripts/devnet/devnet.example.json`](../../scripts/devnet/devnet.example.json)
- PDA derivation: [`clients/js/src/pdas.ts`](../../clients/js/src/pdas.ts)
- [Repository README, Devnet addresses](../../README.md#devnet-addresses)
- [Solana Explorer](https://explorer.solana.com/?cluster=devnet)
- [Squads v4 documentation](https://docs.squads.so/)
- [SPL Token-2022 extensions](https://spl.solana.com/token-2022/extensions)

## Decisions

- [ADR 0004: On-chain NAV with internal accounting](../decisions/0004-onchain-nav-internal-accounting.md)
- [ADR 0007: Fee take direct to treasury](../decisions/0007-fee-take-direct-to-treasury.md)
- [ADR 0009: Separate MUTAV money flows](../decisions/0009-separate-mutav-money-flows.md)
- [ADR 0011: Phase-2 instant exit and upgrade readiness](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)
- [ADR 0012: Fiança-aligned guarantee lifecycle](../decisions/0012-fianca-aligned-guarantee-lifecycle.md)
- [ADR 0016: Coverage ratio below one](../decisions/0016-coverage-ratio-below-one.md)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- Pending ADR 0019: v1 layout for the devnet release (padding, payout SLA removal, per-agency cap removal, carved fields)
- Pending ADR: Operator/admin separation and operator-compromise recovery (roles, two-step handover, guardians, two multisigs and time locks)
- Pending ADR: Coverage: stress buffer and underwater reserve (amends 0016)
- Pending ADR: Unsolicited money and backstop contributions
- Pending ADR: Exit fallback
