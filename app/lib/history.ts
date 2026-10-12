/**
 * Stable assets over time, rebuilt from the dated ledger. Starting from the
 * stable assets of the current read, each dated movement (guarantee fee,
 * issuer income, claim payment, queue fill) is undone in reverse order, which
 * gives the balance just after every movement. Undated rows (only a slot is
 * known) cannot be placed on a time axis: their effect stays in the opening
 * balance. Pure; no number is invented beyond these differences.
 */
import { brsToUsd, FX_SCALE } from "./format";
import type { FlowKind, FlowRow } from "./view";

export type HistoryStep = {
  /** Unix seconds of the movement. */
  at: bigint;
  /** Stable assets just after the movement, in BRS base units. */
  value: bigint;
  /** The movement itself: into the reserve (+) or out of it (−). */
  delta: bigint;
  kind: FlowKind;
};

export type History = {
  /** Stable assets before the earliest dated movement. */
  opening: bigint;
  /** Oldest first; the last step's value is `current`. */
  steps: HistoryStep[];
  current: bigint;
  now: bigint;
};

export function stableAssetsHistory(rows: Pick<FlowRow, "at" | "reserveDelta" | "kind">[], current: bigint, now: bigint): History {
  const dated = rows
    .filter((r): r is typeof r & { at: bigint } => r.at !== null)
    .map((r) => ({ at: r.at > now ? now : r.at, delta: r.reserveDelta, kind: r.kind }))
    // Newest first; a stable sort keeps same-second rows in ledger order.
    .sort((a, b) => (a.at === b.at ? 0 : a.at > b.at ? -1 : 1));
  const steps: HistoryStep[] = [];
  let after = current;
  for (const r of dated) {
    steps.push({ at: r.at, value: after, delta: r.delta, kind: r.kind });
    after -= r.delta;
  }
  steps.reverse();
  return { opening: after, steps, current, now };
}

export type HistoryPoint = { at: bigint; value: bigint; step: HistoryStep | null };

export type HistoryWindow = {
  start: bigint;
  end: bigint;
  /** Step points: each value holds from its `at` until the next point. The first is the value in effect at `start`. */
  points: HistoryPoint[];
  min: bigint;
  max: bigint;
};

const DAY = 86_400n;

/**
 * The part of the history inside the window ending at `now`. `span` null means
 * the whole history, padded a little before the first movement so the opening
 * balance shows. With no dated movement, the line is flat at `current`.
 */
export function historyWindow(h: History, span: bigint | null): HistoryWindow {
  const end = h.now;
  let start: bigint;
  if (span !== null) start = end - span;
  else if (h.steps.length === 0) start = end - 30n * DAY;
  else {
    const first = h.steps[0]!.at;
    const pad = (end - first) / 40n;
    start = first - (pad > DAY ? pad : DAY);
  }
  let open = h.opening;
  for (const s of h.steps) if (s.at <= start) open = s.value;
  const inside = h.steps.filter((s) => s.at > start);
  const points: HistoryPoint[] = [{ at: start, value: open, step: null }, ...inside.map((s) => ({ at: s.at, value: s.value, step: s }))];
  let min = open;
  let max = open;
  for (const p of points) {
    if (p.value < min) min = p.value;
    if (p.value > max) max = p.value;
  }
  return { start, end, points, min, max };
}

/** The point in effect at time `t` (the last one at or before it). */
export function pointAt(w: HistoryWindow, t: bigint): number {
  let i = 0;
  for (let j = 0; j < w.points.length; j++) if (w.points[j]!.at <= t) i = j;
  return i;
}

/**
 * Round tick values for a y-axis from 0 (or below, if the history dips under
 * it) to at least `max`: 1, 2 or 5 times a power of ten, about `count` steps.
 */
export function yTicks(min: bigint, max: bigint, count = 4): bigint[] {
  const lo = min < 0n ? min : 0n;
  const range = max - lo;
  if (range <= 0n) return [lo];
  const raw = range / BigInt(count) || 1n;
  let mag = 1n;
  while (mag * 10n <= raw) mag *= 10n;
  const step = [1n, 2n, 5n, 10n].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10n;
  const first = lo < 0n ? -(((-lo + step - 1n) / step) * step) : 0n;
  const ticks: bigint[] = [];
  for (let v = first; ; v += step) {
    ticks.push(v);
    if (v >= max) break;
  }
  return ticks;
}

/**
 * `yTicks` in the display unit, returned in BRS base units for positioning.
 * With a USD rate (`usdBrl`, BRL per US$1 × FX_SCALE) the round steps are
 * taken in dollars, then mapped back to BRS rounded up, so `fmtUsd` of each
 * tick reads the round dollar value again (US$ 0 / 5,000 / 10,000…).
 * Without a rate this is `yTicks` in BRS.
 */
export function displayTicks(min: bigint, max: bigint, usdBrl: bigint | null): bigint[] {
  if (!usdBrl) return yTicks(min, max);
  // Magnitude rounded up (`brsToUsd` truncates toward zero, so it lands back on the round value).
  const up = (n: bigint) => (n + FX_SCALE - 1n) / FX_SCALE;
  const toBrs = (usd: bigint) => (usd < 0n ? -up(-usd * usdBrl) : up(usd * usdBrl));
  return yTicks(brsToUsd(min, usdBrl), brsToUsd(max, usdBrl)).map(toBrs);
}
