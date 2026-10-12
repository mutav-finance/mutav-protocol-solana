# What is MUTAV

MUTAV is a rental guarantor for Brazil whose reserve can't be drained below what its rules say it must back, and whose claim payments are never blocked by the coverage gate or a pause.

This page explains the problem MUTAV addresses and why the reserve lives on-chain.

## Rental guarantees in Brazil

Brazilian rental law (Lei 8.245/91, the Lei do Inquilinato) lets a landlord ask for exactly one guarantee per lease, chosen from the forms listed in art. 37. A second guarantee is void. That one guarantee is the landlord's only protection if the tenant stops paying.

The market is large. In 2024 Brazil had 17.8 million rented households (IBGE, PNAD Contínua).

### The fiança

A *fiança* is a personal guarantee: a third party, the *fiador*, promises to pay the tenant's debts under the lease. A *fiança onerosa* is a paid fiança (art. 37 II). MUTAV acts as an institutional fiador:

- Each guarantee is a **limited fiança**. Its ceiling, the *valor afiançado*, is a fixed R$ amount that includes interest, penalties and court costs.
- MUTAV signs as *principal pagador*: the landlord does not have to pursue the tenant first.
- The landlord is the creditor. The agency receives payments and gives the landlord's receipt (*quitação*) under a mandate from the landlord.
- The tenant pays a monthly **guarantee fee** with the rent. The agency pays MUTAV one consolidated bill a month for all its leases.

Whether this structure stays a fiança, and how some terms bind MUTAV, is under review with counsel (spec §12, Q35 to Q46).

### What fails today

| Option | What the tenant gives up | What fails for the agency or landlord |
|---|---|---|
| Personal fiador | Needs a relative or friend with a paid-off property. | The pool of such guarantors is shrinking. |
| Cash deposit (*caução*) | Up to three months' rent, locked up for the whole lease. | Capped at three months, while an eviction often takes much longer. |
| Fintech guarantor | Little. It is usually the cheapest option. | Opaque reserves. Agencies report unilateral cancellation, slow payment and partial payment. |

The fintech model has already failed at scale. QuintoCred stopped writing contracts in June 2025 and left about 45,000 contracts and 3,000 partner agencies without a guarantor.

MUTAV interviewed seven agency leaders in the South of Brazil. Five of the seven front the landlord's rent themselves while they wait for the guarantor to pay. They cite unilateral cancellation, waits of 60 to 90 days, partial payments and no visibility. These were short discovery interviews and did not test price.

### The insight

Agencies don't distrust guarantees. They distrust guarantors. They front the landlord's rent because they can't see whether the guarantor will pay, or when.

MUTAV keeps the legal form agencies already accept and makes the part they can't see public and bound by rules: the reserve that backs every guarantee, and the record of every claim payment.

## Why an on-chain reserve

The obvious alternative is a segregated bank account with a monthly statement. A program adds things that account can't.

| Property | Segregated bank account | MUTAV reserve on Solana |
|---|---|---|
| Who enforces the backing rule | Nobody between statements. The owner can move money at any time. | The program. Capital leaves only from surplus over what the guarantees need. There is no instruction that withdraws surplus at MUTAV's discretion. |
| How often the state is visible | Once a month, as an aggregate balance. | Continuously. Anyone can call `refresh` and recompute coverage, free capital and NAV from public accounts. |
| Per-guarantee liabilities | Not visible. | Each guarantee's cover, each provision and each claim payment is its own account or event. |
| Limits on the people running it | Internal controls only. | The operator works within caps set by a separate reserve admin, and the admin acts through a time-locked multisig. |
| Claim payments under stress | Depends on the owner. | The coverage gate never refuses a claim payment, and a pause does not stop claims. |

MUTAV argues for Solana on fit, not necessity. The business model does not depend on any one chain. Solana fits because transaction costs are low enough for one record per lease and one fee booking per agency per month, Squads v4 provides time-locked multisig governance, and a BRL stablecoin (BRS, issued by Nora) already exists on Solana.

## What the program does and does not do

| The program does | The program does not |
|---|---|
| Hold the reserve in BRS and track every amount it moves | Price guarantees or assess tenants |
| Record each guarantee's cover and each claim's provision | Decide whether a claim is valid |
| Gate new guarantees and capital exits on required coverage | Hold personal data or lease documents (only their hashes) |
| Pay claims to MUTAV's payments account within admin-set caps | Pay agencies or landlords directly. MUTAV pays them by Pix. |
| Mint and burn reserve shares at an on-chain NAV | Promise a return to capital providers |
| Enforce role separation, caps, pause scope and time locks | Track the contractual payment deadline. That lives in the MUTAV platform. |

Pricing, tenant assessment, claim review and the payment deadline stay in the MUTAV platform, which acts on-chain through the operator key.

## The pilot

The devnet release is the first step. It runs under hard on-chain caps that only the time-locked admin multisig can raise ([ADR 0028](../decisions/0028-pilot-parameters.md): a R$1M reserve ceiling, R$120k of cover per guarantee, claim payments of up to R$15k per call and R$20k per 31 days). The reserve holds BRS only. During the pilot the reserve runs on MUTAV's own capital and is not open to public investment. A capped mainnet pilot with real guarantees follows a security audit.

## Sources

- [Litepaper §1 The problem](../litepaper.md#1-the-problem-rental-guarantees-in-brazil), [§2 MUTAV in one page](../litepaper.md#2-mutav-in-one-page), [§3 Why a chain, and why Solana](../litepaper.md#3-why-a-chain-and-why-solana)
- [Specification §1 Principles](../spec.md#1-principles), [§2.2 MUTAV as fiador: off-chain duties](../spec.md#22-mutav-as-fiador-off-chain-duties-adr-0012), [§12 Open questions](../spec.md#12-open-questions)
- Lei 8.245/91 (Lei do Inquilinato): <https://www.planalto.gov.br/ccivil_03/leis/l8245.htm>
- Código Civil, arts. 818 to 839: <https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm>
- IBGE, PNAD Contínua 2024 (rented households)
- QuintoCred closure, Imobi Report (2025): <https://imobireport.com.br/aluguel/exclusivo-quintoandar-encerra-operacao-do-quintocred-garantia/>
- Nora BRS: <https://www.nora.finance/docs/integrate/core-concepts/brs-token>
- Squads v4: <https://github.com/Squads-Protocol/v4>

## Decisions

- [ADR 0003: Claim payments operated by MUTAV through a whitelisted payments account](../decisions/0003-payments-operated-by-mutav.md)
- [ADR 0004: NAV computed on-chain with internal accounting](../decisions/0004-onchain-nav-internal-accounting.md)
- [ADR 0005: Coverage gate scope](../decisions/0005-solvency-gate-scope.md)
- [ADR 0012: Guarantees aligned with a limited fiança onerosa](../decisions/0012-fianca-aligned-guarantee-lifecycle.md)
- [ADR 0018: BRS-only pilot reserve](../decisions/0018-brs-only-pilot-reserve.md)
- [ADR 0020: Operator/admin separation and operator-compromise recovery](../decisions/0020-operator-admin-separation-and-recovery.md)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md) (removes the on-chain payout SLA)
