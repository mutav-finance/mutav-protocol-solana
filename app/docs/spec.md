# MUTAV pilot app — spec

*2026-10-06. Built during Colosseum Crypto World's Fair (Sep 14 – Oct 12, 2026). Pattern: the mutav-pulse frontend (Next.js app reading the protocol through a typed client).*

## Purpose

A small web app that shows the MUTAV reserve program working on Solana devnet. It is built for two audiences:

- **Judges and investors**, who see the live reserve and the full guarantee flow run from the operator console.
- **MUTAV's team**, who runs the operator and admin actions from a connected wallet during the pilot demo.

It is a demo and reference app. Production surfaces (agency platform, KMS-backed operator, Auth0) stay in `mutav-app`, which will port these screens after the hackathon (mutav-app #369).

## Stack

- Next.js 16 (App Router), React 19, TypeScript, Bun, Tailwind 4, Radix / shadcn components, Vitest, Playwright.
- Solana: `@mutav-finance/mutav-protocol-solana` (Codama client, read helpers, math mirror, allowlist builder), `@solana/kit`, wallet-standard connection (Phantom, Solflare, Backpack). Squads v4 SDK for admin proposals.
- Brand: vendored from the `brand` repo into `branding/` via `bun brand:import` (never edited here).
- Deploy: Vercel, team `mutav`, at `reserve.mutav.finance` (the wildcard DNS already resolves).

## Rules

- **No keys.** The app composes transactions; the connected wallet signs. No secret material in the repo, env or code. Admin actions are Squads proposals signed by members' wallets.
- **Cluster by env:** `NEXT_PUBLIC_CLUSTER` = `localnet` (Surfpool / local validator seeded by the protocol's dry-run scripts) or `devnet`. Mainnet is refused.
- **Read the chain, don't mirror it.** Every number on screen comes from on-chain accounts via the client's read helpers. Previews (for example the coverage gate) use the client's math mirror and are labelled as previews.
- **Language:** English for the hackathon. MUTAV's guarantee is a *fiança*: say "guarantee fee", "claim payment", "reserve". Never "premium", "insurance", "policy", "yield vault".
- **Not open to public investment.** The pilot runs on MUTAV's own capital. Capital requests are gated by the on-chain allowlist (KYC off-chain); in the pilot the allowlisted capital provider is MUTAV's capital wallet. Copy mentions it where it covers access. Separately, every page (and `public/simulator.html`) carries the demo banner (`components/DemoBanner.tsx`): pilot demo, **not open to public investment**, capital participation only through a regulated vehicle to eligible investors. That is the legal floor (founder decision, 2026-10-11); never remove or soften it until the regulated vehicle is live.
- **Wallets send; the app relays only on localnet.** On devnet the wallet signs and sends (`solana:signAndSendTransaction`) and the app confirms through its read endpoint; `/api/tx/send` relays signed bytes on localnet only (MUTAV, the configured Squads multisig and Compute Budget instructions; 4 KB body cap).
- **Roles are explicit.** Every page tags each action and each number with the role that signs or owns it: Reserve Admin, Operator, Investor (or Anyone for cranks), one colour and one shape per role (`lib/roles.ts`, `components/RoleTag.tsx`).

## Routes

### `/` Redirect

- No app landing: MUTAV's landing is https://www.mutav.finance. `/` permanently redirects to `/reserve`, so reserve.mutav.finance opens on Transparency.
- The nav logo links to `/reserve`; the footer links out to mutav.finance.

### `/reserve` Public transparency

Read-only, no wallet needed. Tabs: Overview (`/reserve`), Coverage, Claims, Ledger (`/reserve/ledger`: money flows, the dated Movements table and the capital queue; `/reserve/capital`, `/reserve/flows` and `/reserve/queue` permanently redirect there), Risks, Verify.

Money: BRS primary; US$ hint from PTAX/BCB, display only. Every amount shows in BRS; the main figures here and on `/capital` carry a small muted `≈ US$ X` at the latest Banco Central PTAX selling rate (BRS = BRL 1:1), with one source line ("US$ at PTAX (Banco Central do Brasil), dd/mm/yyyy. Display only; the reserve holds BRS."). Without a rate the hints and the line are hidden. Nothing about the rate feeds a transaction.

- **Health:** `stable_assets`, `coverage_required`, surplus, `free_capital`, NAV per share, shares outstanding, `mode` (Normal / UnderCovered), `fulfil_halted`, paused, last refresh.
- **Coverage:** remaining cover by guarantee (default and exit legs), active guarantee count, per-agency exposure.
- **Claims timeline:** each claim with on-chain timestamps for filed → paid → settled, and the PIX settlement hash. This is the "proven speed" view (the payout SLA is the operator platform's, ADR 0019).
- **Money flows:** guarantee fees in (net to reserve, take to treasury), issuer income in (Nora's revenue share, swept per statement by `sweep_income`, ADR 0017) and the untracked income-inbox balance, claim payments out, deposits and redemptions.
- **Capital queue:** pending deposits and redemptions in FIFO order.
- **Disclosures:** BRS is issued by Nora; its freeze authority is a single Nora wallet; a freeze stops outflows until thawed. Pilot capital is MUTAV's own. Built-later features (partial fills, claim notices, adapters).
- A "Refresh" button that sends the permissionless `refresh` instruction from any connected wallet.
- Links to every account on a Solana explorer (devnet).

### `/operator` Operator console

During the launch and the hackathon MUTAV's team operates the reserve by hand from this page with the operator wallet; later mutav-app's backend sends the same instructions with a KMS-held key. Anyone can read it; actions are enabled only when the connected wallet is `VaultConfig.operator` (localnet and devnet: the wallet signs).

- **Limits now:** the claim-payment cap window (the last 31 days of `claim_day_buckets` vs `max_claim_per_period`, `max_claim_per_call`; ADR 0019), free capital for new guarantees.
- **Live figures:** reserve balance, coverage required, free capital, set aside for claims and the published share price (labelled as on `/reserve`, BRS with the US$ hint), the mode, and a permissionless **Refresh on-chain**. `/demo` redirects here.
- **Console:** a form per operator instruction, each with its on-chain bound shown before signing and the gate preview where it applies. `sweep_income` (ADR 0017) shows the income-inbox balance and previews the split; it sweeps exactly the amount on a Nora statement.
- **Responsibilities:** each instruction, what is done by hand today and what will trigger it in the backend; undocumented triggers say "triggered by the MUTAV platform".
- **Close reasons:** `close_guarantee` takes RELEASED (the lease ended) or VOID (registered in error; refused once anything was paid). Demo agency ids are opaque random ids the operator keeps, and `refs_hash` is salted with a salt it keeps (ADR 0019 decision 8).
- **Recent activity:** the operator key's last MUTAV transactions, and the last operator `accept_role` (role = 1) in VaultConfig's recent history, when the RPC keeps history.
- **Safety:** what bounds a compromised operator key (caps, fixed payments account, `revoke_operator`, admin-only config).

### `/capital` Capital queue (was `/investor`)

Read by anyone; actions gated on the allowlist.

- **Allowlist status** of the connected wallet: its Merkle proof (client `buildAllowlist` over `ALLOWLIST`) checked with `verifyAllowlistProof` against `VaultConfig.investor_allowlist_root`. States: allowlisted, not listed (KYC is done off-chain), root unset, list mismatch.
- **Position:** reserve shares, value at NAV now (math mirror, labelled preview), BRS in the wallet, waiting deposits and redemptions.
- **Queue entries** of the wallet, with `cancel_deposit`, `claim_shares`, `cancel_redeem`, `claim_assets` where the request's state allows them (owner only, no proof).
- **New requests:** `request_deposit`, `request_redeem`, the proof built by the server, each with an optional price limit (`min_shares_out`, `min_assets_out`; 0 = none; a "preview − 1%" shortcut) and "Redeem all". A request that heads its queue and would not fill now says why (preview). Demo: the request form is visible to every visitor; on-chain actions stay allowlist-gated (holders can always redeem, ADR 0023). Before launch, set `CAPITAL_FORMS_PUBLIC` (`lib/flags.ts`, env `NEXT_PUBLIC_CAPITAL_FORMS_PUBLIC=false`) false to show the form only to allowlisted wallets (holders get redeem only).

### `/admin` Admin console

For Squads members. A sticky in-page nav (General controls · Money in & out · Allocation) over three sections; every parameter lives with the thing it governs, and each control lives in exactly one place. Every admin change is a **Squads vault-transaction proposal** that members approve and execute from their wallets; `set_config` controls write only their own fields and carry the rest over from on-chain. If the configured admin is not a Squads vault (localnet only), direct signing is allowed, clearly labelled.

- **General controls** (`#general`), the cross-cutting settings:
  - **Emergency** strip: paused, fulfil halted, operator active or revoked; `pause` and `revoke_operator` (pauser key or admin, signed directly, no time lock), `unpause` and `clear_fulfil_halt` (Reserve Admin, through Squads). `clear_fulfil_halt`'s default NAV bounds centre on the published NAV (`navPerShare` floored at 1, 0 with no shares), which it checks; fills centre on the conversion NAV.
  - **Watch · last 24 hours:** the operator key's registrations, closes, filings, payments and fees from the accounts' timestamps, and red flags on the payments account (owner change against `PAYMENTS_OWNER`, operator-owned, delegate, close authority, frozen).
  - **Roles & multisig:** the Squads status, time lock and every live proposal (scanned back 256 indices; Approved ones count even below the stale index) plus the last finished ones, with approve, reject (Active), cancel (Approved) and execute; a `set_config` proposal records the values it was built against in its memo, and the app refuses to execute it once one of them has moved (stale carry; app-side only, the Squads UI skips it); the create → approve → execute flow explained once; the roles; a role change is a `propose_role` proposal (an unexpired handover to another key is cancelled first with `cancel_pending`, in the same proposal), then the new key signs `accept_role` itself from the **Pending handovers** screen (ADR 0020); the admin can cancel a pending handover (`cancel_pending`).
  - **Coverage & reserve limits:** coverage ratio c, `max_tvl`, `max_cover_per_guarantee`; one `set_config` (no per-agency cap, ADR 0019). A change to c, `max_nav_move_bps` or `stress_buffer` is proposed as `refresh` → `set_config` → `refresh`, so the mode reflects the new values when it executes.
  - **Allowlist & accounts:** allowlist root, treasury, payments, mints; `set_allowlist_root` (the root of the server's `ALLOWLIST`, the list the proofs come from; a browser-sent list must match it), `set_payments_account`.
- **Money in & out** (`#money`): each flow with its settings. Operator and Investor steps are one-line context rows (role tag, live total, link to `/operator`, `/investor` or `/reserve`); charts stay on `/reserve`.
  - Fill proposals carry `nav_bounds` from a tolerance field (default ±1% around the conversion NAV) and show why each queue head would not fill now (needed vs available, price limit, under-coverage, TVL, halt, pause; preview). Deposit fills stop before the first request whose owner is off the current allowlist.
  - In: **deposits** (`fulfil_deposits`; `min_request`, `max_request`), **guarantee fees** (`fee_take_bps`), **BRS issuer income** (Nora → inbox → `sweep_income`; inbox balance, swept total, last statements; `income_take_bps`, fail-closed cap 0 until spec §12 Q47).
  - Out: **redemptions** (`fulfil_redeems`, gated by free capital; whole fills), **claim payments** (`max_claim_per_call`, `max_claim_per_period` over 31 days; above the per-call cap only the amount the admin approved with `approve_claim`, ADR 0021). The admin parks a stuck queue head (`cancel_deposit` / `cancel_redeem` as admin, ADR 0030); anyone sends `advance_queue_head`.
- **Allocation** (`#allocation`, alias `#reserve-assets`): "BRS today, more assets through adapters" (ADR 0018). Composition shows BRS plus the income inbox kept apart, "100% BRS (pilot)", with the settlement floor as a marker ("Min in BRS (settlement token): 100%"). **Expand with adapters** explains how a new asset is added (upgrade with the adapter instructions; whitelist an adapter with its cap, share limit and own price feed; lower the settlement floor; allocate and deallocate within the gates), lists TESOURO as the first candidate with its blocker (no Etherfuse BRS path), and shows the per-adapter table (`VaultConfig.adapters`: cap, share limit, price feed, allocated) and the planned instructions. Controls: "Min held in the settlement token" (composed as `caps.min_settlement_bps`; the program stores its complement `caps.max_allocated_bps`, read through the client's `minSettlementBps`), and the per-adapter price feed and share limit (`AdapterEntry.max_share_bps`, reserved before the freeze) shown as planned.

## Hardening

- Every route checks the RPC's genesis hash against the cluster (mainnet refused); errors cut URLs to their host.
- Read routes: CDN `s-maxage=3, stale-while-revalidate=10`, and an in-process cache (3 s; 1 s for a `?fresh=` read after a transaction).
- Every response: `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`. Pages: a nonce CSP in report-only mode (`proxy.ts`), enforced after the demo.
- A Vercel WAF rate limit is staged in `docs/waf-rule.md`, applied only once confirmed.

## Seed scenario

A script (`scripts/seed.ts`, localnet and devnet) that drives the program into the demo's starting state: a funded reserve from the capital wallet, a few guarantees (at c = 0.25, as on devnet; ADR 0028), one paid fee, one swept month of issuer income with a remainder left in the income inbox, and an under-coverage scenario for step 5. It reuses the protocol's devnet scripts and outputs unsigned transactions where admin authority is needed.

## Tests

- Vitest for formatting, view models and the gate preview against the client's math mirror.
- Playwright for the four routes against a seeded localnet (Surfpool), no watch mode.

## Not in scope

Agencies, tenants, PIX integration, Auth0, i18n, mainnet.
