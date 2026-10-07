import { describe, expect, test } from 'bun:test';
import { address, type Address } from '@solana/kit';
import {
  fetchGuaranteesForReserve,
  fetchPayoutsForGuarantee,
  fetchReserve,
  findGuaranteePda,
  findPayoutPda,
  findRedeemRequestPda,
  findDepositRequestPda,
  findReserveAddresses,
  getDepositQueuePosition,
  getGuaranteeDecoder,
  getGuaranteeEncoder,
  getGuaranteeSize,
  GUARANTEE_DISCRIMINATOR,
  getPayoutDecoder,
  getPayoutEncoder,
  getPayoutSize,
  PAYOUT_DISCRIMINATOR,
  getRedeemQueuePosition,
  getRedeemRequestDecoder,
  getRedeemRequestEncoder,
  getRedeemRequestSize,
  REDEEM_REQUEST_DISCRIMINATOR,
  getDepositRequestDecoder,
  getDepositRequestEncoder,
  getDepositRequestSize,
  DEPOSIT_REQUEST_DISCRIMINATOR,
} from '../src';
import { blankConfig, blankState, encodeConfig, encodeState, FakeRpc } from './fakes';

const MINT = address('So11111111111111111111111111111111111111112');

function blank<T>(size: number, disc: Uint8Array, decode: (b: Uint8Array) => T): T {
  const b = new Uint8Array(size);
  b.set(disc);
  return decode(b);
}

async function setup() {
  const rpc = new FakeRpc();
  const a = await findReserveAddresses(MINT);
  const config = { ...blankConfig(), version: 1, reserveMint: MINT, coverageRatioBps: 10_000 };
  const state = {
    ...blankState(),
    version: 1,
    brsBalance: 10_000n,
    remainingCoverTotal: 4_000n,
    redeemHead: 0n,
    nextRedeemSeq: 4n,
    depositHead: 1n,
    nextDepositSeq: 3n,
  };
  rpc.set(a.config, encodeConfig(config));
  rpc.set(a.state, encodeState(state));
  return { rpc, a };
}

describe('fetchReserve', () => {
  test('decodes config and state and derives the solvency snapshot', async () => {
    const { rpc, a } = await setup();
    const r = await fetchReserve(rpc as never, MINT);
    expect(r.addresses.config).toBe(a.config);
    expect(r.config.data.reserveMint).toBe(MINT);
    expect(r.state.data.brsBalance).toBe(10_000n);
    expect(r.solvency.surplus).toBe(6_000n);
    expect(r.solvency.freeCapital).toBe(6_000n);
  });

  test('throws when the reserve is not initialized', async () => {
    const rpc = new FakeRpc();
    expect(fetchReserve(rpc as never, MINT)).rejects.toThrow();
  });
});

describe('guarantees and payouts', () => {
  test('lists only this reserve’s guarantees and a guarantee’s payouts', async () => {
    const { rpc, a } = await setup();
    const mk = (id: number) => ({
      ...blank(getGuaranteeSize(), GUARANTEE_DISCRIMINATOR as Uint8Array, (b) =>
        getGuaranteeDecoder().decode(b),
      ),
      version: 1,
      id: new Uint8Array(32).fill(id),
    });
    const [g1] = await findGuaranteePda({ config: a.config, id: new Uint8Array(32).fill(1) });
    const [g2] = await findGuaranteePda({ config: a.config, id: new Uint8Array(32).fill(2) });
    rpc.set(g1, getGuaranteeEncoder().encode(mk(1)) as Uint8Array);
    rpc.set(g2, getGuaranteeEncoder().encode(mk(2)) as Uint8Array);
    // Same id under another reserve's config: not ours.
    const other = await findReserveAddresses(address('11111111111111111111111111111112'));
    const [g3] = await findGuaranteePda({ config: other.config, id: new Uint8Array(32).fill(3) });
    rpc.set(g3, getGuaranteeEncoder().encode(mk(3)) as Uint8Array);

    const gs = await fetchGuaranteesForReserve(rpc as never, a.config);
    expect(gs.map((g) => g.address).sort()).toEqual([g1, g2].sort());

    const notice = new Uint8Array(32).fill(9);
    const [p1] = await findPayoutPda({ guarantee: g1, noticeRefHash: notice });
    const payout = {
      ...blank(getPayoutSize(), PAYOUT_DISCRIMINATOR as Uint8Array, (b) => getPayoutDecoder().decode(b)),
      version: 1,
      guarantee: g1,
      noticeRefHash: notice,
      amount: 42n,
    };
    rpc.set(p1, getPayoutEncoder().encode(payout) as Uint8Array);
    const ps = await fetchPayoutsForGuarantee(rpc as never, g1);
    expect(ps.map((p) => p.address)).toEqual([p1]);
    expect(ps[0]!.data.amount).toBe(42n);
    expect(await fetchPayoutsForGuarantee(rpc as never, g2)).toEqual([]);
  });
});

describe('queue positions', () => {
  async function putRedeem(rpc: FakeRpc, config: Address, seq: bigint, sharesRemaining: bigint, status: number) {
    const [addr] = await findRedeemRequestPda({ config, seq });
    const r = {
      ...blank(getRedeemRequestSize(), REDEEM_REQUEST_DISCRIMINATOR as Uint8Array, (b) =>
        getRedeemRequestDecoder().decode(b),
      ),
      version: 1,
      seq,
      sharesRequested: sharesRemaining,
      sharesRemaining,
      status,
    };
    rpc.set(addr, getRedeemRequestEncoder().encode(r) as Uint8Array);
  }

  test('redeem: counts open requests and shares ahead, skipping dead seqs', async () => {
    const { rpc, a } = await setup();
    await putRedeem(rpc, a.config, 0n, 100n, 0); // open
    // seq 1 closed (no account)
    await putRedeem(rpc, a.config, 2n, 0n, 3); // cancelled: dead
    await putRedeem(rpc, a.config, 3n, 50n, 0); // ours
    const p = await getRedeemQueuePosition(rpc as never, a.config, 3n);
    expect(p).toEqual({ seq: 3n, head: 0n, isHead: false, requestsAhead: 1, amountAhead: 100n, open: true });
    const h = await getRedeemQueuePosition(rpc as never, a.config, 0n);
    expect(h.isHead).toBe(true);
    expect(h.requestsAhead).toBe(0);
  });

  test('redeem: a seq past the queue end is not open', async () => {
    const { rpc, a } = await setup();
    const p = await getRedeemQueuePosition(rpc as never, a.config, 9n);
    expect(p.open).toBe(false);
  });

  test('deposit: counts pending requests and assets ahead', async () => {
    const { rpc, a } = await setup();
    for (const [seq, assets, status] of [
      [1n, 700n, 0],
      [2n, 300n, 0],
    ] as const) {
      const [addr] = await findDepositRequestPda({ config: a.config, seq });
      const d = {
        ...blank(getDepositRequestSize(), DEPOSIT_REQUEST_DISCRIMINATOR as Uint8Array, (b) =>
          getDepositRequestDecoder().decode(b),
        ),
        version: 1,
        seq,
        assets,
        status,
      };
      rpc.set(addr, getDepositRequestEncoder().encode(d) as Uint8Array);
    }
    const p = await getDepositQueuePosition(rpc as never, a.config, 2n);
    expect(p).toEqual({ seq: 2n, head: 1n, isHead: false, requestsAhead: 1, amountAhead: 700n, open: true });
  });
});
