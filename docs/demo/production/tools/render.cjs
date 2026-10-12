#!/usr/bin/env node
/*
 * Renders the production kit's HTML cards and overlays to PNG with headless Chromium (Playwright).
 * One browser, one page, no server: files are opened with file:// URLs. Run from anywhere:
 *
 *   node docs/demo/production/tools/render.cjs stills
 *       All the committed PNGs (cards/*.png, overlays/*.png). Transparent where the HTML is.
 *   node docs/demo/production/tools/render.cjs timer --start <ms> --end <ms> [--fps 30] [--tail 4] [--every-frame] --out <dir>
 *       The elapsed timer as a PNG sequence plus an ffmpeg concat list; prints the encode command.
 *   node docs/demo/production/tools/render.cjs captions <file.srt> --out <dir>
 *       One transparent PNG per cue (overlays/caption.html) plus a concat list: a caption track
 *       for ffmpeg builds without libass (no `subtitles` filter).
 *   node docs/demo/production/tools/render.cjs seq <file.html> --ms 1600 [--fps 30] --out <dir>
 *       Frame sequence of an animated card or overlay (chapter titles, later wipe, close card).
 *
 * Playwright is resolved from $PLAYWRIGHT_FROM, the current directory, or the repo's app/ (installed there).
 * Exits on its own; no watch mode.
 */
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const KIT = path.resolve(__dirname, "..");
function loadPlaywright() {
  for (const base of [process.env.PLAYWRIGHT_FROM, process.cwd(), path.resolve(KIT, "../../../app"), path.resolve(process.cwd(), "app")]) {
    if (!base) continue;
    try { return require(require.resolve("playwright", { paths: [base] })); } catch {}
  }
  console.error("playwright not found: install app/ dependencies, or set PLAYWRIGHT_FROM to a directory whose node_modules has playwright");
  process.exit(1);
}

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(`--${name}`);
const url = (rel, query = "") => pathToFileURL(path.join(KIT, rel)).href + (query ? `?${query}` : "");
const pad = (n, w = 5) => String(n).padStart(w, "0");

const STILLS = [
  ["cards/chapter-1.html", "static", "cards/chapter-1.png"],
  ["cards/chapter-2.html", "static", "cards/chapter-2.png"],
  ["cards/chapter-3.html", "static", "cards/chapter-3.png"],
  ["cards/capital-card.html", "static", "cards/capital-card.png"],
  ["cards/close.html", "static", "cards/close.png"],
  ["overlays/coverage-refused-chip.html", "static", "overlays/coverage-refused-chip.png"],
  ["overlays/minimap.html", "static&active=1", "overlays/minimap-1-agency.png"],
  ["overlays/minimap.html", "static&active=2", "overlays/minimap-2-operator.png"],
  ["overlays/minimap.html", "static&active=3", "overlays/minimap-3-program.png"],
  ["overlays/minimap.html", "static&active=4", "overlays/minimap-4-reserve.png"],
  ["overlays/minimap.html", "static&active=5", "overlays/minimap-5-pix.png"],
  ["overlays/minimap.html", "static&legend", "overlays/minimap-legend.png"],
  ["overlays/honesty-label.html", "static&id=built", "overlays/honesty-built.png"],
  ["overlays/honesty-label.html", "static&id=agency", "overlays/honesty-agency.png"],
  ["overlays/honesty-label.html", "static&id=pix", "overlays/honesty-pix.png"],
  ["overlays/honesty-label.html", "static&id=fees", "overlays/honesty-fees.png"],
  ["overlays/later-wipe.html", "static", "overlays/later-wipe.png"],
  ["overlays/figure-callout.html", "static&id=share", "overlays/callout-share-value.png"],
  ["overlays/figure-callout.html", "static&id=inout", "overlays/callout-in-out.png"],
  ["overlays/timer.html", "static&start=0&end=42000&frame=600", "overlays/timer-sample-running.png"],
  ["overlays/timer.html", "static&start=0&end=42000&frame=1300", "overlays/timer-sample-settled.png"],
];

function parseSrt(text) {
  return text.replace(/\r/g, "").trim().split(/\n\n+/).map((block) => {
    const lines = block.split("\n");
    const [a, b] = lines[1].split(" --> ").map((t) => {
      const [h, m, rest] = t.trim().split(":"); const [s, ms] = rest.split(",");
      return +h * 3600 + +m * 60 + +s + +ms / 1000;
    });
    return { start: a, end: b, lines: lines.slice(2) };
  });
}

