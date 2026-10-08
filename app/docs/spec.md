# MUTAV pilot app — spec

*2026-10-06. Built during Colosseum Crypto World's Fair (Sep 14 – Oct 12, 2026). Pattern: the mutav-pulse frontend (Next.js app reading the protocol through a typed client).*

## Purpose

A small web app that shows the MUTAV reserve program working on Solana devnet. It is built for two audiences:

- **Judges and investors**, who see the live reserve and a guided demo of the full guarantee flow.
- **MUTAV's team**, who runs the operator and admin actions from a connected wallet during the pilot demo.

It is a demo and reference app. Production surfaces (agency platform, KMS-backed operator, Auth0) stay in `mutav-app`, which will port these screens after the hackathon (mutav-app #369).

## Stack

- Next.js 16 (App Router), React 19, TypeScript, Bun, Tailwind 4, Radix / shadcn components, React Flow (protocol diagram), Vitest, Playwright.
- Solana: `@mutav-finance/mutav-protocol-solana` (Codama client, read helpers, math mirror, allowlist builder), `@solana/kit`, wallet-standard connection (Phantom, Solflare, Backpack). Squads v4 SDK for admin proposals.
- Brand: vendored from the `brand` repo into `branding/` via `bun brand:import` (never edited here).
- Deploy: Vercel, team `mutav`, at `reserve.mutav.finance` (the wildcard DNS already resolves).

## Rules

- **No keys.** The app composes transactions; the connected wallet signs. No secret material in the repo, env or code. Admin actions are Squads proposals signed by members' wallets.
- **Cluster by env:** `NEXT_PUBLIC_CLUSTER` = `localnet` (Surfpool / local validator seeded by the protocol's dry-run scripts) or `devnet`. Mainnet is refused.
- **Read the chain, don't mirror it.** Every number on screen comes from on-chain accounts via the client's read helpers. Previews (for example the solvency gate) use the client's math mirror and are labelled as previews.
- **Language:** English for the hackathon. MUTAV's guarantee is a *fiança*: say "guarantee fee", "claim payment", "reserve". Never "premium", "insurance", "policy", "yield vault".
- **Not open to public investment.** The pilot runs on MUTAV's own capital. Capital requests are gated by the on-chain allowlist (KYC off-chain); in the pilot the allowlisted capital provider is MUTAV's capital wallet. Investor-facing copy says so.
- **Roles are explicit.** Every page tags each action and each number with the role that signs or owns it: Reserve Admin, Operator, Investor (or Anyone for cranks), one colour and one shape per role (`lib/roles.ts`, `components/RoleTag.tsx`).

## Routes

### `/` Landing

- The one-line story: MUTAV is an institutional rental guarantor in Brazil; every guarantee is backed by a reserve anyone can verify on Solana.
- A live reserve strip (reserve, coverage required, free capital, NAV, active guarantees, mode) linking to `/reserve`.
- How it works in three steps (agency registers a lease → reserve covers it, gated by solvency → claims are paid from the reserve, never blocked).
- The protocol diagram (React Flow): reserve, escrows, treasury, payments account, operator, admin (Squads), Nora BRS, and the solvency gate between them.
- Calls to action: "See the reserve" (`/reserve`), "Run the demo" (`/demo`).
- Design reference: the full wordmark over the hero; past the hero, a compact pinned bar with a solid CTA (see the "two-nav swap" pattern, compositor-only animations).

### `/reserve` Public transparency

Read-only, no wallet needed.

- **Health:** `stable_assets`, `coverage_required`, surplus, `free_capital`, NAV per share, shares outstanding, `mode` (Normal / UnderCovered), `fulfil_halted`, paused, last refresh.
- **Coverage:** remaining cover by guarantee (default and exit legs), active guarantee count, per-agency exposure.
- **Claims timeline:** each claim with on-chain timestamps for filed → paid → settled, the PIX settlement hash, and late flags. This is the "proven speed" view.
- **Money flows:** guarantee fees in (net to reserve, take to treasury), issuer income in (Nora's revenue share, swept per statement by `sweep_income`, ADR 0017) and the untracked income-inbox balance, claim payments out, deposits and redemptions.
- **Capital queue:** pending deposits and redemptions in FIFO order.
- **Disclosures:** BRS is issued by Nora; its freeze authority is a single Nora wallet; a freeze stops outflows until thawed. Pilot capital is MUTAV's own. Built-later features (partial fills, claim notices, adapters).
- A "Refresh" button that sends the permissionless `refresh` instruction from any connected wallet.
- Links to every account on a Solana explorer (devnet).

### `/operator` Operator console

During the launch and the hackathon MUTAV's team operates the reserve by hand from this page with the operator wallet; later mutav-app's backend sends the same instructions with a KMS-held key. Anyone can read it; actions are enabled only when the connected wallet is `VaultConfig.operator` (localnet and devnet: the wallet signs).

- **Limits now:** the claim-payment cap window (`claim_period_start`, `claim_period_paid` vs `max_claim_per_period`, `max_claim_per_call`), payouts against `payout_sla_secs`, free capital for new guarantees.
- **Console:** a form per operator instruction (shared with `/demo`), each with its on-chain bound shown before signing and the gate preview where it applies. `sweep_income` (ADR 0017) shows the income-inbox balance and previews the split; it sweeps exactly the amount on a Nora statement.
- **Responsibilities:** each instruction, what is done by hand today and what will trigger it in the backend; undocumented triggers say "triggered by the MUTAV platform".
- **Recent activity:** the operator key's last MUTAV transactions, and the last `set_roles` in VaultConfig's recent history, when the RPC keeps history.
- **Safety:** what bounds a compromised operator key (caps, fixed payments account, `revoke_operator`, admin-only config).

### `/investor` Investor view

Read by anyone; actions gated on the allowlist.

- **Allowlist status** of the connected wallet: its Merkle proof (client `buildAllowlist` over `ALLOWLIST`) checked with `verifyAllowlistProof` against `VaultConfig.investor_allowlist_root`. States: allowlisted, not listed (KYC is done off-chain), root unset, list mismatch.
- **Position:** reserve shares, value at NAV now (math mirror, labelled preview), BRS in the wallet, waiting deposits and redemptions, `HolderState`.
- **Queue entries** of the wallet, with `cancel_deposit`, `claim_shares`, `cancel_redeem`, `claim_assets` where the request's state allows them (owner only, no proof).
- **New requests:** `request_deposit`, `request_redeem`, the proof built by the server. Without an allowlisted wallet the view stays visible, read-only.

### `/demo` Guided demo (operator cockpit)

A step-by-step flow for the demo video, run from the operator wallet. Each step shows the instruction, the accounts touched, the transaction link, and how the reserve numbers moved.

1. **Capital in:** the allowlisted MUTAV capital wallet requests a deposit; the admin fulfils it (via `/admin`); shares are claimed.
2. **Register guarantees:** register leases with a live gate preview (math mirror: "fits" / "would be refused"). Register until the gate **refuses** one — the key moment.
3. **Guarantee fee:** `contribute_fees`; NAV rises; the take goes to the treasury.
4. **Claim:** `file_claim`; the provision lowers NAV immediately.
5. **Under-coverage:** show a reserve that is under-covered (seeded scenario), then `pay_claim` **still succeeds** while new guarantees and redemptions are blocked.
6. **Settle:** `settle_payout` with the PIX end-to-end hash; the claims timeline on `/reserve` updates.

Also usable outside the script: a free-form operator panel for each operator instruction. Signer checks come from the program; the UI only warns when the connected wallet isn't the configured operator.

### `/admin` Admin console

For Squads members.

- **Reserve assets** (first section, `#reserve-assets`): what the reserve holds and who manages it.
  - **Composition now:** BRS in `reserve` (`brs_balance`), TESOURO through adapters (0 on devnet, with the reason), the income inbox shown apart as "not yet counted", and the TESOURO share against `max_tesouro_share_bps` (composition bar with the cap marker); `VaultConfig.adapters` with each adapter's cap and allocated.
  - **Who does what:** Nora pays the inbox; the Operator sweeps it (`sweep_income`, on `/operator`); the Reserve Admin sets the TESOURO cap, the price feed and the income take, and later allocates; anyone runs `refresh`.
  - **Controls today:** `set_config` proposals for `max_tesouro_share_bps`, the TESOURO price parameters and `income_take_bps` (program cap 0 until spec §12 Q47), each with its on-chain value, the program's bound and what it does.
  - **Planned:** `whitelist_adapter`, `remove_adapter`, `allocate`, `deallocate`, listed as disabled rows with what gates them; no button sends them. Blocked on a BRS↔TESOURO path (Etherfuse mints against USDC).
  - **Issuer income:** inbox balance, `income_total`, `income_take_total`, the take, and the last swept statements from `IncomeReceipt`s.
- Shows `VaultConfig`: roles, caps, price params, take rate, feature flags, the treasury and payments accounts, the allowlist root.
- Actions, each built as a **Squads vault-transaction proposal** that members approve and execute from their wallets: `fulfil_deposits`, `fulfil_redeems`, `pause` / `unpause`, `clear_fulfil_halt`, `set_config` (caps), `set_allowlist_root` (with the client's Merkle builder).
- Proposal list with status (pending, approved, executable, executed) and the time-lock countdown.
- If the configured admin is not a Squads vault (localnet only), allow direct signing, clearly labelled.

## Seed scenario

A script (`scripts/seed.ts`, localnet and devnet) that drives the program into the demo's starting state: a funded reserve from the capital wallet, a few guarantees (at c = 0.10, as on devnet), one paid fee, one swept month of issuer income with a remainder left in the income inbox, and an under-coverage scenario for step 5. It reuses the protocol's devnet scripts and outputs unsigned transactions where admin authority is needed.

## Tests

- Vitest for formatting, view models and the gate preview against the client's math mirror.
- Playwright for the four routes against a seeded localnet (Surfpool), no watch mode.

## Not in scope

Agencies, tenants, PIX integration, Auth0, i18n, mainnet.
