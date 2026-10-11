# For capital providers

This section is for wallets that hold, or may one day hold, shares of the MUTAV reserve. It explains who can provide capital, how money goes in and out, how the share value is computed, and what can lower it.

The reserve is operational infrastructure. It backs the rental guarantees (fiança) that MUTAV gives through real-estate agencies. It is not a yield product. MUTAV sets no return target and makes no return projection.

## What a share is

A reserve share is a claim on a part of the reserve's net assets. The program mints shares when it fills a deposit and burns them when it fills a redemption. Every share has the same value: the NAV per share, which the program computes from its own records.

| A share's value goes up when | A share's value goes down when |
|---|---|
| Net guarantee fees enter the reserve | A claim is filed and its provision is booked |
| Issuer partnership income is swept into the reserve | A reserve token account is frozen (it counts as 0 BRS) |
| MUTAV recapitalizes the reserve (today through `contribute_fees`; later through an admin booking) | |
| A filed claim is withdrawn or amended down (Wave 2) | A filed claim is amended up (Wave 2) |

Details are in [Share value](share-value.md) and [Risks](risks.md).

## Who can provide capital

| Question | Answer in the devnet release and the pilot |
|---|---|
| Who may deposit? | Only wallets on the on-chain allowlist. Each deposit request carries `Eligibility::Merkle { proof }`, a Merkle proof against `investor_allowlist_root`. Identity checks (KYC) happen off-chain, before a wallet is added. |
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
| MUTAV backstop | Today `contribute_fees` (operator) from MUTAV's own BRS, under a fresh invoice reference recorded as a backstop; in Wave 2 `book_unsolicited` (admin), receipt kind `BACKSTOP` | `reserve` | Never |

Fees, income and backstop money raise the value of every share pro rata. MUTAV benefits from them only through the shares it bought, like every holder.

## Roles a capital provider deals with

| Role | Key | What it does for capital |
|---|---|---|
| Capital provider (owner) | Own wallet | Requests deposits and redemptions; cancels; claims shares and BRS. |
| Reserve admin | Squads v4 multisig, time-locked | Fills the deposit and redemption queues in FIFO order, inside `nav_bounds` it fixes when proposing; sets caps; can cancel a pending deposit or redemption back to its owner; clears a NAV halt. In Wave 2 also books unsolicited money and backstops. |
| Operator | Separate key | Books guarantee fees and issuer income; files and pays claims. Cannot fill queues, mint shares or send reserve BRS anywhere but MUTAV's payments account. The most a misused operator key can cost the reserve is the admin-set claim caps. |
| Pauser and guardians | Separate keys | Pause (the pauser can also revoke the operator). A pause stops new requests, fills and new guarantees, never cancels, claims or claim payments. Up to three guardians, one on devnet. |
| Anyone | Any signer | `refresh` (recomputes NAV and records a NAV-move halt), `advance_queue_head`. |

## Devnet and pilot values that matter to capital providers

Amounts are in BRS. These are the pilot parameters of [ADR 0028](../decisions/0028-pilot-parameters.md), used on devnet too. The parameters are set by the reserve admin through the time-locked multisig; the time locks are Squads settings.

| Parameter | Devnet value |
|---|---|
| Maximum reserve size (`max_tvl`) | R$1,000,000 |
| Request size (`min_request` to `max_request`) | R$1,000 to R$100,000. Below R$1,000 only an exit of the balance, worth at least R$100 |
| Coverage ratio `c` | 0.25 (program floor 0.10) |
| Stress buffer | R$19,000 |
| Claim caps | R$15,000 per call; R$20,000 per sliding 31 days |
| NAV-move bound (`max_nav_move_bps`) | 100% on devnet; lowered for the real pilot |
| Fee take (`fee_take_bps`) | 20% |
| Take from issuer income | None; v1 has no income-take field (spec §12 Q47 stays 0) |
| Settlement floor | 100% BRS |
| Exit fallback wait (`max_queue_wait_secs`) | 0 (off) |
| Admin multisig time lock | 5 minutes on devnet; 24 hours on the real pilot |
| Upgrade multisig time lock | 1 hour on devnet; 7 days on the real pilot |
| Program, reserve and role addresses | Set at deploy |

## Pages in this section

1. [Deposits and redemptions](deposits-and-redemptions.md): the FIFO queues, fills, cancels, claims and exit rights.
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

## Decisions

- [ADR 0004: on-chain NAV with internal accounting](../decisions/0004-onchain-nav-internal-accounting.md)
- [ADR 0008: one capital flow for everyone](../decisions/0008-uniform-capital-flow-and-pause-scope.md)
- [ADR 0009: separate MUTAV money flows](../decisions/0009-separate-mutav-money-flows.md)
- [ADR 0016: coverage ratio below one](../decisions/0016-coverage-ratio-below-one.md)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md) (amends 0016)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md)
- [ADR 0024: Unsolicited money and backstop contributions](../decisions/0024-unsolicited-money-and-backstop.md)
- [ADR 0025: Exit fallback: a cooldown exit after `max_queue_wait_secs`](../decisions/0025-exit-fallback-cooldown-exit.md)
- [ADR 0028: Pilot parameters](../decisions/0028-pilot-parameters.md)
- [ADR 0029: Claims and capital rules in the program](../decisions/0029-claims-and-capital-rules-in-the-program.md)
