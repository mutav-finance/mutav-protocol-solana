import { describe, expect, it, vi } from "vitest";
import { errorResponse } from "../server/respond";

vi.mock("../server/chain", () => ({ NotConfiguredError: class extends Error {} }));

describe("errorResponse (A5)", () => {
  it("never returns an RPC URL's path or query", async () => {
    const e = Object.assign(new Error("request to https://solana-devnet.g.alchemy.com/v2/SECRETKEY failed"), { context: { logs: ["see https://x.example/?api-key=SECRET2"] } });
    const body = await errorResponse(e).text();
    expect(body).not.toMatch(/SECRET/);
    expect(body).toMatch(/solana-devnet\.g\.alchemy\.com/);
  });
});
