import { describe, expect, it } from "vitest";
import { brsToUsd, elapsed, fmtAgeShort, fmtBps, fmtBrs, fmtFxDate, fmtUsd, fmtUsdHint, fxSourceLine, liveLine, toScaledRate, fmtDuration, fmtNav, fmtPct, fmtPctOf, fmtRatio, fmtShares, fmtStamp, fmtTime, fmtUnits, parseBrs, shortAddr } from "../format";
import { capacityLeft } from "../charts";

describe("format", () => {
  it("formats BRS with grouping and truncation", () => {
    expect(fmtBrs(12_345_678_901n)).toBe("R$\u00a012,345.67");
    expect(fmtBrs(0n)).toBe("R$\u00a00.00");
    expect(fmtBrs(999_999n)).toBe("R$\u00a00.99");
    expect(fmtUnits(-1_500_000n, 6)).toBe("-1.50");
  });
  it("formats shares and NAV", () => {
    expect(fmtShares(1_000_000n)).toBe("1.00");
    expect(fmtNav(1_000_000_000n)).toBe("1.000000");
    expect(fmtNav(1_012_345_678n)).toBe("1.012345");
    expect(fmtNav(0n)).toBe("—");
  });
  it("formats bps, ratios and durations", () => {
    expect(fmtBps(2_000)).toBe("20.0%");
    expect(fmtBps(10_000)).toBe("100.0%");
    expect(fmtBps(5)).toBe("0.1%");
    expect(fmtBps(4)).toBe("0.0%");
    expect(fmtRatio(150n, 100n)).toBe("150.0%");
    expect(fmtRatio(1n, 0n)).toBe("—");
    expect(fmtDuration(38n)).toBe("38s");
    expect(fmtDuration(3_720n)).toBe("1h 02m");
    expect(fmtDuration(183_600n)).toBe("2d 03h");
  });
  it("formats times and addresses", () => {
    expect(fmtTime(0n)).toBe("—");
    expect(fmtTime(1_791_331_200n)).toBe("2026-10-07 00:00:00 UTC");
  });
  it("formats claim timestamps to the second and the filed → settled time", () => {
    expect(fmtStamp(1_791_331_207n)).toBe("2026-10-07 00:00:07");
    expect(fmtStamp(0n)).toBe("—");
    expect(elapsed(1_791_331_200n, null)).toBeNull();
    const s = elapsed(1_791_331_200n, 1_791_331_200n + 312n);
    expect(s).toBe(312n);
    expect(fmtDuration(s!)).toBe("5m 12s");
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
  it("prints a configured rate with at most one decimal and no trailing .0", () => {
    expect([fmtPct(10_000), fmtPct(5_000), fmtPct(2_500), fmtPct(2_550), fmtPct(250), fmtPct(0)]).toEqual(["100%", "50%", "25%", "25.5%", "2.5%", "0%"]);
    // One decimal, rounded half up: 12.25% → 12.3%, 12.24% → 12.2%.
    expect([fmtPct(1_225), fmtPct(1_224)]).toEqual(["12.3%", "12.2%"]);
  });
});

describe("one % formatter: one decimal, rounded half up", () => {
  it("rounds shares of a whole half up, not down", () => {
    // The Overview donut: 2/11 and 9/11 of the reserve (18.1818…% / 81.8181…%).
    expect(fmtPctOf(2n, 11n)).toBe("18.2%");
    expect(fmtPctOf(9n, 11n)).toBe("81.8%");
    expect(fmtPctOf(1n, 8n)).toBe("12.5%");
    expect(fmtPctOf(1n, 16n)).toBe("6.3%"); // 6.25 → 6.3
    expect(fmtPctOf(0n, 5n)).toBe("0.0%");
    expect(fmtPctOf(5n, 5n)).toBe("100.0%");
    expect(fmtPctOf(1n, 0n)).toBe("—");
  });
  it("shows coverage multiples as a percentage", () => {
    // 36,000 held against 29,454.54… required.
    expect(fmtRatio(36_000_000_000n, 29_454_545_454n)).toBe("122.2%");
    expect(fmtRatio(12_000n, 1n)).toBe("1,200,000.0%");
  });
  it("keeps negatives symmetric", () => {
    expect(fmtPctOf(-1n, 16n)).toBe("-6.3%");
  });
  it("drives capacity left on the coverage ceiling", () => {
    expect(capacityLeft({ ceiling: 11n, headroom: 2n, blockedBy: null })).toBe("18.2%");
    expect(capacityLeft({ ceiling: 11n, headroom: 2n, blockedBy: "paused" })).toBe("0.0%");
  });
});

describe("money and shares", () => {
  it("shows every amount with 2 decimals, whole reais only when asked (chart axes)", () => {
    expect(fmtBrs(0n)).toBe("R$\u00a00.00");
    expect(fmtBrs(144_000_000_000n)).toBe("R$\u00a0144,000.00");
    expect(fmtBrs(144_000_990_000n, 0)).toBe("R$\u00a0144,000");
  });
  it("rounds share quantities half up to 2 places", () => {
    expect(fmtShares(35_833_333_333n)).toBe("35,833.33");
    expect(fmtShares(35_833_335_000n)).toBe("35,833.34");
    expect(fmtShares(0n)).toBe("0.00");
    expect(fmtShares(4_999n)).toBe("0.00");
    expect(fmtShares(5_000n)).toBe("0.01");
  });
});

describe("the /reserve read line", () => {
  const now = 1_791_331_200n;
  it("says Live, with the pulse, only while the on-chain refresh is under 10 minutes old", () => {
    expect(liveLine(now, now - 30n)).toEqual({ fresh: true, text: "Live · read every 10 s" });
    expect(liveLine(now, now - 599n).fresh).toBe(true);
  });
  it("names the stale refresh without claiming Live", () => {
    expect(liveLine(now, now - 13n * 3_600n - 120n)).toEqual({ fresh: false, text: "Read every 10 s · last on-chain refresh 13h ago" });
    expect(liveLine(now, now - 600n).text).toBe("Read every 10 s · last on-chain refresh 10m ago");
    expect(liveLine(now, 0n)).toEqual({ fresh: false, text: "Read every 10 s · not yet refreshed on-chain" });
    expect(fmtAgeShort(2n * 86_400n + 5n)).toBe("2d");
  });
});

describe("fmtUsd", () => {
  it("converts BRS at the USD/BRL rate, truncating", () => {
    expect(brsToUsd(5_400_000n, 5_400_000n)).toBe(1_000_000n);
    expect(fmtUsd(58_700_000_000n, 5_400_000n)).toBe("US$\u00a010,870.37");
    expect(fmtUsd(1n, 5_400_000n)).toBe("US$\u00a00.00");
  });
});

describe("US$ hint", () => {
  it("scales a rate to a bigint whatever form it arrives in", () => {
    expect(toScaledRate(4_989_200n)).toBe(4_989_200n);
    expect(toScaledRate(4.9892)).toBe(4_989_200n);
    expect(toScaledRate("5.40")).toBe(5_400_000n);
    for (const bad of [0, -1, NaN, Infinity, "x", null, undefined, 0n, {}]) expect(toScaledRate(bad)).toBeNull();
  });

  it("formats with a bigint rate", () => {
    expect(fmtUsdHint(58_700_000_000n, 5_400_000n)).toBe("≈ US$\u00a010,870.37");
  });

  it("formats with a numeric rate (no BigInt/number mixing)", () => {
    expect(fmtUsdHint(58_700_000_000n, 5.4)).toBe("≈ US$\u00a010,870.37");
    expect(fmtUsdHint(4_989_200n, 4.9892)).toBe("≈ US$\u00a01.00");
  });

  it("carries a sign, given or from a negative amount", () => {
    expect(fmtUsdHint(5_400_000n, 5_400_000n, "+")).toBe("≈ +US$\u00a01.00");
    expect(fmtUsdHint(5_400_000n, 5_400_000n, "−")).toBe("≈ −US$\u00a01.00");
    expect(fmtUsdHint(-5_400_000n, 5_400_000n)).toBe("≈ −US$\u00a01.00");
  });

  it("is empty without a usable rate", () => {
    expect(fmtUsdHint(5_400_000n, null)).toBe("");
    expect(fmtUsdHint(5_400_000n, 0)).toBe("");
  });

  it("writes the source line with the quote's own date", () => {
    expect(fmtFxDate("2026-10-09T13:07:30-03:00")).toBe("2026-10-09");
    expect(fxSourceLine({ source: "PTAX/BCB", asOf: "2026-10-09T13:07:30-03:00" })).toBe(
      "US$ at PTAX (Banco Central do Brasil), 2026-10-09. Display only; the reserve holds BRS.",
    );
    expect(fxSourceLine({ source: "mock rate", asOf: "2026-10-12T10:00:00-03:00" })).toBe("US$ at mock rate, 2026-10-12. Display only; the reserve holds BRS.");
  });
});
