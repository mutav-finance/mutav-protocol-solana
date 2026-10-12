# Components

What lives where in this repo, and why it lives there. The split follows two rules: the program and the client are the audited surface and stay small and keyless, and everything that needs judgment or personal data stays off-chain in the MUTAV platform.

## Repo map

| Path | Component | Cadence |
|---|---|---|
| [`programs/mutav/`](../../programs/mutav/) | The core `mutav` program (Anchor) | Slow. Audit-gated, upgraded only through the upgrade multisig |
| [`programs/mutav-adapter-interface/`](../../programs/mutav-adapter-interface/) | Crate fixing the discriminators and layouts every reserve-asset adapter implements | Slow |
| [`programs/mutav-adapter-mock/`](../../programs/mutav-adapter-mock/) | Mock adapter for tests and devnet experiments. The devnet reserve holds no adapter | Test only |
| [`clients/js/`](../../clients/js/) | TypeScript client, `@mutav-finance/mutav-protocol-solana` | Follows the IDL. Minor version per appended instruction, account, event or error |
| [`app/`](../../app/) | Pilot web app (Next.js 16, Bun) at [reserve.mutav.finance](https://reserve.mutav.finance) | Fast |
| [`scripts/`](../../scripts/) | Devnet deploy, initialize and verification; release tooling; CI checks | Medium |
| [`tests/`](../../tests/) | LiteSVM integration tests, layout fixtures, client vectors | With every change |
| [`tests-fork/`](../../tests-fork/) | Surfpool fork tests against the devnet BRS mint | On demand |
| [`.github/workflows/`](../../.github/workflows/) | `ci.yml`, `fork.yml`, `release.yml` | |

## The program

### Modules

| Module | Responsibility |
|---|---|
| [`lib.rs`](../../programs/mutav/src/lib.rs) | Thin dispatch. Each handler lives under `instructions/`, grouped by the role allowed to call it |
| [`instructions/admin/`](../../programs/mutav/src/instructions/admin/) | `initialize`, configuration, roles and handover, guardians, payments and treasury accounts, allowlist root, pause and unpause, `revoke_operator`, `revoke_pauser`, `clear_fulfil_halt`, `approve_claim`. The unsolicited-money instructions arrive in later upgrades |
| [`instructions/operator/`](../../programs/mutav/src/instructions/operator/) | The guarantee and claim cycle, guarantee fees and issuer income |
| [`instructions/capital/`](../../programs/mutav/src/instructions/capital/) | Deposit and redemption requests, fills, cancels and claims |
| [`instructions/public/`](../../programs/mutav/src/instructions/public/) | Permissionless cranks: `refresh`, `advance_queue_head` |
| [`instructions/reserve/`](../../programs/mutav/src/instructions/reserve/) | Reserved for the adapter instructions of the first adapter upgrade (`allocate`, `deallocate` and the emergency actions, [ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md)). Empty in the devnet release |
| [`state/`](../../programs/mutav/src/state/) | Account structs, one file per account family, each with a compile-time size assertion |
| [`coverage.rs`](../../programs/mutav/src/coverage.rs) | Pure functions for coverage required (with the saturating stress term), surplus, liquid budget, net assets, NAV per share and the underwater check |
| [`math.rs`](../../programs/mutav/src/math.rs) | Fixed-point math in `u128`, checked, rounded in the reserve's favour |
| [`pricing.rs`](../../programs/mutav/src/pricing.rs) | Price safety. BRS is valued at par. A priced asset fails closed until its per-adapter pricing is built |
| [`allowlist.rs`](../../programs/mutav/src/allowlist.rs) | Domain-separated Merkle proofs for allowlisted entry |
| [`token_guard.rs`](../../programs/mutav/src/token_guard.rs) | The mint guard and token-account checks. Every check fails closed |
| [`constants.rs`](../../programs/mutav/src/constants.rs) | PDA seeds, program constants, pinned account sizes and the `ConfigUpdated` field ids. Append-only |
| [`events.rs`](../../programs/mutav/src/events.rs) | Events emitted with `emit_cpi!`. Every event carries `config` and `ts` |
| [`errors.rs`](../../programs/mutav/src/errors.rs) | Custom errors from 6000 in enum order. Append-only from the first devnet deploy |

### Instructions by role

The devnet release adds instructions to the existing set and removes a few that the decisions replaced. New instructions follow the same role grouping. Rows marked *later* are decided but not in this binary.

| Group | Signer | Instructions |
|---|---|---|
| Admin and roles | Upgrade authority (`initialize` only), admin multisig | `initialize`, `set_config` (sparse params), `set_payments_account`, `set_treasury_account`, `set_allowlist_root`, `propose_role` (admin) with `accept_role` (the new key), `propose_admin` (admin) with `accept_admin` (the new admin), `cancel_pending(role)`, `set_guardians` (one step), `revoke_pauser`, `clear_fulfil_halt(nav_bounds)`, `unpause`, `approve_claim(notice_ref_hash, amount, expected_revision)` for a claim above the per-call cap |
| Emergency | Pauser, guardians, admin | `pause` (all three), `revoke_operator` (pauser or admin), `revoke_pauser` (admin) |
| Guarantees, fees, income | Operator | `register_guarantee`, `close_guarantee(id, reason)`, `contribute_fees`, `sweep_income`. *Later:* `reinstate_guarantee` |
| Claims | Operator | `file_claim(leg, amount, notice_ref_hash)`, `pay_claim(notice_ref_hash, expected_amount)`, `settle_payout`. The admin's `approve_claim` (above) unlocks a payment above the per-call cap. *Later (Wave 2):* `amend_claim`, `refile_claim` and the claim withdrawal (operator) |
| Capital | Investor, admin | `request_deposit`, `cancel_deposit`, `claim_shares`, `request_redeem`, `cancel_redeem`, `claim_assets` (investor); `fulfil_deposits(count, nav_bounds)`, `fulfil_redeems(count, nav_bounds)`, and `cancel_deposit` or `cancel_redeem` to park a pending request for its owner to collect (admin) |
| Unsolicited money (*later*) | Anyone, admin | `skim` (anyone); `classify_unsolicited`, `book_unsolicited(kind)` for `UNSOLICITED` or `BACKSTOP`, `return_unsolicited(source, ...)` for BRS, surplus escrowed shares, foreign classic SPL tokens or lamports, and the burn of surplus escrowed shares (admin) |
| Public | Anyone | `refresh`, `advance_queue_head(queue, max)` |

See [Roles and trust](roles-and-trust.md) for the full matrix and the pause scope.

### Why the program is shaped this way

- **One program, one reserve per mint.** `VaultConfig` is seeded by the reserve mint, so each currency gets its own reserve, coverage and NAV.
- **Pure math, separate from accounts.** `coverage.rs` and `math.rs` take plain numbers. The client mirrors them exactly in bigint, and shared test vectors keep the two in step.
- **Handlers grouped by signer.** A reviewer reads one folder to see everything one role can do.
- **No adapters in the devnet release.** The reserve holds BRS only, and `adapter_count` and the adapter bitmap are 0. Adapters arrive by program upgrade, each described by its own `AdapterState` account. The adapter moves tokens; MUTAV values the position itself from a bounded price and checks every balance after the CPI ([ADR 0027](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), proposed).

## The TypeScript client

`@mutav-finance/mutav-protocol-solana` lives in [`clients/js/`](../../clients/js/) (MIT, ESM, built on `@solana/kit`). It composes instructions and reads accounts. It never signs and holds no keys.

| Module | Contents |
|---|---|
| `generated/` | Codama output from the Anchor IDL: one builder per instruction, account decoders, event and error types, the program address, IDL-described PDAs |
| `pdas` | `findReserveAddresses(reserveMint)`, request PDAs by sequence, the income inbox address |
| `reads` | `fetchReserve` (config and state in one `getMultipleAccounts` snapshot), guarantee, claim filing and income-receipt scans, queue positions, the income inbox balance |
| `math` | Bigint mirror of the program: share conversion, NAV, coverage required (with the stress buffer), surplus, liquid budget, net assets, the underwater check, the redemption size rule, the claim window, guarantee-fee take split, the published-NAV mirror |
| `preview` | Deposit and redemption fill previews that apply the program's checks in program order, and a refresh preview that honours a frozen reserve |
| `allowlist` | Merkle leaves and nodes, `buildAllowlist`, `verifyAllowlistProof` |
| `config` | Helpers that read the on-chain config and compose sparse `set_config` params for only the fields a proposal changes, and `nav_bounds` for fills |

CI regenerates the client and fails on any diff, runs the math parity tests against vectors exported from the program, and scans the source for signing APIs.

A typical integration reads with `fetchReserve`, previews with the math mirror, builds an instruction with the generated builder, and hands the unsigned transaction to a wallet, or wraps it in a Squads proposal for an admin instruction.

## The pilot web app

[`app/`](../../app/) shows the reserve working on Solana. It is a demo and transparency app. The production surfaces live in `mutav-app`, which ports these screens later.

### Pages

| Route | Audience | Purpose |
|---|---|---|
| `/` | Everyone | The story, who does what, the protocol diagram, a live reserve strip |
| `/reserve` | Everyone, no wallet | Health, coverage, claims timeline, money flows, the capital queue, tracked against actual balances per account, an operator-activity feed, every account on the explorer |
| `/operator` | Operator | One form per operator instruction with its on-chain bound and the gate preview. On devnet MUTAV's team signs by hand with the operator wallet |
| `/investor` | Investors | Allowlist status, position, queue entries, new requests, "redeem all" |
| `/admin` | Admin multisig members | Squads proposal builders: create, approve, execute after the time lock, reject and cancel. Includes `nav_bounds` for fills and role handovers with their expiry. `approve_claim` is in the program; its proposal builder is still to come in the console, and the unsolicited-money to-do list comes with its instructions |
| `/demo` | Judges, team | A guided walkthrough with the coverage-gate preview |
| `/simulator` | Everyone | Static reserve simulator (`public/simulator.html`) |

### API routes

| Route | Purpose |
|---|---|
| `/api/reserve`, `/api/ledger`, `/api/operator`, `/api/investor` | Read routes over the public devnet RPC, with short CDN caching |
| `/api/squads` | Proposal scan over every live proposal, with reject and cancel |
| `/api/tx/build` | Composes unsigned transactions through the client |
| `/api/tx/status` | Confirms a sent transaction |
| `/api/tx/send` | Relay of wallet-signed transactions. Enabled on localnet only |

### App rules

- **No keys.** The server composes unsigned transactions. On devnet the connected wallet signs and sends through its own RPC. The relay never signs and accepts only the pilot's programs and the configured multisig.
- **Read the chain.** Every number comes from on-chain accounts through the client. Previews are labelled as previews.
- **Cluster by environment.** `localnet` or `devnet`, checked by genesis hash. Mainnet is refused.
- **Headers.** Clickjacking, sniffing and referrer protections are on. A full content security header runs in report-only mode first.

## Scripts

| Script | Purpose |
|---|---|
| [`scripts/devnet/deploy.ts`](../../scripts/devnet/deploy.ts) | Deploys the program and hands the upgrade authority to the upgrade multisig's vault, derived from config and checked. The only script that takes keypair paths |
| [`scripts/devnet/init.ts`](../../scripts/devnet/init.ts) | Writes the `initialize` call as an unsigned Squads proposal. Requires a 6-decimal reserve mint |
| [`scripts/devnet/allowlist.ts`](../../scripts/devnet/allowlist.ts), [`roles.ts`](../../scripts/devnet/roles.ts), [`caps.ts`](../../scripts/devnet/caps.ts) | Unsigned proposals for the allowlist root, the role handover and the caps |
| [`scripts/devnet/verify.ts`](../../scripts/devnet/verify.ts) | Post-deploy checks: authorities, roles, the multisigs' members, threshold, owner and time locks, and every configured value field by field |
| [`scripts/devnet/dry-run.ts`](../../scripts/devnet/dry-run.ts) | Rehearses the whole sequence against a throwaway local validator |
| [`scripts/release/upgrade-proposal.ts`](../../scripts/release/upgrade-proposal.ts) | Builds the program-upgrade instructions for one Squads vault transaction |
| [`scripts/generate-client.ts`](../../scripts/generate-client.ts) | Codama generation from the IDL |
| [`scripts/idl-compat.ts`](../../scripts/idl-compat.ts) | Diffs the IDL against the last release and fails on a breaking change |
| [`scripts/check-no-keys.sh`](../../scripts/check-no-keys.sh) | Scans for signing APIs and secret-key reads |
| [`app/scripts/`](../../app/scripts/) | Localnet validator and seed scenario for the app. The only code allowed to sign, with throwaway keys, and it refuses non-local URLs |

Every devnet script refuses a cluster other than devnet, checked by genesis hash. Admin steps are always written as unsigned Squads proposals.

## Tests

| Suite | Tool | Scope |
|---|---|---|
| [`tests/tests/`](../../tests/tests/) | LiteSVM | Every instruction: happy path, every error, gate and cap edges, invariants, rounding, pause, freeze, events, compute budget |
| Layout tests and [`tests/fixtures/layout/v1/`](../../tests/fixtures/layout/) | LiteSVM | Golden v1 layouts, padding preservation, version guard |
| [`tests/fixtures/client/`](../../tests/fixtures/client/) | Vectors | Math parity and allowlist proofs shared by the program and the client |
| [`tests-fork/`](../../tests-fork/) | Surfpool | Happy path against the devnet BRS mint |
| [`app/e2e/`](../../app/e2e/) | Playwright | Smoke test of the app against its own local validator |
| `scripts/test/` | Bun | Config, Squads checks, idl-compat and upgrade-proposal tests |

## The MUTAV platform (`mutav-app`)

The platform holds everything the program should not:

- the contract registry and the audit trail, kept where the operator key cannot write;
- agency onboarding, the monthly guarantee-fee billing and its reconciliation;
- claim review, information requests, approval and execution, with the payment service level (contractual term plus a 48-hour target), which the program does not hold;
- the indexer, which decodes accounts and events by discriminator and skips unknown events;
- later, the operator key behind KMS-backed Convex actions, sending the same instructions the `/operator` console sends by hand today.

After an operator compromise, the platform's registry is what the new operator reconciles against on-chain events and `refs_hash` commitments (see [Roles and trust](roles-and-trust.md#operator-compromise-recovery)).

## Sources

- [Repository README](../../README.md) and repo rules ([`CLAUDE.md`](../../CLAUDE.md))
- [Pilot app spec](../../app/docs/spec.md)
- [Protocol specification, §5 Instructions](../spec.md#5-instructions) and [§14.4 Client and IDL compatibility](../spec.md#144-client-and-idl-compatibility)
- [Litepaper, §6 Architecture on Solana](../litepaper.md#6-architecture-on-solana)
- Program modules under [`programs/mutav/src/`](../../programs/mutav/src/)
- Client: [`clients/js/README.md`](../../clients/js/README.md)
- CI: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`release.yml`](../../.github/workflows/release.yml), [`fork.yml`](../../.github/workflows/fork.yml)
- [Codama](https://github.com/codama-idl/codama), [`@solana/kit`](https://github.com/anza-xyz/kit), [LiteSVM](https://github.com/LiteSVM/litesvm), [Surfpool](https://github.com/txtx/surfpool)

## Decisions

- [ADR 0002: One core program plus adapter programs with capped sub-authorities](../decisions/0002-core-program-and-capped-adapters.md)
- [ADR 0011: Phase-2 instant exit and upgrade readiness](../decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)
- [ADR 0017: BRS income intake](../decisions/0017-brs-income-intake.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md)
- [ADR 0023: Capital flows and exit rights](../decisions/0023-capital-flows-and-exit-rights.md)
- [ADR 0024: Unsolicited money and backstop contributions](../decisions/0024-unsolicited-money-and-backstop.md)
- [ADR 0026: Program simplification for the freeze](../decisions/0026-program-simplification-for-the-freeze.md)
- [ADR 0027: Multi-asset adapters, liquidity floor and rebalancing](../decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md) (Proposed; decided points noted in the ADR)
