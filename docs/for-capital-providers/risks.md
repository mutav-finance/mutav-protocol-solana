# Risks

Reserve shares absorb claim payments and receive net guarantee fees and issuer income. Their value can fall as well as rise. This page lists what can lower the share value or delay an exit, and how the design bounds each risk.

The program is new, upgradeable and unaudited. An independent security audit comes before the devnet deploy. Nothing here is legal, tax or investment advice, an offer of securities, or a promise of any return.

## Summary

| Risk | What it does to a holder | How the design bounds it |
|---|---|---|
| Claims | Lowers NAV when a claim is filed | Cover caps per guarantee, claim caps per call and per sliding 30 days, admin approval above the per-call cap, coverage gate on new guarantees and exits |
| BRS issuer freeze | Frozen balances count as 0; fills stop | Five separate token accounts; fail-closed accounting; bank-first claim payments |
| BRS de-peg or redemption halt | BRL value of the reserve falls; the program cannot see it | BRS-only reserve disclosed; issuer trust disclosed; one asset to watch |
| Issuer income changes or ends | Less inflow to the reserve | Shown as a separate line; never counted in coverage |
| Reserve below target or underwater | Exits stop; deposits refused at zero net assets | Stress buffer; MUTAV backstop booked without minting shares |
| Exit delays | BRS returned later than requested | FIFO, cancel and claim always open, full exit below the minimum, refunds |
| Operator key misuse | Value leaves through claim payments | Loss bounded by the admin-set claim caps; every other operator action is reversible |
| Admin or upgrade error | Rules or parameters change | Two multisigs with time locks; parameter bounds in the program; append-only layout |
| Unsolicited money | None on NAV until booked | Skim to a separate account; admin returns or books it |

## Claims

Claims are the reserve's purpose, so they are the main source of loss for holders.

- **Losses are booked early.** `file_claim` books a provision at once, and NAV falls by that amount. Nobody enters or leaves at a NAV that misses a filed claim.
- **Each claim is one event.** A default claim is one month's rent; an exit claim is one payment at the end of the occupation. The sum on a guarantee can never exceed its cover.
- **Cover is capped per guarantee.** The devnet cap is R$40,000 per lease. Covers never change after registration.
- **Claim payments are capped.** Within R$10,000 per call and R$20,000 per sliding 30-day window (devnet), `pay_claim` always goes through. The window slides, so no 30-day span goes above the cap.
- **Large claims need the admin.** Above the per-call cap, the reserve admin must call `approve_claim` with the exact amount. Approved payments still count toward the 30-day cap. If one would not fit, the admin raises the cap in the same time-locked proposal and lowers it after.
- **Exact payment.** `pay_claim` pays exactly the filed provision, so a payment never releases more than it pays. Settling for less means amending the claim down first (`amend_claim`).
- **Mistakes can be undone.** `withdraw_claim` releases a wrongful filing's provision, and NAV goes back up.

### The coverage gate

```text
coverage_required = max( ceil(c × remaining_cover_total),
                         provisions + min(stress_buffer, unprovisioned_cover) )
```

- `c` is 0.10 on devnet, the program floor. The reserve holds a share of total cover, not all of it.
- The stress buffer (R$19,000 on devnet) covers the claims that could be filed next. The admin sizes it from the book, for example the three largest rents plus one exit payment, and resizes it with `set_config`.
- Filed claims are always held in full.

New guarantees and redemption fills must fit in the free capital above `coverage_required`. Claim payments are never stopped by this gate: the gate protects the reserve from capital leaving, not from the claims it exists to pay. Below target, new guarantees and redemptions stop until capital comes in or guarantees run off.

### When claims exceed the reserve

Claim payments continue below target and can draw liquid BRS down. Landlords are owed by MUTAV as fiador, not by the reserve alone, so MUTAV's own balance sheet carries what the reserve cannot. For holders:

- if net assets reach 0 with shares outstanding, deposit fills are refused (`ReserveUnderwater`), so new money never pays for old losses;
- MUTAV recapitalises by sending BRS that the admin books as a `BACKSTOP`. No shares are minted, so it raises NAV for every holder.

On public pages this state reads "reserve below target; MUTAV backstop active". The backstop amount is TBD and is disclosed when set.

## The BRS issuer

The reserve holds BRS only. Every real in it depends on one issuer, Nora.

### Freeze

