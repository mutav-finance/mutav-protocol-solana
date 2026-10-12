import { describe, expect, it } from "vitest";
import { historyWindow, pointAt, stableAssetsHistory, yTicks } from "../history";
import type { FlowRow } from "../view";

const DAY = 86_400n;
const NOW = 1_000n * DAY;
const row = (kind: FlowRow["kind"], ago: bigint | null, reserveDelta: bigint) => ({ kind, at: ago === null ? null : NOW - ago * DAY, reserveDelta });

// Newest first, as moneyFlows returns them.
const rows = [row("fee", 5n, 400n), row("claim", 19n, -2_500n), row("deposit", 59n, 50_000n), row("fee", 70n, 1_000n)];

describe("stableAssetsHistory", () => {
  it("walks the ledger back from current stable assets", () => {
    const h = stableAssetsHistory(rows, 48_900n, NOW);
    expect(h.steps.map((s) => s.value)).toEqual([1_000n, 51_000n, 48_500n, 48_900n]);
    expect(h.steps.map((s) => s.kind)).toEqual(["fee", "deposit", "claim", "fee"]);
    expect(h.opening).toBe(0n);
    expect(h.steps.at(-1)!.value).toBe(h.current);
  });

  it("keeps undated rows in the opening balance", () => {
    const h = stableAssetsHistory([...rows, row("income", null, 300n)], 49_200n, NOW);
    expect(h.steps).toHaveLength(4);
    expect(h.opening).toBe(300n);
  });

  it("is flat with no dated movement", () => {
    const h = stableAssetsHistory([], 10n, NOW);
    expect(h.steps).toEqual([]);
    expect(h.opening).toBe(10n);
    const w = historyWindow(h, null);
    expect(w.points).toEqual([{ at: NOW - 30n * DAY, value: 10n, step: null }]);
  });

  it("does not depend on input order", () => {
    const a = stableAssetsHistory(rows, 48_900n, NOW);
    const b = stableAssetsHistory([...rows].reverse(), 48_900n, NOW);
    expect(b).toEqual(a);
  });
});

describe("historyWindow", () => {
  const h = stableAssetsHistory(rows, 48_900n, NOW);

  it("opens a period with the balance in effect at its start", () => {
    const w = historyWindow(h, 30n * DAY);
    expect(w.start).toBe(NOW - 30n * DAY);
    expect(w.end).toBe(NOW);
    expect(w.points.map((p) => p.value)).toEqual([51_000n, 48_500n, 48_900n]);
    expect(w.points[0]!.step).toBeNull();
    expect(w.min).toBe(48_500n);
    expect(w.max).toBe(51_000n);
  });

  it("shows the whole history, padded before the first movement", () => {
    const w = historyWindow(h, null);
    expect(w.start).toBeLessThan(NOW - 70n * DAY);
    expect(w.points[0]!.value).toBe(0n);
    expect(w.points).toHaveLength(5);
  });

  it("finds the point in effect at a time", () => {
    const w = historyWindow(h, 30n * DAY);
    expect(pointAt(w, NOW - 25n * DAY)).toBe(0);
    expect(pointAt(w, NOW - 10n * DAY)).toBe(1);
    expect(pointAt(w, NOW)).toBe(2);
  });
});

describe("yTicks", () => {
  it("steps from zero past the max on round values", () => {
    expect(yTicks(0n, 51_000n)).toEqual([0n, 20_000n, 40_000n, 60_000n]);
    expect(yTicks(48_500n, 51_000n)).toEqual([0n, 20_000n, 40_000n, 60_000n]);
  });

  it("reaches below zero when the history does", () => {
    const t = yTicks(-1_500n, 9_000n);
    expect(t[0]).toBeLessThanOrEqual(-1_500n);
    expect(t.at(-1)).toBeGreaterThanOrEqual(9_000n);
  });

  it("handles a flat zero line", () => {
    expect(yTicks(0n, 0n)).toEqual([0n]);
  });
});
