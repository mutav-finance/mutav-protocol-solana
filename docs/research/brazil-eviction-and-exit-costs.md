# Eviction and exit costs in South Brazil

> **Research date:** 2026-10-02. **Curated:** 2026-10-10. Prior research by the MUTAV team, kept as written except for the edits noted in the [research index](README.md). Notes headed *Since this research* record later decisions. Not legal or investment advice.

This page asks three questions about the exit leg of a MUTAV guarantee, for the South region (RS, SC, PR) and the Litoral Norte pilot area:

1. How often does a lease end in a court-ordered eviction (*despejo*)?
2. What does an eviction cost the landlord, in months of rent?
3. What does a landlord lose when a tenant leaves **without** an eviction?

Reference rent: **R$2,000 a month**. "×" means multiples of monthly rent.

Evidence tags:

- **[official]**: statute, court data, IBGE, OAB, or an insurer's or garantidora's own contract text.
- **[official, own query]**: CNJ DataJud public API queries run for this research on 2026-10-02.
- **[secondary]**: press, law firms, trade blogs, search summaries.
- **[inference]**: an estimate, with the reasoning stated.

Figures marked *(unverified)* had no source that could be checked.

## Summary

- **Frequency.** Across all South leases, **0.5 to 0.7% of rented households a year face an *ação de despejo***, and roughly a third of those suits end in a court-ordered exit. For an underwritten, agency-managed book in the Litoral Norte of RS and SC, the estimate is **low 0.10%, base 0.25%, high 0.60% per lease per year** of court-ordered exits [inference from official inputs]. That is two to three orders of magnitude below an assumption that every lease end draws the exit leg.
- **Severity.** An eviction that reaches a forced or adjudicated exit consumes **about 90 to 100% of a 6× exit cap** while the guarantor is live, because the 15-day liminar is not available to the landlord [inference].
- **Exits without eviction.** The base case is **about 0.19× monthly rent per lease-year** of unpaid exit costs (about 0.48× per move-out), mostly the early-termination penalty and damage or painting [inference]. Ordinary move-outs settle under 1.5× rent. Market garantidoras cap these exit costs at 3× rent (5× on top tiers) [official].

> **Since this research:** claims are counted as events, not as whole covers at once. A default claim is usually one month's rent and an exit claim is one payment at the end of a lease. The reserve target gains a stress buffer sized from the claims that could be filed next, for example the three largest monthly rents plus one exit payment ([ADR 0022](../decisions/0022-coverage-stress-buffer-underwater-reserve.md)). The coverage ratio `c` stays at its 0.10 floor ([ADR 0016](../decisions/0016-coverage-ratio-below-one.md)).

## 1. Eviction frequency

### Method: CNJ DataJud public API

