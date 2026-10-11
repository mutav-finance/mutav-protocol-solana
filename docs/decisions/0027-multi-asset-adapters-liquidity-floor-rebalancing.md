# 0027 — Multi-asset adapters, liquidity floor and rebalancing

- **Status:** Proposed (2026-10-10), pending founder decision, except decision 4 (who moves assets), and decision 8 (the emergency path), which the founders decided on 2026-10-10: the reserve admin executes `allocate` and `deallocate`, and guardians, the pauser and the admin may take the risk-reducing emergency actions at once. The floor on `fulfil_redeems` (decision 2) is also decided. Decision 8 extends the guardian scope of ADR 0020. Builds on ADR 0018 (BRS-only pilot, settlement floor, `AdapterState`) and ADR 0026 (inline adapter slots removed; `adapter_count` and a bitmap carved at 0; adapter state in its own account). Refines spec §5.7 and §7 and answers issue #30. Uses the role split of ADR 0020. No change to the pilot binary: everything here ships with the first adapter upgrade, and the TESOURO cap stays 0 until the open items below are closed.

## Context

The pilot reserve holds BRS only (ADR 0018). The expansion path is a program upgrade that adds adapters, with Etherfuse TESOURO as the first candidate. TESOURO waits on a BRS path through Etherfuse. Before any adapter is built, the founders need the rules for how a second asset is held, valued and moved, and who moves it.

Five facts shape those rules:

