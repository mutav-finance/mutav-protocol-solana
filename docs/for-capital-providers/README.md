# For capital providers

This section is for wallets that hold, or may one day hold, shares of the MUTAV reserve. It explains who can provide capital, how money goes in and out, how the share value is computed, and what can lower it.

The reserve is operational infrastructure. It backs the rental guarantees (fiança) that MUTAV gives through real-estate agencies. It is not a yield product. MUTAV sets no return target and makes no return projection.

## What a share is

A reserve share is a claim on a part of the reserve's net assets. The program mints shares when it fills a deposit and burns them when it fills a redemption. Every share has the same value: the NAV per share, which the program computes from its own records.

| A share's value goes up when | A share's value goes down when |
|---|---|
| Net guarantee fees enter the reserve | A claim is filed and its provision is booked |
| Issuer partnership income is swept into the reserve | A reserve token account is frozen (it counts as 0 BRS) |
| The admin books unsolicited money or a MUTAV backstop | |
| A filed claim is withdrawn or amended down | A filed claim is amended up |

Details are in [Share value](share-value.md) and [Risks](risks.md).

## Who can provide capital

| Question | Answer in the devnet release and the pilot |
|---|---|
| Who may deposit? | Only wallets on the on-chain allowlist. Each deposit request carries a Merkle proof against `investor_allowlist_root`. Identity checks (KYC) happen off-chain, before a wallet is added. |
| Who is on the allowlist? | MUTAV's own capital wallet. Its address is recorded on-chain in `VaultConfig.mutav_capital_wallet` (set at deploy) so anyone can see MUTAV's position. |
| Is the reserve open to public investment? | No. The pilot runs on MUTAV's own capital. |
| Does MUTAV's wallet get special treatment? | No. It uses the same queues, the same NAV and the same rules as any other holder. There is no instruction that lets MUTAV add or take capital outside the queues. |
| Can a holder leave after being removed from the allowlist? | Yes. Entry is allowlisted; exit is open to any wallet that already holds shares. See [Deposits and redemptions](deposits-and-redemptions.md#exit-rights). |
| What asset do I deposit and receive? | BRS, a BRL token on Solana issued by Nora (classic SPL Token, 6 decimals, 1 BRS = R$1). The reserve holds BRS only in the pilot. |

Outside capital providers are a later step. Before any outside capital, MUTAV builds the claim-notice gate and the exit fallback, and decides how share transfers are restricted on mainnet. See [Risks](risks.md#planned-protections-before-outside-capital).

## How MUTAV's money is kept apart

MUTAV touches the reserve in separate roles. The program keeps each flow on its own path, so a holder can see each one.

| Flow | Instruction | Destination | Mints shares? |
|---|---|---|---|
| Net guarantee fees | `contribute_fees` (operator) | `reserve` | Never |
| MUTAV's fee take | Same call, separate transfer | MUTAV's treasury account | Never; not part of the reserve |
| Issuer partnership income | `sweep_income` (operator) | `reserve` | Never |
| MUTAV as capital provider | `request_deposit` / `request_redeem` from the capital wallet | `pending_deposits`, then `reserve` | Yes, at NAV, like any holder |
| MUTAV backstop | Admin booking, receipt kind `BACKSTOP` | `reserve` | Never |

Fees, income and backstop money raise the value of every share pro rata. MUTAV benefits from them only through the shares it bought, like every holder.

## Roles a capital provider deals with

| Role | Key | What it does for capital |
|---|---|---|
| Capital provider (owner) | Own wallet | Requests deposits and redemptions; cancels; claims shares and BRS. |
| Reserve admin | Squads v4 multisig, time-locked | Fills the deposit and redemption queues in FIFO order; sets caps; refunds pending deposits; books unsolicited money and backstops; clears a NAV halt. |
| Operator | Separate key | Books guarantee fees and issuer income; files and pays claims. Cannot fill queues, mint shares or send reserve BRS anywhere but MUTAV's payments account. |
| Pauser and guardians | Separate keys | Pause. A pause stops new requests and fills, never cancels or claims. |
| Anyone | Any signer | `refresh` (recomputes NAV), `advance_queue_heads`, `skim`. |

## Devnet values that matter to capital providers

Amounts are in BRS. All of them are set by the reserve admin through the time-locked multisig.

| Parameter | Devnet value |
|---|---|
| Maximum reserve size (`max_tvl`) | R$300,000 |
| Request size (`min_request` to `max_request`) | R$1,000 to R$100,000 |
| Coverage ratio `c` | 0.10 (program floor) |
| Stress buffer | R$19,000 |
| NAV-move bound (`max_nav_move_bps`) | 100% on devnet; lowered for the real pilot |
| Fee take (`fee_take_bps`) | 20% |
| Take from issuer income | 0 |
| Settlement floor | 100% BRS |
| Admin multisig time lock | 5 minutes on devnet; 24 hours on the real pilot |
| Upgrade multisig time lock | 1 hour on devnet; 7 days on the real pilot |
| Program, reserve and role addresses | Set at deploy |

## Pages in this section

1. [Deposits and redemptions](deposits-and-redemptions.md): the FIFO queues, fills, cancels, claims, refunds and exit rights.
2. [Share value](share-value.md): how NAV per share is computed, rounded and guarded.
3. [Risks](risks.md): what can lower the share value and how the design bounds each risk.

## Related sections

- [Introduction](../introduction/README.md)
- [Glossary](../introduction/glossary.md)
- [Coverage model](../reserve-framework/coverage-model.md)
- [Parameters](../reserve-framework/parameters.md)
- [Security and verification](../security/README.md)
- [Decisions](../meta/decisions.md)

## Sources

- [Spec §2.1, the separate MUTAV money flows](../spec.md#21-three-separate-mutav-money-flows-adr-0009-and-issuer-income-adr-0017)
- [Spec §5.5, investor capital](../spec.md#55-investor-capital-async) and [§5.6, MUTAV capital](../spec.md#56-mutav-capital)
- [Litepaper §9, capital flows](../litepaper.md#9-capital-flows)
- [Pilot app spec](../../app/docs/spec.md) (the `/investor` view and the "not open to public investment" rule)
- [README](../../README.md)
- Program: [`programs/mutav/src/state/config.rs`](../../programs/mutav/src/state/config.rs), [`programs/mutav/src/allowlist.rs`](../../programs/mutav/src/allowlist.rs)
- Pre-devnet decisions log (2026-10-10): devnet values, exit rights, unsolicited money, time locks

## Decisions

- [ADR 0004: on-chain NAV with internal accounting](../decisions/0004-onchain-nav-internal-accounting.md)
- [ADR 0008: one capital flow for everyone](../decisions/0008-uniform-capital-flow-and-pause-scope.md)
- [ADR 0009: separate MUTAV money flows](../decisions/0009-separate-mutav-money-flows.md)
- [ADR 0016: coverage ratio below one](../decisions/0016-coverage-ratio-below-one.md)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- Pending ADR: Operator/admin separation and operator-compromise recovery
- Pending ADR: Exit rights (open exit, full exit below minimum, refunds)
- Pending ADR: Unsolicited money and backstop contributions
- Pending ADR: Coverage: stress buffer and underwater reserve (amends 0016)
- Pending ADR: Exit fallback
