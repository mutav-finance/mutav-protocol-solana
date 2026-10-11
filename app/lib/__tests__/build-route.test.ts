import { beforeEach, describe, expect, it, vi } from "vitest";
import { encode } from "@/lib/serde";
import { depositQueueSeqs } from "@/lib/server/chain";

const WALLET = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const MULTISIG = "SysvarRent111111111111111111111111111111111";

const { h, reserve, readReserve, readLedger, readDepositQueue } = vi.hoisted(() => {
  const h: { env: Record<string, unknown> } = { env: {} };
  const reserve = { config: { admin: "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T" }, state: {}, now: 0n };
  return { h, reserve, readReserve: vi.fn(async () => reserve), readLedger: vi.fn(async () => ({})), readDepositQueue: vi.fn(async () => []) };
});
vi.mock("@/lib/server/chain", async (orig) => ({
  ...(await orig<object>()),
  guardedEnv: async () => h.env,
  readReserve,
  readLedger,
  readDepositQueue,
  rpcFor: () => ({ getLatestBlockhash: () => ({ send: async () => ({ value: {} }) }) }),
}));
vi.mock("@/lib/server/compose", async (orig) => ({
  ...(await orig<object>()),
  composeInstructions: vi.fn(async () => []),
  unsignedTransaction: () => "tx",
}));

vi.mock("@/lib/server/squads", async (orig) => ({
  ...(await orig<object>()),
  assertMember: vi.fn(async () => {
    throw new (await import("@/lib/server/squads")).ProposalRefusedError("not a member");
  }),
}));

const { POST } = await import("@/app/api/tx/build/route");
const { vaultAddress } = await import("@/lib/server/squads");
const post = (request: object, via?: "squads" | "direct") =>
  POST(new Request("http://x/api/tx/build", { method: "POST", body: encode({ request, signer: WALLET, ...(via ? { via } : {}) }) }));

beforeEach(() => {
  h.env = { cluster: "devnet", squadsMultisig: null, allowlist: [], programId: WALLET };
  for (const f of [readReserve, readLedger, readDepositQueue]) f.mockClear();
});

describe("/api/tx/build RPC budget (A2)", () => {
  it("never reads the ledger for refresh", async () => {
    const res = await post({ kind: "refresh" });
    expect(res.status).toBe(200);
    expect(readLedger).not.toHaveBeenCalled();
    expect(readDepositQueue).not.toHaveBeenCalled();
  });
  it("refuses a direct admin fill on devnet before any chain read", async () => {
    const res = await post({ kind: "fulfil_deposits", count: 1 }, "direct");
    expect(res.status).toBe(400);
    expect(readReserve).not.toHaveBeenCalled();
    expect(readDepositQueue).not.toHaveBeenCalled();
  });
  it("refuses a Squads fill without SQUADS_MULTISIG before any chain read", async () => {
    const res = await post({ kind: "fulfil_deposits", count: 1 });
    expect(res.status).toBe(400);
    expect(readReserve).not.toHaveBeenCalled();
  });
  it("refuses a Squads fill whose vault is not the admin without reading the queue", async () => {
    h.env.squadsMultisig = MULTISIG;
    const res = await post({ kind: "fulfil_deposits", count: 1 });
    expect(res.status).toBe(400);
    expect(readReserve).toHaveBeenCalledTimes(1);
    expect(readDepositQueue).not.toHaveBeenCalled();
  });
  it("refuses a Squads fill from a non-member before reading the queue", async () => {
    h.env.squadsMultisig = MULTISIG;
    const admin = reserve.config.admin;
    reserve.config.admin = vaultAddress(MULTISIG);
    const res = await post({ kind: "fulfil_deposits", count: 1 });
    reserve.config.admin = admin;
    expect(res.status).toBe(400);
    expect(readDepositQueue).not.toHaveBeenCalled();
  });
  it("reads only the deposit queue for an accepted fill", async () => {
    h.env.cluster = "localnet";
    const res = await post({ kind: "fulfil_deposits", count: 1 }, "direct");
    expect(res.status).toBe(200);
    expect(readDepositQueue).toHaveBeenCalledTimes(1);
    expect(readLedger).not.toHaveBeenCalled();
  });
});

describe("deposit queue range", () => {
  it("covers the head to the next seq, bounded", () => {
    expect(depositQueueSeqs({ depositHead: 3n, nextDepositSeq: 6n })).toEqual([3n, 4n, 5n]);
    expect(depositQueueSeqs({ depositHead: 4n, nextDepositSeq: 4n })).toEqual([]);
    const many = depositQueueSeqs({ depositHead: 10n, nextDepositSeq: 10_000n });
    expect(many.length).toBe(256);
    expect(many[0]).toBe(10n);
  });
  it("is bounded by the fill's count", () => {
    expect(depositQueueSeqs({ depositHead: 10n, nextDepositSeq: 10_000n }, 3)).toEqual([10n, 11n, 12n]);
    expect(depositQueueSeqs({ depositHead: 10n, nextDepositSeq: 10_000n }, 1_000).length).toBe(256);
  });
});
