# Voiceover: final read (v10.1)

**252 words · about 1:38 of speech · 2:18.7 runtime**. Timings are program time (the finished cut), in seconds. Record to the rough cut so each line lands on its picture. The captions (`captions.en.srt`) use the same timings. v9 is kept in `vo-script.v9.md` / `captions.en.v9.srt`.

**What changed in v10:** a person talking, not a narrator ("we", "let's"). The cold open positions MUTAV on the agency's side: agencies cover defaults or manage the risk themselves because other solutions are slow, and MUTAV backs the agency. Line 1 says "the agency requires a guarantee" (pt-BR: "a imobiliária exige uma garantia"): the requirement is the agency's, which matches the law (Lei 8.245/91 art. 37 and 42 make a guarantee the landlord's option), so don't say "the law requires". "Fund" and "share" are gone from chapter 3 (not open to public investment). The admin is named as the multisig.

## Direction

- **Tone:** warm, plain, confident. A founder showing something she built, talking to one person. Contractions stay contracted ("don't", "we're", "can't", "let's"). No hype, no upspeak.
- **Pace:** about 145 wpm. The cold open runs a touch quicker (about 150); lines 2+3 are one continuous take placed at 3.4 / 4.7 to fit line 3's 5.25 s before line 4 at 10.1. Chapter 3 can breathe.
- **"Let's" lines (5, 8, 18):** said as if clicking along with the viewer, not announcing.
- **The safeguards beat (line 17, F8b):** "Today" and "Next" carry the honesty: the operator signs today; next, the operator runs inside the agency platform's backend (integrated, not replaced). Don't soften "Next" into a present tense.
- **Scale:** the devnet amounts are sized to the test tokens available; a caption says so on screen. Line 7 carries the gate: "the coverage the reserve admin sets" (stress "reserve admin"); the ratio itself stays on screen. Line 18's "one million" (R$1 million in the caption) is the pilot plan the simulation follows, not a devnet figure.
- **Chapter 3 is a local simulation:** line 18 says "fast-forward" and "simulated locally"; the motion piece carries "Local simulation · accelerated clock" and its finale card "Simulation of reserve mechanics · not an expected return". Apart from the "one million", the VO names no amounts in chapter 3, and none are added.
- **The Explorer flashes (F4, F6b, F7):** no voice over F6b (the music returns after the silence); the F7 flashes sit in the gaps between lines 13, 14 and 15. Don't fill them.
- **The refusal:** "Refused." is short and flat, not dramatic. Then line 10, then **3 s of silence**: no voice and no music, only room tone.
- **Numbers** are said as words, exactly as written. Don't add "about" or round anything.
- **Sixty-five seconds** comes from the real on-chain timestamps of Ana's claim (settled_at − filed_at on her ClaimFiling PDA): filed 21:34:10 UTC (file_claim), settled 21:35:15 UTC (settle_payout). It describes this on-chain run only. Don't ad-lib that real-world claims settle in seconds: in operation the operator checks each claim first (the pitch covers that).
- **Line 15 keeps "on-chain"** (the honesty qualifier), so line 16 starts at 81.2 to clear its take.
- **Story bridges (Julia, 2026-10-12):** each chapter opens on a question: line 5 "Is every guarantee really backed?" (ch1), line 11 "What happens when Ana pays late?" (ch2), line 18 "How does the reserve grow?" (ch3). Lift them slightly, as real questions.
- **Hackathon build (line 4):** "For the hackathon, we built the protocol" lands over the intro's closing chip ("This demo: the MUTAV Protocol on Solana, built for the hackathon · integrates into this platform"). The 19 agencies signed LOIs (they saw Draau's demos); don't say tested/use/customers.
- **Claim flow (Julia, 2026-10-12):** the agency files the claim → MUTAV's operator verifies it → the reserve pays out (pay_claim, to MUTAV's fixed payments account) → MUTAV pays the **agency** by PIX, recorded on-chain (settle_payout) → the agency pays the landlord. Never say MUTAV or the reserve pays the landlord.
- **Line 19 (Julia, 2026-10-12):** the reserve grows from allocated capital as well as guarantee fees and yield; name the capital first.
- **v10.1 (Julia, 2026-10-12):** line 3 "agencies cover it themselves"; line 16b is a live tour of reserve.mutav.finance (Overview → Coverage → Claims → Capital → Verify), caption "Live on Solana devnet · reserve.mutav.finance"; line 17 "our operator console"; line 21 cut (no return claim in the VO); line 22 removed. Everything from 84.2 shifts +7.2 s; the close then moves 6.0 s earlier after the line-21 cut (close card 129.6). Runtime 2:18.7.
- **Line 17:** today the team signs from the showcase console (/operator); next, a server wallet in the platform's backend (KMS-backed, mutav-app) signs within the program's limits. Keep Today/Next honest.
- **Intro picture (0–17.7, illustrated):** logo ident 0–2.2; lease + "guarantee required" stamp, Ana misses rent 2.2–4.6 (line 2); agency absorbs risk, 60-day counter 4.6–10 (line 3); MUTAV reserve backs the agency 10–14; agency platform, 19 LOIs, hackathon chip 14–17.7 (line 4).
- **Line 1 (Julia, 2026-10-12):** "Brazilian agencies require a guarantee on every lease." It states the agencies' practice, not the law (Lei 8.245/91 art. 37 and 42 make a guarantee optional), so never "every contract requires" or "the law requires". Ana's tenant role is carried by the on-screen "Ana · tenant" labels from F3.
- **Line 4 claim:** the 19 agencies saw the platform in Draau's demos, found it simple and signed letters of intent. Never "tested", "use" or "customers".
- **Sixty days (lines 3, 16):** Julia's figure; she holds the source and cites it if asked. The SUSEP-sourced seguro-fiança figure (Circular 621/2021, art. 43) is thirty days, so don't name seguro-fiança next to sixty.
- **Line 15 says "settled":** filed → settled = 65 s (filed → paid was 33 s); the on-screen timer shows 01:05 at SETTLED.
- **Line 16 pays off line 3:** line 3 plants "other solutions take up to sixty days" (Julia, 2026-10-12); line 15 lands "sixty-five seconds"; line 16, "Not sixty days.", is the callback. Say it plainly, a beat after line 15, with no smugness. Don't add a specific product name to the sixty days.
- **Recording:** a quiet, soft room; mic 10–15 cm away with a pop filter; peaks around −12 dBFS; 48 kHz WAV. Two or three takes per line; 5 s of room tone at the start (used for the silence).

