import { describe, expect, it } from "vitest";
import { coverageRequired, stressTerm } from "@mutav-finance/mutav-protocol-solana";
import { capitalSplit, claimSpeed, coverBars, coverageCeiling, flowBars, frac, navBasis, coverageMeter, type CoverageCeilingInput } from "../charts";
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
    const m = coverageMeter({ stableAssets: 28_300n * BRL, coverageRequired: 19_500n * BRL, freeCapital: 8_800n * BRL });
    expect(m).toMatchObject({ axis: 28_300n * BRL, backing: 19_500n * BRL, surplus: 8_800n * BRL, shortfall: 0n, underCovered: false });
    expect(m.coveredBps).toBe(14_512n);
  });

  it("shows the shortfall of an under-covered reserve on the same axis", () => {
    const m = coverageMeter({ stableAssets: 10_000n * BRL, coverageRequired: 15_000n * BRL, freeCapital: 0n });
    expect(m).toMatchObject({ axis: 15_000n * BRL, backing: 10_000n * BRL, surplus: 0n, shortfall: 5_000n * BRL, underCovered: true });
  });

  it("reports no coverage ratio when nothing is covered", () => {
    expect(coverageMeter({ stableAssets: 1n, coverageRequired: 0n, freeCapital: 1n }).coveredBps).toBeNull();
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

  it("splits covered stable assets into provisions, the rest of required and free capital", () => {
    const s = capitalSplit({ stableAssets: 58_700n * BRL, coverageRequired: 3_500n * BRL, freeCapital: 55_200n * BRL }, 3_200n * BRL);
    expect(s).toMatchObject({ provisions: 3_200n * BRL, restRequired: 300n * BRL, freeCapital: 55_200n * BRL, shortfall: 0n, axis: 58_700n * BRL });
    expect(s.provisions + s.restRequired + s.freeCapital).toBe(s.stableAssets);
  });

  it("holds the stress floor beyond provisions when it binds over the ratio (ADR 0022)", () => {
    // One lease, cover R$40k, nothing filed, stress buffer R$19k, c = 25%.
    const cover = 40_000n * BRL;
    const buffer = 19_000n * BRL;
    const byRatio = coverageRequired(cover, 2_500, 0n, 0n);
    const floor = stressTerm(cover, 0n, buffer);
    expect(byRatio).toBe(10_000n * BRL);
    expect(floor).toBe(19_000n * BRL);
    const required = coverageRequired(cover, 2_500, 0n, buffer);
    expect(required).toBe(19_000n * BRL);
    const s = capitalSplit({ stableAssets: 60_000n * BRL, coverageRequired: required, freeCapital: 41_000n * BRL }, 0n);
    expect(s).toMatchObject({ provisions: 0n, restRequired: 19_000n * BRL, freeCapital: 41_000n * BRL, shortfall: 0n });
    expect(s.provisions + s.restRequired + s.freeCapital).toBe(s.stableAssets);
  });

  it("commits every held unit and reports the shortfall when under-covered", () => {
    const s = capitalSplit({ stableAssets: 3_100n * BRL, coverageRequired: 3_500n * BRL, freeCapital: 0n }, 3_200n * BRL);
    expect(s).toMatchObject({ provisions: 3_100n * BRL, restRequired: 0n, freeCapital: 0n, shortfall: 400n * BRL, axis: 3_500n * BRL });
  });
});

