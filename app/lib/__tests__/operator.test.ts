import { describe, expect, it } from "vitest";
import { claimCap, claimCapRefusal, claimWork, DUTIES, instructionName } from "../operator";
import { instructionsBy } from "../roles";
import type { ClaimRow } from "../view";
import { BRL, config } from "./fixtures";

const c = config(); // 10,000 per call, 20,000 per 31 days

describe("claim-payment cap window (31 daily buckets, ADR 0019)", () => {
  const DAY = 86_400n;
  const d0 = 20_000n;
  const ring = (entries: [bigint, bigint][]) => {
    const b = Array(31).fill(0n) as bigint[];
    for (const [day, v] of entries) b[Number(day % 31n)] = v;
    return b;
  };

  it("counts what was paid in the last 31 days", () => {
    const s = { claimDayBuckets: ring([[d0, 12_500n * BRL]]), claimDayAnchor: d0 };
    const cap = claimCap(c, s, (d0 + 30n) * DAY);
    expect(cap).toMatchObject({ paid: 12_500n * BRL, remaining: 7_500n * BRL, maxNextPayment: 7_500n * BRL });
  });

  it("drops a day once it leaves the window, as pay_claim will", () => {
    const s = { claimDayBuckets: ring([[d0, 20_000n * BRL]]), claimDayAnchor: d0 };
    expect(claimCap(c, s, (d0 + 31n) * DAY)).toMatchObject({ paid: 0n, remaining: 20_000n * BRL, maxNextPayment: 10_000n * BRL });
  });

  it("previews which cap a payment would hit", () => {
    const cap = claimCap(c, { claimDayBuckets: ring([[d0, 15_000n * BRL]]), claimDayAnchor: d0 }, d0 * DAY);
    expect(claimCapRefusal(cap, 11_000n * BRL)).toBe("ClaimCallCapExceeded");
    expect(claimCapRefusal(cap, 6_000n * BRL)).toBe("ClaimPeriodCapExceeded");
    expect(claimCapRefusal(cap, 5_000n * BRL)).toBeNull();
  });
});

describe("operator work", () => {
  const row = (filing: string, stage: ClaimRow["stage"], paidAt: bigint | null) =>
    ({ filing, guaranteeId: "g", leg: "default", amount: 1n, stage, paidAt }) as ClaimRow;

  it("counts the operator's open work", () => {
    expect(claimWork([row("A", "filed", null), row("B", "paid", 1n), row("C", "settled", 1n)])).toEqual({ toPay: 1, toSettle: 1 });
  });
});

describe("duties and activity", () => {
  it("documents every operator instruction, in the role map's order", () => {
    expect(DUTIES.map((d) => d.ix)).toEqual(instructionsBy("operator"));
  });

  it("names an instruction by its discriminator", () => {
    const table = [["a", [1, 2]], ["b", [3, 4]]] as const;
    expect(instructionName(new Uint8Array([3, 4, 9]), table)).toBe("b");
    expect(instructionName(new Uint8Array([7]), table)).toBe("unknown");
  });
});
