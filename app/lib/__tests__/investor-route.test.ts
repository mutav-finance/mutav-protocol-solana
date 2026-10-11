import { describe, expect, it, vi } from "vitest";

const guardedEnv = vi.fn(async () => {
  throw new Error("must not reach the RPC");
});
vi.mock("@/lib/server/chain", async (orig) => ({ ...(await orig<object>()), guardedEnv, readReserve: vi.fn() }));

const { GET } = await import("@/app/api/investor/route");

describe("/api/investor ?owner= (A2)", () => {
  it("answers 400 for a non-address owner without any RPC call", async () => {
    const res = await GET(new Request("http://x/api/investor?owner=not-a-wallet"));
    expect(res.status).toBe(400);
    expect(guardedEnv).not.toHaveBeenCalled();
  });
});
