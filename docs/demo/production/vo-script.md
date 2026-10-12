# Voiceover: final read (v10)

**232 words · about 1:38 of speech · 2:19.5 runtime**. Timings are program time (the finished cut), in seconds. Record to the rough cut so each line lands on its picture. The captions (`captions.en.srt`, `captions.pt-BR.srt`) use the same timings. Narration: AI voice by ElevenLabs ("Eric").

**What changed in v10:** a person talking, not a narrator ("we", "let's"). The cold open positions MUTAV on the agency's side: agencies cover defaults or manage the risk themselves because other solutions are slow, and MUTAV backs the agency. Line 1 says "the agency requires a guarantee" (pt-BR: "a imobiliária exige uma garantia"): the requirement is the agency's, which matches the law (Lei 8.245/91 art. 37 and 42 make a guarantee the landlord's option), so don't say "the law requires". "Fund" and "share" are gone from chapter 3 (not open to public investment). The admin is named as the multisig.

## Direction

- **Tone:** warm, plain, confident. A founder showing something she built, talking to one person. Contractions stay contracted ("don't", "we're", "can't", "let's"). No hype, no upspeak.
- **Pace:** about 145 wpm. The cold open runs a touch quicker (about 150); lines 2+3 are one continuous take placed at 3.4 / 4.7 to fit line 3's 5.25 s before line 4 at 10.1. Chapter 3 can breathe.
- **"Let's" lines (5, 8, 18):** said as if clicking along with the viewer, not announcing.
- **The safeguards beat (line 17, F8b):** "Today" and "Next" carry the honesty: the operator signs today, the agency platform automation is next. Don't soften "Next" into a present tense.
- **Scale:** the devnet amounts are sized to the test tokens available; a caption says so on screen. Line 7 carries the gate: "the coverage the reserve admin sets" (stress "reserve admin"); the ratio itself stays on screen. Line 18's "one million" (R$1 million in the caption) is the pilot plan the simulation follows, not a devnet figure.
- **Chapter 3 is a local simulation:** line 18 says "fast-forward" and "simulated locally"; the motion piece carries "Local simulation · accelerated clock" and its finale card "Simulation of reserve mechanics · not an expected return". Apart from the "one million", the VO names no amounts in chapter 3, and none are added.
- **The Explorer flashes (F4, F6b, F7):** no voice over F6b (the music returns after the silence); the F7 flashes sit in the gaps between lines 13, 14 and 15. Don't fill them.
- **The refusal:** "Refused." is short and flat, not dramatic. Then line 10, then **3 s of silence**: no voice and no music, only room tone.
- **Numbers** are said as words, exactly as written. Don't add "about" or round anything.
- **Sixty-five seconds** comes from the real on-chain timestamps of Ana's claim (settled_at − filed_at on her ClaimFiling PDA): filed 21:34:10 UTC (file_claim), settled 21:35:15 UTC (settle_payout). It describes this on-chain run only. Don't ad-lib that real-world claims settle in seconds: in operation the operator checks each claim first (the pitch covers that).
- **Line 15 keeps "on-chain"** (the honesty qualifier), so line 16 starts at 81.2 to clear its take.
- **Line 16 pays off line 3:** line 3 plants "other solutions take up to sixty days"; line 15 lands "sixty-five seconds"; line 16, "Not sixty days.", is the callback. Say it plainly, a beat after line 15, with no smugness. Don't add a specific product name to the sixty days.
- **Recording:** a quiet, soft room; mic 10–15 cm away with a pop filter; peaks around −12 dBFS; 48 kHz WAV. Two or three takes per line; 5 s of room tone at the start (used for the silence).

## Pronunciation

| Word | Say it | Note |
|---|---|---|
| MUTAV | "moo-TAHV" | One word, stress on the second syllable; never spelled out. Confirmed by the team (2026-10-12); voice: ElevenLabs "Eric". |
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
| 1 | 0.3 | 3.3 | F1 | In Brazil, ‖ the agency requires a guarantee. |
| 2 | 3.4 | 4.55 | F1 | When tenants don't pay, |
| 3 | 4.7 | 9.95 | F1 | agencies cover it or manage the risk. ‖ Other solutions take up to sixty days. |
| 4 | 10.1 | 17.0 | F2 | MUTAV backs the agency, on Solana. ‖ Nineteen agencies tested our platform and signed letters of intent. |
| — | 17.0 | 19.0 | F3 | *(pause 2 s: chapter 1 title)* |
| 5 | 19.0 | 26.5 | F3–F4 | Let's register a MUTAV guarantee for Ana's lease: ‖ eighteen thousand reais. ‖ On-chain, she's just an ID, no personal data. |
| — | 26.5 | 29.1 | F4 | *(pause: register_guarantee on Explorer)* |
| 6 | 29.1 | 33.7 | F5 | The reserve holds BRS, ‖ a Brazilian stablecoin from Nora Finance, |
| 7 | 33.9 | 39.7 | F5 | and anyone can check ‖ it meets the coverage the reserve admin sets. |
| 8 | 40.0 | 45.8 | F6 | Let's try one more lease. ‖ That needs forty-five thousand; ‖ we have forty-four and a half. |
| — | 45.8 | 47.6 | F6 | *(pause: the click at 46.5, the refusal appears; music out at 46.3)* |
| 9 | 47.6 | 48.4 | F6 | Refused. |
| 10 | 48.8 | 52.0 | F6 | We can't promise what we can't back. |
| — | **52.0** | **55.0** | F6 | ***(3 s silence: no VO, no music, room tone only, on the unchanged meter)*** |
| — | 55.0 | 58.4 | F6b → wipe | *(pause: the failed transaction on Explorer 55.0–57.0, music back in; "Later" wipe at 57.0; chapter 2 title)* |
| 11 | 58.4 | 60.2 | F7 | Say Ana misses rent. |
| 12 | 61.4 | 63.6 | F7 | Our operator files a claim, |
| 13 | 65.4 | 68.6 | F7 | the reserve pays, ‖ within the multisig's monthly limit, |
| — | 68.6 | 70.5 | F7 | *(pause: pay_claim on Explorer 68.8–70.3)* |
| 14 | 70.5 | 74.7 | F7 | and the landlord's PIX is recorded on-chain. |
| — | 74.7 | 77.0 | F7 → F8 | *(pause: settle_payout on Explorer 74.8–76.5; cut to the claims timeline)* |
| 15 | 77.0 | 80.4 | F8 | Filed to paid, on-chain: ‖ sixty-five seconds. |
| 16 | 81.2 | 84.2 | F8 | Not sixty days. |
| — | 84.2 | 87.3 | F8 → F8b | *(pause: hold on Ana's timestamps; cut to /reserve/risks at 87.0)* |
| 17 | 87.3 | 95.6 | F8b | Today, our operator signs each step. ‖ Next, the agency platform does it automatically, ‖ inside limits the program already enforces. |
| — | 95.6 | 100.0 | F8b → F9 | *(pause: the safeguards card reads on its own; the 1.5 s switch card at 98.0 "Six months, simulated locally on an accelerated clock"; the motion piece and chapter 3 title at 99.5)* |
| 18 | 100.0 | 107.6 | F10 | Let's fast-forward: ‖ six months of our pilot plan, simulated locally, ‖ growing the reserve to one million. |
| 19 | 107.9 | 112.9 | F10–F11 | Guarantee fees and yield come in. ‖ Small claims go out. |
| — | 112.9 | 114.0 | F11 | *(pause: the claims and bars carry it)* |
| 20 | 114.0 | 118.4 | F12 | So the reserve can back more leases, |
| 21 | 118.7 | 128.2 | F12–F13 | and the capital behind it gets back more than it put in. ‖ The reserve that protects agencies also pays its backers. |
| 22 | 128.6 | 130.2 | F14a | Check it on Solana. |
| 23 | 131.0 | 136.6 | F14 | MUTAV: ‖ a reserve you can see, ‖ payments that run themselves, ‖ and capital that works. |
| 24 | 136.9 | 138.9 | F14 | Brazil's on-chain rent guarantee. |
| — | 138.9 | 139.5 | F14 | *(hold; music out)* |

Line 21 lands "more than it put in" on the finale card's in → out (it builds in at 121.3): "R$100,000 in → R$115,169 out" with "Simulation of reserve mechanics · not an expected return".

**F7 retakes:** the claim window on this demo deploy is R$50,000 per 31 days (R$32,000 left), so a retake re-runs the full R$1,500 claim with the same lines 11–14 and captions. After Ana's claim the window read R$19,500 / R$50,000. Done: the takes landed and the cap is back to R$20,000, so the window now reads R$19,500 / R$20,000.

## Word count by beat

| Beat | Time | Words | Speech at 145 wpm |
|---|---|---|---|
| Cold open | 0:00–0:10 | 21 | 9.5 s (read at ~150: 9.2 s) |
| Agency | 0:10–0:17 | 16 | 6.6 s (runs to 17.0, just before the chapter title) |
| 1 · Programmable, transparent reserve | 0:17–0:57 | 64 | 26.5 s |
| 2 · Programmable payments, settled in minutes | 0:57–1:38 | 57 | 23.6 s |
| 3 · Capital efficiency (local simulation) | 1:38–2:08.4 | 53 | 21.9 s |
| Close | 2:08.4–2:19.5 | 22 | 9.1 s |
| **Total** | **2:19.5** | **232** | **1:38** |
