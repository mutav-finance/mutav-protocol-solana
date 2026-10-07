import { describe, expect, it } from "vitest";
import { claimCap, claimCapRefusal, claimWork, DUTIES, instructionName, payoutsDue } from "../operator";
import { instructionsBy } from "../roles";
import type { ClaimRow } from "../view";
import { BRL, config } from "./fixtures";

const c = config(); // 10,000 per call, 20,000 per 30-day period

describe("claim-payment cap window", () => {
  it("counts what was paid in an open window", () => {
    const cap = claimCap(c, { claimPeriodStart: 1_000n, claimPeriodPaid: 12_500n * BRL }, 2_000n);
    expect(cap).toMatchObject({ paid: 12_500n * BRL, remaining: 7_500n * BRL, rolled: false, windowEnd: 1_000n + 2_592_000n, maxNextPayment: 7_500n * BRL });
  });

  it("treats an ended window as rolled, as pay_claim will", () => {
    const cap = claimCap(c, { claimPeriodStart: 1_000n, claimPeriodPaid: 20_000n * BRL }, 1_000n + 2_592_000n);
    expect(cap).toMatchObject({ paid: 0n, remaining: 20_000n * BRL, rolled: true, maxNextPayment: 10_000n * BRL });
  });

  it("has no window before the first payment", () => {
    expect(claimCap(c, { claimPeriodStart: 0n, claimPeriodPaid: 0n }, 5n)).toMatchObject({ windowStart: null, windowEnd: null, remaining: 20_000n * BRL });
  });

  it("previews which cap a payment would hit", () => {
    const cap = claimCap(c, { claimPeriodStart: 1n, claimPeriodPaid: 15_000n * BRL }, 2n);
    expect(claimCapRefusal(cap, 11_000n * BRL)).toBe("ClaimCallCapExceeded");
    expect(claimCapRefusal(cap, 6_000n * BRL)).toBe("ClaimPeriodCapExceeded");
    expect(claimCapRefusal(cap, 5_000n * BRL)).toBeNull();
  });
});

describe("payouts against the SLA", () => {
  const row = (filing: string, stage: ClaimRow["stage"], paidAt: bigint | null, lateOnChain = false, overdue = false) =>
    ({ filing, guaranteeId: "g", leg: "default", amount: 1n, stage, paidAt, lateOnChain, overdue }) as ClaimRow;

  it("lists paid, unsettled payouts by due date, with time left and late flags", () => {
    const due = payoutsDue([row("A", "paid", 500n), row("B", "settled", 100n), row("C", "paid", 100n), row("D", "filed", null)], 300n, 450n);
    expect(due.map((d) => [d.filing, d.dueAt, d.secondsLeft, d.late])).toEqual([
      ["C", 400n, -50n, true],
      ["A", 800n, 350n, false],
    ]);
  });

  it("counts the operator's open work", () => {
    expect(claimWork([row("A", "filed", null), row("B", "paid", 1n, false, true), row("C", "settled", 1n, true)])).toEqual({ toPay: 1, toSettle: 1, late: 2 });
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