(async () => {
  if (!["stills", "timer", "captions", "seq"].includes(cmd)) {
    console.error("usage: render.cjs stills | timer --start <ms> --end <ms> --out <dir> | captions <srt> --out <dir> | seq <html> --ms <n> --out <dir>");
    process.exit(2);
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const shot = async (file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); await page.screenshot({ path: file, omitBackground: true }); };
  try {
    if (cmd === "stills") {
      for (const [html, q, png] of STILLS) {
        await page.goto(url(html, q));
        await page.evaluate(() => document.fonts.ready);
        await shot(path.join(KIT, png));
        console.log("wrote", png);
      }
    } else if (cmd === "timer") {
      const start = +opt("start"), end = +opt("end"), fps = +opt("fps", 30), tail = +opt("tail", 4);
      const out = path.resolve(opt("out", "timer-frames"));
      if (!(end >= start)) throw new Error("--start and --end (ms) are required, end >= start");
      await page.goto(url("overlays/timer.html", `static&start=${start}&end=${end}&fps=${fps}&frame=0`));
      await page.evaluate(() => document.fonts.ready);
      const dur = end - start;
      if (flag("every-frame")) {
        const total = Math.ceil((dur / 1000 + tail) * fps);
        for (let n = 0; n <= total; n++) { await page.evaluate((k) => window.setFrame(k), n); await shot(path.join(out, `timer_${pad(n)}.png`)); }
        console.log(`wrote ${total + 1} frames to ${out}`);
        console.log(`encode: ffmpeg -framerate ${fps} -i ${out}/timer_%05d.png -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le timer.mov`);
      } else {
        // The display changes once per second, so one PNG per second plus a concat list is exact and fast.
        const secs = Math.floor(dur / 1000);
        let list = "";
        for (let s = 0; s <= secs; s++) {
          await page.evaluate(([k, f]) => window.setFrame(k * f), [s, fps]);
          await shot(path.join(out, `timer_${pad(s)}.png`));
          const hold = s < secs ? 1 : (dur / 1000 - secs);
          if (hold > 0) list += `file 'timer_${pad(s)}.png'\nduration ${hold.toFixed(3)}\n`;
        }
        await page.evaluate((k) => window.setFrame(k), Math.ceil((dur / 1000) * fps) + 1);
        await shot(path.join(out, "timer_settled.png"));
        list += `file 'timer_settled.png'\nduration ${tail}\nfile 'timer_settled.png'\n`;
        fs.writeFileSync(path.join(out, "timer.concat.txt"), list);
        console.log(`wrote ${secs + 2} PNGs and timer.concat.txt to ${out} (elapsed ${dur} ms, settled hold ${tail} s)`);
        console.log(`encode: ffmpeg -f concat -i ${out}/timer.concat.txt -r ${fps} -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le timer.mov`);
      }
    } else if (cmd === "captions") {
      const srt = path.resolve(args[1]);
      const out = path.resolve(opt("out", "caption-frames"));
      const cues = parseSrt(fs.readFileSync(srt, "utf8"));
      await page.goto(url("overlays/caption.html", "static"));
      await page.evaluate(() => document.fonts.ready);
      await shot(path.join(out, "blank.png"));
      let t = 0, list = "";
      for (let i = 0; i < cues.length; i++) {
        const c = cues[i];
        if (c.start > t) list += `file 'blank.png'\nduration ${(c.start - t).toFixed(3)}\n`;
        const q = new URLSearchParams({ l1: c.lines[0] || "", l2: c.lines[1] || "" }).toString();
        await page.goto(url("overlays/caption.html", `static&${q}`));
        await page.evaluate(() => document.fonts.ready);
        const name = `cue_${pad(i + 1, 3)}.png`;
        await shot(path.join(out, name));
        list += `file '${name}'\nduration ${(c.end - c.start).toFixed(3)}\n`;
        t = c.end;
      }
      list += `file 'blank.png'\nduration 1\nfile 'blank.png'\n`;
      fs.writeFileSync(path.join(out, "captions.concat.txt"), list);
      console.log(`wrote ${cues.length} cues and captions.concat.txt to ${out}`);
      console.log(`encode: ffmpeg -f concat -i ${out}/captions.concat.txt -r 30 -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le captions.mov`);
    } else if (cmd === "seq") {
      const html = path.resolve(args[1]);
      const ms = +opt("ms", 1600), fps = +opt("fps", 30);
      const out = path.resolve(opt("out", "seq-frames"));
      await page.goto(pathToFileURL(html).href + (opt("query") ? `?${opt("query")}` : ""));
      await page.evaluate(() => document.fonts.ready);
      const total = Math.ceil((ms / 1000) * fps);
      for (let n = 0; n <= total; n++) {
        await page.evaluate((t) => window.seek(t), (n * 1000) / fps);
        await shot(path.join(out, `f_${pad(n)}.png`));
      }
      console.log(`wrote ${total + 1} frames to ${out}`);
      console.log(`encode: ffmpeg -framerate ${fps} -i ${out}/f_%05d.png -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le out.mov`);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
