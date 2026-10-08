import { describe, expect, test } from 'bun:test';
import { capsInputFromConfig, getCapsInputEncoder, minSettlementBps, type Caps } from '../src';

const caps = (maxAllocatedBps: number): Caps => ({
  maxTvl: 1n,
  maxCoverPerGuarantee: 2n,
  maxCoverPerAgency: 3n,
  maxClaimPerCall: 4n,
  maxClaimPerPeriod: 5n,
  claimPeriodSecs: 6n,
  maxAllocatedBps,
  minRequest: 7n,
  maxRequest: 8n,
  minFillAssets: 9n,
  reserved: new Uint8Array(32),
});

describe('settlement floor (ADR 0018 option (a))', () => {
  test('the stored complement reads as the floor; zero is the pilot (100%)', () => {
    expect(minSettlementBps({ caps: caps(0) })).toBe(10_000);
    expect(minSettlementBps({ caps: caps(4_000) })).toBe(6_000);
    expect(minSettlementBps({ caps: caps(10_000) })).toBe(0);
  });

  test('capsInputFromConfig carries every cap over and speaks the floor', () => {
    const input = capsInputFromConfig(caps(4_000));
    expect(input).toEqual({
      maxTvl: 1n,
      maxCoverPerGuarantee: 2n,
      maxCoverPerAgency: 3n,
      maxClaimPerCall: 4n,
      maxClaimPerPeriod: 5n,
      claimPeriodSecs: 6n,
      minSettlementBps: 6_000,
      minRequest: 7n,
      maxRequest: 8n,
      minFillAssets: 9n,
    });
    expect('maxAllocatedBps' in input).toBe(false);
    // It encodes as the instruction argument.
    expect(getCapsInputEncoder().encode(input).length).toBe(74);
  });

  test('overrides win', () => {
    expect(capsInputFromConfig(caps(0), { minSettlementBps: 5_000 }).minSettlementBps).toBe(5_000);
  });
});
