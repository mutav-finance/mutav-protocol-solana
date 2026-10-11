# Solana landscape and stack

> **Research date:** 2026-09-30. **Curated:** 2026-10-10. Prior research by the MUTAV team, kept as written except for the edits noted in the [research index](README.md). Notes headed *Since this research* record later decisions. Not legal or investment advice.

This page merges two research notes written before the program was built. The first surveys established Solana credit, RWA and cover pools, vault infrastructure, yield venues and admin practice, looking for patterns a BRL reserve backing Brazilian *fianças* can borrow. The second picks the toolchain and lays out how such a program fits Solana's runtime. OnRe, the closest comparable, has its own page: [OnRe as a comparable](onre-comparable.md).

Evidence tags from the source notes: **[V]** verified from source code, official docs or the chain on the research date; **[S]** secondary source (press, aggregators); **[I]** inference, not stated by any source. Version numbers come from GitHub releases, crates.io and npm, queried on 2026-09-30.

At the time, the working assumptions were: a NAV-priced share token; guarantee fees in; claims paid from the reserve; exits only through a surplus-gated FIFO redemption queue that preserves `stable_assets ≥ coverage_required`; both deposits and redemptions asynchronous (ERC-7540 style); the reserve asset most likely Nora's BRS; idle float routed to pluggable yield venues; and the program running MUTAV's real six-month pilot, so production-grade patterns (audits, admin, ops) were favoured.

> **Since this research:** The pilot reserve holds BRS only. Other assets, starting with Etherfuse TESOURO, can join later through adapter programs, with the TESOURO cap at zero until its open items close ([ADR 0018](../decisions/0018-brs-only-pilot-reserve.md), [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), proposed). Idle float is not routed to yield venues in the pilot.

## Summary

- **Best async template: the Solana Foundation's [`solana-foundation/vault`](https://github.com/solana-foundation/vault) "Vault Standard Suite"** (MIT, devnet `vaLtx8Su1t5P1CZG5GFEMc94sN4K7A4AUUiciadtvUi`, Cantina APEX scan June 2026, labelled "reference implementation, not audited for mainnet"). It is ERC-7540-inspired with async deposit and redeem, a **separate `pending_vault` escrow from the `reserve`**, **authority-set NAV snapshotted into each request at approval**, **FIFO subscription and redemption queue extensions** (monotonic IDs, `request.id == last_processed + 1`, tombstoned cancels, permissionless `skip_canceled_queue_request`), a bring-your-own share mint, and sRFC-37 ACL compatibility. It is almost exactly MUTAV's shape. [V]
- **A Solana ERC-4626 analogue exists: the Solana Vault Standard (SVS)** by Superteam Brasil (`solanabr/solana-vault-standard`). It has 12 Anchor programs on devnet, including an ERC-7540-style async vault (SVS-10), a KYC'd credit vault with oracle NAV and SAS attestation (SVS-11), a tranched vault with a loss waterfall (SVS-12) and an allocator vault with an idle buffer (SVS-9). It is **not externally audited**. A Brazilian team built it. [V]
- **Queue storage:** every production program checked uses **one request account per user**, either a per-user PDA or a field in the user's depositor account. None iterates a global queue on-chain. Huma's EVM v2 keeps O(1) **aggregate epoch totals plus lazily settled per-lender records**. [V]
- **Loss and tranching:** Huma (first-loss covers, then junior, then senior, with recoveries paid back in reverse order), SVS-12 (junior absorbs losses first; the subordination check gates voluntary actions but is skipped when a loss is recorded) and Lulo (a "Boosted" first-loss tier with a 48h withdrawal delay protecting a "Protected" tier). [V]/[S]
- **Yield venues with devnet programs:** Kamino klend (same program ID on devnet), Jupiter Lend Earn (separate devnet IDs plus a documented raw-CPI guide) and marginfi v2 (`devnet` feature build). Jupiter Lend Earn is the easiest CPI: one `deposit`/`withdraw` pair, with fTokens as shares. [V]
- **Admin:** a Squads v4 multisig with `time_lock` (max 3 months) as upgrade authority and admin. The two biggest Solana-adjacent governance losses of the prior 14 months (Drift, about $280M, April 2026; CrediX on Sonic, $4.5M, August 2025) were admin takeovers through multisig social engineering. A time lock plus separate roles would have blunted both. [S]
- **Stack pick:** Anchor 1.2 with one core program plus thin adapter programs; a classic SPL share mint; LiteSVM and Mollusk for tests, Surfpool for fork tests; Codama to a Kit-native TS client; Squads v4 as upgrade authority and admin; `solana-verify` for verified builds.

