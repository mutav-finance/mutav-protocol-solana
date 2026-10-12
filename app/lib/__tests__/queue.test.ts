import { describe, expect, it } from "vitest";
import { allowlistedFillCount, deadSeqsAtHead, depositHead, limitWithSlippage, redeemHead } from "../queue";
import { BRL, config, state } from "./fixtures";

const sol = { netAssets: 100_000n * BRL, stableAssets: 50_000n * BRL, freeCapital: 5_000n * BRL, liquidBudget: 50_000n * BRL };
const st = state({ depositHead: 0n, redeemHead: 0n, sharesOutstanding: 100_000n * BRL, fulfilHalted: false, mode: 0 } as never);
const dep = (seq: bigint, owner: string, assets: bigint, minSharesOut = 0n) => ({ address: `D${seq}`, data: { status: 0, seq, owner, assets, minSharesOut } });
const red = (seq: bigint, owner: string, shares: bigint, minAssetsOut = 0n) => ({ address: `R${seq}`, data: { status: 0, seq, owner, shares, minAssetsOut } });
const L = (deposits: unknown[], redeems: unknown[] = []) => ({ deposits, redeems }) as never;

describe("queue heads (Q-2 / F10 explanation)", () => {
  it("a head that fits fills", () => {
    expect(depositHead(config(), st, sol, L([dep(0n, "A", 1_000n * BRL)]), ["A"])!.stuck).toEqual([]);
    expect(redeemHead(config(), st, sol, L([], [red(0n, "A", 1_000n * BRL)]))!.stuck).toEqual([]);
    expect(depositHead(config(), st, sol, L([]), null)).toBeNull();
  });
  it("explains a redemption that needs more than free capital", () => {
    const h = redeemHead(config(), st, sol, L([], [red(0n, "A", 6_000n * BRL)]))!;
    expect(h.value).toBe(6_000n * BRL);
    expect(h.stuck.join()).toMatch(/needs R\$ 6,000\.00 and only R\$ 5,000\.00 is available \(free capital\)/);
  });
  it("explains unmet price limits, under-coverage, the TVL cap and a de-listed owner", () => {
    expect(redeemHead(config(), st, sol, L([], [red(0n, "A", 1_000n * BRL, 2_000n * BRL)]))!.stuck.join()).toMatch(/price limit is not met/);
    expect(redeemHead(config(), { ...st, mode: 1 }, sol, L([], [red(0n, "A", 1n)]))!.stuck.join()).toMatch(/under-covered/);
    expect(depositHead(config(), st, sol, L([dep(0n, "A", 1_000n * BRL, 2_000n * BRL)]), null)!.stuck.join()).toMatch(/price limit is not met/);
    expect(depositHead(config(), st, sol, L([dep(0n, "A", 1_000n * BRL)]), ["B"])!.stuck.join()).toMatch(/not on the current allowlist/);
    expect(depositHead(config({ caps: { ...config().caps, maxTvl: 50_500n * BRL } } as never), st, sol, L([dep(0n, "A", 1_000n * BRL)]), null)!.stuck.join()).toMatch(/max TVL/);
  });
  it("sets a price limit a little under the preview", () => {
    expect(limitWithSlippage(10_000n, 100)).toBe(9_900n);
    expect(limitWithSlippage(0n, 100)).toBe(0n);
  });
  it("fills deposits only up to the first de-listed owner", () => {
    expect(allowlistedFillCount(st, L([dep(0n, "A", 1n), dep(1n, "B", 1n)]), ["A"], 8)).toEqual({ count: 1, blocked: { seq: 1n, owner: "B" } });
    expect(allowlistedFillCount(st, L([dep(0n, "A", 1n)]), ["A"], 8).blocked).toBeNull();
  });
});

describe("dead seqs at the head (advance_queue_head, ADR 0030)", () => {
  it("counts parked, filled or closed seqs before the first pending request", () => {
    const parked = { ...dep(2n, "A", 1n), data: { ...dep(2n, "A", 1n).data, status: 2 } };
    // seq 1 closed (absent), seq 2 parked, seq 3 pending.
    const ledger = { deposits: [parked, dep(3n, "B", 1n)], redeems: [] } as never;
    const s = state({ depositHead: 1n, nextDepositSeq: 4n, redeemHead: 5n, nextRedeemSeq: 7n } as never);
    expect(deadSeqsAtHead(s, ledger, "deposit")).toBe(2n);
    // No pending request: everything up to the tail is dead.
    expect(deadSeqsAtHead(s, ledger, "redeem")).toBe(2n);
    expect(deadSeqsAtHead(state({ depositHead: 3n, nextDepositSeq: 4n } as never), ledger, "deposit")).toBe(0n);
  });
});
