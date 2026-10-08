/**
 * TypeScript mirror of the program's math and solvency modules
 * (`programs/mutav/src/{math,solvency}.rs`, spec §4), for previews.
 *
 * Every value is a `bigint` in base units. Each function rounds exactly as the
 * program does, in the reserve's favour, and throws `MathOverflowError` where
 * the program fails with `MathOverflow`. Parity is tested against vectors the
 * program exports (`tests/fixtures/client/vectors.json`).
 *
 * The program is authoritative: a preview is computed from the last state the
 * caller read, so the result on-chain can differ if the state moves first.
 */

export const U64_MAX = (1n << 64n) - 1n;
const I64_MIN = -(1n << 63n);
const I64_MAX = (1n << 63n) - 1n;

/** Basis-point denominator (`10_000` = 100%). */
export const BPS_DENOMINATOR = 10_000n;
/** Program minimum for `coverage_ratio_bps`: c ≥ 0.10 (ADR 0016). */
export const MIN_COVERAGE_RATIO_BPS = 1_000;
/**
 * Program cap on `income_take_bps` (ADR 0017). Its value is TBD (spec §12
 * Q47), so the program fails closed at 0: all issuer income builds the
 * reserve.
 */
export const MAX_INCOME_TAKE_BPS = 0;
/** Scale of TESOURO prices: BRS base units per TESOURO base unit × 10^9. */
export const PRICE_SCALE = 1_000_000_000n;
/** Scale of NAV per share: `NAV_SCALE` is NAV 1.0. */
export const NAV_SCALE = 1_000_000_000n;
/** Share-conversion virtual offset `V = 10^0 = 1` (spec §12 Q20). */
export const VIRTUAL_OFFSET = 1n;
/** `feature_flags` bit 0: phase-2 instant exit. Never set in the pilot. */
export const INSTANT_EXIT = 1n;
/** `VaultState.mode`. */
export const MODE_NORMAL = 0;
export const MODE_UNDER_COVERED = 1;

/** The program would fail with `MathOverflow` (a result that does not fit, or a zero divisor). */
export class MathOverflowError extends Error {
  override name = 'MathOverflowError';
  constructor(message = 'MathOverflow') {
    super(message);
  }
}

function u64(x: bigint, what = 'value'): bigint {
  if (typeof x !== 'bigint' || x < 0n || x > U64_MAX) {
    throw new RangeError(`${what} must be a u64 bigint, got ${String(x)}`);
  }
  return x;
}

function i64(x: bigint, what = 'value'): bigint {
  if (typeof x !== 'bigint' || x < I64_MIN || x > I64_MAX) {
    throw new RangeError(`${what} must be an i64 bigint, got ${String(x)}`);
  }
  return x;
}

function toU64(x: bigint): bigint {
  if (x > U64_MAX) throw new MathOverflowError();
  return x;
}

const satSub = (a: bigint, b: bigint) => (a > b ? a - b : 0n);
const min = (...xs: bigint[]) => xs.reduce((m, x) => (x < m ? x : m));

export type Rounding = 'down' | 'up';

/** `a × b / d`, rounded as asked; throws when `d == 0` or the result exceeds u64. */
export function mulDiv(a: bigint, b: bigint, d: bigint, rounding: Rounding): bigint {
  u64(a, 'a');
  u64(b, 'b');
  u64(d, 'd');
  return toU64(mulDivWide(a, b, d, rounding));
}

/** `mulDiv` over u128-range inputs (the program's `mul_div_u128` intermediate). */
function mulDivWide(a: bigint, b: bigint, d: bigint, rounding: Rounding): bigint {
  if (d === 0n) throw new MathOverflowError();
  const product = a * b;
  if (product >= 1n << 128n) throw new MathOverflowError();
  const q = product / d;
  return rounding === 'up' && product % d !== 0n ? q + 1n : q;
}

/** Shares minted for `assets` on a deposit: `floor(assets × (shares + V) / (net + 1))`. */
export function sharesFor(assets: bigint, sharesOutstanding: bigint, netAssets: bigint): bigint {
  return toU64(
    mulDivWide(
      u64(assets, 'assets'),
      u64(sharesOutstanding, 'sharesOutstanding') + VIRTUAL_OFFSET,
      u64(netAssets, 'netAssets') + 1n,
      'down',
    ),
  );
}

/** Assets paid for `shares` on a redemption: `floor(shares × (net + 1) / (shares_outstanding + V))`. */
export function assetsFor(shares: bigint, sharesOutstanding: bigint, netAssets: bigint): bigint {
  return toU64(
    mulDivWide(
      u64(shares, 'shares'),
      u64(netAssets, 'netAssets') + 1n,
      u64(sharesOutstanding, 'sharesOutstanding') + VIRTUAL_OFFSET,
      'down',
    ),
  );
}

/** The conversion price fills apply, scaled by `NAV_SCALE` (defined with zero shares too). */
export function conversionNav(sharesOutstanding: bigint, netAssets: bigint): bigint {
  return toU64(
    mulDivWide(
      u64(netAssets, 'netAssets') + 1n,
      NAV_SCALE,
      u64(sharesOutstanding, 'sharesOutstanding') + VIRTUAL_OFFSET,
      'down',
    ),
  );
}

/** Value of the TESOURO position in BRS base units, rounded down. */
export const tesouroValue = (units: bigint, boundedPrice: bigint) =>
  mulDiv(units, boundedPrice, PRICE_SCALE, 'down');

/** `brs_balance + tesouro_value`. */
export function stableAssets(brsBalance: bigint, tesouroValue: bigint): bigint {
  return toU64(u64(brsBalance) + u64(tesouroValue));
}

