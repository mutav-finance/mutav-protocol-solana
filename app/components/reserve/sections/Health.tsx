"use client";

/**
 * /reserve · Health. Renders on-chain values from /api/ledger; nothing is
 * computed here beyond sums and differences of account fields.
 */
import type { ReactNode } from "react";
import { MetricCard } from "@/components/MetricCard";
import { Mono } from "@/components/Mono";
import { InfoTooltip } from "@/components/InfoTooltip";
import { fmtBps, fmtBrs, fmtNav, fmtRatio, fmtShares } from "@/lib/format";
import { frac, solvencyMeter } from "@/lib/charts";
import { MODE_LABEL, type ReserveView } from "@/lib/view";
import { navPerShare } from "@mutav-finance/mutav-protocol-solana";
import { C, Track } from "@/components/charts/Charts";

import { Section } from "@/components/Section";
import type { Data } from "@/components/reserve/sections/shared";

// ── Health ──────────────────────────────────────────────────────────────────

/** Inter Medium 12px caps label (STYLE.md §3.1). */
const Label = ({ children }: { children: ReactNode }) => (
  <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={{ letterSpacing: "0.01em" }}>
    {children}
  </span>
);

/** Brand badge (STYLE.md §3.5): 6px square in the status color + mono label in text-2. Static, not a live region. */
function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" style={{ width: 6, height: 6, flexShrink: 0, background: color }} />
      <Mono style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--color-text-2)" }}>{label}</Mono>
    </span>
  );
}

export function Health({ r }: { r: ReserveView }) {
  const s = r.state;
  const sol = r.solvency;
  const navNow = navPerShare(sol.netAssets, s.sharesOutstanding);
  const underCovered = s.mode !== 0;
  // ★ the full-width lead tile; ● four figures in one row; ○ one quiet strip.
  return (
    <div className="flex flex-col gap-4">
      <SolvencyTile r={r} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="col-span-1 grid">
          <MetricCard
            label="Free capital"
            value={fmtBrs(sol.freeCapital)}
            unit="available for new guarantees and redemptions"
            tooltip={`Equals the surplus in the pilot: stable assets − coverage required (${fmtBrs(sol.surplus)}). New guarantees and redemptions are checked against it; it never blocks a claim payment.`}
          />
        </div>
        <div className="col-span-1 grid">
          <MetricCard
            label="NAV per share"
            value={fmtNav(s.navPerShare)}
            unit={navNow !== s.navPerShare ? `published on-chain · now ${fmtNav(navNow)} (recomputed)` : "published on-chain"}
            tooltip="Net assets (stable assets − open claim provisions) ÷ shares outstanding. A filed claim books a provision, so net assets drop before any BRS leaves the reserve. Published on refresh; 'now' is recomputed from the current accounts."
          />
        </div>
        <div className="col-span-1 grid">
          <MetricCard label="Open provisions" value={fmtBrs(s.provisions)} unit="filed claims, not yet paid" tooltip="Booked when a claim is filed; already out of NAV." />
        </div>
        <div className="col-span-1 grid">
          <MetricCard
            label="Asset mix"
            value={sol.tesouroValue > 0n && sol.stableAssets > 0n ? `${fmtBps(Number(((sol.stableAssets - sol.tesouroValue) * 10_000n) / sol.stableAssets))} BRS` : "100% BRS"}
            unit="more assets through capped adapters"
            tooltip="Stable assets by kind: BRS held in the reserve, plus any value held through whitelisted, capped adapters (none in the pilot). The Reserve Admin manages the allocation."
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-4">
        <span className="inline-flex items-baseline gap-2">
          <Label>Shares outstanding</Label>
          <Mono style={{ fontSize: 13, color: "var(--color-text)" }}>{fmtShares(s.sharesOutstanding)}</Mono>
        </span>
        {underCovered && <Badge color="var(--color-error)" label={`${MODE_LABEL(s.mode).toUpperCase()} MODE`} />}
        <Badge color={s.fulfilHalted ? "var(--color-error)" : "var(--color-text-3)"} label={s.fulfilHalted ? "QUEUE FILLS HALTED" : "QUEUE FILLS OPEN"} />
        <Badge color={r.config.paused ? "var(--color-error)" : "var(--color-text-3)"} label={r.config.paused ? "PAUSED" : "NOT PAUSED"} />
      </div>
    </div>
  );
}

