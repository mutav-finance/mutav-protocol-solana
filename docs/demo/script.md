# MUTAV: product demo script (v7)

Companion to the storyboard (`storyboard.html`); the two match.

- **Runtime:** 2:19.5 (≤ 2:20). **Voiceover:** 245 words, verbatim below. Hybrid: cold open and chapters 1–2 live on devnet; the agency beat is a browser mockup of the agency dashboard from a local copy with fictional data (off-chain); chapter 3 a local simulation on an accelerated clock.
- **Recorded**, not live: silent clips (injected test wallet, no pop-ups), a rough cut with titles, timer and cards, then the VO recorded to the cut. Frames are tagged MAIN / FLASH / END STATE.
- **Numbers:** devnet chapters on the staged reserve (c = 0.25); chapter 3 numbers come from the localnet run (accelerated clock, mock BRS mint; statement months Nov 2026 → Apr 2027). Ana, agency names and lease references are fictional.
- **v7 changes:** the agency beat is now the dashboard (KPI cards → "Where the book sits") with the 19-agency letters-of-intent line; chapter 2 is renamed "Programmable payments, settled in minutes" and ends with a new beat (F8b) on the safeguards that let the agency platform drive the operator steps next; `/operator` forms come prefilled and carry a "Refresh on-chain" button; `/` redirects to `/reserve` and `/demo` to `/operator`; the claim window has R$6,700 of room, so a full R$1,500 retake fits. Time for the new beat comes from the F8 hold, the F6 tail, chapter 3 and the close card.
- **Labels:** the app banner names the environment ("Pilot demo · Solana devnet", or "Local simulation · accelerated clock" with `NEXT_PUBLIC_ACCELERATED_CLOCK=1`, PR #72); no corner badges; at most one more honesty label per shot.

## 1. Beats

| Time | Beat | Frames |
|---|---|---|
| 0:00 (10 s) | Cold open | F1 |
| 0:10 (7 s) | Agency | F2 |
| 0:17 (41 s) | 1 · Programmable, transparent reserve | F3–F6 |
| 0:58 (44 s) | 2 · Programmable payments, settled in minutes | F7–F8b |
| 1:42 (29 s) | 3 · Capital efficiency (local simulation) | F9–F13 |
| 2:11 (8.5 s) | Close | F14 |

## 2. Voiceover (verbatim)

> **0:00 · Cold open** Ana wants to rent an apartment in Passo Fundo. Her landlord wants a guarantor. MUTAV is that guarantor, and its reserve runs on Solana.
>
> **0:10 · Agency** Nineteen agencies signed letters of intent with MUTAV. Solana gives them a transparent reserve and programmable payments.
>
> **0:17 · 1 · Programmable, transparent reserve** Our operator puts Ana's lease on-chain: eighteen thousand reais of cover, an opaque ID, no personal data. Anyone can watch the reserve: what it holds in BRS, Nora's Brazilian real stablecoin, and what it must hold. The rule is code. One more lease would need forty-five thousand; the reserve holds forty-four. (click) Refused. MUTAV can't promise what its reserve can't back.
>
> **0:58 · 2 · Programmable payments, settled in minutes** Say Ana misses a month. The operator files the claim, the reserve pays within the admin's cap, and the PIX to the agency is recorded on-chain. On-chain, filed to settled in [N] seconds. Seguro-fiança allows up to thirty days. Today our operator console signs these steps. Next, the agency platform drives them automatically, registry, claims and payments, inside safeguards the program already enforces.
>
> **1:42 · 3 · Capital efficiency** Here are six months of it, simulated locally on an accelerated clock. Guarantee fees and issuer revenue flow into the reserve. Claims are paid, large ones approved by the admin. The reserve can back more leases, each share is worth more, and a capital provider takes out more than they put in. The same reserve that protects the landlord pays the people who fund it.
>
> **2:11 · Close** MUTAV: a transparent, programmable reserve, claims settled in minutes, capital that works. Brazil's onchain rent guarantee.
>

**F7 retake:** the claim window has R$6,700 of room, so a retake repeats the full R$1,500 claim with the same VO and caption. A second paid claim changes the devnet end-state figures; re-read them for F8.

**F8b wording:** the safeguards are live on devnet today; the agency-platform integration is next (roadmap). Keep "Today … Next …" as written; don't say or caption that the agency platform drives the program now.

[N] comes from the real on-chain timestamps (settled_at − filed_at on the ClaimFiling PDA); fill it in before recording the VO. Say "seconds" if it is under 2 minutes and "minutes" otherwise, and round down, never up. The line describes this on-chain run only; it does not claim real-world claims settle in seconds, since the operator checks each claim first (the pitch covers that).

## 3. Shot list

**F1 · END STATE · Open · 0:00 – 0:10 · /reserve (Overview)**: Cold open: Ana needs a guarantor
- **On screen:** Product on screen from frame 1: the public reserve Overview after staging (R$44,000 held, R$36,000 required, 8 leases). No wallet. The #59 banner is visible.
- **VO:** "Ana wants to rent an apartment in Passo Fundo. Her landlord wants a guarantor. MUTAV is that guarantor, and its reserve runs on Solana."
- **Caption:** Built during the hackathon: Solana program + reserve app
- **Honesty label:** Built during the hackathon: Solana program + reserve app
- **Proof:** Live figures read from the devnet program accounts.
- **Edit:** Slow push-in ≤ 1.3× (motion). No title card before it.
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
- **On screen:** Chapter title (lower third, 2 s). Register tab, prefilled: opaque reference MTV-PF-0100, Imobiliária Planalto, rent R$1,500, 6× + 6×; green preview; click register_guarantee; "Confirmed" chip with the short signature. Hold 1.5 s.
- **VO:** "Our operator puts Ana's lease on-chain: eighteen thousand reais of cover, an opaque ID, no personal data."
- **Caption:** Rent R$1,500 · cover 6× + 6× = R$18,000
- **Honesty label:** none (banner only)
- **Proof:** A confirmed devnet transaction.
- **Edit:** Main action at real speed; the form is prefilled, so there is no typing and no jump cut; one zoom on the chip; cut before the form advances to MTV-PF-0101.
- **Retake:** Consumes R$4,500 of free capital and the reference. Reset: close_guarantee VOID, then register as MTV-PF-0100b (the VOID lease stays visible as "closed").

**F4 · FLASH · 1 · Programmable, transparent reserve · 0:27 – 0:29 · Solana Explorer (devnet)**: Explorer: one account per lease
- **On screen:** The new Guarantee PDA on Explorer: owner, opaque id, cover legs. Captured as an end state; check it on devnet.
- **VO:** (the F3 line continues over this flash)
- **Caption:** Guarantee PDA · owner: MUTAV program
- **Honesty label:** none (banner only)
- **Proof:** The one Explorer shot.
- **Edit:** Flash ≤ 2 s, hard cuts.
- **Retake:** Read-only: repeat freely.

**F5 · END STATE · 1 · Programmable, transparent reserve · 0:29 – 0:39 · /reserve/coverage**: Anyone can watch the reserve
- **On screen:** /reserve/coverage with no wallet: held vs required, R$36,000 → R$40,500 (zoom). Ana's row at the bottom.
- **VO:** "Anyone can watch the reserve: what it holds in BRS, Nora's Brazilian real stablecoin, and what it must hold. The rule is code."
- **Caption:** Held R$44,000 · required R$36,000 → R$40,500
- **Honesty label:** none (banner only)
- **Proof:** The same state read independently by a public page.
- **Edit:** One zoom on held vs required. *Conditional:* If PR #75 (the coverage-ceiling explainer) is merged by recording time, the page also shows the ceiling on devnet: can back up to R$176k, headroom R$32k; keep it in frame. Without #75 the shot is as written.
- **Retake:** Read-only: repeat freely.

**F6 · MAIN · 1 · Programmable, transparent reserve · 0:39 – 0:58 · /operator · register_guarantee**: The refusal
- **On screen:** The form has auto-advanced to the next reference, MTV-PF-0101, same amounts (no typing): red preview (R$45,000 needed, R$44,000 held). Click send: the clean refusal message, the "Coverage gate · refused" overlay; the meter does not move. 3 s of silence.
- **VO:** "One more lease would need forty-five thousand; the reserve holds forty-four. (click) Refused. MUTAV can't promise what its reserve can't back."
- **Caption:** Needs R$45,000 · holds R$44,000 · refused
- **Honesty label:** none (banner only)
- **Proof:** The program's own error (InsufficientFreeCapital, raw details collapsed). No Explorer link: a refused transaction never lands.
- **Edit:** Main action. Zoom on the preview, then the refusal; music out; 3 s silence on the unchanged meter; 3 s tail after the silence (trimmed from 5 s in v7).
- **Retake:** Repeatable without limit: nothing lands.

**F7 · MAIN · 2 · Programmable payments, settled in minutes · 0:58 – 1:20 · /operator · file_claim → pay_claim → settle_payout**: The claim, live
- **On screen:** "Later" wipe and chapter title. Live: file_claim, prefilled (R$1,500, Ana preselected, NTC-PF-0001; no typing) → pay_claim (zoom on the R$15,000 cap) → settle_payout; each click 2–3 s, the elapsed timer running from "filed".
- **VO:** "Say Ana misses a month. The operator files the claim, the reserve pays within the admin's cap, and the PIX to the agency is recorded on-chain."
- **Caption:** Claim R$1,500 · cap R$15,000 per call
- **Honesty label:** PIX transfer simulated on devnet · settlement recorded on-chain
- **Proof:** Three confirmed transactions on one ClaimFiling PDA.
- **Edit:** Timer overlay driven by the logged on-chain timestamps (it jumps honestly across cuts). Cut confirmation waits.
- **Retake:** The claim window has R$6,700 of room (of R$20,000 per 31 days), so a full R$1,500 retake fits: same claim, same VO and caption. Rehearse on localnet first. A second paid claim changes the end-state figures (held, required, Ana's default leg); re-read them for F8. If only the capture was bad, re-capture the screens, not the claim.

**F8 · END STATE · 2 · Programmable payments, settled in minutes · 1:20 – 1:31 · /reserve/claims**: Filed → paid → settled
- **On screen:** /reserve/claims: filed → paid → settled with on-chain timestamps; the timer stops at settled. Hold 3 s (the post-VO hold is 2.8 s in v7). Still covered: R$42,500 held, R$40,125 required. The public timeline also shows an earlier R$18,000 test claim: fine to be visible on a disclaimed demo reserve. Frame the shot so Ana's row is the highlighted one.
- **VO:** "On-chain, filed to settled in [N] seconds. Seguro-fiança allows up to thirty days."
- **Caption:** Filed → settled on-chain: [N] s · seguro-fiança: 30 days
- **Honesty label:** PIX transfer simulated on devnet · settlement recorded on-chain
- **Proof:** Timestamps from the ClaimFiling PDA. [N] = settled_at − filed_at, from the real on-chain timestamps; the unit is "seconds" if under 2 minutes, "minutes" otherwise. Do not claim real-world claims settle in seconds: the operator checks each claim first.
- **Edit:** SUSEP Circ. 621/2021 art. 43 goes in the video description.
- **Retake:** Read-only: repeat freely.

**F8b · END STATE · 2 · Programmable payments, settled in minutes · 1:31 – 1:42 · /reserve/risks (devnet)**: Next: the agency platform drives the steps
- **On screen:** A cut to /reserve/risks on devnet (live), with the safeguards card overlaid: "Automation safeguards (on-chain today): R$15,000 per payment · R$20,000 per 31 days · payouts only to MUTAV's fixed payments account · larger claims need the admin multisig's approval · a guardian can pause". The corner diagram lights "agency platform → operator" in the "next" colour, labelled as roadmap.
- **VO:** "Today our operator console signs these steps. Next, the agency platform drives them automatically, registry, claims and payments, inside safeguards the program already enforces."
- **Caption:** Safeguards on-chain today · agency automation next
- **Honesty label:** none besides the card (the card says "on-chain today" and "agency platform → operator: roadmap, not live")
- **Proof:** Every listed safeguard is live in the devnet program and readable on /reserve/risks. The agency-platform integration is not live; the wording keeps that clear.
- **Edit:** Hard cut in; the card builds in over 0.6 s and holds; `overlays/safeguards-card.png` plus `overlays/minimap-roadmap.png`. No zoom.
- **Retake:** Read-only: repeat freely.

**F9 · FLASH · 3 · Capital efficiency · 1:42 – 1:43.5 · transition card (edit)**: Switch: six months, simulated
- **On screen:** A 1.5 s card marks the switch from devnet to the local simulation. From here the app banner reads "Local simulation · accelerated clock".
- **VO:** (no voiceover: the card carries the switch)
- **Caption:** Six months, simulated locally on an accelerated clock
- **Honesty label:** none (banner only)
- **Proof:** None: a card.
- **Edit:** Hard cut in; the chapter 3 lower third starts on the next shot.
- **Retake:** Made in the editor.

**F10 · END STATE · 3 · Capital efficiency · 1:43.5 – 1:52.5 · /reserve (history) → /reserve/capital (localnet)**: Six months of fees and issuer revenue
- **On screen:** The /reserve history chart, Month 1…6 (simulated), with "All" selected so the whole run shows, including the month-3 dip in share value (0.9522 after the R$16,000 claim). Then the Capital tab with guarantee fees and issuer revenue landing in the reserve.
- **VO:** "Here are six months of it, simulated locally on an accelerated clock. Guarantee fees and issuer revenue flow into the reserve."
- **Caption:** Six months · 3 claims paid · 1 approved by the admin
- **Honesty label:** Mock BRS mint · local validator
- **Proof:** Localnet program accounts (the same program build), mock BRS mint.
- **Edit:** One slow push on the chart, the month-3 dip kept in frame (don't crop it out); cut to the flows.
- **Retake:** Re-run the localnet simulation: unlimited.

**F11 · END STATE · 3 · Capital efficiency · 1:52.5 – 1:56.5 · /reserve/claims (localnet)**: A large claim, approved by the admin
- **On screen:** Claim C2, R$16,000, above the R$15,000 per-call cap, with its four stages on /reserve/claims: filed 01-08 → approved by the admin multisig 01-09 → paid 01-10 → settled 01-12 (simulated dates).
- **VO:** "Claims are paid, large ones approved by the admin."
- **Caption:** Claim R$16,000 · above R$15k: admin approval · paid
- **Honesty label:** none (banner only)
- **Proof:** Localnet ClaimFiling with its approval and timestamps.
- **Edit:** Hold on the approved stage.
- **Retake:** Re-run the simulation.

**F12 · END STATE · 3 · Capital efficiency · 1:56.5 – 2:01 · /reserve (localnet)**: More cover, and each share worth more
- **On screen:** The coverage ceiling ("can back up to") and the value per share, month 1 → month 6: R$489.9k → R$562.0k, and 1.000 at the deposit → 1.039 at the withdrawal.
- **VO:** "The reserve can back more leases, each share is worth more,"
- **Caption:** Can back R$490k → R$562k of cover · second callout: Share value 1.000 → 1.039
- **Honesty label:** none (banner only)
- **Proof:** Localnet VaultState after refresh.
- **Edit:** Zoom from the hold still; the count-up settles fast (4.5 s shot in v7). *Production note:* the ceiling is not a straight climb: it peaked at R$630k in month 4 and ends at R$562k, so the caption reads start → end (month 1 → month 6). The share value starts at the capital provider's deposit price, 1.000000 on 2026-11-02.
- **Retake:** Re-run the simulation.

**F13 · END STATE · 3 · Capital efficiency · 2:01 – 2:11 · /capital (localnet)**: Capital out, above what went in
- **On screen:** One capital provider's withdrawal, filled from free capital above required coverage after claims: R$20,000 in (2026-11-02, at 1.000000 per share) → R$20,774.35 out (2027-04-27, at 1.038718). The banner carries the not-open-to-public-investment line.
- **VO:** "and a capital provider takes out more than they put in. The same reserve that protects the landlord pays the people who fund it."
- **Caption:** R$20,000 in → R$20,774 out · simulated
- **Honesty label:** none (banner only)
- **Proof:** Localnet claim_assets transaction.
- **Edit:** Reais only; no rate, APY or percentage.
- **Retake:** Re-run the simulation.

**F14 · END STATE · Close · 2:11 – 2:19.5 · card (made in the editor)**: Close
- **On screen:** The three pillars, one line each, then the tagline, the repo and the live app.
- **VO:** "MUTAV: a transparent, programmable reserve, claims settled in minutes, capital that works. Brazil's onchain rent guarantee."
- **Caption:** reserve.mutav.finance · open source (MIT)
- **Honesty label:** none (banner only)
- **Proof:** —
- **Edit:** Hold to 2:19.5 (8.5 s in v7). Pillar 2 on the card may stay "Claims settled in minutes"; chapter 2's title is "Programmable payments, settled in minutes".
- **Retake:** Made in the editor.

## 4. Numbers

**Devnet chapters (staged reserve, program GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV, c = 0.25).** R$6,700 of the R$20,000 per-31-day claim window is left, so a full R$1,500 retake fits.

| Step | Action | Stable assets | Coverage required | Free capital | Value per share | Check |
|---|---|---|---|---|---|---|
| 0 | Staged devnet reserve (earlier test claims): R$44,000 held, 73,333.33 shares at 0.600000 | R$44,000 | — | — | 0.600000 | TVL ≪ R$1M |
| 1 | Book: 8 leases MTV-PF-0001…0008, R$18,000 cover each = R$144,000 | R$44,000 | R$36,000 | R$8,000 | 0.600000 | R$18k ≤ R$120k per guarantee |
| 2 | Ana MTV-PF-0100: + R$18,000 cover (operator) | R$44,000 | R$40,500 | R$3,500 | 0.600000 | fits: needs R$4,500 of R$8,000 |
| 3 | Next equal lease MTV-PF-0101: would need R$45,000 | R$44,000 | R$40,500 | R$3,500 | 0.600000 | refused: R$1,000 short; nothing changes |
| 4 | file_claim R$1,500 on Ana, default leg | R$44,000 | R$40,500 | R$3,500 | 0.579545 | set aside; required = max(25% × cover, provisions) |
| 5 | pay_claim R$1,500 | R$42,500 | R$40,125 | R$2,375 | 0.579545 | still covered; ≤ R$15k/call; uses R$1,500 of the R$6,700 left in the period (a full retake fits) |

**Chapter 3 · local simulation** (local validator, accelerated clock, mock BRS mint; statement months Nov 2026 → Apr 2027). Reais and share values only: no rate or APY. The /simulator projections are not in the video.

| Month | 1 · Nov | 2 · Dec | 3 · Jan | 4 · Feb | 5 · Mar | 6 · Apr |
|---|---|---|---|---|---|---|
| Value per share | 1.0207 | 1.0332 | 0.9522 (after the R$16,000 claim) | 0.9826 | 1.0017 | 1.0387 |
| Coverage ceiling ("can back up to") | R$489.9k | R$597.2k | R$550.4k | R$629.9k | R$602.1k | R$562.0k |

| Claim | Amount | Filed | Approved (admin multisig) | Paid | Settled |
|---|---|---|---|---|---|
| C1 | R$1,800 | 12-12 | — (under R$15k) | 12-14 | 12-16 |
| C2 | R$16,000 | 01-08 | 01-09 | 01-10 | 01-12 |
| C3 | R$2,300 | 03-12 | — (under R$15k) | 03-14 | 03-16 |

| Item | Value |
|---|---|
| Capital provider | Deposited R$20,000 on 2026-11-02 at 1.000000 per share; withdrew everything on 2027-04-27 at 1.038718: R$20,774.35 |
| End state · reserve | R$140,491.59 held; 19 leases, cover R$481,900; required R$120,475; free R$20,016.59 |
| End state · ceiling | R$561,966.35, headroom R$80,066.35 |
| End state · treasury, mode | R$4,029.60; Normal |

Captions read start → end: the ceiling peaked at R$630k in month 4 and ends at R$562k; the share value dips in month 3 after the R$16,000 claim, and the chart keeps that dip in frame.

## 5. Route map

| Route | Before #45 | On main (#45 merged) | Used in |
|---|---|---|---|
| / | Landing | Redirects to /reserve (the MUTAV landing is mutav.finance) | — |
| /reserve | Transparency, one long page | Overview + sub-routes | F1 (devnet) · F10, F12 (localnet) |
| /reserve/coverage | — (section) | Coverage tab | F5 |
| /reserve/claims | — (section #claims) | Claims tab | F8 (devnet) · F11 (localnet) |
| /reserve/capital | — (#flows, #queue) | Capital tab (flows + queue) | F10 (localnet) |
| /reserve/risks | — (#disclosures) | Risks tab | F8b (devnet) |
| /reserve/verify | — (#accounts) | Verify tab | — |
| /capital | — (old capital page) | Capital queue (old paths redirect here) | F13 (localnet) |
| /operator | Operator console | Same, restyled; forms prefilled for the demo; "Refresh on-chain" button | F3, F6, F7 |
| /admin | Squads proposals | Same, restyled | off camera (fills) |
| /demo | Guided six steps | Redirects to /operator | — |
| agency platform | Pre-existing (mutav-app) | A local copy with fictional data, not the live platform | F2 |

## 6. Capture order

| # | Step | Who | Where |
|---|---|---|---|
| 1 | Devnet program GhPkq95RkY7PrJLsv74X73s6ozcwf6JqJtjFouqQeZbV deployed and staged (done): R$44,000 held, R$36,000 required, R$8,000 free, 8 leases | — | done |
| 2 | Load the operator's agency records in the recording browser | Recorder | — |
| 3 | Rehearse chapters 1–2 on localnet with the same numbers | Recorder | — |
| 4 | Right before recording, press "Refresh on-chain" on /operator (it sends the permissionless `refresh`; no separate step). Devnet capture: F1, F3 (Ana MTV-PF-0100, prefilled), F4, F5, F6 (auto-advanced to MTV-PF-0101), then the claim (F7; a full retake fits), F8 and F8b (/reserve/risks). Log tx timestamps for the timer. F2 is captured from the local agency copy (dashboard: KPI cards → "Where the book sits"; no domain in the address bar) | Operator; anyone | — |
| 5 | Localnet simulation (done): six simulated months, Nov 2026 → Apr 2027, on a local validator with an accelerated clock and a mock BRS mint (fees, issuer revenue, three claims, one above R$15k with admin approval, a capital provider's withdrawal); figures in §4. Start the app with NEXT_PUBLIC_ACCELERATED_CLOCK=1 (the banner reads "Local simulation · accelerated clock") | Simulation script; local admin | local |
| 6 | Localnet capture: F10–F13 end states | Recorder | — |
| 7 | Edit: chapter titles, the transition card (F9), the timer, the safeguards card and roadmap minimap (F8b), the close card | Editor | — |

## 7. Capture, voice, captions

- Chapter 3: record the localnet app with `NEXT_PUBLIC_ACCELERATED_CLOCK=1` so the banner reads "Local simulation · accelerated clock" (PR #72). No corner badges; keep the 1.5 s switch card.
- Before capture, load the operator's agency records into the recording browser.
- Five live clicks on devnet (register, refused send, file, pay, settle), all on prefilled forms; log on-chain times for the timer. Press "Refresh on-chain" on /operator right before recording. Chapter 3 end states are captured on localnet after the six simulated months.
- Harness screencast: 1080p at 30 fps; 2× stills on holds only. Zooms over motion ≤ 1.3×, on holds up to 2×.
- English VO, English burned-in captions + SRT; optional PT-BR SRT for the Superteam Brazil jury. SUSEP Circ. 621/2021 art. 43 in the description.

## 8. Run sheet (BRT)

| When | What |
|---|---|
| Oct 12 · morning | Rehearse chapters 1–2 on localnet. The chapter 3 simulation has run; its figures are in §4. |
| by 12:00 | Press "Refresh on-chain" on /operator right before recording. Devnet capture of F1, F3–F8 and F8b (a full claim retake fits); F2 from the local agency copy. Read [N] from the claim timestamps. |
| 12:00–13:00 | Localnet capture of F10–F13 with the accelerated-clock banner. |
| 13:00–15:00 | Rough cut; record the VO to the cut with [N] filled in. |
| 15:00–18:00 | Fine-tune; English burned-in captions + SRT; optional PT-BR SRT. |
| 18:00 | Review muted and with sound: ≤ 2:20, one honesty label per shot. |
| 19:00 | Export, upload unlisted, test in a private window. |
| 19:30 | Judge-ready check of reserve.mutav.finance in a private window. |
| 20:00 | Submit (Colosseum + Superteam BR track). |
| 23:00 | Hard stop; the rest is buffer. |

## 9. Risks

| Risk | Where | What to do |
|---|---|---|
| Claim take fails | F7 | The window has R$6,700 left, so a full R$1,500 retake fits (same VO and caption). Rehearse on localnet; re-read the end-state figures after a second paid claim. |
| State drifted | F6 | Free capital before Ana must be in [R$4,500, R$9,000). Close strays with close_guarantee VOID. |
| Known app behaviours | F3, F6, F7 | Register advances to MTV-PF-0101 with a red preview (cut before it in F3); the refusal error carries encoded text; paid and settled rows vanish. Workarounds per shot; fixes in app-requirements. |
| Simulation numbers drift | F10–F13 | The figures in §4 come from one localnet run. If a re-run changes them, update §4 and the captions before recording; captions and cards follow. |
| Stale devnet share value | F1, F5 | Press "Refresh on-chain" on /operator right before recording. |
| Accelerated-clock banner missing | F10–F13 | Start the localnet app with NEXT_PUBLIC_ACCELERATED_CLOCK=1 (PR #72); without it the chapter would look like devnet. |
| Over 2:20 | edit | Trim F5 (−2 s), then the F6 tail after the silence (0:55–0:58); never trim the silence itself or the F8b safeguards read. |
| Automation read as live | F8b | The VO says "Today … Next …"; the card says "on-chain today" for the safeguards and "roadmap" for agency platform → operator. Keep both; no caption may say the agency platform drives the program now. |
| Claim under two minutes | F8 | [N] from settled_at − filed_at: "seconds" under 2 min, "minutes" otherwise; round down. |

## 10. What judges will see afterwards

| Artefact | How it reads |
|---|---|
| /reserve (devnet) | Covered, mode Normal: R$42,500 held, R$40,125 required, value per share 0.579545 (the payoff is in the local simulation, not on devnet) |
| Ana's guarantee (MTV-PF-0100) | Active · default left R$7,500 · exit left R$9,000 · opaque id, no names |
| /reserve/claims (devnet) | Two claims: an earlier R$18,000 test claim and Ana's R$1,500, filed → paid → settled (three if a retake was needed) |
| The refused lease | Nothing: it never landed |

## 11. Open production decisions

1. Plan B (fits the devnet BRS in hand) or Plan A (pilot product; needs more sandbox BRS and a 12× form).
2. Whether to include the optional simulated issuer-revenue sweep.
3. Narrator, pronunciation of "MUTAV", face cam or not.
