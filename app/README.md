# MUTAV pilot app (`app/`)

A small web app that shows the MUTAV reserve program working on Solana. Built for the Colosseum Crypto World's Fair (Sep 14 – Oct 12, 2026). Spec: [`docs/spec.md`](docs/spec.md). App rules: [`CLAUDE.md`](CLAUDE.md) (plus the repo-root [`CLAUDE.md`](../CLAUDE.md)). It lives in `app/` of `mutav-protocol-solana`, next to the program and the client it reads through.

MUTAV is an institutional rental guarantor in Brazil. Every guarantee (a *fiança*) is backed by a reserve anyone can verify on Solana. Capital actions are gated by an on-chain allowlist (KYC off-chain).

**Not open to public investment.** The pilot runs on MUTAV's own capital, and every page carries the demo banner (`components/DemoBanner.tsx`). Investor-facing copy leads with: not open to public investment. Nothing in this app is an offer.

Live: [reserve.mutav.finance](https://reserve.mutav.finance).

| Route | What it is |
|---|---|
| `/` | Redirects to `/reserve` (308). No app landing: MUTAV's landing is [mutav.finance](https://www.mutav.finance) |
| `/reserve` | Public transparency: health, coverage, claims timeline, money flows, capital queue, disclosures, every account on Explorer, and the permissionless `refresh`; snapshot charts of each |
| `/capital` | The capital queue (`/investment`, `/investor`, `/dashboard` redirect here). Leads with: not open to public investment; pilot capital is MUTAV's own wallet. The capital provider's view: allowlist status (on-chain root + `ALLOWLIST`), position, own queue entries, and `request_deposit` / `cancel_deposit` / `claim_shares` / `request_redeem` / `cancel_redeem` / `claim_assets`. Demo: the request form is visible to every visitor; on-chain actions stay allowlist-gated (holders can always redeem, ADR 0023). Before launch, set `CAPITAL_FORMS_PUBLIC` (`lib/flags.ts`, env `NEXT_PUBLIC_CAPITAL_FORMS_PUBLIC=false`) false to show the form only to allowlisted wallets (holders get redeem only). |
| `/operator` | Operator console: today MUTAV's team signs by hand with the operator wallet (later mutav-app's backend, KMS key). Live limits (claim caps window, payouts vs SLA, free capital), every operator instruction with its bound shown before signing, duties (today → later), recent operator transactions, safety. Actions enabled only for `VaultConfig.operator` |
| `/demo` | Guided operator demo (six steps, with the coverage-gate preview); free-form operator actions are on `/operator` |
| `/admin` | `VaultConfig`, Squads v4 proposal builders (create / approve / execute, with the time lock), direct signing on localnet only |
| `/simulator` | The reserve simulator, a standalone page (`public/simulator.html`): reserve sizing, coverage, yield against Selic |

## How it works

