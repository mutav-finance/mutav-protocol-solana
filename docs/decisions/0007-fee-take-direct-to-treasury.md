# 0007 — MUTAV's fee take goes directly to the treasury

- **Status:** accepted (2026-10-01)

## Context

`contribute_fees` splits each guarantee fee into MUTAV's take (`fee_take_bps`) and the net amount that enters the reserve. The first draft held the take in a program-owned `fees` token account. Nothing moved funds out of that account, so a `withdraw_fees` instruction would also have been needed.

## Decision

`contribute_fees` transfers the take **directly** to `VaultConfig.treasury_account` in the same instruction:
- The treasury is a whitelisted MUTAV BRS token account.
- Only the admin can change it, and only through the timelock.

The protocol has no `fees` account and no `withdraw_fees` instruction.

## Consequences

- **Less to secure:** one less account, one less instruction and one less multisig step. The program holds no fee balance that could become a target.
- **Verifiable split:** the take never touches the reserve, NAV or `stable_assets`. Each `FeesContributed { gross, take, net }` event lets anyone check the split against `fee_take_bps`.
- **No batching:** MUTAV receives its take on every contribution and cannot batch withdrawals.
