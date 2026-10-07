# mutav-protocol-solana — repo rules

Rules for AI agents and humans working in this repo. `mutav-finance/mutav-protocol-solana` is the MUTAV reserve program on Solana, its TypeScript client and the pilot web app. The program and client are the audited surface: keep them small, deterministic and free of keys.

## Scope

- This repo ships the **program** (`programs/mutav`, adapter crates), the **Codama-generated TS client** (`clients/js`, published as `@mutav-finance/mutav-protocol-solana`), tests, devnet scripts **and the pilot web app (`app/`)**: a demo and transparency app built for the Colosseum hackathon.
- `mutav-finance/mutav-app` remains the production home of the user-facing surfaces (admin console, investor area, transparency page) and the operator automation after the hackathon; it ports the pilot screens later.

## Must never

- **No signing-key code.** No keypair files committed, no `Keypair.fromSecretKey` / `createKeyPairSignerFromBytes` on secret material, no private-key or seed reads from env, no `signTransaction` in the client.
  - Clients **compose** instructions and transactions only. The caller signs.
  - This applies to `app/` too: the connected wallet signs; the server composes unsigned transactions and only relays fully signed ones. Only `app/scripts/` (localnet tooling that refuses non-local URLs) may sign, with throwaway keys kept outside the repo.
  - The **operator key** lives in mutav-app, behind KMS-backed Convex actions.
  - **Admin authority** is a Squads v4 multisig. Admins sign proposals from mutav-app's `apps/admin` with their own wallets.
  - Program and deploy keypairs live outside the repo (e.g. `~/.config/solana/mutav/`). `*.json` keypairs are gitignored.
- **Never reverse the dependency direction.** mutav-app consumes `@mutav-finance/mutav-protocol-solana`. Nothing in this repo imports from mutav-app. Inside the repo, `app/` consumes `clients/js`; the program, client and root `scripts/` never import from `app/`.
- **Never change economic behaviour without an ADR.** Business rules come from [`docs/spec.md`](docs/spec.md). Any change to who can move funds, how NAV, coverage or free capital are computed, what is gated, or what the caps mean needs a new ADR in [`docs/decisions/`](docs/decisions/) and a matching spec update in the same PR.
- **Never edit `branding/**`.** It is vendored from the `brand` repo via `bun brand:import`.

## Language

- Use Solana terminology: program, instruction, account, PDA, seeds, bump, CPI, signer, mint, token account, associated token account, upgrade authority, compute units.
- Don't mention other chains unless the comparison adds rationale to a decision.
- Say **"guarantee fee"**, never "premium". Say **"claim payment"** or "claim", never "*sinistro*". MUTAV's guarantee is a *fiança*: no insurance vocabulary (no "policy", "insured", "policyholder", "reinsurance") in code, docs, events or error messages.
- Say "reserve", not "fund" or "yield vault", when referring to the program's assets. The reserve is operational infrastructure, not a yield product.

## Business rules

- [`docs/spec.md`](docs/spec.md) is the source of truth for accounts, instructions, invariants, caps and events. Implement against it; don't infer rules from other repos.
- Where the spec says **TBD**, don't pick a value or behaviour in code. Ask, or leave a typed `TODO(spec: <open question>)` and fail closed.
- The solvency gate never blocks a claim payment. Any change touching `pay_claim` must keep the property test that asserts this.

## Testing

- LiteSVM for unit and integration tests (`tests/`). Mollusk for compute-unit benchmarks. Surfpool for fork tests (`tests-fork/`), run on demand.
- Write the test first. Each instruction gets happy-path, every error, and the gate/cap edge cases.
- Always cap parallelism: `RUST_TEST_THREADS=4 CARGO_BUILD_JOBS=4 cargo test -p mutav-tests` (after `anchor build`). Scope to the test file you touched when iterating (`cargo test -p mutav-tests --test <name>`).
- **No watch mode.** Every test, build or dev command must exit on its own.
- **One heavy process at a time** (build, test run, Surfpool, validator). Don't start a second while one runs. Parallel agents must not each run the suite; one agent owns test execution.
- Math is done in `u128` with explicit rounding, in the reserve's favour. Overflow checks stay on in release.

## App

The pilot web app lives in [`app/`](app/) (Next.js 16, Bun). Its full rules are in [`app/CLAUDE.md`](app/CLAUDE.md); the essentials:

- Routes: `/` landing, `/reserve` public transparency, `/demo` guided operator demo, `/admin` Squads admin console. Spec: [`app/docs/spec.md`](app/docs/spec.md).
- **Read the chain, don't mirror it.** Every number on screen comes from on-chain accounts through `clients/js`. Previews use the client's math mirror and are labelled as previews.
- **Cluster by env:** `NEXT_PUBLIC_CLUSTER` is `localnet` or `devnet`; mainnet is refused.
- `app/` depends on `file:../clients/js`; its postinstall builds and copies the client (see [`app/README.md`](app/README.md)). Never edit `clients/js` from app work.
- The same language rules apply in UI copy; a unit test greps the UI for forbidden words. The pilot reserve is not investable, and copy says so.
- Checks: `cd app && bun run typecheck && bun run test && bun run build`. The Playwright smoke (`bun run e2e`) needs `anchor build` and starts its own validator: it is a heavy process.

## Git

- Work on a branch and open a PR to `main`. Never push to `main`.
- Keep commits bounded: one concern per commit (e.g. one instruction plus its tests), conventional-commit messages (`feat(mutav): …`, `test: …`, `docs: …`).
- CI must be green (build, tests, Codama client diff, app checks) before merge.
- Regenerate and commit the Codama client in the same PR as any IDL change.
