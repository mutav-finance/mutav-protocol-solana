import { describe, expect, it } from "vitest";
import type { ClaimFiling, DepositRequest, FeeReceipt, IncomeReceipt, Guarantee, Payout, RedeemRequest } from "@mutav-finance/mutav-protocol-solana";
import { activeRemainingCover, agencyRows, capitalQueue, claimsTimeline, coverageRows, investorRequests, moneyFlows, type Row } from "../view";
import { BRL } from "./fixtures";

const b32 = (n: number) => new Uint8Array(32).fill(n);

const guarantee = (address: string, over: Partial<Guarantee>): Row<Guarantee> => ({
  address,
  data: {
    id: b32(1), agencyId: b32(9), refsHash: b32(0), rent: 3_000n * BRL, defaultMultiplierBps: 30_000, exitMultiplierBps: 10_000,
    defaultCover: 9_000n * BRL, exitCover: 3_000n * BRL, defaultPaid: 0n, exitPaid: 0n, provisionDefault: 0n, provisionExit: 0n,
    openClaims: 0, status: 0, registeredAt: 100n, closedAt: 0n, ...over,
  } as unknown as Guarantee,
});

describe("coverage", () => {
  it("computes remaining cover per leg and sums active guarantees only", () => {
    const rows = coverageRows([
      guarantee("G1", { defaultPaid: 2_000n * BRL, provisionExit: 500n * BRL }),
      guarantee("G2", { status: 1, registeredAt: 50n }),
    ]);
    expect(rows[0]).toMatchObject({ address: "G1", defaultRemaining: 7_000n * BRL, exitRemaining: 3_000n * BRL, provision: 500n * BRL, active: true });
    expect(rows[1]!.active).toBe(false);
    expect(activeRemainingCover(rows)).toBe(10_000n * BRL);
  });

  it("orders agencies by exposure and reports cap use", () => {
    const rows = agencyRows(
      [
        { address: "A", data: { agencyId: b32(1), outstandingCover: 10_000n * BRL, activeGuarantees: 1, claimsPaidTotal: 0n } as never },
        { address: "B", data: { agencyId: b32(2), outstandingCover: 30_000n * BRL, activeGuarantees: 2, claimsPaidTotal: 0n } as never },
      ],
      60_000n * BRL,
    );
    expect(rows.map((r) => r.address)).toEqual(["B", "A"]);
    expect(rows[0]!.capUsedBps).toBe(5_000n);
  });
});

describe("claims timeline", () => {
  const filing = (address: string, hash: number, filedAt: bigint): Row<ClaimFiling> => ({
    address,
    data: { guarantee: "G1", leg: 0, noticeRefHash: b32(hash), provision: 1_000n * BRL, filedAt, status: 0 } as unknown as ClaimFiling,
  });
  const payout = (hash: number, over: Partial<Payout>): Row<Payout> => ({
    address: `P${hash}`,
    data: { guarantee: "G1", leg: 0, amount: 1_000n * BRL, noticeRefHash: b32(hash), status: 0, paidAt: 1_000n, pixE2eHash: b32(0), settledAt: 0n, late: 0, ...over } as unknown as Payout,
  });

  it("joins filings to payouts and measures each stage", () => {
    const rows = claimsTimeline(
      {
        guarantees: [guarantee("G1", {})],
        filings: [filing("F1", 1, 400n), filing("F2", 2, 900n), filing("F3", 3, 950n)],
        payouts: [
          payout(1, { status: 1, paidAt: 1_000n, settledAt: 4_600n, pixE2eHash: b32(7) }),
          payout(2, { paidAt: 1_000n }),
        ],
      },
      172_800n,
      200_000n,
    );
    expect(rows.map((r) => r.filing)).toEqual(["F3", "F2", "F1"]);
    const [f3, f2, f1] = rows;
    expect(f3).toMatchObject({ stage: "filed", payout: null, fileToPay: null, overdue: false });
    expect(f2).toMatchObject({ stage: "paid", fileToPay: 100n, payToSettle: null, overdue: true, pixE2eHash: null });
    expect(f1).toMatchObject({ stage: "settled", fileToPay: 600n, payToSettle: 3_600n, overdue: false, lateOnChain: false });
    expect(f1!.pixE2eHash).toBe("07".repeat(32));
    expect(f1!.guaranteeId).toBe("01".repeat(32));
  });
});

