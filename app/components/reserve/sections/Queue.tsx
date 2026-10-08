"use client";

/**
 * /reserve · Queue. Renders on-chain values from /api/ledger; nothing is
 * computed here beyond sums and differences of account fields.
 */
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { fmtBrs, fmtShares, fmtTime } from "@/lib/format";
import { capitalQueue, type Ledger, type QueueRow, type ReserveView } from "@/lib/view";
import { RoleLine, RoleTag } from "@/components/RoleTag";

import { Empty, Num, Table } from "@/components/reserve/sections/shared";
import { Section } from "@/components/Section";
import type { Data } from "@/components/reserve/sections/shared";

// ── Capital queue ───────────────────────────────────────────────────────────

/** One side of the queue: a tile (total waiting, request count) over its FIFO table. */
function Side({ title, empty, rows, unit, capital }: { title: string; empty: string; rows: QueueRow[]; unit: (v: bigint) => string; capital: string }) {
  const total = rows.reduce((s, x) => s + x.waiting, 0n);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="bg-(--color-surface) flex flex-col gap-2 border p-6">
        <h3 className="font-display text-(--color-text) m-0 text-base font-bold">{title}</h3>
        <Mono style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 700, lineHeight: 1, color: "var(--color-text)" }}>{unit(total)}</Mono>
        <span className="font-mono text-(--color-text-3) text-xs">
          {rows.length} {rows.length === 1 ? "request" : "requests"}
        </span>
      </div>
      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <Table label={title} head={[["#", "num"], ["Seq", "num"], "Owner (investor)", ["Waiting", "num"], "Requested", "Account"]}>
          {rows.map((x) => (
            <tr key={x.address}>
              <Num>
                {x.position}
                {x.position === 1 && <span style={{ color: "var(--color-text-3)" }}> · next</span>}
              </Num>
              <Num>{x.seq.toString()}</Num>
              <td>
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <Explorer value={x.owner} />
                  <RoleTag role="investor" suffix={x.owner === capital ? <span style={{ color: "var(--color-text-3)" }}>· MUTAV capital</span> : undefined} />
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Side title="Pending deposits" empty="No pending deposits." rows={q.deposits} unit={fmtBrs} capital={r.config.mutavCapitalWallet} />
      <Side title="Pending redemptions" empty="No pending redemptions." rows={q.redeems} unit={(v) => `${fmtShares(v)} sh`} capital={r.config.mutavCapitalWallet} />
    </div>
  );
}

/** The Queue section of /reserve: heading, roles and body. */
export function QueueSection({ d }: { d: Data }) {
  const s = d.reserve.state;
  return (
    <Section
      id="queue"
      title="Capital queue"
      kicker="FIFO"
      subtitle="Strict FIFO: no request skips the line."
      info={`Investors request deposits and redemptions; the admin multisig fulfils them oldest first; investors then claim their shares or BRS. Head seq: deposits ${s.depositHead}, redemptions ${s.redeemHead}.`}
      roles={<RoleLine items={[{ role: "investor" }, { role: "admin" }]} />}
    >
      <Queue r={d.reserve} l={d.ledger} />
    </Section>
  );
}
