import { describe, expect, test } from 'bun:test';
import { address } from '@solana/kit';
import {
  ANY_NAV,
  capsInputFromConfig,
  configParamsDiff,
  configParamsNeedRefresh,
  getCapsInputEncoder,
  getConfigParamEncoder,
  navBoundsAround,
  type Caps,
  type SettableConfig,
} from '../src';

const caps: Caps = {
  maxTvl: 1n,
  maxCoverPerGuarantee: 2n,
  maxClaimPerCall: 4n,
  maxClaimPerPeriod: 5n,
  minRequest: 7n,
  maxRequest: 8n,
  maxNavMoveBps: 100,
  stressBuffer: 11n,
  maxQueueWaitSecs: 12n,
  maxReinstateAge: 13n,
  reserved: new Uint8Array(32),
};

describe('capsInputFromConfig', () => {
  test('carries every cap over, never the padding', () => {
    const input = capsInputFromConfig(caps);
    expect(input).toEqual({
      maxTvl: 1n,
      maxCoverPerGuarantee: 2n,
      maxClaimPerCall: 4n,
      maxClaimPerPeriod: 5n,
      minRequest: 7n,
      maxRequest: 8n,
      maxNavMoveBps: 100,
      stressBuffer: 11n,
      maxQueueWaitSecs: 12n,
      maxReinstateAge: 13n,
    });
    // It encodes as the instruction argument.
    expect(getCapsInputEncoder().encode(input).length).toBe(74);
  });

  test('overrides win', () => {
    expect(capsInputFromConfig(caps, { maxNavMoveBps: 500 }).maxNavMoveBps).toBe(500);
  });
});

describe('configParamsDiff', () => {
  const base: SettableConfig = {
    coverageRatioBps: 1_000,
    feeTakeBps: 2_000,
    featureFlags: 0n,
    mutavCapitalWallet: address('11111111111111111111111111111112'),
    caps,
  };

  test('nothing changed, nothing proposed', () => {
    expect(configParamsDiff(base, base)).toEqual([]);
  });

  test('one param per changed field, in variant order', () => {
    const next = { ...base, feeTakeBps: 0, caps: { ...caps, stressBuffer: 19n, maxTvl: 9n } };
    const params = configParamsDiff(base, next);
    expect(params).toEqual([
      { __kind: 'FeeTakeBps', fields: [0] },
      { __kind: 'MaxTvl', fields: [9n] },
      { __kind: 'StressBuffer', fields: [19n] },
    ]);
    expect(configParamsNeedRefresh(params)).toBe(true);
    expect(configParamsNeedRefresh(params.slice(0, 2))).toBe(false);
    // Variant tags follow the program's enum.
    expect(getConfigParamEncoder().encode(params[0]!)[0]).toBe(1);
    expect(getConfigParamEncoder().encode(params[2]!)[0]).toBe(11);
  });
});

describe('navBoundsAround', () => {
  test('rounds outward and clamps', () => {
    expect(navBoundsAround(1_000_000_000n, 100)).toEqual({ min: 990_000_000n, max: 1_010_000_000n });
    expect(navBoundsAround(3n, 1)).toEqual({ min: 2n, max: 4n });
    expect(navBoundsAround(0n, 100)).toEqual({ min: 0n, max: 0n });
    expect(navBoundsAround(ANY_NAV.max, 100).max).toBe(ANY_NAV.max);
    expect(() => navBoundsAround(1n, -1)).toThrow();
  });
});
