# MUTAV: product demo script (v8)

Companion to the storyboard (`storyboard.html`); the two match.

- **Runtime:** 2:19.5 (≤ 2:20). **Voiceover:** 246 words, verbatim below. Hybrid: cold open and chapters 1–2 live on devnet; the agency beat is a browser mockup of the agency dashboard from a local copy with fictional data (off-chain); chapter 3 is a ledger-driven motion piece built from a local simulation on an accelerated clock.
- **Recorded**, not live: silent clips (injected test wallet, no pop-ups), a rough cut with titles, timer and cards, then the VO recorded to the cut. Frames are tagged MAIN / FLASH / END STATE.
- **Numbers:** devnet chapters on the staged reserve (c = 0.25; v8.1: R$44,500 held, R$36,000 required, R$8,500 free, value per share 0.6068); chapter 3 numbers come from the v2 localnet ledger (accelerated clock, mock BRS mint; statement months Nov 2026 → Apr 2027). Ana, agency names and lease references are fictional.
- **v8 changes:** the on-chain proof is made visible: short Explorer flashes on devnet (register_guarantee, the refused MTV-PF-0101 transaction landing as a failed transaction, pay_claim, settle_payout), a transaction receipt card after each on-chain action and a transaction rail through chapters 1–2 (§3a). Chapter 3 is rebuilt around the ledger-driven motion piece `ch3-flows` (27.4 s) with the v2 simulation numbers (three small claims, no admin approval; share value 1.000 → 1.144); app screenshots become optional cutaways. The close gains a 2 s cutaway to `/reserve/verify` under "Verify everything on Solana". The F7 line now says "the PIX to the landlord", as the app does. The flashes replace holds (F6 tail, F7 waits), so the runtime stays 2:19.5.
- **v8.1 (devnet numbers):** the staged reserve now holds R$44,500 (a guarantee-fee round is booked: R$625 gross over 3 invoices, R$500 net into the reserve), so the refusal is R$500 short and the rule line reads "the reserve holds forty-four and a half" (246 words). The claim window on this demo deploy was raised to R$50,000 per 31 days (disclosed in the repo README), so Ana's full R$1,500 claim fits and can be retaken; the R$500 alternate is gone.
- **Labels:** the app banner names the environment ("Pilot demo · Solana devnet", or "Local simulation · accelerated clock" with `NEXT_PUBLIC_ACCELERATED_CLOCK=1`, PR #72); no corner badges; at most one more honesty label per shot. The chapter 3 motion piece carries its own "Local simulation · accelerated clock" and "Mock BRS mint · local validator" lines.

## 1. Beats

| Time | Beat | Frames |
|---|---|---|
| 0:00 (10 s) | Cold open | F1 |
| 0:10 (7 s) | Agency | F2 |
| 0:17 (40 s) | 1 · Programmable, transparent reserve | F3–F6b |
| 0:57 (41 s) | 2 · Programmable payments, settled in minutes | F7–F8b |
| 1:38 (30.4 s) | 3 · Capital efficiency (local simulation) | F9–F13 |
| 2:08.4 (11.1 s) | Close | F14a–F14 |

## 2. Voiceover (verbatim)

> **0:00 · Cold open** Ana wants to rent an apartment in Passo Fundo. Her landlord wants a guarantor. MUTAV is that guarantor, and its reserve runs on Solana.
>
> **0:10 · Agency** Nineteen agencies signed letters of intent with MUTAV. Solana gives them a transparent reserve and programmable payments.
>
> **0:17 · 1 · Programmable, transparent reserve** Our operator puts Ana's lease on-chain: eighteen thousand reais of cover, an opaque ID, no personal data. Anyone can watch the reserve: what it holds in BRS, Nora's Brazilian real stablecoin, and what it must hold. The rule is code. One more lease would need forty-five thousand; the reserve holds forty-four and a half. (click) Refused. MUTAV can't promise what its reserve can't back.
>
> **0:57 · 2 · Programmable payments, settled in minutes** Say Ana misses a month. The operator files the claim, the reserve pays within the admin's cap, and the PIX to the landlord is recorded on-chain. On-chain, filed to settled in [N] seconds. Seguro-fiança allows up to thirty days. Today our operator console signs these steps. Next, the agency platform drives them automatically, registry, claims and payments, inside safeguards the program already enforces.
>
> **1:38 · 3 · Capital efficiency** Here are six months of it, simulated locally on an accelerated clock. Guarantee fees and the reserve's yield flow in; small claims flow out. The reserve can back more leases, each share is worth more, and a capital provider takes out more than they put in. The same reserve that protects the landlord pays the people who fund it.
>
> **2:08 · Close** Verify everything on Solana. MUTAV: a transparent, programmable reserve, claims settled in minutes, capital that works. Brazil's onchain rent guarantee.

**F7 claim window:** The claim window on this demo deploy is R$50,000 per 31 days (raised from the pilot's R$20,000 so the live claim can be retaken; disclosed in the repo README) and R$32,000 of it is left (two earlier test claims, R$16,000 + R$2,000). Ana's R$1,500 claim fits, and so do full R$1,500 retakes; after her claim the window reads R$19,500 / R$50,000. Rehearse F7 on localnet first. If only the capture was bad, re-capture the screens, not the claim.

**F8b wording:** the safeguards are live on devnet today; the agency-platform integration is next (roadmap). Keep "Today … Next …" as written; don't say or caption that the agency platform drives the program now.

[N] comes from the real on-chain timestamps of **Ana's** claim (settled_at − filed_at on her ClaimFiling PDA), not from the page's "slowest filed → paid" figure (that comes from the earlier test claims). Fill it in before recording the VO. Say "seconds" if it is under 2 minutes and "minutes" otherwise, and round down, never up. The line describes this on-chain run only; it does not claim real-world claims settle in seconds, since the operator checks each claim first (the pitch covers that).

## 3. Shot list

**F1 · END STATE · Open · 0:00 – 0:10 · /reserve (Overview)**: Cold open: Ana needs a guarantor
- **On screen:** Product on screen from frame 1: the public reserve Overview after staging (R$44,500 held, R$36,000 required, 8 leases). No wallet. The #59 banner is visible.
- **VO:** "Ana wants to rent an apartment in Passo Fundo. Her landlord wants a guarantor. MUTAV is that guarantor, and its reserve runs on Solana."
- **Caption:** Built during the hackathon: Solana program + reserve app
- **Honesty label:** Built during the hackathon: Solana program + reserve app
- **Proof:** Live figures read from the devnet program accounts.
- **Edit:** Slow push-in ≤ 1.3× (motion). No title card before it. Start the clip on the settled frame (the page shows about 0.5 s of skeleton on load).
- **Retake:** Read-only: repeat freely.

**F2 · FLASH · Open · 0:10 – 0:17 · agency platform (local copy) · dashboard**: Agency
- **On screen:** A desktop browser mockup of the agency dashboard from a local copy with fictional data (not the live platform): the KPI cards, then a short scroll to the "Where the book sits" lifecycle pipeline. No domain in the address bar (it reads "MUTAV · Agency platform"); crop out the user email, the empty "Book in force" chart and the guarantees table (it shows R$ amounts). Built as in `production/motion-spec.md` (agency browser mockup). About 7 s.
- **VO:** "Nineteen agencies signed letters of intent with MUTAV. Solana gives them a transparent reserve and programmable payments."
- **Caption:** 19 agency LOIs · transparent reserve + programmable payments
- **Honesty label:** Agency platform · pre-hackathon · not on-chain yet
- **Proof:** None: off-chain, labelled as such.
- **Edit:** Browser mockup: the window rises, one gentle push on the KPI cards, a scroll to the pipeline, flattened straight-on for the read. Hard cut out.
- **Retake:** Read-only: repeat freely.

**F3 · MAIN · 1 · Programmable, transparent reserve · 0:17 – 0:27 · /operator · register_guarantee**: Ana's lease goes on-chain
- **On screen:** Chapter title (lower third, 2 s). Register tab, prefilled: opaque reference MTV-PF-0100, Imobiliária Planalto, rent R$1,500, 6× + 6×; green preview; click register_guarantee; "Confirmed" chip with the short signature. The transaction receipt card builds in on the confirmation (about 0:24.8–0:27.0) and the rail's first entry lands (register_guarantee · short sig · ✓).
- **VO:** "Our operator puts Ana's lease on-chain: eighteen thousand reais of cover, an opaque ID, no personal data."
- **Caption:** Rent R$1,500 · cover 6× + 6× = R$18,000
- **Honesty label:** none (banner only)
- **Proof:** A confirmed devnet transaction; its receipt from real `getTransaction` data.
- **Edit:** Main action at real speed; the form is prefilled, so there is no typing and no jump cut; one zoom on the chip; cut before the form advances to MTV-PF-0101.
- **Retake:** Consumes R$4,500 of free capital and the reference. Reset: close_guarantee VOID, then register as MTV-PF-0100b (the VOID lease stays visible as "closed").

**F4 · FLASH · 1 · Programmable, transparent reserve · 0:27 – 0:29 · Solana Explorer (devnet) · register_guarantee**: Explorer: Ana's lease, on-chain
- **On screen:** The register_guarantee transaction for MTV-PF-0100 on Explorer (devnet), decoded once the IDL is published on devnet: the instruction name, the MUTAV program, the new Guarantee account, "Success". Captured as an end state on devnet.
- **VO:** (the F3 line continues over this flash)
- **Caption:** register_guarantee · confirmed · Solana devnet
- **Honesty label:** none (banner only)
- **Proof:** The transaction itself, on a public explorer. *Pending the app team:* the IDL published on devnet so Explorer decodes the instruction; until then the flash shows the raw instruction data (still acceptable).
- **Edit:** Flash 2 s, hard cuts, on the beat.
- **Retake:** Read-only: repeat freely.

**F5 · END STATE · 1 · Programmable, transparent reserve · 0:29 – 0:39 · /reserve/coverage + /reserve Overview**: Anyone can watch the reserve
- **On screen:** /reserve/coverage with no wallet. After Ana's lease, the ceiling line reads R$162k of cover in use and R$16k free (of R$178k the reserve can back). The Coverage tab leads with "Allocated to coverage" and "Capacity left" (R$36,000 and R$34k before Ana; R$40,500 and R$16k after her lease). Where the VO is about held vs required, use the Overview line "Covered: holds 1.2× the R$36,000 it must hold" (before Ana; after Ana it reads against R$40,500: use the live line) plus the ceiling line. Guarantee rows are opaque hashes sorted by cover, so Ana's row position varies: point to it with an edit callout, don't rely on "the bottom row".
- **VO:** "Anyone can watch the reserve: what it holds in BRS, Nora's Brazilian real stablecoin, and what it must hold. The rule is code."
- **Caption:** Held R$44,500 · required R$36,000 → R$40,500
- **Honesty label:** none (banner only)
- **Proof:** The same state read independently by a public page.
- **Edit:** One zoom on held vs required (the Overview line), then the ceiling line (R$162k in use, R$16k free). Edit callout on Ana's row. Start on the settled frame.
- **Retake:** Read-only: repeat freely.

**F6 · MAIN · 1 · Programmable, transparent reserve · 0:39 – 0:55 · /operator · register_guarantee**: The refusal
- **On screen:** The form has auto-advanced to the next reference, MTV-PF-0101, same amounts (no typing). The result line matches the VO: "needs R$45,000 … holds R$44,500". Click send: the program refuses; the clean refusal message; the failed-transaction receipt (✗, InsufficientFreeCapital) and the rail's second entry (✗). The meter does not move. 3 s of silence.
- **VO:** "One more lease would need forty-five thousand; the reserve holds forty-four and a half. (click) Refused. MUTAV can't promise what its reserve can't back."
- **Caption:** Needs R$45,000 · holds R$44,500 · refused
- **Honesty label:** none (banner only)
- **Proof:** The program's own error (InsufficientFreeCapital, raw details collapsed). The transaction is sent with skipPreflight, so the refusal lands on-chain as a failed transaction (F6b); no Guarantee account is created and nothing in the reserve changes.
- **Edit:** Main action. Zoom on the preview, then the refusal; music out; 3 s silence on the unchanged meter. The 3 s v7 tail is gone: F6b takes its place. The ✗ receipt replaces the "Coverage gate · refused" chip (keep the chip as the fallback if the failed transaction can't be landed). *App change pending:* the preview headline is moving to required-vs-held too; capture whichever is live and keep the result line in frame.
- **Retake:** Repeatable: each try leaves one more failed transaction on-chain and changes nothing else.

**F6b · FLASH · 1 · Programmable, transparent reserve · 0:55 – 0:57 · Solana Explorer (devnet) · failed register_guarantee**: The chain itself refused it
- **On screen:** The failed MTV-PF-0101 transaction on Explorer: "Error · InsufficientFreeCapital", the MUTAV program, no account created.
- **VO:** (none: music back in after the silence)
- **Caption:** The chain itself refused it · InsufficientFreeCapital
- **Honesty label:** none (banner only)
- **Proof:** A failed transaction on a public explorer: the refusal is the program's, not the app's. *Pending the app/harness:* sending MTV-PF-0101 with skipPreflight so it lands; the IDL on devnet for the decoded error name.
- **Edit:** Flash 2 s on the downbeat as the music returns; hard cut to the "Later" wipe.
- **Retake:** Read-only once captured.

**F7 · MAIN · 2 · Programmable payments, settled in minutes · 0:57 – 1:16.5 · /operator · file_claim → pay_claim → settle_payout**: The claim, live
- **On screen:** "Later" wipe and chapter title. Live: file_claim, prefilled (R$1,500, Ana preselected, NTC-PF-0001; no typing) → pay_claim (zoom on the R$15,000 cap) → settle_payout; each click 2–3 s, the elapsed timer running from "filed". A receipt card after each confirmation and a new rail entry each time. Two Explorer flashes cut in on the beat: **pay_claim** (1:08.8–1:10.3) and **settle_payout** (1:14.8–1:16.5).
- **VO:** "Say Ana misses a month. The operator files the claim, the reserve pays within the admin's cap, and the PIX to the landlord is recorded on-chain."
- **Caption:** Claim R$1,500 · cap R$15,000 per call
- **Honesty label:** PIX transfer simulated on devnet · settlement recorded on-chain
- **Proof:** Three confirmed transactions on one ClaimFiling PDA; two of them shown on Explorer.
- **Edit:** Timer overlay driven by the logged on-chain timestamps (it jumps honestly across cuts and stays on screen over the flashes). The flashes replace the confirmation waits; they don't add time.
- **Retake:** Retakes fit: R$32,000 of the R$50,000 per-31-day claim window is left on this demo deploy, so a paid take can be redone with the full R$1,500 claim (same VO and caption). Each retake adds one more claim and R$1,500 less held: re-read the end-state figures for F8. Rehearse on localnet first. If only the capture was bad, re-capture the screens, not the claim.

**F8 · END STATE · 2 · Programmable payments, settled in minutes · 1:16.5 – 1:27 · /reserve/claims**: Filed → paid → settled
- **On screen:** /reserve/claims: Ana's row is the newest, on top: filed → paid → settled with her on-chain timestamps; the timer stops at settled. Hold about 2.8 s after the VO. Still covered: R$43,000 held, R$40,125 required. The timeline also lists the two earlier test claims (R$16,000 and R$2,000), fine on a disclaimed demo reserve. The page's "slowest filed → paid 1m 44s" summary comes from those test claims: frame Ana's row and her own times, and take [N] from them. The page says "received by landlord (PIX)", as the VO now does.
- **VO:** "On-chain, filed to settled in [N] seconds. Seguro-fiança allows up to thirty days."
- **Caption:** Filed → settled on-chain: [N] s · seguro-fiança: 30 days
- **Honesty label:** PIX transfer simulated on devnet · settlement recorded on-chain
- **Proof:** Timestamps from Ana's ClaimFiling PDA. [N] = settled_at − filed_at; the unit is "seconds" if under 2 minutes, "minutes" otherwise. Do not claim real-world claims settle in seconds: the operator checks each claim first.
- **Edit:** Hold still ≤ 2× on Ana's three timestamps. SUSEP Circ. 621/2021 art. 43 goes in the video description.
- **Retake:** Read-only: repeat freely.

**F8b · END STATE · 2 · Programmable payments, settled in minutes · 1:27 – 1:38 · /reserve/risks (devnet)**: Next: the agency platform drives the steps
- **On screen:** A cut to /reserve/risks on devnet (live), with the safeguards card overlaid: "Automation safeguards (on-chain today): R$15,000 per payment · R$20,000 per 31 days · payouts only to MUTAV's fixed payments account · larger claims need the admin multisig's approval · a guardian can pause". The corner diagram lights "agency platform → operator" in the "next" colour, labelled as roadmap.
- **VO:** "Today our operator console signs these steps. Next, the agency platform drives them automatically, registry, claims and payments, inside safeguards the program already enforces."
- **Caption:** Safeguards on-chain today · agency automation next
- **Honesty label:** none besides the card (the card says "on-chain today" and "agency platform → operator: roadmap, not live")
- **Proof:** Every listed safeguard is live in the devnet program. On /reserve/risks today: the per-payment and per-31-day caps and the admin approval; **the fixed payments account (pending app row)** and **the guardian pause (pending app row)** get their rows in a coming app PR. Until that is confirmed, the card carries all five (they are enforced by the program) and the page shows what it has. The agency-platform integration is not live; the wording keeps that clear.
- **Edit:** Hard cut in; the rail slides out at the cut (the card takes the space); the card builds in over 0.6 s and holds; `overlays/safeguards-card.png` plus `overlays/minimap-roadmap.png`. No zoom.
- **Retake:** Read-only: repeat freely.

**F9 · FLASH · 3 · Capital efficiency · 1:38 – 1:39.5 · transition card (edit)**: Switch: six months, simulated
- **On screen:** A 1.5 s card marks the switch from devnet to the local simulation.
- **VO:** (no voiceover: the card carries the switch)
- **Caption:** Six months, simulated locally on an accelerated clock
- **Honesty label:** none (banner only)
- **Proof:** None: a card.
- **Edit:** Hard cut in; the chapter 3 lower third starts on the next shot.
- **Retake:** Made in the editor.

Chapter 3 (F10–F13) is one ledger-driven motion piece, production asset `ch3-flows` (27.4 s, 1920×1080, kept with the team's production files and rendered from the v2 ledger): a chart of monthly guarantee fees (amber), reserve yield (blue) and claims (red), a share-value panel, a scrolling operations list, running totals, and the finale card. Every figure in it comes from the ledger; nothing is typed by hand. The piece carries "Local simulation · accelerated clock" and "Mock BRS mint · local validator". App screenshots from the localnet simulation are **optional** supporting cutaways (≤ 2 s each, at most two, replacing seconds of the piece, never added): the `/reserve` **Money** tab (its chart is the reserve balance, with the simulated dates Nov → Apr and no share-price line; the figure is labelled "Share price"), `/reserve/claims` (C1–C3) and the `/reserve` Overview ceiling line. `/capital` has no in → out view: the piece's finale covers it.

**F10 · END STATE · 3 · Capital efficiency · 1:39.5 – 1:48.4 · motion piece `ch3-flows` 0.0–8.9 s**: Six months: fees and the reserve's yield flow in
- **On screen:** "What moves the reserve": the chart draws in; Nov and Dec bars land (fees amber, reserve yield blue; C1 R$1,800 in red in Dec); the operations list scrolls (capital in, guarantee fees per agency, the BRS issuer revenue); the share value starts at 1.0000 and steps up (1.0207 at the end of Nov, 1.0332 Dec).
- **VO:** "Here are six months of it, simulated locally on an accelerated clock. Guarantee fees and the reserve's yield flow in;"
- **Caption:** Six months · 3 claims paid
- **Honesty label:** in the piece ("Local simulation · accelerated clock"; "Mock BRS mint · local validator")
- **Proof:** Every bar and row from the v2 ledger of the localnet run (the same program build), mock BRS mint.
- **Edit:** Full frame, no extra zoom (the piece has its own camera). Optional cutaway: the `/reserve` Money tab (reserve balance chart, Nov → Apr).
- **Retake:** Re-render from the ledger.

**F11 · END STATE · 3 · Capital efficiency · 1:48.4 – 1:53.9 · motion piece 8.9–14.4 s**: Small claims flow out
- **On screen:** Jan → Feb: fees and reserve yield keep landing; claim C2 R$2,800 (Feb) goes out in red, filed → paid → settled, as C1 did in Dec; the share value keeps rising (1.0643, 1.0805), with no dip.
- **VO:** "small claims flow out." (then about 3.8 s with no voice: the bars carry it)
- **Caption:** Claims R$1,800 · R$2,800 · R$2,300 · filed → paid → settled
- **Honesty label:** in the piece
- **Proof:** The ledger's claim_filed and claim_paid operations (no approve_claim: every claim is under the R$15,000 per-call cap).
- **Edit:** Full frame. Optional cutaways: `/reserve/claims` on localnet (the three claims), or one Explorer frame on the local validator (custom RPC), labelled "local validator".
- **Retake:** Re-render from the ledger.

**F12 · END STATE · 3 · Capital efficiency · 1:53.9 – 2:01.3 · motion piece 14.4–21.8 s**: More cover, and each share worth more
- **On screen:** Mar → Apr: claim C3 R$2,300 goes out (Mar); the share-value panel reaches 1.1035, then 1.1439; the totals settle (reserve R$152,776.54; fees, reserve yield and claims paid).
- **VO:** "The reserve can back more leases, each share is worth more, and a capital provider takes out more than they put in" (the line runs on into F13 and lands on the finale's in → out)
- **Caption:** Can back R$490k → R$611k of cover · second callout: Share value 1.000 → 1.144
- **Honesty label:** in the piece
- **Proof:** Ledger month-end values: ceiling ("can back up to") R$489.9k (Nov) → R$611.1k (Apr); share value 1.0000 → 1.1439.
- **Edit:** The ceiling is not a straight climb: it peaks at R$637.8k at the end of Mar (M5) and ends at R$611.1k, so the caption reads start → end. The piece has no ceiling panel; the caption carries it (from the ledger), or an optional cutaway of the `/reserve` Overview ceiling line on the localnet end state.
- **Retake:** Re-render from the ledger.

**F13 · END STATE · 3 · Capital efficiency · 2:01.3 – 2:08.4 · motion piece 21.8–27.4 s + 1.5 s hold**: Capital out, above what went in
- **On screen:** The finale card: "Capital provider (investor-1) · six simulated months": R$20,000 in (2026-11-02, at 1.000000 per share) → R$22,878.27 out (2027-04-27, at 1.143913); share value 1.0000 → 1.1439; the line **"Simulation of reserve mechanics · not an expected return"**.
- **VO:** "(… more than they put in.) The same reserve that protects the landlord pays the people who fund it."
- **Caption:** R$20,000 in → R$22,878 out · simulated
- **Honesty label:** in the piece, plus the finale card's "Simulation of reserve mechanics · not an expected return" (Julia's decision)
- **Proof:** The ledger's withdrawal (fulfil_redeems) at 1.143913.
- **Edit:** Hold the piece's last frame 1.5 s. Reais only; no rate, APY or percentage.
- **Retake:** Re-render from the ledger.

**F14a · END STATE · Close · 2:08.4 – 2:10.4 · /reserve/verify (devnet)**: Verify everything on Solana
- **On screen:** A 2 s cutaway to `/reserve/verify` on devnet: every account of the reserve with its Explorer link.
- **VO:** "Verify everything on Solana."
- **Caption:** Verify everything on Solana · reserve.mutav.finance/reserve/verify
- **Honesty label:** none (banner only)
- **Proof:** The accounts list itself; each link opens Explorer.
- **Edit:** Hard cut in; one slow push; start on the settled frame.
- **Retake:** Read-only: repeat freely.

**F14 · END STATE · Close · 2:10.4 – 2:19.5 · card (made in the editor)**: Close
- **On screen:** The three pillars, one line each, then the tagline, the repo and the live app.
- **VO:** "MUTAV: a transparent, programmable reserve, claims settled in minutes, capital that works. Brazil's onchain rent guarantee."
- **Caption:** reserve.mutav.finance · open source (MIT)
- **Honesty label:** none (banner only)
- **Proof:** —
- **Edit:** Hold to 2:19.5 (9.1 s). Pillar 2 on the card may stay "Claims settled in minutes"; chapter 2's title is "Programmable payments, settled in minutes".
- **Retake:** Made in the editor.

## 3a. On-chain proof made visible

The judges should see the transactions on Solana, not only the app's view of them. Three devices, all fed by real data:

| Device | Where | What it shows | Status |
|---|---|---|---|
| **Explorer flashes** (devnet, 1.5–2 s each, on the beat) | F4 register_guarantee (MTV-PF-0100) · F6b the failed MTV-PF-0101 transaction ("Error · InsufficientFreeCapital") · F7 pay_claim and settle_payout for Ana | The transaction on Solana Explorer, decoded | Decoding needs the IDL published on devnet (**pending the app team**). F6b needs MTV-PF-0101 sent with skipPreflight so the refusal lands (**pending the app/harness**). |
| **Transaction receipt** (`production/overlays/tx-receipt.html`) | Over the confirmation frame after each on-chain action: F3, F6 (✗), F7 ×3; about 1.5–2 s each, lower left | Instruction name, short signature, slot, block time, fee, status, "Solana devnet" | Values from real `getTransaction` data in `tx-receipts.json` (**pending**); render with `render.cjs receipts`. The committed PNGs are samples with placeholder values. |
| **Transaction rail** (`production/overlays/tx-rail.html`) | Right edge, 0:24.5 → 1:27.0 (F3 through F8); slides out at the cut to F8b | Each signature as it lands: instruction · short sig · ✓ or ✗, accumulating (5 entries) | Same data file; one rail state per landed transaction. |

This replaces v7's "one Explorer shot only" rule. Keep each flash short and on the beat; the flashes replace holds (F6's tail, F7's confirmation waits), they don't add to them. Chapter 3's operations list already shows the simulated activity; an Explorer frame there is optional and must be labelled "local validator". The close's `/reserve/verify` cutaway (F14a) points to every account.

## 4. Numbers

**Devnet chapters (staged reserve, program GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV, c = 0.25).** A guarantee-fee round is booked (R$625 gross over 3 invoices, R$500 net into the reserve). The claim window on this demo deploy is R$50,000 per 31 days (raised from the pilot's R$20,000 for retakes; disclosed in the repo README); R$32,000 is left (two earlier test claims, R$16,000 + R$2,000), so Ana's R$1,500 and full retakes fit.

| Step | Action | Stable assets | Coverage required | Free capital | Value per share | Check |
|---|---|---|---|---|---|---|
| 0 | Staged devnet reserve (earlier test claims, one guarantee-fee round): R$44,500 held, 73,333.33 shares at 0.606818 | R$44,500 | — | — | 0.606818 | TVL ≪ R$1M |
| 1 | Book: 8 leases MTV-PF-0001…0008, R$18,000 cover each = R$144,000 | R$44,500 | R$36,000 | R$8,500 | 0.606818 | R$18k ≤ R$120k per guarantee; can back R$178k, capacity left R$34k |
| 2 | Ana MTV-PF-0100: + R$18,000 cover (operator) | R$44,500 | R$40,500 | R$4,000 | 0.606818 | fits: needs R$4,500 of R$8,500; cover R$162k in use, capacity left R$16k |
| 3 | Next equal lease MTV-PF-0101: would need R$45,000 | R$44,500 | R$40,500 | R$4,000 | 0.606818 | refused: R$500 short; a failed transaction lands, nothing else changes |
| 4 | file_claim R$1,500 on Ana, default leg | R$44,500 | R$40,500 | R$4,000 | 0.586364 | set aside; required = max(c × cover, provisions) |
| 5 | pay_claim R$1,500 | R$43,000 | R$40,125 | R$2,875 | 0.586364 | still covered; ≤ R$15k/call; the claim window reads R$19,500 / R$50,000 |

**Chapter 3 · local simulation, v2 ledger** (local validator, accelerated clock, mock BRS mint; statement months Nov 2026 → Apr 2027; fees 12 × rent of the month, c = 0.25). Reais and share values only: no rate or APY. The /simulator projections are not in the video.

| Month | 1 · Nov | 2 · Dec | 3 · Jan | 4 · Feb | 5 · Mar | 6 · Apr |
|---|---|---|---|---|---|---|
| Share value (month-end) | 1.0207 | 1.0332 | 1.0643 | 1.0805 | 1.1035 | 1.1439 |
| Coverage ceiling ("can back up to") | R$489.9k | R$597.2k | R$615.1k | R$624.5k | R$637.8k (peak) | R$611.1k |
| Guarantee fees, net into the reserve | R$1,065.60 | R$1,891.20 | R$2,716.80 | R$3,340.80 | R$3,792.00 | R$4,176.00 |
| Reserve yield (BRS issuer revenue) | R$1,412.43 | R$1,721.64 | R$1,773.42 | R$1,800.42 | R$1,838.83 | R$2,025.67 |
| Claims paid | — | R$1,800 | — | R$2,800 | R$2,300 | — |
| Reserve at month-end | R$122,478.03 | R$149,290.87 | R$153,781.09 | R$156,122.31 | R$159,453.14 | R$152,776.54 |
| Active leases | 5 | 9 | 13 | 16 | 18 | 20 |

| Claim | Lease | Amount | Filed | Paid | Settled |
|---|---|---|---|---|---|
| C1 | MTV-PF-0003 | R$1,800 | 2026-12-12 | 2026-12-14 | after paid (settle_payout records the PIX hash; it moves no money) |
| C2 | MTV-PF-0007 | R$2,800 | 2027-02-09 | 2027-02-11 | after paid |
| C3 | MTV-PF-0009 | R$2,300 | 2027-03-12 | 2027-03-14 | after paid |

All three are under the R$15,000 per-call cap: no approve_claim.

| Item | Value |
|---|---|
| Capital provider (investor-1) | Deposited R$20,000 on 2026-11-02 at 1.000000 per share; withdrew everything on 2027-04-27 at 1.143913: **R$22,878.27** |
| Other capital | R$100,000 from MUTAV's capital account (Nov), R$25,000 from a second provider (Dec), a R$10,000 capital top-up (Apr) |
| Six-month totals | Guarantee fees R$16,982.40 net (R$21,228 gross; the R$4,245.60 treasury take never enters the reserve) · reserve yield R$10,572.41 · claims paid R$6,900 |
| End state · reserve | R$152,776.54 held; 20 leases, cover R$515,100; required R$128,775; free R$24,001.54 |
| End state · ceiling | R$611,106.17, headroom R$96,006.17 |

Captions read start → end: the ceiling peaks at R$637.8k at the end of month 5 and ends at R$611.1k; the share value rises every month (no dip).

## 5. Route map

| Route | Before #45 | On main (#45 merged) | Used in |
|---|---|---|---|
| / | Landing | Redirects to /reserve (the MUTAV landing is mutav.finance) | — |
| /reserve | Transparency, one long page | Overview + sub-routes | F1, F5 (devnet) · optional F12 cutaway (localnet) |
| /reserve/coverage | — (section) | Coverage tab | F5 |
| /reserve/claims | — (section #claims) | Claims tab | F8 (devnet) · optional F11 cutaway (localnet) |
| /reserve, Money tab | — (#flows, #queue) | Money tab (reserve balance chart, flows, queue; "Share price") | optional F10 cutaway (localnet) |
| /reserve/risks | — (#disclosures) | Risks tab | F8b (devnet) |
| /reserve/verify | — (#accounts) | Verify tab: every account with an Explorer link | F14a (devnet) |
| /capital | — (old capital page) | Capital queue (old paths redirect here); no in → out view | — (the motion piece covers in → out) |
| /operator | Operator console | Same, restyled; forms prefilled for the demo; "Refresh on-chain" button | F3, F6, F7 |
| /admin | Squads proposals | Same, restyled | off camera (fills) |
| /demo | Guided six steps | Redirects to /operator | — |
| Solana Explorer (devnet) | — | Transaction pages | F4, F6b, F7 flashes |
| agency platform | Pre-existing (mutav-app) | A local copy with fictional data, not the live platform | F2 |

## 6. Capture order

| # | Step | Who | Where |
|---|---|---|---|
| 1 | Devnet program GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV deployed and staged (done): R$44,500 held, R$36,000 required, R$8,500 free, 8 leases | — | done |
| 2 | Load the operator's agency records in the recording browser. Set `localStorage` `mutav-transparency-intro-v1` = `1` (or click Skip on the intro) | Recorder | — |
| 3 | Rehearse chapters 1–2 on localnet with the same numbers (F7 rehearsed there first; retakes fit on devnet) | Recorder | — |
| 4 | Right before recording, press "Refresh on-chain" on /operator (it sends the permissionless `refresh`). Devnet capture: F1, F3 (Ana MTV-PF-0100, prefilled), F4, F5, F6 (auto-advanced to MTV-PF-0101, sent with skipPreflight), F6b, then the claim (F7), F8, F8b (/reserve/risks), F14a (/reserve/verify). Start every clip on the settled frame (about 0.5 s of skeleton on load). Log each signature and block time; write `tx-receipts.json` from `getTransaction`. F2 is captured from the local agency copy (dashboard: KPI cards → "Where the book sits"; no domain in the address bar) | Operator; anyone | — |
| 5 | Explorer flashes on devnet: register_guarantee, the failed MTV-PF-0101, pay_claim, settle_payout (decoded once the IDL is on devnet) | Recorder | — |
| 6 | Localnet simulation (done): six simulated months, Nov 2026 → Apr 2027, v2 ledger (fees, reserve yield, three small claims, a capital provider's withdrawal); figures in §4. The motion piece `ch3-flows` is rendered from the ledger (27.4 s) | Simulation script; editor | local |
| 7 | Optional localnet cutaways for F10–F12 (Money tab, claims, Overview ceiling) with `NEXT_PUBLIC_ACCELERATED_CLOCK=1` (the banner reads "Local simulation · accelerated clock") | Recorder | — |
| 8 | Edit: chapter titles, the transition card (F9), the timer, the receipts and the rail (`render.cjs receipts`), the safeguards card and roadmap minimap (F8b), the close card | Editor | — |

## 7. Capture, voice, captions

- **Before rolling:** set `localStorage` `mutav-transparency-intro-v1` = `1` in the recording browser (or click Skip on the "How to read this page" intro); press **Refresh on-chain** on /operator; start every clip on the settled frame (about 0.5 s of skeleton on load).
- Chapter 3 is the motion piece; optional localnet cutaways are recorded with `NEXT_PUBLIC_ACCELERATED_CLOCK=1` so the banner reads "Local simulation · accelerated clock" (PR #72). No corner badges; keep the 1.5 s switch card.
- Five live clicks on devnet (register, refused send, file, pay, settle), all on prefilled forms; log on-chain times for the timer and the signatures for the receipts, the rail and the Explorer flashes.
- Harness screencast: 1080p at 30 fps; 2× stills on holds only. Zooms over motion ≤ 1.3×, on holds up to 2×. The capture harness on `feat/demo-capture` is outdated (pre-#45 routes, no intro key): capture by hand or update it first.
- English VO, English burned-in captions + SRT; optional PT-BR SRT for the Superteam Brazil jury. SUSEP Circ. 621/2021 art. 43 in the description.

## 8. Run sheet (BRT)

| When | What |
|---|---|
| Oct 12 · morning | Rehearse chapters 1–2 on localnet (F7 first there). The chapter 3 ledger and motion piece are done; figures in §4. |
| by 12:00 | Staging is done (R$44,500 held, R$36,000 required, R$8,500 free, 8 leases, Normal). Set the intro key; press "Refresh on-chain" on /operator right before rolling. Devnet capture of F1, F3–F8b and F14a (claim retakes fit); the four Explorer flashes; F2 from the local agency copy. Read [N] from Ana's claim timestamps; write `tx-receipts.json`. |
| 12:00–13:00 | Render the receipts and rail from `tx-receipts.json`; optional localnet cutaways for chapter 3. |
| 13:00–15:00 | Rough cut; record the VO to the cut with [N] filled in. |
| 15:00–18:00 | Fine-tune; English burned-in captions + SRT; optional PT-BR SRT. |
| 18:00 | Review muted and with sound: ≤ 2:20, one honesty label per shot, every flash ≤ 2 s. |
| 19:00 | Export, upload unlisted, test in a private window. |
| 19:30 | Judge-ready check of reserve.mutav.finance in a private window. |
| 20:00 | Submit (Colosseum + Superteam BR track). |
| 23:00 | Hard stop; the rest is buffer. |

## 9. Risks

| Risk | Where | What to do |
|---|---|---|
| Claim take fails | F7 | R$32,000 of claim window is left (R$50,000 per 31 days on this demo deploy): retake with the full R$1,500 claim. Rehearse on localnet first; re-read the end-state figures after a retake. If only the capture was bad, re-capture the screens. |
| Refusal doesn't land on-chain | F6b | Needs skipPreflight on the MTV-PF-0101 send (pending app/harness). Without it, drop F6b, keep the "Coverage gate · refused" chip in F6 and give the 2 s back to the F6 tail. |
| Explorer shows raw bytes | F4, F6b, F7 | The IDL is not yet on devnet (pending the app team). Raw data is acceptable for 2 s; the receipt card names the instruction. |
| State drifted | F6 | Free capital before Ana must be in [R$4,500, R$9,000). Close strays with close_guarantee VOID. |
| Known app behaviours | F3, F6, F7 | Register advances to MTV-PF-0101 with a red preview (cut before it in F3); paid and settled rows vanish. Workarounds per shot; fixes in app-requirements. |
| Skeleton or intro in frame | all app shots | Set `mutav-transparency-intro-v1` = `1` (or Skip); start clips on the settled frame. |
| Stale devnet share value | F1, F5 | Press "Refresh on-chain" on /operator right before recording. |
| Ledger re-run changes numbers | F10–F13 | The figures in §4 come from the v2 ledger. If it is re-run, re-render the motion piece from it and update §4 and the captions together. |
| Over 2:20 | edit | Trim F5 (−2 s), then shorten F13's 1.5 s hold; never trim the silence, a flash below 1.5 s, or the F8b safeguards read. |
| Automation read as live | F8b | The VO says "Today … Next …"; the card says "on-chain today" for the safeguards and "roadmap" for agency platform → operator. Keep both; no caption may say the agency platform drives the program now. |
| Claim under two minutes | F8 | [N] from Ana's settled_at − filed_at (not the page's "slowest" figure): "seconds" under 2 min, "minutes" otherwise; round down. |

## 10. What judges will see afterwards

| Artefact | How it reads |
|---|---|
| /reserve (devnet) | Covered, mode Normal: R$43,000 held, R$40,125 required, value per share 0.586364 (the payoff is in the local simulation, not on devnet) |
| Ana's guarantee (MTV-PF-0100) | Active · default left R$7,500 · exit left R$9,000 · opaque id, no names |
| /reserve/claims (devnet) | Three claims: the two earlier test claims (R$16,000 and R$2,000) and Ana's R$1,500, filed → paid → settled (one more per claim retake) |
| The refused lease | A failed register_guarantee transaction on Explorer (InsufficientFreeCapital); no Guarantee account, no change to the reserve |
| /reserve/verify | Every reserve account with its Explorer link |

## 11. Open production decisions

1. Plan B (fits the devnet BRS in hand) or Plan A (pilot product; needs more sandbox BRS and a 12× form).
2. Which optional chapter 3 cutaways, if any, make the cut.
3. Narrator, pronunciation of "MUTAV", face cam or not.
