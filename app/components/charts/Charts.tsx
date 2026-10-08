/**
 * Reserve charts, hand-rolled: horizontal bars on one shared axis per chart,
 * coloured from brand tokens so they follow the front (dark or light).
 * Precision Brutalism: square ends, hairlines, a 2px surface gap between
 * stacked segments, no animation. Each chart is a <figure> with a caption that
 * states its source; each row is focusable and carries its values as text
 * (aria-label + hover title); the table under each chart is its full text
 * alternative.
 */
import type { CSSProperties, ReactNode } from "react";
import { Mono } from "@/components/Mono";
import { RoleTag } from "@/components/RoleTag";
import { agencyCapUse, claimSpeed, coverBars, flowBars, frac, navBasis, solvencyMeter } from "@/lib/charts";
import { fmtBps, fmtBrs, fmtDuration, fmtTime } from "@/lib/format";
import type { ClaimCap } from "@/lib/operator";
import type { AgencyRow, ClaimRow, CoverageRow, FlowTotals } from "@/lib/view";
import type { Solvency } from "@mutav-finance/mutav-protocol-solana";

const pct = (f: number) => `${(f * 100).toFixed(3)}%`;
const short = (hex: string) => `${hex.slice(0, 8)}…`;

// ── Frame ───────────────────────────────────────────────────────────────────

