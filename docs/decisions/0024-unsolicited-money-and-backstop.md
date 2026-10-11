# 0024 — Unsolicited money and backstop contributions

- **Status:** Accepted (2026-10-10), decided by the founders. Amends ADR 0017 (the income inbox gets a second exit, and `IncomeReceipt` gains a kind) and settles its open item "admin recovery of untracked BRS". Uses ADR 0020's role split. The layout carves are in ADR 0019.

## Context

The program counts only BRS it moved itself (spec §1 principle 2). Anyone can still send tokens to the reserve's accounts: a mistaken transfer, a donation, a returned payment, a token of another mint, or MUTAV's own backstop. The founders set these rules for that money:

- **No stuck money.** Every token that reaches a program account has a way out: into the reserve, or back to where it came from.
- **Unsolicited money is the reserve admin's responsibility.** The operator handles only Nora's statements.
- **Untracked balances do not sit next to tracked ones.** Mixing them makes the reserve's accounts harder to read and to audit.
- **Nora's income is never returned.** Only money that arrived unsolicited can leave to its source.
- **Returns are screened** before money leaves.

## Decision

### 1. A separate account for unsolicited money

- A new token account PDA, **`unsolicited`** (seed `"unsolicited"`, mint `reserve_mint`), owned by the vault authority and created at `initialize`. It is separate from the income inbox.
- Nothing in it is tracked. It never counts toward stable assets, NAV or coverage.

### 2. `skim` (permissionless)

- `skim(account)` moves the untracked surplus of `reserve`, `pending_deposits` or `claims` (the balance minus the tracked total) into `unsolicited`.
- It refuses frozen accounts and emits `UnsolicitedSkimmed`.
- A monitor runs it, so untracked BRS leaves the live accounts soon after it arrives.

### 3. Admin instructions (Squads)

- **`classify_unsolicited(amount)`** moves BRS from the income inbox to `unsolicited`, once the operator has swept every Nora statement for the period.
- **`book_unsolicited(amount, ref_hash, kind)`** moves BRS from `unsolicited` into `reserve` as an inflow. `kind` is `UNSOLICITED` or `BACKSTOP`; any other kind is refused. It writes an `IncomeReceipt` of that kind. The booked amount counts as an inflow for the NAV-move guard (ADR 0017 decision 4). Refused while the share supply is 0 (ADR 0023). MUTAV's backstop is booked this way, with no shares minted (ADR 0022).
- **`return_unsolicited(source, amount, destination, ref_hash)`** with an explicit `Source` enum:

| `Source` | What leaves | From |
|---|---|---|
| `Unsolicited` | BRS | the `unsolicited` PDA |
| `PendingRedemptionsSurplus` | shares | the surplus of `pending_redemptions` above escrowed requests |
| `Foreign` | tokens of any classic SPL Token mint other than the BRS, share or adapter mints | a token account owned by the vault authority |
| `Lamports` | SOL above the rent-exempt minimum | an account owned by the program or the vault authority |

- A return **never** leaves from the income inbox or from `reserve`. It goes **only to the source of the original transfer**: `ref_hash` commits to that transaction's signature, and `/admin` checks the source when it composes the proposal. A `Foreign` return checks that the mint is owned by the classic SPL Token program, never Token-2022. A `Lamports` return never takes an account below its rent-exempt minimum.
- Surplus shares in `pending_redemptions` may instead be **burned** by the admin when they are not returned. Burning raises NAV per share for every holder, like a booking.
- None of these instructions is pause-gated.

### 4. Runbook

- **Return window:** if the sender is identified and asks within **30 days**, the admin returns the money after screening. Otherwise it is booked.
- **Dust:** balances below **R$10** are booked directly. The threshold lives off-chain, in the runbook and the app; there is no on-chain field.
- **Screening:** every source is screened before a return or a booking.
- The operator keeps only `sweep_income` for Nora's statements, without a kind.

### 5. Income receipt kinds

`IncomeReceipt` gains `kind`:

| Kind | Written by |
|---|---|
| `ISSUER_STATEMENT` (0) | `sweep_income` |
| `FEE` (1) | `contribute_fees` (it replaces `FeeReceipt`, ADR 0026) |
| `UNSOLICITED` (2) | `book_unsolicited` |
| `BACKSTOP` (3) | `book_unsolicited` |

Fee receipts keep their own seed prefix (`"fee"`), so an invoice reference and a statement reference can never collide.

## Alternatives considered

- **Recognize untracked BRS directly in `reserve`** (ADR 0017 option A). The money would stay mixed with tracked BRS until someone decides what it is. Rejected for skimming into a separate account first.
- **Leave unsolicited money where it lands.** Breaks the no-stuck-money rule and leaves balances no one is responsible for. Rejected.
- **Let the operator classify and book.** The operator handles contracts, not the reserve's balance sheet (ADR 0020). Rejected.
- **Separate instructions for each return kind** (`return_foreign`, a share return). Three instructions with the same shape. Rejected for one instruction with a `Source` enum (ADR 0026).
- **Return from the inbox.** It could send Nora's income away. Rejected; the inbox's only exits are `reserve` and, through `classify_unsolicited`, `unsolicited`.

## Consequences

- **Positive.** Every token that reaches the program has a defined exit. Tracked and untracked balances live apart. Backstop contributions are visible as their own kind.
- **Negative.** The admin has a recurring task (classify, book or return), and the 30-day window and screening are manual.
- **Neutral.** The program cannot prove the source of a transfer. The source check is in `/admin` and the runbook.
- **Program changes.** New PDA `unsolicited` and its seed; new instructions `skim`, `classify_unsolicited`, `book_unsolicited`, `return_unsolicited`; new event `UnsolicitedSkimmed` and events for each admin action; `IncomeReceipt.kind`. No on-chain dust field.
- **Spec.** §3.3, §3.14, §5.1, §5.3, §5.3a, §5.8, §8, §9.
- **App.** `/reserve` shows on-chain, tracked and unbooked balances per account. `/admin` lists unsolicited balances as a to-do. Foreign tokens are never listed in the public app.

## References

- Spec §1, §3.3, §3.14, §5.3a.
- ADRs 0017, 0019, 0020, 0022, 0023, 0026.
- OWASP Smart Contract Top 10 (2026 edition).
