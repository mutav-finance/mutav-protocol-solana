# FAQ

Short answers for integrators, reviewers and capital providers. Each answer links to the page with the detail.

## The program

### What does the `mutav` program do?

It holds a BRL reserve in BRS and records every guarantee MUTAV gives, with its remaining cover. It mints reserve shares to allowlisted capital providers at an on-chain NAV. It refuses any capital movement or new guarantee that would leave the registered cover under-backed. It never refuses a claim payment for coverage reasons. See [Program reference](program-reference.md).

### Is the reserve a yield product?

No. The reserve is operational infrastructure that keeps the guarantees backed. Guarantee fees and issuer income raise NAV, but BRS itself bears no yield and the program prices nothing. During the pilot the reserve runs on MUTAV's own capital and is not open to public investment.

### Does the program decide claims or price guarantees?

No. MUTAV's platform reviews each payment request and prices each guarantee off-chain. The operator then files the claim on-chain. With the later `approve_claim`, the reserve admin will approve claim amounts above the per-call cap, a decision about how much money may leave the reserve, not about whether the claim is valid.

### Does the program hold personal data?

No. Contracts, agencies, notices and Pix payments appear on-chain only as 32-byte references and hashes (`id`, `agency_id`, `refs_hash`, `notice_ref_hash`, `pix_e2e_hash`). The data behind them stays in the MUTAV platform.

### Why BRS only?

The pilot reserve holds a single asset with a 100% settlement floor, so every claim can be paid from liquid BRS. Other assets can be added later through adapters by a program upgrade, behind a BRS liquidity floor that keeps claims payable. See [ADR 0018](../decisions/0018-brs-only-pilot-reserve.md) and the proposed [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md).

### Where are the addresses?

On [Configuration and reference](configuration-and-reference.md). The program ID and the reserve PDAs are known now. Multisigs, role keys and money accounts are set at deploy.

## Safety

### Can the coverage gate block a claim payment?

No. `pay_claim` is never checked against required coverage, mode, pause or the NAV guard. Only the filing itself, the claim caps, liquid BRS or a frozen reserve account can stop it. If a payment is blocked, MUTAV can pay the agency by Pix from its own bank and the reserve reimburses MUTAV's payments account later.

### What does pause stop?

Only capital flows (`request_deposit`, `request_redeem`, `fulfil_deposits`, `fulfil_redeems`) and new guarantees (`register_guarantee`). Every claim instruction, guarantee changes other than new registrations, guarantee fees, issuer income, cancels and claims, the cranks, role instructions and admin configuration keep running. Pause never traps a holder's money and never blocks a claim. The pauser and up to 3 guardians can pause with no time lock; the admin can too, through its multisig's time lock. Only the admin unpauses.

### What is the most a compromised operator key can cost?

The admin-set claim caps. Claim payments are the only irreversible operator action, and they land in MUTAV's own payments account. A registration can be undone by `close_guarantee(CLOSE_VOID)`. Undoing a close (`reinstate_guarantee`) or a filing (`amend_claim(0)`, which withdraws it) comes with a later upgrade; until then the reconciliation records them. See the [operator-compromise runbook](deployment-and-operations.md#operator-compromise).

### Who can move BRS out of the reserve's accounts?

BRS leaves only to: MUTAV's payments account (claim payments), the treasury (MUTAV's take of guarantee fees), the `claims` escrow and on to its owner (redemptions), and the owner of a pending deposit (`cancel_deposit`, by the owner or the admin). With a later upgrade, money that arrived outside a booking path can also be returned to its original sender, from the `unsolicited` account only.

### Why can't a direct transfer change the share price?

The program prices shares from tracked balances, not raw token balances. BRS sent straight to a reserve account is untracked and stays outside NAV. With a later upgrade, anyone can `skim` it into the `unsolicited` account, and the admin then returns it to the sender or books it.

### What happens if the issuer freezes a reserve account?

A frozen reserve counts as 0 BRS in every coverage computation that reads it. New guarantees, fills and `clear_fulfil_halt` refuse with `ReserveFrozen`, and `refresh` emits `ReserveFrozenDetected`. A freeze also blocks `pay_claim`; MUTAV then pays by Pix and is reimbursed after. The reserve's money is split across separate token accounts so one freeze does not trap everything.

### What happens to a claim above the per-call cap?

It is filed and provisioned in full. Until `approve_claim` ships (later upgrade), `pay_claim` refuses it with `ClaimCallCapExceeded`, and MUTAV pays the agency first from its bank account. Once it ships, the admin approves the exact amount through its time lock, and the operator then pays exactly the provision with `pay_claim`, which reimburses MUTAV. Approved payments count toward the cap per sliding 31-day window; for an unusually large claim the admin raises that cap in the same proposal. See [Program reference](program-reference.md).

### How are upgrades controlled?

