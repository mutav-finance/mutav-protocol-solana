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

/** Basis-point denominator (`10_000` = 100%). */
export const BPS_DENOMINATOR = 10_000n;
/** Program minimum for `coverage_ratio_bps`: c ≥ 0.10 (ADR 0016). */
export const MIN_COVERAGE_RATIO_BPS = 1_000;
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

function toU64(x: bigint): bigint {
  if (x > U64_MAX) throw new MathOverflowError();
  return x;
}

const satSub = (a: bigint, b: bigint) => (a > b ? a - b : 0n);

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

/** Liquid BRS a redemption fill may use: `max(0, brs_balance − provisions)`. */
export const liquidBudget = (brsBalance: bigint, provisions: bigint) => satSub(u64(brsBalance), u64(provisions));

export const netAssets = (stableAssets: bigint, provisions: bigint) =>
  satSub(u64(stableAssets), u64(provisions));

/** Published NAV per share (`NAV_SCALE`); `0` with no shares outstanding, as the program publishes. */
export function navPerShare(netAssets: bigint, sharesOutstanding: bigint): bigint {
  if (u64(sharesOutstanding) === 0n) return 0n;
  return mulDiv(netAssets, NAV_SCALE, sharesOutstanding, 'down');
}

export type SolvencyInputs = {
  brsBalance: bigint;
  remainingCoverTotal: bigint;
  coverageRatioBps: number;
  provisions: bigint;
};

export type Solvency = {
  /** The tracked BRS balance: the pilot reserve holds BRS only (ADR 0019). */
  stableAssets: bigint;
  coverageRequired: bigint;
  surplus: bigint;
  /** Equal to `surplus` (no instant-exit earmark, ADR 0019). */
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
  const stable = u64(i.brsBalance);
  const required = coverageRequired(i.remainingCoverTotal, i.coverageRatioBps, i.provisions);
  const sur = surplus(stable, required);
  const underCovered = stable < required;
  return {
    stableAssets: stable,
    coverageRequired: required,
    surplus: sur,
    freeCapital: sur,
    liquidBudget: liquidBudget(i.brsBalance, i.provisions),
    netAssets: netAssets(stable, i.provisions),
    mode: underCovered ? MODE_UNDER_COVERED : MODE_NORMAL,
    underCovered,
    deficit: satSub(required, stable),
  };
}

/** Length of the claim-payment window in days (ADR 0019). */
export const CLAIM_WINDOW_DAYS = 31;

/**
 * Claim payments counted against `max_claim_per_period` at `now`: the
 * buckets of the last 31 UTC days, after the roll `pay_claim` applies
 * (ADR 0019). Mirrors `VaultState::roll_claim_window` + `claim_window_paid`.
 */
export function claimWindowPaid(
  state: { claimDayBuckets: readonly bigint[]; claimDayAnchor: bigint },
  now: bigint,
): bigint {
  const day = (now >= 0n ? now : now - 86_399n) / 86_400n;
  const d = day > state.claimDayAnchor ? day : state.claimDayAnchor;
  const gap = d - state.claimDayAnchor;
  const n = BigInt(CLAIM_WINDOW_DAYS);
  if (gap >= n) return 0n;
  const cleared = new Set<number>();
  for (let x = state.claimDayAnchor + 1n; x <= d; x++) cleared.add(Number(((x % n) + n) % n));
  return state.claimDayBuckets.reduce((sum, b, i) => (cleared.has(i) ? sum : sum + b), 0n);
}

/**
 * The split `contribute_fees` applies: `take = floor(amount × takeBps /
 * 10_000)` to the treasury, `net = amount − take` into the reserve, rounded in
 * the reserve's favour. Issuer income has no take (ADR 0019).
 */
export function takeSplit(amount: bigint, takeBps: number): { take: bigint; net: bigint } {
  const take = mulDiv(amount, BigInt(takeBps), BPS_DENOMINATOR, 'down');
  return { take, net: amount - take };
}

/** `true` for a well-formed `YYYYMM` statement month, as `sweep_income` checks. */
export function isValidIncomePeriod(period: number): boolean {
  return Number.isInteger(period) && period >= 200_001 && period <= 999_912 && period % 100 >= 1 && period % 100 <= 12;
}
