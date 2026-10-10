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
| Mainnet mint | Set at deploy. Its authorities are to be confirmed with the issuer (TBD, spec §12 Q34) |

The reserve mint is fixed in `VaultConfig` at `initialize` and never changes.

**Mint guard.** `initialize` refuses a Token-2022 reserve mint with any of these extensions: permanent delegate, transfer hook, transfer fee or fee authority, non-transferable, default-frozen, scaled UI amount, interest-bearing or pausable. Each would let the mint move, block or rescale reserve balances outside the program's accounting.

**Why one asset.** Every claim is paid in BRS, and every guarantee fee arrives in BRS. Holding only BRS means no price feed to trust and no mark-to-market: NAV moves only through fees, swept income, admin bookings, provisions and claim payments. The accepted cost is concentration on one issuer: a freeze, de-peg or redemption halt of BRS reaches the whole reserve. The reserve splits its money across separate token accounts, a frozen `reserve` counts as 0 in every solvency check, and MUTAV pays claims from its own bank account while the reserve cannot. Before the reserve caps rise above the pilot's, MUTAV will ask the issuer to move the BRS freeze authority to a multisig.

## Settlement floor

`min_settlement_bps` is the minimum share of stable assets held in the settlement token (liquid BRS, the token fees come in and claims go out in). All adapters together may use only the share above it.

| Field | Devnet and pilot value | Stored as |
|---|---|---|
| `min_settlement_bps` | `10_000` (100%): BRS only, nothing can be allocated | `caps.max_allocated_bps = 10_000 − min_settlement_bps = 0`, so a zeroed field means "nothing allocated" |

## More assets later, through adapters

The layout keeps room for other reserve assets, such as tokenized Brazilian treasury bonds. TESOURO is the first candidate, pending a direct path between BRS and TESOURO. No adapter ships in this release: `whitelist_adapter`, `remove_adapter`, `allocate` and `deallocate` are not in the binary.

Adding an asset takes five steps:

1. **Upgrade** the program with the adapter instructions and deploy the asset's adapter program, after its own review.
2. **Whitelist the adapter** with its limits: an absolute `cap` (BRS-equivalent), a share limit (`AdapterEntry.max_share_bps`) and its own price feed in an `AdapterState` PDA at `["adapter_state", config, program_id]`.
3. **Lower `min_settlement_bps`** below 100% with `set_config`.
4. **Allocate** within every gate: the settlement floor after the move, the adapter's cap and share limit, the solvency gate, and liquid BRS left ≥ provisions.
5. **Refresh** (anyone) re-values the reserve at each adapter's bounded price.

Each adapter acts through its own capped sub-authority. The vault authority and the share mint authority are never passed into an adapter CPI.

## Guarantee fees

The tenant pays the guarantee fee with the rent. Each agency pays MUTAV one bill a month. The operator books each invoice with `contribute_fees`.

```text
take = floor(amount × fee_take_bps / 10_000)   → MUTAV treasury account
net  = amount − take                           → reserve (NAV rises, no shares minted)
```

