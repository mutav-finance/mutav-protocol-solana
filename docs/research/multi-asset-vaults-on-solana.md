# Keep claims liquid, price TESOURO at source

Production Solana multi-asset programs converge on one shape. Each asset gets its own PDA-owned token account and its own config record. A privileged role sets targets and caps, and a constrained or permissionless crank moves value toward those targets. Every asset is valued from the issuer's or protocol's own accounted exchange rate wherever one exists, not from a DEX price. MUTAV should adopt that shape almost unchanged, with four deliberate departures driven by its own constraints.

First, because claims are payable only in BRS and TESOURO cannot be swapped or redeemed atomically on-chain, the BRS sleeve should not be a soft target. It should be a **hard liquidity floor equal to the larger of the settlement floor and an obligations-based floor sized to cover expected claims over TESOURO's redemption lead time**. That lead time is undocumented by Etherfuse and has to be treated as a parameter, not assumed to be T+0.

Second, TESOURO should be priced from **Etherfuse's BRL-native `BondPrice` PDA, capped by a deterministic accrual corridor**. The only on-chain TESOURO feed (RedStone) is USD-quoted, single-sourced from Etherfuse's own API and updated on a 24-hour heartbeat, so it serves as a cross-check, not a primary.

Third, the largest recent Solana losses (Drift, about $285M in April 2026) came from admin keys adding fake collateral with a manipulable price. Adding an adapter, an oracle or a cap increase must therefore go through the Squads multisig behind a non-zero timelock, with every new adapter starting at a cap of zero.

Fourth, NAV must come from internally tracked balances with post-CPI delta checks, rounding against the user, and a "NAV did not decrease" invariant on every rebalance.

## Production vaults separate who sets targets from who moves the assets

Two architectural families exist on Solana, and MUTAV's case falls between them.

