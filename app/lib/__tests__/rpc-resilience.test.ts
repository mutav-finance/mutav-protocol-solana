import { afterEach, describe, expect, it, vi } from "vitest";
import { SolanaError, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR } from "@solana/kit";
import { cachedRead, clearReadCache, COOLDOWN_MS, READ_TTL_MS, STALE_MAX_MS } from "../server/read-cache";
import {
  isUpstreamError,
  MAX_QUEUE_MS,
  MethodScheduler,
  retryingTransport,
  RpcBusyError,
  schedulerFor,
  WINDOW_MS,
  withRateLimitRetry,
} from "../server/rpc-retry";
import { nextDelay, MAX_BACKOFF_MS } from "../client/use-poll";

/** The error kit's HTTP transport throws on a 429 (Solana error #8100002). */
const http = (statusCode: number, retryAfter?: string) =>
  new SolanaError(SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR, {
    headers: new Headers(retryAfter ? { "retry-after": retryAfter } : {}),
    message: statusCode === 429 ? "Too Many Requests" : "Bad Gateway",
    statusCode,
  });
const tooMany = () => http(429);

const noSleep = { sleep: async () => {}, random: () => 0.5 };

describe("429 retry (rpc-retry)", () => {
  it("retries a 429 and returns the success", async () => {
    let calls = 0;
    const waits: number[] = [];
    const v = await withRateLimitRetry(
      async () => {
        if (++calls < 3) throw tooMany();
        return "ok";
      },
      { sleep: async (ms) => void waits.push(ms), random: () => 0.5 },
    );
    expect(v).toBe("ok");
    expect(calls).toBe(3);
    // Exponential with jitter: the second wait is longer than the first.
    expect(waits).toHaveLength(2);
    expect(waits[1]!).toBeGreaterThan(waits[0]!);
  });
  it("gives up after the retry budget and surfaces the 429", async () => {
    let calls = 0;
    await expect(
      withRateLimitRetry(async () => {
        calls++;
        throw tooMany();
      }, noSleep),
    ).rejects.toSatisfy(isUpstreamError);
    expect(calls).toBe(4);
  });
  it("never retries anything but a 429", async () => {
    let calls = 0;
    await expect(
      withRateLimitRetry(async () => {
        calls++;
        throw new Error("custom program error: 0x1771");
      }, noSleep),
    ).rejects.toThrow("0x1771");
    expect(calls).toBe(1);
  });
  it("honours Retry-After, capped", async () => {
    const waits: number[] = [];
    let calls = 0;
    await withRateLimitRetry(
      async () => {
        if (++calls === 1) throw http(429, "1");
        return 1;
      },
      { sleep: async (ms) => void waits.push(ms), random: () => 0 },
    );
    expect(waits[0]).toBe(1000);
  });
  it("wraps a kit transport", async () => {
    let calls = 0;
    const inner = (async () => {
      if (++calls === 1) throw tooMany();
      return { jsonrpc: "2.0", id: 1, result: 7 };
    }) as never;
    const t = retryingTransport(inner, noSleep);
    expect(await t({ payload: {}, signal: undefined } as never)).toEqual({ jsonrpc: "2.0", id: 1, result: 7 });
    expect(calls).toBe(2);
  });
  it("classifies upstream errors", () => {
    expect(isUpstreamError(tooMany())).toBe(true);
    expect(isUpstreamError(http(502))).toBe(true);
    expect(isUpstreamError(new TypeError("fetch failed"))).toBe(true);
    expect(isUpstreamError(new Error("failed to get info about account: 429 Too Many Requests: {}"))).toBe(true);
    expect(isUpstreamError(new Error("CONFIG_ADDRESS is not set"))).toBe(false);
    expect(isUpstreamError(new RangeError("not a token account"))).toBe(false);
  });
});

describe("per-method scheduler (public devnet limits)", () => {
  it("spaces calls past the limit to the next window instead of bursting", async () => {
    const waits: number[] = [];
    const s = new MethodScheduler({ getTransaction: 2 }, () => 0, async (ms) => void waits.push(ms));
    await s.acquire("getTransaction");
    await s.acquire("getTransaction");
    await s.acquire("getTransaction");
    expect(waits).toEqual([WINDOW_MS]);
    // Unlisted methods are never held.
    await s.acquire("getSlot");
    expect(waits).toHaveLength(1);
  });
  it("refuses, as busy, a call that would wait longer than MAX_QUEUE_MS", async () => {
    const s = new MethodScheduler({ getProgramAccounts: 1 }, () => 0, async () => {});
    await s.acquire("getProgramAccounts");
    s.penalize("getProgramAccounts", MAX_QUEUE_MS + 1);
    const e = await s.acquire("getProgramAccounts").catch((x) => x);
    expect(e).toBeInstanceOf(RpcBusyError);
    expect(isUpstreamError(e)).toBe(true);
  });
  it("applies to the public devnet RPC only", () => {
    expect(schedulerFor("https://api.devnet.solana.com")).toBeInstanceOf(MethodScheduler);
    expect(schedulerFor("https://devnet.helius-rpc.com/?api-key=x")).toBeUndefined();
  });
});

