# Edit decision list (v6, 2:15)

Program time is the finished cut (mm:ss.s). **Source** is a harness clip (`clips/<name>.mp4` from the capture run, with its `events.json`) or a kit file. Source in and out points are given against the clip's logged events (`type-start`, `click`, `result`, `hold`), because exact seconds depend on the capture; the program times are fixed.

Clip names: those that exist in the harness today are used as is (`b-register-ana`, `b2-explorer-ana`, `c-refusal`, `d1-file-claim`, `d2-pay-claim`, `d4-settle`). Names marked *(v5)* or *(v6)* are the ones the harness update should add (see `../app-requirements.md`, "Capture harness → v6"); until then, capture them by hand under the same name.

**Rules:** zoom ≤1.3× over motion; ≤2× only on holds, taken from the 2× stills (`clips/<name>.stills2x/`). One honesty label per shot besides the app's #59 banner. The minimap is optional orientation; drop it if the shot is busy. Hard cuts unless noted.

## Shots

| Shot | Program | Source (in → out) | Overlays (program time) | Zoom | Transition | Audio |
|---|---|---|---|---|---|---|
| S1 · F1 cold open | 0:00.0–0:10.0 | `a-reserve-overview` *(v5)*: `/reserve` Overview, no wallet; first settled frame → +10 s | `overlays/honesty-built.png` 0:00.5–0:09.5 | slow push 1.00 → 1.15 over 10 s | fade from black, 6 frames | VO 1–3. Music bed in at 0:00, level −20 dB under VO |
| S2 · F2 agency | 0:10.0–0:15.0 | `agency-flash` *(hand capture)*: Ana's guarantee detail in a local copy of the agency platform with fictional data (Imobiliária Planalto, Ana Souza, Active, MTV-PF-0100); cover amount framed out, URL bar cropped; 5 s | `overlays/honesty-agency.png` 0:10.2–0:14.8 · optional `minimap-1-agency.png` | none | hard cut in and out | VO 4 |
| S3 · F3 register Ana | 0:15.0–0:25.0 | `b-register-ana`: `type-start` −0.5 s → `type-start`; jump cut to `type-end` → `result` +1.5 s | `cards/chapter-1` 0:15.0–0:17.0 (animated, see below) · optional `minimap-2-operator.png` 0:17.0–0:25.0 | ≤1.3× toward the "Confirmed" chip from `result` | hard cut; jump cut on the typing | VO 5 |
| S4 · F4 Explorer | 0:25.0–0:27.0 | `b2-explorer-ana`: the `hold` still, 2 s | optional `minimap-3-program.png` | hold still ≤2× on owner + opaque id | hard cuts | VO 5 tail, then pause |
| S5 · F5 coverage | 0:27.0–0:37.0 | `a3-reserve-coverage` *(v5)*: `/reserve/coverage`, no wallet; 10 s incl. the `hold` | optional `minimap-4-reserve.png` | 0:31.0 on: hold still 1.0 → 1.6× on held vs required (R$36,000 → R$40,500) | hard cut | VO 6–7 |
| S6 · F6 refusal | 0:37.0–0:58.0 | `c-refusal`: red preview visible → `click` (lands at 0:44.5) → `result` → `hold` (3 s) → hold on the meter to fill | `overlays/coverage-refused-chip.png` 0:45.4–0:56.0, placed next to the refusal message | 0:37–0:43 push ≤1.25× on the red preview; 0:45.4–0:50.0 still ≤2× on the refusal; 0:50.0–0:53.0 ease out to the unchanged meter | hard cut | VO 8–10. **Music out at 0:44.3** (0.3 s fade). **0:50.0–0:53.0 silence:** no VO, no music, room tone only. Music back at 0:53.0 (1 s fade-in) |
| S7 · "Later" wipe | 0:58.0–0:59.6 | `overlays/later-wipe` (1.6 s sequence) over the S6 → S8 junction | — | — | the wipe is the transition: cut under it at 0:58.5 | music continues |
| S8 · F7 claim live (one devnet take; retake ≤ R$500 with the alternate VO line 11) | 0:59.6–1:20.0 | `d1-file-claim`: `click` −1 s → `result` +0.8 s · `d2-pay-claim`: `click` −1 s → `result` +0.8 s · `d4-settle` *(v5: `d3-settle-payout`)*: `click` −1 s → `result` +1 s. Cut confirmation waits; each click 2–3 s on screen | `cards/chapter-2` 0:59.0–1:01.0 · **timer** from the `file_claim` result (≈1:04.6) to 1:36.0 · `overlays/honesty-pix.png` 1:10.0–1:36.0 (one label across F7–F8) | ≤1.3× on the R$15,000 cap during `pay_claim` | hard cuts between the three actions | VO 11–14 |
| S9 · F8 claims timeline | 1:20.0–1:36.0 | `d4-reserve-claims` *(v5)*: `/reserve/claims`, filed → paid → settled with timestamps; `hold` 3 s. The earlier R$18,000 test claim is also listed (fine on a disclaimed demo reserve): frame or highlight Ana's row | timer holds in its settled state (amber) · honesty-pix continues | 1:24.0–1:27.0 hold still ≤2× on the three timestamps | hard cut | VO 15–16 |
| S10 · F9 switch card | 1:36.0–1:37.5 | `cards/switch` *(v6, made in the editor)*: "Six months, simulated locally on an accelerated clock", 1.5 s | — | none | hard cut in; hard cut out | music continues; no VO |
| S11 · F10 six months | 1:37.5–1:46.5 | `g1-sim-history` *(v6, localnet)*: `/reserve` history chart Month 1…6 → Capital tab, fees and issuer revenue landing. Recorded with `NEXT_PUBLIC_ACCELERATED_CLOCK=1` (the banner reads "Local simulation · accelerated clock") | `cards/chapter-3` 1:37.5–1:39.5 · `overlays/honesty-mock.png` ("Mock BRS mint · local validator") 1:40.0–1:46.3 | slow push ≤1.15× on the chart | hard cut | VO 17 |
| S12 · F11 large claim | 1:46.5–1:50.5 | `g2-sim-claim` *(v6, localnet)*: `/reserve/claims`, one claim above R$15k: filed → approved (admin) → paid → settled | none | hold still ≤2× on the approved stage | hard cut | VO 18 |
| S13 · F12 cover and share | 1:50.5–1:55.5 | `g3-sim-reserve` *(v6, localnet)*: `/reserve`, "can back up to R$[X]" and value per share, month 1 → 6 | none | hold still ≤2× | hard cut | VO 19 |
| S14 · F13 capital out | 1:55.5–2:05.5 | `g4-sim-capital` *(v6, localnet)*: `/capital`, the capital provider's withdrawal, R$[X] in → R$[X] out | none | hold still ≤1.5× on in → out | hard cut | VO 20 |
| S15 · F14 close | 2:05.5–2:15.0 | `cards/close` (2 s build-in sequence, then `cards/close.png` held) | — | none | 0.5 s fade to black at 2:14.5 | VO 21–22. Music lifts slightly, fades out 2:13–2:15 |

