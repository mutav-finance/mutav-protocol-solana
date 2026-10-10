# Share value

The program computes the value of a reserve share on-chain. No admin pushes a price. Anyone can call `refresh` and get the same number from public accounts.

## The formula

All amounts are BRS base units (6 decimals, 1 BRS = R$1). BRS is valued at par.

```text
stable_assets = brs_balance                       // tracked BRS in the reserve; 0 if the reserve is frozen
net_assets    = max(0, stable_assets − provisions)
published_nav = 0                                                    if shares_outstanding = 0
              = max(1, floor(net_assets × 10^9 / shares_outstanding)) otherwise
```

- `brs_balance` is the BRS the program itself moved into `reserve`. It is not the token account's raw balance.
- `provisions` is the sum of every filed, unpaid claim. A claim lowers NAV as soon as it is filed, not when it is paid.
- `shares_outstanding` counts minted shares plus shares owed on filled deposits not yet claimed. Shares escrowed in a pending redemption stay in it until a fill burns them.
- NAV per share is published with 9 decimals of precision (`NAV_SCALE = 10^9`). One share is worth 1 BRS at launch.

What NAV does not include:

| Excluded | Why |
|---|---|
| BRS in `pending_deposits` | Not yet the reserve's money; the depositor can cancel. |
| BRS in `claims` | Already owed to exiting holders. |
| MUTAV's fee take | Goes straight to the treasury account, never to the reserve. |
| BRS in the income inbox | Untracked until `sweep_income` books an issuer statement. |
| BRS in the `unsolicited` account | Untracked until the admin books it. |
| Any token sent straight to a reserve account | The program counts only what it moved. |
| MUTAV's backstop commitment | It counts only once MUTAV sends BRS and the admin books it. |

## Converting between BRS and shares

Every fill uses the live NAV at the moment of the fill, with a virtual offset `V = 1`:

```text
shares_for(assets) = floor(assets × (shares_outstanding + 1) / (net_assets + 1))   // deposit
assets_for(shares) = floor(shares × (net_assets + 1) / (shares_outstanding + 1))   // redemption
```

The rate each fill used is recorded on the request (`nav_at_fulfil`, `last_fill_nav`) and in its event, so every fill's price is public.

### Rounding is in the reserve's favour

Every product uses `u128` checked math. Overflow is an error, never a wrap.

| Amount | Rounded | Effect |
|---|---|---|
| Shares minted on a deposit | Down | The depositor never gets a fraction of a share more than it paid for. |
| BRS paid on a redemption | Down | The reserve never pays a fraction more than the shares are worth. |
| `coverage_required` | Up | The reserve never asks for less backing than the cover needs. |
| NAV added by each inflow, for the guard | Up | A fall in NAV is never understated. |

So a fill never lowers the NAV per share of the holders who stay. Any rounding remainder stays in the reserve.

## What moves the share value

| Event | Instruction | Effect on NAV per share |
|---|---|---|
| Net guarantee fees booked | `contribute_fees` (operator) | Up. No shares minted. |
| Issuer partnership income booked | `sweep_income` (operator) | Up. No shares minted. |
| Unsolicited money booked | Admin booking, kind `UNSOLICITED` | Up. No shares minted. |
| MUTAV backstop booked | Admin booking, kind `BACKSTOP` | Up. No shares minted. |
| Claim filed | `file_claim` (operator) | Down by the provision, at once. |
| Claim amended | `amend_claim` (operator) | Down if raised, up if lowered. |
| Claim withdrawn | `withdraw_claim` (operator) | Up by the released provision. |
| Claim paid | `pay_claim` (operator) | No change. The payment equals the provision exactly, so assets and provisions fall by the same amount. |
| Reserve token account frozen | `refresh` | Down. A frozen reserve counts as 0 BRS. |
| Deposit or redemption filled | `fulfil_deposits`, `fulfil_redeems` | No change, apart from rounding in the reserve's favour. |

### Guards on inflows

- **No inflow while no shares exist.** `contribute_fees`, `sweep_income` and admin bookings are refused while `shares_outstanding == 0`. Money waits in the inbox or the `unsolicited` account until the first deposit is filled. This keeps the first depositor's shares priced correctly.
- **Every deposit fill mints more than 0 shares.**
- **No deposit into a reserve with nothing left.** When net assets are 0 and shares are outstanding, deposit fills are refused with `ReserveUnderwater`, so new money never pays for old losses. Recovery is a MUTAV backstop, booked by the admin, which mints no shares and so raises NAV for every holder.

## Income from the BRS issuer partnership

BRS itself pays no yield. Nora, the BRS issuer, pays its partners a monthly revenue share in BRS under a commercial agreement. MUTAV routes that income into the reserve.

1. Nora pays into the reserve's income inbox: the vault authority's associated token account for BRS. Nothing there counts toward NAV.
2. Each month the operator calls `sweep_income(income_ref_hash, period, amount)` for the amount on Nora's statement. An `IncomeReceipt` makes each statement count once.
3. The net amount moves into `reserve` and raises NAV for every holder. MUTAV's take on this income (`income_take_bps`) is 0, and the program's cap on it is 0 until a commercial decision.

What a holder should know about this income:

