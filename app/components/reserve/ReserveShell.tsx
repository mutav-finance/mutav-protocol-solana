"use client";

/**
 * The /reserve platform shell: one read of /api/ledger shared by every tab.
 * Header is the product bar (status, as-of) and a persistent tab row, the
 * way a reserve page keeps its views in reach (Aave reserve, Morpho vault).
 * Each tab owns its figures; this shell does not repeat them.
 */
import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { InfoTooltip } from "@/components/InfoTooltip";
import { ReadError } from "@/components/Section";
import { StatusBadge } from "@/components/StatusBadge";
import { usePoll } from "@/lib/client/use-poll";
import { fmtTime } from "@/lib/format";
import type { Data } from "@/components/reserve/sections/shared";

type Ctx = { d: Data; refresh: () => Promise<void> };
const ReserveCtx = createContext<Ctx | null>(null);

/** The shared /api/ledger read. Only rendered once the data is in. */
export function useReserve(): Ctx {
  const c = useContext(ReserveCtx);
  if (!c) throw new Error("useReserve outside ReserveShell");
  return c;
}

/** The tabs, in order. `href` is the route; Overview is /reserve itself. */
export const TABS: [string, string][] = [
  ["/reserve", "Overview"],
  ["/reserve/coverage", "Coverage"],
  ["/reserve/claims", "Claims"],
  ["/reserve/flows", "Flows"],
  ["/reserve/queue", "Queue"],
  ["/reserve/disclosures", "Risks"],
  ["/reserve/accounts", "Accounts"],
];

/** One hero-shaped block while the first read is in flight. */
function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Reading the chain" className="flex flex-col gap-4 pt-6">
      <span className="sr-only">Reading the chain…</span>
      <div className="bg-(--color-surface) h-[220px] border" />
      <div className="bg-(--color-surface) h-[88px] border" />
    </div>
  );
}

export function ReserveShell({ children }: { children: ReactNode }) {
  const poll = usePoll<Data>("/api/ledger", 10_000);
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/reserve" ? pathname === "/reserve" : pathname.startsWith(href));
  const d = poll.data;
  const covered = d ? d.reserve.solvency.stableAssets >= d.reserve.solvency.coverageRequired : null;
  return (
    <div className="flex w-full flex-1 flex-col">
      <header className="bg-(--color-canvas) sticky top-14 z-[90] border-b" style={{ paddingLeft: "var(--section-pad-x)", paddingRight: "var(--section-pad-x)" }}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 pb-3">
          <h1 className="font-display text-(--color-text) m-0 text-2xl font-bold tracking-tight">Transparency</h1>
          {covered !== null && <StatusBadge color={covered ? "var(--color-success)" : "var(--color-error)"} label={covered ? "COVERED" : "UNDER-COVERED"} />}
          <span className="font-mono text-(--color-text-3) inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {poll.updatedAt && (
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                <span className="live-dot" aria-hidden="true" />
                live · page read {new Date(poll.updatedAt).toISOString().slice(11, 19)} UTC
              </span>
            )}
            {d && <span className="whitespace-nowrap">· NAV published {fmtTime(d.reserve.state.lastRefreshTs)}</span>}
            <InfoTooltip label="About this page" width={280}>
              Every number is read from the MUTAV program&apos;s on-chain accounts, every 10 seconds; no wallet needed. &ldquo;Page read&rdquo; is when this page last read the chain;
              &ldquo;NAV published&rdquo; is when NAV, coverage and mode were last published on-chain.
            </InfoTooltip>
          </span>
        </div>
        <nav aria-label="Transparency views" className="-mb-px flex overflow-x-auto">
          {TABS.map(([href, label]) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`font-body shrink-0 border-b-2 px-4 py-3 text-sm whitespace-nowrap no-underline ${active ? "text-(--color-text) border-(--color-text) font-medium" : "text-(--color-text-2) hover:text-(--color-text) border-transparent"}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main id="reserve-view" className="flex w-full flex-1 flex-col pb-12" style={{ paddingLeft: "var(--section-pad-x)", paddingRight: "var(--section-pad-x)" }}>
        {poll.error && !d && (
          <div className="pt-6">
            <ReadError error={poll.error} onRetry={poll.refresh} />
          </div>
        )}
        {poll.loading && !d && <Skeleton />}
        {d && <ReserveCtx.Provider value={{ d, refresh: poll.refresh }}>{children}</ReserveCtx.Provider>}
      </main>
    </div>
  );
}
