# Demo source kit (final cut, 2026-10-12)

Everything needed to tweak and re-render the submitted Colosseum demo, [`../mutav-demo-final.mp4`](../mutav-demo-final.mp4) (2:20.6, 1080p30, −14 LUFS). The folder layout mirrors the working folder the cut was made in, because the build reads its siblings by relative path (`../captions.en.srt`, `../vo-script.final.md`, `../intro/out/…`, `../music/…`).

The cut is built with [HyperFrames](https://hyperframes.heygen.com) (`hyperframes@0.8.150`, pinned in `procut/package.json`). It also needs Node and ffmpeg. The first `npx` run downloads HyperFrames and its headless Chrome.

## Re-render the final

```bash
cd docs/demo/production/source/procut
zsh tools/final.sh          # build → render → cut the silent 58.0–61.5 span → assemble → out/mutav-demo-final.mp4
```

`final.sh` runs these steps, which you can also run one at a time:

1. `node tools/build.mjs` generates `index.html` (the HyperFrames composition) from the shot list, the VO timings and the captions. `DIAGRAM=0` builds the variant without the live diagram column.
2. `npx hyperframes@0.8.150 render …` renders `out/procut-base.mp4` (about 6 min on an M4 with 2 workers).
3. It cuts the VO-silent span: video 58.0–61.5 s, audio 57.9–61.4 s (program time).
4. `tools/assemble.sh` adds the 3 s logo sting and its SFX, the music bed (with the refusal drop and the close lift), room tone, and two-pass loudness to −14 LUFS / −1.5 dBTP.

To check a frame without rendering: `npx hyperframes@0.8.150 preview` in `procut/`.

## Where to tweak

| Change | Edit |
|---|---|
| Shot timing, zooms, highlights, chips, headlines, chapter cards | `procut/tools/build.mjs` (`SHOTS`, `LT`, `CARDS`, `HEAD`, `LD`), then rebuild |
| VO line placement | `vo-script.final.md` (the Start column); the takes are `procut/assets/vo/eleven/line-*.wav` |
| Burned-in captions | `captions.en.srt` (pt-BR in `captions.pt-BR.srt`, for upload) |
| Close card | `procut/compositions/close.html` |
| Live diagram (register / refusal / claim) | `procut/compositions/diagram.html`; its standalone source is in `diagram/` |
| Intro (cold open, agency mockup) | `intro/index.html`, then re-render `intro/out/intro.mp4` and copy it to `procut/assets/clips/intro.mp4` |
| Logo sting | `intro/logo-sting/`; the output is `intro/out/logo-sting.mp4` |
| Chapter 3 simulation | `ch3-flows/` (reads `ch3-ledger.json`), then re-render and copy to `procut/assets/clips/ch3.mp4` |
| Music / SFX | `music/` (Pixabay licence, see `music/SOURCES.md`) and the volume automation in `procut/tools/assemble.sh` |

## Notes

- **Captions after the cut.** The burned-in captions are correct, because they're rendered before the cut. The `.srt` files are in pre-cut time, so subtract 3.5 s from every cue after 0:58 before uploading them as side files.
- **Not included** (too large for git; kept locally by the team): the raw screen takes (`takes/`, 2.5 GB; `procut/tools/cut.sh` re-cuts `procut/assets/clips/` from them), the test mixes and the earlier renders. The cut clips in `procut/assets/clips/` are enough for any edit that doesn't need new footage.
- **Locked decisions** (don't relitigate):
  - Chapter cards are text only.
  - No camera moves in chapter 3.
  - The close writes the VO word for word.
  - The claim flow is drawn once, by the live diagram.
  - VO line 4 says "signed letters of intent".
  - The chapter 3 finale keeps "reserve unit value 1.000 → 1.152 · Simulation of reserve mechanics · not an expected return".
- `procut/CRITIQUE.md` and `procut/FACTCHECK.md` record the design and fact-check passes behind the cut.
