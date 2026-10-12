# MUTAV: product demo script (v5)

Companion to the storyboard (`storyboard.html`); the two match.

- **Runtime:** 2:08. **Voiceover:** 199 words, verbatim below. Three chapters, one per pitch pillar; five live clicks.
- **Recorded**, not live: silent clips (injected test wallet, no pop-ups), a rough cut with titles, timer and cards, then the VO recorded to the cut. Frames are tagged MAIN / FLASH / END STATE.
- **Numbers:** v4 Plan B, unchanged (c = 0.25, 6× + 6× cover). Ana, agency names and lease references are fictional.
- **Labels:** the #59 banner is the persistent badge and disclaimer; at most one more honesty label per shot.

## 1. Beats

| Time | Beat | Frames |
|---|---|---|
| 0:00 (10 s) | Cold open | F1 |
| 0:10 (5 s) | Agency | F2 |
| 0:15 (43 s) | 1 · Programmable, transparent reserve | F3–F6 |
| 0:58 (38 s) | 2 · Settled in minutes | F7–F8 |
| 1:36 (22 s) | 3 · Capital efficiency | F9–F12 |
| 1:58 (10 s) | Close | F13 |

## 2. Voiceover (verbatim)

> **0:00 · Cold open** Ana wants to rent an apartment in Passo Fundo. Her landlord wants a guarantor. MUTAV is that guarantor, and its reserve runs on Solana.
>
> **0:10 · Agency** Her agency works in MUTAV's platform; every lease becomes an account on-chain.
>
> **0:15 · 1 · Programmable, transparent reserve** Our operator puts Ana's lease on-chain: eighteen thousand reais of cover, an opaque ID, no personal data. Anyone can watch the reserve: what it holds in BRS, Nora's Brazilian real stablecoin, and what it must hold. The rule is code. One more lease would need forty-five thousand; the reserve holds forty-four. (click) Refused. MUTAV can't promise what its reserve can't back.
>
> **0:58 · 2 · Settled in minutes** Now say Ana misses a month. The operator files the claim, the reserve pays within the admin's cap, and the PIX to the agency is recorded on-chain. On-chain, filed to settled in [N] seconds. Seguro-fiança allows up to thirty days.
>
> **1:36 · 3 · Capital efficiency** Because the reserve keeps a quarter of what it guarantees, every real of capital can back up to four in cover and earn its fees. Even after Ana's claim, each share is worth more. The same reserve that protects the landlord pays the people who fund it.
>
> **1:58 · Close** MUTAV: a transparent, programmable reserve, claims settled in minutes, capital that works. Brazil's onchain rent guarantee.
>

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

**F2 · FLASH · Open · 0:10 – 0:15 · app.mutav.finance (agency view)**: Agency
- **On screen:** Ana's fictional lease in the agency platform (mutav-app). Hard cuts in and out.
- **VO:** "Her agency works in MUTAV's platform; every lease becomes an account on-chain."
- **Caption:** Agency platform · pre-hackathon · not on-chain yet
- **Honesty label:** Agency platform · pre-hackathon · not on-chain yet
- **Proof:** None: off-chain, labelled as such.
- **Edit:** Flash: hard cuts, no zoom.
- **Retake:** Read-only: repeat freely.

**F3 · MAIN · 1 · Programmable, transparent reserve · 0:15 – 0:25 · /operator · register_guarantee**: Ana's lease goes on-chain
- **On screen:** Chapter title (lower third, 2 s). Register tab: opaque reference MTV-PF-0009, rent 1500, 6× + 6×; green preview; click register_guarantee; "Confirmed" chip with the short signature. Hold 1.5 s.
- **VO:** "Our operator puts Ana's lease on-chain: eighteen thousand reais of cover, an opaque ID, no personal data."
- **Caption:** Rent R$1,500 · cover 6× + 6× = R$18,000
- **Honesty label:** none (banner only)
- **Proof:** A confirmed devnet transaction.
- **Edit:** Main action at real speed; typing jump-cut; one zoom on the chip; cut before the form resets.
- **Retake:** Consumes R$4,500 of free capital and the reference. Reset: close_guarantee VOID, then register as MTV-PF-0009b (the VOID lease stays visible as "closed").

