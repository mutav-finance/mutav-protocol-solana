/**
 * Previews of the capital instructions, from decoded `VaultConfig` and
 * `VaultState`. They replay the program's rules with the math mirror, so a
 * preview matches the program for the same state; the program is still the
 * authority, and state can move between the read and the transaction.
 *
 * Whole fills only, like the program (ADR 0019).
 */
import type { VaultConfig } from './generated/accounts/vaultConfig';
import type { VaultState } from './generated/accounts/vaultState';
import { assetsFor, computeSolvency, conversionNav, isUnderwater, sharesFor, U64_MAX, type Solvency } from './math';

/**
 * The config fields the previews read. `caps.stressBuffer` enters
 * `coverage_required` (ADR 0022); pass the decoded `VaultConfig` and it is
 * read from there.
 */
type ConfigView = Pick<VaultConfig, 'coverageRatioBps'> & { caps?: Pick<VaultConfig['caps'], 'stressBuffer'> };
type StateView = Pick<
  VaultState,
  'brsBalance' | 'remainingCoverTotal' | 'provisions' | 'sharesOutstanding' | 'fulfilHalted' | 'mode'
>;

/** The §4 snapshot the program computes from these accounts. */
export function solvencyFromAccounts(
  config: ConfigView,
  state: Pick<StateView, 'brsBalance' | 'remainingCoverTotal' | 'provisions'>,
  opts: { brsBalance?: bigint } = {},
): Solvency {
  return computeSolvency({
    brsBalance: opts.brsBalance ?? state.brsBalance,
    remainingCoverTotal: state.remainingCoverTotal,
    coverageRatioBps: config.coverageRatioBps,
    provisions: state.provisions,
    stressBuffer: config.caps?.stressBuffer ?? 0n,
  });
}

export type DepositFill = { assets: bigint; shares: bigint; nav: bigint };
/** A pending deposit: its BRS and the owner's price limit (`0n` or omitted = none). */
export type DepositHead = { assets: bigint; minSharesOut?: bigint };
export type DepositStop = 'ReserveUnderwater' | 'RequestTooSmall' | 'PriceLimitNotMet';

/**
 * Shares each pending deposit would receive if `fulfil_deposits` filled them
 * now, in FIFO order (head first). Each fill is priced after the earlier
 * ones, as on-chain. `stoppedBy` is why the batch stopped early (an
 * underwater reserve, a fill that would mint 0 shares, an unmet price
 * limit), or `null`. Pause, halt, the NAV guard and the TVL cap are not
 * replayed here.
 */
export function previewDepositFulfil(
  config: ConfigView,
  state: StateView,
  requests: (bigint | DepositHead)[],
): { fills: DepositFill[]; stoppedBy: DepositStop | null } {
  let net = solvencyFromAccounts(config, state).netAssets;
  let shares = state.sharesOutstanding;
  const fills: DepositFill[] = [];
  if (isUnderwater(net, shares)) return { fills, stoppedBy: 'ReserveUnderwater' };
  for (const q of requests) {
    const { assets: a, minSharesOut = 0n } = typeof q === 'bigint' ? { assets: q } : q;
    const nav = conversionNav(shares, net);
    const out = sharesFor(a, shares, net);
    if (out === 0n) return { fills, stoppedBy: 'RequestTooSmall' };
    if (out < minSharesOut) return { fills, stoppedBy: 'PriceLimitNotMet' };
    net += a;
    shares += out;
    fills.push({ assets: a, shares: out, nav });
  }
  return { fills, stoppedBy: null };
}

/** An open redeem request: the shares it escrows (filled whole) and the owner's price limit. */
export type RedeemHead = { seq: bigint; shares: bigint; minAssetsOut?: bigint };
export type RedeemFill = { seq: bigint; shares: bigint; assets: bigint; nav: bigint };
export type RedeemStop =
  | 'Paused'
  | 'UnderCovered'
  | 'FulfilHalted'
  | 'RequestTooSmall'
  | 'PriceLimitNotMet'
  | 'ReserveUnderwater'
  | 'InsufficientFreeCapital'
  | 'InsufficientLiquidBalance';

/**
 * What `fulfil_redeems(count, max_assets)` would fill from these pending
 * requests (head first, dead seqs already skipped). `stoppedBy` is the reason
 * the batch stopped before `count`, or the error the program would return
 * for a call that fills nothing; `null` when it simply ran out of requests or
 * reached `count`.
 */
export function previewRedeemFulfil(
  config: ConfigView & { paused?: boolean },
  state: StateView,
  requests: RedeemHead[],
  opts: { count?: number; maxAssets?: bigint } = {},
): { fills: RedeemFill[]; stoppedBy: RedeemStop | null } {
  const count = opts.count ?? 8;
  const maxAssets = opts.maxAssets ?? U64_MAX;
  const refuse = (r: RedeemStop) => ({ fills: [] as RedeemFill[], stoppedBy: r });
  if (config.paused) return refuse('Paused');
  if (state.mode !== 0) return refuse('UnderCovered');
  if (state.fulfilHalted) return refuse('FulfilHalted');
  const start = solvencyFromAccounts(config, state);
  if (start.underCovered) return refuse('UnderCovered');
  // NAV per share below the smallest unit with shares outstanding (ADR 0029).
  if (isUnderwater(start.netAssets, state.sharesOutstanding)) return refuse('ReserveUnderwater');

  let brs = state.brsBalance;
  let shares = state.sharesOutstanding;
  let paid = 0n;
  const fills: RedeemFill[] = [];
  for (const r of requests) {
    if (fills.length >= count) break;
    if (r.shares === 0n) continue;
    const sol = solvencyFromAccounts(config, state, { brsBalance: brs });
    const adminLeft = maxAssets - paid;
    const budget = [adminLeft, sol.freeCapital, sol.liquidBudget].reduce((m, x) => (x < m ? x : m));
    const value = assetsFor(r.shares, shares, sol.netAssets);
    // Worth nothing: never filled (ADR 0029); the batch stops at the head.
    if (value === 0n) return { fills, stoppedBy: 'RequestTooSmall' };
    if (value > budget) {
      const liquidBinds = sol.liquidBudget < sol.freeCapital && sol.liquidBudget < adminLeft;
      return { fills, stoppedBy: liquidBinds ? 'InsufficientLiquidBalance' : 'InsufficientFreeCapital' };
    }
    if (value < (r.minAssetsOut ?? 0n)) return { fills, stoppedBy: 'PriceLimitNotMet' };
    fills.push({ seq: r.seq, shares: r.shares, assets: value, nav: conversionNav(shares, sol.netAssets) });
    paid += value;
    brs -= value;
    shares -= r.shares;
  }
  return { fills, stoppedBy: null };
}
