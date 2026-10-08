# 0018 — BRS-only pilot reserve; assets expand through adapters

- **Status:** Accepted for the pilot (Julia, 2026-10-07); builds on ADR 0017, which is still proposed. Narrows how ADR 0002 applies in the pilot and generalises its single-asset limits to per-reserve and per-adapter ones. No program change in this PR; a follow-up PR replaces `max_tesouro_share_bps` with `min_settlement_bps`.

## Context

The design lets the reserve hold BRS and, through capped adapters, other assets, with Etherfuse TESOURO as the first one (ADR 0002, spec §5.7, §7, §8). Three facts make TESOURO a poor fit for the pilot:

- **The reserve already has an income source.** BRS bears no yield; the reserve receives Nora's issuer partnership revenue in BRS (ADR 0017). The rate is set by a commercial agreement and is not on-chain; MUTAV expects it below but near Selic, pending Nora's confirmation. TESOURO would add a little yield at the cost of a second issuer, a price feed and a mark-to-market.
- **There is no BRS↔TESOURO path.** Etherfuse mints and redeems TESOURO against USDC, not BRS (spec §12 Q6). Holding TESOURO would mean a BRS → BRL/USDC → TESOURO round trip off-chain or through other venues, each with its own fees, delays and counterparties.
- **An adapter costs a build and an audit.** A real adapter (spec §5.7) adds a CPI path at the maximum invoke depth, a sub-authority, a price account whose layout Etherfuse has not confirmed (§12 Q2) and possibly an async conversion state (PC-18). All of it would need building, testing and a security review before any value moved through it.

## Decision

1. **The pilot reserve holds BRS only.** The settlement-token floor (`min_settlement_bps`, see decision 4) is `10_000` (100%) on devnet and in the pilot, which is today's program field `caps.max_tesouro_share_bps = 0`. No adapter is whitelisted, and `allocate` / `deallocate` / `whitelist_adapter` / `remove_adapter` stay out of the pilot binary.
2. **The expansion path stays in place.** The reserved layout is unchanged: `VaultConfig.adapters` (`MAX_ADAPTERS = 8` slots), `VaultState.tesouro_units` / `tesouro_price`, `PriceParams` and the allocation-limit field `caps.max_tesouro_share_bps` (replaced by `min_settlement_bps`, decision 4). The spec keeps the adapter and pricing design, framed as the first adapter candidate. Expanding is an upgrade plus admin proposals, not a migration.
3. **TESOURO is the first candidate, not a commitment.** It is listed in the app and documents as the first asset an adapter could add, blocked on an Etherfuse BRS path.
4. **A floor on the settlement token, and limits per adapter, not per asset name** (Julia: "the share cap for TESOURO doesn't make sense because we can add several adapters and assets"; "it makes more sense to have a min allocation in the token used for pay-in/payout").
   - **`min_settlement_bps`** replaces `max_tesouro_share_bps`: the minimum share of stable assets held in `reserve_mint` (liquid BRS, the token guarantee fees come in and claim payments go out in). Adapters together may use only the share above it: `brs_balance ≥ min_settlement_bps × stable_assets / 10_000` after every `allocate`. A value `V` is equivalent to today's `max_tesouro_share_bps = 10_000 − V`. **Pilot value `10_000` (100%)**, so no allocation is possible.
   - **Per-adapter limits** in each adapter: the existing absolute `AdapterEntry.cap` (BRS-equivalent) plus a new `max_share_bps`, so no single asset dominates (`adapter value ≤ max_share_bps × stable_assets / 10_000`).
   - **Per-adapter price feed.** The global, TESOURO-named `PriceParams` price fields (`tesouro_price_account`, `p0`, `t0`, `y_max_bps`, `max_staleness_secs`, `max_deviation_bps`) become per-adapter, each adapter with its own price account, accrual ceiling and staleness and deviation bounds. `max_nav_move_bps` stays global: it guards NAV, not a price. Likewise `VaultState.tesouro_units` / `tesouro_price` / `tesouro_price_ts` become per-adapter position fields, and `stable_assets = brs_balance + Σ adapter value`.
   - **Sequencing: rename now, per-adapter fields with the first adapter upgrade.** A follow-up PR replaces the program field; until then the app composes the floor through `set_config` on `max_tesouro_share_bps = 10_000 − V` (`TODO(rename)` in the app). The per-adapter fields ship with the upgrade that adds the adapter instructions; until then the global price fields stay and read zero.
   - **Zero-safety of the replacement (for the rename PR).** Reusing the same `u16` with the inverted meaning would make a zeroed field mean "no floor", against spec §14.2 R3 (fields decode from zero to the pilot behaviour). Two safe options, before the layout freeze: (a) keep storing the complement (`10_000 − min_settlement_bps`, the existing field's meaning, where zero is the pilot's "nothing outside BRS") and convert at the instruction and event boundary; or (b) store `min_settlement_bps` with `initialize` writing `10_000` and a re-initialized devnet config. Either way the per-adapter `max_share_bps = 0` keeps `allocate` closed for any adapter that was never configured. Recommended: (a), since it needs no re-initialization; the rename PR decides.

