import { describe, expect, test } from 'bun:test';
import {
  NAV_SCALE,
  previewDepositFulfil,
  previewRedeemFulfil,
  solvencyFromAccounts,
} from '../src';
import { blankConfig, blankState } from './fakes';

const BRL = 1_000_000n;

function reserve(over: Partial<ReturnType<typeof blankState>> = {}) {
  const config = { ...blankConfig(), coverageRatioBps: 10_000 };
  const state = { ...blankState(), version: 1, ...over };
  return { config, state };
}

describe('solvencyFromAccounts', () => {
  test('reads the snapshot the program reads (BRS only)', () => {
    const { config, state } = reserve({
      brsBalance: 100_000n * BRL,
      remainingCoverTotal: 60_000n * BRL,
      provisions: 5_000n * BRL,
    });
    const s = solvencyFromAccounts(config, state);
    expect(s.surplus).toBe(40_000n * BRL);
    expect(s.stableAssets).toBe(100_000n * BRL);
    expect(s.freeCapital).toBe(s.surplus);
    expect(s.liquidBudget).toBe(95_000n * BRL);
    expect(s.netAssets).toBe(95_000n * BRL);
  });

  test('below c = 1 the provisions bind coverage required (ADR 0016)', () => {
    const { config, state } = reserve({
      brsBalance: 10_000n * BRL,
      remainingCoverTotal: 60_000n * BRL,
      provisions: 9_000n * BRL,
    });
    const s = solvencyFromAccounts({ ...config, coverageRatioBps: 1_000 }, state);
    expect(s.coverageRequired).toBe(9_000n * BRL);
    expect(s.freeCapital).toBe(1_000n * BRL);
    expect(s.liquidBudget).toBe(1_000n * BRL);
    const low = solvencyFromAccounts({ ...config, coverageRatioBps: 1_000 }, { ...state, provisions: 0n });
    expect(low.coverageRequired).toBe(6_000n * BRL);
    expect(low.freeCapital).toBe(4_000n * BRL);
  });

});

describe('previewDepositFulfil', () => {
  test('first deposit at 1.0, later ones at the running NAV', () => {
    const { config, state } = reserve();
    const fills = previewDepositFulfil(config, state, [5_000n * BRL, 1_000n * BRL]);
    expect(fills[0]).toEqual({ assets: 5_000n * BRL, shares: 5_000n * BRL, nav: NAV_SCALE });
    // (5e9 + 1) / (5e9 + 1) = 1.0 exactly.
    expect(fills[1]).toEqual({ assets: 1_000n * BRL, shares: 1_000n * BRL, nav: NAV_SCALE });
  });

  test('fees raise the price', () => {
    const { config, state } = reserve({ brsBalance: 2_000n, sharesOutstanding: 1_000n });
    const [f] = previewDepositFulfil(config, state, [1_000n]);
    // floor(1000 × 1001 / 2001) = 500.
    expect(f!.shares).toBe(500n);
  });
});

describe('previewRedeemFulfil (whole fills only)', () => {
  const base = () =>
    reserve({
      brsBalance: 10_000n,
      sharesOutstanding: 10_000n,
      remainingCoverTotal: 7_000n,
    });

  test('fills FIFO while each fits free capital', () => {
    const { config, state } = base();
    const r = previewRedeemFulfil(config, state, [
      { seq: 0n, shares: 1_000n },
      { seq: 1n, shares: 1_500n },
      { seq: 2n, shares: 1_000n },
    ]);
    // free capital 3,000: 1,000 then 1,500 fit; 1,000 more does not (500 left).
    expect(r.fills.map((f) => f.seq)).toEqual([0n, 1n]);
    expect(r.fills[0]!.assets).toBe(1_000n);
    expect(r.stoppedBy).toBe('InsufficientFreeCapital');
  });

  test('max_assets binds', () => {
    const { config, state } = base();
    const r = previewRedeemFulfil(
      config,
      state,
      [{ seq: 0n, shares: 1_000n }],
      { maxAssets: 999n },
    );
    expect(r.fills).toEqual([]);
    expect(r.stoppedBy).toBe('InsufficientFreeCapital');
  });

  test('a request worth nothing stops the batch', () => {
    const { config, state } = reserve({ brsBalance: 1n, sharesOutstanding: 1_000_000n });
    const r = previewRedeemFulfil(config, state, [{ seq: 0n, shares: 1n }]);
    expect(r.stoppedBy).toBe('RequestTooSmall');
  });

  test('stops at count', () => {
    const { config, state } = base();
    const reqs = [0n, 1n, 2n].map((seq) => ({ seq, shares: 10n }));
    const r = previewRedeemFulfil(config, state, reqs, { count: 2 });
    expect(r.fills.length).toBe(2);
    expect(r.stoppedBy).toBeNull();
  });

  test('reports under-coverage and halts as the program would refuse', () => {
    const { config, state } = reserve({ brsBalance: 1n, remainingCoverTotal: 2n });
    expect(previewRedeemFulfil(config, state, []).stoppedBy).toBe('UnderCovered');
    const h = reserve({ brsBalance: 10n, fulfilHalted: true });
    expect(previewRedeemFulfil(h.config, h.state, []).stoppedBy).toBe('FulfilHalted');
  });

  test('below c = 1, filed claims bind coverage and fills use exactly the free capital (ADR 0016)', () => {
    // 10,000 BRS, 60,000 cover at c = 0.10 (ratio term 6,000), 9,000 filed:
    // coverage required 9,000, free capital = liquid = net assets = 1,000.
    const { config, state } = reserve({
      brsBalance: 10_000n,
      remainingCoverTotal: 60_000n,
      provisions: 9_000n,
      sharesOutstanding: 1_200n,
    });
    const c = { ...config, coverageRatioBps: 1_000 };
    const sol = solvencyFromAccounts(c, state);
    expect([sol.coverageRequired, sol.freeCapital, sol.liquidBudget]).toEqual([9_000n, 1_000n, 1_000n]);
    const reqs = [0n, 1n].map((seq) => ({ seq, shares: 600n }));
    const r = previewRedeemFulfil(c, state, reqs);
    // floor(600 × 1,001 / 1,201) = 500, then floor(600 × 501 / 601) = 500.
    expect(r.fills.map((f) => f.assets)).toEqual([500n, 500n]);
    expect(r.stoppedBy).toBeNull();
  });
});
