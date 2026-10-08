"use client";

/**
 * /reserve Overview: the two spec promises, the Health view, and one summary
 * card per tab. Every figure is a projection or sum of the shared read.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { Mono } from "@/components/Mono";
import { StatusBadge } from "@/components/StatusBadge";
import { useReserve } from "@/components/reserve/ReserveShell";
import { HealthSection } from "@/components/reserve/sections/Health";
import { fmtBrs, fmtDuration, fmtShares } from "@/lib/format";
import { activeRemainingCover, capitalQueue, claimsTimeline, coverageRows, moneyFlows } from "@/lib/view";

/** The two promises the spec makes, each linked to the view that shows them. */
const PROMISES: [string, string][] = [
  ["Claim payments are never blocked by solvency.", "/reserve/claims"],
  ["Pilot on MUTAV's own capital. Not open to public investment.", "/reserve/disclosures"],
];

function Card({ href, label, value, note }: { href: string; label: string; value: ReactNode; note: ReactNode }) {
  return (
    <Link href={href} className="bg-(--color-surface) hover:bg-(--color-surface-2) group flex min-w-0 flex-col gap-2 border p-4 no-underline">
      <span className="font-body text-(--color-text-2) flex items-center justify-between gap-2 text-xs font-medium uppercase" style={{ letterSpacing: "0.01em" }}>
        {label}
        <span aria-hidden="true" className="text-(--color-text-3) group-hover:text-(--color-text)">→</span>
      </span>
      <span className="text-(--color-text) whitespace-nowrap" style={{ fontSize: "clamp(14px, 4vw, 20px)", fontWeight: 700, lineHeight: 1.2 }}>
        {value}
      </span>
      <span className="font-mono text-(--color-text-3) text-2xs">{note}</span>
    </Link>
  );
}

export function Overview() {
  const { d } = useReserve();
  const r = d.reserve;
  const l = d.ledger;
  const rows = coverageRows(l.guarantees);
  const claims = claimsTimeline(l, r.config.payoutSlaSecs, r.now);
  const slowest = claims.reduce<bigint | null>((m, c) => (c.fileToPay !== null && (m === null || c.fileToPay > m) ? c.fileToPay : m), null);
  const late = claims.filter((c) => c.lateOnChain).length;
  const { totals } = moneyFlows(r.state, l);
  const net = totals.feesNetToReserve + totals.incomeNetToReserve + totals.depositsIn - totals.claimsPaid - totals.redemptionsOut;
  const q = capitalQueue(r.state, l);
  const pendingDeposits = q.deposits.reduce((s, x) => s + x.waiting, 0n);
  const pendingShares = q.redeems.reduce((s, x) => s + x.waiting, 0n);
  const frozen = r.token.reserveFrozen;

  return (
    <div className="flex flex-col">
      <ul className="m-0 grid grid-cols-1 gap-2 p-0 pt-4 md:grid-cols-2">
        {PROMISES.map(([text, href]) => (
          <li key={href} className="flex list-none items-center justify-between gap-4 border px-4 py-3">
            <span className="font-display text-(--color-text) text-sm font-bold">{text}</span>
            <Link href={href} className="ext-link font-body shrink-0 text-xs">
              See →
            </Link>
          </li>
        ))}
      </ul>

      <HealthSection d={d} />

      <section aria-labelledby="across-h" className="flex flex-col gap-4">
        <h2 id="across-h" className="font-mono text-(--color-text-3) m-0 text-xs font-normal uppercase" style={{ letterSpacing: "0.08em" }}>
          Across the reserve
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Card href="/reserve/coverage" label="Remaining cover" value={<Mono>{fmtBrs(activeRemainingCover(rows))}</Mono>} note={`${r.state.activeGuarantees} active guarantees`} />
          <Card href="/reserve/claims" label="Slowest claim" value={<Mono>{slowest !== null ? fmtDuration(slowest) : "—"}</Mono>} note={`filed → paid · ${late} late`} />
          <Card href="/reserve/flows" label="Net flows" value={<Mono>{`${net >= 0n ? "+" : "−"}${fmtBrs(net < 0n ? -net : net)}`}</Mono>} note="into minus out" />
          <Card href="/reserve/queue" label="Queue" value={<Mono>{fmtBrs(pendingDeposits)}</Mono>} note={`deposits · ${fmtShares(pendingShares)} sh out`} />
          <Card
            href="/reserve/disclosures"
            label="Risks"
            value={<StatusBadge color={frozen ? "var(--color-error)" : "var(--color-text-3)"} label={frozen ? "FROZEN NOW" : "NOT FROZEN"} />}
            note={`cap ${fmtBrs(r.config.caps.maxClaimPerCall, 0)} per call`}
          />
          <Card href="/reserve/accounts" label="Accounts" value={<Mono>4 keys</Mono>} note="admin · pauser · operator · capital" />
        </div>
      </section>
    </div>
  );
}
