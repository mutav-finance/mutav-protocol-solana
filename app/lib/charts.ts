/**
 * Chart data shaping: pure functions from the on-chain view models to the
 * bars the charts draw. No history is invented: every chart is a snapshot of
 * the current accounts, or a set of on-chain timestamps already recorded.
 * Amounts stay `bigint` until the last step, where a share of the axis is
 * turned into a fraction for layout only.
 */
import type { Solvency } from "@mutav-finance/mutav-protocol-solana";
import type { AgencyRow, ClaimRow, CoverageRow, FlowTotals } from "./view";
import { FLOW_ROLES, type Role } from "./roles";

/** `part / whole` as a layout fraction in [0, 1]. Zero when `whole` is zero. */
export function frac(part: bigint, whole: bigint): number {
  if (whole <= 0n || part <= 0n) return 0;
  if (part >= whole) return 1;
  return Number((part * 1_000_000n) / whole) / 1_000_000;
}

const max = (xs: bigint[]) => xs.reduce((m, x) => (x > m ? x : m), 0n);

// ── Coverage vs the reserve ─────────────────────────────────────────────────

export type SolvencyMeter = {
  /** Axis maximum: the larger of stable assets and coverage required. */
  axis: bigint;
  stableAssets: bigint;
  coverageRequired: bigint;
  /** Part of stable assets that backs coverage required. */
  backing: bigint;
  /** Stable assets beyond coverage required (surplus, ≥ 0). */
  surplus: bigint;
  /** Coverage required beyond stable assets (≥ 0): the under-coverage gap. */
  shortfall: bigint;
  freeCapital: bigint;
  /** Stable assets ÷ coverage required, in bps; null with no cover outstanding. */
  coveredBps: bigint | null;
  underCovered: boolean;
};

export function solvencyMeter(s: Pick<Solvency, "stableAssets" | "coverageRequired" | "freeCapital">): SolvencyMeter {
  const { stableAssets, coverageRequired, freeCapital } = s;
  const backing = stableAssets < coverageRequired ? stableAssets : coverageRequired;
  return {
    axis: stableAssets > coverageRequired ? stableAssets : coverageRequired,
    stableAssets,
    coverageRequired,
    backing,
    surplus: stableAssets - backing,
    shortfall: coverageRequired - backing,
    freeCapital,
    coveredBps: coverageRequired === 0n ? null : (stableAssets * 10_000n) / coverageRequired,
    underCovered: coverageRequired > stableAssets,
  };
}

/** What NAV is computed on: stable assets split into net assets and open claim provisions. */
export type NavBasis = { stableAssets: bigint; netAssets: bigint; provisions: bigint };

export function navBasis(s: Pick<Solvency, "stableAssets" | "netAssets">): NavBasis {
  const provisions = s.stableAssets > s.netAssets ? s.stableAssets - s.netAssets : 0n;
  return { stableAssets: s.stableAssets, netAssets: s.netAssets, provisions };
}

// ── Remaining cover by guarantee ────────────────────────────────────────────

export type CoverBar = { address: string; id: string; defaultLeft: bigint; exitLeft: bigint; total: bigint };

/** Active guarantees, largest remaining cover first, at most `limit` (the table lists them all). */
export function coverBars(rows: CoverageRow[], limit = 12): { bars: CoverBar[]; axis: bigint; hidden: number } {
  const active = rows
    .filter((r) => r.active)
    .map((r) => ({ address: r.address, id: r.id, defaultLeft: r.defaultRemaining, exitLeft: r.exitRemaining, total: r.remaining }))
    .sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0));
  const bars = active.slice(0, limit);
  return { bars, axis: max(bars.map((b) => b.total)), hidden: active.length - bars.length };
}

/**
 * Each agency's outstanding cover as a fraction of the largest one. The
 * program has no per-agency cap (ADR 0019); the figures come from the
 * guarantee accounts.
 */
export const agencyCoverShare = (rows: AgencyRow[]) => {
  const top = max(rows.map((a) => a.outstandingCover));
  return rows.map((a) => ({ agencyId: a.agencyId, outstanding: a.outstandingCover, used: top === 0n ? 0 : Number((a.outstandingCover * 10_000n) / top) / 10_000 }));
};

// ── Claim speed ─────────────────────────────────────────────────────────────

export type ClaimSpeed = {
  filing: string;
  guaranteeId: string;
  leg: "default" | "exit";
  /** Filed → paid, seconds; null while unpaid. */
  fileToPay: bigint | null;
  /** Paid → settled, seconds; while unsettled, the time elapsed so far (`pending`). */
  payToSettle: bigint | null;
  pending: boolean;
};

/**
 * Durations from the on-chain timestamps of each claim (oldest filing first).
 * The program sets no settlement deadline (ADR 0019).
 */
export function claimSpeed(rows: ClaimRow[], now: bigint): { claims: ClaimSpeed[]; payAxis: bigint; settleAxis: bigint } {
  const claims = [...rows]
    .sort((a, b) => Number(a.filedAt - b.filedAt))
    .map((c): ClaimSpeed => {
      const pending = c.paidAt !== null && c.settledAt === null;
      return {
        filing: c.filing,
        guaranteeId: c.guaranteeId,
        leg: c.leg,
        fileToPay: c.fileToPay,
        payToSettle: c.payToSettle ?? (pending ? (now > c.paidAt! ? now - c.paidAt! : 0n) : null),
        pending,
      };
    });
  const payAxis = max(claims.map((c) => c.fileToPay ?? 0n));
  const settled = max(claims.map((c) => c.payToSettle ?? 0n));
  return { claims, payAxis, settleAxis: settled };
}

// ── Money flows ─────────────────────────────────────────────────────────────

export type FlowBar = {
  key: "deposits" | "fees" | "income" | "claims" | "redemptions" | "take";
  label: string;
  /** Into the reserve (+) or out of it (−); the treasury take never touches the reserve. */
  amount: bigint;
  direction: "in" | "out" | "outside";
  by: Role;
  requestedBy?: Role;
  /** Where the total comes from. */
  source: "state" | "events";
};

/**
 * Totals by kind. Fee, issuer income and claim totals are `VaultState` counters (complete);
 * deposit and redemption totals sum the fill events found in recent escrow
 * history (see `readCapitalEvents`), so the chart says so.
 */
export function flowBars(t: FlowTotals): { bars: FlowBar[]; axis: bigint } {
  const bars: FlowBar[] = [
    { key: "deposits", label: "Deposits in", amount: t.depositsIn, direction: "in", ...FLOW_ROLES.deposit, source: "events" },
    { key: "fees", label: "Guarantee fees, net", amount: t.feesNetToReserve, direction: "in", ...FLOW_ROLES.fee, source: "state" },
    { key: "income", label: "Issuer income, net", amount: t.incomeNetToReserve, direction: "in", ...FLOW_ROLES.income, source: "state" },
    { key: "claims", label: "Claim payments", amount: t.claimsPaid, direction: "out", ...FLOW_ROLES.claim, source: "state" },
    { key: "redemptions", label: "Redemptions out", amount: t.redemptionsOut, direction: "out", ...FLOW_ROLES.redemption, source: "events" },
    { key: "take", label: "Fee take → treasury", amount: t.feeTakeToTreasury, direction: "outside", ...FLOW_ROLES.fee, source: "state" },
  ];
  return { bars, axis: max(bars.map((b) => b.amount)) };
}
