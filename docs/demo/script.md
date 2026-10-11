# MUTAV: product demo script (v4)

Companion to the storyboard (`storyboard.html`); the two match.

- **Runtime:** 2:45. **Voiceover:** 235 words, verbatim below; three spoken amounts in reais.
- **Recorded**, not live: silent clips per beat (injected test wallet, no pop-ups), a rough cut with overlays, then the VO recorded to the cut.
- **Numbers:** ADR 0028 (c = 0.25), Plan B with 6× + 6× cover. Ana, agency names and lease references are fictional.
- **Overlays (edit):** devnet badge always; coverage meter; corner mini-map with the active component (legend once, F3); "Signed by …" chips; "Coverage gate · refused" chip; at most one honesty label per shot.

## 1. Beats

| Time | Beat | Frames |
|---|---|---|
| 0:00 (11 s) | The stakes | F1 |
| 0:11 (7 s) | Agency side | F2 |
| 0:18 (30 s) | Ana's lease on-chain | F3–F5 |
| 0:48 (24 s) | The refusal | F6–F7 |
| 1:12 (38 s) | Rent goes unpaid | F8–F10 |
| 1:50 (40 s) | Capital payoff | F11–F13 |
| 2:30 (15 s) | Close | F14 |

## 2. Voiceover (verbatim)

> **0:00** Ana wants to rent an apartment in Passo Fundo. Her landlord wants a guarantor. MUTAV is that guarantor, and every real it promises is backed on Solana.
>
> **0:11** Her agency works in MUTAV's platform. Every lease it signs becomes an account on Solana.
>
> **0:18** Our operator puts the lease on-chain: eighteen thousand reais of cover, one account per lease, with an opaque ID. No name, no CPF.
>
> **0:37** The public reserve updates at once. It holds BRS, Nora's Brazilian real stablecoin, and must keep a quarter of everything it guarantees.
>
> **0:48** So what if we try to sign one more lease? It needs forty-five thousand. The reserve holds forty-four. (click) The program refuses. Nothing moves. MUTAV can't promise what its reserve can't back. (3 s silence)
>
> **1:12** Now say Ana misses a month. The claim is filed, the money is set aside, and the reserve pays MUTAV's payments account, within a cap set by the admin multisig. The PIX to the agency is recorded on-chain: filed to settled in [N] minutes. Seguro-fiança allows up to thirty days.
>
> **1:50** Meanwhile, guarantee fees from every lease flow into the reserve. Even after paying Ana's claim, each share is worth more than before. A capital provider takes out more than they put in, only from capital above what the guarantees require, and only after claims. The same reserve that protects the landlord pays the people who fund it.
>
> **2:30** MUTAV. Brazil's onchain rent guarantee. Open source, live on devnet.
>

[N] = whole minutes from filed_at to settled_at in the real capture; fill in before recording the VO.

## 3. Shot list

**F1 · 0:00 – 0:11 · /reserve (Overview)**: The stakes: Ana needs a guarantor
- **On screen:** Open on the public reserve page, already loaded: Overview, devnet badge, coverage meter (required R$36,000 / held R$44,000). No wallet. The mini-map sits in the corner with "BRS reserve" active.
- **VO:** "Ana wants to rent an apartment in Passo Fundo. Her landlord wants a guarantor. MUTAV is that guarantor, and every real it promises is backed on Solana."
- **Caption:** Built during the hackathon: Solana program + reserve app
- **Honesty label:** Built during the hackathon: Solana program + reserve app
- **Proof:** Live figures read from the devnet program accounts.
- **Edit:** Product on screen from frame 1; the stakes are in the voice. Slow push-in ≤ 1.3× (motion).
- **Retake:** Read-only: repeat freely.

**F2 · 0:11 – 0:18 · app.mutav.finance (agency view)**: The agency side
- **On screen:** The agency's view in MUTAV's platform (mutav-app) with Ana's fictional lease. Mini-map: "Agency platform" active.
- **VO:** "Her agency works in MUTAV's platform. Every lease it signs becomes an account on Solana."
- **Caption:** Agency platform · pre-hackathon · not yet on-chain
- **Honesty label:** Agency platform · pre-hackathon · not yet on-chain
- **Proof:** None: off-chain, labelled as such.
- **Edit:** Hard cut in and out. This label is the shot's one honesty label.
- **Retake:** Read-only: repeat freely.

