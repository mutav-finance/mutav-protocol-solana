# MUTAV: product demo script (v3)

Guarantee-led, ending on a capital payoff. Companion to the storyboard (`storyboard.html`); the two match.

- **Runtime:** 2:45. **Voiceover:** 294 words at about 140–150 wpm.
- **Recorded**, not live: silent screen clips per beat, a rough cut, then the VO recorded to the cut.
- **Numbers:** ADR 0028 (c = 0.25). Ana, agency names and lease references are fictional.
- **Honesty labels:** agency platform built before the hackathon and not yet connected on-chain; PIX transfer simulated on devnet, settlement recorded on-chain; fees shown as "two months of the book's guarantee fees, contributed in one step for the demo"; returns in reais only, never a rate.

## 1. Beats

| Time | Beat | Frames |
|---|---|---|
| 0:00 (10 s) | Hook | F1 |
| 0:10 (12 s) | Agency side | F2–F3 |
| 0:22 (30 s) | Ana's lease on-chain | F4–F6 |
| 0:52 (35 s) | The refusal | F7–F8 |
| 1:27 (35 s) | Rent goes unpaid | F9–F11 |
| 2:02 (33 s) | Capital payoff | F12–F14 |
| 2:35 (10 s) | Close | F15 |

## 2. Shot list

**F1 · 0:00 – 0:10 · /reserve (Overview)**: Hook: the product, at once
- **On screen:** Open on the public reserve page, already loaded: the Overview tab, the devnet badge and the coverage meter (R$36,000 required of R$44,000 held). No wallet connected.
- **VO:** "This is MUTAV, a rent guarantor whose reserve lives on Solana. We built its program and this app during the hackathon."
- **Caption:** Built in the hackathon: Solana program + reserve app
- **Proof:** Live figures from devnet program accounts.
- **Edit:** No title card first: product on screen from frame 1. Slow push-in, ≤1.3× unless captured at 2×.
- **Retake:** Read-only: repeat freely.

**F2 · 0:10 – 0:16 · app.mutav.finance (agency view)**: The agency side
- **On screen:** The agency's view in MUTAV's platform (mutav-app), with Ana's fictional lease. The label is visible for the whole shot.
- **VO:** "Agencies use MUTAV's platform, built before the hackathon and not yet on-chain."
- **Caption:** Agency platform · pre-hackathon · not on-chain yet
- **Proof:** None: off-chain, labelled as such.
- **Edit:** Hard cut in, hard cut out. Keep the label on screen; it is an honesty label, not decoration.
- **Retake:** Read-only: repeat freely.

**F3 · 0:16 – 0:22 · card (made in the editor)**: Architecture strip
- **On screen:** A one-line architecture strip in brand style. Legend: built in hackathon (operator console, program, reserve app) / pre-existing (agency platform) / simulated (the PIX transfer) / next (the agency platform → operator link).
- **VO:** "MUTAV's operator carries each lease to the program. Claims settle by PIX."
- **Caption:** Built in hackathon · pre-existing · simulated · next
- **Proof:** None: a diagram.
- **Edit:** Animate the arrows left to right, one per half-second. No other motion.
- **Retake:** Made in the editor.

**F4 · 0:22 – 0:34 · /operator · register_guarantee**: Ana's lease: register
- **On screen:** The register tab. Enter the opaque reference MTV-PF-0009, a fictional agency name, rent 1000, default 12×, exit 6×. The PREVIEW turns green: R$18,000 cover, R$3,500 of headroom left.
- **VO:** "Ana is renting in Passo Fundo, a thousand reais a month. MUTAV guarantees twelve months of rent and six of property recovery: eighteen thousand in cover."
- **Caption:** Rent R$1,000 · cover 12× + 6× = R$18,000
- **Proof:** The bound box reads free capital R$8,000 from VaultState.
- **Edit:** Jump-cut the typing: field empty → field filled. Never show keystrokes in real time.
- **Retake:** Read-only until you click: repeat freely.

