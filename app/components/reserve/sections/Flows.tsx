"use client";

/**
 * /reserve · Flows. Answers one question: where did the reserve's money come
 * from, and where did it go? Renders on-chain values from /api/ledger; nothing
 * is computed here beyond sums and differences of account fields.
 *
 * Layout (top to bottom): hero (earned net) beside the image tile → the two
 * sides of the money, earnings and capital, as diverging bars → the dated
 * ledger → how the figures are counted. Earnings and capital never mix: a
 * deposit is not income.
 */
import { useState, type ReactNode } from "react";
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { ImageSlot, type ImageSlotName } from "@/components/ImageSlot";
import { C, Legend, Row, RowLabel, Swatch, Track } from "@/components/charts/Charts";
import { frac } from "@/lib/charts";
import { fmtBps, fmtBrs, fmtTime } from "@/lib/format";
import { moneyFlows, type FlowRow, type Ledger, type ReserveView } from "@/lib/view";
import { Button } from "@/components/ui/button";

import { Empty, Num, Table } from "@/components/reserve/sections/shared";
import { Section } from "@/components/Section";
import type { Data } from "@/components/reserve/sections/shared";

// ── Period filter (also used by Claims) ─────────────────────────────────────

/** Period filter for the dated tables of /reserve (Flows ledger, Claims). Relative to the read's `now`. */
export const PERIODS = { "7D": 7n * 86_400n, "30D": 30n * 86_400n, "90D": 90n * 86_400n, All: null } as const;
export type Period = keyof typeof PERIODS;

/** In the period ending at `now`. An undated row only counts under "All". */
export function inPeriod(at: bigint | null, now: bigint, p: Period): boolean {
  const span = PERIODS[p];
  if (span === null) return true;
  return at !== null && at >= now - span;
}

/** Segmented 7D / 30D / 90D / All: radius 0, 1px borders, the active one marked by an amber border and text (no fill). */
export function PeriodPicker({ value, onChange, label }: { value: Period; onChange: (p: Period) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex">
      {(Object.keys(PERIODS) as Period[]).map((p, i) => {
        const on = p === value;
        return (
          <Button
            key={p}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={on}
            onClick={() => onChange(p)}
            className="font-mono h-8 px-3 text-2xs hover:!bg-transparent"
            style={{
              border: `1px solid ${on ? "var(--color-accent)" : "var(--color-border)"}`,
              marginLeft: i === 0 ? 0 : -1,
              position: "relative",
              zIndex: on ? 1 : 0,
              color: on ? "var(--color-accent)" : "var(--color-text-2)",
            }}
          >
            {p}
          </Button>
        );
      })}
    </div>
  );
}

// ── Building blocks ─────────────────────────────────────────────────────────

const FLOW_LABEL = { fee: "Guarantee fee", income: "Issuer income", claim: "Claim payment", deposit: "Deposit", redemption: "Redemption" } as const;

/** Decorative slot beside the hero. */
const FLOWS_SLOT: ImageSlotName = "flows-capital";

/** Ledger rows shown before "Show all". */
const LEDGER_ROWS = 10;

const abs = (v: bigint) => (v < 0n ? -v : v);
const signed = (v: bigint) => `${v >= 0n ? "+" : "−"}${fmtBrs(abs(v))}`;

/** Inter Medium 12px caps label (brand card label). */
const Label = ({ children }: { children: ReactNode }) => (
  <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={{ letterSpacing: "0.01em" }}>
    {children}
  </span>
);

/** Block heading inside the tab: label left, an optional control right. */
const BlockHead = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <Label>{children}</Label>
    {action}
  </div>
);

type Bar = { label: string; sub: string; amount: bigint; dir: "in" | "out" };