| Layer | Pick | Version (2026-09-30) |
|---|---|---|
| Program framework | **Anchor**, one core program plus thin adapter programs | `anchor-lang`/`anchor-spl` **1.2.0** (2026-09-04), CLI 1.2.0, Rust MSRV 1.89 |
| Solana CLI | Agave **4.1.2** (Anchor's recommendation). The latest GitHub stable was 4.3.0 (2026-09-18) | |
| Share token | **Classic SPL Token** mint whose mint authority is a program PDA. No Token-2022 extensions on the share | `spl-token` classic, and `token_interface` for the reserve mint |
| Reserve mint | Configurable at `initialize`, immutable after. Pilot: BRS (classic, 6 decimals, freezable) | |
| KYC | Checked at **request time** against a **Solana Attestation Service** (SAS) attestation PDA. The token itself is not gated | SAS `22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG`, `sas-lib` 1.0.10 |
| Unit tests | **LiteSVM** (Rust, in-process) as the default, **Mollusk** for CU benchmarks | `litesvm` 0.17.0, `mollusk-svm` 0.15.1 |
| Fork and integration | **Surfpool** (mainnet fork, cheatcodes) | 1.6.0 (2026-09-18) |
| Client generation | **Codama** (from the Anchor IDL) to a Kit-native TS client | `codama` 1.11.0, `@codama/renderers-js` 2.5.0, `@codama/nodes-from-anchor` 1.5.6 |
| SDK | **@solana/kit** | 8.4.0 (2026-09-28) |
| React | **@solana/react** (Kit's own hooks) plus `@wallet-standard/react`; framework-kit optional | `@solana/react` 8.4.0 |
| Admin and upgrade | **Squads v4** vault as upgrade authority and admin | program `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf` (mainnet and devnet) |
| Verified build | `solana-verify`, with the OtterSec registry | 0.5.2 (2026-09-21) |

> **Since this research:** The repo ships the stack as picked: Anchor 1.2, one core program `mutav` with adapter crates, LiteSVM integration tests, Surfpool fork tests and a Codama-generated client ([repository README](../../README.md)). KYC is done off-chain and investor actions are gated by an on-chain allowlist root set by the admin, not by SAS attestations. The admin and the upgrade authority are two Squads multisigs with the same members: a short time lock for admin actions and a long one for upgrades (24 hours and 7 days on the real pilot) ([ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md)).

## Part 1: the Solana landscape

### Credit, RWA and cover pools

**Credix (Brazil credit on Solana)**

- **Deposits and shares:** `deposit_funds` sends USDC into a market liquidity pool and mints LP tokens. Deals have tranches (`set_tranches`; `activate_deal` moves pool liquidity into deal tranches), and `set_repayment_schedule` defines the waterfall. [V: [credix_client docs.rs](https://docs.rs/credix_client/latest/credix_client/)]
- **Redemption:** withdraw epochs with three phases: (1) *request*, each investor records an amount in a **per-investor `WithdrawRequest` PDA**; (2) *redeem*, available liquidity is shared pro-rata across requests; (3) *free-for-all*, what nobody withdrew goes to anyone left. A new epoch can only start once the previous one is over. Junior tranche capital cannot leave before the loan ends. [V: docs.rs; S: [Solana Compass](https://solanacompass.com/projects/credix-finance)]
- **Loss and tranching:** up to 10 tranches per deal. Deals are off-balance-sheet securitizations: Credix buys a private bond from a Brazilian securitization vehicle, over-collateralized with junior and senior tranches, settled in USDC, with receivables serviced off-chain. [S: [Solana Compass](https://solanacompass.com/projects/credix-finance), [Credix/Clave/CESCE receivables pool](https://medium.com/credix/the-on-chain-receivables-pool-with-clave-and-cesce-explained-6873defa41f6)]
- **KYC:** every interaction requires an active **`CredixPass`**, a program-issued permission PDA. [V: docs.rs]
- **Source and audits:** the programs are closed source; the GitHub org exposes only the client, the frontend and `credix-permissioned-market` (a 2023 fork). Credix has since pivoted to **CrediPay** (Brazilian B2B BNPL) and a R$300M FIDC, and the old docs domain redirects to `docs.credipay.credix.finance`. [V: GitHub org listing; S: [search summary](https://docs.credipay.credix.finance/docs/getting-started-introduction)]
- **Name collision:** the August 2025 "$4.5M CrediX exploit" hit **CrediX on Sonic**, a different protocol. [S: [The Block](https://www.theblock.co/post/365458/solana-lender-credix-defi-exploit), [FinanceFeeds](https://financefeeds.com/credix-finance-exploited-for-4-5-million-in-governance-attack/)]
- **For MUTAV:** the per-investor withdraw-request PDA with pro-rata settlement at epoch end. The FIDC plus on-chain USDC bond structure is the Brazilian precedent to cite.

**Huma Finance (Huma Institutional and Huma 2.0 on Solana)**

- **Deposits and shares:** Institutional pools are permissioned with a senior and a junior `TrancheVault`, or a single junior tranche. Huma 2.0 on Solana is permissionless: USDC mints **PST** (Classic mode, stable USDC APY) or **mPST** (Maxi mode, points only). [V: [Redemption](https://docs.huma.finance/products/huma-institutional/tranches/redemption), [Modes](https://docs.huma.finance/products/huma-2.0/modes); S: [Huma 2.0 blog](https://blog.huma.finance/introducing-huma-2.0-permissionless-real-yield-on-solana)]
- **Redemption (Institutional):** requests are free to create and cancel before processing, subject to a lockout. They are batched at **epoch end** (the epoch equals the pool's payment period). **Senior requests go first**, but only as far as the max senior:junior ratio allows. Unfilled amounts **roll over pro-rata**. Requests are honoured by **total shares requested, not by scanning individual requests**. Processed funds wait in the TrancheVault until the lender calls `disburse()`. [V: [Redemption](https://docs.huma.finance/products/huma-institutional/tranches/redemption)]
- **Redemption (Huma 2.0):** no-lockup funds redeem any time, targeting 1 business day with a 7-day maximum, first-come-first-served, auto-sent to the wallet. 3- and 6-month lockups cannot exit early. A secondary exit exists through PST swaps on Jupiter. [S: [Withdrawal](https://docs.huma.finance/products/huma-2.0/user-manuals/withdrawal)]
- **Storage design (EVM v2, AGPL):** `epochRedemptionSummaries[epochId]` holds aggregates; `LenderRedemptionRecord{nextEpochIdToProcess, numSharesRequested, principalRequested, totalAmountProcessed, totalAmountWithdrawn}` is **settled lazily** on the lender's next interaction. [V: [TrancheVaultStorage.sol](https://github.com/00labs/huma-contracts-v2/blob/main/contracts/liquidity/TrancheVaultStorage.sol), [EpochManager.sol](https://github.com/00labs/huma-contracts-v2/blob/main/contracts/liquidity/EpochManager.sol)]
- **Loss handling:** up to **16 first-loss covers** per pool. A default draws `min(firstLossCoverCap, firstLossCoverRate × defaultAmount)` from each cover in priority order (Huma's docs list borrower collateral, insurance, operator reserve), then junior, then senior. **Recoveries go back in reverse order.** Cover yield is reinvested into the cover, admin fees top covers up to their cap, and covers must reach `minLiquidity` before the pool activates. [V: [First Loss Covers](https://docs.huma.finance/products/huma-institutional/first-loss-covers)]
- **KYC:** Institutional requires accredited investors and KYC/KYB; signed lenders join an on-chain approved list. 2.0 is permissionless. [S: [Halborn audit page](https://www.halborn.com/audits/huma-finance/solana-programs-060022)]
- **Source and audits:** the Solana programs are private (404 on GitHub). Halborn audited the permissionless Solana program, 10 to 24 March 2025. EVM v2 is public. [V/S]
- **For MUTAV:** (a) aggregate-per-epoch plus lazily settled per-user redemption records make queue settlement O(1) per epoch; (b) a first-loss layer with a per-event cap and rate, recovery in reverse order and a `minLiquidity` activation gate maps to an operator or agency first-loss bucket in front of investor NAV.

> **Since this research:** No first-loss tier or tranching was adopted. MUTAV may add its own BRS to the reserve as a backstop contribution, booked without minting shares ([ADR 0024](../decisions/0024-unsolicited-money-and-backstop.md)).

**Maple and Syrup on Solana**

- syrupUSDC on Solana is a **CCIP Cross-Chain Token** (Chainlink CCT, burn/mint, rate-limited) bridged from Ethereum. There is **no native Solana pool program**: primary redemption happens on Ethereum, and Solana liquidity comes from Kamino. [S: [Maple blog](https://maple.finance/insights/syrupusdc-expands-to-solana), [CoinDesk](https://www.coindesk.com/business/2025/06/05/crypto-lender-maple-finance-expands-to-solana-with-chainlink)]
- On Ethereum, the `WithdrawalManager` is a **FIFO queue**, usually cleared within 24h and within 30 days at most. **Interest keeps accruing while a request waits**, and assets are pushed to the lender. An upgrade removed the one-active-request-per-user limit. [S: [Maple upgraded WM](https://maple.finance/insights/upgraded-withdrawal-manager-contract), [Cork "time to cash"](https://www.cork.tech/blog/measuring-time-to-cash-in-maple-vaults)]
- **For MUTAV:** the closest reference for FIFO queue semantics, including the public "max 30 days, usually under 24h" wording, and the idea of a secondary DEX exit for users who want to skip the queue.

**Ondo USDY on Solana**

- The yield-accreting price rises daily according to a Yield Tracker. Mint and redemption are primary-market with KYC; redemption pays USD by wire on T+1; primary mint and redeem run 24/5, transfers 24/7. [S: [Rock'n'Block overview](https://rocknblock.io/blog/ondo-finance-technical-overview-token-architecture-and-risks), [Ondo USDY](https://ondo.finance/usdy)]
- One source says Ondo uses Token-2022 **transfer hooks** checking allowlist, blocklist and sanctions lists, but that describes Ondo's EVM USDY and the Global Markets Solana program ([`ondoprotocol/global-markets-solana`](https://github.com/ondoprotocol/global-markets-solana)). Which token program the Solana USDY mint uses was **not verified**. [S/unverified]
- **For MUTAV:** an accreting price with a posted oracle as the NAV display model, and the split of primary (KYC'd) mint and redeem from free secondary transfer.

**Cover pools on Solana** (third-party names kept)

- **Drift Insurance Fund** is the most battle-tested pool of its kind on Solana. Stakers hold IF shares funded by a revenue pool swept hourly. Unstaking uses a **13-day cooldown with one pending request per vault**; the stake earns nothing during the cooldown, and a new request restarts the clock. It is the protocol's first solvency backstop. [S: [Drift IF docs](https://docs.drift.trade/insurance-fund/insurance-fund-staking)] Drift itself lost **about $280M on 1 April 2026** to an admin takeover: the attacker used pre-signed **durable-nonce** transactions obtained by social-engineering 2 of 5 multisig signers, and took over within 4 slots. The IF was reported untouched. [S: [Bankless Times](https://www.banklesstimes.com/articles/2026/04/02/drift-protocol-suffers-280m-exploit-after-admin-takeover/), [Coinfomania](https://coinfomania.com/drift-protocol-reveals-nonce-attack-behind-280m-exploit/), [crypto.news](https://crypto.news/drift-says-insurance-fund-untouched-after-attack-withdrawals-to-resume/)]
- **Lulo Protected and Boosted:** *Protected* deposits get about 4% with automatic payouts if a covered venue is exploited, and no claims process. *Boosted* deposits get about 6.5%, **take first loss**, and have a **48h withdrawal delay** so coverage can settle. [S: [Solana Compass](https://solanacompass.com/projects/Lulo), [Gami thesis](https://paragraph.com/@gami-capital/gami-capital-%E2%80%94-public-thesis-lulo)]
- **Amulet (AmuShield):** Solana-native smart-contract and depeg cover backed by a "Safety Fund"; current traction unclear. [S: [Solana Compass category](https://solanacompass.com/projects/category/defi/insurance)]
- **Reflect (USDC+):** each strategy is backed by an on-chain "Global Insurance" pool; USDC is routed to Kamino and Jupiter lending; a16z CSX led the seed. [S: [Blockworks](https://blockworks.com/news/reflect-stablecoin-infra-raise), [Solana Compass](https://solanacompass.com/projects/reflect-money)]
- No discretionary-claims mutual of meaningful size (Nexus- or Sherlock-style) turned up on Solana. [I]
- **Solstice eUSX (YieldVault):** 7-day minimum lock and 7-day redemption cooldown (24h for ≤$1k). eUSX is burned at request and earns nothing during the cooldown; staking stSLX skips the cooldown; eUSX trades on DEXs at a discount. [S: [Solstice docs](https://docs.solstice.finance/solstice-for-users/eusx-powered-by-yieldvault)]
- **Perena:** USD* is the LP token of a hub-and-spoke stable AMM (Numéraire) and uses the Token-2022 interest-bearing extension so balances display accrued yield. [S: [Gate](https://www.gate.com/learn/articles/what-is-perena/5917), [Solana Compass](https://solanacompass.com/projects/perena)]
- **For MUTAV:** a cooldown during which the redeemer earns nothing but still bears losses (Drift IF, Solstice), and a first-loss tier with a withdrawal delay long enough to settle claims (Lulo). Both make claims payable before exits. Solstice's size-tiered cooldown is a good UX and solvency compromise. Perena's interest-bearing extension is display-only and does not fit a NAV that can go down on claims. [I]

### Vault and share-accounting infrastructure

**Solana Vault Standard (SVS).** [V: [repo](https://github.com/solanabr/solana-vault-standard) (GitHub reports MIT; README text elsewhere says Apache-2.0, so check before copying), [DeepWiki](https://deepwiki.com/solanabr/solana-vault-standard), [solana.com "ERC4626 on Solana"](https://solana.com/developers/evm-to-svm/erc4626)]

- **12 Anchor programs on devnet**, plus a TS SDK (`@stbr/solana-vault`) and a CLI. Shares are a **Token-2022 mint** at PDA `["shares", vault]`. Inflation attacks are blocked with a **virtual offset** (`decimals_offset = 9 - asset_decimals`), rounding always favours the vault, every instruction takes slippage bounds (`min_shares_out` / `min_assets_out`), and CPI-composable previews return data through `set_return_data`.
- **SVS-1/2:** live-balance vs **stored-balance** designs. Stored balance (`sync()` by authority) resists donation and timing attacks, which MUTAV wants because NAV must move on booked guarantee fees and claims, not raw token balances. [I]
- **SVS-9 Allocator:** a curator CPIs into up to 10 child vaults, holds an `idle_vault`, and keeps an **`idle_buffer_bps` minimum held liquid for withdrawals**; each `ChildAllocation` records the `child_program` for CPI validation.
- **SVS-10 Async (ERC-7540):** request, fulfil, claim, with **per-user PDAs** `["redeem_request", vault, owner]` and `["deposit_request", vault, owner]`. Redeem requests lock shares in a `share_escrow` PDA; `fulfill_redeem` burns the shares and moves assets into a per-user `claimable_tokens` PDA. `total_pending_deposits` is kept out of AUM. `fulfill` accepts an optional `oracle_price` checked against `max_deviation_bps` (default 5%). **`cancel_after` is an operator-liveness timeout.** `OperatorApproval` gives granular delegation.
- **SVS-11 Credit Markets:** oracle NAV with `max_staleness` (60 to 86,400 s), a **KYC attestation check against the Solana Attestation Service (or Civic)** with a `required_attestation_type`, `FrozenAccount` PDAs set by a separate `compliance_officer`, investment windows, `minimum_investment`, `draw_down`/`repay`, `reject_deposit(reason_code)`, and a **timelocked oracle change** (`pending_oracle`, `oracle_change_at`).
- **SVS-12 Tranched:** 2 to 4 tranches over one asset pool, each with its own Token-2022 mint, `priority`, `subordination_bps`, `target_yield_bps` and `cap_bps`. `record_loss` applies losses junior-first. The **subordination check gates deposit, redeem, rebalance and config changes, but not losses**. Its worked example ("max junior redeemable = allocation − required") is exactly surplus-gated redemption.
- **Maturity:** "10 internal audit rounds… No external audit", and `SECURITY.md` says NOT AUDITED. Last push 2026-04-10, 24 stars. A design template, not an audited dependency. [V]

**Kamino kVaults.** [V: [kvault repo](https://github.com/Kamino-Finance/kvault) (mainnet `KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd`), [VaultState](https://github.com/Kamino-Finance/kvault/blob/main/libs/kvault-interface/src/state/vault_state.rs), [docs](https://kamino.com/docs/products/lending-vaults), [kvault-bot](https://github.com/Kamino-Finance/kvault-bot)]

- A single-asset vault mints shares. `VaultState` tracks `token_available` (idle), `shares_issued`, `prev_aum_sf` and fee accrual.
- **Allocation:** up to 25 `VaultAllocation` entries `{reserve, ctoken_vault, target_allocation_weight, token_allocation_cap, ctoken_allocation, last_invest_slot}`, plus `unallocated_weight` and `unallocated_tokens_cap` (the idle float is itself a weighted allocation). `invest` is a **permissionless crank** rate-limited by `min_invest_delay_slots` and `min_invest_amount`. Reserves can be restricted to a whitelist.
- **Redemption:** instant, from idle funds or pulled from a named reserve in the same transaction; optional withdrawal penalties.
- **Other fields:** `first_loss_capital_farm`, a **`permissioning_authority`** (an extra signer required for user deposits and withdrawals, i.e. a co-signed KYC gate), a soft `deposit_cap`, and a **separate `allocation_admin`** distinct from `vault_admin_authority`.
- **For MUTAV:** the weighted allocation table with caps and an idle bucket, the rate-limited crank, the separate allocation-admin role, and the co-signer as the cheapest KYC gate.

**Drift vaults.** [V: [velocity-exchange/drift-vaults](https://github.com/velocity-exchange/drift-vaults) (Apache-2.0; moved from drift-labs), [withdraw_request.rs](https://github.com/velocity-exchange/drift-vaults/blob/master/programs/drift_vaults/src/state/withdraw_request.rs)]

- A per-depositor PDA (`VaultDepositor`) stores the shares and **one embedded `WithdrawRequest{shares, value, ts}`**; only one request can be in flight. `Vault.redeem_period` sets the wait.
- **Fairness rule:** `calculate_shares_lost` pays **min(value at request, value at withdrawal)**. If NAV rose while waiting, the redeemer does not get the gain; if NAV fell, the redeemer takes the loss.
- Also: `max_tokens` capacity, `permissioned` flag, `min_deposit_amount`, `shares_base` rebase for dust, and a hurdle rate on the profit share.
- **For MUTAV:** a price lock at `min(request, fill)` stops queue-gaming (request an exit while claims are pending, then collect upside) and makes queued redeemers share in claims.

> **Since this research:** MUTAV prices each fill at the on-chain NAV at execution, bounded by a `nav_bounds (min, max)` range the admin composes when proposing the fill, plus the NAV-move guard evaluated inline in fills ([ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)).

**Voltr, Meteora, JLP.**

- **Voltr:** a vault plus **adaptor** programs, each isolating one external protocol so a failing adaptor cannot touch other strategies. The TS SDK is public; the core program repo was not found. [S: [Solana Compass](https://solanacompass.com/projects/voltr), [vault-sdk](https://github.com/voltrxyz/vault-sdk)]
- **Meteora Dynamic Vaults:** an off-chain keeper ("Hermes") rebalances across about 6 lending protocols each minute, **caps any single protocol at 30%**, and **pulls funds when utilization crosses risk thresholds**. [S: [Meteora docs](https://docs.meteora.ag/product-overview/other-products/dynamic-vault-overview/what-is-a-dynamic-vault)]
- **Jupiter JLP:** not researched in depth; its AUM-from-oracle accounting targets perps LPs. [I]

The adapter boundary and allocation design are covered in depth in [Multi-asset vaults on Solana](multi-asset-vaults-on-solana.md).

### Yield venues and CPI

| Venue | Devnet? | CPI complexity | SDK | Notes |
|---|---|---|---|---|
| **Jupiter Lend Earn** | **Yes**: lending `7tjE28izRUjzmxC1QNXnNwcc4N82CNYCexf3k8mw67s3`, liquidity `5uDkCoM96pwGYhAUucvCzLfm5UcjVRuxz6gH81RnRBmL` [V: [cpi.md](https://github.com/jup-ag/jupiter-lend/blob/main/docs/earn/cpi.md)] | **Low**: `deposit`/`withdraw` with fixed discriminators and about 17 accounts; shares are exchange-rate-accruing fTokens | TS SDK exposes CPI account contexts ([sdk.md](https://github.com/jup-ag/jupiter-lend/blob/main/docs/earn/sdk.md)) | Code4rena contest Feb 2026 ([code-423n4/2026-02-jupiter-lend](https://deepwiki.com/code-423n4/2026-02-jupiter-lend)) |
| **Kamino klend** | **Yes**, same ID `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` [V: [klend README](https://github.com/Kamino-Finance/klend)] | Medium: needs a `refresh_reserve` in the same transaction plus oracle accounts [I] | `@kamino-finance/klend-sdk` | A public USDC devnet market is **unverified**; you may need to init your own market [S: [mintlify deploy](https://www.mintlify.com/kamino-finance/klend/operations/deployment)]. A kVault CPI is an alternative |
| **marginfi v2** | **Yes**, `devnet` feature ID `neetcne3Ctrrud7vLdt2ypMm21gZHGN2mCmqWaMVcBQ` [V: [id-crate](https://github.com/0dotxyz/marginfi-v2/blob/main/id-crate/src/lib.rs)] | Medium-high: needs a per-owner `MarginfiAccount`; health checks pass banks and oracles as remaining accounts | `@mrgnlabs/marginfi-client-v2` | Repo moved to the `0dotxyz` org |
| **Save (ex-Solend)** | Unverified | Medium | legacy | Not investigated [I] |

The research recommended Jupiter Lend Earn as a first USDC adapter and Kamino second, tested on a mainnet fork (Surfpool or LiteSVM with cloned accounts), because devnet venues may not accept test assets. [I]

> **Since this research:** These are USDC venues and none lists BRS, so none applies to the BRS-only pilot. The first adapter candidate is Etherfuse TESOURO, and every adapter starts at a cap of zero ([ADR 0018](../decisions/0018-brs-only-pilot-reserve.md), [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), proposed).

### Admin and operations

- **Squads v4** (`SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`, same on devnet; AGPL-3.0; verifiable builds). The `Multisig` account has `threshold`, `members` with permission masks (Initiate, Vote, Execute), `config_authority`, and **`time_lock: u32` (seconds, `MAX_TIME_LOCK` = 3 months)**, enforced between approval and execution. It supports spending limits, batches, and `stale_transaction_index` (config changes invalidate in-flight proposals). SDK: `@sqds/multisig`. [V: [v4 repo](https://github.com/Squads-Protocol/v4), [multisig.rs](https://github.com/Squads-Protocol/v4/blob/main/programs/squads_multisig_program/src/state/multisig.rs)] Reported audits include Trail of Bits, OtterSec and Neodyme (unverified).
- **Incident lessons** [S, then I]: Drift (about $280M, 2-of-5 multisig, pre-signed durable-nonce transactions, admin transfer and drain in 4 slots) and CrediX on Sonic (attacker added as a signer 6 days earlier, then granted admin and bridge roles) were both governance-layer failures. Mitigations:
  1. The upgrade authority and the slow admin (fee parameters, venue whitelist, oracle change, authority transfer) go behind a **Squads vault with a time lock of 24 to 72h**.
  2. **Split roles** in program state, as Kamino and SVS-11 do: a timelocked multisig authority, a bounded allocation admin, an operator (KMS-held), a compliance officer, and a pauser that can only pause.
  3. **No instruction lets any admin move reserve money to an arbitrary address.** Money flows only to whitelisted venues or claim accounts.
  4. Time-lock oracle and authority changes inside the program too (SVS-11 `pending_oracle`/`oracle_change_at`).
  5. Use a higher threshold, hardware wallets, review-before-sign tooling, alerts on member or threshold changes, and no durable-nonce signing for admin keys.

> **Since this research:** The roles are operator, reserve admin (Squads, time-locked), pauser, and up to three pause-only guardians. Operator and pauser changes are two-step (`propose_role`, then `accept_role` by the new key, with an expiry), and so is the admin handover ([ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md)). Risk-reducing emergency actions on adapters are instant; adding or raising risk goes through the admin time lock ([ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md)).

### KYC and permissioning options

| Pattern | Who | Cost | Fit |
|---|---|---|---|
| Program-issued pass PDA (`CredixPass`) | Credix | Low | Good, but you become the issuer registry |
| **SAS attestation check** (`22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG`; Credential, Schema, Attestation with nonce and expiry; optionally tokenized as a soulbound Token-2022) | SVS-11, Solana Foundation [V: [SAS repo](https://github.com/solana-foundation/solana-attestation-service)] | Low-medium | A KYC provider or MUTAV issues the attestation; the program checks `required_attestation_type` |
| Co-signer `permissioning_authority` on deposit and withdraw | Kamino kVault [V] | Lowest | The backend co-signs after off-chain KYC |
| Token-2022 **transfer hook** allowlist on the share mint | Ondo (per [S]), Solana Security Token Standard | Higher (every transfer needs extra accounts) | Only if shares must stay KYC'd on secondary markets |
| Token-2022 default-frozen or freeze authority, or `FrozenAccount` PDA | SVS-11 [V] | Low | Needed for sanctions or court orders |

### Async deposit and redeem patterns (ERC-7540 style)

The requirement at the time: `request_deposit` / `request_redeem`, a fill at a settled NAV, then the user claims shares or assets.

| Protocol | Async deposit? | Async redeem? | Evidence |
|---|---|---|---|
| **solana-foundation/vault** | **Yes**: `create_deposit_request`, `approve_request`/`reject_request`, `claim` | **Yes** | [V: [repo](https://github.com/solana-foundation/vault), [SEQUENCES.md](https://github.com/solana-foundation/vault/blob/main/programs/async_vault/docs/SEQUENCES.md)] |
| **SVS-10** | **Yes**: `request_deposit`, `fulfill_deposit`, `claim_deposit` | **Yes** | [V: [SVS-10.md](https://github.com/solanabr/solana-vault-standard/blob/main/docs/SVS-10.md)] |
| **SVS-11** | **Yes**: request, manager `approve_deposit`/`reject_deposit(reason_code)`, claim, with KYC and an investment window | **Yes** | [V: [SVS-11.md](https://github.com/solanabr/solana-vault-standard/blob/main/docs/SVS-11.md)] |
| **Centrifuge** | **Yes on EVM**: `requestDeposit`, hub approves an asset amount per epoch (pro-rata), shares issued at `pricePoolPerShare`, claim; cancel is itself async | Yes | [V: [BatchRequestManager.sol](https://github.com/centrifuge/protocol/blob/main/src/vaults/BatchRequestManager.sol)]. No Solana program; the Solana presence is a DeFi-wrapped token [S: [RockawayX](https://www.rockawayx.com/insights/centrifuge-debuts-400m-tokenized-treasury-fund-on-solana-defi)] |
| **Ondo USDY** | **Yes, off-chain primary**: tokens claimed 40 to 50 days later (Reg S lockup) | Yes, T+1 USD wire | [S: [Rock'n'Block](https://rocknblock.io/blog/ondo-finance-technical-overview-token-architecture-and-risks)] |
| **Credix** | No | **Yes**: withdraw epochs | [V: docs.rs] |
| **Huma** (EVM v2) | No: `TrancheVault.deposit()` mints synchronously | **Yes**: epoch batch | [V: [TrancheVault.sol](https://github.com/00labs/huma-contracts-v2/blob/main/contracts/liquidity/TrancheVault.sol)] |
| **Maple / Syrup** | No | **Yes**: FIFO `WithdrawalManager` | [S] |
| **Drift vaults** | No | **Yes**: `request_withdraw` + `redeem_period` | [V] |
| **Kamino kVault** | No | No (instant) | [V] |

Only the two standard-suite codebases implement async deposits on-chain on Solana; production credit protocols make deposits synchronous and only redemptions async. [V/I] MUTAV wants async deposits anyway: NAV must reflect booked guarantees, guarantee fees and claims before new money enters, KYC can be checked at request and at fill, and deposits can be refused when coverage capacity is not needed. [I]

**Storing pending requests**

| Pattern | Used by | Multiple requests per user? | Notes |
|---|---|---|---|
| One account per request (keypair) | solana-foundation/vault | Yes | FIFO IDs stamped from a vault counter; the request stores owner, type, state, amount, price, created_at, `nav_update_version`, operator [V: [request.rs](https://github.com/solana-foundation/vault/blob/main/programs/async_vault/src/state/request.rs)] |
| One PDA per (vault, user) per direction | SVS-10, SVS-11 | No | Users must claim or cancel before requesting again [V] |
| Embedded in a per-user position | Drift `VaultDepositor` | No | Cheapest; couples request and position [V] |
| Per-investor PDA per epoch plus an epoch account | Credix | One per epoch | Pro-rata at epoch level [V] |
| Epoch aggregate plus lazy per-user record (EVM) | Huma, Centrifuge | n/a | O(1) epoch processing [V] |

The protocols note recommended one PDA per request seeded by a vault ticket counter, which keeps FIFO semantics and many requests per user while staying derivable for indexers and the UI. [I] The stack note instead leaned to epoch accounts (pro-rata within an epoch, FIFO across epochs) for O(1) fills, keeping strict per-request FIFO as the option if the product required it. [I]

> **Since this research:** MUTAV kept strict FIFO with one PDA per request, seeded by a global sequence number; a client whose sequence was taken by a concurrent request retries with the next one. The pilot fills whole requests only; ADR 0010's partial fills come in a later upgrade ([ADR 0008](../decisions/0008-uniform-capital-flow-and-pause-scope.md), [ADR 0010](../decisions/0010-partial-fills-at-queue-head.md), [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)). Fills are executed by the reserve admin, not the operator.

**Fixing the fill price**

- **solana-foundation/vault:** `update_nav(u128)` bumps `nav_version`; `approve_request` snapshots `vault.nav` into `request.price` and must match the request's `nav_update_version`, so an approval cannot be replayed across a NAV change. NAV freshness is not enforced. [V]
- **SVS-10:** price fixed at fill time, from the vault ratio or an `oracle_price` bounded by `max_deviation_bps`. [V]
- **SVS-11:** oracle NAV with `max_staleness`, timelocked oracle changes. [V]
- **Centrifuge, Huma, Credix:** price fixed per epoch. **Drift:** `min(value at request, value at fill)`. [V]
- The recommendation for MUTAV was per-fill pricing from an on-chain NAV, with a version check, a staleness check and Drift's `min` rule for redemptions. [I]

**Cancellation and liveness**

- **solana-foundation/vault:** sync cancel while pending; with queues enabled, cancels leave a **tombstone** so the FIFO sequence has no gap, and anyone can later call `skip_canceled_queue_request`, returning rent to the requester. [V: [SubscriptionQueue.md](https://github.com/solana-foundation/vault/blob/main/programs/async_vault/docs/extensions/SubscriptionQueue.md)]
- **SVS-10:** synchronous cancel (ERC-7887 baseline). With `cancel_after > 0`, **expired requests can be cancelled even while paused**, and the operator can no longer fill them. This is the liveness escape. [V]
- **Centrifuge:** async cancel. **Huma:** free cancel before epoch processing. **Drift:** cancel allowed with shares-lost logic. [V]

> **Since this research:** Holders keep an exit right: a wallet holding shares can always request a redemption, even after leaving the allowlist ([ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)). If the head redemption waits longer than `max_queue_wait_secs`, anyone may fill it under the same rules, so exit does not depend on the admin acting. The field ships at 0 (off) and the path is built before any outside capital ([ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md)). Cancel and claim instructions stay open under pause ([ADR 0008](../decisions/0008-uniform-capital-flow-and-pause-scope.md)).

**Keeping pending money out of the reserve**

- **solana-foundation/vault:** a physically separate `pending_vault` token account; deposits move into the reserve only at approval, redemptions move out at approval and to the user at claim. [V]
- **SVS-10:** accounting-only separation through `total_pending_deposits`; filled redemptions go to per-user `claimable_tokens` PDAs. [V: [request_deposit.rs](https://github.com/solanabr/solana-vault-standard/blob/main/programs/svs-10/src/instructions/request_deposit.rs)]
- The recommendation was physical separation, so `stable_assets` for the coverage check can never include pending deposits or approved-but-unclaimed redemptions, which count as liabilities. [I] MUTAV's design follows this with separate `pending_deposits`, `pending_redemptions` and `reserve` token accounts (see [Accounts](../architecture/accounts.md)).

**ERC-7540 ports.** solana-foundation/vault is "inspired by ERC-7540", with TLV extensions (fees, minimums, pausable flows, FIFO queues); partial fills, an asset cap, lock-ups and deposit/redeem netting are specified but not built, and it **explicitly rejects slippage parameters** for async NAV flows. [V: [DESIGN_DECISIONS.md](https://github.com/solana-foundation/vault/blob/main/DESIGN_DECISIONS.md)] SVS-10 is "ERC-7540 equivalent with synchronous cancellation (ERC-7887)"; SVS-11 adds manager approval, KYC and compliance. Neither is a ratified SIMD or sRFC standard; solana-foundation/vault references sRFC-37 (Token ACL) for KYC'd share tokens. [V/I]

### Production-grade considerations for a real pilot

| Area | Pattern or fact | Source |
|---|---|---|
| Base codebase maturity | solana-foundation/vault: Cantina APEX scan (22 June 2026), "not audited for mainnet". SVS: internal rounds only. Both are templates, so MUTAV needs its own audit | [V] |
| Audit prior art | Squads v4 (OtterSec and others, verifiable build), Huma Solana (Halborn, March 2025), Jupiter Lend (Code4rena, February 2026). Budget a full audit plus a contest or bug bounty before real money | [V/S] |
| Verifiable builds | `solana-verify` / `anchor build --verifiable` so the deployed hash matches source | [V] |
| The template's own caveat | solana-foundation/vault: "a compromised authority can act instantly via `WithdrawAssets`/`UpdateNav`… a multisig authority remains the real mitigation." MUTAV should not copy an unrestricted withdraw; outflows go only to whitelisted adapters and claim accounts, and NAV changes are bounded | [V, then I] |
| Asset-mint risk | solana-foundation/vault warns that an asset `PermanentDelegate` can drain the reserve and a freeze authority can freeze the reserve or `pending_vault`; non-zero TransferFee mints are rejected. BRS has a freeze authority | [V] |
| Testing | Both suites use LiteSVM; solana-foundation/vault uses Codama. Add fuzzing (Trident) and invariant tests such as `reserve ≥ coverage_required` after every fill | [V/I] |
| Events and indexing | SAS emits events by self-CPI to avoid log truncation; do the same (`emit_cpi!`, as kvault does) | [V] |
| Upgrade-safe layout | Reserved padding in every account (kvault `padding_3: [PodU128; 230]`, SVS `_reserved: [u8; 64]`) | [V] |

> **Since this research:** Account padding was sized before the layout freeze so the guarantee and claim lifecycles of ADR 0012 fit without a migration (ADR 0019, recorded with the layout change), and pilot-unused state was removed for the freeze ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)).

### BRL context on Solana (as of 2026-09-30)

The [BRL currencies on Solana](brl-currencies-on-solana.md) page, researched a day later, supersedes the figures below where they differ.

- **BRS:** mint `BRSxQRUaGswjLs7ewcH7uXj3r7SgmfKSSLLXyCKHZtUo`, classic SPL, 6 decimals, with a freeze authority, supply about 2,885. **No DEX pairs** (DexScreener API: 0), Jupiter reported **28 holders and no liquidity**, and no lending market listing. [V: DexScreener API and Jupiter token API, 2026-09-30]
- **BRZ (Transfero)**, mint `FtgGSFADXBtroxq8VCausXRr2of47QBf5AS1NtZCu4GD`: 735 holders, about $1.8k of routable AMM liquidity, 0 indexed pairs. [V] Its one real DeFi use is **Loopscale's BRL credit market** (March 2026), lending BRZ against Etherfuse TESOURO collateral. [S: [Solana roundup March 2026](https://solana.com/news/solana-ecosystem-roundup-march-2026), [Solana Compass](https://solanacompass.com/projects/loopscale)] No Kamino, marginfi or Jupiter Lend BRL reserve was found. [I]
- **BRLA (Avenia):** Polygon, Celo, Gnosis, Base and Ethereum; no Solana deployment found. [S: [RWA.xyz](https://app.rwa.xyz/assets/BRLA), [CB Insights](https://www.cbinsights.com/company/brla)]
- **Etherfuse TESOURO:** mint `BRNTNaZeTJANz9PeuD8drNbBHwGgg7ZTjiQYrFgWQ48p`, Token-2022, described as backed by Brazilian LTNs tracking Selic with about 11.6 to 13% BRL yield, NAV-priced, redeemable for fiat at NAV any business day with KYC for direct mint; about $83k liquidity and 128 holders on Jupiter. [V: Jupiter API; S: [Etherfuse Stablebonds](https://etherfuse.com/products/stablebonds), [app page](https://app.etherfuse.com/bonds/BRNTNaZeTJANz9PeuD8drNbBHwGgg7ZTjiQYrFgWQ48p)]

> **Since this research:** The next day's on-chain read put TESOURO's rate at 11.58% against a 13.75% Selic, which does not fit a Selic-tracking bond; its underlying is unconfirmed (see [BRL currencies on Solana](brl-currencies-on-solana.md)). Etherfuse publishes no redemption settlement time and mints and redeems against USDC, not BRS ([ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md)).

- **BRD:** a Tesouro-backed, yield-sharing BRL stablecoin announced January 2026 by a former Brazilian central bank official, aimed at institutions. [S: [CoinDesk](https://www.coindesk.com/business/2026/01/07/former-brazil-central-bank-official-unveils-real-pegged-stablecoin-with-yield-sharing)] A Token-2022 "Brazilian Real Digital (BRD)" mint `GNzvFdZu…eBZj` exists on Solana with 72 holders; the link to the same issuer was not confirmed. [V/unverified]
- **How BRL reserves earn yield** [I]: fiat-backed BRL issuers keep the Selic or CDI carry themselves and do not pass it to holders; BRD is the stated exception. The options listed for MUTAV were no yield on the BRS reserve during the pilot, allocating idle float to TESOURO (mark-to-market, redemption latency, no on-chain TESOURO↔BRS path), off-chain Tesouro or CDI reflected through an attested oracle, or Loopscale BRZ lending (needs a BRZ↔BRS leg that does not exist). The implication was to ship the yield module disabled for BRS.

> **Since this research:** The reserve's income is Nora's issuer partnership revenue, paid in BRS into an income inbox and swept by the operator, not yield from a venue ([ADR 0017](../decisions/0017-brs-income-intake.md), [ADR 0018](../decisions/0018-brs-only-pilot-reserve.md)).

- **Nora Finance (BRS issuer):** "Nora Finance, Inc. · São Paulo"; legal entity and licensing not disclosed on the pages fetched. [V: [nora.finance](https://www.nora.finance/)] "1:1 Real-backed, fully reserved, attested on a public cadence"; primary mint and redeem through licensed, KYB-verified "Nora Approved Minters" (names not published) via a PIX-settled API (`POST /v2/intents/onramp`); only wallets authorized by the organization's `BRSWhitelister` contract receive mints or burns, with per-mint bounds and daily caps enforced on-chain on EVM; Solana-side mechanics undocumented. [V: [site](https://www.nora.finance/), [BRS token docs](https://www.nora.finance/docs/integrate/core-concepts/brs-token)] Proof of reserves through Fact Finance; composition and custodian not disclosed. [V: [transparency](https://www.nora.finance/transparency)] Partners shown include Uniswap Foundation, Pinheiro Neto Advogados, Fact Finance and Âmbar; traction claims of 13 neobanks waiting, 4 testing, "~$200M demand" and "10K+ BRS minted". [V: site; S] The same EVM address `0x0000006238e3C7797Ae71827da303560bae1B125` is used on Ethereum, Base and Polygon, with 6 decimals on every chain. [V: [Nora-Finance/brs-assets](https://github.com/Nora-Finance/brs-assets)]
- **Risk notes** [I]: the freeze authority means Nora (or a regulator via Nora) can freeze the reserve's token accounts, which belongs in the risk disclosure and in monitoring; the Solana float is very small; minters and licensing are undisclosed. A program PDA probably does not need whitelisting just to hold BRS, since classic SPL has no transfer hook; primary PIX on- and off-ramp would run through a whitelisted MUTAV or partner wallet.
- **Brazilian protocols using BRL stablecoins as vault assets on Solana:** Loopscale's BRL market is the only production BRL-denominated credit venue found (Loopscale is US-built). Credix settled in USDC and moved to a FIDC and BNPL model. SVS is Brazilian-built but ships no BRL deployment. No Brazilian protocol running a BRS or BRZ tokenized reserve on Solana was found, so MUTAV would plausibly be the first; that also means there is no liquidity to lean on. [S/I]

### Patterns to adopt (ranked at the time)

1. Fork the solana-foundation/vault async model: request, approve or reject, claim; a physically separate pending account; NAV snapshotted at approval with a version match; derivable per-request PDAs. [V/I]
2. FIFO through monotonic ticket IDs, tombstoned cancels and a permissionless skip, for both subscriptions and redemptions; add partial fills so a large head request cannot block. [V/I]
3. A surplus gate as a post-state invariant on redemption fills (`reserve_after ≥ coverage_required`, SVS-12 subordination math), **never applied to claim payments**; approved-unclaimed redemptions count as liabilities; deposit approval can be gated on a capacity cap. [V/I]
4. NAV discipline: compute NAV on-chain where possible; bound any operator-supplied value with a deviation and staleness check; time-lock oracle changes; virtual-offset shares with rounding in the reserve's favour. [V]
5. Admin hardening: Squads v4 with a time lock as upgrade and config authority; split roles; no unrestricted withdraw; alerts on multisig changes; verified build, external audit and a bug bounty. [V/S]
6. A liveness escape (SVS-10 `cancel_after`) that works while paused. [V]
7. A first-loss layer ahead of investor NAV with recoveries repaid in reverse order (Huma, Lulo). [V/S]
8. KYC and asset-risk gating: an attestation check at request and at fill, a `FrozenAccount` PDA for compliance, explicit handling of the BRS freeze authority, and yield adapters behind a Voltr-style interface, shipped disabled for BRS. [V/I]

Also worth borrowing: Huma and Centrifuge epoch aggregates if per-ticket fills get too expensive, Maple's published queue wording, kVault's weighted allocation table and crank once a second asset exists, and Solstice's size-tiered cooldown.

> **Since this research:** Items 1 to 5 are reflected in the design, with fills priced at the on-chain NAV inside admin-set `nav_bounds` rather than at an authority-set NAV ([ADR 0004](../decisions/0004-onchain-nav-internal-accounting.md), [ADR 0005](../decisions/0005-solvency-gate-scope.md), [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)). The solvency gate covers capital flows and new guarantees and never blocks a claim payment, and the coverage target adds an admin-set stress buffer ([ADR 0022](../decisions/0022-coverage-stress-buffer-underwater-reserve.md)). Item 6 became the cooldown exit of [ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md). Item 7 was not adopted. For item 8, KYC is off-chain with an on-chain allowlist.

## Part 2: the stack

### Program framework

**State of the field on 2026-09-30** [V]

- **Anchor 1.x is stable.** Releases: v1.0.0 (2026-04-02), 1.0.1 to 1.0.3, 1.1.0 to 1.1.2 (June), **v1.2.0 (2026-09-04)**. The 2026-09-14 back-ports (0.30.2, 0.31.2, 0.32.2) were TS-only patches so `AnchorProvider` can read v1 transactions. **Stewardship moved to OtterSec**: the canonical repo is `otter-sec/anchor`, and `solana-foundation/anchor` redirects there. The installation docs pin Anchor 1.2.0 with Solana CLI 4.1.2.
- **Breaking changes in 1.0:** Solana 3.x crates (`solana-program` gone from user deps); TS package renamed `@coral-xyz/anchor` to `@anchor-lang/core`; the IDL moves to the Program Metadata program; `CpiContext::new` takes a program Pubkey; **duplicate mutable accounts are rejected by default** (opt in with `dup`); `declare_program!` renames `utils` to `parsers`; `#[interface]` removed; one `#[error_code]` block only; the CLI no longer shells out to `solana`; `anchor test` defaults to Surfpool; `anchor init` defaults to a LiteSVM Rust test template.
- **Additions in 1.1 and 1.2:** `Migration<'info, From, To>` for account-schema migrations; `anchor deploy --security-metadata`; `--arch`/`--tools-version`; a generated TS error-constants file; a Token-2022 pausable helper; `reallocate` helpers; zero-copy undersize errors instead of panics; rejection of all-zero discriminators; owner and discriminator re-checks on `LazyAccount` after a CPI; `program_id` verification of CPI return data. `anchor-lang` **MSRV is Rust 1.89** (the install page's `rustc 1.85` example is stale).
- **Unreleased on master then:** a `solana-v4` feature, `NO_DNA` CLI mode, and "macro hygiene to address potential issues with key validation" (#5105). Watch for 1.2.1 or 1.3 before mainnet.
- **Pinocchio** 0.11.2 (2026-06); `pinocchio-token-2022` 0.4.0 and `pinocchio-transfer-hook-interface` 0.1.0 released 2026-09-30. Zero-dependency and audited (Zellic, per [Chainstack](https://docs.chainstack.com/docs/solana-pinocchio-vs-quasar)); no account macros, so every owner, signer and discriminator check is hand-rolled.
- **Quasar** (Blueshift): Anchor-like macros at Pinocchio-tier CUs, zero-copy by default; README says "Beta, has not been audited. APIs may change."; no releases, `0.0.0` placeholder crate, last commit 2026-07-13.
- **Steel** (Regolith/ORE): crate 4.0.9 (2026-06-16), GitHub releases stale since 2024. **Native** `solana-program`: only for very small programs.

**Recommendation: Anchor 1.2.x.**

- **Auditability.** Auditors read Anchor constraints fastest; declarative `has_one`/`seeds`/`token::authority` constraints remove whole bug classes (owner, signer, type-cosplay, duplicate-mutable). OnRe, Kamino kVault, Drift vaults and SVS are all Anchor.
- **Compute is not the bottleneck.** A NAV-priced deposit or fill touches about 10 accounts and a couple of token CPIs. Anchor's overhead (about 500 to 5k CU per instruction) (unverified) is small against the 200k default and the 1.4M maximum. Use `zero_copy` or `LazyAccount` only for large accounts.
- **Upgrade safety.** `Migration<From,To>` plus versioned structs gives a reviewed path for schema changes.
- **Rejected:** Pinocchio triples the hand-written validation surface; Quasar is unaudited with no releases.
- **Pin exact versions:** `anchor_version = "1.2.0"`, a `rust-toolchain.toml`, a committed `Cargo.lock`, `resolver = "2"` and `overflow-checks = true` in `[profile.release]`.

### Runtime limits that shape the design

| Limit | Value | Source |
|---|---|---|
| Instruction stack depth | **5** (top level plus 4 nested CPIs). SIMD-0268 would make it 9 but was not queued on any cluster | [CPI docs](https://solana.com/docs/core/cpi), [SIMD-0268 status](https://app.xroot.dev/upgrades/simd-0268-cpi-nesting-limit-4-8) |
| Reentrancy | A→A allowed; **A→B→A rejected** (`ReentrancyNotAllowed`) | [CPI docs](https://solana.com/docs/core/cpi) |
| CPI cost | 1,000 CU per invoke (946 with SIMD-0339), plus 1 CU per 250 bytes serialized; callee CUs count against the caller | [CPI docs](https://solana.com/docs/core/cpi) |
| CU budget | 200k default per instruction; **1.4M per transaction** | [compute budget](https://solana.com/docs/core/fees/compute-budget) |
| Per-writable-account CU per block | 12M (unchanged by SIMD-0286, which raised the block limit to 100M on 2026-07-29) | [SIMD-0286](https://solanacompass.com/news/solana-raises-mainnet-block-compute-limit-66-to-100m-cus-with-simd-0286-at) |
| Account data max | 10 MiB; **realloc growth ≤ 10 KiB per instruction** | [accounts](https://solana.com/docs/core/accounts) |
| Return data | 1,024 bytes | [CPI docs](https://solana.com/docs/core/cpi) |
| Transaction size | legacy and v0 **1,232 B**; **v1 4,096 B** (SIMD-0296/0385, live on mainnet since epoch 1035, 2026-09-15) | [larger transactions](https://solana.com/upgrades/larger-transaction-sizes) |
| Accounts per transaction | **64 locks** in every format; the 128-lock feature was removed on 2026-09-29; SIMD-0596 (96) is a draft | [agave-block-production#21](https://github.com/anza-xyz/agave-block-production/pull/21) |
| v1 and ALTs | v1 does not support address lookup tables (inlines ≤64 accounts) and **must set CU and loaded-data limits explicitly** (unset means 0 and the transaction fails); the priority fee is an absolute lamport total | [larger transactions](https://solana.com/upgrades/larger-transaction-sizes) |
| Rent | SIMD-0437 cuts lamports per byte from 6,960 to 696 in 5 steps; step 2 (5,080) went live 2026-09-11, the target expected around November 2026. **Never hardcode rent; read the `Rent` sysvar** | [reduced rent](https://solana.com/upgrades/reduced-rent), [SIMD-0437 step 2](https://solanacompass.com/news/simd-0437-step-2-goes-live-on-solana-mainnet-rent-drops-to-5080-lamports-per-byte) |

### One core program, thin adapter programs

Solana forbids A→B→A reentrancy, so a reserve program cannot be called back by the module that computes coverage. Solana does let a program **read** another program's account data without a CPI: pass the account in, check its owner and discriminator, and deserialize it.

| | One core program (reserve, registry, coverage, queue as modules) | Separate programs |
|---|---|---|
| Coverage check | A plain function call with an atomic post-state assertion `stable_assets ≥ coverage_required` | The reserve must read coverage state as an owner-checked passed account and can never be called back |
| CPI budget | Reserve, adapter, venue, token: depth 4 of 5 | Coverage, reserve, adapter, venue, token: **5 of 5**, so a venue that CPIs further breaks |
| Audit surface | One IDL, one upgrade authority, one set of PDAs | N programs, N upgrade authorities, cross-program trust |
| Precedent | OnRe (66 instructions, 1 program), Kamino klend, Drift | SVS (one program per variant), Voltr (vault plus adaptor programs) |

**Recommendation.** One core program `mutav` with internal modules, and yield-venue adapters in separate thin programs behind a fixed interface (`deposit`, `withdraw`, `report_value`); the reserve CPIs the adapter, the adapter CPIs the venue, values come back through return data (≤1 KiB) or a position account the reserve reloads after the CPI, and the adapter never calls the reserve. The rule "money moves only in the reserve module; guarantee data is written only by the coverage module" becomes a module boundary enforced by review and tests. For the pilot, adapters were likely out of scope: no Solana money market was likely to list BRS (unverified at the time), so ship the interface and a mock and do not block the pilot on yield.

> **Since this research:** This is the shape of [ADR 0002](../decisions/0002-core-program-and-capped-adapters.md). Adapters are compiled with fixed valuation and the program reads value itself rather than trusting an adapter-reported number; the reserve admin executes `allocate` and `deallocate` ([ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), proposed).

**Data layout**

- **Per-guarantee PDAs** with a monotonic id or a contract hash, and **aggregate counters** in program state (`coverage_required`, active guarantees, fees). Programs cannot iterate PDAs, so every invariant must run on aggregates updated incrementally. Never use a growing `Vec` registry: it caps at 10 KiB growth per instruction and one hot write lock serializes every agency transaction.
- **Hot singleton accounts:** the state account written by every deposit, fill and claim serializes those writes; 12M CU per account per block is far above pilot throughput. Keep it small and move rarely written config (fees, caps, roles) into a separate config account.
- **Zero-copy** only for accounts larger than about 10 KB; per-request PDAs are about 150 B.
- **Realloc** only for bounded append-style config, always with `realloc::zero = true`.

**Escrow token accounts.** All PDA token accounts under one authority PDA, created at `initialize` with `token::mint`, `token::authority` and `token::token_program`: the settled `reserve` (counted in NAV through stored totals), a deposit escrow (not counted), claimable assets for filled redemptions (already owed), and share escrows. Use stored accounting (`total_assets`, pending and claimable totals) rather than raw balances in NAV math, which is immune to donation. Apply the surplus gate as a post-state check on redemption fills, and **do not gate claim payments** (the SVS-12 pattern).

> **Since this research:** Untracked balances are moved by a permissionless `skim` into a separate `unsolicited` account, from which the admin books them into the reserve or returns them to their source ([ADR 0024](../decisions/0024-unsolicited-money-and-backstop.md)).

**Rent and batching.** At 5,080 lamports per byte a ~150 B request PDA costs (128+150)×5,080 ≈ 1.41M lamports (about 0.0014 SOL), and about 0.0002 SOL at 696. Store `rent_payer` and close to it. Anchor `close` zeroes the discriminator, which prevents revival; never reuse a closed request's seeds. With about 12 fixed accounts per batch and about 2 per user, a v0 transaction with an ALT fits about 24 users in 64 locks, and a v1 transaction fits similarly; budgeting about 15k to 25k CU per claimed user keeps 25 per transaction under 1.4M CU [I]. Validate `remaining_accounts` pairwise. For v1 always set `computeUnitLimit` and `loadedAccountsDataSizeLimit`, and check a wallet's `supportedTransactionVersions` before sending v1.

**Who runs which step**

| Step | Who | Why |
|---|---|---|
| Settle NAV and fill | Operator role (KMS-held in mutav-app) | A price-setting act that must be attributable, bounded on-chain by a max NAV change and a minimum epoch duration |
| Claim, close, reconcile, invest | Permissionless | Deterministic given state; anyone can crank |
| Liveness escape | Permissionless after a timeout | If no fill happens within N hours, users cancel and get escrowed money back |
| Pause | Pauser can pause only; the Squads admin unpauses | Asymmetric kill switch (OnRe) |

The client package composes transactions and holds no keys.

> **Since this research:** Deposit and redemption fills are admin (Squads) actions priced at the on-chain NAV, not operator actions ([ADR 0008](../decisions/0008-uniform-capital-flow-and-pause-scope.md), [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)). The operator registers guarantees and runs the claim cycle; claims above the per-call cap need the admin's `approve_claim`, `pay_claim` pays exactly the filed provision, and MUTAV can pay an agency from its bank account first and be reimbursed by the reserve ([ADR 0021](../decisions/0021-claims-approval-amendment-exact-payment.md)).

**Standards angle.** There is no Solana-core ERC-4626 or ERC-7540 standard; solana.com only describes the pattern. SVS is the de facto community spec. The recommendation was to mirror SVS-10's instruction names and seeds so MUTAV could claim an "SVS-10-compatible interface", without taking it as a dependency. Token-2022 receipts are unnecessary: request PDAs are the receipts and are non-transferable by construction.

### Tokens

**Share token: classic SPL Token.**

- Mint authority: a program PDA. Freeze authority: none at launch, or a Squads-held one if required; decide before mainnet, because a freeze authority is visible and deters integrators.
- Metadata through Metaplex Token Metadata on the classic mint.
- **Why not Token-2022 for shares:** transfer hooks are rejected by default by lending protocols; a permanent delegate is a "complete drain path" in collateral vaults; interest-bearing is a continuous fixed-rate display, wrong for a NAV that can drop on claims; Scaled UI Amount can express NAV but makes UI amount differ from raw amount for every integrator and needs a multiplier update on every NAV change. OnRe ships classic SPL and gets Kamino, Exponent and Titan integrations. [V/S]
- Show NAV per share from program state in the UI; don't encode it in the token.

> **Since this research:** Devnet keeps classic SPL shares. Shares are to be transfer-restricted on mainnet, enforced at the token level, with the mechanism chosen with the mainnet design before mainnet `initialize` (see [open questions](../meta/open-questions.md)).

**Token-2022 extensions if transfer gating is ever required**

| Extension | Use | Composability cost |
|---|---|---|
| MetadataPointer + TokenMetadata | On-mint metadata | None |
| **DefaultAccountState = Frozen + Token ACL (sRFC-37)** | KYC-gated holding; the issuer delegates freeze to Token ACL (`TACLkU6CiCdkQN2MjoyDkVg2yAH9zkxiHDsiztQ52TP`, v0.3.1) and a gate program permits permissionless thaw | Much better than transfer hooks [V: [Token ACL](https://github.com/solana-foundation/token-acl)] |
| Transfer hook | Per-transfer checks | High; rejected by most venues |
| Permanent delegate | Forced clawback | Very high; treated as a drain path |
| Pausable | Global pause | Medium |
| Confidential transfers | Private balances | ZK ElGamal was re-enabled on mainnet in June 2026 after the 2025 bug; proofs are heavy (about 368k CU) |

The pilot KYC gate proposed then: a valid SAS attestation PDA at `request_deposit` (owner is the SAS program, PDA derives from credential, schema and user, credential is the configured issuer, attestation not expired), with the token freely transferable.

**Configurable reserve mint and the freeze authority**

- **BRS facts** (mainnet `getAccountInfo`, 2026-09-30) [V]: mint `BRSxQRUaGswjLs7ewcH7uXj3r7SgmfKSSLLXyCKHZtUo`, classic SPL, 6 decimals, supply 2,884.68 BRS; the mint authority is a Nora program config account, and the freeze authority is a single Nora key.
- The same mint address also existed on devnet with supply 0, its authorities held by that same Nora key.

> **Since this research:** Nora's documented devnet mint is a different address, `BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4`; the mainnet address on devnet is an empty placeholder (see [BRL currencies on Solana](brl-currencies-on-solana.md)).

- **Mint-agnostic design:** `initialize` takes the reserve mint and its token program as interface accounts and stores them immutably; every instruction constrains both and uses `transfer_checked`. At init, if the mint is Token-2022, reject non-zero TransferFee, TransferHook, PermanentDelegate, required ConfidentialTransfer, NonTransferable, MintCloseAuthority and DefaultAccountState=Frozen unless explicitly allowed. Share decimals equal reserve decimals (6), math in `u128`.
- **Test plan:** in LiteSVM, a mock 6-decimal classic mint with a freeze authority under test control, covering an issuer freeze of the reserve, of the deposit escrow, and of a user's destination account, and a thaw with no accounting drift; on devnet, real devnet BRS or a mock; before mainnet, Surfpool with the real mint and `setTokenAccount` cheatcodes. Circle devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` ([faucet](https://faucet.circle.com)) is a second mint to prove mint-agnosticism.
- **The freeze authority as a risk:** the issuer can freeze any BRS token account, including the reserve's. Classic SPL has no permanent delegate, so the issuer can lock but not seize a balance; the mint authority can inflate supply, which is a depeg and issuer-solvency risk. A frozen reserve means claims cannot be paid even though NAV is nominally intact. Mitigations: split balances across several PDAs so one freeze does not trap everything; detect a freeze on-chain and fail closed; list every authority on the transparency page; seek a written freeze policy from the issuer; keep coverage in BRL; never route around a frozen user account.

> **Since this research:** The program treats a frozen reserve as holding no liquid BRS, refuses new guarantees while it is frozen, and lists the issuer's authorities on the [Transparency](../introduction/transparency.md) page ([ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md)).

### Testing

| Tool | Status on 2026-09-30 | Use |
|---|---|---|
| **LiteSVM** | Rust `litesvm` 0.17.0 (2026-09-28), npm 1.5.0, `anchor-litesvm` 0.4.0; Anchor 1.x's default template; OnRe uses it | Main suite: every instruction, every invariant, clock warps, freeze cases |
| **Mollusk** | `mollusk-svm` 0.15.1 (2026-08-29), Anza | Single-instruction fixtures and CU benchmarks in CI |
| **Surfpool** | 1.6.0 (2026-09-18), repo now `solana-foundation/surfpool`; mainnet and devnet fork, cheatcodes, a `@solana/surfpool/kit` plugin, Kamino and Pyth scenario templates (#783), default for `anchor test` | Fork tests: the real BRS mint, the real Squads v4 program, adapter CPIs |
| solana-bankrun / anchor-bankrun | Unmaintained (last release 0.4.0, 2024-10) | Don't use |
| solana-program-test | Legacy, slow to compile | Don't use |
| solana-test-validator | RPC-behaviour edge cases | Rarely |

For adapter CPI tests, load dumped venue `.so` files and account snapshots into LiteSVM as fixtures, and use Surfpool's fork for live-state checks. Devnet venues may reject test assets, so fork testing is the dependable path. Run Surfpool as its own serialized step, never in parallel with the cargo suite, with no watch mode. `solana-verify build` uses x86 Docker and is very slow under emulation on Apple Silicon, so run it in x86 CI. [V: [verified builds](https://solana.com/docs/programs/verified-builds)]

### Clients and frontend

- **Codama pipeline:** `anchor build` → `target/idl/mutav.json` → `@codama/nodes-from-anchor` 1.5.6 → `@codama/renderers-js` 2.5.0 → `clients/js/src/generated`, driven by `codama.json` and `@codama/cli` 1.6.3. Renderers-js 2.x imports from `@solana/kit/program-client-core`, so Kit ≥ 8 is required; use `kitImportStrategy: 'rootOnly'`. Commit the generated client and fail CI on a regeneration diff.
- **@solana/kit 8.4.0.** v7 (2026-06-30) reworked reactive stores; v8 (2026-08-21) removed deprecated CU-estimation helpers and added `ClientWithTransactionSigning`. With no CU limit, v1 transactions run with 0 CU, so always set it or default to v0 for wallet-signed transactions.
- **React:** prefer Kit's own `@solana/react` 8.4.0 (`ClientProvider`, `useClient`, `useAction`, SWR and TanStack hooks) with `@wallet-standard/react` 1.0.3.
- **framework-kit was lagging:** `@solana/client` 1.7.0 and `@solana/react-hooks` 1.4.1 were last published 2026-01-16 on `@solana/kit ^5`, which would put several Kit majors in one bundle. ConnectorKit (`@solana/connector` 0.2.6) depends on Kit ^7. `@wallet-ui/react` 4.3.0 is an alternative for UI components.
- **Squads SDK** `@sqds/multisig` 2.1.4 is web3.js-v1-based; isolate it behind `@solana/web3-compat` 0.0.21 in the admin surface only.
- **Next.js 16:** provider in a `'use client'` component; read-only data (NAV, queues, coverage) in Server Components via `createSolanaRpc` and Codama decoders with caching; wallet signing client-only; simulate before every signature.

### Operations and mainnet path

- **Squads v4:** the Squads vault PDA is the program upgrade authority, the program admin, and the share mint's freeze authority if one exists. Use a time lock on upgrades (48 to 72h is the [SOS recommendation](https://publish.obsidian.md/sos/standard/wiki/squads)), a two-step admin handover, on-chain bounds on hot roles, and no durable-nonce pre-signing for admin. The [squads-program-action](https://github.com/solana-developers/squads-program-action) GitHub Action creates buffer, IDL and verify-PDA upgrade proposals.
- **Verified builds** (`solana-verify` 0.5.2, repo `otter-sec/solana-verifiable-build`): build in x86 CI and deploy the buffer; `solana-verify export-pda-tx` executed through Squads; `solana-verify remote submit-job --uploader <squads vault>` to the OtterSec registry, shown on explorers. Requires a public repo, a committed `Cargo.lock` and a workspace `Cargo.toml`.
- **Security metadata:** `solana-security-txt` plus `anchor deploy --security-metadata`; publish the IDL through Program Metadata.
- **SAS:** program `22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG`, `sas-lib` 1.0.10; Credential, Schema, per-user Attestation PDA with expiry. [V: [SAS](https://attest.solana.com/)]
- **Oracles:** not needed for a single BRL reserve with BRL coverage. If NAV ever includes a venue position, read the venue's own exchange rate after its refresh in the same transaction and check staleness. Pyth (`@pythnetwork/pyth-solana-receiver` 0.16.0) or Switchboard On-Demand (3.10.6) only for a USD display or a depeg guard.
- **Mainnet path:** freeze scope; internal review and CU benchmarks; external audit on a tagged commit; deploy with `solana-verify` from CI to a buffer, executed through a time-locked Squads proposal; initialize with conservative caps; publish the authorities page; monitor keeper liveness, reserve freeze status and coverage; upgrade only through Squads with a time lock and `Migration<>`, never re-initializing live PDAs; keep an emergency-pause drill in the runbook.

> **Since this research:** Upgrade time locks are 1 hour on devnet and 7 days on the real pilot, at least the exit-fallback wait, so holders can leave before an upgrade they do not accept ([ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md), [ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md)).

### Security checklist

**Account validation.** Typed accounts everywhere, with any `UncheckedAccount` justified and manually checked. PDAs with seeds plus a stored canonical bump, and `has_one` on every child account. Token accounts constrained by mint, authority and token program; escrows are program PDAs, never user-supplied; user destinations validated by owner and mint. Token programs through `Program` or `Interface`; adapter program IDs checked against a whitelist in config. Anchor 1.x duplicate-mutable checks on. Sysvars through typed `Sysvar`.

**Signers and roles.** Admin (Squads), operator, pauser and compliance as separate keys with bounded powers. **No instruction sends reserve money to an arbitrary address.** Two-step authority transfer.

**Share math.** A virtual offset `shares = assets × (supply + 10^k) / (total_assets + 1)` with stored `total_assets` (donations don't move NAV). Round in the reserve's favour: deposit to shares down, redeem to assets down, exact-shares mint rounds assets up, exact-assets withdraw rounds shares up. `u128` `mul_div` with explicit rounding and `overflow-checks = true`; property-test `convert_to_shares(convert_to_assets(x)) ≤ x`. Minimum request amounts against dust and rent spam. A per-epoch max NAV change bounds a compromised key.

**Async queue.** Monotonic ids so seeds are never reused; a checked status state machine; `close = rent_payer`; a liveness escape; cancel only before fill; pending deposits excluded from NAV and claimable assets excluded from `stable_assets`.

**PDA seeds.** Distinct string prefixes per account type; fixed-width seeds only (hash variable-length strings); the program's root account in every child seed.

**Token pitfalls.** Always `transfer_checked` with decimals; check the token program against the mint's owner; never hardcode token-account size or rent; reject mints with a permanent delegate, a transfer hook or a non-zero transfer fee at init; detect frozen accounts and fail closed; `reload()` after any CPI.

**CPI and adapters.** Adapters never call back; validate adapter-reported values against balances or position accounts the program owns; cap per-venue allocation and keep a liquid floor; keep CPI depth ≤ 4 nested.

**Lifecycle.** `Migration<>` for layout changes; a pause flag on every value-moving instruction except claim payments and cancels; `emit_cpi!` events for every state transition; `security.txt`, verified build, Squads time lock, no durable nonces for admin.

## Sources

- Credix: [credix_client docs.rs](https://docs.rs/credix_client/latest/credix_client/), [Solana Compass](https://solanacompass.com/projects/credix-finance), [Clave/CESCE receivables pool](https://medium.com/credix/the-on-chain-receivables-pool-with-clave-and-cesce-explained-6873defa41f6), [CrediPay docs](https://docs.credipay.credix.finance/docs/getting-started-introduction), [The Block on CrediX](https://www.theblock.co/post/365458/solana-lender-credix-defi-exploit), [FinanceFeeds on CrediX](https://financefeeds.com/credix-finance-exploited-for-4-5-million-in-governance-attack/)
- Huma: [Redemption](https://docs.huma.finance/products/huma-institutional/tranches/redemption), [Modes](https://docs.huma.finance/products/huma-2.0/modes), [Huma 2.0 blog](https://blog.huma.finance/introducing-huma-2.0-permissionless-real-yield-on-solana), [Withdrawal](https://docs.huma.finance/products/huma-2.0/user-manuals/withdrawal), [TrancheVaultStorage.sol](https://github.com/00labs/huma-contracts-v2/blob/main/contracts/liquidity/TrancheVaultStorage.sol), [EpochManager.sol](https://github.com/00labs/huma-contracts-v2/blob/main/contracts/liquidity/EpochManager.sol), [TrancheVault.sol](https://github.com/00labs/huma-contracts-v2/blob/main/contracts/liquidity/TrancheVault.sol), [First Loss Covers](https://docs.huma.finance/products/huma-institutional/first-loss-covers), [Halborn audit](https://www.halborn.com/audits/huma-finance/solana-programs-060022)
- Maple: [syrupUSDC on Solana](https://maple.finance/insights/syrupusdc-expands-to-solana), [CoinDesk](https://www.coindesk.com/business/2025/06/05/crypto-lender-maple-finance-expands-to-solana-with-chainlink), [upgraded Withdrawal Manager](https://maple.finance/insights/upgraded-withdrawal-manager-contract), [Cork "time to cash"](https://www.cork.tech/blog/measuring-time-to-cash-in-maple-vaults)
- Ondo: [Rock'n'Block overview](https://rocknblock.io/blog/ondo-finance-technical-overview-token-architecture-and-risks), [Ondo USDY](https://ondo.finance/usdy), [global-markets-solana](https://github.com/ondoprotocol/global-markets-solana)
- Drift: [IF staking docs](https://docs.drift.trade/insurance-fund/insurance-fund-staking), [Bankless Times](https://www.banklesstimes.com/articles/2026/04/02/drift-protocol-suffers-280m-exploit-after-admin-takeover/), [Coinfomania](https://coinfomania.com/drift-protocol-reveals-nonce-attack-behind-280m-exploit/), [crypto.news](https://crypto.news/drift-says-insurance-fund-untouched-after-attack-withdrawals-to-resume/), [drift-vaults](https://github.com/velocity-exchange/drift-vaults), [withdraw_request.rs](https://github.com/velocity-exchange/drift-vaults/blob/master/programs/drift_vaults/src/state/withdraw_request.rs)
- Cover and yield products: [Lulo on Solana Compass](https://solanacompass.com/projects/Lulo), [Gami thesis on Lulo](https://paragraph.com/@gami-capital/gami-capital-%E2%80%94-public-thesis-lulo), [Solana Compass DeFi cover category](https://solanacompass.com/projects/category/defi/insurance), [Blockworks on Reflect](https://blockworks.com/news/reflect-stablecoin-infra-raise), [Reflect on Solana Compass](https://solanacompass.com/projects/reflect-money), [Solstice eUSX](https://docs.solstice.finance/solstice-for-users/eusx-powered-by-yieldvault), [Gate on Perena](https://www.gate.com/learn/articles/what-is-perena/5917), [Perena on Solana Compass](https://solanacompass.com/projects/perena)
- Vault standards: [solana-foundation/vault](https://github.com/solana-foundation/vault), [SEQUENCES.md](https://github.com/solana-foundation/vault/blob/main/programs/async_vault/docs/SEQUENCES.md), [request.rs](https://github.com/solana-foundation/vault/blob/main/programs/async_vault/src/state/request.rs), [SubscriptionQueue.md](https://github.com/solana-foundation/vault/blob/main/programs/async_vault/docs/extensions/SubscriptionQueue.md), [DESIGN_DECISIONS.md](https://github.com/solana-foundation/vault/blob/main/DESIGN_DECISIONS.md), [SVS repo](https://github.com/solanabr/solana-vault-standard), [SVS DeepWiki](https://deepwiki.com/solanabr/solana-vault-standard), [SVS-10.md](https://github.com/solanabr/solana-vault-standard/blob/main/docs/SVS-10.md), [SVS-11.md](https://github.com/solanabr/solana-vault-standard/blob/main/docs/SVS-11.md), [SVS-10 request_deposit.rs](https://github.com/solanabr/solana-vault-standard/blob/main/programs/svs-10/src/instructions/request_deposit.rs), [ERC-4626 on Solana](https://solana.com/developers/evm-to-svm/erc4626), [Exo: Solana needs 4626](https://exotechnologies.xyz/research/solana-needs-something-like-erc4626-vaults), [Centrifuge BatchRequestManager.sol](https://github.com/centrifuge/protocol/blob/main/src/vaults/BatchRequestManager.sol), [RockawayX on Centrifuge](https://www.rockawayx.com/insights/centrifuge-debuts-400m-tokenized-treasury-fund-on-solana-defi)
- Kamino, Voltr, Meteora: [kvault repo](https://github.com/Kamino-Finance/kvault), [kvault VaultState](https://github.com/Kamino-Finance/kvault/blob/main/libs/kvault-interface/src/state/vault_state.rs), [Kamino lending vaults docs](https://kamino.com/docs/products/lending-vaults), [kvault-bot](https://github.com/Kamino-Finance/kvault-bot), [klend](https://github.com/Kamino-Finance/klend), [klend deployment](https://www.mintlify.com/kamino-finance/klend/operations/deployment), [Voltr on Solana Compass](https://solanacompass.com/projects/voltr), [Voltr vault-sdk](https://github.com/voltrxyz/vault-sdk), [Meteora dynamic vault](https://docs.meteora.ag/product-overview/other-products/dynamic-vault-overview/what-is-a-dynamic-vault)
- Yield venues: [Jupiter Lend cpi.md](https://github.com/jup-ag/jupiter-lend/blob/main/docs/earn/cpi.md), [Jupiter Lend sdk.md](https://github.com/jup-ag/jupiter-lend/blob/main/docs/earn/sdk.md), [Code4rena Jupiter Lend](https://deepwiki.com/code-423n4/2026-02-jupiter-lend), [marginfi id-crate](https://github.com/0dotxyz/marginfi-v2/blob/main/id-crate/src/lib.rs)
- Admin and KYC: [Squads v4](https://github.com/Squads-Protocol/v4), [multisig.rs](https://github.com/Squads-Protocol/v4/blob/main/programs/squads_multisig_program/src/state/multisig.rs), [squads-program-action](https://github.com/solana-developers/squads-program-action), [SOS Squads](https://publish.obsidian.md/sos/standard/wiki/squads), [SAS](https://attest.solana.com/), [SAS repo](https://github.com/solana-foundation/solana-attestation-service), [Token ACL](https://github.com/solana-foundation/token-acl), [Token ACL guide](https://solana.com/developers/guides/advanced/acl)
- BRL context: [Solana roundup March 2026](https://solana.com/news/solana-ecosystem-roundup-march-2026), [Loopscale on Solana Compass](https://solanacompass.com/projects/loopscale), [RWA.xyz BRLA](https://app.rwa.xyz/assets/BRLA), [CB Insights BRLA](https://www.cbinsights.com/company/brla), [Etherfuse Stablebonds](https://etherfuse.com/products/stablebonds), [Etherfuse TESOURO app page](https://app.etherfuse.com/bonds/BRNTNaZeTJANz9PeuD8drNbBHwGgg7ZTjiQYrFgWQ48p), [CoinDesk on BRD](https://www.coindesk.com/business/2026/01/07/former-brazil-central-bank-official-unveils-real-pegged-stablecoin-with-yield-sharing), [nora.finance](https://www.nora.finance/), [Nora BRS token docs](https://www.nora.finance/docs/integrate/core-concepts/brs-token), [Nora transparency](https://www.nora.finance/transparency), [Nora-Finance/brs-assets](https://github.com/Nora-Finance/brs-assets); DexScreener and Jupiter token APIs, 2026-09-30
- Anchor and frameworks: [Anchor releases](https://github.com/solana-foundation/anchor/releases), [CHANGELOG](https://github.com/otter-sec/anchor/blob/master/CHANGELOG.md), [installation](https://www.anchor-lang.com/docs/installation), [1.2.0 notes](https://www.anchor-lang.com/docs/updates/release-notes/1-2-0), [0.32.2 notes](https://www.anchor-lang.com/docs/updates/release-notes/0-32-2), [OtterSec stewardship](https://github.com/otter-sec/anchor), [pinocchio](https://github.com/anza-xyz/pinocchio), [quasar](https://github.com/blueshift-gg/quasar), [Chainstack Pinocchio vs Quasar](https://docs.chainstack.com/docs/solana-pinocchio-vs-quasar), [steel](https://github.com/regolith-labs/steel)
- Runtime: [CPI docs](https://solana.com/docs/core/cpi), [compute budget](https://solana.com/docs/core/fees/compute-budget), [SIMD-0268 status](https://app.xroot.dev/upgrades/simd-0268-cpi-nesting-limit-4-8), [larger transactions and v1](https://solana.com/upgrades/larger-transaction-sizes), [SIMD-0286](https://solanacompass.com/news/solana-raises-mainnet-block-compute-limit-66-to-100m-cus-with-simd-0286-at), [reduced rent](https://solana.com/upgrades/reduced-rent), [SIMD-0437 step 2](https://solanacompass.com/news/simd-0437-step-2-goes-live-on-solana-mainnet-rent-drops-to-5080-lamports-per-byte), [account lock limit PR](https://github.com/anza-xyz/agave-block-production/pull/21), [accounts](https://solana.com/docs/core/accounts)
- Tokens: [Scaled UI Amount](https://solana.com/docs/tokens/extensions/scaled-ui-amount), [ZK ElGamal re-enable](https://github.com/solana-program/token-2022/issues/657), [CT kill switch and proof cost](https://xroot.dev/blog/solana-confidential-transfers-kill-switch-proof-cost), [hylo Token-2022 collateral policy](https://github.com/hylo-so/sdk/issues/135), [token-2022 releases](https://github.com/solana-program/token-2022/releases)
- Testing: [litesvm](https://github.com/LiteSVM/litesvm), [mollusk](https://github.com/anza-xyz/mollusk), [surfpool 1.6.0](https://github.com/solana-foundation/surfpool/releases/tag/v1.6.0), [surfpool Kamino scenarios #783](https://github.com/solana-foundation/surfpool/pull/783), [solana-bankrun](https://github.com/kevinheavey/solana-bankrun)
- Clients: [kit releases](https://github.com/anza-xyz/kit/releases), [codama](https://github.com/codama-idl/codama), [renderers-js](https://github.com/codama-idl/renderers-js), [framework-kit](https://github.com/solana-foundation/framework-kit), [connectorkit](https://github.com/solana-foundation/connectorkit)
- Ops: [verified builds](https://solana.com/docs/programs/verified-builds), [solana-verifiable-build](https://github.com/otter-sec/solana-verifiable-build), [Circle faucet](https://faucet.circle.com), [onre-sol](https://github.com/onre-finance/onre-sol)
- Registry versions: npm and crates.io, all queried 2026-09-30; mainnet and devnet `getAccountInfo` reads for BRS and devnet USDC, 2026-09-30

## Decisions

- [ADR 0002: Core program and capped adapters](../decisions/0002-core-program-and-capped-adapters.md)
- [ADR 0004: On-chain NAV with internal accounting](../decisions/0004-onchain-nav-internal-accounting.md)
- [ADR 0005: Solvency gate scope](../decisions/0005-solvency-gate-scope.md)
- [ADR 0008: Uniform capital flow and pause scope](../decisions/0008-uniform-capital-flow-and-pause-scope.md)
- [ADR 0010: Partial fills at the queue head](../decisions/0010-partial-fills-at-queue-head.md)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md)
- [ADR 0024: Unsolicited money and backstop contributions](../decisions/0024-unsolicited-money-and-backstop.md)
- [ADR 0025: Exit fallback: a cooldown exit](../decisions/0025-exit-fallback-cooldown-exit.md)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md)
- [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) (proposed)
- ADR 0019: v1 layout for the devnet release (recorded with the layout change)
