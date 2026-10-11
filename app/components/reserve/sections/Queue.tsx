"use client";

/**
 * /reserve · Queue. Answers one question: "How much capital is waiting, and who is next?"
 * Hero: BRS waiting to deposit. Support strip: shares to redeem, oldest request, MUTAV
 * capital in line. Detail: the two FIFO lines. Footnote: how the queue works.
 * Renders on-chain values from /api/ledger; nothing is computed here beyond sums,
 * counts and a minimum over account fields.
 */
import { useState, type ReactNode } from "react";
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { ImageSlot } from "@/components/ImageSlot";
import { fmtShares, fmtTime } from "@/lib/format";
import { useFmt } from "@/components/MoneyProvider";
import { capitalQueue, type Ledger, type QueueRow, type ReserveView } from "@/lib/view";

import { Empty, Num, Table } from "@/components/reserve/sections/shared";
import { Section } from "@/components/Section";
import type { Data } from "@/components/reserve/sections/shared";

/** Rows shown per line before "Show all". */
const PAGE = 10;

const sum = (rows: QueueRow[]) => rows.reduce((s, x) => s + x.waiting, 0n);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const Label = ({ children }: { children: ReactNode }) => (
  <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={{ letterSpacing: "0.01em" }}>
    {children}
  </span>
);

const Sub = ({ children }: { children: ReactNode }) => <span className="font-mono text-(--color-text-3) text-xs">{children}</span>;

/** One support cell: label, one value, one sub-line. */
function Cell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-(--color-surface) flex min-w-0 flex-col gap-2 p-6">
      <Label>{label}</Label>
      <Mono style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: "var(--color-text)", overflowWrap: "anywhere" }}>{value}</Mono>
      <Sub>{sub}</Sub>
    </div>
  );
}

/** [B + C] Hero (BRS waiting to deposit) and a three-cell support strip, sharing one border. */
function Summary({ deposits, redeems, capital }: { deposits: QueueRow[]; redeems: QueueRow[]; capital: string }) {
  const fmtBrs = useFmt();
  const all = [...deposits, ...redeems];
  const oldest = all.reduce<QueueRow | null>((m, x) => (m === null || x.requestedAt < m.requestedAt ? x : m), null);
  const ours = all.filter((x) => x.owner === capital).length;
  return (
    <div className="grid grid-cols-1 gap-px border lg:grid-cols-12" style={{ background: "var(--color-border)" }}>
      <div className="bg-(--color-surface) flex min-w-0 flex-col justify-center gap-2 p-6 lg:col-span-5">
        <Label>Waiting to deposit</Label>
        <Mono style={{ fontSize: "clamp(36px, 5vw, 48px)", fontWeight: 700, lineHeight: 1, color: "var(--color-text)", overflowWrap: "anywhere" }}>{fmtBrs(sum(deposits))}</Mono>
        <span className="font-body text-(--color-text-2) text-sm">{deposits.length === 0 ? "No deposit is waiting." : `${plural(deposits.length, "request", "requests")}, filled oldest first`}</span>
      </div>
      <div className="grid grid-cols-1 gap-px sm:grid-cols-3 lg:col-span-7">
        <Cell label="Shares to redeem" value={fmtShares(sum(redeems))} sub={plural(redeems.length, "request", "requests")} />
        <Cell label="Oldest request" value={oldest ? fmtTime(oldest.requestedAt) : "none"} sub={oldest ? (oldest.side === "deposit" ? "deposit, next to fill" : "redemption, next to fill") : "queue is empty"} />
        <Cell label="MUTAV capital" value={`${ours} of ${all.length}`} sub="requests, same line, no priority" />
      </div>
    </div>
  );
}

/** [E] One FIFO line: position (NEXT badge on #1), owner, amount, requested, request account. */
function Line({ title, empty, rows, unitHead, unit, capital }: { title: string; empty: string; rows: QueueRow[]; unitHead: string; unit: (v: bigint) => string; capital: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, PAGE);
  return (
    <div className="bg-(--color-surface) flex min-w-0 flex-col border [&_.table-wrap]:border-0 [&_.table-wrap]:border-t">
      <div className="flex items-baseline justify-between gap-4 px-6 py-4">
        <h3 className="font-display text-(--color-text) m-0 text-base font-bold">{title}</h3>
        <Sub>{plural(rows.length, "request", "requests")}</Sub>
      </div>
      {rows.length === 0 ? (
        <div className="border-t px-6">
          <Empty>{empty}</Empty>
        </div>
      ) : (
        <>
          <Table label={title} head={[["#", "num"], "Owner", [unitHead, "num"], "Requested", "Request"]}>
            {shown.map((x) => (
              <tr key={x.address}>
                <td className="num" title={`seq ${x.seq.toString()}`}>
                  <span className="inline-flex items-center justify-end gap-3">
                    {x.position === 1 && <StatusBadge color="var(--color-text-2)" label="NEXT" />}
                    <Mono>{x.position}</Mono>
                  </span>
                </td>
                <td>
                  <span className="inline-flex items-center gap-3">
                    <Explorer value={x.owner} />
                    {x.owner === capital && <StatusBadge color="var(--color-text-3)" label="MUTAV" />}
                  </span>
                </td>
                <Num>{unit(x.waiting)}</Num>
                <td>
                  <Mono dim>{fmtTime(x.requestedAt)}</Mono>
                </td>
                <td>
                  <Explorer value={x.address} label="account" />
                </td>
              </tr>
            ))}
          </Table>
          {rows.length > PAGE && (
            <div className="border-t px-6 py-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>
                {all ? "Show first 10" : `Show all (${rows.length})`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Queue({ r, l }: { r: ReserveView; l: Ledger }) {
  const fmtBrs = useFmt();
  const q = capitalQueue(r.state, l);
  const capital = r.config.mutavCapitalWallet;
  return (
    <div className="flex flex-col gap-6">
      <Summary deposits={q.deposits} redeems={q.redeems} capital={capital} />

      <ImageSlot slot="queue-line" aspect="8:1" opacity={0.12} className="h-14">
        <div className="flex h-full items-center px-6">
          <p className="font-body text-(--color-text) m-0 text-sm font-medium">One line, oldest first. No request skips it.</p>
        </div>
      </ImageSlot>

      <div className="flex flex-col gap-6">
        <Line title="Deposits" empty="No deposits waiting. New requests join the end of the line." rows={q.deposits} unitHead="Amount" unit={fmtBrs} capital={capital} />
        <Line title="Redemptions" empty="No redemptions waiting. New requests join the end of the line." rows={q.redeems} unitHead="Shares" unit={fmtShares} capital={capital} />
      </div>

      {/* [F] Explanation below the data, collapsed. */}
      <details className="group border-t pt-4">
        <summary className="font-body text-(--color-text-2) hover:text-(--color-text) cursor-pointer text-sm font-medium">How the queue works</summary>
        <ol className="font-body text-(--color-text-2) m-0 mt-4 flex max-w-[720px] list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed">
          <li>An allowlisted investor requests a deposit (BRS) or a redemption (shares).</li>
          <li>The Reserve Admin fills requests oldest first. No request skips the line.</li>
          <li>The investor then collects their shares or BRS.</li>
        </ol>
      </details>
    </div>
  );
}

/** The Queue view of /reserve. */
export function QueueSection({ d }: { d: Data }) {
  return (
    <Section id="queue" title="Capital queue" subtitle="How much capital is waiting, and who is next.">
      <Queue r={d.reserve} l={d.ledger} />
    </Section>
  );
}
