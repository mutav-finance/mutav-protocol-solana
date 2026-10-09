"use client";

/**
 * /reserve · Flows. Renders on-chain values from /api/ledger; nothing is
 * computed here beyond sums and differences of account fields.
 */
import { useState, type ReactNode } from "react";
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { InfoTooltip } from "@/components/InfoTooltip";
import { fmtBps, fmtBrs, fmtTime } from "@/lib/format";
import { moneyFlows, type Ledger, type ReserveView } from "@/lib/view";
import { Button } from "@/components/ui/button";

import { Empty, Num, Table } from "@/components/reserve/sections/shared";
import { Section } from "@/components/Section";
import type { Data } from "@/components/reserve/sections/shared";

// ── Money flows ─────────────────────────────────────────────────────────────

const FLOW_LABEL = { fee: "Guarantee fee", income: "Issuer income", claim: "Claim payment", deposit: "Deposit", redemption: "Redemption" } as const;

const label12 = { letterSpacing: "0.01em" } as const;

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

/** One line of a group tile: label and short note on the left, the amount on the right; longer context in an ⓘ. */
function Line({ label, note, info, value }: { label: string; note: string; info?: ReactNode; value: string }) {
  return (
    <li className="flex list-none items-start justify-between gap-4 border-t py-3 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-body text-(--color-text) inline-flex items-center gap-2 text-sm">
          {label}
          {info && <InfoTooltip label={`About ${label}`} width={260}>{info}</InfoTooltip>}
        </span>
        <span className="font-mono text-(--color-text-3) text-2xs leading-snug">{note}</span>
      </div>
      <Mono style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text)", whiteSpace: "nowrap" }}>{value}</Mono>
    </li>
  );
}

/** A group tile: Inter Medium caps heading, then its lines. */
function Group({ title, span, children }: { title: string; span: string; children: ReactNode }) {
  return (
    <div className={`bg-(--color-surface) flex flex-col gap-4 border p-6 ${span}`}>
      <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={label12}>{title}</span>
      <ul className="m-0 flex flex-col p-0">{children}</ul>
    </div>
  );
}

/** A neutral total in the header row: caps label over a mono figure. */
function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={label12}>{label}</span>
      <Mono style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text)" }}>{value}</Mono>
    </div>
  );
}

