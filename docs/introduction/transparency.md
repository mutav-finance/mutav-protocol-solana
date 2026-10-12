# Transparency

MUTAV's promise to agencies is that they can see the two things guarantors usually hide: the reserve, and the record of claim payments. This page lists what anyone can verify, how, and what stays off-chain.

No wallet, account or permission is needed to read any of it.

## What anyone can verify on-chain

| What | Where it lives | What it tells you |
|---|---|---|
| Reserve configuration | `VaultConfig` account | Roles (admin, operator, pauser, guardians), pending role handovers and their expiry, caps, coverage ratio, stress buffer, fee take, the treasury and payments accounts, the allowlist root. |
| Reserve state | `VaultState` account | Tracked BRS balance, remaining cover, provisions, coverage required, shares outstanding, NAV, mode, pause and halt flags, queue heads, the claim window. |
| Every guarantee | One `Guarantee` account per lease | Agency reference, default and exit cover, amounts paid and provisions per leg, status and close reason, and a hash of the lease and instrument. |
| Every claim | One `ClaimFiling` account per claim | Guarantee, leg, filed amount (the provision), any admin-approved amount, status (filed, paid, withdrawn, settled), timestamps. Once `amend_claim` ships, every amendment will emit `ClaimAmended`. |
| Every claim payment and its settlement | The same `ClaimFiling` account, `ClaimPaid` and `PayoutSettled` events | Amount paid, destination (MUTAV's payments account), and a hash of the Pix end-to-end ID once MUTAV pays the agency. |
| Guarantee fees | One `IncomeReceipt` of kind `FEE` per agency bill, `FeesContributed` event | Gross amount, MUTAV's take, net amount into the reserve. |
| Issuer income | One `IncomeReceipt` of kind `ISSUER_STATEMENT` per Nora statement, `IncomeSwept` event | Gross and net (MUTAV takes nothing from issuer income), and the inbox balance after the sweep. |
| Unsolicited money and backstop | Planned: `IncomeReceipt` of kind `UNSOLICITED` or `BACKSTOP` (both kinds reserved), `UnsolicitedSkimmed` and the admin's booking and return events | Once the unsolicited-money instructions ship: every untracked amount moved aside, booked into the reserve or returned to its source. Until then a MUTAV backstop arrives through `contribute_fees` as a `FEE` receipt with its own reference. |
| Capital movements | Deposit and redemption request accounts, fill events | Every request in queue order, the NAV of each fill, shares minted and burned. |
| Token balances | The reserve's token accounts, owned by the program's vault authority | The actual BRS and share balances, which you can compare with the tracked totals. |
| Configuration changes | `ConfigUpdated` (one per changed field), the role-handover events, `Paused` and related events | Every change to a parameter or role, with the old and new value. |
| Governance | Squads v4 multisig accounts | Members, threshold, time lock, and every pending and executed proposal. |
| Program code authority | The program's upgrade authority | The upgrade multisig vault, which has a long time lock. |

Every event carries the reserve's config address and a timestamp. Event layouts don't change after the layout freeze, so an indexer built today keeps working.

### Recompute it yourself

Anyone can call the permissionless `refresh` instruction. It recomputes stable assets, coverage required, surplus, free capital and NAV from tracked on-chain balances, updates the mode, and emits a `StateRefreshed` event. A frozen reserve token account counts as 0 in that computation.

The published TypeScript client (`@mutav-finance/mutav-protocol-solana`) contains read helpers and a math mirror of the program. You can use it to read every account and check the numbers off-chain.

### Why direct transfers don't move the numbers

The program keeps **internal accounting**. It tracks the amounts it moved, not raw token balances. If someone sends BRS straight to a reserve account, the share value does not change. A planned upgrade adds `skim`, which anyone can run to move that untracked surplus into a separate account for unsolicited money; the reserve admin then returns it to the sender or books it into the reserve. Until then the surplus stays in the account, outside NAV.

So two figures are always public for each account: the tracked total and the actual token balance. A gap between them is unsolicited money waiting to be handled.

## The `/reserve` page

The pilot app at [reserve.mutav.finance/reserve](https://reserve.mutav.finance/reserve) shows the same data in one place. It is read-only and needs no wallet. Every number is read from on-chain accounts through the client. It reads the pilot demo reserve on devnet; test activity is visible.

| Panel | What it shows |
|---|---|
| Health | Stable assets, coverage required, surplus, free capital, NAV per share, shares outstanding, mode, NAV halt, pause state, last refresh. |
| Coverage | Remaining cover by guarantee, default and exit legs, active guarantee count, and per-agency figures derived from the guarantee accounts. |
| Claims timeline | Each claim with its on-chain timestamps for filed, paid and settled, and the Pix settlement hash. |
| Money flows | Guarantee fees in (net to the reserve, take to the treasury), issuer income in and the untracked income-inbox balance, claim payments out, deposits and redemptions. |
| Capital queue | Pending deposits and redemptions in first-in, first-out order. |
| Balances | On-chain balance, tracked total and unbooked amount for each reserve token account. |
| Disclosures | BRS is issued by Nora, and its freeze authority is a single Nora key. Pilot capital is MUTAV's own. Features built later. |
| Accounts | A link to every account on a Solana explorer. |

A **Refresh** button sends the permissionless `refresh` instruction from any connected wallet.

The app also shows an **operator-activity feed**: registrations, closes, claim filings and claim payments in the last 24 hours. It helps anyone spot unusual operator activity early. Whether it sits on `/reserve` or `/admin` is set in the app.

### Public wording

When stable assets fall below coverage required, the public label is "reserve below target; MUTAV backstop active". The coverage ratio is an operational metric of the reserve. It is not a statement about MUTAV's solvency. How the fiança instrument words this is under review with counsel (spec §12, Q39).

## What is not on-chain

Some things stay off-chain by design. Knowing them tells you what the on-chain data proves and what it does not.

| Off-chain | Why | On-chain trace |
|---|---|---|
| Personal data of tenants and landlords | Privacy. The program holds no personal data. | None |
| Lease documents and the signed fiança instrument | Privacy and size. | Hashes on the guarantee account |
| Pricing and tenant assessment | Business decisions made in the MUTAV platform. | The registered cover |
| Whether a claim is valid | Decided by MUTAV as operator from the agency's evidence. | The filed claim and its provision |
| The contractual payment deadline | Tracked by the MUTAV platform. The program records timestamps, not deadlines. | Filed, paid and settled timestamps |
| The Pix payment to the agency | It happens in the Brazilian payment system. | A hash of the Pix end-to-end ID |
| BRL held by MUTAV in its bank | Counts toward nothing until it arrives on-chain as BRS. | None until booked |
| BRS backing | BRS is issued by Nora. The trust in the issuer is disclosed, not removed. | The mint and its authorities |

## Sources

- [Specification §1 Principles](../spec.md#1-principles), [§3 Accounts](../spec.md#3-accounts), [§5.8 Public](../spec.md#58-public), [§9 Events](../spec.md#9-events)
- [Pilot app spec, `/reserve`](../../app/docs/spec.md#reserve-public-transparency)
- [Client README](../../clients/js/README.md)
- Program code: [`programs/mutav/src/events.rs`](../../programs/mutav/src/events.rs), [`programs/mutav/src/state/`](../../programs/mutav/src/state/), [`programs/mutav/src/instructions/public/refresh.rs`](../../programs/mutav/src/instructions/public/refresh.rs)
- Squads v4: <https://github.com/Squads-Protocol/v4>
- Solana explorer: <https://explorer.solana.com/?cluster=devnet>

## Decisions

- [ADR 0004: NAV computed on-chain with internal accounting](../decisions/0004-onchain-nav-internal-accounting.md)
- [ADR 0009: Separate MUTAV money flows](../decisions/0009-separate-mutav-money-flows.md)
- [ADR 0012: Guarantees aligned with a limited fiança onerosa](../decisions/0012-fianca-aligned-guarantee-lifecycle.md)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- [ADR 0019: v1 layout for the devnet release](../decisions/0019-v1-layout-for-the-devnet-release.md) (agency-cap removal)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md) (operator-activity feed)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md) (claim statuses on one account, payout SLA removal)
- [ADR 0024: Unsolicited money and backstop contributions](../decisions/0024-unsolicited-money-and-backstop.md)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md) (fee receipts as an income-receipt kind)