/**
 * `max(ceil(c × remaining_cover_total / 10_000), provisions)` (ADR 0016).
 * Filed claims stay fully covered when `c < 1`; at `c ≥ 1` the provisions
 * term never binds.
 */
export function coverageRequired(
  remainingCoverTotal: bigint,
  coverageRatioBps: number | bigint,
  provisions: bigint,
): bigint {
  const byRatio = mulDiv(remainingCoverTotal, BigInt(coverageRatioBps), BPS_DENOMINATOR, 'up');
  const p = u64(provisions, 'provisions');
  return byRatio > p ? byRatio : p;
}

/** `max(0, stable_assets − coverage_required)`. */
export const surplus = (stableAssets: bigint, coverageRequired: bigint) =>
  satSub(u64(stableAssets), u64(coverageRequired));

/**
 * `now − head_requested_at > buffer_release_after_secs > 0`. `headRequestedAt`
 * is `null` when the instruction does not hold the queue head.
 */
export function headStarved(
  now: bigint,
  headRequestedAt: bigint | null,
  bufferReleaseAfterSecs: bigint,
): boolean {
  i64(now, 'now');
  i64(bufferReleaseAfterSecs, 'bufferReleaseAfterSecs');
  if (headRequestedAt === null || bufferReleaseAfterSecs <= 0n) return false;
  return now - i64(headRequestedAt, 'headRequestedAt') > bufferReleaseAfterSecs;
}

export type EarmarkInputs = {
  featureFlags: bigint;
  bufferEarmark: bigint;
  surplus: bigint;
  brsBalance: bigint;
  provisions: bigint;
  headStarved: boolean;
};

/** `0` with `INSTANT_EXIT` clear or a starved head, else `min(earmark, surplus, max(0, brs − provisions))`. */
export function earmarkEff(i: EarmarkInputs): bigint {
  if ((u64(i.featureFlags) & INSTANT_EXIT) === 0n || i.headStarved) return 0n;
  return min(u64(i.bufferEarmark), u64(i.surplus), satSub(u64(i.brsBalance), u64(i.provisions)));
}

export const freeCapital = (surplus: bigint, earmarkEff: bigint) => satSub(u64(surplus), u64(earmarkEff));

export const liquidBudget = (brsBalance: bigint, provisions: bigint, earmarkEff: bigint) =>
  satSub(satSub(u64(brsBalance), u64(provisions)), u64(earmarkEff));

export const netAssets = (stableAssets: bigint, provisions: bigint) =>
  satSub(u64(stableAssets), u64(provisions));

/** Published NAV per share (`NAV_SCALE`); `0` with no shares outstanding, as the program publishes. */
export function navPerShare(netAssets: bigint, sharesOutstanding: bigint): bigint {
  if (u64(sharesOutstanding) === 0n) return 0n;
  return mulDiv(netAssets, NAV_SCALE, sharesOutstanding, 'down');
}

export type SolvencyInputs = {
  brsBalance: bigint;
  tesouroUnits: bigint;
  /** Bounded TESOURO price, `PRICE_SCALE`. */
  tesouroPrice: bigint;
  remainingCoverTotal: bigint;
  coverageRatioBps: number;
  provisions: bigint;
  bufferEarmark: bigint;
  featureFlags: bigint;
  headStarved: boolean;
};

export type Solvency = {
  tesouroValue: bigint;
  stableAssets: bigint;
  coverageRequired: bigint;
  surplus: bigint;
  earmarkEff: bigint;
  freeCapital: bigint;
  liquidBudget: bigint;
  netAssets: bigint;
  /** `MODE_NORMAL` or `MODE_UNDER_COVERED`. */
  mode: number;
  underCovered: boolean;
  /** `coverage_required − stable_assets`, saturating at 0. */
  deficit: bigint;
};

/** Every spec §4 quantity for one snapshot (the program's `Solvency::compute`). */
export function computeSolvency(i: SolvencyInputs): Solvency {
  const tv = tesouroValue(i.tesouroUnits, i.tesouroPrice);
  const stable = stableAssets(i.brsBalance, tv);
  const required = coverageRequired(i.remainingCoverTotal, i.coverageRatioBps, i.provisions);
  const sur = surplus(stable, required);
  const earmark = earmarkEff({
    featureFlags: i.featureFlags,
    bufferEarmark: i.bufferEarmark,
    surplus: sur,
    brsBalance: i.brsBalance,
    provisions: i.provisions,
    headStarved: i.headStarved,
  });
  const underCovered = stable < required;
  return {
    tesouroValue: tv,
    stableAssets: stable,
    coverageRequired: required,
    surplus: sur,
    earmarkEff: earmark,
    freeCapital: freeCapital(sur, earmark),
    liquidBudget: liquidBudget(i.brsBalance, i.provisions, earmark),
    netAssets: netAssets(stable, i.provisions),
    mode: underCovered ? MODE_UNDER_COVERED : MODE_NORMAL,
    underCovered,
    deficit: satSub(required, stable),
  };
}

/**
 * The split `sweep_income` (and `contribute_fees`) applies: `take =
 * floor(amount × takeBps / 10_000)` to the treasury, `net = amount − take`
 * into the reserve, rounded in the reserve's favour (ADR 0017).
 */
export function takeSplit(amount: bigint, takeBps: number): { take: bigint; net: bigint } {
  const take = mulDiv(amount, BigInt(takeBps), BPS_DENOMINATOR, 'down');
  return { take, net: amount - take };
}

/** `true` for a well-formed `YYYYMM` statement month, as `sweep_income` checks. */
export function isValidIncomePeriod(period: number): boolean {
  return Number.isInteger(period) && period >= 200_001 && period <= 999_912 && period % 100 >= 1 && period % 100 <= 12;
}
