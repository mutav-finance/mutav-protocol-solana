# OnRe (ONyc) as a comparable

> **Research date:** 2026-09-30 (redemption deep dive 2026-10-01). **Curated:** 2026-10-10. Prior research by the MUTAV team, kept as written except for the edits noted in the [research index](README.md). Notes headed *Since this research* record later decisions. Not legal or investment advice.

OnRe is the closest production comparable to MUTAV on Solana: a regulated balance sheet that backs real-world risk, tokenized as a NAV-accruing share (ONyc), with an on-chain redemption queue and a separate liquidity vault. This page records how OnRe's program works, read from its open-source code (`onre-finance/onre-sol`, MIT, commit `c049083`, 2026-09-21) and its public docs, and how each part maps to MUTAV's design.

Evidence: statements marked *(inference)* are the researcher's analysis, not stated by a source. Everything else was read in code, in OnRe's docs or on-chain. Code links point to [github.com/onre-finance/onre-sol](https://github.com/onre-finance/onre-sol) at commit `c0490831f438074562ebf51e437ca5f8e027596b`.

## Summary

- **The program is open source and Anchor-based (1.1.2).** It is one program, `onreapp`, mainnet ID `onreuGhHHgVzMWSkj2oQDLDtvvGvoepBPkqyaubFcwe`, with 66 instructions. ONyc is a **classic SPL Token** mint (9 decimals) with no Token-2022 extensions.
- **NAV is not pushed by an oracle.** It is a deterministic function stored on-chain: `base_price × (1 + APR/365)^days`, with linear interpolation within a day, in up to 10 time-scheduled "offer vectors". The boss (a Squads multisig) updates NAV by adding a new vector, which can include a jump (the signed `nav_adjustment`). Chainlink and Pyth only redistribute it for integrators.
- **Redemption runs on two rails.** An async request queue, where the user locks ONyc and the worker fills it partially or in full; and an atomic "Prop AMM" sell that pays only from a dedicated redemption vault, with a convex haircut driven by utilization and sell pressure. Buy inflows **refill** the redemption vault up to `TVL × vault_target_bps`; about 15% of capital is carved out for liquidity.
- **KYC is optional at the program level.** An offer can carry a `needs_approval` flag; the take instruction then needs an ed25519-signed `ApprovalMessage {program_id, user_pubkey, expiry_unix}` from one of 2 approver keys, verified through the instructions sysvar. The "open access" paths skip it.
- **Partial fills** add one field, `fulfilled_amount: u64`, carved from the request's `reserved` bytes in an in-place upgrade. Each fill is priced at the NAV of that call and the fee is rounded up on each fill.
- **Scale is real:** NAV $1.1509, APY 11.02%, TVL about $286.6M ([live API](https://core.api.onre.finance/data/live-tvl), fetched 2026-09-30). There have been 7 audits (Quantstamp ×4, Ackee, OtterSec, plus a financial audit), monthly Apex attestations, an Allez A- risk rating and a $100k Immunefi bounty.
- **Audit coverage of the redemption paths:** partial fills (2026-02) and the whole Prop AMM came after the Ackee audit revision. The repo's own pricing doc says "Prop AMM has not been deployed".

## Product and business model

| Topic | Finding | Source |
|---|---|---|
| What ONyc is | Non-rebasing, NAV-accruing token. A proportional claim on a Bermuda **segregated account** ("ONyc Pool") that collateralizes short-duration (re)insurance. Not a stablecoin. | [docs: ONyc](https://docs.onre.finance/introduction/onre-tokenized-reinsurance-onyc), [FAQ](https://docs.onre.finance/technical-resources/frequently-asked-questions) |
| Entity and licences | **On Re SAC Ltd.**, BMA-regulated, reg. no. 55347. Holds a **Class F DABA 2018** licence (issue, sell and redeem digital assets) and a **Class IIGB** Innovative Insurer General Business licence under the Insurance Act 1978. | [regulatory framework](https://docs.onre.finance/for-insurers/regulatory-framework) |
| Legal wrapper for capital | Capital comes in through a **Participation Agreement**, not equity. Legal title stays with the segregated account. Funds can only pay claims of that account. Surplus returns to capital providers after run-off. Statutory ring-fencing under the Bermuda SAC Act. | [KYC & AML policy](https://docs.onre.finance/legal/kyc-and-aml-policy) |
| Yield sources | (1) **Underwriting premiums**, paid upfront and earned over the contract; target base 10–12%; portfolio about 50/50 specialty lines (D&O, cyber, aviation, crop, marine and others) and property-cat ILWs (6–12 months, high attachment). (2) **Collateral yield** from T-bills, sUSDe, syrupUSDC, USYC, sUSDS, USDG, USDC, USCC and USDv. Actuarial projections assume only T-bill rates. | [portfolio makeup](https://docs.onre.finance/reinsurance-framework/portfolio-makeup), [collateral composition](https://docs.onre.finance/for-capital-providers/collateral-composition), [yield mechanisms](https://docs.onre.finance/introduction/yield-mechanisms) |
| Loss absorption | A 4-layer framework: (1) conservative claim reserves booked before yield is shown; (2) "APY absorption", where excess claims lower the forward APR instead of principal; (3) cross-contract diversification; (4) a reserve of yielding assets. | [FAQ](https://docs.onre.finance/technical-resources/frequently-asked-questions) |
| Mint | USDC or USDG in, no mint fee. | [minting](https://docs.onre.finance/for-capital-providers/minting-onyc) |
| Access tiers | **Open Access** is permissionless ("no interaction with regulated entities") and excludes the US, UK and about 60 other jurisdictions through the UI. **Institutional Access** requires KYC/KYB through Sumsub and **Qualified Acquirer** status under Bermuda law (≥$200k income, ≥$1M net worth, or ≥$5M corporate assets). | [open vs institutional](https://docs.onre.finance/for-capital-providers/open-access-vs-institutional-access), [KYC](https://docs.onre.finance/legal/kyc-and-aml-policy), [excluded jurisdictions](https://docs.onre.finance/legal/onyc-excluded-jurisdictions) |
| Redemption terms | Primary redemption through the app is for **verified wallets**; secondary buyers pass AML/ATF first. Fee 25 bps plus a convex liquidity haircut, atomic with `minimum_out`; "no backend queue" is claimed for the current deployment, while the FAQ still mentions "redemption windows, holding periods". Liquidity carve-out **about 15% of capital**. | [redemptions & liquidity](https://docs.onre.finance/technical-resources/redemptions-and-onchain-liquidity) |
| Scale | $300M AUM all-time high on 2026-09-16. $5M Series A (Forward Industries, RockawayX). $150M delegated to a Middle East MGA. | [Solana Compass](https://solanacompass.com/news/onre-surpasses-300m-aum-as-onyc-compounding-interest-rewards-season-1-opens-september-27), [RockawayX guide](https://rockawayx.com/insights/the-ultimate-guide-to-onre-2026-reinsurance-yield-meets-defi), [ecosystem](https://docs.onre.finance/onyc-in-defi/ecosystem-partnerships) |
| Buybacks | Discretionary open-market buybacks when the DEX price is below NAV, funded by premiums allocated to the "liquidity layer", fees and treasury. | [buybacks](https://docs.onre.finance/onyc-in-defi/onyc-buybacks) |
| Collateral custody | Off-chain custody in Coinbase Prime, Safe or Squads, released only by multisig. A cedent can be a **read-only viewer or co-signer** on the multisig. Collateral is released on a verified claim or on run-off. | [collateralised structure](https://docs.onre.finance/reinsurance-framework/collateralised-reinsurance-structure) |

*(inference)* The permissionless path is a deliberate split: DeFi users hold ONyc bought on-chain, while subscriptions and redemptions with the regulated entity run through an approved wallet set. In practice the "Open Access" mint goes through `take_offer_permissionless` or the Prop AMM buy, which have no approver check.

## On-chain architecture

### Deployment facts (mainnet, RPC read 2026-09-30)

| Item | Address or value |
|---|---|
| Program | `onreuGhHHgVzMWSkj2oQDLDtvvGvoepBPkqyaubFcwe` (BPF upgradeable) |
| Upgrade authority | `FvmhydbpHGQzMUp51GmhB1fwsrkyfmnRsTg7oPwDe25f`, a **Squads v4** vault (recent transactions are `VaultTransactionExecute`) |
| `State` PDA (`b"state"`) | `EL5qwcpKyc2FuQxjWmVLEwpcb4LXXwwWWjMYjf1yi3to`, with `boss = 45YnzauhsBM8CpUz96Djf8UG5vqq2Dua62wuW9H3jaJ5` |
| Boss account | The docs call it the "Squads multi-sig vault holding program-controlled collateral" ([token config](https://docs.onre.finance/technical-resources/token-configuration-and-reference)). It is **boss, freeze authority and AUM wallet** at once |
| ONyc mint | `5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5`, classic SPL Token, 9 decimals, supply about 252.9M |
| Mint authority | A program-owned PDA (`b"mint_authority"`). The program mints; the boss can reclaim authority through `transfer_mint_authority_to_boss` |
| `MarketStats` PDA | `BuPMet2URHuTVKSHpj32AjsXxHgdsqeA1i82dr1b4Mi5` (seed `b"market_stats"`) |
| Security | Embedded `security.txt` pointing to Immunefi. The build uses SIMD-0312 `CreateAccountAllowPrefund` for lazy PDA initialization |

### Stack and code layout

- Anchor **1.1.2**, `anchor-spl`, `spl-token-2022` (interface only), `bytemuck`. `Offer` is `zero_copy` (`Anchor.toml`, `programs/onreapp/Cargo.toml`).
- Tests: Rust **LiteSVM** integration tests, **Trident** fuzzing (`trident-tests/fuzz_0/invariants.rs`), a Surfpool mainnet-fork regression suite and `sbpf-coverage`. TypeScript is used only for the CLI and ops scripts.
- The CLI can output **base58 unsigned transactions for Squads signing**. A browser UI is generated from the IDL.
- Modules under `programs/onreapp/src/instructions/`: `offer/`, `redemption/`, `prop_amm/`, `buffer/`, `configurable_vault/`, `vault_operations/`, `mint_authority/`, `market_info/`, `state_operations/`, `initialization/`, `targeted_disable.rs`.

### Accounts and PDAs

| Account | Seeds | Key fields |
|---|---|---|
| `State` | `state` | `boss`, `proposed_boss` (two-step), `is_killed`, `onyc_mint`, `admins[20]`, `approver1`, `approver2`, `max_supply`, `worker`, `max_mint_amount`, `main_offer`, `reserved[56]` |
| `Offer` (zero-copy) | `offer, token_in_mint, token_out_mint` | `vectors[10]: OfferVector`, `fee_basis_points` (≤1000), `needs_approval`, `allow_permissionless`, `disabled`, `fee_basis_points_permissionless`, `reserved[128]` |
| `OfferVector` | none (inline) | `start_time`, `base_time`, `base_price` (1e9 scale), `apr` (1e6 = 100%), `price_fix_duration` (step size, seconds) |
| `RedemptionOffer` | `redemption_offer, token_in(ONyc), token_out(USDC)` | `offer`, `executed_redemptions: u128`, `requested_redemptions: u128`, `fee_basis_points`, `vault_target_bps`, `disabled`, `fee_basis_points_prop_amm_sell`, `reserved[104]` ([state L13-51](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/redemption/redemption_offer_state.rs#L13-L51)) |
| `RedemptionRequest` | `redemption_request, redemption_offer, redeemer, request_id(32B)` | `offer`, `request_id` (frontend UUID, exactly 32 bytes), `redeemer`, `amount`, `bump`, `fulfilled_amount`, `reserved[91]`; 216 bytes pinned by a test ([state L121-145](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/redemption/redemption_offer_state.rs#L121-L145)) |
| `MarketStats` | `market_stats` | `apy`, `circulating_supply`, `nav`, `nav_adjustment: i64`, `tvl`, `last_updated_at`, `last_updated_slot`, `reserved[95]` |
| `CirculatingSupplyExcluded*` | `circ_supply_excl_*` | Up to 20 owners (for example treasury) whose ONyc does not count as circulating |
| `BufferState` | `buffer_state` | `gross_apr`, `previous_supply`, `last_accrual_timestamp`, `management_fee_basis_points`, `performance_fee_basis_points`, `performance_fee_high_watermark(_enabled)` |
| `ConfigurableVault` | `configurable_vault, <kind>` | 9 kinds (`OfferFee`, `ManagementFee`, `PerformanceFee`, `PropAmmBuyFee`, `PropAmmSellFee`, `OfferProceeds`, `PropAmmProceeds`, `PermissionlessOfferFee`, `RedemptionFee`), each with one `withdrawal_destination` set by the boss |
| Vault authorities | `offer_vault_authority`, `redemption_offer_vault_authority`, `reserve_vault_authority`, `permissionless-1`, `mint_authority` | PDA signers; balances sit in ATAs under them |
| `PropAmmPairState` | `prop_amm_pair, offer` | Per-pair curve parameters and decaying sell and buy pressure, `reserved[284]` |

Every account has a `reserved: [u8; N]` tail and there is a `layout_compatibility.rs` test. This is how OnRe upgrades without migrations.

### Instruction set (66 instructions, `src/lib.rs`)

- **Offers (primary mint):** `make_offer`, `add_offer_vector`, `delete_offer_vector`, `delete_all_offer_vectors`, `update_offer_fee`, `update_offer_permissionless_fee`, `set_offer_disabled`, `take_offer[_v2]` (approval-gated when `needs_approval`), `take_offer_permissionless[_v2]` (never gated; routes through the `permissionless-1` PDA).
- **Redemption queue:** `make_redemption_offer`, `create_redemption_request(amount, request_id)`, `fulfill_redemption_request(amount)`, `cancel_redemption_request`, plus fee, vault-target and disable updates.
- **Prop AMM:** `configure_prop_amm`, `quote_swap_buy` and `quote_swap_sell` (views), `open_swap_buy` and `open_swap_sell(amount, minimum_out)`.
- **BUFFER (reserve and fee accrual):** `initialize_buffer`, `settle_buffer` (worker cron fallback), `set_buffer_gross_apr`, `set_buffer_fee_config`, `burn_for_nav_increase`, `deposit_reserve_vault`, `withdraw_reserve_vault`.
- **Governance:** `propose_boss` and `accept_boss`, `add_admin`, `remove_admin`, `clear_admins`, `set_kill_switch` (admins can only turn it **on**; the boss can toggle it), `add_approver`, `remove_approver`, `set_worker`, `set_main_offer`, `set_onyc_mint`, `configure_max_supply`, `configure_max_mint_amount`, `close_state`.
- **Vaults and mint authority:** offer and redemption vault deposit and withdraw, `set_configurable_vault_destination`, `withdraw_configurable_vault`, `transfer_mint_authority_to_program` and `_to_boss`, `mint_to`.
- **Market info:** `get_nav`, `get_apy`, `get_nav_adjustment`, `get_tvl[_v2]`, `get_circulating_supply[_v2]`, a permissionless **`refresh_market_stats`** crank, and the circulating-supply exclusion setters.

### How NAV works

- `offer_utils.rs::calculate_vector_price` computes `daily_factor = 1 + apr/(1e6·365)` and `price = base_price·daily_factor^full_days + linear intra-day delta`, then **snaps to `price_fix_duration` steps**, so NAV is constant within each step.
- `find_active_vector_at` picks the vector with the latest `start_time ≤ now`. `add_offer_vector` is boss-only and `start_time` cannot be in the past. A new `base_price` that differs from the old vector's end price is a **NAV jump**, which is how losses and gains are applied, exposed as `get_nav_adjustment` and `MarketStats.nav_adjustment`.
- The docs say: "NAV used for minting and redemption is computed from parameters stored inside the smart contract … No offchain service or external key determines issuance … There is no issuer-published onchain NAV signed by an OnRe key. The contract is the source." Pyth (market price) and Chainlink ("Onchain NAV" via Data Streams, used by Kamino) are distribution layers only ([token config](https://docs.onre.finance/technical-resources/token-configuration-and-reference), [market data](https://docs.onre.finance/technical-resources/onchain-market-data), [Chainlink blog](https://www.onre.finance/blog/onre-integrates-chainlink-to-power-onchain-nav-for-regulated-yield-bearing-global-reinsurance-markets)).
- Marketing says NAV is "recalculated daily by OnRe's Insurance Committee" ([Kamino Multiply blog](https://www.onre.finance/blog/unlocking-more-utility-onyc-joins-kamino-multiply)). *(inference)* In practice the committee re-baselines APR and base price by adding a vector, and the contract interpolates between updates.
- `MarketStats` is a cached snapshot with freshness fields; anyone can crank `refresh_market_stats`, and integrators are told to check `last_updated_at`.

### BUFFER: spread into a first-loss reserve

Source: `docs/BUFFER_ACCRUAL.md`, `instructions/buffer/accrual_utils.rs`.

- Two rates: `gross_apr` is what the pool earns (set by the boss); `current_yield` is the APR on `main_offer`, which holders get through NAV.
- On every supply-changing instruction the program first settles the interval since the last baseline: `mint = previous_supply × (gross_apr − current_yield) × Δt / (YEAR·1e6 + current_yield·Δt)`. It **mints that excess as ONyc** and splits it into a reserve vault, a management-fee vault and a performance-fee vault (high-water-mark gated), then records `previous_supply`.
- The spread becomes an **on-chain first-loss reserve** held in ONyc, and fees are taken by dilution. `burn_for_nav_increase` burns reserve ONyc to support NAV. All of it is capped by `max_mint_amount` per logical mint. `settle_buffer` is the worker cron used when there is no user activity.

## Redemption mechanics

### Async queue

**Create** ([create_redemption_request.rs L159-233](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/redemption/create_redemption_request.rs#L159-L233)). Anyone can call it and the redeemer pays rent. It is blocked by the kill switch and when the offer or redemption offer is disabled. It moves `amount` ONyc into the redemption vault and adds it to `requested_redemptions`. There is no minimum size and no allowlist. The PDA is `["redemption_request", redemption_offer, redeemer, request_id_bytes]` ([create L62-73](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/redemption/create_redemption_request.rs#L62-L73)), with the 32-byte ID enforced at create ([L165-168](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/redemption/create_redemption_request.rs#L165-L168)).

**No sequence number.** PR #151 ("refactor: use client-generated redemption request IDs") removed the old `request_counter: u64` and the counter-seeded PDA, keeping the slot as `gap: u64` so the layout stays put ([state L36-37](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/redemption/redemption_offer_state.rs#L36-L37)). The PR gives no rationale. *(inference)* The likely reason is the client race: with a counter seed, two concurrent creates collide and one fails.

**Fill** ([fulfill_redemption_request.rs L200-596](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/redemption/fulfill_redemption_request.rs#L200-L596)). The caller must be `state.worker`, the kill switch must be off and both offers enabled. **There is no ordering rule**: the worker may fill any request in any order. A fill needs `0 < amount ≤ amount_total − fulfilled_amount`. Pricing is per fill, via `process_redemption_core` ([redemption_utils.rs L56-112](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/redemption/redemption_utils.rs#L56-L112)):

```text
price     = compute_offer_current_price(offer, now)   // NAV from on-chain APR vectors, no oracle
fee       = ceil(amount × fee_bps / 10_000)            // ceiling per call
net       = amount − fee
token_out = floor(net × price × 10^out_dec / (10^in_dec × 10^9))
require token_out > 0                                  // a dust partial fill reverts
```

The program burns `net` ONyc (or sends it to proceeds when it does not hold the mint authority), sends the fee to the `RedemptionFee` vault, and pays `token_out` from the **pre-funded redemption vault** to the redeemer, whose ATA the worker creates; nothing is minted ([utils L236-303](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/redemption/redemption_utils.rs#L236-L303)). Counters update (`fulfilled_amount += amount`, `executed += amount`, `requested −= amount`) and an event carries this call's and the total filled amount, `is_fully_fulfilled`, the price, and the net, fee and output amounts. The account closes only when fully filled, and the rent goes to the worker rather than the redeemer who paid it.

Consequences of per-fill pricing: a request filled in k pieces gets k NAVs (NAV accrues upward, so later fills are slightly better); the ceiling fee applies k times, overcharging by at most k−1 base units; `token_out > 0` blocks dust fills.

**Cancel** ([cancel_redemption_request.rs L33-238](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/redemption/cancel_redemption_request.rs#L33-L238)). The boss, the worker **or the redeemer** may cancel ([L74-80](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/redemption/cancel_redemption_request.rs#L74-L80)). It returns `amount − fulfilled_amount`, reduces `requested_redemptions` and closes the account with rent to the worker. It is blocked by the kill switch, so holders cannot get locked shares back while it is on. There is no cooldown, fee or penalty.

**Trust surface.** `redemption_vault_withdraw(amount)` is boss-only and moves any amount of any mint out of the redemption vault without checking `requested_redemptions` ([redemption_withdraw.rs L114-146](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/vault_operations/redemption_withdraw.rs#L114-L146)); it is not time-locked in the program. The kill switch can be turned on by the boss or any admin and off only by the boss, and it blocks every token-moving path including cancel ([set_kill_switch.rs L66-90](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/state_operations/set_kill_switch.rs#L66-L90)).

### Prop AMM sell (`open_swap_sell(token_in_amount, minimum_out)`)

Code: [sell.rs](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/prop_amm/sell.rs), [pricing.rs](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/prop_amm/pricing.rs), [hard_wall_math.rs](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/prop_amm/hard_wall_math.rs), [config.rs](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/prop_amm/config.rs). Docs in the repo: `docs/PROP_AMM_PRICING_MODEL.md`, `docs/PROP_AMM_NOTION_SPEC.md`.

**Gates.** Any signer, no allowlist and no approver. Kill switch off ([sell.rs L66-71](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/prop_amm/sell.rs#L66-L71)); canonical, enabled pair ([validation.rs L51-105](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/prop_amm/validation.rs#L51-L105)); offer enabled; the `RedemptionOffer` enabled if it exists, otherwise fee and target are treated as 0 ([pricing.rs L26-52](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/prop_amm/pricing.rs#L26-L52)). There is no price-staleness check (NAV is a deterministic schedule), no solvency concept, and no check against `requested_redemptions`: atomic sells and queued fills draw on the **same** vault balance.

**Pipeline** ([sell.rs L321-344](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/prop_amm/sell.rs#L321-L344)):

```text
1. Fee (in ONyc):
   fee = max(ceil(in × fee_bps_prop_amm_sell / 10_000), minimum_sell_haircut_onyc)
   net = in − fee
   raw = floor(net × NAV × 10^out_dec / (10^in_dec × 10^9)); reject if raw == 0
2. Liquidity (pricing.rs L54-121):
   L = redemption-vault token_out balance
   R = (vault_target_bps == 0) ? L : min(L, TVL × vault_target_bps / 10_000)   // TVL refreshed first
   reject if L == 0 or R == 0 or raw > L
3. Effective volume (pricing.rs L275-323):
   V = decayed previous net sell + current net sell + raw   // the order pays for its own pressure
4. Dynamic wall (pricing.rs L325-397):
   W = L / (1 + s × V / L), E = min(W, R)
5. Haircut (pricing.rs L139-205, L457-547):
   u = raw / E
   base    = h_peg × u^e                       // Q40 log/exp series (hard_wall_math.rs L40-154)
   y       = y_max × min(n, threshold) / threshold
   cadence = min(1, (8x / (8x + 1 − x)) × y / 3), x = min(u, 1)
   haircut = max(base, cadence); out = floor(raw × max(0, 1 − haircut))
6. require out ≥ minimum_out (checked before any transfer)
7. Burn net (or send to proceeds); fee to the sell-fee vault; out from the redemption vault.
   The haircut (raw − out) stays in the redemption vault.
```

**Parameters** ([config.rs L7-46](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/prop_amm/config.rs#L7-L46)):

| Parameter | Field | Default | Validation |
|---|---|---|---|
| Peg haircut at u = 1 | `curve_peg_haircut_bps` | 700 (7%) | ≤ 10,000 |
| Exponent | `curve_exponent_scaled` | 25,000 (2.5) | 1,000 to 100,000, step 1,000 |
| Wall sensitivity | `wall_sensitivity_scaled` | 20,000 (2.0) | > 0 |
| Epoch | `epoch_duration_seconds` | 86,400 | > 0 |
| Cadence threshold | `cadence_threshold` | 20 sells | > 0 |
| Cadence wave max | `cadence_wave_scaled` | 10,000 (y = 1) | 0 to 50,000, step 1,000; 0 = off |
| Minimum sell fee | `minimum_sell_haircut_onyc` | 5 ONyc | none |
| Sell fee | `fee_basis_points_prop_amm_sell` | 0 at create | ≤ 1,000 |
| Reserve target | `vault_target_bps` | 0 | ≤ 10,000 |

Haircut magnitudes on the default curve with no cadence, computed by the researcher from the formula (unverified): 0.02% at u = 0.10, 1.24% at u = 0.50, 5.8% at u = 0.926, 7% at u = 1.0. The pricing doc's worked example: L = R = 10,000, a 5,000 sell with a 5% fee gives raw = 4,750 and W ≈ 5,128, so the seller receives about 4,475. Cadence dominates after many sells: with y = 1 after 20 sells in an epoch the cadence target is 29.6% at u = 0.5 and 33% at u ≥ 1 (computed, unverified); with `y_max = 5` the haircut can reach 100%.

The doc calls the endpoint formula "not mathematically split-proof"; the dynamic wall, the cadence wave and the flat minimum fee make splitting progressively worse. Test `test_hard_wall_curve_is_vulnerable_to_order_splitting` ([tests/prop_amm.rs L219](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/tests/prop_amm.rs#L219)) documents the residual and `test_cadence_penalizes_small_split_sells` shows the fix. Other edge cases: a sell with `minimum_out = 0` can execute with zero output; slippage protection is `minimum_out` only, with no deadline or `max_age`; `quote_swap_sell` ([quote.rs L159-215](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/prop_amm/quote.rs#L159-L215)) returns `minimum_out = token_out_amount`; and if BUFFER accrual runs before the burn, R is not recomputed (`TOKEN_FLOW_ROUTING.md`).

**Formula history.** The curve was revised four times before any deploy: a blended `0.2u + 0.8u³` penalty (`d93b231`), a dynamic wall plus a liquidation floor (`880be62`), the floor removed (`5e86ebe`), an exponent falling with sell count (`2f91c58`), and today's fixed exponent with a separate cadence target, per-pair PDAs and the target moved to `RedemptionOffer.vault_target_bps`. *(inference)* Curve parameters belong in config and the curve shape behind a version byte.

### Refill on buys

On `open_swap_buy`, `take_offer_v2` and `take_offer_permissionless_v2` ([offer_utils.rs L201-231](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/offer/offer_utils.rs#L201-L231), [buy.rs L361-425](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/prop_amm/buy.rs#L361-L425)):

```text
if vault_target_bps == 0 → refill = 0
target   = TVL × vault_target_bps / 10_000     // MarketStats unreadable → target 0
headroom = max(0, target − redemption_vault_balance)
refill   = min(net_inflow, headroom)           // net of the buy fee; fees never refill
proceeds = net_inflow − refill
record_prop_amm_buy(net_inflow)                // the full net relieves sell pressure
```

The `take_offer_v2` paths skip refill when the program controls the token_in mint ([TOKEN_FLOW_ROUTING.md](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/docs/TOKEN_FLOW_ROUTING.md), "Shared Refill Rule"). The vault balance passed in is named `redemption_vault_token_in_account.amount` ([buy.rs L369-376](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/prop_amm/buy.rs#L369-L376)); on a buy, token_in is the pair asset (USDC), so it is the correct account, but the naming is easy to misread.

### Kill switches and disable flags

| Switch | Scope | Who |
|---|---|---|
| `state.is_killed` | Every token move: create, fill and cancel request; swaps; quotes; vault deposits and withdrawals | On: boss or admin. Off: boss only |
| `RedemptionOffer.disabled` | Create and fill request; Prop AMM sell and quote; refill skipped | Boss |
| `Offer` disabled | Create, fill, sell and buy | Boss |
| `PropAmmPairState.enabled` | Prop AMM buy, sell and quote for one pair | Boss |
| `offer.allow_permissionless()` | Prop AMM buy execution only | Boss |

Nothing switches off automatically on a stale price, a drawdown or a pending claim. The kill switch does not halt governance or configuration, so recovery is possible while paused, and `authorize_targeted_disable` lets admins disable single offers without a global pause. Token-2022 mints with non-zero transfer fees are rejected on value paths.

### Access control and KYC

Off-chain approvers sign `ApprovalMessage {program_id, user_pubkey, expiry_unix}`. The transaction includes an **Ed25519 precompile** instruction that the program parses from the instructions sysvar (`utils/ed25519_parser.rs`). Two approver slots allow key rotation.

## Audits

- [Independent audits page](https://docs.onre.finance/security-and-verification/independent-audits): Quantstamp (spec Apr 2025, program May 2025, diff Sep 2025, re-audit v3 Jan 2026), Ackee (Nov 2025), OtterSec (Aug 2026), HT Digital (FY2025 financial statements).
- [Ackee summary](https://ackee.xyz/blog/onre-tokenized-reinsurance-pools-audit-summary/) ([full PDF](https://app.onre.finance/files/ackee-blockchain-onre-onre-report.pdf)): 17 findings, none critical or high. Mediums: a missing `token_program` constraint breaking Token-2022 withdrawals; approver rotation lockout; **the boss could mint unbounded ONyc**, fixed with `max_supply` and `max_mint_amount`; Token-2022 extensions not validated. Lows: single-step ownership transfer (now propose and accept) and an `initialize` front-run. Warnings: a backdated vector, an APY versus `take_offer` model inconsistency, fees burned instead of collected, and a TOCTOU.
- [Immunefi bounty](https://immunefi.com/bug-bounty/onre/information/) up to $100k. [Allez Labs](https://allez.xyz/reports/onre/ONyc_Asset_Risk_Assessment_260731.pdf) rated ONyc A-. [Apex Group](https://docs.onre.finance/security-and-verification/independent-attestations) does monthly NAV and treasury attestations.

Audit trail on the redemption paths, from the repo history:

| When | Item | Content |
|---|---|---|
| 2025-05 | PR #5 | First audit round fixes |
| 2025-08 | PR #29 | Audit fixes on offers |
| 2025-11 | PR #63 | Vector addition blocked (audit warning) |
| 2025-11 | PR #77 (Ackee fork) | Trident fuzz tests for the audit revision |
| 2026-01 | PR #106 | Audit suggestions on redemption create, fill, cancel and fees: unchecked-account typing, `redemption_admin` default at init, uninitialized offer rejected, fee cap lowered from 10,000 to 1,000 bps, overflow checks on `token_out` and net+fee, no-op fee change rejected |
| 2026-02 | PR #118 | Partial redemptions, after the audit |
| 2026-04 | PRs #140, #138 | BUFFER accrual fixes (supply base, dilution, settle before config) |
| 2026-09 | PR #151 | Client UUID request IDs, after the audit; removed the counter |
| n/a | Prop AMM | No audit reference; the pricing doc says it "has not been deployed" |

Observations from reading the code (not audit findings): rent from closed requests goes to the worker though the redeemer paid it; the boss can withdraw locked request collateral; the kill switch blocks cancel; sell and queue share one vault, so atomic sellers can jump the queue; a zero-output sell succeeds when `minimum_out = 0`; there is no fill ordering; the fee is rounded up on each fill.

> **Since this research:** OnRe's later OtterSec report (Aug 2026) records the zero-output and per-fill rounding points as suggestions. MUTAV adopted both lessons: a fill that would mint or pay nothing is refused, and when partial fills arrive any fee or rounding is computed once per request, not per fill ([ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)).

## DeFi integrations and what they required

| Venue | Use | Source |
|---|---|---|
| **Kamino** | ONyc collateral reserve plus USDC, USDG and USDS borrow; Multiply (one-click loop); PT-ONyc reserve. The market passed $200M. | [lending docs](https://docs.onre.finance/onyc-in-defi/defi-opportunities/lending-and-borrowing), [Kamino launch](https://www.onre.finance/blog/onyc-launches-on-kamino-unlocking-real-world-yield-and-collateral-utility-in-solana-defi) |
| **Exponent** | PT/YT yield trading (ONyc-10SEP26), plus **srONyc/jrONyc senior and junior tranching** (junior is first loss). | [yield trading](https://docs.onre.finance/onyc-in-defi/defi-opportunities/yield-trading), [tranching](https://docs.onre.finance/onyc-in-defi/defi-opportunities/risk-tranching-markets) |
| **RateX** | Leveraged yield trading | [yield trading](https://docs.onre.finance/onyc-in-defi/defi-opportunities/yield-trading) |
| **Loopscale** | Looping vaults, PT collateral | [yield trading](https://docs.onre.finance/onyc-in-defi/defi-opportunities/yield-trading) |
| Orca, Raydium, Jupiter, Carrot | Secondary liquidity and routing | [FAQ](https://docs.onre.finance/technical-resources/frequently-asked-questions) |
| **Titan** (aggregator) | Routes through `open_swap_buy` and `open_swap_sell`. OnRe published [`jup-onyc-integration`](https://github.com/onre-finance/jup-onyc-integration), a Rust venue adapter plus a `no_std` `onre-pricing` crate mirroring the on-chain math. | repo README |
| Curated vaults | RockawayX on Accountable (EVM), Loopscale on Exponent, Elemental | [curated vaults](https://docs.onre.finance/onyc-in-defi/defi-opportunities/curated-vault-strategies) |
| EVM | [`onre-evm`](https://github.com/onre-finance/onre-evm), an "EVM equivalent of OnRe Solana program" | GitHub |

What this demanded of the token: plain SPL, freely transferable and non-rebasing (Kamino, Exponent SY wrappers and AMMs need no hooks or transfer fees); a readable on-chain price (`MarketStats` with freshness, plus Chainlink and Pyth feeds); and atomic exit liquidity (Prop AMM with `quote_*` views and `minimum_out`) so liquidators and aggregators can route. *(inference)* Kamino liquidations need an exit that does not rely on the queue, which is why the Prop AMM exists; a transfer-hook KYC would have prevented these integrations. Points at 1–6× by venue are paid to drive collateral use ([points](https://docs.onre.finance/onyc-in-defi/onre-points-program)).

## Transparency patterns worth copying

1. **Show the yield split, not one blended APY.** OnRe's dashboard separates collateral yield from underwriting yield ([transparency dashboard](https://docs.onre.finance/introduction/transparency-dashboard)). For MUTAV: guarantee-fee income versus income on the reserve's assets.
2. **Disclose the book in aggregate** while keeping counterparties confidential. For MUTAV: contracts by city and rent band, total cover outstanding, default rate and average tenor, with no tenant personal data.
3. **One on-chain stats account** with a documented byte layout, a permissionless refresh and mirrored REST endpoints (`/data/live-nav`, `/live-apy`, `/live-tvl`).
4. **A "token configuration" page listing every authority**: program, upgrade authority, mint authority, freeze authority and treasury.
5. **A redemption quote UX**: "You redeem 1,000, expect 995, minimum 990", next to the liquidity balance.
6. **A verification page** listing audits, attestations, risk rating and bounty, each as a dated row with a PDF link.
7. **An emergency display rule**: keep showing the last snapshot with its timestamp, plus "execution paused".

## How OnRe maps to MUTAV

All of this section is *(inference)* unless a source is linked.

### What maps directly

| OnRe | MUTAV analogue |
|---|---|
| Segregated account collateralizing reinsurance | The reserve backing *fiança* guarantees |
| Premiums earned over the coverage period, accruing into NAV | Guarantee fees earned over the lease term |
| Claims cause a NAV jump through a new vector | Claim payments from the reserve lower NAV |
| Collateral yield (T-bills, sUSDe and others) | Idle float allocated to yield venues |
| `vault_target_bps` liquidity carve-out (about 15%) | Required liquid coverage for expected claims |
| BUFFER spread minted into a first-loss reserve | A first-loss buffer built from the fee spread |
| srONyc/jrONyc via Exponent | A later junior first-loss tranche over the MUTAV share |

> **Since this research:** the pilot reserve holds BRS only, and its income is the issuer's partnership revenue rather than venue yield. Other assets (Etherfuse TESOURO first) come later through adapters, with the TESOURO cap at 0 until its open items close ([ADR 0018](../decisions/0018-brs-only-pilot-reserve.md), [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), proposed). The income take that would have built a spread was removed from the pilot program ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)).

### What does not map

- **Solvency gating.** OnRe has no on-chain solvency check on exit; redemption is limited only by vault balance, the haircut curve and the worker. MUTAV fills redemptions only out of free capital, after the coverage the guarantees need ([ADR 0005](../decisions/0005-solvency-gate-scope.md), [ADR 0008](../decisions/0008-uniform-capital-flow-and-pause-scope.md)).
- **Queue order.** OnRe's queue is worker-discretionary and keyed by UUID. MUTAV's queue is strict FIFO with an on-chain sequence ([ADR 0008](../decisions/0008-uniform-capital-flow-and-pause-scope.md)).
- **Exposure shape.** OnRe's exposure is contractually capped and short-tail (ILWs with binary triggers). MUTAV's claims are frequent, small and correlated with the Brazilian macro cycle, so required coverage should be modelled from default rates and loss given default rather than a fixed bps target.
- **Access.** OnRe splits permissionless secondary holding from a KYC'd primary market; that pattern was considered for a hackathon demo.

> **Since this research:** coverage is `max(ceil(c × remaining cover), provisions + min(stress_buffer, unprovisioned cover))`, with `c ≥ 0.10` and an admin-set stress buffer sized from the claims that could be filed next ([ADR 0016](../decisions/0016-coverage-ratio-below-one.md), [ADR 0022](../decisions/0022-coverage-stress-buffer-underwater-reserve.md)). The pilot runs on MUTAV's own capital, and investor actions are gated by an on-chain allowlist.

### Design recommendations made at the time

1. **Anchor, one program, OnRe's governance shape**: a boss-like admin on a Squads v4 vault, two-step handover, admins that can only enable the kill switch, a worker or operator key, supply and mint caps, and a `reserved` tail on every account.
   > **Since this research:** MUTAV separates the operator (contract facts and the claim cycle) from the reserve admin (Squads multisig: caps, capital flows, security). Role and admin handovers are two-step (`propose`/`accept`, with a 72-hour expiry), and up to three guardian keys may only pause ([ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md)). Admin and upgrade authority sit in two multisigs with time locks of 24 hours and 7 days on the real pilot (5 minutes and 1 hour on devnet).
2. **A classic SPL share mint with a program-PDA mint authority**, no transfer hooks or fees if DeFi composability is a goal; KYC at primary deposit and exit, not on transfer.
   > **Since this research:** devnet keeps classic SPL shares. Mainnet shares will be transfer-restricted at the token level, with the mechanism chosen before the mainnet `initialize`. Freely transferable shares would weaken wallet-level exit limits ([ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)).
3. **An explicit NAV model.** OnRe's APR vectors are simple and auditable, but NAV is admin-asserted. MUTAV can compute NAV from on-chain state (reserve assets plus venue positions minus accrued claim liabilities, over supply) and use an admin or oracle input only for off-chain items.
   > **Since this research:** adopted. NAV is computed on-chain from internally tracked balances, with provisions booked at filing ([ADR 0004](../decisions/0004-onchain-nav-internal-accounting.md)).
4. **A `MarketStats`-style account** holding NAV, TVL, required coverage, surplus, coverage ratio, queue depth and freshness, with a permissionless refresh crank.
5. **Separate liquidity domains** (fee proceeds, redemption liquidity, a claims reserve, fee vaults) as distinct PDAs, with new deposits refilling redemption liquidity up to a target first.
   > **Since this research:** guarantee fees, MUTAV's operation and MUTAV's reserve share are separate flows ([ADR 0009](../decisions/0009-separate-mutav-money-flows.md)), and the fee take goes straight to the treasury ([ADR 0007](../decisions/0007-fee-take-direct-to-treasury.md)).
6. **Redemption:** keep the surplus-gated FIFO queue as the primary path with partial fills, let anyone crank fills when surplus allows, and add a small atomic instant exit with a haircut curve later.
   > **Since this research:** partial fills at the queue head were accepted ([ADR 0010](../decisions/0010-partial-fills-at-queue-head.md)); the pilot ships whole fills, and partial fills come in the first upgrade after the hackathon ([ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md)). Fills stay with the admin; after `max_queue_wait_secs` anyone may fill the head request under the same rules, which is built before outside capital ([ADR 0025](../decisions/0025-exit-fallback-cooldown-exit.md)). The instant exit was designed ([ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)) and its state left the pilot program ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)).
7. **KYC gating** with an approver-signed `ApprovalMessage` verified through the Ed25519 precompile, set per offer.
8. **Emergency controls**: a global kill switch on value paths only, a per-offer disable flag, and configuration callable while killed.
   > **Since this research:** pause stops only capital flows and new guarantees. Claim payments, cancels and claims of filled requests stay open under pause, unlike OnRe's kill switch, which blocks cancel ([ADR 0008](../decisions/0008-uniform-capital-flow-and-pause-scope.md), [ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md)).
9. **Testing stack to mimic**: LiteSVM Rust tests, a Trident fuzz invariants file (for example "reserve ≥ required coverage after every instruction"), Surfpool fork tests, a public IDL and a documented account layout.
10. **Spread-to-reserve accrual (BUFFER)**: if MUTAV promises less than it earns, hold the spread in a first-loss buffer with fee splits and a high-water mark.

### Partial fills: the port from OnRe

| OnRe | MUTAV design at the time |
|---|---|
| `fulfilled_amount` (token_in) | `filled_shares: u64` on `RedeemRequest`, plus `assets_owed: u64` accumulated across fills (MUTAV claims assets after the fill) |
| The worker fills any request | Fills touch only the head request; a partial fill is allowed only on the head and only as the last fill of a batch; the head advances only when fully filled or cancelled |
| Fill size chosen by the worker | `min(remaining, shares_for(min(free_capital, brs_liquid)))`, recomputed after each full fill; the admin may pass a cap; reject `assets_out == 0` |
| Priced at NAV per call | Same, with a `RedeemPartiallyFilled` event per fill; shares burned per fill |
| Fee rounded up per fill | No redemption fee; `assets_out` rounded down per fill in the reserve's favour |
| Boss, worker or user may cancel; blocked by the kill switch | `cancel_redeem` stays owner-only and never pausable, returns the unfilled remainder, and filled assets stay claimable |
| Rent to the worker | Rent to the owner on close |
| Client UUID PDA, no sequence | MUTAV needs `seq` for strict FIFO; the PDA could use an owner-and-nonce seed to avoid client races |

OnRe fills against vault balance alone; MUTAV fills against free capital, so a partial fill drains free capital to exactly 0 and idle surplus no longer waits behind a head request too large to fit.

> **Since this research:** the partial-fill design is [ADR 0010](../decisions/0010-partial-fills-at-queue-head.md), deferred past the pilot by [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md). Request PDAs keep the global sequence seeds; a client whose `seq` was taken retries with the next one, and the owner-and-nonce alternative was rejected (ADR 0023).

### Instant exit: adapting the Prop AMM sell

What maps: the haircut shape `max(h_peg·u^e, cadence(u, n))` with a dynamic wall over an **earmarked buffer** rather than a shared vault; the epoch decay tracker unchanged; a required `minimum_out` plus a NAV-age or deadline argument (which OnRe lacks); and a flat minimum exit fee against splitting. The haircut stays in the reserve, so in MUTAV it raises NAV for the holders who remain.

What must change: the instant exit pays only from the earmark and the queue only from free capital (which excludes the earmark), so neither starves the other; the earmark is funded only from surplus, and only after the queue head is served; automatic disables on every exit (feature off, under-coverage, pause, an unprovisioned claim, a stale price, a non-allowlisted caller, `out > earmark`); the wall and target based on on-chain `net_assets` after a same-slot refresh; and `out == 0` rejected regardless of `minimum_out`. Claim payments stay ungated and may draw down the earmark.

> **Since this research:** this became [ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md). The phase-2 exit parameters and the buffer earmark were removed from the pilot program; the design returns later as a carve from padding ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)).

### Upgrade readiness: what OnRe's history proves

OnRe changed live accounts without a migration three times: it carved `fulfilled_amount` (8 bytes) from `RedemptionRequest.reserved` (127 to 119); carved `vault_target_bps`, `disabled` and `fee_basis_points_prop_amm_sell` (5 bytes) from `RedemptionOffer.reserved` (109 to 104); and replaced a `u64` request ID with `String(32)` inside the same 216-byte allocation (119 to 91), renaming the retired counter to `gap: u64` so later offsets do not shift. [tests/layout_compatibility.rs](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/tests/layout_compatibility.rs) serializes a `Legacy*` struct, deserializes it as the new one and asserts `8 + INIT_SPACE == N`.

The recommendations for MUTAV were: copy the layout-compatibility test for every account from day one; size padding for phase 2 explicitly; retire fields with a `gap`, never by deletion; put outgrown phase-2 state in a new PDA; and ship the solvency formula with the earmark already subtracted, held at 0.

> **Since this research:** padding is sized so the guarantee, claim and payout lifecycles and the phase-2 carves fit without a migration, and later fields read zero as "off" (ADR 0019, [ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)). Upgrade readiness is set out in [ADR 0011](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md).

## Corrections and open questions

Corrections made by the deep dive to the first OnRe note: cancel is open to the redeemer, the worker or the boss, not worker-only ([cancel L74-80](https://github.com/onre-finance/onre-sol/blob/c0490831f438074562ebf51e437ca5f8e027596b/programs/onreapp/src/instructions/redemption/cancel_redemption_request.rs#L74-L80)); and while the docs site describes the Prop AMM sell as live ("no backend queue"), the repo's `PROP_AMM_PRICING_MODEL.md` says "Prop AMM has not been deployed", so treat it as unaudited and pre-deploy as of `c049083`.

Open at the time of research:

- The full Quantstamp and OtterSec reports were not fetched; only the Ackee summary was read.
- On-chain enforcement of "redemptions for verified wallets only" is unclear: `open_swap_sell` has no approver check in code, so gating appears to be UI-level *(inference)*.
- The Apex attestation contents and the transparency dashboard URL were not captured.
- Whether the boss Squads vault also signs routine `add_offer_vector` NAV updates, or a lower threshold is used for them, is unknown; likely the same vault *(inference)*.

> **Since this research:** a later MUTAV review (2026-10-10) read OnRe's Ackee, OtterSec and Quantstamp findings and mapped them to MUTAV by vulnerability class. It adopted the two-step role handover, once-per-request rounding for partial fills, and keeping cancels and claims open under pause ([ADR 0020](../decisions/0020-operator-admin-separation-and-recovery.md), [ADR 0023](../decisions/0023-capital-flows-and-exit-rights.md), [ADR 0008](../decisions/0008-uniform-capital-flow-and-pause-scope.md)). It did not adopt admin-set APR price vectors (MUTAV derives NAV on-chain) or an AMM instant exit for the pilot.

## Sources

- OnRe program source: [onre-finance/onre-sol](https://github.com/onre-finance/onre-sol) at commit `c0490831f438074562ebf51e437ca5f8e027596b` (code links inline above)
- [OnRe live TVL API](https://core.api.onre.finance/data/live-tvl)
- OnRe docs: [ONyc](https://docs.onre.finance/introduction/onre-tokenized-reinsurance-onyc), [FAQ](https://docs.onre.finance/technical-resources/frequently-asked-questions), [regulatory framework](https://docs.onre.finance/for-insurers/regulatory-framework), [KYC & AML policy](https://docs.onre.finance/legal/kyc-and-aml-policy), [portfolio makeup](https://docs.onre.finance/reinsurance-framework/portfolio-makeup), [collateral composition](https://docs.onre.finance/for-capital-providers/collateral-composition), [yield mechanisms](https://docs.onre.finance/introduction/yield-mechanisms), [minting](https://docs.onre.finance/for-capital-providers/minting-onyc), [open vs institutional access](https://docs.onre.finance/for-capital-providers/open-access-vs-institutional-access), [excluded jurisdictions](https://docs.onre.finance/legal/onyc-excluded-jurisdictions), [redemptions and liquidity](https://docs.onre.finance/technical-resources/redemptions-and-onchain-liquidity), [ecosystem partnerships](https://docs.onre.finance/onyc-in-defi/ecosystem-partnerships), [buybacks](https://docs.onre.finance/onyc-in-defi/onyc-buybacks), [collateralised structure](https://docs.onre.finance/reinsurance-framework/collateralised-reinsurance-structure), [token configuration](https://docs.onre.finance/technical-resources/token-configuration-and-reference), [on-chain market data](https://docs.onre.finance/technical-resources/onchain-market-data), [independent audits](https://docs.onre.finance/security-and-verification/independent-audits), [independent attestations](https://docs.onre.finance/security-and-verification/independent-attestations), [lending and borrowing](https://docs.onre.finance/onyc-in-defi/defi-opportunities/lending-and-borrowing), [yield trading](https://docs.onre.finance/onyc-in-defi/defi-opportunities/yield-trading), [risk tranching](https://docs.onre.finance/onyc-in-defi/defi-opportunities/risk-tranching-markets), [curated vaults](https://docs.onre.finance/onyc-in-defi/defi-opportunities/curated-vault-strategies), [points](https://docs.onre.finance/onyc-in-defi/onre-points-program), [transparency dashboard](https://docs.onre.finance/introduction/transparency-dashboard)
- OnRe blog: [Chainlink on-chain NAV](https://www.onre.finance/blog/onre-integrates-chainlink-to-power-onchain-nav-for-regulated-yield-bearing-global-reinsurance-markets), [Kamino Multiply](https://www.onre.finance/blog/unlocking-more-utility-onyc-joins-kamino-multiply), [Kamino launch](https://www.onre.finance/blog/onyc-launches-on-kamino-unlocking-real-world-yield-and-collateral-utility-in-solana-defi)
- [Solana Compass: OnRe surpasses $300M AUM](https://solanacompass.com/news/onre-surpasses-300m-aum-as-onyc-compounding-interest-rewards-season-1-opens-september-27)
- [RockawayX: the ultimate guide to OnRe](https://rockawayx.com/insights/the-ultimate-guide-to-onre-2026-reinsurance-yield-meets-defi)
- [Ackee audit summary](https://ackee.xyz/blog/onre-tokenized-reinsurance-pools-audit-summary/) and [full report](https://app.onre.finance/files/ackee-blockchain-onre-onre-report.pdf)
- [Immunefi bounty](https://immunefi.com/bug-bounty/onre/information/)
- [Allez Labs risk assessment](https://allez.xyz/reports/onre/ONyc_Asset_Risk_Assessment_260731.pdf)
- [onre-finance/jup-onyc-integration](https://github.com/onre-finance/jup-onyc-integration)
- [onre-finance/onre-evm](https://github.com/onre-finance/onre-evm)
- Solana mainnet RPC reads of the OnRe program, `State`, mint and `MarketStats` accounts (2026-09-30)

## Decisions

- [ADR 0004: NAV computed on-chain with internal accounting](../decisions/0004-onchain-nav-internal-accounting.md)
- [ADR 0005: Solvency gate scope](../decisions/0005-solvency-gate-scope.md)
- [ADR 0007: Fee take direct to the treasury](../decisions/0007-fee-take-direct-to-treasury.md)
- [ADR 0008: Uniform capital flow and pause scope](../decisions/0008-uniform-capital-flow-and-pause-scope.md) (strict FIFO; cancels stay open under pause)
- [ADR 0009: Separate MUTAV money flows](../decisions/0009-separate-mutav-money-flows.md)
- [ADR 0010: Partial fills at the queue head](../decisions/0010-partial-fills-at-queue-head.md) (ported from OnRe's `fulfilled_amount`)
- [ADR 0011: Phase-2 instant exit and upgrade readiness](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md) (adapted from OnRe's Prop AMM sell)
- [ADR 0016: Coverage ratio below one](../decisions/0016-coverage-ratio-below-one.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md) (two-step handover, as in OnRe)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md) (whole fills in the pilot; once-per-request rounding)
- [ADR 0025: Exit fallback: a cooldown exit](../decisions/0025-exit-fallback-cooldown-exit.md)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md)
- [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) (proposed)
