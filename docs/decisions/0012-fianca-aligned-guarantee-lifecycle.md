# 0012 — Guarantees aligned with a limited fiança onerosa

- **Status:** accepted (2026-10-02). Amends ADR 0003 (an admin path for claim payments above the operator caps), ADR 0006 (the two legs are sub-limits of one limited fiança; the covers are the legal ceiling) and spec PC-6 (lifecycle). All changes land **before the layout freeze** (plan Task 12), so they change pilot layouts, arguments and events directly instead of adding `_v2` instructions.

## Context

MUTAV's guarantee is a **fiança onerosa** under Lei 8.245/91 art. 37 II, owed **to the landlord** (CC 818). The fiador review (`13-fiador-responsibilities-review.md`) found that the program and the law disagree in several places:

- **Uncapped legal exposure.** An unlimited fiança covers every accessory of the debt, including interest, penalties and court costs from the fiador's citação (CC 822). The on-chain `default_cover + exit_cover` is a hard cap, so `coverage_required` understated the legal liability.
- **Mora from our own caps.** If MUTAV waives the benefício de ordem (CC 827–828) and signs as principal pagador, it falls into mora as soon as a liquid debt is due (CC 397). `pay_claim` can still be refused by the per-call and per-period caps, by low liquid BRS or by an issuer freeze. None of these excuses MUTAV toward the landlord.
- **Payment to the wrong party.** Payment discharges only when it reaches the creditor or its representative (CC 308). The program recorded only the PIX hash. It had no mandate and no quitação.
- **"Exit cover" as eviction funding.** A fiador pays what the tenant owes. It does not fund the landlord's eviction. Exit amounts must be the tenant's **liquidated** debts (CC 821).
- **Life of the guarantee.** A fiança runs until the keys are returned (LI 39) or until an exoneration takes effect, 120 days after notice (LI 40 X). It is extinguished when a limited ceiling is exhausted. `close_guarantee` released cover with no tie to any of these events.
- **Leverage at exhaustion.** While a guarantee is live, the landlord cannot get the 15-day eviction liminar (LI 59 §1º IX). Extinction at exhaustion is the largest lever on exit costs (`12-eviction-cost-south.md` §0, §6).
- **Side deals.** A moratória that the landlord grants without MUTAV's consent releases MUTAV (CC 838 I).
- **Insolvency argument.** A public "under-covered" flag invites the argument that the fiador is insolvent (CC 826, 955; LI 40 II), which lets landlords demand a substitute guarantee across the book.

## Decision

1. **One limited fiança per lease (CC 823).** Its R$ ceiling, the **valor afiançado**, is `default_cover + exit_cover`. The signed instrument states that interest, penalties, charges, court costs and fees are **inside** the ceiling. `register_guarantee` stores the covers as these absolute amounts, together with `contract_cap_hash`, a commitment to the instrument's cap schedule. No instruction changes them afterwards.
   - The two legs stay as **sub-limits** of that one ceiling. They are not separate coverages.
   - Each claim names a **category** of guaranteed debt. The program enforces a category-to-leg map.
2. **Waiver of the benefício de ordem.** MUTAV signs as **principal pagador**. The contractual payment clock starts from a **complete payment request**: the filing records `request_complete_ts`, and the `Payout` copies it. `VaultConfig.payment_term_secs` discloses the contractual term N. The program only records the term. It does not enforce it.
3. **Payout caps must not cause mora.**
   - **Admin path.** `pay_claim_admin` is signed by the admin (Squads). It applies every `pay_claim` rule except the operator's per-call and per-period caps, and it still pays only `payments_account`.
   - **Backstop advance.** MUTAV may pay the landlord from its own funds and be reimbursed by `pay_claim` or `pay_claim_admin` to the same whitelisted `payments_account`, marked `PAYOUT_BACKSTOP_REIMBURSEMENT`.
   - In both paths the reserve never pays more than the remaining cover.
   - We chose an admin-signed variant over an admin co-signature of `pay_claim`, because a Squads vault transaction cannot cleanly carry the operator's signature as well.
4. **The landlord signs and the agency holds a mandate.** `Guarantee.landlord_mandate_hash` is a commitment to the landlord's power for the agency to receive guarantee payments and give quitação. At settlement, `settle_payout` requires a `quitacao_hash` and copies the mandate hash in force onto the `Payout`.
5. **The exit leg guarantees liquidated tenant debts.** Categories:
   - rent and charges until the keys are returned
   - damage beyond normal wear
   - court costs owed by the tenant
   - abandonment and repossession costs
   - other debts listed in the instrument
   - the early-termination penalty (LI 4), as a reserved category that is **disabled** until the inclusion decision is made

   Damage and abandonment claims require that the keys were returned or the unit repossessed. When total paid reaches the valor afiançado, the guarantee becomes **`EXHAUSTED`** in the same `pay_claim`, and `GuaranteeExhausted` is emitted so mutav-app sends the extinction notice. Whether exhaustion counts as "extinção" for the LI 59 §1º IX liminar is a question for counsel.
