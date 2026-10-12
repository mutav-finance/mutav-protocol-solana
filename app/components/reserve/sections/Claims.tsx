"use client";

/**
 * /reserve · Claims. Answers one question: are claims paid on time?
 * Hero: claim payments in the period; support strip: the slowest timings and
 * the claims awaiting payment (the program sets no settlement deadline, ADR 0019); then the promise band, the speed chart (3+ claims) and the
 * detail table. One period picker drives every block. Renders on-chain values
 * from /api/ledger; nothing is computed here beyond sums and differences of
 * account fields.
 */
import { useState, type ReactNode } from "react";
import { Mono } from "@/components/Mono";
import { fmtDuration } from "@/lib/format";
import { useFmt } from "@/components/MoneyProvider";
import { claimsTimeline, type ClaimRow, type Ledger, type ReserveView } from "@/lib/view";
import { claimSpeed, frac } from "@/lib/charts";
import { C, ChartFrame, Legend, Row, RowLabel, Swatch, Track, type Seg } from "@/components/charts/Charts";

import { Empty, MotionStyle, short } from "@/components/reserve/sections/shared";
import { PeriodPicker, inPeriod, type Period } from "@/components/reserve/sections/Flows";
import { Section } from "@/components/Section";
import { ClaimsTable } from "@/components/reserve/claims/ClaimsTable";
import type { Data } from "@/components/reserve/sections/shared";

const LABEL = { letterSpacing: "0.01em" } as const;

const Label = ({ children }: { children: ReactNode }) => (
  <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={LABEL}>
    {children}
  </span>
);

const PERIOD_NAME: Record<Period, string> = { "7D": "last 7 days", "30D": "last 30 days", "90D": "last 90 days", All: "all time" };

/** Slowest of the recorded durations (worst case is the honest proof of speed). */
const slowest = (xs: (bigint | null)[]): bigint | null => xs.reduce<bigint | null>((m, x) => (x === null ? m : m === null || x > m ? x : m), null);

/** The spec promise as a callout: the page's promise, so its 1px left border is the amber line. */
function GuardBand() {
  return (
    <div className="bg-(--color-surface) border-l-(--color-accent) w-full border px-6 py-3">
      <p className="font-body text-(--color-text) m-0 text-sm font-medium">Claim payments are never blocked by required coverage or by a pause.</p>
    </div>
  );
}

