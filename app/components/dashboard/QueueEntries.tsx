"use client";

/**
 * "What is waiting": the wallet's queue entries as a status-first table
 * (ui-reference pattern 9), six columns, ready rows first. The request time
 * moves under the request link instead of taking a column. Claim buttons live
 * in the action panel; rows keep cancels (and any other action the panel does
 * not show), so every action appears once. A verify footer closes the block.
 */
import Link from "next/link";
import { Explorer } from "@/components/Explorer";
import { Mono } from "@/components/Mono";
import { Action } from "@/components/demo/shared";
import { fmtTime } from "@/lib/format";
import type { InvestorView } from "@/lib/server/investor";
import type { InvestorRequest } from "@/lib/view";
import { ACTION_LABEL, Block, StatusOf, claimOf, lineOf, rowActions, sideName, waitingOf } from "./shared";

/** Ready first, then waiting in line (front of the line first), then the rest, newest first. */
function sortRows(rows: InvestorRequest[]): InvestorRequest[] {
  const rank = (x: InvestorRequest) => (x.claimable > 0n ? 0 : x.position !== null ? 1 : 2);
  return [...rows].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (a.position !== null && b.position !== null && a.position !== b.position) return a.position - b.position;
    return a.requestedAt === b.requestedAt ? 0 : a.requestedAt > b.requestedAt ? -1 : 1;
  });
}

function RowActions({ x, connected }: { x: InvestorRequest; connected: boolean }) {
  const actions = rowActions(x);
  if (actions.length === 0) return <Mono dim>—</Mono>;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Action key={a} label={ACTION_LABEL[a]} variant={a.startsWith("cancel") ? "outline" : "default"} disabled={!connected} request={{ kind: a, seq: x.seq }} />
      ))}
    </div>
  );
}

/** Request link with the time under it: identity first, detail second. */
function Identity({ x }: { x: InvestorRequest }) {
  return (
    <span className="flex flex-col gap-0.5">
      <Explorer value={x.address} label={sideName(x)} />
      <Mono dim className="text-2xs">
        {fmtTime(x.requestedAt)}
      </Mono>
    </span>
  );
}

function Rows({ rows, connected }: { rows: InvestorRequest[]; connected: boolean }) {
  return (
    <>
      {/* Phones: one card per request, so the actions stay visible. */}
      <ul className="m-0 flex list-none flex-col p-0 sm:hidden" aria-label="Your queue entries">
        {rows.map((x) => (
          <li key={x.address} className="flex flex-col gap-3 border-b p-4 last:border-b-0" title={`seq ${x.seq.toString()}`}>
            <div className="flex items-start justify-between gap-3">
              <Identity x={x} />
              <StatusOf x={x} />
            </div>
            <dl className="font-mono m-0 grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
              <dt className="text-(--color-text-3)">Line</dt>
              <dt className="text-(--color-text-3) text-right">Waiting</dt>
              <dt className="text-(--color-text-3) text-right">To claim</dt>
              <dd className="m-0">{lineOf(x)}</dd>
              <dd className="m-0 text-right">{waitingOf(x)}</dd>
              <dd className="m-0 text-right">{claimOf(x)}</dd>
            </dl>
            {rowActions(x).length > 0 && <RowActions x={x} connected={connected} />}
          </li>
        ))}
      </ul>
      <div className="table-wrap hidden border-0 sm:block">
        <table className="data-table" aria-label="Your queue entries">
          <thead>
            <tr>
              <th>Request</th>
              <th>Status</th>
              <th className="num">Line</th>
              <th className="num">Waiting</th>
              <th className="num">To claim</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.address} title={`seq ${x.seq.toString()}`}>
                <td>
                  <Identity x={x} />
                </td>
                <td>
                  <StatusOf x={x} />
                </td>
                <td className="num">
                  <Mono dim={x.position === null}>{lineOf(x)}</Mono>
                </td>
                <td className="num">
                  <Mono>{waitingOf(x)}</Mono>
                </td>
                <td className="num">
                  <Mono>{claimOf(x)}</Mono>
                </td>
                <td style={{ whiteSpace: "normal" }}>
                  <RowActions x={x} connected={connected} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Verify strip (ui-reference pattern 10): the accounts behind this page, short and linkable. Moved out of tooltips. */
function Verify({ inv }: { inv: InvestorView | null }) {
  if (!inv) return null;
  const root = inv.allowlist.root;
  const n = inv.allowlist.listSize;
  return (
    <dl className="font-mono text-(--color-text-3) m-0 flex flex-wrap gap-x-6 gap-y-2 border-t px-6 py-3 text-2xs">
      <div className="flex items-center gap-2">
        <dt>Allowlist root</dt>
        <dd className="text-(--color-text-2) m-0" title={root}>
          {root.length > 9 ? `${root.slice(0, 4)}…${root.slice(-4)}` : root} · {n} wallet{n === 1 ? "" : "s"} listed
        </dd>
      </div>
      <div className="flex items-center gap-2">
        <dt>Holder account</dt>
        <dd className="m-0">
          {inv.holderState ? (
            <>
              <Explorer value={inv.holderState.address} /> · last shares in {fmtTime(inv.holderState.lastSharesInTs)}
            </>
          ) : (
            "none yet: created by the first deposit request or share claim"
          )}
        </dd>
      </div>
    </dl>
  );
}

export function QueueEntries({ rows, owner, connected, inv }: { rows: InvestorRequest[]; owner: string | null; connected: boolean; inv: InvestorView | null }) {
  return (
    <Block
      id="queue-h"
      flush
      title="Your queue entries"
      info="Requests wait in queue order until the Reserve Admin fulfils them. Cancels and claims need only the request's owner and are never paused. Hover a row for its queue seq."
      aside={
        <Link href="/reserve/queue" className="ext-link font-mono text-xs">
          Full queue →
        </Link>
      }
    >
      {!owner ? (
        <p className="font-body text-(--color-text-3) m-0 px-6 py-6 text-sm">Connect a wallet to see its requests.</p>
      ) : rows.length === 0 ? (
        <p className="font-body text-(--color-text-3) m-0 px-6 py-6 text-sm">No open requests. New deposits and redemptions appear here.</p>
      ) : (
        <Rows rows={sortRows(rows)} connected={connected} />
      )}
      <Verify inv={inv} />
    </Block>
  );
}
