/**
 * Encode captured frames into one constant-frame-rate MP4 per clip, write the
 * per-clip event log and the run manifest (TEST-ONLY).
 *
 *   bun e2e/demo/encode.ts <runDir>
 *
 * Each frame is held until the next one (ffmpeg concat with durations), so
 * video time matches the event log's `t`. H.264, CRF 14, yuv420p, 30 fps, at
 * 1920×1080 (see capture.ts: 1× video, native 2× PNG stills on holds and
 * results in clips/<name>.stills2x/). A 1× still of every result / hold is
 * kept for review; the raw frames are removed unless DEMO_KEEP_FRAMES=1.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClipMeta } from "./capture";

const FPS = Number(process.env.DEMO_FPS ?? 30);

function frameAt(meta: ClipMeta, t: number) {
  const abs = meta.t0 + t;
  let pick = meta.frames[0];
  for (const f of meta.frames) {
    if (f.t <= abs) pick = f;
    else break;
  }
  return pick;
}

export function encodeRun(runDir: string) {
  const clipsDir = join(runDir, "clips");
  const metas = readdirSync(clipsDir)
    .filter((f) => f.endsWith(".meta.json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(clipsDir, f), "utf8")) as ClipMeta & { skipped?: string });
  const manifest: Record<string, unknown>[] = [];
  for (const meta of metas) {
    if (meta.skipped || meta.frames.length === 0) {
      manifest.push({ name: meta.name, title: meta.title, skipped: meta.skipped ?? "no frames" });
      continue;
    }
    const frames = join(runDir, "frames", meta.name);
    const list = join(frames, "list.txt");
    const lines: string[] = [];
    // Video time 0 = t0: the first frame also covers the gap before it arrived.
    const ts = meta.frames.map((f, i) => (i === 0 ? meta.t0 : f.t));
    meta.frames.forEach((f, i) => {
      const next = i + 1 < meta.frames.length ? ts[i + 1]! : meta.t1;
      lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, next - ts[i]!).toFixed(4)}`);
    });
    lines.push(`file '${meta.frames.at(-1)!.file}'`);
    writeFileSync(list, lines.join("\n") + "\n");
    const out = join(clipsDir, `${meta.name}.mp4`);
    execFileSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-fps_mode", "cfr", "-r", String(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p", "-threads", "4", "-movflags", "+faststart", out],
      { cwd: frames, stdio: "inherit" },
    );

    // Frame-rate health: gaps between consecutive frames while things moved.
    const gaps = meta.frames.slice(1).map((f, i) => f.t - meta.frames[i]!.t).filter((g) => g < 0.5);
    gaps.sort((a, b) => a - b);
    const median = gaps.length ? gaps[Math.floor(gaps.length / 2)]! : null;
    const p90 = gaps.length ? gaps[Math.floor(gaps.length * 0.9)]! : null;

    const stills = join(clipsDir, `${meta.name}.stills`);
    mkdirSync(stills, { recursive: true });
    meta.events
      .filter((e) => e.kind === "result" || e.kind === "hold")
      .forEach((e, i) => {
        const f = frameAt(meta, e.t + (e.kind === "hold" ? Math.min(1, (e.duration ?? 0) / 2) : 0.3));
        if (f) copyFileSync(join(frames, f.file), join(stills, `${String(i).padStart(2, "0")}-${e.kind}-${(e.label ?? "").replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}${f.file.slice(-4)}`));
      });

    const duration = meta.t1 - meta.t0;
    const log = {
      clip: `${meta.name}.mp4`,
      title: meta.title,
      role: meta.role,
      viewport: meta.viewport,
      dpr: meta.dpr,
      video: { width: meta.viewport.width, height: meta.viewport.height, fps: FPS, duration: Number(duration.toFixed(3)) },
      stills2x: { dir: `${meta.name}.stills2x`, width: meta.viewport.width * meta.dpr, height: meta.viewport.height * meta.dpr, files: meta.stills },
      coordinates: "boxes are CSS px = video px (1920×1080); multiply by dpr for stills2x px. t is seconds of video time.",
      links: meta.links,
      notes: meta.notes,
      events: meta.events,
    };
    writeFileSync(join(clipsDir, `${meta.name}.events.json`), JSON.stringify(log, null, 2));
    manifest.push({
      name: meta.name,
      title: meta.title,
      role: meta.role,
      clip: `clips/${meta.name}.mp4`,
      events: `clips/${meta.name}.events.json`,
      duration: Number(duration.toFixed(2)),
      frames: meta.frames.length,
      stills2x: meta.stills.length,
      frameGapMedianMs: median === null ? null : Math.round(median * 1000),
      frameGapP90Ms: p90 === null ? null : Math.round(p90 * 1000),
      bytes: statSync(out).size,
      links: meta.links,
      notes: meta.notes,
    });
    if (process.env.DEMO_KEEP_FRAMES !== "1") rmSync(frames, { recursive: true, force: true });
    console.log(`encoded ${meta.name}.mp4 (${duration.toFixed(1)} s, ${meta.frames.length} frames, median gap ${median === null ? "-" : Math.round(median * 1000)} ms)`);
  }
  const runInfo = existsSync(join(runDir, "run.json")) ? JSON.parse(readFileSync(join(runDir, "run.json"), "utf8")) : {};
  writeFileSync(join(runDir, "manifest.json"), JSON.stringify({ ...runInfo, encodedAt: new Date().toISOString(), fps: FPS, clips: manifest }, null, 2));
  if (process.env.DEMO_KEEP_FRAMES !== "1" && existsSync(join(runDir, "frames")) && readdirSync(join(runDir, "frames")).length === 0) rmSync(join(runDir, "frames"), { recursive: true });
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: encode.ts <runDir>");
  encodeRun(resolve(dir));
}
