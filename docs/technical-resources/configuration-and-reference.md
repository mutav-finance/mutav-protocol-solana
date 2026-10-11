# Configuration and reference

Every address, authority, parameter and constant of the `mutav` program as built in the devnet binary. Use this page to check what you are talking to before you read or sign anything.

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
| `unsolicited` | `["unsolicited", config]` | `maSJLaMsH4K9KJBDUyDhanMRwrbzXbn8vuGL5rJ4KvP` | Created at `initialize`. Holds untracked BRS, never counted in stable assets, NAV or coverage. The instructions that move money in and out of it (`skim`, `classify_unsolicited`, `book_unsolicited`, `return_unsolicited`) come with a later upgrade. |
| Income inbox | ATA of (vault authority, token program, reserve mint) | `KLcyCunPGYocfRvAjWkLSPbMScHxcAuBfR56UqDA2NP` | Where the issuer pays its monthly revenue share. Untracked until `sweep_income` books a statement. |

The reserve's money is split across separate token accounts, so a freeze of one account does not trap every balance.

## Record PDAs

| Account | Seeds | Created by | Purpose |
|---|---|---|---|
| `Guarantee` | `["guarantee", config, id]` | `register_guarantee` | One per lease. A second registration of the same `id` fails at account creation. Never closed. |
| `ClaimFiling` | `["claim", guarantee, notice_ref_hash]` | `file_claim` | One per notice: provision, status, `approved_amount` (written by the admin's `approve_claim`; 0 until then), `revision`, and the payment and settlement record (`payments_account`, `paid_at`, `paid_amount`, `pix_e2e_hash`, `settled_at`). A second payment of the same notice is refused by its status. Never closed. |
| `IncomeReceipt` (fee) | `["fee", config, invoice_ref_hash]` | `contribute_fees` | `kind = FEE`. Each invoice's guarantee fee counts once. The separate seed prefix keeps invoice and statement references from colliding. Never closed. |
| `IncomeReceipt` | `["income", config, ref_hash]` | `sweep_income` | `kind = ISSUER_STATEMENT`. Each swept statement counts once. The later `book_unsolicited` adds the `UNSOLICITED` and `BACKSTOP` kinds. Never closed. |
| `DepositRequest` | `["deposit", config, seq]` (`seq` as u64 little-endian) | `request_deposit` | One FIFO deposit request. Closed on claim or cancel. |
| `RedeemRequest` | `["redeem", config, seq]` (`seq` as u64 little-endian) | `request_redeem` | One FIFO redeem request. Closed on claim or cancel. |

There is no per-holder account: the open-exit rule reads the owner's share balance ([ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)).

### Reserved and retired seeds

| Seed | Status |
|---|---|
| `exit_buffer`, `exit_limit`, `instant_exit`, `adapter_state` | Reserved for later features. No v1 PDA uses them. `adapter_state` is the seed of the per-adapter account of [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md). |
| `notice` | Held for the planned `ClaimNotice` account. |
| `agency`, `payout`, `holder` | Retired before the layout freeze with the per-agency exposure account, the `Payout` account and `HolderState`. Never reused. |

## Authorities

| Authority | Holder | Devnet address | Can do |
|---|---|---|---|
| Program upgrade authority | Upgrade multisig vault (Squads v4) | Set at deploy | Sign `initialize` and program upgrades. |
| Reserve admin (`VaultConfig.admin`) | Admin multisig vault (Squads v4) | Set at deploy | Caps, coverage ratio, stress buffer, roles and guardians, `revoke_pauser`, money accounts, allowlist, capital fills, parking pending deposit and redeem requests, claim approvals above the per-call cap (`approve_claim`), unpause, halt clearing. Unsolicited money comes with a later upgrade. Rotated only by `propose_admin` then `accept_admin`. |
| Operator (`VaultConfig.operator`) | Hot key | Set at deploy | Guarantees (register, close), guarantee fees, issuer income, claims (file, pay) and settlement records. Reinstating a guarantee and amending or re-filing a claim come with a later upgrade. `Pubkey::default()` when revoked. On devnet a keypair generated at deploy and used by hand from the operator console. Later a KMS-backed key in the MUTAV platform. |
| Pauser (`VaultConfig.pauser`) | Separate key | Set at deploy | `pause` and `revoke_operator`, with no time lock. Generated at deploy. |
| Guardians (`VaultConfig.guardians`) | Up to 3 keys, appointed by the admin in one step | Set at deploy | `pause` only in the pilot. Devnet starts with 1 guardian, a key separate from the pauser. With the first adapter upgrade, also the risk-reducing adapter actions of ADR 0027. |
| Share mint authority | Vault authority PDA | `BsVcrAmq5x1qD2anp2hHyWmabjLxRjHbmNUtiQXxqVK` | Mints shares only in `claim_shares`. |
| Share freeze authority | Vault authority PDA | `BsVcrAmq5x1qD2anp2hHyWmabjLxRjHbmNUtiQXxqVK` | Unused by v1. Kept so share-transfer restrictions stay possible without a new mint. |
| Reserve token accounts owner | Vault authority PDA | `BsVcrAmq5x1qD2anp2hHyWmabjLxRjHbmNUtiQXxqVK` | Owns `reserve`, `pending_deposits`, `pending_redemptions`, `claims`, `unsolicited` and the income inbox. |
| BRS mint authority (issuer) | Account owned by the issuer's minting program | `7764rLMKF8fd4daejEESKBDPjE5EQBEQNgKCKNCpMwJv` | Owner program `9fBSeVHUCaHHUzkktiRp5Yn35emxx3S1ERzn7oHsi8je`. Read 2026-10-06 ([spec §12 Q34](../spec.md#12-open-questions)). |
| BRS freeze authority (issuer) | Issuer wallet | `nora7ZTxmDrLdVheVazpsthHFB8u3JzgHeyh9foTZWC` | Can freeze any BRS token account, the reserve's included. Mainnet arrangements are open ([spec §12 Q34](../spec.md#12-open-questions), [open questions](../meta/open-questions.md#open-questions)). |
| Treasury account | MUTAV BRS token account | Set at deploy | Receives MUTAV's take of each guarantee fee. Not owned by the operator, the capital wallet or the vault authority. |
| Payments account | MUTAV BRS token account | Set at deploy | Only destination of claim payments. Same ownership rules as the treasury, and distinct from it. |
| MUTAV capital wallet | Allowlisted wallet | Set at deploy | Disclosed on-chain. Uses the same queues as any capital provider. |

Roles are distinct keys. The operator, pauser and admin change only when the new key signs its acceptance (`accept_role`, `accept_admin`). Each pending handover expires 72 hours after its proposal, and `cancel_pending` clears one. `revoke_operator` clears the operator and the pending operator key; `revoke_pauser` (admin) clears the pauser and the pending pauser key. Guardians are set in one step with `set_guardians`.

### Multisigs and time locks

| Multisig | Holds | Devnet | Real pilot and mainnet |
|---|---|---|---|
| Admin multisig | `VaultConfig.admin` | Squads v4, 2-of-2, time lock 5 min (floor 300 s checked by the scripts) | 24 h |
| Upgrade multisig | Program upgrade authority | Same members, 2-of-2, time lock 1 h (floor 3,600 s checked by the scripts) | 7 days, and never shorter than `max_queue_wait_secs` once the exit fallback is on |

On devnet the two members are two wallets standing in for the founders. Hardware-wallet keys replace them before real money. Both multisigs have no config authority, so members, threshold and time lock change only through their own proposals. The Squads time lock counts from approval.

## Devnet parameters

Amounts in R$ and in BRS base units (6 decimals). The values are those of [ADR 0028](../decisions/0028-pilot-parameters.md), the same for devnet and the pilot; `verify.ts` checks them on-chain after a devnet deploy.

| Parameter | Field | Devnet value | Base units |
|---|---|---|---|
| Coverage ratio `c` | `coverage_ratio_bps` | 0.25 (program floor 0.10) | `2_500` bps |
| Stress buffer | `caps.stress_buffer` | R$19,000 | `19_000_000_000` |
| Max reserve size | `caps.max_tvl` | R$1,000,000 | `1_000_000_000_000` |
| Cover per guarantee | `caps.max_cover_per_guarantee` | R$120,000 | `120_000_000_000` |
| Claim payment per call | `caps.max_claim_per_call` | R$15,000 | `15_000_000_000` |
| Claim payments per sliding 31-day window | `caps.max_claim_per_period` | R$20,000 | `20_000_000_000` |
| Request size | `caps.min_request` / `caps.max_request` | R$1,000 to R$100,000 | `1_000_000_000` / `100_000_000_000` |
| NAV-move bound | `caps.max_nav_move_bps` | 100% | `10_000` bps |
| Exit fallback wait | `caps.max_queue_wait_secs` | 0 (off) | `0` s |
| Reinstatement window | `caps.max_reinstate_age` | 0 (unused until `reinstate_guarantee` ships; 30 days planned) | `0` s |
| Fee take | `fee_take_bps` | 20% | `2_000` bps |
| Feature flags | `feature_flags` | None | `0` |
| Guardians | `guardians` | 1 | |
| Pending handover expiry | Program rule | 72 hours | `259_200` s |
| Settlement floor | None in v1 | 100% BRS, adapter share 0% | No adapter can hold value, so all stable assets are BRS. The floor returns with the adapter upgrade ([ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md)). |
| Unsolicited dust threshold | Off-chain (runbook and app) | R$10 | No on-chain field |
| Unsolicited return window | Off-chain (runbook) | 30 days | No on-chain field |

The claim window is 31 daily buckets: a payment goes through only if the payments of the last 31 days plus this one stay within `max_claim_per_period`, so no 30-day span pays more than the cap. Its length is fixed by the bucket count, not by a parameter ([ADR 0021](../decisions/0021-claims-approval-amendment-exact-payment.md)).

There is no take on issuer income in v1: the field was removed and returns as a carve if a take is ever decided ([spec §12 Q47](../spec.md#12-open-questions), [ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)).

The devnet NAV-move bound is 100% on purpose. On a small demo reserve a single claim is a real NAV move and would halt fills. The guard is proven in LiteSVM tests and is lowered for the real pilot; that value is not decided yet ([open questions](../meta/open-questions.md#open-questions)). Every other value above is set by ADR 0028 for the pilot too.

## Program constants

| Constant | Value | Meaning |
|---|---|---|
| `PROGRAM_LAYOUT_VERSION` | 1 | Written by every `init`. Accounts with a higher version are refused. |
| `MIN_COVERAGE_RATIO_BPS` | 1,000 | Floor on `c` (0.10). |
| `MAX_COVERAGE_RATIO_BPS` | 10,000 | `c` lies in [1,000, 10,000] bps, which keeps the gates' arithmetic within range ([ADR 0022](../decisions/0022-coverage-stress-buffer-underwater-reserve.md)). |
| `MAX_FEE_TAKE_BPS` | 3,000 | Maximum fee take (30%). |
| `BPS_DENOMINATOR` | 10,000 | 100%. |
| `NAV_SCALE` | `10^9` | Fixed-point scale of NAV per share. |
| `CLAIM_WINDOW_DAYS` | 31 | Daily buckets of the claim window. |
| `VIRTUAL_OFFSET` | 1 | `V = 10^0`. One share is worth 1 BRS at launch. |
| `RESERVE_DECIMALS`, `SHARE_DECIMALS` | 6 | Reserve and share mint decimals. `initialize` refuses any other reserve mint. |
| `MAX_FULFIL_BATCH` | 8 | Most requests per fill call. `fulfil_deposits` takes `count` from 1 to 8. |
| `MAX_ADAPTERS` | 8 | Bits of the `adapter_bitmap`. `adapter_count` and the bitmap are 0 in v1; adapter state lives in its own `AdapterState` account. |
| `MAX_CONFIG_PARAMS` | 16 | Most `ConfigParam` values per `set_config`. Duplicates are refused with `DuplicateParam`. |
| `HANDOVER_WINDOW_SECS` | 259,200 | 72 hours to accept a proposed role or admin key. |
| `SUB_MINIMUM_EXIT_FLOOR_DIVISOR` | 10 | An exit of the balance below `min_request` must be worth at least `max(1, min_request / 10)` ([ADR 0029](../decisions/0029-claims-and-capital-rules-in-the-program.md)). |
| `MAX_ALLOWLIST_PROOF_LEN` | 32 | Deepest Merkle proof (2^32 leaves). |
| `SUPPORTED_FEATURES` | 0 | No optional feature can be switched on in v1. |
| Maximum guardians | 3 | Pause-only keys in the pilot. |

## Status constants

Statuses, legs, kinds and modes are `u8` constants, never Borsh enums. An unknown value fails closed with `UnsupportedVersion`.

| Field | Values |
|---|---|
| `VaultState.mode` | `MODE_NORMAL = 0`, `MODE_UNDER_COVERED = 1` |
| `Guarantee.status` | `ACTIVE = 0`, `CLOSED = 1` |
| `Guarantee.close_reason` | `CLOSE_RELEASED = 1`, `CLOSE_VOID = 2`. `0` = still active, or closed before the reason was recorded. Any other argument is `InvalidParameter`. |
| `ClaimFiling.leg` | `LEG_DEFAULT = 1` (rent and charges in arrears), `LEG_EXIT = 2` (end-of-occupation debts). `0` is `InvalidParameter`. |
| `ClaimFiling.status` | `FILED = 0`, `PAID = 1`, `WITHDRAWN = 2`, `SETTLED = 3`. Append-only. This binary moves `FILED → PAID → SETTLED`; `SETTLED` is terminal. `WITHDRAWN` is reserved for the later claim withdrawal and is neither written nor accepted. |
| `DepositRequest.status` | `PENDING = 0`, `FULFILLED = 1` |
| `RedeemRequest.status` | `PENDING = 0`, `FILLED = 1`. A cancelled request is closed. |
| `IncomeReceipt.kind` | `ISSUER_STATEMENT = 0`, `FEE = 1`. Reserved for later upgrades: `UNSOLICITED = 2`, `BACKSTOP = 3`. |
| Roles (`propose_role`, `accept_role`, `cancel_pending`) | `ROLE_OPERATOR = 1`, `ROLE_PAUSER = 2`, `ROLE_ADMIN = 3` (`cancel_pending` only; the admin handover uses `propose_admin` / `accept_admin`) |
| `advance_queue_head` queue | `QUEUE_DEPOSIT = 1`, `QUEUE_REDEEM = 2` |

Argument enums are Borsh enums, append-only: `ConfigParam` (one variant per settable field), `Eligibility` (`Merkle { proof }` only; an attestation variant is appended when built). The `Source` of the later `return_unsolicited` will be one too.

## Account sizes

Sizes include the 8-byte Anchor discriminator. Every program-owned account starts with `version: u8` and `bump: u8` and ends with a zeroed `_reserved` array. New fields are carved from the front of `_reserved`, so sizes never change after the freeze.

| Account | Size (bytes) | `_reserved` bytes | Notes |
|---|---|---|---|
| `VaultConfig` | 1,181 | 411 | Holds the pending role keys with per-role expiry, `pending_admin` and its expiry, `guardians[3]`, `adapter_count` and `adapter_bitmap`. The padding test reserves room for the phase-2 exit parameters and the buffer earmark. |
| `VaultState` | 688 | 224 | Holds the claim window: 31 daily buckets and the day anchor (`claim_day_buckets`, `claim_day_anchor`). |
| `Guarantee` | 377 | 203 | Grown from 64 before the freeze, to hold the planned guarantee lifecycle fields without migration. |
| `ClaimFiling` | 380 | 192 | Holds `approved_amount` and the payment and settlement fields of the former `Payout` account. The padding holds the planned claim and settlement fields. |
| `IncomeReceipt` | 143 | 64 | Holds `kind`. |
| `DepositRequest` | 155 | 56 | Holds `min_shares_out`. |
| `RedeemRequest` | 155 | 48 | Holds `min_assets_out`. The padding test reserves room for the partial-fill fields. |
| Nested `Caps` | | 32 | Holds `stress_buffer`, `max_queue_wait_secs` and `max_reinstate_age`. A later concentration limit is carved here. |

Sizes follow the v1 layout of ADR 0019. Sizes are pinned in `constants.rs` (`VAULT_CONFIG_SIZE` and the others) and asserted against `8 + INIT_SPACE`; exact field offsets are pinned by the golden layout test against `tests/fixtures/layout/v1/` at the freeze.

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
- [ADR 0019: v1 layout for the devnet release](../decisions/0019-v1-layout-for-the-devnet-release.md) (padding, carved fields, retired seeds and field ids)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md) (roles, two-step handover, guardians, two multisigs and time locks)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md) (claim statuses, 31-day window)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md) (amends 0016)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md)
- [ADR 0024: Unsolicited money and backstop contributions](../decisions/0024-unsolicited-money-and-backstop.md)
- [ADR 0025: Exit fallback: a cooldown exit after `max_queue_wait_secs`](../decisions/0025-exit-fallback-cooldown-exit.md)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md)
- [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) (Proposed)
- [ADR 0028: Pilot parameters](../decisions/0028-pilot-parameters.md) (devnet and pilot values, time locks)
- [ADR 0029: Claims and capital rules in the program](../decisions/0029-claims-and-capital-rules-in-the-program.md)
