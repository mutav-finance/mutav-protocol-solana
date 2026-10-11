import { describe, expect, it } from "vitest";
import { baselineMemo, isLiveProposal, MAX_BASELINE_MEMO, parseBaselineMemo, staleCarry, staleCarryText } from "../config-diff";
import { scanIndices } from "../server/squads";
import { config, BRL } from "./fixtures";

describe("A3 proposal scan", () => {
  it("scans every index back to the first, bounded", () => {
    expect(scanIndices(3n)).toEqual([3n, 2n, 1n]);
    expect(scanIndices(0n)).toEqual([]);
    const many = scanIndices(1000n, 256);
    expect(many.length).toBe(256);
    expect(many[0]).toBe(1000n);
    expect(many.at(-1)).toBe(745n);
  });
  it("treats Approved as live even when stale; Active only while fresh", () => {
    expect(isLiveProposal({ status: "Approved", stale: true })).toBe(true);
    expect(isLiveProposal({ status: "Executing" })).toBe(true);
    expect(isLiveProposal({ status: "Active", stale: false })).toBe(true);
    expect(isLiveProposal({ status: "Active", stale: true })).toBe(false);
    for (const s of ["Executed", "Rejected", "Cancelled", "None"]) expect(isLiveProposal({ status: s })).toBe(false);
  });
});

describe("A3 stale-carry check", () => {
  const c = config();
  it("records the baseline of each written field and reads it back", () => {
    const memo = baselineMemo(["caps.max_tvl", "fee_take_bps"], c);
    expect(memo).toBe(`mutav set_config|caps.max_tvl=${100_000n * BRL};fee_take_bps=2000`);
    expect(parseBaselineMemo(memo)).toEqual({ "caps.max_tvl": String(100_000n * BRL), fee_take_bps: "2000" });
    expect(parseBaselineMemo("mutav unpause")).toBeNull();
    expect(parseBaselineMemo(null)).toBeNull();
  });
  it("drops the baseline rather than overflow the create transaction", () => {
    const fields = Array.from({ length: 40 }, () => "caps.max_claim_per_period");
    const memo = baselineMemo(fields, c);
    expect(memo.length).toBeLessThanOrEqual(MAX_BASELINE_MEMO);
    expect(parseBaselineMemo(memo)).toBeNull();
  });
  it("flags a field that moved since the proposal was made", () => {
    const baseline = parseBaselineMemo(baselineMemo(["caps.max_tvl", "fee_take_bps"], c))!;
    expect(staleCarry(baseline, c)).toEqual([]);
    const moved = staleCarry(baseline, config({ feeTakeBps: 1_500 } as never));
    expect(moved).toEqual([{ field: "fee_take_bps", from: "2000", to: "1500" }]);
    expect(staleCarryText(7n, moved)).toMatch(/#7 .*fee_take_bps was 2000, is 1500 now.*reject or cancel #7/);
  });
});
