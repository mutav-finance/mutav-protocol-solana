import { describe, expect, test } from 'bun:test';
import { capsInputFromConfig, getCapsInputEncoder, type Caps } from '../src';

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
  test('carries every set_config cap over, never the carved fields or padding', () => {
    const input = capsInputFromConfig(caps);
    expect(input).toEqual({
      maxTvl: 1n,
      maxCoverPerGuarantee: 2n,
      maxClaimPerCall: 4n,
      maxClaimPerPeriod: 5n,
      minRequest: 7n,
      maxRequest: 8n,
      maxNavMoveBps: 100,
    });
    // It encodes as the instruction argument.
    expect(getCapsInputEncoder().encode(input).length).toBe(50);
  });

  test('overrides win', () => {
    expect(capsInputFromConfig(caps, { maxNavMoveBps: 500 }).maxNavMoveBps).toBe(500);
  });
});