There is no published CNJ table of evictions per court. *Justiça em Números* reports totals by court, not by procedural class. The research therefore queried the **CNJ DataJud public API** directly ([DataJud public API docs](https://datajud-wiki.cnj.jus.br/api-publica/)), for all 27 state courts, on 2026-10-02 [official, own query]:

- **Scope:** first instance and small claims (`grau` G1 + JE) only, so appeals are not double-counted. Year = year of `dataAjuizamento` (filing date).
- **Strict:** TPU classes 92 *Despejo*, 93 *Despejo por Falta de Pagamento*, 94 *Despejo por Falta de Pagamento Cumulado com Cobrança*.
- **Falta de pagamento (FdP):** classes 93/94, or any case with TPU subject 14915 *Despejo por Inadimplemento* (this catches FdP evictions filed as *Procedimento Comum* or in the Juizado).
- **Broad:** strict, or any case with subjects 14915, 9610 (*uso próprio*), 9612 (*denúncia vazia*) and siblings 9611/9613/9614. This is the headline "eviction filings" figure.
- **Upper bound:** broad, plus subject 9593 *Locação de Imóvel*. This also picks up rent revisions, renewals and collections, so it overstates evictions. Shown only as a ceiling.
- **Data cut-off:** the latest `dataAjuizamento` in TJRS was 2026-09-28. For 2026 the year-to-date figure is annualised by ×365/271 ≈ 1.35. Recent filings are indexed with a lag, so this is a floor.

### South filings per year (broad / FdP / strict) [official, own query]

| Year | TJRS | TJSC | TJPR | **South (broad)** | South FdP |
|---|---|---|---|---|---|
| 2021 | 4,563 / 3,462 / 3,979 | 3,738 / 2,451 / 3,350 | 2,672 / 1,665 / 1,949 | 10,973 | 7,578 |
| 2022 | 6,113 / 4,914 / 5,302 | 5,168 / 4,099 / 4,307 | 4,086 / 3,126 / 2,740 | 15,367 | 12,139 |
| 2023 | 7,094 / 5,829 / 5,751 | 5,655 / 4,353 / 4,665 | 4,888 / 3,665 / 3,438 | 17,637 | 13,847 |
| 2024 | 6,253 / 5,323 / 5,036 | 5,078 / 3,934 / 4,049 | 4,980 / 3,600 / 3,467 | 16,311 | 12,857 |
| **2025** | **6,843 / 5,677 / 5,597** | **5,752 / 4,593 / 4,214** | **5,523 / 3,828 / 4,054** | **18,118** | **14,098** |
| 2026 YTD (to about 28 Sep) | 5,533 / 4,526 / 4,377 | 4,608 / 3,746 / 3,555 | 3,679 / 2,664 / 2,942 | 13,820 | 10,936 |
| 2026 annualised [inference] | ≈7,450 | ≈6,200 | ≈4,950 | ≈18,600 | ≈14,700 |

Upper bound (including *Locação de Imóvel*), 2022 → 2025: TJRS 11,283 → 14,132; TJSC 9,263 → 11,374; TJPR 8,041 → 9,331 [official, own query].

### National filings [official, own query; sum over 27 TJs]

| Year | Strict | FdP | Broad |
|---|---|---|---|
| 2021 | 41,364 | 35,033 | 51,470 |
| 2022 | 52,370 | 49,484 | 67,296 |
| 2023 | 62,895 | 64,302 | 84,141 |
| 2024 | 54,935 | 57,461 | 75,812 |
| **2025** | **65,741** | **67,324** | **89,087** |
| 2026 YTD | 51,911 | 52,901 | 67,262 (≈90.6k annualised) |

TJSP alone accounts for about 40% of the national total (2025 broad: 35,437).

**Trend 2022 to 2026.** Filings rose sharply after the pandemic, with the moratorium (Lei 14.216/2021) lifted in 2022. They peaked in 2023, dipped in 2024 and hit a new high in 2025: South broad was +18% against 2022 and +11% against 2024. The 2026 run-rate is flat to slightly up: RS +9%, SC +8%, PR −10% (likely indexing lag). The 2024 dip in RS matches the May 2024 floods, when court deadlines were suspended. Florianópolis (TJSC) and Porto Alegre (TJRS, 6,058 broad cases 2023 to 2025, about 30% of the state) are the hot spots.

**Data-quality caveats.**

- DataJud depends on each court's feed. Some courts (for example TJDFT before 2024) are visibly incomplete. TJRS, TJSC, TJPR and TJSP look complete. Cross-check: TJSP FdP ≈ 30k a year matches the historical Secovi-SP order of magnitude of about 1 to 1.5k FdP filings a month in the capital alone (unverified).
- TJSC tags only about 60% of cases with a municipality, so municipal SC figures below are understated.
- **Arbitration.** Many agency leases in RS and SC carry an arbitration clause. Arbitral evictions reach DataJud only at the enforcement stage. In TJRS, 44 *Cumprimento de sentença, Lei Arbitral* cases were tied to eviction subjects in 2025. Court filings therefore slightly **undercount** agency-lease evictions.

### Rental stock (the denominator)

| Item | Value | Tag / source |
|---|---|---|
| Brazil households 2024 | 77.33 M; **23.0% rented** (18.4% in 2016) → ≈17.8 M rented | [official] IBGE PNAD Contínua, *Características gerais dos domicílios e dos moradores 2024*, released 2025-08-22 ([PDF](https://agenciadenoticias.ibge.gov.br/media/com_mediaibge/arquivos/15ec1d59965a24b0bb2817eaf9b6f490.pdf); SIDRA [6820](https://sidra.ibge.gov.br/tabela/6820)/[6821](https://sidra.ibge.gov.br/tabela/6821)) |
| South households 2024 | 15.1% of Brazil = **11.68 M**; **23.0% rented** (17.7% in 2016) → **≈2.69 M rented** | [official] same IBGE release; multiplication [inference] |
| Paraná | 4.33 M households (2024) → 4.52 M (2025); **25.1% rented in 2025 = 1.13 M** (+9.9% y/y) → ≈1.03 M in 2024 | [secondary] O Paraná, citing PNAD 2025 (IBGE release 2026-04-17) ([link](https://oparana.com.br/cotidiano/pnad-2025-parana-tem-mais-idosos-mais-apartamentos-e-familia-menor/)) |
| Santa Catarina | 3.0 M (2024) → 3.1 M households (2025); **≈854k rented households** (5th largest in Brazil); Censo 2022: 25.6% of residents live in rented homes (4th highest) | [secondary] ND+ ([link](https://ndmais.com.br/cidadania/mais-casas-menos-gente-por-lar-santa-catarina-tem-aumento-de-97-mil-domicilios-em-um-ano/)); CRECI-SC on Censo 2022 ([link](https://creci-sc.gov.br/p/noticias/censo-2022-um-em-cada-cinco-brasileiros-mora-em-domicilio-alugado-em-sc-proporcao-e-de-um-em-cada-quatro/2452/)). The 854k figure came from a search snippet; its year (2024 or 2025) is not confirmed |
| Rio Grande do Sul | 17.5% of **residents** live in rented homes (PNAD 2024); Porto Alegre 17.8% = 296k households. Residual: 2.69 M − 1.03 M − 0.85 M ≈ **0.81 M rented households (about 18.6%)** | [secondary] Sul21, 2025-08 ([link](https://sul21.com.br/geral-1/2025/08/rio-grande-do-sul-17-moram-de-aluguel-mostra-ibge/)); residual [inference] |

**Formal and informal leases.** No official split of rented households by written contract or guarantee type was found. Assumption [inference]: about 50 to 60% of South rentals have a written contract and some guarantee (fiador, caução, seguro-fiança, título de capitalização, garantidora), and about 40 to 50% are informal or family arrangements. Agency-managed leases are a subset of the formal segment, probably 30 to 40% of the rented stock in South cities.

### Raw rate: filings per rented household (2025 filings over 2024 stock) [inference from official inputs]

| | Rented households | Broad filings 2025 | **Broad rate** | FdP filings | **FdP rate** |
|---|---|---|---|---|---|
| RS | ≈0.81 M | 6,843 | **0.84%** | 5,677 | 0.70% |
| SC | ≈0.85 M | 5,752 | **0.67%** | 4,593 | 0.54% |
| PR | ≈1.03 M (1.13 M in 2025) | 5,523 | **0.54%** (0.49% on 2025 stock) | 3,828 | 0.37% |
| **South** | ≈2.69 M | 18,118 | **0.67%** | 14,098 | **0.52%** |
| Brazil | ≈17.8 M | 89,087 | 0.50% | 67,324 | 0.38% |
| Upper bound South (incl. *Locação de Imóvel*) | 2.69 M | 34,837 | 1.30% | n/a | n/a |

About **1 in 150 South rented households is the target of an eviction suit each year**, and about 80% of these suits are for non-payment.

### How many filed cases end in an actual exit?

DataJud carries each case's movement history. The research downloaded the first-instance FdP cases filed in **2023**, now 92% closed (*baixa* or *trânsito em julgado*), and classified each by its terminal outcome [official, own query; classification is inference]:

| Outcome of 2023 FdP filings | TJRS (n = 3,998 of 5,829) | TJSC (n = 3,778 of 4,353) | TJPR (n = 1,993 of 3,665) |
|---|---|---|---|
| Dropped or extinguished without merits (*desistência*, *perda do objeto*, *ausência das condições*, *indeferimento*, *abandono*). Typically the tenant paid or left before judgment | 42.8% | 37.0% | 43.3% |
| Settlement homologated (*homologação de transação*). Usually a payment plan or an agreed move-out date | 26.2% | 19.8% | 31.0% |
| **Judgment for landlord** (*procedência*, *procedência em parte*, *reconhecimento do pedido*) | **21.4%** | **28.5%** | **17.4%** |
| Closed otherwise, still pending, or dismissed on merits | 9.7% | 14.7% | 8.3% |
| *Memo:* injunction or *tutela* recorded (art. 59 §1 IX liminar eviction) | 32.3% | 47.8% | 39.1% |
| *Memo:* deposit of money (proxy for *purgação da mora*, art. 62 II) | 17.9% | n/a (movement not coded by TJSC) | 8.2% |

Interpretation [inference]:

- **About 17 to 29%** of filings (PR 17%, RS 21%, SC 29%) end in a judgment ordering the tenant out. Adding liminar-only exits gives **about 25 to 40%** of filings that end in a **court-ordered exit**.
- **Guaranteed leases have no liminar route** (see [section 2](#2-eviction-procedure-and-duration)). A lease with a live fiador goes to judgment, which makes evictions slower. That affects exit severity (months of arrears) more than frequency.
- The remaining **65 to 75%** are cured or resolved: the debt is paid (*purgação da mora*; about 18% show a deposit), the parties settle, or the tenant leaves voluntarily and the case is dropped.
- **Physical forced removal** (a *mandado de despejo* executed by an *oficial de justiça*, with police or movers) is a fraction of court-ordered exits. Most tenants leave within the 15-day (liminar) or 30-day (sentence) window. DataJud does not code a "mandado cumprido com força" outcome. The estimate is **5 to 15% of filings**.

**Court-ordered exits per rented household per year (South)** = 0.67% × 25 to 35% ≈ **0.17 to 0.23%**. Counting only physical removals: 0.67% × 5 to 15% ≈ **0.03 to 0.10%**.

**Correcting for informal leases.** Informal landlords rarely sue: they negotiate, or use self-help evictions, which are illegal but common. So almost all filings come from the formal segment. If about 55% of leases are formal and about 85% of filings come from them [inference], the **formal-lease filing rate ≈ 0.67% × 0.85 / 0.55 ≈ 1.0% a year**, and court-ordered exits are about **0.25 to 0.35% a year**. This correction pushes the rate **up** for a book of formal, guaranteed leases.

### Guaranteed and agency-managed leases against the average

- **Public loss data was not retrieved.** The search budget ran out before SUSEP SES loss ratios for the fiança locatícia line, Secovi-RS/SC/PR, AABIC, CRECI, QuintoAndar, Loft/CredPago or garantidora eviction shares could be pulled. None of these figures are cited here.
- **Structural reasoning** [inference]:
  1. **A guarantee raises the *filing* propensity of defaulted leases.** Seguro-fiança policies and most garantidoras require the landlord or agency to file an *ação de despejo* promptly, often within 30 to 60 days of default, as a condition of payment. Among delinquent guaranteed leases, more go to court than among informal ones.
  2. **Underwriting lowers *default incidence*.** Income ≥ 3× rent, a credit bureau check and income verification. Industry discussions commonly put underwritten books at roughly half the delinquency of the open market (unverified).
  3. **A guarantee also raises the *cure* rate.** The tenant knows the guarantor will pay and sue, so settlements and voluntary move-outs dominate. QuintoAndar-style platforms say publicly that only a small minority of contracts end in eviction; sub-1% per lifetime is the usual claim (unverified).
  4. Net: filings per underwritten, guaranteed lease are probably **about the same as or below** the formal-segment rate of about 1.0%. Agency management adds early collection (day-5 to day-30 outreach) that cures most episodes before filing.

### How much delinquency escalates to eviction?

- **Delinquency stock.** The South is the least delinquent region. The Superlógica IIL (>30 days) was **2.46%** in January 2026 (national 3.29%); South apartments 2.11%; national 2025 average 3.50% (September 2025 peak 3.80%); rents ≤ R$1k: 5.43% (unverified: taken from Superlógica figures quoted in MUTAV's internal business notes; the original Superlógica release was not linked).
- **Escalation** [inference]. A 2.46% monthly stock with typical episodes of about 2 months implies about 1.2% of leases entering delinquency each month, or **about 12 to 15% of leases a year having an episode**. South filings run at about 0.5 to 1.0% of leases a year. So **about 93 to 96% of delinquency episodes cure or end without a lawsuit**, and about 4 to 7% escalate to a filing. Of those filings, about 25 to 35% end in a court-ordered exit. So **only about 1 to 2% of delinquency episodes end in a judicial removal.**
- This separates the two legs of a guarantee. The **default leg** is drawn often, at roughly the delinquency incidence. The **exit leg** for an eviction is drawn about 50 to 100 times less often.

### Litoral Norte RS and SC (pilot area)

First-instance broad eviction filings by the court's municipality, 2023 to 2025 total [official, own query]:

| Litoral Norte RS comarca | Filings 2023–25 | | Litoral Norte SC comarca | Filings 2023–25 |
|---|---|---|---|---|
| Tramandaí | 244 | | Balneário Camboriú | 845 |
| Capão da Canoa | 181 | | Itajaí | 602 |
| Torres | 124 | | Itapema | 278 |
| Osório | 74 | | Camboriú | 194 |
| Santo Antônio da Patrulha | 41 | | Navegantes | 97 |
| Palmares do Sul | 34 | | Porto Belo | 95 |
| **Total ≈ 233 a year** | **698** | | Tijucas / Piçarras / Barra Velha / Penha / S. Francisco do Sul | 73 / 54 / 48 / 43 / 37 |
| (Porto Alegre, for scale) | 6,058 | | **Total ≈ 790 a year tagged (≈1,300 a year if scaled for SC's 60% tagging)** | 2,366 |

Denominator and rate [inference]:

- **RS Litoral Norte.** These comarcas serve about 380k residents, or about 150k households (unverified). They include Imbé, Cidreira, Xangri-lá and Arroio do Sal, which have no code of their own in the data. With 18 to 22% renting (and many second homes outside PNAD's permanent-household stock), that is about 27 to 33k rented households. **≈0.7 to 0.85% filings a year**, in line with the RS average.
- **SC Litoral Norte (the Itajaí, Balneário Camboriú, Itapema strip).** About 930k residents, about 370k households (unverified), roughly 30% renting, so about 110k rented households. **≈0.7% (tagged only) to 1.2% (scaled)** filings a year. This is the more rental-intensive and pricier market.
- **Seasonality.** Summer *aluguel por temporada* is a separate procedure and is not in the denominator. Off-season annual leases on the coast carry somewhat more income volatility (tourism and construction jobs). The May 2024 floods hit the RS Litoral Norte less than the Porto Alegre metro and the Taquari valley.

### Most likely annual eviction rate for an underwritten, agency-managed book

**Definition used:** a lease that ends in a **court-ordered exit**, either an eviction judgment or a liminar *despejo*, whether or not the tenant leaves before physical enforcement. Physical forced removal is a subset, about a third of it.

| Scenario | Filing rate on the book | × share ending in court-ordered exit | **= Annual eviction rate per lease** | Per 30-month lease life |
|---|---|---|---|---|
| **Low** | 0.5% (good underwriting; agency cures early; SC/RS coastal average) | 20% | **≈0.10%** | ≈0.25% |
| **Base** | 0.7% (formal-segment rate of about 1.0% × an underwriting effect of about 0.7) | 35% (the guarantor files promptly, so fewer drop-outs) | **≈0.25%** | ≈0.6% |
| **High** | 1.2% (adverse selection toward rents ≤ R$1k, where delinquency is 5.43%; a recession or flood year; SC strip scaled rate) | 50% | **≈0.60%** | ≈1.5% |

**Reasoning.**

1. The South-wide all-lease filing rate is **0.67% a year** [official inputs]. RS Litoral Norte is about 0.7 to 0.85% and the SC strip about 0.7 to 1.2%.
2. Correcting for informal leases raises the rate for formal leases to about **1.0%**. Underwriting and agency collection lower it to about **0.5 to 0.8%**.
3. In the 2023 cohorts, **17% (PR) to 29% (SC) of filings end in a judgment for the landlord, and 32 to 48% see a liminar or tutela.** About two thirds of filings are cured, settled or dropped. A guarantor files earlier and more systematically, which raises the conversion to an ordered exit, so the base case uses 35%.
4. Result: **base ≈0.25% of active leases per year, range 0.10 to 0.60%.** In the economic model of the time, this means an exit probability of about 0.006 per 30-month lease (base), range 0.0025 to 0.015, rather than 1.0. The exit severity per actual eviction should still be modelled near the cap (6× rent): evictions take 6 to 12 months or more, with arrears, legal costs and restoration. Ordinary end-of-lease damage (not evictions) needs its own, much higher frequency and much lower severity (see [section 5](#5-exit-costs-without-an-eviction)).

**Confidence:** medium on volumes and the raw rate (official court microdata, own queries). Medium-low on the removal share (one 2023 cohort per court, with a self-built outcome classification). Low on the guaranteed-versus-average differential (no public insurer or garantidora data retrieved).

## 2. Eviction procedure and duration

### The liminar is not available while a guarantee is live

Lei 8.245/91, art. 59 §1º IX allows a liminar (an order to vacate within 15 days, issued without hearing the tenant first) only when the contract is **"desprovido de qualquer das garantias previstas no art. 37"**. That covers a contract that never had a guarantee, or one whose guarantee was later extinguished or exonerated. The liminar also requires a **caução of 3 months' rent** [official] ([Lei 8.245/91 art. 59](https://www.planalto.gov.br/ccivil_03/leis/l8245.htm)).

- Courts consistently **deny the IX liminar when a fiança or seguro-fiança exists** [secondary] ([TJMG note, Direito Real](https://direitoreal.com.br/noticias/para-o-tjmg-nao-cabe-liminar-de-despejo-em-contrato-com-garantia); [TJMG jurisprudence PDF](https://bd-login.tjmg.jus.br/jspui/bitstream/tjmg/2018/1/0206-TJ-JC-059.pdf)).
- A minority line **grants the liminar when the guarantee is ineffective or insufficient**: TJPR, AI 0001991-58.2021.8.16.0000 [secondary] ([Casillo Advogados, 2023-03-31](https://www.casilloadvogados.com.br/a-possibilidade-de-despejo-liminar-quando-constatada-a-ineficacia-da-fianca-a-necessaria-mitigacao-do-art-59-%C2%A71o-ix-da-lei-de-locacoes/)).
- TJSC has accepted **seguro-garantia judicial as the 3-month caução** [secondary] ([Cognijus](https://www.cognijus.com/blog/requisitos-de-caucao-em-acao-de-despejo-e-liminar-tribunal-de-justica-de-santa-catarina-tjsc)).

**Implication [inference].** While MUTAV is a live fiador, the landlord must use the **ordinary despejo track**, with no 15-day order, which is much slower. A guarantee that is extinguished once its limit is exhausted could give the landlord an argument for the IX liminar. Whether it does is an open legal question, and it is the single biggest lever on the exit severity.

> **Since this research:** a guarantee is now one limited fiança whose ceiling is the sum of its two legs. When total paid reaches that ceiling, the guarantee becomes `EXHAUSTED` in the same `pay_claim` and an event lets the platform send the extinction notice. Whether exhaustion counts as extinction for the art. 59 §1º IX liminar remains open ([ADR 0012](../decisions/0012-fianca-aligned-guarantee-lifecycle.md)).

**Extrajudicial despejo** (PL 3.999/2020: notice through a cartório, 15 days to pay or leave) passed the Câmara CCJ in 2025. As of 2026 it is **not law**, because it still needs the Senate and sanction [secondary] ([Câmara notícia](https://www.camara.leg.br/noticias/1168282-comissao-de-constituicao-e-justica-aprova-proposta-que-preve-despejo-extrajudicial-por-atraso-de-aluguel/); [CNN Brasil](https://www.cnnbrasil.com.br/politica/projeto-despejo-inquilino-inadimplente-camara-defesa-consumidor/)).

### Statutory steps for despejo por falta de pagamento [official, Lei 8.245/91]

- **Pre-filing.** Landlords usually wait for 1 to 2 missed rents. Porto Seguro's seguro-fiança conditions require the landlord to notify the insurer right after the **2nd** missed rent, and advances start within 30 days of **proof that the despejo was filed** [official] ([Porto Seguro CG Fiança, OUT/24, §§4.1.9.6.3, 14](https://www.portoseguro.com.br/content/dam/documentos/condicoes_gerais/solucoes_para_alugar/fianca_locaticia/2024/Condi%C3%A7%C3%B5es-Gerais-Seguro-Fian%C3%A7a.pdf)).
- **Valor da causa.** 12 × rent (art. 58 III), which is **R$24,000** at the reference rent.
- **Purgação da mora (art. 62 II).** Within 15 days of citação, the tenant can pay all arrears plus fees and keep the lease. This is allowed **once every 24 months** (art. 62 par. único). A purge ends the eviction, so there is no exit event. A second default within 24 months cannot be purged.
- **Sentence and voluntary exit (art. 63).** The sentence gives **30 days** to vacate voluntarily. It gives **15 days** when more than 4 months passed between citação and sentence, among other hypotheses.
- **Forced execution.** A mandado de despejo is issued. The oficial de justiça executes it with police support if needed, and locks are broken in front of witnesses.
- **With the IX liminar** (only with no guarantee or an extinguished one): a 15-day vacate order shortly after filing. The tenant can still defeat it by depositing the full debt within those 15 days (art. 59 §3º).

No published comarca-level eviction duration statistics were found for TJRS, TJSC or TJPR, including the Litoral Norte comarcas (Osório, Tramandaí, Capão da Canoa, Torres, Itapema, Balneário Camboriú, Itajaí). The figures below come from the statutory procedure plus secondary averages, and should be validated with local practitioners or a garantidora's claims desk before they are used for pricing.

### Real-world timelines

| Source | Figure | Tag |
|---|---|---|
| Brazil general, despejo falta de pagamento | 6 to 18 months from filing to removal; with liminar and no defence, "a few months" | [secondary] [geracontratos](https://geracontratos.com.br/recursos/acao-despejo-quanto-tempo), [Jusbrasil](https://www.jusbrasil.com.br/artigos/despejo-por-falta-de-pagamento-quais-os-prazos-e-etapas-do-processo/4433006313) |
| Brazil general | 6 to 12 months typical; 6 months to 3 years with appeals | [secondary] [Jusbrasil](https://www.jusbrasil.com.br/artigos/quanto-tempo-demora-uma-acao-de-despejo-no-brasil/3503436041) |
| Lost-rent period (SP capital modelling, 2026-04-22) | 4 to 12 months; 6 to 10 used for estimates | [secondary] [geracontratos custo](https://geracontratos.com.br/recursos/custo-acao-despejo-vale-pena) |
| TJRS, all first-instance processes, CNJ 2025 data | About 1,063 days to first sentence (all classes; despejo is much faster than the average) (unverified: quoted in a search summary, not checked against the CNJ PDF) | [secondary] |
| National CNJ 2025 | Average first-instance conhecimento to sentence ≈ 1 year 6 months | [secondary] [TJSE/CNJ](https://agencia.tjse.jus.br/noticias/item/16106-justica-em-numeros-2025-tjse-e-destaque-nacional-em-eficiencia-e-celeridade-processual) |

### South-region estimate [inference]

This uses the TJRS and TJSC eproc backlogs. Litoral Norte comarcas are mid-size and seasonal. Citação by an oficial de justiça at beach addresses often fails in the off-season, which adds 1 to 2 months.

Months of unpaid rent, from the 1st missed rent to the keys being handed back:

| Track | Low | Base | High |
|---|---|---|---|
| **Ordinary (fiador live, no liminar), uncontested or revel** | 7 | 10 | 14 |
| Ordinary, contested or with appeal | 12 | 16 | 24+ |
| **Liminar IX available** (guarantee extinguished at the default limit) | 4 | 5.5 | 8 |

How the base cases are built:

- Ordinary base: 2 months pre-filing, then 1.5 months distribution to citação, 0.5 month for the purge or contest window, 3 months to sentence, 1 month voluntary period, 2 months to mandado execution. Total ≈ 10.
- Liminar base: 2 to 3 months pre-filing (until a 3-month default limit is exhausted), then 0.5 to 1 month to decision, 0.5 month for the 15-day order, 1 to 1.5 months to execution. Total ≈ 5 to 6.

**Months lost beyond a 3-month default limit [inference]:**

- Ordinary track: **4 / 7 / 11** (low / base / high).
- Liminar track: **1 / 2.5 / 5**.

**Share of defaults that never reach the exit leg [inference].** Many cases end in purgação, an acordo or a voluntary key handover after citação. The guess is 40 to 60% of filed despejos for non-payment; there is no hard data here (the 2023 DataJud cohorts in [section 1](#how-many-filed-cases-end-in-an-actual-exit) later put the cured, settled or dropped share at 65 to 75%). The eviction exit is a tail event in the true sense.

## 3. Eviction costs

### Court fees

| Item | Value | At R$2,000 rent (causa R$24k) | Tag |
|---|---|---|---|
| **TJRS** Taxa Única de Serviços Judiciais (Lei-RS 14.634/2014) | 2.5% of valor da causa; min 5 URC, max 1,000 URC. URC 2026 ≈ R$51.53. Covers distribuidor, contador, escrivão **and oficial de justiça acts** | **R$600 ≈ 0.30×** | rate: [official] [Receita RS FAQ](https://atendimento.receita.rs.gov.br/quais-as-aliquotas-da-taxa-judiciaria), [Lei 14.634](https://www.legisweb.com.br/legislacao/?id=278745); URC: [secondary] [DPM](https://pauseperin.adv.br/noticia/tribunal-de-justica-do-rs-fixa-novo-valor-da-urc) |
| TJRS cumprimento de sentença (collection of arrears) | 1%, max 300 URC | about R$100 to 300 ≈ 0.1× | [official] same |
| **TJSC** Taxa de Serviços Judiciais (Lei-SC 17.654/2018) | 2.8% of valor da causa; 2026 min R$318.63, max R$7,080.89. Cumprimento: 0.5% | **R$672 ≈ 0.34×** | [secondary citing TJSC] [TJSC Cartilha de Custas](https://www.tjsc.jus.br/documents/3061010/13196899/CARTILHADECUSTAS-ADVOGADOS.pdf/183a9673-0053-5a3d-a71b-fd91fbc7057e?t=1737497423076), [Regimento](https://www.tjsc.jus.br/web/corregedoria-geral-da-justica/normas-e-orientacoes/regimento-de-custas) |
| TJPR | Not researched in detail; assumed the same order (about 2 to 3% of causa) | about R$600 to 800 | [inference] |
| Oficial de justiça conduções and diligências (citação, mandado, reinforcement) | RS: largely inside the Taxa Única, with conduções sometimes extra. SC: diligências billed per act | R$150 to 600 ≈ 0.1 to 0.3× | [inference] |

### Lawyer fees: OAB tables (an ethical floor, rarely what mass-litigation panels charge)

| Item | Value | × R$2,000 | Tag |
|---|---|---|---|
| **OAB/RS 2026**, item 15.5.1 "Ação ordinária de despejo (falta de pagamento, denúncia vazia, infração contratual)" | **R$7,200 or 10 to 20%** | 3.6× | [official] [OAB/RS Tabela 2026, Res. 02/2026](https://admsite.oabrs.org.br/arquivos/honorarios-versao-2026.pdf) |
| **OAB/RS 2026**, 15.5.5 "Atos e acompanhamento de despejo/reintegração" (execution phase only) | R$5,390 or 10 to 20% | 2.7× | [official] same |
| OAB/RS 2023 (for trend): despejo R$7,034.87 / 20%; acompanhamento R$4,689.92 | n/a | n/a | [official] [OAB/RS 2023](https://admsite.oabrs.org.br/arquivos/1678287561206.pdf) |
| **OAB/SC**, "Ação de despejo" floor | **R$4,073.15** (in force from 12/2025, Res. CP 03/2026); was R$3,906.73 from 12/2024 (unverified: a search summary of the official calculator, not opened directly) | 2.0× | [secondary] [OAB/SC calculadora](https://calculadora-honorarios.oab-sc.org.br/), [OAB/SC honorários](https://oab-sc.org.br/honorarios) |
| Market, standard case (Brazil) | R$2,000 to 6,000 fixed, or 10 to 20% | 1 to 3× | [secondary] [geracontratos custo](https://geracontratos.com.br/recursos/custo-acao-despejo-vale-pena) |
| Institutional panel (garantidora or insurer mass litigation) | about R$1,200 to 3,000 per case all-in | 0.6 to 1.5× | [inference]: volume pricing well below the OAB floor is the industry norm; Porto bundles "assessoria jurídica gratuita para despejo" into Essencial ([compagno, 2023-06-26](https://compagno.com.br/blog/como-funciona-o-seguro-fianca-locaticia-porto-seguro-essencial-12-20-ou-30-seguro-fianca-essencial/)) |

Sucumbência (10 to 20% of the condemnation) is owed by the tenant. It is paid only if the tenant is solvent (see [recovery](#recovery-against-the-tenant)).

### Execution extras

| Item | Value | × | Tag |
|---|---|---|---|
| Auxiliary execution costs: oficial, locksmith, external diligências | R$300 to 1,500 | 0.15 to 0.75× | [secondary] [geracontratos custo](https://geracontratos.com.br/recursos/custo-acao-despejo-vale-pena) |
| Locksmith (forced entry and new cylinder) | R$150 to 400 | about 0.1 to 0.2× | [inference] |
| Removal of belongings plus depositário or storage (only when the tenant abandons goods; the landlord advances it) | R$800 to 3,000 | 0.4 to 1.5× | [inference] |

### Legal and procedural total per eviction [inference]

| | Low | Base | High |
|---|---|---|---|
| Court fees | R$600 | R$700 | R$1,000 |
| Lawyer | R$1,200 (panel) | R$2,500 | R$7,200 (OAB/RS floor; + R$5,390 if billed separately for the execution phase → about R$12.6k) |
| Diligências, locksmith, removal | R$200 | R$600 | R$3,000 |
| **Total** | **R$2,000 ≈ 1.0×** | **R$3,800 ≈ 1.9×** | **R$11,000 ≈ 5.5×** (OAB/RS full, both phases) |

Costs are flat in R$, so the multiple **shrinks as rent rises**. At R$4,000 rent the base case is ≈1.0×. The main driver is the choice of legal panel, not the court.

### Property damage and restoration after an eviction

- Insurers pay damage only against a **vistoria inicial and final** (with photos), using quotes, an insurer-appointed adjuster or a final judgment. Normal wear is excluded. Painting is a separate cover that requires the property to be **delivered with new paint** [official] ([Porto CG §§4.2.2, 4.2.4, 13](https://www.portoseguro.com.br/content/dam/documentos/condicoes_gerais/solucoes_para_alugar/fianca_locaticia/2024/Condi%C3%A7%C3%B5es-Gerais-Seguro-Fian%C3%A7a.pdf); [Tokio Marine](https://www.tokiomarine.com.br/seguros-residenciais/seguro-fianca/)).
- Unit costs: painting R$20 to 60 per m² of wall; light renovation R$800 to 1,400 per m² [secondary] ([Creditas](https://www.creditas.com/exponencial/quanto-custa-reformar/)).
- Examples of tenant-chargeable damage: holes, deep stains, scratched floors, broken glass and locks [secondary] ([Regente Imóveis](https://regenteimoveis.com.br/guia/locacao/pintura-reforma-saida-inquilino-quem-paga/)).

**Eviction-specific estimate [inference].** Evicted units are worse than ordinary exits: no cooperation, utilities often cut, sometimes deliberate damage or stripped fixtures. The Litoral Norte adds salt and humidity: mould and corrosion in units left closed for months. For a 60 m² apartment at R$2,000:

- Repaint about 150 to 180 m² of walls: R$3,000 to 6,000.
- Cleaning and debris removal: R$500 to 1,500.
- Repairs (doors, fixtures, glass, electrical): R$500 to 5,000.

Net of normal wear, which the landlord bears:

| Damage | Value | × |
|---|---|---|
| Low | R$1,000 | **0.5×** |
| Base | R$3,000 | **1.5×** |
| High | R$6,000+ | **3×** |

Market caps on damage confirm that about 2 to 3× is the norm:

- CredPago/Loft Smart Plus caps damage at **3× rent** [secondary] ([portal.loft](https://portal.loft.com.br/tudo-sobre-credpago-loft-fianca-aluguel/)).
- Porto Essencial damage is reported at about 2× rent (unverified) [secondary] ([Porto](https://www.portoseguro.com.br/seguro-fianca)).

### Recovery against the tenant

No public data on recovery rates for seguro-fiança or garantidoras was found. SUSEP reports salvage and recoveries only netted into paid losses.

[inference]:

- Evicted tenants are selected for insolvency.
- Wages are unattachable (CPC 833 IV), with only limited exceptions.
- Bank accounts are often empty; SISBAJUD hits are small.
- Evicted tenants frequently relocate.

**Expected recovery: about 5 to 15% of the amount paid, in nominal terms over 2 to 5 years.** The best case is a negotiated installment plan soon after exit, around 20 to 30%. Recovery is meaningfully higher only with a co-obligor who has assets (a second fiador or a corporate tenant). Recovery is front-loaded: whatever comes back mostly arrives in the first 12 months as acordos. Collection costs (protesto, Serasa negativação, cumprimento de sentença at 1% or 0.5% court fees, lawyer success fee of about 20 to 30%) consume a third or more of gross recoveries.

**Modelling choice:** treat recovery as **≈10% of the exit payment, received about 18 months later**, or ignore it for conservative reserve sizing.

## 4. Most likely exit payment per eviction

Assumptions:

- Rent R$2,000. A default limit of 3 months, paid first. An exit cap of 6×.
- Applies only to cases that reach a forced or adjudicated exit, not to purges or acordos.
- Gross of recovery. Condominium, IPTU and utility arrears are excluded.

### Scenario A: the guarantor is live, no liminar

| Component | Low | Base | High |
|---|---|---|---|
| (a) Rent lost beyond the 3-month default limit | 4.0× | 7.0× | 11.0× |
| (b) Legal and procedural | 1.0× | 1.9× | 5.5× |
| (c) Damage and restoration | 0.5× | 1.5× | 3.0× |
| **Uncapped exposure** | 5.5× | 10.4× | 19.5× |
| **Exit payment (capped at 6×)** | **5.5× (92%)** | **6.0× (100%)** | **6.0× (100%)** |

### Scenario B: the guarantee is extinguished at the default limit, so the landlord gets the art. 59 IX liminar

| Component | Low | Base | High |
|---|---|---|---|
| (a) Rent lost beyond the 3-month default limit | 1.0× | 2.5× | 5.0× |
| (b) Legal and procedural (panel lawyers) | 1.0× | 1.5× | 3.0× |
| (c) Damage and restoration | 0.5× | 1.5× | 3.0× |
| **Uncapped exposure** | 2.5× | 5.5× | 11.0× |
| **Exit payment (capped at 6×)** | **2.5× (42%)** | **5.5× (92%)** | **6.0× (100%)** |

### Read-out [inference]

- **An eviction that reaches a forced exit almost always consumes about 90 to 100% of the 6× cap.** Reserves should assume an exit payment of **about 5.5 to 6× rent per eviction**, not a fraction of it.
- The first lever is the life of the guarantee. If extinction at the default limit opens the 15-day liminar, component (a) falls by about 4 to 5×.
- The second lever is legal cost: a panel despejo lawyer at a flat R$1.5 to 2.5k instead of OAB-table fees cuts component (b) by up to about 3×.
- Components (b) and (c) are mostly flat in R$, so the cap binds less at higher rents. At R$4,000 rent, Scenario B base ≈ 2.5 + 0.8 + 1.2 ≈ **4.5× (75%)**.
- The cap binds in Scenario A. The landlord absorbs the residual 4 to 13× rent. This is a disclosure point against seguro-fiança products that run to desocupação, with aggregate limits of 12 to 50×.

> **Since this research:** the exit leg pays only the tenant's liquidated debts (rent and charges until the keys are returned, damage beyond normal wear, court costs owed by the tenant, abandonment and repossession costs). It does not pay for the landlord's eviction. The legs are sub-limits of one limited fiança whose ceiling includes interest, penalties and court costs ([ADR 0012](../decisions/0012-fianca-aligned-guarantee-lifecycle.md)).

## 5. Exit costs without an eviction

This section covers the costs a landlord is left with when a tenant leaves **without** an eviction. In the economic model of the time, every lease end drew the exit leg at 0.15 of a 6× cap, about **0.9× rent per lease end**, or about **0.36× rent per lease-year** over 30 months.

**Bottom line.**

1. **No public Brazilian dataset measures exit-cost frequency**: not damage rates, unpaid charges at exit, abandonment or early termination. Secovi-SP, Secovi-PR/Inpespar, Secovi-RS and SUSEP publish nothing per event at this level, and insurers do not split losses by coverage publicly. **Most occurrence figures below are [inference]**, anchored on product design (the caps garantidoras choose), turnover and price lists. The only real calibration source is a partner agency's own move-out records (vistorias, *acertos de saída*, caução deductions), collected over 12 to 24 months.
2. **Base case: about 0.19× monthly rent per lease-year** of unpaid exit costs, excluding eviction and arrears. That is about **0.48× rent per move-out**, at 0.4 move-outs per lease-year, and about half the model's 0.36× a year. The early-termination penalty and damage or painting are the two largest lines.
3. **The 6× cap binds almost only in abandonment** and in rare large-damage or restoration cases. Ordinary move-outs settle under 1.5× rent. Market garantidoras cap exit costs at **3× rent** (CredPago/Loft standard) or **5×** (top tiers), a revealed-preference signal that 3× covers most ordinary exits.
4. **The main risk is the trigger, not the frequency.** Fiador liability under Lei 8.245/91 is broad, but severity is set by whoever writes the invoices. Insurer conditions control this with a signed *vistoria inicial* as a precondition, wear-and-tear exclusions, PINI price tables, independent adjusters and sublimits.

### Turnover: from per-move-out to per-lease-year rates

| Figure | Value | Tag / source |
|---|---|---|
| Standard residential contract term | 30 months (the art. 46 threshold for *denúncia vazia*). QuintoAndar contracts are fixed at 30 months | [official] Lei 8.245/91 art. 46 ([planalto](https://www.planalto.gov.br/ccivil_03/leis/l8245.htm)); [secondary] [QuintoAndar contract rules](https://user.quintoandar.com.br/contrato/186218/regras-locacao) |
| Tenants planning to move "in the coming months" | **41%** (47% at ages 18 to 24; 37% at 45+). n = 1,300, fieldwork 26 Sep to 6 Oct 2025, "Raio-X do aluguel no Brasil" | [secondary] [Segimob](https://segimob.com/quase-metade-dos-inquilinos-planeja-se-mudar-em-breve-mostra-pesquisa/) |
| Guarantee mix, new SP contracts (Dec 2023) | Caução 45.5%, fiador 39.0%, seguro-fiança 14.0%, other 1.5% | [official] Secovi-SP Pesquisa Mensal de Locação, Dec 2023 ([PDF](https://secovi.com.br/wp-content/uploads/2024/01/202312-pml.pdf)) |
| Curitiba rent default rate | 0.9% (Apr 2026); below 1.5% since Jan 2022. Average ticket R$2,481 | [secondary] Inpespar/Secovi-PR via [Hub Imobiliário, 2026-05-29](https://hubimobiliario.com/na-contramao-do-mercado-inadimplencia-na-locacao-imobiliaria-e-baixissima-em-curitiba/) |
| Secovi-RS / Secovi-SC tenure or turnover statistics | **Not found.** No public series on average tenure or devolutions | n/a |

**Tenure and move-out rate [inference].** A 30-month nominal term, a large share of early exits and some tenancies rolling into an indefinite term give an average actual tenure of about **20 to 36 months**, so:

- **Low 0.33, base 0.40, high 0.60 move-outs per lease-year.**
- Use the **high** value for the Litoral Norte of RS and SC (Capão da Canoa, Tramandaí, Torres, Balneário Camboriú, Itapema). Annual stock there churns faster: 12-month contracts, students and seasonal workers, and owners who withdraw units for the summer season. Each new tenant gets a fresh exit leg, so per-*unit* exposure rises proportionally.

Every per-lease-year figure below is the per-move-out rate × 0.40 (base).

### Legal frame: who owes what at exit

- **Art. 23 III**: the tenant returns the property "in the state received, except for normal deterioration from use". **Art. 23 VI**: the tenant may not alter the property without written consent. **Art. 23 VIII and XII**: the tenant pays utilities and ordinary condominium charges. **Art. 22**: the landlord pays extraordinary condominium charges. **Art. 25**: IPTU may be passed to the tenant by contract [official] ([Lei 8.245/91](https://www.planalto.gov.br/ccivil_03/leis/l8245.htm)).
- **Art. 4**: the tenant may return the property early by paying the contractual penalty "proportional to the period of performance", and is exempt if transferred by an employer, with 30 days' notice. **Art. 39**: the guarantee extends until the property is actually returned. **Art. 66**: when the property is abandoned after an eviction suit is filed, the landlord may take possession (*imissão na posse*) [official] (same law; see [Conjur on abandonment, 2023-12-04](https://www.conjur.com.br/2023-dez-04/abandono-do-imovel-locado-efeitos-praticos-ao-locatario-e-ao-locador/)).
- **Abandonment does not end the contract.** Rent and charges keep accruing against tenant and guarantor until the landlord regains possession. Self-help repossession exposes the landlord to liability, so the safe path is a court order or a notarised record of abandonment [secondary] ([Conjur](https://www.conjur.com.br/2023-dez-04/abandono-do-imovel-locado-efeitos-praticos-ao-locatario-e-ao-locador/), [Vieira Braga](https://vieirabraga.com.br/imissao-de-posse-como-obter-imovel-abandonado/)).
- **Which accessory debts follow the property [inference].** Condominium fees and IPTU are *propter rem*: they attach to the property, so the landlord ends up liable. STJ case law treats water and electricity debts as **personal**, not *propter rem* (unverified: stated from general knowledge, no citation). The landlord is then exposed to those only when the account is in the landlord's name.

### Category 1: damage beyond normal wear (art. 23 III), including painting and cleaning

**Evidence.**

- **QuintoAndar "Proteção contra Danos"** [official, product terms]. It pays the landlord when the tenant does not pay vistoria-approved repairs, then collects from the tenant. The cap is **R$50,000 per contract**. Reference price ranges per item: painting R$296 to 1,210; doors R$50 to 1,000; floor, wall or ceiling R$100 to 2,000; appliances R$100 to 2,500; cleaning R$100 to 600. Appliances and furniture are depreciated. Wear and tear, structural defects, external areas, utilities, condominium fees and **termination penalties are excluded** ([QuintoAndar help](https://www.quintoandar.com.br/ajuda/artigo/tudo-sobre-a-garantia-contra-danos-da-protecao-quintoandar-3XCHid1z2oKlKmk3rCdD2)).
- **Porto Seguro Fiança, general conditions (2024)** [official]. Property damage is an *optional* add-on:
  - **A signed vistoria inicial is a precondition.** Without it, the claim is lost.
  - Wear and tear, furniture-mounting holes, plumbing and wiring, damp, pools and gardens are excluded. **Painting is excluded** from the damage cover and sold as a separate add-on that requires the unit to be delivered freshly painted.
  - Repairs are priced against PINI tables, with an independent adjuster when parties disagree.
  - Residential cleaning is limited to 10% of the damage limit and **R$300 at most**.
  - Limits are set per contract, in R$ multiples chosen at contracting.

  ([Porto CG 2024 PDF](https://www.portoseguro.com.br/content/dam/documentos/condicoes_gerais/solucoes_para_alugar/fianca_locaticia/2024/Condi%C3%A7%C3%B5es-Gerais-Seguro-Fian%C3%A7a.pdf))
- [secondary] A broker summary of Porto states **damage up to 6× rent and painting up to 3× rent** (unverified: a search-result summary, source page not checked).
- **CredPago / Loft Fiança Aluguel (agency terms)** [official, contract text]. It covers property damage, apparent hydraulic and electrical damage, and "exit costs", defined as the termination penalty, restoration costs, and condominium, water, electricity and gas disconnection fees. Exit costs are **capped at the greater of R$2,500 or 3× rent for units up to 50 m², and the greater of R$4,000 or 3× rent above 50 m²; 5× rent on the SMART+/UP tiers.** The claim deadline runs from key handover ([termo_imob.pdf](https://static.credpago.com/documentos/termo_imob.pdf)).
- **Caução use.** Caução is the most common guarantee in São Paulo (45.5%, Secovi-SP Dec 2023 [official]). It is limited to 3 rents (art. 38 §2) and returned net of documented deductions [secondary] ([spimovel](https://www.spimovel.com.br/blog/devolucao-da-caucao-(deposito)-para-o-inquilino-na-locacao-de-imoveis-como-funciona-na-pratica/3651/)). **No source states how often caução is drawn for damage.**

**Frequency and severity [inference].**

| | Low | Base | High |
|---|---|---|---|
| Move-outs with *any* repair, painting or cleaning charge at the exit vistoria | 40% | 55% | 70% |
| …of which unpaid by the tenant at exit (lands on the guarantor; no caução alongside a MUTAV guarantee) | 25% | 35% | 50% |
| **Net unpaid occurrence, per move-out** | 10% | 20% | 35% |
| **Per lease-year** (× 0.33 / 0.40 / 0.60) | 3% | 8% | 21% |
| Severity of the unpaid amount (× monthly rent; rent ≈ R$2,300 to 2,500 in Curitiba) | 0.3× | 0.7× | 1.5× |

Reasoning:

- Painting is the dominant item, because most contracts require returning the unit painted. QuintoAndar's price list puts a typical bundle of painting, cleaning and a few repairs at R$1 to 4k, which is 0.4 to 1.6× rent.
- The CredPago 3× cap and Porto's R$300 cleaning cap indicate that ordinary exits rarely exceed 2 to 3× rent.
- Where a caução exists (about 45% of SP leases), it absorbs most of this cost. **A MUTAV guarantee replaces the caução, so it inherits the full amount.**

### Category 2: unpaid accessory charges at exit (arts. 22, 23 VIII and XII)

**Evidence.**

- Seguro-fiança sells *encargos* (IPTU, condominium, water, electricity, gas) as a basic or add-on cover [secondary] ([Too Seguros blog, 2022-06-15](https://blog.tooseguros.com.br/seguro-fianca-cobre-a-multa-por-rescisao-entenda/)); [official] Porto CG §4.2.1.
- CredPago pays water and electricity bills during the contract **only when the account is in the landlord's name**; otherwise only inside the exit-cost cap [official] ([termo_imob.pdf §4.1(ii)](https://static.credpago.com/documentos/termo_imob.pdf)).
- QuintoAndar's damage protection explicitly excludes utilities and condominium fees [official].

**Frequency and severity [inference].** In the South, the condominium fee is usually billed with the rent through the administradora's boleto, so unpaid condominium fees tend to show up as **arrears**, which belong to the default leg, not as exit debt. What remains at exit is short: the last pro-rata month of condominium fees; pro-rata IPTU (Porto Alegre, Curitiba and Florianópolis bill it annually or in installments, so the tenant's share is often settled against the caução); final water and electricity readings; disconnection fees. On the Litoral Norte, condominium fees and IPTU are proportionally higher relative to rent, and many houses have individual water accounts.

| | Low | Base | High |
|---|---|---|---|
| Unpaid accessory charges at exit, per move-out | 10% | 20% | 30% |
| Per lease-year | 3% | 8% | 18% |
| Severity (× rent) | 0.1× | 0.3× | 0.8× |

Severity is small because it is typically 1 month of condominium fees, pro-rata IPTU, and 1 to 2 utility bills.

### Category 3: early-termination penalty (*multa rescisória*, art. 4)

**Evidence.**

- Market convention is a penalty of **3 rents, reduced pro rata** for the time already served. In SP, 3× rent is the most common penalty; some contracts use 4× or a percentage [secondary] ([spimovel](https://www.spimovel.com.br/blog/inquilino-pode-sair-antes-do-fim-do-prazo-contratual-o-que-acontece/4007/), [QuintoAndar guide](https://www.quintoandar.com.br/guias/como-alugar/como-calcular-multa-rescisoria-aluguel/)).
- Insurers cover it only as an add-on, **capped at 3× rent**. Porto pays it when the termination comes with key handover **or abandonment before the tenant is served in an eviction suit**. Pottencial defines it as a "penalty arising from early termination as defined in the lease" [official] (Porto CG §4.2.3; [Pottencial CG](https://static.pottencial.com.br/sitefiles/FiancaLocaticia/CGFiancaLocaticia13.pdf)); [secondary] Too Seguros.
- CredPago includes the penalty inside the "exit costs" cap (3× or 5×) [official].
- QuintoAndar's damage protection excludes it [official].
- **No source measures how often tenants leave early.** The 41% "planning to move" figure is the only behavioural signal [secondary].

**Frequency and severity [inference].**

| | Low | Base | High |
|---|---|---|---|
| Move-outs that occur *within* the fixed term (penalty due) | 30% | 40% | 55% |
| …of which the penalty goes unpaid (waived, disputed, tenant insolvent) | 25% | 40% | 60% |
| **Net per lease-year** (× 0.33 / 0.40 / 0.60) | 2.5% | 6.4% | 20% |
| Severity: proportional penalty actually due (× rent) | 0.5× | 1.2× | 2.5× |

Notes:

- An exit in month 15 of a 30-month lease triggers about 1.5× rent; an exit in month 24 about 0.6×.
- Employer transfers are exempt under art. 4 ¶ único.
- Landlords often waive the penalty when re-letting is quick, so the economic loss is *vacancy*, which the penalty is meant to price.
- This is a liquidated-damages amount, not a physical loss. It is the **largest base-case line** and the most negotiable. Garantidoras either cap it inside 3× (CredPago) or exclude it (QuintoAndar).

### Category 4: abandonment (keys not returned; *imissão na posse*)

**Evidence.**

- Rent and charges accrue until repossession. The procedural route is an eviction suit, with *imissão* once abandonment is proven (art. 66). Proof means the physical absence of the tenant and the other occupants [official/secondary] ([Conjur](https://www.conjur.com.br/2023-dez-04/abandono-do-imovel-locado-efeitos-praticos-ao-locatario-e-ao-locador/)).
- Insurers treat abandonment as a **trigger**. In Chubb's conditions, losses run from the abandonment date and need proof of vacancy. Porto pays the termination penalty on abandonment [official] ([Chubb CG (12/2025)](https://www.chubb.com/content/dam/chubb-sites/chubb-com/br-pt/condicoes-gerais/riscos-financeiros/fianca-locaticia-processo-susep-15414-632334-2019-71-versao-a-partir-de-12-12-2025.pdf), Porto CG).
- **No frequency data found.**

**Frequency and severity [inference].** Abandonment is usually the tail end of an arrears episode: the tenant stops paying, then leaves. The arrears belong to the **default leg**. The exit-leg severity is what remains on top: rent from abandonment to repossession (about 1 month extrajudicially, with a notarised record and the tenant's consent; about 2 to 6 months for a judicial *imissão* inside a despejo); lock change, cleaning, and removal and storage of belongings (0.2 to 0.5× rent); and damage, typically worse than at an ordinary exit.

| | Low | Base | High |
|---|---|---|---|
| Per lease-year | 0.3% | 0.8% | 2.0% |
| Severity, excluding pre-abandonment arrears (× rent) | 1.0× | 2.5× | 5.0× |

Use the high case for the Litoral Norte, where absentee owners mean late detection.

### Category 5: removing unauthorised alterations, or restoration (art. 23 VI)

**Evidence.**

- Porto's damage cover excludes alterations needed to adapt *non-residential* units to their use, unless they affect the structure. Residential alterations fall under the damage cover only as damage [official] (Porto CG §4.2.2.2(b)).
- CredPago's "exit costs" include restoration ("recomposição do estado do imóvel"). It excludes artistic works and decoration unless they were recorded in the vistoria [official].
- **No frequency data found.**

**Frequency and severity [inference].** Typical cases are removing partitions, closets or wall-mounted fixtures, restoring floors or wall colours, and dismantling unauthorised extensions in houses. These are rare in residential stock.

| | Low | Base | High |
|---|---|---|---|
| Per move-out | 1% | 2.5% | 4% |
| Per lease-year | 0.3% | 1.0% | 2.4% |
| Severity (× rent) | 0.3× | 1.0× | 3.0× |

### Benchmarks: seguro-fiança and garantidora products

Eviction (what each product pays when the tenant is evicted):

| Product | What it pays on eviction | Tag |
|---|---|---|
| **Porto Seguro Fiança** (CG OUT/24) | Rent advanced monthly **from filing until actual desocupação** (§4.1.9.4), up to the contract's maximum limit. Damages, painting, encargos and multa are **optional add-ons** with their own limits. **Legal fees and court costs are covered only as sucumbência**, capped at the percentage the judge awards on indemnifiable amounts (§13.10); the caução is excluded. If the landlord fails to pursue provisional execution after an appeal, liability ends 15 days after notice of the decision | [official] [Porto CG](https://www.portoseguro.com.br/content/dam/documentos/condicoes_gerais/solucoes_para_alugar/fianca_locaticia/2024/Condi%C3%A7%C3%B5es-Gerais-Seguro-Fian%C3%A7a.pdf) |
| Porto **Essencial** 12/20/30 | One aggregate multiple (12, 20 or 30× rent) across rent, encargos, damages and multa; **free legal assistance for despejo** (Porto's lawyers, so the landlord pays no fee) | [secondary] [compagno 2023-06-26](https://compagno.com.br/blog/como-funciona-o-seguro-fianca-locaticia-porto-seguro-essencial-12-20-ou-30-seguro-fianca-essencial/) |
| **Tokio Marine Aluguel** | Basic limit 12/18/24/30× rent. Add-ons: encargos, damage (needs vistoria inicial), multa, internal and external painting, 13th rent | [official/secondary] [Tokio Marine](https://www.tokiomarine.com.br/seguros-residenciais/seguro-fianca/), [garantiadealuguel](https://garantiadealuguel.org/seguro-fianca-tokio-marine-como-funciona-coberturas-e-simulacao-online/) |
| **CredPago / Loft Fiança Aluguel** | Up to 35/40/50× rent aggregate; damage capped at 3× (Smart Plus); fee 8 to 10% of the rental package. Reclame Aqui complaints about refused damage claims | [secondary] [Loft](https://loft.com.br/credpago), [Reclame Aqui](https://www.reclameaqui.com.br/grupo-loft/credpagoloft-nao-cumpre-contrato-de-garantia-locaticia-e-nao-faz-ressarcimento-de-danos-no-imovel_Srm-XJY_WtYVBo7d/) |
| Market (SUSEP line 0746, Fiança Locatícia) | Premiums R$795.5M Jan to May 2025 (+R$95M y/y); about R$1.9B over the 12 months to Feb 2025 | [secondary citing SUSEP] [CQCS 2025-08-04](https://cqcs.com.br/noticia/seguro-fianca-locaticia-dispara-e-acumula-mais-de-r-795-milhoes-em-2025/), [SEGS](https://www.segs.com.br/seguros/421688-fianca-locaticia-gera-r-1-9-bilhao-em-12-meses-e-tem-alta-em-fevereiro-aponta-susep) |
| Loss ratio, line 0746 | Peak 58% (Jul 2018) for Jan 2014 to Mar 2020; 1H2020 62% against 24% in 1H2019; spike to 112% in May 2020 (COVID). Losses are net of salvage and recoveries | [secondary, SUSEP SES data] UNIFESP TCC 2020 ([PDF](https://repositorio.unifesp.br/server/api/core/bitstreams/ce292c37-f723-4a08-a713-4ba33e502b0e/content)) |

Exits without eviction:

| Product | Damage | Painting | Termination penalty | Accessory charges | Abandonment | Key controls |
|---|---|---|---|---|---|---|
| **Porto Seguro Fiança** (CG 2024) [official] | Add-on; limit per contract (6× per a broker, unverified) | Separate add-on (3× per a broker, unverified); only if delivered freshly painted | Add-on; on key handover or abandonment before citation | Basic or add-on "encargos" | Trigger | Signed vistoria inicial; PINI pricing; independent adjuster; cleaning ≤ 10% / R$300; wear excluded |
| **Tokio Marine** | Add-on | Add-on | Add-on, ≤ 3× [secondary] | Add-on | Trigger | (2026 terms not retrieved; site returned 403) |
| **Too Seguros** [secondary, 2022] | Add-on | Add-on | Add-on, ≤ 3× rent | "Encargos básicos" add-on: IPTU, condominium, utilities | n/a | Emergency handyman 2 to 3 times a year |
| **Chubb / Pottencial** CGs [official] | Add-on | Add-on | Add-on | Add-on | Trigger (losses run from the abandonment date) | Mandatory 10% landlord participation on rents |
| **CredPago / Loft** [official] | Included | Inside "exit costs" | Inside "exit costs" | Water and electricity only if in the landlord's name; otherwise inside exit costs | Rent covered until keys returned | **Exit costs ≤ max(R$2.5k/4k, 3× rent); 5× on top tiers** |
| **QuintoAndar Proteção contra Danos** [official] | Included, ≤ R$50k | Included (R$296 to 1,210) | **Excluded** | **Excluded** | n/a | Partner vistorias at entry and exit; price table; depreciation; mediation first |

**SUSEP and loss data.**

- Fiança locatícia premiums grew 24.4% in 2024, and the **loss ratio fell to 31.7%** (unverified: a BB Investimentos sector report as summarised by search; the [PDF](https://www.bb.com.br/docs/portal/upb/SetorialSeguros.pdf) returned 403).
- SUSEP Circular 710/2024 adds reporting fields for the fiança line [official] ([link](https://www2.susep.gov.br/safe/scripts/bnweb/bnmapi.exe?router=upload%2F29458)).
- **SUSEP does not publish loss data per coverage** (damage, painting, penalty) **or per state.** The aggregate is in SES/SUSEP (line 0746) and needs a manual extraction, which was not done.
- [inference] A loss ratio around 30% on annual charges of roughly 1 to 2 rents implies total paid losses (rent plus extras) of roughly 0.3 to 0.6× rent per covered lease-year. That is consistent with a base exit-cost line of about 0.2× rent per lease-year.

Incumbents sell **12 to 50× aggregate limits** because their rent cover runs **all the way to desocupação**, and they push legal cost onto in-house panels, paying landlord-side fees only as sucumbência. Severity per eviction is not published; the loss ratio (normally about 25 to 60% of the charge) is the only public severity-related signal [inference].

### Summary: exit costs without an eviction (no caução, before recovery from the tenant)

Occurrence is the share of leases per year with an *unpaid* cost of that type. Expected cost = base occurrence × base severity. The range uses low × low and high × high.

| Category | Occurrence, % of leases a year (low / base / high) | Severity, × monthly rent (low / base / high) | Expected annual cost per lease (× rent): base [range] | Extreme case? |
|---|---|---|---|---|
| 1. Damage beyond wear, incl. painting and cleaning (art. 23 III) | 3% / 8% / 21% | 0.3 / 0.7 / 1.5 | **0.056** [0.009 to 0.32] | No (rarely > 3×) |
| 2. Unpaid accessory charges at exit (condominium, IPTU, water, electricity) | 3% / 8% / 18% | 0.1 / 0.3 / 0.8 | **0.024** [0.003 to 0.14] | No |
| 3. Early-termination penalty (art. 4), unpaid | 2.5% / 6.4% / 20% | 0.5 / 1.2 / 2.5 | **0.077** [0.013 to 0.50] | No (capped at 3× by contract) |
| 4. Abandonment: rent to repossession plus cleaning and removal (excl. prior arrears) | 0.3% / 0.8% / 2.0% | 1.0 / 2.5 / 5.0 | **0.020** [0.003 to 0.10] | **Yes** |
| 5. Unauthorised alterations or restoration (art. 23 VI) | 0.3% / 1.0% / 2.4% | 0.3 / 1.0 / 3.0 | **0.010** [0.001 to 0.07] | Yes (tail only) |
| **Total** | about 18% of leases a year have ≥ 1 unpaid item (base, overlapping) | about 0.48× per move-out | **≈0.19** [0.03 to 1.1] | n/a |

All occurrence and severity cells are [inference] built from the evidence above. None is a measured Brazilian or South-region rate.

**Comparison with the model of the time.** The model used 0.9× rent per lease end ÷ 30 months ≈ **0.36× rent per lease-year**, about **2× the base case** here; the excess is a margin against inflated exit invoices. Against the business plan's 12% working guarantee fee on monthly rent (about 1.46× rent a year), the base case is about 13% of the fee. At the high case (about 1.1× rent a year), exit costs alone consume about 75% of the fee: high-churn coastal stock with no inspection controls and the termination penalty included.

### Options for the exit leg (for the decision, not locked at the time)

1. **Cover:** damage beyond wear, including painting and cleaning; abandonment costs; restoration after unauthorised alterations; *propter rem* accessory charges (condominium, IPTU, and utility accounts in the landlord's name).
2. **Sublimit ordinary exits at about 3× rent** (the CredPago market norm), and keep the full 6× for abandonment and judicially established exits, where severity actually exceeds 3×.
3. **Termination penalty**, the largest and least physical line: (a) exclude it, as QuintoAndar does; (b) cover it inside the 3× ordinary-exit sublimit, as CredPago does; or (c) cover it only when the unit stays vacant (actual loss), net of re-letting.
4. **Copy market controls:** a signed and photographed entry vistoria as a precondition, with hashes stored at signing; an exit vistoria by an independent inspector; a wear-and-tear exclusion with a reference price table (PINI or QuintoAndar style); depreciation on appliances and furniture; a claim window counted from key handover; mediation with the tenant before payment, with MUTAV then recovering from the tenant.
5. **Calibration data:** for each move-out over 24 months at a partner agency, record contract start and end and whether the exit came before the end of the term; penalty charged and collected; vistoria differences in R$; caução applied; unpaid residual after 90 days; abandonment (yes or no) and days to repossession; coastal or urban unit. This replaces every [inference] cell above.

> **Since this research:** the exit leg's claim categories are rent and charges until the keys are returned, damage beyond normal wear, court costs owed by the tenant, abandonment and repossession costs, and other debts listed in the instrument. Damage and abandonment claims require that the keys were returned or the unit repossessed. The early-termination penalty is a reserved category, **disabled** until the inclusion decision is made ([ADR 0012](../decisions/0012-fianca-aligned-guarantee-lifecycle.md)). Claims above the operator's per-call cap need the reserve admin's approval of the exact amount, `pay_claim` pays exactly the filed amount, and MUTAV may pay the landlord first from its own bank account and be reimbursed by the reserve. Payment service levels live in the operator platform, not in the program ([ADR 0021](../decisions/0021-claims-approval-amendment-exact-payment.md)).

## Open items

- Direct confirmation of the OAB/SC 2026 fee figure, the TJRS URC for October 2026, and TJPR court fees.
- Comarca-level eviction timing in the Litoral Norte.
- An insurer or garantidora data point on loss severity per eviction, and SUSEP SES line-0746 loss ratio and frequency.
- Secovi-RS monthly delinquency; one garantidora's share of guaranteed contracts reaching despejo; DataJud outcome classification for 2023 cohorts in the Litoral Norte comarcas (sample too small).
- Public tenure, turnover or devolution series for RS and SC; Tokio Marine and Too product terms; any Secovi-SP "motivos de devolução" series.

## Sources

- [CNJ DataJud public API documentation](https://datajud-wiki.cnj.jus.br/api-publica/) (queries run 2026-10-02 against `api-publica.datajud.cnj.jus.br`; TPU classes 92/93/94; subjects 14915, 9610 to 9614, 9593; G1 + JE)
- [IBGE PNAD Contínua 2024, Características gerais dos domicílios e dos moradores (PDF)](https://agenciadenoticias.ibge.gov.br/media/com_mediaibge/arquivos/15ec1d59965a24b0bb2817eaf9b6f490.pdf); SIDRA tables [6820](https://sidra.ibge.gov.br/tabela/6820) and [6821](https://sidra.ibge.gov.br/tabela/6821)
- [O Paraná: PNAD 2025 Paraná](https://oparana.com.br/cotidiano/pnad-2025-parana-tem-mais-idosos-mais-apartamentos-e-familia-menor/)
- [ND+: Santa Catarina households](https://ndmais.com.br/cidadania/mais-casas-menos-gente-por-lar-santa-catarina-tem-aumento-de-97-mil-domicilios-em-um-ano/)
- [CRECI-SC: Censo 2022 rented share](https://creci-sc.gov.br/p/noticias/censo-2022-um-em-cada-cinco-brasileiros-mora-em-domicilio-alugado-em-sc-proporcao-e-de-um-em-cada-quatro/2452/)
- [Sul21: RS 17% rent](https://sul21.com.br/geral-1/2025/08/rio-grande-do-sul-17-moram-de-aluguel-mostra-ibge/)
- [Lei 8.245/91 (Lei do Inquilinato)](https://www.planalto.gov.br/ccivil_03/leis/l8245.htm)
- [Direito Real: TJMG on liminar with a guarantee](https://direitoreal.com.br/noticias/para-o-tjmg-nao-cabe-liminar-de-despejo-em-contrato-com-garantia)
- [TJMG jurisprudence PDF](https://bd-login.tjmg.jus.br/jspui/bitstream/tjmg/2018/1/0206-TJ-JC-059.pdf)
- [Casillo Advogados: liminar with an ineffective fiança](https://www.casilloadvogados.com.br/a-possibilidade-de-despejo-liminar-quando-constatada-a-ineficacia-da-fianca-a-necessaria-mitigacao-do-art-59-%C2%A71o-ix-da-lei-de-locacoes/)
- [Cognijus: TJSC caução requirements](https://www.cognijus.com/blog/requisitos-de-caucao-em-acao-de-despejo-e-liminar-tribunal-de-justica-de-santa-catarina-tjsc)
- [Câmara: extrajudicial despejo bill](https://www.camara.leg.br/noticias/1168282-comissao-de-constituicao-e-justica-aprova-proposta-que-preve-despejo-extrajudicial-por-atraso-de-aluguel/)
- [CNN Brasil: extrajudicial despejo bill](https://www.cnnbrasil.com.br/politica/projeto-despejo-inquilino-inadimplente-camara-defesa-consumidor/)
- [Porto Seguro Fiança, general conditions OUT/24 (PDF)](https://www.portoseguro.com.br/content/dam/documentos/condicoes_gerais/solucoes_para_alugar/fianca_locaticia/2024/Condi%C3%A7%C3%B5es-Gerais-Seguro-Fian%C3%A7a.pdf)
- [Porto Seguro Fiança product page](https://www.portoseguro.com.br/seguro-fianca)
- [geracontratos: eviction duration](https://geracontratos.com.br/recursos/acao-despejo-quanto-tempo)
- [geracontratos: eviction cost](https://geracontratos.com.br/recursos/custo-acao-despejo-vale-pena)
- [Jusbrasil: despejo stages](https://www.jusbrasil.com.br/artigos/despejo-por-falta-de-pagamento-quais-os-prazos-e-etapas-do-processo/4433006313)
- [Jusbrasil: despejo duration](https://www.jusbrasil.com.br/artigos/quanto-tempo-demora-uma-acao-de-despejo-no-brasil/3503436041)
- [TJSE: Justiça em Números 2025](https://agencia.tjse.jus.br/noticias/item/16106-justica-em-numeros-2025-tjse-e-destaque-nacional-em-eficiencia-e-celeridade-processual)
- [Receita RS: taxa judiciária rates](https://atendimento.receita.rs.gov.br/quais-as-aliquotas-da-taxa-judiciaria)
- [Lei-RS 14.634/2014](https://www.legisweb.com.br/legislacao/?id=278745)
- [DPM: TJRS URC value](https://pauseperin.adv.br/noticia/tribunal-de-justica-do-rs-fixa-novo-valor-da-urc)
- [TJSC Cartilha de Custas (PDF)](https://www.tjsc.jus.br/documents/3061010/13196899/CARTILHADECUSTAS-ADVOGADOS.pdf/183a9673-0053-5a3d-a71b-fd91fbc7057e?t=1737497423076)
- [TJSC Regimento de Custas](https://www.tjsc.jus.br/web/corregedoria-geral-da-justica/normas-e-orientacoes/regimento-de-custas)
- [OAB/RS fee table 2026 (PDF)](https://admsite.oabrs.org.br/arquivos/honorarios-versao-2026.pdf)
- [OAB/RS fee table 2023 (PDF)](https://admsite.oabrs.org.br/arquivos/1678287561206.pdf)
- [OAB/SC fee calculator](https://calculadora-honorarios.oab-sc.org.br/) and [OAB/SC honorários](https://oab-sc.org.br/honorarios)
- [compagno: Porto Seguro Essencial](https://compagno.com.br/blog/como-funciona-o-seguro-fianca-locaticia-porto-seguro-essencial-12-20-ou-30-seguro-fianca-essencial/)
- [Tokio Marine seguro-fiança](https://www.tokiomarine.com.br/seguros-residenciais/seguro-fianca/)
- [garantiadealuguel: Tokio Marine summary](https://garantiadealuguel.org/seguro-fianca-tokio-marine-como-funciona-coberturas-e-simulacao-online/)
- [Creditas: renovation costs](https://www.creditas.com/exponencial/quanto-custa-reformar/)
- [Regente Imóveis: painting and repairs at exit](https://regenteimoveis.com.br/guia/locacao/pintura-reforma-saida-inquilino-quem-paga/)
- [portal.loft: CredPago/Loft](https://portal.loft.com.br/tudo-sobre-credpago-loft-fianca-aluguel/)
- [Loft CredPago](https://loft.com.br/credpago)
- [Reclame Aqui: CredPago/Loft complaint](https://www.reclameaqui.com.br/grupo-loft/credpagoloft-nao-cumpre-contrato-de-garantia-locaticia-e-nao-faz-ressarcimento-de-danos-no-imovel_Srm-XJY_WtYVBo7d/)
- [CredPago agency terms (termo_imob.pdf)](https://static.credpago.com/documentos/termo_imob.pdf)
- [CQCS: fiança locatícia premiums 2025](https://cqcs.com.br/noticia/seguro-fianca-locaticia-dispara-e-acumula-mais-de-r-795-milhoes-em-2025/)
- [SEGS: fiança locatícia 12 months](https://www.segs.com.br/seguros/421688-fianca-locaticia-gera-r-1-9-bilhao-em-12-meses-e-tem-alta-em-fevereiro-aponta-susep)
- [UNIFESP TCC 2020 on line 0746 loss ratios (PDF)](https://repositorio.unifesp.br/server/api/core/bitstreams/ce292c37-f723-4a08-a713-4ba33e502b0e/content)
- [QuintoAndar contract rules](https://user.quintoandar.com.br/contrato/186218/regras-locacao)
- [QuintoAndar damage protection](https://www.quintoandar.com.br/ajuda/artigo/tudo-sobre-a-garantia-contra-danos-da-protecao-quintoandar-3XCHid1z2oKlKmk3rCdD2)
- [QuintoAndar guide: termination penalty](https://www.quintoandar.com.br/guias/como-alugar/como-calcular-multa-rescisoria-aluguel/)
- [Segimob: tenants planning to move](https://segimob.com/quase-metade-dos-inquilinos-planeja-se-mudar-em-breve-mostra-pesquisa/)
- [Secovi-SP Pesquisa Mensal de Locação, Dec 2023 (PDF)](https://secovi.com.br/wp-content/uploads/2024/01/202312-pml.pdf)
- [Hub Imobiliário: Curitiba default rate](https://hubimobiliario.com/na-contramao-do-mercado-inadimplencia-na-locacao-imobiliaria-e-baixissima-em-curitiba/)
- [Conjur: abandonment of a leased property](https://www.conjur.com.br/2023-dez-04/abandono-do-imovel-locado-efeitos-praticos-ao-locatario-e-ao-locador/)
- [Vieira Braga: imissão na posse](https://vieirabraga.com.br/imissao-de-posse-como-obter-imovel-abandonado/)
- [spimovel: caução return](https://www.spimovel.com.br/blog/devolucao-da-caucao-(deposito)-para-o-inquilino-na-locacao-de-imoveis-como-funciona-na-pratica/3651/)
- [spimovel: early exit](https://www.spimovel.com.br/blog/inquilino-pode-sair-antes-do-fim-do-prazo-contratual-o-que-acontece/4007/)
- [Too Seguros blog](https://blog.tooseguros.com.br/seguro-fianca-cobre-a-multa-por-rescisao-entenda/)
- [Pottencial general conditions (PDF)](https://static.pottencial.com.br/sitefiles/FiancaLocaticia/CGFiancaLocaticia13.pdf)
- [Chubb general conditions 12/2025 (PDF)](https://www.chubb.com/content/dam/chubb-sites/chubb-com/br-pt/condicoes-gerais/riscos-financeiros/fianca-locaticia-processo-susep-15414-632334-2019-71-versao-a-partir-de-12-12-2025.pdf)
- [BB Investimentos sector report (PDF, returned 403)](https://www.bb.com.br/docs/portal/upb/SetorialSeguros.pdf)
- [SUSEP Circular 710/2024](https://www2.susep.gov.br/safe/scripts/bnweb/bnmapi.exe?router=upload%2F29458)

## Decisions

- [ADR 0012: Guarantees aligned with a limited fiança onerosa](../decisions/0012-fianca-aligned-guarantee-lifecycle.md) (exit leg pays liquidated tenant debts; `EXHAUSTED` state; termination penalty disabled)
- [ADR 0016: Coverage ratio below 1.0, with a 0.10 floor and a provisions term](../decisions/0016-coverage-ratio-below-one.md)
- [ADR 0021: Claims: approval, amendment and exact payment](../decisions/0021-claims-approval-amendment-exact-payment.md) (bank-first payment; payment service levels off-chain)
- [ADR 0022: Coverage: stress buffer and underwater reserve](../decisions/0022-coverage-stress-buffer-underwater-reserve.md) (claims as events; stress buffer)