## Pronunciation

| Word | Say it | Note |
|---|---|---|
| MUTAV | "moo-TAHV" | One word, stress on the second syllable; never spelled out. Confirmed by Julia (2026-10-12); voice: Eleven "Eric". |
| seguro-fiança | "seh-GOO-roo fee-AHN-sah" | Portuguese, nasal "an". Say it in Portuguese inside the English line. |
| BRS | "B-R-S" | Letters. |
| Nora Finance | "NOR-ah" | The issuer of BRS. |
| PIX | "peeks" | Brazil's instant payment system. |
| reais | "heh-ICE" (as generated) | The currency, line 5 only. v10 avoids "real" so ElevenLabs can't read it as the English word. |
| on-chain | "on-chain" | One spelling everywhere in v10. |

## Script with timing marks

Start and End are program seconds. `‖` = a breath pause (about 0.3 s). `(pause N s)` = a held pause.

| # | Start | End | Shot | Line |
|---|---|---|---|---|
| 1 | 0.3 | 3.3 | F1 | Brazilian agencies require a guarantee ‖ on every lease. |
| 2 | 3.4 | 4.55 | F1 | When tenants don't pay, |
| 3 | 4.7 | 9.95 | F1 | agencies cover it themselves. ‖ Other solutions take up to sixty days. |
| 4 | 10.1 | 18.0 | F2 | MUTAV backs the agency, on Solana. ‖ Nineteen agencies signed letters of intent. ‖ For the hackathon, we built the protocol. |
| — | 17.0 | 19.0 | F3 | *(pause 2 s: chapter 1 title)* |
| 5 | 19.0 | 28.92 | F3–F4 | Is every guarantee really backed? ‖ First, let's register Ana's guarantee: ‖ eighteen thousand reais. ‖ On-chain, she's just an ID, no personal data. |
| — | 26.5 | 29.1 | F4 | *(pause: register_guarantee on Explorer)* |
| 6 | 29.3 | 33.7 | F5 | The reserve holds BRS, ‖ a Brazilian stablecoin from Nora Finance, |
| 7 | 33.9 | 39.7 | F5 | and anyone can check ‖ it meets the coverage the reserve admin sets. |
| 8 | 40.0 | 45.8 | F6 | Let's try one more lease. ‖ That needs forty-five thousand; ‖ we have forty-four and a half. |
| — | 45.8 | 47.6 | F6 | *(pause: the click at 46.5, the refusal appears; music out at 46.3)* |
| 9 | 47.6 | 48.4 | F6 | Refused. |
| 10 | 48.8 | 52.0 | F6 | We can't promise what we can't back. |
| — | **52.0** | **55.0** | F6 | ***(3 s silence: no VO, no music, room tone only, on the unchanged meter)*** |
| — | 55.0 | 58.4 | F6b → wipe | *(pause: the failed transaction on Explorer 55.0–57.0, music back in; "Later" wipe at 57.0; chapter 2 title)* |
| 11 | 56.4 | 57.81 | F7 | What happens when Ana pays late? |
| 12 | 61.4 | 64.45 | F7 | The agency files a claim, ‖ our operator verifies it, |
| 13 | 64.9 | 68.42 | F7 | the reserve pays out, ‖ within the multisig's limits, |
| — | 68.6 | 70.5 | F7 | *(pause: pay_claim on Explorer 68.8–70.3)* |
| 14 | 70.5 | 74.7 | F7 | and our PIX to the agency is recorded on-chain. |
| — | 74.7 | 77.0 | F7 → F8 | *(pause: settle_payout on Explorer 74.8–76.5; cut to the claims timeline)* |
| 15 | 77.0 | 80.4 | F8 | Filed to settled, on-chain: ‖ sixty-five seconds. |
| 16 | 81.2 | 84.2 | F8 | Not sixty days. |
| — | 84.2 | 84.6 | F8 → tour | *(cut to the live reserve tour at 84.2)* |
| 16b | 84.6 | 91.6 | Tour | And it's all public: ‖ every guarantee, claim and account, ‖ live at reserve dot mutav dot finance. |
| — | 91.6 | 94.5 | Tour → F8b | *(the tour finishes Overview → Coverage → Claims → Capital → Verify; cut to /reserve/risks at 94.2)* |
| 17 | 94.5 | 104.6 | F8b | Today, our team signs each step from our operator console. ‖ Next, a server wallet in our platform signs them, ‖ within limits the program enforces. |
| — | 103.1 | 107.2 | F8b → F9 | *(pause: the safeguards card reads on its own; the 1.5 s switch card at 105.2; the motion piece and chapter 3 title at 106.7)* |
| 18 | 105.1 | 110.7 | F10 | How does the reserve grow? ‖ Six months of our pilot plan, simulated locally, ‖ growing it to one million. |
| 19 | 115.1 | 120.1 | F10–F11 | New capital, guarantee fees and yield come in. ‖ Small claims go out. |
| — | 120.1 | 121.2 | F11 | *(pause: the claims and bars carry it)* |
| 20 | 121.2 | 125.6 | F12 | So the reserve can back more leases. |
| — | 125.6 | 129.6 | F12–F13 | *(no VO: the bars and the finale card carry it: "Reserve unit value 1.000 → 1.152 · Reserve R$120k → R$999k · backs R$3.82M" plus the honesty line)* |
| 23 | 130.2 | 135.8 | F14 | MUTAV: ‖ a reserve you can see, ‖ payments that run themselves, ‖ and capital that works. |
| 24 | 136.1 | 137.97 | F14 | Brazil's on-chain rent guarantee. |
| — | 137.97 | 138.7 | F14 | *(hold; the line is written on screen word for word; music out)* |

