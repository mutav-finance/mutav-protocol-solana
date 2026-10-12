# Winning Colosseum / Solana hackathon demo videos: structure, pacing, judge expectations

Research date: 2026-10-11. Sources: the Colosseum blog, the colosseum.com hackathon FAQ (the live page is for the Crypto World's Fair, Sep 14 to Oct 12, 2026), and Colosseum Copilot project records (`links.presentation` = pitch video, `links.technicalDemo` = demo video, plus Copilot's own summaries of each video). Timestamps come from YouTube auto-captions pulled with yt-dlp and read in 15-second buckets, so they are accurate to about ±15 s. Loom videos could not be transcribed (the pages render empty to fetchers), so for those I only have Copilot's content summaries.

## 1. What Colosseum officially asks for: demo video vs pitch video

### Takeaway
The current Colosseum hackathon (Crypto World's Fair) asks for two videos: a **2-to-3-minute pitch video** and a **product-demo video of no more than 3 minutes**. The pitch explains *why* (team, problem, user, validation, vision). The demo explains *how*: core features, tech stack, prioritization and, above all, the reasoning behind the Solana integration. The pitch is "one of the first resources judges review." No hosting platform or format is mandated. Winners host on YouTube (sometimes unlisted), Loom and Vimeo.

### Cited Findings
- Crypto World's Fair FAQ (submission portal): "A two-to-three-minute presentation video. This is one of the first resources judges review, so it should be clear, concise, and high quality." Also: "A product-demo video of no more than three minutes explaining how the product works." — [colosseum.com/hackathon#h-faq-11](https://colosseum.com/hackathon#h-faq-11)
- The same FAQ frames the whole submission as "a pitch to Colosseum's venture fund, other investors, and an application to our Accelerator… We want to understand founder-market fit, how the opportunity was uncovered, how the team prioritizes, and whether the founders are committed to building a venture-scale business." — [colosseum.com/hackathon#h-faq-11](https://colosseum.com/hackathon#h-faq-11)
- Copilot's FAQ registry gives the current event's submission deadline as **2026-10-13T06:59Z**, which is 03:59 BRT on Oct 13. The colosseum.com page itself says only "Sep 14 — Oct 12." — Copilot `/faqs` `eventDates` (crypto-worlds-fair); [colosseum.com/hackathon](https://colosseum.com/hackathon)
- Breakout 2025 workshop (Nate Levine, Matty Taylor, Clay Robbins), on the **pitch video**: "no more than three minutes long." It should give "a concise explanation of the team's background, the problem they are solving, and who the product is for," mention user feedback or validation "even if informal," and treat the video as a brief startup pitch, "not a product demo." A clear narrative beats polished editing. It is "usually the first item judges review" and can decide whether a project is shortlisted. — [Perfecting Your Hackathon Submission (May 2025)](https://blog.colosseum.com/perfecting-your-hackathon-submission/)
- The same workshop on the **technical demo video**, then new: "2-3 minute video". "While the pitch video is for explaining the why, the technical demo is about the how." It should walk through core features, the tech stack, and why some components were prioritized over others. Gameplay footage, UI walkthroughs or architecture visuals are fine. It must be "technical, direct, and specific to implementation"; "Teams should avoid turning this into another pitch." Judges care most about "the reasoning behind these decisions, especially with regard to Solana integration." — [Perfecting Your Hackathon Submission](https://blog.colosseum.com/perfecting-your-hackathon-submission/)
- Workshop checklist mistakes include "Forgetting to grant judges access to google docs, pitch videos, github repos, etc." and "Ignoring optional fields that could provide important context." — [Perfecting Your Hackathon Submission](https://blog.colosseum.com/perfecting-your-hackathon-submission/)
- **History.** Renaissance (Spring 2024) and Radar (Fall 2024) asked for a single presentation of under 3 minutes that included "How the product works (your demo)." Colosseum recommended "using Loom over a slide deck." The separate demo video arrived with Breakout (2025). — [How to Win a Colosseum Hackathon (Matty Taylor, Feb 2024)](https://blog.colosseum.com/how-to-win-a-colosseum-hackathon/). Copilot records agree: Renaissance's Ripe and Radar's grand champion Reflect have a pitch link and no technical-demo link ([Ripe](https://colosseum.com/projects/explore/ripe-1), [Reflect](https://colosseum.com/projects/explore/reflect-protocol)).
- The Arena submission schema has separate fields `pitchVideoLink`, `demoVideoLink` / `technicalDemoLink`, `demoVideoPublic` (boolean), `liveProductLink` and `liveProductAccessInstructions`. So the demo video's visibility is a declared setting, and a live product link with access instructions is a field of its own. — Colosseum Copilot API reference (`/me` submission schema)
- Weekly updates are optional "concise, one-minute video[s]," "strongly recommend[ed] for anyone serious about competing." — [colosseum.com/hackathon#h-faq-14](https://colosseum.com/hackathon#h-faq-14)
- Hosting seen among winners: YouTube (MCPay, Yumi, LocalPay, DashX, Ripe), Loom (Autonom, Credible, Unruggable demo, attn.markets, BORE.FI, Pencil, Housd, Reflect) and Vimeo with private-link hashes (CargoBill). — Copilot project records (links in section 2)

### Inferences
- MUTAV's "≤3-minute recorded product demo" maps onto the **demo video** slot. It should be implementation-forward (what we built, how it uses Solana, why we prioritized it this way) and should not repeat the pitch. Keep it under 3:00 exactly; winning demos run 2:02 to 3:08 (section 2).
- Several Breakout/Cypherpunk winning videos are now private or unavailable on YouTube (Legasi demo, Unruggable pitch, stablecorp demo). Teams clearly use unlisted or private links, which is risky once judging ends. Keep MUTAV's links accessible to anyone with the link at least until winners are announced (~1 month after the deadline).

### Gaps
- No official statement on file format, resolution, captions or language for the World's Fair. The live page does not say whether the demo video must be public or unlisted (only the `demoVideoPublic` field hints at it).
- I could not find a 2026-specific Colosseum workshop recap for Frontier or World's Fair. A Superteam Malaysia "Colosseum Pitching Klinik" event for Frontier exists, but its page has no content beyond the title ([luma](https://luma.com/193jdso0)).

## 2. Winning fintech, RWA, payments and B2B-infra videos: hooks, time to product, on-chain proof

### Takeaway
Winning **demo** videos open with one sentence of identity, then go to the product within about 10 to 15 seconds. They run one end-to-end user flow on screen, show a real Solana devnet signature or confirmation, and close with a short architecture or "what we shipped during the hackathon" beat. Winning **pitch** videos open with founder credibility plus a traction number, or with a sharp problem statement, inside the first 10 to 15 seconds. Many winners showed **no live product at all in the pitch**: in 2026 Frontier, several fintech winners were pitch-only with no demo link. Product proof matters, but team, insight and traction can carry a submission.

### Cited Findings: per-project breakdown (timestamps ±15 s)

**MCPay — Cypherpunk 2025, 1st Stablecoins ($25k)** — [project](https://colosseum.com/projects/explore/mcpay)
- *Pitch* ([youtu.be/00LULE4sDJY](https://youtu.be/00LULE4sDJY), 2:58). Hook at 0:00: name, founder and traction in the first 10 s ("I've processed around 100,000 transactions earning more than $30,000 on the x402 rails"). 0:15 to 1:00 is an origin story (bought unused data credits and wanted to resell them as an MCP server). 1:00 to 2:00 is the vision (micropayments turn tools into "nano services"; every payment is a demand signal). 2:15 is traction again (100+ servers, ~2,500 users). 2:30 is "why now" (an a16z $30T agent-commerce forecast). No product UI beyond an x402scan screenshot.
- *Demo* ([youtu.be/KAqft_GZBuY](https://youtu.be/KAqft_GZBuY), 3:01). Opens at 0:00 by separating pre-existing work from hackathon work: "we've been building MCPay for a while, but over the past four weeks, we've pushed it to the next level." Product on screen by about 0:10 to 0:15. The flow: sign in, register a server, auto-discover tools, price at $0.10 per tool, select "Solana devnet only" (~1:00 to 1:10), then the code example for the SDK-wrapped MCP client (~1:50 to 2:10). **On-chain proof at ~2:15 to 2:35**: "Solana DevNet, we make the payment… The payment just occurred 4 seconds ago… in the explorer as well." Ends with a server registry. Pure screen recording with voiceover and no slides.

**Yumi Finance — Cypherpunk 2025, 1st DeFi ($25k), onchain BNPL** — [project](https://colosseum.com/projects/explore/yumi-finance)
- *Pitch* ([youtu.be/O-0q9cRJRvo](https://youtu.be/O-0q9cRJRvo), 3:38, over the 3-minute guidance and it still won). Hook at 0:00: "BNPL is the fastest-growing [segment] in web2 payments while it has zero presence onchain." Then problem (high merchant fees, poor underwriting, limited coverage), "$500B market," and differentiation (3% fee, "2-3x less than Klarna/Affirm," global underwriting via zkTLS). Distribution partners named at ~1:00 to 1:30. Short **UI preview inside the pitch** at ~1:35 to 2:30, then a hand-off line: "you will see more of this in technical demo by my co-founder." Moat and distribution at 2:30 to 3:00 ("first-class access to more than 60k users and $300M in volume" via launch partners). Team credentials at 3:00 to 3:38.
- *Demo* ([youtu.be/II7UAWZGK90](https://youtu.be/II7UAWZGK90), 3:08). At 0:00: "I'm co-founder and tech lead… today I'll show you what we've built for Colosseum Hackathon… we've designed this small demo shop. Let me go straight to it." **Product in under 10 s**, framed as a realistic **merchant checkout** (picks headphones, then checkout, then "pay in installments using Yumi"). 0:30 to 1:30 covers wallet connect, CEX account linking, passkey signing and an underwriting limit. ~1:45: "paying for my good using Solana. I'll approve the transaction". 2:00: "**During the hackathon, we shipped** the total redesign of our underwriting flow and integrated with Solana." 2:10 to 2:55 is the architecture (SDK/API, Privy/zkMe/Vouch, an ERC-4626-style vault that funds credit with repayments flowing back as yield). Closes with a pointer to the repo and the live demo URL.

**LocalPay — Breakout 2025, 3rd Stablecoins, QR payments in Vietnam** — [project](https://colosseum.com/projects/explore/localpay)
- *Demo* ([youtu.be/nDbkEy6-ID8](https://youtu.be/nDbkEy6-ID8), 2:02). Hook at 0:00 is a single stat ("Over a billion people… don't have a bank account") plus local context (QR codes everywhere in Southeast Asia). 0:15 is founder-market fit ("Everyone in our team has lived unbanked"). ~0:25 is a **real-world payment**: "Here is how I pay for dinner in Vietnam… No bank, no card. Just scan the QR and go", with music and footage. 0:45 to 1:10 is how it works (non-custodial; a licensed partner sends fiat in real time; Solana gasless USDT). 1:15 is "What we had to solve" (messy local QR formats, legal setup via licensed partners). 1:40: "live private beta… we use it for day-to-day payments." It treats regulatory and partner plumbing as part of the technical story.

**Ripe — Renaissance 2024, 4th DeFi & Payments (single-video era)** — [project](https://colosseum.com/projects/explore/ripe-1)
- *Pitch* ([youtu.be/ypG_fLAMgxY](https://youtu.be/ypG_fLAMgxY), 3:01). The opening is a 0:00 to 0:30 founder origin story (Philippines play-to-earn guild; new crypto users "never had to buy it" and need to cash out). 0:30 is a market stat (e-wallet adoption from ~20% to over 90%). ~1:00 to 1:30 is the product (Phantom browser, scan any merchant QR, real-time off-ramp). 1:45 to 2:15 is the market and distribution partner (the largest brick-and-mortar remittance business). Team credentials at 2:15 to 2:45. **Time to product description: about 60 s.** That is slow by 2025+ standards but typical of the 2024 single-video format.

**DashX — Frontier 2026, Winner (top-25), B2B cross-border payments OS** — [project](https://colosseum.com/projects/explore/dashx-1)
- *Pitch* ([youtu.be/5VwLyFpi6aw](https://youtu.be/5VwLyFpi6aw), **0:57**, no demo video on record). Two founders alternate. 0:00 is credibility ("scaled a company to 400K ARR"; "scaled a payments company to 100K monthly volume"). 0:10 is a one-line positioning ("payments OS for businesses doing cross-border payments"). 0:15 is a quantified pain ("Exporters lose 3 to 6% on every cross-border transaction"). 0:30 is traction ("$2 million processed… 100% month over month for four consecutive months"; partnership with an a16z-backed company across 70+ countries). 0:45 is the pipeline (a federation representing 43,000 exporters). Ends with the tagline "Fiat in, fiat out. We handle everything in between." Proof that a sub-1-minute, traction-dense pitch can make the top 25.

**CargoBill — Breakout 2025, 1st Stablecoins ($25k), freight-forwarder B2B payments** — [project](https://colosseum.com/projects/explore/cargobill) · pitch [vimeo](https://vimeo.com/1085190844/7313f0d092) · demo [vimeo](https://vimeo.com/1085190188/b570044acf)
- Copilot's pitch summary: settlement in under 30 s, a flat $15 fee, release automation, and "$70k processed during the hackathon." The pitch was delivered as a deck presentation rather than an interactive end-to-end walkthrough. — Copilot record
- Copilot's demo summary: Google/Particle login, a dashboard (USDC balance, transactions per month, yield), Coinbase Onramp funding of a **multisig business wallet** with passkeys, and payment from account credit. Noted limitation: "ACH, Wire, and card payment workflows… were not executed" in the video. — Copilot record

**Credible Finance — Cypherpunk 2025, 2nd Stablecoins ($20k), USD→INR remittance** — [project](https://colosseum.com/projects/explore/credible-finance-1) · pitch [loom](https://www.loom.com/share/c95da2598bc34332b9de6970ca99d410) · demo [loom](https://www.loom.com/share/df76d0853af9408daf70ceda074e1833) ("Technical Demo of Credible's API for Send Now, Pay Later")
- Pitch: an **admin dashboard with operating metrics** (payouts, batches, a $200,000 rolling credit limit, FX premium of 90.5 against ~88.74 INR/USD), a **Dune dashboard** of multi-chain volume, and an architecture diagram (US sender, then neobank ACH, then NBFI credit line, then local off-ramp). — Copilot record
- Demo: a B2B **API documentation walkthrough** (endpoints, signed headers, webhooks, error codes) plus partner-portal screens (wallet balances, ledger logs, payouts dashboard). Infra winners can make the demo about the integration surface rather than an end-user flow. — Copilot record

**Autonom — Cypherpunk 2025, 1st RWAs ($25k), RWA oracle** — [project](https://colosseum.com/projects/explore/autonom-unleashing-rwas-in-solana) · pitch [loom](https://www.loom.com/share/28d00e8aaee94d7cb680f6786488c47b) · demo [youtube](https://youtu.be/vGVrYRoipk4) (now unavailable)
- The pitch led with a precise gap in incumbents ("Chainlink, Pyth lack mechanisms to handle corporate events… forces perp DEXs to restrict leverage on equities ~5x–25x vs crypto ~50x–500x"). It disclosed **pre-hackathon deployments on Monad and BNB** separately from the **Solana testnet** work, and cited a commercial term with a named partner (10% fee share with Adrena). — Copilot record
- The demo was **terminal-first**: Python scripts run against Solana devnet that verify Merkle-proof bundles on-chain, plus a `curl` to the pull-oracle API. Copilot flagged a limitation (scripts pointed at a local IP endpoint). Raw devnet proof was enough for an infra track win. — Copilot record

**attn.markets — Cypherpunk 2025, 1st "Undefined" ($25k), revenue-backed financing** — [project](https://colosseum.com/projects/explore/attn.markets) · demo [loom](https://www.loom.com/share/390d95ecc77b4f76929ec9249f69a6dd)
- The demo covers a sponsor-portal **advance and repayment simulation** (APR, repayment estimates, early repayment), guided onboarding by role (sponsor, LP, visitor), then **Phantom on devnet, message signing, and setup of a 2-of-2 Squads multisig** between the sponsor and an automated co-signer. — Copilot record

**Pencil Finance — Cypherpunk 2025, 4th RWAs, student-loan tranching** — [project](https://colosseum.com/projects/explore/pencil-finance-1) · demo [loom](https://www.loom.com/share/db45898617084c789211e56581910b24)
- The demo walks the **issuer, then admin approval, then investor** roles: create a bundle with legal PDFs, a junior/senior tranche split (30/70, 20% minimum subordination), on-chain admin approval and signing, then investment in a tranche. Ran on a Phantom localhost/dev network. — Copilot record

**BORE.FI — Cypherpunk 2025, 2nd RWAs** — [project](https://colosseum.com/projects/explore/bore.fi-1) · demo [loom](https://www.loom.com/share/ec494aad792a44f1abe690150e0b6de4)
- A dashboard-centric demo: portfolio, pool metrics (APY, size, utilization), a deposit calculator with lockups, and a transaction history with network confirmations. — Copilot record

**Legasi — Cypherpunk 2025, 3rd RWAs** — [project](https://colosseum.com/projects/explore/legasi) · demo [youtube](https://www.youtube.com/watch?v=zNd2qSitCg8) (now private)
- The demo shows a loan configurator (LTV, health factor, liquidation price), then a **fiat off-ramp to IBAN via EMI**, then an architecture slide (React/Supabase/Anchor, PDA-segregated collateral modules). — Copilot record

**Grand champions, for contrast**
- Unruggable (Cypherpunk Grand, $30k, hardware wallet): the demo ([loom](https://www.loom.com/share/471648a25ce549358f619498f61b569f)) shows a **physical device** confirming bulk sends, staking and Jupiter/Titan swaps, with Solscan verification. — [Copilot / project](https://colosseum.com/projects/explore/unruggable-3)
- Reflect (Radar Grand, 2024): a single Loom pitch with no separate demo, opening on the problem ("$50B in unhedged Solana stake"). — [project](https://colosseum.com/projects/explore/reflect-protocol)

**Winners with no product shown (2026 Frontier)**
- Housd (Frontier Winner, tokenized residential real-estate debt, closest analog to MUTAV's real-estate RWA framing). Copilot: "No Live Product Demonstrated: The presentation consists entirely of static slide decks." No demo link. — [project](https://colosseum.com/projects/explore/housd)
- KinnectFi (Frontier Winner, Filipino-diaspora neobank): "no actual product, interface, or user workflow is visually demonstrated in the video." — [project](https://colosseum.com/projects/explore/kinnectfi)

### Inferences
- **Time to first product shot:** about 5 to 15 s in winning 2025 demo videos (Yumi, MCPay, LocalPay ~25 s with a real-world scene). About 60 s or more in 2024 single-video pitches. For MUTAV's demo, aim for product on screen within 10 s.
- **The common arc of winning fintech demos:** (1) one-line identity and "what we built during the hackathon", (2) a realistic scenario framed around a counterparty (Yumi's demo shop, Pencil's issuer, then admin, then investor), (3) one complete happy path through the key money movement, (4) a wallet signature plus a devnet confirmation or explorer view, (5) a 20 to 40 s architecture or "what we had to solve" beat, (6) a link to the live app or repo.
- **On-chain proof** is usually lightweight: one or two signed transactions plus an explorer or "just happened N seconds ago" moment. Infra entries use terminal and API docs instead. Nobody in this sample spent long on explorer screens.
- **Multi-role demos** (issuer/admin/investor in Pencil, sponsor and co-signer multisig in attn.markets) suit MUTAV's agency, tenant, landlord, reserve and admin structure. A multisig (Squads) step appeared in winning demos and is credible evidence of operational custody design.
- **Regulatory and partner plumbing as a feature:** LocalPay (licensed partners), Credible (NBFI credit line) and Legasi (EMI to IBAN) each spent screen time on how fiat touches the system. This fits a Brazilian rent-guarantee story (BRL rails, operator off-chain, data minimization).
- Slide-only pitches still win when traction and team are strong (DashX, Housd, KinnectFi). The demo video is where you earn "Product + Execution" points, but it is not the only path.

### Gaps
- I could not transcribe Loom videos (CargoBill, Credible, Autonom, attn.markets, Pencil, BORE.FI, Unruggable), so I have no exact timestamps or opening lines for them. The descriptions come from Copilot's summaries of the videos.
- Several YouTube videos are private or unavailable: Legasi demo, Unruggable pitch, stablecorp pitch and demo, KinnectFi, Autonom demo.
- I did not verify the Breakout grand champion (TapeDrive) or the Frontier grand champion (CrowdBrain) videos.
- I found no winner in an insurance-like or rent-guarantee category. Housd (real-estate debt) and Pencil/attn.markets (structured credit) are the closest analogs.

## 3. What judges and Colosseum partners say makes a demo stand out or fail

### Takeaway
Colosseum's founders consistently say a clear narrative beats polish, an "aha" moment beats feature breadth, and showing real work beats claims. The demo must explain the Solana-integration reasoning, must not turn into a second pitch, and must stay within time. Mistakes they name: going over time, flashy visuals with little substance, buzzwords, being vague or overly technical, omitting the team, and failing to explain the Solana integration.

### Cited Findings
- Pitch mistakes: "Exceeding the 3 minute time limit," "overly flashy visuals with little substance," "Over-relying on buzzwords," "Vague or overly technical descriptions," "Omitting team background information," failing to clearly convey the core idea and impact. Demo mistake: failing to explain the Solana integration clearly; demos should not become "another pitch." — [Perfecting Your Hackathon Submission (Levine/Taylor/Robbins, May 2025)](https://blog.colosseum.com/perfecting-your-hackathon-submission/)
- Matty Taylor (Feb 2024): the presentation and video are "the most important component in rising above the crowd". Prioritize features that let you "create an amazing working demo on devnet," spend at least 4 weeks on engineering, use the last week to test the demo and make the presentation, and build for the users' "aha" moment. Judges review hundreds of submissions, so practice concision. — [How to Win a Colosseum Hackathon](https://blog.colosseum.com/how-to-win-a-colosseum-hackathon/)
- Matty Taylor (Mar 2023, **older**; he said "five to seven minutes" back then, which is superseded): judges look at GitHub "to see… the work that you've done during our competition". "Make sure that you spend at least some time on your presentation - that's really important". "'Can you build a business around this?' is a really important factor." — [Solana Ecosystem Call transcript (Superteam, Mar 2023)](https://blog.superteam.fun/p/transcription-solana-ecosystem-call)
- Community advice that Colosseum amplified for Radar (2024), from @redacted_noah: grab judges' attention "within the first 60 seconds", "Make sure the judges understand your idea," and "Demonstrate that you have actually built what you proposed." From @RitRafa: emphasize differentiation and write "judge-considerate documentation." — [Colosseum Codex, Aug 2024](https://blog.colosseum.com/jito-restaking-port-of-miami-talent-olympics/) (links to [x.com/redacted_noah](https://x.com/redacted_noah/status/1818005198029340811) and [x.com/RitRafa](https://x.com/RitRafa/status/1817996818787324405))
- What GitHub reviewers look for: "Did significant work during the hackathon," "Were the ones to do this work," "Prioritized feature development strategically"; *not* specific languages, patterns or code-quality checks. — [colosseum.com/hackathon#h-faq-13](https://colosseum.com/hackathon#h-faq-13)
- Superteam Malaysia ran a "Colosseum Pitching Klinik" for Frontier that framed the video as "the exact conditions Colosseum judges create when they watch your video pitch," and noted that panelists probe "defensibility, business model, distribution," which can get teams "cut in round one." — [luma.com/193jdso0](https://luma.com/193jdso0) (community event, not official)

### Inferences
- In practice the demo video is checked against the claims in the pitch and the repo. Showing "we shipped X during the hackathon" (Yumi at 2:00, MCPay at 0:00) answers the "work during the competition" test directly.
- "Explain the Solana integration reasoning" means: say *why* each on-chain piece is on-chain (for MUTAV: reserve math and coverage ratio enforced by the program; personal data off-chain), not just that it is on Solana.

### Gaps
- I found no published direct quotes on demo videos specifically from Clay Robbins outside the joint workshop recap. I could not find a Colosseum X thread or podcast episode dedicated to demo videos for 2026.

## 4. Which judging criteria the demo is expected to prove vs the pitch

### Takeaway
The criteria changed. The **current official rubric** (World's Fair, and per Copilot since at least Breakout/Frontier) is: Founder + Market Fit, Insight, Product + Execution, Potential Market Size, Founder Communication, Viability and Traction. The older list (Functionality, Potential Impact, Novelty, UX, Open-source, Business Plan, Team) comes from 2024-era community docs and is **outdated**. The demo mainly proves Product + Execution (plus UX and Solana use). The pitch carries Founder-Market Fit, Insight, Market Size, Communication, Viability and Traction.

### Cited Findings
- Official current criteria: "Founder + Market Fit… Insight… Product + Execution: How well does the product work? How does it stack up against the competition? How quickly is the team shipping…? … Potential Market Size… Founder Communication… Viability… Traction: Does the product already have demand or revenue?" Process: multiple internal rounds, then a shortlist to the judging panel, then "an even smaller group of teams is invited to a 15-minute Zoom interview". Winners are announced "roughly one month after the submission deadline." — [colosseum.com/hackathon#h-faq-12](https://colosseum.com/hackathon#h-faq-12)
- Older, community-sourced list: team background, functionality, potential impact, novelty, user experience ("how well a project uses Solana's performance to deliver a good experience"), open-source and business plan. — [Superteam Canada Notion FAQ](https://superteamcan.notion.site/Colosseum-Tips-1ae380b97c4681cabad4e7f85ae0af7b) (unofficial; the page would not render for verification, so content comes via search snippet; treat as **historical/unverified**)
- Open source: "Open-source repositories are encouraged, but private repositories are allowed if access is granted to hackathon@colosseum.com." — [colosseum.com/hackathon#h-faq-11](https://colosseum.com/hackathon#h-faq-11)

### Inferences
- Demo → **Product + Execution** (it works end to end; shipping speed shown by "built in these 4 weeks"), **Insight** (show the specific mechanism that is new, e.g. coverage-ratio-gated guarantees), and secondarily **Viability** (fees and revenue flows visible in the UI).
- Pitch → Founder-Market Fit, Insight, Market Size, Communication, Viability, Traction (pilot agencies, LOIs).
- Since "Traction" is now explicit, a demo that uses real pilot data or shows a real agency partner flow earns double credit.

### Gaps
- No published weights for the criteria. No statement on whether the demo video is scored on its own or only used as context.

## 5. Norms for disclosing pre-existing work, and devnet vs mainnet

### Takeaway
Pre-existing code is allowed but **must be disclosed**. Only work done during the event window is judged, and misrepresentation can lead to disqualification. Devnet has always been an acceptable target. Nothing official requires mainnet, and most winning fintech demos ran on devnet or testnet.

### Cited Findings
- "Teams may begin development before the hackathon, but products are judged only on the work completed between the competition's start and end dates." "Builders may use pre-existing code, but teams must disclose all relevant past development work in the submission form." Misrepresentation can bring disqualification, bans and prize revocation. "'Pre-existing code' does not refer to open-source code developed by others. We encourage founders to compose with existing crypto protocols." The program is for startups that "haven't raised significant outside capital." — [colosseum.com/hackathon#h-faq-4](https://colosseum.com/hackathon#h-faq-4)
- The Arena submission form includes `repoContext`, `externalContributors`, `investmentReceived`, `liveToken` and `chainUsage` fields. — Colosseum Copilot API reference (`/me` schema)
- Winners disclosed prior work **inside the videos**: MCPay's demo opens with "we've been building MCPay for a while, but over the past four weeks, we've pushed it to the next level" ([youtu.be/KAqft_GZBuY](https://youtu.be/KAqft_GZBuY), 0:00). Yumi says "During the hackathon, we shipped the total redesign of our underwriting flow and integrated with Solana" ([youtu.be/II7UAWZGK90](https://youtu.be/II7UAWZGK90), ~2:00). Autonom separated its pre-hackathon Monad/BNB deployments from its Solana testnet work (Copilot pitch summary).
- Devnet: Colosseum advises building "an amazing working demo on devnet"; the only technical requirement is "integrating with Solana in some capacity." — [How to Win a Colosseum Hackathon (2024)](https://blog.colosseum.com/how-to-win-a-colosseum-hackathon/)
- Winners on devnet or testnet: MCPay ("Solana devnet only," ~1:05; payment shown at ~2:15), Autonom (Solana devnet/testnet), attn.markets (Phantom on devnet with Squads), Pencil (localhost/dev network). — Copilot records and transcripts above
- The current World's Fair page says nothing on devnet or mainnet, and the hackathon is open to "all blockchain ecosystems." — [colosseum.com/hackathon#h-faq-19](https://colosseum.com/hackathon#h-faq-19)

### Inferences
- For MUTAV: state in the first 10 to 15 s of the demo (or in a lower-third caption) what existed before Sep 14, 2026 (earlier protocol work, the reserve simulator, the agency platform) versus what was built during the World's Fair window (the Solana program and pilot app). Mirror this exactly in the submission form's prior-work and `repoContext` fields.
- A devnet deployment with a visible signature plus an explorer link is the established norm. Mainnet is not expected, and the team's own rules keep mainnet deploys gated in any case.

### Gaps
- No official 2026 statement on whether devnet vs mainnet affects scoring. No published examples of disqualification over undisclosed prior work.
