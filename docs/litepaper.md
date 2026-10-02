# MUTAV: A Verifiable BRL Guarantee Reserve on Solana

**Technical litepaper for the Colosseum pilot**

v0.2 · October 2026 · Not legal advice. Not an offer of securities. Unaudited software.

---

## Abstract

MUTAV is an institutional *fiador*. It gives Brazilian tenants a paid rental guarantee (*fiança onerosa*, Lei 8.245/91 art. 37 II) through the real-estate agencies that already run their leases, so no personal guarantor or locked-up deposit is needed. The `mutav` Solana program is designed to record every guarantee with its remaining cover and to custody a BRL reserve that refuses any capital movement that would leave that cover under-backed. It never refuses a claim payment for solvency, pause or price reasons: only the guarantee's remaining cover, hard payment caps and liquid BRS bound it. The Colosseum submission delivers the program on devnet. A mainnet pilot then runs it with real money under hard on-chain caps (proposed: R$100k), once its start conditions are met (§12), to prove that a verifiable digital-asset reserve can be operated as infrastructure for guarantees. The reserve is not a yield product, and nothing here promises a return.

---

## 1. The problem: rental guarantees in Brazil

Brazilian rental law lets a landlord ask for exactly one guarantee per lease, chosen from four forms: a cash deposit (*caução*), a guarantor (*fiança*), *seguro-fiança*, or an assignment of fund quotas (Lei 8.245/91 art. 37). A second guarantee is void, and demanding one is a criminal contravention (art. 43). The one guarantee a lease carries is the landlord's only protection, and it persists until the property is handed back (art. 39).

**Market size.** In 2024 Brazil had **17.8 million rented households**, 45% more than in 2016: 23% of all households, home to 46.5 million people (IBGE, PNAD Contínua). *Seguro-fiança* alone had about **R$1.9bn of written volume** in the 12 months to February 2025, up 195% between 2020 and 2024 (CNseg). No primary national series measures all paid guarantees. As a labelled **estimate**: 17.8M households × a paid-guarantee share of one third to one half (unconfirmed) × an assumed average rent of R$2,000 a month × a guarantee fee of about 6% of annual rent gives **roughly R$8–13bn a year** of guarantee fees. A regional figure for our pilot corridor needs a state-level IBGE cut we have not yet pulled. QuintoCred's closure (below) shows how much demand can be displaced at once: about 45,000 contracts.

**Table 1. Why existing options fail**

| Option | What the tenant gives up | What fails for the agency or landlord |
|---|---|---|
| Personal *fiador* | Needs a relative or friend with a paid-off property | The pool is shrinking (paid-off owner housing −5.2 pp, 2016–24) |
| *Caução* (cash deposit) | Up to 3 months' rent, locked up for the whole lease | Capped at 3 months (art. 38), while an eviction routinely takes 6–12+ months |
| *Seguro-fiança* | Many applicants rejected | Payment after weeks; "natural wear" disputes; some accept a filing only after two missed months |
| *Título de capitalização* | Several months of rent paid upfront, refunded at a low rate | Covers little relative to the capital it locks up |
| Fintech guarantor (*garantidora*) | Little; the cheapest option | Opaque reserves; reported unilateral cancellation (*exoneração*), partial and slow payment |

The last row has already failed at scale. QuintoCred stopped writing new contracts in June 2025 and left about **45,000 contracts and 3,000 partner agencies** without a guarantor. Its stated reason was a strategic restructuring; public reporting and our analysis suggest it priced well below market, held no visible reserve and underwrote loosely. Regulated carriers have also left: FF Seguros withdrew from individual *seguro-fiança* in 2024, and Seguradora Infinite entered extrajudicial liquidation in May 2026.

We interviewed seven agency leaders and rental managers in the South of Brazil, with books from about 35 to about 1,000 properties. Their mean pain score for guarantees was **3.4 out of 5**, and **5 of 7 agencies front the landlord's money themselves** while they wait for the guarantor to pay. They described unilateral cancellation, payment waits that slid from 30–45 days to 60–90 days, partial payments, and no visibility into guarantee-claim status. One said: *"I need these companies, but I don't feel safe."* These were short discovery interviews with agencies only. They did not test price, and we have not yet interviewed tenants or landlords.

**The insight.** Agencies don't distrust guarantees; they distrust guarantors. They front the landlord's rent because they cannot see whether, or when, the guarantor will pay. MUTAV makes the two things they cannot see, the reserve and the payment clock, public and bound by rules. None of them asked for a blockchain; they asked for a guarantor they can check.

---

## 2. MUTAV in one page

*MUTAV is a guarantor whose reserve can't be drained below what it owes, and whose claim payments are never blocked by the solvency gate or a pause.*

MUTAV is designed to act as an **institutional *fiador*** under Lei 8.245/91 art. 37 II and Civil Code arts. 818 ff. It is the fiador of record and owes the landlord. Guarantee claims are paid first from the on-chain reserve, whose capital providers bear losses through NAV, and MUTAV intends to hold its own funds outside the reserve as a backstop (size and disclosure open, §13). Whether this structure remains a *fiança*, rather than a regulated insurance or securitisation activity, is under review with counsel. The product is never sold, drafted or operated as *seguro-fiança* or as a *título de capitalização*.

Five actors take part:

- **Tenant:** pays a monthly guarantee fee through the agency.
- **Landlord:** the beneficiary, paid through the agency under mandate.
- **Agency (*imobiliária*):** distributes the guarantee, registers leases and files guarantee claims in the MUTAV platform.
- **MUTAV** (directly, or through a dedicated reserve entity under legal review): underwrites, approves guarantee claims, runs payments and the platform, and holds the operator key and the admin multisig seats.
- **Capital providers:** allowlisted wallets that hold reserve shares, starting with MUTAV's own disclosed capital wallet.

MUTAV keeps the legal form agencies already accept and changes three things, each aimed at one complaint:

1. **The price never goes below market** (against the QuintoCred failure).
2. **A reserve exists from the first contract, and anyone can verify it** (against opaque balance sheets and *exoneração*).
3. **The payment clock is public** (against slow and partial payment). The business SLA is **≤10 days from the agency's filing to PIX**. The platform records the filing; the chain timestamps MUTAV's approval (`file_claim`), the payment (`pay_claim`) and the PIX settlement, and flags any settlement later than a published payment-to-settlement SLA (proposed: 10 days).