**F5 · 0:34 – 0:42 · /operator → Solana Explorer**: Signed: the one Explorer shot
- **On screen:** Click register_guarantee and confirm in Phantom (cut). The status chip shows Confirmed and a short signature. Click it: Explorer opens on the new Guarantee PDA, showing the owner, the opaque id and the two cover legs.
- **VO:** "The operator signs. On-chain it's one account per lease: cover and an opaque ID. No name, no CPF."
- **Caption:** register_guarantee · confirmed · 4kQm…x9Tz
- **Proof:** The single Explorer shot of the video: the Guarantee PDA on devnet.
- **Edit:** Cut the Phantom wait to ≤1 s. This is the only Explorer shot; every other proof stays in the app.
- **Retake:** Consumes R$4,500 of free capital and the reference. Reset: close_guarantee VOID on that lease (operator, instant), then register again as MTV-PF-0009b. The VOID lease stays on /reserve/coverage as "closed".

**F6 · 0:42 – 0:52 · /reserve/coverage**: The public reserve updates
- **On screen:** /reserve/coverage with no wallet. Coverage required rises from R$36,000 to R$40,500, and the new row is at the bottom.
- **VO:** "The public reserve updates at once. Coverage required rises to forty thousand five hundred."
- **Caption:** Coverage required R$36,000 → R$40,500
- **Proof:** The same numbers as the operator saw, read independently by a public page.
- **Edit:** Highlight the new row. The meter in the nav updates to 40,500 / 44,000.
- **Retake:** Read-only: repeat freely.

**F7 · 0:52 – 1:10 · /operator · register_guarantee**: The rule, and the next lease
- **On screen:** Same form, the next reference (MTV-PF-0010), the same amounts. The PREVIEW is red: R$45,000 would be required against R$44,000 held, R$1,000 short.
- **VO:** "The rule: the reserve must hold a quarter of all the cover it guarantees, in BRS, Nora's Brazilian real stablecoin. The next lease, the same size, would need forty-five thousand. The reserve holds forty-four."
- **Caption:** Rule: hold 25% of all cover · next lease: R$1,000 short
- **Proof:** VaultConfig (c = 0.25) and VaultState, through the client's mirror of the program's rule.
- **Edit:** Centrepiece, part 1. Slow down. Zoom onto the red box. A simple on-screen formula card is fine: required = 25% × cover.
- **Retake:** Read-only preview: repeat freely.

**F8 · 1:10 – 1:27 · /operator · register_guarantee**: Refused. Nothing moves.
- **On screen:** Click Send anyway and confirm (Phantom may warn). The status turns red with the program's error name, and the "Coverage gate · refused" chip appears. The meter does not move. Hold 3 s.
- **VO:** "We send it anyway. The program refuses it: InsufficientFreeCapital. Nothing changes. MUTAV can't sign a guarantee the reserve can't back."
- **Caption:** Coverage gate · refused · InsufficientFreeCapital
- **Proof:** The program's own error from its simulation logs. No Explorer link: a refused transaction never lands (an optional skipPreflight send can create one).
- **Edit:** Freeze-frame for 3 s on the error and the unchanged meter. Silence under the hold, no music.
- **Retake:** Repeatable without limit: nothing lands, nothing changes.

**F9 · 1:27 – 1:39 · /operator · file_claim**: Rent goes unpaid: claim filed
- **On screen:** file_claim tab: Ana's guarantee, default leg, R$1,000 (one month), notice NTC-PF-0001. Confirm. The moved table shows provisions ▲ and NAV per share ▼.
- **VO:** "Months later, Ana misses a month's rent. MUTAV files the claim, and a provision is booked before any money moves."
- **Caption:** Claim filed · R$1,000 provision booked
- **Proof:** A confirmed tx and a new ClaimFiling PDA.
- **Edit:** Optional 0.5 s "months later" wipe. Cut the wallet wait.
- **Retake:** Consumes the notice and R$1,000 of Ana's default leg (R$11,000 left). If only the capture was bad, continue to F10 on the same claim. A full redo files a fresh claim (NTC-PF-0002), uses another R$1,000 of the R$20,000 per-31-day cap and adds a timeline row.

