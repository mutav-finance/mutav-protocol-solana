// Generates index.html for the MUTAV demo PRO CUT. Run from the project root: node tools/build.mjs
// Forked from ../roughcut/tools/build.mjs. One fixed browser window for every app shot; only the content inside moves.
//   window: left 249, top 40, 1422 wide; 40 px chrome; 1422x800 viewport (bottom edge at y=880).
//   y >= 880 is the caption-safe band: nothing but captions goes there.
// Inputs:
//   ../vo-script.final.md (else ../vo-script.md): VO line table (n | start | end | shot | line), the single source for VO placement + highlight timing
//   ../captions.en.srt: burned-in captions
//   assets/vo/$VOICE/line-NN.wav (VOICE=eleven default): per-line VO; falls back to the rough cut's temp VO if missing
//   assets/clips/*.mp4: video shots, cut by tools/cut.sh
//   assets/prints/*.full.png: 2x full-page prints (1440 CSS wide)
//   data/rects.json: highlight rectangles
// Overlays (receipts, timer, rail) are composited after the render by tools/overlay.sh.
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const dur = (f) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim();
const r2 = (x) => Math.round(x * 100) / 100;
// Line 24 switch: a regenerated line-24.wav (newer than 21:55 BRT) is placed with caption cue 31; otherwise neither, and the close tagline carries the words.
const L24 = `assets/vo/${process.env.VOICE || "eleven"}/line-24.wav`;
const LINE24_NEW = existsSync(L24); // v3 (Julia): the existing line-24.wav ("Brazil's on-chain rent guarantee.") is placed at 136.1 regardless of mtime, with caption cue 31
// v3: the live diagram (compositions/diagram.html) in the annotation slot. false = v3 fixes without it (v2 framing + chips on those shots).
const DIAGRAM = process.env.DIAGRAM ? process.env.DIAGRAM !== "0" : true;
console.error(`line 24: ${LINE24_NEW ? "placed at 136.1, cue 31 shown" : "missing -> not placed, cue 31 suppressed"} · diagram: ${DIAGRAM ? "on" : "off"}`);
let TOTAL = 0; // set below: last spoken word + 3.0 s end hold // v2: line 21 cut, close 6.0 s earlier (coordinator 2026-10-12)
const VOICE = process.env.VOICE || "eleven";

// ---------------------------------------------------------------- geometry
// Desktop layout (Julia, 2026-10-12, after the Rivool reference): headline band y 40-160, window 1600 wide, viewport bottom y = 880.
// v3 DIAGRAM layout (Julia): side by side. LEFT = the proof, one fixed window (viewport 1120x630, 16:9, bottom at y=880);
// RIGHT = the explanation column x 1312-1760, y 214-880: live diagram card on top, chips stacked below it (one at a time).
const WIN = DIAGRAM ? { l: 160, t: 214, w: 1120, chrome: 36 } : { l: 160, t: 176, w: 1600, chrome: 36 };
const VP = DIAGRAM ? { l: 160, t: 250, w: 1120, h: 630 } : { l: 160, t: 212, w: 1600, h: 668 };
const COL = { l: 1312, t: 214, w: 448 }, LD_K = r2(448 / 460 * 10000) / 10000, CHIP_Y = 214 + Math.round(260 * 448 / 460) + 24;
const KAT = VP.w / 1600; // cam "at" points were authored for the 1600-wide viewport
const PRINT_MIN = DIAGRAM ? 1.25 : 1; // prints: effective text scale ~0.97 of CSS size in the 1120 viewport
const VH = Math.round(1080 * (VP.w / 1920)); // video page height (900): takes fill the width and are cropped vertically by the camera
const VS = VP.w / 1920; // clip px -> viewport px
const PS = VP.w / 1440; // print CSS px -> viewport px
const RECTS = JSON.parse(readFileSync("data/rects.json", "utf8"));

// ---------------------------------------------------------------- VO script (single source)
const SKIP = new Set(["21", "22"]);
if (!LINE24_NEW) SKIP.add("24"); // v2: line 21 cut after legal review (Julia), line 22 + F14a removed
const scriptFile = existsSync("../vo-script.final.md") ? "../vo-script.final.md" : "../vo-script.md";
const LINES = readFileSync(scriptFile, "utf8").split("\n")
  .map((l) => l.match(/^\|\s*(\d+[a-z]?)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|([^|]*)\|\s*(.*?)\s*\|\s*$/))
  .filter(Boolean)
  .filter((m) => !SKIP.has(m[1])).map((m) => ({ n: /^\d+$/.test(m[1]) ? +m[1] : m[1], start: +m[2], end: +m[3], shot: m[4].trim(), text: m[5].replace(/‖\s*/g, "").replace(/\*/g, "") }));
const START_OVERRIDE = { 16: 81.2 }; // line 15 runs 3.87 s, so line 16 waits (coordinator, 2026-10-12)
LINES.forEach((l) => { if (START_OVERRIDE[l.n]) l.start = START_OVERRIDE[l.n]; });
const line = (n) => LINES.find((l) => l.n === n);
const wavOf = (n) => `assets/vo/${VOICE}/line-${String(n).padStart(2, "0")}.wav`;
const haveVO = LINES.length > 0 && LINES.every((l) => existsSync(wavOf(l.n)));

