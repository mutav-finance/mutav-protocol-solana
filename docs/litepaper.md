# MUTAV: A Verifiable BRL Guarantee Reserve on Solana

**Technical litepaper for the Colosseum pilot**

v0.3 · October 2026 · Not legal advice. Not an offer of securities. Unaudited software.

---

## Abstract

MUTAV is an institutional *fiador*. It gives Brazilian tenants a paid rental guarantee (*fiança onerosa*, Lei 8.245/91 art. 37 II) through the real-estate agencies that already run their leases, so no personal guarantor or locked-up deposit is needed. Each partner agency pays MUTAV one consolidated bill a month, by boleto or PIX, for the guarantee fees of all its leases. The `mutav` Solana program is designed to record every guarantee with its remaining *valor afiançado* (the fiança's R$ ceiling) and to custody a BRL reserve that refuses any capital movement that would leave that cover under-backed by the governed coverage ratio `c`. It never refuses a claim payment for solvency, pause or price reasons: only the guarantee's remaining *valor afiançado* and the liquid BRS bound it. The operator's payment caps limit what a single hot key can move, and payments above them go through the time-locked admin multisig or a MUTAV advance that the reserve reimburses. The Colosseum submission delivers the program on devnet; a capped mainnet pilot follows once its start conditions are met (proposed program cap R$100k; working reserve target R$300k; open, §12). The reserve is not a yield product, and nothing here promises a return.

**For Colosseum judges.**

| Criterion | Where |
|---|---|
| Functionality | §12(a): devnet program, invariant tests, lifecycle demo |
| Impact | §1: 17.8M rented households; 5 of 7 agencies interviewed front the landlord's rent |
| Novelty | §8: per-guarantee liabilities on-chain gate every capital exit, and claim payments are never solvency-gated |
| UX | §7: agencies keep their workflow (one monthly bill by boleto, PIX or BRS, a transparency page) and never call the program |
| Open source | Apache-2.0, verified builds (§6, §11) |
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

*MUTAV is a guarantor whose reserve can't be drained below what its rules say it must back, and whose claim payments are never blocked by the solvency gate or a pause.*

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
3. **The payment clock is public** (against slow and partial payment). MUTAV pays within a contractual term N from a **complete payment request** (`request_complete_ts` on-chain; N disclosed in `payment_term_secs`, under counsel review). The working targets are ≤4 calendar days from the agency's request to PIX and ≤15 from the rent due date, each step timestamped on-chain.

The promise leads with payment, not a coverage multiple: paid on time, never partially beyond what was approved, no *exoneração* outside the statutory 120-day notice (public on-chain), and a checkable reserve. Timing figures are working targets until counsel confirms how they bind MUTAV (CDC art. 35).

**Table 2. MUTAV against what agencies choose today** (public figures only)

| | Approval | Time to pay | Unilateral *exoneração* | Reserve visibility |
|---|---|---|---|---|
| *Seguro-fiança* | Underwritten; a large share rejected | Up to 30 days from complete documents (SUSEP Circ. 621/2021 art. 43); document requests pause the clock | Per contract terms | Regulated solvency reports, aggregate only |
| Fintech *garantidora* | Fast, app-based | Published SLAs of a few business days; agencies report 60–90-day waits | Reported by agencies | None public |
| **MUTAV** | Underwritten off-chain, per lease | Working target ≤4 days request → PIX, ≤15 days due date → PIX (under legal review); timestamped on-chain | None during the fixed term; afterwards only the statutory 120-day notice (LI 40 X), recorded on-chain, with cover held through the notice and the claims tail | Per-guarantee cover and the reserve, on-chain, recomputable |

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
| *Taxa da fiança* | 9%, 12% or 15% of monthly rent by tenant score band (scores below 400 refused); modelled at 10% = **R$220 per lease per month** |
| Who pays whom | Tenant → agency, with the rent. Agency → MUTAV, one consolidated bill a month, boleto or PIX |
| *Valor afiançado* per lease | Default sub-limit 12× rent (under legal review) + exit sub-limit 6× rent = **R$39,600** |
| Pilot book | ~170 leases across up to 5 partner agencies (~34 each), ~6 months; gross fees ≈R$37,400 a month at full book |
| Expected claims against fees | ≈20% for rent arrears alone (RS base delinquency); ≈30–45% once exit debts are included, by scope (§12) |
| MUTAV revenue | Take `t` on each fee (open; program maximum 30%) |
| Reserve | Working target R$300k; sizing rule open (§8) |

```figure id="fig-1b-agency-month" title="Figure 1b. One agency, one month"
Left-to-right flow (Sankey or stacked flow), labelled "working parameters, illustrative".
[34 guarantees in force × R$220] = [Consolidated bill R$7,480] --"paid by boleto or PIX"--> [BRL at MUTAV] --"1:1 via authorized minter"--> [7,480 BRS]; a thinner parallel branch [Consolidated bill] --"or paid in BRS (Solana Pay)"--> [7,480 BRS] --"contribute_fees (1 FeeReceipt)"--> split into [MUTAV treasury: take t (open)] and [Reserve: net].
Side branch from the reserve: "expected claim payments ≈ 20% of fees (rent arrears, RS base) to ≈ 39% (with exit debts, scope B)".
Reserve box annotation: "c governed: full backing or expected-loss sizing (§8)".
Footnote: "Not a return; take and c are open."
```

---

## 3. Why a chain, and why Solana

The obvious alternative is a segregated bank escrow account with a monthly auditor's attestation. The chain adds four things that baseline cannot.

1. **The rule binds MUTAV itself.** There is no `withdraw_surplus` instruction. Capital leaves only from surplus over the cover it backs, and only while no missed-rent notice is open. An escrow statement shows a balance once a month; it cannot stop the operator in between.
2. **Continuous, permissionless recomputation.** Anyone can call `refresh` and recompute coverage, surplus and NAV from public accounts, at any time.
3. **Per-guarantee liabilities and payment timestamps are public.** Each lease's cover, every provision, every claim payment and its PIX settlement proof are addressable accounts and events. That answers the agencies' "no visibility" complaint directly.
4. **Solana specifically.** A 30-month lease needs a handful of its own transactions, and fees arrive as one `contribute_fees` per agency per month for all its leases. Base fees are negligible; the larger cost is rent-exempt deposits: about 0.0035 SOL per `Guarantee` and 0.0019 SOL per monthly `FeeReceipt`, shared by every lease on the bill (about 0.002 SOL per lease over 30 months at ~34 leases per agency; our estimates, benchmarks to follow). Squads v4 and `solana-verify` make upgrade governance observable, and a BRL stablecoin and tokenized Brazilian federal bonds already exist on Solana mainnet.

We argue for Solana on fit, not necessity: the business model is chain-agnostic (§5).

---

## 4. Team and traction

**Founder-market fit.** One co-founder has 5+ years building in Web3 and long-standing ties to the regional real-estate market; the other, a design engineer and urban planner, took a consumer Web3 fintech product from 0 to 30,000 users. A real-estate advisor with 30 years in the RS/SC rental market opens the agency cohort, and a senior blockchain security engineer advises on the program.

**Traction, as counts.**

- 7 documented agency discovery interviews (§1).
- The MUTAV platform is built and pre-launch at app.mutav.finance and admin.mutav.finance: agency onboarding with staff review, lease and guarantee registration with an immutable snapshot of the terms, score-banded pricing, a seven-state guarantee lifecycle, default notices, **monthly consolidated agency bills issued automatically** (one per agency, one line per guarantee), PIX settlement in sandbox, boleto modelled in the data and UI with issuance pending a licensed payment provider (not yet contracted; it needs the company's CNPJ), a hash-chained audit log and an admin console.
- Devnet program: pending (§12).
- No live guarantee has been issued yet.

---

## 5. Design principles and prior art

Six rules shape every mechanism ([spec §1](spec.md#1-principles)).

1. **The business model is fixed and chain-agnostic.** The program does not price, underwrite or decide payment requests.
2. **Only what is verifiable on-chain counts** toward the reserve, NAV or coverage. Losses are recognised early, when a payment request is approved. The trust that remains in token issuers is disclosed.
3. **MUTAV operates every chain touchpoint.** Agencies, tenants and landlords never call the program; an agency paying in BRS signs only a token transfer.
4. **The solvency gate protects the reserve. It never blocks a claim payment.**
5. **Start tight.** Hard on-chain caps bound every outflow and every new liability. Only the time-locked multisig raises them.
6. **Upgrade without migration** ([ADR 0011](decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)).

**Prior art.** Nexus Mutual allows NXM redemptions only while its capital ratio MCR% is above 100%, where MCR is active cover divided by 4.8, a gearing heuristic ([Nexus docs](https://docs.nexusmutual.io/protocol/capital-pool/mcr/)). MUTAV's gate works per guarantee and requires `c` × remaining cover, with `c` a governed parameter (1.0 in this spec; the pilot value is open, §8). OnRe contributed patterns for a Squads-held admin, supply caps and per-request partial fills, and our async core is forked from [solana-foundation/vault](https://github.com/solana-foundation/vault) (MIT). To our knowledge, MUTAV is the first BRL guarantee reserve on Solana whose capital flows are gated by on-chain coverage of its liabilities (Appendix G).

---

## 6. Architecture on Solana

*Sections 6–11 describe the specified design. Implementation status is in §12.*

### Programs

The protocol has four components ([ADR 0002](decisions/0002-core-program-and-capped-adapters.md)):

- **`mutav`**, the core program: custody, the share mint, NAV, the guarantee exposure registry, the solvency gate, the async queue, roles and claim payments.
- **`mutav-adapter-interface`**, a crate fixing the discriminators and layouts every venue adapter implements (`deposit`, `withdraw`, `position_value`).
- **`mutav-adapter-mock`**, for devnet and tests.
- **One adapter program per venue.** TESOURO comes first and ships as **interface and mock only** until the price-account layout and a BRS↔TESOURO conversion path are confirmed.

A Codama-generated TypeScript client composes instructions and holds no keys; the MUTAV platform signs.

### Accounts

`VaultConfig` is seeded by the reserve mint (`["config", reserve_mint]`), so the program runs one reserve per mint: each currency has its own reserve, coverage and NAV. Every other PDA includes the config address in its seeds. Reserve balances are split across four token accounts, so a freeze targeted at one does not trap every balance; an issuer freeze of all of them is detected and treated as under-coverage. Each lease gets exactly one `Guarantee` account, and every agency bill, missed-rent notice, filing and capital request gets its own PDA, which makes each idempotent and publicly addressable (Appendix F, [spec §3](spec.md#3-accounts)).

**The vault-authority PDA signs for the reserve and mints shares. It is never passed into an adapter CPI.** Each adapter acts only through its own capped sub-authority PDA, which owns only that adapter's staging account. After every CPI the core reloads every vault token account and the share supply, and rejects any change other than the expected one.

### Roles

**Table 3. Roles and powers**

| Role | Key custody | Instructions | Time-locked? |
|---|---|---|---|
| Admin | Squads v4 multisig vault; also the program upgrade authority | `set_config`, `set_roles`, accounts, allowlist, adapters, `unpause`, `fulfil_deposits`, `fulfil_redeems`, `allocate`, `deallocate`, `pay_claim_admin` | Yes, all of them |
| Operator | Hot key held in KMS, used by the MUTAV platform | `register_guarantee`, `notify_exoneration`, `record_keys_returned`, `close_guarantee`, `contribute_fees`, `flag_claim_notice` / `close_claim_notice`, `file_claim`, `pay_claim`, `settle_payout` | No (bounded by caps) |
| Pauser | Separate key | `pause`, `revoke_operator` | No |
| Capital provider | Own wallet, allowlisted by Merkle root (KYC off-chain) | `request_*`, `cancel_*`, `claim_shares`, `claim_assets` | No |
| Anyone | — | `refresh`, `advance_queue_heads` | No |

What a stolen operator key can and cannot do is in §13. Only amounts, timestamps and salted or HMAC'd commitments cross the trust boundary; no names, documents or addresses go on-chain. Every token movement and state change emits an `emit_cpi!` event for the indexer and transparency page.

**Runtime constraints.** Adapters make one level of CPI, and aggregates such as `remaining_cover_total` are updated incrementally rather than by iterating guarantees ([spec §14](spec.md#14-upgrade-readiness)). The PIX legs, not the chain, set the payment pace.

```figure id="fig-2-architecture" title="Figure 2. System architecture and trust boundary"
Two columns separated by a vertical dashed line labelled "trust boundary: only amounts + hashes cross this line; per agency bill only amount + invoice_ref_hash".
Left column "MUTAV platform (off-chain)": boxes [Agencies], [Tenants], [Landlords], [mutav-app / Convex] containing a small [Monthly billing job (1st)], [KMS operator key], [Licensed PSP: boleto · PIX collection], [Authorized BRS minter / offramp: BRL ↔ BRS], [Indexer], [Transparency page], [Admin console]. Dashed arrow from [Agencies] to [Licensed PSP] labelled "pays monthly bill".
Right column "Solana": central box [mutav core program] containing [Vault authority PDA]; below it four token accounts [reserve], [pending_deposits], [pending_redemptions], [claims]; to the right [Adapter program(s)] each with a [capped sub-authority PDA] and [staging account]; top right [Squads v4 multisig + time lock] (also upgrade authority); top left [Pauser key].
Arrows coloured by signer: orange (operator) from KMS key to core labelled register_guarantee, notify_exoneration, record_keys_returned, close_guarantee, contribute_fees (1 per agency bill), flag_claim_notice, close_claim_notice, file_claim, pay_claim, settle_payout; blue (admin) from Squads to core labelled fulfil_deposits, fulfil_redeems, allocate, deallocate, set_config, pay_claim_admin; green (capital provider) from a wallet icon labelled request_deposit, request_redeem, claim_shares, claim_assets; grey (anyone) labelled refresh, advance_queue_heads; red (pauser) labelled pause, revoke_operator.
Arrow from core to adapter labelled "CPI signed by sub-authority only; post-CPI checks".
Events arrow from core back across the boundary to [Indexer] -> [Transparency page], labelled "emit_cpi! events".
Callout near the client: "TS client composes transactions; holds no keys".
Alt text adds: a licensed payment provider for boleto and PIX collection, and an authorized BRS minter and offramp.
```

**Stack and provenance.** Anchor 1.2.0, Solana CLI 4.1.2, LiteSVM, Mollusk, Surfpool, Squads v4 and `solana-verify`. The async core is forked from solana-foundation/vault (MIT) with its unrestricted withdrawal removed; no OnRe code was copied. Apache-2.0 ([provenance](provenance.md)).

---

## 7. Guarantee lifecycle

One lease, from registration to the end of the fiança ([spec §5.2–§5.4](spec.md#52-guarantees-operator), [ADR 0012](decisions/0012-fianca-aligned-guarantee-lifecycle.md)):

**Register.** The agency activates a lease in the platform, and MUTAV underwrites it off-chain. The operator calls `register_guarantee` with the lease's id, agency, `refs_hash`, rent and two absolute covers. Each guarantee is one **limited fiança** (CC 823): its ceiling, the *valor afiançado*, is `default_cover + exit_cover`, accessories (interest, penalties, court costs) included. The two legs are sub-limits of it: a default sub-limit for rent and charges in arrears, and an exit sub-limit for the tenant's liquidated debts at the end of the lease (damage beyond normal wear, court costs the tenant owes, abandonment and repossession costs, other listed debts; the early-termination penalty is a reserved category, disabled until decided). A fiador pays what the tenant owes; it does not fund the landlord's eviction (CC 821). The instruction also stores `contract_cap_hash` (the signed cap schedule) and `landlord_mandate_hash`, checks the per-guarantee and per-agency caps, and requires the added cover to fit in free capital. No instruction changes the covers afterwards ([ADR 0006](decisions/0006-per-lease-absolute-coverage.md)), and NAV does not change.

### Monthly billing of partner agencies

The tenant owes the *taxa da fiança*, and the agency collects it with the rent in its own rent flow. On the 1st of each month the MUTAV platform issues each partner agency **one consolidated bill**: a line per guarantee in force (guarantees in arrears included), plus a one-time activation line in a guarantee's first month (working parameter). It is due on a fixed day set in the partnership agreement; the platform uses the 10th. The agency pays it by **boleto** or **PIX** through a licensed payment provider (PSP). MUTAV bills only its own fee: any third-party charge on the same bill is split to its owner at settlement and never enters MUTAV's accounts, the reserve or NAV.

MUTAV receives BRL, converts it 1:1 into BRS through an authorized BRS minter, and the operator calls `contribute_fees(invoice_ref_hash, amount)` once per paid bill, for its guarantee-fee lines only. The `FeeReceipt` PDA keyed by `invoice_ref_hash` makes each bill count exactly once, even if a payment webhook arrives twice. The same instruction sends the take to MUTAV's treasury and the net to the reserve ([ADR 0007](decisions/0007-fee-take-direct-to-treasury.md), [ADR 0009](decisions/0009-separate-mutav-money-flows.md)). NAV rises, no shares are minted, and fees are never paused or gated.

**Paying in stablecoin (designed).** An agency may also pay its bill in a stablecoin: BRS in the pilot, 1:1 with BRL, so there is no FX. The platform shows a Solana Pay link or QR carrying the bill's reference; the BRS goes to MUTAV's operator BRS account, skips the minter and reaches the reserve faster. The agency only transfers tokens and still never calls the program: the operator posts `contribute_fees` for that bill as for any other. Tenants who prefer to pay in USD can settle the BRL fee with USD stablecoins at billing time; the lease and the fiança stay in BRL.

**Reconciliation (proposed).** A bill is recorded on-chain only when the PSP settlement, or the BRS transfer carrying its reference, equals its total; a mismatch or reversal goes to manual review. `invoice_ref_hash` is a keyed hash of the bill's number, period and lines, so the public cannot link receipts to agencies, while each agency, given its preimage, can find its own. Month-end close compares totals billed, settled, minted and recorded; converted BRS waits in the operator's public BRS account only until `contribute_fees`, normally the same day.

**If an agency pays late.** The fiança stays in force. No claim, cover or payment-clock rule depends on the bill being paid (spec PC-7): an unpaid fee is MUTAV's own claim, never a defence against the landlord (CC 837), and claim payments are never reduced by it. On-chain the guarantee's cover still counts in `coverage_required`, and no `FeeReceipt` exists until payment, so the reserve misses that month's net fee; unpaid bills are never reserve assets. Off-chain the bill is marked overdue. Grace period, late charges, when MUTAV stops accepting that agency's new registrations, and who bears a defaulting tenant's fee belong in the partnership agreement and are **open**.

Status: bill generation runs in the platform and PIX settlement in sandbox; boleto issuance, the PSP, the minter integration, stablecoin payment and automated `contribute_fees` are not live. The devnet demo shows the bridge with a mocked PSP webhook and a devnet BRS mint, labelled simulated settlement.

```figure id="fig-3b-billing-cycle" title="Figure 3b. Monthly billing cycle"
Swimlane timeline, six lanes top to bottom: Agency | MUTAV platform | Licensed PSP | Authorized BRS minter | Operator key | mutav program.
1. d1 06:00 BRT, platform -> agency: "consolidated bill: Σ taxa da fiança of guarantees in force (+ activation line in a guarantee's first month)".
2. d1–d10, agency: "collects each tenant's fee in its own rent flow" (tenants off-diagram).
3. By d10, agency -> PSP: "boleto (clears in 1–2 business days) or PIX (minutes)". Alternative arrow, agency -> operator BRS account directly: "BRS via Solana Pay (bill reference); skips steps 4–5".
4. PSP -> platform: "settlement webhook: amount, PSP reference" -> bill "paid" (only if amount = bill total).
5. Platform -> minter: "PIX (BRL)"; minter -> operator BRS account: "BRS 1:1".
6. Operator -> program: "contribute_fees(invoice_ref_hash, amount)" -> "FeeReceipt created; take -> treasury; net -> reserve; NAV rises".
7. Program -> indexer -> platform: "FeesContributed{gross, take, net}" -> bill "recorded on-chain".
8. Month end: "reconciliation: billed = settled = minted = Σ FeeReceipt.gross".
Red branch from step 3: "unpaid after the due date -> overdue: guarantee stays in force, cover unchanged, no FeeReceipt; terms open".
Bracket over steps 3–6: "fees in transit: excluded from NAV until recorded".
```

**Missed-rent notice.** At the first missed rent, the operator calls `flag_claim_notice`; while any notice is open, both capital queues stay closed, so nobody enters or leaves at a NAV that misses a known loss.

**Filing.** The agency files the payment request (*pedido de pagamento*) with evidence in the platform, between day 3 and day 9 after the due date (working process; the spec's 15-day window is to be reconciled). MUTAV verifies it. On approval, `file_claim` books a provision under a named **category** of guaranteed debt and records `request_complete_ts`, which starts the contractual payment term. **NAV drops at filing**, while coverage is unchanged, because the payment already sits inside the guarantee's remaining cover.

**Payment.** `pay_claim` sends BRS from the reserve to MUTAV's whitelisted payments account. **It applies no solvency, mode, price or earmark check.** The program enforces which leg may pay each category and refuses only the cases in Table 4's note ². The operator caps (R$10k per call, R$20k per 30 days, proposed) limit what the hot key can move, not what MUTAV owes: a larger payment, such as a R$13,200 exit claim, goes through `pay_claim_admin`, signed by the time-locked admin multisig under every other rule. If even that cannot pay within the contractual term, MUTAV advances the payment and the reserve reimburses it later (`PAYOUT_BACKSTOP_REIMBURSEMENT`). The reserve never pays more than the remaining *valor afiançado*; when total paid reaches it, the guarantee becomes `EXHAUSTED` in the same instruction, and MUTAV notifies the landlord that the fiança is extinguished.

**Why exhaustion matters.** While a guarantee is in force, the landlord cannot obtain the 15-day eviction *liminar* (art. 59 §1º IX), so evictions run on the ordinary track and, by our research estimate, consume the full 6× exit sub-limit (uncapped ≈10×). If exhaustion extinguishes the fiança, the landlord can seek the liminar and the expected exit payout falls (base ≈5.5×, low ≈2.5× rent). Whether exhaustion counts as extinction for art. 59 is a question for counsel.

**PIX settlement.** MUTAV offramps the BRS and pays the agency by PIX, for the landlord under the recorded mandate ([ADR 0003](decisions/0003-payments-operated-by-mutav.md)). `settle_payout(pix_e2e_hash, quitacao_hash)` records hashes of the PIX end-to-end ID and the landlord's receipt, copies the mandate hash in force, and sets `late` if settlement came more than `payout_sla_secs` after `pay_claim`; `refresh` publicly flags payouts pending past that window.

**Closing the notice.** After payment, the operator calls `close_claim_notice(Paid)`, and the queues reopen once no notice remains. A notice may also close as `FullyProvisioned` (the leg is provisioned for its whole remaining cover) or `Withdrawn` (rent was paid, or the request was not approved).

**End of the fiança.** `record_keys_returned` (LI 39) or `notify_exoneration` (LI 40 X, effective 120 days later) moves the guarantee to `LEASE_ENDED` or `EXONERATING` and starts a claims tail (length open, at most the 3-year prescription). Cover stays fully counted until the tail ends; `close_guarantee` then releases it. It also closes an `EXHAUSTED` guarantee, or voids a lease that never took effect with nothing paid (`VOID`). Until the tail length is set, no guarantee leaves `ACTIVE` except by exhaustion or `VOID`. The account stays on-chain as public history. Recoveries against the tenant, through the fiador's subrogation (CC art. 831), are pursued off-chain; whether they flow back to the reserve is **open**.

```figure id="fig-3-claim-lifecycle" title="Figure 3. Payment-request lifecycle"
Sequence diagram, six lanes left to right: Agency | MUTAV platform | Operator key | mutav program | Payments account / offramp | PIX.
1. Agency: "rent missed (T0)" -> MUTAV platform.
2. Operator -> program: flag_claim_notice. Program note: "both capital queues closed".
3. Agency -> platform: "payment request + evidence, T0+3 to T0+9" (recorded off-chain, platform audit log).
4. Platform: "verification and approval".
5. Operator -> program: file_claim(category). Program note: "provision booked; NAV drops; request_complete_ts on-chain".
6. Operator -> program: pay_claim. Program -> payments account: "BRS". Program note: "Payout = Pending; on-chain SLA clock starts". Side note: "over the operator caps: pay_claim_admin (time-locked) or MUTAV backstop advance".
7. Operator -> program: close_claim_notice(Paid). Program note: "pending_notices − 1; queues reopen".
8. Payments account -> offramp -> PIX -> Agency: "BRL by PIX"; Agency -> (off-diagram) landlord "under mandate".
9. Operator -> program: settle_payout(pix_e2e_hash, quitacao_hash). Program note: "Settled; mandate hash copied; late flag if > payout_sla_secs after pay_claim".
Two brackets: a long one spanning steps 3 to 8 labelled "working target: ≤4 days request -> PIX; ≤15 days due date -> PIX (under legal review)"; a shorter one spanning steps 6 to 9 labelled "on-chain clock: pay_claim -> settle_payout (payout_sla_secs)".
Every on-chain step (2, 5, 6, 7, 9) carries a small badge "not solvency-gated".
```

---

## 8. Reserve, solvency and NAV

Anyone can recompute every quantity below from public accounts ([spec §4](spec.md#4-invariants-and-formulas)). Amounts are BRS base units (6 decimals), math is `u128`, and rounding favours the reserve.

```text
tesouro_value         = floor(tesouro_units × bounded_tesouro_price / PRICE_SCALE)
stable_assets         = brs_balance + tesouro_value
remaining_cover(g)    = (default_cover − default_paid) + (exit_cover − exit_paid)
remaining_cover_total = Σ remaining_cover(g)                 over guarantees not CLOSED
coverage_required     = ceil(c × remaining_cover_total)      c governed; value open
surplus               = max(0, stable_assets − coverage_required)
free_capital          = surplus − earmark_eff                earmark_eff = 0 in the pilot
liquid_budget         = max(0, brs_balance − provisions − earmark_eff)
net_assets            = max(0, stable_assets − provisions)
NAV per share         = net_assets / shares_outstanding
```

**What `c` means, and why it is open.** `c` (`coverage_ratio_bps`) is a governed parameter that only the time-locked multisig changes. Two sizings are on the table, and **neither is decided**.

- **Full backing, `c` = 1** (this spec's default). The reserve holds every active guarantee's whole remaining *valor afiançado*, so even every lease exhausting at once is paid from the reserve. It is capital-heavy: one working-product guarantee locks R$39,600, so R$300k backs 7 leases and the 170-lease book would need ≈R$6.7M.
- **Expected loss plus a one-year tail** (MUTAV's working business plan). The reserve is sized to the book's losses, not its ceiling: for 170 leases, expected rent-arrears losses of ≈R$90k a year at the base anchor (2.01% of annual rent) and ≈R$266k in a tail year (5.93%), against a working target of R$300k, about 1.1× the tail year; exit debts add to both. In program terms `c` sits far below 1, and MUTAV's own balance sheet, disclosed as the backstop, carries the rest of the legal ceiling.

At `c` < 1 a claim payment lowers surplus (invariant 7 holds only at `c` = 1). Whether `c` gets a program-enforced floor, and which coverage figure MUTAV publishes before counsel's opinion, are open; any figure published will be shown both against maximum exposure and against a tail year, because either alone misleads.

**What is gated** ([ADR 0005](decisions/0005-solvency-gate-scope.md)). Table 4 has the full matrix. In short: new guarantees and redemption fills must fit in the `free_capital` computed before them; nothing on the claim-payment path, nor fees, closes or `refresh`, is gated on solvency. Redemption fills are also capped by `liquid_budget`, so no capital exit or allocation can spend BRS a filed payment request needs. Fee receivables are not reserve assets: a missed agency payment lowers fee inflow, not coverage.

**Under-coverage mode.** The program enters under-coverage when `stable_assets < coverage_required`, for example after a TESOURO mark-down or an issuer freeze. Registration, redemption fills and allocation freeze. Deallocation runs only if it doesn't worsen coverage, so de-risking TESOURO into BRS stays possible. Claim payments, fees, capital requests and deposit fills keep running, and deposits recapitalise at a NAV that already reflects the loss ([spec §6](spec.md#6-under-coverage-mode)). On public surfaces this mode reads "reserve below target; MUTAV backstop active", never "insolvent". The landlord's claim is against MUTAV's whole patrimony, not the reserve alone. MUTAV's backstop is disclosed on-chain as a separate layer (`backstop_amount`, `backstop_commitment_hash`, `backstop_reimbursed_total`) and never counts in `stable_assets` or NAV. Its amount is **open**; its disclosure is specified.

**The honest consequence.** Ungated payments continue below target and can draw liquid BRS to zero; the backstop carries what the reserve cannot.

**NAV is computed by the program**, never pushed by an admin ([ADR 0004](decisions/0004-onchain-nav-internal-accounting.md)). Accounting is internal, so a direct transfer into the reserve does not move NAV, and a virtual share offset blocks first-depositor inflation. NAV excludes pending deposits, BRS owed to exiting providers, MUTAV's take and fees in transit.

**Price safety.** TESOURO is valued at `min(BondPrice, accrual ceiling)`; stale prices fail gated instructions closed, a deviation bound rejects jumps, and `fulfil_halted` stops fills after an outsized NAV move. `pay_claim` never reads the price.

**Invariants.** The test plan asserts, after every instruction, that `stable_assets` uses only tracked balances and the bounded price (1); paid ≤ cover on each leg (2); a provision lowers NAV, never `stable_assets` (6); at `c` = 1 a claim payment leaves surplus unchanged (7); and no fill lowers NAV per share (12). A planned property test fuzzes `stable_assets` below `coverage_required` and asserts that `pay_claim` is never refused for solvency.

```figure id="fig-4-coverage-bar" title="Figure 4. Balance sheet and coverage"
Two vertical stacked bars side by side on a common baseline.
Left bar "stable_assets": bottom segment "BRS (at par)", top segment "TESOURO (bounded price)". Inside the bar, a hatched slice at the top labelled "provisions (NAV-only deduction)"; bracket on the left side "net_assets = stable_assets − provisions".
Right bar "coverage_required = c × remaining cover", shorter than the left bar.
The vertical gap between the top of the right bar and the top of the left bar is shaded and labelled "surplus = free capital".
Inside the surplus, a dotted slice labelled "earmark (phase 2; 0 in pilot)".
Arrow pointing into the surplus: "register_guarantee / fulfil_redeems draw from here".
Separate arrow from the BRS segment out to the right: "claim payments draw from BRS — never solvency-gated".
Small inset, right, titled "Same 170-lease book, two sizings (working parameters; open, §8)": bar A "c = 1: ≈R$6.7M in the reserve"; bar B "expected loss + tail year: R$300k target", with a dashed segment above it labelled "MUTAV backstop (disclosed, not in NAV)".
```

**Table 4. Gate matrix** (✓ runs · ✗ refused · *gated* = must fit in `free_capital` computed before · *limited* = see note)

| Instruction | Paused | Under-coverage | Open notice | Stale price | `fulfil_halted` | Solvency |
|---|---|---|---|---|---|---|
| **`pay_claim`**² | **✓** | **✓** | **✓** | **✓** | **✓** | **✓ never gated** |
| **`pay_claim_admin`**² | **✓** | **✓** | **✓** | **✓** | **✓** | **✓ never gated** (time-locked) |
| `file_claim`, `settle_payout` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `contribute_fees` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `close_guarantee`, `notify_exoneration`, `record_keys_returned`, notices | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `request_*` | ✗ | ✓ (queued, not filled) | ✓ | ✓ | ✓ | ✓ |
| `register_guarantee` | ✗ | ✗ | ✓ | ✗ | ✓ | *gated* |
| `fulfil_deposits` | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ (within `max_tvl`) |
| `fulfil_redeems` | ✗ | ✗ | ✗ | ✗ | ✗ | *gated* |
| `allocate` | ✗ | ✗ | ✓ | ✗ | ✓ | post-condition + liquidity³ |
| `deallocate` | ✗ | *limited*¹ | ✓ | ✗ | ✓ | *gated*⁴ |
| `cancel_*`, `claim_*`, `refresh`, `advance_queue_heads` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

¹ Only if coverage does not worsen. ² Refused only by the leg's remaining cover, the guarantee's status and claims tail, the category-to-leg map, insufficient liquid BRS, the destination check, an issuer freeze on the reserve account, a missing filing for that notice and leg, or an existing payout for that notice; the per-call and per-period caps apply to the operator path only (`pay_claim_admin` skips them). ³ `stable_assets ≥ coverage_required` and `brs_balance ≥ provisions` afterwards; whether the amount must fit in free capital is open. ⁴ Any value lost in conversion must fit in free capital.

**A worked month** (illustrative, `c` = 1.0, placeholder fee and take, small covers for legible arithmetic; Appendix D). Two agency bills raise NAV without minting shares; a missed rent lowers NAV when filed (day 12), not when paid (day 14), and the payment leaves surplus unchanged; a fifth guarantee consumes most free capital, and a queued redemption receives the rest as a partial head fill.

```figure id="fig-5-worked-month" title="Figure 5. The worked month"
Combined chart, x-axis days 0–30.
Bars (left axis, R$): for each event day, paired bars stable_assets vs coverage_required: d0 90,000/72,000; d1 90,640/72,000; d12 90,640/72,000; d14 88,640/70,000; d18 88,640/83,500; d20 88,910/83,500; d21 83,500/83,500; d30 84,100/83,500.
Line (right axis): NAV per share: d0 1.000000; d1 1.007111; d5 1.007111; d12 0.984888; d14 0.984888; d18 0.984888; d20 0.987888; d21 0.987888; d30 0.994987.
Event markers on the x-axis: d1 fee receipts (prior month's agency bills, settled and converted); d5 notice (queues closed); d12 filing (NAV drops); d14 claim payment + notice closed; d16 PIX settlement; d18 registration G5; d20 price accrual (exaggerated); d21 partial head fill R$5,410; d30 fee receipts (late payers).
Shaded band between d5 and d14 labelled "queues closed".
Footnote: "Illustrative; placeholder fee and take, not MUTAV pricing; fee receipts land after each agency's bill is paid and converted, so the days shown are illustrative; amounts rounded to R$1; not annualisable."
```

---

## 9. Capital flows

**Async deposit.** `request_deposit` escrows BRS in `pending_deposits`, excluded from NAV. The admin multisig calls `fulfil_deposits`, which fills requests in strict FIFO order at the current NAV, within `max_tvl`, only while no notice is open and the price is fresh. Deposits are **allowed in under-coverage** as recapitalisation ([ADR 0008](decisions/0008-uniform-capital-flow-and-pause-scope.md)). The provider then calls `claim_shares`, or `cancel_deposit` while the request is pending.

**Async redemption.** `request_redeem` escrows shares. The admin's `fulfil_redeems(count, max_assets)` recomputes its budget before every fill:

```text
budget = min(max_assets − assets_paid_in_this_call, free_capital, liquid_budget)
```

**Strict FIFO, partial fills only at the head** ([ADR 0010](decisions/0010-partial-fills-at-queue-head.md)). A batch fills whole requests while they fit, then at most one partial fill of the head, each part at its own NAV (Figure 6); a permissionless crank skips cancelled requests. With no two-sided BRL liquidity on Solana, exits wait while there is no surplus, the reserve is under-covered or a notice is open, and providers accept that explicitly.

```figure id="fig-6-redemption-queue" title="Figure 6. Redemption queue with a partial head fill"
Horizontal FIFO lane, head on the left: request A (seq 7, 2,000 shares), request B (seq 8, 10,000 shares), request C (seq 9, 3,000 shares). A greyed box between A and B: seq 7b "cancelled", with an arrow "skipped by advance_queue_heads".
Above the lane, a budget bar labelled "budget = min(max_assets, free_capital, liquid_budget)", recomputed before each fill.
A: fully coloured, label "filled whole".
B: split box, left part coloured "partial fill (≥ min_fill_assets)", right part outlined "remainder stays at head (≥ min_request)".
C: outlined, label "untouched until B is complete".
Side note from A and B to a wallet: "claim_assets between fills — keeps place in line".
Caption line: "Each part priced at the NAV of its own fill; rounding favours the reserve."
```

**Table 5. MUTAV's three money flows** ([ADR 0009](decisions/0009-separate-mutav-money-flows.md))

| Flow | Instruction | Destination | Shares? | Public as |
|---|---|---|---|---|
| Guarantee fees, net of the take (monthly agency bill paid by boleto or PIX, converted to BRS) | `contribute_fees` | `reserve` | Never minted | 1 `FeeReceipt` per agency bill (`invoice_ref_hash`); `FeesContributed{gross, take, net}` |
| MUTAV operation (the take, `fee_take_bps`, program max 30%) | Same call, separate transfer | Whitelisted `treasury_account` | None; never in the reserve or NAV | `fee_take_total` |
| MUTAV as capital provider | `request_deposit` / `request_redeem` from the disclosed capital wallet | `pending_deposits` → `reserve` | At NAV, like any provider | Queue events filtered by `mutav_capital_wallet` |

The treasury, payments account and capital wallet must be distinct, and there is no `withdraw_surplus`. **Every BRS in the reserve traces to a `FeeReceipt` or a `DepositRequest`,** and each `FeeReceipt` corresponds to one paid monthly agency bill, so a gap between bills paid and receipts recorded is visible. Because MUTAV also controls the operator key and the admin multisig, the notice gate is the program-level control against MUTAV exiting ahead of a loss it knows about.

**Who provides capital (open).** MUTAV's working plan funds the reserve from its own balance sheet, capitalised by an equity round, with a working target of R$300k. The program also supports allowlisted, KYC'd third-party providers holding reserve shares. Counsel's review warns that outside capital pooled in a reserve that absorbs losses can make a *fiança* look like insurance or an unauthorised mutual scheme, so third-party providers stay disabled until counsel's written opinion, and the pilot may run on MUTAV capital only. The committed amount will be published before the mainnet pilot. Reserve shares absorb claim payments and receive net guarantee fees, so their value can fall or rise; MUTAV sets no return target and makes no return projection.

---

## 10. Reserve assets and BRL on Solana

The reserve holds two kinds of asset ([spec §7](spec.md#7-price-safety)).

**BRS** ([Nora Finance](https://www.nora.finance/docs/integrate/core-concepts/brs-token)) is a 1:1 BRL stablecoin, a classic SPL token with 6 decimals, valued at par. We disclose the trust this places in the issuer: the mint has a freeze authority, and redemption into BRL runs off-chain. In our on-chain reads, about 2.9k BRS existed on Solana at the start of October 2026, with no DEX pool.

**TESOURO** ([Etherfuse](https://etherfuse.com/products/stablebonds)) is tokenized exposure to Brazilian federal bonds: a Token-2022 mint that carries an on-chain `BondPrice` account. Its layout, update cadence and rate basis are being confirmed with the issuer. In this design the reserve can hold at most 50% of its value in TESOURO, only through a capped adapter; in the pilot that adapter is an interface and a mock.

The **mint guard** rejects any Token-2022 mint with a PermanentDelegate, a TransferHook, a non-zero TransferFee, NonTransferable, or a default-frozen account state. Mints are allowlisted **by address, never by symbol**, because impostor BRL tokens exist.

**Asset mix is open.** MUTAV's working business plan targets roughly 80% tokenized federal bonds with a 20% liquidity sleeve held in a USD stablecoin. This program design instead keeps at least half the reserve in BRS and caps TESOURO at 50%, so claim payments never wait on a bond redemption or carry FX risk between BRL claims and the reserve. Neither the mix nor the sleeve asset is decided. A USD sleeve would need its own valuation rule and mint-guard review before it could count toward `stable_assets`.

**Table 6. Reserve assets** (this design; open against the business plan)

| Asset | Issuer | Token program | Valuation rule | Cap | Key risk |
|---|---|---|---|---|---|
| BRS | Nora Finance | Classic SPL, 6 dp | Par (1 BRS = R$1) | None; at least 50% of the reserve (proposed) | Issuer backing, freeze authority, thin market |
| TESOURO | Etherfuse | Token-2022 | `min(BondPrice, accrual ceiling)`, with staleness and deviation bounds | ≤50% of the reserve (proposed; business plan ~80%), plus adapter cap | Price staleness, conversion path, issuer |
| BRZ (new mint) | Transfero | Token-2022 | — | **Not eligible** | Fails the mint guard (PermanentDelegate) |

**The thin market is a design input.** No on-chain venue could absorb a forced sale, so the design keeps a BRS buffer, uses async exits and reserves liquidity for filed requests. Funding the pilot would mint many times today's on-chain BRS supply, a concentration risk; confirming issuance and off-ramp capacity is a start condition (§12).

---

## 11. Security and governance

**Admin and upgrades.** A [Squads v4](https://github.com/Squads-Protocol/v4) multisig vault with a time lock holds both admin and upgrade authority, and every admin action except `pause` is time-locked. Admins sign from their own hardware-backed wallets. One multisig or a split into upgrade and admin multisigs with different time locks is **open**; because `pay_claim_admin` runs through the time lock, that choice now also affects payment latency. The transparency page will publish the signer count, the threshold, that the multisig's `config_authority` is the default, and that the time lock is at or above the agreed floor.

**Distinct keys are not independent parties.** In the pilot every key is MUTAV-held. Distinct keys limit the damage from one compromised key; the public, time-locked record, not the keys, is what lets outsiders check MUTAV.

**Governance can change hands without new code.** Because admin, operator, pauser and the investor allowlist are separate on-chain roles, the reserve's governance can move to an independent, regulated reserve vehicle (its directors holding the admin multisig and an independent pauser), and the reserve can open to outside investors, by rotating keys and updating the allowlist. No program change or account migration is needed.

**Pauser.** A separate key; pausing needs no time lock. A pause stops capital flows, new guarantees and allocation, and leaves the claim-payment path, fees, closes and `refresh` open. `revoke_operator` takes effect immediately, while appointing a replacement is a time-locked admin action.

**Operator blast radius.** Five controls bound the operator: the whitelisted destination, the per-call and per-period payment caps, the per-guarantee and per-agency cover caps, the public SLA flag, and immediate revocation (§13). **The caps limit the rate of loss, not what MUTAV owes.**

**Initialization and upgrades.** Only the upgrade authority can call `initialize`. Accounts carry a version and zeroed padding, and layouts are append-only ([spec §14](spec.md#14-upgrade-readiness)). Each upgrade ships as a `solana-verify` build in one Squads proposal announced during the time lock; enabling a feature takes a second proposal. Signers decode every instruction before approving and never pre-sign with durable nonces.

```figure id="fig-7-governance" title="Figure 7 (optional). Governance and upgrade path"
Left-to-right pipeline: [Verified build (solana-verify)] -> [Buffer account (hash = build hash)] -> [Bundled Squads proposal: upgrade + IDL + verify PDA] -> [Time lock — public announcement on transparency page] -> [Execute] -> [Smoke checks].
Below the pipeline, a second mini-pipeline labelled "Enabling a feature": [Proposal 1: upgrade adds feature to SUPPORTED_FEATURES] -> [observation period, feature off] -> [Proposal 2: set_config sets flag bit], each proposal passing through its own time lock.
Side arrow from a separate [Pauser key] straight to [mutav program] labelled "pause — no time lock; capital flows stop, claim-payment path stays open".
```

---

## 12. The Colosseum pilot

**Goal.** Prove that a digital-asset reserve can run as a viable operation: MUTAV operates it, and anyone can verify it. The work splits into the hackathon deliverable and a gated mainnet pilot, which sits beside MUTAV's operating plan.

### (a) Hackathon deliverable (by 12 October, 23:59 BRT)

The repository was created on 2026-10-01, inside the hackathon window (2026-09-14 to 2026-10-12). Status as of this draft:

| Item | Status |
|---|---|
| Specification and ADRs 0001–0011; Anchor workspace; CI; Codama client pipeline | Done |
| ADR 0012 (fiança-aligned lifecycle) and its spec changes | In review |
| Core program, plan Tasks 1–10, with invariant tests and the `pay_claim`-never-refused property test | Must-ship · pending |
| Codama client (Task 11); devnet deploy with a Squads-owned upgrade authority and a verified build hash (Task 12) | Must-ship · pending |
| Demo video of one full lifecycle on devnet: register, a monthly agency bill (simulated PSP settlement) and `contribute_fees`, notice, filing, payment, settlement, partial redemption | Must-ship · pending |
| Public transparency view reading devnet events (Task 18) | Must-ship · pending |
| Surfpool fork tests against the devnet BRS mint (Task 13); operator, admin and capital-provider flows in the platform (Tasks 14–17) | Stretch · pending |

The final version will list program IDs, test counts, compute benchmarks and build hashes for merged work only, linked from [provenance.md](provenance.md), which also credits prior work.

```figure id="fig-8-timeline" title="Figure 8. Timeline to 12 October"
Horizontal Gantt strip, Oct 1 to Oct 12, plus a "mainnet pilot (gated)" stub at the right.
Rows: Oct 1 scaffold and docs (solid = done); Oct 2 core state, math, upgrade readiness, ADR 0012; Oct 3 register/close and fees; Oct 4 claim payments and payouts; Oct 4–5 async queue and MUTAV capital; Oct 6 under-coverage and price safety; Oct 6–7 adapters, refresh, events; Oct 7–8 client and devnet deploy under Squads; Oct 8–9 fork tests and platform integration (stretch); Oct 10–11 videos, go-to-market, provenance; Oct 12 submit by 23:59 BRT (milestone diamond).
Stub: "mainnet pilot — starts when start conditions are met"; beyond it "phase 2 — instant exit (designed, not deployed)".
Legend: solid bar = done, outlined bar = planned, hatched = stretch. As of v0.3, only Oct 1 is solid.
```

### (b) Mainnet pilot and operating plan (after submission, gated)

| Track | What it proves | Size | Capital |
|---|---|---|---|
| On-chain mainnet pilot | The mechanism | Program cap R$100k; at `c` = 1, two working-product guarantees | MUTAV capital |
| Operating plan | The business | ~170 guarantees across up to 5 partner agencies, ~6 months | Working reserve target R$300k from MUTAV's equity round and angel capital, not yet raised |

Caps rise from the first track toward the second only through the time-locked multisig, after an external audit, and while the KPIs below hold. At `c` = 1 the operating plan does not fit, which is why `c` is the decision that joins the two (§8).

**Proposed start conditions:** counsel's sign-off; the limited-fiança instrument and landlord mandate signed through the platform; the claims tail and payment term set; a PSP contracted for boleto and PIX; BRS issuance and off-ramp capacity confirmed and the PIX↔BRS round trip measured; the issuers' answers on PDA mint destinations and CPI burn; reserve capital committed and disclosed; and an independent security review (whether a full audit is **open**). Before an audit, the pilot holds real funds in unaudited software; commit nothing you cannot afford to lose.

The proposed caps (Appendix B) are a R$100k reserve (`max_tvl`), `c` (open: 1.0 or expected-loss sizing, §8), R$30k of cover per guarantee and R$60k per agency, operator payments of R$10k per call and R$20k per 30 days, at most 50% in TESOURO (open), and a 10-day `pay_claim` → `settle_payout` alarm; the take rate is open (program maximum 30%). Only the time-locked multisig can change them.

**Capacity, honestly.** The working product (12× + 6× rent, under legal review) is a *valor afiançado* of R$39,600 per lease. At `c` = 1 a R$100k reserve backs **2** such guarantees and R$300k backs **7**; the 170-lease book needs ≈R$6.7M, while expected-loss sizing plans R$300k for it (§8). The proposed per-guarantee cap (R$30k) must rise to at least R$39,600, or the product must shrink (e.g. 6× + 6× = R$26,400), before the working product can be registered.

**Unit economics.** MUTAV prices by tenant score in three bands of 9%, 12% and 15% of monthly rent, and refuses scores below 400. Our models use 10% (R$220 a month on the working R$2,200 rent), below the middle band and so conservative. That sits at or above the market band (CredPago/Loft publicly lists 8–10%).

| Reserve | Working-product guarantees at `c` = 1 (R$39,600 each) | Gross guarantee fees per month at R$220 | MUTAV revenue |
|---|---|---|---|
| R$100k | 2 | R$440 | take `t` × gross |
| R$300k | 7 | R$1,540 | take `t` × gross |
| R$1M | 25 | R$5,500 | take `t` × gross |
| R$10M | 252 | R$55,440 | take `t` × gross |

At `c` = 1 the pilot is a cost centre by design; the levers are more capital, covers matched to risk, and a lower `c` (§8).

**Claims against fees, by scope of the exit leg** (working parameters; expected payouts per lease-year ÷ gross guarantee fees; fee 10% of rent per 30 days; rent arrears at 2.01% of annual rent, the Superlógica IIL three-month average for RS apartments; evictions at 2% of leases a year consuming the 6× exit sub-limit; non-eviction exit debts 0.19× rent a year). Scope A, all liquidated tenant debts including the early-termination penalty: **≈45%**. Scope B, the same without the penalty (the spec default): **≈39%**. Scope C, arrears, evictions and abandonment only: **≈30%**. Rent arrears alone are ≈20%. Which scope the instrument covers is **open**. These figures are inferences; no Brazilian dataset measures exit-cost frequency.

**Region.** A Passo Fundo (RS) corridor, chosen for **access** to the team's agency relationships, with at most five partner agencies in phase 0. Working loss anchors (three-month averages of the latest 2026 prints): 2.01% of annual rent for RS apartments (Superlógica IIL, base), 2.87% for RS overall (stress), and 5.93% on a looser 15-day threshold (Loft IIA RS, tail). Nationally the IIL fell from 3.29% in January to 3.05% in July 2026, and the South is the lowest region at 2.67%. Five agencies in one corridor make defaults correlated, which the per-agency caps bound.

**Success over six months.** We measure operations, not a claims-to-fees ratio. With a handful of guarantees and delinquency around 2%, six months may see zero or one missed rent, so the demo runs a full drill on devnet, and we propose a published mainnet drill with MUTAV's own capital.

**Table 7. Success metrics** (proposed)

| KPI | On-chain evidence | Off-chain evidence |
|---|---|---|
| Every payment within the working targets (≤4 days request → PIX; ≤15 days due date → PIX) | `request_complete_ts`, `ClaimPaid` → `PayoutSettled` within `payout_sla_secs`; zero `PayoutLate` | Request date and approval in the platform's hash-chained audit log |
| Zero partial or unexplained payments | Each payment ≤ remaining cover, tied to a notice and a category | Approval records |
| Coverage held, or under-coverage handled as designed | `StateRefreshed`, `ModeChanged` | Incident review |
| Fees, reserve and payouts reconcile with the books | `FeeReceipt`s (one per agency bill), `FeesContributed` totals, `VaultState` totals | Monthly agency bills, PSP settlement reports, minter receipts, bank statements |
| Guarantees registered within caps; caps raised only by the multisig | `GuaranteeRegistered`, `AgencyExposure`, `ConfigUpdated` | Onboarding records, published rationale |

Guarantees outlive the pilot window (a lease runs about 30 months, plus the claims tail), so the reserve stays committed until they run off, and the run-off will be disclosed.

---

## 13. Risks, limits and disclosures

MUTAV's reserve program is new, **unaudited** and upgradeable software. Nothing here is legal, tax or investment advice, an offer of securities, or a promise of any return.

**The honest weak point is liabilities, not assets.** The chain proves what the reserve holds and enforces the gate. The operator asserts that the registered guarantees are complete and real.

**Table 8. What the chain proves and what it doesn't**

| The chain proves | The chain does not prove |
|---|---|
| The reserve's tracked balances | That a lease, tenant or default exists (only a hash is stored) |
| Each guarantee's absolute cover, and the amounts paid and provisioned, by category | That a payment request was correctly approved |
| `coverage_required`, surplus and NAV, recomputable by anyone | That every guarantee MUTAV wrote is registered |
| Every fee split between reserve and treasury, one receipt per agency bill | That the keys were actually returned (only an evidence hash is stored) |
| That claim payments went only to the whitelisted account, within caps or through the time-locked admin | When the agency filed (the chain sees the complete-request time MUTAV records) |
| The end-of-lease or exoneration record, the claims tail and the state each close came from | That the PIX reached the landlord (only the E2E hash, the landlord's *quitação* hash and the mandate hash, which the counterparties can verify) |
| Request, payment and settlement timestamps, and SLA flags | That the BRS and TESOURO issuers hold the assets behind their tokens, or TESOURO's true market value |
| FIFO order, every fill price, every config and role change, the disclosed capital wallet and backstop amount | That notices were flagged on time; that the disclosed backstop commitment is funded; fees billed or paid but not yet recorded on-chain |

**Making completeness checkable.** Each agency and landlord can look up its own `Guarantee` account on the transparency page and confirm that its lease is registered at the right cover, and each agency can find its own `FeeReceipt`s. Our target is that the fiança instrument cites the on-chain guarantee id and `contract_cap_hash` and takes effect only once registered; that is **open**. A periodic external completeness attestation is on the roadmap.

**Smart-contract and upgrade risk.** Bugs could lock or misdirect funds; caps, a separate pauser, the planned tests and verified builds will limit the damage. An upgrade can change any rule in this paper, including those that protect capital providers; the time lock gives notice, not a guarantee.

**Operator trust.** A stolen or misused operator key can send capped amounts to MUTAV's own payments account, register fictitious guarantees within the caps, flag notices (which only delays the queues), close guarantees early or file provisions. Early closes would understate `coverage_required`; ADR 0012 narrows this, since a close needs an end-of-lease or exoneration record and an elapsed tail, exhaustion, or a `VOID` with nothing paid. Every close and filing is public, the pauser can revoke the key at once, and the key cannot send reserve funds elsewhere, mint shares or fill the queue. The main residual risk is a late notice; the transparency page shows each open notice's age.

**Agency billing risk.** The agency holds tenants' fees before paying MUTAV; if it stops, fee income stops while cover stays live. The multisig can lower that agency's `max_cover_per_agency` (proposed lever), and settlement-to-`contribute_fees` time is published per bill. The agency also sells, files, evidences and receives payments; per-agency caps and MUTAV's verification bound that conflict.

**Issuer, off-ramp and payments-account risk.** BRS at par inherits the issuer's solvency and redemption risk. A freeze of the reserve account stops payments from it but not MUTAV's obligation, which the backstop then carries. Claim payments depend on the off-ramp and MUTAV's payments account (credit and commingling risk); fee intake depends on the PSP and the minter. The take reaches the treasury in BRS and is converted back; keeping it in BRL at settlement is open.

**TESOURO and capital-provider liquidity.** The price can be stale or move against the reserve, conversion to BRL needs off-chain steps, and a mark-down that breaches coverage freezes outflows. Exits can wait indefinitely (§9), and an approved payment request lowers every share's value at filing. Pricing, underwriting and verification are off-chain, and defaults correlate with the cycle and the region.

**Legal and regulatory risk** (dated October 2026). Under review with counsel:

- recharacterisation of the *fiança* as insurance or securitisation (Decreto-Lei 73/1966), a risk that rises if third-party capital enters the reserve (DL 73 arts. 24 and 113, as amended by LC 213/2025);
- the securities status of reserve shares, in light of CVM's guidance on crypto-assets ([Parecer de Orientação 40](https://conteudo.cvm.gov.br/legislacao/pareceres-orientacao/pare040.html));
- BCB Resolutions 519–521 (in force since 2 February 2026): whether MUTAV, the reserve's operator or its partners need authorisation as virtual-asset service providers (the transition deadline for existing operators, reported as 30 October 2026, is to be confirmed); whether program-held escrow of provider deposits is custody; whether converting BRL to a BRL-referenced token is a foreign-exchange operation under Res. 521; and that the PSP and the BRS minter are authorised counterparties after the transition. No stablecoin-issuer regime exists yet (PL 4.308/2024);
- the fee's collection chain: whether the agency's collection and remittance needs a payment-institution or sub-account structure (Res. Conjunta BCB/CMN 16/2025), and whether including the fee in the tenant's rent boleto is compatible with LI 43 I. MUTAV bills only its own fee and never collects third-party money;
- currency: Lei 8.245/91 art. 17 forbids rent in foreign currency or indexed to the exchange rate, so Brazilian guarantees stay in BRL; stablecoin payments by agencies or tenants may be FX operations under Res. BCB 521 (pending counsel);
- whether published payment targets bind MUTAV under CDC art. 35;
- ring-fencing the reserve from MUTAV's creditors; LGPD re-identification of per-lease records; tax.

If MUTAV failed, landlords could require tenants to replace the guarantee within 30 days (art. 40); a run-off plan is part of the pilot design. Regulatory change may force design changes or end the pilot.

**Open decisions.**

- reserve sizing: `c` = 1 or expected loss plus a tail year, a floor for `c`, and which coverage figure may be published (§8);
- capital source: MUTAV's balance sheet only, or also selected third-party providers (§9);
- asset mix: TESOURO 50% or ~80%; liquidity sleeve in BRS or a USD stablecoin (§10);
- exit-leg scope A, B (spec default) or C, at ≈45% / 39% / 30% claims-to-fees (§12);
- the 12× ceiling (legal review) and the per-guarantee cap against the R$39,600 working product;
- the claims tail, the payment term N, and the filing window (T0+9 or the spec's 15 days);
- for counsel: whether an accessories-inclusive ceiling displaces CC 822, whether exhaustion extinguishes the fiança for the art. 59 liminar, and whether a public below-target flag invites a CC 826 / LI 40 II argument;
- the `VOID` limits; two legs or only categories; the backstop amount;
- agency billing: late-payment terms, activation fees, the take in BRL or BRS;
- the take rate and final caps; `allocate`'s free-capital rule; the provision formula; recoveries;
- one multisig or two, time locks, pauser powers, and whether the pilot waits for a full audit;
- the issuers' answers on PDA mints, CPI burn, `BondPrice` and a BRS↔TESOURO path.

---

## 14. Roadmap

**Phase 2: instant exit (designed, not deployed)** ([spec §13](spec.md#13-phase-2--instant-exit-designed-disabled-in-the-pilot)). An allowlisted holder could exit at once at NAV minus a haircut that stays in the reserve, paid from a buffer earmarked out of surplus; it switches off whenever the queue is closed or the reserve is stressed, and MUTAV's own wallets are barred. The pilot already ships the earmark-aware formulas at zero.

**Assets and composability.** A live TESOURO adapter follows once the price account and the BRS↔TESOURO path are confirmed. Reserve shares could later compose with other protocols; that is **not promised** and would need loss-aware NAV publication, exit liquidity and a securities analysis.

**Platform.** Boleto issuance through a licensed PSP, BRL→BRS conversion through an authorized minter, `contribute_fees` per agency bill with automated reconciliation, on-chain claim payments wired to platform approvals, the landlord mandate and *quitação* records, a recoveries flow, and an external completeness attestation.

**Multi-currency reserves.** One protocol can run one reserve per currency and market, each its own `VaultConfig`. A guarantee always matches its reserve's currency, so solvency never carries FX risk; a USD reserve, for example, could serve markets where USD-denominated leases are legal. In Brazil, Lei 8.245/91 art. 17 forbids stipulating rent in foreign currency or indexing it to the exchange rate, so Brazilian guarantees stay in BRL.

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
| Missed-rent notice (`flag_claim_notice`) | On-chain flag at the first missed rent; closes the capital queues |
| Payment request (*pedido de pagamento*) / filing (`file_claim`) | The agency's request with the instrument's evidence; once complete it starts the payment term, and on approval it is booked as a provision |
| Claim payment (`pay_claim`, `pay_claim_admin`) | BRS sent from the reserve to MUTAV's payments account |
| *Quitação* / mandate | The landlord's receipt / the landlord's power for the agency to receive and give *quitação* |
| *Exoneração* | MUTAV's statutory exit once the lease runs for an indefinite term; liable 120 more days (LI 40 X) |
| Claims tail | Period after the keys or an effective exoneration during which payment requests may still be filed |
| `EXHAUSTED` / `VOID` | The *valor afiançado* is used up and the fiança extinguished / a lease that never took effect, closed with nothing paid |
| Reserve / reserve share | BRS and TESOURO custodied by the `mutav` program / SPL token for a pro-rata share of `net_assets` |
| NAV | `net_assets / shares_outstanding` |
| `stable_assets` / `coverage_required` | BRS plus TESOURO at the bounded price / `c` × remaining cover of all guarantees not closed |
| Surplus / free capital / liquid budget | Assets above `coverage_required` (minus the phase-2 earmark) / BRS not needed by filed requests |
| Under-coverage mode | `stable_assets < coverage_required`; outflows freeze; public wording *reserva abaixo da meta; suporte da MUTAV ativo* |
| PDA / CPI / upgrade authority | Program-derived address / cross-program invocation / key allowed to replace a program's code (the Squads multisig) |
| BRS / TESOURO | Nora Finance's 1:1 BRL stablecoin (SPL) / Etherfuse's tokenized Brazilian federal bond exposure (Token-2022) |

### B. Parameters

| Parameter | Enforced in | Proposed pilot value | Status |
|---|---|---|---|
| `max_tvl` | `fulfil_deposits` | R$100k | Proposed; working reserve target R$300k |
| `max_cover_per_guarantee` | `register_guarantee` | R$30k | Proposed; below the R$39,600 working product (open) |
| `max_cover_per_agency` | `register_guarantee` | R$60k | Proposed |
| `max_claim_per_call` | `pay_claim` (operator only) | R$10k | Proposed |
| `max_claim_per_period` / `claim_period_secs` | `pay_claim` (operator only) | R$20k / 30 days | Proposed |
| `max_tesouro_share_bps` | `allocate` | 50% | Proposed; business plan targets ~80% (open) |
| `min_request` / `max_request` | `request_*`, partial-fill remainder | R$1,000 / R$30,000 | Proposed |
| `min_fill_assets` | `fulfil_redeems` | R$500 | Proposed |
| `c` (`coverage_ratio_bps`) | All gates | 1.0 in spec / expected-loss sizing in business plan | Open (conflict); floor open |
| `fee_take_bps` | `contribute_fees` | — | Open; program max 30% |
| `payout_sla_secs` | `refresh`, `settle_payout` | 10 days | Proposed; to be reconciled with the ≤4-day working target |
| `claims_tail_secs` | `notify_exoneration`, `record_keys_returned` | — | Open (≤3 years; 0 keeps guarantees `ACTIVE`) |
| `payment_term_secs` | Disclosure only | — | Open (counsel) |
| `backstop_amount` / `backstop_commitment_hash` | Disclosure; never in NAV | — | Open |
| `optional_categories` (termination penalty) | `file_claim` | Off | Open (exit scope A/B/C) |
| `max_staleness_secs`, `max_deviation_bps`, `max_nav_move_bps` | Price read, `refresh` | — | Open |
| Adapter `cap` | `allocate` | Per adapter | Open |
| Virtual share offset `k` | Share math | — | Open |

### C. Formulas

The core block is in §8 and the redemption budget in §9. The remaining formulas:

```text
Share conversion (virtual offset V = 10^k):
  shares_for(assets) = floor(assets × (shares_outstanding + V) / (net_assets + 1))
  assets_for(shares) = floor(shares × (net_assets + 1) / (shares_outstanding + V))

TESOURO bounded price:
  bounded_price = min(BondPrice, p0 × (1 + y_max)^((t − t0) / year))
  y_max = maximum annual accrual rate allowed by PriceParams (value TBD)

Fee split (one call per paid agency bill):
  take = floor(amount × fee_take_bps / 10_000)  → treasury_account
  net  = amount − take                           → reserve

Phase 2 only, not deployed:
  earmark_eff = min(buffer_earmark, surplus, max(0, brs_balance − provisions))
              = 0 when INSTANT_EXIT is off (always, in the pilot)
```

### D. Worked month, full table

*Illustrative. The guarantee fee (10% of rent per guarantee-month: R$200 on R$2,000 rent, R$150 on R$1,500) and take (20%) are placeholders, not MUTAV pricing. The covers (3× + 6× on R$2,000) are smaller than the working product (12× + 6× on R$2,200, §12); they are chosen so the arithmetic is legible. Fee receipts land after each agency's bill is paid and converted, so the days are illustrative. `c` = 1.0. The virtual share offset is ignored, so the real program differs by a few base units. Amounts in R$, rounded to R$1 in the columns; after day 21 the reserve keeps one extra base unit (R$0.000001) from rounding. TESOURO is included to show the bounded-price mechanics; in the pilot the TESOURO adapter is a mock. The day-20 accrual is exaggerated for legibility and is not a rate forecast.*

**Setup.** 90,000 shares at NAV 1.000000. The reserve holds R$60,000 in BRS and TESOURO valued at R$30,000. Four guarantees, G1–G4, across two agencies (two each), each on R$2,000 rent with R$6,000 of default cover and R$12,000 of exit cover.

| Day | Event | BRS | TESOURO | `stable_assets` | `coverage_required` | Free capital | Provisions | Shares | NAV/share |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Start | 60,000 | 30,000 | 90,000 | 72,000 | 18,000 | 0 | 90,000 | 1.000000 |
| 1 | `contribute_fees` ×2, one per agency bill (prior month, settled and converted): gross 800 = 2 × 400, take 160, net 640 | 60,640 | 30,000 | 90,640 | 72,000 | 18,640 | 0 | 90,000 | 1.007111 |
| 3 | Provider A `request_redeem` 10,000 shares | 60,640 | 30,000 | 90,640 | 72,000 | 18,640 | 0 | 90,000 | 1.007111 |
| 5 | G1 misses rent → `flag_claim_notice` (queues closed) | 60,640 | 30,000 | 90,640 | 72,000 | 18,640 | 0 | 90,000 | 1.007111 |
| 12 | `file_claim(DEFAULT, rent, 2,000)` | 60,640 | 30,000 | 90,640 | 72,000 | 18,640 | 2,000 | 90,000 | 0.984888 |
| 14 | `pay_claim(DEFAULT, 2,000)`; `close_claim_notice(Paid)` | 58,640 | 30,000 | 88,640 | 70,000 | 18,640 | 0 | 90,000 | 0.984888 |
| 16 | `settle_payout(pix_e2e_hash, quitacao_hash)`, within SLA | 58,640 | 30,000 | 88,640 | 70,000 | 18,640 | 0 | 90,000 | 0.984888 |
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
- Internal: [spec](spec.md), [ADRs](decisions/), [implementation plan](plan.md), [provenance](provenance.md), [NOTICE](../NOTICE).

### F. Accounts (PDAs)

| Account | Seeds | What it holds or proves |
|---|---|---|
| `VaultConfig` | `["config", reserve_mint]` | Roles, caps, `c`, take rate, payments and treasury accounts, allowlist root, adapters, price parameters, feature flags, disclosed MUTAV capital wallet, claims tail, payment term, optional categories, backstop disclosure |
| `VaultState` | `["state", config]` | Tracked balances, `remaining_cover_total`, `coverage_required`, provisions, shares, NAV, queue heads, open notices, mode, backstop reimbursed |
| Vault authority | `["authority", config]` | PDA signer for the reserve and share-mint authority; never passed into an adapter CPI |
| Token accounts | `["reserve" \| "pending_deposits" \| "pending_redemptions" \| "claims", config]` | Liquid reserve; escrowed deposits; escrowed shares; BRS owed to exiting capital providers |
| `Guarantee` | `["guarantee", config, id]` | One per lease: agency, `refs_hash`, rent, absolute cover per leg, paid and provisioned amounts, status, `contract_cap_hash`, `landlord_mandate_hash`, exoneration, keys and tail timestamps |
| `AgencyExposure` | `["agency", config, agency_id]` | Outstanding cover per agency (enforces the agency cap) |
| `FeeReceipt` | `["fee", config, invoice_ref_hash]` | One per agency bill, counted exactly once: gross, take, net; never closed |
| `ClaimNotice` / `ClaimFiling` / `Payout` | `["notice" \| "claim" \| "payout", guarantee, notice_ref_hash]` | Missed-rent flag; provision, category and `request_complete_ts`; payment, PIX settlement, *quitação* and mandate hashes |
| `DepositRequest` / `RedeemRequest` | `["deposit" \| "redeem", config, seq]` | FIFO position, amounts, partial-fill state |
| `HolderState` | `["holder", config, owner]` | Time of the owner's last `request_deposit` or `claim_shares` (holding-period stamp for phase 2) |

### G. Architectural prior art

| | MUTAV (pilot) | OnRe | Credix | Huma | Maple | Nexus Mutual |
|---|---|---|---|---|---|---|
| What it is | Guarantee reserve for rental *fiança* | Tokenized risk-transfer yield | Private credit | Receivables financing | Institutional lending | On-chain mutual cover |
| Denomination | BRL | USD | USDC on-chain; BRL off-chain | USDC | USDC | ETH and stables |
| Liabilities on-chain? | Yes, one account per guarantee | Aggregate NAV only | Deal state only | Pool state only | Loan state (Ethereum) | Yes, active covers |
| Exit gated on on-chain solvency? | Yes: exits only from surplus over `c` × remaining cover (`c` governed) | No | No | Tranche-ratio gate | No | Partly: MCR% > 100% |
| Audited / open source | **Unaudited**; Apache-2.0 | Audited; open | Closed source¹ | Audited; Solana programs private¹ | Audited; open (Ethereum) | Audited; open |

¹ Where programs are closed source, the entries are inferred from public documentation.

---

## Status

Draft dated 2026-10-02 · version 0.3 · pre-audit · hackathon deliverable targets devnet; mainnet pilot gated (§12). v0.3 aligns the paper with ADR 0012 (limited fiança, lifecycle, admin payment path), adds the monthly billing of partner agencies (boleto or PIX, or BRS through Solana Pay) to the lifecycle and the money-flow figures, notes one reserve per currency on the roadmap, and moves the business numbers to MUTAV's working parameters. Reserve sizing (`c`), capital source, asset mix and exit-leg scope are presented as open decisions, not settled design. Program IDs, test counts, compute benchmarks and verified-build hashes will be added when they exist. Every cap and parameter is proposed and can be changed by the time-locked admin multisig.
