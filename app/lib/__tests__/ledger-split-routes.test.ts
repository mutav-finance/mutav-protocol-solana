import { beforeEach, describe, expect, it, vi } from "vitest";
import { SolanaError, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR } from "@solana/kit";

/** The public devnet RPC rate limiting the heavy read (HTTP 429 after retries). */
const tooMany = () =>
  new SolanaError(SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR, { headers: new Headers({ "retry-after": "10" }), message: "Too Many Requests", statusCode: 429 });

const reserve = { cluster: "devnet", state: { activeGuarantees: 2 } };
const accounts = { guarantees: [{ address: "G1" }], filings: [], deposits: [], redeems: [] };
const readReserve = vi.fn(async () => reserve);
const readAccountsCached = vi.fn(async () => ({ value: accounts, stale: false, at: 1 }));
const readHistoryCached = vi.fn(async (): Promise<never> => {
  throw tooMany();
});
vi.mock("@/lib/server/chain", async (orig) => ({
  ...(await orig<object>()),
  guardedEnv: vi.fn(async () => ({ cluster: "devnet" })),
  readReserve,
  readReserveShared: readReserve,
  readAccountsCached,
  readHistoryCached,
}));

const { clearReadCache } = await import("@/lib/server/read-cache");
const reserveRoute = await import("@/app/api/reserve/route");
const accountsRoute = await import("@/app/api/accounts/route");
const historyRoute = await import("@/app/api/history/route");
const ledgerRoute = await import("@/app/api/ledger/route");
const get = (r: { GET: (req: Request) => Promise<Response> }, path: string) => r.GET(new Request(`http://x${path}`));

describe("split reads: the history being throttled never blocks the cheap reads", () => {
  beforeEach(() => clearReadCache());

  it("/api/history answers 503 busy with Retry-After", async () => {
    const res = await get(historyRoute, "/api/history");
    expect(res.status).toBe(503);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThanOrEqual(5);
    expect((await res.json()).busy).toBe(true);
  });

  it("/api/reserve and /api/accounts answer 200 without touching the history read", async () => {
    readHistoryCached.mockClear();
    const r = await get(reserveRoute, "/api/reserve");
    expect(r.status).toBe(200);
    expect((await r.json()).state.activeGuarantees).toBe(2);
    const a = await get(accountsRoute, "/api/accounts");
    expect(a.status).toBe(200);
    expect((await a.json()).guarantees).toHaveLength(1);
    expect(readHistoryCached).not.toHaveBeenCalled();
  });

  it("/api/ledger (the consoles' whole read) still reports busy, keeping #69's 503 + Retry-After", async () => {
    const res = await get(ledgerRoute, "/api/ledger");
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).not.toBeNull();
  });
});
