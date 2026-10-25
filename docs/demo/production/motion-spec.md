# MUTAV demo: motion spec

For whoever builds the full cut. Direction: **a premium, sexy tech product, upbeat and energetic**, in the register of an Apple, Linear or Arc launch film. The energy comes from restraint, depth, light and cutting on the beat. No shakes, flashes, bounces or whip-glitches.

Reference build: the agency shot (6 s; the cut runs it at about 7 s), a HyperFrames composition kept with the team's production files, not in this repo. Reuse its stage, window, caption and label code.

## Look

| Element | Rule |
|---|---|
| Canvas | `#0E0F11` near-black, faint brand grid (48 px, `rgba(240,240,238,.04)`) |
| Accent | One amber, `#E8A020`, used as **light**: soft bloom on key numbers, on the active node, as a rim light and as a faint spill behind panels. Never as large fills. |
| App footage | Floats on glass panels or a browser window: hairline border (`rgba(255,255,255,.08)`), long soft shadow, a perspective tilt of 4–8°, and slow parallax against the grid |
| Specular | One thin light sweep across the glass on key moments only (about one per chapter) |
| Macro | Close-ups on a single number, with a shallow-focus blur on everything behind it |
| Finish | Subtle film grain (about 7 % overlay) and vignette, **on the stage only**. UI pixels get no grade, grain or LUT (the media-use "UI Fidelity" rule). |

## Type

- **Display:** Geist 800, tracking −0.02 to −0.04 em. Reveal it with a mask (clip-path or overflow wipe). Never slide it in from off-screen or pop it with scale.
- **Numbers:** JetBrains Mono. Count-ups ease out and settle with a soft amber glow (0.3 s).
- **Captions:** the brand caption style (`overlays/caption.html`): Inter 500 at 44 px, white on `rgba(14,15,17,.80)`, bottom-centred, revealed line by line with a left-to-right mask (0.55 s, expo-out).

## Motion

- **Easing:** expo or power3/power2, with weight. Camera moves take 0.6–0.9 s; UI elements about 0.4 s.
- **One camera move per shot.** Pushes are gentle (scale ≤ 1.10).
- **Motion blur** goes on camera moves and scrolls only, via the `motion-blur` registry component (`samplesPerFrame` 8–10, `shutterAngle` 360, `sharp: 1`; `sharp: 0` washes light UI out to white mid-scroll). Never blur text at the moment it must be read.
- **Cursor:** minimal, with a soft amber click ripple (0.4 s, ease-out, no overshoot).

## Music and beat

Minimal modern electronic at **118–124 BPM**, with deep bass and space. Cuts land on the beat, but there are few of them. At 120 BPM a bar lasts 2 s and a beat 0.5 s.

Signature moments:

1. **Refusal (Ch1).** The music drops to a low hum. The panel desaturates except the ✗ receipt (or the amber "refused" chip). Hold 3 s of stillness, then the beat returns on the next downbeat with a hard cut to the failed transaction on Explorer ("the chain itself refused it").
2. **"Settled" (Ch2).** The timer freezes on a downbeat, a light sweep crosses it and a bass hit lands.
3. **Close.** One pillar per bar, then a sheen across the logo, then silence.

## Per chapter

| Chapter | Feel |
|---|---|
| Cold open | Dark screen. An amber light line draws in (0.8 s, expo-out), then the reserve panel floats up from depth. |
| Agency | A browser-window mockup (reference build, below). |
| Ch1 | A controlled build toward the refusal's silence. The camera tightens slightly with each step and there are no cuts inside the build. Two Explorer flashes: register_guarantee after the confirmation, the failed transaction after the silence. |
| Ch2 | A tight macro on the timer, then the "settled" hit. The pay_claim and settle_payout flashes cut in where the confirmation waits were. |
| Ch3 | The ledger-driven motion piece `ch3-flows` (27.4 s): monthly fees (amber), reserve yield (blue) and claims (red) draw in month by month, the share value climbs, the operations list scrolls, then the finale card with in → out in large display type and "Simulation of reserve mechanics · not an expected return". v9: at the pilot plan's scale (R$ k / R$ M formatting, the reserve counter climbing toward R$1M, a small "Pilot plan scale (PR #63 parameters)" line). Its last frame holds 1.5 s. |
| Close | A 2 s cutaway to `/reserve/verify` (every account, each with an Explorer link) under "Verify everything on Solana", then pillars, logo sheen, the pilot-plan line with its "plan" tag, silence. |

