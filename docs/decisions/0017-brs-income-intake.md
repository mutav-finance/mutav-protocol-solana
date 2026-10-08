# 0017 — BRS income intake: an income inbox and `sweep_income`

- **Status:** Proposed (2026-10-07), pending founder confirmation (Julia, Draau). Building it before the devnet layout freeze was approved by Julia. Follows the design review *BRS Yield Intake* (2026-10-06, `.claude/notes/worlds-fair-research/brs-yield-intake.html` in the workspace). Amends ADR 0015 (one more effect of `clear_fulfil_halt`) and adds to the mint guard of spec §5.1 (PC-19).

## Context

Nora pays partners a monthly revenue share in BRS, under a commercial agreement, to an address the partner chooses (confirmed by MUTAV, 2026-10-06). BRS itself bears no yield, and the program counts only BRS it moved itself (`brs_balance`, spec §1 principle 2, invariant 4). A plain transfer from Nora into `reserve` would therefore never reach NAV, and there is no instruction that takes it in.

The review compared three shapes: recognizing untracked BRS already in the reserve (Uniswap `sync`, Yearn `process_report`), a push in which the payer signs a transfer and the accounting in one instruction (Kamino `topup_rewards`, Ethena `transferInRewards`), and a hybrid with five sources. Untracked BRS is not always yield: it can be a mistaken transfer, a donation, a Nora clawback or a returned claim payment, and booking a returned payment as income would leave the guarantee's paid amount and remaining cover wrong. Because MUTAV chooses where Nora pays, the program can be the payee, and nothing has to be told apart.

The review also found a bug that exists without any yield: the NAV-move guard (spec §7) measures the move gross, so any guarantee-fee batch or income payment above `max_nav_move_bps` sets `fulfil_halted` (the `TODO(adr 0013: inflow-adjusted NAV guard)` in `pricing.rs`; ADR 0013 was never written, and this ADR takes the fix over).

## Decision

1. **The income inbox.** `initialize` creates the vault authority's associated token account for `reserve_mint` (under `reserve_token_program`) with an idempotent create, so it succeeds even if a third party created it first. MUTAV gives this address to Nora. The inbox holds nothing tracked: no instruction counts it toward `stable_assets`, NAV or coverage, and its only exits are `reserve` and, with a non-zero take, `treasury_account`. `reserve` stays a PDA (`["reserve", config]`), not the associated token account, so a send to the vault authority's "wallet" lands in the inbox, outside NAV, never in the live reserve.
2. **`sweep_income(income_ref_hash, period, amount)`**, operator. Each month the operator sweeps the amount on Nora's statement:
   - **Checks, in order:** `amount > 0` and `period` a well-formed `YYYYMM` month (`InvalidParameter`); the inbox's mint is `reserve_mint` (`InvalidMint`); the inbox is the derived associated token account, so a look-alike token account owned by the vault authority fails (`InvalidIncomeSource`); `amount ≤ inbox.amount` (`IncomeExceedsInbox`); neither the inbox nor `reserve` is frozen (`ReserveFrozen`); the `IncomeReceipt` at `["income", config, income_ref_hash]` must not exist, so each statement counts once; `treasury_account` is the configured one (`InvalidTreasuryAccount`); after the transfers `reserve` rose by exactly `net` and the inbox fell by exactly `amount` (`PostCpiCheckFailed`).
   - **Effects:** `take = floor(amount × income_take_bps / 10_000)`, `net = amount − take`; the vault authority transfers `take` to the treasury and `net` to `reserve`; `brs_balance += net`, `income_total += net`, `income_take_total += take`, `inflows_since_refresh += net`; an `IncomeReceipt { income_ref_hash, period, gross, take, net, slot }`; the event `IncomeSwept { income_ref_hash, period, gross, take, net, inbox_after }`. NAV rises at once; no share is minted.
   - **Never paused, never solvency-gated, no mode check, not gated by claim notices**, like `contribute_fees`: money coming in is always accepted. It reads neither the TESOURO price nor `buffer_earmark`.
   - Anything in the inbox that is not on a statement (dust, a mistaken send) stays there, untracked. `IncomeSwept.inbox_after` reports what is left after each sweep.
