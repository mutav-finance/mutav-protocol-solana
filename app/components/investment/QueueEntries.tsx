"use client";

/**
 * "Your requests": the wallet's queue entries as a compact list beside the
 * request card, in the style of the reserve's Recent activity. Ready rows
 * first; one line each (side, status and place in line, amount, age). Cancel
 * and collect show under a row only with a connected wallet.
 */
import Link from "next/link";
import { Explorer } from "@/components/Explorer";
import { Mono } from "@/components/Mono";
import { Action, Note, useLive } from "@/components/demo/shared";
import { depositHead, redeemHead, type HeadStatus } from "@/lib/queue";
import type { Money } from "@/lib/client/use-money";
import type { InvestorView } from "@/lib/server/investor";
import type { InvestorRequest } from "@/lib/view";
import { ACTION_LABEL, claimOf, lineOf, sideName, statusName, waitingOf } from "./shared";

const NUM = { fontVariantNumeric: "tabular-nums" } as const;

/** Seconds as a readable age: "just now", "5 minutes ago", "3 hours ago", "5 days ago". */
function ago(secs: bigint): string {
  const s = Number(secs < 0n ? 0n : secs);
  const units: [number, string][] = [
    [86_400 * 365, "year"],
    [86_400 * 30, "month"],
    [86_400, "day"],
    [3_600, "hour"],
    [60, "minute"],
  ];
  for (const [size, name] of units) {
    const n = Math.floor(s / size);
    if (n >= 1) return `${n} ${name}${n === 1 ? "" : "s"} ago`;
  }
  return "just now";
}

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

function RowActions({ x }: { x: InvestorRequest }) {
  return (
    <div className="col-start-2 col-end-4 flex flex-wrap gap-2 [&_button]:h-7 [&_button]:px-2.5 [&_button]:text-xs">
      {x.actions.map((a) => (
        <Action key={a} label={ACTION_LABEL[a]} variant={a.startsWith("cancel") ? "outline" : "default"} request={{ kind: a, seq: x.seq }} />
      ))}
    </div>
  );
}

/** One request on one line: side icon, side and status, amount and age. Actions only with a connected wallet. */
function Row({ x, now, connected, money, last }: { x: InvestorRequest; now: bigint; connected: boolean; money: Money; last: boolean }) {
  const ready = x.claimable > 0n;
  const amount = ready ? claimOf(x, money) : waitingOf(x, money);
  const sub = ready ? "Ready to collect" : x.position !== null ? `${statusName(x)} · ${lineOf(x)} in line` : statusName(x);
  return (
    <li
      title={`seq ${x.seq.toString()}`}
      className="grid list-none grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-2 py-3"
      style={{ borderBottom: last ? "none" : "1px solid var(--color-border)" }}
    >
      <span aria-hidden="true" className="bg-(--color-surface-2) inline-flex size-9 items-center justify-center border">
        <Mono style={{ fontSize: 14, color: ready ? "var(--color-success)" : "var(--color-text-2)" }}>{x.side === "deposit" ? "↓" : "↑"}</Mono>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-body text-(--color-text) text-[13px]">{sideName(x)}</span>
        <Mono style={{ ...NUM, fontSize: 11, color: ready ? "var(--color-success)" : "var(--color-text-3)" }}>{sub}</Mono>
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <Mono style={{ ...NUM, fontSize: 13, color: ready ? "var(--color-success)" : "var(--color-text)" }}>{amount}</Mono>
        <Explorer value={x.address} label={x.requestedAt > 0n ? ago(now - x.requestedAt) : "account"} />
      </span>
      {connected && x.actions.length > 0 && <RowActions x={x} />}
    </li>
  );
}

/** Verify footer, collapsed: the allowlist root (the v1 layout has no holder account). */
function Verify({ inv }: { inv: InvestorView | null }) {
  if (!inv) return null;
  const root = inv.allowlist.root;
  return (
    <details className="border-t pt-3">
      <summary className="font-body text-(--color-text-2) hover:text-(--color-text) cursor-pointer text-xs select-none">Check your access on-chain</summary>
      <p className="font-body text-(--color-text-3) m-0 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs">
      <span title={root}>
        Allowlist root{" "}
        <Mono dim>
          {root.length > 9 ? `${root.slice(0, 4)}…${root.slice(-4)}` : root}
        </Mono>
      </span>
      </p>
    </details>
  );
}

export function QueueEntries({ rows, owner, connected, inv, money, now }: { rows: InvestorRequest[]; owner: string | null; connected: boolean; inv: InvestorView | null; money: Money; now: bigint }) {
  const sorted = sortRows(rows);
  const ready = rows.filter((x) => x.claimable > 0n).length;
  // Why a request at the head of its queue would not fill now (preview).
  const { reserve, ledger } = useLive();
  const heads = owner
    ? [depositHead(reserve.config, reserve.state, reserve.coverage, ledger, null), redeemHead(reserve.config, reserve.state, reserve.coverage, ledger)].filter(
        (h): h is HeadStatus => h !== null && h.owner === owner && h.stuck.length > 0,
      )
    : [];
  return (
    <section aria-labelledby="queue-h" className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex flex-col gap-0.5">
          <h2 id="queue-h" className="font-display text-(--color-text) m-0 text-base font-bold">
            Your requests
          </h2>
          {owner && (
            <Mono style={{ ...NUM, fontSize: 11, color: "var(--color-text-3)" }}>
              {rows.length} open{ready > 0 ? ` · ${ready} ready to collect` : ""}
            </Mono>
          )}
        </span>
        <Link href="/reserve/capital" className="ext-link font-body text-xs">
          Full queue →
        </Link>
      </div>
      {!owner ? (
        <p className="font-body text-(--color-text-3) m-0 py-3 text-[13px]">Connect a wallet to see its requests.</p>
      ) : rows.length === 0 ? (
        <p className="font-body text-(--color-text-3) m-0 py-3 text-[13px]">No open requests. New deposits and redemptions appear here.</p>
      ) : (
        <>
        {heads.map((h) => (
          <Note key={h.side} tone="warn">Your {h.side} seq {h.seq.toString()} heads the queue and would not fill now (PREVIEW): {h.stuck.join("; ")}.</Note>
        ))}
        <ul className="m-0 flex flex-col p-0" aria-label="Your queue entries">
          {sorted.map((x, i) => (
            <Row key={x.address} x={x} now={now} connected={connected} money={money} last={i === sorted.length - 1} />
          ))}
        </ul>
        </>
      )}
      <Verify inv={inv} />
    </section>
  );
}