// vt(n, k): program time where the k-th phrase of VO line n starts (k = 0: line start; k >= 1: end of the k-th pause),
// from silence detection on the real wav, so highlights land on the word even after a regenerated read.
const vtCache = {};
function vt(n, k = 0) {
  const L = line(n);
  if (!k) return L.start;
  if (!haveVO) return r2(L.start + k * 1.6);
  const ends = vtCache[n] || [];
  return ends[k - 1] !== undefined ? r2(L.start + ends[k - 1]) : r2(L.start + k * 1.6);
}
// silencedetect logs to stderr, so read it via spawnSync.
for (const L of LINES) {
  if (!haveVO) break;
  const res = spawnSync("ffmpeg", ["-hide_banner", "-i", wavOf(L.n), "-af", "silencedetect=n=-35dB:d=0.18", "-f", "null", "-"]);
  vtCache[L.n] = [...res.stderr.toString().matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
}

// ---------------------------------------------------------------- audio
const audio = [];
if (haveVO) {
  for (const L of LINES) audio.push({ id: `line-${String(L.n).padStart(2, "0")}`, src: wavOf(L.n), start: L.start, d: r2(dur(wavOf(L.n))) });
} else {
  // fallback: rough-cut temp voice (v9 wording) at its rough-cut times
  for (const [id, start] of [["v01_open", 0.6], ["v02_agency", 10.1], ["v03_register", 17.8], ["v04_watch", 28.6], ["v05_rule", 39.6], ["v06_refused", 46.0],
    ["v07_claim", 57.6], ["v08_settled", 77.0], ["v09_safeguards", 87.4], ["v10_sim", 100.0], ["v11_verify", 127.7], ["v12_close", 130.2]])
    audio.push({ id, src: `assets/vo/${id}.wav`, start, d: r2(dur(`assets/vo/${id}.wav`)) });
}
TOTAL = r2(Math.max(...audio.map((a) => a.start + a.d)) + 3.0);
console.error(`root duration ${TOTAL}`);
const CLICK_AT = 46.3; // "Send anyway" click in f6a (src ~6.3 s)

// ---------------------------------------------------------------- captions (../captions.en.srt)
const tc = (s) => { const m = s.match(/(\d+):(\d+):(\d+),(\d+)/); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000; };
const caps = readFileSync("../captions.en.srt", "utf8").trim().split(/\r?\n\s*\r?\n/).map((b) => {
  const L = b.split(/\r?\n/); const [a, z] = L[1].split("-->");
  return { s: tc(a), e: tc(z), lines: L.slice(2).filter(Boolean) };
});
if (!LINE24_NEW) for (let i = caps.length - 1; i >= 0; i--) if (/^Creating the rental guarantee/.test(caps[i].lines[0] || "")) caps.splice(i, 1);
caps.forEach((c) => { if (/^What happens when Ana/.test(c.lines[0] || "")) c.s = line(11).start; }); // v3 QA: cue lands with VO line 11
caps.forEach((c, i) => { const n = caps[i + 1]; if (n && c.e > n.s) c.e = n.s; });

// ---------------------------------------------------------------- shots
const U = {
  reserve: "reserve.mutav.finance/reserve", coverage: "reserve.mutav.finance/reserve/coverage", operator: "reserve.mutav.finance/operator",
  claims: "reserve.mutav.finance/reserve/claims", risks: "reserve.mutav.finance/reserve/risks", verify: "reserve.mutav.finance/reserve/verify",
  x1: "explorer.solana.com/tx/Cz27Xu…RBzQa?cluster=devnet", x2: "explorer.solana.com/tx/3UtiNT…AESH9?cluster=devnet",
  x3: "explorer.solana.com/tx/24FTwR…U6mPiH?cluster=devnet", x4: "explorer.solana.com/tx/4PfaCZ…Scy9pm?cluster=devnet",
  agency: "MUTAV · Agency platform",
};
const TAB = { app: "Transparency · MUTAV pilot", op: "Operator · MUTAV pilot", xp: "Transaction | Solana Explorer", ag: "MUTAV — Agency platform" };
const vid = (id, start, d, o) => ({ id, kind: "video", start, d, ...o });
const prt = (id, start, d, img, o) => ({ id, kind: "print", start, d, img, ...o });

// Shot parameters: zoom = content push inside the window {from,to,ox,oy}; scroll = print stops [[t, cssY, dur]] (first = initial);
// hl = amber frame + dim elsewhere {r, t0, t1, color}; ul = amber underline; desat = grayscale everything but r; chip = label pinned to a rect.
// Line 17 v11 has one pause ("... showcase console. ‖ Next, a server wallet ..."): the safeguards card holds through the
// "Next" phrase, then the caps card is pushed for the closing "within limits the program enforces" (~95.1 on the 97.4 line).
const CAPS_AT = r2(line(17).start + 6.94); // v10.1 spliced read: "within limits..." starts 6.94 s in (silencedetect -30 dB) // "within limits the program enforces"
const BOT = { t: 0, s: 1, at: [800, 900] }, TOP = { t: 0, s: 1, at: [800, 0] }, SETTLE = { t: 0, s: 1.3, at: [0, 548] }; // settle shots: source y ~350-967 only (no "paid the landlord" copy above, no R$50,000 period cap below) // t is filled from the shot start
// QA5: the FREE CAPITAL card sits half out of the 1.3x settle frame; cover it fully (source px) so it is out, not cropped
const FREECAP = [1312, 770, 608, 172, "#101010"];
// v3 DIAGRAM: the 16:9 viewport shows more of the take above the settle frame; cover the "Records the PIX that paid the landlord" row (source px)
const LANDLORD = [0, 170, 1920, 165, "#101010"];
const SHOTS = [
  vid("f3a", 17.0, 7.4, { url: U.operator, tab: TAB.op, cam: [BOT],
    hl: [{ r: "newcover", t0: vt(5, 2) - 0.1, t1: 24.35 }],
    wchips: [{ x: 40, y: 22, t0: 21.0, t1: 23.3, text: "Built this hackathon: Solana program <b>·</b> operator console <b>·</b> reserve.mutav.finance" }] }),
  vid("f3b", 24.4, 2.5, { url: U.operator, tab: TAB.op, cam: [BOT], tap: { x: 360, y: 940 } }), // tap = "Explorer ↗" under Confirmed (source px)
  // Explorer flashes: page pre-scrolled to the one thing to read, one highlight, pushed in from the first frame.
  prt("x1", 26.9, 2.2, "x1-register", { url: U.x1, tab: TAB.xp, scroll: [[26.9, 1950]], hl: [{ r: "card", t0: 27.0, t1: 29.05 }],
    cam: [{ t: 26.9, s: 1.3, r: "card" }] }),
  vid("f5a", 29.1, DIAGRAM ? 9.7 : 7.9, { url: U.coverage, tab: TAB.app,
    cam: [{ t: 29.1, s: 1, at: [800, 900] }, { t: r2(line(7).start + 0.8), s: 1.3, r: "allocated", d: 0.8 }, { t: r2(line(7).start + 1.6), s: 1.36, r: "allocated", d: r2(40 - line(7).start - 1.6), e: "none" }],
    hl: [{ r: "allocated", t0: r2(line(7).start + 1.05), t1: 39.85 }],
    wchips: [{ x: 40, y: 22, t0: 29.9, t1: 33.5, text: "BRS = digital reais (Nora Finance)" }, { x: 40, y: 22, t0: r2(line(7).start + 1.8), t1: 36.8, text: "Each lease = an on-chain record of its cover <b>·</b> required coverage ≤ reserve" }] }),
  vid("f6a", 38.8, 7.7, { url: U.operator, tab: TAB.op,
    cam: [BOT, { t: r2(vt(8, 1) - 0.65), s: 1.15, r: "sentence", d: 0.6 }, { t: 45.6, s: 1, at: [800, 900], d: 0.6 }],
    hl: [{ r: "sentence", t0: vt(8, 1), t1: 45.55 }] }), // v3 audit: off before the 45.6 zoom-out // one box around the whole needs/holds sentence (fact-check 4)
  // The refusal: punch in on "Refused.", everything else drains to grey, held through the 3 s silence.
  vid("f6b", 46.5, 9.5, { url: U.operator, tab: TAB.op,
    cam: DIAGRAM ? [{ t: 46.5, s: 1, at: [800, 900] }] // v3: static while the refusal diagram holds the slot
      : [{ t: 46.5, s: 1, at: [800, 900] }, { t: r2(vt(9) - 0.1), s: 1.35, r: "refused", d: 0.5, e: "expo.out" }, { t: r2(vt(9) + 0.4), s: 1.42, r: "refused", d: r2(55 - vt(9) - 0.4), e: "none" }],
    desat: { r: "refused", t0: vt(9), t1: 55.5 }, hl: [{ r: "refused", t0: DIAGRAM ? vt(9) : r2(vt(9) + 0.45), t1: 55.45, color: "red", dim: false }], // v3 audit: not during the zoom-in
    tap: { x: 150, y: 989, red: true, t: 52.75 },
    wchips: [{ slot: DIAGRAM ? "tl" : "tr", t0: 49.0, t1: 52.6, text: "Refused, so every existing guarantee stays covered" }] }), // blink on the error code, then the on-chain popup // no Explorer link on the refusal: tap the InsufficientFreeCapital code that x2's log line shows
  vid("f7a", 57.0, 2.5, { url: U.operator, tab: TAB.op, cam: [BOT] }),
  vid("f7b", 59.5, 5.9, { url: U.operator, tab: TAB.op,
    cam: DIAGRAM ? [{ t: 59.5, s: 1, at: [800, 900] }] // v3: static while the claim diagram holds the slot
      : [{ t: 59.5, s: 1, at: [800, 900] }, { t: r2(vt(12) - 0.1), s: 1.3, r: "filed", d: 0.7 }, { t: r2(vt(12) + 0.6), s: 1.36, r: "filed", d: r2(65.4 - vt(12) - 0.6), e: "none" }],
    hl: [{ r: "filed", t0: vt(12) + 0.2, t1: 65.3 }],
    // QA2/QA3: opaque covers (source px) over stale retake copy: "Filing lowers the share price at once." x2 and Ana's "R$ 16,500.00 left"
    covers: [[1036, 686, 348, 34, "#0e1110"], [18, 932, 1090, 34, "#111111"], [482, 798, 246, 38, "#101010"]] }),
  // Line 13: framed on the Paid card only. The bound box above (Max per call R$15,000 sits 36 src px above the stale
  // "Left in the last 31 days ... of R$50,000" row) is pushed fully out of frame: content top = src y ~405 at 1.6x.
  // Chips live outside the cam (wchips, viewport px) in empty space, so they never scale up or cover a number.
  vid("f7c", 65.4, 3.2, { url: U.operator, tab: TAB.op,
    // 1.25x on the bottom of the take: visible source y >= ~439, so the stale bound row (src y 280-310) is never in frame (fact-check 2)
    cam: [{ t: 65.4, s: 1.25, at: [0, 900] }],
    hl: [{ r: "paid", t0: 65.5, t1: 68.55 }],
    wchips: [{ top: 140, t0: r2(vt(13, 1) - 0.1), text: "Reserve admin <b>·</b> Squads multisig" }], tap: { x: 1123, y: 495 } }), // v3: dropped with the diagram (it holds the slot; top-left would cover Paid)
  prt("x3", 68.6, 2.2, "x3-pay", { url: U.x3, tab: TAB.xp, scroll: [[68.6, 2479]], hl: [{ r: "card", t0: 68.7, t1: 70.75 }],
    cam: [{ t: 68.6, s: 1.3, r: "card" }] }),
  vid("f7d", 70.8, 1.9, { url: U.operator, tab: TAB.op, cam: [SETTLE], covers: DIAGRAM ? [FREECAP, LANDLORD] : [FREECAP] }),
  // v3: f7e re-cut 0.1 s earlier (src 77.9) so it runs >= 2.0 s. PIX chip: dropped with the diagram (its step 4 says it); without, 120 px lower, clear of the tx hash.
  vid("f7e", 72.7, 2.1, { url: U.operator, tab: TAB.op, cam: [SETTLE], covers: DIAGRAM ? [FREECAP, LANDLORD] : [FREECAP], hl: [{ r: "settled", t0: 73.7, t1: 74.75 }], wchips: DIAGRAM ? [] : [{ top: 144, t0: 73.1, text: "PIX to the agency <b>·</b> recorded on-chain" }], tap: { x: 1188, y: 410 } }),
  prt("x4", 74.8, 2.2, "x4-settle", { url: U.x4, tab: TAB.xp, scroll: [[74.8, 1796], [74.8, 1816, 2.2]], hl: [{ r: "card", t0: 74.85, t1: 76.95 }],
    cam: [{ t: 74.8, s: 1.3, r: "card" }, { t: 74.8, s: 1.38, r: "card", d: 2.2, e: "none" }] }),
  prt("claims", 77.0, 7.2, "v2-reserve-claims", { rk: "claims", url: U.claims, tab: TAB.app, scroll: [[77.0, 760]],
    // payoff: Ana's row wide (underlines run filed -> paid -> settled), push to "1m 05s" on "sixty-five seconds", hold through "Not 60 days", ease back to the row.
    cam: [{ t: 77, s: 1.35, r: "span" }], // v2: static (row + Ana chip + honesty chip all fit; no push)
    hl: [{ r: "row", t0: 77.1, t1: 84.15 }, { r: "dur", t0: 78.65, t1: 84.15 }],
    wchips: [{ x: 470, y: 548, t0: 80.75, text: "Test run <b>·</b> in operation, MUTAV checks each claim first" }],
    ul: [{ r: "filed", t0: 77.15 }, { r: "paid", t0: 77.65 }, { r: "settled", t0: 78.3 }],
    ana: { x: 548, y: 1108, t0: 77.4, t1: 80.3 } }), // Ana's chip (page CSS px), with an amber leader down to her row
  // v2 LIVE TRANSPARENCY TOUR (84.2-94.2): one tab per ~2 s, hard cut + URL swap, static frame, one highlight after settle.
  prt("t2", 84.2, 3.0, "v2-reserve-coverage", { url: U.coverage, tab: TAB.app, scroll: [[84.2, 1260]], cam: [{ t: 0, s: 1, at: [800, 0] }], hl: [{ r: "ana", t0: 84.8, t1: 87.15 }] }),
  prt("t3", 87.2, 3.0, "v2-reserve-claims", { url: U.claims, tab: TAB.app, scroll: [[87.2, 380]], cam: [{ t: 0, s: 1.25, at: [0, 0] }], hl: [{ r: "summary", t0: 87.8, t1: 90.15 }] }),
  prt("t5", 90.2, 3.0, "v2-reserve-verify", { tag: "Solana devnet · program GhPkq95…", url: U.verify, tab: TAB.app, scroll: [[90.2, 1100]], cam: [{ t: 0, s: 1, at: [800, 0] }], hl: [{ r: "payacct", t0: 90.8, t1: 93.15 }] }),
  // risks in 3 decisive beats on line 17: caps card -> payments account + guardian ("Next ...") -> safeguards card ("within limits ...")
  prt("risks", 93.2, 11.5, "reserve-risks", { minS: 1, // v3: the caps card is wider than the 1120 viewport at 1.25x: keep it whole
  url: U.risks, tab: TAB.app, scroll: [[93.2, 580], [r2(vt(17, 1) - 0.1), 1010, 0.6]],
    cam: [{ t: 93.2, s: 1, r: "caps" }, // v3: whole caps card + NOT FROZEN in frame
     { t: r2(vt(17, 1) - 0.1), s: 1, at: [711, 400], d: 0.6 }],
    hl: [{ r: "caps", t0: 93.9, t1: r2(vt(17, 1) - 0.15) }, { r: "payacct", t0: r2(vt(17, 1) + 0.6), t1: r2(CAPS_AT - 0.1) }, { r: "guardian", t0: r2(vt(17, 1) + 0.6), t1: r2(CAPS_AT - 0.1) }] }),
];
for (const s of SHOTS) if (s.cam && s.cam[0].t === 0) s.cam[0] = { ...s.cam[0], t: s.start };
// Rendered full-frame inserts (hard cut in/out; spine + headline hidden, captions stay). The intro replaces 0-17.7, dark grid to 18.0.
const INSERTS = [{ id: "intro", start: 0, d: 17.7 }, ...(DIAGRAM ? [] : [{ id: "insert-coverage", start: 37.0, d: 1.8 }]), // Julia: one gate visual — with the diagram on, the refusal mini-bar replaces the insert // v3 audit: cut before it turns red (spoils "Refused.")
  { id: "insert-claim", start: 58.0, d: 3.5 }]; // kept: the window cannot start earlier cleanly (final, 22:45) // Julia: one claim visual — the live diagram replaces the insert when on
// Camera grammar (Julia, 2026-10-12): the frame is STATIC while the viewer reads. One decisive move (<= 0.7 s) when the VO names
// the thing, then dead still. Slow continuous pushes/drifts (e: "none" holds, any move > 1.5 s) and slow scrolls are dropped here.
for (const s of SHOTS) {
  if (s.cam) s.cam = s.cam.filter((k, i) => !i || (k.e !== "none" && k.d <= 1.5)).map((k, i) => (i ? { ...k, d: Math.min(k.d, 0.7) } : k));
  if (s.scroll) s.scroll = s.scroll.filter(([, , d], i) => !i || d <= 0.7);
  if (s.zoom) s.zoom = { ...s.zoom, to: s.zoom.from }; // static framing, no slow zoom
}
for (const s of SHOTS) {
  if (s.kind === "video") { const d = dur(`assets/clips/${s.id}.mp4`); if (d + 0.05 < s.d) throw new Error(`${s.id}: clip ${d}s < slot ${s.d}s`); }
}
// Navigation between pages in the one window: a URL change gets a quick content slide (expo out, XF s) instead of a hard cut.
// Incoming prints enter early, over the last XF s of the outgoing shot (total timing unchanged); incoming videos slide in at
// their start over the outgoing print (except f7a, where the chapter-2 card bridges a hard cut), which is held XF s longer underneath. Same-URL cuts (one continuous recording) stay hard.
const CH3_AT = 106.7, CLOSE_AT = 129.6; // close card runs to the end (v3: 11.37 s, line 24 placed)
// ch3 in two parts: 0-16.6 s of the clip at 1x (through line 20), then the finale card (clip 23.0 s -> end) at 0.8x so it builds right under the end of line 20 and holds to the close.
const CH3B_AT = 123.3, CH3B_MS = 23.0, CH3B_RATE = 0.8;
const XF = 0.35;
const UI_FROM = 20.0; // ch1 card (18.0-20.4) is opaque; the window + F3 appear on its hard cut out
for (const [i, s] of SHOTS.entries()) {
  // v2: every page change is a HARD CUT (no crossfades, no double exposure); no UI under the chapter cards.
  s.vis = Math.max(s.start, UI_FROM); s.hideAt = r2(s.start + s.d);
  if (s.vis < 58.0 && s.hideAt > 56.0) s.hideAt = Math.min(s.hideAt, 56.0);
  if (s.vis >= 56.0 && s.vis < 61.5) s.vis = 61.5;
  if (s.vis >= s.hideAt) s.skip = true;
  const p = SHOTS[i - 1];
  if (!p || r2(p.start + p.d) !== s.start || p.url === s.url) continue;
  if (p.tap) p.tap.t = r2(s.vis - 0.25); // one 0.2 s amber blink on the link, then the hard cut // one 0.2 s amber blink on the link, then the page crossfades in // cause -> effect: tap the link, then the Explorer page slides in
}
for (let i = SHOTS.length - 1; i >= 0; i--) if (SHOTS[i].skip) SHOTS.splice(i, 1);
const SAFE = { start: r2(CAPS_AT), end: 104.7 }; // safeguards card during "Next, it runs inside the agency platform's backend, automatically"
const WINDOWS = [{ id: "wa", start: UI_FROM, end: 56.0, fade: 0.01 }, { id: "wb", start: 61.5, end: 104.7, fade: 0.01 }];
const DEVNET = [[2.4, 10], [17, 98], [127.6, 129.6]]; // scale note on devnet shots (left margin, beside the window)
const BADGE = [[18.0, 98], [127.6, 129.6]]; // "Hackathon build" badge, right side of the window chrome
// Story spine: the top band above the window (y 8-34), one step per beat, switched on the VO line that introduces it.
const STEPS = [["Lease on-chain", line(5).start], ["Coverage checked", line(6).start], ["One more refused", line(8).start], ["Ana misses rent", line(11).start],
  ["Claim paid", line(13).start], ["Settled · 1m 05s", 73.2] // v3 audit: switches when Settled appears in f7e
 , ["Reserve grows", 999]];
const REFUSED_AT = vt(9);
// Progress indicator (replaces the 7-label spine): one static clip per step span, split at the refusal and around the inserts/cards.
const PROG = (() => {
  const cuts = [UI_FROM, ...STEPS.slice(0, 6).map(([, t]) => t), REFUSED_AT, 104.7].filter((t) => t >= UI_FROM).sort((a, b) => a - b);
  const holes = [[37.0, 38.8], [56.0, 61.5]];
  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    let a = cuts[i], b = cuts[i + 1]; if (b - a < 0.05) continue;
    let k = -1; STEPS.forEach(([, t], j) => { if (t <= a + 1e-6) k = j; }); if (k < 0) k = 0;
    const segs = [[a, b]];
    for (const [h0, h1] of holes) for (let j = segs.length - 1; j >= 0; j--) { const [x, y] = segs[j]; if (h1 <= x || h0 >= y) continue; segs.splice(j, 1, ...[[x, h0], [h1, y]].filter(([p, q]) => q - p > 0.05)); }
    for (const [x, y] of segs) out.push({ a: r2(x), b: r2(y), k });
  }
  return out;
})();
// Draau's edited stills (mutav/marketing/insta_img, used on the landing page): framed portrait panels, never above native size,
// 1.00 -> 1.04 drift + stage grain, colour as edited. All above y = 880 and clear of the chapter titles.
const PANELS = [
  { id: "pn-ch1", img: "2", w: 564, h: 846, start: 18.0, end: 20.6, x: 1429, y: 196, H: 460 },
  ];