3. **MUTAV's take on issuer income.** `income_take_bps: u16` is carved into `VaultConfig`, set only through the timelocked `set_config` and reported by `ConfigUpdated` (field id 17). It is separate from `fee_take_bps`: the guarantee-fee take and the income take are different commitments. Pilot value `0`: all income builds the reserve. The program cap `MAX_INCOME_TAKE_BPS` has no decided value (spec §12 Q47), so it is `0` and fails closed: `set_config` refuses any non-zero take until an upgrade sets the cap.
4. **NAV-move guard net of inflows.** `inflows_since_refresh: u64` is carved into `VaultState`. `contribute_fees` and `sweep_income` add their net to it. `refresh` measures the move on `published_nav(net_assets − inflows_since_refresh, shares_outstanding)` against the last published NAV, still publishes the full NAV, and resets the counter to 0. `clear_fulfil_halt` resets it too, because its new baseline already includes every inflow so far (amends ADR 0015's "nothing else changes"). Price and accounting shocks still trip the guard, and so does a loss hidden in the same window as an inflow.
5. **Mint guard.** `initialize` also rejects a Token-2022 reserve mint with `ScaledUiAmount`, `InterestBearingConfig` or `Pausable`. Yield delivered as a balance multiplier never changes the raw `u64` balances the program tracks, so it would never reach NAV and would break valuation at par; a pausable mint could stop every reserve transfer, claim payments included. Today's BRS is classic SPL Token and passes.
6. **Layout.** All new fields are carved from padding before the devnet layout freeze: `VaultConfig.income_take_bps` (2 bytes) and `VaultState.income_total`, `income_take_total`, `inflows_since_refresh` (24 bytes). Pinned sizes are unchanged. `IncomeReceipt` is a new account of 142 bytes with a 64-byte `_reserved`. The seed prefix `"income"` is used by the pilot.
7. **Event and error codes.** `IncomeSwept` is a new event. `InvalidIncomeSource` and `IncomeExceedsInbox` are appended to the error list.

### Decided here (proposed, pending founder confirmation)

- **Y1, payment address:** Nora pays the program's income inbox, and the operator sweeps each statement. Fallback, only if Nora cannot allowlist a PDA owner for minting: a MUTAV income wallet that forwards (Q2 for Nora).
- **Y2, before the freeze:** the four changes of the review (guard net of inflows, mint guard, the inbox and income fields, `reserve` kept a PDA) are in this binary.
- **Y3, splitting the yield:** the Nora ↔ MUTAV split is commercial and invisible to the program. MUTAV's split between the reserve and its treasury is `income_take_bps`, `0` in the pilot. Phase 2 sets it in the service agreement with the vehicle, under the program cap and the time lock.
- **Y4, when to ship:** built now, before the devnet layout freeze (approved by Julia).
- **Statement format:** `period` is a `u32` `YYYYMM`; the program checks only that it is a well-formed month. One receipt per statement reference, so several statements in one period (for example a correction) are each counted once.
- **The treasury account is always passed and address-checked**, also when the take is 0. That is stricter than the review's "read only when the take is non-zero", and it keeps the account list fixed.
- **`refresh` does not read the inbox.** The review's test list says "refresh reports what's left in the inbox". The inbox is a plain token account that any reader sees directly (the client and the transparency page read it), and `IncomeSwept.inbox_after` records what stays after each sweep. Adding it to `refresh` would change that instruction's accounts for a figure that never enters NAV.

### Left open

- **The cap `MAX_INCOME_TAKE_BPS`** (spec §12 Q47). `0` until decided.
- **Tax treatment** of income routed into the reserve (booked as MUTAV revenue, then contributed): counsel.
- **Admin recovery of untracked BRS** (`recognize_untracked(ref_hash, kind, amount)`, Squads, timelocked, bounded by `reserve.amount − brs_balance`, never for returned payouts): the first upgrade, not this binary.
- **Phase-2 timing guard** against a deposit just before a monthly NAV jump and a redemption just after: `min_hold_secs ≥` the income period, fulfilment after recognition, optional vesting. Not needed while MUTAV is the only depositor.
- **The open questions for Nora** in the review (§08): the written agreement and its term, PDA allowlisting, the basis of the yield, the rate and withholding, minted or transferred, a reference per payment, cut-off and clawback, statements or an on-chain record, sBRS, and the legal basis before PL 4.308.

## Alternatives considered

- **Recognize untracked BRS in `reserve` (option A).** Needs judgment about where the BRS came from, and a returned claim payment booked as income corrupts the guarantee book. Kept for later as an admin-only, timelocked recovery path, never the monthly intake.
- **Nora pays a MUTAV wallet and the operator forwards with `contribute_fees`-style signing.** It mixes fees, yield and gas in one hot wallet and makes the forward unauditable. Rejected: with the inbox, no MUTAV wallet sits in the yield path, and Nora → inbox → reserve can be checked transfer by transfer.
- **Make `reserve` the associated token account.** A mistaken send to the vault authority's wallet address would land in the live reserve, untracked but mixed with it. Rejected; the associated token account becomes the inbox.
- **A five-source `recognize_income` (the review's draft).** Covers deliveries Nora does not make (the escrows, an external account) at the cost of a cap, a window and a fill gate. Rejected: Nora pays one address we choose.
- **Keep the guard gross and let the admin clear every fee-driven halt.** Every large fee batch or monthly payment would stop both queues behind a timelocked admin action. Rejected.

## Consequences

- NAV and `stable_assets` rise only on the sweep, never on Nora's raw transfer, and the sweep raises free capital for the solvency gate like any tracked BRS.
- A compromised operator key can only move inbox BRS into the reserve, which at worst books a stray donation as income. The admin cannot withdraw from the inbox either. Principle 5 holds: the inbox is not reserve money, and its only exits are `reserve` and, with a take, the whitelisted treasury.
- The income depends on one contract with one issuer, which can change its rate or end. Public copy labels it "issuer partnership revenue", shows it as a separate line from guarantee fees, and never counts it in the base yield or the coverage math.
- IDL change: `initialize` gains the inbox and the associated token account program, `set_config` gains `income_take_bps`, and there is a new instruction, account, event and two errors. The Codama client is regenerated; the app's operator console and the devnet scripts compose the new accounts.
- The client math mirror is unchanged: NAV's inputs are the same tracked balances.