The promise to an agency leads with the guarantee claim, not a coverage multiple: paid within the SLA (a published target, within the pilot's payment caps), never partially beyond what was approved, no unilateral *exoneração*, and a reserve you can check.

**Table 2. MUTAV against what agencies choose today** (public figures only)

| | Approval | Time to pay | Unilateral *exoneração* | Reserve visibility |
|---|---|---|---|---|
| *Seguro-fiança* | Underwritten; a large share rejected | Up to 30 days from complete documents (SUSEP Circ. 621/2021 art. 43); document requests pause the clock | Per contract terms | Regulated solvency reports, aggregate only |
| Fintech *garantidora* | Fast, app-based | Published SLAs of a few business days; agencies report 60–90-day waits | Reported by agencies | None public |
| **MUTAV** | Underwritten off-chain, per lease | Target ≤10 days filing → PIX; payment and settlement timestamped on-chain | None (contract commitment) | Per-guarantee cover and the reserve, on-chain, recomputable |

Agencies never touch the chain; they work in the MUTAV platform and see the reserve through a transparency page. The chain serves the **capital and trust side**: a reserve anyone can verify, a rule the program enforces, and an operator whose powers are bounded. The reserve is **operational infrastructure that keeps guarantees healthy, not a yield product**.

```figure id="fig-1-at-a-glance" title="Figure 1. MUTAV at a glance"
Two horizontal colour bands. Top band labelled "Off-chain: MUTAV platform and PIX". Bottom band labelled "On-chain: Solana".
Top band, left to right: [Tenant] --"guarantee fee with rent"--> [Agency] --"PIX remittance"--> [MUTAV platform] --"BRL to BRS on-ramp"--> crosses into bottom band.
Bottom band: arrow lands on [Reserve (mutav program)]; a small split arrow from the same deposit point goes to [MUTAV treasury] labelled "take".
Return path: [Reserve] --"claim payment (BRS)"--> [MUTAV payments account] --crosses up--> [Offramp BRS to BRL] --"PIX"--> [Agency] --"under mandate"--> [Landlord].
Side box, bottom band, right: [Capital providers (allowlisted)] <--> [FIFO queue] <--> [Reserve], arrows labelled "deposit at NAV" and "exit at NAV, from surplus only".
No amounts anywhere. A small legend: solid arrows = money, dashed = records.
```

---

## 3. Why a chain, and why Solana

The obvious alternative is a segregated bank escrow account with a monthly auditor's attestation. The chain adds four things that baseline cannot.

1. **The rule binds MUTAV itself.** There is no `withdraw_surplus` instruction. Capital leaves only from surplus over the cover it backs, and only while no missed-rent notice is open. An escrow statement shows a balance once a month; it cannot stop the operator in between.
2. **Continuous, permissionless recomputation.** Anyone can call `refresh` and recompute coverage, surplus and NAV from public accounts, at any time, instead of waiting for a periodic PDF.
3. **Per-guarantee liabilities and payment timestamps are public.** Each lease's cover, every provision, every claim payment and its PIX settlement proof are addressable accounts and events. That answers the agencies' "no visibility" complaint directly.
4. **Solana specifically.** A 30-month lease generates roughly 37 transactions (registration, ~30 monthly fee contributions, and a notice, filing, payment, settlement and close if rent is missed). At the 5,000-lamport base fee that is about 0.0002 SOL. The larger cost is rent-exempt deposits: about 0.0026 SOL for a `Guarantee` account and about 0.0019 SOL for each `FeeReceipt`, which is kept as a public record, so roughly 0.06 SOL per lease if invoices are not batched (our estimate; benchmarks will be published). Squads v4 and `solana-verify` make upgrade governance observable. And both a BRL stablecoin and tokenized Brazilian federal bonds already exist on Solana mainnet.

We argue for Solana on fit, not necessity: the business model is chain-agnostic (§5).

---

## 4. Team and traction

**Founder-market fit.** MUTAV has two co-founders. One has 5+ years building in Web3 and long-standing ties to the regional real-estate market. The other is a design engineer, architect and urban planner who took a consumer Web3 fintech product from 0 to 30,000 users. A real-estate market advisor with 30 years in the RS/SC rental market opens the pilot's agency cohort, and a senior blockchain and security engineer advises on the program. The pilot region was chosen because these agency relationships are there.

**Traction, as counts.**

- 7 documented agency discovery interviews (§1).
- The MUTAV platform is built and pre-launch at app.mutav.finance and admin.mutav.finance: agency onboarding with staff review, lease and guarantee registration with an immutable snapshot of the terms, a seven-state guarantee lifecycle, default notices and invoices, PIX collection (in sandbox), a hash-chained audit log and an admin console.
- Devnet program: pending (§12).
- No live guarantee has been issued yet.

---

## 5. Design principles and prior art

Six rules shape every mechanism ([spec §1](spec.md#1-principles)).

1. **The business model is fixed and chain-agnostic.** The program does not price, underwrite or decide guarantee claims.
2. **Only what is verifiable on-chain counts** toward the reserve, NAV or coverage. Losses are recognised early, when a guarantee claim is filed. The trust that remains in token issuers is disclosed.
3. **MUTAV operates every chain touchpoint.** Agencies, tenants and landlords never sign a transaction.
4. **The solvency gate protects the reserve. It never blocks a claim payment.**
5. **Start tight.** Hard on-chain caps bound every outflow and every new liability. Only the time-locked multisig raises them.
6. **Upgrade without migration** ([ADR 0011](decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)).

**Prior art.** Nexus Mutual allows NXM redemptions only while its capital ratio MCR% is above 100%, where MCR is active cover divided by 4.8, a gearing heuristic ([Nexus docs](https://docs.nexusmutual.io/protocol/capital-pool/mcr/)). MUTAV's gate works per guarantee and requires full backing: `c` × remaining cover, with `c` = 1.0 in the pilot. OnRe contributed the patterns we adopted for a Squads-held admin, supply caps, per-purpose token accounts and per-request partial fills. Our async deposit and redemption core is forked from [solana-foundation/vault](https://github.com/solana-foundation/vault) (MIT). To our knowledge, MUTAV is the first BRL guarantee reserve on Solana whose capital flows are gated by on-chain coverage of its liabilities. Appendix G compares mechanisms; these protocols are architectural prior art, not commercial competitors.


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

`VaultConfig` is seeded by the reserve mint. Every other PDA includes the config address in its seeds, directly or through the guarantee it belongs to. Reserve balances are split across four token accounts, so that a freeze targeted at one account does not trap every balance; the issuer can still freeze all of them, which the program detects and treats as under-coverage. Each lease gets exactly one `Guarantee` account, so a duplicate id fails at creation. Every invoice, missed-rent notice, guarantee-claim filing and capital request gets its own PDA, which makes each idempotent and publicly addressable. The full account table is in Appendix F ([spec §3](spec.md#3-accounts)).

**The vault-authority PDA signs for the reserve and mints shares. It is never passed into an adapter CPI.** Each adapter acts only through its own capped sub-authority PDA, which owns only that adapter's staging account. After every CPI the core reloads every vault token account and the share supply, and rejects any change other than the expected one.

### Roles

**Table 3. Roles and powers**

| Role | Key custody | Instructions | Time-locked? |
|---|---|---|---|
| Admin | Squads v4 multisig vault; also the program upgrade authority | `set_config`, `set_roles`, accounts, allowlist, adapters, `unpause`, `fulfil_deposits`, `fulfil_redeems`, `allocate`, `deallocate` | Yes, all of them |
| Operator | Hot key held in KMS, used by the MUTAV platform | `register_guarantee`, `close_guarantee`, `contribute_fees`, `flag_claim_notice` / `close_claim_notice`, `file_claim`, `pay_claim`, `settle_payout` | No (bounded by caps) |
| Pauser | Separate key | `pause`, `revoke_operator` | No |
| Capital provider | Own wallet, allowlisted by Merkle root (KYC off-chain) | `request_*`, `cancel_*`, `claim_shares`, `claim_assets` | No |
| Anyone | — | `refresh`, `advance_queue_heads` | No |

**A stolen operator key** can send capped amounts to MUTAV's own payments account, register guarantees within the caps and free capital, and flag notices, which only delays the queues. It can also close guarantees early, removing their cover from `coverage_required` and freeing capital a later redemption fill could use; withdraw notices, reopening the queues; and file provisions, lowering NAV. Every close and filing is a public event, and the pauser can revoke the key at once. The key cannot send reserve funds anywhere else, mint shares or fill the queue.

Only amounts, timestamps and salted or HMAC'd commitments cross the trust boundary; no names, documents or addresses go on-chain. Every token movement and state change emits an `emit_cpi!` event for the indexer and transparency page.

**Runtime constraints.** CPI depth is capped at 5, and an admin `allocate` already runs Squads → `mutav` → adapter → venue → token program, so adapters make only one level of CPI and emit no events of their own ([CPI docs](https://solana.com/docs/core/cpi)). The 1.4M compute-unit limit rules out on-chain iteration over guarantees, so aggregates such as `remaining_cover_total` are updated incrementally. `transfer_checked` and a Token-2022 mint guard let the reserve accept both token programs safely. The chain does not make payments instant: the PIX legs set the pace.

```figure id="fig-2-architecture" title="Figure 2. System architecture and trust boundary"
Two columns separated by a vertical dashed line labelled "trust boundary: only amounts + hashes cross this line".
Left column "MUTAV platform (off-chain)": boxes [Agencies], [Tenants], [Landlords], [mutav-app / Convex], [KMS operator key], [PIX rails + on/off-ramp], [Indexer], [Transparency page], [Admin console].
Right column "Solana": central box [mutav core program] containing [Vault authority PDA]; below it four token accounts [reserve], [pending_deposits], [pending_redemptions], [claims]; to the right [Adapter program(s)] each with a [capped sub-authority PDA] and [staging account]; top right [Squads v4 multisig + time lock] (also upgrade authority); top left [Pauser key].
Arrows coloured by signer: orange (operator) from KMS key to core labelled register_guarantee, close_guarantee, contribute_fees, flag_claim_notice, close_claim_notice, file_claim, pay_claim, settle_payout; blue (admin) from Squads to core labelled fulfil_deposits, fulfil_redeems, allocate, deallocate, set_config; green (capital provider) from a wallet icon labelled request_deposit, request_redeem, claim_shares, claim_assets; grey (anyone) labelled refresh, advance_queue_heads; red (pauser) labelled pause, revoke_operator.
Arrow from core to adapter labelled "CPI signed by sub-authority only; post-CPI checks".
Events arrow from core back across the boundary to [Indexer] -> [Transparency page], labelled "emit_cpi! events".
Callout near the client: "TS client composes transactions; holds no keys".
```

**Stack and provenance.** Anchor 1.2.0, Solana CLI 4.1.2, LiteSVM, Mollusk, Surfpool, Squads v4 and `solana-verify`. The async core is forked from solana-foundation/vault (MIT) with its unrestricted withdrawal removed; no OnRe code was copied. Apache-2.0 ([provenance](provenance.md)).

---

## 7. Guarantee lifecycle

One lease, from registration to close ([spec §5.2–§5.4](spec.md#52-guarantees-operator)):

**Register.** The agency activates a lease in the platform, and MUTAV underwrites it off-chain. The operator calls `register_guarantee(id, agency_id, refs_hash, rent, multipliers, default_cover, exit_cover)`. The two covers are **absolute amounts**: a default cover for rent arrears and an exit cover for recovering the property; the multipliers are display only ([ADR 0006](decisions/0006-per-lease-absolute-coverage.md)). The instruction checks the per-guarantee and per-agency caps and requires the added coverage to fit in the free capital computed before it. NAV does not change.

**Guarantee fees.** The tenant pays the fee with the rent, the agency remits it by PIX, and MUTAV converts it to BRS. `contribute_fees(invoice_ref_hash, amount)` sends MUTAV's take straight to its treasury and the rest to the reserve ([ADR 0007](decisions/0007-fee-take-direct-to-treasury.md)). NAV rises, no shares are minted, and each invoice counts once. Fees are never paused or gated, because they only strengthen the reserve.

**Missed-rent notice.** At the first missed-rent signal, the operator calls `flag_claim_notice`. While any notice is open, both capital queues stay closed, so nobody enters or leaves at a NAV that misses a known loss. Notices never gate the guarantee-claim path.

**Filing.** The agency files with evidence within 15 days of the missed due date, in the platform, and MUTAV verifies the guarantee claim. On approval, `file_claim` books a provision. **NAV drops at filing**, while coverage is unchanged, because the guarantee claim already sits inside the guarantee's remaining cover. The chain records the approval time, not the agency's filing time.

**Payment.** `pay_claim` sends BRS from the reserve to MUTAV's whitelisted payments account. **It applies no solvency, mode, price or earmark check.** It is refused only if the payment exceeds the leg's remaining cover or the caps (R$10k per call, R$20k per 30 days proposed), if liquid BRS is short, if no matching filing exists, if that notice was already paid, or if the reserve account is frozen. Because each notice gets one payment, a larger guarantee claim, such as a R$12k exit leg, would be filed and paid as several notices, each provisioned at filing, within the 30-day window; the exact split model is **open**.

**PIX settlement.** MUTAV offramps the BRS to BRL and pays the agency by PIX; the agency forwards it to the landlord under mandate ([ADR 0003](decisions/0003-payments-operated-by-mutav.md)). `settle_payout(pix_e2e_hash)` records a hash of the PIX end-to-end ID and sets `late` if settlement came more than `payout_sla_secs` (proposed: 10 days) after `pay_claim`. `refresh` publicly flags any payout still pending past that window.

**Closing the notice.** After payment, the operator calls `close_claim_notice(Paid)`, and the queues reopen once no notice remains. A notice may also close as `FullyProvisioned` (the leg is provisioned for its whole remaining cover) or `Withdrawn` (rent was paid, or the guarantee claim was not approved).

**Close.** When the property is handed back with no guarantee claim open, `close_guarantee` releases the remaining cover. The account stays on-chain as public guarantee-claim history.

Each missed month is its own case, with its own notice and due date. Recoveries against the tenant, through the *fiador*'s subrogation (CC art. 831), are pursued off-chain; whether they flow back to the reserve is **open**.

```figure id="fig-3-claim-lifecycle" title="Figure 3. Guarantee claim lifecycle"
Sequence diagram, six lanes left to right: Agency | MUTAV platform | Operator key | mutav program | Payments account / offramp | PIX.
1. Agency: "rent missed (T0)" -> MUTAV platform.
2. Operator -> program: flag_claim_notice. Program note: "both capital queues closed".
3. Agency -> platform: "filing + evidence, <= T0+15d" (recorded off-chain, platform audit log).
4. Platform: "verification and approval".
5. Operator -> program: file_claim. Program note: "provision booked; NAV drops; approval time on-chain".
6. Operator -> program: pay_claim. Program -> payments account: "BRS". Program note: "Payout = Pending; on-chain SLA clock starts".
7. Operator -> program: close_claim_notice(Paid). Program note: "pending_notices − 1; queues reopen".
8. Payments account -> offramp -> PIX -> Agency: "BRL by PIX"; Agency -> (off-diagram) landlord "under mandate".
9. Operator -> program: settle_payout(pix_e2e_hash). Program note: "Settled; late flag if > payout_sla_secs after pay_claim".
Two brackets: a long one spanning steps 3 to 8 labelled "business SLA: <= 10 days filing -> PIX (measured in the platform)"; a shorter one spanning steps 6 to 9 labelled "on-chain clock: pay_claim -> settle_payout (payout_sla_secs)".
Every on-chain step (2, 5, 6, 7, 9) carries a small badge "not solvency-gated".
```

---

## 8. Reserve, solvency and NAV

The program computes every quantity below from its own tracked state; anyone can recompute them from public accounts ([spec §4](spec.md#4-invariants-and-formulas)). Amounts are BRS base units (6 decimals, at par with BRL), intermediates are `u128`, and rounding favours the reserve.

```text
tesouro_value         = floor(tesouro_units × bounded_tesouro_price / PRICE_SCALE)
stable_assets         = brs_balance + tesouro_value
remaining_cover(g)    = (default_cover − default_paid) + (exit_cover − exit_paid)
remaining_cover_total = Σ remaining_cover(g)                 over active guarantees
coverage_required     = ceil(c × remaining_cover_total)      c = 1.0 in the pilot
surplus               = max(0, stable_assets − coverage_required)
free_capital          = surplus − earmark_eff                earmark_eff = 0 in the pilot
liquid_budget         = max(0, brs_balance − provisions − earmark_eff)
net_assets            = max(0, stable_assets − provisions)
NAV per share         = net_assets / shares_outstanding
```

**What `c` means.** At `c = 1.0` the reserve holds at least the full remaining cover of every active guarantee: the worst case, in which every guarantee pays both legs in full. Whether `c` gets a program-enforced floor of 1.0 is **open**.

**What is gated** ([ADR 0005](decisions/0005-solvency-gate-scope.md)). `register_guarantee` and each fill of `fulfil_redeems` must fit in the `free_capital` computed *before* them, and require normal mode. `allocate` requires normal mode and must leave `stable_assets ≥ coverage_required` and `brs_balance ≥ provisions` afterwards, within the TESOURO share and adapter caps; whether the allocated amount must also fit in free capital is **open**. Any value `deallocate` loses in conversion must fit in free capital, and in under-coverage it runs only if it does not worsen coverage. Nothing on the guarantee-claim path, nor fees, deposit fills, closes, `cancel_*`, `claim_*`, `refresh` or `advance_queue_heads`, is gated on solvency.

**Liquidity for filed guarantee claims.** Redemption fills are also capped by `liquid_budget`, so neither a capital exit nor an allocation can spend BRS a filed guarantee claim needs.

**Under-coverage mode.** The program enters under-coverage when `stable_assets < coverage_required`, for example after a TESOURO mark-down or an issuer freeze. Registration, redemption fills and allocation freeze. Deallocation runs only if it doesn't worsen coverage, so de-risking TESOURO into BRS stays possible. Claim payments, fees, capital requests (queued, not filled) and deposit fills keep running; deposit fills recapitalise the reserve at a NAV that already reflects the loss. `refresh` restores normal mode once coverage is back ([spec §6](spec.md#6-under-coverage-mode)).

**The honest consequence.** At `c = 1.0` a claim payment leaves surplus unchanged (invariant 7), so payments alone cannot cause under-coverage. Never gating them means they continue when a mark-down or issuer freeze has already put the reserve under-covered, and they can draw liquid BRS down to zero; if `c` were ever set below 1.0 they would also reduce surplus. Under-coverage mode and MUTAV's off-reserve backstop handle that case. The size of the backstop and its disclosure are **open**.

**NAV is computed by the program**, never pushed by an admin ([ADR 0004](decisions/0004-onchain-nav-internal-accounting.md)). Accounting is internal, so a direct transfer into the reserve does not move NAV, and a virtual share offset blocks first-depositor inflation. NAV excludes pending deposits, BRS owed to exiting providers, MUTAV's take and fees in transit.

**Price safety.** BRS is valued at par and TESOURO at `min(on-chain BondPrice, accrual ceiling)`. A stale price makes every gated instruction fail closed, a deviation bound rejects jumps, and a NAV-move guard (`fulfil_halted`) stops queue fills after an outsized move. `pay_claim` never reads the price.

**Invariants.** The test plan asserts, after every instruction, that `stable_assets` uses only tracked balances and the bounded price (1); paid ≤ cover on each leg (2); a provision lowers NAV, never `stable_assets` (6); a claim payment lowers assets and remaining cover equally, so at `c = 1` surplus is unchanged (7); and no fill lowers NAV per share (12). A planned property test fuzzes `stable_assets` below `coverage_required` and asserts that `pay_claim` is never refused for solvency.

```figure id="fig-4-coverage-bar" title="Figure 4. Balance sheet and coverage"
Two vertical stacked bars side by side on a common baseline.
Left bar "stable_assets": bottom segment "BRS (at par)", top segment "TESOURO (bounded price)". Inside the bar, a hatched slice at the top labelled "provisions (NAV-only deduction)"; bracket on the left side "net_assets = stable_assets − provisions".
Right bar "coverage_required = c × remaining cover", shorter than the left bar.
The vertical gap between the top of the right bar and the top of the left bar is shaded and labelled "surplus = free capital".
Inside the surplus, a dotted slice labelled "earmark (phase 2; 0 in pilot)".
Arrow pointing into the surplus: "register_guarantee / fulfil_redeems draw from here".
Separate arrow from the BRS segment out to the right: "claim payments draw from BRS — never solvency-gated".
```

**Table 4. Gate matrix** (✓ runs · ✗ refused · *gated* = must fit in `free_capital` computed before · *limited* = see note)

| Instruction | Paused | Under-coverage | Open notice | Stale price | `fulfil_halted` | Solvency |
|---|---|---|---|---|---|---|
| **`pay_claim`**² | **✓** | **✓** | **✓** | **✓** | **✓** | **✓ never gated** |
| `file_claim`, `settle_payout` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `contribute_fees` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `close_guarantee`, notices | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `request_*` | ✗ | ✓ (queued, not filled) | ✓ | ✓ | ✓ | ✓ |
| `register_guarantee` | ✗ | ✗ | ✓ | ✗ | ✓ | *gated* |
| `fulfil_deposits` | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ (within `max_tvl`) |
| `fulfil_redeems` | ✗ | ✗ | ✗ | ✗ | ✗ | *gated* |
| `allocate` | ✗ | ✗ | ✓ | ✗ | ✓ | post-condition + liquidity³ |
| `deallocate` | ✗ | *limited*¹ | ✓ | ✗ | ✓ | *gated*⁴ |
| `cancel_*`, `claim_*`, `refresh`, `advance_queue_heads` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

¹ Only if coverage does not worsen. ² Refused only by the leg's remaining cover, its caps, insufficient liquid BRS, the destination check, an issuer freeze on the reserve account, a missing filing for that notice and leg, or an existing payout for that notice. ³ `stable_assets ≥ coverage_required` and `brs_balance ≥ provisions` afterwards; whether the amount must fit in free capital is open. ⁴ Any value lost in conversion must fit in free capital.

**A worked month** (illustrative, `c = 1.0`, placeholder fee and take; Appendix D). R$90,000 of assets back four guarantees with R$72,000 of remaining cover. Fees on day 1 raise NAV from 1.000000 to 1.007111 without minting shares. A missed rent flagged on day 5 is filed on day 12, when NAV drops to 0.984888, not on day 14, when it is paid; the payment leaves surplus unchanged. A fifth guarantee on day 18 consumes most of the free capital, and on day 21 a queued redemption receives the remaining R$5,410 of free capital (R$5,409.999999 after rounding in the reserve's favour) as a partial head fill, leaving the reserve one base unit above its coverage requirement.

```figure id="fig-5-worked-month" title="Figure 5. The worked month"
Combined chart, x-axis days 0–30.
Bars (left axis, R$): for each event day, paired bars stable_assets vs coverage_required: d0 90,000/72,000; d1 90,640/72,000; d12 90,640/72,000; d14 88,640/70,000; d18 88,640/83,500; d20 88,910/83,500; d21 83,500/83,500; d30 84,100/83,500.
Line (right axis): NAV per share: d0 1.000000; d1 1.007111; d5 1.007111; d12 0.984888; d14 0.984888; d18 0.984888; d20 0.987888; d21 0.987888; d30 0.994987.
Event markers on the x-axis: d1 fees; d5 notice (queues closed); d12 filing (NAV drops); d14 claim payment + notice closed; d16 PIX settlement; d18 registration G5; d20 price accrual (exaggerated); d21 partial head fill R$5,410; d30 fees.
Shaded band between d5 and d14 labelled "queues closed".
Footnote: "Illustrative; placeholder fee and take, not MUTAV pricing; amounts rounded to R$1; not annualisable."
```

---

## 9. Capital flows

**Async deposit.** `request_deposit` escrows BRS in `pending_deposits`, excluded from NAV. The admin multisig calls `fulfil_deposits`, which fills requests in strict FIFO order at the current NAV, within `max_tvl`, only while no notice is open and the price is fresh. Deposits are **allowed in under-coverage** as recapitalisation ([ADR 0008](decisions/0008-uniform-capital-flow-and-pause-scope.md)). The provider then calls `claim_shares`, or `cancel_deposit` while the request is pending.

**Async redemption.** `request_redeem` escrows shares. The admin's `fulfil_redeems(count, max_assets)` recomputes its budget before every fill:

```text
budget = min(max_assets − assets_paid_in_this_call, free_capital, liquid_budget)
```

**Strict FIFO, partial fills only at the head** ([ADR 0010](decisions/0010-partial-fills-at-queue-head.md)). A batch fills whole requests from the head while they fit, then makes at most one partial fill of the head request, and stops; nobody behind the head is touched. A partial fill must be at least `min_fill_assets` and leave a remainder worth at least `min_request`. Each part is priced at the NAV of its own fill. `claim_assets` works between fills without losing the provider's place. The permissionless `advance_queue_heads` crank skips cancelled sequence numbers, so cancel spam cannot stall the time-locked admin. `max_assets` lets the admin fill *less*, for example to keep room for new guarantees; it never changes the order.

**Why async.** Solana has no two-sided BRL liquidity today, so the reserve never assumes an atomic swap. Exits wait while there is no surplus, the reserve is under-covered or a notice is open, and providers accept that trade explicitly.

```figure id="fig-6-redemption-queue" title="Figure 6. Redemption queue with a partial head fill"
Horizontal FIFO lane, head on the left: request A (seq 7, 2,000 shares), request B (seq 8, 10,000 shares), request C (seq 9, 3,000 shares). A greyed box between A and B: seq 7b "cancelled", with an arrow "skipped by advance_queue_heads".
Above the lane, a budget bar labelled "budget = min(max_assets, free_capital, liquid_budget)", recomputed before each fill.
A: fully coloured, label "filled whole".
B: split box, left part coloured "partial fill (≥ min_fill_assets)", right part outlined "remainder stays at head (≥ min_request)".
C: outlined, label "untouched until B is complete".
Side note from A and B to a wallet: "claim_assets between fills — keeps place in line".
Caption line: "Each part priced at the NAV of its own fill; rounding favours the reserve."
```

**MUTAV's three money flows** ([ADR 0009](decisions/0009-separate-mutav-money-flows.md)).

**Table 5. MUTAV's three money flows**

| Flow | Instruction | Destination | Shares? | Public as |
|---|---|---|---|---|
| Guarantee fees, net of the take | `contribute_fees` | `reserve` | Never minted | `FeeReceipt`, `FeesContributed{gross, take, net}` |
| MUTAV operation (the take, `fee_take_bps`, program max 30%) | Same call, separate transfer | Whitelisted `treasury_account` | None; never in the reserve or NAV | `fee_take_total` |
| MUTAV as capital provider | `request_deposit` / `request_redeem` from the disclosed capital wallet | `pending_deposits` → `reserve` | At NAV, like any provider | Queue events filtered by `mutav_capital_wallet` |

The treasury, payments account and capital wallet must be distinct, and there is no `withdraw_surplus`. **Every BRS in the reserve traces to a `FeeReceipt` or a `DepositRequest`.** Because MUTAV also controls the operator key and the admin multisig, the notice gate is the program-level control against MUTAV exiting ahead of a loss it knows about. It depends on MUTAV flagging notices promptly and closing guarantees honestly; both are visible on the transparency page.

**Who provides capital.** At launch we expect the reserve to be funded by MUTAV's own disclosed capital; the committed amount will be published before the mainnet pilot starts. Allowlisted, KYC'd third-party providers are designed for but enabled only after counsel's analysis of the offering (**open**). Reserve shares absorb guarantee claims and receive net guarantee fees, so their value can fall or rise. Fee-driven NAV growth is how the reserve stays solvent and accounts fairly between providers, not a marketed return. MUTAV sets no return target and makes no return projection; the illustrative figures in this paper are not annualisable.

---

## 10. Reserve assets and BRL on Solana

The reserve holds two kinds of asset ([spec §7](spec.md#7-price-safety)).

**BRS** ([Nora Finance](https://www.nora.finance/docs/integrate/core-concepts/brs-token)) is a 1:1 BRL stablecoin, a classic SPL token with 6 decimals, valued at par. We disclose the trust this places in the issuer: the mint has a freeze authority, and redemption into BRL runs off-chain. In our on-chain reads, about 2.9k BRS existed on Solana at the start of October 2026, with no DEX pool.

**TESOURO** ([Etherfuse](https://etherfuse.com/products/stablebonds)) is tokenized exposure to Brazilian federal bonds: a Token-2022 mint that carries an on-chain `BondPrice` account. Its layout, update cadence and rate basis are being confirmed with the issuer. The reserve can hold at most 50% of its value in TESOURO, only through a capped adapter; in the pilot that adapter is an interface and a mock.

The **mint guard** rejects any Token-2022 mint with a PermanentDelegate, a TransferHook, a non-zero TransferFee, NonTransferable, or a default-frozen account state. Mints are allowlisted **by address, never by symbol**, because impostor BRL tokens exist.

**Table 6. Reserve assets**

| Asset | Issuer | Token program | Valuation rule | Cap | Key risk |
|---|---|---|---|---|---|
| BRS | Nora Finance | Classic SPL, 6 dp | Par (1 BRS = R$1) | None; at least 50% of the reserve | Issuer backing, freeze authority, thin market |
| TESOURO | Etherfuse | Token-2022 | `min(BondPrice, accrual ceiling)`, with staleness and deviation bounds | ≤50% of the reserve, plus adapter cap | Price staleness, conversion path, issuer |
| BRZ (new mint) | Transfero | Token-2022 | — | **Not eligible** | Fails the mint guard (PermanentDelegate) |

**The thin market is a design input.** No on-chain venue could absorb a forced sale, so the design keeps a BRS buffer of at least 50%, uses async exits, reserves liquidity for filed guarantee claims, and freezes outflows in under-coverage. Funding the pilot would mint roughly 30× today's on-chain BRS supply. That is a concrete reason to deepen Solana's BRL rails and a concentration risk; confirming issuance capacity and the off-ramp path is a pilot start condition (§12).

---

## 11. Security and governance

**Admin and upgrades.** A [Squads v4](https://github.com/Squads-Protocol/v4) multisig vault with a time lock holds both admin and upgrade authority, and every admin action except `pause` is time-locked. Admins sign from their own hardware-backed wallets. One multisig or a split into upgrade and admin multisigs with different time locks is **open**. The transparency page will publish the signer count, the threshold, that the multisig's `config_authority` is the default, and that the time lock is at or above the agreed floor.

**Distinct keys are not independent parties.** In the pilot the admin signers are MUTAV team members, and the operator, pauser and capital wallet are also MUTAV-held. Distinct keys limit the damage from one compromised key; they do not create independent oversight of MUTAV. The public, time-locked record is what lets outsiders check it.

**Pauser.** A separate key; pausing needs no time lock. A pause stops capital flows, new guarantees and allocation, and leaves the guarantee-claim path, fees, closes and `refresh` open. `revoke_operator` takes effect immediately, while appointing a replacement is a time-locked admin action.

**Operator blast radius.** Five controls bound the operator: the whitelisted destination, the per-call and per-period payment caps, the per-guarantee and per-agency cover caps, the public SLA flag, and immediate revocation. **The caps limit the rate of loss, not the legitimacy of a guarantee claim.**

**Initialization.** Only the upgrade authority can call `initialize`, so it cannot be front-run. The reserve mint, its token program and its decimals are fixed afterwards.

**Upgrade readiness** ([spec §14](spec.md#14-upgrade-readiness)). Every account carries a version, a bump and zeroed padding; fields, errors and events are append-only; a version guard rejects accounts the binary does not understand; and feature flags start at zero. Each upgrade ships as a `solana-verify` verified build in one bundled Squads proposal (upgrade, IDL, verification PDA), announced on the transparency page during the time lock. Enabling a feature takes two time-locked proposals: the upgrade, then the flag. Because multisig takeovers through social engineering were reported across the industry in 2025–26, signers decode every instruction before approving, never pre-sign with durable nonces, and signer or threshold changes are monitored.

```figure id="fig-7-governance" title="Figure 7 (optional). Governance and upgrade path"
Left-to-right pipeline: [Verified build (solana-verify)] -> [Buffer account (hash = build hash)] -> [Bundled Squads proposal: upgrade + IDL + verify PDA] -> [Time lock — public announcement on transparency page] -> [Execute] -> [Smoke checks].
Below the pipeline, a second mini-pipeline labelled "Enabling a feature": [Proposal 1: upgrade adds feature to SUPPORTED_FEATURES] -> [observation period, feature off] -> [Proposal 2: set_config sets flag bit], each proposal passing through its own time lock.
Side arrow from a separate [Pauser key] straight to [mutav program] labelled "pause — no time lock; capital flows stop, guarantee-claim path stays open".
```

---

## 12. The Colosseum pilot

**Goal.** Prove that a digital-asset reserve can run as a viable operation: MUTAV operates it, and anyone can verify it. Proving the business at scale comes later. The work splits into two parts.

### (a) Hackathon deliverable (by 12 October, 23:59 BRT)

The repository was created on 2026-10-01, inside the hackathon window (2026-09-14 to 2026-10-12). Status as of this draft:

| Item | Status |
|---|---|
| Specification and ADRs 0001–0011; Anchor workspace; CI; Codama client pipeline | Done |
| Core program, plan Tasks 1–10, with invariant tests and the `pay_claim`-never-refused property test | Must-ship · pending |
| Codama client (Task 11); devnet deploy with a Squads-owned upgrade authority and a verified build hash (Task 12) | Must-ship · pending |
| Demo video of one full lifecycle on devnet: register, fees, notice, filing, payment, settlement, partial redemption | Must-ship · pending |
| Public transparency view reading devnet events (Task 18) | Must-ship · pending |
| Surfpool fork tests against the devnet BRS mint (Task 13); operator, admin and capital-provider flows in the platform (Tasks 14–17) | Stretch · pending |

The final version will list program IDs, test counts, compute benchmarks and build hashes for merged work only, linked from [provenance.md](provenance.md), which also credits prior work.

```figure id="fig-8-timeline" title="Figure 8. Timeline to 12 October"
Horizontal Gantt strip, Oct 1 to Oct 12, plus a "mainnet pilot (gated)" stub at the right.
Rows: Oct 1 scaffold and docs (solid = done); Oct 2 core state, math, upgrade readiness; Oct 3 register/close and fees; Oct 4 claim payments and payouts; Oct 4–5 async queue and MUTAV capital; Oct 6 under-coverage and price safety; Oct 6–7 adapters, refresh, events; Oct 7–8 client and devnet deploy under Squads; Oct 8–9 fork tests and platform integration (stretch); Oct 10–11 videos, go-to-market, provenance; Oct 12 submit by 23:59 BRT (milestone diamond).
Stub: "mainnet pilot — starts when start conditions are met"; beyond it "phase 2 — instant exit (designed, not deployed)".
Legend: solid bar = done, outlined bar = planned, hatched = stretch. As of v0.2, only Oct 1 is solid.
```

### (b) Mainnet pilot (after submission, gated)

The mainnet pilot uses real BRL and real guarantees under the caps below. **Proposed start conditions:** counsel's sign-off on the structure; BRS issuance and off-ramp capacity confirmed for the reserve size, and the PIX↔BRS round trip measured against the 10-day SLA; the issuers' answers on whether a PDA can receive mints and whether burning works by CPI; reserve capital committed and disclosed; and an independent security review. Whether that review must be a full external audit before launch is **open**. If the pilot starts before an audit, it will hold real funds in unaudited software, and no one should commit funds they cannot afford to lose. An external audit comes before any cap is raised.

The proposed caps (Appendix B) are a R$100k reserve (`max_tvl`), `c` = 1.0, R$30k of cover per guarantee and R$60k per agency, claim payments of R$10k per call and R$20k per 30 days, at most 50% in TESOURO, and a 10-day `pay_claim` → `settle_payout` SLA; the take rate is open (program maximum 30%). Only the time-locked multisig can change them.

**Capacity, honestly.** At `c` = 1, a guarantee on the reference product (3× rent default cover plus 6× rent exit cover, configurable per lease) locks 9× rent: R$18,000 at R$2,000 rent. So **R$100k backs about 5 reference guarantees**, or about 7 at R$1,500 rent, and the agency cap allows about 3 per agency. The payment caps also bound throughput: guarantee claims beyond R$20k in 30 days wait for the window to roll or a time-locked cap raise, and a guarantee claim above R$10k is paid as several notices (§7).

**Unit economics and path to scale.** These figures use public inputs and placeholders only. CredPago/Loft publicly lists its guarantees at 8–10% of rent per month; MUTAV prices at or above that band. At a placeholder 10% of a R$2,000 rent, each reference guarantee brings R$200 a month of guarantee fees against R$18,000 of locked cover.

| Reserve | Reference guarantees at `c` = 1 | Gross guarantee fees per month | MUTAV revenue |
|---|---|---|---|
| R$100k | ~5 | ~R$1,000 | take `t` × gross |
| R$1M | ~55 | ~R$11,000 | take `t` × gross |
| R$10M | ~555 | ~R$111,000 | take `t` × gross |

Guarantee claims, operations and the cost of capital come out of these gross figures. At `c` = 1 the business is capital-intensive, and the pilot is a cost centre by design. The levers to scale are, in order: more committed capital at `c` = 1; per-lease cover terms matched to the risk (the exit leg is configurable); and `c` < 1 only after loss history, counsel's analysis and a time-locked multisig decision.

**Region.** The Litoral Norte corridor of Rio Grande do Sul and Santa Catarina, plus metropolitan Porto Alegre, chosen for **access** to the team's agency relationships. The South region has Brazil's lowest rental delinquency (2.46% against 3.29% nationally, January 2026, Superlógica). The corridor is seasonal and exposed to correlated shocks, which the per-agency caps bound.

**Success over six months.** We measure operations, not a loss ratio. With 5–7 guarantees and delinquency around 2.5%, six months may see zero or one missed-rent event, so the pilot cannot measure a loss ratio and may never trigger a real claim payment. The exit leg falls due only when a lease ends. To exercise the guarantee-claim path anyway, the submission demo runs a full guarantee-claim drill on devnet, and we propose a controlled drill on mainnet with MUTAV's own capital, published as evidence.

**Table 7. Success metrics** (proposed)

| KPI | On-chain evidence | Off-chain evidence |
|---|---|---|
| Every guarantee claim paid within the ≤10-day filing-to-PIX SLA | `ClaimPaid` → `PayoutSettled` within `payout_sla_secs`; zero `PayoutLate` (payment-to-settlement leg only) | Filing date and approval in the platform's hash-chained audit log (filing-to-payment leg) |
| Zero partial or unexplained payments | Each payment ≤ remaining cover, tied to a notice | Approval records |
| Coverage held, or under-coverage handled as designed | `StateRefreshed`, `ModeChanged` | Incident review |
| Reserve, fees and payouts reconcile with the books | `FeeReceipt`s, `VaultState` totals | Platform ledger, bank statements, agency remittances |
| Guarantees registered within caps; caps raised only by the multisig | `GuaranteeRegistered`, `AgencyExposure`, `ConfigUpdated` | Onboarding records, published rationale |

Guarantees outlive the pilot window (a lease runs about 30 months, and each guarantee lasts until the keys are handed back), so the reserve stays committed until they run off, and the run-off will be disclosed.

---

## 13. Risks, limits and disclosures

MUTAV's reserve program is new, **unaudited** and upgradeable software. Nothing here is legal, tax or investment advice, an offer of securities, or a promise of any return.

**The honest weak point is liabilities, not assets.** The chain proves what the reserve holds and enforces the gate. The operator asserts that the registered guarantees are complete and real.

**Table 8. What the chain proves and what it doesn't**

| The chain proves | The chain does not prove |
|---|---|
| The reserve's tracked balances | That a lease, tenant or default exists (only a hash is stored) |
| Each guarantee's absolute cover, and the amounts paid and provisioned | That a guarantee claim was correctly approved |
| `coverage_required`, surplus and NAV, recomputable by anyone | That every guarantee MUTAV wrote is registered |
| Every fee split between reserve and treasury | That a closed guarantee's lease actually ended |
| That claim payments went only to the whitelisted account, within caps | When the agency filed (the chain sees MUTAV's approval, not the filing) |
| Approval, payment and settlement timestamps, and SLA flags on the payment-to-settlement leg | That the PIX reached the agency or landlord (only the E2E hash, which the counterparty can verify) |
| FIFO order and the price of every fill | That the BRS and TESOURO issuers hold the assets behind their tokens, or TESOURO's true market value |
| Every config and role change, and the disclosed MUTAV capital wallet | That notices were flagged on time; the size of MUTAV's backstop; fees collected but not yet settled on-chain |

**Making completeness checkable.** Each agency and landlord can look up its own `Guarantee` account (by id or `refs_hash`) on the transparency page and confirm that its lease is registered at the right cover. Our target is that the *fiança* contract cites the on-chain guarantee id and takes effect only once registered; that is **open**. A periodic external completeness attestation is on the roadmap. So: assets and registered obligations are on-chain and the solvency rule is enforced by code; completeness of obligations is checkable by each counterparty and attested off-chain.

**Smart-contract and upgrade risk.** Bugs could lock or misdirect funds; caps, a separate pauser, the planned tests and verified builds will limit the damage. An upgrade can change any rule in this paper, including those that protect capital providers; the time lock gives notice, not a guarantee.

**Operator trust.** A compromised or misused operator key could register fictitious guarantees, pay invalid guarantee claims at a capped rate (only to MUTAV's own account), or close real guarantees and notices early. Early closes understate `coverage_required` and could let capital exit against live leases. The chain records every close (`GuaranteeClosed`, `ClaimNoticeClosed`) but cannot tell a real handover from a false one.

**Issuer risk: BRS.** The reserve values BRS at par, so it inherits the issuer's solvency and redemption risk. A freeze of the reserve's token account stops payments from it until lifted, but does not suspend MUTAV's obligation to the landlord: MUTAV would have to pay from off-reserve funds (size open).

**Off-ramp and payments-account risk.** Every claim payment depends on the BRS→BRL off-ramp and on MUTAV's payments account. After `pay_claim` the BRS sits in a MUTAV-controlled account, which carries MUTAV credit and commingling risk, and an off-ramp outage can break the business SLA even though the on-chain payment succeeded.

**TESOURO.** The price can be stale or move against the reserve, conversion to BRL needs off-chain steps, and a mark-down that breaches coverage freezes outflows.

**Capital-provider liquidity.** Exits can wait indefinitely (§9), and a guarantee claim lowers every share's value at filing.

**Underwriting and agency conflict.** Pricing, underwriting and verification are off-chain, and defaults correlate with the cycle and the region. The agency sells the guarantee, files the guarantee claim, supplies the evidence and receives the payment; per-agency caps and MUTAV's verification bound that conflict.

**Legal and regulatory risk** (dated October 2026). Under review with counsel:

- recharacterisation of a pooled, outside-funded *fiança* as insurance or securitisation (Decreto-Lei 73/1966);
- the securities status of reserve shares, in light of CVM's guidance on crypto-assets ([Parecer de Orientação 40](https://conteudo.cvm.gov.br/legislacao/pareceres-orientacao/pare040.html));
- BCB Resolutions 519–521, in force since 2 February 2026 (existing operators file by 30 October 2026); no stablecoin-issuer regime exists yet (PL 4.308/2024);
- ring-fencing the reserve from MUTAV's creditors;
- LGPD: whether per-lease records, combined with off-chain data, could re-identify a person and so count as personal data that an immutable ledger cannot delete;
- tax.

If MUTAV failed, landlords could require tenants to replace the guarantee within 30 days (art. 40); a run-off plan is part of the pilot design. Regulatory change may force design changes or end the pilot.

**Insider timing.** The main residual risk is the operator flagging a notice late. The transparency page shows how old every open notice is.

**Open decisions.**

- the take-rate value and the final cap values;
- a floor for `c`;
- whether `allocate`'s amount must fit in free capital;
- the provision formula (filed amount or full leg), and how a guarantee claim above the per-call cap is split across notices;
- whether recoveries flow to the reserve;
- the size and disclosure of MUTAV's backstop;
- one multisig or two, and the time-lock values; the pauser's powers;
- whether third-party capital providers join, and when;
- whether the mainnet pilot waits for a full external audit;
- the issuers' answers on PDA mint destinations, CPI burn, the `BondPrice` layout and a BRS↔TESOURO path.

---

## 14. Roadmap

**Phase 2: instant exit (designed, not deployed)** ([spec §13](spec.md#13-phase-2--instant-exit-designed-disabled-in-the-pilot)). An allowlisted holder could exit immediately at NAV minus a convex haircut, paid only from a buffer earmarked out of surplus.

- **The queue comes first.** The buffer is funded only when the redemption queue is empty, and is released to the queue once its head has waited past the release window.
- **The haircut stays in the reserve.** It is never MUTAV revenue.
- **The exit switches off automatically** when the reserve is paused, under-covered, holding a stale price or halted by the NAV-move guard, when a notice is open, when the queue head is starved, below headroom, or once caps are reached.
- **MUTAV's disclosed capital wallet and listed affiliates are barred**, and every holder faces a holding period (proposed 30 days). Whether the bar holds against share transfers to other allowlisted wallets is **open** (identity-keyed allowlisting or transfer restrictions).
- **Enabling it takes two steps:** a verified, time-locked upgrade, then a separate flag flip. The pilot already ships the earmark-aware formulas (earmark at 0), the notice gate, `HolderState` and the padding, so phase 2 changes no solvency formula and no claim-payment code.

**Assets and composability.** A live TESOURO adapter follows once the price account and the BRS↔TESOURO path are confirmed. Reserve shares could later compose with other protocols; that is **not promised** and would need loss-aware NAV publication, exit liquidity and a securities analysis.

**Platform.** BRS-native fee collection, on-chain claim payments wired to platform approvals, a landlord and mandate record, a recoveries flow, and an external completeness attestation.

**Scale gates.** Caps rise only through the time-locked multisig, after an external audit, and only while the KPIs in §12 hold.

---

## Appendix

### A. Glossary

| Term | Meaning |
|---|---|
| *Fiador* / *fiança onerosa* | Guarantor / paid guarantee under Lei 8.245/91 art. 37 II and CC arts. 818 ff. |
| Agency (*imobiliária*) | Real-estate agency that runs the lease and distributes the guarantee |
| Guarantee fee | Monthly amount the tenant pays for the guarantee |
| Take rate | MUTAV's share of each guarantee fee (`fee_take_bps`), sent to its treasury |
| Default cover / exit cover | Absolute amounts a guarantee covers for rent arrears / property recovery |
| Remaining cover | Cover minus amounts already paid, per leg |
| Missed-rent notice (`flag_claim_notice`) | On-chain flag at the first missed rent; closes the capital queues |
| Guarantee-claim filing (`file_claim`) | Approved guarantee claim booked as a provision against NAV before payment |
| Claim payment (`pay_claim`) | BRS sent from the reserve to MUTAV's payments account |
| Payout settlement / PIX E2E hash | Record that the BRL reached the agency, with a hash of the PIX end-to-end ID |
| Reserve | BRS and TESOURO custodied by the `mutav` program |
| Reserve share | SPL token representing a pro-rata share of `net_assets` |
| NAV | `net_assets / shares_outstanding` |
| `stable_assets` | BRS balance plus TESOURO at the bounded price |
| `coverage_required` | `c` × remaining cover of all active guarantees |
| Surplus / free capital | Assets above `coverage_required` (minus the earmark in phase 2) |
| Liquid budget | BRS not needed by filed guarantee claims |
| Under-coverage mode | State in which `stable_assets < coverage_required`; outflows freeze |
| Earmark | Phase-2 buffer carved from surplus for instant exits; 0 in the pilot |
| PDA / CPI | Program-derived address / cross-program invocation |
| Upgrade authority | Key allowed to replace a program's code; here, the Squads multisig |
| BRS | Nora Finance's 1:1 BRL stablecoin (SPL) |
| TESOURO | Etherfuse's tokenized Brazilian federal bond exposure (Token-2022) |

### B. Parameters

| Parameter | Enforced in | Proposed pilot value | Status |
|---|---|---|---|
| `max_tvl` | `fulfil_deposits` | R$100k | Proposed |
| `max_cover_per_guarantee` | `register_guarantee` | R$30k | Proposed |
| `max_cover_per_agency` | `register_guarantee` | R$60k | Proposed |
| `max_claim_per_call` | `pay_claim` | R$10k | Proposed |
| `max_claim_per_period` / `claim_period_secs` | `pay_claim` | R$20k / 30 days | Proposed |
| `max_tesouro_share_bps` | `allocate` | 50% | Proposed |
| `min_request` / `max_request` | `request_*`, partial-fill remainder | R$1,000 / R$30,000 | Proposed |
| `min_fill_assets` | `fulfil_redeems` | R$500 | Proposed |
| `c` (`coverage_ratio_bps`) | All gates | 1.0 | Proposed; floor open |
| `fee_take_bps` | `contribute_fees` | — | Open; program max 30% |
| `payout_sla_secs` | `refresh`, `settle_payout` | 10 days | Proposed |
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

Fee split:
  take = floor(amount × fee_take_bps / 10_000)  → treasury_account
  net  = amount − take                           → reserve

Phase 2 only, not deployed:
  earmark_eff = min(buffer_earmark, surplus, max(0, brs_balance − provisions))
              = 0 when INSTANT_EXIT is off (always, in the pilot)
```

### D. Worked month, full table

*Illustrative. The guarantee fee (10% of rent per guarantee-month: R$200 on R$2,000 rent, R$150 on R$1,500) and take (20%) are placeholders, not MUTAV pricing. `c` = 1.0. The virtual share offset is ignored, so the real program differs by a few base units. Amounts in R$, rounded to R$1 in the columns; after day 21 the reserve keeps one extra base unit (R$0.000001) from rounding. TESOURO is included to show the bounded-price mechanics; in the pilot the TESOURO adapter is a mock, so the live reserve holds BRS only until a real adapter ships. The day-20 accrual is exaggerated for legibility and is not a rate forecast.*

**Setup.** 90,000 shares at NAV 1.000000. The reserve holds R$60,000 in BRS and TESOURO valued at R$30,000. Four guarantees, G1–G4, across two agencies, each on R$2,000 rent with R$6,000 of default cover and R$12,000 of exit cover.

| Day | Event | BRS | TESOURO | `stable_assets` | `coverage_required` | Free capital | Provisions | Shares | NAV/share |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Start | 60,000 | 30,000 | 90,000 | 72,000 | 18,000 | 0 | 90,000 | 1.000000 |
| 1 | `contribute_fees` ×4: gross 800, take 160, net 640 | 60,640 | 30,000 | 90,640 | 72,000 | 18,640 | 0 | 90,000 | 1.007111 |
| 3 | Provider A `request_redeem` 10,000 shares | 60,640 | 30,000 | 90,640 | 72,000 | 18,640 | 0 | 90,000 | 1.007111 |
| 5 | G1 misses rent → `flag_claim_notice` (queues closed) | 60,640 | 30,000 | 90,640 | 72,000 | 18,640 | 0 | 90,000 | 1.007111 |
| 12 | `file_claim(DEFAULT, 2,000)` | 60,640 | 30,000 | 90,640 | 72,000 | 18,640 | 2,000 | 90,000 | 0.984888 |
| 14 | `pay_claim(DEFAULT, 2,000)`; `close_claim_notice(Paid)` | 58,640 | 30,000 | 88,640 | 70,000 | 18,640 | 0 | 90,000 | 0.984888 |
| 16 | `settle_payout(pix_e2e_hash)`, within SLA | 58,640 | 30,000 | 88,640 | 70,000 | 18,640 | 0 | 90,000 | 0.984888 |
| 18 | `register_guarantee` G5 (rent 1,500): cover 4,500 + 9,000 | 58,640 | 30,000 | 88,640 | 83,500 | 5,140 | 0 | 90,000 | 0.984888 |
| 20 | `refresh`: TESOURO accrues +0.9% (exaggerated) | 58,640 | 30,270 | 88,910 | 83,500 | 5,410 | 0 | 90,000 | 0.987888 |
| 21 | `fulfil_redeems(1, u64::MAX)`: partial head fill | 53,230 | 30,270 | 83,500 | 83,500 | 0 | 0 | 84,523.675628 | 0.987888 |
| 22 | Provider A `claim_assets` (R$5,409.999999) | 53,230 | 30,270 | 83,500 | 83,500 | 0 | 0 | 84,523.675628 | 0.987888 |
| 30 | `contribute_fees`: gross 750, take 150, net 600 (G1 unpaid) | 53,830 | 30,270 | 84,100 | 83,500 | 600 | 0 | 84,523.675628 | 0.994987 |

**Day-21 budget check.** `budget = min(∞, free_capital 5,410, liquid_budget 58,640) = 5,410`. The head request is worth R$9,878.89, more than the budget, so the fill is partial. It is at least `min_fill_assets` (R$500) and leaves R$4,468.89, at least `min_request` (R$1,000).

- Shares burned: `floor(5,410 × 90,000 / 88,910) = 5,476.324372`.
- Assets paid out: R$5,409.999999, rounded down, so the reserve keeps the dust (BRS 53,230.000001).
- NAV per share is unchanged.

### E. References and provenance

- Lei 8.245/91 (Lei do Inquilinato): <https://www.planalto.gov.br/ccivil_03/leis/l8245.htm>
- IBGE, PNAD Contínua 2024 (rented households).
- CNseg/SUSEP data on *seguro-fiança* written volume, via CQCS: <https://cqcs.com.br/noticia/pottencial-seguradora-destaca-crescimento-do-seguro-fianca-locaticia-que-movimenta-r-19-bilhao-em-12-meses/>
- Superlógica rental delinquency index (IIL), January 2026: <https://stgnews.com.br/inadimplencia-de-aluguel-comeca-2026-em-queda-aponta-indice-superlogica/>
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
| `VaultConfig` | `["config", reserve_mint]` | Roles, caps, `c`, take rate, payments and treasury accounts, allowlist root, adapters, price parameters, feature flags, disclosed MUTAV capital wallet |
| `VaultState` | `["state", config]` | Tracked balances, `remaining_cover_total`, `coverage_required`, provisions, shares, NAV, queue heads, open notices, mode |
| Vault authority | `["authority", config]` | PDA signer for the reserve and share-mint authority; never passed into an adapter CPI |
| Token accounts | `["reserve" \| "pending_deposits" \| "pending_redemptions" \| "claims", config]` | Liquid reserve; escrowed deposits; escrowed shares; BRS owed to exiting capital providers |
| `Guarantee` | `["guarantee", config, id]` | One per lease: agency, `refs_hash`, rent, absolute cover per leg, paid and provisioned amounts |
| `AgencyExposure` | `["agency", config, agency_id]` | Outstanding cover per agency (enforces the agency cap) |
| `FeeReceipt` | `["fee", config, invoice_ref_hash]` | Each invoice counted exactly once: gross, take, net; never closed |
| `ClaimNotice` / `ClaimFiling` / `Payout` | `["notice" \| "claim" \| "payout", guarantee, notice_ref_hash]` | Missed-rent flag; provision and approval time; payment and PIX settlement record |
| `DepositRequest` / `RedeemRequest` | `["deposit" \| "redeem", config, seq]` | FIFO position, amounts, partial-fill state |
| `HolderState` | `["holder", config, owner]` | Time of the owner's last `request_deposit` or `claim_shares` (holding-period stamp for phase 2) |

### G. Architectural prior art

| | MUTAV (pilot) | OnRe | Credix | Huma | Maple | Nexus Mutual |
|---|---|---|---|---|---|---|
| What it is | Guarantee reserve for rental *fiança* | Tokenized risk-transfer yield | Private credit | Receivables financing | Institutional lending | On-chain mutual cover |
| Denomination | BRL | USD | USDC on-chain; BRL off-chain | USDC | USDC | ETH and stables |
| Liabilities on-chain? | Yes, one account per guarantee | Aggregate NAV only | Deal state only | Pool state only | Loan state (Ethereum) | Yes, active covers |
| Exit gated on on-chain solvency? | Yes: exits only from surplus over `c` × remaining cover | No | No | Tranche-ratio gate | No | Partly: MCR% > 100% |
| Audited / open source | **Unaudited**; Apache-2.0 | Audited; open | Closed source¹ | Audited; Solana programs private¹ | Audited; open (Ethereum) | Audited; open |

¹ Where programs are closed source, the entries are inferred from public documentation.

---

## Status

Draft dated 2026-10-02 · version 0.2 · pre-audit · hackathon deliverable targets devnet; mainnet pilot gated (§12). Program IDs, test counts, compute benchmarks and verified-build hashes will be added when they exist. Every cap and parameter is proposed and can be changed by the time-locked admin multisig.