export function Flows({ r, l }: { r: ReserveView; l: Ledger }) {
  const { totals, rows: all } = moneyFlows(r.state, l);
  const [period, setPeriod] = useState<Period>("All");
  const rows = all.filter((f) => inPeriod(f.at, r.now, period));
  const into = totals.feesNetToReserve + totals.incomeNetToReserve + totals.depositsIn;
  const out = totals.claimsPaid + totals.redemptionsOut;
  // Earnings and capital are kept apart: a deposit is not income.
  const earned = totals.feesNetToReserve + totals.incomeNetToReserve - totals.claimsPaid;
  const capital = totals.depositsIn - totals.redemptionsOut;
  const abs = (v: bigint) => (v < 0n ? -v : v);
  const signed = (v: bigint) => `${v >= 0n ? "+" : "−"}${fmtBrs(abs(v))}`;
  return (
    <div className="flex flex-col gap-4">
      {/* Lead: what the reserve earned. Capital moves sit beside it, smaller: a deposit is not income. */}
      <div className="bg-(--color-surface) grid grid-cols-1 gap-6 border p-6 lg:grid-cols-12 lg:gap-10">
        <div className="flex flex-col gap-2 lg:col-span-5">
          <span className="inline-flex items-center gap-2">
            <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={label12}>Earned net · lifetime</span>
            <InfoTooltip label="About these totals" width={300}>
            Lifetime totals: the period filter applies to the ledger below, not to these figures. Earned net = guarantee fees net + issuer income net − claim payments. Capital net = deposits − redemptions. In and Out add both. Guarantee fees, issuer income, the fee take and claim payments are lifetime on-chain totals. Deposits and
            redemptions sum the fills in the last 100 transactions of each escrow.
          </InfoTooltip>
          </span>
          <Mono style={{ fontSize: "clamp(28px, 3.4vw, 40px)", fontWeight: 700, lineHeight: 1, color: "var(--color-text)" }}>{signed(earned)}</Mono>
          <span className="font-mono text-(--color-text-3) text-2xs">guarantee fees + issuer income − claim payments</span>
        </div>
        <div className="flex flex-wrap content-center items-center gap-x-8 gap-y-3 border-t pt-4 lg:col-span-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
          <Total label="Capital net" value={signed(capital)} />
          <Total label="In" value={`+${fmtBrs(into)}`} />
          <Total label="Out" value={`−${fmtBrs(out)}`} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Group title="Into the reserve" span="lg:col-span-5">
          <Line label="Guarantee fees, net" note="raises NAV for every holder" value={fmtBrs(totals.feesNetToReserve)} />
          <Line label="Issuer income, net" note="swept per statement" info="Nora partnership revenue, swept into the reserve per statement." value={fmtBrs(totals.incomeNetToReserve)} />
          <Line label="Deposits" note="fulfilled · last 100 fills" value={fmtBrs(totals.depositsIn)} />
        </Group>
        <Group title="Out of the reserve" span="lg:col-span-3">
          <Line label="Claim payments" note="to the payments account" value={fmtBrs(totals.claimsPaid)} />
          <Line label="Redemptions" note="filled · last 100 fills" value={fmtBrs(totals.redemptionsOut)} />
        </Group>
        <Group title="Outside the reserve" span="lg:col-span-4">
          <Line label="Fee take, to treasury" note={`${fmtBps(r.config.feeTakeBps)} of each fee`} info="MUTAV's operation, paid from each guarantee fee to the treasury account." value={fmtBrs(totals.feeTakeToTreasury)} />
          {totals.incomeTakeToTreasury > 0n && (
            <Line label="Income take, to treasury" note={`${fmtBps(r.config.incomeTakeBps)} of swept income`} info="MUTAV's take from issuer income, sent to the treasury account." value={fmtBrs(totals.incomeTakeToTreasury)} />
          )}
        </Group>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={label12}>
          Ledger
        </span>
        <PeriodPicker value={period} onChange={setPeriod} label="Ledger period" />
      </div>
      {all.length === 0 ? (
        <Empty>No money has moved yet.</Empty>
      ) : rows.length === 0 ? (
        <Empty>No flows in this period.</Empty>
      ) : (
        <Table label="Money flows" head={["Flow", "When", ["Reserve", "num"], ["Treasury", "num"], "Detail", "Account / tx"]}>
          {rows.map((f) => (
            <tr key={`${f.kind}-${f.account}`}>
              <td><Mono>{FLOW_LABEL[f.kind]}</Mono></td>
              <td><Mono dim>{f.at !== null ? fmtTime(f.at) : "—"}</Mono></td>
              <Num color={f.reserveDelta >= 0n ? "var(--color-success)" : "var(--color-text)"}>{f.reserveDelta >= 0n ? "+" : "−"}{fmtBrs(abs(f.reserveDelta))}</Num>
              <Num>{f.treasury > 0n ? fmtBrs(f.treasury) : "—"}</Num>
              <td>{/^slot \d+$/.test(f.detail) ? <span title={f.detail}><Mono dim>—</Mono></span> : <Mono dim>{f.detail}</Mono>}</td>
              <td><Explorer value={f.account} kind={f.isTx ? "tx" : "address"} /></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

/** The Flows section of /reserve: heading and body. */
export function FlowsSection({ d }: { d: Data }) {
  return (
    <Section id="flows" title="Money flows" kicker="In and out" subtitle="Where the reserve's money came from and where it went.">
      <Flows r={d.reserve} l={d.ledger} />
    </Section>
  );
}
