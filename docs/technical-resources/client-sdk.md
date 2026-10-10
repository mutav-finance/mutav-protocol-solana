# Client SDK

`@mutav-finance/mutav-protocol-solana` is the TypeScript client for the `mutav` program. It lives in [`clients/js`](../../clients/js/), is licensed Apache-2.0, ships as ESM and is built on `@solana/kit`.

It **composes** instructions and **reads** accounts. It holds no keys and never signs. The caller signs: a capital provider's wallet, an operator key in the MUTAV platform, or the admins' wallets through a Squads proposal.

## Guarantees the package makes

| Property | How it is enforced |
|---|---|
| No signing code | A CI script ([`scripts/check-no-keys.sh`](../../scripts/check-no-keys.sh)) fails on secret-key or signing APIs in the source. It also runs on the app and scripts, with an allowlist. |
| Generated code matches the program | The Codama client is regenerated from the Anchor IDL in the same PR as any IDL change. CI fails on a diff. |
| Math matches the program | Shared test vectors computed by the program crate (`tests/fixtures/client/vectors.json`) are checked by both the Rust tests and the client's Bun tests. They cover the math, solvency, PDAs, allowlist proofs and the encoding of every instruction. |
| Compatible upgrades | Appended instructions, accounts, events or errors, and fields carved from padding, ship as a minor version. Existing instructions and events never change shape. |

## Install

```sh
bun add @mutav-finance/mutav-protocol-solana @solana/kit
```

