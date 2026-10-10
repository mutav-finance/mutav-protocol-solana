import { describe, expect, it } from "vitest";
import { claimSpeed, coverBars, flowBars, frac, navBasis, solvencyMeter } from "../charts";
import type { ClaimRow, CoverageRow } from "../view";
import { BRL } from "./fixtures";

describe("chart shaping", () => {
  it("frac clamps to [0, 1] and survives a zero axis", () => {
    expect(frac(1n, 4n)).toBe(0.25);
    expect(frac(5n, 4n)).toBe(1);
    expect(frac(1n, 0n)).toBe(0);
    expect(frac(-1n, 4n)).toBe(0);
  });

  it("splits a covered reserve into backing and surplus", () => {
    const m = solvencyMeter({ stableAssets: 28_300n * BRL, coverageRequired: 19_500n * BRL, freeCapital: 8_800n * BRL });
    expect(m).toMatchObject({ axis: 28_300n * BRL, backing: 19_500n * BRL, surplus: 8_800n * BRL, shortfall: 0n, underCovered: false });
    expect(m.coveredBps).toBe(14_512n);
  });

  it("shows the shortfall of an under-covered reserve on the same axis", () => {
    const m = solvencyMeter({ stableAssets: 10_000n * BRL, coverageRequired: 15_000n * BRL, freeCapital: 0n });
    expect(m).toMatchObject({ axis: 15_000n * BRL, backing: 10_000n * BRL, surplus: 0n, shortfall: 5_000n * BRL, underCovered: true });
  });

  it("reports no coverage ratio when nothing is covered", () => {
    expect(solvencyMeter({ stableAssets: 1n, coverageRequired: 0n, freeCapital: 1n }).coveredBps).toBeNull();
  });

  it("splits stable assets into net assets and provisions", () => {
    expect(navBasis({ stableAssets: 100n, netAssets: 70n })).toEqual({ stableAssets: 100n, netAssets: 70n, provisions: 30n });
  });

  it("charts active guarantees only, largest first, capped", () => {
    const row = (address: string, d: bigint, e: bigint, active = true) => ({ address, id: address, defaultRemaining: d, exitRemaining: e, remaining: d + e, active }) as CoverageRow;
    const out = coverBars([row("a", 1n, 1n), row("b", 5n, 0n), row("c", 9n, 9n, false), row("d", 3n, 0n)], 2);
    expect(out.bars.map((b) => b.address)).toEqual(["b", "d"]);
    expect(out.axis).toBe(5n);
    expect(out.hidden).toBe(1);
  });

  it("measures claim speed from on-chain timestamps, including pending time so far", () => {
    const base = { guarantee: "G", guaranteeId: "g", leg: "default", noticeRefHash: "", provision: 0n, amount: 0n, pixE2eHash: null } as const;
    const rows = [
      { ...base, filing: "F2", filedAt: 200n, paidAt: 260n, settledAt: null, stage: "paid", fileToPay: 60n, payToSettle: null },
      { ...base, filing: "F1", filedAt: 100n, paidAt: 110n, settledAt: 140n, stage: "settled", fileToPay: 10n, payToSettle: 30n },
      { ...base, filing: "F3", filedAt: 300n, paidAt: null, settledAt: null, stage: "filed", fileToPay: null, payToSettle: null },
    ] as ClaimRow[];
    const s = claimSpeed(rows, 400n);
    expect(s.claims.map((c) => [c.filing, c.fileToPay, c.payToSettle, c.pending])).toEqual([
      ["F1", 10n, 30n, false],
      ["F2", 60n, 140n, true],
      ["F3", null, null, false],
    ]);
    expect(s.payAxis).toBe(60n);
    expect(s.settleAxis).toBe(140n);
  });

  it("totals flows by kind with the role that moved them", () => {
    const { bars, axis } = flowBars({ feesNetToReserve: 800n, feeTakeToTreasury: 200n, incomeNetToReserve: 1_500n, claimsPaid: 2_500n, depositsIn: 0n, redemptionsOut: 0n });
    expect(axis).toBe(2_500n);
    expect(bars.find((b) => b.key === "claims")).toMatchObject({ direction: "out", by: "operator", source: "state" });
    expect(bars.find((b) => b.key === "deposits")).toMatchObject({ direction: "in", by: "admin", requestedBy: "investor", source: "events" });
    expect(bars.find((b) => b.key === "take")).toMatchObject({ direction: "outside" });
    // ADR 0017: issuer income flows in, swept by the operator; there is no take on it (ADR 0019).
    expect(bars.find((b) => b.key === "income")).toMatchObject({ direction: "in", by: "operator", amount: 1_500n, source: "state" });
  });
});
