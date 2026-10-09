"use client";

/**
 * /reserve · Queue. Renders on-chain values from /api/ledger; nothing is
 * computed here beyond sums and differences of account fields.
 */
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { fmtBrs, fmtShares, fmtTime } from "@/lib/format";
import { capitalQueue, type Ledger, type QueueRow, type ReserveView } from "@/lib/view";

import { Empty, Num, Table } from "@/components/reserve/sections/shared";
import { Section } from "@/components/Section";
import type { Data } from "@/components/reserve/sections/shared";

// ── Capital queue ───────────────────────────────────────────────────────────

/** One side of the queue in one compact card: the total waiting and request count, then its FIFO table. */
function Side({ title, empty, rows, unit, capital }: { title: string; empty: string; rows: QueueRow[]; unit: (v: bigint) => string; capital: string }) {
  const total = rows.reduce((s, x) => s + x.waiting, 0n);
  return (
    <div className="bg-(--color-surface) flex min-w-0 flex-col border [&_.table-wrap]:border-0 [&_.table-wrap]:border-t">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-4">
        <h3 className="font-display text-(--color-text) m-0 text-base font-bold">{title}</h3>
        <span className="inline-flex items-baseline gap-3">
          <Mono style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: "var(--color-text)" }}>{unit(total)}</Mono>
          <span className="font-mono text-(--color-text-3) text-xs">
            {rows.length} {rows.length === 1 ? "request" : "requests"}
          </span>
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="border-t px-6">
          <Empty>{empty} New requests join the end of the line and are filled oldest first.</Empty>
        </div>
      ) : (
        <Table label={title} head={[["#", "num"], "Owner (investor)", ["Waiting", "num"], "Requested", "Account"]}>
          {rows.map((x) => (
            <tr key={x.address}>
              <td className="num" title={`seq ${x.seq.toString()}`}>
                <Mono>{x.position}</Mono>
                {x.position === 1 && <span style={{ color: "var(--color-text-3)" }}> · next</span>}
              </td>
              <td>
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <Explorer value={x.owner} />
                  {x.owner === capital && <span className="font-mono text-(--color-text-3) text-2xs uppercase">· MUTAV capital</span>}
                </span>
              </td>
              <Num>{unit(x.waiting)}</Num>
              <td><Mono dim>{fmtTime(x.requestedAt)}</Mono></td>
              <td><Explorer value={x.address} /></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

export function Queue({ r, l }: { r: ReserveView; l: Ledger }) {
  const q = capitalQueue(r.state, l);
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <Side title="Pending deposits" empty="No pending deposits." rows={q.deposits} unit={fmtBrs} capital={r.config.mutavCapitalWallet} />
      <Side title="Pending redemptions" empty="No pending redemptions." rows={q.redeems} unit={(v) => `${fmtShares(v)} sh`} capital={r.config.mutavCapitalWallet} />
    </div>
  );
}

/** The Queue section of /reserve: heading, roles and body. */
export function QueueSection({ d }: { d: Data }) {
  return (
    <Section
      id="queue"
      title="Capital queue"
      kicker="Capital"
      subtitle="Strict FIFO: no request skips the line."
      info={`Investors request deposits and redemptions; the Reserve Admin fulfils them oldest first; investors then collect their shares or BRS.`}
    >
      <Queue r={d.reserve} l={d.ledger} />
    </Section>
  );
}
