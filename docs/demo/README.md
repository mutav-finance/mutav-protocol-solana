# Demo: Colosseum product demo

Material for MUTAV's ≤3-minute product demo video for the Colosseum Crypto World's Fair.

**Status:** v8.1 hybrid cut (2:19.5, 246 words; devnet numbers refreshed: R$44,500 held, the next lease R$500 short): an agency beat (the agency dashboard, 19 agencies with letters of intent), then three chapters, one per pitch pillar: 1 · programmable, transparent reserve (Ana's lease on-chain, the next one refused, and the refusal itself landing on-chain as a failed transaction); 2 · programmable payments, settled in minutes (the claim runs live against an elapsed timer, then the program's safeguards that let the agency platform drive these steps next); 3 · capital efficiency (a ledger-driven motion piece from a local simulation on an accelerated clock: six months of guarantee fees and the reserve's yield in, three small claims out; share value 1.000 → 1.144, can back R$490k → R$611k of cover, R$20,000 in → R$22,878 out, labelled "Simulation of reserve mechanics · not an expected return"). Chapters 1–2 run live on devnet, with the transactions shown on Solana Explorer, a receipt after each and a running transaction rail; the close points to `/reserve/verify`. The capture harness on `feat/demo-capture` is outdated (pre-#45 routes): capture by hand or update it; [`app-requirements.md`](app-requirements.md) lists what it and the app must change for v8, and what is pending the app team.

Honesty labels used throughout: the agency platform predates the hackathon (the agency beat is a local copy with fictional data, and its connection to the operator is roadmap; the safeguards it would run inside are on-chain today), the PIX transfer to the landlord is simulated on devnet (only its settlement record is on-chain), chapters 1–2 run on devnet, and chapter 3 is a local simulation with a mock BRS mint, not an expected return. Ana, the agency names and the lease references are fictional.

## Files

| File | What it is |
|---|---|
| [`storyboard.html`](storyboard.html) | Visual storyboard: one frame per beat with wireframes, voiceover, overlays, on-chain proof and retake costs, plus the devnet starting state, recording setup, run sheet and risks. Self-contained; prints one frame per page. |
| [`app-requirements.md`](app-requirements.md) | What the app and the staged devnet state must provide before recording, per beat: routes, labels, reais, the disclaimer line, the staging sequence with signers and time locks. |
| [`script.md`](script.md) | The same cut as text: beats, shot list, voiceover, devnet setup and capture order. Matches the storyboard. |
| [`production/`](production/README.md) | Production kit: chapter titles, cards and overlays (HTML + PNG, including the transaction receipt and rail), the timed voiceover, EN and PT-BR captions, the edit decision list with ffmpeg recipes, the motion spec and the submission disclosure text. |
| [`production/ch3-simulation-ledger.md`](production/ch3-simulation-ledger.md) | The chapter 3 receipt: the ledger of the six-month local simulation (local validator, accelerated clock, mock BRS mint; local-chain signatures, not devnet) that every chapter 3 figure comes from, with its fields explained. [JSON](production/ch3-simulation-ledger.json). Simulation of reserve mechanics, not an expected return. |
| [`research/report.md`](research/report.md) | Research report on what makes a strong hackathon product demo, ending with recommended storyboard changes. [HTML version](research/report.html). |
| [`research/notes/colosseum-winning-demos.md`](research/notes/colosseum-winning-demos.md) | Notes on winning Colosseum and Solana hackathon demo videos and what Colosseum asks for. |
| [`research/notes/saas-fintech-demo-craft.md`](research/notes/saas-fintech-demo-craft.md) | Notes on the craft of SaaS and fintech product videos: structure, screen polish, voiceover, captions. |
| [`research/notes/protocol-mechanics-and-b2b.md`](research/notes/protocol-mechanics-and-b2b.md) | Notes on showing on-chain state, staging a refusal, two-sided B2B stories and honest disclosure. |
| [`research/notes/production-tooling.md`](research/notes/production-tooling.md) | Notes on production tooling: scripted capture, zoom, title cards, voice, captions, assembly, hosting. |