**F4 · FLASH · 1 · Programmable, transparent reserve · 0:25 – 0:27 · Solana Explorer (devnet)**: Explorer: one account per lease
- **On screen:** The new Guarantee PDA on Explorer: owner, opaque id, cover legs. Captured as an end state; check it on devnet.
- **VO:** (the F3 line continues)
- **Caption:** Guarantee PDA · owner: MUTAV program
- **Honesty label:** none (banner only)
- **Proof:** The one Explorer shot.
- **Edit:** Flash ≤ 2 s, hard cuts.
- **Retake:** Read-only: repeat freely.

**F5 · END STATE · 1 · Programmable, transparent reserve · 0:27 – 0:37 · /reserve/coverage**: Anyone can watch the reserve
- **On screen:** /reserve/coverage with no wallet: held vs required, R$36,000 → R$40,500 (zoom). Ana's row at the bottom.
- **VO:** "Anyone can watch the reserve: what it holds in BRS, Nora's Brazilian real stablecoin, and what it must hold. The rule is code."
- **Caption:** Held R$44,000 · required R$36,000 → R$40,500
- **Honesty label:** none (banner only)
- **Proof:** The same state read independently by a public page.
- **Edit:** One zoom on held vs required.
- **Retake:** Read-only: repeat freely.

**F6 · MAIN · 1 · Programmable, transparent reserve · 0:37 – 0:58 · /operator · register_guarantee**: The refusal
- **On screen:** Next reference MTV-PF-0010, same amounts: red preview (R$45,000 needed, R$44,000 held). Click send: the clean refusal message, the "Coverage gate · refused" overlay; the meter does not move. 3 s of silence.
- **VO:** "One more lease would need forty-five thousand; the reserve holds forty-four. (click) Refused. MUTAV can't promise what its reserve can't back."
- **Caption:** Needs R$45,000 · holds R$44,000 · refused
- **Honesty label:** none (banner only)
- **Proof:** The program's own error (InsufficientFreeCapital, raw details collapsed). No Explorer link: a refused transaction never lands.
- **Edit:** Main action. Zoom on the preview, then the refusal; music out; 3 s silence on the unchanged meter.
- **Retake:** Repeatable without limit: nothing lands.

**F7 · MAIN · 2 · Settled in minutes · 0:58 – 1:20 · /operator · file_claim → pay_claim → settle_payout**: The claim, live
- **On screen:** "Later" wipe and chapter title. Live: file_claim (R$1,500, NTC-PF-0001) → pay_claim (zoom on the R$15,000 cap) → settle_payout; each click 2–3 s, the elapsed timer running from "filed".
- **VO:** "Now say Ana misses a month. The operator files the claim, the reserve pays within the admin's cap, and the PIX to the agency is recorded on-chain."
- **Caption:** Claim R$1,500 · cap R$15,000 per call
- **Honesty label:** PIX transfer simulated on devnet · settlement recorded on-chain
- **Proof:** Three confirmed transactions on one ClaimFiling PDA.
- **Edit:** Timer overlay driven by the logged on-chain timestamps (it jumps honestly across cuts). Cut confirmation waits.
- **Retake:** Consumes the notice and R$1,500 of the leg and the R$20,000 period cap; a redo files NTC-PF-0002 and adds a timeline row.

**F8 · END STATE · 2 · Settled in minutes · 1:20 – 1:36 · /reserve/claims**: Filed → paid → settled
- **On screen:** /reserve/claims: filed → paid → settled with on-chain timestamps; the timer stops at settled. Hold 3 s. Still covered: R$42,500 held, R$40,125 required.
- **VO:** "On-chain, filed to settled in [N] seconds. Seguro-fiança allows up to thirty days."
- **Caption:** On-chain, filed → settled: [N] s · seguro-fiança: up to 30 days
- **Honesty label:** PIX transfer simulated on devnet · settlement recorded on-chain
- **Proof:** Timestamps from the ClaimFiling PDA. [N] = settled_at − filed_at, from the real on-chain timestamps; the unit is "seconds" if under 2 minutes, "minutes" otherwise. Do not claim real-world claims settle in seconds: the operator checks each claim first.
- **Edit:** SUSEP Circ. 621/2021 art. 43 goes in the video description.
- **Retake:** Read-only: repeat freely.