describe("money flows and queue", () => {
  const dep = (seq: bigint, status: number, assets: bigint): Row<DepositRequest> => ({
    address: `D${seq}`,
    data: { owner: "W", seq, assets, sharesOut: 0n, navAtFulfil: 0n, requestedAt: 10n + seq, fulfilledAt: status ? 20n : 0n, status } as unknown as DepositRequest,
  });
  const red = (seq: bigint, remaining: bigint, filled: bigint): Row<RedeemRequest> => ({
    address: `R${seq}`,
    data: { owner: "W", seq, sharesRequested: remaining, sharesRemaining: remaining, sharesFilled: 0n, assetsFilled: filled, lastFillAt: filled ? 30n : 0n, requestedAt: 5n } as unknown as RedeemRequest,
  });

  it("takes totals from VaultState and fills from events, and lists each flow", () => {
    const fee = { address: "F", blockTime: 40n, data: { gross: 1_000n, take: 200n, net: 800n, slot: 9n } as unknown as FeeReceipt };
    const income = { address: "I", blockTime: 50n, data: { period: 202_610, gross: 1_500n, take: 0n, net: 1_500n, slot: 11n } as unknown as IncomeReceipt };
    const ev = (side: "deposit" | "redemption", ts: bigint, assets: bigint) => ({ side, signature: `S${ts}`, ts, fromSeq: 0n, toSeq: 0n, assets, shares: 1_000_000n, nav: 1_000_000_000n });
    const { totals, rows } = moneyFlows(
      { feesInTotal: 800n, feeTakeTotal: 200n, claimsPaidTotal: 0n, incomeTotal: 1_500n, incomeTakeTotal: 0n },
      { fees: [fee], income: [income], payouts: [], capitalEvents: [ev("redemption", 30n, 300n), ev("deposit", 20n, 5_000n)] },
    );
    expect(totals).toEqual({ feesNetToReserve: 800n, feeTakeToTreasury: 200n, incomeNetToReserve: 1_500n, incomeTakeToTreasury: 0n, claimsPaid: 0n, depositsIn: 5_000n, redemptionsOut: 300n });
    expect(rows.map((r) => [r.kind, r.reserveDelta])).toEqual([["income", 1_500n], ["fee", 800n], ["redemption", -300n], ["deposit", 5_000n]]);
    expect(rows[0]).toMatchObject({ account: "I", treasury: 0n, detail: "statement 2026-10" });
    expect(rows[3]).toMatchObject({ isTx: true, account: "S20", detail: "seq 0 · minted 1.000000 shares" });
  });

  it("lists open requests in FIFO order from the heads", () => {
    const q = capitalQueue(
      { depositHead: 1n, redeemHead: 0n },
      { deposits: [dep(3n, 0, 1n), dep(0n, 0, 1n), dep(1n, 0, 2n), dep(2n, 1, 3n)], redeems: [red(1n, 5n, 0n), red(0n, 0n, 0n)] },
    );
    expect(q.deposits.map((d) => [d.seq, d.position])).toEqual([[1n, 1], [3n, 2]]);
    expect(q.redeems.map((r) => r.seq)).toEqual([1n]);
  });
});

describe("investor requests", () => {
  const dep = (address: string, owner: string, seq: bigint, status: number) =>
    ({ address, data: { owner, seq, assets: 5_000n * BRL, sharesOut: status ? 5_000n * BRL : 0n, requestedAt: 10n + seq, status } }) as unknown as Row<DepositRequest>;
  const red = (address: string, owner: string, seq: bigint, over: Partial<RedeemRequest>) =>
    ({ address, data: { owner, seq, sharesRemaining: 0n, assetsClaimable: 0n, requestedAt: 20n + seq, status: 0, ...over } }) as unknown as Row<RedeemRequest>;

  it("lists only the owner's entries, with queue position and the actions the program would accept", () => {
    const rows = investorRequests(
      "ME",
      { depositHead: 0n, redeemHead: 0n } as never,
      {
        deposits: [dep("D0", "OTHER", 0n, 0), dep("D1", "ME", 1n, 0), dep("D2", "ME", 2n, 1)],
        redeems: [red("R0", "ME", 0n, { sharesRemaining: 3n, assetsClaimable: 7n, status: 1 }), red("R1", "ME", 1n, { assetsClaimable: 4n, status: 3 })],
      },
    );
    const by = Object.fromEntries(rows.map((r) => [r.address, r]));
    expect(Object.keys(by).sort()).toEqual(["D1", "D2", "R0", "R1"]);
    expect(by.D1).toMatchObject({ status: "pending", position: 2, actions: ["cancel_deposit"] });
    expect(by.D2).toMatchObject({ status: "fulfilled", position: null, claimable: 5_000n * BRL, actions: ["claim_shares"] });
    expect(by.R0).toMatchObject({ status: "partially filled", position: 1, actions: ["cancel_redeem", "claim_assets"] });
    expect(by.R1).toMatchObject({ status: "cancelled", position: null, actions: ["claim_assets"] });
  });

  it("is empty without a wallet", () => {
    expect(investorRequests(null, { depositHead: 0n, redeemHead: 0n } as never, { deposits: [], redeems: [] })).toEqual([]);
  });
});