**F10 · 1:39 – 1:50 · /operator · pay_claim**: Paid, and still covered
- **On screen:** pay_claim tab: the bound box shows the R$15,000 per-call cap. Click pay_claim R$1,000 and confirm. The reserve is still covered: R$43,000 held against R$40,250 required.
- **VO:** "It pays from the reserve, only to MUTAV's payments account, within a cap the admin multisig sets. The reserve stays covered."
- **Caption:** Paid R$1,000 · cap R$15,000/call · still covered
- **Proof:** A confirmed tx; BRS from the reserve PDA to the whitelisted payments account.
- **Edit:** Zoom on the cap, then on "still covered". The meter reads 40,250 / 43,000.
- **Retake:** One payment per filing; a redo needs a fresh claim (see F9).

**F11 · 1:50 – 2:02 · /operator · settle_payout → /reserve/claims**: Settlement recorded: the timeline
- **On screen:** settle_payout with the prefilled PIX end-to-end id (only its hash goes on-chain), then cut to /reserve/claims: filed → paid → settled, with timestamps.
- **VO:** "The PIX to the agency is recorded on-chain. Filed, paid and settled in minutes; seguro-fiança rules allow up to thirty days."
- **Caption:** Seguro-fiança: up to 30 days · SUSEP 621/2021 art. 43
- **Proof:** Three on-chain timestamps on one ClaimFiling PDA.
- **Edit:** The "PIX transfer simulated on devnet · settlement recorded on-chain" line stays on screen. No bank or PIX app screens.
- **Retake:** settle_payout runs once per paid claim; /reserve/claims is read-only.

**F12 · 2:02 – 2:14 · /operator · contribute_fees**: Guarantee fees land in the reserve
- **On screen:** contribute_fees: R$2,040, which is two months of 12% fees on the book's R$1,000 rents (17 lease-months; Ana's missed month excluded). The split shows R$408 to MUTAV's treasury and R$1,632 to the reserve.
- **VO:** "Then guarantee fees from the book arrive. Twenty percent goes to MUTAV; the rest stays in the reserve."
- **Caption:** 2 months of book fees, one step for the demo: R$2,040
- **Proof:** A confirmed tx and a FeeReceipt PDA.
- **Edit:** The honesty caption is on screen for the whole shot. Optional: one sweep_income captioned "issuer revenue · simulated on devnet" (see the numbers table).
- **Retake:** Each invoice reference is recorded once; a redo uses a new reference and adds the fees again. Prefer to re-capture the screen only.

**F13 · 2:14 – 2:21 · /reserve (Overview)**: The reserve and every share rise
- **On screen:** /reserve overview: stable assets R$44,632, NAV per share 1.014364 (it was 1.000000 at deposit and 0.977273 after the claim).
- **VO:** "Stable assets and the value of every share rise."
- **Caption:** NAV per share 0.977 → 1.014
- **Proof:** Read from VaultState (send refresh first so the published NAV is current).
- **Edit:** Zoom on the NAV figure. Use the stable-assets history chart if it shows the step.
- **Retake:** Read-only: repeat freely.

**F14 · 2:21 – 2:35 · /investment**: Capital payoff: more out than in
- **On screen:** /investment as capital wallet B: redeem 4,000 shares ("You receive R$4,057.45") → Request redemption → [cut: admin multisig fills the queue after its 5-min lock] → claim_assets → "R$4,000 in → R$4,057.45 out". The disclaimer line is visible.
- **VO:** "The same reserve that protects the landlord pays the people who fund it, only from free capital above required coverage, after claims. Four thousand reais in, four thousand and fifty-seven out."
- **Caption:** R$4,000 in → R$4,057.45 out
- **Proof:** The claim_assets tx and the wallet's BRS balance change.
- **Edit:** Show amounts in reais only. Never an annual rate, APY or projection. Cut the fill wait with a 0.5 s caption: "Admin multisig fills the queue · 5-min lock".
- **Retake:** One redemption; if the capture is bad, re-capture the screen. A redo needs another deposit (another Squads round).

