# MUTAV pilot app (`app/`)

A small web app that shows the MUTAV reserve program working on Solana. Built for the Colosseum Crypto World's Fair (Sep 14 – Oct 12, 2026). Spec: [`docs/spec.md`](docs/spec.md). App rules: [`CLAUDE.md`](CLAUDE.md) (plus the repo-root [`CLAUDE.md`](../CLAUDE.md)). It lives in `app/` of `mutav-protocol-solana`, next to the program and the client it reads through.

MUTAV is an institutional rental guarantor in Brazil. Every guarantee (a *fiança*) is backed by a reserve anyone can verify on Solana. The pilot reserve holds MUTAV's own capital; it is not open to outside investors.

| Route | What it is |
|---|---|
| `/` | Landing: the story, a live reserve strip, how it works, the protocol diagram |
| `/reserve` | Public transparency: health, coverage, claims timeline, money flows, capital queue, disclosures, every account on Explorer, and the permissionless `refresh` |
| `/demo` | Guided operator demo (six steps, with the solvency-gate preview) plus a free-form operator panel |
| `/admin` | `VaultConfig`, Squads v4 proposal builders (create / approve / execute, with the time lock), direct signing on localnet only |

## How it works

- **Reads** run in route handlers (`app/api/*`) through the protocol client's read helpers and decoders; pages poll them. Every number on screen comes from on-chain accounts. The gate preview uses the client's math mirror and is labelled as a preview.
- **Writes**: a route composes an **unsigned** transaction (fee payer = the connected wallet), the wallet signs it (wallet-standard `solana:signTransaction`: Phantom, Solflare, Backpack), and `/api/tx/send` relays the signed bytes to the configured cluster. The relay refuses transactions for programs outside the pilot's set. No key exists anywhere in the app.
- **Admin actions** are Squads v4 vault-transaction proposals (create + the creator's approval, then approvals, then execute after the time lock). On localnet, when `VaultConfig.admin` is not a Squads vault, `/admin` can sign directly, clearly labelled.
- **Cluster guard**: `NEXT_PUBLIC_CLUSTER` is `localnet` or `devnet`; mainnet is refused by the env parser, the RPC URL check, the relay and the scripts.

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
| `RPC_URL` | server, runtime | RPC for reads and the relay; defaults per cluster |
| `PROGRAM_ID` | server, runtime | `8scC79jkU7SPM9v6M4nB833R8EeqKknfwdRdjn73Qqv9` |
| `CONFIG_ADDRESS` | server, runtime | the reserve's `VaultConfig` PDA |
| `SQUADS_MULTISIG` | server, runtime | the Squads v4 multisig whose vault is `VaultConfig.admin` |
| `ALLOWLIST` | server, runtime | allowlisted wallets (public), to build `request_deposit` proofs |

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

`@mutav-finance/mutav-protocol-solana` is a `file:../clients/js` dependency on this repo's own client. Bun installs `file:` dependencies as symlinks, which Turbopack cannot read, and the client's own `node_modules` would bundle a second `@solana/kit`. So the postinstall (`scripts/materialize-client.mjs`) replaces the link with a real copy of `package.json` + `dist/`. When `../clients/js/dist` is missing (fresh clone, Vercel), it first runs `bun install --frozen-lockfile` at the repo root and `bun run build` in `clients/js`. After changing the client, rebuild it (`bun run build` in `clients/js`), then `rm -rf node_modules/@mutav-finance && bun install` here to refresh the copy.

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

No separate prebuild step is needed; if the postinstall is ever skipped, use `cd ../clients/js && bun install && bun run build && cd ../../app && bun install` as the Install Command. Needed before going live: the protocol deployed and initialized on devnet, then `CONFIG_ADDRESS`, `SQUADS_MULTISIG` and `ALLOWLIST` set in the project.

## Brand

Brand tokens (palette, Geist / Inter / JetBrains Mono, Precision Brutalism) come from the `brand` repo, as already applied in `mutav-pulse`. Vendoring the brand tree into this repo is pending: the `brand` repo's tooling exports to every consumer at once, so it was not run (see the `chore/add-mutav-pilot-app` branch in `brand/`).