6. **Lifecycle.**
   - **States:** `ACTIVE`, `EXONERATING`, `LEASE_ENDED`, `EXHAUSTED`, `CLOSED`.
   - **`notify_exoneration`** sets `exoneration_effective_ts = now + 120 days` (LI 40 X).
   - **`record_keys_returned`** records the handover (LI 39).
   - **Claims tail.** Both transitions fix `claims_tail_until_ts = liability_end + config.claims_tail_secs`. The tail length is TBD. While it is `0`, both transitions fail, so the guarantee stays `ACTIVE` with full cover.
   - **`file_claim`** rejects debts accrued after the liability end and filings after the tail.
   - **`close_guarantee`** is allowed only from `LEASE_ENDED` or `EXONERATING` after the tail, from `EXHAUSTED`, or as `VOID` (a lease that never took effect, with nothing paid). In every case `open_claims` must be 0.
   - Remaining cover counts in `coverage_required` in every state except `CLOSED`.
7. **Claim categories** are a `u8` on `file_claim`, `pay_claim`, `ClaimFiling` and `Payout`. `0` means unspecified and is never accepted.
8. **CC 838 I** is an off-chain duty. A payment plan, grace period or waiver agreed with the tenant needs MUTAV's consent in the platform. Without that consent, MUTAV is released for the affected amounts.
9. **Disclosure.**
   - Public surfaces describe under-coverage as "reserve below target; MUTAV backstop active", never as "insolvent" or "uncovered".
   - MUTAV's backstop is disclosed on-chain as a separate layer: `backstop_commitment_hash`, `backstop_amount` and `backstop_reimbursed_total`. It never counts in `stable_assets`.
   - Whether this answers the CC 826 / LI 40 risk is a question for counsel.
10. **Terminology.** Contracts and the UI use pt-BR legal terms: valor afiançado or limite da fiança, pedido de pagamento, pagamento, taxa da fiança. They avoid insurance terms. The English protocol terms stay as they are, and the spec glossary maps them.
11. **Layout.** New fields are carved from the front of `_reserved`. Every one of them reads as zero for "not set" or "off", which is the safe default. Before the freeze, the padding of `Guarantee` grows from 64 to 192 bytes, and the padding of `ClaimFiling` and `Payout` from 64 to 128, so that each keeps room after the carve. New errors and events are appended. The spec's §14.2 holds the budget.

## Consequences

- **The on-chain caps are the fiança's legal ceiling,** as long as counsel confirms that a ceiling including accessories displaces CC 822. `coverage_required` then measures MUTAV's legal exposure on each lease. mutav-app must refuse to register when the arguments differ from the signed schedule.
- **Cover is released later.** Cover stays counted through the exoneration window and the claims tail. Guarantees close later, and capacity for new guarantees grows more slowly.
- **The fail-closed tail.** Until `claims_tail_secs` is set, no guarantee can leave `ACTIVE` except by exhaustion or `VOID`.
- **The admin path widens who can move reserve funds.** It still pays only `payments_account` and stays within remaining cover. The Squads time lock delays it, and the backstop advance covers that delay. One multisig or two (spec §12 Q15) now also affects claim latency.
- **`pay_claim` gains two effects.** It takes a category, and it may set `EXHAUSTED`. Neither adds a solvency or mode check. Its cover bound now also keeps other open filings' provisions, so spec invariant 2 holds when one leg has two filings. The never-refused-for-solvency property test is unchanged.
- **New operator duties:** notifying exonerations, recording key handovers with evidence, obtaining the quitação before settlement, and following the consent workflow for arrangements with the tenant.
- **Pilot accounts get larger,** by 128 bytes for `Guarantee` and 64 bytes each for `ClaimFiling` and `Payout`, at about 0.0009 and 0.0004 SOL of rent per account.
- **Open:**
  - the tail length, the payment term and the termination penalty
  - exhaustion as extinção, CC 822 displacement and the CC 826 risk
  - discharge by payment under the mandate
  - the `VOID` path's limits
  - keeping two legs or only categories

  See spec §12 Q34–Q45.
