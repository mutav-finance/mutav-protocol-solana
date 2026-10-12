# Production Tooling for a Scripted, Agent-Run Product Demo Video (state as of Oct 2026)

Context: small team plus AI coding agents, under 24 h, Next.js app on Solana devnet with a signing wallet, macOS on an M4 MacBook Air (10 cores; no discrete GPU), target ≤3 min 1080p MP4 for a Colosseum hackathon submission.

Research note: about 22 tool calls (search plus fetch). Third-party blogs and aggregators back many of the pricing claims, and I flag where they disagree. Commands under "Inferences" come from my working knowledge of the tools and were not checked against fetched docs in this session. Treat them as starting points and dry-run them before relying on them.

---

## 1. Scripted browser capture: Playwright `recordVideo` limits, alternatives, pacing, cursor, wallet waits

### Takeaway
Playwright's built-in recorder is fine as a fallback but weak for a polished 1080p demo. You can't set its quality or fps, Chromium's bitrate has reportedly been hard-coded at about 1 Mbit/s, and the default size scales down to fit 800x800. The 2026 community pattern for polished output is a frame-by-frame screenshot capture or a CDP screencast. That pipeline logs click and cursor events to JSON, then composites a vector cursor and zoom camera in a second render pass.

### Cited Findings
- Official options are `recordVideo: { dir, size }` (library) or `video: { mode, size, show }` (test runner), with modes `off | on | retain-on-failure | on-first-retry`. The docs list no quality or fps options. — [Playwright docs: Videos](https://playwright.dev/docs/videos)
- "The video size defaults to the viewport size scaled down to fit 800x800." The viewport sits in the top-left corner of the output and is scaled down if needed, so you must set `size` to match the viewport for a 1920x1080 result. — [Playwright docs: Videos](https://playwright.dev/docs/videos)
- New `show` options: `show.actions` highlights each action with an element outline and a title subtitle (`duration` defaults to 500 ms, plus `position` and `fontSize`). `show.test` adds test-info annotations. This is a debugging aid, not demo polish. — [Playwright docs: Videos](https://playwright.dev/docs/videos)
- The video is written only when the context closes (`await browserContext.close()`), and `page.video().path()` is available only after the page or context closes. — [Playwright docs: Videos](https://playwright.dev/docs/videos)
- A GitHub feature request says recording has only mode and size options, that quality can't be configured, and that Chromium uses a 1 Mbit/s target bitrate hard-coded in the source. Firefox and WebKit record without ffmpeg and expose no quality parameters. I did not verify this against current source, so it may have changed. — [microsoft/playwright#31424](https://github.com/microsoft/playwright/issues/31424)
- The third-party `playwright-video` npm package (CDP screencast based, Chromium only) exposes `fps`, default 25. A higher fps improves quality but increases file size. — [playwright-video on npm](https://npmjs.com/package/playwright-video)
- Playwright's screencast "emits CSS-viewport pixels no matter what you ask it for", so demo video can't be 4K this way. A 1920x1080 viewport is used, and stills use `deviceScaleFactor: 2` to get 3840x2160. — [ashrafchowdury/programatic-demo README](https://github.com/ashrafchowdury/programatic-demo)
- Screenshot-per-frame approach: a Claude Code skill drives the app one small step at a time and screenshots each frame. Capture takes minutes of wall-clock time but plays back at 60 fps. Frames are composited with multiprocess Pillow into a single ffmpeg pipe, `HD=1` re-renders at retina resolution, and its hand-recording path uses CDP screencast frames that contain no OS cursor. — [surajshetty3416/demo-video-skill](https://github.com/surajshetty3416/demo-video-skill)
- Pacing guidance from the same ecosystem: cold browser contexts are slower, so flows should wait for elements, not sleep for fixed times. — [programatic-demo README](https://github.com/ashrafchowdury/programatic-demo)
- Other open-source "demo-as-code" tools include demowright (cursor, captions, auto-zoom and end card baked into the recording, re-rendered in CI), demoloom (scripted Playwright flow to a deterministic demo), and demo-pipeline (Playwright click-through + TTS + ffmpeg). — [matte97p/demowright](https://github.com/matte97p/demowright), [YossifNassar/demoloom](https://github.com/YossifNassar/demoloom), [philipposk/demo-pipeline](https://github.com/philipposk/demo-pipeline)
- A simple workflow write-up crops the raw `.webm` to the relevant UI region with ffmpeg and encodes to mp4 and webm. — [daily.dev: Record a product demo with Playwright](https://daily.dev/posts/record-a-product-demo-with-playwright-bfaidl1pm)
- Wallet: my search found no current, authoritative guide to driving Phantom from Playwright. Synpress is described as Cypress/Playwright-based "with included MetaMask support", which suggests Phantom isn't supported out of the box. — [Synpress npm listing (via search)](https://npmjs.com/~phantom-security-bot)

### Inferences
- **Recommended capture approach, in order of preference:**
  1. **Playwright plus an injected test wallet, recorded by CDP screencast or screenshot-per-frame, with cursor and zoom composited afterwards.** This gives deterministic, re-runnable takes, no OS cursor jitter, and 60 fps output. A good start is to fork or adapt `programatic-demo` (Playwright + Remotion camera, MIT) or `demo-video-skill` (Playwright + Pillow + ffmpeg, Python), not to build from scratch.
  2. **Playwright driving a headed browser while ffmpeg avfoundation records the screen.** This captures the real Phantom popup and the real OS. Example: `ffmpeg -f avfoundation -capture_cursor 0 -framerate 60 -i "<screen_index>:none" -c:v h264_videotoolbox -b:v 20M raw.mov`; list devices with `ffmpeg -f avfoundation -list_devices true -i ""`. macOS asks for Screen Recording permission for the terminal app. This is a good fit if the team wants the real Phantom popup on screen, but it is more fragile and timing-dependent.
  3. **`recordVideo` with `size: {width:1920,height:1080}` and a matching viewport.** This is the quickest and has zero extra dependencies. Expect visible compression on text-heavy dashboards at about 1 Mbit/s VP8, so treat it as a rough-cut or backup take only.
- **Wallet signing in Playwright:** it is far more reliable to inject a wallet-standard-compatible test wallet via `page.addInitScript` (a devnet keypair that signs in-page and registers through the Wallet Standard `register` event) than to automate the Phantom extension. Extensions need `chromium.launchPersistentContext` with `--load-extension`, can't run headless reliably, and add popup-window juggling. For the "trust" shot, record one short manual clip of a real Phantom approval with Screen Studio or avfoundation and splice it in. Keep the injected keypair devnet-only and throwaway, and never commit a key that holds anything of value.
- **Waits for devnet confirmation:** wait on UI state (`await expect(page.getByText('Confirmed')).toBeVisible({ timeout: 60_000 })`) or poll `getSignatureStatuses`, not fixed sleeps. Then cut the dead time in post. With screenshot-per-frame capture the wait costs nothing, because no frames are emitted while the script waits. Pre-fund the demo wallet and pre-create accounts so devnet airdrop rate limits don't block the shoot.
- **Visible cursor in raw Playwright video:** Playwright moves no visible cursor, so inject a DOM cursor (an absolutely positioned SVG that follows `mousemove`) via `addInitScript`, and use `page.mouse.move(x, y, { steps: 30 })` for smooth travel. A composited vector cursor added in post (options 1 and 2 above) looks better and stays sharp under zoom.
- **Determinism:** fix the viewport (1920x1080 at `deviceScaleFactor: 1` for video), freeze clocks with `page.clock` if timestamps appear, seed or mock RPC responses for non-chain data, and disable CSS animations that fight the frame stepper.

### Gaps
- I could not confirm whether Playwright's Chromium recorder bitrate is still hard-coded at 1 Mbit/s in late-2026 releases, or whether it has switched codecs. Only a GitHub issue backs the claim.
- Playwright has no documented first-party high-fps "screencast" API on the Videos page. Any newer API would need checking in the release notes.
- I found no authoritative 2026 source on Phantom automation in Playwright, or on Phantom offering an official test or mock mode.

---

## 2. Auto-zoom and cursor polish (Screen Studio, Cursorful, FocuSee, Rotato, Tella and others)

### Takeaway
GUI auto-zoom tools draw their zoom from cursor telemetry captured during their own recording. They can import an existing video and let you add manual zooms, but they lose cursor smoothing and auto-zoom on imported footage. None of them takes zoom keyframes from a script. For an automated pipeline, code-based zoom is the scriptable option: click-log JSON drives a camera in Remotion, Pillow or ffmpeg. Screen Studio is best used for one or two hand-recorded hero shots.

### Cited Findings
- Screen Studio can create a project from an existing video (File > Create project from video). Zooms and most visual enhancements still work, but mouse cursor animations and the selfie camera are not available for imported content. — [Screen Studio guide: Creating project from existing video](https://screen.studio/guide/creating-project-from-existing-video)
- Screen Studio zooms are auto (click-driven) or manual (you place the zoom area). They appear as purple blocks on a timeline whose edges you drag. — [Screen Studio guide: Manual zoom](https://screen.studio/guide/manual-zoom), [Adding/editing zooms](https://screen.studio/guide/adding-editing-zooms)
- I found no official Screen Studio documentation on numeric keyframes. Third-party tutorials describe a Transform panel, unverified. — [TemperStack tutorial](https://www.temperstack.com/learn/screen-studio/add-zoom-effects/)
- Openscreen (an open-source alternative) states that imported videos get no suggested zooms "because there's no cursor telemetry". — [Openscreen tips](https://www.mintlify.com/siddharthvaddem/openscreen/guides/tips-and-tricks)
- Screen Studio pricing is reported inconsistently: one source says it rose from $89 to $149, another puts it at $9–20 per month (macOS only). — [ToolJunction alternatives](https://www.tooljunction.io/alternatives/screen-studio)
- Cursorful is described as the closest to Screen Studio in features and learning curve. FocuSee is called the best cross-platform option with AI auto-zoom, from $59.99 per year. — [ToolJunction blog](https://www.tooljunction.io/blog/screen-studio-alternatives), [screensnap.pro (DE)](https://www.screensnap.pro/de/blog/screen-studio-alternative-mac)
- Tella supports adding zooms in its editor (help doc). — [Tella help: Add a zoom](https://www.tella.com/help/editing/add-a-zoom.md)
- Code-based zoom: `programatic-demo` logs each click's position, bounding rect, departure time and typing end to `public/<name>.clicks.json`. `zoom.ts` turns click clusters into a keyframe track (punch in, hold, pan, trail out), `camera.ts` interpolates it with a measured easing curve, and a vector cursor plus shuttered motion blur render at output resolution. Recommended rhythm: establish, lead-in, a hold of at least 1.3 s, optional trail, then end at base scale. — [programatic-demo](https://github.com/ashrafchowdury/programatic-demo)
- In `demo-video-skill`, a virtual camera (a focus point and zoom per frame) makes reframing a re-render, not a re-shoot. Its advice: decouple the camera from the cursor, zoom once per shot, and keep zoom headroom within the capture resolution. — [demo-video-skill](https://github.com/surajshetty3416/demo-video-skill)
- A community "screenstudio-alt" Claude skill claims headless CLI auto-zoom on click clusters for existing recordings. It is community-maintained and unvetted. — [claudskills.com screenstudio-alt](https://claudskills.com/skills/screenstudio-alt/SKILL.md)

### Inferences
- **Opinionated pick:** don't run automated footage through Screen Studio. Use the click log your Playwright script already knows about, since the script has every target's `boundingBox()`, and drive zoom in code. Use Screen Studio ($, macOS-native, excellent on M-series) only for hand-recorded segments such as a real Phantom approval.
- **Zoom headroom:** a 1.5–2x punch-in on a 1080p capture shows upscaled pixels. Either capture the app at 2x (`deviceScaleFactor: 2` screenshots at 3840x2160, as programatic-demo does for stills) and render the 1080p output from it, or keep zoom at 1.3x or less.
- **Cheapest code-only zoom:** use the ffmpeg `zoompan` filter, or `crop` plus `scale` with time expressions. It works but is jittery without sub-pixel interpolation, so Remotion (`interpolate` plus `spring`) or a Pillow compositor gives smoother eased motion.
- Rotato is a device-mockup and 3D product-shot tool, useful for a hero shot of the app in a MacBook frame, not for zoom on screen recordings. I did not research its current pricing.

### Gaps
- I couldn't confirm whether Cursorful or FocuSee accept imported footage, or offer any project-file or JSON format that could be generated programmatically.
- I found no public automation API (CLI, project-file schema) for Screen Studio.
- Current Screen Studio pricing is contradictory across sources.

---

## 3. Motion graphics and title cards from HTML/code (Remotion, HyperFrames, Motion Canvas or Revideo, Playwright + ffmpeg)

### Takeaway
In 2026 there are two strong options. **HeyGen HyperFrames** (Apache 2.0, HTML + GSAP, built for agents with official Claude Code skills) is the lowest-friction way to have agents write title cards and motion graphics. **Remotion** (React) is the most mature, and it is free for a company of 3 or fewer employees. Motion Canvas looks dormant. Revideo, a fork, is active but small. Rendering a plain HTML page to frames with Playwright plus ffmpeg is a viable zero-dependency fallback.

### Cited Findings
- **HyperFrames:** "Write HTML. Render video. Built for agents." It turns HTML, CSS, media and seekable animations into deterministic MP4 by seeking each frame in headless Chrome and encoding with FFmpeg. The license is Apache 2.0. — [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)
- HyperFrames install and CLI: Claude Code plugin via `claude plugin marketplace add heygen-com/hyperframes` then `claude plugin install hyperframes@hyperframes`, or skills via `npx skills add heygen-com/hyperframes`. Then `npx hyperframes init my-video`, `preview` (live reload), `render` (MP4), `add <block>` (e.g. `data-chart`), plus `lint`, `check`, `snapshot`, `doctor`, and cloud or AWS Lambda rendering. It requires Node 22+ and FFmpeg. — [hyperframes README](https://github.com/heygen-com/hyperframes)
- HyperFrames timing model: data attributes (`data-start`, `data-duration`, `data-track-index`) on `class="clip"` elements. Animation is a paused timeline registered on `window.__timelines`, with GSAP in the examples and adapters for CSS, Lottie, Three.js, Anime.js and WAAPI. It ships 21 skills, including product-launch video, PR-to-video, captions, motion graphics and music-to-video workflows. — [hyperframes README](https://github.com/heygen-com/hyperframes)
- HyperFrames is a rendering engine, not HeyGen's avatar or talking-head product. — [themenonlab blog](https://themenonlab.blog/blog/heygen-hyperframes-video-as-code)
- HyperFrames MCP: the README documents no MCP server ("mcp" is only a topic tag). — [hyperframes README](https://github.com/heygen-com/hyperframes). However, a "HyperFrames by HeyGen" connector is offered for Claude, which suggests a hosted MCP connector exists (observed, not documented in the README).
- Reported star counts and versions conflict across aggregators: about 4.3k to 32.5k stars in third-party listings versus 60.8k on GitHub when I fetched it, and versions from 0.4.41 to 0.7.22. Launch is dated March–May 2026. — [silenceper](https://silenceper.com/en/article/2026-05-02-hyperframes-html-video-rendering/), [GitHub](https://github.com/heygen-com/hyperframes)
- **Remotion license:** the free license covers individuals, non-profits, people evaluating it, and "a for-profit organization with up to 3 employees". Anyone else needs a Company License. The license "will slightly change" in Remotion 5.0 (PR #3750). — [Remotion LICENSE.md](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)
- Remotion company pricing: Creators $25 per seat per month, Automators $0.01 per render with a $100 monthly minimum, Enterprise from $500 per month. — [Remotion pricing docs](https://www.remotion.dev/docs/license/pricing) (via search snippet)
- Remotion's bundled ffmpeg lacks `signalstats`, so `programatic-demo` needs a system ffmpeg (`brew install ffmpeg`). GPU rendering is about 10x faster; without a GPU set `DEMO_GL=swiftshader`. Batch concurrency is limited by memory: 3 is comfortable on 16 GB, and 8 caused OOM kills. — [programatic-demo](https://github.com/ashrafchowdury/programatic-demo)
- **Revideo:** an open-source programmatic-video framework forked from Motion Canvas, listed as an Active YC company with a team of two in Berlin. — [YC: Revideo](https://www.ycombinator.com/companies/revideo), [docs.re.video](https://docs.re.video/)
- **Motion Canvas:** an undated HN comment says its site was unreachable and the repo had no updates in over a year. Canvas Commons is named as the active fork. — [HN thread](https://news.ycombinator.com/threads?id=prathje)

### Inferences
- **Opinionated pick for this team:** use **HyperFrames for title cards, architecture diagrams and lower-thirds.** The Apache license avoids any Remotion license question, it is HTML and GSAP that agents write fluently, the official Claude Code plugin exists, and the deterministic render pairs well with Playwright footage. Use **Remotion only if you adopt `programatic-demo`'s camera system.** At MUTAV's size, 3 or fewer employees, it is likely free, but confirm the headcount (contractors and the separate operator/admin entity may count) before relying on that.
- **Fallback with no framework:** write `card.html` with CSS animations driven by a `--t` variable. In Playwright, step `t` and call `page.screenshot()` per frame (e.g. 60 fps × 4 s = 240 PNGs), then run `ffmpeg -framerate 60 -i f%04d.png -c:v libx264 -pix_fmt yuv420p -crf 16 card.mp4`. Alternatively, Chrome's `Animation` API or `document.getAnimations().forEach(a => a.currentTime = ms)` makes CSS animations seekable.
- **M4 Air thermals:** the Air is fanless. Long Chromium-based renders (Remotion or HyperFrames) will throttle, so keep render concurrency at about 2–3 (`npx remotion render --concurrency=3`). Don't run renders in parallel with test suites.
- Keep every card the same resolution, fps and pixel format (1920x1080, 30 or 60 fps, yuv420p) as the screen footage so the final concat can stream-copy or needs only one re-encode.

### Gaps
- I couldn't confirm the official HyperFrames MCP endpoint or its tool list from primary docs. Only the presence of a Claude connector suggests one.
- The exact text of Remotion 5.0's license changes (PR #3750) was not fetched.
- Revideo's 2026 release cadence is unverified.

---

## 4. Voiceover: ElevenLabs, OpenAI TTS and others; founder voice cloning; how judges react

### Takeaway
ElevenLabs is the quality default: Eleven v3 has been GA since February 2026 and is the most expressive. It is not real-time, which doesn't matter for a pre-rendered video. The Creator plan (about $22 per month) unlocks Professional Voice Cloning with a live voice verification, and you can clone only your own voice. OpenAI `gpt-4o-mini-tts` is a cheap, steerable alternative at roughly $0.015 per minute. I found no evidence that hackathon judges penalize AI narration. Colosseum's own guidance says narrative clarity beats production value. Still, an authentic founder voice, real or a disclosed clone, is the safer choice for the pitch video.

### Cited Findings
- Eleven v3 went GA on Feb 2, 2026. It isn't real-time, so voice agents use Flash v2.5 (about 75 ms, 32 languages). Turbo models are deprecated in favor of Flash. — [Fora Soft (May 2026)](https://www.forasoft.com/learn/ai-for-video-engineering/articles-ai/elevenlabs-pricing-voice-cloning-no-fakes-act), [Coval review](https://www.coval.ai/blog/elevenlabs-review-2026-voice-cloning-and-synthesis-capabilities-explained)
- ElevenLabs plans: Free gives 10k credits with no commercial rights and no cloning. Starter is $6, Creator $22, Pro $99, Scale $299 and Business $990 per month. Unused credits roll over for up to two months. — [techjacksolutions](https://techjacksolutions.com/ai-tools/elevenlabs/) (third-party; check elevenlabs.io/pricing)
- API pricing conflicts: one source says $0.10 per 1k characters for Multilingual v2 and v3 and $0.05 for Flash and Turbo. Another says $0.10 per 1k for both. — [modelslab](https://modelslab.com/elevenlabs-api-pricing.md), [aireiter v3 guide](https://aireiter.com/blog/elevenlabs-eleven-v3-api-guide)
- Professional Voice Cloning requires a live voice verification ("voice CAPTCHA"), fine-tunes over a few hours, and needs Creator ($22) or above. Guides say you can clone only your own voice on your account. Sources disagree on whether Instant Voice Cloning has lighter verification. — [Proof News](https://www.proofnews.org/ai-tools-make-it-easy-to-clone-someones-voice-without-consent/), [techjacksolutions cloning](https://techjacksolutions.com/ai-tools/elevenlabs/elevenlabs-voice-cloning/), [aiproductivity.ai](https://aiproductivity.ai/guides/elevenlabs-voice-cloning-ethics/)
- Disclosure: guides recommend telling listeners that a voice is synthetic. This is best practice, not a confirmed platform rule. — [aiproductivity.ai](https://aiproductivity.ai/guides/elevenlabs-voice-cloning-ethics/)
- OpenAI `gpt-4o-mini-tts`: about $0.60 per million input tokens and about $12 per million audio-output tokens, estimated at about 1.5¢ per minute. One developer measured a 6.15x higher cost than estimated, and "speak slower" instructions use more output. It supports natural-language instructions for tone, pacing and emotion, with 13 voices (vs 9 for tts-1 and tts-1-hd), and a reported 2,000-character input limit. — [s-anand.net](https://www.s-anand.net/blog/openai-tts-cost/), [OpenAI community](https://community.openai.com/t/understanding-gpt-4o-mini-tts-pricing-input-characters-cost/1151816), [llmreference](https://www.llmreference.com/model/gpt-4o-mini-tts/openai-api)
- Colosseum guidance: the pitch video should run 3 minutes or less and cover the team, the problem, the audience, validation and the vision. "A clear and well-structured narrative is more valuable than professional video editing", and a voiceover over a slide deck is acceptable. Avoid flashy visuals with little substance. A **Technical Demo video (2–3 min)** is new this year and should cover how it's built: core features, stack, Solana integration, on-chain logic and architecture. It should not repeat the pitch. — [Colosseum blog: Perfecting Your Hackathon Submission](https://blog.colosseum.com/perfecting-your-hackathon-submission/)
- Judges watch and listen at the same time, so don't narrate what's already visible. — [AngelHack: 10 tips](https://angelhack.com/blog/10-tips-to-help-you-rock-your-next-hackathon-demo/)
- Fuzzy voice-overs undercut a project's perceived value. — [tips.hackathon.com](https://tips.hackathon.com/article/creating-the-best-demo-video-for-a-hackathon-what-to-know)

### Inferences
- **Opinionated split:**
  - **Pitch video:** the founder's real voice, recorded close to a decent USB or AirPods-Pro-class mic in a quiet room, then cleaned up. It signals team authenticity, and Colosseum explicitly asks for team background.
  - **Technical demo:** an ElevenLabs v3 voice is acceptable. The founder's PVC clone is better, because it keeps one consistent voice across both videos and lets agents regenerate narration whenever the script changes. That is the big win in a 24-hour pipeline, since re-timing narration to re-captured footage is free.
- **Disclose a clone.** Add a one-line end-card credit, e.g. "Narration: AI voice (ElevenLabs) cloned from [founder]'s own voice, with consent." This turns a potential "is this fake?" moment into a sign of transparency, which fits a protocol whose pitch is trust. PVC takes "a few hours" to fine-tune, so start it at hour 0 or fall back to Instant Voice Cloning.
- **Language:** for a Brazil-market product entering Solana plus the Superteam BR tracks, record the main video in English. Optionally produce a PT-BR version by regenerating the same script with the same cloned voice. ElevenLabs Multilingual v2 and v3 support Portuguese. I did not verify Brazilian versus European Portuguese accent quality in this session, so audition before committing.
- **Cost:** a 3-minute script is about 2,500–3,000 characters, so even several regenerations fit easily in the $22 Creator plan, and OpenAI TTS would cost under $0.25 total.
- **Local or offline options** (not researched here; from working knowledge): macOS `say` for scratch timing tracks, and open-weight TTS models running locally on Apple Silicon. Scratch-track TTS is useful for locking timing before the final voice is ready.
- Generate narration **per scene** (one file per beat) rather than one long file. Each clip's duration then becomes the scene's length in the timeline, and agents can regenerate one line without re-timing everything.

### Gaps
- I found no published evidence, surveys or judge statements on how hackathon judges react to AI voices versus founder voices. The recommendation above is inference.
- The official ElevenLabs pricing and plan pages were not fetched, and third-party figures conflict on API per-character rates and credit allotments.
- PT-BR accent quality for Eleven v3 and OpenAI voices was not verified from primary sources.
- I didn't check whether Colosseum's current rules address AI-generated narration.

---

## 5. Captions: Whisper for burned-in subtitles

### Takeaway
If narration comes from a script via TTS, you already have the exact text, so use forced alignment or Whisper only for timing, not transcription. Whisper on Apple Silicon (whisper.cpp with Metal, or MLX Whisper) can produce SRT locally, then you burn it in with ffmpeg's `subtitles` filter. HyperFrames also ships a captions workflow skill.

### Cited Findings
- whisper.cpp wrappers transcribe a video and write a sidecar `.srt`. They need CMake and ffmpeg (`brew install cmake ffmpeg`). `large-v3` is the most accurate and slowest model, `medium` the default. — [add-subs-to-videos on PyPI](https://pypi.org/project/add-subs-to-videos/)
- HyperFrames includes a captions creation workflow among its 21 skills. — [hyperframes README](https://github.com/heygen-com/hyperframes)
- demowright bakes captions into the recording. — [demowright](https://github.com/matte97p/demowright)

### Inferences
- **Commands (from working knowledge, verify locally):**
  - whisper.cpp: `brew install whisper-cpp`, download `ggml-large-v3-turbo.bin`, then `whisper-cli -m ggml-large-v3-turbo.bin -f narration.wav -osrt -ml 42 -l en`. `-ml` caps line length for readable burned-in captions. Input should be 16 kHz mono WAV: `ffmpeg -i vo.mp3 -ar 16000 -ac 1 vo.wav`.
  - Alternative: `pip install mlx-whisper` then `mlx_whisper vo.wav --model mlx-community/whisper-large-v3-turbo --output-format srt`.
  - ElevenLabs' TTS API can return character-level timestamps (the `with-timestamps` endpoint), and its Scribe STT is another option. Both would remove the Whisper step. Not verified this session.
- **Fix the transcript against the script.** Whisper will misspell domain terms such as "MUTAV", "PDA", "BRS" and "Selic". Pass `--prompt "MUTAV, Solana, PDA, BRS, Selic, devnet"` (whisper.cpp) and then diff the SRT text against the script.
- **Burn-in:** `ffmpeg -i video.mp4 -vf "subtitles=captions.srt:force_style='FontName=Inter,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,MarginV=40'" -c:a copy out.mp4`. ffmpeg needs libass, which Homebrew's ffmpeg includes. For branded animated captions, render them in HyperFrames or Remotion instead. Keep captions out of the bottom area where the app UI shows wallet toasts.

### Gaps
- My one search returned no primary sources on whisper.cpp Metal or large-v3-turbo, or on MLX Whisper's 2026 status. The commands above are from working knowledge and unverified.

---

## 6. Assembly: ffmpeg trimming, crossfades, ducking, burned-in subtitles, loudness

### Takeaway
Use ffmpeg as the final assembler: trim each segment to the same format, join with `xfade` and `acrossfade` (or plain concat with a few deliberate crossfades), duck music under voice with `sidechaincompress`, burn in subtitles, then run a two-pass `loudnorm` to about −14 LUFS integrated and −1 dBTP. Encode to H.264 high profile, yuv420p, 1080p, 30 or 60 fps, AAC 48 kHz, with `+faststart`.

### Cited Findings
- Two-pass `loudnorm`: pass 1 measures integrated loudness, true peak, LRA and threshold (`print_format=json`), and pass 2 applies linear gain using those values, avoiding dynamic distortion. — [dev.to loudnorm guide](https://dev.to/javidjamae/ffmpeg-loudnorm-filter-ebu-r128-loudness-normalization-guide-15d4)
- browser-use's `video-use` targets −14 LUFS, −1 dBTP and LRA 11 for social platforms, saying platforms normalize to about this level. — [instagit: video-use loudness](https://instagit.com/browser-use/video-use/social-media-loudness-normalization-targets/)
- Conflict: the dev.to guide uses `loudnorm=I=-16:TP=-1.5:LRA=11` for streaming, so −14 isn't universal. Neither source is YouTube's own documentation. — [dev.to](https://dev.to/javidjamae/ffmpeg-loudnorm-filter-ebu-r128-loudness-normalization-guide-15d4)

### Inferences
- **Recipes (from working knowledge, verify locally):**
  - Normalize every segment to one format: `ffmpeg -i in.webm -vf "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p" -c:v libx264 -crf 16 -preset slow -an seg.mp4`. On the M4, `-c:v h264_videotoolbox -b:v 12M` is much faster but less efficient per bit, so use it for drafts.
  - Trim: `ffmpeg -ss 00:00:03.2 -to 00:00:21.0 -i seg.mp4 -c:v libx264 -crf 16 trim.mp4`. Re-encode for frame-accurate cuts; `-c copy` cuts only on keyframes.
  - Crossfade two clips: `ffmpeg -i a.mp4 -i b.mp4 -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=<lenA-0.5>,format=yuv420p[v];[0:a][1:a]acrossfade=d=0.5[a]" -map "[v]" -map "[a]" out.mp4`. `offset` must be clip A's duration minus the fade.
  - Many segments without fades: `ffmpeg -f concat -safe 0 -i list.txt -c copy joined.mp4`, where `list.txt` has `file 'seg1.mp4'` lines. This needs identical codec parameters.
  - Ducking: `ffmpeg -i joined.mp4 -i vo.wav -i music.mp3 -filter_complex "[2:a]volume=0.25[m];[m][1:a]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck];[duck][1:a]amix=inputs=2:duration=first:normalize=0[mix]" -map 0:v -map "[mix]" -c:v copy -c:a aac -b:a 192k mixed.mp4`
  - Loudness pass 1: `ffmpeg -i mixed.mp4 -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null -`. Pass 2 feeds `measured_I`, `measured_TP`, `measured_LRA`, `measured_thresh` and `offset` back in with `linear=true`.
  - Final: `-c:v libx264 -profile:v high -pix_fmt yuv420p -r 30 -c:a aac -ar 48000 -b:a 192k -movflags +faststart final.mp4`, then check with `ffprobe` that duration is 180 s or less.
- **Agent-friendly structure:** keep a `timeline.json` (scenes, each with a clip file, in/out points and its narration file). Agents edit that, and one script compiles it to ffmpeg commands. Scene length = max(narration length + 0.4 s padding, the visual beat). This makes the final ≤3:00 limit a computed check, not a manual one.
- A narration-only demo is about −16 to −14 LUFS. Don't over-compress voice to hit −14. Over-loud audio gets turned down by YouTube anyway, while quiet audio is not boosted, which is why −14 is a sensible ceiling.

### Gaps
- I did not fetch YouTube's official loudness or recommended upload-encoding docs. The −14 LUFS figure comes from secondary sources and disagrees with a −16 recommendation elsewhere.

---

## 7. Hosting: YouTube unlisted vs Loom for hackathon submission

### Takeaway
Use YouTube unlisted. It has no length cap at this scale, plays reliably for anonymous judges, gives 1080p (or higher) playback, and is the de facto standard link format on hackathon platforms. Loom works, but its free tier has historically capped recording length, may show viewer-sign-in or branding prompts, and depends on Loom's player. Colosseum's published guidance doesn't name a required host.

### Cited Findings
- Colosseum's submission guidance doesn't specify YouTube or Loom; it specifies only length (pitch ≤3 min, technical demo 2–3 min). — [Colosseum blog](https://blog.colosseum.com/perfecting-your-hackathon-submission/)

### Inferences
- Upload the final MP4 to YouTube as Unlisted, at least an hour before the deadline: YouTube's HD transcode can lag behind SD right after upload. Open the link in a logged-out private window to verify it. Keep the MP4 as a backup, e.g. on Google Drive or as a GitHub release asset.
- Use Loom only for quick internal reviews during the 24 hours, not for the submission.
- Upload the captions SRT to YouTube as well as burning them in. Judges with sound off still get captions, and YouTube's auto-captions will mangle domain terms.

### Gaps
- I did not verify current Loom free-plan limits (length cap, sign-in walls) or the current Colosseum submission-form fields for video links from primary sources this session. Check the hackathon's submission form.

---

## 8. Recommended 24-hour toolchain (synthesis)

### Takeaway
Script → per-scene TTS → Playwright capture with click log and injected devnet wallet → code-driven zoom and cursor composite → HyperFrames title and architecture cards → Whisper/forced-alignment captions → ffmpeg assembly plus two-pass loudnorm → YouTube unlisted. All of it runs locally on the M4 except the TTS API. The fixed cost is about $22 (ElevenLabs Creator), and Remotion is free if the company is 3 people or fewer.

### Cited Findings
- Demo-as-code pipelines in the wild use exactly this split: Playwright records and logs clicks, then a second renderer adds the camera and cursor. — [programatic-demo](https://github.com/ashrafchowdury/programatic-demo), [demo-video-skill](https://github.com/surajshetty3416/demo-video-skill), [demowright](https://github.com/matte97p/demowright)
- HyperFrames ships Claude Code skills specifically for agent-authored video, including product-launch and captions workflows. — [hyperframes](https://github.com/heygen-com/hyperframes)
- Colosseum values narrative over polish, so the technical demo should emphasize Solana integration, on-chain logic and architecture. — [Colosseum blog](https://blog.colosseum.com/perfecting-your-hackathon-submission/)

### Inferences
- **Suggested time budget (24 h):**
  - h0–2: script plus storyboard (about 150 words per minute, so roughly 400 words for a 2:45 video). Start the founder PVC training.
  - h2–8: Playwright scenes with injected wallet, click log and pre-funded devnet state. Scratch TTS for timing.
  - h8–12: HyperFrames cards (title, problem, architecture, end card with AI-voice disclosure).
  - h12–16: final TTS per scene, then zoom and cursor composite.
  - h16–20: captions and ffmpeg assembly.
  - h20–24: review, fixes, upload, and a logged-out playback check.
- **Main pitfalls:**
  - Devnet RPC flakiness and airdrop limits mid-shoot: pre-fund, and use a dedicated RPC.
  - Wallet extension automation: inject a test wallet instead.
  - Over-zooming 1080p captures: capture at 2x or limit zoom.
  - Fanless M4 Air throttling during long Chromium renders: keep concurrency at 2–3, plug in power, and serialize renders.
  - Remotion's bundled ffmpeg missing filters: install system ffmpeg.
  - Whisper misspelling brand terms: prompt it, then diff against the script.
  - Narration describing what's on screen: add context instead.
  - Exceeding 3:00: compute the total from `timeline.json` and fail the build if it's over.
- **Agent division of labor** (keeping concurrent heavy processes low): one agent owns capture (Playwright), one owns cards (HyperFrames), and one owns audio (TTS plus captions). Only the assembly step runs heavy encodes, serialized at the end.

### Gaps
- No end-to-end benchmark of render times on an M4 MacBook Air for Remotion or HyperFrames was found.
