import { describe, expect, test } from 'bun:test';
import {
  assetsFor,
  computeSolvency,
  conversionNav,
  headStarved,
  MathOverflowError,
  mulDiv,
  navPerShare,
  NAV_SCALE,
  PRICE_SCALE,
  sharesFor,
  VIRTUAL_OFFSET,
  INSTANT_EXIT,
  type SolvencyInputs,
} from '../src';
import { outcome, vectors } from './vectors';

describe('constants match the program', () => {
  test('scales, offset and flags', () => {
    expect(PRICE_SCALE.toString()).toBe(vectors.constants.priceScale);
    expect(NAV_SCALE.toString()).toBe(vectors.constants.navScale);
    expect(VIRTUAL_OFFSET.toString()).toBe(vectors.constants.virtualOffset);
    expect(INSTANT_EXIT.toString()).toBe(vectors.constants.instantExit);
  });
});

describe('mulDiv parity', () => {
  test.each(vectors.mulDiv.map((v: any, i: number) => [i, v]))('case %i', (_i, v: any) => {
    const [a, b, d] = [BigInt(v.a), BigInt(v.b), BigInt(v.d)];
    expect(outcome(() => mulDiv(a, b, d, 'down'))).toBe(v.down);
    expect(outcome(() => mulDiv(a, b, d, 'up'))).toBe(v.up);
  });
});

describe('share conversion parity', () => {
  test.each(vectors.conversion.map((v: any, i: number) => [i, v]))('case %i', (_i, v: any) => {
    const [x, so, na] = [BigInt(v.x), BigInt(v.sharesOutstanding), BigInt(v.netAssets)];
    expect(outcome(() => sharesFor(x, so, na))).toBe(v.sharesFor);
    expect(outcome(() => assetsFor(x, so, na))).toBe(v.assetsFor);
    expect(outcome(() => conversionNav(so, na))).toBe(v.conversionNav);
    expect(outcome(() => navPerShare(na, so))).toBe(v.navPerShare);
  });
});

describe('solvency parity (earmark_eff, free_capital, liquid_budget, …)', () => {
  test.each(vectors.solvency.map((v: any, i: number) => [i, v]))('case %i', (_i, v: any) => {
    const i = v.input;
    const input: SolvencyInputs = {
      brsBalance: BigInt(i.brsBalance),
      tesouroUnits: BigInt(i.tesouroUnits),
      tesouroPrice: BigInt(i.tesouroPrice),
      remainingCoverTotal: BigInt(i.remainingCoverTotal),
      coverageRatioBps: i.coverageRatioBps,
      provisions: BigInt(i.provisions),
      bufferEarmark: BigInt(i.bufferEarmark),
      featureFlags: BigInt(i.featureFlags),
      headStarved: i.headStarved,
    };
    if (v.output === 'error') {
      expect(() => computeSolvency(input)).toThrow(MathOverflowError);
      return;
    }
    const s = computeSolvency(input);
    expect({
      tesouroValue: s.tesouroValue.toString(),
      stableAssets: s.stableAssets.toString(),
      coverageRequired: s.coverageRequired.toString(),
      surplus: s.surplus.toString(),
      earmarkEff: s.earmarkEff.toString(),
      freeCapital: s.freeCapital.toString(),
      liquidBudget: s.liquidBudget.toString(),
      netAssets: s.netAssets.toString(),
      mode: s.mode,
      deficit: s.deficit.toString(),
    }).toEqual(v.output);
  });

  test('the vectors cover the earmark branches', () => {
    const outs = vectors.solvency.filter((v: any) => v.output !== 'error');
    expect(outs.some((v: any) => v.output.earmarkEff !== '0')).toBe(true);
    expect(outs.some((v: any) => v.output.mode === 1)).toBe(true);
    expect(outs.some((v: any) => v.input.headStarved && v.input.featureFlags !== '0')).toBe(true);
  });
});

describe('head starvation parity', () => {
  test.each(vectors.headStarved.map((v: any, i: number) => [i, v]))('case %i', (_i, v: any) => {
    const at = v.headRequestedAt === null ? null : BigInt(v.headRequestedAt);
    expect(headStarved(BigInt(v.now), at, BigInt(v.bufferReleaseAfterSecs))).toBe(v.starved);
  });
});

describe('input validation', () => {
  test('rejects values outside u64', () => {
    expect(() => mulDiv(-1n, 1n, 1n, 'down')).toThrow(RangeError);
    expect(() => sharesFor(1n << 64n, 0n, 0n)).toThrow(RangeError);
  });
});