## Honesty limits (non-negotiable)

- The timer shows **real elapsed time**. Where waits are cut, show a visible "waits trimmed" tag.
- Receipts, the rail and the Explorer flashes show **real transactions only**: values from `getTransaction`, captures from Explorer on devnet (or, in chapter 3, labelled "local validator").
- Honesty labels and the "Local simulation · accelerated clock" banner stay readable: at least 26 px, on a solid glass plate, never under a sweep or a blur.
- **Scale:** the devnet amounts are sized to the test tokens available. The scale caption ("Devnet demo · sized to test tokens · pilot plan: R$1M reserve") rides in the banner slot on every devnet shot, at least 26 px on a glass plate. Never scale a devnet figure up; R$1M appears only as the pilot plan (tagged "plan") or as the simulation's labelled end state.
- **No fake UI.** Animation only frames real footage: crops, scale, glass, light *around* the pixels. Never edit values, add UI elements or composite states that never existed.
- **Flatten straight-on at the moment of reading.** Every shot where a number must be read (the refusal error, the timer, in → out, the pipeline) reaches 0° tilt and scale ≥ 1.0 before the read and holds at least 1 s.

## On-chain proof (v8)

- **Explorer flashes** are real devnet captures, 1.5–2 s each, hard cuts on the beat: register_guarantee (F4), the failed MTV-PF-0101 transaction with "Error · InsufficientFreeCapital" (F6b), pay_claim and settle_payout (F7). Flatten them straight-on; one gentle push at most. They replace holds, never add to them.
- **Receipt card** (`overlays/tx-receipt.html`): a compact glass card, lower left, after each on-chain action; it builds in over about 0.45 s (fade-up, mask reveal on the instruction name) and holds about 1.5–2 s. Mono type, green ✓ or red ✗ pill, "Solana devnet".
- **Transaction rail** (`overlays/tx-rail.html`): a slim right-edge column from the first confirmation to the end of F8; each new entry mask-reveals left to right with a faint amber wash, older entries stay. It slides out at the cut to F8b.
- Both show only values from real `getTransaction` data. The sample PNGs (placeholder values, "Sample values" tag) are for layout only.

## Agency browser mockup rules

- **No real domain in the address bar.** The footage is a local copy with fictional data. The address bar reads only "MUTAV · Agency platform", with no URL and no lock icon. The tab reads "MUTAV — Agency platform" with a small amber square favicon.
- Crop out: the user email (sidebar bottom-left), the "Book in force" chart (empty in this dataset) and the guarantees table (it shows R$ amounts).
- The sidebar stays fixed while the main column scrolls, as a real page does. The scroll is built from two crops stacked with the chart removed between them.

## Reference build: agency shot (6 s, 1920×1080, 30 fps)

Beat marks assume 120 BPM, with the downbeat at 0.0 s.

| Time (s) | Picture | Beat |
|---|---|---|
| 0.0–0.7 | The window rises from depth (z −260, y +110 → 0, expo-out), tilted −6° Y / 3° X. The grid drifts the other way (parallax). The amber rim light fades in along the left edge. | **0.0 downbeat**: the window starts on it |
| 0.3–0.6 | The caption mask-reveals line by line. The honesty label is up by 0.25 s and stays for the whole shot. | |
| 0.9–2.6 | A gentle push-in (1.0 → 1.08) toward "Guarantees in force 4". The amber halo and glow on the number come in at 1.45 s. | **1.0 beat 3**: the push starts |
| 1.15–2.15 | Specular sweep across the glass | |
| 2.8–3.5 | Scroll to "Where the book sits": 160 px, expo-inOut, with motion blur. The camera eases back to 1.0. | **2.0 bar 2** marks the halo peak; the **3.0 beat** sits mid-scroll (a cut point if this shot is trimmed) |
| 3.65 | "Active 4" node: soft amber bloom (0.5 s) | **3.5 off-beat** |
| 0.7–4.5 | The tilt eases to 0° (power2.inOut). The pipeline reads straight-on from 4.5 s to the end. | **4.0 bar 3 downbeat**: the next cut can land at 6.0 (bar 4) |

Render it with the HyperFrames CLI (`hyperframes@0.8.150`, two workers). GSAP and the motion-blur snippet are vendored with the composition, so the render needs no network.
