# 0018 — BRS-only pilot reserve; assets expand through adapters

- **Status:** Accepted by Julia, 2026-10-07. Narrows how ADR 0002 applies in the pilot; the adapter design itself is unchanged. No program change.

## Context

The design lets the reserve hold BRS and, through capped adapters, other assets, with Etherfuse TESOURO as the first one (ADR 0002, spec §5.7, §7, §8). Three facts make TESOURO a poor fit for the pilot:

- **BRS already earns close to the benchmark.** Through Nora's revenue share on BRS, booked as issuer income (ADR 0017), the reserve earns a yield below but near Selic. TESOURO would add a little yield at the cost of a second issuer, a price feed and a mark-to-market.
- **There is no BRS↔TESOURO path.** Etherfuse mints and redeems TESOURO against USDC, not BRS (spec §12 Q6). Holding TESOURO would mean a BRS → BRL/USDC → TESOURO round trip off-chain or through other venues, each with its own fees, delays and counterparties.
- **An adapter costs a build and an audit.** A real adapter (spec §5.7) adds a CPI path at the maximum invoke depth, a sub-authority, a price account whose layout Etherfuse has not confirmed (§12 Q2) and possibly an async conversion state (PC-18). All of it would need building, testing and a security review before any value moved through it.

## Decision

1. **The pilot reserve holds BRS only.** `caps.max_tesouro_share_bps = 0` on devnet and in the pilot. No adapter is whitelisted, and `allocate` / `deallocate` / `whitelist_adapter` / `remove_adapter` stay out of the pilot binary.
2. **The expansion path stays in place.** The reserved layout is unchanged: `VaultConfig.adapters` (`MAX_ADAPTERS = 8` slots), `VaultState.tesouro_units` / `tesouro_price`, `PriceParams` and the TESOURO share cap. The spec keeps the adapter and pricing design, framed as the first adapter candidate. Expanding is an upgrade plus admin proposals, not a migration.
3. **TESOURO is the first candidate, not a commitment.** It is listed in the app and documents as the first asset an adapter could add, blocked on an Etherfuse BRS path.

## How a new asset is added

Each step is a Squads proposal under the time lock; the first needs a program upgrade.

1. **Upgrade** the program with the adapter instructions (`whitelist_adapter`, `remove_adapter`, `allocate`, `deallocate`, spec §5.1, §5.7) and deploy the asset's adapter program, after its own review.
2. **Whitelist the adapter** with its per-adapter cap (`AdapterEntry.cap`, the most BRS-equivalent value it may hold).
3. **Set the price feed** (`PriceParams`: price account, accrual ceiling, staleness, deviation, NAV-move bound) through `set_config`.
4. **Raise the asset's share cap** from 0 (`max_tesouro_share_bps` for TESOURO; a new asset would carve its own share cap from reserved space).
5. **Allocate** within every gate: the share cap, the adapter cap, the solvency gate (`mode == Normal`, stable assets after ≥ coverage required) and the liquidity check (BRS left ≥ provisions + earmark). `deallocate` brings it back; under coverage stress it is allowed only if it does not worsen coverage.

## Consequences

- **Single-issuer concentration on Nora.** Every real in the reserve is BRS, so a BRS freeze, de-peg or redemption halt hits the whole reserve. The freeze authority today is one Nora wallet (spec §12 Q34). Mitigation: ask Nora to move the BRS freeze authority and its program upgrade authority to a multisig before the reserve caps (`max_tvl`) rise above the pilot's. Freeze detection in `refresh` and the fail-closed `stable_assets` stay the on-chain backstop.
- **Yield comes from a commercial agreement, not a market position.** The reserve's return is Nora's revenue share (ADR 0017): one contract with one issuer, which can change its rate or end. Public copy keeps calling it issuer partnership revenue and never counts it in coverage.
- **Simpler pilot.** There is no price feed to trust, so no `StalePrice` path is live and no mark-to-market swings NAV. NAV moves only through fees, swept income, provisions and claim payments.
- **The USDC-sleeve question stays open.** The business plan's liquidity sleeve in a USD stablecoin (and its FX risk against BRL claims) is not decided here. Like TESOURO, it would come through an adapter or its own valuation rule and mint-guard review.
- **Docs and app.** The spec, README, litepaper and pilot app describe the reserve as "BRS, expandable through adapters (TESOURO is the first candidate, pending an Etherfuse BRS path)". The app's `/admin` Allocation section shows 100% BRS and groups the TESOURO share cap and price controls under "Expand with adapters", used once an adapter is live.