The BRS freeze authority can freeze any BRS token account, the reserve's included. Today that authority is a single issuer key.

| Design response | Effect |
|---|---|
| Five separate token accounts (`reserve`, `pending_deposits`, `pending_redemptions`, `claims`, `unsolicited`) | One freeze does not trap every balance. |
| A frozen `reserve` counts as 0 BRS | `refresh`, `register_guarantee` and `clear_fulfil_halt` read it as empty and fail closed. `refresh` emits `ReserveFrozenDetected`. |
| Fills and new guarantees refuse with `ReserveFrozen` | No capital moves at a value that cannot be paid. |
| `skim` refuses frozen accounts | Untracked money is not moved while frozen. |
| Bank-first claim payments | A freeze also blocks `pay_claim`. MUTAV then pays the agency by Pix from its own bank and the reserve reimburses MUTAV later. |

Before the reserve caps rise above the pilot's, MUTAV asks Nora to move the BRS freeze authority and its program upgrade authority to a multisig. Mainnet freeze rules are still to be confirmed with the issuer.

### De-peg and redemption

The program values BRS at par: 1 BRS = R$1. It reads no market price. If BRS lost its peg, or BRS could not be redeemed for BRL, the BRL value of the reserve would fall and NAV would not show it. Redemption of BRS into BRL runs off-chain through the issuer, and on-chain BRS liquidity is thin.

This trust in the issuer is disclosed rather than hidden. More reserve assets can be added later through capped adapters, each with its own cap and price bounds; none is live in the pilot, and the settlement floor stays at 100% BRS.

### Issuer income

The income from the issuer partnership is set by a commercial agreement, off-chain. It can change or end. It is shown apart from guarantee fees and never counts in the coverage math, so losing it changes inflows, not the gate.

## Exit delays

An exit is a queued request, filled only from surplus. Holders should expect waits when:

- free capital or liquid BRS is short of the head request (the pilot fills whole requests, so a large head can stall the queue);
- the reserve is below target, paused, frozen or halted by the NAV-move guard;
- the admin multisig has not yet filled the queue.

What stays open in every case: `cancel_deposit`, `cancel_redeem`, `claim_shares`, `claim_assets` and the admin's `refund_deposit`. A holder removed from the allowlist can still request an exit, and a full exit is allowed below `min_request`. See [Deposits and redemptions](deposits-and-redemptions.md#exit-rights).

## Operational risks

### The operator key

The operator registers guarantees, books fees and income, and files and pays claims. The operator and the reserve admin are separate parties and may be separate companies.

- **Bounded loss.** The most a misused operator key can move out of the reserve is the admin-set claim caps, paid only to MUTAV's whitelisted payments account. It cannot fill queues, mint shares, change caps or send BRS anywhere else.
- **Reversible actions.** Every other operator action can be undone by another operator action: a registration by a void close, a close by `reinstate_guarantee` (within `max_reinstate_age`), a filing by `withdraw_claim`.
- **Recovery.** The pauser revokes the operator at once and pauses if needed. The admin appoints a new operator in two steps (`propose_roles`, then `accept_role` by the new key). The new operator reconciles the platform's records with on-chain events and corrects them with ordinary operator actions. The admin signs no redemption fill until reconciliation is done.
- **Fill prices.** Every fill carries the `nav_bounds` the admin's proposal fixed, so a NAV change between proposal and execution cannot reach a holder's fill.
- **Early detection.** The app shows an operator-activity feed: registrations, closes, filings and payments in the last 24 hours.

### Admin and upgrades

| Control | Rule |
|---|---|
| Reserve admin | Squads v4 multisig. Devnet: 2-of-2 with two stand-in wallets; real keys before real money. |
| Upgrade authority | A second Squads multisig with the same members and a longer time lock. |
| Time locks | Devnet: admin 5 minutes, upgrade 1 hour. Real pilot: admin 24 hours, upgrade 7 days. Every admin action waits for the time lock, the admin's own `pause` included. The pauser and guardians pause without delay. |
| Role changes | Two-step: the new key must accept. The admin itself rotates through `propose_admin` / `accept_admin`. Pending keys expire, and `revoke_operator` clears them. |
| Parameter bounds | The program refuses out-of-range values, for example `c` below 0.10, a fee take above 30% or a claim window above 90 days. |
| Pause | Pauser, up to 3 guardians or the admin can pause. Only the admin unpauses. A pause never blocks claims, cancels or claims of shares and BRS. |
| Layout | From the devnet deploy, account layouts are frozen. Changes are carves from reserved bytes or new accounts. |

