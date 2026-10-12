/**
 * Config helpers. Pure functions; nothing here signs.
 */
import type { Address } from '@solana/kit';
import type { Caps, CapsInput, ConfigParam, NavBounds } from './generated';

/**
 * The `CapsInput` that reproduces `caps` as stored, with `overrides` on top:
 * the shape `initialize` takes. Drops the padding.
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
    stressBuffer: caps.stressBuffer,
    maxQueueWaitSecs: caps.maxQueueWaitSecs,
    maxReinstateAge: caps.maxReinstateAge,
    ...overrides,
  };
}

/** The `VaultConfig` fields `set_config` can change (ADR 0026). */
export type SettableConfig = {
  coverageRatioBps: number;
  feeTakeBps: number;
  featureFlags: bigint;
  mutavCapitalWallet: Address;
  caps: Pick<
    Caps,
    | 'maxTvl'
    | 'maxCoverPerGuarantee'
    | 'maxClaimPerCall'
    | 'maxClaimPerPeriod'
    | 'minRequest'
    | 'maxRequest'
    | 'maxNavMoveBps'
    | 'stressBuffer'
    | 'maxQueueWaitSecs'
    | 'maxReinstateAge'
  >;
};

/** Most params one `set_config` call may carry. */
export const MAX_CONFIG_PARAMS = 16;

/**
 * The sparse `set_config` params that turn `current` into `next`: one param
 * per field that differs, in the program's variant order, none for an
 * unchanged field. An empty list means there is nothing to propose (the
 * program refuses an empty `set_config`).
 */
export function configParamsDiff(current: SettableConfig, next: SettableConfig): ConfigParam[] {
  const out: ConfigParam[] = [];
  const top = <K extends 'coverageRatioBps' | 'feeTakeBps' | 'featureFlags' | 'mutavCapitalWallet'>(
    key: K,
    kind: ConfigParam['__kind'],
  ) => {
    if (current[key] !== next[key]) out.push({ __kind: kind, fields: [next[key]] } as ConfigParam);
  };
  const cap = <K extends keyof SettableConfig['caps']>(key: K, kind: ConfigParam['__kind']) => {
    if (current.caps[key] !== next.caps[key]) out.push({ __kind: kind, fields: [next.caps[key]] } as ConfigParam);
  };
  top('coverageRatioBps', 'CoverageRatioBps');
  top('feeTakeBps', 'FeeTakeBps');
  top('featureFlags', 'FeatureFlags');
  top('mutavCapitalWallet', 'MutavCapitalWallet');
  cap('maxTvl', 'MaxTvl');
  cap('maxCoverPerGuarantee', 'MaxCoverPerGuarantee');
  cap('maxClaimPerCall', 'MaxClaimPerCall');
  cap('maxClaimPerPeriod', 'MaxClaimPerPeriod');
  cap('minRequest', 'MinRequest');
  cap('maxRequest', 'MaxRequest');
  cap('maxNavMoveBps', 'MaxNavMoveBps');
  cap('stressBuffer', 'StressBuffer');
  cap('maxQueueWaitSecs', 'MaxQueueWaitSecs');
  cap('maxReinstateAge', 'MaxReinstateAge');
  return out;
}

/**
 * `true` when the params change a field that needs a `refresh` in the same
 * slot first (`coverage_ratio_bps`, `max_nav_move_bps`, `stress_buffer`):
 * compose `refresh` before `set_config` in the same transaction.
 */
export function configParamsNeedRefresh(params: readonly ConfigParam[]): boolean {
  return params.some((p) => p.__kind === 'CoverageRatioBps' || p.__kind === 'MaxNavMoveBps' || p.__kind === 'StressBuffer');
}

/** Bounds that accept every NAV. */
export const ANY_NAV: NavBounds = { min: 0n, max: 2n ** 64n - 1n };

/**
 * `nav_bounds` for a fill or `clear_fulfil_halt` proposal: `nav` (NAV per
 * share, `NAV_SCALE`) ± `toleranceBps`, rounded outward and clamped to
 * `u64`. `/admin` composes it around the NAV it shows when it proposes.
 */
export function navBoundsAround(nav: bigint, toleranceBps: number): NavBounds {
  if (nav < 0n || toleranceBps < 0 || !Number.isInteger(toleranceBps)) throw new RangeError('invalid NAV bounds input');
  const delta = (nav * BigInt(toleranceBps) + 9_999n) / 10_000n;
  const max = nav + delta;
  return { min: nav > delta ? nav - delta : 0n, max: max > ANY_NAV.max ? ANY_NAV.max : max };
}
