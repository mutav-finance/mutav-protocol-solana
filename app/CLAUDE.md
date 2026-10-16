@AGENTS.md

# app/ — pilot web app rules

Demo and reference app for the MUTAV reserve program on Solana (Colosseum Crypto World's Fair, 2026). Live at https://reserve.mutav.finance (Vercel project `mutav-pilot-app`, team `mutav`, root `app`, deploys from `main`). Routes: `/` redirects to `/reserve` (no app landing; MUTAV's landing is https://www.mutav.finance), `/reserve` public transparency (tabs Overview, Coverage, Claims, Capital at `/reserve/capital`, Risks, Verify), `/operator` operator console (`/demo` redirects there), `/admin` Squads admin console, `/capital` allowlist-gated capital queue (`/investment`, `/investor` and `/dashboard` redirect there), `/simulator` reserve simulator (static `public/simulator.html`). Spec: [`docs/spec.md`](docs/spec.md). It lives in `app/` of `mutav-protocol-solana`; the repo-root [`CLAUDE.md`](../CLAUDE.md) rules apply here too. Production surfaces stay in `mutav-app`, which ports these screens later (mutav-app #369).

## Rules (from the spec — non-negotiable)

- **No keys.** The app composes transactions; the connected wallet signs. No secret material in the repo, env or code. Admin actions are Squads proposals signed by members' wallets.
  - `app/`, `components/`, `lib/` never build a signer from bytes (ESLint enforces it). Server routes compose **unsigned** transactions (fee payer = the connected wallet) and relay **already-signed** ones; they hold no key.
  - `scripts/` is localnet-only tooling. It may sign with throwaway local keys, and refuses any non-local RPC URL.
- **Cluster by env:** `NEXT_PUBLIC_CLUSTER` = `localnet` or `devnet`. Mainnet is refused (`lib/cluster.ts`): in the env parser, the RPC URL check, the tx relay and the scripts.
- **Read the chain, don't mirror it.** Every number on screen comes from on-chain accounts via the client's read helpers (`@mutav-finance/mutav-protocol-solana`). Previews (the coverage gate) use the client's math mirror and are **labelled as previews**. Never hardcode or cache a number the chain owns.
- **Language:** English. MUTAV's guarantee is a *fiança*: say "guarantee fee", "claim payment", "reserve". Never "premium", "insurance", "policy", "yield vault" (a unit test greps the UI for these).
- **Allowlist and demo banner.** Investor actions are gated by the on-chain allowlist (KYC off-chain). Beyond that, every page (and `public/simulator.html`) carries the demo banner (`components/DemoBanner.tsx`): pilot demo, **not open to public investment**, capital participation only through a regulated vehicle to eligible investors. That is the legal floor (founder decision, 2026-10-11); never remove or soften it until the regulated vehicle is live.
- **Investor-facing copy leads with: not open to public investment.** `/capital` and the Risks tab say so in the page itself (pilot capital is MUTAV's own wallet; nothing is an offer). Demo: the request form is visible to every visitor; on-chain actions stay allowlist-gated (holders can always redeem, ADR 0023). Before launch, set `CAPITAL_FORMS_PUBLIC` (`lib/flags.ts`, env `NEXT_PUBLIC_CAPITAL_FORMS_PUBLIC=false`) false to show the form only to allowlisted wallets (holders get redeem only). Public copy says "capital provider"; "Investor" stays only as the on-chain role tag.
- **Money: BRS primary, US$ hint.** Amounts always show in BRS (`fmtBrs`, founder decision 2026-10-12). On `/reserve/*`, `/capital`, `/operator` and `/admin`, main figures add a small muted `≈ US$` hint at the BCB PTAX rate from `/api/fx` (`<Money>` / `<UsdHint>` / `<UsdSource>` in `components/MoneyProvider.tsx`); display only, the reserve holds BRS. Never swap the main figure to dollars.

## Dependencies

- `@mutav-finance/mutav-protocol-solana` is a `file:../clients/js` dependency on this repo's client; the postinstall builds and copies it (see README). Never edit it from app work; never import from the repo-root `scripts/` in app code (only `app/scripts/` may, for localnet seeding).
- Never edit `branding/` or `.design/branding/` — brand is vendored from the `brand` repo.

## Styling (ported from mutav-pulse — read before writing UI)

Two layers: shadcn primitives in `components/ui/*` (Tailwind utilities; build every button/input from them — ESLint blocks raw `<button>`/`<input>`), and product components styled over `var(--color-*)` brand tokens. Precision Brutalism: radius 0, no shadows, no gradients; amber is scarce (<5% of pixels).

- **Brand contract wins on details:** `STYLE.md` of the brand system (`mutav/.design/branding/mutav/patterns/`). 6px-square badges with a mono label (no pills, no background fill); 1px borders only; 56px nav on the canvas with a 1px amber active border; cards 24px padding, Inter Medium 12px caps label, bold mono value; 8px spacing rhythm; max-width 1440px (`--page-wide-max-width`), 32px margin (`--page-pad`, 16px on phones).
- **Structure reference: the web investidor** (`mutav-finance/mutav-fund`): centred nav tabs, page header and width policy, sections as bento grids of surface tiles, tables and charts in surface cards. Where it contradicts `STYLE.md` (pills, 2px borders, 64px nav), `STYLE.md` wins. Its canvas grid texture is **not** ported (retired by the brand).
- **Photography: deliberate exception** to STYLE.md's "no photography in Dashboard Investidor", decided by the founder (2026-10-08): licensed architectural photos, grayscale, at low opacity (≤ 0.2) behind a title or a CTA tile, decorative only (`alt=""`). Never behind numbers.
- New and restyled shared components use Tailwind utilities that read the tokens directly (`bg-(--color-surface)`, `text-(--color-text-2)`). Don't alias brand tokens in `@theme inline` under their own names (it emits self-referencing variables).

- **Never** redefine Tailwind's spacing scale in `@theme` (it once made `h-10` 80px).
- **Never** let `@theme inline` redefine `--color-accent` or `--color-border`.
- Motion: compositor-only (`transform`, `opacity`, `visibility`), and respect `prefers-reduced-motion`.

## Commands

All commands exit on their own. **No watch mode. One heavy process at a time** (build, test run, validator); check `uptime` first.

- `bun run test` — Vitest unit tests (`vitest run`; pass `--maxWorkers=2` when other work is running).
- `bun run build` — `next build` (must pass).
- `bun run lint`, `bun run typecheck`.
- `bun run e2e` — Playwright smoke: starts a local validator, seeds it, serves the built app, checks every route, then stops everything and asserts with `pgrep` that nothing is left running. Run `anchor build` at the repo root and `bun run build` with `NEXT_PUBLIC_CLUSTER=localnet` first.
- `bun run localnet:up` / `localnet:down` — a seeded local validator for manual demo runs.

## Git

Branch + PR to `main`; conventional commits with the `app` scope (`feat(app): …`). Never push without being asked.