### Where the per-adapter fields live (padding check)

`AdapterEntry` reserves `[u8; 64]` per entry (spec §14.2), of which 40 bytes are earmarked for PC-27 adapter pinning (deployed slot `u64` + upgrade authority `Pubkey`). The per-adapter fields need:

| Field | Bytes |
|---|---|
| `max_share_bps: u16` | 2 |
| price account `Pubkey` | 32 |
| `max_staleness_secs: i64`, `max_deviation_bps: u16` | 10 |
| accrual ceiling `p0: u64`, `t0: i64`, `y_max_bps: u16` | 18 |
| position: `units: u64`, `last_price: u64`, `price_ts: i64` | 24 |
| **Total** | **86** |

**They do not fit**: 86 > 64 even without pinning, and 126 with it. Growing the inline entry would cost `8 × N` bytes of `VaultConfig` and would still box every adapter's price state into the singleton. Proposal, before the layout freeze:

- **Carve only `max_share_bps` inline**, from the front of `AdapterEntry._reserved` (2 bytes, safe at zero: `0` = nothing may be allocated), leaving 62 bytes, which still holds PC-27 pinning (40).
- **Put the price feed, its bounds, the accrual ceiling and the position in a per-adapter PDA**, `AdapterState` at `["adapter_state", config, program_id]` (about 86 bytes plus its own `version`, `bump` and `_reserved: [u8; 64]`), created by `whitelist_adapter` and closed by `remove_adapter`. `refresh` and the gated instructions pass each enabled adapter's `AdapterState`.
- **Reserve the seed prefix `"adapter_state"` now** (spec §14.2), so no pilot PDA can take it. It costs no bytes and needs no program change.

## How a new asset is added

Step 1 is a program upgrade (the Squads multisig is the upgrade authority); steps 2–4 are Squads proposals under the time lock; step 5 is permissionless. The app's "Expand with adapters" block lists the same five steps.

1. **Upgrade** the program with the adapter instructions (`whitelist_adapter`, `remove_adapter`, `allocate`, `deallocate`, spec §5.1, §5.7) and deploy the asset's adapter program, after its own review.
2. **Whitelist the adapter** with its limits: its `cap` (the most BRS-equivalent value it may hold), its share limit (`AdapterEntry.max_share_bps`) and its own price feed (`AdapterState`: price account, accrual ceiling, staleness and deviation bounds).
3. **Lower `min_settlement_bps`** below 100% through `set_config`: the share above the floor is what all adapters together may use.
4. **Allocate** within every gate: the settlement floor (`brs_balance ≥ min_settlement_bps × stable_assets` after the move), the adapter's `cap` and `max_share_bps`, the solvency gate (`mode == Normal`, stable assets after ≥ coverage required) and the liquidity check (BRS left ≥ provisions + earmark). `deallocate` brings it back; under coverage stress it is allowed only if it does not worsen coverage.
5. **Refresh** (anyone) re-values the reserve at each adapter's bounded price: stable assets, NAV and the mode follow.

## Consequences

- **Single-issuer concentration on Nora.** Every real in the reserve is BRS, so a BRS freeze, de-peg or redemption halt hits the whole reserve. The freeze authority today is one Nora wallet (spec §12 Q34). Mitigation: ask Nora to move the BRS freeze authority and its program upgrade authority to a multisig before the reserve caps (`max_tvl`) rise above the pilot's. Freeze detection in `refresh` and the fail-closed `stable_assets` stay the on-chain backstop.
- **Yield comes from a commercial agreement, not a market position.** The reserve's return is Nora's revenue share (ADR 0017): one contract with one issuer, which can change its rate or end. Public copy keeps calling it issuer partnership revenue and never counts it in coverage.
- **Simpler pilot.** There is no price feed to trust, so no `StalePrice` path is live and no mark-to-market swings NAV. NAV moves only through fees, swept income, provisions and claim payments.
- **The USDC-sleeve question stays open.** The business plan's liquidity sleeve in a USD stablecoin (and its FX risk against BRL claims) is not decided here. Like TESOURO, it would come through an adapter or its own valuation rule and mint-guard review.
- **Docs and app.** The spec, README, litepaper and pilot app describe the reserve as "BRS, expandable through adapters (TESOURO is the first candidate, pending an Etherfuse BRS path)". The app's `/admin` Allocation section shows 100% BRS with the settlement floor as a marker ("Min in BRS (settlement token): 100%"), a "Min held in the settlement token" control (composed as `max_tesouro_share_bps = 10_000 − V` until the rename) and a per-adapter table, and lists the per-adapter price feed as planned with the adapter.
