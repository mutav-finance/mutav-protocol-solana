import { describe, expect, it } from "vitest";
import { operatorDay } from "../operator";
import { paymentsAlerts, type PaymentsFacts } from "../view";
import { parseHundredths, parseUnitsOrZero, toInput } from "../format";
import { randomRef, REF } from "../refs";

const NOW = 1_000_000n;
const OP = "OperatorKey11111111111111111111111111111111";
const MINT = "BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4";

describe("operator activity, last 24 h", () => {
  it("counts what happened inside the window only", () => {
    const g = (registeredAt: bigint, closedAt = 0n) => ({ data: { registeredAt, closedAt, defaultCover: 3n, exitCover: 1n } });
    const f = (filedAt: bigint, paidAt = 0n, paidAmount = 0n) => ({ data: { filedAt, provision: 5n, paidAt, paidAmount, status: paidAt ? 1 : 0 } });
    const day = operatorDay(
      { guarantees: [g(NOW - 10n), g(NOW - 100_000n, NOW - 5n)], filings: [f(NOW - 1n, NOW, 5n), f(NOW - 90_000n)], fees: [{ data: { net: 8n, take: 2n }, blockTime: NOW - 3n }, { data: { net: 1n, take: 0n }, blockTime: null }] },
      NOW,
    );
    expect(day.registered).toEqual({ count: 1, cover: 4n });
    expect(day.closed.count).toBe(1);
    expect(day.filed).toEqual({ count: 1, amount: 5n });
    expect(day.paid).toEqual({ count: 1, amount: 5n });
    expect(day.fees).toEqual({ count: 1, amount: 10n });
  });
});

describe("payments-account watcher", () => {
  const ok: PaymentsFacts = { exists: true, owner: "Owner1", mint: MINT, delegate: null, closeAuthority: null, frozen: false, expectedOwner: "Owner1" };
  const c = { operator: OP, reserveMint: MINT } as never;
  it("is quiet when everything matches", () => {
    expect(paymentsAlerts(ok, c)).toEqual([]);
    expect(paymentsAlerts(undefined, c)).toEqual([]);
  });
  it("flags an owner change, an operator-owned account, delegates, close authorities and freezes", () => {
    expect(paymentsAlerts({ ...ok, owner: "Owner2" }, c).join()).toMatch(/owner changed/);
    expect(paymentsAlerts({ ...ok, owner: OP, expectedOwner: null }, c).join()).toMatch(/operator key/);
    expect(paymentsAlerts({ ...ok, delegate: "D" }, c).join()).toMatch(/delegate/);
    expect(paymentsAlerts({ ...ok, closeAuthority: "X" }, c).join()).toMatch(/close authority/);
    expect(paymentsAlerts({ ...ok, frozen: true }, c).join()).toMatch(/frozen/);
    expect(paymentsAlerts({ ...ok, exists: false }, c)).toEqual(["the payments account does not exist"]);
  });
});

describe("A8 and data minimization", () => {
  it("parses cover multiples exactly, without float", () => {
    expect(parseHundredths("1.15")).toBe(115n);
    expect(parseHundredths("3")).toBe(300n);
    expect(parseHundredths("0")).toBe(0n);
    expect(parseHundredths("1.155")).toBeNull();
    expect(parseHundredths("-1")).toBeNull();
  });
  it("accepts 0 as a price limit (none), and real amounts", () => {
    expect(parseUnitsOrZero("0")).toBe(0n);
    expect(parseUnitsOrZero("0.00")).toBe(0n);
    expect(parseUnitsOrZero("1.5")).toBe(1_500_000n);
    expect(parseUnitsOrZero("abc")).toBeNull();
    expect(parseUnitsOrZero("")).toBeNull();
  });
  it("writes base units back as exact input", () => {
    expect(toInput(1_500_000n)).toBe("1.5");
    expect(toInput(2_000_000_000n)).toBe("2000");
    expect(toInput(1n)).toBe("0.000001");
  });
  it("agency ids are random, refs hashes are salted", async () => {
    const a = randomRef();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(randomRef()).not.toBe(a);
    expect(await REF.refsHash("lease-1", "aa")).not.toBe(await REF.refsHash("lease-1", "bb"));
    expect(REF).not.toHaveProperty("agencyId");
  });
});
