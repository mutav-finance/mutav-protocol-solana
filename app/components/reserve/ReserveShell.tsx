"use client";

/**
 * The /reserve platform shell: one read of /api/ledger shared by every tab,
 * a compact sticky header (status, live read, refresh, role key) and the tab
 * bar. Each tab is its own route under /reserve.
 */
import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { InfoTooltip } from "@/components/InfoTooltip";
import { RefreshButton } from "@/components/RefreshButton";
import { RoleLegend } from "@/components/RoleTag";
import { ReadError } from "@/components/Section";
import { StatusBadge } from "@/components/StatusBadge";
import { usePoll } from "@/lib/client/use-poll";
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

export function ReserveShell({ children }: { children: ReactNode }) {
  const poll = usePoll<Data>("/api/ledger", 10_000);
  const pathname = usePathname();
  const d = poll.data;
  const covered = d ? d.reserve.solvency.stableAssets >= d.reserve.solvency.coverageRequired : null;
  return (
    <div className="flex w-full flex-1 flex-col">
      <header className="bg-(--color-canvas) z-[90] border-b lg:sticky lg:top-14" style={{ paddingLeft: "var(--section-pad-x)", paddingRight: "var(--section-pad-x)" }}>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-4 pb-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="font-display text-(--color-text) m-0 text-2xl font-bold tracking-tight">Reserve</h1>
            {covered !== null && <StatusBadge color={covered ? "var(--color-success)" : "var(--color-error)"} label={covered ? "COVERED" : "UNDER-COVERED"} />}
            {poll.updatedAt && (
              <span className="font-mono text-(--color-text-3) inline-flex items-center gap-2 text-xs">
                <span className="live-dot" aria-hidden="true" />
                live · read {new Date(poll.updatedAt).toLocaleTimeString()}
                {d ? ` · slot ${d.reserve.slot}` : ""}
              </span>
            )}
            <InfoTooltip label="About this page">
              Every number is read from the MUTAV program&apos;s on-chain accounts, refreshed every 10 seconds. No wallet needed.
            </InfoTooltip>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="hidden items-center gap-2 lg:inline-flex">
              <RoleLegend withAnyone />
              <InfoTooltip label="About the role tags">
                Each section names who wrote it: the Reserve Admin (a Squads multisig), the Operator (MUTAV&apos;s key) or the Investor (the allowlisted capital
                provider; in the pilot, MUTAV&apos;s capital wallet). Anyone can call the public instructions.
              </InfoTooltip>
            </span>
            <RefreshButton onConfirmed={poll.refresh} />
          </div>
        </div>
        <nav aria-label="Reserve views" className="scroll-dark -mb-px flex gap-1 overflow-x-auto">
          {TABS.map(([href, label]) => {
            const active = href === "/reserve" ? pathname === "/reserve" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`font-body shrink-0 border-b px-3 py-2 text-sm no-underline ${active ? "text-(--color-text) font-medium" : "text-(--color-text-2) hover:text-(--color-text) border-transparent"}`}
                style={active ? { borderBottomColor: "var(--color-accent)" } : undefined}
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
            <ReadError error={poll.error} />
          </div>
        )}
        {poll.loading && !d && (
          <p className="font-mono text-(--color-text-3) pt-6 text-xs" aria-busy="true">
            Reading the chain…
          </p>
        )}
        {d && <ReserveCtx.Provider value={{ d, refresh: poll.refresh }}>{children}</ReserveCtx.Provider>}
      </main>
    </div>
  );
}