**F15 · 2:35 – 2:45 · card (made in the editor)**: Close
- **On screen:** The tagline, the repo and the live app URL on the brand grid. Hold to the end.
- **VO:** "MUTAV. A guarantor on the agency's side. Brazil's onchain rent guarantee. Open source, and live on devnet."
- **Caption:** Open source (MIT) · live on Solana devnet
- **Proof:** Program id in small mono (optional).
- **Edit:** The VO ends about 2:42; hold the card in silence to 2:45.
- **Retake:** Made in the editor.

## 3. Numbers (Plan B, chosen)

| Step | Action (who) | Stable assets | Coverage required | Free capital | NAV per share | Check |
|---|---|---|---|---|---|---|
| 0 | Deposits filled at NAV 1: wallet A R$40,000, wallet B R$4,000 (capital wallets; Squads fill) | R$44,000 | — | — | 1.000000 | requests within R$1k–R$100k; TVL ≪ R$1M |
| 1 | Book: 8 leases × rent R$1,000 × (12 + 6) = R$18,000 cover each = R$144,000 (operator) | R$44,000 | R$36,000 | R$8,000 | 1.000000 | R$18k ≤ R$120k per guarantee |
| 2 | Ana: + R$18,000 cover (operator) | R$44,000 | R$40,500 | R$3,500 | 1.000000 | (a) fits: needs R$4,500 of R$8,000 |
| 3 | Next equal lease: would need R$45,000 (operator) | R$44,000 | R$40,500 | R$3,500 | 1.000000 | (a) refused: R$1,000 short; nothing changes |
| 4 | file_claim R$1,000 on Ana, default leg (operator) | R$44,000 | R$40,500 | R$3,500 | 0.977273 | provision booked; required = max(25% × cover, provisions) |
| 5 | pay_claim R$1,000 (operator) | R$43,000 | R$40,250 | R$2,750 | 0.977273 | (b) still covered; (e) ≤ R$15k/call, ≤ R$20k/31 days |
| 6 | contribute_fees R$2,040 gross: 17 lease-months × 12% × R$1,000; take R$408 → treasury, R$1,632 → reserve (operator) | R$44,632 | R$40,250 | R$4,382 | 1.014364 | (c) NAV above the deposit NAV |
| 7 | Wallet B redeems 4,000 shares → R$4,057.45 (Squads fill, then claim_assets) | R$40,574.55 | R$40,250 | R$324.55 | 1.014364 | (d) R$4,057.45 ≤ free R$4,382; ≥ R$1k; whole fill; still covered |
| 6b (optional) | sweep_income R$355.38: one month of issuer revenue at 70% of CDI (9.555% a year ÷ 12) on R$44,632, simulated on devnet | R$44,987.38 | R$40,250 | R$4,737.38 | 1.022440 | B would receive R$4,089.76 |

One month of fees beats a one-month-rent claim only with more than 10.4 leases (0.8 × 0.12 × N > 1); the ≈ R$50k of devnet BRS in hand holds at most 9 at c = 0.25. So F12 contributes **two months** of the book's fees, captioned. Devnet BRS needed ≈ R$46,040.

**Plan A (pilot product, needs more sandbox BRS):**