`@solana/kit` is a peer dependency. Node 20 or later. Publishing is manual and needs approval; see the [client README](../../clients/js/README.md#publishing-not-automated-needs-approval).

## Modules

| Module | Contents |
|---|---|
| `generated/` | Codama output from the Anchor IDL: one builder per instruction (`get<Name>Instruction` and `get<Name>InstructionAsync`), account decoders and fetchers, events, errors, `MUTAV_PROGRAM_ADDRESS` and the PDAs the IDL can describe. Do not edit. |
| `pdas` | `findReserveAddresses(reserveMint)`, `findDepositRequestPda`, `findRedeemRequestPda` (seeded by queue `seq`), `findIncomeInboxAddress` (the token program is required). |
| `reads` | `fetchReserve`, guarantee, claim-filing and income-receipt scans, queue positions, the income inbox balance. |
| `math` | Exact `bigint` mirror of the program's math and solvency code. |
| `preview` | Previews of fills and of `refresh`, applying the program's checks in program order. |
| `allowlist` | Domain-separated Merkle leaves and nodes, `buildAllowlist`, `verifyAllowlistProof`. |
| `config` | Helpers for sparse `set_config` proposals: a list of `ConfigParam` values for the fields being changed. |

## PDAs

```ts
import { address } from '@solana/kit';
import {
  findReserveAddresses,
  findDepositRequestPda,
  findRedeemRequestPda,
  findIncomeInboxAddress,
} from '@mutav-finance/mutav-protocol-solana';

const reserveMint = address('BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4');
const a = await findReserveAddresses(reserveMint);
// a.config, a.state, a.vaultAuthority, a.shareMint, a.reserve,
// a.pendingDeposits, a.pendingRedemptions, a.claims, a.eventAuthority

const [deposit] = await findDepositRequestPda({ config: a.config, seq: 0n });
const [redeem] = await findRedeemRequestPda({ config: a.config, seq: 0n });

const inbox = await findIncomeInboxAddress({
  vaultAuthority: a.vaultAuthority,
  reserveMint,
  tokenProgram: address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), // config.reserveTokenProgram
});
```

The record PDAs (`Guarantee`, `ClaimFiling`, `IncomeReceipt` under its `"income"` and `"fee"` seed prefixes) and the `unsolicited` token account come from the generated `pdas` module. Every function takes an optional `{ programAddress }` to target another deployment, for example a local validator.

## Reads

| Function | Returns |
|---|---|
| `fetchReserve(rpc, reserveMint)` | `{ addresses, config, state, solvency }`. Config and state are read in one `getMultipleAccounts` call, so they come from the same slot. `solvency` is the program's solvency snapshot computed client-side. |
| `fetchGuaranteesForReserve(rpc, config)` | Every `Guarantee` of the reserve. Each account is kept only if it is the PDA of `(config, id)`. |
| `fetchClaimFilingsForGuarantee(rpc, guarantee)` | Every `ClaimFiling` of a guarantee, with its status (`FILED`, `PAID`, `WITHDRAWN`, `SETTLED`), approval, payment and settlement fields. |
| `getDepositQueuePosition(rpc, config, seq)`, `getRedeemQueuePosition(rpc, config, seq)` | A request's place in its FIFO queue. |
| `fetchIncomeInbox(rpc, …)` | The income inbox balance. Untracked: it never counts toward NAV. |
| `fetchIncomeReceiptsForReserve(rpc, config)` | One receipt per booked inflow, with its `kind` (`NORA_STATEMENT`, `FEE`, `UNSOLICITED`, `BACKSTOP`). |

Scans use `getProgramAccounts` with a discriminator filter, so they need an RPC that serves it. Per-agency figures are derived from the `agency_id` of guarantee accounts; the program keeps no per-agency account.

```ts
import { createSolanaRpc, address } from '@solana/kit';
import { fetchReserve, previewDepositFulfil } from '@mutav-finance/mutav-protocol-solana';

const rpc = createSolanaRpc('https://api.devnet.solana.com');
const r = await fetchReserve(rpc, address('BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4'));
console.log(r.solvency.freeCapital, r.state.data.navPerShare);
const [fill] = previewDepositFulfil(r.config.data, r.state.data, [1_000_000_000n]);
```

## Math mirror

Same formulas, same rounding, same failure points as the program. Functions throw `MathOverflowError` where the program fails with `MathOverflow`. See [Math reference](math-reference.md) for every formula.

| Function | Mirrors |
|---|---|
| `mulDiv(a, b, d, 'down' \| 'up')` | The program's `mul_div` in `u128`. |
| `sharesFor`, `assetsFor`, `conversionNav` | Share pricing of deposit and redemption fills. |
| `stableAssets`, `coverageRequired`, `surplus`, `freeCapital`, `liquidBudget`, `netAssets` | Solvency quantities, including the stress-buffer term of `coverage_required`. |
| Claim-window mirror | The sum of the 31 daily buckets and the check of a payment against `max_claim_per_period`. |
| `navPerShare`, `publishedNav` | Published NAV, floored at 1 when shares exist. |
| NAV-guard mirror | `guard_nav` and the halt test, net of `inflow_nav`. |
| `computeSolvency` | Everything above from one snapshot. |
| `takeSplit(amount, takeBps)` | Guarantee-fee take split. |
| `isValidIncomePeriod` | Income intake checks. |

Constants such as `NAV_SCALE`, `VIRTUAL_OFFSET`, `BPS_DENOMINATOR`, `MIN_COVERAGE_RATIO_BPS` and the mode values are exported too.

## Previews

Previews answer "would this go through, and at what price?" before anyone signs. They apply the program's checks in the program's order. Every UI labels them as previews.

| Function | What it checks |
|---|---|
| `previewDepositFulfil(config, state, assets[])` | Pause, halt, NAV guard, batch size, reserve-size cap, underwater refusal, zero-share fills, then the price of each fill. |
| `previewRedeemFulfil(config, state, requests, { count, maxAssets })` | Pause (required input), mode, halt, NAV guard, budget per fill (`min(max_assets − paid, free_capital, liquid_budget)`), whole fills only, then the price of each fill. Explains a stuck head as needed versus available. |
| `previewRefresh(config, state, …)` | The result of `refresh`, honouring a frozen reserve. |
| `solvencyFromAccounts(config, state)` | The solvency snapshot from decoded accounts. |

## Composing instructions

The generated builders return an unsigned instruction. The `Async` variants resolve default PDAs (state, escrow accounts, event authority) from the seeds in the IDL. Pass a `TransactionSigner` from the wallet for the signer account; the client never creates one from secret material.

```ts
import {
  MUTAV_PROGRAM_ADDRESS,
  findDepositRequestPda,
  getRequestDepositInstructionAsync,
} from '@mutav-finance/mutav-protocol-solana';

// r = await fetchReserve(...), wallet = the connected wallet's TransactionSigner,
// ownerBrsAccount = the owner's BRS token account, proof = the owner's allowlist proof.
const seq = r.state.data.nextDepositSeq;
const [depositRequest] = await findDepositRequestPda({ config: r.addresses.config, seq });

const ix = await getRequestDepositInstructionAsync({
  owner: wallet,
  config: r.addresses.config,
  depositRequest,
  source: ownerBrsAccount,
  reserveMint: r.config.data.reserveMint,
  eventAuthority: r.addresses.eventAuthority,
  program: MUTAV_PROGRAM_ADDRESS,
  assets: 1_000_000_000n, // R$1,000
  proof,
});
// Build a transaction message with ix and hand it to the wallet to sign and send.
```

Account and argument names follow the generated builder. Read them from its input type.

### Request sequence races

Deposit and redeem request PDAs are seeded by the global queue `seq`. If two requests are sent at the same time, one fails because the account is already in use. The client re-reads `next_deposit_seq` or `next_redeem_seq` and retries with the next seq.

### Admin instructions

Admin instructions are signed by the admin multisig's vault, so they are wrapped in a Squads v4 vault-transaction proposal. Members create, approve and execute it from the admin console or the Squads app, after the time lock.

- `set_config`: pass only the `ConfigParam` values being changed, at most 16 and no duplicates. The program validates the whole resulting config. The admin console lists the edited fields in the proposal memo.
- `set_payments_account`, `set_treasury_account`, `set_allowlist_root`, the role handover and the guardian appointment are separate instructions, never part of `set_config`.
- `fulfil_deposits` and `fulfil_redeems`: compose `nav_bounds` from the NAV the signers see when the proposal is created.
- `approve_claim` when the payment would not fit in the sliding 31-day window: bundle a `set_config` raise of `max_claim_per_period` in the same proposal, and lower it later.
- `return_unsolicited`: choose the `Source` (`Unsolicited`, `PendingRedemptionsSurplus`, `Foreign`, `Lamports`) and commit the original transfer's signature in `ref_hash`.

### Allowlist proofs

```ts
import { buildAllowlist, verifyAllowlistProof } from '@mutav-finance/mutav-protocol-solana';

const { root, proofs } = await buildAllowlist(owners); // root for set_allowlist_root, proofs per owner
const proof = proofs.get(owner)!;                      // the `proof` argument of request_deposit / request_redeem
const ok = await verifyAllowlistProof(root, owner, proof);
```

Leaves and nodes are domain-separated and match the program's `allowlist::verify`. Proofs are at most 32 levels deep. The admin publishes the root with `set_allowlist_root`; the app serves each owner's proof.

## Versioning

| Change in the program | Client release |
|---|---|
| New instruction, account, event or error (appended) | Minor version |
| Field carved from `_reserved` | Minor version; existing offsets unchanged |
| Changed arguments or accounts of an existing instruction | Not allowed. A `_v2` instruction is added instead. |
| Changed event fields | Not allowed. A new event is added instead. |

An `idl-compat` CI job diffs the IDL against the last release and fails on any change that is not allowed. Indexers should decode accounts by discriminator and skip unknown event discriminators.

## Running the client tests

```sh
cd clients/js && bun test
```

After a deliberate program change, the vectors are regenerated from the program crate; see the [client README](../../clients/js/README.md#parity-with-the-program).

## Sources

- [Client README](../../clients/js/README.md)
- Client source: [`clients/js/src/`](../../clients/js/src/) (`pdas.ts`, `reads.ts`, `math.ts`, `preview.ts`, `allowlist.ts`, `config.ts`)
- Client tests: [`clients/js/test/`](../../clients/js/test/)
- Codama generation: [`scripts/generate-client.ts`](../../scripts/generate-client.ts); IDL compatibility: [`scripts/idl-compat.ts`](../../scripts/idl-compat.ts)
- [Specification §14.4 Client and IDL compatibility](../spec.md#144-client-and-idl-compatibility)
- [`@solana/kit`](https://github.com/anza-xyz/kit)
- [Codama](https://github.com/codama-idl/codama)
- [Squads v4 documentation](https://docs.squads.so/)

## Decisions

- [ADR 0002: Core program and capped adapters](../decisions/0002-core-program-and-capped-adapters.md)
- [ADR 0004: On-chain NAV with internal accounting](../decisions/0004-onchain-nav-internal-accounting.md)
- [ADR 0011: Phase-2 instant exit and upgrade readiness](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md) (client and IDL compatibility)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md) (income inbox derivation)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- ADR 0019: v1 layout for the devnet release (per-agency, payout and holder accounts removed)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md) (claim statuses, 31-day window)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md) (amends 0016)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md) (`nav_bounds` composed by the admin console, sequence retry)
- [ADR 0024: Unsolicited money and backstop contributions](../decisions/0024-unsolicited-money-and-backstop.md) (receipt kinds, `Source`)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md) (sparse `set_config`)