/** One side of the money (earnings or capital): its net in the head, then diverging bars on the group's own axis. */
function FlowGroup({ title, note, net, bars }: { title: string; note: string; net: bigint; bars: Bar[] }) {
  const axis = bars.reduce((m, b) => (b.amount > m ? b.amount : m), 0n);
  return (
    <div className="bg-(--color-surface) flex min-w-0 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1">
          <Label>{title}</Label>
          <span className="font-mono text-(--color-text-3) text-2xs">{note}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-mono text-(--color-text-3) text-2xs uppercase">net</span>
          <Mono style={{ fontSize: 20, fontWeight: 700, lineHeight: 1, color: "var(--color-text)" }}>{signed(net)}</Mono>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        {bars.map((b) => {
          const f = frac(b.amount, axis);
          const sign = b.dir === "in" ? "+" : "−";
          return (
            <Row
              key={b.label}
              labelWidth={170}
              label={<RowLabel sub={<span className="font-mono text-(--color-text-3) truncate text-2xs">{b.sub}</span>}>{b.label}</RowLabel>}
              value={`${sign}${fmtBrs(b.amount, 0)}`}
              summary={`${b.label}: ${sign}${fmtBrs(b.amount)} ${b.dir === "in" ? "into" : "out of"} the reserve. ${b.sub}.`}
            >
              {/* Zero axis in the middle: out grows left, in grows right. */}
              <div className="grid min-w-0 grid-cols-2">
                <div className="min-w-0" style={{ borderRight: "1px solid var(--color-text-3)" }}>
                  {b.dir === "out" && <Track align="right" segs={[{ f, color: C.mid }]} />}
                </div>
                <div className="min-w-0">{b.dir === "in" && <Track segs={[{ f, color: C.ink }]} />}</div>
              </div>
            </Row>
          );
        })}
      </div>
    </div>
  );
}

/** Ledger row: the flow and its detail stacked in one cell, so the table stays at five columns. */
function LedgerRow({ f }: { f: FlowRow }) {
  // A bare "slot N" says nothing to a reader; the slot stays in the hover title.
  const slotOnly = /^slot \d+$/.test(f.detail);
  return (
    <tr>
      <td>
        <span className="flex flex-col gap-1" title={slotOnly ? f.detail : undefined}>
          <Mono>{FLOW_LABEL[f.kind]}</Mono>
          {!slotOnly && <Mono dim style={{ fontSize: 11 }}>{f.detail}</Mono>}
        </span>
      </td>
      <td><Mono dim>{f.at !== null ? fmtTime(f.at) : "—"}</Mono></td>
      <Num color={f.reserveDelta >= 0n ? "var(--color-success)" : "var(--color-text)"}>{signed(f.reserveDelta)}</Num>
      <Num>{f.treasury > 0n ? fmtBrs(f.treasury) : "—"}</Num>
      <td><Explorer value={f.account} kind={f.isTx ? "tx" : "address"} /></td>
    </tr>
  );
}

// ── The tab ─────────────────────────────────────────────────────────────────

