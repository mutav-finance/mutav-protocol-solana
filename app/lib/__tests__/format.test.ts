import { describe, expect, it } from "vitest";
import { fmtBps, fmtBrs, fmtDuration, fmtNav, fmtPct, fmtRatio, fmtShares, fmtTime, fmtUnits, parseBrs, shortAddr } from "../format";

describe("format", () => {
  it("formats BRS with grouping and truncation", () => {
    expect(fmtBrs(12_345_678_901n)).toBe("R$ 12,345.67");
    expect(fmtBrs(0n)).toBe("R$ 0.00");
    expect(fmtBrs(999_999n)).toBe("R$ 0.99");
    expect(fmtUnits(-1_500_000n, 6)).toBe("-1.50");
  });
  it("formats shares and NAV", () => {
    expect(fmtShares(1_000_000n)).toBe("1.000000");
    expect(fmtNav(1_000_000_000n)).toBe("1.000000");
    expect(fmtNav(1_012_345_678n)).toBe("1.012345");
    expect(fmtNav(0n)).toBe("—");
  });
  it("formats bps, ratios and durations", () => {
    expect(fmtBps(2_000)).toBe("20.00%");
    expect(fmtBps(10_000)).toBe("100.00%");
    expect(fmtBps(5)).toBe("0.05%");
    expect(fmtRatio(150n, 100n)).toBe("150.0%");
    expect(fmtRatio(1n, 0n)).toBe("—");
    expect(fmtDuration(38n)).toBe("38s");
    expect(fmtDuration(3_720n)).toBe("1h 02m");
    expect(fmtDuration(183_600n)).toBe("2d 03h");
  });
  it("formats times and addresses", () => {
    expect(fmtTime(0n)).toBe("—");
    expect(fmtTime(1_791_331_200n)).toBe("2026-10-07 00:00:00 UTC");
    expect(shortAddr("8scC79jkU7SPM9v6M4nB833R8EeqKknfwdRdjn73Qqv9")).toBe("8scC…Qqv9");
  });
  it("parses BRS input exactly", () => {
    expect(parseBrs("1,234.5")).toBe(1_234_500_000n);
    expect(parseBrs("0.000001")).toBe(1n);
    expect(parseBrs("0.0000001")).toBeNull();
    expect(parseBrs("0")).toBeNull();
    expect(parseBrs("-1")).toBeNull();
    expect(parseBrs("")).toBeNull();
  });
});

describe("fmtPct", () => {
  it("prints whole and fractional percentages without trailing zeros", () => {
    expect([fmtPct(10_000), fmtPct(5_000), fmtPct(2_550), fmtPct(0)]).toEqual(["100%", "50%", "25.5%", "0%"]);
  });
});