**F3 · 0:18 – 0:28 · /operator · register_guarantee**: Ana's lease: register
- **On screen:** Register tab. Opaque reference MTV-PF-0009, a fictional agency, rent 1500, default 6×, exit 6×. The preview is green: R$18,000 cover, R$3,500 headroom left. The mini-map shows its legend here, once.
- **VO:** "Our operator puts the lease on-chain: eighteen thousand reais of cover,"
- **Caption:** Rent R$1,500 · cover 6× + 6× = R$18,000
- **Honesty label:** Mini-map legend (first appearance)
- **Proof:** The bound box reads free capital R$8,000 from VaultState.
- **Edit:** Jump-cut the typing. The legend fades out after 3 s and never returns.
- **Retake:** Read-only until you click: repeat freely.

**F4 · 0:28 – 0:37 · /operator → Solana Explorer**: Signed: the one Explorer shot
- **On screen:** Click register_guarantee. The injected test wallet signs, with no pop-up: hold on the "Signed by operator" chip with the short signature. Then cut to Explorer on the new Guarantee PDA: owner, opaque id, the two cover legs.
- **VO:** "one account per lease, with an opaque ID. No name, no CPF."
- **Caption:** Signed by operator · 4kQm…x9Tz
- **Honesty label:** none (devnet badge only)
- **Proof:** The single Explorer shot: the Guarantee PDA on devnet. It must be checked on devnet (it can't be tested on localnet).
- **Edit:** Cut on the confirmation before the form resets (known app behaviour: it pre-fills the next reference with a red preview). Optional: splice a hand-recorded real Phantom approval (≤ 1 s) before the chip, in this shot only.
- **Retake:** Consumes R$4,500 of free capital and the reference. Reset: close_guarantee VOID (operator, instant), then register as MTV-PF-0009b. The VOID lease stays on /reserve/coverage as "closed".

**F5 · 0:37 – 0:48 · /reserve/coverage**: The public reserve, and its rule
- **On screen:** /reserve/coverage, no wallet. Coverage required rises to R$40,500; the new row sits at the bottom. BRS, Nora and the 25% rule are introduced here, not in the climax.
- **VO:** "The public reserve updates at once. It holds BRS, Nora's Brazilian real stablecoin, and must keep a quarter of everything it guarantees."
- **Caption:** Keep 25% of all cover · R$40,500 required of R$44,000
- **Honesty label:** none (devnet badge only)
- **Proof:** The same numbers, read independently by a public page.
- **Edit:** Highlight the new row, then the meter (40,500 / 44,000).
- **Retake:** Read-only: repeat freely.

**F6 · 0:48 – 0:58 · /operator · register_guarantee**: The question
- **On screen:** The next reference, MTV-PF-0010, with the same amounts. The preview is red: R$45,000 required against R$44,000 held.
- **VO:** "So what if we try to sign one more lease? It needs forty-five thousand. The reserve holds forty-four."
- **Caption:** Next lease needs R$45,000 · reserve holds R$44,000
- **Honesty label:** none (devnet badge only)
- **Proof:** VaultConfig (c = 0.25) and VaultState, through the client's mirror of the program rule.
- **Edit:** Zoom onto the red box on a hold (up to 2× from the hold still).
- **Retake:** Read-only preview: repeat freely.

**F7 · 0:58 – 1:12 · /operator · register_guarantee**: Refused. Nothing moves.
- **On screen:** Click. The status turns red with the program's error name (on screen only), the "Coverage gate · refused" chip appears, and the meter does not move. Hold 3 s in silence.
- **VO:** "The program refuses. Nothing moves. MUTAV can't promise what its reserve can't back."
- **Caption:** Coverage gate · refused · InsufficientFreeCapital
- **Honesty label:** none (devnet badge only)
- **Proof:** The program's own error from its simulation logs. No Explorer link: a refused transaction never lands.
- **Edit:** Crop to the first line of the error (known app behaviour: ~8 lines of encoded detail follow it). Freeze 3 s on the error and the unchanged meter; no music.
- **Retake:** Repeatable without limit: nothing lands, nothing changes.

**F8 · 1:12 – 1:22 · /operator · file_claim**: Later: Ana misses a month
- **On screen:** One "later" wipe, then the file_claim tab: Ana's guarantee, default leg, R$1,500 (one month), notice NTC-PF-0001. Click; "Signed by operator".
- **VO:** "Now say Ana misses a month. The claim is filed, the money is set aside,"
- **Caption:** Claim filed · R$1,500 set aside
- **Honesty label:** none (devnet badge only)
- **Proof:** A confirmed tx and a new ClaimFiling PDA.
- **Edit:** The video's only time-jump wipe (0.5 s) opens this shot.
- **Retake:** Consumes the notice and R$1,500 of Ana's default leg (R$7,500 left). If only the capture was bad, continue on the same claim. A full redo files NTC-PF-0002, uses R$1,500 more of the R$20,000 per-31-day cap and adds a timeline row.

**F9 · 1:22 – 1:32 · /operator · pay_claim**: Paid, within the cap
- **On screen:** pay_claim tab: the bound box shows the R$15,000 per-call cap. Click pay_claim R$1,500; "Signed by operator". The meter moves to 40,125 / 42,500: still covered.
- **VO:** "and the reserve pays MUTAV's payments account, within a cap set by the admin multisig."
- **Caption:** Paid R$1,500 · cap R$15,000/call · still covered
- **Honesty label:** none (devnet badge only)
- **Proof:** A confirmed tx; BRS from the reserve PDA to the whitelisted payments account.
- **Edit:** Grab the confirmation immediately (known app behaviour: the paid row, its status and its before/after vanish once sent). The meter carries the "after".
- **Retake:** One payment per filing; a redo needs a fresh claim (see F8).

**F10 · 1:32 – 1:50 · /operator · settle_payout → /reserve/claims**: The landlord's moment
- **On screen:** settle_payout with the prefilled PIX end-to-end id (only its hash goes on-chain); "Signed by operator". Cut to /reserve/claims: filed → paid → settled with timestamps.
- **VO:** "The PIX to the agency is recorded on-chain: filed to settled in [N] minutes. Seguro-fiança allows up to thirty days."
- **Caption:** PIX simulated on devnet · settlement recorded on-chain
- **Honesty label:** PIX simulated on devnet · settlement recorded on-chain
- **Proof:** Three on-chain timestamps on one ClaimFiling PDA. [N] = settled_at − filed_at from the real capture, in whole minutes; fill in the VO and caption after capture.
- **Edit:** Hold the row on a still; zoom on the duration. Cite SUSEP Circ. 621/2021 art. 43 in the video description, not on screen.
- **Retake:** settle_payout runs once per paid claim; /reserve/claims is read-only.

**F11 · 1:50 – 1:58 · /operator · contribute_fees**: Guarantee fees flow in
- **On screen:** contribute_fees R$3,060: two months of 12% fees on the book's R$1,500 rents (17 lease-months; Ana's missed month excluded). Split: R$612 to MUTAV's treasury, R$2,448 to the reserve.
- **VO:** "Meanwhile, guarantee fees from every lease flow into the reserve."
- **Caption:** Two months of fees in one step for the demo: R$3,060
- **Honesty label:** Two months of fees in one step for the demo
- **Proof:** A confirmed tx and a FeeReceipt PDA.
- **Edit:** The caption carries the time compression; no second wipe.
- **Retake:** Each invoice reference is recorded once; a redo adds the fees again. Prefer re-capturing the screen only.