- **Roles.** Every page tags who does what: **Reserve Admin** (Squads multisig, plus the pauser key), **Operator** (MUTAV's operator key), **Investor** (the allowlisted capital provider), and **Anyone** (cranks). The map lives in `lib/roles.ts`, and a unit test checks it against each instruction's signer constraint in `programs/mutav`.

- **Reads** run in route handlers (`app/api/*`) through the protocol client's read helpers and decoders; pages poll them. Every number on screen comes from on-chain accounts. The gate preview uses the client's math mirror and is labelled as a preview.
- **Writes**: a route composes an **unsigned** transaction (fee payer = the connected wallet). On **devnet** the wallet signs and sends it through its own RPC (wallet-standard `solana:signAndSendTransaction`: Phantom, Solflare, Backpack) and the app confirms through its read endpoint. On **localnet** the wallet signs (`solana:signTransaction`) and `/api/tx/send` relays the bytes to the local validator; that relay refuses on devnet, caps the body at 4 KB, and accepts only MUTAV, Squads (the configured multisig) and Compute Budget instructions. No key exists anywhere in the app.
- **Hardening**: every route checks the RPC's genesis hash against the cluster; errors cut URLs to their host (an RPC API key never leaks); read routes are CDN-cached for 3 s and cached in process (5 s, 10 s for the ledger and operator history, 1 s for a fresh read; concurrent reads coalesced; the last good value served marked `x-chain-stale` while the RPC is busy, else 503 + Retry-After); RPC calls retry on 429 and, on the public devnet RPC, are spaced to its per-method limits; every response forbids framing and sniffing; pages carry a nonce CSP in report-only mode (`proxy.ts`). The staged WAF rate limit is in [`docs/waf-rule.md`](docs/waf-rule.md).
- **Admin actions** are Squads v4 vault-transaction proposals (create + the creator's approval, then approvals, then execute after the time lock). Members can reject or cancel. A `set_config` proposal records the values it was built against in its memo, and this app refuses to execute it once one of them has moved (stale carry). The check is app-side only: executing from the Squads UI or another client skips it. The memo is read back from the history of the proposal's transaction account, so anyone who spams that account with transactions can make this app refuse to execute it (fail closed); the Squads UI remains the fallback. On localnet, when `VaultConfig.admin` is not a Squads vault, `/admin` can sign directly, clearly labelled.
- **Money display**: BRS primary; a small muted `≈ US$` hint from PTAX/BCB, display only. Amounts always show in BRS (`fmtBrs`); on `/reserve/*` and `/capital` the main figures add the hint (`components/MoneyProvider.tsx`: `<Money>`, `<UsdHint>`, one `<UsdSource>` line). `/api/fx` reads the Banco Central do Brasil PTAX selling rate server-side (Olinda OData; latest published day, up to 7 days back; cached ~1 h; 5 s timeout) and answers `{ fx: null }` on any failure, which hides the hints. BRS is pegged 1:1 to BRL, so it converts at the BRL rate. The mock chain serves a labelled mock rate.
- **Cluster guard**: `NEXT_PUBLIC_CLUSTER` is `localnet` or `devnet`; mainnet is refused by the env parser, the RPC URL and genesis-hash checks, the relay and the scripts.

## Setup

```bash
cd app
bun install                  # postinstall builds ../clients/js if its dist/ is missing
cp .env.example .env.local   # fill CONFIG_ADDRESS (and SQUADS_MULTISIG, ALLOWLIST) for devnet
PORT=3001 bun run dev        # or: bun run build && PORT=3001 bun run start
```

Port 3001 is a suggestion: 3000 is often taken by another local project.

| Variable | Where | Meaning |
|---|---|---|
| `NEXT_PUBLIC_CLUSTER` | build time | `localnet` or `devnet` (mainnet refused) |
| `NEXT_PUBLIC_CAPITAL_FORMS_PUBLIC` | build time | `CAPITAL_FORMS_PUBLIC` (`lib/flags.ts`). Unset or anything but `false` (demo): the `/capital` form shows to every visitor, actions stay allowlist-gated. `false` before launch: the form shows only to allowlisted wallets (holders get redeem only) |
| `NEXT_PUBLIC_ACCELERATED_CLOCK` | build time | `ACCELERATED_CLOCK` (`lib/flags.ts`). `1` only when recording the warped-clock localnet simulation: on localnet the banner reads "Local simulation · accelerated clock" (on localnet it always says "Local simulation"). Ignored on devnet |
| `RPC_URL` | server, runtime | RPC for reads and the relay; defaults per cluster. Server-only (never `NEXT_PUBLIC_`): set a dedicated devnet RPC (Helius, Triton) for demos, the public one allows 10 `getTransaction`/`getProgramAccounts` per 10 s per IP |
| `PROGRAM_ID` | server, runtime | defaults to the client's `MUTAV_PROGRAM_ADDRESS` (the ID declared in `lib.rs`); the live devnet demo sets `GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV` |
| `CONFIG_ADDRESS` | server, runtime | the reserve's `VaultConfig` PDA |
| `SQUADS_MULTISIG` | server, runtime | the Squads v4 multisig whose vault is `VaultConfig.admin` |
| `ALLOWLIST` | server, runtime | allowlisted wallets (public), to build `request_deposit` proofs; `/admin` proposes its root (`set_allowlist_root`) |
| `PAYMENTS_OWNER` | server, runtime | optional: the wallet expected to own the payments token account; `/admin` flags a different owner |

Runtime variables are read per request, so a re-seeded localnet needs no rebuild.

## Localnet

`scripts/` drives a local `solana-test-validator` loaded with the program built at the repo root (`../target/deploy/mutav.so`, from `anchor build`), reusing the protocol's dry-run harness and composers (`../scripts/devnet/lib/*`). Set `MUTAV_PROTOCOL_DIR` to use another checkout. It refuses any non-local URL.

```bash
(cd .. && anchor build)  # once, so target/deploy/mutav.so exists
bun run localnet:up      # start the validator, seed the demo state, write .localnet/env
cp .localnet/env .env.local
PORT=3001 bun run dev
bun run localnet:down    # stop it and assert nothing is left running
```

The seed generates throwaway localnet keys (admin, operator, capital wallet) in a temp directory **outside the repo** and prints their paths; import them into a wallet to drive `/demo` and `/admin` locally. Pass `--admin-keypair <path>` to use your own local admin key. Nothing under `scripts/` runs against devnet yet: devnet admin steps are Squads proposals.

## Tests

```bash
bun run test                                   # Vitest (formatting, view models, gate preview vs. the math mirror, compose, relay, guards)
NEXT_PUBLIC_CLUSTER=localnet bun run build && bun run e2e   # Playwright smoke against a seeded localnet
```

## Protocol client dependency

`@mutav-finance/mutav-protocol-solana` is a `file:../clients/js` dependency on this repo's own client. Bun installs `file:` dependencies as symlinks, which Turbopack cannot read, and the client's own `node_modules` would bundle a second `@solana/kit`. So the postinstall (`scripts/materialize-client.mjs`) replaces the link with a real copy of `package.json` + `dist/`. When `../clients/js/dist` is missing (fresh clone, Vercel) or older than `../clients/js/src`, it first runs `bun install --frozen-lockfile` at the repo root (if needed) and `bun run build` in `clients/js`. It refreshes the copy whenever it is stale (older `dist/`, or a different `package.json`). After changing the client, run `bun run client:refresh` here to rebuild and refresh it without reinstalling.

## Deploy (not done)

Target: Vercel, team `mutav`, project `mutav-pilot-app` at `reserve.mutav.finance` (the wildcard DNS already resolves). The Vercel project does not exist yet. Settings:

| Setting | Value |
|---|---|
| Git repository | `mutav-finance/mutav-protocol-solana` |
| Root Directory | `app` |
| Include files outside the root directory | enabled (the build reads `../clients/js`) |
| Framework preset | Next.js |
| Install Command | `bun install` (the postinstall builds `../clients/js`: root `bun install --frozen-lockfile`, then the client build) |
| Build Command | `bun run build` |
| Environment | `NEXT_PUBLIC_CLUSTER=devnet`, plus `RPC_URL`, `PROGRAM_ID`, `CONFIG_ADDRESS`, `SQUADS_MULTISIG`, `ALLOWLIST` |

No separate prebuild step is needed; if the postinstall is ever skipped, use `cd ../clients/js && bun install && bun run build && cd ../../app && bun install` as the Install Command. The production project reads the pilot demo reserve on devnet: `PROGRAM_ID`, `CONFIG_ADDRESS`, `SQUADS_MULTISIG`, `ALLOWLIST` and `PAYMENTS_OWNER` are set to the deploy listed in the [README](../README.md#devnet-addresses).

## Brand

Brand tokens (palette, Geist / Inter / JetBrains Mono, Precision Brutalism) come from the `brand` repo, as already applied in `mutav-pulse`. Vendoring the brand tree into this repo is pending: the `brand` repo's tooling exports to every consumer at once, so it was not run (see the `chore/add-mutav-pilot-app` branch in `brand/`).