Chapter 3 is captured on localnet; every [X] figure comes from the simulation run. If the cut runs over 2:15, trim S5 and S9 (F5 and F8, −2 s each), then the S6 tail after the silence (0:53–0:58). Never trim the silence itself.

## The timer (S8–S9)

The timer runs on the on-chain clock. `start` = `filed_at` and `end` = `settled_at` in ms (Solana `blockTime` is seconds: × 1000), from the harness's transaction log.

```bash
node docs/demo/production/tools/render.cjs timer --start <filed_ms> --end <settled_ms> --tail 20 --out build/timer
ffmpeg -f concat -i build/timer/timer.concat.txt -r 30 -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le build/timer.mov
```

Because the capture is real speed, place `timer.mov` so its frame 0 sits on the frame where `file_claim` confirms. Wherever S8 cuts out a confirmation wait, cut the timer at the same source points: it jumps forward, honestly. After `settled`, it holds amber for `--tail` seconds (20 s covers S9). Preview in a browser: `overlays/timer.html?start=0&end=42000`. `--every-frame` writes every frame instead of one PNG per second.

## Animated cards and overlays

The chapter titles, the close card and the wipe have CSS in-animations. Render them to alpha video:

```bash
node docs/demo/production/tools/render.cjs seq docs/demo/production/cards/chapter-1.html --ms 2000 --out build/ch1
ffmpeg -framerate 30 -i build/ch1/f_%05d.png -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le build/chapter-1.mov
```

The chapter titles animate in over 0.8 s and hold; fade them out in the edit over the last 6 frames. `later-wipe` needs `--ms 1600`; `close` needs `--ms 2000`. The PNGs are the static end states, usable directly with a short fade.

## Music

- One royalty-free, low, unobtrusive bed: soft pulse or ambient keys, no vocals, no big drops, about 90–110 BPM. Sources with clear licences: YouTube Audio Library, Pixabay Music, or Uppbeat (credit as their licence asks; put the credit in the YouTube description).
- Level: about −20 dB under the VO (the bed sits near −34 LUFS when the VO is near −14). Duck a further 3 dB under VO lines if the bed has a melody.
- **Out for the refusal hold:** fade out over 0.3 s at 0:44.3, silent through 0:53.0, back in over 1 s. The 0:50.0–0:53.0 silence is room tone only.
- Out at the end: fade 2:13–2:15.