- **Product:** Pilot product: rent R$2,200, cover 12× + 6× = R$39,600, R$9,900 required per lease
- **Capital:** A R$107,000 (R$100,000 + R$7,000 requests), B R$10,000 → R$117,000
- **Book:** 10 leases → R$99,000 required, free R$18,000
- **Ana / next:** Ana fits (free R$8,100 after); next needs R$118,800 > R$117,000 → R$1,800 short
- **Claim:** R$2,200 → stable R$114,800, required R$108,350, still covered
- **Fees:** 21 lease-months × R$264 = R$5,544 gross, R$4,435.20 net → NAV 1.019104
- **Withdrawal:** B: R$10,000 in → R$10,191.04 out; free capital R$10,885 covers it
- **Devnet BRS needed:** ≈ R$122,544, more than the ≈ R$50,000 known to be in hand (sandbox supply ≈ 139k). Needs extra sandbox BRS from Nora

## 4. Route map

| Route | Today (main) | After PR #45 | Used in |
|---|---|---|---|
| / | Landing | Landing (restyled) | — |
| /reserve | Transparency, one long page | Overview + sub-routes | F1, F13 |
| /reserve/coverage | — | Coverage tab | F6 |
| /reserve/claims | — (section #claims) | Claims tab | F11 |
| /reserve/capital | — (sections #flows, #queue) | Capital tab (flows + queue); /reserve/flows and /reserve/queue redirect here | optional |
| /reserve/risks | — (section #disclosures) | Risks tab; /reserve/disclosures redirects here | — |
| /reserve/verify | — (section #accounts) | Verify tab; /reserve/accounts redirects here | — |
| /investment | — (/investor) | Swap-style request card + queue entries; /investor and /dashboard redirect here | F14 |
| /operator | Operator console (tabs per instruction) | Same, restyled | F4–F5, F7–F12 |
| /admin | Squads proposals | Same, restyled | off-camera (fills) |
| /demo | Guided six steps | Same; a cleaned version is the optional alternative surface | alternative |
| /simulator | Reserve simulator | Same | not used |
| app.mutav.finance | Agency platform (mutav-app, pre-existing) | — | F2 |

## 5. Devnet staging

| # | Step | Who signs | Wait |
|---|---|---|---|
| 1 | Deploy, initialize, verify.ts green (ADR 0028 values: c = 0.25, R$1M TVL, R$120k per guarantee, R$15k / R$20k claim caps) | Upgrade Squads 2-of-2 | 1 h lock |
| 2 | App env for devnet; /reserve shows numbers in reais | App owner | — |
| 3 | Fund: capital wallet A R$40,000 BRS, capital wallet B R$4,000, operator R$2,040 (+R$356 if the optional sweep); SOL for each | BRS holder | — |
| 4 | set_allowlist_root with A and B (skip if set at initialize) | Admin Squads 2-of-2 | 5 min lock |
| 5 | request_deposit: A 40,000; B 4,000 | Capital wallets A, B | — |
| 6 | fulfil_deposits (count 2), then claim_shares from A and B | Admin Squads 2-of-2; A, B | 5 min lock |
| 7 | Register 8 leases: rent 1000, default 12×, exit 6×, refs MTV-PF-0001…0008, 2–3 fictional agency names | Operator | — |
| 8 | Check: stable R$44,000 · required R$36,000 · free R$8,000 · 8 active · NAV 1.000000 | Anyone | — |
| 9 | Capture F1–F13 in order (see the run sheet); send refresh before F13 | Operator; anyone for refresh | — |
| 10 | F14: B request_redeem 4,000 shares → fulfil_redeems (count 1) → B claim_assets | B; Admin Squads 2-of-2 | 5 min lock |
| 11 | Judge-ready check: mode Normal, covered (free R$324.55), timeline reads correctly. No restore needed | Anyone | — |

No restore is needed: the reserve stays covered (free capital R$324.55 at the end, mode Normal).

## 6. Run sheet (BRT)

| When | What |
|---|---|
| Before Oct 12 | Deploy and verify. App requirements merged and deployed (see app-requirements). Staging steps 3–8. Time a VO read-through. |
| Oct 12 · by 10:00 | Staging complete and checked. If devnet or the app is not ready by 12:00, record on a seeded localnet with the same numbers. |
| 10:00–12:00 | Capture F1–F13 as silent clips, one per beat (agency view F2 from app.mutav.finance). |
| 12:00–12:30 | F14: B requests the redemption; Squads fill (5-min lock); capture claim_assets. |
| 12:30–14:30 | Rough cut to the frame timings; record the VO to the cut. |
| 14:30–17:30 | Fine-tune, burned-in captions + SRT, cards (architecture strip, close). |
| 17:30 | Review muted and with sound: ≤ 2:45, terminology, honesty labels. |
| 18:30 | Export, upload unlisted, test the link in a private window. |
| 19:30 | Judge-ready check of reserve.mutav.finance/reserve and /investment in a private window. |
| 20:00 | Submit (Colosseum + Superteam BR track). |
| 23:00 | Hard stop; the rest is buffer. |

## 7. Risks

| Risk | Where | What to do |
|---|---|---|
| Not enough devnet BRS | staging | The chosen numbers need ≈ R$46k BRS. If more sandbox BRS arrives, the pilot-product variant (Plan A) is better. |
| State drifted (stray lease or fee) | F7 | Recompute: free capital before Ana must be in [R$4,500, R$9,000) so Ana fits and the next equal lease does not. Close strays with close_guarantee VOID. |
| Phantom will not sign a transaction it expects to fail | F8 | Optional: send the same instruction once with skipPreflight from a script, and show its failed signature on Explorer (the logs name InsufficientFreeCapital). |
| NAV not published | F13 | Send refresh (permissionless) before capturing; or show the page's "now" value. |
| Withdrawal not filled | F14 | Check mode Normal, not paused, no fulfil halt, and free capital ≥ R$4,057.45 before proposing the fill. |
| Retake leftovers visible to judges | after | VOID leases show as "closed"; extra claims add rows. Keep on-chain redos few. |
| Over 2:45 | edit | Trim F6 (−3 s) and F13 (−2 s); never trim the F8 hold. |

## 8. Full narration

> This is MUTAV, a rent guarantor whose reserve lives on Solana. We built its program and this app during the hackathon.
>
> Agencies use MUTAV's platform, built before the hackathon and not yet on-chain.
>
> MUTAV's operator carries each lease to the program. Claims settle by PIX.
>
> Ana is renting in Passo Fundo, a thousand reais a month. MUTAV guarantees twelve months of rent and six of property recovery: eighteen thousand in cover.
>
> The operator signs. On-chain it's one account per lease: cover and an opaque ID. No name, no CPF.
>
> The public reserve updates at once. Coverage required rises to forty thousand five hundred.
>
> The rule: the reserve must hold a quarter of all the cover it guarantees, in BRS, Nora's Brazilian real stablecoin. The next lease, the same size, would need forty-five thousand. The reserve holds forty-four.
>
> We send it anyway. The program refuses it: InsufficientFreeCapital. Nothing changes. MUTAV can't sign a guarantee the reserve can't back.
>
> Months later, Ana misses a month's rent. MUTAV files the claim, and a provision is booked before any money moves.
>
> It pays from the reserve, only to MUTAV's payments account, within a cap the admin multisig sets. The reserve stays covered.
>
> The PIX to the agency is recorded on-chain. Filed, paid and settled in minutes; seguro-fiança rules allow up to thirty days.
>
> Then guarantee fees from the book arrive. Twenty percent goes to MUTAV; the rest stays in the reserve.
>
> Stable assets and the value of every share rise.
>
> The same reserve that protects the landlord pays the people who fund it, only from free capital above required coverage, after claims. Four thousand reais in, four thousand and fifty-seven out.
>
> MUTAV. A guarantor on the agency's side. Brazil's onchain rent guarantee. Open source, and live on devnet.
>

## 9. Open production decisions

1. Plan B (fits the devnet BRS in hand) or Plan A (pilot product; needs more sandbox BRS).
2. Recording surface: the real pages (default) or a cleaned /demo.
3. Whether to include the optional simulated issuer-revenue sweep in F12.
4. Narrator, pronunciation of "MUTAV", face cam or not.
