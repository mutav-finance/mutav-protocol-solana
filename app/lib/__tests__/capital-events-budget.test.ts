import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readCapitalEvents } from "../server/chain";
import type { ServerEnv } from "../server/env";
import type { ReserveView } from "../view";

/** A fake JSON-RPC: three signatures per escrow list; getTransaction answers null (nothing to decode) and is counted. */
let server: Server;
let url = "";
let txCalls = 0;
let txStatus = 200;
beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { id, method, params } = JSON.parse(body);
      if (method === "getTransaction") {
        txCalls++;
        if (txStatus !== 200) {
          res.writeHead(txStatus, { "content-type": "application/json", "retry-after": "0" });
          return res.end("{}");
        }
      }
      const sig = (n: number) => `${String(params[0]).slice(0, 4)}${n}`.padEnd(88, "1");
      const result = method === "getSignaturesForAddress" ? [0, 1, 2].map((n) => ({ signature: sig(n), err: null, slot: 1, blockTime: null, memo: null, confirmationStatus: "confirmed" })) : null;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const env = (): ServerEnv => ({ cluster: "localnet", rpcUrl: url, explorerRpc: url, programId: "11111111111111111111111111111111" as never, configAddress: null, squadsMultisig: null, allowlist: [], paymentsOwner: null });
const reserve = { addresses: { pendingDeposits: "Dep1111111111111111111111111111111111111111", pendingRedemptions: "Red1111111111111111111111111111111111111111", config: "Cfg" } } as unknown as ReserveView;

describe("readCapitalEvents: a time budget instead of a 503", () => {
  it("decodes every signature within the budget", async () => {
    txCalls = 0;
    const r = await readCapitalEvents(env(), reserve, { budgetMs: 60_000 });
    expect(r).toEqual({ events: [], missing: 0 });
    expect(txCalls).toBe(6);
  });

  it("past the budget, answers with what it has and counts the rest as missing", async () => {
    txCalls = 0;
    let t = 0;
    const r = await readCapitalEvents(env(), reserve, { budgetMs: 0, now: () => t++ });
    expect(r.missing).toBe(6);
    expect(txCalls).toBe(0);
  });

  it("a throttled getTransaction is missing, not a failed read", async () => {
    txStatus = 429;
    try {
      const r = await readCapitalEvents(env(), reserve, { budgetMs: 60_000 });
      expect(r.missing).toBe(6);
    } finally {
      txStatus = 200;
    }
  });
});
