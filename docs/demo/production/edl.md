# Edit decision list (v9, 2:19.5)

Program time is the finished cut (mm:ss.s). **Source** is a capture clip (`clips/<name>.mp4`, with its `events.json` when the harness made it), an Explorer capture or a kit file. Source in and out points are given against the clip's logged events (`type-start`, `click`, `result`, `hold`), because exact seconds depend on the capture; the program times are fixed.

Clip names: `b-register-ana`, `c-refusal`, `d1-file-claim`, `d2-pay-claim`, `d4-settle` exist in the harness today. Names marked *(v5)* … *(v8)* are new; the harness on `feat/demo-capture` is outdated (pre-#45 routes, no intro key: see `../app-requirements.md`), so capture them by hand under the same name or update the harness first. Before every app clip: `localStorage` `mutav-transparency-intro-v1` = `1` (or Skip), "Refresh on-chain" pressed, and the clip starts on the settled frame (about 0.5 s of skeleton on load).

**v8:** on-chain proof made visible: four Explorer flashes on devnet (S4 register_guarantee, S6b the failed MTV-PF-0101, and pay_claim and settle_payout inside S8), a transaction receipt after each on-chain action and a transaction rail from S3 to S9 (`overlays/tx-receipt.*`, `overlays/tx-rail.*`, rendered from `tx-receipts.json` with `tools/render.cjs receipts`). Chapter 3 (S11–S14) is the ledger-driven motion piece `ch3-flows` (27.4 s, kept with the team's production files), with optional app cutaways. The close opens on a 2 s `/reserve/verify` cutaway (S15a). Time: S6 lost its 3 s tail (S6b's 2 s flash takes its place), S8 lost its confirmation waits to the two flashes (−2.5 s), chapter 3 runs 30.4 s and the close 11.1 s. Total unchanged: 2:19.5.

**v9 (scale framing):** `overlays/scale-caption.png` ("Devnet demo · sized to test tokens · pilot plan: R$1M reserve") rides in the banner slot, top centre under the app banner, at 0:00.5–0:09.8 (S1), 0:17.0–1:38.0 (S3–S9b) and 2:08.4–2:10.4 (S15a); it is the banner's companion line, not a second honesty label. Devnet captions lead with ratios (S5: "R$44.5k backs R$178k of cover", then "R$162k of R$178k in use"). Chapter 3 (S11–S14) is re-rendered from the v3 ledger at the pilot plan's scale; its figures read `[V3]` until it lands. The close card adds "Pilot plan · R$1M reserve · backs ~R$3.8M of guarantees" with a "plan" tag. The `/reserve` tab formerly called Money is Capital (`/reserve/capital`). VO 250 words; the timings below are v9.

**Rules:** zoom ≤1.3× over motion; ≤2× only on holds, taken from the 2× stills (`clips/<name>.stills2x/`). One honesty label per shot besides the app's #59 banner; the scale caption sits in the banner slot and does not count as one. Explorer flashes are 1.5–2 s, hard cuts, on the beat. With the rail on screen (S3–S9), skip the optional minimap; drop the rail for any shot where it would cover something that must be read. Hard cuts unless noted.

## Shots

| Shot | Program | Source (in → out) | Overlays (program time) | Zoom | Transition | Audio |
|---|---|---|---|---|---|---|
| S1 · F1 cold open | 0:00.0–0:10.0 | `a-reserve-overview` *(v5)*: `/reserve` Overview, no wallet; first settled frame → +10 s | `overlays/honesty-built.png` 0:00.5–0:09.5 · `overlays/scale-caption.png` 0:00.5–0:09.8 (banner slot) | slow push 1.00 → 1.15 over 10 s | fade from black, 6 frames | VO 1–3. Music bed in at 0:00, level −20 dB under VO |
| S2 · F2 agency | 0:10.0–0:17.0 | `agency-flash` *(hand capture, built as a browser mockup per `motion-spec.md`)*: the agency dashboard from a local copy with fictional data: KPI cards → scroll to "Where the book sits"; no domain in the address bar; user email, the empty "Book in force" chart and the guarantees table cropped out; 7 s | `overlays/honesty-agency.png` 0:10.2–0:16.8 · optional `minimap-1-agency.png` | gentle push 1.00 → 1.08 on the KPI cards, back to 1.0 and flat for the pipeline read | hard cut out | VO 4 |
| S3 · F3 register Ana | 0:17.0–0:27.0 | `b-register-ana`: the prefilled form (MTV-PF-0100, Imobiliária Planalto, R$1,500, 6× + 6×), `click` −2.5 s → `result` +2.0 s; cut before the form advances to MTV-PF-0101. No typing, no jump cut | `cards/chapter-1` 0:17.0–0:19.0 (animated) · **receipt 1** (register_guarantee ✓) ≈0:24.8–0:27.0 · **rail state 1** from the `result` (≈0:24.5) · `overlays/scale-caption.png` 0:17.0–1:38.0 (banner slot, through S9b) | ≤1.3× toward the "Confirmed" chip from `result` | hard cut | VO 5 |
| S4 · F4 Explorer: register_guarantee | 0:27.0–0:29.0 | `x1-explorer-register` *(v8)*: the register_guarantee transaction for MTV-PF-0100 on Explorer (devnet), decoded once the IDL is on devnet (pending); settled frame, 2 s | rail state 1 | hold still ≤1.5× on the instruction + "Success" | hard cuts | VO 5 tail, then pause |
| S5 · F5 coverage | 0:29.0–0:39.0 | `a3-reserve-coverage` *(v5)*: `/reserve/coverage` (ceiling line: R$162k in use, R$16k free) and the Overview held-vs-required line, no wallet; 10 s incl. the `hold` | rail state 1 · edit callout on Ana's row (rows are opaque hashes sorted by cover; find it at capture) · captions "R$44.5k backs R$178k of cover" (0:33.9), then "R$162k of R$178k in use" (0:36.5) | 0:33.0 on: hold still 1.0 → 1.6× on held vs required (R$36,000 → R$40,500), then the ceiling line | hard cut | VO 6–7 |
| S6 · F6 refusal | 0:39.0–0:55.0 | `c-refusal`: the form auto-advanced to MTV-PF-0101 (same amounts, no typing), result line "needs R$45,000 … holds R$44,500" visible → `click` (lands at 0:46.5; sent with skipPreflight) → `result` → `hold` (3 s) on the unchanged meter | **receipt 2** (register_guarantee ✗ · InsufficientFreeCapital) 0:47.6–0:52.0, next to the refusal message (fallback if the failed transaction can't be landed: `overlays/coverage-refused-chip.png` 0:47.4–0:54.8) · **rail state 2** from 0:47.4 | 0:39–0:45 push ≤1.25× on the preview; 0:47.4–0:52.0 still ≤2× on the refusal; 0:52.0–0:55.0 ease out to the unchanged meter | hard cut | VO 8–10. **Music out at 0:46.3** (0.3 s fade). **0:52.0–0:55.0 silence:** no VO, no music, room tone only |
| S6b · F6b Explorer: refused on-chain *(v8)* | 0:55.0–0:57.0 | `x2-explorer-refused` *(v8)*: the failed MTV-PF-0101 transaction on Explorer, "Error · InsufficientFreeCapital" (pending: skipPreflight send + IDL); 2 s | rail state 2 | hold still ≤1.5× on the error line | hard cut in on the downbeat | music back in at 0:55.0 (1 s fade-in); no VO |
| S7 · "Later" wipe | 0:57.0–0:58.6 | `overlays/later-wipe` (1.6 s sequence) over the S6b → S8 junction | — | — | the wipe is the transition: cut under it at 0:57.5 | music continues |
| S8 · F7 claim live (retakes fit: R$32,000 of room) | 0:58.6–1:16.5 | `d1-file-claim`: prefilled (R$1,500, Ana preselected), `click` −1 s → `result` +1.2 s · `d2-pay-claim`: `click` −1 s → `result` +1.2 s · **`x3-explorer-pay` *(v8)* 1:08.8–1:10.3** · `d4-settle` *(v5: `d3-settle-payout`)*: `click` −1 s → `result` +1.2 s · **`x4-explorer-settle` *(v8)* 1:14.8–1:16.5**. The flashes replace the confirmation waits | `cards/chapter-2` 0:58.0–1:00.0 · **timer** from the `file_claim` result (≈1:03.6) to 1:27.0, on screen over the flashes · **receipts 3–5** (file_claim, pay_claim, settle_payout) ≈1.5 s on each `result` · **rail states 3–5** at each `result` · `overlays/honesty-pix.png` 1:06.5–1:27.0 (one label across F7–F8) | ≤1.3× on the R$15,000 cap during `pay_claim` | hard cuts between actions and flashes | VO 11–14 |
| S9 · F8 claims timeline | 1:16.5–1:27.0 | `d4-reserve-claims` *(v5)*: `/reserve/claims`; Ana's row newest, on top: filed → paid → settled with her timestamps; `hold` 3 s. The two earlier test claims (R$16,000, R$2,000) and the page's "slowest filed → paid" summary (theirs) may be in frame: highlight Ana's row and her times | timer holds in its settled state (amber) · honesty-pix continues · rail state 5; rail slides out at 1:27.0 | 1:20.5–1:23.5 hold still ≤2× on Ana's three timestamps | hard cut | VO 15–16; 2.8 s hold after |
| S9b · F8b safeguards | 1:27.0–1:38.0 | `e1-reserve-risks` *(v7)*: `/reserve/risks` on devnet, no wallet; 11 s (the fixed payments account and guardian pause rows: pending app row) | `overlays/safeguards-card.png` 1:27.4–1:37.8 (build-in 0.6 s: `seq overlays/safeguards-card.html --ms 1200`) · `overlays/minimap-roadmap.png` 1:27.4–1:37.8 | none | hard cut in | VO 17 |
| S10 · F9 switch card | 1:38.0–1:39.5 | `cards/switch` *(v6, made in the editor)*: "Six months, simulated locally on an accelerated clock", 1.5 s | — | none | hard cut in; hard cut out | music continues; no VO |
| S11 · F10 fees and yield in | 1:39.5–1:48.4 | `ch3-flows` *(v9, motion piece from the v3 ledger at pilot scale; re-render pending)* 0.0–8.9 s: chart draws in, months 1–2, operations list scrolling | `cards/chapter-3` 1:39.5–1:41.5 (lower third; the piece's title sits top-left) · the piece carries its own honesty lines (no `honesty-mock.png` needed) | none (the piece has its own camera) | hard cut | VO 18–19 |
| S12 · F11 small claims out | 1:48.4–1:53.9 | `ch3-flows` 8.9–14.4 s: months 3–4, small claims out ([V3]). Optional cutaway ≤2 s replacing piece seconds: `g2-sim-claims` *(v8, localnet)* `/reserve/claims` (the small claims), or one Explorer frame on the local validator labelled "local validator" | none | none | continuous | VO 19 tail; then about 1.1 s without voice |
| S13 · F12 cover and share | 1:53.9–2:01.3 | `ch3-flows` 14.4–21.8 s: months 5–6, the last small claims out, share value to [V3]. Optional cutaway ≤2 s: `g3-sim-reserve` *(v8, localnet)* `/reserve` Overview ceiling line, or the `/reserve` Capital tab (`/reserve/capital`: reserve balance chart over the six simulated months, "Share price") | captions: "Can back R$[V3] → R$[V3] of cover" then "Share value 1.000 → [V3]" (the piece has no ceiling panel; the caption carries it from the ledger) | none | continuous | VO 20–21 |
| S14 · F13 capital out | 2:01.3–2:08.4 | `ch3-flows` 21.8–27.4 s: the finale card (R$[V3] in → R$[V3] out; "Pilot plan scale (PR #63 parameters)"; "Simulation of reserve mechanics · not an expected return"), then its last frame held 1.5 s | none | none | hard cut out | VO 21 |
| S15a · F14a verify *(v8)* | 2:08.4–2:10.4 | `h1-reserve-verify` *(v8)*: `/reserve/verify` on devnet, every account with its Explorer link; settled frame, 2 s | caption "Verify everything on Solana" · `overlays/scale-caption.png` (banner slot) | slow push ≤1.1× | hard cut in | VO 22 |
| S15 · F14 close | 2:10.4–2:19.5 | `cards/close` (2 s build-in sequence, then `cards/close.png` held; pillar 2 stays "Claims settled in minutes"; v9 adds "Pilot plan · R$1M reserve · backs ~R$3.8M of guarantees" with its "plan" tag) | — | none | 0.5 s fade to black at 2:19.0 | VO 23–24. Music lifts slightly, fades out 2:17.5–2:19.5 |

Chapter 3 is the motion piece rendered from the simulation ledger (v3, at the pilot plan's scale; `[V3]` until it lands); every figure comes from it (the storyboard's numbers table). If the cut runs over 2:20, trim S5 (F5, −2 s), then S14's 1.5 s hold. Never trim the silence itself, a flash below 1.5 s, or the S9b safeguards read.

## On-chain overlays (receipts and rail)

`tx-receipts.json` (pending) lists the five devnet transactions in landing order, from `getTransaction`: `instruction`, `signature`, `slot`, `blockTime`, `fee` (lamports), `status` (`ok` | `failed`), `error`, `cluster`. Render the receipts and the rail states in one light process:

```bash
node docs/demo/production/tools/render.cjs receipts tx-receipts.json --out build/receipts
```

It writes `receipt_01_register_guarantee.png` … `receipt_05_settle_payout.png` and `rail_01.png` … `rail_05.png` (transparent 1920×1080). Each receipt holds about 1.5–2 s on its confirmation frame (lower left, above the captions); each rail state replaces the previous one at the next confirmation and holds until S9 ends. The committed `overlays/tx-receipt-sample*.png` and `overlays/tx-rail-sample.png` show placeholder values with a "Sample values" tag: never put them in the cut. For an animated build-in, `seq overlays/tx-receipt.html --ms 600 --query "ix=…&sig=…"`.

## The timer (S8–S9)

The timer runs on the on-chain clock. `start` = `filed_at` and `end` = `settled_at` in ms (Solana `blockTime` is seconds: × 1000), from Ana's transactions in `tx-receipts.json`.

```bash
node docs/demo/production/tools/render.cjs timer --start <filed_ms> --end <settled_ms> --tail 12 --out build/timer
ffmpeg -f concat -i build/timer/timer.concat.txt -r 30 -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le build/timer.mov
```

Because the capture is real speed, place `timer.mov` so its frame 0 sits on the frame where `file_claim` confirms. Wherever S8 cuts out a confirmation wait (now filled by the two Explorer flashes), cut the timer at the same source points: it jumps forward, honestly, and stays on screen over the flashes. After `settled`, it holds amber for `--tail` seconds (12 s covers S9). Preview in a browser: `overlays/timer.html?start=0&end=42000`. `--every-frame` writes every frame instead of one PNG per second.

## Animated cards and overlays

The chapter titles, the close card and the wipe have CSS in-animations. Render them to alpha video:

```bash
node docs/demo/production/tools/render.cjs seq docs/demo/production/cards/chapter-1.html --ms 2000 --out build/ch1
ffmpeg -framerate 30 -i build/ch1/f_%05d.png -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le build/chapter-1.mov
```

The chapter titles animate in over 0.8 s and hold; fade them out in the edit over the last 6 frames. `later-wipe` needs `--ms 1600`; `close` needs `--ms 2000`; `overlays/safeguards-card.html` needs `--ms 1200`; `overlays/tx-receipt.html` and `overlays/tx-rail.html` need about `--ms 600`. The PNGs are the static end states, usable directly with a short fade.

## Music

- One royalty-free, low, unobtrusive bed: soft pulse or ambient keys, no vocals, no big drops, about 90–110 BPM. Sources with clear licences: YouTube Audio Library, Pixabay Music, or Uppbeat (credit as their licence asks; put the credit in the YouTube description).
- Level: about −20 dB under the VO (the bed sits near −34 LUFS when the VO is near −14). Duck a further 3 dB under VO lines if the bed has a melody.
- **Out for the refusal hold:** fade out over 0.3 s at 0:46.3, silent through 0:55.0, back in over 1 s. The 0:52.0–0:55.0 silence is room tone only.
- Out at the end: fade 2:17.5–2:19.5.

## Audio mix and loudness

Target **−14 LUFS integrated, −1 dBTP true peak** (YouTube). Two-pass `loudnorm` on the final mix:

```bash
# mix: VO + music with the refusal drop (volume automation by time)
ffmpeg -i vo.wav -i music.wav -filter_complex "\
[1:a]volume='if(between(t,46.3,55.0),0,0.1)':eval=frame,afade=t=out:st=137.5:d=2[m];\
[0:a][m]amix=inputs=2:normalize=0:duration=first[a]" -map "[a]" -ar 48000 mix.wav

# pass 1: measure
ffmpeg -i mix.wav -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2> loudnorm.json
# pass 2: apply, with the measured values from pass 1
ffmpeg -i mix.wav -af "loudnorm=I=-14:TP=-1:LRA=11:measured_I=<input_i>:measured_TP=<input_tp>:measured_LRA=<input_lra>:measured_thresh=<input_thresh>:offset=<target_offset>:linear=true" -ar 48000 mix-14.wav
```

`volume=0.1` is −20 dB; the expression mutes the bed from 46.3 s to 55.0 s. Add `afade` stages instead if you want softer ramps.

## Assembly recipes (ffmpeg)

**1 · Cut each shot** (re-encode for frame-accurate cuts):

```bash
ffmpeg -ss <in> -to <out> -i clips/c-refusal.mp4 -an -r 30 -c:v libx264 -crf 14 -preset fast shots/S06.mp4
```

A jump cut is two such trims joined with step 3. Chapter 3 is cut from the motion piece the same way (`ch3.mp4`, 0.0–27.4 s for S11–S14), with its last frame held 1.5 s: `ffmpeg -i ch3.mp4 -vf "tpad=stop_mode=clone:stop_duration=1.5" -an -r 30 -c:v libx264 -crf 14 shots/S11-14.mp4`.

**2 · Zoom.** Over motion (≤1.3×), a centred push:

```bash
ffmpeg -i shots/S01.mp4 -vf "zoompan=z='1+0.15*on/300':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1920x1080:fps=30" -c:v libx264 -crf 14 shots/S01z.mp4
```

On a hold, from a 2× still (3840×2160), a static 1.6× crop centred on (cx, cy) in still pixels:

```bash
ffmpeg -loop 1 -t 3 -i clips/c-refusal.stills2x/hold-01.png -vf "crop=2400:1350:<cx-1200>:<cy-675>,scale=1920:1080" -r 30 -c:v libx264 -crf 14 shots/S06hold.mp4
```

**3 · Join the shots:**

```bash
printf "file '%s'\n" shots/S01z.mp4 shots/S02.mp4 ... shots/S15.mp4 > shots.txt
ffmpeg -f concat -safe 0 -i shots.txt -c copy picture.mp4
```

**4 · PNG overlays** at program times (one `-loop 1` input per PNG; `enable` sets the window):

```bash
ffmpeg -i picture.mp4 \
  -loop 1 -i docs/demo/production/overlays/honesty-built.png \
  -loop 1 -i build/receipts/receipt_02_register_guarantee.png \
  -loop 1 -i docs/demo/production/overlays/safeguards-card.png \
  -loop 1 -i docs/demo/production/overlays/minimap-roadmap.png \
  -loop 1 -i docs/demo/production/overlays/honesty-pix.png \
  -filter_complex "\
[0][1]overlay=0:0:enable='between(t,0.5,9.5)'[v1];\
[v1][2]overlay=0:0:enable='between(t,47.6,52.0)'[v2];\
[v2][3]overlay=0:0:enable='between(t,87.4,97.8)'[v3];\
[v3][4]overlay=0:0:enable='between(t,87.4,97.8)'[v4];\
[v4][5]overlay=0:0:enable='between(t,66.5,87.0)'[v]" \
  -map "[v]" -t 139.5 -c:v libx264 -crf 14 picture-ov.mp4
```

For a soft in/out on a PNG: `[1]format=rgba,fade=in:st=0.5:d=0.2:alpha=1,fade=out:st=9.3:d=0.2:alpha=1[o1]`, then overlay `[o1]`.

**5 · Alpha video overlays** (chapter titles, wipe, timer), shifted to their program time:

```bash
ffmpeg -i picture-ov.mp4 -i build/chapter-1.mov -i build/timer.mov -filter_complex "\
[1]setpts=PTS-STARTPTS+17.0/TB[c1];[2]setpts=PTS-STARTPTS+63.6/TB[tm];\
[0][c1]overlay=eof_action=pass[v1];[v1][tm]overlay=eof_action=pass:enable='between(t,63.6,87.0)'[v]" \
  -map "[v]" -c:v libx264 -crf 14 picture-ov2.mp4
```

(Timer cuts: split `timer.mov` with `-ss/-to` at the same points as S8's cuts and place each piece.)

**6 · Burn in the English captions.** With an ffmpeg that has libass (`ffmpeg -filters | grep subtitles`):

```bash
ffmpeg -i picture-ov2.mp4 -vf "subtitles=docs/demo/production/captions.en.srt:force_style='FontName=Inter,FontSize=22,PrimaryColour=&H00FFFFFF,BackColour=&H33110F0E,BorderStyle=4,Outline=0,MarginV=36'" -c:v libx264 -crf 14 picture-cap.mp4
```

Without libass (the default Homebrew build has no `subtitles` filter), render the captions as an alpha track and overlay it:

```bash
node docs/demo/production/tools/render.cjs captions docs/demo/production/captions.en.srt --out build/cap-en
ffmpeg -f concat -i build/cap-en/captions.concat.txt -r 30 -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le build/captions-en.mov
ffmpeg -i picture-ov2.mp4 -i build/captions-en.mov -filter_complex "[0][1]overlay=eof_action=pass" -c:v libx264 -crf 14 picture-cap.mp4
```

Both SRTs carry the real figure (65 s, cue 18). The caption and timer tracks run about 1 s past their last cue; `-t 139.5` on the export trims it.

**7 · Export 1080p30 H.264 MP4** with the normalised mix:

```bash
ffmpeg -i picture-cap.mp4 -i mix-14.wav -map 0:v -map 1:a -t 139.5 \
  -c:v libx264 -preset slow -crf 18 -profile:v high -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart mutav-demo-1080p30.mp4
```

Upload `captions.en.srt` and `captions.pt-BR.srt` to YouTube as caption tracks too (the English ones are also burned in).

## Final checks

- Runtime ≤ 2:20 (target 2:19.5). One honesty label per shot besides the banner. Every on-screen number matches the storyboard's numbers table.
- The 65 s is in the VO ("sixty-five seconds") and both SRTs (cue 18), from Ana's own timestamps.
- Every Explorer flash is 1.5–2 s and on the beat; every receipt and rail entry matches `tx-receipts.json` (no sample PNG in the cut).
- Chapter 3: the finale card reads "Simulation of reserve mechanics · not an expected return"; the captions carry the v3 figures, with no `[V3]` left.
- Scale: the scale caption is on every devnet shot (S1, S3–S9b, S15a) and never over S2 or chapter 3; R$1M appears only as the pilot plan (tagged "plan") or as the simulation's labelled end state.
- F8b: the card reads "on-chain today" for the safeguards and "roadmap" for agency platform → operator; nothing says the integration is live.
- Loudness: `ffmpeg -i mutav-demo-1080p30.mp4 -af ebur128=peak=true -f null -` reads about −14 LUFS and ≤ −1 dBTP.
- Watch once muted (the captions and labels carry the story) and once with sound.
