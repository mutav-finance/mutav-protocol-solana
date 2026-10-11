import { describe, expect, it } from "vitest";
import { cachedRead, clearReadCache, FRESH_TTL_MS, READ_TTL_MS } from "../server/read-cache";

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