**Single-asset, multi-destination allocators** keep one large vault account with a fixed array of destinations. Kamino's kVault holds `vault_allocation_strategy: [VaultAllocation; 25]`. Each entry carries a `target_allocation_weight`, a `token_allocation_cap` and a cToken cap, alongside an explicit `unallocated_weight` and `unallocated_tokens_cap` that make the idle buffer a first-class destination ([kvault vault_state.rs](https://github.com/Kamino-Finance/kvault/blob/HEAD/programs/kvault/src/state/vault_state.rs), [vault_allocation.rs](https://github.com/Kamino-Finance/kvault/blob/HEAD/programs/kvault/src/state/vault_allocation.rs)). Meteora's Dynamic Vault allows up to 30 strategies ([Meteora state.rs](https://github.com/MeteoraAg/vault-sdk/blob/HEAD/programs/vault/src/state.rs)).

**True multi-asset pools** use one config record per asset. Jupiter's JLP keeps a separate `Custody` account per asset holding mint, decimals, oracle, `targetRatioBps` and a set of per-action `permissions` flags ([Jupiter Custody account](https://developers.jup.ag/docs/perps/custody-account)). Sanctum Infinity keeps one entry per LST in a growable list, with a reserve ATA owned by the pool-state PDA, a pluggable SOL-value calculator program and an "input disabled" flag ([Sanctum Infinity technical](https://learn.sanctum.so/docs/technical-documentation/infinity.md)).

Infinity also has the cleanest asset lifecycle in production. `AddLst` creates the reserve account. `DisableLstInput` prepares the asset for removal, and `RemoveLst` closes it only once it is drained ([S controller instructions](https://github.com/igneous-labs/S/blob/master/docs/s-controller-program/instructions.md)). MUTAV should copy this lifecycle directly for adapters: add, then ramp the cap from zero; later, disable inflows, drain, and close.

**The adapter boundary is the key design choice, and production programs disagree on it.** Kamino hard-wires its CPI calls to a single lending program (`cpi_deposit_reserve_liquidity`, `cpi_redeem_reserve_liquidity_*`) and reads that program's own exchange rate to value positions ([klend_operations.rs](https://github.com/Kamino-Finance/kvault/blob/HEAD/programs/kvault/src/operations/klend_operations.rs)).

Voltr takes the opposite approach. It lets an admin register arbitrary adaptor programs whose deposit instruction "must return the current position value as `u64`", and the vault books that number ([Voltr core components](https://github.com/voltrxyz/docs/blob/HEAD/protocols/adaptor-creation/core-components.mdx)). This shifts both valuation trust and account validation onto each adaptor's author ([Voltr adaptor security](https://github.com/voltrxyz/docs/blob/HEAD/protocols/adaptor-creation/security.mdx)).

For a reserve whose audit surface should stay small, the Kamino model is correct. Each adapter is a variant compiled into the MUTAV program. Each has its own config PDA pinning the adapter's mint, token program, valuation source account and external program ID, and the program reads value itself rather than accepting a self-reported number. Infinity's swappable calculator programs show where to put the one deliberate seam: valuation. With that seam, a second treasury issuer later becomes a new valuation module plus a config entry, not a rewrite of the custody core.

Kamino's split of authority is the most useful template for MUTAV's roles:

- **`allocation_admin` or vault admin** sets weights and caps ([update_reserve_allocation handler](https://github.com/Kamino-Finance/kvault/blob/HEAD/programs/kvault/src/handlers/handler_update_reserve_allocation.rs)).
- **Any signer** can call the `invest` crank. Each call moves one reserve toward its on-chain-computed target, throttled by `min_invest_delay_slots` and `min_invest_amount`. Cranks are paid from a small per-deposit skim ([handler_invest.rs](https://github.com/Kamino-Finance/kvault/blob/HEAD/programs/kvault/src/handlers/handler_invest.rs), [vault_operations.rs](https://github.com/Kamino-Finance/kvault/blob/HEAD/programs/kvault/src/operations/vault_operations.rs)).

The result is that a compromised crank can only push value toward targets the admin already approved. Meteora reaches the same property off-chain: its Hermes keeper "can only deposit in predefined strategies, and cannot claim tokens" ([Meteora Hermes](https://docs.meteora.ag/dynamic-vault/for-integrators/hermes-meteoras-keeper)).

No production allocator uses explicit percentage bands. Kamino's equivalent is the dust floor plus the slot delay. The only hard band in the set is JLP's `tokenWeightageBufferBps = 2000`, which rejects any flow that pushes an asset's weight more than ±20% away from its target ([Jupiter Pool account](https://developers.jup.ag/docs/perps/pool-account)).

## Every major Solana loss corrupted a NAV input

The incident record is unusually consistent. Each major loss corrupted one of three inputs: a price, an account that claimed to hold value, or a conversion rate. The program then paid out against the inflated figure.

**Prices.** In 2022, Mango ($116M drained) and Solend's isolated pools ($1.26M of bad debt) both priced collateral from thin or single-pool markets ([Helius](https://www.helius.dev/blog/solana-hacks), [The Block](https://www.theblock.co/post/182055/solend-exploited-oracle-attack)). Loopscale lost about $5.8M in April 2025 through mispriced RateX principal-token collateral. One researcher described the attack as deploying a malicious price feed and calling Loopscale's own `create_loan`, and an earlier OShield audit had reportedly flagged oracle validation ([Rekt](https://rekt.news/loopscale-rekt), [The Block](https://www.theblock.co/post/352083/solana-defi-protocol-loopscale-hit-with-5-8-million-exploit-two-weeks-after-launch)).

**Accounts.** Cashio lost $52.8M because it never validated a mint field, which let a chain of fake accounts stand in for real collateral ([Halborn](https://www.halborn.com/blog/post/explained-the-cashio-hack-march-2022)).

**Conversion rates.** Neodyme's 2021 disclosure showed that SPL token-lending forks rounded cToken conversions with `round` instead of `floor`. That gained one unit per cycle, put roughly $2.6B of TVL at risk, and was fixed by flooring everywhere ([Neodyme](https://neodyme.io/blog/lending_disclosure/)).

**MUTAV's on-chain NAV is exactly as strong as its weakest valuation path**, and the defences follow directly from these incidents.

**Track balances internally.** NAV must come from internally tracked per-adapter balances, never from `token_account.amount`. Anyone can transfer SPL tokens into a PDA-owned account, which is the Solana form of the first-depositor donation attack that Zellic rated critical in an EVM vault ([Zellic](https://reports.zellic.io/publications/perennial/findings/critical-vaultsol-erc-4626-inflation-attack-on-vault)). After every adapter CPI, MUTAV should reload the token account and require the actual delta to equal the expected delta.

**Round against the user.** Kamino floors the shares it mints, uses a ceiling on AUM in the denominator, floors withdrawal payouts and rounds the cTokens it burns upward. It also tracks a `rounding_loss` absorbed by crank funds ([vault_operations.rs](https://github.com/Kamino-Finance/kvault/blob/HEAD/programs/kvault/src/operations/vault_operations.rs)). Infinity values every conversion at the `.min` or `.max` bound that disfavours the user, and ends every swap with "Check pool has not lost SOL value" ([S controller instructions](https://github.com/igneous-labs/S/blob/master/docs/s-controller-program/instructions.md)).

**Seed the share supply.** Kamino seeds 1,000 base units at vault creation as dead shares ([kvault consts.rs](https://github.com/Kamino-Finance/kvault/blob/HEAD/programs/kvault/src/utils/consts.rs)). Drift's Insurance Fund uses permanent, non-withdrawable bootstrap shares for the same purpose ([Drift insurance fund docs](https://docs.velocity.exchange/protocol/insurance-fund)). MUTAV should take both conventions if its reserve issues shares to backers.

**Defend against accrual-step timing.** Treasury value steps up discretely. Infinity documents "LP Time Arb", where a depositor enters just before an exchange-rate step and exits just after, and it requires redemption fees high enough to make that unprofitable ([flat-fee pricing spec](https://github.com/igneous-labs/S/blob/master/docs/pricing-programs/flat-fee.md)). INF v2 goes further: it withholds newly observed yield and releases it geometrically per slot, and computes NAV net of the withheld amount ([inf-1.5 v2 docs](https://github.com/igneous-labs/inf-1.5/blob/HEAD/docs/v2/README.md)). Meteora and Voltr achieve the same with linear locked-profit degradation ([Meteora state.rs](https://github.com/MeteoraAg/vault-sdk/blob/HEAD/programs/vault/src/state.rs), [Voltr fees and accounting](https://github.com/voltrxyz/docs/blob/HEAD/vault-owners/fees-and-accounting.mdx)). At TESOURO's roughly 11% rate the daily step is small, but a backer exit path needs one of these defences, either a release window or an exit fee larger than one accrual step.

**Isolate assets from each other.** Tulip's $2.5M sat inside Mango's lending pools when Mango froze, so a strategy freeze became a withdrawal freeze ([Helius](https://www.helius.dev/blog/solana-hacks)). MUTAV's version of that risk is concrete. On-chain reads show **BRS is a classic SPL mint with an active freeze authority**, while TESOURO is a Token-2022 mint with no freeze authority, no transfer hook and no permanent delegate (rwa_treasuries note, RPC read 2026-10-10; mint sources [Nora brs-assets](https://github.com/Nora-Finance/brs-assets), [Etherfuse API](https://api.etherfuse.com/lookup/bonds/cost)). Valuation and withdrawal loops must tolerate one asset's account being frozen without reverting for the others. The program must also call Token-2022 through `TokenInterface` with `transfer_checked` and a decimals check.

## Price TESOURO from Etherfuse's BRL BondPrice, not a USD feed

The oracle question has a clearer answer than it first appears.

**Etherfuse publishes the canonical stablebond price on-chain** in a `BondPrice` PDA (seeds `["bond_price", mint]`) under its stablebond program. The price is "the value of one whole token in the bond's currency", which for TESOURO is BRL, and `current_basis_points` gives the annualized accrual rate ([Etherfuse Price Feeds](https://docs.etherfuse.com/price-feeds)). The Token-2022 interest-bearing extension on the mint is, in Etherfuse's words, for wallet display only. Live values on 2026-10-10 were **1.264989 BRL per TESOURO at 1,128 bps** ([Etherfuse API](https://api.etherfuse.com/lookup/bonds/cost)).

**Because MUTAV's unit of account is BRL, this path needs no FX conversion at all.** The alternative is RedStone's TESOURO feed on Solana mainnet (account `Fx7SbwDDiir4C42Q1ESH4cm8NGcDjQucgA7QAHFso8ob`). That feed is denominated in USD, has a single source (`etherfuse-tesouro-api`), and runs a 24-hour heartbeat with a 0.1% deviation trigger ([RedStone Solana manifest](https://github.com/redstone-finance/redstone-oracles-monorepo/blob/main/packages/relayer-remote-config/main/relayer-manifests-non-evm/solanaMultiFeed.json), [RedStone data-service manifest](https://github.com/redstone-finance/redstone-oracles-monorepo/blob/main/packages/node-remote-config/dev/manifests/data-services/primary.json)).

Using the RedStone feed means converting BRL to USD inside the feed and back to BRL in MUTAV, with potentially different FX sources at different ages. Pyth's `FX.USD/BRL` closes from Friday 5 PM to Sunday 6 PM ET and widens its confidence at the emerging-market week open ([Pyth market hours](https://docs.pyth.network/price-feeds/core/market-hours)). Pyth's Hermes has also required an API key since roughly August 2026 ([Pyth Hermes docs](https://docs.pyth.network/price-feeds/core/api-instances-and-providers/hermes)). TESOURO accrues only about 0.04% per day, so a few tenths of a percent of FX basis would swamp the yield signal entirely. The RedStone feed also adds no independent trust, since it relays the issuer's own API. Its value is as a **sanity cross-check**. On the research date it read 0.253383 USD against Etherfuse's quoted 0.253464 USD, a gap of about 3 bps ([Etherfuse API](https://api.etherfuse.com/lookup/bonds/cost)).

The production consumer-side checks show what to wrap around `BondPrice`:

- **Kamino klend** enforces a max price age, a TWAP-divergence limit, and admin-set absolute lower and upper `PriceHeuristic` bounds ([klend checks.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/utils/prices/checks.rs)).
- **Kamino Scope** offers `DiscountToMaturity` (a deterministic accrual-to-par curve) and `CappedFloored`, which bounds one source by others ([scope oracle_type.rs](https://github.com/Kamino-Finance/scope/blob/master/programs/scope/src/states/oracle_type.rs)). Scope has also deprecated Pyth Pull and Switchboard On-Demand in favour of Pyth Lazer, Chainlink NAV/RWA and RedStone, which shows where the largest Solana lender thinks RWA pricing belongs.
- **Infinity's SPL calculator** records the stake-pool program's `last_upgrade_slot` and **errors if that program was upgraded since whitelisting**, "to avoid being rugged by compromise" of the external program ([SPL calculator spec](https://github.com/igneous-labs/S/blob/master/docs/sol-value-calculator-programs/spl.md)).

That last control matters for TESOURO. Etherfuse's stablebond program (`BondyhA24H696Y1HudTyBGzZH58PMPCeAoSinHdWMa1f`, per the [SDK](https://www.npmjs.com/package/@etherfuse/stablebond-sdk)) appears to be closed source, and its upgrade authority is undocumented.

MUTAV's TESOURO valuation adapter should therefore implement six rules:

1. **Verify the price account.** Check the owner and the PDA derivation of `BondPrice`.
2. **Pin the issuer program.** Pin the stablebond program's last upgrade slot, and refuse to value TESOURO after an unreviewed upgrade until the multisig re-approves it.
3. **Bound the accrual rate.** Require `current_basis_points` to sit inside an admin band.
4. **Apply a monotone accrual corridor.** Accept an observed price only if it is at least the last accepted price and at most the last accepted price × (1 + rate × Δt + ε). This makes `min(observed, accrual cap)` the value, with a haircut.
5. **Enforce a staleness limit.** Etherfuse publishes none, so MUTAV must set its own.
6. **Fail asymmetrically.** Fail closed for anything that increases backers' claims, such as deposits and share mints. Fall back to the last accepted price with a time-growing haircut for coverage computation.

The corridor is an engineering bound, not a market price, and it has one important blind spot. TESOURO tracks LTN zero-coupon bonds (described as such by [PistachioFi](https://www.pistachio.fi/blog/tesouros-tokenizados-crypto-2026)). A fixed-rate zero loses mark-to-market value when the Selic curve rises. Neither accrual nor `BondPrice` (if it is a pure accrual price) captures that, nor does either capture issuer or custody failure. The per-adapter cap and haircut carry that risk, not the oracle.

## TESOURO cannot be exited atomically, so the BRS floor must outlast redemption

The rebalancing design follows from one fact: **there is no on-chain path that turns TESOURO back into BRS at NAV inside a single transaction.**

Primary redemption is KYC-gated. Etherfuse's Ramp API lists only MXN and CETES, and there is no documented BRL or PIX ramp ([Etherfuse Dev Docs](https://app.etherfuse.com/legal/dev-docs)). Whether a program PDA can be the redeeming party is undocumented, and no redemption settlement time is published.

Secondary liquidity is thin. On-chain supply shows about 450,293 TESOURO on Solana, roughly R$570K at the current price. TESOURO trades on Stabull ([Stabull](https://stabull.finance/defi-blog/tesouro-announcement/)), and Solflare shows about $406K of DEX liquidity ([Solflare](https://www.solflare.com/prices/etherfuse-tesouro/BRNTNaZeTJANz9PeuD8drNbBHwGgg7ZTjiQYrFgWQ48p/)). DeFiLlama's snippet of about $82K on Solana conflicts with the RPC read and is probably stale. Etherfuse's own instant-redeem and mint instructions fail with `StaleOracle` once their Switchboard FX data is older than "typically more than 1 hour" ([stablebond SDK](https://www.npmjs.com/package/@etherfuse/stablebond-sdk)).

The BRS side is thinner still. My RPC read found **only about 3,095 BRS outstanding on Solana**, so neither leg offers deep market exit at size today. That is not a reason to change issuer. It means the pilot's claim capacity is bounded by BRS actually held, which the program should simply enforce.

The four rebalancing questions then have direct answers.

**Target and band.** MUTAV should treat BRS as Kamino treats `unallocated_weight` plus `unallocated_tokens_cap`: an explicit destination computed first, before the remainder is spread to adapters. The difference is that MUTAV's BRS share is a hard lower bound, not a weight. MUTAV should define the required BRS liquidity as the maximum of two things:

- the existing **settlement floor**, and
- an **obligations-based floor**: expected claims over the TESOURO exit lead time multiplied by a stress factor, plus the largest single open guarantee exposure.

The lead time is an admin parameter until Etherfuse documents settlement. Above that floor, TESOURO gets a target share with a symmetric band in the JLP style, such as target ± 20% of target. Every TESOURO adapter keeps two limits on top of the band: an absolute cap and a maximum share of NAV.

The program then applies three rules. Any instruction that would push BRS below the floor (an outflow to TESOURO, a backer withdrawal) is rejected. An instruction that pushes the TESOURO share outside the band only when moving away from target is also rejected. A position below the floor flags the TESOURO-to-BRS leg as due.

The design steelmanned against this is Infinity's Reserve V2. It has **no fixed target-liquidity parameter**. Instead it prices exits on a utilization curve of the liquid buffer, so withdrawals get steeper as the buffer drains ([reserve-v2 pricing](https://github.com/igneous-labs/inf-1.5/blob/HEAD/docs/reserve-v2-pricing-program.md)). That is elegant for an LST pool, but MUTAV owes claims rather than optional swaps, and a fee cannot make a claim wait. MUTAV can still borrow the curve for **backer withdrawals** only, as a secondary signal on top of the hard floor.

**Who rebalances.** There are two legs, and they need different mechanics.

The **BRS → TESOURO** leg moves value into a less liquid asset. It needs a privileged signer, because its execution is an off-chain primary subscription or a DEX buy. Kamino's permissionless crank cannot drive it.

The **TESOURO → BRS** leg must also be operator-run, since redemption needs a KYC'd Etherfuse account. The operator hot wallet redeems and returns BRS to the reserve.

Both legs should follow Infinity's `StartRebalance`/`EndRebalance` "hot potato" where it fits: a dedicated `rebalance_authority` withdraws one asset, must return at least equal value of another in the same transaction, and every user instruction refuses to run while `is_rebalancing` is set ([S controller instructions](https://github.com/igneous-labs/S/blob/master/docs/s-controller-program/instructions.md)).

Where settlement is asynchronous, the atomic version becomes a **two-phase rebalance with a bounded in-transit entry**. Phase one moves at most an admin-capped amount to the operator wallet and books it as `in_transit` at a haircut. Phase two requires the returning asset's value to be within tolerance of the booked amount. A timeout escalates to the multisig. That in-transit cap is effectively the operator key's maximum blast radius, so it should be small and separately configured. marginfi's flash-loan migration bug, which put about $160M at risk, is the reminder: any in-progress state must block **every** other state-changing instruction, including admin ones ([Asymmetric Research](https://blog.asymmetric.re/threat-contained-marginfi-flash-loan-vulnerability/)).

**Slippage bounds.** Kamino needs no slippage parameter because klend deposits and redemptions run at the internally accounted exchange rate, and it tracks rounding loss instead. JLP and Infinity put a user-supplied `min_out` on every add, remove and swap ([Jupiter Perps IDL](https://github.com/julianfssen/jupiter-perps-anchor-idl-parsing)).

For MUTAV, every rebalance leg should carry two bounds:

- a **caller-supplied `min_out`**, and
- a **program-enforced maximum deviation from `BondPrice`**: received BRS must be at least `BondPrice × amount × (1 − max_slippage_bps)` when selling TESOURO, and TESOURO received must be at least `amount ÷ BondPrice × (1 − max_slippage_bps)` when buying.

`max_slippage_bps` is a multisig-set constant, and anything outside it reverts. With about $400K of DEX depth, a DEX leg should be reserved for small top-ups and treated as an emergency path, not the default.

**Rate limiting.** Kamino's `min_invest_delay_slots` and `min_invest_amount` transfer directly: they stop a compromised operator from churning value through many small, lossy rebalances.

| Decision | Production precedent | Recommendation for MUTAV |
|---|---|---|
| Custody | One PDA-owned account and config per asset (JLP, Infinity) | One config PDA per adapter: mint, token program, valuation account, external program ID, cap, max share, in/out flags |
| Adapter boundary | Compiled CPI with direct reads (Kamino) vs adapter-reported value (Voltr) | Compiled adapters; MUTAV reads value itself; post-CPI balance-delta checks |
| BRS liquidity | Idle weight and cap (Kamino); utilization fee curve (Infinity V2) | Hard floor = max(settlement floor, obligations floor over the exit lead time) |
| TESOURO allocation | Weight + cap (Kamino); ±20%-of-target band (JLP) | Target ± band, plus absolute cap and max NAV share; reject moves away from target outside the band |
| Who rebalances | Permissionless crank (Kamino); `rebalance_authority` with no-loss invariant (Infinity) | Operator key bounded by in-transit cap, NAV-loss tolerance and slot delay; multisig only sets parameters |
| Slippage | `min_out` (JLP, Infinity); none at exchange rate (Kamino) | `min_out` plus program-enforced max deviation from `BondPrice` |
| TESOURO price | Issuer or exchange-rate state (Infinity, Exponent); heuristics and caps (klend, Scope) | `BondPrice` (BRL) with accrual corridor and upgrade-slot pin; RedStone × USD/BRL as cross-check, skipped when FX is closed |

## Admin keys, not code bugs, caused the largest loss

Drift is the case MUTAV's Squads configuration must answer. On March 26, 2026, Drift had migrated to a **2-of-5 multisig with zero timelock**. An attacker who had posed as a quant firm for months used **durable nonces** to collect pre-signatures from council members, then executed the admin transfer in two transactions one second apart. With admin control, the attacker removed withdrawal limits, listed a fake token priced by an oracle backed by about $500 of liquidity, and withdrew roughly $285M ([Chainalysis](https://www.chainalysis.com/blog/lessons-from-the-drift-hack/), [CoinDesk](https://www.coindesk.com/markets/2026/04/05/drift-says-usd270-million-exploit-was-a-six-month-north-korean-intelligence-operation)). Every step used a legitimate admin capability.

The industry response was to constrain admin power in the contract itself. Eight days later, Kamino shipped on-chain whitelisted reserves. Curators "cannot create or increase allocations outside the whitelist", the restriction becomes irreversible once enabled, and withdrawals are unaffected ([Cryptonews / The Defiant](https://cryptonews.net/news/security/32684689/)). Exponent's strategy vaults put managers inside Squads policies with asset and protocol whitelists and a timelock of "typically 7 days", so depositors can exit before a change lands ([Exponent Strategy Vaults](https://docs.exponent.finance/user-documentation/strategy-vault-concepts.md)). Infinity separates roles on-chain:

- admin
- rebalance authority
- a list of disable-only pause authorities
- fee beneficiary
- per-calculator managers

([S controller instructions](https://github.com/igneous-labs/S/blob/master/docs/s-controller-program/instructions.md)).

For MUTAV the conclusion is an **asymmetric timelock**. Actions that reduce risk should be fast: pausing, disabling an adapter's inflows, lowering a cap, raising the BRS floor. These can go through the Squads multisig or a dedicated pause list. Actions that add risk should run through the multisig **and** a non-zero timelock: adding an adapter or valuation source, raising a cap or maximum share, widening a slippage or corridor bound, re-approving an upgraded issuer program, and transferring any authority. Every new adapter starts at a cap of zero. Signer practice should treat durable-nonce pre-signing as an explicit threat: signers review decoded intent, and authority transfer is a separately timelocked instruction.

One caveat cuts the other way. A timelock slows emergency **cap increases** too, for example if BRS supply grows and the reserve wants more TESOURO. That cost is acceptable precisely because claims never depend on TESOURO being bought quickly.

A NAV circuit breaker completes the set. If NAV per share moves more than a set percentage between refreshes, or outflows in a window exceed a set share of NAV, new deposits and large backer withdrawals pause pending review. Fast pausing is the one control with a clean record: Solend detected and patched in 41 minutes in 2021, and Loopscale paused the same day ([Helius](https://www.helius.dev/blog/solana-hacks)).

## Conclusion

The research changes how MUTAV's main risk should be framed. The hard problem is not valuing TESOURO; Etherfuse's BRL-native `BondPrice` makes that easier than for most RWAs, and avoids FX entirely. The hard problem is **time**. TESOURO converts back to BRS only through a KYC'd, off-chain path with no published settlement window, while claims arrive in BRS on their own schedule. That makes the obligations-based floor the central parameter of the whole design, not an optional refinement of the settlement floor, and its key input (Etherfuse's redemption lead time) is the single most valuable fact still missing. It should be obtained from Etherfuse in writing before the TESOURO cap moves off zero.

The second takeaway is that MUTAV's narrow scope is an advantage. Production allocators accept adapter-reported values, oracle-priced baskets and permissionless cranks because they chase yield across many venues. A reserve holding one stablecoin and one treasury token can afford compiled adapters, a monotone accrual corridor, an upgrade-slot pin on the issuer program, and an operator whose worst case is bounded by an in-transit cap. Each of these closes a failure class that has already cost Solana protocols real money.

Several things remain unverified: `BondPrice`'s field layout and update cadence, who controls Etherfuse's mint and rate authorities, whether a PDA can be an Etherfuse redeeming party, and the finding-level contents of the kVault, Voltr and Infinity audits. Each should be checked before mainnet.