const CARDS = { lt1: { start: 17.4, d: 2.6 }, // v3 audit: crossfades straight off the intro's last frame (no empty grid)
  lt2: { start: 56.0, d: 2.0 }, lt3: { start: 104.7, d: 2.0 } }; // v2: text-only on the dark grid, same length + in/out
const LT = [
  { id: "lt1", start: 18.0, kq: 18.5, n: 1, kicker: "Chapter 1 of 3 · MUTAV protocol · hackathon build", title: 'Programmable, <span class="amber">transparent</span> reserve', q: "Is every guarantee really backed?", qAt: 18.6 },
  { id: "lt2", start: 55.5, n: 2, kicker: "Chapter 2 of 3 · MUTAV on Solana", title: 'Programmable payments, settled in <span class="amber">minutes</span>', q: "What happens when Ana pays late?", qAt: line(11).start },
  { id: "lt3", start: 98.0, n: 3, kicker: "Chapter 3 of 3 · local simulation · accelerated clock", title: 'Capital <span class="amber">efficiency</span>', q: "How does the reserve grow?", qAt: line(18).start },
];

// ---------------------------------------------------------------- per-shot DOM + timeline
const px = (n) => `${Math.round(n * 10) / 10}px`;
function rectOf(s, name) {
  const key = s.kind === "print" ? s.img.replace(/-.*$/, "") : s.id;
  const map = { x1: "x1", x2: "x2", x3: "x3", x4: "x4", reserve: s.id }; // prints are keyed by shot id
  const set = RECTS[s.kind === "print" ? s.id : s.id] || RECTS[map[key]];
  const r = set?.[name]; if (!r) throw new Error(`rect ${s.id}.${name} missing`);
  const k = s.kind === "print" ? PS : VS;
  return { x: r[0] * k, y: r[1] * k, w: r[2] * k, h: r[3] * k };
}
const PAD = 6;
const FAV_X = WIN.l + 92 + 11 + 5.5, FAV_Y = WIN.t + 6 + 8 + 5.5; // tab favicon centre (opener mark lands here)
const pageSize = (s) => s.kind === "print"
  ? (() => { const m = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", `assets/prints/${s.img}.full.png`]).toString().match(/pixelHeight: (\d+)/); return { w: VP.w, h: Math.round((+m[1] / 2) * PS) }; })()
  : { w: VP.w, h: VH };

function camAt(s, k) {
  let cx, cy;
  if (k.r) { const R = rectOf(s, k.r); let sc = 0; for (const [t, y] of s.scroll || []) if (t <= k.t + 1e-6) sc = y; cx = R.x + R.w / 2; cy = R.y - sc * PS + R.h / 2; } else [cx, cy] = [k.at[0] * KAT, k.at[1] * KAT];
  cx += (k.dx || 0) * KAT; cy += (k.dy || 0) * KAT;
  const H = s.kind === "video" ? VH : VP.h, z = s.kind === "print" ? Math.max(k.s, s.minS ?? PRINT_MIN) : k.s;
  return { s: z, x: r2(Math.min(0, Math.max(VP.w * (1 - z), VP.w / 2 - cx * z))), y: r2(Math.min(0, Math.max(VP.h - H * z, VP.h / 2 - cy * z))) };
}
// Ana: one chip design everywhere, in one slot (viewport top-right), until F8 where it lands above her row.
// v3 live diagram instances (step times in program seconds; converted to clip-relative in the host). Empty when DIAGRAM is off.
const LD = !DIAGRAM ? [] : [
  { id: "ld-reg", mode: "register", start: 24.0, end: 26.9, steps: [24.4] }, // "Confirmed · MTV-PF-0100" appears with f3b (24.4); out on the x1 cut
  { id: "ld-ref", mode: "refusal", start: 46.3, end: 52.95, steps: [vt(9)] }, // click -> "Refused" (VO line 9); out before the on-chain popup
  // claim: Filed, "our operator verifies it" (line 12, ~1.5 s in), Paid card (f7c), PIX recorded on-chain (f7e confirming -> settled), agency pays landlord
  { id: "ld-claim", mode: "claim", start: 61.5, end: 77.0, steps: [61.9, 62.9, 65.6, 72.9, 73.7] }, // side-by-side: it never overlays the window, so it holds through the x3/x4 flashes
];
const ANA_TXT = "Ana <b>·</b> tenant <b>·</b> lease MTV-PF-0100";
const ANA_W = 476, ANA_H = 44, ANA_SLOT = { x: VP.l + VP.w - 24 - ANA_W, y: VP.t + 24 };
let ANA_F8 = null;
const dom = [], js = [], colDom = [];
for (const s of SHOTS) {
  const end = r2(s.start + s.d);
  const z = s.zoom || { from: 1, to: 1, ox: 50, oy: 50 };
  let inner = "";
  if (s.kind === "video") {
    // v2: the video clip only exists while its shot is on screen (a timed <video> overrides its hidden wrap: v1 ghosting under the cards)
    inner = `<video id="${s.id}" class="vid" src="assets/clips/${s.id}.mp4" muted playsinline data-start="${s.vis}" data-duration="${r2(s.hideAt - s.vis)}"${s.vis > s.start ? ` data-media-start="${r2(s.vis - s.start)}"` : ""} data-track-index="2"></video>`;
  } else if (s.kind === "print") {
    inner = `<img class="print" src="assets/prints/${s.img}.full.png" alt="" data-layout-allow-overflow />`;
  } else {
    inner = `<div id="ag-in">
            <div class="agc" style="left:0;top:0;width:296px;height:700px;background-position:0 0"></div>
            <div class="agf" style="left:0;top:700px;width:296px;height:151px;background:#fff"></div>
            <div class="agc" style="left:296px;top:0;width:1216px;height:57px;background-position:-296px 0"></div>
            <div class="agc" style="left:296px;top:57px;width:1216px;height:193px;background-position:-296px -57px"></div>
            <div class="agc lc" style="left:296px;top:250px;width:1216px;height:510px;background-position:-296px -170px"></div>
            <div class="agf" style="left:296px;top:760px;width:1216px;height:91px;background:#f7f6f3"></div>
          </div>`;
  }
  const P = pageSize(s);
  const settle = (t) => { for (const k of (s.cam || []).slice(1)) if (t >= k.t - 0.05 && t < k.t + k.d) t = r2(k.t + k.d + 0.05); return t; };
  const hls = (s.hl || []).map((h, k) => ({ ...h, k, t0: h.color === "red" ? h.t0 : settle(h.t0), R: rectOf(s, h.r) }));
  const dimmed = hls.filter((h) => h.dim !== false);
  let over = "";
  if (dimmed.length) {
    over += `<svg class="dim" width="${P.w}" height="${P.h}" viewBox="0 0 ${P.w} ${P.h}" data-layout-allow-overflow><defs><mask id="m-${s.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${P.w}" height="${P.h}"><rect width="${P.w}" height="${P.h}" fill="#fff"/>${dimmed.map((h) => `<rect id="mh-${s.id}-${h.k}" x="${r2(h.R.x - PAD)}" y="${r2(h.R.y - PAD)}" width="${r2(h.R.w + 2 * PAD)}" height="${r2(h.R.h + 2 * PAD)}" rx="7" fill="#000" style="opacity:0"/>`).join("")}</mask></defs><rect id="dm-${s.id}" width="${P.w}" height="${P.h}" fill="#050607" fill-opacity=".3" mask="url(#m-${s.id})" style="opacity:0"/></svg>`;
  }
  if (s.desat) {
    const R = rectOf(s, s.desat.r); const x0 = R.x - PAD, y0 = R.y - PAD, x1 = R.x + R.w + PAD, y1 = R.y + R.h + PAD;
    over += `<div class="desat" id="ds-${s.id}"><i style="left:0;top:0;width:${P.w}px;height:${px(y0)}"></i><i style="left:0;top:${px(y1)};width:${P.w}px;height:${px(P.h - y1)}"></i><i style="left:0;top:${px(y0)};width:${px(x0)};height:${px(y1 - y0)}"></i><i style="left:${px(x1)};top:${px(y0)};width:${px(P.w - x1)};height:${px(y1 - y0)}"></i></div>`;
  }
  over += hls.map((h) => `<div class="hl${h.color === "red" ? " red" : ""}" id="h-${s.id}-${h.k}" style="left:${px(h.R.x - PAD)};top:${px(h.R.y - PAD)};width:${px(h.R.w + 2 * PAD)};height:${px(h.R.h + 2 * PAD)}"></div>`).join("");
  over += (s.ul || []).map((u, k) => { const R = rectOf(s, u.r); return `<div class="ul" id="u-${s.id}-${k}" style="left:${px(R.x)};top:${px(R.y + R.h + 3)};width:${px(R.w)}"></div>`; }).join("");
  (s.chips || []).forEach((c, k) => { over += `<div class="chip" id="chip-${s.id}-${k}" style="left:${px(c.x)};top:${px(c.y)}"><i></i><span>${c.text}</span></div>`; });
  const wchHTML = (s.wchips || []).map((c, k) => DIAGRAM ? `<div class="chip col" id="wchip-${s.id}-${k}" style="left:${COL.l}px;top:${CHIP_Y}px"><i></i><span>${c.text}</span></div>`
    : `<div class="chip" id="wchip-${s.id}-${k}" style="${c.slot === "tl" ? "left" : "right"}:24px;top:${c.top ?? 24}px"><i></i><span>${c.text}</span></div>`).join("");
  const wch = DIAGRAM ? "" : wchHTML; if (DIAGRAM && wchHTML) colDom.push(`      ${wchHTML}`); // one annotation slot
  let tapDom = "";
  (s.covers || []).forEach(([x, y, w, h, c]) => { over += `<div class="cover" style="left:${px(x * VS)};top:${px(y * VS)};width:${px(w * VS)};height:${px(h * VS)};background:${c}"></div>`; });
  if (s.tap) over += `<div class="tap${s.tap.red ? " red" : ""}" id="tap-${s.id}" style="left:${px(s.tap.x * VS - 70)};top:${px(s.tap.y * VS - 16)}"></div>`;
  if (s.ana) {
    const c = camAt(s, s.cam[0]), sc = s.scroll[0][1] * PS, k = 1 / c.s;
    const ax = s.ana.x * PS, ay = s.ana.y * PS, rowTop = (rectOf(s, "row").y - PAD);
    over += `<div class="chip ana" id="ana-pg" style="left:${px(ax)};top:${px(ay)};transform:scale(${r2(k * 1000) / 1000})"><i></i><span>${ANA_TXT}</span></div>`;
    over += `<div class="lead" id="ana-lead" style="left:${px(ax + 2 * k)};top:${px(ay + ANA_H * k)};height:${px(rowTop - ay - ANA_H * k)}"></div>`;
    ANA_F8 = { x: r2(VP.l + c.x + ax * c.s), y: r2(VP.t + c.y + (ay - sc) * c.s), t: s.vis, start: s.start };
  }
  if (s.chip) { const R = rectOf(s, s.chip.r); over += `<div class="chip" id="chip-${s.id}" style="left:${px(R.x - 16)};top:${px(R.y + R.h / 2 - 21)}"><i></i><span>${s.chip.text}</span></div>`; }

  dom.push(`      <div class="wrap" id="w-${s.id}"><div class="cam" id="c-${s.id}" style="transform-origin:${s.cam ? "0 0" : `${z.ox}% ${z.oy}%`}"><div class="page" id="p-${s.id}" style="height:${P.h}px">
          ${inner}
          ${over}
      </div></div>${wch}${tapDom}</div>`);

  js.push(`      // ${s.id}`);
  js.push(`      tl.set("#w-${s.id}", { visibility: "visible" }, ${s.vis});`);
  js.push(`      tl.set("#w-${s.id}", { visibility: "hidden" }, ${s.hideAt});`);
  if (s.enter) {
    js.push(`      tl.fromTo("#w-${s.id}", { opacity: ${s.enter.o} }, { opacity: 1, duration: ${XF}, ease: "power2.inOut" }, ${s.enter.at});`);
  }
  if (s.tap) {
    js.push(`      tl.fromTo("#tap-${s.id}", { opacity: 0 }, { opacity: 1, duration: 0.06, ease: "none" }, ${s.tap.t});`);
    js.push(`      tl.to("#tap-${s.id}", { opacity: 0, duration: 0.1, ease: "power1.in" }, ${r2(s.tap.t + 0.1)});`);
  }
  if (s.ana) {
    const push = s.cam[1], back = s.cam[s.cam.length - 1];
    js.push(`      tl.fromTo(["#ana-pg", "#ana-lead"], { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power1.out" }, ${s.ana.t0});`);
    js.push(`      tl.to(["#ana-pg", "#ana-lead"], { opacity: 0, duration: 0.25, ease: "power1.in" }, ${s.ana.t1});`); // only once the camera is back on her row (never clipped)
  }
  if (s.cam) {
    // cam keys {t, s, r|at, dx, dy, d, e}: centre rect r (or viewport point at) at scale s, clamped so the page always fills the viewport.
    const pos = (k) => { const c = camAt(s, k); return `scale: ${c.s}, x: ${c.x}, y: ${c.y}`; };
    const [k0, ...ks] = s.cam;
    js.push(`      tl.set("#c-${s.id}", { ${pos(k0)} }, ${s.vis});`);
    for (const k of ks) js.push(`      tl.to("#c-${s.id}", { ${pos(k)}, duration: ${k.d}, ease: "${k.e || "power3.inOut"}" }, ${k.t});`);
  } else js.push(`      tl.set("#c-${s.id}", { scale: ${z.from} }, ${s.vis});`);
  if (s.scroll) {
    const [first, ...rest] = s.scroll;
    js.push(`      tl.set("#p-${s.id}", { y: ${-r2(first[1] * PS)} }, ${s.vis});`);
    for (const [t, y, d] of rest) js.push(`      tl.to("#p-${s.id}", { y: ${-r2(y * PS)}, duration: ${d}, ease: "${d > 1.5 ? "none" : "power3.inOut"}" }, ${t});`);
  }
  for (const h of hls) {
    const t1 = Math.min(h.t1, end - 0.02);
    js.push(`      tl.fromTo("#h-${s.id}-${h.k}", { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.out" }, ${r2(h.t0)});`);
    js.push(`      tl.to("#h-${s.id}-${h.k}", { opacity: 0, duration: 0.2, ease: "power2.in" }, ${r2(t1 - 0.2)});`);
    if (h.dim !== false) {
      js.push(`      tl.fromTo("#mh-${s.id}-${h.k}", { opacity: 0 }, { opacity: 1, duration: 0.25 }, ${r2(h.t0)});`);
      js.push(`      tl.to("#mh-${s.id}-${h.k}", { opacity: 0, duration: 0.2 }, ${r2(t1 - 0.2)});`);
    }
  }
  if (dimmed.length) { // dim layer on over the union of highlight intervals
    const iv = dimmed.map((h) => [h.t0, Math.min(h.t1, end - 0.02)]).sort((a, b) => a[0] - b[0]);
    const merged = []; for (const [a, b] of iv) { const m = merged[merged.length - 1]; if (m && a <= m[1] + 0.3) m[1] = Math.max(m[1], b); else merged.push([a, b]); }
    for (const [i, [a, b]] of merged.entries()) {
      js.push(`      tl.fromTo("#dm-${s.id}", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out"${i ? ", immediateRender: false" : ""} }, ${r2(a)});`);
      js.push(`      tl.to("#dm-${s.id}", { opacity: 0, duration: 0.2, ease: "power2.in" }, ${r2(b - 0.2)});`);
    }
  }
  (s.ul || []).forEach((u, k) => js.push(`      tl.fromTo("#u-${s.id}-${k}", { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: "expo.out" }, ${r2(u.t0)});`));
  (s.chips || []).forEach((c, k) => js.push(`      tl.fromTo("#chip-${s.id}-${k}", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out" }, ${r2(s.start + (c.delay ?? 0.3))});`));
  (s.wchips || []).forEach((c, k) => { js.push(`      tl.fromTo("#wchip-${s.id}-${k}", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power1.out" }, ${r2(c.t0 ?? s.start + (c.delay ?? 0.3))});`);
    const nx = SHOTS[SHOTS.indexOf(s) + 1]; js.push(`      tl.to("#wchip-${s.id}-${k}", { opacity: 0, duration: 0.25, ease: "power1.in" }, ${r2(c.t1 ?? Math.min(nx ? nx.vis : end, end) - 0.6)});`); });
  if (s.desat) js.push(`      tl.fromTo("#ds-${s.id}", { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power2.out" }, ${r2(s.desat.t0)});`);
}

// window chrome instances (persist across consecutive app shots; URL + tab text swap per shot)
const lock = `<svg class="lock" viewBox="0 0 12 14" aria-hidden="true"><rect x="1" y="6" width="10" height="7.5" rx="1.6" fill="currentColor"/><path d="M3.3 6V4.3a2.7 2.7 0 0 1 5.4 0V6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;
const winDom = WINDOWS.map((w) => {
  const inside = SHOTS.filter((s) => s.hideAt > w.start && s.vis < w.end);
  return `      <div id="${w.id}" class="clip" data-start="${w.start}" data-duration="${r2(w.end - w.start)}" data-track-index="1">
        <div class="win" id="${w.id}-win">
          <div class="win-shadow"></div>
          <div class="win-body">
            <div class="chrome">
              <div class="lights"><i></i><i></i><i></i></div>
              <div class="tab"><div class="fav"></div>${inside.map((s) => `<span class="tabt" id="${w.id}-t-${s.id}">${s.tab}</span>`).join("")}</div>
              <div class="addr">${lock}${inside.map((s) => `<span class="url" id="${w.id}-u-${s.id}">${s.url}</span>`).join("")}</div>
            </div>
            <div class="vpbg"></div>
          </div>
        </div>
      </div>`;
}).join("\n");
for (const w of WINDOWS) {
  js.push(`      // window ${w.id}`);
  js.push(`      tl.fromTo("#${w.id}-win", { opacity: 0 }, { opacity: 1, duration: ${w.fade ?? 0.3}, ease: "power2.out" }, ${w.fadeAt ?? w.start});`);
  const ins = SHOTS.filter((s) => s.hideAt > w.start && s.vis < w.end);
  ins.forEach((s, i) => {
    const nx = ins[i + 1], off = nx ? nx.vis : r2(s.start + s.d);
    js.push(`      tl.set(["#${w.id}-u-${s.id}", "#${w.id}-t-${s.id}"], { opacity: 1 }, ${s.vis});`);
    if (off < w.end) js.push(`      tl.set(["#${w.id}-u-${s.id}", "#${w.id}-t-${s.id}"], { opacity: 0 }, ${off});`);
  });
}

// ---- story spine markup: four stacked label layers per step (future / current / past / refused), crossfaded by opacity
const MK_SVG = { p: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"/></svg>`,
  x: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"/></svg>` };
const spineHTML = (id, init) => STEPS.map(([label], k) => {
  const ref = k === 2, st = init[k];
  const L = (cls, mark, on) => `<span class="L ${cls}" id="${id}-${cls}${k}"${on ? ' style="opacity:1"' : ""}><i class="mk">${mark}</i>${label}</span>`;
  return `${k ? `<i class="cn"></i>` : ""}<div class="st">${L("f", "", st === "f")}${L("c", "", st === "c")}${L("p", ref ? MK_SVG.x : MK_SVG.p, st === "p")}${ref ? L("r", "", false) : ""}<b class="bar" id="${id}-bar${k}"></b>${ref ? `<b class="bar red" id="${id}-rbar${k}"></b>` : ""}</div>`;
}).join("");
const spineJS = [];
{
  const o = (sel, a, b, t, d = 0.3) => spineJS.push(`      tl.fromTo("${sel}", { opacity: ${a} }, { opacity: ${b}, duration: ${d}, ease: "power2.out", immediateRender: false }, ${r2(t)});`);
  STEPS.slice(0, 6).forEach(([, T], k) => {
    o(`#spA-c${k}`, 0, 1, T, 0.4); o(`#spA-f${k}`, 1, 0, T, 0.4);
    const next = STEPS[k + 1][1];
    const endT = k === 5 ? 999 : next;
    if (endT < 98) {
      const cur = k === 2 ? "r" : "c";
      o(`#spA-${cur}${k}`, 1, 0, endT, 0.25); o(`#spA-p${k}`, 0, 1, endT, 0.3); o(`#spA-${k === 2 ? "rbar" : "bar"}${k}`, 1, 0, endT, 0.25);
    }
  });
  // the refusal: current step turns error red on "Refused."
  o("#spA-c2", 1, 0, REFUSED_AT, 0.15); o("#spA-r2", 0, 1, REFUSED_AT, 0.15); o("#spA-bar2", 1, 0, REFUSED_AT, 0.15); o("#spA-rbar2", 0, 1, REFUSED_AT, 0.15);
  // verify shot: every step done, then the last one lights
  spineJS.push(`      tl.fromTo("#spine-a .sp", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out" }, 20.5);`);
  spineJS.push(`      tl.to("#spine-a .sp", { opacity: 0, duration: 0.25, ease: "power2.in" }, 104.4);`);
  for (const ins of [{ start: 37.0, d: 1.8 }, { start: 56.0, d: 5.5 }]) { spineJS.push(`      tl.set("#spA-row", { opacity: 0 }, ${ins.start});`); spineJS.push(`      tl.set("#spA-row", { opacity: 1 }, ${r2(ins.start + ins.d)});`); }
}
// Operator console label: left margin, on every /operator run (F3, F6, F7); leaves as the next page starts to slide in.
const OPS = [{ start: 21.1, end: 23.3 }, { start: 40.5, end: 45.7 }, { start: 59.9, end: 61.8 },
  { start: line(17).start + 0.4, end: r2(vt(17, 1) - 0.1) }]; // last: F8b, "Today, our team signs each step from a showcase console."
// One label chip at a time (plus the badge): each fades in >= 0.5 s after its shot settles and fades out before the next cut.
// Headline band (y 40-160): one 1-line headline per beat (key phrase amber), fades in after the shot settles; tag top-right.
const HEAD = [
  [20.0, 26.9, "Ana's lease goes *on-chain.*"], [26.9, 29.1, "Verified on *Solana Explorer.*"], [29.1, 37.0, "Anyone can *check the reserve.*"],
  [38.8, REFUSED_AT, "Every lease must *fit the reserve.*"], [REFUSED_AT, 53.0, "One more lease? *Refused.*"], [53.0, 56.0, "The program said no, *on-chain.*"],
  [61.5, 77.0, "The agency files. *The reserve pays.*"], [77.0, 84.2, "Filed to settled: *1m 05s.*"], [84.2, 93.2, "It's all *public, live.*"], [93.2, 104.7, "Today a console. *Next, our backend.*"],
];
const TAGS = { op: "Operator console · hackathon showcase · moves into our existing product", xp: "Solana Explorer · devnet", app: "Hackathon build · MUTAV protocol on Solana" };
const tagOf = (s) => s.tag || (s.tab === TAB.op ? TAGS.op : s.tab === TAB.xp ? TAGS.xp : TAGS.app);
const ANA_CLIPS = [{ id: "ana1", start: 23.6, end: 26.0 }, { id: "ana2", start: r2(vt(12) + 0.5), end: r2(vt(13, 1) - 0.15) }, { id: "ana3", start: 70.9, end: 72.85 }];

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>MUTAV demo pro cut</title>
    <!-- GENERATED by tools/build.mjs: edit the generator (and data/rects.json), not this file. VO: ${haveVO ? `assets/vo/${VOICE}` : "rough-cut temp fallback"}; script: ${scriptFile}. -->
    <script src="vendor/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Geist"; font-weight: 100 900; font-style: normal; src: url("assets/fonts/Geist.woff2") format("woff2"); }
      @font-face { font-family: "Inter"; font-weight: 100 900; font-style: normal; src: url("assets/fonts/Inter.woff2") format("woff2"); }
      @font-face { font-family: "JetBrains Mono"; font-weight: 100 800; font-style: normal; src: url("assets/fonts/JetBrainsMono.woff2") format("woff2"); }
      :root {
        --canvas: #0e0f11; --surface: #16181c; --border: #2a2d33; --text: #f0f0ee; --text-2: #8a8f99; --text-3: #555b66;
        --accent: #e8a020; --error: #c94040; --success: #3dab72; --glass: rgba(22, 24, 28, 0.94);
        --font-display: "Geist", "Helvetica Neue", Arial, sans-serif;
        --font-sans: "Inter", "Helvetica Neue", Arial, sans-serif;
        --font-mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: var(--canvas); color: var(--text); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--canvas); }
      .clip { position: absolute; inset: 0; overflow: hidden; }
      .amber { color: var(--accent); }

      #grid { position: absolute; left: -48px; top: -48px; width: 2016px; height: 1176px;
        background-image: linear-gradient(to right, rgba(240,240,238,.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(240,240,238,.04) 1px, transparent 1px);
        background-size: 48px 48px; }
      #spill { position: absolute; left: 120px; top: 60px; width: 1100px; height: 800px; background: radial-gradient(closest-side, rgba(232,160,32,.07), rgba(232,160,32,0) 100%); }
      #vig { position: absolute; inset: 0; background: radial-gradient(ellipse 75% 70% at 50% 45%, rgba(14,15,17,0) 45%, rgba(6,7,8,.8) 100%); }

      /* ---------- The one browser window (flat; chrome styling from ../hyperframes-agency) ---------- */
      .win { position: absolute; left: ${WIN.l}px; top: ${WIN.t}px; width: ${WIN.w}px; height: ${WIN.chrome + VP.h}px; border-radius: 12px; }
      .win-shadow { position: absolute; inset: 0; border-radius: 12px; box-shadow: 0 60px 120px -20px rgba(0,0,0,.75), 0 24px 48px -10px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.09); }
      .win-body { position: absolute; inset: 0; border-radius: 12px; overflow: hidden; background: #111214; }
      .chrome { position: absolute; left: 0; top: 0; width: ${WIN.w}px; height: ${WIN.chrome}px;
        background: linear-gradient(to bottom, rgba(44,46,52,.98), rgba(30,32,36,.98)); border-bottom: 1px solid rgba(255,255,255,.07); }
      .lights { position: absolute; left: 18px; top: 12px; display: flex; gap: 8px; }
      .lights i { width: 12px; height: 12px; border-radius: 50%; display: block; box-shadow: inset 0 0 0 .5px rgba(0,0,0,.25); }
      .lights i:nth-child(1) { background: #ec6a5e; } .lights i:nth-child(2) { background: #e0b33f; } .lights i:nth-child(3) { background: #5fbf52; }
      .tab { position: absolute; left: 92px; top: 4px; width: 270px; height: 28px; border-radius: 7px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.06); }
      .fav { position: absolute; left: 11px; top: 8px; width: 11px; height: 11px; border-radius: 2px; background: var(--accent); }
      .tabt { position: absolute; left: 30px; top: 5px; font-family: var(--font-sans); font-size: 13px; font-weight: 500; color: #e6e6e3; white-space: nowrap; opacity: 0; }
      .addr { position: absolute; left: 392px; top: 4px; width: 620px; height: 28px; border-radius: 7px; background: rgba(0,0,0,.30); border: 1px solid rgba(255,255,255,.06); }
      .lock { position: absolute; left: 12px; top: 7px; width: 11px; height: 13px; color: #8a8f99; }
      .url { position: absolute; left: 32px; top: 5px; font-family: var(--font-sans); font-size: 13.5px; font-weight: 500; color: #c9ccd2; letter-spacing: .01em; white-space: nowrap; opacity: 0; }
      .vpbg { position: absolute; left: 0; top: ${WIN.chrome}px; width: ${VP.w}px; height: ${VP.h}px; background: #0f1012; }

      /* Viewport content: one wrap per shot, always at the same rect */
      .wrap { position: absolute; left: ${VP.l}px; top: ${VP.t}px; width: ${VP.w}px; height: ${VP.h}px; overflow: hidden; border-radius: 0 0 12px 12px; visibility: hidden; }
      .cam { position: absolute; left: 0; top: 0; width: ${VP.w}px; height: ${VP.h}px; }
      .page { position: absolute; left: 0; top: 0; width: ${VP.w}px; }
      .vid { position: absolute; left: 0; top: 0; width: ${VP.w}px; height: ${VH}px; display: block; }
      .print { position: absolute; left: 0; top: 0; width: ${VP.w}px; display: block; }
      .dim { position: absolute; left: 0; top: 0; }
      .cover { position: absolute; }
      .hl { position: absolute; border: 2px solid var(--accent); border-radius: 7px; opacity: 0;
        box-shadow: 0 0 0 1px rgba(232,160,32,.22), 0 0 20px 2px rgba(232,160,32,.42), inset 0 0 12px rgba(232,160,32,.10); }
      .hl.red { border-color: var(--error); box-shadow: 0 0 0 1px rgba(201,64,64,.25), 0 0 20px 2px rgba(201,64,64,.45), inset 0 0 12px rgba(201,64,64,.10); }
      .ul { position: absolute; height: 2px; background: var(--accent); transform-origin: 0 50%; box-shadow: 0 0 8px rgba(232,160,32,.6); }
      .desat { position: absolute; left: 0; top: 0; width: ${VP.w}px; height: ${VH}px; opacity: 0; }
      .desat i { position: absolute; display: block; backdrop-filter: grayscale(1) brightness(.62); -webkit-backdrop-filter: grayscale(1) brightness(.62); }
      .chip { position: absolute; display: flex; align-items: center; gap: 12px; padding: 6px 18px 7px 14px; background: rgba(30,31,35,.97); border: 1px solid var(--border);
        box-shadow: 0 10px 30px rgba(0,0,0,.5); white-space: nowrap; }
      .chip i { width: 4px; height: 26px; background: var(--accent); display: block; flex: none; }
      .chip span { font-family: var(--font-sans); font-size: 26px; font-weight: 500; color: var(--text); letter-spacing: -.005em; line-height: 1.2; }
      .chip b { font-weight: 500; color: var(--text-2); padding: 0 3px; }

      /* Agency mockup (F2): real screenshots, cropped only, scaled into the viewport */
      #ag-in { position: absolute; left: 0; top: 0; width: 1512px; height: 851px; transform: scale(${r2(VP.w / 1512 * 10000) / 10000}); transform-origin: 0 0; background: #f7f6f3; }
      #ag-in > div { position: absolute; }
      .agc { background-image: url("assets/shots/dash-top.png"); background-size: 1512px 801px; background-repeat: no-repeat; }
      .agc.lc { background-image: url("assets/shots/dash-lifecycle.png"); }
      .hon { position: absolute; display: flex; align-items: center; gap: 16px; padding: 12px 24px 13px 20px; background: rgba(30,31,35,.95); border: 1px solid var(--border); box-shadow: 0 12px 30px rgba(0,0,0,.35); }
      .hon i { width: 4px; height: 28px; background: var(--accent); display: block; flex: none; }
      .hon span { font-family: var(--font-sans); font-size: 26px; font-weight: 500; color: var(--text); white-space: nowrap; letter-spacing: -.005em; }
      .hon b { font-weight: 500; color: var(--text-2); padding: 0 4px; }

      /* Scale note: left margin beside the window on devnet shots (the top band belongs to the story spine) */
      .scale p { position: absolute; left: 26px; top: 96px; width: 210px; font-family: var(--font-mono); font-size: 14px; line-height: 1.55; letter-spacing: .04em; text-transform: uppercase; color: var(--text-2); }
      .scale span { display: block; }
      .scale b { display: block; color: var(--accent); font-weight: 500; margin-bottom: 4px; }
      /* Hackathon badge: right side of the window chrome */
      .hk { position: absolute; right: ${1920 - WIN.l - WIN.w + 16}px; top: ${WIN.t + 6}px; height: 28px; display: flex; align-items: center; gap: 10px; padding: 0 12px; border-radius: 7px;
        border: 1px solid rgba(232,160,32,.45); background: rgba(232,160,32,.08); font-family: var(--font-mono); font-size: 13px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--text); white-space: nowrap; }
      .hk i { width: 7px; height: 7px; background: var(--accent); display: block; }
      .hk em { font-style: normal; color: var(--accent); }
      /* Story spine: top band above the window */
      .sp { position: absolute; left: ${WIN.l}px; top: 138px; width: ${WIN.w}px; height: 22px; display: flex; align-items: center; opacity: 0; }
      .sp .st { position: relative; display: grid; flex: none; }
      .sp .L { grid-area: 1 / 1; display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 14px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; opacity: 0; line-height: 18px; }
      .sp .mk { width: 11px; height: 11px; display: block; flex: none; }
      .sp .mk svg { width: 11px; height: 11px; display: block; }
      .sp .f { color: #80858f; } .sp .f .mk { border: 1.5px solid #80858f; }
      .sp .c { color: var(--accent); font-weight: 700; } .sp .c .mk { background: var(--accent); }
      .sp .p { color: var(--text-2); } .sp .p .mk { color: var(--text-2); }
      .sp .r { color: #e06a6a; font-weight: 700; } .sp .r .mk { background: var(--error); }
      .sp .bar { display: none; position: absolute; left: 0; right: 0; bottom: -5px; height: 2px; background: var(--accent); transform-origin: 0 50%; transform: scaleX(0); box-shadow: 0 0 8px rgba(232,160,32,.6); }
      .sp .bar.red { background: var(--error); box-shadow: 0 0 8px rgba(201,64,64,.6); opacity: 0; }
      .sp .cn { flex: 1; height: 1px; background: var(--border); margin: 0 12px; display: block; min-width: 14px; }
      .pg { position: absolute; left: ${WIN.l}px; top: 140px; height: 18px; display: flex; align-items: center; gap: 8px; }
      .pg .d { width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid #555b66; display: block; flex: none; }
      .pg .d.p { background: #8a8f99; border-color: #8a8f99; }
      .pg .d.c { background: var(--accent); border-color: var(--accent); box-shadow: 0 0 8px rgba(232,160,32,.6); }
      .pg .d.c.r { background: var(--error); border-color: var(--error); box-shadow: 0 0 8px rgba(201,64,64,.6); }
      .pg span { margin-left: 10px; font-family: var(--font-mono); font-size: 15px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); white-space: nowrap; }
      .pg span.r { color: #e06a6a; }
      /* Explorer cause -> effect: tap on the link */
      .tap { position: absolute; width: 140px; height: 32px; border-radius: 8px; border: 2px solid var(--accent); background: rgba(232,160,32,.14); opacity: 0;
        box-shadow: 0 0 18px 2px rgba(232,160,32,.5); }
      .ring { position: absolute; width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--accent); opacity: 0; }
      .tap.red, .ring.red { border-color: var(--error); } .tap.red { background: rgba(201,64,64,.14); box-shadow: 0 0 18px 2px rgba(201,64,64,.5); }
      .opl { position: absolute; left: 8px; top: 232px; width: 234px; display: flex; gap: 8px; padding: 11px 8px 12px 10px; background: rgba(30,31,35,.95); border: 1px solid var(--border); box-shadow: 0 12px 30px rgba(0,0,0,.35); }
      .opl i { width: 4px; background: var(--accent); display: block; flex: none; }
      .opl span { display: block; font-family: var(--font-sans); font-size: 22px; font-weight: 600; line-height: 1.3; color: var(--text); white-space: normal; }
      .opl span.s { font-weight: 500; color: #b9bcc3; }
      .hd { position: absolute; left: 160px; top: 62px; max-width: 1200px; font-family: var(--font-display); font-weight: 600; font-size: 48px; line-height: 1.12; letter-spacing: -.02em; color: var(--text); white-space: nowrap; }
      .tg { position: absolute; right: ${1920 - 1760}px; top: 92px; text-align: right; font-family: var(--font-mono); font-size: 19px; font-weight: 500; letter-spacing: .1em; text-transform: uppercase; color: var(--text-2); white-space: nowrap; line-height: 24px; }
      .tg span { display: block; margin-top: 2px; font-size: 26px; font-weight: 500; color: #b9bcc3; }
      .pop { position: absolute; left: ${DIAGRAM ? VP.l + VP.w / 2 - 460 : 960 - 460}px; top: 330px; width: 920px; padding: 26px 30px 30px; background: rgba(22,24,28,.97); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 40px 100px rgba(0,0,0,.7); }
      .pop .ph { font-family: var(--font-mono); font-size: 18px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-2); }
      .pop .ps { font-family: var(--font-mono); font-size: 20px; color: var(--text); margin: 8px 0 18px; }
      .pop .crop { background-image: url("assets/prints/x2-refused.full.png"); background-size: ${1440 * 1.3}px auto; background-repeat: no-repeat; border-radius: 6px; margin-top: 12px; }
      .pop .crop.log { border: 2px solid var(--error); box-shadow: 0 0 18px 2px rgba(201,64,64,.4); }
      video.ins { left: 0; top: 0; width: 1920px; height: 1080px; right: auto; bottom: auto; object-fit: cover; }
      .chip.ana { transform-origin: 0 0; opacity: 0; }
      .lead { position: absolute; width: 2px; background: var(--accent); transform-origin: 50% 0; box-shadow: 0 0 8px rgba(232,160,32,.6); }
      .ldw { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; pointer-events: none; }
      .anac .chip { ${DIAGRAM ? `left: ${COL.l}px; top: ${CHIP_Y}px; width: ${COL.w}px` : `right: ${1920 - VP.l - VP.w + 24}px; top: ${ANA_SLOT.y}px; height: ${ANA_H}px`}; }
      .chip.col, .anac .chip.col { width: ${COL.w}px; white-space: normal; align-items: flex-start; }
      .chip.col span { font-size: 24px; line-height: 1.3; }

      /* ch3 is full-frame; scaled 0.8 from top centre so its bottom stats sit above the caption band (y < 880) */
      #ch3box { position: absolute; left: 192px; top: 8px; width: 1536px; height: 864px; overflow: hidden; border-radius: 10px; box-shadow: 0 0 0 1px rgba(255,255,255,.06); }
      #ch3cam { position: absolute; left: 0; top: 0; width: 1536px; height: 864px; transform-origin: 0 0; }
      video.full { left: 0; top: 0; width: 1536px; height: 864px; right: auto; bottom: auto; }

      /* Opener (0-2.6 s): São Paulo, brand-graded (assets/opener-sao-paulo.jpg), amber horizon line folds into the mark, mark flies to the tab favicon */
      #op-city { position: absolute; left: 0; top: -100px; width: 1920px; height: 1280px; transform-origin: 50% 55%; }
      #op-city img { width: 1920px; height: 1280px; display: block; }
      #op-grain { position: absolute; left: -128px; top: -128px; width: 2176px; height: 1336px; opacity: .08; mix-blend-mode: overlay;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch' seed='7'/><feColorMatrix type='saturate' values='0'/></filter><rect width='256' height='256' filter='url(%23n)'/></svg>");
        background-size: 256px 256px; }
      #op-line { position: absolute; left: 0; top: 599px; width: 1920px; height: 2px; background: var(--accent); transform-origin: 0 50%;
        box-shadow: 0 0 14px 2px rgba(232,160,32,.55), 0 0 50px 6px rgba(232,160,32,.2); }
      #op-bloom { position: absolute; left: 660px; top: 300px; width: 600px; height: 600px; border-radius: 50%; background: radial-gradient(closest-side, rgba(232,160,32,.32), rgba(232,160,32,0)); }
      #op-mark { position: absolute; left: 852px; top: 510px; width: 216px; height: 180px; color: #f0f0ee; transform-origin: 50% 50%; overflow: visible; }

      /* Lower thirds (bottom edge at y=880) */
      .lt { position: absolute; left: 96px; bottom: 200px; display: flex; align-items: stretch; background: var(--glass); border: 1px solid var(--border); }
      .lt .num { font-family: var(--font-display); font-weight: 800; font-size: 132px; line-height: 1; color: var(--canvas); background: var(--accent);
        display: flex; align-items: center; justify-content: center; width: 150px; letter-spacing: -.04em; }
      .lt .body { padding: 28px 64px 30px 36px; display: flex; flex-direction: column; justify-content: center; gap: 16px; min-width: 640px; }
      .lt .kicker { font-family: var(--font-mono); font-size: 18px; letter-spacing: .1em; text-transform: uppercase; color: var(--text-2); display: flex; align-items: center; gap: 12px; }
      .lt .kicker i { width: 3px; height: 18px; background: var(--accent); display: block; }
      .lt h1 { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; letter-spacing: -.02em; line-height: 1; font-size: 66px; white-space: nowrap; }
      .card { position: absolute; inset: 0; background: var(--canvas); overflow: hidden; opacity: 0; }
      .card .cgrid { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; background-image: linear-gradient(to right, rgba(240,240,238,.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(240,240,238,.04) 1px, transparent 1px); background-size: 48px 48px; }
      .card img { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; object-fit: cover; display: block; }
      .card .tint { position: absolute; inset: 0; background: linear-gradient(rgba(232,160,32,.08), rgba(232,160,32,.08)), rgba(14,15,17,.75); }
      .card .gr { position: absolute; left: -64px; top: -64px; right: -64px; bottom: -64px; opacity: .07; mix-blend-mode: overlay;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch' seed='7'/><feColorMatrix type='saturate' values='0'/></filter><rect width='256' height='256' filter='url(%23n)'/></svg>");
        background-size: 256px 256px; }
      .card .cb { position: absolute; left: 160px; top: 0; height: 880px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
      .card .ck { font-family: var(--font-mono); font-size: 20px; letter-spacing: .1em; text-transform: uppercase; color: var(--accent); }
      .card h1 { font-family: var(--font-display); font-weight: 800; font-size: 76px; line-height: 1.04; letter-spacing: -.025em; text-transform: uppercase; color: var(--text); max-width: 1560px; }
      .card .cq { font-family: var(--font-sans); font-size: 42px; font-weight: 500; color: #a6abb4; white-space: nowrap; }
      .lt .q { font-family: var(--font-sans); font-size: 30px; font-weight: 500; color: var(--text-2); white-space: nowrap; letter-spacing: -.005em; }
      .lt .rule { position: absolute; left: 150px; right: 0; bottom: -1px; height: 3px; background: var(--accent); transform-origin: 0 50%; }

      /* Safeguards card (copy = ../overlays/safeguards-card.html) */
      #safe { position: absolute; ${DIAGRAM ? `left: ${VP.l + (VP.w - 760) / 2}px; top: ${VP.t + 20}px` : "right: 200px; top: 236px"}; width: 760px; padding: 30px 36px 32px; background: rgba(22,24,28,.97); border: 1px solid var(--border); box-shadow: 0 40px 100px rgba(0,0,0,.65); }
      #safe .k { font-family: var(--font-mono); font-size: 17px; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); }
      #safe h2 { font-family: var(--font-display); font-weight: 800; font-size: 42px; letter-spacing: -.02em; margin: 10px 0 18px; text-transform: uppercase; }
      #safe li { list-style: none; display: flex; gap: 18px; align-items: baseline; padding: 12px 0; border-top: 1px solid var(--border); font-size: 26px; line-height: 1.3; font-weight: 500; }
      #safe li b { font-family: var(--font-mono); font-weight: 500; color: var(--accent); font-size: 19px; width: 32px; flex: none; }
      #safe .next { margin-top: 16px; padding-top: 14px; border-top: 2px dashed var(--accent); font-family: var(--font-mono); font-size: 17px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-2); }
      #safe .next em { font-style: normal; color: var(--accent); font-weight: 700; }
${DIAGRAM ? `      #safe { left: ${COL.l}px; top: ${COL.t}px; width: ${COL.w}px; padding: 22px 24px 24px; }
      #safe .k { font-size: 14px; } #safe h2 { font-size: 28px; margin: 8px 0 12px; }
      #safe li { font-size: 20px; padding: 9px 0; gap: 12px; } #safe li b { font-size: 15px; width: 24px; }
      #safe .next { font-size: 14px; line-height: 1.45; }` : ""}

      /* F9 environment switch */
      #env { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 34px; padding-bottom: 120px; }
      #env h2 { font-family: var(--font-display); font-weight: 800; font-size: 84px; text-transform: uppercase; letter-spacing: -.02em; }
      #env .b { padding: 14px 26px; background: rgba(30,31,35,.96); border: 1px solid var(--accent); font-family: var(--font-mono); font-size: 28px; letter-spacing: .06em; text-transform: uppercase; }
      #env .b span { color: var(--accent); }

      .pn { position: absolute; overflow: hidden; border-radius: 10px; background: var(--surface); box-shadow: 0 40px 90px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.09); }
      .pn img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; transform-origin: 50% 50%; }
      .pn .gr { position: absolute; left: -64px; top: -64px; right: -64px; bottom: -64px; opacity: .08; mix-blend-mode: overlay;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch' seed='7'/><feColorMatrix type='saturate' values='0'/></filter><rect width='256' height='256' filter='url(%23n)'/></svg>");
        background-size: 256px 256px; }
      .pn .rim { position: absolute; left: 0; top: 0; width: 3px; height: 100%; background: var(--accent); }
      #credit { position: absolute; right: 160px; top: 176px; text-align: right; font-family: var(--font-mono); font-size: 20px; letter-spacing: .06em; color: #b9bcc3; white-space: nowrap; }

      #credit .legal { margin-top: 10px; font-size: 18px; color: #9a9ea6; }
      /* Tour chip: viewport bottom-right during the live tour */
      #tourchip .chip { ${DIAGRAM ? `left: ${COL.l}px; top: ${CHIP_Y}px` : `right: ${1920 - VP.l - VP.w + 24}px; top: ${VP.t + 24}px`}; }
      /* Captions: caption-safe band (y >= 880), up to 2 lines */
      .cap { display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding-bottom: 36px; }
      .cap span { display: block; font-family: var(--font-sans); font-weight: 500; font-size: 38px; line-height: 1.32; color: #fff; background: rgba(14,15,17,.88); padding: 1px 16px; white-space: nowrap; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-fps="30" data-width="1920" data-height="1080">
      <div id="stage" class="clip" data-start="0" data-duration="${TOTAL}" data-track-index="0">
        <div id="grid" data-layout-allow-overflow></div>
        <div id="spill"></div>
        <div id="vig"></div>
      </div>

      <!-- The browser window (chrome + empty viewport) -->
${winDom}

      <!-- Viewport content, one wrap per shot (same rect every time) -->
${dom.join("\n")}

      <!-- v3: explanation column chips (DIAGRAM layout) -->
${colDom.join("\n")}

      <!-- Ch3 motion piece (full frame) -->
      <div id="ch3box"><div id="ch3cam">
      <video id="ch3" class="clip full" src="assets/clips/ch3.mp4" muted playsinline data-start="${CH3_AT}" data-duration="${r2(CH3B_AT - CH3_AT)}" data-track-index="2"></video>
      <video id="ch3b" class="clip full" src="assets/clips/ch3.mp4" muted playsinline data-start="${CH3B_AT}" data-duration="${r2(Math.min(CLOSE_AT - CH3B_AT, (dur("assets/clips/ch3.mp4") - CH3B_MS) / CH3B_RATE - 0.05))}" data-media-start="${CH3B_MS}" data-playback-rate="${CH3B_RATE}" data-track-index="3"></video>
      </div></div>




      <!-- v3 live diagram (compositions/diagram.html): top of the explanation column (x ${COL.l}, y ${COL.t}, 448 wide) -->
${LD.map((d) => { const host = `<div id="${d.id}" data-composition-id="live-diagram" data-composition-src="compositions/diagram.html" data-variable-values='${JSON.stringify({ mode: d.mode, steps: d.steps.map((t) => r2(t - d.start)).join(","), amount: "R$1,500" })}' data-start="${d.start}" data-duration="${r2(d.end - d.start)}" data-track-index="5" data-width="460" data-height="260" style="position:absolute;left:${COL.l}px;top:${COL.t}px;width:460px;height:260px;transform:scale(${LD_K});transform-origin:0 0"></div>`;
  return d.hide ? `      <div id="${d.id}-w" class="ldw">${host}</div>` : `      ${host}`; }).join("\n")}

      <!-- F8b: safeguards card (during "Next, the agency platform does it automatically") -->
      <div id="f8b-safe" class="clip" data-start="${SAFE.start}" data-duration="${r2(SAFE.end - SAFE.start)}" data-track-index="4">
        <div id="safe"><div class="k">Enforced by the MUTAV program · Solana devnet</div><h2>Automation safeguards</h2>
          <ul>
            <li id="sg1"><b>01</b>R$15,000 per payment</li>
            <li id="sg2"><b>02</b>R$20,000 per 31 days</li>
            <li id="sg3"><b>03</b>Payouts only to MUTAV's fixed payments account</li>
            <li id="sg4"><b>04</b>Larger claims need the admin multisig's approval</li>
            <li id="sg5"><b>05</b>Guardian can pause</li>
          </ul>
          <div class="next" id="sg-n2"><em>Next</em> · operator and admin run inside our existing product (server wallet signs as operator) · roadmap</div>
          <div class="next" id="sg-next" style="border-top:0;margin-top:6px;padding-top:0"><em>Later</em> · pay the agency directly on Solana · roadmap</div></div>
      </div>


      <!-- F14: close (motion-kit piece 12) + ElevenLabs credit -->
      <div id="slot-close" data-composition-id="close" data-composition-src="compositions/close.html" data-start="${CLOSE_AT}" data-duration="${r2(TOTAL - CLOSE_AT)}" data-track-index="2" data-width="1920" data-height="1080"></div>

      <!-- Headline band -->
${HEAD.map(([a, b, t], i) => `      <div id="hd${i}" class="clip" data-start="${r2(a)}" data-duration="${r2(b - a)}" data-track-index="15"><h2 class="hd" id="hd${i}-t">${t.replace(/\*(.+?)\*/g, '<span class="amber">$1</span>')}</h2></div>`).join("\n")}
${SHOTS.filter((s) => s.start >= 17).map((s, i, a) => `      <div id="tg-${s.id}" class="clip" data-start="${s.vis}" data-duration="${r2(Math.min(s.hideAt, a[i + 1] && a[i + 1].vis > s.vis ? a[i + 1].vis : 999) - s.vis)}" data-track-index="16"><p class="tg">${s.tag || "Solana devnet · test amounts"}</p></div>`).join("\n")}

      <!-- Story spine (thin row under the headline) -->
${PROG.map((g, i) => `      <div id="pg${i}" class="clip" data-start="${g.a}" data-duration="${r2(g.b - g.a)}" data-track-index="12"><div class="pg">${STEPS.map((_, k) => `<i class="${k < g.k ? "d p" : k === g.k ? `d c${g.k === 2 && g.a >= REFUSED_AT ? " r" : ""}` : "d"}"></i>`).join("")}<span class="${g.k === 2 && g.a >= REFUSED_AT ? "r" : ""}">${STEPS[g.k][0]}</span></div></div>`).join("\n")}

      <div id="capchip" class="clip" data-start="109.0" data-duration="4.0" data-track-index="14"><div class="chip" id="cap-c" style="right:160px;top:28px"><i></i><span>Pilot plan cap <b>·</b> R$1M reserve</span></div></div>
      <div id="tourchip" class="clip" data-start="84.2" data-duration="9.0" data-track-index="14"><div class="chip${DIAGRAM ? " col" : ""}" id="tour-c"><i></i><span>Live on Solana devnet <b>·</b> reserve.mutav.finance</span></div></div>

      <!-- Ana: one chip, one slot -->
${ANA_CLIPS.map((a) => `      <div id="${a.id}" class="clip anac" data-start="${a.start}" data-duration="${r2(a.end - a.start)}" data-track-index="13"><div class="chip${DIAGRAM ? " col" : ""}" id="${a.id}-c"${a.id === "ana1" && !DIAGRAM ? ' style="width:auto"' : ""}><i></i><span>${a.id === "ana1" ? "Ana, our example tenant → on-chain: lease ID only" : ANA_TXT}</span></div></div>`).join("\n")}

      <!-- Refusal aftermath: the on-chain state as a popup (real crops of the x2 Explorer print) -->
      <div id="pop" class="clip" data-start="53.0" data-duration="3.0" data-track-index="18"><div class="pop" id="pop-c">
        <p class="ph">Solana Explorer · devnet · register_guarantee MTV-PF-0101</p><p class="ps">3UtiNT…AESH9</p>
        <div class="crop" style="width:${Math.round(560 * 1.3)}px;height:${Math.round(52 * 1.3)}px;background-position:${-233 * 1.3}px ${-240 * 1.3}px"></div>
        <div class="crop log" style="width:${Math.round(635 * 1.3)}px;height:${Math.round(66 * 1.3)}px;background-position:${-755 * 1.3}px ${-1845 * 1.3}px"></div>
      </div></div>

      <!-- Rendered full-frame inserts -->
${INSERTS.map((v) => `      <video id="${v.id}" class="clip ins" src="assets/clips/${v.id}.mp4" muted playsinline data-start="${v.start}" data-duration="${v.d}" data-track-index="17"></video>`).join("\n")}

      <!-- Lower thirds -->
${LT.map((l) => { const c = CARDS[l.id]; return `      <div id="${l.id}" class="clip" data-start="${c.start}" data-duration="${c.d}" data-track-index="6">
        <div class="card" id="${l.id}-box"><div class="cgrid" data-layout-allow-overflow></div>
          <div class="cb"><p class="ck" id="${l.id}-k">${l.kicker}</p><h1 id="${l.id}-h">${l.title}</h1><p class="cq" id="${l.id}-q">${l.q}</p></div></div>
      </div>`; }).join("\n")}

      <!-- Captions (../captions.en.srt) -->
${caps.map((c, i) => `      <div id="cap${i}" class="clip cap" data-start="${r2(c.s)}" data-duration="${r2(c.e - c.s)}" data-track-index="7">${c.lines.map((t, j) => `<span id="cap${i}-${j}">${t.replace(/&/g, "&amp;")}</span>`).join("")}</div>`).join("\n")}

${audio.map((a) => `      <audio id="a-${a.id}" src="${a.src}" data-start="${a.start}" data-duration="${a.d}" data-track-index="10" data-volume="1"></audio>`).join("\n")}
      <audio id="a-click" src="assets/vo/click.wav" data-start="${CLICK_AT}" data-duration="0.12" data-track-index="11" data-volume="0.5"></audio>
    </div>

    <script>
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#grid", { x: 0, y: 30 }, { x: -30, y: -30, duration: ${TOTAL}, ease: "none" }, 0);

${js.join("\n")}




      tl.set("#ch3cam", { scale: 1, x: 0, y: 0 }, ${CH3_AT});
      // v3 (Julia): no camera moves on ch3 at all, static full frame start to finish.

      // v3 live diagram: hidden during the x3 Explorer flash (wrapper opacity, hard with the cut)
${LD.filter((d) => d.hide).map((d) => d.hide.map(([a, b]) => `      tl.set("#${d.id}-w", { opacity: 0 }, ${a});\n      tl.set("#${d.id}-w", { opacity: 1 }, ${b});`).join("\n")).join("\n")}

      // F8b safeguards card
      tl.fromTo("#safe", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }, ${SAFE.start});
${[1, 2, 3, 4, 5].map((k) => `      tl.fromTo("#sg${k}", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.4, ease: "expo.out" }, ${r2(SAFE.start + 0.2 + k * 0.25)});`).join("\n")}
      tl.fromTo("#sg-next", { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${r2(SAFE.start + 1.6)});
      tl.to("#safe", { opacity: 0, duration: 0.25, ease: "power2.in" }, ${r2(SAFE.end - 0.25)});


      // Lower thirds
${LT.map((l) => { const c = CARDS[l.id]; return `      tl.fromTo("#${l.id}-box", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power1.inOut" }, ${c.start});
      tl.to("#${l.id}-box", { opacity: 0, duration: 0.3, ease: "power1.inOut" }, ${r2(c.start + c.d - 0.3)});
      tl.fromTo("#${l.id}-q", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power1.out" }, ${l.qAt});`; }).join("\n")}

      // Headlines: v3 land ON the cut and leave with it (hard, no fade)
${HEAD.map(([a], i) => `      tl.set("#hd${i}-t", { opacity: 1 }, ${r2(a)});`).join("\n")}

      // Popup: one 0.4 s rise, hold, fade before the chapter-2 card
      tl.fromTo("#pop-c", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, ease: "expo.out" }, 53.0);
      tl.to("#pop-c", { opacity: 0, duration: 0.25, ease: "power1.in" }, 55.7);

      tl.set("#cap-c", { opacity: 1 }, 109.0); // v3 audit P2: "one million" (~109.5), static in the ch3 frame's top-right slot
      tl.set("#tour-c", { opacity: 1 }, 84.2); // v3: lands on the tour cut
      tl.set("#tour-c", { opacity: 0 }, 93.2);

      // Story spine


      // Ana chip: fade in, out before x1; second run slides into its F8 spot above her row (hands off to the page chip)
${ANA_CLIPS.map((a) => `      tl.fromTo("#${a.id}-c", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power1.out" }, ${a.start});
      tl.to("#${a.id}-c", { opacity: 0, duration: 0.25, ease: "power1.in" }, ${r2(a.end - 0.25)});`).join("\n")}

      // Captions: mask reveal per line
${caps.map((c, i) => c.lines.map((_, j) => `      tl.fromTo("#cap${i}-${j}", { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none" }, ${r2(c.s)});`).join("\n")).join("\n")}

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
writeFileSync("index.html", html);
console.log(JSON.stringify({ script: scriptFile, voice: haveVO ? VOICE : "fallback", shots: SHOTS.length, caps: caps.length,
  vt: { "5.2": vt(5, 2), "15.1": vt(15, 1), "8.1": vt(8, 1), "8.2": vt(8, 2), "15.2": vt(15, 2), "17.1": vt(17, 1), "17.3": CAPS_AT },
  vo: audio.map((a) => [a.id, a.start, r2(a.start + a.d)]) }));