**F12 · 1:58 – 2:07 · /reserve (Overview)**: Each share is worth more
- **On screen:** /reserve Overview after a refresh: stable assets R$44,948; value per share 1.021545 (1.000000 at deposit, 0.965909 after the claim).
- **VO:** "Even after paying Ana's claim, each share is worth more than before."
- **Caption:** Value per share 1.000000 → 1.021545
- **Honesty label:** none (devnet badge only)
- **Proof:** Read from VaultState (send refresh first so the published NAV is current).
- **Edit:** Zoom on the value per share from a hold still (up to 2×).
- **Retake:** Read-only: repeat freely.

**F13 · 2:07 – 2:30 · /investment**: Capital out, above what went in
- **On screen:** /investment as capital wallet B: redeem 4,000 shares ("You receive R$4,086.18") → Request redemption ("Signed by capital wallet") → [cut: admin multisig fills the queue, 5-min lock] → claim_assets → deposited R$4,000.00, claimed R$4,086.18. The amounts appear on screen only.
- **VO:** "A capital provider takes out more than they put in, only from capital above what the guarantees require, and only after claims. The same reserve that protects the landlord pays the people who fund it."
- **Caption:** R$4,000 in → R$4,086.18 out
- **Honesty label:** Pilot capital is MUTAV's own; not open to outside investors
- **Proof:** The claim_assets tx and the wallet's BRS balance change.
- **Edit:** Reais only; no rate, no APY. The fill wait is a hard cut. The disclaimer is this shot's one honesty label.
- **Retake:** One redemption; if the capture is bad, re-capture the screen. A redo needs another deposit (another Squads round).

