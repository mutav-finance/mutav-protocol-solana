#!/usr/bin/env node
/*
 * Generates the demo voiceover with ElevenLabs from vo-script.md: one clip per numbered line, then a
 * 2:15 track with every clip placed at its start second. Run from anywhere:
 *
 *   ELEVENLABS_API_KEY=… ELEVENLABS_VOICE_ID=… VO_N=42 node docs/demo/production/tools/vo.cjs [--only 5,9] [--force] [--out <dir>]
 *   … node docs/demo/production/tools/vo.cjs --script <vo-script.md> --total 139.5 --out <dir>
 *       Same, from another script in the same table format (n | start | end | shot | line).
 *   --groups 2+3,6+7   read lines that split one sentence as a single take, then cut that take at the line
 *                      boundaries (from ElevenLabs' character timestamps), so each line keeps the take's flow.
 *   … node docs/demo/production/tools/vo.cjs --cues <cues.json> --out <dir> [--only v03_register]
 *       Cue mode for an edit that sets its own timing: cues.json is {"total": 139.5, "cues": [{"id", "start", "text"}]};
 *       each cue's slot runs to the next cue's start, and clips are named <id>.wav.
 *
 *   ELEVENLABS_MODEL   default eleven_multilingual_v2 (steady across lines); eleven_v3 is more expressive
 *   VO_N, VO_N_UNIT    fill line 15's [N] (unit "seconds" by default); without VO_N line 15 is skipped
 *   --only 5,9         regenerate just these lines; existing clips are otherwise kept unless --force
 *
 * Writes <out>/line-NN.mp3, <out>/vo.wav (48 kHz mono, 135 s) and <out>/timing.json, and reports every
 * clip that runs past its end second or into the next line. Needs ffmpeg/ffprobe. Exits on its own.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const KIT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(`--${name}`);

const OUT = path.resolve(opt("out", path.join(KIT, "vo")));
const CUES = opt("cues") && JSON.parse(fs.readFileSync(opt("cues"), "utf8"));
const SCRIPT = path.resolve(opt("script", path.join(KIT, "vo-script.md")));
const RUNTIME = CUES ? CUES.total : +opt("total", 135);
const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID;
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
const only = opt("only") ? new Set(opt("only").split(",")) : null;

// Respellings for the TTS engine only; captions keep the real spelling (see the pronunciation table).
const RESPELL = [
  [/\bMUTAV\b/g, "moo-tahv"],
  [/\bMUTAV's\b/g, "moo-tahv's"],
  [/\bmutav\b/g, "moo-tahv"], // the domain, read aloud in "reserve dot mutav dot finance"
  [/\bBRS\b/g, "B. R. S."],
  [/\bPIX\b/g, "peeks"],
  [/\breais\b/g, "heh-ICE"],
];

function parseLines() {
  if (CUES) return CUES.cues.map((c, i, all) => ({ key: c.id, start: c.start, end: all[i + 1]?.start ?? RUNTIME, script: c.text }));
  const md = fs.readFileSync(SCRIPT, "utf8");
  const lines = [];
  for (const row of md.split("\n")) {
    const m = row.match(/^\|\s*(\d+[a-z]?)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|[^|]*\|\s*(.+?)\s*\|$/);
    if (m) lines.push({ key: `line-${m[1].padStart(2, "0")}`, n: m[1], start: +m[2], end: +m[3], script: m[4] });
  }
  return lines;
}

function ttsText(script) {
  let t = script.replace(/‖/g, " ").replace(/\s+/g, " ").trim();
  if (t.includes("[N]")) {
    if (!process.env.VO_N) return null;
    t = t.replace("[N]", process.env.VO_N).replace(/\bseconds\b/, process.env.VO_N_UNIT || "seconds");
  }
  for (const [re, s] of RESPELL) t = t.replace(re, s);
  return t;
}

// Calm but natural: higher stability flattened the read into disconnected words.
const VOICE_SETTINGS = { stability: 0.45, similarity_boost: 0.75, style: 0.05, use_speaker_boost: true };

async function tts(text, prev, next, timed) {
  const body = { text, model_id: MODEL, voice_settings: VOICE_SETTINGS };
  // Continuity hints across separately generated takes; not used with v3.
  if (!MODEL.startsWith("eleven_v3")) Object.assign(body, { previous_text: prev, next_text: next });
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}${timed ? "/with-timestamps" : ""}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  if (!timed) return { audio: Buffer.from(await res.arrayBuffer()) };
  const j = await res.json();
  return { audio: Buffer.from(j.audio_base64, "base64"), alignment: j.alignment };
}

// One take for a whole group, cut between lines halfway through the gap between their words.
async function synthGroup(members, texts, prev, next) {
  const joined = texts.join(" ");
  const { audio, alignment } = await tts(joined, prev, next, true);
  const take = path.join(OUT, `${members[0].key}-group.mp3`);
  fs.writeFileSync(take, audio);
  const cuts = [0];
  let offset = 0;
  for (const t of texts.slice(0, -1)) {
    offset += t.length;
    const endPrev = alignment.character_end_times_seconds[offset - 1];
    const startNext = alignment.character_start_times_seconds[offset + 1]; // skip the joining space
    cuts.push((endPrev + startNext) / 2);
    offset += 1;
  }
  members.forEach((m, k) => {
    const range = ["-ss", String(cuts[k]), ...(k + 1 < cuts.length ? ["-to", String(cuts[k + 1])] : [])];
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", take, ...range, "-c:a", "libmp3lame", "-q:a", "2", path.join(OUT, `${m.key}.mp3`)]);
  });
}

// Every line at the same loudness (default -24 LUFS), peaks kept at or below -3 dBFS.
const LUFS = +opt("lufs", -24), PEAK = -3;
function normalize(file) {
  const out = require("node:child_process").spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr.toString();
  const I = +out.match(/I:\s+(-?[\d.]+) LUFS/g).at(-1).match(/-?[\d.]+/)[0];
  const tp = +out.match(/Peak:\s+(-?[\d.]+) dBFS/g).at(-1).match(/-?[\d.]+/)[0];
  const gain = Math.min(LUFS - I, PEAK - tp);
  const tmp = file.replace(/\.wav$/, ".norm.wav");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", file, "-af", `volume=${gain.toFixed(2)}dB`, "-ar", "48000", "-ac", "1", tmp]);
  fs.renameSync(tmp, file);
}

const duration = (file) =>
  +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim();

async function main() {
  if (!KEY || !VOICE) { console.error("set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID"); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const lines = parseLines();
  console.log(`${lines.length} lines from ${CUES ? opt("cues") : SCRIPT}`);

  const texts = lines.map((l) => ttsText(l.script));
  // Takes: each --groups entry is one take; every other line is its own take.
  const groupOf = new Map();
  for (const g of (opt("groups") || "").split(",").filter(Boolean)) {
    const idx = g.split("+").map((n) => lines.findIndex((l) => l.n === n || l.key === n));
    if (idx.some((i) => i < 0)) throw new Error(`--groups: no line for "${g}"`);
    for (const i of idx) groupOf.set(i, idx);
  }
  const takes = lines.map((_, i) => groupOf.get(i) || [i]).filter((t, i) => t[0] === i);
  for (const take of takes) {
    const members = take.map((i) => lines[i]);
    if (take.some((i) => texts[i] === null)) { console.warn(`${members.map((m) => m.key)}: skipped, set VO_N to fill [N]`); continue; }
    const wanted = only
      ? members.some((m) => only.has(m.n) || only.has(m.key))
      : flag("force") || members.some((m) => !fs.existsSync(path.join(OUT, `${m.key}.mp3`)));
    if (!wanted) continue;
    const prev = texts[take[0] - 1] || "", next = texts[take.at(-1) + 1] || "";
    console.log(`${members.map((m) => m.key).join("+")}: ${take.map((i) => texts[i]).join(" ")}`);
    if (take.length > 1) await synthGroup(members, take.map((i) => texts[i]), prev, next);
    else fs.writeFileSync(path.join(OUT, `${members[0].key}.mp3`), (await tts(texts[take[0]], prev, next)).audio);
  }

  // Place the clips on the timeline and check each one fits its slot.
  const placed = [];
  for (const [i, l] of lines.entries()) {
    const file = path.join(OUT, `${l.key}.mp3`);
    if (!fs.existsSync(file)) continue;
    // ElevenLabs pads each clip with ~0.5 s of silence; trim it, but gently: a hard -45 dB cut chopped soft
    // word endings and breaths, so keep a short natural tail and fade both edges.
    const trimmed = file.replace(/\.mp3$/, ".wav");
    const edge = "silenceremove=start_periods=1:start_threshold=-52dB:start_silence=0.08";
    const fade = "afade=t=in:d=0.015,areverse,afade=t=in:d=0.08,areverse";
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", file, "-af", `${edge},areverse,${edge},areverse,${fade}`, "-ar", "48000", "-ac", "1", trimmed]);
    normalize(trimmed);
    const dur = duration(trimmed);
    const nextStart = lines[i + 1]?.start ?? RUNTIME;
    const over = +(l.start + dur - l.end).toFixed(2);
    const collides = l.start + dur > nextStart;
    placed.push({ key: l.key, file: trimmed, start: l.start, end: l.end, dur: +dur.toFixed(2), over, collides });
    if (collides) console.warn(`${l.key}: ${dur.toFixed(2)} s runs into ${lines[i + 1]?.key ?? "the end"} (slot ${(l.end - l.start).toFixed(1)} s)`);
    else if (over > 0.3) console.warn(`${l.key}: ${over} s past its end mark, still clear of the next line`);
  }
  fs.writeFileSync(path.join(OUT, "timing.json"), JSON.stringify(placed, null, 2) + "\n");

  const inputs = placed.flatMap((p) => ["-i", p.file]);
  const chains = placed.map((p, i) => `[${i}:a]adelay=${Math.round(p.start * 1000)}[a${i}]`);
  const mix = `${placed.map((_, i) => `[a${i}]`).join("")}amix=inputs=${placed.length}:normalize=0,apad=whole_dur=${RUNTIME}[out]`;
  execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", [...chains, mix].join(";"),
    "-map", "[out]", "-t", String(RUNTIME), "-ar", "48000", "-ac", "1", path.join(OUT, "vo.wav")]);
  console.log(`${placed.length} clips → ${path.join(OUT, "vo.wav")}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
