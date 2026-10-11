# Demo-video capture (test-only)

Records the World's Fair storyboard beats with Playwright and disposable role wallets. Nothing here is imported by `app/`, `components/` or `lib/` (the production bundle has none of it).

## Run

```bash
cd app
(cd .. && anchor build)        # once: target/deploy/mutav.so
bun run demo:capture           # localnet: builds for localnet if needed, seeds, records, tears down, encodes
```

Output: `<workspace>/.claude/notes/demo-capture/<run-id>/` (`manifest.json`, `clips/<beat>.mp4`, `clips/<beat>.events.json`, `clips/<beat>.stills2x/*.png`, `clips/<beat>.stills/*.jpg`).

Devnet (no deploy, no setup is sent by the harness except the beats themselves):

```bash
bun run demo:wallets devnet    # make the role wallets, print what to fund
DEMO_CLUSTER=devnet DEMO_BASE_URL=https://reserve.mutav.finance DEMO_RPC_URL=https://api.devnet.solana.com bun run demo:capture
```

On devnet the VaultConfig roles must be these wallets (operator, capital), the setup must be staged by hand (`00-setup` prints the steps), and the coverage restore before `e-reserve-verify` is a Squads round.

| Env | Meaning |
|---|---|
| `DEMO_PARAMS` | localnet seed: `storyboard` (c = 0.10, default) or `adr0028` (c = 0.25 and the ADR 0028 caps) |
| `DEMO_PACE` | pause multiplier; `0` = fast dry run |
| `DEMO_ONLY` | comma list of beats to record (state-changing beats always run) |
| `DEMO_DPR` | `2` (default): 2× stills on holds; `1`: none |
| `DEMO_OUT_DIR`, `DEMO_RUN_ID` | output root and folder |
| `DEMO_KEEP_FRAMES=1` | keep the raw screencast frames |

## Files

- `wallets.ts`: role keypairs in `~/.config/solana/mutav/demo/<cluster>/` (0600), via `solana-keygen`.
- `signer.ts`: Node-side signer; refuses unless the RPC genesis is devnet or a local validator. Keys never enter the page.
- `inject.ts`: the wallet-standard test wallet (calls the signer through a binding) and the cursor overlay.
- `pages.ts`: routes and role/text locators, one map per page. Porting to another layout (PR #45) means editing this file.
- `scenarios.ts`: the beats. `capture.ts` / `director.ts`: screencast, event log, human pacing. `encode.ts`: ffmpeg.
- `../../scripts/seed-demo.ts`: the localnet starting state (`localnet.ts up --seed demo`).

## Video and the event log

Chromium's screencast delivers CSS-pixel frames (1920×1080) whatever the scale factor, and full 2× capture runs at about 12 fps here. So the video is 1920×1080 at 30 fps (rendered at dpr 2, about 60 fps captured), and every hold and result also saves a native 3840×2160 PNG of the static screen. Zoom into holds from the 2× still, up to 2×; keep zooms over motion at or under 1.3×.

`events.json`: `t` is video seconds; `box` is CSS px (= video px; ×2 for the stills). Kinds: `move`, `click`, `type-start` / `type-end` (cut between them), `result`, `hold` (with `duration` and `still`), `scroll`, `navigate`. The cursor overlay is burned in.
