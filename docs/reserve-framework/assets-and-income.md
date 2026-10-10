# Assets and income

In this release the reserve holds one asset: BRS, a BRL token on Solana issued by Nora. Money enters the reserve through four booking paths: guarantee fees, issuer income, capital deposits and admin bookings of unsolicited or backstop money. Each has its own instruction and its own record.

## The reserve asset: BRS only

| Property | Value |
|---|---|
| Asset | BRS, issued by Nora. Valued at par: 1 BRS = R$1 |
| Devnet mint | `BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4` (Nora's devnet BRS) |
| Token program | Classic SPL Token |
| Decimals | 6. `initialize` refuses a reserve mint with any other number of decimals |
| Mint and freeze authority | Held by the issuer. A single issuer key can freeze any BRS account |
| Mainnet mint | Set at deploy. Its authorities are to be confirmed with the issuer (spec §12 Q34, see [Open questions](../meta/open-questions.md#open-questions)) |

The reserve mint is fixed in `VaultConfig` at `initialize` and never changes.

**Mint guard.** `initialize` refuses a Token-2022 reserve mint with any of these extensions: permanent delegate, transfer hook, transfer fee or fee authority, non-transferable, default-frozen, scaled UI amount, interest-bearing or pausable. Each would let the mint move, block or rescale reserve balances outside the program's accounting.

**Why one asset.** Every claim is paid in BRS, and every guarantee fee arrives in BRS. Holding only BRS means no price feed to trust and no mark-to-market: NAV moves only through fees, swept income, admin bookings, provisions and claim payments. The accepted cost is concentration on one issuer: a freeze, de-peg or redemption halt of BRS reaches the whole reserve. The reserve splits its money across separate token accounts, a frozen `reserve` counts as 0 in every solvency check, and MUTAV pays claims from its own bank account while the reserve cannot. Before the reserve caps rise above the pilot's, MUTAV will ask the issuer to move the BRS freeze authority to a multisig.

## Settlement floor

`min_settlement_bps` is the minimum share of stable assets held in the settlement token (liquid BRS, the token fees come in and claims go out in). All adapters together may use only the share above it ([ADR 0018](../decisions/0018-brs-only-pilot-reserve.md)).

In the devnet release and the pilot the floor is **100%**: the reserve is BRS only. v1 stores no floor field and no adapter slots. The binary has no allocation instruction, and `VaultConfig` carries only `adapter_count` and `adapter_bitmap`, both 0 ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)). The floor returns as a stored value with the first adapter upgrade.

## More assets later, through adapters

The layout keeps room for other reserve assets, such as tokenized Brazilian treasury bonds. TESOURO, from Etherfuse, is the first candidate, pending a BRS route in and out of it. No adapter ships in this release: `whitelist_adapter`, `remove_adapter`, `allocate` and `deallocate` are not in the binary. The rules for a second asset are proposed in [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md); the points marked decided below are settled, the rest is a proposal. The TESOURO cap stays 0 until the open items with Etherfuse are closed (lead time, price account, authorities, the redeeming party, a BRS route; see [Open questions](../meta/open-questions.md#open-questions)).

| Topic | Rule (ADR 0027) |
|---|---|
| Adapter record | One `AdapterState` PDA per adapter at `["adapter_state", config, program_id]`, holding the pinned adapter program and its last upgrade slot, the asset mint, the limits, the price source, the position and any in-transit entry. A new adapter starts at cap 0 |
| Valuation | MUTAV values each position itself: tracked units times a bounded price. The adapter moves tokens and never reports a value. After every adapter CPI the program reloads the vault token accounts and requires the exact expected deltas |
| Every adapter at every gate | `refresh` and every instruction that computes stable assets must pass the `AdapterState` of every adapter in the bitmap. A frozen or unreadable asset counts as 0 without blocking the others |
| BRS liquidity floor | `brs_floor = max(ceil(min_settlement_bps × stable_assets / 10_000), obligations_floor)`. The recommended obligations floor is `provisions + max_claim_per_period × max(1, ceil(exit_lead_time_secs / 31 days))` |
| Where the floor applies | `allocate` refuses a move that leaves BRS below the floor. **Decided:** `fulfil_redeems` refuses a fill that would take BRS below the floor while any adapter holds value. `pay_claim` never reads the floor |
| Limits per adapter | `target_bps` with a band, an absolute `cap` and `max_share_bps`. Moves go toward the target only; no permissionless instruction moves BRS into an adapter |
| Who moves assets | **Decided:** the reserve admin, through the time-locked Squads multisig, executes `allocate` and `deallocate`. No allocator role is added. Asynchronous moves are booked in transit at a haircut, capped by `max_in_transit` |
| Slippage | A caller `min_out` plus a program bound `max_slippage_bps` from the bounded price |
| TESOURO price | Etherfuse's `BondPrice` in BRL as primary, inside a rate band and an accrual corridor, with its own staleness limit and admin floor and cap. A second feed is a cross-check only. Without a fresh price, deposits and allocations fail closed, the gates use the last price with a haircut that grows with age, and `pay_claim` never reads a price |
| Risk-adding changes | Raising limits, adding an adapter or changing a price source wait for a program-enforced delay of at least `max_queue_wait_secs` (once non-zero), on top of the admin time lock. Risk-reducing changes are fast |
| Emergency path | **Decided:** guardians, the pauser and the admin may at once call `disable_adapter`, `impair_adapter` (the haircut can only rise), `pause` and `emergency_deallocate` (impaired adapters only, proceeds pinned to `reserve`, bounded by `min_out` and `max_emergency_discount_bps`). Undoing any of it goes through the admin time lock |

The vault authority and the share mint authority are never passed into an adapter CPI.

## Guarantee fees

The tenant pays the guarantee fee with the rent. Each agency pays MUTAV one bill a month. The operator books each invoice with `contribute_fees`.

```text
take = floor(amount × fee_take_bps / 10_000)   → MUTAV treasury account
net  = amount − take                           → reserve (NAV rises, no shares minted)
```

| Rule | Detail |
|---|---|
| Signer | Operator, who also signs the BRS transfer from its own account |
| Once per invoice | An `IncomeReceipt` with kind `FEE` at `["fee", config, invoice_ref_hash]` must not exist yet. The `"fee"` seed prefix keeps invoice and statement references apart |
| Take | `fee_take_bps` = 2,000 (20%) on devnet; program maximum 3,000 (30%). Goes straight to the treasury; the program holds no fee balance |
| Pause and solvency | Never paused, never solvency-gated. Money coming in is always accepted |
| No shares yet | Refused while `shares_outstanding == 0`. The first deposit must be filled first |
| Event | `FeesContributed { invoice_ref_hash, gross, take, net }` |

Fees never mint shares and never count as MUTAV capital. MUTAV benefits from them only through the shares it bought with its own capital, like every holder.

## Issuer income

The issuer shares part of its revenue with partners under a commercial agreement. MUTAV routes its share into the reserve. BRS itself pays holders nothing. The rate is set off-chain by the agreement, not by the program.

### The income inbox

`initialize` creates the vault authority's associated token account for BRS: the **income inbox**. MUTAV gives this address to the issuer as its payee address.

- The inbox is not reserve money. Nothing in it counts toward NAV, stable assets or coverage until it is swept.
- Its only exits are `reserve` (through `sweep_income`) and the `unsolicited` account (through the admin's `classify_unsolicited`, once every issuer statement for the period is swept).
- Income is never returned to a sender. Returns leave only from the `unsolicited` account.
- `reserve` stays a PDA, not the associated token account, so a send to the vault authority's address lands in the inbox and never in the live reserve.

### `sweep_income`

Each month the operator sweeps the amount on the issuer's statement.

```text
sweep_income(income_ref_hash, period, amount)
amount                                          → reserve (no take)
```

| Rule | Detail |
|---|---|
| Signer | Operator. The vault authority signs the transfers |
| Statement | `income_ref_hash` commits to the statement; `period` is a `YYYYMM` month; `amount` is the statement's amount |
| Source | The inbox must be the vault authority's associated token account for BRS. `amount ≤` inbox balance |
| Freeze | Refused if the inbox or `reserve` is frozen |
| Once per statement | An `IncomeReceipt` at `["income", config, income_ref_hash]` must not exist yet. Several statements in one month each have their own reference |
| Post-CPI check | `reserve` rose by exactly `amount` and the inbox fell by exactly `amount` |
| Pause and solvency | Never paused, never solvency-gated, no mode check |
| No shares yet | Refused while `shares_outstanding == 0`. The income waits in the inbox |
| Record | `IncomeReceipt` with kind `NORA_STATEMENT`; event `IncomeSwept { income_ref_hash, period, amount, inbox_after }` |

Anything in the inbox that is not on a statement stays there, untracked, until the admin classifies it as unsolicited.

### No take on issuer income

MUTAV takes nothing from issuer income: all of it builds the reserve. v1 has no income-take field, and `sweep_income` takes no treasury account ([ADR 0026](../decisions/0026-program-simplification-for-the-freeze.md)). A take, separate from the guarantee-fee take, would return as a carve only after a commercial decision (spec §12 Q47, see [Open questions](../meta/open-questions.md#open-questions)).

### How income is shown

Issuer income is labelled "issuer partnership revenue". It is a separate line from guarantee fees, never enters `fees_in_total`, and never counts in the coverage math. It depends on one agreement with one issuer, which can change its rate or end.

## Capital deposits

Allowlisted capital providers, including MUTAV's own capital wallet, deposit BRS through a FIFO queue. The admin fills requests at the on-chain NAV. In the pilot the reserve runs on MUTAV's own capital and is not open to public investment. Deposit fills are refused while the reserve is underwater ([Coverage model](coverage-model.md#underwater)).

## Booking paths compared

| Inflow | Instruction | Signer | Mints shares | Record | Counts in `inflow_nav` |
|---|---|---|---|---|---|
| Guarantee fee (net) | `contribute_fees` | Operator | No | `IncomeReceipt` kind `FEE` | Yes |
| Issuer income | `sweep_income` | Operator | No | `IncomeReceipt` kind `NORA_STATEMENT` | Yes |
| Capital deposit | `fulfil_deposits` | Reserve admin | Yes, at NAV | `DepositRequest` | No (priced at NAV) |
| Unsolicited money | `book_unsolicited` | Reserve admin | No | `IncomeReceipt` kind `UNSOLICITED` | Yes |
| MUTAV backstop | `book_unsolicited` | Reserve admin | No | `IncomeReceipt` kind `BACKSTOP` | Yes |

Receipt kinds are `NORA_STATEMENT` (0), `FEE` (1), `UNSOLICITED` (2) and `BACKSTOP` (3). Every booking path except a capital deposit is refused while `shares_outstanding == 0`.

## Sources

- [Specification §2.1 Money flows](../spec.md#21-three-separate-mutav-money-flows-adr-0009-and-issuer-income-adr-0017), [§3.3 Vault authority and token accounts](../spec.md#33-vault-authority-and-token-accounts), [§5.3 Guarantee fees](../spec.md#53-guarantee-fees-operator), [§5.3a Issuer income](../spec.md#53a-issuer-income-operator), [§5.7 Reserve allocation](../spec.md#57-reserve-allocation-admin-through-adapters), [§12 Open questions](../spec.md#12-open-questions)
- Program: [`programs/mutav/src/instructions/operator/contribute_fees.rs`](../../programs/mutav/src/instructions/operator/contribute_fees.rs), [`programs/mutav/src/instructions/operator/sweep_income.rs`](../../programs/mutav/src/instructions/operator/sweep_income.rs), [`programs/mutav/src/token_guard.rs`](../../programs/mutav/src/token_guard.rs), [`programs/mutav/src/state/income.rs`](../../programs/mutav/src/state/income.rs)
- [SPL Token program](https://spl.solana.com/token), [Token-2022 extensions](https://spl.solana.com/token-2022/extensions)
- Multi-asset research: `reports/Multi asset vaults on Solana.md` (workspace report cited by ADR 0027)

## Decisions

- [ADR 0002: Core program and capped adapters](../decisions/0002-core-program-and-capped-adapters.md)
- [ADR 0007: Fee take direct to treasury](../decisions/0007-fee-take-direct-to-treasury.md)
- [ADR 0009: Separate MUTAV money flows](../decisions/0009-separate-mutav-money-flows.md)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md) (fees and income refused while no shares exist)
- [ADR 0024: Unsolicited money and backstop contributions](../decisions/0024-unsolicited-money-and-backstop.md) (receipt kinds, `classify_unsolicited`)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md) (no income take, `FeeReceipt` folded into `IncomeReceipt`, adapter slots removed)
- [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) (proposed; decided: admin moves assets, emergency path, floor on `fulfil_redeems`)