- **Claims are payable only in liquid BRS.** `pay_claim` pays from the `reserve` BRS account and is never refused for solvency or pause (ADR 0005, ADR 0020). An asset that cannot become BRS in time does not help a claim.
- **TESOURO cannot become BRS inside one transaction.** Primary redemption is KYC-gated through Etherfuse. The Ramp API lists only MXN and CETES, with no documented BRL or Pix route ([Etherfuse Dev Docs](https://app.etherfuse.com/legal/dev-docs)). Etherfuse publishes no redemption settlement time, and does not say whether a program PDA can be the redeeming party.
- **Market liquidity is thin on both legs.** About 450,293 TESOURO exist on Solana, roughly R$570k at the current price (RPC read, 2026-10-10). Solflare shows about $406k of DEX liquidity ([Solflare](https://www.solflare.com/prices/etherfuse-tesouro/BRNTNaZeTJANz9PeuD8drNbBHwGgg7ZTjiQYrFgWQ48p/)). The same read found only about 3,095 BRS outstanding on Solana. Etherfuse's own instant-redeem and mint instructions fail with `StaleOracle` once their FX data is older than about an hour ([stablebond SDK](https://www.npmjs.com/package/@etherfuse/stablebond-sdk)).
- **TESOURO has a BRL-native issuer price.** Etherfuse publishes a `BondPrice` PDA (seeds `["bond_price", mint]`) under its stablebond program, holding the value of one whole token in the bond's currency and the accrual rate `current_basis_points` ([Etherfuse Price Feeds](https://docs.etherfuse.com/price-feeds)). On 2026-10-10 it was 1.264989 BRL per TESOURO at 1,128 bps ([Etherfuse API](https://api.etherfuse.com/lookup/bonds/cost)). The only other on-chain feed, RedStone's, is quoted in USD, has one source (Etherfuse's API) and a 24-hour heartbeat ([RedStone manifest](https://github.com/redstone-finance/redstone-oracles-monorepo/blob/main/packages/relayer-remote-config/main/relayer-manifests-non-evm/solanaMultiFeed.json)). TESOURO tracks LTN zero-coupon bonds ([PistachioFi](https://www.pistachio.fi/blog/tesouros-tokenizados-crypto-2026)), so its market value falls when Brazilian rates rise. An accrual price does not show that.
- **Most large Solana losses corrupted a NAV input.** Mango and Solend priced collateral from thin markets; Cashio accepted fake accounts; SPL token-lending forks rounded conversions the wrong way ([Helius](https://www.helius.dev/blog/solana-hacks), [Halborn](https://www.halborn.com/blog/post/explained-the-cashio-hack-march-2022), [Neodyme](https://neodyme.io/blog/lending_disclosure/)). The largest, Drift in April 2026 (about $285M), used legitimate admin powers: a 2-of-5 multisig with zero time lock was taken over through pre-signed durable-nonce transactions, and the attacker listed a fake token priced by an oracle backed by about $500 of liquidity ([Chainalysis](https://www.chainalysis.com/blog/lessons-from-the-drift-hack/), [CoinDesk](https://www.coindesk.com/markets/2026/04/05/drift-says-usd270-million-exploit-was-a-six-month-north-korean-intelligence-operation)).

Production multi-asset programs on Solana converge on one shape: one PDA-owned token account and one config record per asset, a privileged role that sets targets and caps, and a constrained mover that shifts value toward those targets. Kamino kVault, Jupiter JLP and Sanctum Infinity are the closest references (report, `reports/Multi asset vaults on Solana.md`).

## Proposed decision

### 1. Adapter model

- **One `AdapterState` PDA per adapter**, at `["adapter_state", config, program_id]` (seed reserved in ADR 0018). It holds everything the inline `AdapterEntry` used to hold and the per-adapter pricing of ADR 0018: the pinned adapter program, its asset mint and token program, the bit index in the config bitmap, the limits of decision 3, the price source of decision 6, the position and any in-transit entry. `whitelist_adapter` creates it and sets its bit; `remove_adapter` clears the bit and closes it.
- **The adapter program is pinned.** `AdapterState` stores the program ID and, per spec PC-27, its last upgrade slot. A CPI to any other program, or to a pinned program upgraded since approval, is refused until the admin re-approves it (decision 7).
- **MUTAV reads value itself.** The adapter moves tokens; it never reports a value that MUTAV books. MUTAV values a position as tracked units × the price it reads and bounds under decision 6. This is the Kamino model, which reads the venue's own exchange rate ([klend_operations.rs](https://github.com/Kamino-Finance/kvault/blob/HEAD/programs/kvault/src/operations/klend_operations.rs)).
- **Balances are tracked, not read from token accounts.** After every adapter CPI the core reloads each vault token account and the share supply and requires the actual deltas to equal the expected ones (spec §5.7, `PostCpiCheckFailed`). Token-2022 assets go through `TokenInterface` with `transfer_checked` and a decimals check. Rounding favours the reserve.
- **Every adapter account is required.** `refresh` and every instruction that computes `stable_assets` must pass the `AdapterState` of every bit set in the bitmap, and their number must equal `adapter_count`. A missing or extra account refuses the call. A gate can never value the reserve with an adapter left out.
- **Isolation.** A frozen or unreadable account of one asset counts that asset as 0 for the gates. It does not make valuation of the others revert. BRS is a classic SPL mint with an active freeze authority; TESOURO is Token-2022 with no freeze authority, transfer hook or permanent delegate (research notes, `rwa_treasuries.md`).
- **New adapters start at cap 0.** Whitelisting writes `cap = 0` and `max_share_bps = 0`. Raising them is a separate, slow action (decision 7).
- **Lifecycle: add, ramp, disable inflows, drain, remove.** This copies Sanctum Infinity's `AddLst`, `DisableLstInput` and `RemoveLst` ([S controller instructions](https://github.com/igneous-labs/S/blob/master/docs/s-controller-program/instructions.md)). `disable_adapter` refuses further `allocate` and keeps `deallocate` open (decision 8). `remove_adapter` is refused while the position or an in-transit entry is non-zero.

### 2. The BRS liquidity floor

The settlement floor (`min_settlement_bps`, ADR 0018) is a share of stable assets. A share alone can leave too little BRS when the book is large relative to the reserve. This ADR adds an obligations floor in reais and keeps the larger of the two:

```text
brs_floor = max( ceil(min_settlement_bps × stable_assets / 10_000),
                 obligations_floor )
```

Two forms of `obligations_floor` are on the table:

- **Research form.** `provisions + ceil(expected claims over the exit lead time × stress factor) + largest single open exposure`. It follows the claim book closely, but two of its inputs are estimates the program does not hold.
- **Issue #30 form.** `provisions + max_claim_per_period`. Both inputs exist on-chain today. Since ADR 0021, `max_claim_per_period` is a strict bound on what the reserve can pay in any 31-day window, so the form is a hard bound, not an estimate. It counts filed claims twice up to the cap, which errs on the safe side.

**Recommended:** the #30 form, scaled by the longest exit lead time among adapters that hold value:

```text
obligations_floor = provisions
                  + max_claim_per_period × max(1, ceil(exit_lead_time_secs / 31 days))
```

- `exit_lead_time_secs` is an admin-set field in each `AdapterState`. It is the time the adapter's asset needs to become BRS. Until Etherfuse states TESOURO's lead time in writing, the TESOURO cap stays 0.
- With a lead time up to 31 days this is exactly the #30 form.
- The buffer earmark of ADR 0011, when phase 2 returns, is added to the floor.

**Where it is enforced:**

- `allocate` refuses if BRS after the move is below `brs_floor` (`SettlementFloorBreached`).
- `fulfil_redeems` refuses a fill that would take BRS below `brs_floor` while any adapter holds value (decided by the founders, 2026-10-10). The request waits for a deallocation. Redemptions never spend BRS that claims rely on.
- `pay_claim` never reads the floor. A claim can take BRS below it.
- A BRS balance below the floor emits an event and marks deallocation as due in `/admin`. It moves nothing by itself.
- Raising `max_claim_per_period` with `set_config` (ADR 0021) is never refused because of the floor. It only makes allocation harder and deallocation due.

### 3. Allocation targets and bands

Each adapter carries four limits in `AdapterState`, all admin-set:

| Limit | Meaning |
|---|---|
| `target_bps` | The intended share of stable assets |
| `band_bps` | A band around the target, as a share of the target; for example 2,000 = target ± 20% of target, as in JLP's `tokenWeightageBufferBps` ([Jupiter Pool account](https://developers.jup.ag/docs/perps/pool-account)) |
| `cap` | The most BRS-equivalent value the adapter may hold |
| `max_share_bps` | The most of stable assets the adapter may hold (ADR 0018) |

- **BRS is computed first.** The floor of decision 2 is served before any target, as Kamino treats its `unallocated` weight and cap as a destination of its own ([vault_state.rs](https://github.com/Kamino-Finance/kvault/blob/HEAD/programs/kvault/src/state/vault_state.rs)). Only value above the floor is shared among adapters.
- **Flows correct first.** Deposits, guarantee fees, income and redemptions move the shares on their own. A move between assets is proposed only when an adapter is outside its band, or when BRS is below the floor.
- **Moves toward the target only.** `allocate` refuses a move that would take the adapter above `target × (1 + band)`, above `cap` or above `max_share_bps`. A move that brings an adapter back into its band is always allowed if it meets the other gates.
- **Rebalancing is never automatic into an RWA.** No permissionless instruction moves BRS into an adapter. Moves out of an adapter are flagged when due and executed by the admin (decision 4).
- **Rate limits.** `min_move_interval_secs` and `min_move_amount` per adapter, after Kamino's `min_invest_delay_slots` and `min_invest_amount` ([handler_invest.rs](https://github.com/Kamino-Finance/kvault/blob/HEAD/programs/kvault/src/handlers/handler_invest.rs)). They stop many small, lossy moves.

### 4. Who moves assets (decided: the admin)

**Decided by the founders (2026-10-10): the reserve admin, through the Squads multisig, executes `allocate` and `deallocate`.** This is the rule of spec §5.7. The other options are under Alternatives considered.

- **It fits the separation principle.** The admin owns financial health and the reserve's balance sheet; the operator owns contracts (ADR 0020). The two may be separate companies.
- **No new role is added.** The program keeps three working roles: operator, admin and pauser, plus the pause-only guardians.
- **Moves wait for the admin time lock** (5 minutes on devnet, 24 hours in the real pilot). Rebalancing is slower, so the floor of decision 2 and the bands of decision 3 must be sized for that delay: BRS above the floor must cover what claims can take while a deallocation waits for the lock and then for the asset to settle.
- **The admin entity does the KYC'd redemption.** The Squads vault, or a KYC'd account the admin controls, is the party Etherfuse mints and redeems for. Whether Etherfuse accepts a Squads vault or a program PDA as that party is an open item below.
- **Two-phase moves.** TESOURO settles off-chain and asynchronously, so a move cannot be atomic. Phase one sends at most `max_in_transit` of value out of the reserve to a whitelisted destination controlled by the admin and books it as `in_transit` at a haircut. Phase two books what returns and requires its value, at the bounded price, to be within `max_slippage_bps` of the booked amount. A move not closed within `in_transit_timeout_secs` is written down to its haircut until the admin closes it. `max_in_transit` stays capped even though the admin signs: it limits what one move can put at risk outside the reserve.
- **Atomic legs.** A DEX swap inside one transaction instead uses Infinity's start and end pair, where every other state-changing instruction refuses to run while the flag is set. marginfi's flash-loan migration bug shows why the lock must cover admin instructions too ([Asymmetric Research](https://blog.asymmetric.re/threat-contained-marginfi-flash-loan-vulnerability/)).

### 5. Slippage

Every move carries two bounds:

- a **caller-supplied `min_out`**, as JLP and Infinity require on every add, remove and swap;
- a **program-enforced deviation bound** from the bounded price of decision 6. Selling TESOURO must return at least `price × units × (1 − max_slippage_bps)` in BRS. Buying must return at least `amount ÷ price × (1 − max_slippage_bps)` in TESOURO.

`max_slippage_bps` is set per adapter by the admin. Widening it is a slow action (decision 7). A DEX leg is for small top-ups and emergencies, not the default path. Every move also keeps the rule of spec §5.7: under coverage stress, a deallocation may not lower stable assets.

### 6. TESOURO pricing

- **Primary: Etherfuse `BondPrice` in BRL.** The account must be owned by the stablebond program (`BondyhA24H696Y1HudTyBGzZH58PMPCeAoSinHdWMa1f`, per the SDK) and match its PDA seeds. No FX is involved.
- **Pinned issuer program.** `AdapterState` stores the stablebond program's last upgrade slot. After an upgrade, TESOURO is valued at its fallback (below) and new allocations are refused until the admin re-approves, as Infinity's SPL calculator does ([SPL calculator spec](https://github.com/igneous-labs/S/blob/master/docs/sol-value-calculator-programs/spl.md)).
- **Rate band.** `current_basis_points` must lie inside an admin-set `[rate_min_bps, rate_max_bps]`.
- **Accrual corridor.** An observed price is accepted only if it is at least the last accepted price and at most `last × (1 + rate_max × Δt) + ε`. The price never goes down and never rises faster than the capped rate. This replaces the single accrual ceiling of spec §7 (`p0`, `t0`, `y_max`) with a ceiling that restarts from each accepted price.
- **Own staleness limit.** Etherfuse publishes none, so `max_staleness_secs` lives in `AdapterState`.
- **Admin floor and cap.** Absolute lower and upper bounds, like Kamino klend's `PriceHeuristic` ([klend checks.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/utils/prices/checks.rs)).
- **Cross-check only: RedStone TESOURO/USD × Pyth USD/BRL.** If the two differ by more than an admin-set tolerance, deposits and allocations are refused. The check is skipped while the FX market is closed (Friday 17:00 to Sunday 18:00 ET, [Pyth market hours](https://docs.pyth.network/price-feeds/core/market-hours)). It never becomes the primary: it relays the same issuer API and adds an FX leg twice. On the research date the two paths differed by about 3 bps.
- **Fail asymmetrically.** Without a fresh, accepted price: `fulfil_deposits` and `allocate` fail closed (`StalePrice`); `refresh` and the coverage gates use the last accepted price with a haircut that grows with age (PC-17); `pay_claim` never reads a price.
- **What the price cannot see.** The accrual price ignores LTN mark-to-market when rates rise, and it ignores issuer, custody and redemption-halt events. The per-adapter cap, `max_share_bps` and a valuation haircut carry that risk, not the oracle. At about 11% a year, one day of accrual is about 0.03%; the NAV-move guard and `nav_bounds` (ADR 0023) bound timing around price steps, and a release window for observed yield is later work.

### 7. Governance: an asymmetric time lock

- **Fast (risk-reducing):** `pause`, `disable_adapter`, lowering `cap`, `max_share_bps`, `target_bps` or `max_in_transit`, raising the floor inputs, narrowing slippage or corridor bounds. These run through the admin multisig. The emergency actions of decision 8 are also open to guardians and the pauser, at once.
- **Slow (risk-adding):** `whitelist_adapter`, changing a price source, re-approving an upgraded adapter or issuer program, raising `cap`, `max_share_bps`, `target_bps` or `max_in_transit`, widening slippage, corridor, rate or price bounds. These run through the admin multisig **and** a program-enforced delay: the change is stored with `effective_at = now + risk_delay_secs` and applied by a second call after it. `risk_delay_secs` is at least `max_queue_wait_secs` once that is non-zero (ADR 0025), so holders can leave before a risk-adding change lands. A Squads setting cannot shorten it.
- **Lessons from Drift.** A zero time lock and pre-signed durable-nonce transactions turned admin powers into the attack. So: no risk-adding adapter action without the program delay; `/admin` shows signers the decoded effect of every proposal; authority transfers stay two-step and time-limited (ADR 0020). After Drift, Kamino made curator allocations whitelist-only on-chain ([Cryptonews / The Defiant](https://cryptonews.net/news/security/32684689/)), and Exponent puts strategy changes behind a time lock of about 7 days ([Exponent Strategy Vaults](https://docs.exponent.finance/user-documentation/strategy-vault-concepts.md)).
- The cost: a needed cap increase also waits. That is acceptable because claims never depend on buying TESOURO quickly.

### 8. Emergency path (decided)

**Decided by the founders (2026-10-10).** Guardians, the pauser and the admin may take four actions at once, with no time lock. The program enforces that each one can only reduce risk.

1. **`disable_adapter(adapter)`.** No new allocations into the adapter. `deallocate` stays open. It is the disable-only action of Infinity's pause authorities.
2. **`impair_adapter(adapter, haircut_bps)`.** Sets the adapter's valuation haircut. The program refuses any value lower than the current one: the haircut can only increase. The position is marked down at once, so no one deposits or redeems at a stale value. `refresh`, NAV, coverage and the fills all use the impaired value from the next call.
3. **`pause()`.** Unchanged (ADR 0020).
4. **`emergency_deallocate(adapter, units, min_out)`.** Allowed only on an impaired adapter. The proceeds can land only in the `reserve` BRS account: the destination is pinned by the program, not passed by the caller. The price is bounded twice: by the caller's `min_out`, and by a program-enforced maximum discount to the bounded price of decision 6, `max_emergency_discount_bps` (for example 500 to 1,000, that is 5% to 10%). That bound is set by the admin through the slow path of decision 7. An asynchronous leg books its value as `in_transit` at a haircut and stays within `max_in_transit`.

**Undoing any of it goes through the admin time lock.** Re-enabling an adapter, lowering a haircut, raising caps or adding a price source are slow actions under decision 7. A guardian can make the reserve more cautious at once; only the admin, after the delay, can make it less so.

**Claims keep paying throughout.** None of these actions touches `pay_claim`. Claims are paid from BRS, which the floor of decision 2 keeps above what claims can take while an adapter is disabled, impaired or being sold.

**This extends the guardian scope of ADR 0020**, from pause only to pause plus these risk-reducing adapter actions. A guardian still cannot move value anywhere except back into `reserve`, cannot lower a haircut and cannot raise a limit.

**Residual risk.** A compromised guardian or pauser key can force a sale of an impaired adapter's position within the discount bound, and can mark positions down until the admin reverses it. The worst case is `max_emergency_discount_bps` of the position sold, plus a temporary markdown that the admin can undo after the time lock.

## Alternatives considered

- **A dedicated, KYC'd `allocator` key with bounded reach** (decision 4, the research's recommendation). The admin would set targets, bands, caps and `max_in_transit`, and the allocator would execute moves within them, as Kamino's crank pushes value only toward targets the admin approved and Meteora's keeper "can only deposit in predefined strategies, and cannot claim tokens" ([Meteora Hermes](https://docs.meteora.ag/dynamic-vault/for-integrators/hermes-meteoras-keeper)). Its worst case would be `max_in_transit` at its haircut. It is faster than the admin time lock, but it adds a fourth key with its own handover, revocation and recovery runbook. At pilot scale moves are rare and claims never wait for them. Not adopted; it can return by a new ADR if move frequency grows or Etherfuse cannot redeem for the admin entity.
- **The operator executes moves** (decision 4). The operator handles contracts; the admin handles the reserve's balance sheet, and they may be separate companies. A compromised operator could then lose value through lossy moves and in-transit balances, on top of the claim caps, which breaks the known worst case of ADR 0020. The operator is also a hot KMS key, and asset moves would widen what it can do. Rejected.
- **A permissionless crank, as in Kamino kVault.** Anyone may call `invest` to move value toward on-chain targets. It works when every leg is an atomic CPI at an exchange rate. TESOURO's legs are KYC-gated and off-chain, and a crank that buys an RWA on its own moves value into the least liquid asset with no one accountable. Rejected for RWA inflows; a permissionless check that only flags due deallocations may be added.
- **Fee-steered weights, as in Jupiter JLP.** Fees nudge flows toward target weights. MUTAV's flows are claims and queued capital, not optional swaps; a fee cannot make a claim wait. Rejected; the band is borrowed without the fees.
- **Adapter-reported values, as in Voltr.** The adapter returns the position's value as a `u64` and the vault books it ([Voltr core components](https://github.com/voltrxyz/docs/blob/HEAD/protocols/adaptor-creation/core-components.mdx)). This moves valuation trust to each adapter's author. Rejected: MUTAV reads value itself.
- **A utilization fee curve instead of a floor, as in Infinity Reserve V2.** Exits get more expensive as the liquid buffer drains ([reserve-v2 pricing](https://github.com/igneous-labs/inf-1.5/blob/HEAD/docs/reserve-v2-pricing-program.md)). It suits optional swaps, not owed claims. Rejected as the main control; it could later price holder exits on top of the floor.
- **RedStone as the primary price.** USD-quoted, single-sourced from the issuer and dependent on an FX market that closes on weekends. Rejected for `BondPrice` in BRL.
- **A pure admin-set accrual price.** Deterministic, but the admin key becomes the oracle. Rejected; the accrual curve bounds an observed price, it does not replace it.
- **The settlement-floor percentage alone.** Simple, but it does not grow with the claim book. Rejected for the larger of the two floors.

## Consequences

- **Positive.** Claims stay payable in BRS whatever the other assets do. Every asset is valued by MUTAV from a bounded source, with every adapter present at every gate. Each adapter's worst case is a number set in advance. Only the admin moves assets out of the reserve; an emergency sale can only return value to it. Adding risk is slow and visible; removing risk is fast.
- **Negative.** More parameters per adapter, each a judgment the admin must keep current. Holder redemptions can wait for a deallocation when BRS sits at the floor. The program delay slows cap increases.
- **Emergency path (decision 8).** A guardian, the pauser or the admin can stop inflows, mark a position down and sell an impaired position back into BRS at once. The cost is a residual risk: a forced sale within `max_emergency_discount_bps`. The guardian role of ADR 0020 grows from pause only to these risk-reducing actions, and the deploy and runbook checks for guardians follow.
- **Admin-executed moves (decision 4).** Every move goes through the admin time lock, so rebalancing is slow and the floor and bands must be sized for that delay plus settlement time. The KYC'd Etherfuse redemption is done by the admin entity: the Squads vault or a KYC'd account the admin controls. In-transit value stays capped by `max_in_transit` and booked at a haircut. No new role is added.
- **Neutral.** No change on devnet or in the pilot: no adapter is whitelisted, the settlement floor stays 100% and the instructions are not in the binary.
- **Program changes (first adapter upgrade).** `AdapterState` with the fields above, built on the `adapter_count` and bitmap carves of ADR 0026; `whitelist_adapter`, `disable_adapter`, `impair_adapter`, `emergency_deallocate`, `remove_adapter`, two-phase `allocate` and `deallocate` (or begin and complete instructions), the pending-change queue for slow actions; the floor in `allocate` and `fulfil_redeems`; the full adapter set required by `refresh` and the gates; the guardian and pauser signer checks on the emergency actions; `haircut_bps` and `max_emergency_discount_bps` in `AdapterState`; new errors for a haircut that would decrease, an emergency sale on an adapter that is not impaired, a sale beyond the discount bound, a missing adapter account, a pending change not yet effective, a move outside the band and an expired in-transit entry.
- **Client and simulator.** The client's math mirror adds the floor, the corridor and the band. The simulator shows BRS against the floor and each adapter against its band.
- **App.** `/admin` composes slow changes with their effective time, shows in-transit entries and their timeouts, and flags due deallocations. `/reserve` shows each asset, its price source and its share.
- **Spec.** §3.9, §4, §5.1, §5.5, §5.7, §7, §8, §12 (closes #30 once accepted).

## Open items to confirm with Etherfuse before the TESOURO cap leaves 0

1. The redemption lead time for TESOURO, in writing, for the size MUTAV would hold.
2. The `BondPrice` field layout and how often it is updated.
3. Who holds TESOURO's mint authority and interest-rate authority, and the stablebond program's upgrade authority.
4. Whether the redeeming party can be the Squads vault or a program PDA. If not, the admin needs a KYC'd account it controls as the whitelisted destination of decision 4.
5. A BRS or BRL route in and out of TESOURO. TESOURO waits on it (ADR 0018).

## References

- Report: `reports/Multi asset vaults on Solana.md` and notes in `research_notes/Multi asset vaults on Solana/` (`allocation_vaults.md`, `multi_asset_pools.md`, `oracles_pricing.md`, `rwa_treasuries.md`, `security_lessons.md`).
- Spec §3.9, §5.7, §7, §8, §12; issue #30.
- ADRs 0002, 0005, 0011, 0017, 0018, 0020, 0021, 0022, 0023, 0025, 0026.
- Kamino kVault: [vault_state.rs](https://github.com/Kamino-Finance/kvault/blob/HEAD/programs/kvault/src/state/vault_state.rs), [handler_invest.rs](https://github.com/Kamino-Finance/kvault/blob/HEAD/programs/kvault/src/handlers/handler_invest.rs), [klend_operations.rs](https://github.com/Kamino-Finance/kvault/blob/HEAD/programs/kvault/src/operations/klend_operations.rs); klend [checks.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/utils/prices/checks.rs).
- Jupiter: [Pool account](https://developers.jup.ag/docs/perps/pool-account), [Custody account](https://developers.jup.ag/docs/perps/custody-account).
- Sanctum Infinity: [S controller instructions](https://github.com/igneous-labs/S/blob/master/docs/s-controller-program/instructions.md), [SPL calculator](https://github.com/igneous-labs/S/blob/master/docs/sol-value-calculator-programs/spl.md), [reserve-v2 pricing](https://github.com/igneous-labs/inf-1.5/blob/HEAD/docs/reserve-v2-pricing-program.md).
- Voltr: [core components](https://github.com/voltrxyz/docs/blob/HEAD/protocols/adaptor-creation/core-components.mdx), [adaptor security](https://github.com/voltrxyz/docs/blob/HEAD/protocols/adaptor-creation/security.mdx).
- Meteora: [Hermes keeper](https://docs.meteora.ag/dynamic-vault/for-integrators/hermes-meteoras-keeper).
- Etherfuse: [Price Feeds](https://docs.etherfuse.com/price-feeds), [Dev Docs](https://app.etherfuse.com/legal/dev-docs), [API](https://api.etherfuse.com/lookup/bonds/cost), [stablebond SDK](https://www.npmjs.com/package/@etherfuse/stablebond-sdk).
- RedStone [Solana manifest](https://github.com/redstone-finance/redstone-oracles-monorepo/blob/main/packages/relayer-remote-config/main/relayer-manifests-non-evm/solanaMultiFeed.json); Pyth [market hours](https://docs.pyth.network/price-feeds/core/market-hours).
- Incidents: [Chainalysis on Drift](https://www.chainalysis.com/blog/lessons-from-the-drift-hack/), [CoinDesk on Drift](https://www.coindesk.com/markets/2026/04/05/drift-says-usd270-million-exploit-was-a-six-month-north-korean-intelligence-operation), [Helius](https://www.helius.dev/blog/solana-hacks), [Halborn on Cashio](https://www.halborn.com/blog/post/explained-the-cashio-hack-march-2022), [Neodyme](https://neodyme.io/blog/lending_disclosure/), [Asymmetric Research on marginfi](https://blog.asymmetric.re/threat-contained-marginfi-flash-loan-vulnerability/).
- Post-Drift controls: [Kamino whitelisted reserves](https://cryptonews.net/news/security/32684689/), [Exponent Strategy Vaults](https://docs.exponent.finance/user-documentation/strategy-vault-concepts.md).
- [PistachioFi on tokenized Tesouro](https://www.pistachio.fi/blog/tesouros-tokenizados-crypto-2026); [Solflare TESOURO page](https://www.solflare.com/prices/etherfuse-tesouro/BRNTNaZeTJANz9PeuD8drNbBHwGgg7ZTjiQYrFgWQ48p/).
