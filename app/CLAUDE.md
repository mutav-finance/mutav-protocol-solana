@AGENTS.md

# mutav-pilot-app — app rules

Demo and reference app for the MUTAV reserve program on Solana (Colosseum Crypto World's Fair, 2026). Routes: `/` landing, `/reserve` public transparency, `/demo` guided operator demo, `/admin` Squads admin console. Spec: [`docs/spec.md`](docs/spec.md). Production surfaces stay in `mutav-app`, which ports these screens later (mutav-app #369).

## Rules (from the spec — non-negotiable)

- **No keys.** The app composes transactions; the connected wallet signs. No secret material in the repo, env or code. Admin actions are Squads proposals signed by members' wallets.
  - `app/`, `components/`, `lib/` never build a signer from bytes (ESLint enforces it). Server routes compose **unsigned** transactions (fee payer = the connected wallet) and relay **already-signed** ones; they hold no key.
  - `scripts/` is localnet-only tooling. It may sign with throwaway local keys, and refuses any non-local RPC URL.
- **Cluster by env:** `NEXT_PUBLIC_CLUSTER` = `localnet` or `devnet`. Mainnet is refused (`lib/cluster.ts`): in the env parser, the RPC URL check, the tx relay and the scripts.
- **Read the chain, don't mirror it.** Every number on screen comes from on-chain accounts via the client's read helpers (`@mutav-finance/mutav-protocol-solana`). Previews (the solvency gate) use the client's math mirror and are **labelled as previews**. Never hardcode or cache a number the chain owns.
- **Language:** English. MUTAV's guarantee is a *fiança*: say "guarantee fee", "claim payment", "reserve". Never "premium", "insurance", "policy", "yield vault" (a unit test greps the UI for these).
- **Not investable.** The pilot reserve is MUTAV's own capital. Investor-facing copy says so.

## Dependencies

- `@mutav-finance/mutav-protocol-solana` is a `file:` dependency on the protocol repo's client (see README). Never edit it from here; never import from the protocol repo's `scripts/` in app code (only `scripts/` here may, for localnet seeding).
- Never edit `branding/` or `.design/branding/` — brand is vendored from the `brand` repo.

## Styling (ported from mutav-pulse — read before writing UI)

Two layers: shadcn primitives in `components/ui/*` (Tailwind utilities; build every button/input from them — ESLint blocks raw `<button>`/`<input>`), and product components styled with inline `style={{}}` over `var(--color-*)` brand tokens. Precision Brutalism: radius 0, no shadows, no gradients; amber is scarce (<5% of pixels).

- **Never** redefine Tailwind's spacing scale in `@theme` (it once made `h-10` 80px).
- **Never** let `@theme inline` redefine `--color-accent` or `--color-border`.
- Motion: compositor-only (`transform`, `opacity`, `visibility`), and respect `prefers-reduced-motion`.

## Commands

All commands exit on their own. **No watch mode. One heavy process at a time** (build, test run, validator); check `uptime` first.

- `bun run test` — Vitest unit tests (`vitest run`; pass `--maxWorkers=2` when other work is running).
- `bun run build` — `next build` (must pass).
- `bun run lint`, `bun run typecheck`.
- `bun run e2e` — Playwright smoke: starts a local validator, seeds it, serves the built app, checks every route, then stops everything and asserts with `pgrep` that nothing is left running. Run `bun run build` with `NEXT_PUBLIC_CLUSTER=localnet` first.
- `bun run localnet:up` / `localnet:down` — a seeded local validator for manual demo runs.

## Git

Branch + PR to `main`; conventional commits. Never push without being asked.
