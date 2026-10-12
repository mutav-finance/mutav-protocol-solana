/**
 * Chart data shaping: pure functions from the on-chain view models to the
 * bars the charts draw. No history is invented: every chart is a snapshot of
 * the current accounts, or a set of on-chain timestamps already recorded.
 * Amounts stay `bigint` until the last step, where a share of the axis is
 * turned into a fraction for layout only.
 */
import { BPS_DENOMINATOR, MODE_NORMAL, U64_MAX, type Coverage } from "@mutav-finance/mutav-protocol-solana";
import type { AgencyRow, ClaimRow, CoverageRow, FlowTotals, ReserveView } from "./view";
import { FLOW_ROLES, type Role } from "./roles";

/** `part / whole` as a layout fraction in [0, 1]. Zero when `whole` is zero. */
export function frac(part: bigint, whole: bigint): number {
  if (whole <= 0n || part <= 0n) return 0;
  if (part >= whole) return 1;
  return Number((part * 1_000_000n) / whole) / 1_000_000;
}

const max = (xs: bigint[]) => xs.reduce((m, x) => (x > m ? x : m), 0n);

// ── Coverage vs the reserve ─────────────────────────────────────────────────

export type CoverageMeter = {
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

export function coverageMeter(s: Pick<Coverage, "stableAssets" | "coverageRequired" | "freeCapital">): CoverageMeter {
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

// ── The coverage ceiling ────────────────────────────────────────────────────

/** Why no new guarantee fits right now, in the order `register_guarantee` checks it. */
export type CeilingBlock = "paused" | "under-covered" | "frozen" | "provisions";

export type CoverageCeilingInput = {
  /** `stable_assets` (= `brs_balance`). */
  stableAssets: bigint;
  coverageRatioBps: number | bigint;
  provisions: bigint;
  stressBuffer: bigint;
  /** Remaining cover of every active guarantee (`remaining_cover_total`). */
  remainingCoverTotal: bigint;
  mode: number;
  paused: boolean;
  frozen: boolean;
};

export type CoverageCeiling = {
  /** The most remaining cover the reserve can carry: the largest X with `coverage_required(X) ≤ stable_assets`. */
  ceiling: bigint;
  /** Remaining cover today. */
  inUse: bigint;
  /**
   * Total room for new cover now, across all new guarantees (0 while blocked or at/over the ceiling).
   * One guarantee is also bounded by `caps.maxCoverPerGuarantee` (register_guarantee Rule 3).
   */
  headroom: bigint;
  /** Which term sets the ceiling, or `blocked` when no new guarantee fits whatever its size. */
  binding: "ratio" | "stress" | "blocked";
  blockedBy: CeilingBlock | null;
};

/**
 * The inverse of the `register_guarantee` gate (programs/mutav/src/instructions/operator/register_guarantee.rs:95-107):
 * a lease is accepted while `coverage_required(X + new, c, P, B) ≤ stable_assets`, with
 * `coverage_required = max(ceil(c·X / 10_000), P + min(B, max(0, X − P)))` (coverage.rs; client `coverageRequired`).
 *
 * Solving for the largest X:
 * - ratio leg: `ceil(c·X / 10_000) ≤ S` ⇔ `X ≤ floor(S·10_000 / c)`;
 * - stress leg: never holds when `S < P`; always holds when `P + B ≤ S`; otherwise holds ⇔ `X ≤ S`.
 *
 * Paused, a non-NORMAL stored mode, a frozen reserve account, `S < P`, or a live snapshot that is already
 * under-covered (`X > ceiling`, i.e. `coverage_required(X) > S`, the gate's `before.under_covered()` check, which
 * holds even while the stored mode still reads NORMAL) stop every new guarantee: headroom 0, binding `blocked`.
 *
 * When `S < P` the ceiling is reported as today's cover X (nothing can grow); the `provisions` block says why,
 * so the figure is never read as backed.
 */
export function coverageCeiling(i: CoverageCeilingInput): CoverageCeiling {
  const S = i.stableAssets;
  const P = i.provisions;
  const X = i.remainingCoverTotal;
  const c = BigInt(i.coverageRatioBps);
  const byRatio = c > 0n ? (S * BPS_DENOMINATOR) / c : U64_MAX;
  const ratioMax = byRatio > U64_MAX ? U64_MAX : byRatio;

  let ceiling: bigint;
  let binding: "ratio" | "stress";
  if (S < P) {
    ceiling = X;
    binding = "stress";
  } else if (P + i.stressBuffer <= S || ratioMax <= S) {
    ceiling = ratioMax;
    binding = "ratio";
  } else {
    ceiling = S;
    binding = "stress";
  }

  const blockedBy: CeilingBlock | null = i.paused
    ? "paused"
    : i.mode !== MODE_NORMAL
      ? "under-covered"
      : i.frozen
        ? "frozen"
        : S < P
          ? "provisions"
          : X > ceiling
            ? "under-covered"
            : null;
  return {
    ceiling,
    inUse: X,
    headroom: blockedBy || ceiling <= X ? 0n : ceiling - X,
    binding: blockedBy ? "blocked" : binding,
    blockedBy,
  };
}

/** {@link coverageCeiling} from the accounts the /reserve views read. */
export const coverageCeilingOf = (r: Pick<ReserveView, "config" | "state" | "coverage" | "token">) =>
  coverageCeiling({
    stableAssets: r.coverage.stableAssets,
    coverageRatioBps: r.config.coverageRatioBps,
    provisions: r.state.provisions,
    stressBuffer: r.config.caps.stressBuffer,
    remainingCoverTotal: r.state.remainingCoverTotal,
    mode: r.state.mode,
    paused: r.config.paused,
    frozen: r.token.reserveFrozen,
  });

/** What NAV is computed on: stable assets split into net assets and open claim provisions. */
export type NavBasis = { stableAssets: bigint; netAssets: bigint; provisions: bigint };

export function navBasis(s: Pick<Coverage, "stableAssets" | "netAssets">): NavBasis {
  const provisions = s.stableAssets > s.netAssets ? s.stableAssets - s.netAssets : 0n;
  return { stableAssets: s.stableAssets, netAssets: s.netAssets, provisions };
}

// ── Where the capital sits ──────────────────────────────────────────────────

/**
 * Stable assets split by what they are committed to: open claim provisions,
 * the rest of coverage required, and free capital (there is no instant-exit
 * earmark, ADR 0019). The held parts sum to stable assets; `shortfall` is
 * required and not held.
 */
export type CapitalSplit = {
  stableAssets: bigint;
  /** Held against filed, unpaid claims (capped at what is held). */
  provisions: bigint;
  /** Held against coverage required beyond provisions (the ratio leg or the stress floor, whichever binds). */
  restRequired: bigint;
  freeCapital: bigint;
  /** Coverage required beyond stable assets (≥ 0). */
  shortfall: bigint;
  /** Axis for a chart: the larger of stable assets and coverage required. */
  axis: bigint;
};

export function capitalSplit(s: Pick<Coverage, "stableAssets" | "coverageRequired" | "freeCapital">, provisions: bigint): CapitalSplit {
  const held = s.stableAssets;
  const p = provisions < held ? provisions : held;
  const backing = s.coverageRequired < held ? s.coverageRequired : held;
  return {
    stableAssets: held,
    provisions: p,
    restRequired: backing > p ? backing - p : 0n,
    freeCapital: s.freeCapital,
    shortfall: s.coverageRequired > held ? s.coverageRequired - held : 0n,
    axis: held > s.coverageRequired ? held : s.coverageRequired,
  };
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
