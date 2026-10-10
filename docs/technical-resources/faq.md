# FAQ

Short answers for integrators, reviewers and capital providers. Each answer links to the page with the detail.

## The program

### What does the `mutav` program do?

It holds a BRL reserve in BRS and records every guarantee MUTAV gives, with its remaining cover. It mints reserve shares to allowlisted capital providers at an on-chain NAV. It refuses any capital movement or new guarantee that would leave the registered cover under-backed. It never refuses a claim payment for solvency reasons. See [Program reference](program-reference.md).

### Is the reserve a yield product?

No. The reserve is operational infrastructure that keeps the guarantees backed. Guarantee fees and issuer income raise NAV, but BRS itself bears no yield and the program prices nothing. During the pilot the reserve runs on MUTAV's own capital and is not open to public investment.

### Does the program decide claims or price guarantees?

No. MUTAV's platform reviews each payment request and prices each guarantee off-chain. The operator then files the claim on-chain. The reserve admin approves claim amounts above the per-call cap, which is a decision about how much money may leave the reserve, not about whether the claim is valid.

### Does the program hold personal data?

No. Contracts, agencies, notices and Pix payments appear on-chain only as 32-byte references and hashes (`id`, `agency_id`, `refs_hash`, `notice_ref_hash`, `pix_e2e_hash`). The data behind them stays in the MUTAV platform.

### Why BRS only?

The pilot reserve holds a single asset with a 100% settlement floor, so every claim can be paid from liquid BRS. Other assets can be added later through capped adapters by a program upgrade. See [ADR 0018](../decisions/0018-brs-only-pilot-reserve.md).

### Where are the addresses?

On [Configuration and reference](configuration-and-reference.md). The program ID and the reserve PDAs are known now. Multisigs, role keys and money accounts are set at deploy.

## Safety

### Can the solvency gate block a claim payment?

No. `pay_claim` is never checked against solvency, mode, pause or the NAV guard. Only the filing itself, the claim caps, liquid BRS or a frozen reserve account can stop it. If a payment is blocked, MUTAV can pay the agency by Pix from its own bank and the reserve reimburses MUTAV's payments account later.

### What does pause stop?

Only capital flows (`request_deposit`, `request_redeem`, `fulfil_deposits`, `fulfil_redeems`) and new guarantees (`register_guarantee`). Every claim instruction, guarantee fees, issuer income, owner cancels and claims, the cranks and admin configuration keep running. Pause never traps a holder's money and never blocks a claim. The pauser and up to 3 guardians can pause with no time lock; the admin can too, through its multisig's time lock. Only the admin unpauses.

### What is the most a compromised operator key can cost?

The admin-set claim caps. Claim payments are the only irreversible operator action, and they land in MUTAV's own payments account. Every other change can be undone by another operator action: a registration by `close_guarantee(VOID)`, a close by `reinstate_guarantee`, a filing by `withdraw_claim`. See the [operator-compromise runbook](deployment-and-operations.md#operator-compromise).

### Who can move BRS out of the reserve's accounts?

BRS leaves only to: MUTAV's payments account (claim payments), the treasury (MUTAV's take of guarantee fees), the `claims` escrow and on to its owner (redemptions), the owner of a pending deposit (cancel or refund), and, from the `unsolicited` account only, the original sender of money that arrived outside a booking path.

### Why can't a direct transfer change the share price?

The program prices shares from tracked balances, not raw token balances. BRS sent straight to a reserve account is untracked. Anyone can `skim` it into the `unsolicited` account, and the admin then returns it to the sender or books it.

### What happens if the issuer freezes a reserve account?

A frozen reserve counts as 0 BRS in every solvency computation that reads it. New guarantees, fills and `clear_fulfil_halt` refuse with `ReserveFrozen`, and `refresh` emits `ReserveFrozenDetected`. A freeze also blocks `pay_claim`; MUTAV then pays by Pix and is reimbursed after. The reserve's money is split across separate token accounts so one freeze does not trap everything.

### How are upgrades controlled?

