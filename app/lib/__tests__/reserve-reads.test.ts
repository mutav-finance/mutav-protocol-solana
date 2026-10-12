import { describe, expect, it } from "vitest";
import { composeLedger, EMPTY_ACCOUNTS, needs, PANEL_NEEDS, panelStatus, readStatus, type Panel, type ReadPart, type ReadStatus } from "../client/reserve-reads";

const reads = (o: Partial<Record<ReadPart, ReadStatus>> = {}): Record<ReadPart, ReadStatus> => ({ reserve: "ready", accounts: "ready", history: "ready", ...o });
const busy = Object.assign(new Error("Chain busy"), { busy: true });

describe("which read each panel needs", () => {
  it("only the history panels wait on the history read", () => {
    const onHistory = (Object.keys(PANEL_NEEDS) as Panel[]).filter((p) => needs(p).includes("history")).sort();
    expect(onHistory).toEqual(["flows", "overview.activity"]);
  });

  it("the overview hero, the capital split, risks, verify and the /capital figures need /api/reserve only", () => {
    for (const p of ["overview.hero", "overview.capital", "risks", "verify", "capital.figures", "capital.request", "landing"] as Panel[]) expect(needs(p)).toEqual(["reserve"]);
  });

  it("coverage, claims, the queue and the wallet's entries need the account reads, never the history", () => {
    for (const p of ["coverage", "claims", "queue", "capital.entries"] as Panel[]) expect(needs(p)).toEqual(["reserve", "accounts"]);
  });
});

describe("panelStatus with a 503 history read", () => {
  const r = reads({ history: "busy" });
  it("renders the hero, coverage and the queue", () => {
    for (const p of ["overview.hero", "overview.capital", "coverage", "claims", "queue", "capital.entries"] as Panel[]) expect(panelStatus(p, r)).toEqual({ status: "ready", waitingOn: null });
  });
  it("leaves only the history panels busy, waiting on history", () => {
    expect(panelStatus("overview.activity", r)).toEqual({ status: "busy", waitingOn: "history" });
    expect(panelStatus("flows", r)).toEqual({ status: "busy", waitingOn: "history" });
  });
  it("reports the cheapest missing read first", () => {
    expect(panelStatus("flows", reads({ accounts: "loading", history: "busy" }))).toEqual({ status: "loading", waitingOn: "accounts" });
  });
});

describe("readStatus", () => {
  it("is ready with data, even the last good value while busy", () => {
    expect(readStatus({ data: {}, error: null })).toBe("ready");
    expect(readStatus({ data: {}, error: busy, busy: true })).toBe("ready");
  });
  it("is loading before the first answer, busy on a 503, error otherwise", () => {
    expect(readStatus({ data: null, error: null })).toBe("loading");
    expect(readStatus({ data: null, error: busy })).toBe("busy");
    expect(readStatus({ data: null, error: new Error("HTTP 502") })).toBe("error");
  });
});

describe("composeLedger", () => {
  it("fills a missing half with empty lists and keeps what is in", () => {
    const g = [{ address: "G", data: {} }] as never;
    const l = composeLedger({ ...EMPTY_ACCOUNTS, guarantees: g }, null);
    expect(l.guarantees).toBe(g);
    expect(l.capitalEvents).toEqual([]);
    expect(l.fees).toEqual([]);
    expect(composeLedger(null, null)).toEqual({ guarantees: [], filings: [], deposits: [], redeems: [], fees: [], income: [], capitalEvents: [] });
  });
});

describe("usePoll: the first read never waits for a visible tab", async () => {
  const { shouldRead } = await import("../client/use-poll");
  it("reads first even in a hidden tab, then pauses while hidden", () => {
    expect(shouldRead(true, "hidden")).toBe(true);
    expect(shouldRead(false, "hidden")).toBe(false);
    expect(shouldRead(false, "visible")).toBe(true);
    expect(shouldRead(false, undefined)).toBe(true);
  });
});
