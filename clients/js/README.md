# @mutav-finance/mutav-protocol-solana

TypeScript client for the MUTAV reserve program on Solana, for `@solana/kit` 8.

It **composes** instructions and **reads** accounts. It holds no keys and never signs: the caller signs (mutav-app's KMS-backed operator actions, admins' wallets through Squads proposals, investors' wallets). CI fails on any secret-key or signing API in `src/` (`scripts/check-no-keys.sh`).

## Contents

| Module | What |
|---|---|
| `generated/` | Codama output from the Anchor IDL: instruction builders, account decoders, events, errors, PDAs with IDL seeds. Do not edit; run `bun run generate:client` at the repo root after `anchor build`. |
| `pdas.ts` | `findReserveAddresses(reserveMint)` (config, state, vault authority, share mint, the four token accounts, event authority), the PDAs the IDL cannot describe: `findDepositRequestPda`, `findRedeemRequestPda` (seeded by queue `seq`), `findAgencyExposurePda`, and `findIncomeInboxAddress` (the vault authority's associated token account for BRS, where Nora pays issuer income; ADR 0017; the token program is required, pass `config.reserveTokenProgram`). |
| `config.ts` | The settlement floor (ADR 0018): `minSettlementBps(config)` reads the floor from the stored complement `caps.maxAllocatedBps`, and `capsInputFromConfig(caps, overrides)` builds the `CapsInput` that `initialize` / `set_config` take (`minSettlementBps`), carrying every other cap over. |
| `math.ts` | Mirror of the program's `math.rs` and `solvency.rs` (spec §4) in `bigint`: `mulDiv`, `sharesFor`, `assetsFor`, `conversionNav`, `earmarkEff`, `freeCapital`, `liquidBudget`, `netAssets`, `navPerShare`, `computeSolvency`; the take split of `contribute_fees` / `sweep_income` (`takeSplit`), `isValidIncomePeriod` and `MAX_INCOME_TAKE_BPS`. Same rounding; throws `MathOverflowError` where the program fails with `MathOverflow`. |
| `preview.ts` | `solvencyFromAccounts`, `previewDepositFulfil`, `previewRedeemFulfil` (whole fills, as the pilot program). |
| `reads.ts` | `fetchReserve`, `fetchGuaranteesForReserve`, `fetchPayoutsForGuarantee`, `fetchClaimFilingsForGuarantee`, `getRedeemQueuePosition`, `getDepositQueuePosition`, `fetchIncomeInbox` (the untracked inbox balance, never in NAV; mint and token program from the reserve's `VaultConfig`) and `fetchIncomeReceiptsForReserve` (one per swept statement). |

Partial fills at the queue head (ADR 0010) are not built in the pilot program, so their sizing is not mirrored yet.

## Parity with the program

`tests/tests/client_vectors.rs` (Rust) computes math, solvency, PDA, allowlist and instruction-encoding vectors from the program crate into `tests/fixtures/client/vectors.json` and fails if the committed file is stale. `test/*.test.ts` (Bun) checks this package against the same file.

```sh
bun test                       # in clients/js
# after a deliberate program change:
MUTAV_WRITE_VECTORS=1 RUST_TEST_THREADS=4 cargo test -p mutav-tests --test client_vectors
```

## Example

```ts
import { createSolanaRpc, address } from '@solana/kit';
import { fetchReserve, previewDepositFulfil } from '@mutav-finance/mutav-protocol-solana';

const rpc = createSolanaRpc('https://api.devnet.solana.com');
const r = await fetchReserve(rpc, address('BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4'));
console.log(r.solvency.freeCapital, r.state.data.navPerShare);
const [fill] = previewDepositFulfil(r.config.data, r.state.data, [1_000_000_000n]);
```

## Publishing (not automated; needs approval)

The package is publish-ready: `bun run build` writes `dist/` (an ESM bundle with `@solana/kit` external, plus `.d.ts`), and `prepack` runs it.

```sh
cd clients/js
npm pack --dry-run                                          # inspect the tarball
# GitHub Packages (needs a token with write:packages for mutav-finance):
npm publish --registry https://npm.pkg.github.com
# or npm:
npm publish --access public
```

Bump `version` first: a minor version for appended instructions, accounts, events or errors, or fields carved from `_reserved` (spec §14.4).
