"use client";

/**
 * The /reserve platform shell: one read of /api/ledger shared by every tab,
 * a compact header (views menu, status, live read), a persistent stats
 * strip linking to the views, and a side menu of the views. Each view is its
 * own route under /reserve.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Button } from "@/components/ui/button";
import { ReadError } from "@/components/Section";
import { StatusBadge } from "@/components/StatusBadge";
import { usePoll } from "@/lib/client/use-poll";
import { Mono } from "@/components/Mono";
import { fmtBrs, fmtShares, fmtTime } from "@/lib/format";
import { activeRemainingCover, agencyRows, capitalQueue, coverageRows, moneyFlows } from "@/lib/view";
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

/**
 * Persistent stats strip, on every view: figures that complement Health (which
 * owns ratio, stable assets, coverage required, free capital and NAV). Each cell
 * links to the view that details it. Sums of the shared read only.
 */
function StatsStrip({ d }: { d: Data }) {
  const r = d.reserve;
  const l = d.ledger;
  const rows = coverageRows(l.guarantees);
  const agencies = agencyRows(l.exposures, r.config.caps.maxCoverPerAgency);
  const { totals } = moneyFlows(r.state, l);
  // Earned net: guarantee fees net + issuer income net − claim payments (capital moves are not earnings). Same as Flows.
  const earned = totals.feesNetToReserve + totals.incomeNetToReserve - totals.claimsPaid;
  const q = capitalQueue(r.state, l);
  const pendingDeposits = q.deposits.reduce((s, x) => s + x.waiting, 0n);
  const pendingShares = q.redeems.reduce((s, x) => s + x.waiting, 0n);
  const groups: { name: string; span: string; cells: [string, string, string, string][] }[] = [
    {
      name: "Cover",
      span: "lg:col-span-3",
      cells: [
        ["/reserve/coverage", "Remaining cover", fmtBrs(activeRemainingCover(rows)), "active guarantees"],
        ["/reserve/coverage", "Active guarantees", String(r.state.activeGuarantees), "registered, not closed"],
        ["/reserve/coverage", "Agencies", String(agencies.length), "with exposure"],
      ],
    },
    { name: "Claims", span: "lg:col-span-1", cells: [["/reserve/claims", "Claims paid", fmtBrs(r.state.claimsPaidTotal), "lifetime"]] },
    {
      name: "Money",
      span: "lg:col-span-2",
      cells: [
        ["/reserve/flows", "Earned net", `${earned >= 0n ? "+" : "−"}${fmtBrs(earned < 0n ? -earned : earned)}`, "fees + income − claims"],
        ["/reserve/queue", "In the queue", fmtBrs(pendingDeposits), `deposits · ${fmtShares(pendingShares)} shares to redeem`],
      ],
    },
  ];
  // Grouped by what the figures are about; each cell links to the view that details it.
  return (
    <nav aria-label="Reserve figures" className="-mx-px mb-4 grid grid-cols-1 gap-px border lg:grid-cols-6" style={{ background: "var(--color-border)" }}>
      {groups.map((g) => (
        <div key={g.name} className={`flex flex-col gap-px ${g.span}`}>
          <span className="bg-(--color-canvas) font-mono text-(--color-text-3) px-4 py-1.5 text-2xs uppercase" style={{ letterSpacing: "0.08em" }}>
            {g.name}
          </span>
          <div className="grid flex-1 gap-px" style={{ gridTemplateColumns: `repeat(${g.cells.length}, minmax(0, 1fr))` }}>
            {g.cells.map(([href, label, value, note]) => (
              <Link key={label} href={href} className="group bg-(--color-surface) hover:bg-(--color-surface-2) flex min-w-0 flex-col gap-1 px-4 py-3 no-underline">
                <span className="font-body text-(--color-text-2) flex items-center justify-between gap-2 text-xs font-medium uppercase" style={{ letterSpacing: "0.01em" }}>
                  {label}
                  <span aria-hidden="true" className="text-(--color-text-3) group-hover:text-(--color-accent)">→</span>
                </span>
                <Mono style={{ fontSize: "clamp(14px, 3.6vw, 17px)", fontWeight: 700, color: "var(--color-text)", whiteSpace: "nowrap" }}>{value}</Mono>
                <span className="font-mono text-(--color-text-3) truncate text-2xs">{note}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Static placeholders in the shape of the strip and the lead tile, while the first read is in flight. */
function Skeleton() {
  const block = (cls: string) => <div className={`bg-(--color-surface) border ${cls}`} />;
  return (
    <div aria-busy="true" aria-label="Reading the chain" className="flex flex-col gap-4 pt-6">
      <span className="sr-only">Reading the chain…</span>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <div key={i}>{block("h-[76px]")}</div>)}</div>
      {block("h-[220px]")}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i}>{block("h-[120px]")}</div>)}</div>
    </div>
  );
}

export function ReserveShell({ children }: { children: ReactNode }) {
  const poll = usePoll<Data>("/api/ledger", 10_000);
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const isActive = (href: string) => (href === "/reserve" ? pathname === "/reserve" : pathname.startsWith(href));
  const current = TABS.find(([href]) => isActive(href))?.[1];
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu]);
  const d = poll.data;
  const covered = d ? d.reserve.solvency.stableAssets >= d.reserve.solvency.coverageRequired : null;
  return (
    <div className="flex w-full flex-1 flex-col">
      <header className="bg-(--color-canvas) z-[90] border-b" style={{ paddingLeft: "var(--section-pad-x)", paddingRight: "var(--section-pad-x)" }}>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-4 pb-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button
              type="button"
              variant="ghost"
              aria-label="Open transparency menu"
              aria-expanded={menu}
              aria-controls="reserve-menu"
              onClick={() => setMenu(true)}
              style={{ width: 40, height: 40, border: "1px solid var(--color-border)", color: "var(--color-text-2)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" style={{ width: 18, height: 18 }}>
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </Button>
            <h1 className="font-display text-(--color-text) m-0 text-2xl font-bold tracking-tight">
              Transparency
              {current && current !== "Overview" && <span className="text-(--color-text-3) font-normal"> / {current}</span>}
            </h1>
            {covered !== null && <StatusBadge color={covered ? "var(--color-success)" : "var(--color-error)"} label={covered ? "COVERED" : "UNDER-COVERED"} />}
            {/* The live line and its ⓘ wrap as one unit, so the ⓘ is never left alone on a line. */}
            <span className="font-mono text-(--color-text-3) inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {poll.updatedAt && (
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <span className="live-dot" aria-hidden="true" />
                  live · page read {new Date(poll.updatedAt).toISOString().slice(11, 19)} UTC
                </span>
              )}
              {d && <span className="whitespace-nowrap">· NAV published {fmtTime(d.reserve.state.lastRefreshTs)}</span>}
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                <InfoTooltip label="About this page" width={280}>
                  Every number is read from the MUTAV program&apos;s on-chain accounts, every 10 seconds; no wallet needed. &ldquo;Page read&rdquo; is when this page last read
                  the chain; &ldquo;NAV published&rdquo; is when NAV, coverage and mode were last published on-chain.
                </InfoTooltip>
              </span>
            </span>
          </div>
        </div>
        {d && <StatsStrip d={d} />}
      </header>
      {menu && (
        <div className="fixed inset-0 z-[160]" onClick={() => setMenu(false)} style={{ background: "color-mix(in oklab, var(--color-canvas) 70%, transparent)" }}>
          <nav
            id="reserve-menu"
            aria-label="Transparency views"
            onClick={(e) => e.stopPropagation()}
            className="bg-(--color-surface) absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r"
          >
            <div className="flex h-14 items-center justify-between border-b px-4">
              <span className="font-display text-(--color-text) text-base font-bold">Transparency</span>
              <Button type="button" variant="ghost" aria-label="Close transparency menu" onClick={() => setMenu(false)} style={{ width: 36, height: 36, color: "var(--color-text-2)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" style={{ width: 16, height: 16 }}>
                  <path d="M5 5l14 14M19 5L5 19" />
                </svg>
              </Button>
            </div>
            <ul className="m-0 flex flex-col p-0 py-2">
              {TABS.map(([href, label]) => {
                const active = isActive(href);
                return (
                  <li key={href} className="list-none">
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMenu(false)}
                      className={`font-body flex min-h-11 items-center px-4 text-sm no-underline ${active ? "text-(--color-text) bg-(--color-surface-2) font-medium" : "text-(--color-text-2) hover:text-(--color-text) hover:bg-(--color-surface-2)"}`}
                      style={{ borderLeft: `1px solid ${active ? "var(--color-accent)" : "transparent"}` }}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}
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
