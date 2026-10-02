# mutav-protocol-solana — repo rules

Rules for AI agents and humans working in this repo. `mutav-finance/mutav-protocol-solana` is the MUTAV reserve program on Solana plus its TypeScript client. It is the audited surface: keep it small, deterministic and free of keys.

## Scope

- This repo ships the **program** (`programs/mutav`, adapter crates), the **Codama-generated TS client** (`clients/js`, published as `@mutav-finance/mutav-protocol-solana`), tests and devnet scripts.
- It ships **no UI**. The admin console, investor area, transparency page and operator automation live in `mutav-finance/mutav-app`.

## Must never

- **No signing-key code.** No keypair files committed, no `Keypair.fromSecretKey` / `createKeyPairSignerFromBytes` on secret material, no private-key or seed reads from env, no `signTransaction` in the client.
  - Clients **compose** instructions and transactions only. The caller signs.
  - The **operator key** lives in mutav-app, behind KMS-backed Convex actions.
  - **Admin authority** is a Squads v4 multisig. Admins sign proposals from mutav-app's `apps/admin` with their own wallets.
  - Program and deploy keypairs live outside the repo (e.g. `~/.config/solana/mutav/`). `*.json` keypairs are gitignored.
- **Never reverse the dependency direction.** mutav-app consumes `@mutav-finance/mutav-protocol-solana`. Nothing in this repo imports from mutav-app.
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

## Git

- Work on a branch and open a PR to `main`. Never push to `main`.
- Keep commits bounded: one concern per commit (e.g. one instruction plus its tests), conventional-commit messages (`feat(mutav): …`, `test: …`, `docs: …`).
- CI must be green (build, tests, Codama client diff) before merge.
- Regenerate and commit the Codama client in the same PR as any IDL change.