An upgrade can change any rule on these pages, including those that protect holders. The time lock gives notice, not a guarantee. The exit fallback is designed so the upgrade time lock is at least as long as the maximum queue wait.

### Smart-contract risk

Bugs could lock or misdirect money. The design limits the damage with caps, a separate pauser, internal accounting, checked math, invariant tests after every instruction and verified builds. A simplification pass and an independent security audit come before the devnet deploy.

## Known limitations and planned work

None of these is a feature of the devnet release.

| Item | Status |
|---|---|
| Partial fills at the queue head | First upgrade after the hackathon. Fields exist; no migration. |
| Exit fallback (anyone fills the head after a maximum wait) | Adopted. Field reserved with value 0 (off); built before outside capital. |
| Claim-notice gate (holds fills while a missed-rent notice is open) | Built before outside capital. Until then, MUTAV files a claim before any fill. |
| Cumulative baseline for the NAV-move guard, and a real-pilot bound | First upgrade after the hackathon, carved from reserved bytes. |
| Price protection on requests (`min_assets_out`) | Deferred; needs an ADR. |
| Share transferability | Transfer-restricted shares before mainnet. Devnet uses classic SPL shares. |
| Take on issuer income | 0 until a commercial decision (spec §12 Q47). |
| Backstop amount | TBD; disclosed when set. |

## Planned protections before outside capital

The pilot runs on MUTAV's own capital. Before any outside capital provider joins, MUTAV:

1. builds the claim-notice gate;
2. builds the exit fallback;
3. sets transfer-restricted shares before mainnet `initialize`;
4. replaces the devnet stand-in signers with real keys and the real-pilot time locks;
5. lowers `max_nav_move_bps` to a real bound.

## Sources

- [Spec §1, principles](../spec.md#1-principles)
- [Spec §4, invariants and formulas](../spec.md#4-invariants-and-formulas)
- [Spec §6, under-coverage mode](../spec.md#6-under-coverage-mode)
- [Spec §8, caps](../spec.md#8-caps)
- [Spec §12, open questions](../spec.md#12-open-questions)
- [Litepaper §13, risks, limits and disclosures](../litepaper.md#13-risks-limits-and-disclosures)
- Program: [`programs/mutav/src/solvency.rs`](../../programs/mutav/src/solvency.rs), [`programs/mutav/src/token_guard.rs`](../../programs/mutav/src/token_guard.rs), [`programs/mutav/src/instructions/operator/pay_claim.rs`](../../programs/mutav/src/instructions/operator/pay_claim.rs), [`programs/mutav/src/instructions/public/refresh.rs`](../../programs/mutav/src/instructions/public/refresh.rs)
- [Squads v4](https://github.com/Squads-Protocol/v4)
- [BRS token, Nora](https://www.nora.finance/docs/integrate/core-concepts/brs-token)
- Pre-devnet decisions log (2026-10-09 and 2026-10-10): operator/admin separation, recovery, claims, coverage, exit rights, governance, devnet values

## Decisions

- [ADR 0004: on-chain NAV with internal accounting](../decisions/0004-onchain-nav-internal-accounting.md)
- [ADR 0005: solvency gate scope](../decisions/0005-solvency-gate-scope.md)
- [ADR 0008: one capital flow; pause scope](../decisions/0008-uniform-capital-flow-and-pause-scope.md)
- [ADR 0010: partial fills at the queue head](../decisions/0010-partial-fills-at-queue-head.md)
- [ADR 0015: admin clear for the NAV-move halt](../decisions/0015-admin-clear-fulfil-halt.md)
- [ADR 0016: coverage ratio below one](../decisions/0016-coverage-ratio-below-one.md)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- Pending ADR: Operator/admin separation and operator-compromise recovery
- Pending ADR: Claims: approval, amendment, exact payment, sliding window
- Pending ADR: Coverage: stress buffer and underwater reserve (amends 0016)
- Pending ADR: Exit rights (open exit, full exit below minimum, refunds)
- Pending ADR: Unsolicited money and backstop contributions
- Pending ADR: Exit fallback
- Pending ADR: 0019 v1 layout for the devnet release
