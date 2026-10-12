"use client";

/**
 * The /reserve platform shell: three reads shared by every tab, cheapest
 * first (lib/client/reserve-reads.ts). The page renders once /api/reserve is
 * in; panels that need /api/accounts or /api/history wait for them inside
 * the panel (`<Needs>`), so the heavy history read never blanks a page.
 * Page header (kicker, title, the live line and the ? that opens "How to read
 * this page"), then a sticky tab row. Each tab owns its figures; this shell
 * does not repeat them.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoneyProvider, UsdSource } from "@/components/MoneyProvider";
import { PageHeader } from "@/components/PageHeader";
import { ReadError, ReadPending } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { IntroDialog, introSeen } from "@/components/reserve/IntroDialog";
import { usePoll, type Poll } from "@/lib/client/use-poll";
import { composeLedger, needs, panelStatus, readStatus, type Panel, type ReadPart, type ReadStatus } from "@/lib/client/reserve-reads";
import type { LedgerAccounts, LedgerHistory, ReserveView } from "@/lib/view";
import { fmtDuration, fmtTime } from "@/lib/format";
import type { Data } from "@/components/reserve/sections/shared";

type Ctx = {
  /** The reserve, and the ledger from whichever halves are in (a missing half is empty: check `usePanel`). */
  d: Data;
  refresh: () => Promise<void>;
  reads: Record<ReadPart, ReadStatus>;
  polls: Record<ReadPart, Poll<unknown>>;
};
const ReserveCtx = createContext<Ctx | null>(null);

/** The shared reads. Only rendered once /api/reserve is in. */
export function useReserve(): Ctx {
  const c = useContext(ReserveCtx);
  if (!c) throw new Error("useReserve outside ReserveShell");
  return c;
}

/** Whether a panel's reads are in (lib/client/reserve-reads.ts: PANEL_NEEDS). */
export function usePanel(panel: Panel) {
  const { reads } = useReserve();
  const s = panelStatus(panel, reads);
  return { ...s, ready: s.status === "ready" };
}

const WAITING_LABEL: Record<ReadPart, string> = {
  reserve: "Reading the chain…",
  accounts: "Accounts loading…",
  history: "History loading…",
};

/**
 * Renders `children` once the panel's reads are in; until then, a small
 * loading or busy state inside the panel. The rest of the page never waits.
 */
export function Needs({ panel, children }: { panel: Panel; children: ReactNode }) {
  const { reads, polls } = useReserve();
  const { status, waitingOn } = panelStatus(panel, reads);
  const partial = needs(panel).includes("history") ? ((polls.history.data as LedgerHistory | null)?.fillsMissing ?? 0) : 0;
  if ((status === "ready" || !waitingOn) && partial > 0)
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="font-mono text-(--color-text-3) m-0 text-xs">
          History loading: {partial} recent {partial === 1 ? "transaction" : "transactions"} not read yet.
        </p>
        {children}
      </div>
    );
  if (status === "ready" || !waitingOn) return <>{children}</>;
  const poll = polls[waitingOn];
  return <ReadPending status={status} label={WAITING_LABEL[waitingOn]} error={poll.error} onRetry={() => void poll.refresh()} />;
}

/** The tabs, in order. `href` is the route; Overview is /reserve itself. The capital view is labelled "Money". */
export const TABS: [string, string][] = [
  ["/reserve", "Overview"],
  ["/reserve/coverage", "Coverage"],
  ["/reserve/claims", "Claims"],
  ["/reserve/capital", "Money"],
  ["/reserve/risks", "Risks"],
  ["/reserve/verify", "Verify"],
];

const PAD = { paddingLeft: "var(--section-pad-x)", paddingRight: "var(--section-pad-x)" } as const;

/** One hero-shaped block while the first read is in flight. */
function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Reading the chain" className="flex flex-col gap-4">
      <span className="sr-only">Reading the chain…</span>
      <div className="mutav-skeleton bg-(--color-surface) h-[220px] border" />
      <div className="mutav-skeleton bg-(--color-surface) h-[88px] border" />
    </div>
  );
}