export function ChartFrame({ title, caption, legend, children, id }: { title: string; caption: ReactNode; legend?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <figure id={id} aria-label={title} style={{ margin: 0, border: "1px solid var(--color-border)", background: "var(--color-surface)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <p className="font-body" style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{title}</p>
        {legend}
      </div>
      {children}
      <figcaption className="font-body" style={{ fontSize: 11, color: "var(--color-text-3)", lineHeight: 1.5 }}>
        {caption}
      </figcaption>
    </figure>
  );
}

export function Swatch({ color, label, outline }: { color: string; label: string; outline?: boolean }) {
  return (
    <span className="font-mono" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--color-text-2)" }}>
      <span aria-hidden="true" style={{ width: 10, height: 10, background: outline ? "transparent" : color, border: outline ? `1px solid ${color}` : undefined, display: "inline-block" }} />
      {label}
    </span>
  );
}

export const Legend = ({ children }: { children: ReactNode }) => <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>{children}</div>;

type Seg = { f: number; color: string; outline?: boolean };

/** A bar track: segments laid left to right with a 2px surface gap between them. */
function Track({ segs, height = 12, align = "left", marker }: { segs: Seg[]; height?: number; align?: "left" | "right"; marker?: { f: number; label: string } }) {
  const shown = segs.filter((s) => s.f > 0);
  return (
    <div style={{ position: "relative", height, display: "flex", justifyContent: align === "right" ? "flex-end" : "flex-start", minWidth: 0 }}>
      {shown.map((s, i) => (
        <div
          key={i}
          className="chart-bar"
          style={{
            width: `max(${pct(s.f)}, 2px)`,
            height: "100%",
            background: s.outline ? "transparent" : s.color,
            border: s.outline ? `1px solid ${s.color}` : undefined,
            marginLeft: align === "left" && i > 0 ? 2 : 0,
            marginRight: align === "right" && i < shown.length - 1 ? 2 : 0,
            flexShrink: 0,
          }}
        />
      ))}
      {marker && (
        <div aria-hidden="true" title={marker.label} style={{ position: "absolute", left: pct(marker.f), top: -4, bottom: -4, borderLeft: "1px dashed var(--color-text-2)" }} />
      )}
    </div>
  );
}

/** One chart row: label | track | value. Focusable; the summary is its accessible name and hover title. */
function Row({ label, value, summary, children, labelWidth = 170 }: { label: ReactNode; value: ReactNode; summary: string; children: ReactNode; labelWidth?: number }) {
  return (
    <div className="chart-row" tabIndex={0} role="img" aria-label={summary} title={summary} style={{ ["--label-w" as string]: `${labelWidth}px` }}>
      <div className="chart-row-label">{label}</div>
      {children}
      <Mono style={{ fontSize: 12, textAlign: "right", minWidth: 96 }}>{value}</Mono>
    </div>
  );
}

const RowLabel = ({ children, sub }: { children: ReactNode; sub?: ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
    <span className="font-body" style={{ fontSize: 12, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
    {sub}
  </div>
);

// ── Coverage vs the reserve ─────────────────────────────────────────────────

const C = {
  ink: "var(--color-chart-1)",
  mid: "var(--color-chart-2)",
  good: "var(--color-success)",
  bad: "var(--color-error)",
  provision: "var(--color-copper)",
};

/** Stable assets against coverage required, on one axis. Used on /reserve and on the landing strip (`compact`). */
export function SolvencyChart({ s, ratioBps, compact = false }: { s: Pick<Solvency, "stableAssets" | "coverageRequired" | "freeCapital">; ratioBps: number; compact?: boolean }) {
  const m = solvencyMeter(s);
  const verdict = m.coveredBps === null ? "No cover outstanding" : m.underCovered ? `Under-covered: short ${fmtBrs(m.shortfall)}` : `Covered ${fmtBps(m.coveredBps)} · surplus ${fmtBrs(m.surplus)}`;
  const rows = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Row
        label={<RowLabel>Stable assets</RowLabel>}
        value={fmtBrs(m.stableAssets, 0)}
        summary={`Stable assets ${fmtBrs(m.stableAssets)}: ${fmtBrs(m.backing)} backs coverage required, ${fmtBrs(m.surplus)} surplus.`}
        labelWidth={compact ? 130 : 170}
      >
        <Track segs={[{ f: frac(m.backing, m.axis), color: C.ink }, { f: frac(m.surplus, m.axis), color: C.good }]} />
      </Row>
      <Row
        label={<RowLabel>Coverage required</RowLabel>}
        value={fmtBrs(m.coverageRequired, 0)}
        summary={`Coverage required ${fmtBrs(m.coverageRequired)} (${fmtBps(ratioBps)} of remaining cover)${m.shortfall > 0n ? `, ${fmtBrs(m.shortfall)} above stable assets` : ""}.`}
        labelWidth={compact ? 130 : 170}
      >
        <Track segs={[{ f: frac(m.backing, m.axis), color: C.mid }, { f: frac(m.shortfall, m.axis), color: C.bad }]} />
      </Row>
    </div>
  );
  const legend = (
    <Legend>
      <Swatch color={C.ink} label="backs cover" />
      <Swatch color={C.good} label="surplus" />
      <Swatch color={C.mid} label="required" />
      {m.underCovered && <Swatch color={C.bad} label="shortfall" />}
    </Legend>
  );
  if (compact) {
    return (
      <div aria-label="Coverage against the reserve" role="group" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows}
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          {legend}
          <Mono style={{ fontSize: 11, color: m.underCovered ? "var(--color-error)" : "var(--color-text-3)" }}>{verdict}</Mono>
        </div>
      </div>
    );
  }
  return (
    <ChartFrame title="Coverage against the reserve" legend={legend} caption={<>{verdict}. Snapshot of VaultState computed with the program&apos;s formulas (spec §4). Free capital {fmtBrs(m.freeCapital)} is the surplus minus the instant-exit earmark (zero in the pilot).</>}>
      {rows}
    </ChartFrame>
  );
}

/** Stable assets split into net assets (the NAV basis) and open claim provisions. */
export function NavBasisChart({ s, navNow }: { s: Pick<Solvency, "stableAssets" | "netAssets">; navNow: string }) {
  const b = navBasis(s);
  return (
    <ChartFrame
      title="What NAV is computed on"
      legend={
        <Legend>
          <Swatch color={C.ink} label="net assets" />
          <Swatch color={C.provision} label="open provisions" />
        </Legend>
      }
      caption={<>NAV per share = net assets ÷ shares outstanding ({navNow} now). A filed claim books a provision that lowers net assets before any BRS leaves the reserve.</>}
    >
      <Row label={<RowLabel>Stable assets</RowLabel>} value={fmtBrs(b.stableAssets, 0)} summary={`Stable assets ${fmtBrs(b.stableAssets)}: net assets ${fmtBrs(b.netAssets)}, open provisions ${fmtBrs(b.provisions)}.`}>
        <Track segs={[{ f: frac(b.netAssets, b.stableAssets), color: C.ink }, { f: frac(b.provisions, b.stableAssets), color: C.provision }]} />
      </Row>
    </ChartFrame>
  );
}

// ── Remaining cover ─────────────────────────────────────────────────────────

export function CoverChart({ rows }: { rows: CoverageRow[] }) {
  const { bars, axis, hidden } = coverBars(rows);
  if (bars.length === 0) return null;
  return (
    <ChartFrame
      title="Remaining cover by active guarantee"
      legend={
        <Legend>
          <Swatch color={C.ink} label="default leg" />
          <Swatch color={C.mid} label="exit leg" />
        </Legend>
      }
      caption={<>Cover minus what was already paid, per leg, from each Guarantee account; largest first{hidden > 0 ? `, ${hidden} more in the table` : ""}. The operator registers every guarantee.</>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {bars.map((b) => (
          <Row key={b.address} label={<RowLabel><Mono>{short(b.id)}</Mono></RowLabel>} value={fmtBrs(b.total, 0)} summary={`Guarantee ${short(b.id)}: default leg ${fmtBrs(b.defaultLeft)}, exit leg ${fmtBrs(b.exitLeft)} remaining.`} labelWidth={110}>
            <Track segs={[{ f: frac(b.defaultLeft, axis), color: C.ink }, { f: frac(b.exitLeft, axis), color: C.mid }]} />
          </Row>
        ))}
      </div>
    </ChartFrame>
  );
}

export function AgencyCapChart({ rows, cap }: { rows: AgencyRow[]; cap: bigint }) {
  const use = agencyCapUse(rows);
  if (use.length === 0) return null;
  return (
    <ChartFrame title="Agency exposure against the per-agency cap" caption={<>Outstanding cover of each agency ÷ max cover per agency ({fmtBrs(cap, 0)}, set by the Reserve Admin). From AgencyExposure accounts.</>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {use.map((a) => (
          <Row key={a.address} label={<RowLabel><Mono>{short(a.agencyId)}</Mono></RowLabel>} value={`${(a.used * 100).toFixed(1)}%`} summary={`Agency ${short(a.agencyId)}: ${fmtBrs(a.outstanding)} outstanding, ${(a.used * 100).toFixed(1)}% of the cap.`} labelWidth={110}>
            <div style={{ background: "var(--color-chart-track)", minWidth: 0 }}>
              <Track segs={[{ f: Math.min(1, a.used), color: a.used > 1 ? C.bad : C.ink }]} />
            </div>
          </Row>
        ))}
      </div>
    </ChartFrame>
  );
}

// ── Claim speed ─────────────────────────────────────────────────────────────

export function ClaimSpeedChart({ rows, slaSecs, now }: { rows: ClaimRow[]; slaSecs: bigint; now: bigint }) {
  const { claims, payAxis, settleAxis } = claimSpeed(rows, slaSecs, now);
  if (claims.length === 0) return null;
  const panel = (title: string, axis: bigint, pick: (c: (typeof claims)[number]) => { v: bigint | null; seg: Seg | null; text: string }, marker?: { f: number; label: string }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <p className="font-mono" style={{ fontSize: 11, color: "var(--color-text-2)", margin: 0, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {title} <span style={{ color: "var(--color-text-3)" }}>· axis 0 – {fmtDuration(axis)}</span>
      </p>
      {claims.map((c) => {
        const p = pick(c);
        return (
          <Row key={c.filing} label={<RowLabel><Mono>{short(c.guaranteeId)}</Mono> · {c.leg}</RowLabel>} value={p.text} summary={`Claim on ${short(c.guaranteeId)}, ${c.leg} leg: ${title.toLowerCase()} ${p.text}.`} labelWidth={130}>
            <Track segs={p.seg ? [p.seg] : []} marker={marker} />
          </Row>
        );
      })}
    </div>
  );
  return (
    <ChartFrame
      title="Claim speed, from on-chain timestamps"
      legend={
        <Legend>
          <Swatch color={C.ink} label="done" />
          <Swatch color={C.ink} label="pending (so far)" outline />
          <Swatch color={C.bad} label="late" />
        </Legend>
      }
      caption={<>Filed → paid: ClaimFiling.filed_at to Payout.paid_at. Paid → settled: Payout.paid_at to settled_at (PIX); the dashed line is the payout SLA ({fmtDuration(slaSecs)}, set by the Reserve Admin). Every step is signed by the operator. Oldest filing first.</>}
    >
      <div className="grid-2">
        {panel("Filed → paid", payAxis, (c) => ({ v: c.fileToPay, seg: c.fileToPay === null ? null : { f: frac(c.fileToPay, payAxis), color: C.ink }, text: c.fileToPay === null ? "not paid" : fmtDuration(c.fileToPay) }))}
        {panel(
          "Paid → settled",
          settleAxis,
          (c) => ({
            v: c.payToSettle,
            seg: c.payToSettle === null ? null : { f: frac(c.payToSettle, settleAxis), color: c.late ? C.bad : C.ink, outline: c.pending && !c.late },
            text: c.payToSettle === null ? "—" : `${fmtDuration(c.payToSettle)}${c.pending ? " so far" : ""}${c.late ? " · late" : ""}`,
          }),
          { f: frac(slaSecs, settleAxis), label: `SLA ${fmtDuration(slaSecs)}` },
        )}
      </div>
    </ChartFrame>
  );
}

// ── Money flows ─────────────────────────────────────────────────────────────

export function FlowChart({ totals }: { totals: FlowTotals }) {
  const { bars, axis } = flowBars(totals);
  const half: CSSProperties = { minWidth: 0 };
  return (
    <ChartFrame
      title="Money in and out of the reserve, by who moved it"
      legend={
        <Legend>
          <Swatch color={C.ink} label="into the reserve" />
          <Swatch color={C.mid} label="out of the reserve" />
          <Swatch color={C.mid} label="outside the reserve" outline />
        </Legend>
      }
      caption={<>Guarantee fees, issuer income (swept from the income inbox), the fee take and claim payments are VaultState totals (complete). Deposits and redemptions sum the fill events in the last 100 transactions of each escrow. Totals since launch, not a time series: the chain keeps no balance history to plot.</>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {bars.map((b) => {
          const f = frac(b.amount, axis);
          const sign = b.direction === "in" ? "+" : b.direction === "out" ? "−" : "";
          return (
            <Row
              key={b.key}
              labelWidth={210}
              label={
                <RowLabel sub={<span style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px" }}>{b.requestedBy && <RoleTag role={b.requestedBy} prefix="req." />}<RoleTag role={b.by} prefix={b.requestedBy ? "fill" : "by"} /></span>}>
                  {b.label}
                </RowLabel>
              }
              value={`${sign}${fmtBrs(b.amount, 0)}`}
              summary={`${b.label}: ${sign}${fmtBrs(b.amount)}${b.direction === "outside" ? ", paid to the treasury outside the reserve" : ""}.`}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderLeft: "none" }}>
                <div style={{ ...half, borderRight: "1px solid var(--color-text-3)" }}>
                  {b.direction === "out" && <Track align="right" segs={[{ f, color: C.mid }]} />}
                </div>
                <div style={half}>
                  {b.direction === "in" && <Track segs={[{ f, color: C.ink }]} />}
                  {b.direction === "outside" && <Track segs={[{ f, color: C.mid, outline: true }]} />}
                </div>
              </div>
            </Row>
          );
        })}
      </div>
    </ChartFrame>
  );
}

// ── Operator claim-payment caps ─────────────────────────────────────────────

/** The per-period claim-payment cap: paid in the current window against the cap, and the per-call cap, on one axis. */
export function ClaimCapChart({ cap }: { cap: ClaimCap }) {
  const axis = cap.perPeriod > cap.perCall ? cap.perPeriod : cap.perCall;
  const window = cap.windowStart === null ? "No payment yet: the first pay_claim opens the window." : cap.rolled ? `The last window ended ${fmtTime(cap.windowEnd!)}; the next pay_claim opens a new one.` : `Window ${fmtTime(cap.windowStart!)} → ${fmtTime(cap.windowEnd!)}.`;
  return (
    <ChartFrame
      title="Claim-payment caps"
      legend={
        <Legend>
          <Swatch color={C.ink} label="paid this window" />
          <Swatch color={C.mid} label="room left" outline />
          <Swatch color={C.mid} label="max per call" />
        </Legend>
      }
      caption={<>{window} From VaultState.claim_period_start / claim_period_paid and caps.max_claim_per_period / max_claim_per_call / claim_period_secs ({fmtDuration(cap.periodSecs)}), set by the Reserve Admin. Largest pay_claim the caps allow now: {fmtBrs(cap.maxNextPayment)}.</>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Row label={<RowLabel>Per period</RowLabel>} value={`${fmtBrs(cap.paid, 0)} / ${fmtBrs(cap.perPeriod, 0)}`} summary={`Paid ${fmtBrs(cap.paid)} of the ${fmtBrs(cap.perPeriod)} period cap; ${fmtBrs(cap.remaining)} left.`} labelWidth={130}>
          <Track segs={[{ f: frac(cap.paid, axis), color: C.ink }, { f: frac(cap.remaining, axis), color: C.mid, outline: true }]} />
        </Row>
        <Row label={<RowLabel>Per call</RowLabel>} value={fmtBrs(cap.perCall, 0)} summary={`At most ${fmtBrs(cap.perCall)} per pay_claim.`} labelWidth={130}>
          <Track segs={[{ f: frac(cap.perCall, axis), color: C.mid }]} />
        </Row>
      </div>
    </ChartFrame>
  );
}
