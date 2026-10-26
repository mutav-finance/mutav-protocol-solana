# MUTAV Brazil Pilot: Rental Guarantees on Solana

**Pilot paper, a companion to the [protocol litepaper](../litepaper.md)**

**Draft for comment · v0.1 · 2026-10-15**

This is a draft published for feedback, not an offer of any security or investment. It describes a program running on Solana devnet that has had internal review only and no independent audit. Read the [Important notice](#important-notice); to comment, see [How to comment](#how-to-comment).

*MUTAV pays landlords when tenants default, through their agencies, as their fiador. This paper covers its first deployment: rental guarantees in Brazil. How the reserve works on-chain is in the [protocol litepaper](../litepaper.md); this paper assumes it.*

---

## Summary

MUTAV is an institutional *fiador*. It gives Brazilian tenants a paid rental guarantee through the real-estate agencies that already run their leases, so no personal guarantor or locked-up deposit is needed. The guarantee is a limited *fiança* (Lei 8.245/91 art. 37 II; Civil Code arts. 818 ff.): a personal guarantee contract between MUTAV, as fiador, and the landlord. MUTAV is not an insurer, and the product is not *seguro-fiança*. Each partner agency pays MUTAV one consolidated bill a month, by boleto or PIX, for the guarantee fees of all its leases.

The pilot runs on the `mutav` Solana program described in the [protocol litepaper](../litepaper.md): it records every guarantee with its remaining *valor afiançado* (the fiança's R$ ceiling), lets capital leave the reserve only from surplus over required coverage, and never refuses a claim payment for coverage or a pause. This paper covers what is specific to Brazil: the market, the legal nature of the guarantee, the agency's product, the pilot's parameters and economics, the BRL stablecoin, the regulatory perimeter and the start conditions.

The program is live on devnet (release `v1.0.0-devnet`, demo reserve at reserve.mutav.finance); a capped mainnet pilot follows once its start conditions are met (program cap R$1M; planned capital per [ADR 0028](../decisions/0028-pilot-parameters.md): R$120k to start plus R$170k a month from month 2, reaching the cap in month 6). The reserve is not open to public investment. During the pilot it runs only on MUTAV's own capital. Nothing here promises a return to anyone.

---

## 1. The Brazilian rental guarantee market

Brazilian rental law lets a landlord ask for exactly one guarantee per lease, chosen from four forms in Lei 8.245/91 art. 37: (I) a cash deposit (*caução*), (II) a guarantor (*fiança*), (III) *seguro de fiança locatícia*, an insurance product sold by SUSEP-regulated insurers, or (IV) an assignment of investment-fund quotas. MUTAV uses form II. A second guarantee is void, and demanding one is a criminal contravention (art. 43). The one guarantee a lease carries is the landlord's only protection.

**Market size.** In 2024 Brazil had **17.8 million rented households**, 45% more than in 2016 and 23% of all households (IBGE, PNAD Contínua). *Seguro-fiança* alone had about **R$1.9bn of written volume** in the 12 months to February 2025, up 195% between 2020 and 2024 (CNseg). No primary national series measures all paid guarantees. As a labelled **estimate**: 17.8M households × a paid-guarantee share of one third to one half (unconfirmed) × an assumed average rent of R$2,000 a month × a guarantee fee of 8–10% of rent each month (the public paid-guarantee band) gives **roughly R$11–21bn a year** of guarantee fees. QuintoCred's closure (below) displaced about 45,000 contracts at once.

### Why rent

Rent is a narrow, well-measured first market for a guarantee whose reserve anyone can check. Each lease carries one guarantee, in BRL, for an obligation that falls due every month, so losses arrive one event at a time (a month's rent, one exit bill). Public indices measure delinquency monthly for the region MUTAV starts in (Superlógica IIL, Loft IIA). Agencies already sell and administer guarantees, so MUTAV reaches tenants through an existing workflow. And the cost of a guarantor that fails is concrete and recent (below).

### The problem for tenants, agencies and landlords

**Table 1. Why existing options fail**

| Option | What the tenant gives up | What fails for the agency or landlord |
|---|---|---|
| Personal *fiador* | Needs a relative or friend with a paid-off property | The pool is shrinking (paid-off owner housing −5.2 pp, 2016–24) |
| *Caução* (cash deposit) | Up to 3 months' rent, locked up for the whole lease | Capped at 3 months (art. 38), while an eviction routinely takes 6–12+ months |
| *Seguro-fiança* | Many applicants rejected | Payment after weeks; "natural wear" disputes; some accept a filing only after two missed months |
| *Título de capitalização* | Several months of rent paid upfront, refunded at a low rate | Covers little relative to the capital it locks up |
| Fintech guarantor (*garantidora*) | Little; the cheapest option | Opaque reserves; reported unilateral cancellation (*exoneração*), partial and slow payment |

The last row has already failed at scale. QuintoCred stopped writing new contracts in June 2025 and left about **45,000 contracts and 3,000 partner agencies** without a guarantor, according to public reporting (Imobi Report, 2025). Regulated carriers have also left: FF Seguros withdrew from individual *seguro-fiança* in 2024, and Seguradora Infinite entered extrajudicial liquidation in May 2026.

We interviewed seven agency leaders in the South of Brazil (books of about 35 to 1,000 properties). Their mean pain score for guarantees was **3.4 out of 5**, and **5 of 7 front the landlord's money themselves** while they wait for the guarantor, citing unilateral cancellation, waits of 60–90 days, partial payments and no visibility. These were short discovery interviews; they did not test price.

Each party loses something different. **Tenants** need a relative with a paid-off property, lock up months of rent, or are refused. **Agencies** carry the landlord's rent out of their own cash while a guarantor decides, and lose their whole guaranteed book when a guarantor exits. **Landlords** hold one guarantee that may pay late, partially or not at all, and while any guarantee is in force they cannot get the 15-day eviction *liminar* (art. 59 §1º IX), so how a guarantee ends matters as much as how it pays (§3.4).

**The insight.** Agencies don't distrust guarantees; they distrust guarantors. They front the landlord's rent because they cannot see whether, or when, the guarantor will pay. MUTAV makes the two things they cannot see, the reserve and the payment clock, public and bound by rules.

### The incumbents

**Table 2. MUTAV against what agencies choose today** (public figures only)

| | Approval | Time to pay | Unilateral *exoneração* | Reserve visibility |
|---|---|---|---|---|
| *Seguro-fiança* | Underwritten; a large share rejected | Up to 30 days from complete documents (SUSEP Circ. 621/2021 art. 43); document requests pause the clock | Per contract terms | Regulated solvency reports, aggregate only |
| Fintech *garantidora* | Fast, app-based | Published SLAs of a few business days; agencies report 60–90-day waits | Reported by agencies | None public |
| **MUTAV** | Credit-assessed off-chain, per lease (*análise cadastral*) | Working target ≤4 days request → PIX, ≤15 days due date → PIX (under legal review); timestamped on-chain | None during the fixed term; afterwards only the statutory 120-day notice (LI 40 X), to be recorded on-chain, with cover held through the notice and the claims tail | Per-guarantee cover and the reserve, on-chain, recomputable |

---

## 2. Legal nature: a fiança, not insurance

MUTAV's Brazilian operating company (legal name to be published once registered) is designed to act as an **institutional *fiador***. Of the guarantee forms in Lei 8.245/91 art. 37 it uses item II, the *fiança*, governed by Civil Code arts. 818 ff.: a personal guarantee contract between the fiador and the landlord, accessory to the lease. It is not item III, *seguro de fiança locatícia*, an insurance product that only SUSEP-regulated insurers may sell, and not item I, the *caução*. MUTAV is not an insurer and does not sell *seguro-fiança*, a *título de capitalização* or any other SUSEP-regulated product. Each guarantee is a **limited fiança** (CC 823) whose ceiling, the *valor afiançado*, includes interest, penalties and court costs. MUTAV waives the *benefício de ordem* and signs as *principal pagador* (CC 827–828). The fee agencies pay MUTAV is the price of the fiança (*taxa da fiança*), not a premium. The landlord signs the instrument and gives the agency a mandate to receive payments and give *quitação*.

The landlord's claim is against MUTAV as fiador, not against the reserve or anyone who holds reserve shares. The reserve is MUTAV's own capital, set aside on-chain to back its obligations as fiador, not a pool of third parties' money. Payments come first from the reserve, with MUTAV's own balance sheet behind it as a backstop disclosed on-chain. The structure matters because Brazilian law looks at substance, not labels: if third-party capital pooled the tenants' default risk, the arrangement could be recharacterised as insurance under Decreto-Lei 73/1966, whatever it is called (§7). Whether the structure remains a *fiança* is under review with counsel.

Five actors take part:

- **Tenant:** owes a monthly guarantee fee (*taxa da fiança*), set at signing, and pays it to the agency with the rent.
- **Landlord:** the creditor of the fiança; signs the instrument and is paid through the agency under a recorded mandate.
- **Agency (*imobiliária*):** distributes the guarantee, registers leases, collects the fee with the rent, pays MUTAV one consolidated bill a month by boleto or PIX, and files payment requests (*pedidos de pagamento*).
- **MUTAV**, through its Brazilian operating company, the fiador: assesses each tenant's credit (*análise cadastral*), bills agencies, approves payment requests, runs payments and the platform, and holds the operator key and the admin multisig seats. Whether a separate entity may hold the reserve is open with counsel.
- **Capital:** the program records reserve capital as shares held by allowlisted wallets. During the pilot the only one is MUTAV's own disclosed capital wallet; the reserve is not open to public investment (§4).

**Two legs inside one ceiling.** The *valor afiançado* is `default_cover + exit_cover`, accessories (interest, penalties, court costs) included. The two legs are sub-limits of it: a default sub-limit for rent and charges in arrears, and an exit sub-limit for the tenant's liquidated debts at the end of the lease (damage beyond normal wear, court costs the tenant owes, abandonment and repossession costs, other listed debts; the early-termination penalty is a reserved category, disabled until decided). A fiador pays what the tenant owes; it does not pay for the landlord's eviction (CC 821). The working product is a default sub-limit of 12× rent (under legal review) plus an exit sub-limit of 6× rent: **R$39,600** on the working rent of R$2,200.

---

## 3. The product as an agency sees it

MUTAV keeps the legal form agencies already accept and changes three things, each aimed at one complaint:

1. **The price never goes below market** (so fees can carry the claims).
2. **A reserve exists from the first contract, and anyone can verify it** (against opaque balance sheets and *exoneração*).
3. **The payment clock is public** (against slow and partial payment). MUTAV pays within a contractual term N from a **complete payment request** (N under counsel review). The working targets are ≤4 calendar days from the agency's request to PIX and ≤15 from the rent due date, each step timestamped on-chain.

The promise leads with payment, not a coverage multiple: paid on time, never partially beyond what was approved, no *exoneração* outside the statutory 120-day notice (to be recorded on-chain), and a checkable reserve. Timing figures are working targets until counsel confirms how they bind MUTAV (CDC art. 35).

Agencies never call the program. They work in the MUTAV platform, pay one monthly bill, and see the reserve through a transparency page. The chain serves the **capital and trust side**: a reserve anyone can verify, a rule the program enforces, and an operator whose powers are bounded.

### 3.1 Registering a guarantee

The agency submits a lease in the platform, and MUTAV assesses the tenant's credit off-chain (*análise cadastral*). MUTAV prices by tenant score in three bands of 9%, 12% and 15% of monthly rent, and refuses scores below 400. Once the lease is accepted, the operator registers one guarantee on-chain with an opaque guarantee id, an opaque agency id, a hash of the lease references and the two absolute covers. The rent, the tenant's name, the CNPJ and every document stay off-chain. The program refuses a registration above the per-guarantee cap or one whose cover does not fit in the reserve's free capital ([ADR 0006](../decisions/0006-per-lease-absolute-coverage.md), [ADR 0019](../decisions/0019-v1-layout-for-the-devnet-release.md)). No instruction changes the covers afterwards.

**Activation is the registration** (decided 2026-10-25). Nobody activates a guarantee by hand. Once the signed contract is approved, the guarantee waits for the operator. It is active only when `register_guarantee` is confirmed, and the guarantee fee starts then. If the program refuses the registration, the guarantee does not start. Before contracts go out for signature, the platform checks the reserve's free capital, so MUTAV does not collect signatures it cannot honour. A guarantee whose lease never starts is closed with `CLOSE_VOID`. Our target is that the fiança instrument cites the on-chain guarantee id and the signed cap schedule and takes effect only once registered; the wording of that clause is still **open** with counsel.

### 3.2 Monthly billing

The tenant owes the *taxa da fiança*, and the agency collects it with the rent in its own rent flow. On the 1st of each month the MUTAV platform issues each partner agency **one consolidated bill**: a line per guarantee in force (guarantees in arrears included), plus a one-time activation line in a guarantee's first month (working parameter). It is due on a fixed day set in the partnership agreement; the platform uses the 10th. The agency pays it by **boleto** or **PIX** through a licensed payment provider (PSP). MUTAV bills only its own fee: any third-party charge on the same bill is split to its owner at settlement and never enters MUTAV's accounts, the reserve or NAV.

MUTAV receives BRL, converts it 1:1 into BRS through an authorized BRS minter, and the operator calls `contribute_fees(invoice_ref_hash, amount)` once per paid bill, for its guarantee-fee lines only. The fee receipt makes each bill count exactly once, even if a payment webhook arrives twice. The same instruction sends the take to MUTAV's treasury and the net to the reserve ([ADR 0007](../decisions/0007-fee-take-direct-to-treasury.md), [ADR 0009](../decisions/0009-separate-mutav-money-flows.md)). Fees are never paused or gated by coverage.

**Paying in stablecoin (designed).** An agency may also pay its bill in a stablecoin: BRS in the pilot, 1:1 with BRL, so there is no FX. The platform shows a Solana Pay link or QR carrying the bill's reference; the BRS goes to MUTAV's operator BRS account, skips the minter and reaches the reserve faster. The agency only transfers tokens and still never calls the program: the operator posts `contribute_fees` for that bill as for any other.

**Reconciliation (proposed).** A bill is recorded on-chain only when the PSP settlement, or the BRS transfer carrying its reference, equals its total; a mismatch or reversal goes to manual review. `invoice_ref_hash` is a keyed hash of the bill, so the public cannot link receipts to agencies, while each agency can find its own. Month-end close compares totals billed, settled, minted and recorded.

**If an agency pays late.** The fiança stays in force. No claim, cover or payment-clock rule depends on the bill being paid: an unpaid fee is MUTAV's own claim, never a defence against the landlord (CC 837), and claim payments are never reduced by it. On-chain the guarantee's cover still counts in required coverage, and no fee receipt exists until payment, so the reserve misses that month's net fee; unpaid bills are never reserve assets. Off-chain the bill is marked overdue. Grace period, late charges, when MUTAV stops accepting that agency's new registrations, and who bears a defaulting tenant's fee belong in the partnership agreement and are **open**.

Status: bill generation runs in the platform and PIX settlement in sandbox; boleto issuance, the PSP, the minter integration, stablecoin payment and automated `contribute_fees` are not live. The devnet demo simulates the bridge.

```figure id="fig-1-agency-month" title="Figure 1. One agency, one month"
Left-to-right flow (Sankey or stacked flow), labelled "working parameters, illustrative".
[34 guarantees in force × R$220] = [Consolidated bill R$7,480] --"paid by boleto or PIX"--> [BRL at MUTAV] --"1:1 via authorized minter"--> [7,480 BRS]; a thinner parallel branch [Consolidated bill] --"or paid in BRS (Solana Pay)"--> [7,480 BRS] --"contribute_fees (1 fee receipt)"--> split into [MUTAV treasury: take t (20% at launch)] and [Reserve: net].
Side branch from the reserve: "expected claim payments ≈ 20% of fees (rent arrears, RS base) to ≈ 30% (with exit debts, scope B)".
Reserve box annotation: "c governed: full backing or expected-loss sizing".
Footnote: "Not a return; the final take and the sizing rule are open."
```

```figure id="fig-2-billing-cycle" title="Figure 2. Monthly billing cycle"
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

### 3.3 From claim to payment to the landlord

**Filing.** The agency files the payment request (*pedido de pagamento*) with evidence in the platform, between day 3 and day 9 after the due date (working process; the spec's 15-day window is to be reconciled). MUTAV verifies it. On approval, the operator files the claim on-chain on the default or exit leg, for at most the leg's cover not yet paid or provisioned. The named **category** of guaranteed debt and the timestamp that starts the contractual payment term are carved for a later upgrade.

**Payment.** The operator pays exactly the filed amount from the reserve to MUTAV's whitelisted payments account, which the operator cannot own ([ADR 0021](../decisions/0021-claims-approval-amendment-exact-payment.md)). The payment applies no coverage, pause or price check. The operator caps (R$15k per call, and R$20k over any 31 consecutive days; [ADR 0028](../decisions/0028-pilot-parameters.md)) limit what the hot key can move, not what MUTAV owes: a 6×-rent exit claim (R$13,200) fits the per-call cap. Above it, the admin multisig approves the exact amount, bound to the filing, and the operator then pays it; the admin approves an amount, never the merits of the claim. While the approval waits on the time lock, MUTAV may pay the agency first from its own bank account, and the reserve reimburses MUTAV's payments account once the approval exists. Approved payments still count toward the 31-day cap; for an unusually large claim the admin raises that cap in the same proposal. The reserve never pays more than the remaining *valor afiançado*.

**Settlement.** MUTAV offramps the BRS and pays the agency by PIX, for the landlord under the recorded mandate ([ADR 0003](../decisions/0003-payments-operated-by-mutav.md)). `settle_payout(notice_ref_hash, pix_e2e_hash)` records a hash of the PIX end-to-end ID and its time on the same claim account, so the agency and the landlord, who hold the PIX receipt, can check it against the chain. The landlord's *quitação* hash and the mandate hash come later. The program sets no payout deadline: the service level (review, information requests, approval, payment, with a 48-hour internal target) is measured in the platform and shown on the transparency page from the on-chain payment and settlement timestamps.

**Correcting a claim (first upgrade).** To settle for less, the operator will amend the claim down and then pay it exactly. Until the first upgrade ships, a wrong filing stays provisioned and unpaid.

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

### 3.4 End of the fiança and exoneration

**Exhaustion.** While a guarantee is in force, the landlord cannot obtain the 15-day eviction *liminar* (art. 59 §1º IX), so evictions run on the ordinary track and, by our research estimate, consume the full 6× exit sub-limit (uncapped ≈10×). If exhaustion extinguishes the fiança, the landlord can seek the liminar and the expected exit payout falls (base ≈5.5×, low ≈2.5× rent). In the design, when total paid reaches the *valor afiançado* the guarantee becomes exhausted and MUTAV notifies the landlord that the fiança is extinguished; the v1 binary records only active and closed guarantees, and the full lifecycle of [ADR 0012](../decisions/0012-fianca-aligned-guarantee-lifecycle.md) is carved for a later upgrade. Whether exhaustion counts as extinction for art. 59 is a question for counsel.

**Exoneration.** MUTAV has no unilateral *exoneração* during the fixed term. Once a lease runs for an indefinite term, MUTAV may exit only by the statutory notice, and stays liable for 120 days after it (LI 40 X). In the design, that notice and the return of the keys (LI 39) are recorded on-chain and start a claims tail (length open, at most the 3-year prescription); cover stays fully counted until the tail ends, and only then may the guarantee be closed.

**Closing.** In v1 a guarantee closes as `RELEASED` once no claim is open, or `VOID` for a lease that never took effect, with nothing paid and no claim open. A close releases the cover from required coverage; the account stays on-chain as public history. Recoveries against the tenant, through the fiador's subrogation (CC art. 831), are pursued off-chain; whether they flow back to the reserve is **open**.

### 3.5 What the agency and the landlord can check

Each agency and landlord can look up its own guarantee on the transparency page at reserve.mutav.finance and confirm that the lease is registered at the right cover; each agency can find its own fee receipts from the bill's reference. The page also publishes the reserve, required coverage, per-agency exposure and every claim's filing, payment and PIX settlement times. What the chain cannot prove is listed in the [protocol litepaper](../litepaper.md).

---

## 4. Pilot configuration

The pilot caps (Appendix A, also the devnet values, decided by the founders in [ADR 0028](../decisions/0028-pilot-parameters.md)) are a R$1M reserve (`max_tvl`), `c` = 0.25, R$120k of cover per guarantee, a R$19k stress buffer, operator payments of R$15k per call (a 6×-rent eviction fits; above it, the admin's approval of the exact amount) and R$20k in any 31 days (about 2% of `max_tvl`, the most a compromised operator key could pay out in a window), the program request bounds `min_request` and `max_request` (Appendix A; used during the pilot only by MUTAV's own capital wallet), and no TESOURO (BRS only, [ADR 0018](../decisions/0018-brs-only-pilot-reserve.md)). The take starts at 20% (program maximum 30%). Only the time-locked multisig can change them.

**Why `c` starts at 0.25.** The program floor is 0.10 ([ADR 0016](../decisions/0016-coverage-ratio-below-one.md)). The founders start the pilot at a coverage ratio of at least 0.25, possibly higher, because the first book is small and its loss data is not ours yet. The R$19k stress buffer keeps required coverage at or above the open provisions plus that amount, so filed payment requests stay fully covered at any `c` and, while the book is small, room is set aside for the next claims ([ADR 0022](../decisions/0022-coverage-stress-buffer-underwater-reserve.md)).

**Capacity, honestly.** The working product (12× + 6× rent, under legal review) is a *valor afiançado* of R$39,600 per lease. At `c` = 0.25 each needs R$9,900 of reserve: the R$120k starting capital backs **12** such guarantees, and the R$1M cap about **101** (R$4M of cover); at `c` = 1 R$120k would back **3**. The pilot plan, the path to R$1M, opens month 1 on the R$120k start (12 of the first 17 leases), adds R$170k a month from month 2 (about R$948k in by month 6, none of it redeemed) and reaches the R$1M cap in month 6 with 97 leases and about R$3.8M of cover. The ~170-lease operating plan carries ≈R$6.7M of cover, ≈R$1.68M of reserve at `c` = 0.25, so `max_tvl` must rise before the book passes ~101 leases. The conservative variant runs at `c` = 0.50 with 5 new leases and R$100k a month.

**Table 3. Pilot tracks**

| Track | What it proves | Size | Capital |
|---|---|---|---|
| On-chain mainnet pilot | The mechanism | Program cap R$1M (`max_tvl`, the devnet value, ADR 0028); at `c` = 0.25, about 101 working-product guarantees (R$4M of cover); the plan reaches 97 by month 6 (17 a month) | MUTAV's own capital, planned (ADR 0028): R$120k, plus R$170k a month from month 2 |
| Operating plan | The business | ~170 guarantees across up to 5 partner agencies, ~6 months | MUTAV's own capital; working reserve target R$300k (MUTAV's business plan) |

Caps rise from the first track toward the second only through the time-locked multisig, after an external audit, and while the KPIs of §8 hold.

**Who provides capital.** **The reserve is not open to public investment. During the pilot it runs only on MUTAV's own capital**: planned at R$120k to start plus R$170k a month from month 2 (ADR 0028), against a working target of R$300k in MUTAV's business plan. The committed amount will be published before the mainnet pilot. The program can also record shares for other allowlisted wallets; the pilot does not use that. A known regulatory risk is that outside capital pooled in a loss-absorbing reserve could be recharacterised as insurance or an unauthorised mutual scheme (§7). Any outside capital would come only through a regulated vehicle, after counsel's written opinion. MUTAV sets no return target and makes no return projection.

**Region.** A Passo Fundo (RS) corridor, chosen for **access** to the team's agency relationships, with at most five partner agencies in the first phase. Five agencies in one corridor make defaults correlated. Nothing on-chain limits concentration in one agency: the per-guarantee cap and `max_tvl` bound it, and per-agency exposure is published from the guarantee accounts.

---

## 5. Economics: claims against fees

Revenue is the *taxa da fiança*, billed monthly to partner agencies. Claim payments, operating costs and the reserve's cost of capital come out of it. Every figure below is a **working parameter** from MUTAV's business plan, not final pricing.

**Table 4. Business model, working parameters**

| Item | Working parameter |
|---|---|
| Average rent | R$2,200 a month |
| *Taxa da fiança* | 9%, 12% or 15% of monthly rent by tenant score band (scores below 400 refused); modelled at 10% = **R$220 per lease per month** in MUTAV's business plan; the pilot plan uses 12% (ADR 0028) |
| Book | Pilot: 17 new leases a month, 97 by month 6 at the R$1M cap (ADR 0028). Operating plan: ~170 leases across up to 5 partner agencies (~34 each); gross fees ≈R$37,400 a month at full book (MUTAV's business plan) |
| Expected claims against fees | ≈20% for rent arrears alone (RS base delinquency, 2.01%); ≈21–37% once exit debts are included, by scope. The pilot plan assumes a rounder 2.5% (ADR 0028) |
| MUTAV revenue | Take `t` on each fee (20% at launch, ADR 0028; program maximum 30%) |

The business plan's 10% (R$220 a month on the working R$2,200 rent) sits below the middle band and so is conservative; the pilot plan uses the middle band, 12%. That sits at or above the market band (CredPago/Loft publicly lists 8–10%).

**Claims against fees, by scope of the exit leg** (working parameters from MUTAV's business plan; expected payouts per lease-year ÷ gross guarantee fees; fee 10% of rent per 30 days; rent arrears at 2.01% of annual rent, the Superlógica IIL three-month average for RS apartments; evictions at 0.25% of leases a year (range 0.10–0.60%: CNJ DataJud filings in TJRS, TJSC and TJPR over IBGE PNAD rented households, adjusted for outcomes and for a credit-assessed book; not MUTAV data), each consuming the 6× exit sub-limit; non-eviction exit debts 0.19× rent a year). Scope A, all liquidated tenant debts including the early-termination penalty: **≈37%**. Scope B, the same without the penalty (the spec default): **≈30%**. Scope C, arrears, evictions and abandonment only: **≈21%**. Rent arrears alone are ≈20%. Evictions are rare but expensive: while the fiança is in force the fast eviction order (Lei 8.245/91 art. 59 §1º IX) is unavailable, so each one uses about the full exit sub-limit; at 0.25% a year they add only about one point. Which scope the instrument covers is **open**. These figures are inferences; no Brazilian dataset measures exit-cost frequency.

**The pilot's base delinquency: 2.5%.** The pilot plan assumes a base delinquency of 2.5% of annual rent, rounded up from the measured 2.01%. At 2.5%, rent arrears alone rise to ≈25% of fees at a 10% fee and ≈21% at the pilot's 12%; ADR 0028 puts expected claims in scope B at about R$942 per lease-year, so the 97-lease book of month 6 would expect about R$91k a year (≈R$7.6k a month), well inside the R$20k per 31-day operator cap.

**Loss anchors.** Working loss anchors for the region (three-month averages of the latest 2026 prints): 2.01% of annual rent for RS apartments (Superlógica IIL, base), 2.87% for RS overall (stress), and 5.93% on a looser 15-day threshold (Loft IIA RS, tail). Nationally the IIL fell from 3.29% in January to 3.05% in July 2026, and the South is the lowest region at 2.67%.

**Reserve sizing in reais.** At `c` = 1 the pilot would be a cost centre by design: R$300k backs 7 working-product leases, and the 170-lease book would need ≈R$6.7M. MUTAV sizes the reserve to the book's losses instead (for 170 leases, ≈R$90k a year of expected rent arrears at the base anchor and ≈R$266k in a tail year, against the R$300k working target), and its own balance sheet, disclosed as the backstop, carries the rest of the legal ceiling. The [protocol litepaper](../litepaper.md) explains how `c` and the stress buffer express that choice on-chain.

---

## 6. The stable asset: BRS

The pilot reserve holds one asset: **BRS** ([Nora Finance](https://www.nora.finance/docs/integrate/core-concepts/brs-token)), a 1:1 BRL stablecoin, a classic SPL token with 6 decimals, valued at par. Holding BRL keeps the reserve in the same currency as every lease, so required coverage carries no FX risk; Lei 8.245/91 art. 17 forbids rent in foreign currency or indexed to the exchange rate, so Brazilian guarantees stay in BRL.

**Issuer and freeze risk.** We disclose the trust this places in the issuer: the mint has a freeze authority held by a single key, so the issuer can freeze any BRS account, including the reserve's; we accept this on devnet and will raise it with the issuer before mainnet. A freeze of the reserve account stops payments from it (and the program then counts it as zero) but not MUTAV's obligation, which the backstop then carries. Redemption into BRL runs off-chain. BRS at par inherits the issuer's backing and redemption risk.

**A thin market.** In our on-chain reads, about 2.9k BRS existed on Solana at the start of October 2026, with no DEX pool. Capitalising the pilot reserve would mint many times today's on-chain BRS supply, a concentration risk; confirming issuance and off-ramp capacity is a start condition (§8). No on-chain venue could absorb a forced sale, so the design keeps the whole reserve in BRS during the pilot and leaves liquidity for filed requests.

**Issuer income.** BRS bears no interest, but its issuer pays partners revenue in BRS. The reserve receives this issuer partnership revenue at a rate set by a commercial agreement that is not on-chain and not disclosed here ([ADR 0017](../decisions/0017-brs-income-intake.md)). It lands in a separate income inbox, is booked into the reserve once per issuer statement, and goes entirely to the reserve, with no take. It depends on one contract with one issuer, which can change its rate or end, so it is shown separately from guarantee fees and never counted in required coverage.

**Other assets later.** Tokenized Brazilian federal bonds (TESOURO, Etherfuse) are the first candidate for a later adapter, not part of the pilot. Mints are allowlisted by address, never by symbol, because impostor BRL tokens exist.

---

## 7. Regulatory perimeter and open questions for counsel

The legal positions in this section are MUTAV's working positions, dated October 2026 and under review with counsel.

**Recharacterisation risk.** Brazilian law looks at substance, not labels, so if third-party capital pooled tenants' default risk in the reserve, MUTAV's *fiança* could be read as unauthorised insurance under Decreto-Lei 73/1966 (arts. 24 and 113, as amended by LC 213/2025), or as securitisation. The design keeps MUTAV the only fiador, the fee the price of the fiança and the reserve MUTAV's own capital. This is a risk we manage, not one we can rule out.

**Virtual-asset service provider (working position, legal opinion pending).** Under BCB Resolutions 519–521 (in force since 2 February 2026), MUTAV uses virtual assets for its own operations, not as a service to third parties, so its working position is that it does not need authorisation as a virtual-asset service provider. A legal opinion to back this is pending, and it must also be confirmed for the reserve's operator and partners. No stablecoin-issuer regime exists yet (PL 4.308/2024).

**Open with counsel:**

- whether the structure remains a *fiança* under art. 37 II, and the limited-fiança wording (the *benefício de ordem* waiver, the cap per lease, the 12× default sub-limit);
- exoneration under CC 835 / LI 40 X; whether an accessories-inclusive ceiling displaces CC 822; whether exhaustion extinguishes the fiança for the art. 59 liminar; and whether a public below-target flag invites a CC 826 / LI 40 II argument;
- the securities status of reserve shares, in light of CVM's guidance on crypto-assets ([Parecer de Orientação 40](https://conteudo.cvm.gov.br/legislacao/pareceres-orientacao/pare040.html)); the capital source after the pilot, and whether this paper should mention a future regulated vehicle at all (CVM Res. 160 art. 3);
- under Res. 519–521: whether program-held escrow of deposits is custody; whether converting BRL to a BRL-referenced token is a foreign-exchange operation under Res. 521; and that the PSP and the BRS minter are authorised counterparties after the transition;
- the fee's collection chain: whether the agency's collection and remittance needs a payment-institution or sub-account structure (Res. Conjunta BCB/CMN 16/2025), and whether including the fee in the tenant's rent boleto is compatible with LI 43 I. MUTAV bills only its own fee and never collects third-party money;
- currency: stablecoin payments by agencies or tenants may be FX operations under Res. BCB 521;
- whether published payment targets bind MUTAV under CDC art. 35, and the contractual payment term N;
- ring-fencing the reserve from MUTAV's creditors; whether a separate entity may hold the reserve; LGPD re-identification of per-lease records; tax.

If MUTAV failed, landlords could require tenants to replace the guarantee within 30 days (art. 40); a run-off plan is part of the pilot design. Regulatory change may force design changes or end the pilot.

---

## 8. Start conditions, KPIs and status

**Status (15 October 2026).**

| Item | Status |
|---|---|
| Specification and ADRs 0001–0030 (there is no ADR 0013) | Done. ADR 0027 is still proposed; the rest are accepted |
| Core program: 34 instructions, LiteSVM integration, property, invariant and layout tests, including a property test that the claim payment is never refused for coverage | Done (v1 layout frozen) |
| Pre-devnet reviews and the first internal security audit (2026-10-11), with every confirmed finding fixed | Done. **No independent audit has been done yet**; one is planned before mainnet, auditor and date not chosen |
| Devnet deploy with Squads-owned upgrade authority and reserve admin | Done: [`GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV`](https://explorer.solana.com/address/GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV?cluster=devnet), release `v1.0.0-devnet`, the pilot demo reserve (test activity is visible). It is a test deploy of commit `833c114` under its own program ID, and the on-chain program hash matches that build. The ID declared in the code, `8scC79jkU7SPM9v6M4nB833R8EeqKknfwdRdjn73Qqv9`, is reserved for the `solana-verify` release build and is not deployed yet |
| Pilot app at [reserve.mutav.finance](https://reserve.mutav.finance): public transparency pages reading the devnet reserve, operator console, Squads proposal builders for the admin, reserve simulator | Done |
| MUTAV platform (app.mutav.finance, admin.mutav.finance): agency onboarding, lease and guarantee registration, score-banded pricing, monthly consolidated agency bills, PIX settlement in sandbox, audit log, admin console | Built, pre-launch. Boleto issuance waits on a licensed payment provider, not yet contracted (it needs the company's CNPJ) |
| Agencies | 19 agencies have signed non-binding letters of intent after seeing the platform; none is a customer yet. No live guarantee has been issued |

Program IDs and build hashes are in the [README](../../README.md#devnet-addresses).

**Proposed start conditions:** counsel's sign-off; the limited-fiança instrument and landlord mandate signed through the platform; the claims tail and payment term set; a PSP contracted for boleto and PIX; BRS issuance and off-ramp capacity confirmed and the PIX↔BRS round trip measured; the issuer's answers on PDA mint destinations and CPI burn, and the BRS freeze authority raised with the issuer; reserve capital committed and disclosed; a fresh mainnet deploy from a `solana-verify` release build, with hardware-key multisig members and the 24-hour and 7-day time locks; a real-pilot NAV-move guard in place of devnet's 100%; and an independent security review (whether a full audit is **open**). Before an audit, the pilot would hold real money, MUTAV's own, in software that has had only internal review.

We measure operations, not a claims-to-fees ratio: with a handful of guarantees and delinquency around 2%, six months may see zero or one missed rent, so the demo runs a full drill on devnet, and we propose a published mainnet drill with MUTAV's own capital.

**Table 5. Success metrics** (proposed)

| KPI | On-chain evidence | Off-chain evidence |
|---|---|---|
| Every payment within the working targets (≤4 days request → PIX; ≤15 days due date → PIX) | `ClaimFiled` → `ClaimPaid` → `PayoutSettled` timestamps | Request date, approval and the service level, measured in the platform's hash-chained audit log |
| Zero partial or unexplained payments | Each payment equals its filed provision, ≤ remaining cover, tied to a notice; above R$15k, a matching `ClaimApproved` | Approval records |
| Coverage held, or under-coverage handled as designed | `StateRefreshed`, `ModeChanged` | Incident review |
| Fees, reserve and payouts reconcile with the books | Fee receipts (one per agency bill), `FeesContributed` totals, `VaultState` totals | Monthly agency bills, PSP settlement reports, minter receipts, bank statements |
| Guarantees registered within caps; caps raised only by the multisig | `GuaranteeRegistered`, per-agency figures derived from the guarantee accounts, `ConfigUpdated` | Onboarding records, published rationale |

Guarantees outlive the pilot window (a lease runs about 30 months, plus the claims tail), so the reserve stays committed until they run off, and the run-off will be disclosed.

---

## 9. Risks specific to the pilot

The program is new, upgradeable software that has had internal reviews but **no independent audit**. Generic protocol risks (smart-contract and upgrade risk, operator-key blast radius, what the chain does and does not prove, the known limitations of the v1 binary) are covered in the [protocol litepaper](../litepaper.md). The [Important notice](#important-notice) at the end applies to the whole paper. The risks below are specific to the Brazil pilot.

**Liabilities, not assets, are the weak point.** The chain proves what the reserve holds and enforces the gate. MUTAV, as operator, asserts that the registered guarantees are complete and real; each agency and landlord can check its own lease, and an external completeness attestation is on the roadmap.

**Agency billing risk.** The agency holds tenants' fees before paying MUTAV; if it stops, fee income stops while cover stays live. There is no on-chain per-agency cap ([ADR 0019](../decisions/0019-v1-layout-for-the-devnet-release.md)); MUTAV stops registering that agency's new leases off-chain, and settlement-to-`contribute_fees` time is published per bill. The agency also sells, files, evidences and receives payments; MUTAV's verification and the per-guarantee cap bound that conflict.

**Concentration.** Up to five agencies in one corridor make defaults correlated with the regional cycle. Pricing, credit assessment and verification are off-chain.

**Issuer, off-ramp and payments-account risk.** The pilot concentrates the reserve in one issuer, whose on-chain supply today is a small fraction of what the pilot would hold (§6), and whose freeze authority is a single key. A frozen payments account stops claim payments from the reserve until the admin replaces it. Issuer partnership revenue depends on one commercial agreement that can change or end; it is never counted in coverage. Claim payments depend on the off-ramp and MUTAV's payments account (credit and commingling risk); fee intake depends on the PSP and the minter. The take reaches the treasury in BRS and is converted back; keeping it in BRL at settlement is open.

**A small book.** With a handful of guarantees, the loss data in §5 is borrowed from public indices, not measured on MUTAV's own book. One eviction can use most of a month's operator cap. At `c` = 0.25 claim payments lower surplus and can move the reserve below target; they are still never refused, and MUTAV's backstop carries what the reserve cannot.

**Operator and admin are the same company.** In the pilot every key is MUTAV-held. Distinct keys limit the damage from one compromised key; the public, time-locked record, not the keys, is what lets outsiders check MUTAV. Until the claim-notice gate ships, the runbook files every known claim before any capital fill.

**Open pilot decisions.**

- the on-chain tail floor for reserve sizing; the pilot values are decided (`c` = 0.25 and a R$19k stress buffer, ADR 0028), and the program floor of 0.10 is accepted (ADR 0016);
- exit-leg scope A, B (spec default) or C, at ≈37% / 30% / 21% claims-to-fees (§5);
- the 12× ceiling (legal review) and the per-guarantee cap against the R$39,600 working product;
- the claims tail, the payment term N, and the filing window (T0+9 or the spec's 15 days);
- two legs or only categories; the backstop amount;
- agency billing: late-payment terms, activation fees, the take in BRL or BRS;
- the take rate after the pilot (it starts at 20%) and the caps; recoveries;
- whether the pilot waits for a full independent audit;
- the issuer's answers on PDA mints and CPI burn.

---

## Appendix

### A. Pilot parameters

| Parameter | Enforced in | Devnet and pilot value | Status |
|---|---|---|---|
| `max_tvl` | Deposit fills | R$1M | Decided (ADR 0028); the ceiling of the path-to-R$1M capital plan |
| `max_cover_per_guarantee` | Registration | R$120k | Decided (ADR 0028); fits the R$39,600 working product with room |
| `max_claim_per_call` | Claim payment; above it only with the admin's approval of the exact amount | R$15k | Decided (ADR 0028); a 6×-rent eviction (R$13,200) fits |
| `max_claim_per_period` | Claim payment, over any 31 consecutive UTC days (approved payments included) | R$20k | Decided (ADR 0028); about 2% of `max_tvl` |
| `stress_buffer` | Required coverage | R$19k | Decided (ADR 0028); at most `max_tvl` |
| `c` (`coverage_ratio_bps`) | All gates | 0.25 (conservative variant 0.50) | Decided (ADR 0028); program range 0.10–1.0 (ADR 0016, ADR 0022); the two-tail-year check stays off-chain |
| `fee_take_bps` | Fee intake | 20% | Decided: starts at 20% (ADR 0028); program max 30% |
| `min_request` / `max_request` | Capital requests | R$1,000 / R$100,000 | Decided (ADR 0028); program request bounds, used during the pilot only by MUTAV's own capital wallet |
| `max_nav_move_bps` | NAV-move guard | 100% on devnet | Lowered for the real pilot (value open) |
| Admin / upgrade time locks | Squads | 24 h / 7 days in the real pilot (devnet floors 5 min / 1 h) | Decided (ADR 0020) |
| Reserve asset | Mint allowlist | BRS only; no adapter | Decided (ADR 0018) |
| Guarantee fee | Off-chain pricing | 9% / 12% / 15% of rent by score band; pilot plan 12% | Working parameter |
| Base delinquency | Off-chain planning | 2.5% of annual rent | Working parameter (ADR 0028) |
| Planned capital | Off-chain plan | Planned (ADR 0028): R$120k start + R$170k a month from month 2 | Committed amount published before the mainnet pilot |
| `claims_tail_secs` / `payment_term_secs` | Later upgrade | — | Open (counsel) |

### B. A worked agency month

*Illustrative, using the business plan's working parameters, not pricing: one agency with 34 guarantees in force on the working R$2,200 rent, at the business plan's 10% fee (R$220 per lease per month), the launch take of 20% and the pilot's `c` = 0.25. The bill is paid by boleto or PIX and converted 1:1 into BRS.*

| Day | Step | Amount |
|---|---|---|
| 1 | The platform issues one consolidated bill: 34 lines × R$220 | R$7,480 |
| 1–10 | The agency collects each tenant's fee with the rent | — |
| 10 | The agency pays the bill by boleto or PIX; the PSP confirms the amount equals the bill total | R$7,480 |
| 10–12 | MUTAV converts the BRL into BRS through the authorized minter | 7,480 BRS |
| 10–12 | The operator records one fee receipt with `contribute_fees`: the take goes to MUTAV's treasury | R$1,496 |
| 10–12 | … and the net goes to the reserve | R$5,984 |
| Month end | Reconciliation: billed = settled = minted = recorded | R$7,480 |

**What the reserve holds for this agency.** The 34 guarantees carry 34 × R$39,600 = R$1,346,400 of *valor afiançado*. At `c` = 0.25 they need R$336,600 of required coverage in the reserve; the rest of the legal ceiling sits with MUTAV's own balance sheet as the disclosed backstop.

**What the month's claims are expected to cost.** At the RS base (2.01%), expected rent-arrears payments are about 20% of fees, R$1,496 a month for this agency on average; with exit debts in scope B, about 30%, R$2,244. At the pilot's 2.5% base and 12% fee, rent arrears alone are ≈21% of fees. A single month may see no claim at all, or one exit claim of up to R$13,200 (6× rent), which fits the R$15k per-call operator cap.

### C. References

- MUTAV protocol litepaper: [../litepaper.md](../litepaper.md)
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
- Nora BRS: <https://www.nora.finance/docs/integrate/core-concepts/brs-token>
- Internal: [spec](../spec.md), [ADRs](../decisions/), [ADR 0028, pilot parameters](../decisions/0028-pilot-parameters.md), [reviews and audits](../security/reviews-and-audits.md), [known limitations](../security/known-limitations.md).

---

## Document history

| Version | Date | Status | Changes |
|---|---|---|---|
| v0.1 | 2026-10-15 | Draft for comment | Split out of litepaper v0.4: the Brazilian market and incumbents, the legal nature under art. 37 II, the agency's product, the pilot parameters of ADR 0028, the economics, BRS, the regulatory perimeter, start conditions and status, and the pilot's risks. The mechanism stays in the protocol litepaper |

Each version is published with the protocol litepaper's release, carrying the Markdown and the self-contained HTML, and every change is listed here.

---

## Important notice

- **Draft for comment.** This pilot paper (v0.1, 2026-10-15) is a draft published for feedback. MUTAV (the operating company) is solely responsible for its content, which aims to be fair, clear and not misleading; please report any error (see How to comment).
- **No regulator has reviewed it.** It has not been reviewed or approved by any regulator or supervisory authority, including CVM, the Banco Central do Brasil and SUSEP.
- **Not an offer.** Nothing here is an offer or solicitation to buy or sell securities, fund interests, insurance or any other investment, in Brazil or elsewhere. The reserve is not open to public investment.
- **No return promised.** Nothing here promises or projects a return, income or value to anyone. Figures are working parameters, estimates or illustrations, labelled as such.
- **Forward-looking statements.** Plans, targets, parameters and timelines describe current intentions. They may change without notice and may not happen.
- **Software risk.** The program runs on Solana devnet only. It has had internal reviews, including a first internal security audit on 2026-10-11, and no independent audit. Software can fail, and money held by it can be lost.
- **No advice.** Nothing here is legal, tax or investment advice. Legal positions described here are MUTAV's working positions, under review with counsel.

## How to comment

Open an issue in [github.com/mutav-finance/mutav-protocol-solana](https://github.com/mutav-finance/mutav-protocol-solana/issues) with the label `litepaper`; the same label covers the protocol litepaper and this pilot paper. The comment window is open until 2026-11-15; the next version will then incorporate the feedback, and the document history will list what changed.

---

*Draft for comment · v0.1 · 2026-10-15 · not an offer · devnet program, internal review only, no independent audit.*
