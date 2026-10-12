import { describe, expect, it } from "vitest";
import { cachedInvestorRead, cachedRead, clearReadCache, FRESH_TTL_MS, MAX_INVESTOR_KEYS, READ_TTL_MS } from "../server/read-cache";
import { parseOwner } from "../server/owner";

describe("A2 in-process read cache", () => {
  it("reads the chain once per TTL, whatever the query string", async () => {
    clearReadCache();
    let reads = 0;
    let t = 0;
    const read = async () => ++reads;
    const now = () => t;
    expect(await cachedRead("k", read, { now })).toBe(1);
    t = READ_TTL_MS - 1;
    expect(await cachedRead("k", read, { now })).toBe(1);
    // A fresh read accepts a result up to 1 s old only.
    expect(await cachedRead("k", read, { now, fresh: true })).toBe(2);
    t += FRESH_TTL_MS - 1;
    expect(await cachedRead("k", read, { now, fresh: true })).toBe(2);
    t += READ_TTL_MS;
    expect(await cachedRead("k", read, { now })).toBe(3);
  });
  it("never caches a failure", async () => {
    clearReadCache();
    let n = 0;
    const read = async () => {
      n++;
      if (n === 1) throw new Error("rpc down");
      return n;
    };
    await expect(cachedRead("f", read, { now: () => 0 })).rejects.toThrow("rpc down");
    await Promise.resolve();
    expect(await cachedRead("f", read, { now: () => 1 })).toBe(2);
  });
});

describe("A2 investor entries cannot flush the route cache", () => {
  it("keeps the fixed keys however many distinct owners are read", async () => {
    clearReadCache();
    let reads = 0;
    const now = () => 0;
    const read = async () => ++reads;
    for (const k of ["reserve", "ledger", "operator", "squads"]) await cachedRead(k, read, { now });
    expect(reads).toBe(4);
    for (let i = 0; i < MAX_INVESTOR_KEYS * 3; i++) await cachedInvestorRead(`owner${i}`, async () => 0, { now });
    for (const k of ["reserve", "ledger", "operator", "squads"]) await cachedRead(k, read, { now });
    expect(reads).toBe(4);
  });
  it("evicts the least recently used owner past the bound", async () => {
    clearReadCache();
    let reads = 0;
    const now = () => 0;
    const read = async () => ++reads;
    await cachedInvestorRead("a", read, { now });
    for (let i = 1; i < MAX_INVESTOR_KEYS; i++) await cachedInvestorRead(`o${i}`, read, { now });
    // Touch "a" so "o1" is now the oldest, then overflow by one.
    await cachedInvestorRead("a", read, { now });
    const before = reads;
    await cachedInvestorRead("new", read, { now });
    await cachedInvestorRead("a", read, { now });
    expect(reads).toBe(before + 1);
    await cachedInvestorRead("o1", read, { now });
    expect(reads).toBe(before + 2);
  });
});

describe("investor ?owner= validation", () => {
  const wallet = "11111111111111111111111111111111";
  it("normalises blank to no owner and trims a valid address", () => {
    expect(parseOwner(null)).toBeNull();
    expect(parseOwner("  ")).toBeNull();
    expect(parseOwner(` ${wallet} `)).toBe(wallet);
  });
  it("rejects anything that is not an address", () => {
    for (const bad of ["x", "0".repeat(44), `${wallet}x`, "not an address at all"]) expect(parseOwner(bad)).toBeUndefined();
  });
});
