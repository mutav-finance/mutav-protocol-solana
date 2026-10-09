"use client";

/**
 * /reserve · Health: "Can the reserve cover every open guarantee?"
 * One hero (the coverage ratio, with one meter of stable assets against
 * coverage required), then one strip of four supporting figures. Renders
 * on-chain values from /api/ledger; nothing is computed here beyond sums and
 * differences of account fields.
 */
import type { ReactNode } from "react";
import { Mono } from "@/components/Mono";
import { InfoTooltip } from "@/components/InfoTooltip";
import { fmtBps, fmtBrs, fmtNav, fmtRatio, fmtShares } from "@/lib/format";
import { frac, solvencyMeter } from "@/lib/charts";
import { MODE_LABEL, type ReserveView } from "@/lib/view";
import { navPerShare } from "@mutav-finance/mutav-protocol-solana";
import { C, Track } from "@/components/charts/Charts";

import { Section } from "@/components/Section";
import type { Data } from "@/components/reserve/sections/shared";

/** Inter Medium 12px caps label (STYLE.md §3.1), with an optional definition tooltip. */
function Label({ children, tip }: { children: string; tip?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={{ letterSpacing: "0.01em" }}>
        {children}
      </span>
      {tip && (
        <InfoTooltip label={`Info: ${children}`} width={240}>
          {tip}
        </InfoTooltip>
      )}
    </span>
  );
}

/** Brand badge (STYLE.md §3.5): 6px square in the status color + mono label in text-2. Static, not a live region. */
function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" style={{ width: 6, height: 6, flexShrink: 0, background: color }} />
      <Mono style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--color-text-2)" }}>{label}</Mono>
    </span>
  );
}

/** Mono 11px sub-line under a value (unit, share or context). */
const Sub = ({ children, color = "var(--color-text-3)" }: { children: ReactNode; color?: string }) => <Mono style={{ fontSize: 11, color }}>{children}</Mono>;

export function Health({ r }: { r: ReserveView }) {
  return (
    <div className="flex flex-col gap-6">
      <Hero r={r} />
      <SupportStrip r={r} />
    </div>
  );
}

/**
 * The hero: the core invariant `stable_assets ≥ coverage_required`, read as
 * one ratio (left) and one meter (right): stable assets on the bar, coverage
 * required as the tick. Program state sits in one quiet row underneath. The
 * only live region of the section.
 */