## Audio mix and loudness

Target **−14 LUFS integrated, −1 dBTP true peak** (YouTube). Two-pass `loudnorm` on the final mix:

```bash
# mix: VO + music with the refusal drop (volume automation by time)
ffmpeg -i vo.wav -i music.wav -filter_complex "\
[1:a]volume='if(between(t,44.3,53.0),0,0.1)':eval=frame,afade=t=out:st=133:d=2[m];\
[0:a][m]amix=inputs=2:normalize=0:duration=first[a]" -map "[a]" -ar 48000 mix.wav

# pass 1: measure
ffmpeg -i mix.wav -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2> loudnorm.json
# pass 2: apply, with the measured values from pass 1
ffmpeg -i mix.wav -af "loudnorm=I=-14:TP=-1:LRA=11:measured_I=<input_i>:measured_TP=<input_tp>:measured_LRA=<input_lra>:measured_thresh=<input_thresh>:offset=<target_offset>:linear=true" -ar 48000 mix-14.wav
```

`volume=0.1` is −20 dB; the expression mutes the bed from 44.3 s to 53.0 s. Add `afade` stages instead if you want softer ramps.

## Assembly recipes (ffmpeg)

**1 · Cut each shot** (re-encode for frame-accurate cuts):

```bash
ffmpeg -ss <in> -to <out> -i clips/c-refusal.mp4 -an -r 30 -c:v libx264 -crf 14 -preset fast shots/S06.mp4
```

A jump cut is two such trims joined with step 3.

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
printf "file '%s'\n" shots/S01z.mp4 shots/S02.mp4 ... shots/S14.mp4 > shots.txt
ffmpeg -f concat -safe 0 -i shots.txt -c copy picture.mp4
```

**4 · PNG overlays** at program times (one `-loop 1` input per PNG; `enable` sets the window):

```bash
ffmpeg -i picture.mp4 \
  -loop 1 -i docs/demo/production/overlays/honesty-built.png \
  -loop 1 -i docs/demo/production/overlays/coverage-refused-chip.png \
  -loop 1 -i docs/demo/production/overlays/honesty-mock.png \
  -filter_complex "\
[0][1]overlay=0:0:enable='between(t,0.5,9.5)'[v1];\
[v1][2]overlay=0:0:enable='between(t,45.4,56.0)'[v2];\
[v2][3]overlay=0:0:enable='between(t,100.0,106.3)'[v]" \
  -map "[v]" -t 135 -c:v libx264 -crf 14 picture-ov.mp4
```

For a soft in/out on a PNG: `[1]format=rgba,fade=in:st=0.5:d=0.2:alpha=1,fade=out:st=9.3:d=0.2:alpha=1[o1]`, then overlay `[o1]`.

**5 · Alpha video overlays** (chapter titles, wipe, timer), shifted to their program time:

```bash
ffmpeg -i picture-ov.mp4 -i build/chapter-1.mov -i build/timer.mov -filter_complex "\
[1]setpts=PTS-STARTPTS+15.0/TB[c1];[2]setpts=PTS-STARTPTS+64.6/TB[tm];\
[0][c1]overlay=eof_action=pass[v1];[v1][tm]overlay=eof_action=pass:enable='between(t,64.6,96.0)'[v]" \
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

Fill in [N] in both SRTs before rendering. The caption and timer tracks run about 1 s past their last cue; `-t 135` on the export trims it.

**7 · Export 1080p30 H.264 MP4** with the normalised mix:

```bash
ffmpeg -i picture-cap.mp4 -i mix-14.wav -map 0:v -map 1:a -t 135 \
  -c:v libx264 -preset slow -crf 18 -profile:v high -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart mutav-demo-1080p30.mp4
```

Upload `captions.en.srt` and `captions.pt-BR.srt` to YouTube as caption tracks too (the English ones are also burned in).

## Final checks

- Runtime ≤ 2:15. One honesty label per shot besides the banner. Every on-screen number matches the storyboard's numbers table.
- [N] filled in (VO and both SRTs) with the right unit.
- Loudness: `ffmpeg -i mutav-demo-1080p30.mp4 -af ebur128=peak=true -f null -` reads about −14 LUFS and ≤ −1 dBTP.
- Watch once muted (the captions and labels carry the story) and once with sound.
