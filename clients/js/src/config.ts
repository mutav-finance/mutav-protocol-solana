/**
 * Config helpers. Pure functions; nothing here signs.
 */
import type { Caps, CapsInput } from './generated';

/**
 * The `CapsInput` that reproduces `caps` as stored, with `overrides` on top:
 * the request shape `initialize` / `set_config` take. Drops the padding and
 * the fields carved for later instructions (ADR 0019), which `set_config`
 * does not take yet.
 */
export function capsInputFromConfig(caps: Caps, overrides: Partial<CapsInput> = {}): CapsInput {
  return {
    maxTvl: caps.maxTvl,
    maxCoverPerGuarantee: caps.maxCoverPerGuarantee,
    maxClaimPerCall: caps.maxClaimPerCall,
    maxClaimPerPeriod: caps.maxClaimPerPeriod,
    minRequest: caps.minRequest,
    maxRequest: caps.maxRequest,
    maxNavMoveBps: caps.maxNavMoveBps,
    ...overrides,
  };
}