**F14 · 2:30 – 2:45 · card (made in the editor)**: Close
- **On screen:** The tagline, the repo and the live app URL on the brand grid. The mini-map is hidden. Hold to the end.
- **VO:** "MUTAV. Brazil's onchain rent guarantee. Open source, live on devnet."
- **Caption:** Open source (MIT) · live on Solana devnet
- **Honesty label:** none (devnet badge only)
- **Proof:** Program id in small mono (optional).
- **Edit:** The VO ends about 2:36; hold the card in silence to 2:45.
- **Retake:** Made in the editor.

## 4. Numbers (Plan B, chosen)

| Step | Action (who) | Stable assets | Coverage required | Free capital | Value per share | Check |
|---|---|---|---|---|---|---|
| 0 | Deposits filled at 1.000000: wallet A R$40,000, wallet B R$4,000 (capital wallets; Squads fill) | R$44,000 | — | — | 1.000000 | requests within R$1k–R$100k; TVL ≪ R$1M |
| 1 | Book: 8 leases × rent R$1,500 × (6 + 6) = R$18,000 cover each = R$144,000 (operator) | R$44,000 | R$36,000 | R$8,000 | 1.000000 | R$18k ≤ R$120k per guarantee |
| 2 | Ana: + R$18,000 cover (operator) | R$44,000 | R$40,500 | R$3,500 | 1.000000 | (a) fits: needs R$4,500 of R$8,000 |
| 3 | Next equal lease: would need R$45,000 (operator) | R$44,000 | R$40,500 | R$3,500 | 1.000000 | (a) refused: R$1,000 short; nothing changes |
| 4 | file_claim R$1,500 on Ana, default leg (operator) | R$44,000 | R$40,500 | R$3,500 | 0.965909 | set aside; required = max(25% × cover, provisions) |
| 5 | pay_claim R$1,500 (operator) | R$42,500 | R$40,125 | R$2,375 | 0.965909 | (b) still covered; (e) ≤ R$15k/call, ≤ R$20k/31 days |
| 6 | contribute_fees R$3,060 gross = 17 lease-months × 12% × R$1,500; take R$612 → treasury, R$2,448 → reserve (operator) | R$44,948 | R$40,125 | R$4,823 | 1.021545 | (c) above the deposit value |
| 7 | Wallet B redeems 4,000 shares → R$4,086.18 (Squads fill, then claim_assets) | R$40,861.82 | R$40,125 | R$736.82 | 1.021545 | (d) ≤ free R$4,823; ≥ R$1k; whole fill; still covered |
| 6b (optional) | sweep_income R$357.90: one month of issuer revenue at 70% of CDI (9.555% a year ÷ 12) on R$44,948, simulated on devnet | R$45,305.90 | R$40,125 | R$5,180.90 | 1.029680 | B would receive R$4,118.72 |

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
| /reserve | Transparency, one long page | Overview + sub-routes | F1, F12 |
| /reserve/coverage | — (section) | Coverage tab | F5 |
| /reserve/claims | — (section #claims) | Claims tab | F10 |
| /reserve/capital | — (#flows, #queue) | Capital tab; /reserve/flows and /reserve/queue redirect here | optional |
| /reserve/risks | — (#disclosures) | Risks tab; /reserve/disclosures redirects here | — |
| /reserve/verify | — (#accounts) | Verify tab; /reserve/accounts redirects here | — |
| /investment | — (/investor) | Swap-style card + queue entries; /investor, /dashboard redirect here | F13 |
| /operator | Operator console | Same, restyled | F3–F4, F6–F11 |
| /admin | Squads proposals | Same, restyled | off-camera (fills) |
| /demo | Guided six steps | Same; a cleaned version is the optional alternative surface | alternative |
| /simulator | Reserve simulator | Same | not used |
| app.mutav.finance | Agency platform (mutav-app, pre-existing) | — | F2 |

## 6. Devnet staging

| # | Step | Who signs | Wait |
|---|---|---|---|
| 1 | Deploy, initialize, verify.ts green (ADR 0028: c = 0.25, R$1M TVL, R$120k per guarantee, R$15k / R$20k claim caps) | Upgrade Squads 2-of-2 | 1 h lock |
| 2 | App deployed for devnet with reais on /reserve and /investment and the disclaimer line | App owner | — |
| 3 | Fund: capital wallet A R$40,000 BRS, capital wallet B R$4,000, operator R$3,060 (+R$358 for the optional sweep); SOL for each | BRS holder | — |
| 4 | set_allowlist_root with A and B (skip if set at initialize) | Admin Squads 2-of-2 | 5 min lock |
| 5 | request_deposit: A 40,000; B 4,000 | Capital wallets A, B | — |
| 6 | fulfil_deposits (count 2), then claim_shares from A and B | Admin Squads 2-of-2; A, B | 5 min lock |
| 7 | Register 8 leases: rent 1500, default 6×, exit 6×, refs MTV-PF-0001…0008, 2–3 fictional agency names | Operator | — |
| 8 | Check: stable R$44,000 · required R$36,000 · free R$8,000 · 8 active · value per share 1.000000 | Anyone | — |
| 9 | Capture F1–F12 (Ana MTV-PF-0009, refused MTV-PF-0010, claim NTC-PF-0001, pay, settle, fees R$3,060, refresh before F12) | Operator; anyone for refresh | — |
| 10 | F13: B request_redeem 4,000 shares → fulfil_redeems (count 1) → B claim_assets (R$4,086.18) | B; Admin Squads 2-of-2 | 5 min lock |
| 11 | Judge-ready check: mode Normal, covered (free R$736.82), timeline reads correctly. No restore needed | Anyone | — |

No restore is needed: the reserve stays covered (free capital R$736.82 at the end, mode Normal).

## 7. Capture, voice, captions

- Harness screencast: 1080p at 30 fps; 2× stills on holds only. Zooms over motion ≤ 1.3×, on holds up to 2×.
- Injected disposable test wallet: no pop-ups; signatures shown as "Signed by …" chips. Optional real-wallet approval clip in F4 only.
- English VO, English burned-in captions + SRT; optional PT-BR SRT for the Superteam Brazil jury. SUSEP Circ. 621/2021 art. 43 in the description.

## 8. Run sheet (BRT)

| When | What |
|---|---|
| Before Oct 12 | Deploy and verify. App must-haves deployed (reais, disclaimer). Harness updated to v4 (see app-requirements). Staging steps 3–8. Time a VO read-through. |
| Oct 12 · by 10:00 | Staging complete and checked. If devnet or the app is not ready by 12:00, record on a seeded localnet with the same numbers. |
| 10:00–12:00 | Capture F1–F12 as silent clips, one per beat (F2 from app.mutav.finance). Note [N] from the claim timestamps. |
| 12:00–12:30 | F13: B requests the redemption; Squads fill (5-min lock); capture claim_assets. |
| 12:30–14:30 | Rough cut with the overlays (badge, meter, mini-map, chips, labels); record the VO to the cut with [N] filled in. |
| 14:30–17:30 | Fine-tune; English burned-in captions + SRT; optional PT-BR SRT; close card. |
| 17:30 | Review muted and with sound: ≤ 2:45, one honesty label per shot, terminology. |
| 18:30 | Export, upload unlisted, test the link in a private window. |
| 19:30 | Judge-ready check of reserve.mutav.finance/reserve and /investment in a private window. |
| 20:00 | Submit (Colosseum + Superteam BR track). |
| 23:00 | Hard stop; the rest is buffer. |

## 9. Risks

| Risk | Where | What to do |
|---|---|---|
| Not enough devnet BRS | staging | These numbers need ≈ R$47,060. With more sandbox BRS, Plan A (pilot product) is better. |
| State drifted (stray lease or fee) | F6 | Free capital before Ana must be in [R$4,500, R$9,000) so Ana fits and the next equal lease does not. Close strays with close_guarantee VOID. |
| Known app behaviours (harness, localnet) | F4, F7, F9, F10 | Register resets to a red preview; the refusal error carries ~8 lines of encoded text; paid and settled rows vanish with their confirmation. Workarounds per shot; fixes listed in app-requirements. |
| Explorer shot untested | F4 | It can only be checked on devnet: open the Guarantee PDA right after deploy staging. |
| NAV not published | F12 | Send refresh (permissionless) before capturing. |
| Withdrawal not filled | F13 | Check mode Normal, not paused, no fulfil halt, free ≥ R$4,086.18 before the fill. A frozen redemption shows "pending" with an amber note. |
| Over 2:45 | edit | Trim the F14 hold and F13 (−3 s each); never trim the F7 silence. |

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
4. Whether to splice the optional real-wallet approval clip into F4.
5. Narrator, pronunciation of "MUTAV", face cam or not.
