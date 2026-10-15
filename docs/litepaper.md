# MUTAV: A Verifiable BRL Guarantee Reserve on Solana

**Technical litepaper for the Colosseum pilot**

v0.4 · October 2026 · Not legal advice. Not an offer of securities. Not independently audited.

---

## Abstract

MUTAV is an institutional *fiador*. It gives Brazilian tenants a paid rental guarantee (*fiança onerosa*, Lei 8.245/91 art. 37 II) through the real-estate agencies that already run their leases, so no personal guarantor or locked-up deposit is needed. Each partner agency pays MUTAV one consolidated bill a month, by boleto or PIX, for the guarantee fees of all its leases. The `mutav` Solana program records every guarantee with its remaining *valor afiançado* (the fiança's R$ ceiling) and custodies a BRL reserve that refuses any capital movement that would leave that cover below required coverage: the governed coverage ratio `c` times the remaining cover, never less than the filed claims plus a stress buffer. It never refuses a claim payment for coverage or pause: only the guarantee's remaining *valor afiançado*, the liquid BRS and the operator's caps bound it. The caps limit what a single hot key can move; a payment above the per-call cap needs the time-locked admin's approval of the exact amount, and MUTAV may pay first from its own bank account while the reserve reimburses it. The program is live on devnet (release `v1.0.0-devnet`, demo reserve at reserve.mutav.finance); a capped mainnet pilot follows once its start conditions are met (program cap R$1M with R$120k of starting capital plus R$170k a month from month 2, reaching the cap in month 6, [ADR 0028](decisions/0028-pilot-parameters.md)). During the pilot the reserve is not open to public investment. It is not a yield product, and nothing here promises a return.

**For Colosseum judges.**

| Criterion | Where |
|---|---|
| Functionality | §12(a): live devnet program, invariant tests, lifecycle demo |
| Impact | §1: 17.8M rented households; 5 of 7 agencies interviewed front the landlord's rent |
| Novelty | §8: per-guarantee liabilities on-chain gate every capital exit, and claim payments are never gated by required coverage |
| UX | §7: agencies keep their workflow (one monthly bill by boleto, PIX or BRS, a transparency page) and never call the program |
| Open source | MIT; the on-chain program hash matches the build (§6, §11, §12) |
| Business plan | §2.1 and Figure 1b; open decisions in §13 |

---

## 1. The problem: rental guarantees in Brazil

Brazilian rental law lets a landlord ask for exactly one guarantee per lease, chosen from four forms: a cash deposit (*caução*), a guarantor (*fiança*), *seguro-fiança*, or an assignment of fund quotas (Lei 8.245/91 art. 37). A second guarantee is void, and demanding one is a criminal contravention (art. 43). The one guarantee a lease carries is the landlord's only protection.

**Market size.** In 2024 Brazil had **17.8 million rented households**, 45% more than in 2016 and 23% of all households (IBGE, PNAD Contínua). *Seguro-fiança* alone had about **R$1.9bn of written volume** in the 12 months to February 2025, up 195% between 2020 and 2024 (CNseg). No primary national series measures all paid guarantees. As a labelled **estimate**: 17.8M households × a paid-guarantee share of one third to one half (unconfirmed) × an assumed average rent of R$2,000 a month × a guarantee fee of 8–10% of rent each month (the public paid-guarantee band) gives **roughly R$11–21bn a year** of guarantee fees. QuintoCred's closure (below) shows how much demand can be displaced at once: about 45,000 contracts.

**Table 1. Why existing options fail**

| Option | What the tenant gives up | What fails for the agency or landlord |
|---|---|---|
| Personal *fiador* | Needs a relative or friend with a paid-off property | The pool is shrinking (paid-off owner housing −5.2 pp, 2016–24) |
| *Caução* (cash deposit) | Up to 3 months' rent, locked up for the whole lease | Capped at 3 months (art. 38), while an eviction routinely takes 6–12+ months |
| *Seguro-fiança* | Many applicants rejected | Payment after weeks; "natural wear" disputes; some accept a filing only after two missed months |
| *Título de capitalização* | Several months of rent paid upfront, refunded at a low rate | Covers little relative to the capital it locks up |
| Fintech guarantor (*garantidora*) | Little; the cheapest option | Opaque reserves; reported unilateral cancellation (*exoneração*), partial and slow payment |

The last row has already failed at scale. QuintoCred stopped writing new contracts in June 2025 and left about **45,000 contracts and 3,000 partner agencies** without a guarantor; public reporting and our analysis suggest it priced well below market, held no visible reserve and underwrote loosely. Regulated carriers have also left: FF Seguros withdrew from individual *seguro-fiança* in 2024, and Seguradora Infinite entered extrajudicial liquidation in May 2026.

We interviewed seven agency leaders in the South of Brazil (books of about 35 to 1,000 properties). Their mean pain score for guarantees was **3.4 out of 5**, and **5 of 7 front the landlord's money themselves** while they wait for the guarantor, citing unilateral cancellation, waits of 60–90 days, partial payments and no visibility. These were short discovery interviews; they did not test price.

**The insight.** Agencies don't distrust guarantees; they distrust guarantors. They front the landlord's rent because they cannot see whether, or when, the guarantor will pay. MUTAV makes the two things they cannot see, the reserve and the payment clock, public and bound by rules. A second insight shapes the product: while any guarantee is in force, the landlord cannot get the 15-day eviction *liminar* (art. 59 §1º IX), so how a guarantee ends matters as much as how it pays (§7).

---

## 2. MUTAV in one page

*MUTAV is a guarantor whose reserve can't be drained below what its rules say it must back, and whose claim payments are never blocked by the coverage gate or a pause.*

MUTAV is designed to act as an **institutional *fiador*** under Lei 8.245/91 art. 37 II and Civil Code arts. 818 ff. Each guarantee is a **limited fiança** (CC 823) whose ceiling, the *valor afiançado*, includes interest, penalties and court costs. MUTAV waives the *benefício de ordem* and signs as *principal pagador* (CC 827–828). The landlord signs the instrument and gives the agency a mandate to receive payments and give *quitação*. Payments come first from the on-chain reserve, with MUTAV's own funds behind it as a backstop disclosed on-chain (§8). Whether this structure remains a *fiança*, rather than a regulated insurance or securitisation activity, is under review with counsel; it is never sold or operated as *seguro-fiança* or a *título de capitalização*.

Five actors take part:

- **Tenant:** owes a monthly guarantee fee (*taxa da fiança*), set at signing, and pays it to the agency with the rent.
- **Landlord:** the creditor of the fiança; signs the instrument and is paid through the agency under a recorded mandate.
- **Agency (*imobiliária*):** distributes the guarantee, registers leases, collects the fee with the rent, pays MUTAV one consolidated bill a month by boleto or PIX, and files payment requests (*pedidos de pagamento*).
- **MUTAV** (the Brazilian operating company is the fiador; whether a separate entity may hold the reserve is under counsel review): underwrites, bills agencies, approves payment requests, runs payments and the platform, and holds the operator key and the admin multisig seats.
- **Capital providers:** allowlisted wallets that hold reserve shares, starting with MUTAV's own disclosed capital wallet (§9).

MUTAV keeps the legal form agencies already accept and changes three things, each aimed at one complaint:

1. **The price never goes below market** (against the QuintoCred failure).
2. **A reserve exists from the first contract, and anyone can verify it** (against opaque balance sheets and *exoneração*).
3. **The payment clock is public** (against slow and partial payment). MUTAV pays within a contractual term N from a **complete payment request** (N under counsel review; `request_complete_ts` and `payment_term_secs` are carved for a later upgrade, §7). The working targets are ≤4 calendar days from the agency's request to PIX and ≤15 from the rent due date, each step timestamped on-chain.

The promise leads with payment, not a coverage multiple: paid on time, never partially beyond what was approved, no *exoneração* outside the statutory 120-day notice (to be recorded on-chain), and a checkable reserve. Timing figures are working targets until counsel confirms how they bind MUTAV (CDC art. 35).

**Table 2. MUTAV against what agencies choose today** (public figures only)

| | Approval | Time to pay | Unilateral *exoneração* | Reserve visibility |
|---|---|---|---|---|
| *Seguro-fiança* | Underwritten; a large share rejected | Up to 30 days from complete documents (SUSEP Circ. 621/2021 art. 43); document requests pause the clock | Per contract terms | Regulated solvency reports, aggregate only |
| Fintech *garantidora* | Fast, app-based | Published SLAs of a few business days; agencies report 60–90-day waits | Reported by agencies | None public |
| **MUTAV** | Underwritten off-chain, per lease | Working target ≤4 days request → PIX, ≤15 days due date → PIX (under legal review); timestamped on-chain | None during the fixed term; afterwards only the statutory 120-day notice (LI 40 X), to be recorded on-chain, with cover held through the notice and the claims tail | Per-guarantee cover and the reserve, on-chain, recomputable |

Agencies never call the program; they work in the MUTAV platform, pay one monthly bill, and see the reserve through a transparency page. The chain serves the **capital and trust side**: a reserve anyone can verify, a rule the program enforces, and an operator whose powers are bounded. The reserve is **operational infrastructure that keeps guarantees healthy, not a yield product**.

```figure id="fig-1-at-a-glance" title="Figure 1. MUTAV at a glance"
Two horizontal colour bands. Top band labelled "OFF-CHAIN · MUTAV PLATFORM, PSP AND PIX". Bottom band labelled "ON-CHAIN · SOLANA".
Top band, left to right: [Tenant] --"taxa da fiança, with the rent"--> [Agency (imobiliária)]. Dashed record arrow from [MUTAV platform] back to [Agency], labelled "monthly bill (1st): 1 per agency, 1 line per guarantee". Solid arrow [Agency] --"pays the bill by boleto or PIX (due on the 10th)"--> [Licensed PSP (boleto · PIX)] --"BRL settles"--> [MUTAV platform / bank account] --"PIX (BRL)"--> [Authorized BRS minter] --"BRS"--> crosses into the bottom band.
Second fee path (dashed-dot money arrow, labelled "stablecoin path"): [Agency] --"BRS via Solana Pay link/QR (bill reference)"--> crosses straight into the bottom band to [Operator BRS account], bypassing the PSP and the minter.
Bottom band: the BRS lands on a small [Operator BRS account] node --"contribute_fees(invoice_ref_hash), 1 per agency bill"--> a split dot inside the [mutav program] boundary: "net" --> [Reserve]; "take" --> [MUTAV treasury]. The take arrow starts inside the program box.
Return path: [Reserve] --"claim payment (BRS)"--> [MUTAV payments account] --crosses up--> [Offramp BRS to BRL] --"PIX"--> [Agency] --"under the landlord's mandate"--> [Landlord]. The minter (in, left) and the offramp (out, right) are visibly distinct boxes.
Side box, bottom band, right: [Capital providers (allowlisted)] <--> [FIFO queue] <--> [Reserve], arrows labelled "deposit at NAV" and "exit at NAV, from surplus only".
No amounts anywhere. Legend: solid arrows = money, dashed = records; "guarantee fees (monthly agency bill)".
Alt text: the tenant pays the guarantee fee with the rent to the agency; once a month MUTAV bills each agency one consolidated invoice, which the agency pays by boleto or PIX through a licensed provider, or directly in BRS through a Solana Pay link; MUTAV converts any BRL into BRS through an authorized minter and records each invoice on-chain with contribute_fees, which sends the take to the treasury and the rest to the reserve.
```

### 2.1 Business model in one table

Revenue is the *taxa da fiança*, billed monthly to partner agencies. Claim payments, operating costs and the reserve's cost of capital come out of it. Every figure below is a **working parameter** from MUTAV's business plan, not final pricing.

| Item | Working parameter |
|---|---|
| Average rent | R$2,200 a month |
| *Taxa da fiança* | 9%, 12% or 15% of monthly rent by tenant score band (scores below 400 refused); modelled at 10% = **R$220 per lease per month** in the 02 business plan; the pilot plan uses 12% (ADR 0028) |
| Who pays whom | Tenant → agency, with the rent. Agency → MUTAV, one consolidated bill a month, boleto or PIX |
| *Valor afiançado* per lease | Default sub-limit 12× rent (under legal review) + exit sub-limit 6× rent = **R$39,600** |
| Book | Pilot: 17 new leases a month, 97 by month 6 at the R$1M cap (ADR 0028). Operating plan: ~170 leases across up to 5 partner agencies (~34 each); gross fees ≈R$37,400 a month at full book (02 business plan) |
| Expected claims against fees | ≈20% for rent arrears alone (RS base delinquency, 2.01%); ≈21–37% once exit debts are included, by scope (§12). The pilot plan assumes a rounder 2.5% (ADR 0028) |
| MUTAV revenue | Take `t` on each fee (20% in the devnet and pilot config, ADR 0028; final rate open; program maximum 30%) |
| Reserve | Working target R$300k (02 business plan); the pilot starts at R$120k plus R$170k a month from month 2 and reaches the R$1M cap in month 6 (ADR 0028); sizing rule open (§8) |
| Reserve growth | Net guarantee fees and issuer partnership revenue (§10) build the reserve, and a larger reserve backs more required coverage, so more leases. Issuer partnership revenue is a separate line from fees, never counted in coverage, and nothing here is a yield promise |

```figure id="fig-1b-agency-month" title="Figure 1b. One agency, one month"
Left-to-right flow (Sankey or stacked flow), labelled "working parameters, illustrative".
[34 guarantees in force × R$220] = [Consolidated bill R$7,480] --"paid by boleto or PIX"--> [BRL at MUTAV] --"1:1 via authorized minter"--> [7,480 BRS]; a thinner parallel branch [Consolidated bill] --"or paid in BRS (Solana Pay)"--> [7,480 BRS] --"contribute_fees (1 fee receipt)"--> split into [MUTAV treasury: take t (20% devnet config; final rate open)] and [Reserve: net].
Side branch from the reserve: "expected claim payments ≈ 20% of fees (rent arrears, RS base) to ≈ 30% (with exit debts, scope B)".
Reserve box annotation: "c governed: full backing or expected-loss sizing (§8)".
Footnote: "Not a return; the final take and the sizing rule are open."
```

---

## 3. Why a chain, and why Solana

The obvious alternative is a segregated bank escrow account with a monthly auditor's attestation. The chain adds four things that baseline cannot.

1. **The rule binds MUTAV itself.** There is no `withdraw_surplus` instruction. Capital leaves only from surplus over required coverage, and, once the claim-notice gate ships, only while no missed-rent notice is open. An escrow statement shows a balance once a month; it cannot stop the operator in between.
2. **Continuous, permissionless recomputation.** Anyone can call `refresh` and recompute coverage, surplus and NAV from public accounts, at any time.
3. **Per-guarantee liabilities and payment timestamps are public.** Each lease's cover, every provision, every claim payment and a hash of its PIX settlement are addressable accounts and events. That answers the agencies' "no visibility" complaint directly.
4. **Solana specifically.** A 30-month lease needs a handful of its own transactions, and fees arrive as one `contribute_fees` per agency per month for all its leases. Base fees are negligible; the larger cost is rent-exempt deposits: about 0.0035 SOL per `Guarantee` and 0.0019 SOL per monthly fee receipt, shared by every lease on the bill (about 0.002 SOL per lease over 30 months at ~34 leases per agency; our estimates, benchmarks to follow). Squads v4 and `solana-verify` make upgrade governance observable, and a BRL stablecoin and tokenized Brazilian federal bonds already exist on Solana mainnet.

We argue for Solana on fit, not necessity: the business model is chain-agnostic (§5).

---

## 4. Team and traction

**Founder-market fit.** One co-founder has 5+ years building in Web3 and long-standing ties to the regional real-estate market; the other, a design engineer and urban planner, took a consumer Web3 fintech product from 0 to 30,000 users. A real-estate advisor with 30 years in the RS/SC rental market opens the agency cohort, and a senior blockchain security engineer advises on the program.

**Traction, as counts.**

- 7 documented agency discovery interviews (§1).
- 19 agencies have signed letters of intent after seeing the platform; none is a customer yet.
- The MUTAV platform is built and pre-launch at app.mutav.finance and admin.mutav.finance: agency onboarding with staff review, lease and guarantee registration with an immutable snapshot of the terms, score-banded pricing, a seven-state guarantee lifecycle, default notices, **monthly consolidated agency bills issued automatically** (one per agency, one line per guarantee), PIX settlement in sandbox, boleto modelled in the data and UI with issuance pending a licensed payment provider (not yet contracted; it needs the company's CNPJ), a hash-chained audit log and an admin console.
- Devnet program: live since 12 October 2026, release `v1.0.0-devnet`, with the pilot app at reserve.mutav.finance reading it (§12).
- No live guarantee has been issued yet.

---

## 5. Design principles and prior art

Six rules shape every mechanism ([spec §1](spec.md#1-principles)).

1. **The business model is fixed and chain-agnostic.** The program does not price, underwrite or decide payment requests.
2. **Only what is verifiable on-chain counts** toward the reserve, NAV or coverage. Losses are recognised early, when a payment request is approved. The trust that remains in token issuers is disclosed.
3. **MUTAV operates every chain touchpoint.** Agencies, tenants and landlords never call the program; an agency paying in BRS signs only a token transfer.
4. **The coverage gate protects the reserve. It never blocks a claim payment.**
5. **Start tight.** Hard on-chain caps bound every outflow and every new liability. Only the time-locked multisig raises them.
6. **Upgrade without migration** ([ADR 0011](decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)).

**Prior art.** Nexus Mutual allows NXM redemptions only while its capital ratio MCR% is above 100%, where MCR is active cover divided by 4.8, a gearing heuristic ([Nexus docs](https://docs.nexusmutual.io/protocol/capital-pool/mcr/)). MUTAV's gate works per guarantee and requires `c` × remaining cover, with `c` a governed parameter (between 0.10 and 1.0; 0.25 on devnet and in the pilot, §8). OnRe contributed patterns for a Squads-held admin, two-step role handover, supply caps and per-request partial fills, and its published audits informed our own review; our async request lifecycle follows [solana-foundation/vault](https://github.com/solana-foundation/vault) (MIT). To our knowledge, MUTAV is the first BRL guarantee reserve on Solana whose capital flows are gated by on-chain coverage of its liabilities (Appendix G).

---

## 6. Architecture on Solana

*Sections 6–11 describe the design. Where the v1 devnet binary does less (a feature carved in the frozen layout for a later upgrade), the text says so; status is in §12 and the deferred list in §13.*

### Programs

The protocol has four components ([ADR 0002](decisions/0002-core-program-and-capped-adapters.md)):

- **`mutav`**, the core program: custody, the share mint, NAV, the guarantee exposure registry, the coverage gate, the async queue, roles and claim payments.
- **`mutav-adapter-interface`**, a crate fixing the discriminators and layouts every venue adapter implements (`deposit`, `withdraw`, `position_value`).
- **`mutav-adapter-mock`**, for tests (not deployed on devnet).
- **One adapter program per venue, added later.** The pilot reserve holds BRS only ([ADR 0018](decisions/0018-brs-only-pilot-reserve.md)); more assets come in through adapters in a later program upgrade ([ADR 0027](decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), proposed). The v1 binary has no adapter instruction, so nothing can leave BRS. TESOURO is the first candidate and ships as **interface and mock only** until the price-account layout and a BRS↔TESOURO conversion path are confirmed.

A Codama-generated TypeScript client composes instructions and holds no keys; the MUTAV platform signs.

### Accounts

`VaultConfig` is seeded by the reserve mint (`["config", reserve_mint]`), so the program runs one reserve per mint: each currency has its own reserve, coverage and NAV. Every other PDA includes the config address in its seeds. Reserve balances are split across four token accounts, so a freeze targeted at one does not trap every balance; `refresh` detects a frozen reserve account and counts it as zero liquid BRS, which shows as under-coverage. Two more token accounts hold money the reserve does not count: the *income inbox* for issuer income (§10) and an `unsolicited` account for transfers nobody booked ([ADR 0024](decisions/0024-unsolicited-money-and-backstop.md)). Each lease gets exactly one `Guarantee` account, and every agency bill, issuer statement, claim filing and capital request gets its own PDA, which makes each idempotent and publicly addressable (Appendix F, [spec §3](spec.md#3-accounts)). Only the reserve maths goes on-chain: covers, amounts, statuses, timestamps, and opaque ids or salted hashes for leases, agencies, notices and PIX payments. No rent, name, CNPJ or document is stored ([ADR 0019](decisions/0019-v1-layout-for-the-devnet-release.md)).

**The v1 layout is frozen.** Every account carries a version and zeroed padding sized for the features already planned, so each later feature is a carve from padding or a new account, never a migration. Since the `v1.0.0-devnet` release, CI refuses any interface change that is not append-only.

**The vault-authority PDA signs for the reserve and mints shares. It will never be passed into an adapter CPI.** Once adapters ship, each acts only through its own capped sub-authority PDA, which owns only that adapter's staging account, and after every CPI the core reloads every vault token account and the share supply and rejects any change other than the expected one.

### Roles

**Table 3. Roles and powers**

| Role | Key custody | Instructions | Time-locked? |
|---|---|---|---|
| Admin | Squads v4 admin multisig vault (`VaultConfig.admin`), short time lock | `set_config`, `propose_role` / `propose_admin` / `cancel_pending`, `set_guardians`, `revoke_pauser`, money accounts, allowlist, `clear_fulfil_halt`, `unpause`, `fulfil_deposits`, `fulfil_redeems`, `approve_claim`, `cancel_*` (parks the request). Later: adapters, `allocate`, `deallocate`, unsolicited money | Yes, except `pause` and `revoke_operator` |
| Upgrade authority | A second Squads v4 multisig with the same members, long time lock | Program upgrades, `initialize` | Yes |
| Operator | Hot key used by the MUTAV platform (signed by hand during the launch; later held in KMS) | `register_guarantee`, `close_guarantee`, `contribute_fees`, `sweep_income`, `file_claim`, `pay_claim`, `settle_payout`. Later: `amend_claim`, `refile_claim`, `reinstate_guarantee`, the missed-rent notices and the end-of-lease records | No (bounded by caps) |
| Pauser | Separate key | `pause`, `revoke_operator` | No |
| Guardians | Up to 3 keys appointed by the admin | `pause` only | No |
| Proposed key | The key named in a pending handover | `accept_role`, `accept_admin` | No |
| Capital provider | Own wallet, allowlisted by Merkle root (KYC off-chain) | `request_*`, `cancel_*`, `claim_shares`, `claim_assets`; a wallet that holds shares can redeem without the allowlist | No |
| Anyone | — | `refresh`, `advance_queue_head` | No |

Operator and admin have separate duties ([ADR 0020](decisions/0020-operator-admin-separation-and-recovery.md)): the operator owns contract facts and the claim cycle; the admin owns the reserve's financial health through ceilings, never the merits of one contract. Today MUTAV holds both; later they may be separate companies, and no instruction assumes they are the same party. Every role changes hands in two steps: the admin proposes, and the new key accepts within 72 hours, so a mistyped key never takes a role. What a stolen operator key can and cannot do is in §13. Only amounts, timestamps and salted or keyed hashes cross the trust boundary; no names, documents or addresses go on-chain. Every token movement and state change emits an `emit_cpi!` event for the indexer and transparency page.

**Runtime constraints.** Adapters will make one level of CPI, and aggregates such as `remaining_cover_total` are updated incrementally rather than by iterating guarantees ([spec §14](spec.md#14-upgrade-readiness)). The PIX legs, not the chain, set the payment pace.

```figure id="fig-2-architecture" title="Figure 2. System architecture and trust boundary"
Two columns separated by a vertical dashed line labelled "trust boundary: only amounts + hashes cross this line; per agency bill only amount + invoice_ref_hash".
Left column "MUTAV platform (off-chain)": boxes [Agencies], [Tenants], [Landlords], [mutav-app / Convex] containing a small [Monthly billing job (1st)], [Operator key (hot key; hand-signed now, KMS later)], [Licensed PSP: boleto · PIX collection], [Authorized BRS minter / offramp: BRL ↔ BRS], [Indexer], [Transparency page], [Admin console]. Dashed arrow from [Agencies] to [Licensed PSP] labelled "pays monthly bill".
Right column "Solana": central box [mutav core program] containing [Vault authority PDA]; below it four token accounts [reserve], [pending_deposits], [pending_redemptions], [claims]; to the right [Adapter program(s)] (dashed, "later") each with a [capped sub-authority PDA] and [staging account]; top right [Squads v4 admin multisig + time lock] and [Squads v4 upgrade multisig + longer time lock]; top left [Pauser key] and [Guardians].
Arrows coloured by signer: orange (operator) from the operator key to core labelled register_guarantee, close_guarantee, contribute_fees (1 per agency bill), sweep_income, file_claim, pay_claim, settle_payout; blue (admin) from Squads to core labelled fulfil_deposits, fulfil_redeems, set_config, approve_claim, roles; green (capital provider) from a wallet icon labelled request_deposit, request_redeem, claim_shares, claim_assets; grey (anyone) labelled refresh, advance_queue_head; red (pauser, guardians) labelled pause, revoke_operator.
Arrow from core to adapter (dashed, "later") labelled "CPI signed by sub-authority only; post-CPI checks".
Events arrow from core back across the boundary to [Indexer] -> [Transparency page], labelled "emit_cpi! events".
Callout near the client: "TS client composes transactions; holds no keys".
Alt text adds: a licensed payment provider for boleto and PIX collection, and an authorized BRS minter and offramp.
```

**Stack and provenance.** Anchor 1.2.0, Solana CLI 4.1.2, LiteSVM, Mollusk, Surfpool, Squads v4 and `solana-verify`. The async request lifecycle follows solana-foundation/vault's design (MIT); no code from it or from OnRe is copied. MIT ([provenance](provenance.md)).

---

## 7. Guarantee lifecycle

One lease, from registration to the end of the fiança ([spec §5.2–§5.4](spec.md#52-guarantees-operator), [ADR 0012](decisions/0012-fianca-aligned-guarantee-lifecycle.md)):

**Register.** The agency activates a lease in the platform, and MUTAV underwrites it off-chain. The operator calls `register_guarantee` with an opaque guarantee id, an opaque agency id, `refs_hash` and two absolute covers; the rent stays off-chain. Each guarantee is one **limited fiança** (CC 823): its ceiling, the *valor afiançado*, is `default_cover + exit_cover`, accessories (interest, penalties, court costs) included. The two legs are sub-limits of it: a default sub-limit for rent and charges in arrears, and an exit sub-limit for the tenant's liquidated debts at the end of the lease (damage beyond normal wear, court costs the tenant owes, abandonment and repossession costs, other listed debts; the early-termination penalty is a reserved category, disabled until decided). A fiador pays what the tenant owes; it does not fund the landlord's eviction (CC 821). The instruction checks the per-guarantee cap and requires the added cover to fit in free capital. `contract_cap_hash` (the signed cap schedule) and `landlord_mandate_hash` are carved in the account for a later upgrade. There is no on-chain per-agency cap ([ADR 0019](decisions/0019-v1-layout-for-the-devnet-release.md)): per-agency figures are derived from the guarantee accounts. No instruction changes the covers afterwards ([ADR 0006](decisions/0006-per-lease-absolute-coverage.md)), and NAV does not change.

### Monthly billing of partner agencies

The tenant owes the *taxa da fiança*, and the agency collects it with the rent in its own rent flow. On the 1st of each month the MUTAV platform issues each partner agency **one consolidated bill**: a line per guarantee in force (guarantees in arrears included), plus a one-time activation line in a guarantee's first month (working parameter). It is due on a fixed day set in the partnership agreement; the platform uses the 10th. The agency pays it by **boleto** or **PIX** through a licensed payment provider (PSP). MUTAV bills only its own fee: any third-party charge on the same bill is split to its owner at settlement and never enters MUTAV's accounts, the reserve or NAV.

MUTAV receives BRL, converts it 1:1 into BRS through an authorized BRS minter, and the operator calls `contribute_fees(invoice_ref_hash, amount)` once per paid bill, for its guarantee-fee lines only. The fee receipt (an `IncomeReceipt` of kind `FEE`, at a PDA keyed by `invoice_ref_hash`) makes each bill count exactly once, even if a payment webhook arrives twice. The same instruction sends the take to MUTAV's treasury and the net to the reserve ([ADR 0007](decisions/0007-fee-take-direct-to-treasury.md), [ADR 0009](decisions/0009-separate-mutav-money-flows.md)). NAV rises, no shares are minted, and fees are never paused or gated by coverage. The one refusal is a reserve with no shares outstanding: fees wait with the operator until the first deposit is filled, so they never accrue to a share that does not exist yet ([ADR 0029](decisions/0029-claims-and-capital-rules-in-the-program.md)).

**Paying in stablecoin (designed).** An agency may also pay its bill in a stablecoin: BRS in the pilot, 1:1 with BRL, so there is no FX. The platform shows a Solana Pay link or QR carrying the bill's reference; the BRS goes to MUTAV's operator BRS account, skips the minter and reaches the reserve faster. The agency only transfers tokens and still never calls the program: the operator posts `contribute_fees` for that bill as for any other. Tenants who prefer to pay in USD can settle the BRL fee with USD stablecoins at billing time; the lease and the fiança stay in BRL.

**Reconciliation (proposed).** A bill is recorded on-chain only when the PSP settlement, or the BRS transfer carrying its reference, equals its total; a mismatch or reversal goes to manual review. `invoice_ref_hash` is a keyed hash of the bill's number, period and lines, so the public cannot link receipts to agencies, while each agency, given its preimage, can find its own. Month-end close compares totals billed, settled, minted and recorded; converted BRS waits in the operator's public BRS account only until `contribute_fees`, normally the same day.

**If an agency pays late.** The fiança stays in force. No claim, cover or payment-clock rule depends on the bill being paid (spec PC-7): an unpaid fee is MUTAV's own claim, never a defence against the landlord (CC 837), and claim payments are never reduced by it. On-chain the guarantee's cover still counts in `coverage_required`, and no fee receipt exists until payment, so the reserve misses that month's net fee; unpaid bills are never reserve assets. Off-chain the bill is marked overdue. Grace period, late charges, when MUTAV stops accepting that agency's new registrations, and who bears a defaulting tenant's fee belong in the partnership agreement and are **open**.

Status: bill generation runs in the platform and PIX settlement in sandbox; boleto issuance, the PSP, the minter integration, stablecoin payment and automated `contribute_fees` are not live. The devnet demo shows the bridge with a mocked PSP webhook and a devnet BRS mint, labelled simulated settlement.

```figure id="fig-3b-billing-cycle" title="Figure 3b. Monthly billing cycle"
Swimlane timeline, six lanes top to bottom: Agency | MUTAV platform | Licensed PSP | Authorized BRS minter | Operator key | mutav program.
1. d1 06:00 BRT, platform -> agency: "consolidated bill: Σ taxa da fiança of guarantees in force (+ activation line in a guarantee's first month)".
2. d1–d10, agency: "collects each tenant's fee in its own rent flow" (tenants off-diagram).
3. By d10, agency -> PSP: "boleto (clears in 1–2 business days) or PIX (minutes)". Alternative arrow, agency -> operator BRS account directly: "BRS via Solana Pay (bill reference); skips steps 4–5".
4. PSP -> platform: "settlement webhook: amount, PSP reference" -> bill "paid" (only if amount = bill total).
5. Platform -> minter: "PIX (BRL)"; minter -> operator BRS account: "BRS 1:1".
6. Operator -> program: "contribute_fees(invoice_ref_hash, amount)" -> "fee receipt created; take -> treasury; net -> reserve; NAV rises".
7. Program -> indexer -> platform: "FeesContributed{gross, take, net}" -> bill "recorded on-chain".
8. Month end: "reconciliation: billed = settled = minted = Σ fee receipts (gross)".
Red branch from step 3: "unpaid after the due date -> overdue: guarantee stays in force, cover unchanged, no fee receipt; terms open".
Bracket over steps 3–6: "fees in transit: excluded from NAV until recorded".
```

**Missed-rent notice (later).** In the design, the operator calls `flag_claim_notice` at the first missed rent, and while any notice is open both capital queues stay closed, so nobody enters or leaves at a NAV that misses a known loss. The v1 binary does not have this gate; until it ships, the runbook files the claim before any fill. It is built before any outside capital, together with the exit fallback of §9 ([ADR 0025](decisions/0025-exit-fallback-cooldown-exit.md)).

**Filing.** The agency files the payment request (*pedido de pagamento*) with evidence in the platform, between day 3 and day 9 after the due date (working process; the spec's 15-day window is to be reconciled). MUTAV verifies it. On approval, `file_claim(leg, amount, notice_ref_hash)` books a provision on the default or exit leg, at most the leg's cover not yet paid or provisioned. **NAV drops at filing**, while coverage is unchanged, because the payment already sits inside the guarantee's remaining cover. The named **category** of guaranteed debt and `request_complete_ts`, which starts the contractual payment term, are carved for a later upgrade.

**Payment.** `pay_claim(notice_ref_hash, expected_amount)` sends exactly the filing's provision from the reserve to MUTAV's whitelisted payments account, which the operator cannot own ([ADR 0021](decisions/0021-claims-approval-amendment-exact-payment.md)). **It applies no coverage, mode, pause or price check.** It refuses only the cases in Table 4's note ². The operator caps (R$15k per call, and R$20k over any 31 consecutive days, a sliding window of daily buckets; [ADR 0028](decisions/0028-pilot-parameters.md)) limit what the hot key can move, not what MUTAV owes: a 6×-rent exit claim (R$13,200) fits the per-call cap. Above it, the admin multisig calls `approve_claim` for the exact amount, bound to the filing's revision, and the operator then pays it with the same `pay_claim`; the admin approves an amount, never the merits of the claim. While the approval waits on the time lock, MUTAV may pay the agency first from its own bank account, and the reserve reimburses MUTAV's payments account once the approval exists. Approved payments still count toward the 31-day cap; for an unusually large claim the admin raises that cap in the same proposal. The reserve never pays more than the remaining *valor afiançado*. In the design, when total paid reaches it the guarantee becomes `EXHAUSTED` and MUTAV notifies the landlord that the fiança is extinguished; the v1 binary has only `ACTIVE` and `CLOSED`, and the full lifecycle of [ADR 0012](decisions/0012-fianca-aligned-guarantee-lifecycle.md) is carved for a later upgrade.

**Correcting a claim (first upgrade).** To settle for less, the operator amends the claim down and then pays it exactly. `amend_claim` (an amendment to 0 withdraws the claim) and `refile_claim` reset any approval and bump the revision; they ship in the first upgrade. Until then a wrong filing stays provisioned and unpaid.

**Why exhaustion matters.** While a guarantee is in force, the landlord cannot obtain the 15-day eviction *liminar* (art. 59 §1º IX), so evictions run on the ordinary track and, by our research estimate, consume the full 6× exit sub-limit (uncapped ≈10×). If exhaustion extinguishes the fiança, the landlord can seek the liminar and the expected exit payout falls (base ≈5.5×, low ≈2.5× rent). Whether exhaustion counts as extinction for art. 59 is a question for counsel.

**PIX settlement.** MUTAV offramps the BRS and pays the agency by PIX, for the landlord under the recorded mandate ([ADR 0003](decisions/0003-payments-operated-by-mutav.md)). `settle_payout(notice_ref_hash, pix_e2e_hash)` records a hash of the PIX end-to-end ID and its time on the same claim account. The landlord's *quitação* hash and the mandate hash come later. The program sets no payout deadline ([ADR 0019](decisions/0019-v1-layout-for-the-devnet-release.md)): the service level (review, information requests, approval, payment, with a 48-hour internal target) is measured in the platform and shown on the transparency page from the `ClaimPaid` and `PayoutSettled` timestamps. The reserve's on-chain promise is this one: within the caps, `pay_claim` is never refused for coverage or a pause.

**End of the fiança.** In v1, `close_guarantee` takes a reason: `RELEASED` once no claim is open, or `VOID` for a lease that never took effect, with nothing paid and no claim open. A close releases the cover from `coverage_required`; the account stays on-chain as public history. In the design of [ADR 0012](decisions/0012-fianca-aligned-guarantee-lifecycle.md), carved for a later upgrade, `record_keys_returned` (LI 39) or `notify_exoneration` (LI 40 X, effective 120 days later) moves the guarantee to `LEASE_ENDED` or `EXONERATING` and starts a claims tail (length open, at most the 3-year prescription); cover stays fully counted until the tail ends, and only then may `close_guarantee` release it. A wrong close can be undone within 30 days by `reinstate_guarantee` (first upgrade). Recoveries against the tenant, through the fiador's subrogation (CC art. 831), are pursued off-chain; whether they flow back to the reserve is **open**.

```figure id="fig-3-claim-lifecycle" title="Figure 3. Payment-request lifecycle"
Sequence diagram, six lanes left to right: Agency | MUTAV platform | Operator key | mutav program | Payments account / offramp | PIX.
1. Agency: "rent missed (T0)" -> MUTAV platform.
2. Operator -> program: flag_claim_notice (dashed, "later"). Program note: "claim-notice gate (later): both capital queues closed".
3. Agency -> platform: "payment request + evidence, T0+3 to T0+9" (recorded off-chain, platform audit log).
4. Platform: "verification and approval".
5. Operator -> program: file_claim(leg, amount). Program note: "provision booked; NAV drops; capped by the leg's free cover".
6. Operator -> program: pay_claim. Program -> payments account: "BRS". Program note: "pays exactly the provision; claim = Paid". Side note: "above R$15k: admin approve_claim of the exact amount (time-locked); MUTAV may pay bank-first and be reimbursed".
7. Operator -> program: close_claim_notice(Paid) (dashed, "later"). Program note: "claim-notice gate (later): queues reopen".
8. Payments account -> offramp -> PIX -> Agency: "BRL by PIX"; Agency -> (off-diagram) landlord "under mandate".
9. Operator -> program: settle_payout(notice_ref_hash, pix_e2e_hash). Program note: "Settled; PIX hash and time recorded; no on-chain deadline".
Two brackets: a long one spanning steps 3 to 8 labelled "working target: ≤4 days request -> PIX; ≤15 days due date -> PIX (under legal review)"; a shorter one spanning steps 6 to 9 labelled "on-chain record: pay_claim -> settle_payout".
Every on-chain step (2, 5, 6, 7, 9) carries a small badge "not coverage-gated".
```

---

## 8. Reserve, required coverage and NAV

Anyone can recompute every quantity below from public accounts ([spec §4](spec.md#4-invariants-and-formulas)). Amounts are BRS base units (6 decimals), math is `u128`, and rounding favours the reserve.

```text
stable_assets         = brs_balance                          BRS only in the pilot
remaining_cover(g)    = (default_cover − default_paid) + (exit_cover − exit_paid)
remaining_cover_total = Σ remaining_cover(g)                 over guarantees not CLOSED
unprovisioned         = max(0, remaining_cover_total − provisions)
coverage_required     = max(ceil(c × remaining_cover_total),
                            provisions + min(stress_buffer, unprovisioned))   0.10 ≤ c ≤ 1.0
surplus               = max(0, stable_assets − coverage_required)
free_capital          = surplus
liquid_budget         = max(0, brs_balance − provisions)
net_assets            = max(0, stable_assets − provisions)
NAV per share         = net_assets / shares_outstanding
```

Once adapters ship, `stable_assets` adds each adapter's position at its bounded price (§10); the phase-2 instant exit would subtract an earmark from `free_capital` and `liquid_budget` (§14).

**What `c` means.** `c` (`coverage_ratio_bps`) is the share of remaining cover the reserve must hold in stable assets. It is a governed parameter that only the time-locked multisig changes, between a program floor of 0.10 ([ADR 0016](decisions/0016-coverage-ratio-below-one.md)) and a ceiling of 1.0 ([ADR 0022](decisions/0022-coverage-stress-buffer-underwater-reserve.md)). Two sizings were on the table:

- **Full backing, `c` = 1.** The reserve holds every active guarantee's whole remaining *valor afiançado*, so even every lease exhausting at once is paid from the reserve. It is capital-heavy: one working-product guarantee locks R$39,600, so R$300k backs 7 leases and the 170-lease book would need ≈R$6.7M.
- **Expected loss plus a one-year tail** (MUTAV's working business plan). The reserve is sized to the book's losses, not its ceiling: for 170 leases, expected rent-arrears losses of ≈R$90k a year at the base anchor (2.01% of annual rent) and ≈R$266k in a tail year (5.93%), against a working target of R$300k, about 1.1× the tail year; exit debts add to both. In program terms `c` sits far below 1, and MUTAV's own balance sheet, disclosed as the backstop, carries the rest of the legal ceiling.

MUTAV chose the second, and the program now expresses it ([ADR 0016](decisions/0016-coverage-ratio-below-one.md)). `c` has a program floor of 0.10, the worst-case floor of the business rule that limits the book (grow only while the reserve holds at least 10% of total cover and at least two tail years). Devnet and the pilot run well above it, at `c` = 0.25 ([ADR 0028](decisions/0028-pilot-parameters.md)), because the first book is small and its loss data is not ours yet: R$100k backs about R$400k of cover, 10 working-product leases, and the R$1M cap about 101. At `c` < 1 a claim payment lowers surplus by `(1 − c)` times the amount (invariant 7) and can move the reserve into under-coverage; it is still never refused. The two-tail-year check stays off-chain for now; a per-lease tail floor is a later ADR.

**The stress buffer** ([ADR 0022](decisions/0022-coverage-stress-buffer-underwater-reserve.md)). Claims under a fiança arrive one event at a time (a month's rent, one exit bill), so the near-term demand on the reserve is the claims that could be filed next. Required coverage therefore never falls below the open provisions plus `stress_buffer`, an amount in reais the admin sizes from the book (for example the three largest rents plus one exit payment) and capped by what remains unprovisioned. It is R$19k on devnet and in the pilot. Filed payment requests stay fully covered at any `c`, and while the book is small the buffer sets aside room for the next claims; on a large book `c` × cover dominates.

The transparency page at reserve.mutav.finance publishes these figures from program state; any figure we cite should be read both against maximum exposure and against a tail year, because either alone misleads.

**What is gated** ([ADR 0005](decisions/0005-solvency-gate-scope.md)). Table 4 has the full matrix. In short: new guarantees and redemption fills must fit in the `free_capital` computed before them; nothing on the claim-payment path, nor fees, issuer income, closes or `refresh`, is gated on required coverage. Redemption fills are also capped by `liquid_budget`, so no capital exit (or, later, allocation) can spend BRS a filed payment request needs. Fee receivables are not reserve assets: a missed agency payment lowers fee inflow, not coverage.

**Under-coverage mode.** The program enters under-coverage when `stable_assets < coverage_required`, for example after claim payments at `c` < 1, an issuer freeze of the reserve account or, once adapters exist, an asset mark-down. Registration and redemption fills freeze (and allocation, once it exists; deallocation would run only if it doesn't worsen coverage). Claim payments, fees, capital requests and deposit fills keep running, and deposits recapitalise at a NAV that already reflects the loss ([spec §6](spec.md#6-under-coverage-mode)).

**Underwater reserve** ([ADR 0029](decisions/0029-claims-and-capital-rules-in-the-program.md)). If NAV per share falls below the smallest published unit while shares are outstanding, both fills refuse, so a new depositor never pays for losses that happened before the deposit. MUTAV recapitalises with BRS booked without minting shares, which restores NAV for existing holders: through `contribute_fees` under a reference recorded as a backstop for now, and through a dedicated `BACKSTOP` booking once the unsolicited-money instructions ship ([ADR 0024](decisions/0024-unsolicited-money-and-backstop.md)). Pending requests can always be cancelled. On public surfaces this mode reads "reserve below target; MUTAV backstop active", never "insolvent". The landlord's claim is against MUTAV's whole patrimony, not the reserve alone. MUTAV's backstop is to be disclosed on-chain as a separate layer (`backstop_amount`, `backstop_commitment_hash`, `backstop_reimbursed_total`, carved for a later upgrade) and never counts in `stable_assets` or NAV. Its amount is **open**; its disclosure is specified.

**The honest consequence.** Ungated payments continue below target and can draw liquid BRS to zero; the backstop carries what the reserve cannot.

**NAV is computed by the program**, never pushed by an admin ([ADR 0004](decisions/0004-onchain-nav-internal-accounting.md)). Accounting is internal, so a direct transfer into the reserve does not move NAV, and a virtual share offset blocks first-depositor inflation. NAV excludes pending deposits, BRS owed to exiting providers, MUTAV's take and fees in transit.

**Price safety.** The v1 binary reads no price: BRS is valued at par. Once an adapter adds TESOURO, it is valued at a price MUTAV reads and bounds itself (`min(BondPrice, accrual ceiling)`, staleness and deviation bounds); stale prices will fail gated instructions closed, and `pay_claim` never reads a price. Today, a NAV-move guard measured net of fee and income inflows sets `fulfil_halted` after an outsized move, and both fills also check it inline and must execute inside a NAV range (`nav_bounds`) the admin set when proposing them.

**Invariants.** The test plan asserts, after every instruction, that `stable_assets` uses only tracked balances and the bounded price (1); paid ≤ cover on each leg (2); a provision lowers NAV, never `stable_assets` (6); a claim payment moves surplus by `(c − 1)` times the amount, so it is unchanged at `c` = 1 (7); and no fill lowers NAV per share (12). A property test fuzzes `stable_assets` below `coverage_required` and `c` from 0.10 to 2.0, and asserts that `pay_claim` is never refused by the coverage gate; another asserts that an approved claim above the per-call cap is never refused for coverage, under-coverage or the pause, and a third checks the 31-day claim window against a naive oracle.

```figure id="fig-4-coverage-bar" title="Figure 4. Balance sheet and coverage"
Two vertical stacked bars side by side on a common baseline.
Left bar "stable_assets": bottom segment "BRS (at par)", top segment "adapter asset, e.g. TESOURO (bounded price; later)". Inside the bar, a hatched slice at the top labelled "provisions (NAV-only deduction)"; bracket on the left side "net_assets = stable_assets − provisions".
Right bar "coverage_required = max(c × remaining cover, provisions + stress buffer)", shorter than the left bar.
The vertical gap between the top of the right bar and the top of the left bar is shaded and labelled "surplus = free capital".
Arrow pointing into the surplus: "register_guarantee / fulfil_redeems draw from here".
Separate arrow from the BRS segment out to the right: "claim payments draw from BRS — never coverage-gated".
Small inset, right, titled "Same 170-lease book, two sizings (working parameters; open, §8)": bar A "c = 1: ≈R$6.7M in the reserve"; bar B "expected loss + tail year: R$300k target", with a dashed segment above it labelled "MUTAV backstop (disclosed, not in NAV)".
```

**Table 4. Gate matrix in the v1 binary** (✓ runs · ✗ refused · *gated* = must fit in `free_capital` computed before)

| Instruction | Paused | Under-coverage | `fulfil_halted` | Coverage gate |
|---|---|---|---|---|
| **`pay_claim`**² | **✓** | **✓** | **✓** | **✓ never gated** |
| **`approve_claim`** (admin, time-locked) | **✓** | **✓** | **✓** | **✓ never gated** |
| `file_claim`, `settle_payout`, `close_guarantee` | ✓ | ✓ | ✓ | ✓ |
| `contribute_fees`, `sweep_income`¹ | ✓ | ✓ | ✓ | ✓ |
| `request_*` | ✗ | ✓ (queued, not filled) | ✓ | ✓ |
| `register_guarantee` | ✗ | ✗ | ✓ | *gated* |
| `fulfil_deposits`³ | ✗ | ✓ | ✗ | ✓ (within `max_tvl`) |
| `fulfil_redeems`³ | ✗ | ✗ | ✗ | *gated*, and within `liquid_budget` |
| `cancel_*`, `claim_*`, `refresh`, `advance_queue_head`, role changes | ✓ | ✓ | ✓ | ✓ |

¹ Refused only while no shares are outstanding. ² Refused only when no filed claim exists for that notice (missing, already paid or settled), the expected amount differs from the provision, the leg's remaining cover is short, the provision is above the per-call cap without a matching `approve_claim`, the payments of the last 31 days would exceed the period cap, liquid BRS is short, or the reserve account is frozen; the destination is always the configured payments account. ³ Both fills also refuse an underwater reserve, a NAV outside the admin's `nav_bounds`, and a move beyond the NAV-move guard. Later rows: the claim-notice gate closes both fills while a notice is open; `allocate` and `deallocate` arrive with adapters (gated by free capital and a BRS liquidity floor, [ADR 0027](decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md)).

**A worked month** (illustrative, `c` = 1.0, placeholder fee and take, small covers for legible arithmetic; Appendix D). Two agency bills raise NAV without minting shares; a missed rent lowers NAV when filed (day 12), not when paid (day 14), and the payment leaves surplus unchanged; a fifth guarantee consumes most free capital, and a queued redemption receives the rest as a partial head fill. Partial fills are the [ADR 0010](decisions/0010-partial-fills-at-queue-head.md) design that returns in the first upgrade; the pilot binary fills whole requests only, so in the pilot that request would wait (§9).

```figure id="fig-5-worked-month" title="Figure 5. The worked month"
Combined chart, x-axis days 0–30.
Bars (left axis, R$): for each event day, paired bars stable_assets vs coverage_required: d0 90,000/72,000; d1 90,640/72,000; d12 90,640/72,000; d14 88,640/70,000; d18 88,640/83,500; d20 88,910/83,500; d21 83,500/83,500; d30 84,100/83,500.
Line (right axis): NAV per share: d0 1.000000; d1 1.007111; d5 1.007111; d12 0.984888; d14 0.984888; d18 0.984888; d20 0.987888; d21 0.987888; d30 0.994987.
Event markers on the x-axis: d1 fee receipts (prior month's agency bills, settled and converted); d5 notice (queues closed; claim-notice gate, later); d12 filing (NAV drops); d14 claim payment + notice closed; d16 PIX settlement; d18 registration G5; d20 price accrual (exaggerated); d21 partial head fill R$5,410 (first upgrade; the pilot fills whole); d30 fee receipts (late payers).
Shaded band between d5 and d14 labelled "queues closed".
Footnote: "Illustrative; placeholder fee and take, not MUTAV pricing; fee receipts land after each agency's bill is paid and converted, so the days shown are illustrative; amounts rounded to R$1; not annualisable."
```

---

## 9. Capital flows

**Async deposit.** `request_deposit` escrows BRS in `pending_deposits`, excluded from NAV, with an optional price limit (the fewest shares the provider accepts). The admin multisig calls `fulfil_deposits(count, nav_bounds)`, which fills up to 8 requests in strict FIFO order at the current NAV, within `max_tvl`, only while NAV sits inside the range the admin reviewed and has not moved beyond the NAV-move guard. A fill that would mint 0 shares, or a reserve that is underwater, is refused. Deposits are **allowed in under-coverage** as recapitalisation ([ADR 0008](decisions/0008-uniform-capital-flow-and-pause-scope.md)). The provider then calls `claim_shares`, or `cancel_deposit` while the request is pending.

**Async redemption.** `request_redeem` escrows shares, with an optional price limit. **Exit is a right** ([ADR 0023](decisions/0023-capital-flows-and-exit-rights.md)): a wallet that holds shares can redeem even after it leaves the allowlist, and can exit its whole balance below the minimum request, down to a floor of a tenth of it (R$100 at the R$1,000 minimum, [ADR 0029](decisions/0029-claims-and-capital-rules-in-the-program.md)). The admin's `fulfil_redeems(count, max_assets, nav_bounds)` recomputes its budget before every fill:

```text
budget = min(max_assets − assets_paid_in_this_call, free_capital, liquid_budget)
```

**Strict FIFO, whole fills in the pilot.** A batch fills whole requests while they fit; the first head that does not fit stops the batch and waits for free capital ([ADR 0023](decisions/0023-capital-flows-and-exit-rights.md)). Partial fills at the head, each part at its own NAV ([ADR 0010](decisions/0010-partial-fills-at-queue-head.md), Figure 6), return in the first upgrade. A permissionless crank skips closed requests. No request can hold the queue: the owner can always cancel, and the admin can **park** a head that cannot fill (a de-listed provider, or a price limit no fill can meet). A parked request leaves the queue, but its BRS or shares stay owed to the owner, who alone collects them with its own cancel ([ADR 0030](decisions/0030-admin-cancel-parks-the-request.md)). With no two-sided BRL liquidity on Solana, exits wait while there is no surplus or the reserve is under-covered, and providers accept that explicitly. Before any outside capital, an **exit fallback** lets anyone fill a head redemption that has waited longer than `max_queue_wait_secs`, under the same rules, and the upgrade time lock stays at least that long, so holders can leave before an upgrade they do not accept takes effect ([ADR 0025](decisions/0025-exit-fallback-cooldown-exit.md); off, at 0, in the pilot).

```figure id="fig-6-redemption-queue" title="Figure 6. Redemption queue with a partial head fill (first upgrade)"
Horizontal FIFO lane, head on the left: request A (seq 7, 2,000 shares), request B (seq 8, 10,000 shares), request C (seq 9, 3,000 shares). A greyed box between A and B: seq 7b "cancelled", with an arrow "skipped by advance_queue_head".
Above the lane, a budget bar labelled "budget = min(max_assets, free_capital, liquid_budget)", recomputed before each fill.
A: fully coloured, label "filled whole".
B: split box, left part coloured "partial fill (≥ min_fill_assets)", right part outlined "remainder stays at head (≥ min_request)".
C: outlined, label "untouched until B is complete".
Side note from A and B to a wallet: "claim_assets between fills — keeps place in line".
Caption line: "Each part priced at the NAV of its own fill; rounding favours the reserve. In the pilot binary B waits, whole, until the budget covers it."
```

**Table 5. MUTAV's three money flows** ([ADR 0009](decisions/0009-separate-mutav-money-flows.md))

| Flow | Instruction | Destination | Shares? | Public as |
|---|---|---|---|---|
| Guarantee fees, net of the take (monthly agency bill paid by boleto or PIX, converted to BRS) | `contribute_fees` | `reserve` | Never minted | 1 fee receipt per agency bill (`invoice_ref_hash`); `FeesContributed{gross, take, net}` |
| MUTAV operation (the take, `fee_take_bps`: 20% in the devnet and pilot config, final rate open; program max 30%) | Same call, separate transfer | Whitelisted `treasury_account` | None; never in the reserve or NAV | `fee_take_total` |
| MUTAV as capital provider | `request_deposit` / `request_redeem` from the disclosed capital wallet | `pending_deposits` → `reserve` | At NAV, like any provider | Queue events filtered by `mutav_capital_wallet` |
| Issuer income: Nora's monthly BRS revenue share, routed by MUTAV into the reserve ([ADR 0017](decisions/0017-brs-income-intake.md)) | `sweep_income`, one per Nora statement, from the income inbox | `reserve`; no take, all of it builds the reserve ([ADR 0019](decisions/0019-v1-layout-for-the-devnet-release.md)) | Never minted | 1 `IncomeReceipt` per statement (`income_ref_hash`); `IncomeSwept{amount, inbox_after}`; `income_total` |

The treasury, payments account and capital wallet must be distinct, and there is no `withdraw_surplus`. **Every BRS in the reserve traces to a fee or income receipt or a `DepositRequest`,** and each fee receipt corresponds to one paid monthly agency bill, so a gap between bills paid and receipts recorded is visible. Money sent outside these paths moves nothing: it is skimmed into the separate `unsolicited` account, then booked into the reserve or returned to its sender by the admin ([ADR 0024](decisions/0024-unsolicited-money-and-backstop.md); those instructions ship later, and until then such money stays untracked). Because MUTAV also controls the operator key and the admin multisig, the claim-notice gate is the program-level control against MUTAV exiting ahead of a loss it knows about; until it ships, the runbook files every known claim before any fill, and the pilot runs on MUTAV's own capital.

**Who provides capital (open).** MUTAV's working plan funds the reserve from its own balance sheet, capitalised by an equity round, with a working target of R$300k in the 02 business plan (the pilot plan, ADR 0028, starts with R$120k and adds R$170k a month from month 2). The program also supports allowlisted, KYC'd third-party providers holding reserve shares. Counsel's review warns that outside capital pooled in a reserve that absorbs losses can make a *fiança* look like insurance or an unauthorised mutual scheme. **During the pilot the reserve runs on MUTAV's own capital and is not open to public investment**; any outside capital would come only through a regulated vehicle, to eligible investors, after counsel's written opinion, and only once the claim-notice gate, the exit fallback and transfer-restricted shares are built (§13). The committed amount will be published before the mainnet pilot. Reserve shares absorb claim payments and receive net guarantee fees and swept issuer income, so their value can fall or rise; MUTAV sets no return target and makes no return projection.

---

## 10. Reserve assets and BRL on Solana

The reserve holds two kinds of asset ([spec §7](spec.md#7-price-safety)).

**BRS** ([Nora Finance](https://www.nora.finance/docs/integrate/core-concepts/brs-token)) is a 1:1 BRL stablecoin, a classic SPL token with 6 decimals, valued at par. We disclose the trust this places in the issuer: the mint has a freeze authority held by a single key, so the issuer can freeze any BRS account, including the reserve's; we accept this on devnet and will raise it with the issuer before mainnet. Redemption into BRL runs off-chain. In our on-chain reads, about 2.9k BRS existed on Solana at the start of October 2026, with no DEX pool.

**Issuer income** ([ADR 0017](decisions/0017-brs-income-intake.md)). BRS bears no yield, but Nora pays partners a monthly revenue share in BRS under a commercial agreement, to an address the partner chooses. MUTAV names the reserve's *income inbox*: the vault authority's associated token account for BRS, created at `initialize`. Nothing in it counts toward NAV; each month the operator sweeps the amount on Nora's statement into the reserve with `sweep_income`, which books it once per statement and raises NAV for every holder. The NAV-move guard measures net of these inflows, so a monthly payment does not halt fulfilment. The income depends on one contract with one issuer, which can change its rate or end, so it is shown as issuer partnership revenue, separate from guarantee fees, and never counted in the coverage math. Its terms with Nora are **open**.

**TESOURO** ([Etherfuse](https://etherfuse.com/products/stablebonds)) is tokenized exposure to Brazilian federal bonds: a Token-2022 mint that carries an on-chain `BondPrice` account. Its layout, update cadence and rate basis are being confirmed with the issuer. It is the first candidate for an adapter, not part of the pilot: the pilot reserve holds BRS only (ADR 0018), because the reserve already receives Nora's issuer partnership revenue in BRS (ADR 0017), at a rate set by a commercial agreement that is not on-chain (MUTAV expects it below but near Selic, pending Nora's confirmation), and Etherfuse has no BRS path yet. Once an adapter is live, it is held only through that capped adapter, under a BRS liquidity floor: the larger of a share of stable assets (50% proposed) and an obligations floor in reais that covers filed claims plus what claims can take while a deallocation settles ([ADR 0027](decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), proposed). The admin multisig moves assets; guardians, the pauser and the admin can take risk-reducing emergency actions at once (both decided).

The **mint guard** rejects any Token-2022 reserve mint with a PermanentDelegate, a TransferHook, a non-zero TransferFee or a transfer-fee authority, NonTransferable, a default-frozen account state, Pausable, InterestBearing or ScaledUiAmount (the last three change what a balance means without changing the amounts the program tracks), and requires 6 decimals. Mints are allowlisted **by address, never by symbol**, because impostor BRL tokens exist.

**Asset mix is open.** MUTAV's working business plan targets roughly 80% tokenized federal bonds with a 20% liquidity sleeve held in a USD stablecoin. The pilot holds BRS only (ADR 0018), so the v1 binary needs no on-chain floor: nothing can leave BRS. Once adapters are live, the BRS liquidity floor above (proposed, not decided) and per-adapter caps keep claim payments from waiting on a bond redemption or carrying FX risk between BRL claims and the reserve. Neither the mix nor the sleeve asset is decided. A USD sleeve would need its own valuation rule and mint-guard review before it could count toward `stable_assets`.

**Table 6. Reserve assets** (the pilot holds BRS only, ADR 0018; the TESOURO row applies once an adapter is live)

| Asset | Issuer | Token program | Valuation rule | Cap | Key risk |
|---|---|---|---|---|---|
| BRS | Nora Finance | Classic SPL, 6 dp | Par (1 BRS = R$1) | None; 100% of the pilot reserve | Issuer backing, single-key freeze authority, thin market |
| TESOURO | Etherfuse | Token-2022 | `min(BondPrice, accrual ceiling)`, with staleness and deviation bounds | 0% in the pilot (ADR 0018); once an adapter is live, its own cap and share limit, under the BRS liquidity floor (proposed, ADR 0027; business plan ~80% bonds) | Price staleness, conversion path, issuer |
| BRZ (new mint) | Transfero | Token-2022 | — | **Not eligible** | Fails the mint guard (PermanentDelegate) |

**The thin market is a design input.** No on-chain venue could absorb a forced sale, so the design keeps a BRS buffer, uses async exits and reserves liquidity for filed requests. Funding the pilot would mint many times today's on-chain BRS supply, a concentration risk; confirming issuance and off-ramp capacity is a start condition (§12).

---

## 11. Security and governance

**Admin and upgrades.** Two [Squads v4](https://github.com/Squads-Protocol/v4) multisigs with the same members hold authority ([ADR 0020](decisions/0020-operator-admin-separation-and-recovery.md)): the **admin multisig** is the reserve admin, with a short time lock, so redemption fills and claim approvals do not wait as long as an upgrade; the **upgrade multisig** is the program's upgrade authority, with a long time lock. The real pilot uses 24 hours and 7 days; devnet's floors are 5 minutes and 1 hour (the current test deploy runs 60 and 120 seconds, a stated test exception). Every admin action is time-locked except `pause`. Admins sign from their own wallets, with hardware keys before real money; devnet runs two 2-of-2 multisigs. The deploy scripts check each multisig's members, threshold, time-lock floor and that its `config_authority` is the default, and the transparency page links them.

**Distinct keys are not independent parties.** In the pilot every key is MUTAV-held. Distinct keys limit the damage from one compromised key; the public, time-locked record, not the keys, is what lets outsiders check MUTAV.

**Governance can change hands without new code.** Because admin, operator, pauser and the investor allowlist are separate on-chain roles, the reserve's governance can move to an independent, regulated reserve vehicle (its directors holding the admin multisig and an independent pauser) by rotating keys through the two-step handover, and the operator can be a separate company from the admin. Opening to outside investors also needs the allowlist and the features §13 lists for outside capital; none needs an account migration.

**Pauser and guardians.** The pauser is a separate key, and up to three pause-only guardian keys (a monitoring bot may hold one) can pause too; pausing needs no time lock. A pause stops only capital flows and new guarantees (`request_*`, both fills, `register_guarantee`). The claim path (`file_claim`, `approve_claim`, `pay_claim`, `settle_payout`), fees, issuer income, closes, cancels, claims of shares and assets, role changes and `refresh` stay open, so landlords are paid and records can be corrected during an incident. The pauser revokes the operator at once with `revoke_operator`; appointing a replacement is a time-locked admin proposal that the new key must accept, and the pauser never appoints.

**Operator blast radius** ([ADR 0020](decisions/0020-operator-admin-separation-and-recovery.md)). The only irreversible operator action is `pay_claim`, so the most a lost or misused operator key can cost the reserve is a number the admin sets in advance: R$20k in any 31 days, about 2% of `max_tvl`, paid only into MUTAV's own payments account, which the operator cannot own. Five controls bound it: that destination, the per-call cap with the admin's `approve_claim` above it, the sliding 31-day cap, the per-guarantee cover cap, and immediate revocation. Every other operator action is reversible by another operator action: a false registration by `close_guarantee(VOID)` today, and a wrong close or filing by `reinstate_guarantee` and `amend_claim` in the first upgrade. Recovery is freeze, appoint, reconcile: revoke (and pause if needed), appoint a new operator, then correct each wrong entry against the platform's records; no admin rollback power exists that could itself be misused (§13). **The caps limit the rate of loss, not what MUTAV owes.**

**Initialization and upgrades.** Only the upgrade authority can call `initialize`. Accounts carry a version and zeroed padding, and layouts are append-only ([spec §14](spec.md#14-upgrade-readiness)); since `v1.0.0-devnet`, an `idl-compat` CI check refuses any interface change that is not append-only. Each upgrade ships as a `solana-verify` build in one Squads proposal announced during the time lock; enabling a feature takes a second proposal. Signers decode every instruction before approving and never pre-sign with durable nonces: in April 2026 Drift lost about $285M when a 2-of-5 multisig with no time lock was taken over through pre-signed durable-nonce transactions.

**Reviews before devnet** ([reviews and audits](security/reviews-and-audits.md)). Before the layout froze, the program, client, scripts and app went through five parallel adversarial reviews, a review against the published audits of a comparable Solana program, an OWASP Smart Contract Top 10 (2026) pass and a simplification review ([ADR 0026](decisions/0026-program-simplification-for-the-freeze.md)), which removed four account types and the state the pilot does not use. Their decisions are ADRs 0019–0030. An internal security audit of the fixed code followed, and every confirmed finding is fixed; among them a High, a holder able to wedge the redemption queue by breaking its own token account, fixed by parking ([ADR 0030](decisions/0030-admin-cancel-parks-the-request.md)). The tests run on LiteSVM, with property tests for the claim path and rounding, invariant checks after instructions and golden layout fixtures. **No independent audit has been done yet**; one is planned before mainnet, auditor and date not chosen.

```figure id="fig-7-governance" title="Figure 7 (optional). Governance and upgrade path"
Left-to-right pipeline: [Verified build (solana-verify)] -> [Buffer account (hash = build hash)] -> [Bundled Squads proposal: upgrade + IDL + verify PDA] -> [Time lock — public announcement on transparency page] -> [Execute] -> [Smoke checks].
Below the pipeline, a second mini-pipeline labelled "Enabling a feature": [Proposal 1: upgrade adds feature to SUPPORTED_FEATURES] -> [observation period, feature off] -> [Proposal 2: set_config sets flag bit], each proposal passing through its own time lock.
Side arrow from a separate [Pauser key] straight to [mutav program] labelled "pause — no time lock; capital flows stop, claim-payment path stays open".
```

---

## 12. The Colosseum pilot

**Goal.** Prove that a digital-asset reserve can run as a viable operation: MUTAV operates it, and anyone can verify it. The work splits into the hackathon deliverable and a gated mainnet pilot, which sits beside MUTAV's operating plan.

### (a) Hackathon deliverable (12 October 2026)

The repository was created on 2026-10-01, inside the hackathon window (2026-09-14 to 2026-10-12). Status as of 15 October 2026:

| Item | Status |
|---|---|
| Specification and ADRs 0001–0030; Anchor workspace; CI with `idl-compat`; Codama client | Done. ADR 0027 is still proposed; the rest are accepted |
| Core program: 34 instructions, LiteSVM integration, property, invariant and layout tests, including the `pay_claim`-never-refused property test | Done (v1 layout frozen) |
| Pre-devnet reviews and internal security audit, with every confirmed finding fixed (§11) | Done |
| Devnet deploy with Squads-owned upgrade authority and reserve admin | Done: [`GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV`](https://explorer.solana.com/address/GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV?cluster=devnet), release `v1.0.0-devnet`, the pilot demo reserve (test activity is visible). The on-chain program hash matches the build; the `solana-verify` release build is pending |
| Pilot app at [reserve.mutav.finance](https://reserve.mutav.finance): public transparency pages reading the devnet reserve, operator console, Squads proposal builders for the admin, capital queue, reserve simulator | Done |
| Demo video of the lifecycle on devnet | Done ([demo](demo/)) |
| Surfpool fork test against the devnet BRS mint | Done, run on demand |
| Adapters, the claim-notice gate and the deferred features of §13 | Later |

Program IDs and build hashes are in the [README](../README.md#devnet-addresses); [provenance.md](provenance.md) credits prior work.

```figure id="fig-8-timeline" title="Figure 8. Timeline to 12 October"
Horizontal Gantt strip, Oct 1 to Oct 12, plus a "mainnet pilot (gated)" stub at the right.
Rows: Oct 1 scaffold and docs; Oct 2 core state, math, upgrade readiness, ADR 0012; Oct 3 register/close and fees; Oct 4 claim payments and payouts; Oct 4–5 async queue and MUTAV capital; Oct 6 under-coverage and price safety; Oct 6–7 issuer income, refresh, events; Oct 7–8 client and pilot app; Oct 9–10 adversarial reviews, ADRs 0019–0029, layout freeze; Oct 11 fix wave and internal audit; Oct 12 devnet deploy under Squads, demo video, submit by 23:59 BRT (milestone diamond).
Stub: "mainnet pilot — starts when start conditions are met"; beyond it "first upgrade: claim amendment, reinstatement, partial fills".
Legend: solid bar = done. All rows are solid.
```

### (b) Mainnet pilot and operating plan (after submission, gated)

| Track | What it proves | Size | Capital |
|---|---|---|---|
| On-chain mainnet pilot | The mechanism | Program cap R$1M (`max_tvl`, the devnet value, ADR 0028); at `c` = 0.25, about 101 working-product guarantees (R$4M of cover); the plan reaches 97 by month 6 (17 a month) | MUTAV capital: R$120k, plus R$170k a month from month 2 |
| Operating plan | The business | ~170 guarantees across up to 5 partner agencies, ~6 months | Working reserve target R$300k (02 business plan) from MUTAV's equity round and angel capital, not yet raised |

Caps rise from the first track toward the second only through the time-locked multisig, after an external audit, and while the KPIs below hold. At `c` = 1 the operating plan would not fit; a `c` below 1 (ADR 0016; 0.25 for the pilot, ADR 0028) is the decision that joins the two (§8). The pilot plan above is the path to R$1M ([ADR 0028](decisions/0028-pilot-parameters.md)): 17 new leases a month and R$170k a month from month 2, at a 12% guarantee fee and an assumed base delinquency of 2.5% of annual rent, rounded up from the measured 2.01%. A conservative variant runs at `c` = 0.50 with 5 new leases and R$100k a month.

**Proposed start conditions:** counsel's sign-off; the limited-fiança instrument and landlord mandate signed through the platform; the claims tail and payment term set; a PSP contracted for boleto and PIX; BRS issuance and off-ramp capacity confirmed and the PIX↔BRS round trip measured; the issuers' answers on PDA mint destinations and CPI burn, and the BRS freeze authority raised with the issuer; reserve capital committed and disclosed; a fresh mainnet deploy from a `solana-verify` release build, with hardware-key multisig members and the 24-hour and 7-day time locks; a real-pilot `max_nav_move_bps` in place of devnet's 100%; and an independent security review (whether a full audit is **open**). Before an audit, the pilot holds real funds in software that has had only internal review; commit nothing you cannot afford to lose.

The pilot caps (Appendix B, also the devnet values, decided by the founders in ADR 0028) are a R$1M reserve (`max_tvl`), `c` = 0.25, R$120k of cover per guarantee, a R$19k stress buffer, operator payments of R$15k per call (a 6×-rent eviction fits; above it, the admin's `approve_claim`) and R$20k in any 31 days (about 2% of `max_tvl`, the most a compromised operator key could pay out in a window), deposit and redemption requests of R$1k to R$100k, and no TESOURO (BRS only, ADR 0018). The take is 20% in the devnet config; the final rate is open (program maximum 30%). Only the time-locked multisig can change them.

**Capacity, honestly.** The working product (12× + 6× rent, under legal review) is a *valor afiançado* of R$39,600 per lease. At `c` = 0.25 each needs R$9,900 of reserve: the R$120k starting capital backs **12** such guarantees, and the R$1M cap about **101** (R$4M of cover); at `c` = 1 R$120k would back **3**. The pilot plan, the path to R$1M, opens month 1 on the R$120k start (12 of the first 17 leases), adds R$170k a month from month 2 (about R$948k in by month 6, none of it redeemed) and reaches the R$1M cap in month 6 with 97 leases and about R$3.8M of cover. The 170-lease book carries ≈R$6.7M of cover, ≈R$1.68M of reserve at `c` = 0.25, so `max_tvl` must rise before the book passes ~101 leases (§8). The per-guarantee cap (R$120k) fits the working product.

**Unit economics.** MUTAV prices by tenant score in three bands of 9%, 12% and 15% of monthly rent, and refuses scores below 400. The 02 business plan models 10% (R$220 a month on the working R$2,200 rent), below the middle band and so conservative, and the table below uses it; the pilot plan uses the middle band, 12% (ADR 0028). That sits at or above the market band (CredPago/Loft publicly lists 8–10%).

| Reserve | Working-product guarantees at `c` = 1 (R$39,600 each) | Gross guarantee fees per month at R$220 | MUTAV revenue |
|---|---|---|---|
| R$100k (earlier mainnet proposal) | 2 | R$440 | take `t` × gross |
| R$300k | 7 | R$1,540 | take `t` × gross |
| R$1M | 25 | R$5,500 | take `t` × gross |
| R$10M | 252 | R$55,440 | take `t` × gross |

At `c` = 1 the pilot is a cost centre by design; the levers are more capital, covers matched to risk, and a lower `c` (§8). At `c` = 0.25 (the devnet and pilot value, ADR 0028) each reserve backs about four times the guarantees in this table: R$100k ≈ 10, R$1M ≈ 101.

**Claims against fees, by scope of the exit leg** (working parameters from the 02 business plan; expected payouts per lease-year ÷ gross guarantee fees; fee 10% of rent per 30 days; rent arrears at 2.01% of annual rent, the Superlógica IIL three-month average for RS apartments; evictions at 0.25% of leases a year (range 0.10–0.60%: CNJ DataJud filings in TJRS, TJSC and TJPR over IBGE PNAD rented households, adjusted for outcomes and for an underwritten book; not MUTAV data), each consuming the 6× exit sub-limit; non-eviction exit debts 0.19× rent a year). Scope A, all liquidated tenant debts including the early-termination penalty: **≈37%**. Scope B, the same without the penalty (the spec default): **≈30%**. Scope C, arrears, evictions and abandonment only: **≈21%**. Rent arrears alone are ≈20%. Evictions are rare but expensive: while the fiança is in force the fast eviction order (Lei 8.245/91 art. 59 §1º IX) is unavailable, so each one uses about the full exit sub-limit; at 0.25% a year they add only about one point. Which scope the instrument covers is **open**. These figures are inferences; no Brazilian dataset measures exit-cost frequency. At the pilot plan's 2.5% base delinquency, rent arrears alone rise to ≈25% of fees at a 10% fee and ≈21% at the pilot's 12%; ADR 0028 puts expected claims in scope B at about R$942 per lease-year, so the 97-lease book of month 6 would expect about R$91k a year (≈R$7.6k a month), well inside the R$20k per 31-day operator cap.

**Region.** A Passo Fundo (RS) corridor, chosen for **access** to the team's agency relationships, with at most five partner agencies in phase 0. Working loss anchors (three-month averages of the latest 2026 prints): 2.01% of annual rent for RS apartments (Superlógica IIL, base), 2.87% for RS overall (stress), and 5.93% on a looser 15-day threshold (Loft IIA RS, tail). Nationally the IIL fell from 3.29% in January to 3.05% in July 2026, and the South is the lowest region at 2.67%. Five agencies in one corridor make defaults correlated. Nothing on-chain limits concentration in one agency: the per-guarantee cap and `max_tvl` bound it, and per-agency exposure is published from the guarantee accounts.

**Success over six months.** We measure operations, not a claims-to-fees ratio. With a handful of guarantees and delinquency around 2%, six months may see zero or one missed rent, so the demo runs a full drill on devnet, and we propose a published mainnet drill with MUTAV's own capital.

**Table 7. Success metrics** (proposed)

| KPI | On-chain evidence | Off-chain evidence |
|---|---|---|
| Every payment within the working targets (≤4 days request → PIX; ≤15 days due date → PIX) | `ClaimFiled` → `ClaimPaid` → `PayoutSettled` timestamps (`request_complete_ts` once carved) | Request date, approval and the service level, measured in the platform's hash-chained audit log |
| Zero partial or unexplained payments | Each payment equals its filed provision, ≤ remaining cover, tied to a notice; above R$15k, a matching `ClaimApproved` | Approval records |
| Coverage held, or under-coverage handled as designed | `StateRefreshed`, `ModeChanged` | Incident review |
| Fees, reserve and payouts reconcile with the books | Fee receipts (one per agency bill), `FeesContributed` totals, `VaultState` totals | Monthly agency bills, PSP settlement reports, minter receipts, bank statements |
| Guarantees registered within caps; caps raised only by the multisig | `GuaranteeRegistered`, per-agency figures derived from `Guarantee.agency_id`, `ConfigUpdated` | Onboarding records, published rationale |

Guarantees outlive the pilot window (a lease runs about 30 months, plus the claims tail), so the reserve stays committed until they run off, and the run-off will be disclosed.

---

## 13. Risks, limits and disclosures

MUTAV's reserve program is new, upgradeable software that has had internal reviews but **no independent audit**. Nothing here is legal, tax or investment advice, an offer of securities, or a promise of any return.

**The honest weak point is liabilities, not assets.** The chain proves what the reserve holds and enforces the gate. The operator asserts that the registered guarantees are complete and real.

**Table 8. What the chain proves and what it doesn't**

| The chain proves | The chain does not prove |
|---|---|
| The reserve's tracked balances | That a lease, tenant or default exists (only a hash is stored) |
| Each guarantee's absolute cover, and the amounts paid and provisioned per leg | That a payment request was correctly approved |
| `coverage_required`, surplus and NAV, recomputable by anyone | That every guarantee MUTAV wrote is registered |
| Every fee split between reserve and treasury, one receipt per agency bill | That the keys were actually returned (only an evidence hash is stored) |
| That claim payments went only to the whitelisted account, each equal to its filed provision, within the operator caps or with the time-locked admin's approval of the exact amount | When the agency filed (the chain sees only when MUTAV filed) |
| Each close and its reason (`RELEASED` or `VOID`); later, the end-of-lease or exoneration record and the claims tail | That the PIX reached the landlord (only a hash of the PIX end-to-end ID, which the counterparties can verify; the *quitação* and mandate hashes come later) |
| Filing, payment and settlement timestamps | That the BRS and TESOURO issuers hold the assets behind their tokens, or TESOURO's true market value |
| FIFO order, every fill price, every parked request, every config and role change, the disclosed capital wallet | That claims were filed on time; that MUTAV's backstop is funded; fees billed or paid but not yet recorded on-chain |

**Making completeness checkable.** Each agency and landlord can look up its own `Guarantee` account on the transparency page and confirm that its lease is registered at the right cover, and each agency can find its own fee receipts. Our target is that the fiança instrument cites the on-chain guarantee id and `contract_cap_hash` and takes effect only once registered; that is **open**. A periodic external completeness attestation is on the roadmap.

**Smart-contract and upgrade risk.** Bugs could lock or misdirect funds; caps, a separate pauser and guardians, the tests and the reviews limit the damage, and verified builds will let anyone check the code that runs. An upgrade can change any rule in this paper, including those that protect capital providers; the time lock gives notice, not a guarantee.

**Operator trust.** A stolen or misused operator key can send up to R$20k in any 31 days to MUTAV's own payments account (the accepted worst case), register fictitious guarantees within the caps, close guarantees early or file provisions. A fictitious registration is undone with `close_guarantee(VOID)`. Until the first upgrade adds `reinstate_guarantee` and `amend_claim`, a wrong close is final and a wrong filing stays provisioned and unpaid; early closes would understate `coverage_required`, which the lifecycle of ADR 0012 later narrows by requiring an end-of-lease record and an elapsed claims tail. Every close and filing is public, the pauser can revoke the key at once, and the key cannot send reserve funds elsewhere, mint shares or fill the queue. Recovery follows a runbook: freeze, appoint a new operator, reconcile against the platform's records, and sign no redemption fills until that is done ([incident response](security/incident-response.md)). The main residual risk is a claim filed late.

**Agency billing risk.** The agency holds tenants' fees before paying MUTAV; if it stops, fee income stops while cover stays live. There is no on-chain per-agency cap (ADR 0019); MUTAV stops registering that agency's new leases off-chain, and settlement-to-`contribute_fees` time is published per bill. The agency also sells, files, evidences and receives payments; MUTAV's verification and the per-guarantee cap bound that conflict.

**Issuer, off-ramp and payments-account risk.** BRS at par inherits the issuer's solvency and redemption risk. Its freeze authority is a single key: a freeze of the reserve account stops payments from it (and `refresh` then counts it as zero) but not MUTAV's obligation, which the backstop then carries. A frozen payments account stops `pay_claim` until the admin replaces it. The pilot also concentrates the reserve in one issuer, whose on-chain supply today is a small fraction of what the pilot would hold (§10). Issuer partnership revenue depends on one commercial agreement that can change or end; it is never counted in coverage. Claim payments depend on the off-ramp and MUTAV's payments account (credit and commingling risk); fee intake depends on the PSP and the minter. The take reaches the treasury in BRS and is converted back; keeping it in BRL at settlement is open.

**TESOURO and capital-provider liquidity.** Once an adapter adds TESOURO, its price can be stale or move against the reserve, conversion to BRL needs off-chain steps, and a mark-down that breaches coverage freezes outflows. Exits can wait indefinitely (§9): fills are whole, a large head waits for free capital, and a balance worth less than the small-exit floor waits until it grows or is transferred. An approved payment request lowers every share's value at filing. Pricing, underwriting and verification are off-chain, and defaults correlate with the cycle and the region.

**Known limitations of the v1 binary** ([known limitations](security/known-limitations.md)). Each is a designed feature with its layout room already carved, so none needs an account migration:

- *first upgrade:* partial fills at the queue head; `amend_claim` and `refile_claim`; `reinstate_guarantee`; a cumulative NAV-guard baseline (today each move is compared with the last published NAV, and devnet sets the guard at 100% because a claim on a small demo reserve is a real NAV move);
- *before outside capital:* the claim-notice gate and the exit fallback, built together;
- *before mainnet:* transfer-restricted shares (devnet shares are classic SPL tokens and transfer freely), compatible with the open-exit rule;
- *later:* the unsolicited-money instructions and the booked backstop, adapters and a second reserve asset, the phase-2 instant exit, and the fiança lifecycle of ADR 0012 (exoneration, keys, exhaustion, claims tail, categories, the *quitação* hash).

**Legal and regulatory risk** (dated October 2026). Under review with counsel:

- recharacterisation of the *fiança* as insurance or securitisation (Decreto-Lei 73/1966), a risk that rises if third-party capital enters the reserve (DL 73 arts. 24 and 113, as amended by LC 213/2025);
- the securities status of reserve shares, in light of CVM's guidance on crypto-assets ([Parecer de Orientação 40](https://conteudo.cvm.gov.br/legislacao/pareceres-orientacao/pare040.html));
- BCB Resolutions 519–521 (in force since 2 February 2026): MUTAV uses virtual assets for its own operations, not as a service to third parties, so its working position is that it does not need authorisation as a virtual-asset service provider. A legal opinion to back this is pending, and it must also be confirmed for the reserve's operator and partners. When the reserve opens to outside capital, it will do so through a regulated vehicle; whether program-held escrow of provider deposits is custody; whether converting BRL to a BRL-referenced token is a foreign-exchange operation under Res. 521; and that the PSP and the BRS minter are authorised counterparties after the transition. No stablecoin-issuer regime exists yet (PL 4.308/2024);
- the fee's collection chain: whether the agency's collection and remittance needs a payment-institution or sub-account structure (Res. Conjunta BCB/CMN 16/2025), and whether including the fee in the tenant's rent boleto is compatible with LI 43 I. MUTAV bills only its own fee and never collects third-party money;
- currency: Lei 8.245/91 art. 17 forbids rent in foreign currency or indexed to the exchange rate, so Brazilian guarantees stay in BRL; stablecoin payments by agencies or tenants may be FX operations under Res. BCB 521 (pending counsel);
- whether published payment targets bind MUTAV under CDC art. 35;
- ring-fencing the reserve from MUTAV's creditors; LGPD re-identification of per-lease records; tax.

If MUTAV failed, landlords could require tenants to replace the guarantee within 30 days (art. 40); a run-off plan is part of the pilot design. Regulatory change may force design changes or end the pilot.

**Open decisions.**

- reserve sizing: the on-chain tail floor (§8). The pilot values are decided (`c` = 0.25 and a R$19k stress buffer, ADR 0028); the program floor of 0.10 is accepted (ADR 0016), and the founders start the pilot at a coverage ratio of at least 0.25, possibly higher;
- capital source after the pilot: MUTAV's balance sheet only, or also eligible investors through a regulated vehicle (§9);
- asset mix once adapters exist: TESOURO 50% or ~80% (the pilot is BRS only, ADR 0018); the BRS liquidity floor and allocation bands (ADR 0027, proposed); liquidity sleeve in BRS or a USD stablecoin (§10);
- exit-leg scope A, B (spec default) or C, at ≈37% / 30% / 21% claims-to-fees (§12);
- the 12× ceiling (legal review) and the per-guarantee cap against the R$39,600 working product;
- the claims tail, the payment term N, and the filing window (T0+9 or the spec's 15 days);
- for counsel: whether an accessories-inclusive ceiling displaces CC 822, whether exhaustion extinguishes the fiança for the art. 59 liminar, and whether a public below-target flag invites a CC 826 / LI 40 II argument;
- two legs or only categories; the backstop amount;
- agency billing: late-payment terms, activation fees, the take in BRL or BRS;
- the take rate (20% on devnet) and the caps after the pilot; the provision formula; recoveries;
- whether the pilot waits for a full independent audit;
- the issuers' answers on PDA mints, CPI burn, `BondPrice` and a BRS↔TESOURO path.

---

## 14. Roadmap

**First upgrade.** `amend_claim` and `refile_claim`, `reinstate_guarantee`, partial fills at the queue head, and a cumulative NAV-guard baseline. The layout already holds every field these need.

**Before outside capital.** The claim-notice gate and the exit fallback, built together ([ADR 0025](decisions/0025-exit-fallback-cooldown-exit.md)); transfer-restricted shares and investor attestations (a KYC attester slot is carved) before mainnet.

**Phase 2: instant exit (designed, not deployed)** ([spec §13](spec.md#13-phase-2--instant-exit-designed-disabled-in-the-pilot)). An allowlisted holder could exit at once at NAV minus a haircut that stays in the reserve, paid from a buffer earmarked out of surplus; it switches off whenever the queue is closed or the reserve is stressed, and MUTAV's own wallets are barred. Its parameters and the earmark were removed from the v1 layout before the freeze, and the padding keeps room to carve them back ([ADR 0026](decisions/0026-program-simplification-for-the-freeze.md)); `feature_flags` stays fail-closed, so it cannot be switched on without an upgrade.

**Assets and composability.** The pilot reserve is BRS only; more assets come in through whitelisted, capped adapters ([ADR 0018](decisions/0018-brs-only-pilot-reserve.md)), each described by its own `AdapterState` account, with a price MUTAV reads itself, a BRS liquidity floor, admin-executed moves, a program-enforced delay on risk-adding changes and an emergency path for guardians ([ADR 0027](decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), proposed). A live TESOURO adapter, the first candidate, follows once the price account and the BRS↔TESOURO path are confirmed. Reserve shares could later compose with other protocols; that is **not promised** and would need loss-aware NAV publication, exit liquidity and a securities analysis.

**Platform.** Boleto issuance through a licensed PSP, BRL→BRS conversion through an authorized minter, `contribute_fees` per agency bill with automated reconciliation, on-chain claim payments wired to platform approvals, the operator key moved from hand signing to KMS, the landlord mandate and *quitação* records, the unsolicited-money and backstop bookings, a recoveries flow, and an external completeness attestation.

**Multi-currency reserves.** One protocol can run one reserve per currency and market, each its own `VaultConfig`. A guarantee always matches its reserve's currency, so required coverage never carries FX risk; a USD reserve, for example, could serve markets where USD-denominated leases are legal. In Brazil, Lei 8.245/91 art. 17 forbids stipulating rent in foreign currency or indexing it to the exchange rate, so Brazilian guarantees stay in BRL.

**Scale gates.** Caps rise only through the time-locked multisig, after an external audit, and only while the KPIs in §12 hold.

---

## Appendix

### A. Glossary

| Term | Meaning |
|---|---|
| *Fiador* / *fiança onerosa* | Guarantor / paid guarantee under Lei 8.245/91 art. 37 II and CC arts. 818 ff. |
| *Valor afiançado* / *limite da fiança* | The R$ ceiling of one limited fiança (CC 823) = default + exit sub-limits, accessories included |
| Default leg / exit leg | Sub-limits inside one *valor afiançado*: rent and charges in arrears / the tenant's liquidated debts at exit (*sublimite para aluguéis e encargos em atraso / para débitos de saída*) |
| *Principal pagador* | MUTAV waives the *benefício de ordem* (CC 827–828) and pays within a contractual term |
| Agency (*imobiliária*) | Real-estate agency that runs the lease and distributes the guarantee |
| Guarantee fee (*taxa da fiança*) | Owed by the tenant, collected by the agency with the rent, billed to the agency monthly in one consolidated bill |
| Agency bill (*fatura mensal da imobiliária*) | One bill per agency per month, one line per guarantee in force, paid by boleto or PIX |
| Boleto / PSP | Brazilian bank payment slip / licensed payment provider that issues and settles it |
| Authorized BRS minter | Institution that mints BRS 1:1 against BRL |
| Take rate | MUTAV's share of each guarantee fee (`fee_take_bps`), sent to its treasury |
| Remaining cover | Cover minus amounts already paid, per leg (*saldo do valor afiançado*) |
| Missed-rent notice (`flag_claim_notice`) | On-chain flag at the first missed rent that closes the capital queues (claim-notice gate; built before outside capital) |
| Payment request (*pedido de pagamento*) / filing (`file_claim`) | The agency's request with the instrument's evidence; once complete it starts the payment term, and on approval it is booked as a provision on one leg |
| Claim payment (`pay_claim`) / approval (`approve_claim`) | BRS equal to the filed provision, sent from the reserve to MUTAV's payments account / the admin's approval of that exact amount, needed above the per-call cap |
| Parked request | A queued request the admin removed from the head; its funds stay owed to the owner, who collects them |
| *Quitação* / mandate | The landlord's receipt / the landlord's power for the agency to receive and give *quitação* |
| *Exoneração* | MUTAV's statutory exit once the lease runs for an indefinite term; liable 120 more days (LI 40 X) |
| Claims tail | Period after the keys or an effective exoneration during which payment requests may still be filed |
| `EXHAUSTED` / `VOID` | The *valor afiançado* is used up and the fiança extinguished / a lease that never took effect, closed with nothing paid |
| Reserve / reserve share | BRS (in the pilot; other assets such as TESOURO once adapters add them) custodied by the `mutav` program / SPL token for a pro-rata share of `net_assets` |
| NAV | `net_assets / shares_outstanding` |
| `stable_assets` / `coverage_required` | BRS plus, later, any adapter asset at its bounded price / `c` × remaining cover of all guarantees not closed, never below the open provisions plus the stress buffer |
| Stress buffer | An admin-set amount in reais for the claims that could be filed next, held on top of open provisions (R$19k in the pilot) |
| Underwater | NAV per share below the smallest published unit while shares are outstanding; both fills refuse |
| Surplus = free capital / liquid budget | Assets above `coverage_required` / BRS not needed by filed requests |
| Under-coverage mode | `stable_assets < coverage_required`; outflows freeze; public wording *reserva abaixo da meta; suporte da MUTAV ativo* |
| PDA / CPI / upgrade authority | Program-derived address / cross-program invocation / key allowed to replace a program's code (the upgrade multisig) |
| Guardian | A pause-only key appointed by the admin |
| Income inbox | The vault authority's associated token account for BRS, where the issuer pays its partnership revenue; nothing in it counts until `sweep_income` |
| BRS / TESOURO | Nora Finance's 1:1 BRL stablecoin (SPL) / Etherfuse's tokenized Brazilian federal bond exposure (Token-2022) |

### B. Parameters

| Parameter | Enforced in | Devnet and pilot value | Status |
|---|---|---|---|
| `max_tvl` | `fulfil_deposits` | R$1M | Decided (ADR 0028); the ceiling of the path-to-R$1M capital plan |
| `max_cover_per_guarantee` | `register_guarantee` | R$120k | Decided (ADR 0028); fits the R$39,600 working product with room |
| `max_claim_per_call` | `pay_claim`; above it only with `approve_claim` of the exact amount | R$15k | Decided (ADR 0028); a 6×-rent eviction (R$13,200) fits |
| `max_claim_per_period` | `pay_claim`, over any 31 consecutive UTC days (approved payments included) | R$20k | Decided (ADR 0028); about 2% of `max_tvl` |
| `stress_buffer` | `coverage_required` (ADR 0022, in the v1 binary) | R$19k | Decided (ADR 0028); at most `max_tvl` |
| `c` (`coverage_ratio_bps`) | All gates | 0.25 (conservative variant 0.50) | Decided (ADR 0028); program range 0.10–1.0 (ADR 0016, ADR 0022); the two-tail-year check stays off-chain |
| `fee_take_bps` | `contribute_fees` | 20% | Devnet config (ADR 0028); final rate open; program max 30% |
| `min_request` / `max_request` | `request_*` | R$1,000 / R$100,000 | Decided (ADR 0028); a full exit below the minimum is allowed down to a tenth of it (ADR 0029) |
| `max_nav_move_bps` | `refresh` and both fills | 100% on devnet | Lowered for the real pilot (value open) |
| Admin / upgrade time locks | Squads | 24 h / 7 days in the real pilot (devnet floors 5 min / 1 h) | Decided (ADR 0020) |
| `max_queue_wait_secs` | Exit fallback (ADR 0025) | 0 (off) | Built before outside capital |
| `max_reinstate_age` | `reinstate_guarantee` (first upgrade) | 0 (planned 30 days) | Decided (ADR 0020) |
| Virtual share offset `k` | Share math | 0 (V = 1) | Decided (spec §12 Q20) |
| BRS liquidity floor, adapter `cap` and share | `allocate`, `fulfil_redeems` (with adapters) | 100% BRS; no adapter | Proposed (ADR 0027); business plan targets ~80% bonds (open) |
| `claims_tail_secs` | `notify_exoneration`, `record_keys_returned` (later) | — | Open (≤3 years) |
| `payment_term_secs` | Disclosure only (later) | — | Open (counsel) |
| `backstop_amount` / `backstop_commitment_hash` | Disclosure; never in NAV (later) | — | Open |
| `optional_categories` (termination penalty) | `file_claim` (later) | Off | Open (exit scope A/B/C) |
| `min_fill_assets` | Partial fills (first upgrade) | R$500 | Proposed |
| `max_staleness_secs`, `max_deviation_bps` | Adapter price read (later) | — | Open |

Removed before the freeze: the per-agency cap, the on-chain payout deadline (`payout_sla_secs`) and the take on issuer income ([ADR 0019](decisions/0019-v1-layout-for-the-devnet-release.md)).

### C. Formulas

The core block is in §8 and the redemption budget in §9. The remaining formulas:

```text
Share conversion (virtual offset V = 10^k, k = 0 so V = 1):
  shares_for(assets) = floor(assets × (shares_outstanding + V) / (net_assets + 1))
  assets_for(shares) = floor(shares × (net_assets + 1) / (shares_outstanding + V))

TESOURO bounded price (with the adapter, later):
  bounded_price = min(BondPrice, p0 × (1 + y_max)^((t − t0) / year))
  y_max = maximum annual accrual rate (value TBD; ADR 0027 proposes a corridor that restarts from each accepted price)

Fee split (one call per paid agency bill):
  take = floor(amount × fee_take_bps / 10_000)  → treasury_account
  net  = amount − take                           → reserve

Phase 2 only, not in the v1 layout:
  earmark_eff = min(buffer_earmark, surplus, max(0, brs_balance − provisions))
              = 0 when INSTANT_EXIT is off

Sliding claim window (31 UTC daily buckets):
  Σ payments of the last 31 days, this one included ≤ max_claim_per_period
```

### D. Worked month, full table

*Illustrative. The guarantee fee (10% of rent per guarantee-month: R$200 on R$2,000 rent, R$150 on R$1,500) and take (20%) are placeholders, not MUTAV pricing. The covers (3× + 6× on R$2,000) are smaller than the working product (12× + 6× on R$2,200, §12); they are chosen so the arithmetic is legible. Fee receipts land after each agency's bill is paid and converted, so the days are illustrative. `c` = 1.0. The virtual share offset is ignored, so the real program differs by a few base units. Amounts in R$, rounded to R$1 in the columns; after day 21 the reserve keeps one extra base unit (R$0.000001) from rounding. TESOURO is included to show the bounded-price mechanics of a future adapter; the pilot reserve holds BRS only (ADR 0018). The day-20 accrual is exaggerated for legibility and is not a rate forecast. Two more rows show designed features that the v1 binary does not have yet: the missed-rent notice and its close (days 5 and 14, the claim-notice gate) and the partial head fill (day 21, ADR 0010); in the pilot binary the day-21 head would wait whole. The stress buffer does not bind at `c` = 1.*

**Setup.** 90,000 shares at NAV 1.000000. The reserve holds R$60,000 in BRS and TESOURO valued at R$30,000. Four guarantees, G1–G4, across two agencies (two each), each on R$2,000 rent with R$6,000 of default cover and R$12,000 of exit cover.

| Day | Event | BRS | TESOURO | `stable_assets` | `coverage_required` | Free capital | Provisions | Shares | NAV/share |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Start | 60,000 | 30,000 | 90,000 | 72,000 | 18,000 | 0 | 90,000 | 1.000000 |
| 1 | `contribute_fees` ×2, one per agency bill (prior month, settled and converted): gross 800 = 2 × 400, take 160, net 640 | 60,640 | 30,000 | 90,640 | 72,000 | 18,640 | 0 | 90,000 | 1.007111 |
| 3 | Provider A `request_redeem` 10,000 shares | 60,640 | 30,000 | 90,640 | 72,000 | 18,640 | 0 | 90,000 | 1.007111 |
| 5 | G1 misses rent → `flag_claim_notice` (queues closed) | 60,640 | 30,000 | 90,640 | 72,000 | 18,640 | 0 | 90,000 | 1.007111 |
| 12 | `file_claim(DEFAULT, rent, 2,000)` | 60,640 | 30,000 | 90,640 | 72,000 | 18,640 | 2,000 | 90,000 | 0.984888 |
| 14 | `pay_claim(DEFAULT, 2,000)`; `close_claim_notice(Paid)` | 58,640 | 30,000 | 88,640 | 70,000 | 18,640 | 0 | 90,000 | 0.984888 |
| 16 | `settle_payout(pix_e2e_hash)` | 58,640 | 30,000 | 88,640 | 70,000 | 18,640 | 0 | 90,000 | 0.984888 |
| 18 | `register_guarantee` G5 (rent 1,500): cover 4,500 + 9,000 | 58,640 | 30,000 | 88,640 | 83,500 | 5,140 | 0 | 90,000 | 0.984888 |
| 20 | `refresh`: TESOURO accrues +0.9% (exaggerated) | 58,640 | 30,270 | 88,910 | 83,500 | 5,410 | 0 | 90,000 | 0.987888 |
| 21 | `fulfil_redeems(1, u64::MAX)`: partial head fill | 53,230 | 30,270 | 83,500 | 83,500 | 0 | 0 | 84,523.675628 | 0.987888 |
| 22 | Provider A `claim_assets` (R$5,409.999999) | 53,230 | 30,270 | 83,500 | 83,500 | 0 | 0 | 84,523.675628 | 0.987888 |
| 30 | `contribute_fees` ×2 (late payers' bills): gross 750, take 150, net 600 (G1's line not yet received) | 53,830 | 30,270 | 84,100 | 83,500 | 600 | 0 | 84,523.675628 | 0.994987 |

**Day-21 budget check.** `budget = min(∞, free_capital 5,410, liquid_budget 58,640) = 5,410`. The head request is worth R$9,878.89, more than the budget, so the fill is partial. It is at least `min_fill_assets` (R$500) and leaves R$4,468.89, at least `min_request` (R$1,000).

- Shares burned: `floor(5,410 × 90,000 / 88,910) = 5,476.324372`.
- Assets paid out: R$5,409.999999, rounded down, so the reserve keeps the dust (BRS 53,230.000001).
- NAV per share is unchanged.

### E. References and provenance

- Lei 8.245/91 (Lei do Inquilinato): <https://www.planalto.gov.br/ccivil_03/leis/l8245.htm>
- Código Civil (Lei 10.406/2002), arts. 397, 818–839: <https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm>
- IBGE, PNAD Contínua 2024 (rented households).
- CNseg/SUSEP data on *seguro-fiança* written volume, via CQCS: <https://cqcs.com.br/noticia/pottencial-seguradora-destaca-crescimento-do-seguro-fianca-locaticia-que-movimenta-r-19-bilhao-em-12-meses/>
- Superlógica rental delinquency index (IIL): January 2026 <https://stgnews.com.br/inadimplencia-de-aluguel-comeca-2026-em-queda-aponta-indice-superlogica/>; July 2026 national and regional release (3.05% national, South 2.67%); RS state cuts, April–July 2026.
- Loft IIA rental delinquency index, RS series, April–August 2026.
- QuintoCred closure, Imobi Report (2025): <https://imobireport.com.br/aluguel/exclusivo-quintoandar-encerra-operacao-do-quintocred-garantia/>
- FF Seguros exit from individual *seguro-fiança*: Imobi Report, October 2024. Seguradora Infinite: SUSEP extrajudicial liquidation, May 2026.
- SUSEP Circular 621/2021, art. 43 (30-day payment ceiling for damage lines).
- CredPago/Loft public pricing: portal.loft.com.br.
- BCB, Resolutions 519–521: <https://www.bcb.gov.br/detalhenoticia/20918/nota>
- CVM Parecer de Orientação 40: <https://conteudo.cvm.gov.br/legislacao/pareceres-orientacao/pare040.html>
- PL 4.308/2024: <https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2467716>
- Nexus Mutual, MCR: <https://docs.nexusmutual.io/protocol/capital-pool/mcr/>
- OnRe: <https://github.com/onre-finance/onre-sol>
- solana-foundation/vault (MIT): <https://github.com/solana-foundation/vault>
- Squads v4: <https://github.com/Squads-Protocol/v4>
- solana-verify: <https://github.com/otter-sec/solana-verifiable-build>
- Solana fees and CPI: <https://solana.com/docs/core/fees>, <https://solana.com/docs/core/cpi>
- Nora BRS: <https://www.nora.finance/docs/integrate/core-concepts/brs-token>
- Etherfuse stablebonds and price feeds: <https://etherfuse.com/products/stablebonds>, <https://docs.etherfuse.com/price-feeds.md>
- Internal: [spec](spec.md), [ADRs](decisions/), [implementation plan](plan.md), [provenance](provenance.md), [acknowledgements](../README.md#acknowledgements).

### F. Accounts (PDAs)

Accounts in the v1 devnet binary; each carries a version and zeroed padding sized for its planned carves.

| Account | Seeds | What it holds or proves |
|---|---|---|
| `VaultConfig` | `["config", reserve_mint]` | Roles and pending handovers, guardians, caps (with `stress_buffer`), `c`, take rate, payments and treasury accounts, allowlist root, feature flags (fail-closed), disclosed MUTAV capital wallet; carved for later: adapter count and bitmap, attester slot, claims tail, payment term, optional categories, backstop disclosure |
| `VaultState` | `["state", config]` | Tracked balances, `remaining_cover_total`, provisions, cached `coverage_required`, shares, NAV and the NAV-guard baseline, queue heads, mode, the 31 daily claim buckets, lifetime capital counters |
| Vault authority | `["authority", config]` | PDA signer for the reserve and share-mint authority; never passed into an adapter CPI |
| Token accounts | `["reserve" \| "pending_deposits" \| "pending_redemptions" \| "claims" \| "unsolicited", config]` | Liquid reserve; escrowed deposits; escrowed shares; BRS owed to exiting capital providers; untracked money awaiting booking or return |
| Income inbox | The vault authority's associated token account for BRS | Issuer partnership revenue before `sweep_income`; never counted |
| `Guarantee` | `["guarantee", config, id]` | One per lease: opaque agency id, `refs_hash`, absolute cover per leg, paid and provisioned amounts, open claims, status (`ACTIVE` or `CLOSED`), close reason; carved for later: `contract_cap_hash`, `landlord_mandate_hash`, exoneration, keys and tail timestamps |
| `IncomeReceipt` | `["fee", config, invoice_ref_hash]` or `["income", config, income_ref_hash]` | One per agency bill (kind `FEE`: gross, take, net) or per issuer statement (kind `ISSUER_STATEMENT`), counted exactly once; never closed |
| `ClaimFiling` | `["claim", guarantee, notice_ref_hash]` | One per claim, from filing to settlement: leg, provision, revision, approved amount, payment, PIX settlement hash and time; carved for later: category, `request_complete_ts`, *quitação* and mandate hashes |
| `DepositRequest` / `RedeemRequest` | `["deposit" \| "redeem", config, seq]` | FIFO position, amounts, price limit, status (pending, filled, parked) |

`AgencyExposure`, `Payout`, `HolderState` and `FeeReceipt` were removed before the freeze ([ADR 0019](decisions/0019-v1-layout-for-the-devnet-release.md)); `ClaimNotice` arrives with the claim-notice gate.

### G. Architectural prior art

| | MUTAV (pilot) | OnRe | Credix | Huma | Maple | Nexus Mutual |
|---|---|---|---|---|---|---|
| What it is | Guarantee reserve for rental *fiança* | Tokenized risk-transfer yield | Private credit | Receivables financing | Institutional lending | On-chain mutual cover |
| Denomination | BRL | USD | USDC on-chain; BRL off-chain | USDC | USDC | ETH and stables |
| Liabilities on-chain? | Yes, one account per guarantee | Aggregate NAV only | Deal state only | Pool state only | Loan state (Ethereum) | Yes, active covers |
| Exit gated on on-chain required coverage? | Yes: exits only from surplus over required coverage (`c` × remaining cover, never below provisions plus a stress buffer; `c` governed) | No | No | Tranche-ratio gate | No | Partly: MCR% > 100% |
| Audited / open source | Internal reviews only, **no independent audit**; MIT | Audited; open | Closed source¹ | Audited; Solana programs private¹ | Audited; open (Ethereum) | Audited; open |

¹ Where programs are closed source, the entries are inferred from public documentation.

---

## Status

Draft dated 2026-10-15 · version 0.4 · internal reviews only, no independent audit · program live on devnet (`v1.0.0-devnet`); mainnet pilot gated (§12). v0.4 brings the paper in line with the v1 devnet binary and ADRs 0014–0030: claim approval and exact payment in place of an admin payment path, the sliding 31-day claim cap, the stress buffer and the underwater rule, operator/admin separation with two multisigs, guardians and two-step role handover, whole fills and open exits for holders, parked requests, the income inbox with no take, the removal of the per-agency cap, the on-chain payout deadline and personal data, the pilot parameters of ADR 0028, the pre-devnet reviews and audit, and the known limitations. Features carved for later upgrades are marked as such. v0.3 aligned the paper with ADR 0012 and added the monthly billing of partner agencies. Every cap and parameter can be changed only by the time-locked admin multisig.