The upgrade authority is a Squads v4 multisig with a long time lock (1 hour on devnet, 7 days for the real pilot). The reserve admin is a second multisig with the same members and a shorter time lock (5 minutes on devnet, 24 hours for the real pilot). Every upgrade bundles a verifiable build hash that each signer reproduces. See [Upgrades](deployment-and-operations.md#upgrades).

### Has the program been audited?

Not yet. The program is unaudited. A security audit pass runs before the devnet deploy, and an audit precedes a capped pilot with real guarantees. To report a vulnerability, follow [`SECURITY.md`](../../SECURITY.md).

## Coverage and NAV

### Why doesn't the reserve hold the full cover of every lease?

Claims arrive one event at a time: one month's rent per default claim, one exit payment at the end. The reserve holds `max(c × remaining cover, provisions + min(stress_buffer, unprovisioned cover))`. On devnet `c = 0.10` (the program floor) and the stress buffer is R$19,000. Filed claims are always held in full. See [Math reference](math-reference.md#solvency-quantities).

### What happens when the reserve is under-covered?

New guarantees and redemptions stop until capital comes in or guarantees run off. Claims keep being paid. Deposit fills stay open, because they recapitalise the reserve, unless net assets are 0, in which case MUTAV's backstop money is booked without minting shares.

### Why did fills stop with `FulfilHalted`?

NAV per share moved more than `max_nav_move_bps` in a way verified inflows do not explain. The halt is sticky until the admin investigates and runs `clear_fulfil_halt`. On devnet the bound is 100%, so it does not trip during the demo.

### Why are guarantee fees refused right after the deploy?

`contribute_fees`, `sweep_income` and `book_unsolicited` are refused while no shares exist. The first deposit must be filled first, so no inflow is lost to share rounding.

## Capital providers

### Can I exit if I am removed from the allowlist?

Yes. Entry is allowlisted; exit is open. A wallet that already holds shares can `request_redeem` without a proof. A pending deposit from that wallet is returned by the admin with `refund_deposit`.

### Can I redeem a balance below the minimum request?

Yes, if you redeem everything. A full exit from your canonical share account skips `min_request`. Partial exits keep the minimum.

### Why did my request fail with "account already in use"?

Request PDAs are seeded by the global queue sequence. Two requests sent at the same moment race for the same `seq`. The client retries with the next one. See [Client SDK](client-sdk.md#request-sequence-races).

### Why is my redemption not filled yet?

The admin fills in strict FIFO order, and v1 fills whole requests only. Each fill must fit in `min(free_capital, liquid_budget)`. A head request larger than that waits until free capital grows. Partial fills at the head are planned for the first post-hackathon upgrade.

### Can shares be transferred?

On devnet the share mint is a classic SPL Token mint. Transfer-restricted shares are decided before mainnet `initialize`.

### Is there a deadline for claim payments in the program?

No. The program records each payment and its Pix settlement, but the payment deadline lives in the MUTAV platform and the guarantee contract. The program's only promise is that, within the caps, `pay_claim` is never refused for solvency.

## Integration

### Do I need keys to use the client?

No. `@mutav-finance/mutav-protocol-solana` composes unsigned instructions and reads accounts. Your wallet, or a Squads proposal for admin instructions, signs. See [Client SDK](client-sdk.md).

### How do I read the reserve's health?

`fetchReserve(rpc, reserveMint)` returns the config, the state and a solvency snapshot computed with the same math as the program. Anyone can also send `refresh` to recompute and publish it on-chain.

### Will instructions change shape after the deploy?

No. From the first devnet deploy, existing instructions, accounts and events keep their shape. New behaviour arrives as new instructions, appended errors and events, or fields carved from padding. A CI job enforces this against the released IDL.

## Sources

- [Specification](../spec.md), in particular [§1 Principles](../spec.md#1-principles), [§2 Roles and keys](../spec.md#2-roles-and-keys), [§4 Invariants and formulas](../spec.md#4-invariants-and-formulas), [§14 Upgrade readiness](../spec.md#14-upgrade-readiness)
- [Litepaper](../litepaper.md)
- [`SECURITY.md`](../../SECURITY.md)
- [Client README](../../clients/js/README.md)
- Program source: [`programs/mutav/src/`](../../programs/mutav/src/)

## Decisions

- [ADR 0003: Payments operated by MUTAV](../decisions/0003-payments-operated-by-mutav.md)
- [ADR 0004: On-chain NAV with internal accounting](../decisions/0004-onchain-nav-internal-accounting.md)
- [ADR 0005: Solvency gate scope](../decisions/0005-solvency-gate-scope.md)
- [ADR 0008: Uniform capital flow and pause scope](../decisions/0008-uniform-capital-flow-and-pause-scope.md)
- [ADR 0010: Partial fills at the queue head](../decisions/0010-partial-fills-at-queue-head.md)
- [ADR 0015: Admin clears the fulfil halt](../decisions/0015-admin-clear-fulfil-halt.md)
- [ADR 0016: Coverage ratio below one](../decisions/0016-coverage-ratio-below-one.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- Pending ADR: Operator/admin separation and operator-compromise recovery
- Pending ADR: Claims: approval, amendment, exact payment, sliding window
- Pending ADR: Coverage: stress buffer and underwater reserve (amends 0016)
- Pending ADR: Exit rights (open exit, full exit below minimum, refunds)
- Pending ADR: Unsolicited money and backstop contributions
