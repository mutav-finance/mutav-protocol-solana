"use client";

/**
 * /reserve · Claims. Renders on-chain values from /api/ledger; nothing is
 * computed here beyond sums and differences of account fields.
 */
import { useState, type ReactNode } from "react";
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { InfoTooltip } from "@/components/InfoTooltip";
import { fmtBrs, fmtDuration, fmtTime } from "@/lib/format";
import { claimsTimeline, type ClaimRow, type Ledger, type ReserveView } from "@/lib/view";
import { claimSpeed, frac } from "@/lib/charts";
import { C, ChartFrame, Legend, Row, RowLabel, Swatch, Track, type Seg } from "@/components/charts/Charts";

import { Empty, Num, Table, short } from "@/components/reserve/sections/shared";
import { ImageSlot } from "@/components/ImageSlot";
import { PeriodPicker, inPeriod, type Period } from "@/components/reserve/sections/Flows";
import { Section } from "@/components/Section";
import type { Data } from "@/components/reserve/sections/shared";

// ── Claims timeline ─────────────────────────────────────────────────────────

const LABEL = { letterSpacing: "0.01em" } as const;

const Label = ({ children }: { children: ReactNode }) => (
  <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={LABEL}>
    {children}
  </span>
);

/** Slowest of the recorded durations (worst case is the honest proof of speed). */
const slowest = (xs: (bigint | null)[]): bigint | null => xs.reduce<bigint | null>((m, x) => (x === null ? m : m === null || x > m ? x : m), null);

/** Decorative image banner carrying the core spec property of this section. */
function GuardTile({ className = "" }: { className?: string }) {
  return (
    <ImageSlot slot="reserve-claims" aspect="wide" className={`min-h-[120px] ${className}`}>
      <div className="flex h-full min-h-[120px] flex-col justify-end p-6">
        <p className="font-display text-(--color-text) m-0 text-xl font-bold leading-snug">Claim payments are never blocked by solvency or by a pause.</p>
      </div>
    </ImageSlot>
  );
}

/** Lead tile: the slowest filed → paid and paid → settled on record, against the SLA. */
function SpeedTile({ rows, slaSecs }: { rows: ClaimRow[]; slaSecs: bigint }) {
  const pay = slowest(rows.map((c) => c.fileToPay));
  const settle = slowest(rows.map((c) => c.payToSettle));
  const late = rows.filter((c) => c.lateOnChain).length;
  const overdue = rows.filter((c) => !c.lateOnChain && c.overdue).length;
  const bad = late > 0;
  const stat = (label: string, v: bigint | null, empty: string, sub?: string) => (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Mono style={{ fontSize: "clamp(28px, 3.2vw, 40px)", fontWeight: 700, lineHeight: 1, color: v === null ? "var(--color-text-3)" : "var(--color-text)" }}>{v === null ? empty : fmtDuration(v)}</Mono>
      {sub && <Mono style={{ fontSize: 11, color: "var(--color-text-3)" }}>{sub}</Mono>}
    </div>
  );
  return (
    <div className="bg-(--color-surface) flex flex-col justify-between gap-6 border p-6 lg:col-span-4" style={{ borderColor: bad ? "var(--color-error)" : "var(--color-border)" }}>
      {stat("Filed → paid · slowest", pay, "not paid yet")}
      {stat("Paid → settled · slowest", settle, "not settled yet", `payout SLA ${fmtDuration(slaSecs)}`)}
      <div className="flex flex-col gap-1 border-t pt-4">
        <span className="font-mono text-xs" style={{ color: bad ? "var(--color-error)" : overdue > 0 ? "var(--color-copper)" : "var(--color-text-3)" }}>
          {late} late{overdue > 0 ? ` · ${overdue} past SLA, not yet recorded` : ""}
        </span>
      </div>
    </div>
  );
}

/**
 * Claim speed bars (local variant of the shared ClaimSpeedChart, with a
 * one-line caption; the field-level definitions sit in its ⓘ).
 */
function SpeedChart({ rows, slaSecs, now }: { rows: ClaimRow[]; slaSecs: bigint; now: bigint }) {
  const { claims, payAxis, settleAxis } = claimSpeed(rows, slaSecs, now);
  if (claims.length === 0) return null;
  const panel = (title: string, axis: bigint, pick: (c: (typeof claims)[number]) => { seg: Seg | null; text: string }, marker?: { f: number; label: string }) => (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="font-mono text-(--color-text-2) m-0 text-2xs uppercase" style={{ letterSpacing: "0.01em" }}>
        {title} <span className="text-(--color-text-3)">· axis 0 – {fmtDuration(axis)}</span>
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
      title="Claim speed"
      legend={
        <Legend>
          <Swatch color={C.ink} label="done" />
          <Swatch color={C.ink} label="pending (so far)" outline />
          <Swatch color={C.bad} label="late" />
        </Legend>
      }
      caption={
        <span className="inline-flex items-center gap-2">
          Oldest filing first. The vertical line is the payout SLA.
          <InfoTooltip label="About claim speed">
            Filed → paid: from when the claim was filed to when it was paid. Paid → settled: from payment to settlement by PIX; a pending payment shows the time so far.
          </InfoTooltip>
        </span>
      }
    >
      <div className="grid-2">
        {panel("Filed → paid", payAxis, (c) => ({ seg: c.fileToPay === null ? null : { f: frac(c.fileToPay, payAxis), color: C.ink }, text: c.fileToPay === null ? "not paid" : fmtDuration(c.fileToPay) }))}
        {panel(
          "Paid → settled",
          settleAxis,
          (c) => ({
            seg: c.payToSettle === null ? null : { f: frac(c.payToSettle, settleAxis), color: c.late ? C.bad : C.ink, outline: c.pending && !c.late },
            text: c.payToSettle === null ? "—" : `${fmtDuration(c.payToSettle)}${c.pending ? " so far" : ""}${c.late ? " · late" : ""}`,
          }),
          { f: frac(slaSecs, settleAxis), label: `SLA ${fmtDuration(slaSecs)}` },
        )}
      </div>
    </ChartFrame>
  );
}

