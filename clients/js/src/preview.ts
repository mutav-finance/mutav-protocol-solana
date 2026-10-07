/**
 * Previews of the capital instructions, from decoded `VaultConfig` and
 * `VaultState`. They replay the program's rules with the math mirror, so a
 * preview matches the program for the same state; the program is still the
 * authority, and state can move between the read and the transaction.
 *
 * Whole fills only, like the pilot program. Partial fills at the queue head
 * (ADR 0010) are built later, and their sizing will be mirrored then.
 */
import type { VaultConfig } from './generated/accounts/vaultConfig';
import type { VaultState } from './generated/accounts/vaultState';
import { assetsFor, computeSolvency, conversionNav, headStarved, sharesFor, U64_MAX, type Solvency } from './math';

type ConfigView = Pick<VaultConfig, 'coverageRatioBps' | 'featureFlags'> & {
  exit?: Pick<VaultConfig['exit'], 'bufferReleaseAfterSecs'>;
};
type StateView = Pick<
  VaultState,
  | 'brsBalance'
  | 'tesouroUnits'
  | 'tesouroPrice'
  | 'remainingCoverTotal'
  | 'provisions'
  | 'bufferEarmark'
  | 'sharesOutstanding'
  | 'fulfilHalted'
  | 'pendingNotices'
  | 'mode'
>;

/**
 * The §4 snapshot the program computes from these accounts. Uses the last
 * stored TESOURO price; the program re-reads a bounded price when it holds
 * TESOURO (pilot: none).
 */
export function solvencyFromAccounts(
  config: ConfigView,
  state: Omit<StateView, 'sharesOutstanding' | 'fulfilHalted' | 'pendingNotices' | 'mode'>,
  opts: { headStarved?: boolean; brsBalance?: bigint } = {},
): Solvency {
  return computeSolvency({
    brsBalance: opts.brsBalance ?? state.brsBalance,
    tesouroUnits: state.tesouroUnits,
    tesouroPrice: state.tesouroPrice,
    remainingCoverTotal: state.remainingCoverTotal,
    coverageRatioBps: config.coverageRatioBps,
    provisions: state.provisions,
    bufferEarmark: state.bufferEarmark,
    featureFlags: config.featureFlags,
    headStarved: opts.headStarved ?? false,
  });
}

export type DepositFill = { assets: bigint; shares: bigint; nav: bigint };

/**
 * Shares each pending deposit would receive if `fulfil_deposits` filled them
 * now, in FIFO order (`assets` from the head). Each fill is priced after the
 * earlier ones, as on-chain.
 */
export function previewDepositFulfil(config: ConfigView, state: StateView, assets: bigint[]): DepositFill[] {
  let net = solvencyFromAccounts(config, state).netAssets;
  let shares = state.sharesOutstanding;
  return assets.map((a) => {
    const nav = conversionNav(shares, net);
    const out = sharesFor(a, shares, net);
    net += a;
    shares += out;
    return { assets: a, shares: out, nav };
  });
}

export type RedeemHead = { seq: bigint; sharesRemaining: bigint; requestedAt: bigint };
export type RedeemFill = { seq: bigint; shares: bigint; assets: bigint; nav: bigint };
export type RedeemStop =
  | 'Paused'
  | 'ClaimNoticePending'
  | 'UnderCovered'
  | 'FulfilHalted'
  | 'StalePrice'
  | 'RequestTooSmall'
  | 'InsufficientFreeCapital'
  | 'InsufficientLiquidBalance';

/**
 * What `fulfil_redeems(count, max_assets)` would fill from these open
 * requests (head first, dead seqs already skipped). `stoppedBy` is the reason
 * the batch stopped before `count`, or the error the program would return
 * for a call that fills nothing; `null` when it simply ran out of requests or
 * reached `count`.
 */
export function previewRedeemFulfil(
  config: ConfigView & { paused?: boolean },
  state: StateView,
  requests: RedeemHead[],
  opts: { count?: number; maxAssets?: bigint; now?: bigint } = {},
): { fills: RedeemFill[]; stoppedBy: RedeemStop | null } {
  const count = opts.count ?? 8;
  const maxAssets = opts.maxAssets ?? U64_MAX;
  const now = opts.now ?? BigInt(Math.floor(Date.now() / 1000));
  const refuse = (r: RedeemStop) => ({ fills: [] as RedeemFill[], stoppedBy: r });
  if (config.paused) return refuse('Paused');
  if (state.pendingNotices !== 0) return refuse('ClaimNoticePending');
  if (state.mode !== 0) return refuse('UnderCovered');
  if (state.fulfilHalted) return refuse('FulfilHalted');
  if (state.tesouroUnits !== 0n) return refuse('StalePrice');
  if (solvencyFromAccounts(config, state).underCovered) return refuse('UnderCovered');

  const releaseAfter = config.exit?.bufferReleaseAfterSecs ?? 0n;
  let brs = state.brsBalance;
  let shares = state.sharesOutstanding;
  let paid = 0n;
  const fills: RedeemFill[] = [];
  for (const r of requests) {
    if (fills.length >= count) break;
    if (r.sharesRemaining === 0n) continue;
    const sol = solvencyFromAccounts(config, state, {
      brsBalance: brs,
      headStarved: headStarved(now, r.requestedAt, releaseAfter),
    });
    const adminLeft = maxAssets - paid;
    const budget = [adminLeft, sol.freeCapital, sol.liquidBudget].reduce((m, x) => (x < m ? x : m));
    const value = assetsFor(r.sharesRemaining, shares, sol.netAssets);
    if (value === 0n) return { fills, stoppedBy: 'RequestTooSmall' };
    if (value > budget) {
      const liquidBinds = sol.liquidBudget < sol.freeCapital && sol.liquidBudget < adminLeft;
      return { fills, stoppedBy: liquidBinds ? 'InsufficientLiquidBalance' : 'InsufficientFreeCapital' };
    }
    fills.push({ seq: r.seq, shares: r.sharesRemaining, assets: value, nav: conversionNav(shares, sol.netAssets) });
    paid += value;
    brs -= value;
    shares -= r.sharesRemaining;
  }
  return { fills, stoppedBy: null };
}