**F9 · END STATE · 3 · Capital efficiency · 1:36 – 1:41 · /reserve (plate) + card overlay**: Capacity: every real backs up to four
- **On screen:** Card overlay "R$44k held · R$162k of cover" (2 s) over a /reserve plate captured right after the refusal (before the claim), so the figures under it match.
- **VO:** "Because the reserve keeps a quarter of what it guarantees, every real of capital can back up to four in cover"
- **Caption:** R$44k held · R$162k of cover (≈ 3.7×; max 4× at 25%)
- **Honesty label:** none (banner only)
- **Proof:** The plate is read from devnet at the post-refusal state.
- **Edit:** End state; capture the plate in chapter 1.
- **Retake:** Read-only plate.

**F10 · FLASH · 3 · Capital efficiency · 1:41 – 1:44 · /reserve/capital (fee receipt)**: Guarantee fees land
- **On screen:** The fee receipt row: R$3,060 gross, R$2,448 to the reserve, R$612 to MUTAV.
- **VO:** "and earn its fees."
- **Caption:** Two months of fees, one step for the demo
- **Honesty label:** Two months of fees, one step for the demo
- **Proof:** A FeeReceipt PDA (staged off camera).
- **Edit:** Flash, hard cuts.
- **Retake:** Read-only.

**F11 · END STATE · 3 · Capital efficiency · 1:44 – 1:51 · /reserve (Overview)**: Each share is worth more
- **On screen:** /reserve after the off-camera fees, redemption and refresh: value per share 1.021545; overlay "1.000 → 1.022". Hold 2 s.
- **VO:** "Even after Ana's claim, each share is worth more."
- **Caption:** Share value 1.000 → 1.022, after the claim
- **Honesty label:** none (banner only)
- **Proof:** VaultState after refresh.
- **Edit:** End state; zoom from the hold still.
- **Retake:** Read-only.

**F12 · END STATE · 3 · Capital efficiency · 1:51 – 1:58 · /investment**: Capital out, above what went in
- **On screen:** /investment as capital wallet B after the off-camera redemption: deposited R$4,000.00, claimed R$4,086.18. Hold 3 s. The banner carries the disclaimer.
- **VO:** "The same reserve that protects the landlord pays the people who fund it."
- **Caption:** R$4,000 in → R$4,086 out
- **Honesty label:** none (banner only)
- **Proof:** The claim_assets transaction (staged off camera).
- **Edit:** Reais only; no rate. If the page cannot show in → out yet, overlay it from the two transaction amounts.
- **Retake:** Read-only end state.

**F13 · END STATE · Close · 1:58 – 2:08 · card (made in the editor)**: Close
- **On screen:** The three pillars, one line each, then the tagline, the repo and the live app.
- **VO:** "MUTAV: a transparent, programmable reserve, claims settled in minutes, capital that works. Brazil's onchain rent guarantee."
- **Caption:** reserve.mutav.finance · open source (MIT)
- **Honesty label:** none (banner only)
- **Proof:** —
- **Edit:** Hold to 2:08.
- **Retake:** Made in the editor.

## 4. Numbers (Plan B, chosen)

| Step | Action (who) | Stable assets | Coverage required | Free capital | Value per share | Check |
|---|---|---|---|---|---|---|
| 0 | Deposits filled at 1.000000: wallet A R$40,000, wallet B R$4,000 (capital wallets; Squads fill) | R$44,000 | — | — | 1.000000 | requests within R$1k–R$100k; TVL ≪ R$1M |
| 1 | Book: 8 leases × rent R$1,500 × (6 + 6) = R$18,000 cover each = R$144,000 (operator) | R$44,000 | R$36,000 | R$8,000 | 1.000000 | R$18k ≤ R$120k per guarantee |
| 2 | Ana: + R$18,000 cover (operator) | R$44,000 | R$40,500 | R$3,500 | 1.000000 | (a) fits: needs R$4,500 of R$8,000 |
| 2a | Capacity at this point: R$162,000 of cover on R$44,000 held (≈ 3.7×; at most 1/c = 4× at c = 0.25) | R$44,000 | R$40,500 | R$3,500 | 1.000000 | F9 card "R$44k held · R$162k of cover"; "up to four" = 1/c |
| 3 | Next equal lease: would need R$45,000 (operator) | R$44,000 | R$40,500 | R$3,500 | 1.000000 | (a) refused: R$1,000 short; nothing changes |
| 4 | file_claim R$1,500 on Ana, default leg (operator) | R$44,000 | R$40,500 | R$3,500 | 0.965909 | set aside; required = max(25% × cover, provisions) |
| 5 | pay_claim R$1,500 (operator) | R$42,500 | R$40,125 | R$2,375 | 0.965909 | (b) still covered; (e) ≤ R$15k/call, ≤ R$20k/31 days |
| 6 | contribute_fees R$3,060 gross = 17 lease-months × 12% × R$1,500; take R$612 → treasury, R$2,448 → reserve (operator) | R$44,948 | R$40,125 | R$4,823 | 1.021545 | (c) above the deposit value |
| 7 | Wallet B redeems 4,000 shares → R$4,086.18 (Squads fill, then claim_assets) | R$40,861.82 | R$40,125 | R$736.82 | 1.021545 | (d) ≤ free R$4,823; ≥ R$1k; whole fill; still covered |
| 6b (optional) | sweep_income R$357.90: one month of issuer revenue on R$44,948, simulated on devnet | R$45,305.90 | R$40,125 | R$5,180.90 | 1.029680 | B would receive R$4,118.72 |