function Hero({ r }: { r: ReserveView }) {
  const s = r.state;
  const m = solvencyMeter(r.solvency);
  const covered = !m.underCovered;
  const label = covered ? "COVERED" : "UNDER-COVERED";
  const ratio = fmtRatio(m.stableAssets, m.coverageRequired);
  const comparison = m.coveredBps === null ? "No cover outstanding" : m.underCovered ? `Short ${fmtBrs(m.shortfall)} of what is required` : `${fmtBrs(m.surplus)} above what is required`;
  const row = (name: string, tip: string, value: bigint, note: string) => (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="flex flex-col gap-1">
        <Label tip={tip}>{name}</Label>
        <Sub>{note}</Sub>
      </div>
      <Mono style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text)" }}>{fmtBrs(value)}</Mono>
    </div>
  );
  return (
    <div role="status" aria-label={`Coverage status: ${label}, ratio ${ratio}`} className="bg-(--color-surface) flex flex-col border">
      <div className="grid grid-cols-1 lg:grid-cols-5">
        {/* B · the answer */}
        <div className="flex flex-col justify-center gap-2 p-6 lg:col-span-2">
          <Label tip="Stable assets ÷ coverage required. Above 100%, the reserve holds more than it must.">Coverage ratio</Label>
          <Mono style={{ fontSize: "clamp(40px, 5vw, 56px)", fontWeight: 700, lineHeight: 1, color: covered ? "var(--color-text)" : "var(--color-error)" }}>{ratio}</Mono>
          <span className="font-body text-sm" style={{ color: covered ? "var(--color-text-2)" : "var(--color-error)" }}>
            {comparison}
          </span>
        </div>
        {/* The two sides of the ratio, on one meter */}
        <div className="flex flex-col justify-center gap-4 border-t p-6 lg:col-span-3 lg:border-t-0 lg:border-l">
          {row("Stable assets", "BRS in the reserve token account. Excludes pending deposits and assets owed to filled redemptions.", m.stableAssets, "held by the reserve")}
          {row(
            "Coverage required",
            "Required share of remaining cover, set by the Reserve Admin (at least 10%). Never less than open claim provisions.",
            m.coverageRequired,
            `${fmtBps(r.config.coverageRatioBps)} of remaining cover`,
          )}
          <div className="flex flex-col gap-2 pt-1">
            <Track
              height={10}
              segs={[{ f: frac(m.backing, m.axis), color: C.ink }, covered ? { f: frac(m.surplus, m.axis), color: C.good } : { f: frac(m.shortfall, m.axis), color: C.bad }]}
              marker={{ f: frac(m.coverageRequired, m.axis), label: "Coverage required" }}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Swatch color={C.ink} label="backs cover" />
              {covered ? <Swatch color={C.good} label="surplus" /> : <Swatch color={C.bad} label="shortfall" />}
              <Swatch tick label="required" />
            </div>
          </div>
        </div>
      </div>
      {/* Program state: one quiet row, grey unless something is stopped. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t px-6 py-3" role="group" aria-label="Program state">
        <Badge color={covered ? "var(--color-success)" : "var(--color-error)"} label={label} />
        <Badge color={s.mode !== 0 ? "var(--color-error)" : "var(--color-text-3)"} label={`${MODE_LABEL(s.mode).toUpperCase()} MODE`} />
        <Badge color={s.fulfilHalted ? "var(--color-error)" : "var(--color-text-3)"} label={s.fulfilHalted ? "QUEUE FILLS HALTED" : "QUEUE FILLS OPEN"} />
        <Badge color={r.config.paused ? "var(--color-error)" : "var(--color-text-3)"} label={r.config.paused ? "PAUSED" : "NOT PAUSED"} />
      </div>
    </div>
  );
}

/** Legend key: a 6px square, or a 1px tick for the threshold. */
function Swatch({ color, label, tick }: { color?: string; label: string; tick?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" style={tick ? { width: 1, height: 10, background: "var(--color-text-2)" } : { width: 6, height: 6, flexShrink: 0, background: color }} />
      <Sub>{label}</Sub>
    </span>
  );
}

/**
 * C · the support strip: four figures in one bordered row (1px dividers, no
 * card chrome). Each cell is label, value and one sub-line.
 */
function SupportStrip({ r }: { r: ReserveView }) {
  const s = r.state;
  const sol = r.solvency;
  const navNow = navPerShare(sol.netAssets, s.sharesOutstanding);
  const brs = sol.stableAssets - sol.tesouroValue;
  const brsShare = sol.tesouroValue > 0n && sol.stableAssets > 0n ? fmtBps(Number((brs * 10_000n) / sol.stableAssets)) : "100%";
  const cell = (label: string, tip: string, value: string, sub: ReactNode, extra?: ReactNode) => (
    <div className="bg-(--color-surface) flex min-w-0 flex-col gap-2 px-6 py-4">
      <Label tip={tip}>{label}</Label>
      <Mono style={{ fontSize: "clamp(16px, 2vw, 22px)", fontWeight: 700, color: "var(--color-text)", whiteSpace: "nowrap" }}>{value}</Mono>
      {extra}
      <div className="flex flex-col gap-0.5">{sub}</div>
    </div>
  );
  return (
    <div role="group" aria-label="Reserve figures" className="grid grid-cols-1 gap-px border sm:grid-cols-2 lg:grid-cols-4" style={{ background: "var(--color-border)" }}>
      {cell(
        "Free capital",
        "Stable assets − coverage required. Gates new guarantees and redemptions, never a claim payment.",
        fmtBrs(sol.freeCapital),
        <Sub>for new guarantees and redemptions</Sub>,
      )}
      {cell(
        "NAV per share",
        "Net assets (stable assets − open provisions) ÷ shares outstanding. Published on-chain at each refresh.",
        fmtNav(s.navPerShare),
        <>
          <Sub>{fmtShares(s.sharesOutstanding)} shares outstanding</Sub>
          {navNow !== s.navPerShare && <Sub>now {fmtNav(navNow)}, recomputed</Sub>}
        </>,
      )}
      {cell("Open provisions", "Booked when a claim is filed, until it is paid. Already out of NAV.", fmtBrs(s.provisions), <Sub>filed claims, not yet paid</Sub>)}
      {cell(
        "Asset mix",
        "Stable assets by kind: BRS in the reserve, plus value in whitelisted, capped adapters (none in the pilot).",
        `${brsShare} BRS`,
        <Sub>
          BRS {fmtBrs(brs)} · adapters {fmtBrs(sol.tesouroValue)}
        </Sub>,
        <Track height={6} segs={[{ f: frac(brs, sol.stableAssets), color: C.ink }, { f: frac(sol.tesouroValue, sol.stableAssets), color: C.mid }]} />,
      )}
    </div>
  );
}

/** The Health section of /reserve: heading, the question it answers, and the body. */
export function HealthSection({ d }: { d: Data }) {
  return (
    <Section
      id="health"
      title="Health"
      subtitle="Can the reserve cover every open guarantee?"
      info="Computed with the program's own formulas from its on-chain accounts. The coverage ratio and caps are set by the Reserve Admin."
    >
      <Health r={d.reserve} />
    </Section>
  );
}