/**
 * The lead tile: the core invariant `stable_assets ≥ coverage_required`. The
 * ratio is the headline; stable assets and coverage required appear here once,
 * as two bars on one axis. The only live region of the section.
 */
function SolvencyTile({ r }: { r: ReserveView }) {
  const m = solvencyMeter(r.solvency);
  const covered = !m.underCovered;
  const color = covered ? "var(--color-success)" : "var(--color-error)";
  const label = covered ? "COVERED" : "UNDER-COVERED";
  const bar = (name: string, tip: string, value: bigint, note: string, segs: { f: number; color: string }[]) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5">
          <Label>{name}</Label>
          <InfoTooltip label={`Info: ${name}`} width={240}>{tip}</InfoTooltip>
        </span>
        <Mono style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text)" }}>{fmtBrs(value)}</Mono>
      </div>
      <Track height={8} segs={segs} />
      <Mono style={{ fontSize: 11, color: "var(--color-text-3)" }}>{note}</Mono>
    </div>
  );
  const status = m.coveredBps === null ? "no cover outstanding" : m.underCovered ? `short ${fmtBrs(m.shortfall)}` : null;
  return (
    <div
      role="status"
      aria-label={`Coverage status: ${label}, ratio ${fmtRatio(m.stableAssets, m.coverageRequired)}`}
      className="bg-(--color-surface) grid grid-cols-1 gap-6 border p-6 lg:grid-cols-2 lg:gap-10"
      style={{ borderTop: `4px solid ${color}` }}
    >
      <div className="flex flex-col justify-between gap-4">
      <Badge color={color} label={label} />
      <div className="flex flex-col gap-2">
        <span className="inline-flex items-center gap-1.5">
          <Label>Coverage ratio</Label>
          <InfoTooltip label="Info: Coverage ratio" width={240}>Stable assets ÷ coverage required. Above 100% the reserve holds more than it must.</InfoTooltip>
        </span>
        <Mono style={{ fontSize: "clamp(40px, 5vw, 64px)", fontWeight: 700, lineHeight: 1, color }}>{fmtRatio(m.stableAssets, m.coverageRequired)}</Mono>
        {status && <Mono style={{ fontSize: 11, color: m.underCovered ? "var(--color-error)" : "var(--color-text-3)" }}>{status}</Mono>}
      </div>
      </div>
      <div className="flex flex-col justify-center gap-4 border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
        {bar(
          "Stable assets",
          "BRS held by the reserve: the reserve token account. Excludes pending deposits and assets owed to filled redemptions. Bar: the part that backs cover, then the surplus.",
          m.stableAssets,
          "BRS only in the pilot",
          [{ f: frac(m.backing, m.axis), color: C.ink }, { f: frac(m.surplus, m.axis), color: C.good }],
        )}
        {bar(
          "Coverage required",
          `Required share of remaining cover (set by the Reserve Admin, at least 10%; today ${fmtBps(r.config.coverageRatioBps)}): ceil(c × remaining cover of every active guarantee). Never less than open claim provisions. A red segment is a shortfall.`,
          m.coverageRequired,
          `${fmtBps(r.config.coverageRatioBps)} of remaining cover`,
          [{ f: frac(m.backing, m.axis), color: C.mid }, { f: frac(m.shortfall, m.axis), color: C.bad }],
        )}
      </div>
    </div>
  );
}

/** The Health section of /reserve: heading, roles and body. */
export function HealthSection({ d }: { d: Data }) {
  return (
    <Section
      id="health"
      title="Health"
      kicker="Solvency"
      subtitle="Is the reserve covered? Read live from the program's accounts."
      info="Computed with the program's own formulas from its on-chain accounts. The coverage ratio and caps are set by the Reserve Admin."
    >
      <Health r={d.reserve} />
    </Section>
  );
}