| Rule | Detail |
|---|---|
| Signer | Operator, who also signs the BRS transfer from its own account |
| Once per invoice | A `FeeReceipt` at `["fee", config, invoice_ref_hash]` must not exist yet |
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
- Its only exits are `reserve` (through `sweep_income`), the treasury (the income take, 0 in this release) and the `unsolicited` account (through the admin's `classify_unsolicited`).
- Income is never returned to a sender. Returns leave only from the `unsolicited` account.
- `reserve` stays a PDA, not the associated token account, so a send to the vault authority's address lands in the inbox and never in the live reserve.

### `sweep_income`

Each month the operator sweeps the amount on the issuer's statement.

```text
sweep_income(income_ref_hash, period, amount)
take = floor(amount × income_take_bps / 10_000)   // 0 in this release
net  = amount − take                              → reserve
```

| Rule | Detail |
|---|---|
| Signer | Operator. The vault authority signs the transfers |
| Statement | `income_ref_hash` commits to the statement; `period` is a `YYYYMM` month; `amount` is the statement's amount |
| Source | The inbox must be the vault authority's associated token account for BRS. `amount ≤` inbox balance |
| Freeze | Refused if the inbox or `reserve` is frozen |
| Once per statement | An `IncomeReceipt` at `["income", config, income_ref_hash]` must not exist yet. Several statements in one month each have their own reference |
| Post-CPI check | `reserve` rose by exactly `net` and the inbox fell by exactly `amount` |
| Pause and solvency | Never paused, never solvency-gated, no mode check |
| No shares yet | Refused while `shares_outstanding == 0`. The income waits in the inbox |
| Record | `IncomeReceipt` with kind `NORA_STATEMENT`; event `IncomeSwept { income_ref_hash, period, gross, take, net, inbox_after }` |

Anything in the inbox that is not on a statement stays there, untracked, until the admin classifies it as unsolicited.

### Income take is 0

`income_take_bps` is MUTAV's take from issuer income, separate from the guarantee-fee take. It is **0**: all issuer income builds the reserve. The program cap `MAX_INCOME_TAKE_BPS` is also 0, so `set_config` refuses any non-zero take until an upgrade sets a cap (TBD, spec §12 Q47).

### How income is shown

Issuer income is labelled "issuer partnership revenue". It is a separate line from guarantee fees, never enters `fees_in_total`, and never counts in the coverage math. It depends on one agreement with one issuer, which can change its rate or end.

## Capital deposits

Allowlisted capital providers, including MUTAV's own capital wallet, deposit BRS through a FIFO queue. The admin fills requests at the on-chain NAV. In the pilot the reserve runs on MUTAV's own capital and is not open to public investment. Deposit fills are refused while the reserve is underwater ([Coverage model](coverage-model.md#underwater)).

## Booking paths compared

| Inflow | Instruction | Signer | Mints shares | Record | Counts in `inflow_nav` |
|---|---|---|---|---|---|
| Guarantee fee (net) | `contribute_fees` | Operator | No | `FeeReceipt` | Yes |
| Issuer income (net) | `sweep_income` | Operator | No | `IncomeReceipt` kind `NORA_STATEMENT` | Yes |
| Capital deposit | `fulfil_deposits` | Reserve admin | Yes, at NAV | `DepositRequest` | No (priced at NAV) |
| Unsolicited money | `book_unsolicited` | Reserve admin | No | `IncomeReceipt` kind `UNSOLICITED` | Yes |
| MUTAV backstop | Backstop booking | Reserve admin | No | `IncomeReceipt` kind `BACKSTOP` | Yes |

## Sources

- [Specification §2.1 Money flows](../spec.md#21-three-separate-mutav-money-flows-adr-0009-and-issuer-income-adr-0017), [§3.3 Vault authority and token accounts](../spec.md#33-vault-authority-and-token-accounts), [§5.3 Guarantee fees](../spec.md#53-guarantee-fees-operator), [§5.3a Issuer income](../spec.md#53a-issuer-income-operator), [§5.7 Reserve allocation](../spec.md#57-reserve-allocation-admin-through-adapters), [§12 Open questions](../spec.md#12-open-questions)
- Devnet release design decisions of 2026-10-10: fee take 2,000, inflows refused while no shares exist, receipt kinds (MUTAV internal decision log)
- Program: [`programs/mutav/src/instructions/operator/contribute_fees.rs`](../../programs/mutav/src/instructions/operator/contribute_fees.rs), [`programs/mutav/src/instructions/operator/sweep_income.rs`](../../programs/mutav/src/instructions/operator/sweep_income.rs), [`programs/mutav/src/token_guard.rs`](../../programs/mutav/src/token_guard.rs), [`programs/mutav/src/state/income.rs`](../../programs/mutav/src/state/income.rs)
- [SPL Token program](https://spl.solana.com/token), [Token-2022 extensions](https://spl.solana.com/token-2022/extensions)

## Decisions

- [ADR 0002: Core program and capped adapters](../decisions/0002-core-program-and-capped-adapters.md)
- [ADR 0007: Fee take direct to treasury](../decisions/0007-fee-take-direct-to-treasury.md)
- [ADR 0009: Separate MUTAV money flows](../decisions/0009-separate-mutav-money-flows.md)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- Pending ADR: Unsolicited money and backstop contributions (receipt kinds, `classify_unsolicited`)
- Pending ADR: Operator/admin separation and operator-compromise recovery (fees and income refused while no shares exist)