export function ReserveShell({ children }: { children: ReactNode }) {
  const poll = usePoll<ReserveView>("/api/reserve", 10_000);
  const accounts = usePoll<LedgerAccounts>("/api/accounts", 10_000);
  const history = usePoll<LedgerHistory>("/api/history", 15_000);
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/reserve" ? pathname === "/reserve" : pathname.startsWith(href));
  const reads: Record<ReadPart, ReadStatus> = { reserve: readStatus(poll), accounts: readStatus(accounts), history: readStatus(history) };
  const reserve = poll.data;
  const d = useMemo<Data | null>(() => (reserve ? { reserve, ledger: composeLedger(accounts.data, history.data) } : null), [reserve, accounts.data, history.data]);
  const refreshPoll = poll.refresh;
  const refreshAccounts = accounts.refresh;
  const refreshHistory = history.refresh;
  const refresh = useCallback(async () => {
    await Promise.all([refreshPoll(), refreshAccounts(), refreshHistory()]);
  }, [refreshPoll, refreshAccounts, refreshHistory]);
  // null until the reader opens or closes the steps: then a first visit opens them once the first read is in (they quote it).
  const [intro, setIntro] = useState<boolean | null>(null);
  const introOpen = d !== null && (intro ?? !introSeen());

  const published = d?.reserve.state.lastRefreshTs;
  const liveTitle = [
    "This page reads the chain every 10 seconds.",
    poll.updatedAt ? `Last read ${new Date(poll.updatedAt).toISOString().slice(11, 19)} UTC.` : "",
    published ? `NAV, coverage and mode were last published on-chain at ${fmtTime(published)}.` : "",
    poll.busy ? "The RPC is busy: showing the last good read and retrying." : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <MoneyProvider>
      <div className="flex w-full flex-1 flex-col">
        <PageHeader
          kicker={<>Reserve · Solana {d ? d.reserve.cluster : ""}</>}
          title="Transparency"
          sub={
            <>
              Every figure is read from the MUTAV program&apos;s on-chain accounts.
              {!pathname.startsWith("/reserve/verify") && (
                <>
                  {" "}
                  <Link href="/reserve/verify" className="ext-link arrow-link">
                    Verify <span aria-hidden="true">→</span>
                  </Link>
                </>
              )}
            </>
          }
          aside={
            <div className="font-mono text-(--color-text-3) flex items-center gap-3 text-xs">
              {d && (
                <span title={liveTitle} className="inline-flex cursor-default items-center gap-2 whitespace-nowrap">
                  <span className="live-dot" aria-hidden="true" />
                  Live · {published ? `updated on-chain ${fmtDuration(d.reserve.now - published)} ago` : "not yet updated on-chain"}
                  {poll.busy ? " · chain busy, retrying" : ""}
                </span>
              )}
              <Button
                variant="secondary"
                aria-label="How to read this page"
                title="How to read this page"
                disabled={!d}
                onClick={() => setIntro(true)}
                className="bg-(--color-surface-3) text-(--color-text-2) hover:text-(--color-text) size-6 border font-body text-xs [border-color:var(--color-border)]"
              >
                ?
              </Button>
            </div>
          }
        />
        <div className="bg-(--color-canvas) sticky top-14 z-[90] border-b" style={PAD}>
          <nav aria-label="Transparency views" className="scroll-dark scroll-fade-x -mb-px flex overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {TABS.map(([href, label]) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`font-body inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm whitespace-nowrap no-underline ${active ? "text-(--color-text) border-(--color-accent) font-medium" : "text-(--color-text-2) hover:text-(--color-text) border-transparent"}`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <main id="reserve-view" className="flex w-full flex-1 flex-col gap-14 pt-10 pb-20" style={PAD}>
          {poll.error && !d && <ReadError error={poll.error} onRetry={poll.refresh} />}
          {poll.loading && !d && <Skeleton />}
          {d && (
            <ReserveCtx.Provider value={{ d, refresh, reads, polls: { reserve: poll, accounts, history } as Record<ReadPart, Poll<unknown>> }}>
              <div className="flex flex-col gap-4">
                <UsdSource />
                {/* Keyed by route so each view fades up on entry (globals.css: .mutav-view). */}
                <div key={pathname} className="mutav-view flex flex-col gap-14">
                  {children}
                </div>
              </div>
            </ReserveCtx.Provider>
          )}
        </main>
        {introOpen && <IntroDialog r={d.reserve} onClose={() => setIntro(false)} />}
      </div>
    </MoneyProvider>
  );
}
