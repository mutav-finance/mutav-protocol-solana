# 0002 — One core program plus adapter programs with capped sub-authorities

- **Status:** Accepted
- **Date:** 2026-10-01

## Context

The reserve holds BRS and may hold Etherfuse TESOURO, reached through a venue whose interface is not yet confirmed. Venue integrations change faster and carry different risks than custody, NAV and the solvency gate. A venue bug or compromise must not be able to reach the whole reserve, and the audited surface should stay small.

## Decision

- **`mutav`** is the single core program: custody, share mint, NAV, the guarantee exposure registry, the solvency gate, the async investor queue, roles and claim payments.
- Each yield venue gets its own **adapter program** (`mutav-adapter-<venue>`, first: TESOURO). A shared **`mutav-adapter-interface`** crate defines discriminators and layouts. **`mutav-adapter-mock`** exists for devnet and tests only.
- Each whitelisted adapter acts through its **own capped sub-authority PDA**, which owns only that adapter's staging account. The core moves at most the adapter's cap into staging, then CPIs with the sub-authority. The vault's master authority and the share-mint authority are never passed into a CPI.
- After every adapter CPI the core reloads and checks every vault token account and the share supply.
- Adapters are whitelisted by the admin multisig (time-locked).

## Consequences

- An adapter compromise is bounded by its cap and cannot touch the liquid reserve, the escrows or the share mint.
- The core can be audited once and changed rarely; adapters ship on their own cadence.
- Until a real TESOURO path and price account are confirmed, only the interface and the mock ship.
- Each CPI adds compute and post-CPI checks; nesting depth must stay within Solana's limits (core → adapter → venue → token).
