# Production kit (v9)

Everything needed to assemble MUTAV's 2:19.5 product demo from the harness captures: cards, overlays, the voiceover read, captions, the edit decision list and the disclosure text. It matches [`../storyboard.html`](../storyboard.html) and [`../script.md`](../script.md).

Every HTML file is self-contained (inline CSS and JS, fonts embedded as `data:` URIs, no network) and renders at 1920×1080. Overlays have transparent backgrounds; each has a PNG with alpha next to it. Open an HTML file in a browser to preview its in-animation; add `?static` for the end state.

**v9 note (scale framing):** the devnet amounts are sized to the test tokens available, and MUTAV is built for a reserve in the millions, so: a scale caption, "Devnet demo · sized to test tokens · pilot plan: R$1M reserve" (`overlays/scale-caption.*`), rides in the banner slot on every devnet shot (it is the banner's companion line, not a second honesty label); the devnet captions lead with ratios ("R$44.5k backs R$178k of cover"); the close card adds "Pilot plan · R$1M reserve · backs ~R$3.8M of guarantees" with a "plan" tag; chapter 3 is re-run at the pilot plan's scale, with its figures as `[V3]` until the v3 ledger lands. No devnet figure is inflated. VO 250 words.

**v8 note:** the on-chain proof is visible: four short Explorer flashes on devnet (register_guarantee, the refused MTV-PF-0101 landing as a failed transaction, pay_claim, settle_payout), a transaction receipt card after each on-chain action and a transaction rail through chapters 1–2, both rendered from real `getTransaction` data (`tx-receipts.json`, pending) with `tools/render.cjs receipts`. Chapter 3 is the ledger-driven motion piece `ch3-flows` (27.4 s, kept with the team's production files, rendered from the v2 simulation ledger), with optional app cutaways. The close opens on a 2 s `/reserve/verify` cutaway. The F7 line says "the PIX to the landlord". VO 243 words.

**v7 note:** the agency beat (F2, 7 s) is a browser mockup of the agency dashboard (KPI cards → "Where the book sits") built per [`motion-spec.md`](motion-spec.md), with no domain in the address bar. Chapter 2 is titled "Programmable payments, settled in minutes" (the close card's pillar 2 stays "Claims settled in minutes") and ends with F8b: `/reserve/risks` on devnet under the safeguards card, with the roadmap minimap. The `/operator` forms are prefilled, so there are no typing jump cuts.

**v6 note:** chapter 3 is a local simulation on an accelerated clock, labelled by the app banner (`NEXT_PUBLIC_ACCELERATED_CLOCK=1`, PR #72) and introduced by a 1.5 s switch card made in the editor. No corner badge is needed. The v5 capital card, fee label and devnet callouts were removed.

## Index

| Path | What it is |
|---|---|
| [`vo-script.md`](vo-script.md) | Final voiceover (250 words) with start and end seconds per line, pauses, the 3 s silence, pronunciation and direction. |
| [`captions.en.srt`](captions.en.srt) · [`captions.pt-BR.srt`](captions.pt-BR.srt) | Captions on the same timings; ≤2 lines, ≤42 characters per line. Cue 18 carries the real 65 s. |
| [`edl.md`](edl.md) | Edit decision list per shot (source, in/out, overlays, zoom, transition, audio), music and loudness, and the ffmpeg recipes. |
| [`submission-disclosure.md`](submission-disclosure.md) | Text for the Colosseum form and the YouTube description. |
| [`motion-spec.md`](motion-spec.md) | Motion direction for the full cut: look, type, easing, beat, per-chapter feel, honesty limits and the agency browser-mockup rules. |
| `cards/chapter-1…3.html` + `.png` | Lower-third chapter titles: "1 · Programmable, transparent reserve", "2 · Programmable payments, settled in minutes", "3 · Capital efficiency". Transparent. |
| `cards/close.html` + `.png` | F14 close card: the three pillars, the tagline, the pilot-plan line ("Pilot plan · R$1M reserve · backs ~R$3.8M of guarantees", tagged "plan"), the repo, the live app and the devnet program ID. Opaque. |
| `overlays/coverage-refused-chip.html` + `.png` | F6 "Coverage gate · refused". |
| `overlays/minimap.html` + `minimap-1-agency … minimap-5-pix.png`, `minimap-legend.png`, `minimap-roadmap.png` | Flow minimap (agency platform → operator → program → BRS reserve → PIX record), one PNG per active step, the variant with the legend (built in the hackathon / pre-existing / simulated / next), and the F8b roadmap variant that lights agency platform → operator in the "next" colour, labelled as roadmap. `?active=1..5`, `?legend`, `?roadmap`. |
| `overlays/honesty-label.html` + `honesty-built/agency/pix/mock.png` | The four honesty labels (F1, F2, F7–F8, and `mock` for any optional chapter 3 app cutaway; the motion piece carries its own), one PNG each. `?id=built|agency|pix|mock`. |
| `overlays/scale-caption.html` + `.png` | The v9 scale caption, "Devnet demo · sized to test tokens · pilot plan: R$1M reserve": top centre, directly under the app banner, on every devnet shot (F1, F3–F8b, F14a; never F2 or chapter 3). It shares the banner's slot, so it is not a second honesty label. `?top=<px>` nudges it below the banner. Transparent. |
| `overlays/safeguards-card.html` + `.png` | F8b "Automation safeguards (on-chain today)": R$15,000 per payment, R$20,000 per 31 days, payouts only to MUTAV's fixed payments account, admin-multisig approval for larger claims, guardian pause; footer: agency platform → operator is roadmap, not live. Transparent; 0.6 s build-in. |
| `overlays/tx-receipt.html` + `tx-receipt-sample.png`, `tx-receipt-sample-failed.png` | Transaction receipt after each on-chain action: instruction, short signature, slot, block time, fee, status, "Solana devnet"; ✓ or ✗ (the failed MTV-PF-0101 shows "Failed · InsufficientFreeCapital"). Query params carry the values; the samples use placeholder values and carry a "Sample values" tag. Transparent; about 0.45 s build-in. |
| `overlays/tx-rail.html` + `tx-rail-sample.png` | Slim right-edge rail through chapters 1–2: each signature as it lands (instruction · short sig · ✓ or ✗), accumulating; `?items=<JSON>&upto=<k>`. The sample uses placeholder signatures. Transparent. |
| `overlays/later-wipe.html` + `.png` | The "Later" wipe into chapter 2 (1.6 s); the PNG is the hold frame. |
| `overlays/timer.html` + `timer-sample-*.png` | Elapsed timer (mm:ss), driven by `?start=<ms>&end=<ms>&fps=30`. The samples show a 42 s run; render the real one from the logged timestamps. |
| `overlays/caption.html` | Caption template, used to burn in captions when ffmpeg has no libass. |
| `tools/render.cjs` | Headless-Chromium renderer: `stills` (all PNGs), `timer`, `captions`, `seq` (animated frames), `receipts` (receipt and rail PNGs from `tx-receipts.json`). One browser, exits on its own. Usage in its header and in `edl.md`. |

## Order of assembly

1. **Capture** (storyboard run sheet): set `localStorage` `mutav-transparency-intro-v1` = `1` (or Skip), press "Refresh on-chain" on `/operator`, then the 5 live actions (prefilled forms; claim retakes fit), plates and end states, including `/reserve/risks` for F8b and `/reserve/verify` for F14a, and the four Explorer flashes. Start every clip on the settled frame. Log each signature and block time; write `tx-receipts.json` from `getTransaction`.
2. **The claim time is filled in:** Ana's `settled_at − filed_at` is 65 s, so `vo-script.md` line 15 says "sixty-five seconds" and both SRTs (cue 18) carry it.
3. **Render the timer** from the real timestamps, the receipts and rail (`render.cjs receipts tx-receipts.json`), and the animated titles, wipe and close card if you want them animated (`edl.md`, "On-chain overlays", "The timer" and "Animated cards and overlays").
4. **Rough cut** the picture per the EDL: cut shots, zooms, join.
5. **Overlays:** PNGs, then the alpha videos (titles, wipe, timer).
6. **Record the VO** to the rough cut, following `vo-script.md`.
7. **Mix** VO and music with the refusal drop; two-pass loudnorm to −14 LUFS / −1 dBTP.
8. **Captions:** burn in the English SRT; keep both SRTs for upload.
9. **Export** 1080p30 H.264 MP4; review muted and with sound; check runtime ≤ 2:20.
10. **Publish** with the text in `submission-disclosure.md`.

## Re-rendering the PNGs

```bash
# from the repo root, with app/ dependencies installed (Playwright is resolved from app/)
node docs/demo/production/tools/render.cjs stills
# or only some: every still whose path contains one of the filters
node docs/demo/production/tools/render.cjs stills safeguards tx- chapter-2
```

Set `PLAYWRIGHT_FROM=<dir>` if Playwright lives elsewhere. It runs one browser, no server, and exits on its own.