- Its rate is set off-chain by the agreement. It is not on-chain and not promised.
- It depends on one contract with one issuer, which can change its rate or end.
- Public pages show it as "issuer partnership revenue", a separate line from guarantee fees. It never enters the coverage math.
- It is booked apart from guarantee fees and never counts in `fees_in_total`.

## Why donations cannot move the share value

The program keeps internal accounting. It tracks the amounts it moved itself (`brs_balance` and the escrow totals), never raw token balances. A direct transfer of BRS into `reserve`, `pending_deposits` or `claims` leaves `brs_balance` unchanged, so NAV does not move.

The extra BRS does not stay mixed with the reserve:

1. Anyone can call `skim(account)`. It moves the untracked surplus (balance minus the tracked total) into a separate `unsolicited` account. It books nothing and moves no tracked money. A monitor runs it.
2. The reserve admin decides what to do with it, through the time-locked multisig:
   - return it to the source of the original transfer, if the sender is identified and asks within 30 days;
   - otherwise book it into the reserve as an inflow (kind `UNSOLICITED`), which raises NAV for every holder and mints no shares;
   - book dust below R$10 directly.
3. Foreign tokens sent to the reserve (classic SPL only) and SOL above the rent-exempt minimum are returned with `return_foreign`. They never count and are never listed in the app.

So unsolicited money can reach NAV only through a public, time-locked admin booking, and then for every holder pro rata.

## The NAV-move guard

Fills convert at the live NAV. A sharp, unexplained move in NAV should stop fills until someone looks at it. The guard does that.

```text
inflow_nav += ceil(net × 10^9 / shares_outstanding)        // at each fee, income or booking inflow
guard_nav   = max(1, published_nav − inflow_nav)           // NAV net of verified inflows
halt if |guard_nav − baseline| × 10,000 > max_nav_move_bps × baseline
```

- The guard measures NAV net of verified inflows, per share. Fees and income booked by the program never trip it. Other moves, such as a claim filing or a freeze, do.
- It runs in `refresh` and inline in both `fulfil_deposits` and `fulfil_redeems`, so a fill right after a shock is refused.
- A trip sets `fulfil_halted`. The halt is sticky. Only the admin's time-locked `clear_fulfil_halt` clears it and resets the baseline to the current published NAV. `clear_fulfil_halt` refuses while a reserve account is frozen.
- On devnet `max_nav_move_bps` is 10,000 (100%), on purpose: a claim against a small demo reserve is a real NAV move and would halt fills. The guard is proven in tests and is lowered for the real pilot.

The guard works together with `nav_bounds`: the admin's fill proposal fixes a NAV range, and a fill outside it is refused (see [Deposits and redemptions](deposits-and-redemptions.md#nav-bounds-on-every-fill)).

## Checking it yourself

- The public `/reserve` page shows stable assets, provisions, NAV, tracked against actual balances per account, and every booked inflow, with no wallet needed.
- The TypeScript client (`@mutav-finance/mutav-protocol-solana`) has an exact `bigint` mirror of the program's math (`sharesFor`, `assetsFor`, `navPerShare`, `netAssets` and the guard), kept in parity by shared test vectors.
- `refresh` is permissionless. Its `StateRefreshed` event carries the recomputed figures.

## Sources

- [Spec §4, invariants and formulas](../spec.md#4-invariants-and-formulas)
- [Spec §7, price safety and the NAV-move guard](../spec.md#7-price-safety)
- [Spec §2.1, money flows and issuer income](../spec.md#21-three-separate-mutav-money-flows-adr-0009-and-issuer-income-adr-0017)
- [Litepaper §8, reserve, solvency and NAV](../litepaper.md#8-reserve-solvency-and-nav) and [§10, reserve assets](../litepaper.md#10-reserve-assets-and-brl-on-solana)
- Program: [`programs/mutav/src/math.rs`](../../programs/mutav/src/math.rs), [`programs/mutav/src/pricing.rs`](../../programs/mutav/src/pricing.rs), [`programs/mutav/src/solvency.rs`](../../programs/mutav/src/solvency.rs), [`programs/mutav/src/instructions/operator/sweep_income.rs`](../../programs/mutav/src/instructions/operator/sweep_income.rs), [`programs/mutav/src/instructions/public/refresh.rs`](../../programs/mutav/src/instructions/public/refresh.rs)
- Client: [`clients/js`](../../clients/js)
- Pre-devnet decisions log (2026-10-09 and 2026-10-10): inflows gated on supply, inline guard, `nav_bounds`, exact claim payment, unsolicited money, underwater reserve

## Decisions

- [ADR 0004: on-chain NAV with internal accounting](../decisions/0004-onchain-nav-internal-accounting.md)
- [ADR 0009: separate MUTAV money flows](../decisions/0009-separate-mutav-money-flows.md)
- [ADR 0015: admin clear for the NAV-move halt](../decisions/0015-admin-clear-fulfil-halt.md)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- Pending ADR: Operator/admin separation and operator-compromise recovery (inflows refused while no shares exist)
- Pending ADR: Claims: approval, amendment, exact payment, sliding window
- Pending ADR: Coverage: stress buffer and underwater reserve (amends 0016)
- Pending ADR: Unsolicited money and backstop contributions