The upgrade authority is a Squads v4 multisig with a long time lock (1 hour on devnet, 7 days for the real pilot). The reserve admin is a second multisig with the same members and a shorter time lock (5 minutes on devnet, 24 hours for the real pilot). Every upgrade bundles a verifiable build hash that each signer reproduces. See [Upgrades](deployment-and-operations.md#upgrades).

### Has the program been audited?

Not yet. The program is unaudited. A security audit pass runs before the devnet deploy, and an audit precedes a capped pilot with real guarantees. To report a vulnerability, follow [`SECURITY.md`](../../SECURITY.md).

## Coverage and NAV

### Why doesn't the reserve hold the full cover of every lease?

Claims arrive one event at a time: one month's rent per default claim, one exit payment at the end. The reserve holds `max(c × remaining cover, provisions + min(stress_buffer, unprovisioned cover))`. On devnet and in the pilot `c = 0.25` (the program floor is 0.10) and the stress buffer is R$19,000 ([ADR 0028](../decisions/0028-pilot-parameters.md)). Filed claims are always held in full. See [Math reference](math-reference.md#coverage-quantities).

### What happens when the reserve is under-covered?

New guarantees and redemption fills stop until capital comes in or guarantees run off. Claims keep being paid. Deposit fills stay open, because they recapitalise the reserve, unless the reserve is underwater (NAV per share below the smallest published unit while shares are outstanding): then both fills refuse with `ReserveUnderwater`. The interim recovery is MUTAV's recapitalisation through `contribute_fees`, recorded as a backstop, with no shares minted; cancels stay open.

### Why did fills stop with `FulfilHalted`?

NAV per share moved more than `max_nav_move_bps` in a way verified inflows do not explain. A fill checks this inline and refuses without latching; `refresh` latches the halt. The halt is sticky until the admin investigates and runs `clear_fulfil_halt`. On devnet the bound is 100%, so it does not trip during the demo.

### Why are guarantee fees refused right after the deploy?

`contribute_fees` and `sweep_income` are refused with `NoSharesOutstanding` while no shares exist. The first deposit must be filled first, so no inflow is lost to share rounding.

## Capital providers

### Can I exit if I am removed from the allowlist?

Yes. Entry is allowlisted; exit is open. A wallet that already holds shares can `request_redeem` without a proof: eligibility is checked only when the debited share account is empty. A pending deposit from that wallet can be cancelled by the owner or by the admin with `cancel_deposit`, which returns the BRS to the owner's own token account.

### Can I redeem a balance below the minimum request?

Yes, as an exit of the balance. Below `min_request`, a redemption is accepted only from your canonical share associated token account, if it leaves a remainder worth less than `min_request` and is worth at least `max(1, min_request / 10)`: R$100 at the R$1,000 minimum. Below that floor the balance waits; it stays transferable and valued in NAV. Other requests keep the minimum.

### Why did my request fail with "account already in use"?

Request PDAs are seeded by the global queue sequence. Two requests sent at the same moment race for the same `seq`. The client retries with the next one. See [Client SDK](client-sdk.md#request-sequence-races).

### Why is my redemption not filled yet?

The admin fills in strict FIFO order, and v1 fills whole requests only. Each fill must fit in `min(max_assets − paid, free_capital, liquid_budget)`. A head request larger than that waits until free capital grows. A head worth 0 BRS, or one whose `min_assets_out` is not met, stops the batch until the owner or the admin cancels it. Partial fills at the head are planned for the first post-hackathon upgrade.

### Can shares be transferred?

On devnet the share mint is a classic SPL Token mint. Shares will be transfer-restricted on mainnet; the mechanism is chosen before mainnet `initialize`.

### Is there a deadline for claim payments in the program?

No. The program records each payment and its Pix settlement on the claim's `ClaimFiling`, but the payment deadline lives in the MUTAV platform and the guarantee contract. The program's only promise is that, within the caps, `pay_claim` is never refused for coverage or pause.

## Integration

### Do I need keys to use the client?

No. `@mutav-finance/mutav-protocol-solana` composes unsigned instructions and reads accounts. Your wallet, or a Squads proposal for admin instructions, signs. See [Client SDK](client-sdk.md).

### How do I read the reserve's health?

`fetchReserve(rpc, reserveMint)` returns the config, the state and a coverage snapshot (its `coverage` field) computed with the same math as the program. Anyone can also send `refresh` to recompute and publish it on-chain.

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
- [ADR 0005: Coverage gate scope](../decisions/0005-solvency-gate-scope.md)
- [ADR 0008: Uniform capital flow and pause scope](../decisions/0008-uniform-capital-flow-and-pause-scope.md)
- [ADR 0010: Partial fills at the queue head](../decisions/0010-partial-fills-at-queue-head.md)
- [ADR 0015: Admin clears the fulfil halt](../decisions/0015-admin-clear-fulfil-halt.md)
- [ADR 0016: Coverage ratio below one](../decisions/0016-coverage-ratio-below-one.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md) (amends 0016)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md)
- [ADR 0024: Unsolicited money and backstop contributions](../decisions/0024-unsolicited-money-and-backstop.md)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md)
- [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) (Proposed)
- [ADR 0028: Pilot parameters](../decisions/0028-pilot-parameters.md)
- [ADR 0029: Claims and capital rules in the program](../decisions/0029-claims-and-capital-rules-in-the-program.md)
