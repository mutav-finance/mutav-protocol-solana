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
import { Fragment, useState, type ReactNode } from "react";
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { C, Legend, Row, RowLabel, Swatch, Track } from "@/components/charts/Charts";
import { frac } from "@/lib/charts";
import { fmtPct, fmtTime } from "@/lib/format";
import { useFmt } from "@/components/MoneyProvider";
import { moneyFlows, type FlowRow, type Ledger, type ReserveView } from "@/lib/view";
import { Button } from "@/components/ui/button";

import { BlockHead, Empty, MotionStyle, Num, PlusMark, Table } from "@/components/reserve/sections/shared";
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
              border: `1px solid ${on ? "var(--color-text)" : "var(--color-border)"}`,
              marginLeft: i === 0 ? 0 : -1,
              position: "relative",
              zIndex: on ? 1 : 0,
              color: on ? "var(--color-text)" : "var(--color-text-2)",
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

/** Ledger rows shown before "Show all". */
const LEDGER_ROWS = 10;

const abs = (v: bigint) => (v < 0n ? -v : v);
const signed = (v: bigint, fmt: (b: bigint) => string) => `${v >= 0n ? "+" : "−"}${fmt(abs(v))}`;

/** Inter Medium 12px caps label (brand card label). */
const Label = ({ children }: { children: ReactNode }) => (
  <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={{ letterSpacing: "0.01em" }}>
    {children}
  </span>
);

// ── Totals strip (also used by Coverage and Queue) ──────────────────────────

/** How a term joins the one before it. "or" reads as "the larger of". */
export type TotalsOp = "+" | "−" | "=" | "or";
export type TotalsTerm = { op?: TotalsOp; label: string; value: string; result?: boolean; color?: string };

const OP_WORD: Record<TotalsOp, string> = { "+": "plus", "−": "minus", "=": "equals", or: "or" };

/**
 * A reconciling footer: each group is one sum laid out left to right with its
 * operators visible, so a reader can redo the arithmetic. Groups sit on one
 * row on wide screens and stack on narrow ones.
 */
export function TotalsStrip({ title, groups, note }: { title: string; groups: TotalsTerm[][]; note?: ReactNode }) {
  return (
    <div role="group" aria-label={title} className="bg-(--color-surface) flex flex-col border">
      <div className="border-b px-6 py-3">
        <Label>{title}</Label>
      </div>
      <div className="flex flex-col lg:flex-row lg:flex-wrap">
        {groups.map((g, gi) => (
          <div key={gi} className={`flex flex-wrap items-end gap-x-4 gap-y-3 px-6 py-4 ${gi > 0 ? "border-t lg:border-t-0 lg:border-l" : ""}`}>
            {g.map((t) => (
              <Fragment key={t.label}>
                {t.op && (
                  <span className={`text-(--color-text-3) pb-0.5 leading-none ${t.op === "or" ? "font-body text-sm" : "font-mono text-lg"}`}>
                    <span aria-hidden="true">{t.op}</span>
                    <span className="sr-only">{OP_WORD[t.op]}</span>
                  </span>
                )}
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-body text-(--color-text-2) text-xs">{t.label}</span>
                  <Mono style={{ fontSize: 16, fontWeight: t.result ? 700 : 500, lineHeight: 1.2, whiteSpace: "nowrap", color: t.color ?? (t.result ? "var(--color-text)" : "var(--color-text-2)") }}>
                    {t.value}
                  </Mono>
                </div>
              </Fragment>
            ))}
          </div>
        ))}
      </div>
      {note && <p className="font-body text-(--color-text-3) m-0 border-t px-6 py-3 text-xs leading-relaxed">{note}</p>}
    </div>
  );
}

type Bar = { label: string; sub?: string; amount: bigint; dir: "in" | "out" };

