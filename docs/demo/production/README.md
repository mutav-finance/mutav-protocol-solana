# Production kit (v7)

Everything needed to assemble MUTAV's 2:19.5 product demo from the harness captures: cards, overlays, the voiceover read, captions, the edit decision list and the disclosure text. It matches [`../storyboard.html`](../storyboard.html) and [`../script.md`](../script.md).

Every HTML file is self-contained (inline CSS and JS, fonts embedded as `data:` URIs, no network) and renders at 1920×1080. Overlays have transparent backgrounds; each has a PNG with alpha next to it. Open an HTML file in a browser to preview its in-animation; add `?static` for the end state.

**v7 note:** the agency beat (F2, 7 s) is a browser mockup of the agency dashboard (KPI cards → "Where the book sits") built per [`motion-spec.md`](motion-spec.md), with no domain in the address bar. Chapter 2 is titled "Programmable payments, settled in minutes" (the close card's pillar 2 stays "Claims settled in minutes") and ends with F8b: `/reserve/risks` on devnet under the safeguards card, with the roadmap minimap. The `/operator` forms are prefilled, so there are no typing jump cuts.

**v6 note:** chapter 3 is a local simulation on an accelerated clock, labelled by the app banner (`NEXT_PUBLIC_ACCELERATED_CLOCK=1`, PR #72) and introduced by a 1.5 s switch card made in the editor. No corner badge is needed. The v5 capital card, fee label and devnet callouts were removed.

## Index

| Path | What it is |
|---|---|
| [`vo-script.md`](vo-script.md) | Final voiceover (245 words) with start and end seconds per line, pauses, the 3 s silence, pronunciation and direction. |
| [`captions.en.srt`](captions.en.srt) · [`captions.pt-BR.srt`](captions.pt-BR.srt) | Captions on the same timings; ≤2 lines, ≤42 characters per line. `[N]` is a placeholder. |
| [`edl.md`](edl.md) | Edit decision list per shot (source, in/out, overlays, zoom, transition, audio), music and loudness, and the ffmpeg recipes. |
| [`submission-disclosure.md`](submission-disclosure.md) | Text for the Colosseum form and the YouTube description. |
| [`motion-spec.md`](motion-spec.md) | Motion direction for the full cut: look, type, easing, beat, per-chapter feel, honesty limits and the agency browser-mockup rules. |
| `cards/chapter-1…3.html` + `.png` | Lower-third chapter titles: "1 · Programmable, transparent reserve", "2 · Programmable payments, settled in minutes", "3 · Capital efficiency". Transparent. |
| `cards/close.html` + `.png` | F14 close card: the three pillars, the tagline, the repo, the live app and the devnet program ID. Opaque. |
| `overlays/coverage-refused-chip.html` + `.png` | F6 "Coverage gate · refused". |
| `overlays/minimap.html` + `minimap-1-agency … minimap-5-pix.png`, `minimap-legend.png`, `minimap-roadmap.png` | Flow minimap (agency platform → operator → program → BRS reserve → PIX record), one PNG per active step, the variant with the legend (built in the hackathon / pre-existing / simulated / next), and the F8b roadmap variant that lights agency platform → operator in the "next" colour, labelled as roadmap. `?active=1..5`, `?legend`, `?roadmap`. |
| `overlays/honesty-label.html` + `honesty-built/agency/pix/mock.png` | The four honesty labels (F1, F2, F7–F8, F10), one PNG each. `?id=built|agency|pix|mock`. |
| `overlays/safeguards-card.html` + `.png` | F8b "Automation safeguards (on-chain today)": R$15,000 per payment, R$20,000 per 31 days, payouts only to MUTAV's fixed payments account, admin-multisig approval for larger claims, guardian pause; footer: agency platform → operator is roadmap, not live. Transparent; 0.6 s build-in. |
| `overlays/later-wipe.html` + `.png` | The "Later" wipe into chapter 2 (1.6 s); the PNG is the hold frame. |
| `overlays/timer.html` + `timer-sample-*.png` | Elapsed timer (mm:ss), driven by `?start=<ms>&end=<ms>&fps=30`. The samples show a 42 s run; render the real one from the logged timestamps. |
| `overlays/caption.html` | Caption template, used to burn in captions when ffmpeg has no libass. |
| `tools/render.cjs` | Headless-Chromium renderer: `stills` (all PNGs), `timer`, `captions`, `seq` (animated frames). Usage in its header and in `edl.md`. |

## Order of assembly

1. **Capture** (storyboard run sheet): press "Refresh on-chain" on `/operator` first, then the 5 live actions (prefilled forms), plates and end states, including `/reserve/risks` for F8b. Keep the harness's `events.json` and its log of transaction block times.
2. **Fill in [N]** from `settled_at − filed_at`: "seconds" under 2 minutes, "minutes" otherwise. Update `vo-script.md` line 15 and both SRTs (cue 18).
3. **Render the timer** from the real timestamps, and the animated titles, wipe and close card if you want them animated (`edl.md`, "The timer" and "Animated cards and overlays").
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
node docs/demo/production/tools/render.cjs stills safeguards roadmap chapter-2
```

Set `PLAYWRIGHT_FROM=<dir>` if Playwright lives elsewhere. It runs one browser, no server, and exits on its own.
