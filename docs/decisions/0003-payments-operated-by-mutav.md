# 0003 — Claim payments operated by MUTAV through a whitelisted payments account

- **Status:** Accepted
- **Date:** 2026-10-01

## Context

Claims are approved off-chain: an agency files a missed rent or exit costs with evidence in the MUTAV platform, and MUTAV verifies and approves. Agencies and landlords don't hold keys, and landlords are paid in reais through the agency, under mandate. The operator key that triggers payments is a hot key, so the program must limit what a compromised key can do. Payment completion happens off-chain (PIX) and must still be auditable.

## Decision

- `pay_claim` is signed by the operator and transfers BRS **only** to `VaultConfig.payments_account`, a MUTAV payments account whitelisted by the admin multisig (time-locked).
- Each payment creates a **`Payout` PDA** seeded by the guarantee and the notice reference, which makes payment idempotent per notice. It starts `Pending`.
- MUTAV offramps BRS to BRL and pays the agency by PIX. The operator then calls `settle_payout(pix_e2e_hash)`, recording the hash of the PIX end-to-end ID and moving the payout to `Settled`.
- `refresh` publicly flags any payout still pending after the settlement SLA (proposed 10 days).
- Payments are bounded by per-call and per-period caps and by the guarantee's remaining cover on the leg.

## Consequences

- A compromised operator key can only send capped amounts to MUTAV's own account, never to an arbitrary wallet; the pauser can revoke it immediately.
- Settlement becomes publicly auditable through the PIX proof hash and the SLA flag.
- MUTAV holds custody during the offramp window, and agencies and landlords trust MUTAV to forward payment; the public settlement trail is the mitigation.
- Requiring the admin multisig above a payment threshold was considered (adversarial review PC-22) and is not adopted for the pilot.
