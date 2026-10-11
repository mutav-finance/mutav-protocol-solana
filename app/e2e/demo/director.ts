/**
 * Human-paced actions on a captured page (TEST-ONLY): the cursor overlay
 * glides to each target, clicks show a ring, typing runs at a typist's speed
 * (logged as type-start / type-end so the edit can jump-cut it), and results
 * are waited for on UI state (never fixed sleeps) and then held on screen.
 * Every action lands in the clip's event log with the target's bounding box.
 */
import type { Locator, Page } from "@playwright/test";
import type { Clip } from "./capture";

/** DEMO_PACE scales every deliberate pause (1 = recording pace, 0 = as fast as possible). */
export const PACE = Number(process.env.DEMO_PACE ?? 1);
const pause = (page: Page, ms: number) => (ms * PACE > 0 ? page.waitForTimeout(ms * PACE) : Promise.resolve());

const describe = (l: Locator) => l.toString().replace(/^Locator@/, "");

export class Director {
  constructor(
    readonly page: Page,
    public clip: Clip | null = null,
  ) {}

  private log(kind: Parameters<Clip["event"]>[0], e: Parameters<Clip["event"]>[1] = {}) {
    return this.clip?.event(kind, e);
  }

  /** Glide the cursor to the centre (or a fraction) of a target. */
  async moveTo(target: Locator, label?: string, at: { fx?: number; fy?: number } = {}) {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error(`no box for ${describe(target)}`);
    const x = box.x + box.width * (at.fx ?? 0.5);
    const y = box.y + box.height * (at.fy ?? 0.5);
    const from = await this.page.evaluate(() => (window as unknown as { __demoCursor?: { pos: () => { x: number; y: number } } }).__demoCursor?.pos() ?? { x: 0, y: 0 });
    const dist = Math.hypot(x - from.x, y - from.y);
    const ms = Math.round(Math.min(1100, Math.max(350, dist * 0.9)) * (PACE > 0 ? 1 : 0.01));
    this.log("move", { label, selector: describe(target), box, data: { x, y, ms } });
    await Promise.all([
      this.page.evaluate(([x, y, ms]) => (window as unknown as { __demoCursor?: { moveTo: (x: number, y: number, ms: number) => Promise<void> } }).__demoCursor?.moveTo(x, y, ms), [x, y, ms] as const),
      this.page.mouse.move(x, y, { steps: Math.max(1, Math.round(ms / 40)) }),
    ]);
    return box;
  }

  /** Glide the cursor to a point (CSS px in the viewport), e.g. under a word found with a text Range. */
  async pointAt(x: number, y: number, label?: string) {
    const ms = PACE > 0 ? 700 : 10;
    this.log("move", { label, data: { x, y, ms } });
    await Promise.all([
      this.page.evaluate(([x, y, ms]) => (window as unknown as { __demoCursor?: { moveTo: (x: number, y: number, ms: number) => Promise<void> } }).__demoCursor?.moveTo(x, y, ms), [x, y, ms] as const),
      this.page.mouse.move(x, y, { steps: Math.max(1, Math.round(ms / 40)) }),
    ]);
  }

  async click(target: Locator, label?: string) {
    await target.waitFor({ state: "visible" });
    const box = await this.moveTo(target, label);
    await pause(this.page, 250);
    this.log("click", { label, selector: describe(target), box });
    await this.page.evaluate(() => (window as unknown as { __demoCursor?: { click: () => void } }).__demoCursor?.click());
    await target.click();
    await pause(this.page, 300);
  }

  /** Select-all and type at a typist's pace. Logged as type-start / type-end for a jump cut. */
  async type(target: Locator, text: string, label?: string) {
    await this.click(target, label);
    await target.press("ControlOrMeta+a");
    await target.press("Backspace");
    const box = await this.clip?.boxOf(target);
    this.log("type-start", { label, selector: describe(target), box, data: { text } });
    await target.pressSequentially(text, { delay: PACE > 0 ? 75 : 0 });
    this.log("type-end", { label, selector: describe(target), box, data: { text } });
    await pause(this.page, 400);
  }

  /** Wait for a UI state, then log it as a result with its box. */
  async result(target: Locator, label: string, timeout = 90_000) {
    await target.waitFor({ state: "visible", timeout });
    await target.scrollIntoViewIfNeeded();
    const box = await this.clip?.boxOf(target);
    const ev = this.log("result", { label, selector: describe(target), box });
    if (ev && this.clip) await this.clip.still(ev);
    return box;
  }

  /** Hold still on screen (seconds), optionally pointing the cursor at what to read. */
  async hold(seconds: number, label?: string, target?: Locator) {
    if (target) await this.moveTo(target, label);
    const box = target ? await this.clip?.boxOf(target) : undefined;
    const ev = this.log("hold", { label, selector: target ? describe(target) : undefined, box, duration: seconds });
    const t = Date.now();
    if (ev && this.clip && seconds >= 1.5) await this.clip.still(ev);
    await pause(this.page, Math.max(0, seconds * 1000 - (Date.now() - t)));
  }

  /** Smooth-scroll so `target` sits near the top of the viewport; resolves when scrolling stops. */
  async scrollTo(target: Locator, label?: string, offset = 96) {
    const top = await target.evaluate((el, offset) => el.getBoundingClientRect().top + window.scrollY - offset, offset);
    this.log("scroll", { label, selector: describe(target), data: { top } });
    await this.page.evaluate(async (top) => {
      window.scrollTo({ top, behavior: "smooth" });
      let last = -1;
      let still = 0;
      while (still < 6) {
        await new Promise((r) => requestAnimationFrame(r));
        if (Math.abs(window.scrollY - last) < 0.5) still++;
        else still = 0;
        last = window.scrollY;
      }
    }, top);
    await pause(this.page, 300);
  }

  async goto(url: string, label?: string) {
    this.log("navigate", { label: label ?? url, data: { url } });
    await this.page.goto(url);
  }
}