export function Flows({ r, l }: { r: ReserveView; l: Ledger }) {
  const { totals, rows: all } = moneyFlows(r.state, l);
  const [period, setPeriod] = useState<Period>("All");
  const [showAll, setShowAll] = useState(false);
  const rows = all.filter((f) => inPeriod(f.at, r.now, period));
  const shown = showAll ? rows : rows.slice(0, LEDGER_ROWS);
  // Earnings and capital are kept apart: a deposit is not income.
  const earned = totals.feesNetToReserve + totals.incomeNetToReserve - totals.claimsPaid;
  const capital = totals.depositsIn - totals.redemptionsOut;
  const pick = (p: Period) => {
    setPeriod(p);
    setShowAll(false);
  };

  const earnings: Bar[] = [
    { label: "Guarantee fees", sub: `net · ${fmtBrs(totals.feeTakeToTreasury, 0)} take to treasury (${fmtBps(r.config.feeTakeBps)})`, amount: totals.feesNetToReserve, dir: "in" },
    {
      label: "Issuer income",
      sub: totals.incomeTakeToTreasury > 0n ? `net · ${fmtBrs(totals.incomeTakeToTreasury, 0)} take to treasury (${fmtBps(r.config.incomeTakeBps)})` : "net · swept per statement",
      amount: totals.incomeNetToReserve,
      dir: "in",
    },
    { label: "Claim payments", sub: "to the payments account", amount: totals.claimsPaid, dir: "out" },
  ];
  const capitalBars: Bar[] = [
    { label: "Deposits", sub: "filled", amount: totals.depositsIn, dir: "in" },
    { label: "Redemptions", sub: "filled", amount: totals.redemptionsOut, dir: "out" },
  ];

  return (
    <div className="flex flex-col gap-8 lg:gap-12">
      {/* [B] Hero: what the reserve earned, beside the image tile that carries the page's one rule. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="bg-(--color-surface) flex flex-col justify-center gap-2 border p-6 lg:col-span-8">
          <Label>Earned net · since launch</Label>
          <Mono style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 700, lineHeight: 1, color: "var(--color-text)" }}>{signed(earned)}</Mono>
          <span className="font-body text-(--color-text-2) text-sm">Guarantee fees + issuer income − claim payments</span>
        </div>
        <ImageSlot slot={FLOWS_SLOT} aspect="4:3" className="min-h-[160px] lg:col-span-4">
          <div className="flex h-full min-h-[160px] flex-col justify-end p-6">
            <p className="font-display text-(--color-text) m-0 text-xl font-bold leading-snug">A deposit is not income.</p>
          </div>
        </ImageSlot>
      </div>

      {/* [C+D] Both sides of the money in one bordered strip, as diverging bars. */}
      <div className="flex flex-col gap-4">
        <BlockHead
          action={
            <Legend>
              <Swatch color={C.ink} label="into the reserve" />
              <Swatch color={C.mid} label="out of the reserve" />
            </Legend>
          }
        >
          In and out · since launch
        </BlockHead>
        <div className="grid grid-cols-1 gap-px border lg:grid-cols-2" style={{ background: "var(--color-border)" }}>
          <FlowGroup title="Earnings" note="what the reserve earned and paid" net={earned} bars={earnings} />
          <FlowGroup title="Capital" note="not earnings · last 100 fills per escrow" net={capital} bars={capitalBars} />
        </div>
        <span className="font-body text-(--color-text-3) text-2xs">Each side has its own scale.</span>
      </div>

      {/* [E] The dated ledger; the period filter applies here only. */}
      <div className="flex flex-col gap-4">
        <BlockHead action={<PeriodPicker value={period} onChange={pick} label="Ledger period" />}>
          Ledger{all.length > 0 && <Mono dim> · {rows.length}</Mono>}
        </BlockHead>
        {all.length === 0 ? (
          <Empty>No money has moved yet. Fees, claim payments and capital fills appear here.</Empty>
        ) : rows.length === 0 ? (
          <Empty>No flows in this period.</Empty>
        ) : (
          <>
            <Table label="Money flows" head={["Flow", "When", ["Reserve", "num"], ["Treasury", "num"], "Account / tx"]}>
              {shown.map((f) => (
                <LedgerRow key={`${f.kind}-${f.account}`} f={f} />
              ))}
            </Table>
            {rows.length > LEDGER_ROWS && (
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Show fewer" : `Show all (${rows.length})`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* [F] Definitions, collapsed: data first, explanation one click away. */}
      <details className="bg-(--color-surface) group border px-6 py-4">
        <summary className="font-body text-(--color-text-2) hover:text-(--color-text) flex cursor-pointer list-none items-center gap-3 text-sm [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="font-mono text-(--color-text-3) inline-block w-3 group-open:hidden">+</span>
          <span aria-hidden="true" className="font-mono text-(--color-text-3) hidden w-3 group-open:inline-block">−</span>
          How these figures are counted
        </summary>
        <ul className="font-body text-(--color-text-2) m-0 mt-4 flex flex-col gap-2 pl-6 text-sm leading-relaxed">
          <li>Earned net = guarantee fees net + issuer income net − claim payments. Capital net = deposits − redemptions.</li>
          <li>Guarantee fees, issuer income, the take and claim payments are lifetime totals from the reserve&apos;s state account.</li>
          <li>Deposits and redemptions sum the fills in the last 100 transactions of each escrow.</li>
          <li>Totals are since launch. The period filter applies to the ledger only.</li>
        </ul>
      </details>
    </div>
  );
}

/** The Flows section of /reserve: heading (the question) and body. */
export function FlowsSection({ d }: { d: Data }) {
  return (
    <Section id="flows" title="Money flows" subtitle="Where did the reserve's money come from, and where did it go?">
      <Flows r={d.reserve} l={d.ledger} />
    </Section>
  );
}
