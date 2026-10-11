/**
 * Clip capture (TEST-ONLY): CDP `Page.startScreencast` frames written to disk
 * with their timestamps, plus an event log for the later zoom + cursor pass.
 * encode.ts turns the frames into a constant-frame-rate MP4 per clip.
 *
 * Frames arrive only when the page repaints; each one is held until the next,
 * so a still page costs nothing and the timeline stays exact.
 *
 * Resolution: Chromium's screencast delivers frames in CSS pixels (1920×1080)
 * whatever the device scale factor, and full 2× capture (3840×2160) through
 * captureScreenshot runs at about 12 fps on this machine, not a steady 30.
 * So the moving video is 1× (rendered at dpr 2, downsampled: ~60 fps), and
 * every hold / result also saves a native 2× still (PNG, 3840×2160) of the
 * held, static screen: zoom-ins on holds use the still, so they can go to 2×
 * without blur; zooms over motion stay at or under 1.3×.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CDPSession, Locator, Page } from "@playwright/test";

export type EventKind = "clip-start" | "move" | "click" | "type-start" | "type-end" | "result" | "hold" | "scroll" | "navigate" | "note" | "clip-end";

export type ClipEvent = {
  /** Seconds since the clip's t0 (video time). */
  t: number;
  kind: EventKind;
  label?: string;
  selector?: string;
  /** CSS pixels in the 1920×1080 viewport; multiply by `dpr` for frame pixels. */
  box?: { x: number; y: number; width: number; height: number } | null;
  /** Hold length, seconds (hold events). */
  duration?: number;
  /** A native-resolution still of this moment (clips/<name>.stills2x/<file>). */
  still?: string;
  data?: Record<string, unknown>;
};

export type ClipMeta = {
  name: string;
  title: string;
  role: string;
  t0: number;
  t1: number;
  frames: { file: string; t: number }[];
  /** Native-resolution stills of held screens (dpr × viewport), by event index. */
  stills: { file: string; t: number; event: number; label?: string }[];
  viewport: { width: number; height: number };
  dpr: number;
  events: ClipEvent[];
  links: Record<string, string>;
  notes: string[];
};

export class Clip {
  readonly meta: ClipMeta;
  private cdp: CDPSession | null = null;
  private n = 0;
  private readonly dir: string;
  private pending: Promise<unknown>[] = [];

  constructor(
    private readonly page: Page,
    runDir: string,
    name: string,
    title: string,
    role: string,
    private readonly opts: { dpr: number; format: "jpeg" | "png"; quality: number },
  ) {
    this.dir = join(runDir, "frames", name);
    mkdirSync(this.dir, { recursive: true });
    const vp = page.viewportSize() ?? { width: 1920, height: 1080 };
    this.meta = { name, title, role, t0: 0, t1: 0, frames: [], stills: [], viewport: vp, dpr: opts.dpr, events: [], links: {}, notes: [] };
  }

  async start() {
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on("Page.screencastFrame", (f: { data: string; metadata: { timestamp?: number }; sessionId: number }) => {
      const file = `${String(this.n++).padStart(6, "0")}.${this.opts.format === "png" ? "png" : "jpg"}`;
      const t = f.metadata.timestamp ?? Date.now() / 1000;
      this.meta.frames.push({ file, t });
      writeFileSync(join(this.dir, file), Buffer.from(f.data, "base64"));
      this.pending.push(this.cdp!.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined));
    });
    const { width, height } = this.meta.viewport;
    this.meta.t0 = Date.now() / 1000;
    await this.cdp.send("Page.startScreencast", {
      format: this.opts.format,
      ...(this.opts.format === "jpeg" ? { quality: this.opts.quality } : {}),
      maxWidth: width,
      maxHeight: height,
      everyNthFrame: 1,
    });
    // Force a first paint so the clip opens on a frame.
    await this.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    this.event("clip-start", { label: this.meta.title });
  }

  now() {
    return Math.round((Date.now() / 1000 - this.meta.t0) * 1000) / 1000;
  }

  event(kind: EventKind, e: Omit<ClipEvent, "t" | "kind"> = {}) {
    const ev = { t: this.now(), kind, ...e };
    this.meta.events.push(ev);
    return ev;
  }

  /** Save a native-resolution (dpr ×) PNG of the current, static screen and attach it to `ev`. */
  async still(ev: ClipEvent) {
    if (!this.cdp || this.opts.dpr <= 1) return;
    const dir = join(this.dir, "..", "..", "clips", `${this.meta.name}.stills2x`);
    mkdirSync(dir, { recursive: true });
    const [x, y] = await this.page.evaluate(() => [window.scrollX, window.scrollY]);
    const { width, height } = this.meta.viewport;
    const r = (await this.cdp.send("Page.captureScreenshot", { format: "png", clip: { x, y, width, height, scale: this.opts.dpr } })) as { data: string };
    const file = `${String(this.meta.stills.length).padStart(2, "0")}-${ev.kind}-${(ev.label ?? "").replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.png`;
    writeFileSync(join(dir, file), Buffer.from(r.data, "base64"));
    ev.still = file;
    this.meta.stills.push({ file, t: ev.t, event: this.meta.events.indexOf(ev), label: ev.label });
  }

  async boxOf(locator: Locator) {
    try {
      return await locator.boundingBox({ timeout: 2_000 });
    } catch {
      return null;
    }
  }

  async stop() {
    this.event("clip-end");
    this.meta.t1 = Date.now() / 1000;
    if (this.cdp) {
      await this.cdp.send("Page.stopScreencast").catch(() => undefined);
      await Promise.all(this.pending);
      await this.cdp.detach().catch(() => undefined);
    }
    return this.meta;
  }
}