describe("read cache: coalescing, TTL, stale on 429", () => {
  it("coalesces N concurrent identical reads into one upstream call", async () => {
    clearReadCache();
    let upstream = 0;
    let release!: (v: number) => void;
    const read = () => {
      upstream++;
      return new Promise<number>((r) => (release = r));
    };
    const now = () => 0;
    const all = Promise.all(Array.from({ length: 20 }, () => cachedRead("c", read, { now })));
    release(42);
    const out = await all;
    expect(upstream).toBe(1);
    expect(out.every((r) => r.value === 42 && !r.stale)).toBe(true);
  });
  it("reuses a result for the TTL after it lands, then reads again", async () => {
    clearReadCache();
    let upstream = 0;
    let t = 0;
    const now = () => t;
    const read = async () => ++upstream;
    await cachedRead("t", read, { now });
    t = READ_TTL_MS - 1;
    expect((await cachedRead("t", read, { now })).value).toBe(1);
    t = READ_TTL_MS;
    expect((await cachedRead("t", read, { now })).value).toBe(2);
  });
  it("serves the last good value, marked stale, when the RPC 429s past the retries", async () => {
    clearReadCache();
    let t = 0;
    const now = () => t;
    await cachedRead("s", async () => "good", { now });
    t = READ_TTL_MS + 1;
    const r = await cachedRead("s", async () => Promise.reject(tooMany()), { now });
    expect(r).toEqual({ value: "good", stale: true, at: 0 });
  });
  it("does not ask the RPC again during the cooldown after a busy failure", async () => {
    clearReadCache();
    let t = 0;
    const now = () => t;
    await cachedRead("cd", async () => 1, { now });
    t = READ_TTL_MS + 1;
    let upstream = 0;
    const failing = async () => {
      upstream++;
      throw tooMany();
    };
    await cachedRead("cd", failing, { now });
    t += COOLDOWN_MS - 1;
    expect((await cachedRead("cd", failing, { now })).stale).toBe(true);
    expect(upstream).toBe(1);
    t += 2;
    await cachedRead("cd", failing, { now });
    expect(upstream).toBe(2);
  });
  it("never masks a non-upstream failure, nor serves a value older than STALE_MAX_MS", async () => {
    clearReadCache();
    let t = 0;
    const now = () => t;
    await cachedRead("n", async () => 1, { now });
    t = READ_TTL_MS + 1;
    await expect(cachedRead("n", async () => Promise.reject(new Error("decode")), { now })).rejects.toThrow("decode");
    t = STALE_MAX_MS + 1;
    await expect(cachedRead("n", async () => Promise.reject(tooMany()), { now })).rejects.toSatisfy(isUpstreamError);
  });
  it("a composed read (allowStale: false) fails instead of answering stale", async () => {
    clearReadCache();
    let t = 0;
    const now = () => t;
    await cachedRead("r", async () => 1, { now });
    t = READ_TTL_MS + 1;
    await expect(cachedRead("r", async () => Promise.reject(tooMany()), { now, allowStale: false })).rejects.toSatisfy(isUpstreamError);
  });
});

describe("poll backoff", () => {
  it("polls at the interval when healthy and backs off, capped, when busy", () => {
    expect(nextDelay(10_000, 0)).toBe(10_000);
    expect(nextDelay(10_000, 1, null, () => 0.5)).toBe(10_000);
    expect(nextDelay(10_000, 2, null, () => 0.5)).toBe(20_000);
    expect(nextDelay(3_000, 1, 8, () => 0.5)).toBe(8_000);
    expect(nextDelay(10_000, 10, null, () => 1)).toBeLessThanOrEqual(MAX_BACKOFF_MS * 1.2);
  });
});

// ── Route level: /api/reserve under a 429 storm ─────────────────────────────

const readReserve = vi.fn();
vi.mock("@/lib/server/chain", async (orig) => ({ ...(await orig<object>()), guardedEnv: vi.fn(async () => ({})), readReserve }));

describe("/api/reserve when the RPC rate limits", () => {
  afterEach(() => {
    vi.useRealTimers();
    readReserve.mockReset();
  });
  it("answers 503 with Retry-After when there is no cached value", async () => {
    clearReadCache();
    readReserve.mockRejectedValue(tooMany());
    const { GET } = await import("@/app/api/reserve/route");
    const res = await GET(new Request("http://x/api/reserve"));
    expect(res.status).toBe(503);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await res.json()).busy).toBe(true);
  });
  it("answers 200 with the last good value marked stale once one exists", async () => {
    clearReadCache();
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    readReserve.mockResolvedValueOnce({ slot: 1 });
    const { GET } = await import("@/app/api/reserve/route");
    const fresh = await GET(new Request("http://x/api/reserve"));
    expect(fresh.status).toBe(200);
    expect(fresh.headers.get("x-chain-stale")).toBeNull();
    vi.setSystemTime(1_000_000 + READ_TTL_MS + 1);
    readReserve.mockRejectedValue(tooMany());
    const stale = await GET(new Request("http://x/api/reserve"));
    expect(stale.status).toBe(200);
    expect(stale.headers.get("x-chain-stale")).toBe("true");
    expect(stale.headers.get("x-chain-read-at")).toBe(String(1_000_000));
  });
  it("still answers 502 for a failure that is not the RPC being busy", async () => {
    clearReadCache();
    readReserve.mockRejectedValue(new Error("CONFIG_ADDRESS x is not the config PDA"));
    const { GET } = await import("@/app/api/reserve/route");
    expect((await GET(new Request("http://x/api/reserve"))).status).toBe(502);
  });
});