Line 21 is cut entirely in v10.1 (legal: no return claim in the VO; Julia approved); line 20 ends the chapter, trimmed at its natural end. Line 22 ("Check it on Solana.") is removed too: the live tour (16b) replaces it. Line numbers 23–24 are kept so the VO files keep their names.

**F7 retakes:** the claim window on this demo deploy is R$50,000 per 31 days (R$32,000 left), so a retake re-runs the full R$1,500 claim with the same lines 11–14 and captions. After Ana's claim the window read R$19,500 / R$50,000. Done: the takes landed and the cap is back to R$20,000, so the window now reads R$19,500 / R$20,000.

## Word count by beat

| Beat | Time | Words | Speech at 145 wpm |
|---|---|---|---|
| Cold open | 0:00–0:10 | 22 | 9.5 s (read at ~150: 9.2 s) |
| Agency | 0:10–0:17 | 18 | 6.6 s (runs to 17.0, just before the chapter title) |
| 1 · Programmable, transparent reserve | 0:17–0:57 | 64 | 26.5 s |
| 2 · Programmable payments, settled in minutes | 0:57–1:38 | 57 | 23.6 s |
| 3 · Capital efficiency (local simulation) | 1:38–2:08.4 | 53 | 21.9 s |
| Close | 2:08.4–2:19.5 | 22 | 9.1 s |
| **Total** | **2:18.7** | **251** | **1:38** |