export function Claims({ r, l }: { r: ReserveView; l: Ledger }) {
  const rows = claimsTimeline(l, r.config.payoutSlaSecs, r.now);
  if (rows.length === 0)
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="bg-(--color-surface) flex items-center border p-6 lg:col-span-6">
          <Empty>No claims filed yet.</Empty>
        </div>
        <GuardTile className="lg:col-span-6" />
      </div>
    );
  const paid = rows.filter((c) => c.paidAt !== null).length;
  const settled = rows.filter((c) => c.settledAt !== null).length;
  return <ClaimsBody r={r} rows={rows} paid={paid} settled={settled} />;
}

/** With few claims (< 3) the table leads and the chart follows; otherwise chart, then table. The period filters the table by filed date. */
function ClaimsBody({ r, rows, paid, settled }: { r: ReserveView; rows: ClaimRow[]; paid: number; settled: number }) {
  const [period, setPeriod] = useState<Period>("All");
  const shown = rows.filter((c) => inPeriod(c.filedAt, r.now, period));
  const few = rows.length < 3;
  const table = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-(--color-text-2) m-0 text-xs">
          {rows.length} filed · {paid} paid · {settled} settled
        </p>
        <PeriodPicker value={period} onChange={setPeriod} label="Claims period" />
      </div>
      {shown.length === 0 ? (
        <Empty>No claims filed in this period.</Empty>
      ) : (
        <Table label="Claims timeline" head={["Guarantee", ["Amount", "num"], "SLA", ["Filed → paid", "num"], ["Paid → settled", "num"], "Filed", "Paid", "Settled (PIX)", "Leg"]}>
          {shown.map((c) => (
            <tr key={c.filing}>
              <td><Explorer value={c.guarantee} label={short(c.guaranteeId)} /></td>
              <Num>{fmtBrs(c.amount ?? c.provision)}</Num>
              <td>
                {c.lateOnChain ? (
                  <Mono style={{ color: "var(--color-error)" }}>late</Mono>
                ) : c.overdue ? (
                  <span title="Marked late on-chain at the next refresh.">
                    <Mono style={{ color: "var(--color-copper)" }}>past SLA</Mono>
                  </span>
                ) : (
                  <Mono dim>on time</Mono>
                )}
              </td>
              <Num>{c.fileToPay !== null ? fmtDuration(c.fileToPay) : "—"}</Num>
              <Num>{c.payToSettle !== null ? fmtDuration(c.payToSettle) : "—"}</Num>
              <td><Explorer value={c.filing} label={fmtTime(c.filedAt)} /></td>
              <td>{c.payout && c.paidAt !== null ? <Explorer value={c.payout} label={fmtTime(c.paidAt)} /> : <Mono dim>—</Mono>}</td>
              <td><Mono dim={c.settledAt === null}>{c.settledAt !== null ? fmtTime(c.settledAt) : "pending"}</Mono></td>
              <td><Mono>{c.leg}</Mono></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
  const chart = <SpeedChart rows={rows} slaSecs={r.config.payoutSlaSecs} now={r.now} />;
  if (few)
    return (
      <div className="flex flex-col gap-4">
        {/* Few claims: the speed tile beside the promise banner, then the table, then the chart. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <SpeedTile rows={rows} slaSecs={r.config.payoutSlaSecs} />
          <GuardTile className="lg:col-span-8" />
        </div>
        {table}
        {chart}
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      {/* The speed lead tile beside the speed chart; the spec promise as a banner under them. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <SpeedTile rows={rows} slaSecs={r.config.payoutSlaSecs} />
        <div className="grid lg:col-span-8">{chart}</div>
        <GuardTile className="lg:col-span-12" />
      </div>
      {table}
    </div>
  );
}

/** The Claims section of /reserve: heading, roles and body. */
export function ClaimsSection({ d }: { d: Data }) {
  return (
    <Section
      id="claims"
      title="Claims"
      kicker="Claim payments"
      subtitle="How fast claims are paid, from on-chain timestamps."
      info="Timestamps recorded on-chain for each claim. Filed: the claim is booked, and NAV already reflects it before any money leaves the reserve. Paid: the claim payment leaves the reserve. Settled: the landlord receives it by PIX. The payout SLA is set by the Reserve Admin."
    >
      <Claims r={d.reserve} l={d.ledger} />
    </Section>
  );
}