describe("coverage ceiling (inverse of the register_guarantee gate)", () => {
  const base: CoverageCeilingInput = {
    stableAssets: 44_000n * BRL,
    coverageRatioBps: 2_500,
    provisions: 0n,
    stressBuffer: 19_000n * BRL,
    remainingCoverTotal: 144_000n * BRL,
    mode: 0,
    paused: false,
    frozen: false,
  };

  it("devnet today: R$44k at 25% carries R$176k, R$32k of headroom, the ratio binds", () => {
    const c = coverageCeiling(base);
    expect(c).toEqual({ ceiling: 176_000n * BRL, inUse: 144_000n * BRL, headroom: 32_000n * BRL, binding: "ratio", blockedBy: null });
    expect(coverageRequired(base.remainingCoverTotal, 2_500, 0n, base.stressBuffer)).toBe(36_000n * BRL);
  });

  it("the stress floor binds while the reserve is below provisions + stress buffer", () => {
    // S R$12k, P R$2k, B R$19k: P + B > S, so cover can grow only to S itself (ratio would allow R$48k).
    const c = coverageCeiling({ ...base, stableAssets: 12_000n * BRL, provisions: 2_000n * BRL, remainingCoverTotal: 5_000n * BRL });
    expect(c).toMatchObject({ ceiling: 12_000n * BRL, headroom: 7_000n * BRL, binding: "stress" });
    expect(coverageRequired(c.ceiling, 2_500, 2_000n * BRL, 19_000n * BRL)).toBeLessThanOrEqual(12_000n * BRL);
    expect(coverageRequired(c.ceiling + 1n, 2_500, 2_000n * BRL, 19_000n * BRL)).toBeGreaterThan(12_000n * BRL);
  });

  it("no headroom while paused, frozen, not NORMAL or below provisions", () => {
    for (const [over, why] of [
      [{ paused: true }, "paused"],
      [{ frozen: true }, "frozen"],
      [{ mode: 1 }, "under-covered"],
      [{ stableAssets: 1_000n * BRL, provisions: 2_000n * BRL }, "provisions"],
    ] as const) {
      const c = coverageCeiling({ ...base, ...over });
      expect(c.headroom).toBe(0n);
      expect(c.binding).toBe("blocked");
      expect(c.blockedBy).toBe(why);
    }
    // Below provisions the ceiling is today's cover: nothing can grow.
    expect(coverageCeiling({ ...base, stableAssets: 1_000n * BRL, provisions: 2_000n * BRL }).ceiling).toBe(base.remainingCoverTotal);
  });

  it("no headroom when cover already sits above the ceiling", () => {
    expect(coverageCeiling({ ...base, remainingCoverTotal: 200_000n * BRL }).headroom).toBe(0n);
  });

  it("parity with the client's coverageRequired over generated inputs", () => {
    let seed = 0x5eed_1234;
    const rand = (n: number) => {
      seed = (seed * 1_103_515_245 + 12_345) & 0x7fff_ffff;
      return BigInt(seed % n);
    };
    for (let k = 0; k < 2_000; k++) {
      const scale = [1n, 1_000n, BRL, 1_000n * BRL][k % 4]!;
      const S = rand(500_000) * scale + rand(1_000);
      const P = rand(4) === 0n ? S + rand(1_000) + 1n : (S * rand(101)) / 100n;
      const B = rand(3) === 0n ? 0n : rand(400_000) * scale;
      const c = Number(rand(10_000) + 1n);
      const X = rand(2_000_000) * scale;
      const out = coverageCeiling({ stableAssets: S, coverageRatioBps: c, provisions: P, stressBuffer: B, remainingCoverTotal: X, mode: 0, paused: false, frozen: false });
      if (S < P) {
        expect(out.binding).toBe("blocked");
        continue;
      }
      expect(coverageRequired(out.ceiling, c, P, B)).toBeLessThanOrEqual(S);
      expect(coverageRequired(out.ceiling + 1n, c, P, B)).toBeGreaterThan(S);
      expect(out.headroom).toBe(out.ceiling > X ? out.ceiling - X : 0n);
      // A lease of exactly the headroom passes the gate; one unit more does not.
      if (out.headroom > 0n) {
        expect(coverageRequired(X + out.headroom, c, P, B)).toBeLessThanOrEqual(S);
        expect(coverageRequired(X + out.headroom + 1n, c, P, B)).toBeGreaterThan(S);
      }
    }
  });

  it("matches the simulator's month 6: R$140,491.59 at 25% carries ~R$562.0k", () => {
    const c = coverageCeiling({ ...base, stableAssets: 140_491_590_000n, remainingCoverTotal: 0n });
    expect(c.ceiling).toBe(561_966_360_000n);
    expect(c.binding).toBe("ratio");
  });
});