/** One side of the money (earnings or capital): its net in the head, then diverging bars on the group's own axis. */
function FlowGroup({ title, note, net, bars }: { title: string; note: string; net: bigint; bars: Bar[] }) {
  const fmtBrs = useFmt();
  const axis = bars.reduce((m, b) => (b.amount > m ? b.amount : m), 0n);
  return (
    <div className="bg-(--color-surface) flex min-w-0 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1">
          <Label>{title}</Label>
          <span className="font-body text-(--color-text-2) text-sm">{note}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-mono text-(--color-text-3) text-2xs uppercase">net</span>
          <Mono style={{ fontSize: 20, fontWeight: 700, lineHeight: 1, color: "var(--color-text)" }}>{signed(net, fmtBrs)}</Mono>
        </div>
      </div>
      <div className="mv-grow-bars flex flex-col gap-4">
        {bars.map((b) => {
          const f = frac(b.amount, axis);
          const sign = b.dir === "in" ? "+" : "−";
          return (
            <Row
              key={b.label}
              labelWidth={170}
              label={<RowLabel sub={b.sub ? <span className="font-body text-(--color-text-3) text-2xs">{b.sub}</span> : undefined}>{b.label}</RowLabel>}
              value={`${sign}${fmtBrs(b.amount, 0)}`}
              summary={`${b.label}: ${sign}${fmtBrs(b.amount)} ${b.dir === "in" ? "into" : "out of"} the reserve.${b.sub ? ` ${b.sub}.` : ""}`}
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
  const fmtBrs = useFmt();
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
      <Num>{signed(f.reserveDelta, fmtBrs)}</Num>
      <Num>{f.treasury > 0n ? fmtBrs(f.treasury) : "—"}</Num>
      <td><Explorer value={f.account} kind={f.isTx ? "tx" : "address"} /></td>
    </tr>
  );
}

// ── The tab ─────────────────────────────────────────────────────────────────

export function Flows({ r, l }: { r: ReserveView; l: Ledger }) {
  const fmtBrs = useFmt();
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
    { label: "Guarantee fees", sub: `after ${fmtBrs(totals.feeTakeToTreasury, 0)} MUTAV fee (${fmtPct(r.config.feeTakeBps)})`, amount: totals.feesNetToReserve, dir: "in" },
    {
      label: "Issuer income",
      // No take on issuer income (ADR 0019).
      sub: "from the BRS issuer, monthly",
      amount: totals.incomeNetToReserve,
      dir: "in",
    },
    { label: "Claim payments", sub: "paid to landlords", amount: totals.claimsPaid, dir: "out" },
  ];
  const capitalBars: Bar[] = [
    { label: "Deposits", amount: totals.depositsIn, dir: "in" },
    { label: "Redemptions", amount: totals.redemptionsOut, dir: "out" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <MotionStyle />
      {/* [C+D] Both sides of the money in one bordered strip, as diverging bars. */}
      <div className="flex flex-col gap-4">
        <BlockHead
          title="In and out · since launch"
          aside={
            <Legend>
              <Swatch color={C.ink} label="into the reserve" />
              <Swatch color={C.mid} label="out of the reserve" />
            </Legend>
          }
        />
        <div className="grid grid-cols-1 gap-px border lg:grid-cols-2" style={{ background: "var(--color-border)" }}>
          <FlowGroup title="Earnings" note="What the reserve earned from its guarantees, after the claim payments it made." net={earned} bars={earnings} />
          <FlowGroup title="Capital" note="Investor money filled in and out of the reserve. Not earnings." net={capital} bars={capitalBars} />
        </div>
      </div>

      {/* [E] The dated ledger; the period filter applies here only. */}
      <div id="ledger" className="flex scroll-mt-32 flex-col gap-4">
        <BlockHead
          title={
            <>
              Ledger{all.length > 0 && <Mono dim> · {rows.length}</Mono>}
            </>
          }
          aside={<PeriodPicker value={period} onChange={pick} label="Ledger period" />}
        />
        {all.length === 0 ? (
          <Empty>No money has moved yet. Fees, claim payments and capital fills appear here.</Empty>
        ) : rows.length === 0 ? (
          <Empty>No flows in this period.</Empty>
        ) : (
          <>
            <Table label="Money flows" head={["Flow", "When", ["Reserve", "num"], ["MUTAV fee", "num"], "Explorer"]}>
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
          <PlusMark />
          How these figures are counted
        </summary>
        <ul className="font-body text-(--color-text-2) m-0 mt-4 flex flex-col gap-2 pl-6 text-sm leading-relaxed">
          <li>Earned net = guarantee fees net + issuer income net − claim payments. Capital net = deposits − redemptions. A deposit is not income.</li>
          <li>Guarantee fees, issuer income, the MUTAV fee and claim payments are lifetime totals from the reserve&apos;s state account.</li>
          <li>Capital sums the fills in the last 100 transactions of each queue account (deposits waiting in line, redemptions waiting in line).</li>
          <li>Each side has its own scale. Totals are since launch; the period filter applies to the ledger only.</li>
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