/** One cell of the support strip: label, value, optional sub-line. */
function Cell({ label, value, sub, color, first }: { label: string; value: string; sub?: string; color?: string; first?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 p-6 ${first ? "" : "border-t sm:border-t-0 sm:border-l"}`}>
      <Label>{label}</Label>
      <Mono style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, color: color ?? "var(--color-text)" }}>{value}</Mono>
      {sub && <span className="font-body text-(--color-text-3) text-xs">{sub}</span>}
    </div>
  );
}

/** Block 1: hero (claim payments in the period) over a 3-cell support strip, with the period picker. */
function Summary({ rows, total, period, onPeriod }: { rows: ClaimRow[]; total: number; period: Period; onPeriod: (p: Period) => void }) {
  const fmtBrs = useFmt();
  const paidRows = rows.filter((c) => c.paidAt !== null);
  const paidSum = paidRows.reduce((s, c) => s + (c.amount ?? 0n), 0n);
  const settled = rows.filter((c) => c.settledAt !== null).length;
  const pay = slowest(rows.map((c) => c.fileToPay));
  const settle = slowest(rows.map((c) => c.payToSettle));
  const awaiting = rows.filter((c) => c.stage === "filed").length;
  return (
    <div className="bg-(--color-surface) border">
      <div className="flex flex-wrap items-start justify-between gap-6 p-6">
        <div className="flex flex-col gap-2">
          <Label>Claims paid · {PERIOD_NAME[period]}</Label>
          <Mono style={{ fontSize: "clamp(36px, 4vw, 48px)", fontWeight: 700, lineHeight: 1, color: "var(--color-text)" }}>{fmtBrs(paidSum)}</Mono>
          <span className="font-body text-(--color-text-2) text-sm">
            {paidRows.length} of {rows.length} {rows.length === 1 ? "claim" : "claims"} paid · {settled} received by landlord (PIX)
            {rows.length !== total && <span className="text-(--color-text-3)"> · {total} on record</span>}
          </span>
        </div>
        <PeriodPicker value={period} onChange={onPeriod} label="Claims period" />
      </div>
      <div className="grid grid-cols-1 border-t sm:grid-cols-3">
        <Cell first label="Slowest filed → paid" value={pay === null ? "—" : fmtDuration(pay)} sub={pay === null ? "None paid yet" : undefined} />
        <Cell label="Slowest paid → settled" value={settle === null ? "—" : fmtDuration(settle)} sub={settle === null ? "None settled yet" : undefined} />
        <Cell label="Awaiting payment" value={String(awaiting)} sub="Recorded on-chain" />
      </div>
    </div>
  );
}

/** Block 3: claim speed bars. Only with 3+ claims; with fewer, the strip already says it. */
function SpeedChart({ rows, now }: { rows: ClaimRow[]; now: bigint }) {
  const { claims, payAxis, settleAxis } = claimSpeed(rows, now);
  if (claims.length < 3) return null;
  const panel = (title: string, axis: bigint, pick: (c: (typeof claims)[number]) => { seg: Seg | null; text: string }, marker?: { f: number; label: string }) => (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="font-mono text-(--color-text-2) m-0 text-2xs" style={LABEL}>
        {title} <span className="text-(--color-text-3)">· 0 – {fmtDuration(axis)}</span>
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
          <Swatch color={C.ink} label="pending" outline />
        </Legend>
      }
      caption="Oldest filing first."
    >
      <div className="grid-2 mv-grow-bars">
        <MotionStyle />
        {panel("Filed → paid", payAxis, (c) => ({ seg: c.fileToPay === null ? null : { f: frac(c.fileToPay, payAxis), color: C.ink }, text: c.fileToPay === null ? "not paid" : fmtDuration(c.fileToPay) }))}
        {panel(
          "Paid → settled",
          settleAxis,
          (c) => ({
            seg: c.payToSettle === null ? null : { f: frac(c.payToSettle, settleAxis), color: C.ink, outline: c.pending },
            text: c.payToSettle === null ? "—" : `${fmtDuration(c.payToSettle)}${c.pending ? " so far" : ""}`,
          }),
        )}
      </div>
    </ChartFrame>
  );
}

export function Claims({ r, l }: { r: ReserveView; l: Ledger }) {
  const rows = claimsTimeline(l);
  if (rows.length === 0)
    return (
      <div className="flex flex-col gap-6">
        <div className="bg-(--color-surface) border px-6 py-2">
          <Empty>No claims filed yet. Filed claims appear here with their amount and timings.</Empty>
        </div>
        <GuardBand />
      </div>
    );
  return <ClaimsBody r={r} rows={rows} />;
}

/** Hero + strip → promise band → speed chart → table. The period filters every block by filed date. */
function ClaimsBody({ r, rows }: { r: ReserveView; rows: ClaimRow[] }) {
  const [period, setPeriod] = useState<Period>("All");
  const shown = rows.filter((c) => inPeriod(c.filedAt, r.now, period));
  return (
    <div className="flex flex-col gap-6">
      <Summary rows={shown} total={rows.length} period={period} onPeriod={setPeriod} />
      <GuardBand />
      {shown.length === 0 ? (
        <div className="bg-(--color-surface) border px-6 py-2">
          <Empty>No claims filed in this period.</Empty>
        </div>
      ) : (
        <>
          <SpeedChart rows={shown} now={r.now} />
          <ClaimsTable rows={shown} />
        </>
      )}
    </div>
  );
}

/** The Claims section of /reserve: heading and body. */
export function ClaimsSection({ d }: { d: Data }) {
  return (
    <Section
      id="claims"
      title="Claims"
      subtitle="Are claims paid on time?"
      info="Filed: the claim is booked and its amount set aside for claims, so the share price reflects it before any money leaves the reserve. Paid: the claim payment leaves the reserve. Settled: the landlord receives it by PIX."
    >
      <Claims r={d.reserve} l={d.ledger} />
    </Section>
  );
}
