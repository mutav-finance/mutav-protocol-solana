import { describe, expect, test } from 'bun:test';
import {
  INSTANT_EXIT,
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
  test('reads the snapshot the program reads (pilot: no earmark)', () => {
    const { config, state } = reserve({
      brsBalance: 100_000n * BRL,
      remainingCoverTotal: 60_000n * BRL,
      provisions: 5_000n * BRL,
      bufferEarmark: 7n, // injected; flag clear, so no effect
    });
    const s = solvencyFromAccounts(config, state);
    expect(s.surplus).toBe(40_000n * BRL);
    expect(s.earmarkEff).toBe(0n);
    expect(s.freeCapital).toBe(s.surplus);
    expect(s.liquidBudget).toBe(95_000n * BRL);
    expect(s.netAssets).toBe(95_000n * BRL);
  });

  test('applies the earmark when the flag is set', () => {
    const { config, state } = reserve({ brsBalance: 100n, bufferEarmark: 30n });
    const s = solvencyFromAccounts({ ...config, featureFlags: INSTANT_EXIT }, state);
    expect(s.earmarkEff).toBe(30n);
    expect(s.freeCapital).toBe(70n);
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
      { seq: 0n, sharesRemaining: 1_000n, requestedAt: 0n },
      { seq: 1n, sharesRemaining: 1_500n, requestedAt: 0n },
      { seq: 2n, sharesRemaining: 1_000n, requestedAt: 0n },
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
      [{ seq: 0n, sharesRemaining: 1_000n, requestedAt: 0n }],
      { maxAssets: 999n },
    );
    expect(r.fills).toEqual([]);
    expect(r.stoppedBy).toBe('InsufficientFreeCapital');
  });

  test('a request worth nothing stops the batch', () => {
    const { config, state } = reserve({ brsBalance: 1n, sharesOutstanding: 1_000_000n });
    const r = previewRedeemFulfil(config, state, [{ seq: 0n, sharesRemaining: 1n, requestedAt: 0n }]);
    expect(r.stoppedBy).toBe('RequestTooSmall');
  });

  test('stops at count', () => {
    const { config, state } = base();
    const reqs = [0n, 1n, 2n].map((seq) => ({ seq, sharesRemaining: 10n, requestedAt: 0n }));
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
});