Two months of fees: one month beats a one-month-rent claim only with more than 10.4 leases (0.8 × 0.12 × N > 1), and the ≈ R$50k of devnet BRS in hand holds 9 at c = 0.25. Devnet BRS needed ≈ R$47,060.

**Plan A (pilot product; needs more sandbox BRS and a 12× form):**

| Item | Value |
|---|---|
| Product | Pilot product: rent R$2,200, cover 12× + 6× = R$39,600 (needs the register form to accept 12×) |
| Capital / book | A R$107,000, B R$10,000; 10 leases → R$99,000 required, free R$18,000 |
| Ana / next | Ana fits; next needs R$118,800 > R$117,000 → R$1,800 short |
| Claim / fees | Claim R$2,200, still covered; 21 lease-months × R$264 = R$5,544 gross → value per share 1.019104 |
| Withdrawal | B: R$10,000 in → R$10,191.04 out |
| Devnet BRS needed | ≈ R$122,544: more than the ≈ R$50,000 in hand. Needs extra sandbox BRS |

## 5. Route map

| Route | Today (main) | After PR #45 | Used in |
|---|---|---|---|
| / | Landing | Landing (restyled) | — |
| /reserve | Transparency, one long page | Overview + sub-routes | F1, F9 plate, F11 |
| /reserve/coverage | — (section) | Coverage tab | F5 |
| /reserve/claims | — (section #claims) | Claims tab | F8 |
| /reserve/capital | — (#flows, #queue) | Capital tab (flows + queue) | F10 |
| /reserve/risks | — (#disclosures) | Risks tab | — |
| /reserve/verify | — (#accounts) | Verify tab | — |
| /investment | — (/investor) | Swap-style card + queue entries | F12 |
| /operator | Operator console | Same, restyled | F3, F6, F7 |
| /admin | Squads proposals | Same, restyled | off camera (fills) |
| /demo | Guided six steps | Same; a cleaned version is the optional alternative surface | alternative |
| app.mutav.finance | Agency platform (mutav-app, pre-existing) | — | F2 |

## 6. Devnet staging

| # | Step | Who signs | Wait |
|---|---|---|---|
| 1 | Deploy, initialize, verify.ts green (ADR 0028: c = 0.25, R$1M TVL, R$120k per guarantee, R$15k / R$20k claim caps) | Upgrade Squads 2-of-2 | 1 h lock |
| 2 | App deployed for devnet with the must-haves (app-requirements) and the #59 banner | App owner | — |
| 3 | Fund: capital wallet A R$40,000 BRS, capital wallet B R$4,000, operator R$3,060 (+R$358 for the optional sweep); SOL for each | BRS holder | — |
| 4 | 00-setup: set_allowlist_root with A and B (if not set at initialize); request_deposit A 40,000, B 4,000; fulfil_deposits (count 2); claim_shares | Admin Squads 2-of-2; A, B | 5 min lock per round |
| 5 | 00-setup: register 8 leases (rent 1500, 6× + 6×, refs MTV-PF-0001…0008, fictional agencies). Check: R$44,000 held, R$36,000 required, R$8,000 free, 8 active, 1.000000 | Operator | — |
| 6 | Capture the cold open → chapter 2 live: F1, F2, register Ana (F3), Explorer end state (F4), F5, the refusal (F6), the F9 /reserve plate, then the claim live (F7) and /reserve/claims (F8). Log tx timestamps for the timer | Operator; anyone | — |
| 7 | 05-offcamera: contribute_fees R$3,060; B request_redeem 4,000 shares → fulfil_redeems (count 1) → B claim_assets (R$4,086.18); refresh | Operator; B; Admin Squads 2-of-2; anyone | 5 min lock |
| 8 | Capture the chapter 3 end states: fee receipt (F10), /reserve share value (F11), /investment in → out (F12) | — | — |
| 9 | Edit: chapter titles, the timer, the cards. Judge-ready check: mode Normal, covered (free R$736.82) | — | — |

No restore is needed: the reserve stays covered (free capital R$736.82 at the end, mode Normal).

## 7. Capture, voice, captions

- Five live clicks (register, refused send, file, pay, settle); log on-chain times for the timer. End states after off-camera staging; the F9 plate right after the refusal.
- Harness screencast: 1080p at 30 fps; 2× stills on holds only. Zooms over motion ≤ 1.3×, on holds up to 2×.
- English VO, English burned-in captions + SRT; optional PT-BR SRT for the Superteam Brazil jury. SUSEP Circ. 621/2021 art. 43 in the description.

## 8. Run sheet (BRT)

| When | What |
|---|---|
| Before Oct 12 | Deploy and verify; app must-haves deployed; harness updated to v5; staging 00-setup. Time a VO read-through. |
| Oct 12 · by 10:00 | Staging checked. If devnet or the app is not ready by 12:00, record on a seeded localnet with the same numbers. |
| 10:00–11:30 | Capture F1–F8 and the F9 plate (5 live clicks). Read [N] from the claim timestamps. |
| 11:30–12:00 | 05-offcamera (one Squads round), then capture F10–F12. |
| 12:00–14:00 | Rough cut with titles, timer and cards; record the VO to the cut with [N] filled in. |
| 14:00–17:00 | Fine-tune; English burned-in captions + SRT; optional PT-BR SRT. |
| 17:00 | Review muted and with sound: ≤ 2:10, one honesty label per shot. |
| 18:00 | Export, upload unlisted, test in a private window. |
| 19:00 | Judge-ready check of reserve.mutav.finance in a private window. |
| 19:30 | Submit (Colosseum + Superteam BR track). |
| 23:00 | Hard stop; the rest is buffer. |

## 9. Risks

| Risk | Where | What to do |
|---|---|---|
| Not enough devnet BRS | staging | These numbers need ≈ R$47,060. With more sandbox BRS, Plan A (pilot product) is better. |
| State drifted (stray lease or fee) | F6 | Free capital before Ana must be in [R$4,500, R$9,000) so Ana fits and the next equal lease does not. Close strays with close_guarantee VOID. |
| Known app behaviours (harness, localnet) | F3, F6, F7 | Register resets to a red preview; the refusal error carries ~8 lines of encoded text; paid and settled rows vanish with their confirmation. Workarounds per shot; fixes listed in app-requirements. |
| Explorer shot untested | F4 | It can only be checked on devnet: open the Guarantee PDA right after deploy staging. |
| NAV not published | F11 | Send refresh (permissionless) before capturing. |
| Withdrawal not filled | off camera | Check mode Normal, not paused, no fulfil halt, free ≥ R$4,086.18 before the fill. A frozen redemption shows "pending" with an amber note. |
| Over 2:10 | edit | Trim F5 and F8 (−2 s each); never trim the F6 silence. |
| Claim under two minutes | F8 | [N] from settled_at − filed_at: "seconds" if under 2 min, "minutes" otherwise; round down, never up. Say it is the on-chain run, not real-world operations. |

## 10. What judges will see afterwards

| Artefact | How it reads |
|---|---|
| /reserve | Covered, mode Normal: stable R$40,861.82, required R$40,125, value per share 1.021545 |
| Ana's guarantee 5e1f… | Active · default left R$7,500 · exit left R$9,000 · opaque id, no names |
| /reserve/claims | One claim: R$1,500, filed → paid → settled, minutes apart |
| /reserve/capital | Deposits R$40,000 + R$4,000; one fee receipt (R$2,448 net, R$612 take); one claim; one redemption R$4,086.18 |
| The refused lease | Nothing: it never landed |

## 11. Open production decisions

1. Plan B (fits the devnet BRS in hand) or Plan A (pilot product; needs more sandbox BRS and a 12× form).
2. Recording surface: the real pages (default) or a cleaned /demo.
3. Whether to include the optional simulated issuer-revenue sweep.
4. Narrator, pronunciation of "MUTAV", face cam or not.
