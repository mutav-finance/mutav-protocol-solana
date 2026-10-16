# MUTAV: Verifiable Guarantees on a Public Chain

**A model for running guarantees on-chain, and its implementation on Solana**

**Draft for comment · v0.5 · 2026-10-15**

This is a draft published for feedback, not an offer of any security or investment. It describes a program running on Solana devnet that has had internal review only and no independent audit. Read the [Important notice](#important-notice); to comment, see [How to comment](#how-to-comment).

*A guarantee is a promise to pay if someone else doesn't. MUTAV puts that promise on a public chain, so that anyone can check what a guarantor owes, what backs it, and that the money backing it cannot leave while claims need it.*

---

## Abstract

Guarantees carry a large share of everyday economic trust: rent, trade credit, contract performance, payment on delivery. Each one is a promise by a guarantor to pay a beneficiary if an obligor does not. Today almost no one outside the guarantor can check whether those promises are backed. Exposure sits in private books, capital is reported in aggregate and late, and failures tend to surface only when claims go unpaid.

This paper gives a general model for running guarantees on a public chain, and shows that MUTAV's Solana program implements it. In the model, every exposure is registered as its own on-chain record with a fixed ceiling. The capital backing them sits in a program-controlled reserve whose balances anyone can read. A **coverage gate** refuses any new exposure or capital exit that would leave the reserve below **required coverage**: a governed share `c` of the remaining cover, never less than the open claim provisions plus a stress buffer. Claim payments are never refused by that gate or by a pause. They follow a fixed state machine: filed, optionally approved, paid exactly, settled against a hash of the off-chain payment. Only financial facts go on-chain; identity, underwriting and the legal contract stay off-chain, under the local law that decides what form the guarantee takes. Authority is split between an operator who runs the book, an admin who sets the reserve's ceilings behind a time lock, and pause-only keys for emergencies.

The implementation is the `mutav` Solana program: MIT-licensed, 34 instructions, a frozen v1 account layout, live on devnet as release `v1.0.0-devnet`, with internal review only. Its first deployment is rental guarantees in Brazil. The reserve is not open to public investment, and nothing here promises a return.

---

## 1. The problem: guarantees are promises nobody can check

A guarantee has three parties. The **obligor** owes something: rent, a supplier invoice, the completion of a contract. The **beneficiary** is owed it. The **guarantor** promises the beneficiary that, if the obligor fails, it will pay up to an agreed ceiling. The beneficiary accepts the guarantee in place of something more expensive: a cash deposit, a personal guarantor, a letter of credit, or simply not doing business at all.

The same structure recurs across markets. Examples include rent guarantees in place of a deposit, trade-credit guarantees on supplier invoices, performance and surety bonds on construction and public contracts, and payment guarantees in commerce and logistics. These examples describe the problem, not products MUTAV supports: its program supports one kind of guarantee in one market today (§9).

What all of them share is that the beneficiary relies on a promise it cannot check. Three things are invisible from outside:

1. **Exposure.** How many promises the guarantor has written, for how much, and how much of that is already being claimed. Books are private and reported in aggregate, if at all.
2. **Backing.** What capital stands behind those promises, where it sits, and whether it can be moved elsewhere tomorrow. A balance sheet is a snapshot taken after the fact.
3. **Conduct.** When a claim was made, when it was paid, and whether it was paid in full. The beneficiary sees only its own claim, never the guarantor's record.

When guarantors fail, they tend to fail along these lines. Exposure grows faster than capital because nobody outside can see the ratio. Capital leaves, or is pledged elsewhere, while claims are building. Payments slow down or arrive partially, because the beneficiary has no record against which to hold the guarantor. And much of the risk sits with counterparties off the guarantor's books (originators, distributors, servicers), whose failures arrive without warning. Where regulation requires capital reports, they reach the regulator late and in aggregate, and many guarantee forms sit outside such rules altogether. The beneficiary, who most needs to know, still cannot check.

**The thesis.** On a public chain, a guarantor can make its promise checkable. Every exposure is registered as it is written. The capital backing it is visible and held by a program, not by a person. A rule in that program stops capital leaving while it is needed for claims, and the same program records every claim from filing to payment. None of this removes the need to trust the guarantor's off-chain judgement (who it guarantees, which claims it approves), but it replaces "trust our balance sheet" with a ledger anyone can recompute.

---

## 2. Design principles

Six rules shape the model and the program ([spec §1](spec.md#1-principles)).

1. **The protocol is a ledger plus rules.** It does not price, assess credit or decide claims. It records the outcome of those decisions and enforces what may happen to money as a result.
2. **Only what is verifiable on-chain counts** toward the reserve, its net asset value (NAV) or required coverage. Losses are recognised early, when a claim is approved, not when it is paid. Trust that remains in token issuers is disclosed.
3. **The coverage gate protects the reserve. It never blocks a claim payment.** A guarantor whose rules can delay paying beneficiaries has turned a promise into an option.
4. **Financial facts only.** Covers, amounts, statuses and timestamps go on-chain. People, documents and contracts do not; they are referenced by opaque ids and salted hashes.
5. **Start tight.** Hard on-chain caps bound every outflow and every new liability. Only a time-locked multisig raises them.
6. **Upgrade without migration.** The account layout reserves room for planned features, so the rules can grow without moving state ([ADR 0011](decisions/0011-phase2-instant-exit-and-upgrade-readiness.md)).

**Prior art.** Nexus Mutual, an on-chain mutual, allows redemptions of its token only while its capital ratio (MCR%) is above 100%, where MCR is active cover divided by 4.8, a gearing heuristic ([Nexus docs](https://docs.nexusmutual.io/protocol/capital-pool/mcr/)). MUTAV's gate works per guarantee and requires a governed share `c` of each guarantee's remaining cover. OnRe contributed patterns for a multisig-held admin, two-step role handover, supply caps and per-request partial fills, and its published audits informed our review. The asynchronous request lifecycle follows [solana-foundation/vault](https://github.com/solana-foundation/vault) (MIT). No code from either is copied ([provenance](provenance.md)).

---

## 3. A model of on-chain guarantees

### 3.1 Parties and roles

The model separates the legal parties to a guarantee from the keys that act on the program.

**Table 1. Parties**

| Party | What it does | Touches the program? |
|---|---|---|
| Beneficiary | Is owed the obligation and receives claim payments | No; reads its own guarantee record |
| Obligor | Owes the obligation and usually pays the guarantee fee | No |
| Guarantor | Is legally liable to the beneficiary up to the ceiling; underwrites and approves claims | Through the operator role |
| Capital provider | Supplies reserve capital and holds reserve shares that absorb claims and receive net fees | Requests deposits and redemptions |
| Admin | Sets the reserve's ceilings and parameters; approves large claim payments by amount | Through a time-locked multisig |

**The beneficiary's claim is against the guarantor, not against the reserve.** The reserve is capital set aside, on-chain, to back the guarantor's obligations. If the reserve runs short, the guarantor still owes the difference. This keeps the legal promise where local law puts it and makes the reserve a visible floor, not the limit of liability.

On the program, those parties act through roles ([ADR 0020](decisions/0020-operator-admin-separation-and-recovery.md); Table 3 in §6). The **operator**, a capped hot key, runs the book and the claim cycle. The **admin**, a time-locked multisig, owns the reserve's financial health through ceilings and never judges the merits of one contract. The **pauser** and up to three **guardians** can stop capital flows at once but cannot move money. **Capital providers** deposit and redeem through an allowlisted, first-in-first-out (FIFO) queue, and **anyone** can recompute the reserve's state. Operator and admin may be one organisation at first and separate companies later; no rule assumes either. What matters is that the key that writes the book cannot release capital, and the key that releases capital cannot write the book.

```figure id="fig-1-model" title="Figure 1. The model: parties, roles and the trust boundary"
Two horizontal bands. Top band "OFF-CHAIN · LEGAL AND OPERATIONAL", bottom band "ON-CHAIN · PUBLIC PROGRAM".
Top band, left to right: [Obligor] --"owes; pays the guarantee fee"--> [Beneficiary]; [Guarantor / operator] with sub-labels "underwriting", "claim review", "legal contract"; a dashed bracket around the three: "local law decides the form of the guarantee".
Bottom band: a central box [Guarantee program] containing [Exposure registry: one record per guarantee], [Reserve: program-held stable asset], [Coverage gate], [Claim state machine].
Arrows into the program: orange from operator ("register, file, pay, settle; capped"), blue from [Admin multisig + time lock] ("ceilings, c, approvals by amount"), red from [Pauser and guardians] ("pause; no time lock"), green from [Capital providers] ("deposit and redeem through a FIFO queue"), grey from [Anyone] ("recompute").
Dashed line between bands labelled "only amounts, timestamps, opaque ids and salted hashes cross this line".
Return arrow from the reserve up to the beneficiary: "claim payment, never coverage-gated".
```

### 3.2 Exposure, provisions and required coverage

Each guarantee `g` is an on-chain record with a fixed **cover**: the ceiling of what the guarantor can owe under it, fixed at registration and never raised afterwards ([ADR 0006](decisions/0006-per-lease-absolute-coverage.md)). A cover can be split into **legs**, sub-limits for different kinds of debt; MUTAV's v1 uses two (§9 gives the first deployment's meaning). As claims are paid, the **remaining cover** falls:

```text
remaining_cover(g)    = Σ over legs (leg_cover − leg_paid)
remaining_cover_total = Σ remaining_cover(g)      over guarantees not closed
```

A **provision** is a claim the guarantor has approved but not yet paid. It is booked at filing and lowers the reserve's net asset value at once, before any money moves, so capital providers can never enter or leave at a value that ignores a known loss. A provision sits inside the guarantee's remaining cover, so filing it does not change the reserve's required coverage.

**Required coverage** is how much of the reserve must stay in place for the book as it stands. It has two terms: a governed share `c` of all remaining cover, and a floor of the open provisions plus a **stress buffer** for the next claims that could arrive (§4).

The reserve's **surplus**, also called free capital, is whatever it holds above required coverage. Surplus is the only money that can back new exposure or leave the reserve.

### 3.3 The coverage gate

The coverage gate is one rule: **an action that adds exposure or moves capital out must fit in the surplus computed before it.** In MUTAV's program two instructions are gated: registering a guarantee (its cover times `c` must fit) and filling a redemption (the assets paid out must fit) ([ADR 0005](decisions/0005-solvency-gate-scope.md)). There is no instruction that withdraws surplus to the guarantor; capital leaves only as a redemption at NAV, through the queue.

Everything on the claim path is outside the gate: filing, approving, paying and settling claims, as well as receiving fees and closing guarantees. A pause does not stop it either. If claims exceed what `c` anticipated, the reserve pays them anyway, until it has no liquid assets left, and enters **under-coverage mode**: new exposure and redemptions freeze, while claims, fees and new capital keep flowing. The gate decides who may take money out of the reserve. It never decides whether a beneficiary gets paid.

### 3.4 Claims as a state machine

Each claim is its own on-chain record, keyed by the guarantee and an opaque notice reference, so it is idempotent and publicly addressable. Its states are:

```text
FILED ──pay──▶ PAID ──settle──▶ SETTLED
  │
  └─amend to 0──▶ WITHDRAWN ──refile──▶ FILED          (amend and refile: first upgrade)
```

- **Filed.** The guarantor has approved the claim off-chain; the operator books it as a provision on one leg, at most that leg's free cover.
- **Approved (above the per-call cap).** The admin approves the exact amount, bound to the claim's revision number. Any later amendment bumps the revision and voids the approval.
- **Paid.** The program sends exactly the provision, once, to a fixed payments account.
- **Settled.** The operator records a hash of the off-chain payment proof that reached the beneficiary, and its time.

§5 explains each step and the caps around it.

### 3.5 What stays off-chain, and what goes on-chain

**Table 2. The on-chain/off-chain line**

| Off-chain (guarantor, operator, local law) | On-chain (public program) |
|---|---|
| Identity of obligor, beneficiary and intermediaries; KYC | Opaque ids for guarantees and distributors; a Merkle root for the capital-provider allowlist |
| Underwriting and credit assessment; pricing | Each guarantee's cover per leg, paid and provisioned amounts, status, timestamps |
| The legal contract and its evidence | A hash of the references (`refs_hash`); later, a hash of the signed cap schedule |
| Claim review and its documents | Each claim's amount, leg, revision, approval and timestamps; an opaque notice reference |
| The off-chain payment to the beneficiary | A hash of the payment proof and its time |
| Invoices to whoever pays the fees | One fee receipt per paid bill, keyed by a keyed hash of the invoice reference |

This is **data minimisation** by design ([ADR 0019](decisions/0019-v1-layout-for-the-devnet-release.md)). A public ledger is permanent; personal data on it would be permanent too. Salted and keyed hashes let each counterparty find and verify its own records, given the preimage, while the public cannot link records to people.

### 3.6 Protocol and legal wrapper

The protocol is a ledger plus rules. It does not decide what a guarantee is in law. That is the job of the **legal wrapper**: the contract between guarantor and beneficiary, governed by local law, and the local entity that signs it.

Local law decides several things the protocol cannot: whether the promise is a personal guarantee, a surety bond, a bank guarantee or an insurance product; who may give it; what the ceiling must include; and when the guarantor may walk away. Each deployment therefore needs a **local operator**, a legal entity that signs as guarantor under local law and runs the operator role. Where the law offers a choice, the form matters. A suretyship (a personal guarantee given by the guarantor itself) is generally a different legal object from insurance (a pooled transfer of risk to a licensed carrier). The protocol can serve the first without becoming the second, provided the wrapper keeps the guarantor as the party liable and its own capital as the backing (§11 discusses the recharacterisation risk).

The protocol stays the same across wrappers. What changes per market is the wrapper, the stable asset the reserve holds, the payment rail, and the parameters (§10).

### 3.7 Model invariants

A conforming implementation keeps these properties after every instruction. MUTAV's test plan asserts each of them ([invariants](security/invariants.md)).

1. **Registered exposure.** Every guarantee has exactly one on-chain record; its cover never changes after registration; on each leg, paid ≤ cover and provision ≤ cover − paid.
2. **Tracked assets.** Reserve assets are the program's tracked balances, never raw token balances, so a direct transfer cannot move NAV or coverage.
3. **The gate.** New exposure and capital exits fit within the surplus computed before them.
4. **Unblocked claims.** The coverage gate, the pause and price checks never refuse a claim payment. Only the claim's own checks, the operator caps, liquid assets or a frozen reserve account can stop it.
5. **Exact payment.** A claim payment equals its provision, goes only to the configured payments account, and happens at most once.
6. **Early loss.** A provision lowers NAV, never the reserve's assets, so nothing is counted twice against coverage; and no capital fill lowers NAV per share.
7. **Separation.** The operator cannot fill capital requests or change ceilings; the admin cannot register guarantees or file claims.

---

## 4. Coverage and capital

### 4.1 Required coverage

Anyone can recompute every quantity below from public accounts ([spec §4](spec.md#4-invariants-and-formulas)). Amounts are base units of the reserve's stable asset (6 decimals), math is in 128-bit integers, and rounding favours the reserve.

```text
stable_assets      = tracked stable-asset balance (+ adapter positions at a bounded price, later)
unprovisioned      = max(0, remaining_cover_total − provisions)
coverage_required  = max( ceil(c × remaining_cover_total),
                          provisions + min(stress_buffer, unprovisioned) )      0.10 ≤ c ≤ 1.0
surplus            = max(0, stable_assets − coverage_required)                  = free capital
liquid_budget      = max(0, stable_balance − provisions)
net_assets         = max(0, stable_assets − provisions)
NAV per share      = net_assets / shares_outstanding
```

`c` is the share of remaining cover the reserve must hold in stable assets. It is a governed parameter that only the time-locked admin changes, within a program floor of 0.10 ([ADR 0016](decisions/0016-coverage-ratio-below-one.md)) and a ceiling of 1.0 ([ADR 0022](decisions/0022-coverage-stress-buffer-underwater-reserve.md)).

The **stress buffer** reflects how claims arrive. Under most guarantees they come one event at a time (a missed payment, an unpaid invoice, an exit bill), so the near-term demand on the reserve is the claims that could be filed next, not the whole book at once. Required coverage therefore never falls below open provisions plus `stress_buffer`, an amount the admin sizes from the book (for example the largest few claims it could face next), capped by what remains unprovisioned. Filed claims stay fully covered at any `c`; on a small book the buffer dominates, and on a large one `c` × cover does.

```figure id="fig-2-coverage" title="Figure 2. Balance sheet and the coverage gate"
Two vertical stacked bars on a common baseline.
Left bar "stable_assets": bottom segment "stable asset (at par)", top segment "adapter asset (later; bounded price)". A hatched slice at the top labelled "provisions (NAV-only deduction)"; bracket "net_assets = stable_assets − provisions".
Right bar "coverage_required = max(c × remaining cover, provisions + buffer)", shorter than the left bar.
Gap between the tops shaded "surplus = free capital"; arrow into it "new guarantees / redemption fills draw from here".
Arrow from the stable segment out to the right: "claim payments draw from stable assets — never coverage-gated".
Inset, right, titled "Same book, two values of c (to scale)": bar A "c = 1.0: reserve holds all remaining cover"; bar B "c = 0.25: reserve holds a quarter", with a dashed segment above it labelled "guarantor's own balance sheet (disclosed, not in NAV)".
```

### 4.2 Why `c` below 1 can be sound, and what it trades off

At `c` = 1 the reserve holds every guarantee's whole remaining ceiling. Even if every guarantee were claimed in full at once, the reserve could pay from its own assets. That is the simplest promise to verify, and it is capital-heavy: each unit of capital backs one unit of cover.

Most guarantee books are not claimed in full at once. A ceiling is a legal maximum, set to cover the worst single case; the losses a book actually produces are a small fraction of its ceilings in a normal year and a larger fraction in a bad one. Sizing a reserve to expected losses plus a tail year, rather than to the sum of ceilings, is how guarantors generally operate. At `c` = 0.25 each unit of free capital backs four units of cover.

The trade-off is explicit:

- **Below `c` = 1, a claim payment reduces surplus.** Each payment lowers surplus by `(1 − c)` times its amount, since it uses assets while releasing only `c` of the cover it consumes. A wave of correlated claims can therefore push the reserve into under-coverage. Claims are still paid, and they can draw liquid assets to zero.
- **The guarantor's own balance sheet carries the rest of the legal ceiling.** The beneficiary's claim is against the guarantor, so whatever the reserve cannot pay remains the guarantor's debt. That backstop is off-chain and must be disclosed as such; it never counts in reserve assets or NAV ([ADR 0024](decisions/0024-unsolicited-money-and-backstop.md)).
- **The floor bounds how thin the reserve may run.** The program refuses `c` below 0.10, and the stress buffer keeps filed claims plus the next likely claims covered at any `c`.

The value of `c` is therefore a disclosure as much as a parameter. A reader who sees `c`, the remaining cover, the provisions and the reserve, all on-chain, knows how much of the promise is held in the reserve and how much rests on the guarantor's balance sheet. Any published figure should be read against both maximum exposure and a tail year, because either alone misleads.

### 4.3 NAV and exits gated by coverage

Reserve capital is recorded as shares of a program-owned SPL mint. NAV is computed by the program from tracked balances, never pushed by an admin ([ADR 0004](decisions/0004-onchain-nav-internal-accounting.md)), and excludes pending deposits, assets owed to exiting providers and the operator's fee take. A virtual share offset blocks first-depositor inflation.

Deposits and redemptions are asynchronous ([ADR 0023](decisions/0023-capital-flows-and-exit-rights.md)). A capital provider escrows its stable asset or its shares with `request_deposit` or `request_redeem`, optionally with a price limit, and the admin fills requests in strict FIFO order, at most 8 per call, at the NAV of each fill and inside a NAV range it reviewed when proposing the fill. A redemption batch recomputes its budget before every fill:

```text
budget = min(max_assets − assets_paid_in_this_call, free_capital, liquid_budget)
```

So no exit can spend capital that required coverage needs, nor the liquid assets that filed claims need; when there is no surplus, exits wait. In v1 a batch fills whole requests and stops at the first that does not fit; partial fills at the queue head return in the first upgrade ([ADR 0010](decisions/0010-partial-fills-at-queue-head.md)). Exit is a right: a wallet that holds shares can redeem even after it leaves the allowlist. No request can block the queue: its owner can cancel it, and the admin can **park** a head that cannot fill, leaving the funds owed to the owner ([ADR 0030](decisions/0030-admin-cancel-parks-the-request.md)).

If NAV per share falls below the smallest published unit while shares are outstanding, the reserve is **underwater** and both fills refuse, so new capital never pays for old losses ([ADR 0029](decisions/0029-claims-and-capital-rules-in-the-program.md)). In under-coverage mode, deposits still fill, as recapitalisation at a NAV that already reflects the loss. A NAV-move guard halts fills after an outsized move until the admin clears it ([ADR 0015](decisions/0015-admin-clear-fulfil-halt.md)).

### 4.4 A reserve that grows by revenue

Two kinds of revenue enter the reserve without minting shares, so they raise NAV for every holder ([ADR 0009](decisions/0009-separate-mutav-money-flows.md)):

- **Guarantee fees, net of the operator's take.** The operator records each paid bill once with `contribute_fees`, which sends a governed take (`fee_take_bps`, program maximum 30%) to the operator's treasury account and the rest to the reserve. A fee receipt account per bill makes each one count exactly once ([ADR 0007](decisions/0007-fee-take-direct-to-treasury.md)).
- **Partnership revenue from the reserve asset, where present.** Some stable-asset issuers pay partners a share of their revenue. The program gives the reserve an *income inbox* for it; nothing in the inbox counts until the operator sweeps one statement at a time into the reserve with `sweep_income`, with no take ([ADR 0017](decisions/0017-brs-income-intake.md)). It depends on a commercial agreement that can change or end, so no sizing assumes it.

The mechanism is a flywheel in capacity, not a promise to anyone: revenue retained in the reserve raises the surplus, and a larger surplus can back more cover. Reserve shares also absorb every claim payment, so their value can fall as well as rise. MUTAV sets no return target and makes no return projection.

Money sent outside these paths moves nothing: tracked accounting ignores it, and it is held apart for the admin to book or return ([ADR 0024](decisions/0024-unsolicited-money-and-backstop.md); those instructions ship later). Every unit in the reserve traces to a fee or income receipt or a deposit request.

---

## 5. Claims lifecycle

```figure id="fig-3-claim-lifecycle" title="Figure 3. Claim lifecycle"
Sequence diagram, six lanes: Beneficiary | Operator platform | Operator key | mutav program | Payments account | Payment rail.
1. Beneficiary: "obligation missed (T0)" -> platform.
2. Operator -> program: flag_claim_notice (dashed, "later"). Note: "claim-notice gate (later): capital queues closed".
3. Beneficiary -> platform: "claim + evidence (recorded off-chain)".
4. Platform: "review and approval".
5. Operator -> program: file_claim(leg, amount). Note: "provision booked; NAV drops; capped by the leg's free cover".
6. Operator -> program: pay_claim. Program -> payments account: "stable asset". Note: "pays exactly the provision; claim = Paid". Side note: "above the per-call cap: admin approve_claim of the exact amount (time-locked); the guarantor may pay first and be reimbursed".
7. Operator -> program: close_claim_notice (dashed, "later").
8. Payments account -> rail -> beneficiary: "off-chain payment".
9. Operator -> program: settle_payout(notice_ref_hash, proof hash). Note: "Settled; payment proof hash and time recorded".
Bracket over steps 6–9: "on-chain record: pay_claim -> settle_payout". Every on-chain step carries a badge "not coverage-gated".
```

**File.** The guarantor reviews the claim and its evidence off-chain. On approval, the operator calls `file_claim(leg, amount, notice_ref_hash)`, which creates the claim record and books a provision on one leg, at most that leg's cover not yet paid or provisioned. Several claims can be open on one guarantee at once; together they still cannot exceed the leg's remaining cover ([ADR 0014](decisions/0014-pay-claim-bound-with-concurrent-filings.md)). NAV drops at filing; required coverage does not change.

**Approve, with separate roles.** A claim at or below the per-call cap (`max_claim_per_call`) needs no further approval. Above it, the admin multisig calls `approve_claim` for the exact amount, bound to the claim's current revision ([ADR 0021](decisions/0021-claims-approval-amendment-exact-payment.md)). The admin approves an amount, never the merits: the merits are the guarantor's judgement, recorded off-chain. Because the approval names a revision, an amendment after approval voids it, so an approval can never be reused for a different claim or amount. While the approval waits on the time lock, the guarantor may pay the beneficiary from its own funds and be reimbursed by the reserve once the approval exists.

**Pay exactly the provision.** `pay_claim(notice_ref_hash, expected_amount)` sends exactly the claim's provision from the reserve to the configured payments account, which the operator cannot own. The caller states the amount it expects, and the program refuses any mismatch. It applies no coverage, mode, pause or price check. It refuses only when there is no filed claim for that notice, the expected amount differs, the leg's remaining cover is short, the amount is above the per-call cap without a matching approval, the sliding window would be exceeded, liquid assets are short, or the reserve account is frozen. To pay less, the operator first amends the claim down (`amend_claim`, first upgrade); a payment never silently differs from what was filed.

**Settle.** The payments account converts and pays the beneficiary off-chain, on whatever rail the market uses. The operator then calls `settle_payout`, which records a hash of the payment proof (in v1 the argument is `pix_e2e_hash`, named for the first deployment's rail) and the time on the same claim record. The counterparties, who hold the preimage, can verify it; the public sees that a payment was claimed and when. The program sets no payout deadline ([ADR 0019](decisions/0019-v1-layout-for-the-devnet-release.md)); the service level is measured from the `ClaimPaid` and `PayoutSettled` event timestamps.

**Sliding window caps.** Besides the per-call cap, the program caps the total paid over any 31 consecutive days (`max_claim_per_period`), counted in 31 daily buckets, approved payments included. For an unusually large approved claim, the admin raises the window cap in the same proposal.

**The operator's worst case.** The only irreversible operator action is `pay_claim`. So the most a stolen or misused operator key can take from the reserve is a number the admin sets in advance: the period cap, paid only into the guarantor's own payments account. Five controls bound it: that fixed destination, the per-call cap with the admin's approval above it, the sliding window, the per-guarantee cover cap, and immediate revocation by the pauser. Every other operator action can be corrected by another operator action: a false registration by closing it as `VOID` today, and a wrong close or filing by `reinstate_guarantee` and `amend_claim` in the first upgrade. **The caps limit the rate of loss, not what the guarantor owes.**

**Ending a guarantee.** `close_guarantee` takes a reason: `RELEASED` once no claim is open, or `VOID` for a guarantee that never took effect, with nothing paid. A close releases the cover from required coverage; the record stays on-chain as public history. A designed lifecycle with an end-of-obligation record and a claims tail, during which cover stays counted, is carved for a later upgrade ([ADR 0012](decisions/0012-fianca-aligned-guarantee-lifecycle.md)).

**Claim-notice gate (designed).** The operator will flag a notice at the first missed obligation, and while any notice is open both capital queues stay closed, so nobody enters or leaves at a NAV that misses a known loss. v1 does not have it; it is built before any outside capital.

---

## 6. Governance and separation of powers

**Table 3. Roles and powers in the v1 program**

| Role | Key custody | Powers | Time-locked? |
|---|---|---|---|
| Admin | Squads v4 multisig, short time lock | `set_config` (caps, `c`, stress buffer, take), role proposals, guardians, money accounts, allowlist root, `approve_claim`, `fulfil_deposits`, `fulfil_redeems`, parking requests, clearing the fill halt, `pause`, `unpause`, `revoke_operator` | Yes, every action |
| Upgrade authority | A second Squads v4 multisig, same members, long time lock | Program upgrades, `initialize` | Yes |
| Operator | Hot key run by the guarantor's platform | `register_guarantee`, `close_guarantee`, `contribute_fees`, `sweep_income`, `file_claim`, `pay_claim`, `settle_payout` | No; bounded by caps |
| Pauser | Separate key | `pause`, `revoke_operator` | No |
| Guardians | Up to 3 keys appointed by the admin | `pause` only | No |
| Capital provider | Own wallet, allowlisted by Merkle root (KYC off-chain) | Request, cancel and claim deposits and redemptions | No |
| Anyone | — | `refresh`, `advance_queue_head` | No |

**Two multisigs, two clocks.** The admin multisig holds the reserve's parameters with a short time lock, so redemption fills and large claim approvals do not wait as long as code changes. The upgrade multisig holds the program's upgrade authority with a long time lock, so code can only change after public notice. The first deployment plans 24 hours and 7 days; on devnet the floors are 5 minutes and 1 hour, and the current test deploy runs 60 and 120 seconds as a stated test exception. Deploy scripts check each multisig's members, threshold, time-lock floor and configuration authority.

**Pause without blocking claims.** A pause stops capital flows and new guarantees only. The claim path (filing, approval, payment, settlement), fees, closes, cancels, role changes and `refresh` stay open, so beneficiaries are paid and records can be corrected during an incident. The pauser revokes the operator at once; appointing a replacement is a time-locked admin proposal, and the pauser never appoints.

**Two-step handover.** Every role changes hands in two steps: the admin proposes a key, and that key must accept within 72 hours, so a mistyped key never takes a role. Governance can move to independent parties (for example an independent pauser) by rotating keys, without new code. Distinct keys are not independent parties, though: in the first deployment one organisation holds every key, and the public, time-locked record, not the keys, is what lets outsiders check it.

**The Drift lesson.** A multisig is only as strong as what its signers agree to sign. In April 2026 Drift, a Solana perpetuals exchange, lost about $280–285M after attackers obtained pre-signed durable-nonce transactions from its admin multisig signers and used them to take over admin control ([BlockSec](https://blocksec.com/blog/drift-protocol-incident-multisig-governance-compromise-via-durable-nonce-exploitation); [Halborn](https://www.halborn.com/blog/post/explained-the-drift-hack-april-2026)). A durable nonce lets a signed transaction stay valid indefinitely, so a signature collected for one purpose can be replayed later. MUTAV's signers decode every instruction before approving and never pre-sign with durable nonces; admins sign from their own wallets, with hardware keys before real money. The time lock adds a second line: any admin action, however it was signed, is public before it executes.

```figure id="fig-4-governance" title="Figure 4. Governance and upgrade path"
Upgrade path: [Verified build (solana-verify)] -> [Buffer account (hash = build hash)] -> [Squads proposal: upgrade + IDL + verify PDA] -> [Time lock, announced on the transparency page] -> [Execute] -> [Smoke checks].
Enabling a feature: [Proposal 1: upgrade adds feature to SUPPORTED_FEATURES] -> [Time lock] -> [Observation period, feature off] -> [Proposal 2: set_config sets flag bit] -> [Time lock -> flag on].
Emergency: [Pauser key] -> [mutav program] "pause, no time lock"; "capital flows stop; claim-payment path stays open".
```

---

## 7. Verifiability

The point of the protocol is that outsiders can check it. Five things make that possible.

**Open source.** The program, the TypeScript client and the tests are MIT-licensed in [mutav-finance/mutav-protocol-solana](https://github.com/mutav-finance/mutav-protocol-solana). Every rule in this paper is in the [spec](spec.md) and in an architecture decision record in [docs/decisions](decisions/). The client composes instructions and holds no keys.

**Verified builds.** Release builds are produced with `solana-verify`, so anyone can rebuild the program from a tagged commit and compare the hash with the bytecode on-chain. A verified build is a **source match**: it proves which code is running, not that the code is correct. It is not an audit. The current devnet program is a test deploy of commit `833c114` under its own program ID, and its on-chain hash matches that build; the `solana-verify` release build is still to come (§12).

**Public state and a transparency page.** Every guarantee, claim, fee receipt and capital request is its own account at a deterministic address (a PDA), so each is idempotent and publicly addressable. Anyone can call `refresh` to recompute coverage, surplus and NAV from public accounts at any time. The pilot app at [reserve.mutav.finance](https://reserve.mutav.finance) reads the devnet reserve and shows these figures from program state, not from a database.

**Events and receipts.** Every token movement and state change emits an event through `emit_cpi!` (for example `GuaranteeRegistered`, `FeesContributed`, `ClaimFiled`, `ClaimApproved`, `ClaimPaid`, `PayoutSettled`, `ModeChanged`, `ConfigUpdated`), so an indexer can rebuild the history. Fee and income receipts are never closed: each paid bill leaves a permanent, single record.

**Invariants and property tests.** The LiteSVM suite asserts the model's invariants (§3.7) after instructions, with golden layout fixtures and an `idl-compat` CI check. A property test fuzzes the reserve below required coverage and `c` from 0.10 to 2.0 (beyond the program ceiling, as a margin) and asserts that `pay_claim` is never refused by the coverage gate; another asserts the same for approved claims above the per-call cap, under-coverage and the pause included; a third checks the 31-day window against a naive oracle.

**Table 4. What the chain proves, and what it doesn't**

| The chain proves | The chain does not prove |
|---|---|
| The reserve's tracked balances | That an obligor, beneficiary or default exists (only hashes are stored) |
| Each guarantee's cover, and the amounts paid and provisioned per leg | That a claim was correctly approved |
| Required coverage, surplus and NAV, recomputable by anyone | That every guarantee the guarantor wrote is registered |
| Every fee split between reserve and treasury, one receipt per paid bill | Fees billed but not yet recorded |
| That each claim payment equalled its provision, went only to the payments account, and stayed within the caps or had the admin's approval of the exact amount | That the off-chain payment reached the beneficiary (only a hash its counterparties can check) |
| Filing, payment and settlement times | When the beneficiary actually made its claim |
| FIFO order, every fill price, every parked request, every configuration and role change | That stable-asset issuers hold the assets behind their tokens; that the guarantor's backstop is funded |

**The weak point is liabilities, not assets.** The chain proves what the reserve holds and enforces the gate. The guarantor asserts that the registered book is complete. Each beneficiary and intermediary can look up its own guarantee record and confirm it is registered at the right cover; the target is that the legal contract cites the on-chain guarantee id and takes effect only once registered. A periodic external completeness attestation is on the roadmap.

---

## 8. Implementation on Solana

*This section summarises the v1 program. The [spec](spec.md) has the full account layouts, instruction rules, events and errors.*

**Programs.** The protocol has a core program and an adapter interface ([ADR 0002](decisions/0002-core-program-and-capped-adapters.md)): `mutav`, which holds custody, the share mint, NAV, the exposure registry, the coverage gate, the capital queue, roles and claim payments; `mutav-adapter-interface`, a crate fixing what every venue adapter will implement (`deposit`, `withdraw`, `position_value`); and `mutav-adapter-mock` for tests. The v1 binary has no adapter instruction, so nothing can leave the reserve's stable asset. A Codama-generated TypeScript client composes instructions and holds no keys. Built with Anchor 1.2.0 and Solana CLI 4.1.2; tested with LiteSVM, Mollusk and Surfpool.

**Accounts and PDAs.** `VaultConfig` is seeded by the reserve mint (`["config", reserve_mint]`), so the program runs one reserve per mint: each currency has its own reserve, coverage and NAV. Every other PDA includes the config address in its seeds.

**Table 5. Accounts in the v1 program**

| Account | Seeds | Holds |
|---|---|---|
| `VaultConfig` | `["config", reserve_mint]` | Roles and pending handovers, guardians, caps, `c`, stress buffer, take, money accounts, allowlist root, fail-closed feature flags |
| `VaultState` | `["state", config]` | Tracked balances, `remaining_cover_total`, provisions, cached required coverage, shares, NAV guard, queue heads, mode, the 31 daily claim buckets |
| Vault authority | `["authority", config]` | PDA signer for the reserve and mint authority of the share mint |
| Share mint | `["share_mint", config]` | SPL mint of reserve shares |
| Token accounts | `["reserve" \| "pending_deposits" \| "pending_redemptions" \| "claims" \| "unsolicited", config]` | Liquid reserve; escrowed deposits; escrowed shares; assets owed to exiting providers; untracked money |
| Income inbox | The vault authority's associated token account | Issuer partnership revenue before `sweep_income`; never counted |
| `Guarantee` | `["guarantee", config, id]` | One per guarantee: opaque distributor id, `refs_hash`, cover per leg, paid and provisioned amounts, status, close reason |
| `IncomeReceipt` | `["fee", config, invoice_ref_hash]` or `["income", config, income_ref_hash]` | One per paid bill or issuer statement, counted once, never closed |
| `ClaimFiling` | `["claim", guarantee, notice_ref_hash]` | One per claim: leg, provision, revision, approved amount, payment, settlement hash and time |
| `DepositRequest` / `RedeemRequest` | `["deposit" \| "redeem", config, seq]` | FIFO position, amounts, price limit, status (pending, filled, parked) |

Reserve balances are split across separate token accounts, so a freeze of one does not trap every balance; `refresh` counts a frozen reserve account as zero, which shows as under-coverage. The vault authority signs for the reserve; once adapters ship, each will act only through its own capped sub-authority PDA, and the core will reload every vault account after each CPI and reject any change other than the expected one.

**Instruction set.** The v1 program has 34 instructions:

- *Admin and roles (17):* `initialize`, `set_config`, `propose_role`, `accept_role`, `propose_admin`, `accept_admin`, `cancel_pending`, `set_guardians`, `revoke_pauser`, `set_payments_account`, `set_treasury_account`, `set_allowlist_root`, `clear_fulfil_halt`, `pause`, `unpause`, `revoke_operator`, `approve_claim`.
- *Book and claims, operator (7):* `register_guarantee`, `close_guarantee`, `contribute_fees`, `sweep_income`, `file_claim`, `pay_claim`, `settle_payout`.
- *Capital (8):* `request_deposit`, `cancel_deposit`, `fulfil_deposits`, `claim_shares`, `request_redeem`, `cancel_redeem`, `fulfil_redeems`, `claim_assets`.
- *Public (2):* `advance_queue_head`, `refresh`.

**Token guard.** The program accepts a reserve mint only if it is a classic SPL mint or a Token-2022 mint without extensions that could take, block or reinterpret the reserve's balances: it rejects PermanentDelegate, TransferHook, a non-zero TransferFee or a transfer-fee authority, NonTransferable, a default-frozen account state, Pausable, InterestBearing and ScaledUiAmount, and requires 6 decimals. Mints are allowlisted by address, never by symbol, because impostor tokens exist.

**A frozen v1 layout with room to grow.** Every account carries a version and zeroed padding sized for the features already planned, so each later feature is carved from padding or added as a new account, never a migration ([spec §14](spec.md#14-upgrade-readiness)). Since the `v1.0.0-devnet` release, CI refuses any interface change that is not append-only. Feature flags fail closed: a feature the binary does not support cannot be switched on by configuration alone.

**Compute and cost.** No instruction iterates over guarantees: aggregates such as `remaining_cover_total` and provisions are updated incrementally, so every instruction's cost is independent of book size. Capital fills run in batches of at most 8, and a full batch fits the default compute budget, which a regression test guards. Adapters will make one level of CPI. The larger cost is rent-exempt deposits, about 0.0035 SOL per `Guarantee` and 0.0019 SOL per fee receipt (our estimates; benchmarks to follow). Off-chain payment rails, not the chain, set the pace of payment.

---

## 9. First deployment: rental guarantees in Brazil

The first deployment of the protocol is rental guarantees in Brazil. This section shows how the model maps onto it; the [Brazil pilot paper](pilot/brazil-pilot.md) has the legal analysis, capacity, economics, regulatory perimeter and start conditions.

**Why rent.** Brazilian rental law lets a landlord ask for exactly one guarantee per lease, so that one guarantee is the landlord's only protection. The common options today are slow to pay, opaque about their reserves, or both, and real-estate agencies that run leases often front the landlord's rent while they wait for the guarantor. A guarantee whose reserve and payment record are public addresses that directly.

**The legal wrapper.** The guarantee is a *fiança*, a personal guarantee under Brazilian law, not insurance; the local operating company acts as guarantor. Each guarantee is one `Guarantee` record whose two legs are sub-limits of the fiança's ceiling: a default leg for rent and charges in arrears, and an exit leg for the tenant's liquidated debts at the end of the lease. The obligor is the tenant, the beneficiary is the landlord, and the agency distributes the guarantee and collects the fee with the rent. The reserve holds a BRL stablecoin, and claim payments reach landlords through the agency on the local instant-payment rail, whose end-to-end id is the settlement hash.

**An example configuration.** The founders set the devnet values, which are also the planned pilot values, in [ADR 0028](decisions/0028-pilot-parameters.md). They are configuration, not a capital plan:

| Parameter | Value |
|---|---|
| Coverage ratio `c` | 0.25 (program floor 0.10) |
| Stress buffer | R$19k |
| Reserve cap (`max_tvl`) | R$1M |
| Cover per guarantee (`max_cover_per_guarantee`) | R$120k |
| Operator claim caps | R$15k per call; R$20k over any 31 days (about 2% of the reserve cap) |
| Operator take on fees (`fee_take_bps`) | 20% to start (program maximum 30%) |
| Time locks (admin / upgrade) | 24 hours / 7 days |

**Traction, as counts.** 19 agencies have signed non-binding letters of intent after seeing the platform. None is a customer yet, and no live guarantee has been issued. The reserve is not open to public investment.

---

## 10. Generalising: what changes per market

The protocol separates what is universal about a guarantee from what is local.

**Table 6. What stays the same, and what changes**

| Stays the same in every deployment | Changes per market |
|---|---|
| The exposure registry: one record per guarantee, with a fixed cover and legs | The legal wrapper: the form of the guarantee, who may give it, what the ceiling includes, how it ends |
| The coverage gate and the required-coverage formula | The stable asset the reserve holds, and its issuer |
| The claim state machine: file, approve by amount, pay exactly, settle against a proof hash | The payment rail, and therefore what the settlement hash is a hash of |
| Separation of powers: operator, time-locked admin, pauser, guardians, two-step handover | The parameters: `c`, stress buffer, caps, take, time locks |
| Data minimisation: financial facts on-chain, people and documents off-chain | The local operator, its licences and its data-protection duties |
| Verifiability: open source, verified builds, events, recomputable state | The meaning of the legs, and which debts each covers |

**One reserve per currency.** Because `VaultConfig` is seeded by the reserve mint, one deployment of the program can run one reserve per stable asset, each with its own coverage and NAV. A guarantee always matches its reserve's currency, so required coverage carries no exchange-rate risk. A USD reserve, for example, could serve markets where USD-denominated obligations are legal. Where local law requires obligations in the local currency, the reserve must hold a stablecoin in that currency, and its availability, issuer and freeze policy become part of the market's risk.

**What v1 does not do yet.** In v1 each reserve holds exactly one stable asset, valued at par, and the program reads no price. Holding other assets, such as tokenized government bonds, needs capped adapter programs, a bounded price read, a liquidity floor in the stable asset so claims never wait on a sale, and admin-executed rebalancing. That design is [ADR 0027](decisions/0027-multi-asset-adapters-liquidity-floor-rebalancing.md), which is **proposed**, not decided, and none of it is in the v1 binary.

**What a new market needs.** A local operator able to act as guarantor under local law; a legal opinion on the form of the guarantee and on whether the reserve's capital structure keeps it outside insurance or collective-investment rules; a stable asset that passes the token guard, with on- and off-ramps deep enough for claim payments; a payment rail with a verifiable proof of payment; and parameters set from local loss data, published before the first guarantee.

---

## 11. Risks and limits

The protocol is new, upgradeable software that has had internal reviews but **no independent audit**. The [Important notice](#important-notice) applies to the whole paper. The program's [known limitations](security/known-limitations.md) list each deferred feature.

**Software risk.** The program runs on devnet only. Before the layout froze it went through five parallel adversarial reviews, a review against the published audits of a comparable Solana program, an OWASP Smart Contract Top 10 (2026) pass and a simplification review ([ADR 0026](decisions/0026-program-simplification-for-the-freeze.md)). A first internal security audit of the fixed code followed on 2026-10-11, and every confirmed finding is fixed, among them a High (a holder able to wedge the redemption queue by breaking its own token account, fixed by parking, [ADR 0030](decisions/0030-admin-cancel-parks-the-request.md)) ([reviews and audits](security/reviews-and-audits.md)). No independent audit has been done. Bugs could lock or misdirect funds; caps, the pause, the tests and the reviews limit the damage. An upgrade can change any rule in this paper, including those that protect capital providers; the time lock gives notice, not a guarantee.

**Stable-asset issuer and freeze risk.** A reserve valued at par inherits its issuer's backing and redemption risk. Many stablecoin mints have a freeze authority: an issuer that freezes the reserve's token account stops claim payments from it, and `refresh` then counts it as zero, but the guarantor's obligation stands and the backstop carries it. A frozen payments account stops `pay_claim` until the admin replaces it. A thin on-chain market for the stable asset means no venue could absorb a forced sale, which is why exits are asynchronous and gated.

**The limits of an oracle-free design.** v1 reads no price and no off-chain feed. That removes oracle manipulation, and it also means the program cannot know that a default happened, that a beneficiary was paid, or what an asset is worth beyond par. Every such fact enters as an operator assertion, a hash, or not at all. When adapters add priced assets, prices will be bounded by an accrual ceiling, staleness and deviation limits, and `pay_claim` will never read a price.

**Operator trust.** Beyond the capped payments of §5, a misused operator key can register fictitious guarantees within the caps, close guarantees early (understating required coverage) or file provisions. Each is public, and until the first upgrade a wrong close is final. Recovery follows a runbook: freeze, appoint a new operator, reconcile against off-chain records, and fill no redemptions until that is done ([incident response](security/incident-response.md)). Because the guarantor today holds both the operator key and the admin seats, the claim-notice gate is the program-level control against it exiting ahead of a loss it knows about; until it ships, the runbook files every known claim before any fill.

**Off-chain verification and first loss.** An on-chain ledger is only as true as what is written to it. Credit protocols have learned this the hard way: Goldfinch's write-down of its Stratos pool showed that when the facts about a borrower are verified off-chain by a party other than the capital at risk, transparency on-chain does not stop the loss. The model's answer is alignment rather than more data. The party that underwrites and approves claims is the guarantor itself, it is liable to the beneficiary beyond the reserve, and in the first deployment its own capital is the reserve, so it bears the first loss of its own judgement. Outside capital, if it ever comes, would weaken that alignment, and should come only with the controls below.

**Legal recharacterisation.** Law looks at substance, not labels. A pool of capital from many providers that absorbs many obligors' default risk can be regulated as insurance, or as a collective investment scheme, whatever its contracts call it. The model keeps the guarantor as the only party liable, the fee as the price of the guarantee, and the reserve as the guarantor's own capital; whether that holds in a given market is a question for local counsel before launch, not for the protocol. Regulatory change may force design changes or end a deployment.

**Capital-provider liquidity.** Exits can wait indefinitely: fills are whole in v1, a large request at the head waits for surplus, and nothing is redeemed while the reserve is under-covered or underwater. An approved claim lowers every share's value at filing. Reserve shares are classic SPL tokens on devnet and transfer freely; transfer-restricted shares come before mainnet.

---

## 12. Status and roadmap

**Status (15 October 2026).** The v1 program is live on Solana devnet as release `v1.0.0-devnet`, with its upgrade authority and reserve admin held by Squads v4 multisigs and the pilot app at [reserve.mutav.finance](https://reserve.mutav.finance) reading it. The devnet program [`GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV`](https://explorer.solana.com/address/GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV?cluster=devnet) is a test deploy of commit `833c114` under its own program ID; its on-chain hash matches that build. The ID declared in the code, `8scC79jkU7SPM9v6M4nB833R8EeqKknfwdRdjn73Qqv9`, is reserved for the `solana-verify` release build and is not deployed yet. The spec and ADRs 0001–0030 are written (there is no ADR 0013); ADR 0027 is proposed and the rest are accepted. Program IDs and build hashes are in the [README](../README.md#devnet-addresses).

**First upgrade.** `amend_claim` and `refile_claim`, `reinstate_guarantee`, partial fills at the queue head, and a cumulative NAV-guard baseline. The layout already holds every field these need.

**Before outside capital.** The claim-notice gate and the exit fallback, built together ([ADR 0025](decisions/0025-exit-fallback-cooldown-exit.md)); transfer-restricted shares; and an **independent security audit**, auditor and date not yet chosen.

**Later.** Booking of unsolicited money and the guarantor's disclosed backstop ([ADR 0024](decisions/0024-unsolicited-money-and-backstop.md)); adapters and a second reserve asset (ADR 0027, proposed); the full guarantee lifecycle with an end-of-obligation record and claims tail (ADR 0012); and an external completeness attestation. Caps rise only through the time-locked multisig, after an external audit.

---

## Appendix

### A. Glossary

| Term | Meaning |
|---|---|
| Guarantee | A promise by a guarantor to pay a beneficiary, up to a ceiling, if an obligor does not |
| Obligor / beneficiary / guarantor | The party that owes / the party owed / the party that promises to pay if the obligor does not |
| Cover / leg | A guarantee's fixed ceiling / a sub-limit of it for one kind of debt |
| Remaining cover | Cover minus amounts already paid, per leg |
| Provision | An approved claim not yet paid; lowers NAV at filing |
| `c` | The governed share of remaining cover the reserve must hold (0.10 to 1.0) |
| Stress buffer | An admin-set amount for the next claims, held on top of open provisions |
| Required coverage | `max(c × remaining cover, provisions + stress buffer)`, the buffer capped by unprovisioned cover |
| Surplus / free capital | Reserve assets above required coverage; the only money that can back new cover or leave |
| Coverage gate | The rule that new exposure and capital exits must fit in surplus |
| Under-coverage mode | Reserve assets below required coverage; new exposure and redemptions freeze, claims continue |
| Underwater | NAV per share below the smallest published unit while shares are outstanding; both fills refuse |
| Operator / admin / pauser / guardian | Hot key running the book / time-locked multisig setting ceilings / key that can pause and revoke the operator / pause-only key |
| Parked request | A queued request the admin removed from the head; its funds stay owed to its owner |
| Legal wrapper | The local contract and entity that give a guarantee its legal form |
| PDA / CPI / mint | Program-derived address / cross-program invocation / the account that defines a token |

### B. Parameters

| Parameter | Enforced in | Program bound | First deployment (ADR 0028) |
|---|---|---|---|
| `c` (`coverage_ratio_bps`) | Every gate | 0.10–1.0 | 0.25 |
| `stress_buffer` | Required coverage | At most `max_tvl` | R$19k |
| `max_tvl` | `fulfil_deposits` | Admin-set | R$1M |
| `max_cover_per_guarantee` | `register_guarantee` | Admin-set | R$120k |
| `max_claim_per_call` | `pay_claim`; above it only with `approve_claim` | Admin-set | R$15k |
| `max_claim_per_period` | `pay_claim`, any 31 consecutive days | Admin-set | R$20k |
| `fee_take_bps` | `contribute_fees` | At most 30% | 20% |
| `min_request` / `max_request` | `request_*` | Admin-set; a full exit below the minimum allowed down to a tenth of it | R$1,000 / R$100,000 |
| Fill batch | Both fills | At most 8 requests | — |
| Role handover window | `accept_role`, `accept_admin` | 72 hours | — |
| Admin / upgrade time locks | Squads | Devnet floors 5 min / 1 h | 24 h / 7 days |

### C. Worked example

*Illustrative, in units of the reserve's stable asset. `c` = 1.0, so the stress buffer does not bind. Placeholder fee (10% of the obligation per month) and take (20%). Four guarantees G1–G4 on obligations of 2,000 a month, each with 6,000 of default cover and 12,000 of exit cover; a fifth, G5, on 1,500. The reserve starts with 60,000 of the stable asset and a bond position worth 30,000, included only to show the bounded-price mechanics of a future adapter; v1 holds one stable asset. Two rows show designed features v1 does not have yet: the missed-obligation notice (days 5 and 14) and the partial head fill (day 21); in v1 the day-21 head would wait whole. The day-20 accrual is exaggerated for legibility. The virtual share offset is ignored, so the real program differs by a few base units.*

| Day | Event | Stable | Bond | `stable_assets` | `coverage_required` | Free capital | Provisions | Shares | NAV/share |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Start | 60,000 | 30,000 | 90,000 | 72,000 | 18,000 | 0 | 90,000 | 1.000000 |
| 1 | `contribute_fees` ×2: gross 800, take 160, net 640 | 60,640 | 30,000 | 90,640 | 72,000 | 18,640 | 0 | 90,000 | 1.007111 |
| 3 | Provider A `request_redeem` 10,000 shares | 60,640 | 30,000 | 90,640 | 72,000 | 18,640 | 0 | 90,000 | 1.007111 |
| 5 | G1 misses a payment; notice flagged (queues closed) | 60,640 | 30,000 | 90,640 | 72,000 | 18,640 | 0 | 90,000 | 1.007111 |
| 12 | `file_claim(DEFAULT, 2,000)` | 60,640 | 30,000 | 90,640 | 72,000 | 18,640 | 2,000 | 90,000 | 0.984888 |
| 14 | `pay_claim(2,000)`; notice closed | 58,640 | 30,000 | 88,640 | 70,000 | 18,640 | 0 | 90,000 | 0.984888 |
| 16 | `settle_payout(proof hash)` | 58,640 | 30,000 | 88,640 | 70,000 | 18,640 | 0 | 90,000 | 0.984888 |
| 18 | `register_guarantee` G5: cover 4,500 + 9,000 | 58,640 | 30,000 | 88,640 | 83,500 | 5,140 | 0 | 90,000 | 0.984888 |
| 20 | `refresh`: bond accrues +0.9% | 58,640 | 30,270 | 88,910 | 83,500 | 5,410 | 0 | 90,000 | 0.987888 |
| 21 | `fulfil_redeems`: partial head fill | 53,230 | 30,270 | 83,500 | 83,500 | 0 | 0 | 84,523.675628 | 0.987888 |
| 30 | `contribute_fees` ×2: gross 750, take 150, net 600 | 53,830 | 30,270 | 84,100 | 83,500 | 600 | 0 | 84,523.675628 | 0.994987 |

What it shows: fees raise NAV without minting shares; a claim lowers NAV when filed (day 12), not when paid (day 14), and at `c` = 1 the payment leaves surplus unchanged; a new guarantee consumes most free capital; and the redemption receives only what surplus remains. On day 21, `budget = min(∞, free capital 5,410, liquid budget 58,640) = 5,410`; the head request is worth 9,878.89, so 5,476.324372 shares are burned for 5,409.999999, rounded down in the reserve's favour, and NAV per share is unchanged.

```figure id="fig-5-worked-example" title="Figure 5. The worked example"
Combined chart, days 0–30. Paired bars stable_assets vs coverage_required on each event day (values from the table). Step line: NAV per share on the right axis. Event markers: d1 fee receipts; d5 notice (later); d12 filing (NAV drops); d14 claim payment; d16 settlement; d18 new guarantee G5; d20 bond accrual (exaggerated); d21 partial head fill (first upgrade); d30 fee receipts. Shaded band d5–d14 "queues closed".
```

### D. References

- Nexus Mutual, MCR: <https://docs.nexusmutual.io/protocol/capital-pool/mcr/>
- OnRe: <https://github.com/onre-finance/onre-sol>
- solana-foundation/vault (MIT): <https://github.com/solana-foundation/vault>
- Squads v4: <https://github.com/Squads-Protocol/v4>
- Drift incident, April 2026: BlockSec, <https://blocksec.com/blog/drift-protocol-incident-multisig-governance-compromise-via-durable-nonce-exploitation>; Halborn, <https://www.halborn.com/blog/post/explained-the-drift-hack-april-2026>
- solana-verify: <https://github.com/otter-sec/solana-verifiable-build>
- Solana fees and CPI: <https://solana.com/docs/core/fees>, <https://solana.com/docs/core/cpi>
- Goldfinch, public disclosures on the Stratos pool write-down.
- Internal: [spec](spec.md), [ADRs](decisions/), [security](security/README.md), [provenance](provenance.md), [Brazil pilot paper](pilot/brazil-pilot.md), [acknowledgements](../README.md#acknowledgements).

### E. Document history

| Version | Date | Status | Changes |
|---|---|---|---|
| v0.3 | 2026-10-02 | Draft | The first public version: a technical litepaper for the Colosseum pilot of a BRL rental-guarantee reserve on Solana |
| v0.4 | 2026-10-15 | Internal, unpublished | A Brazil-focused revision aligned with the v1 devnet program and ADRs 0014–0030. Kept in git history; its Brazil-specific content (legal analysis, capacity, economics, regulatory perimeter, start conditions) moved into the [Brazil pilot paper](pilot/brazil-pilot.md) |
| v0.5 | 2026-10-15 | Draft for comment | Reframed as a global protocol paper: a general model of on-chain guarantees (parties, exposure, required coverage, the coverage gate, the claim state machine, data minimisation, the legal wrapper), with MUTAV's Solana program as its implementation and Brazil's rental market as its first deployment |

Every cap and parameter can be changed only by the time-locked admin multisig. Each future version is published with a git tag `litepaper-v0.x` and a GitHub release carrying the Markdown and the self-contained HTML, and every change is listed here.

---

## Important notice

- **Draft for comment.** This litepaper (v0.5, 2026-10-15) is a draft published for feedback. MUTAV (the operating company) is solely responsible for its content, which aims to be fair, clear and not misleading; please report any error (see How to comment).
- **No regulator has reviewed it.** It has not been reviewed or approved by any regulator or supervisory authority in any jurisdiction.
- **Not an offer.** Nothing here is an offer or solicitation to buy or sell securities, fund interests, insurance or any other investment, in any jurisdiction. The reserve is not open to public investment.
- **No return promised.** Nothing here promises or projects a return, income or value to anyone. Figures are configuration values, estimates or illustrations, labelled as such.
- **Forward-looking statements.** Plans, targets, parameters and timelines describe current intentions. They may change without notice and may not happen.
- **Software risk.** The program runs on Solana devnet only. It has had internal reviews, including a first internal security audit on 2026-10-11, and no independent audit. Software can fail, and money held by it can be lost.
- **No advice.** Nothing here is legal, tax or investment advice. Legal positions described here are MUTAV's working positions, under review with counsel.

## How to comment

Open an issue in [github.com/mutav-finance/mutav-protocol-solana](https://github.com/mutav-finance/mutav-protocol-solana/issues) with the label `litepaper`. The comment window is open until 2026-11-15; the next version will then incorporate the feedback, and Appendix E will list what changed.

---

*Draft for comment · v0.5 · 2026-10-15 · not an offer · devnet program, internal review only, no independent audit.*
