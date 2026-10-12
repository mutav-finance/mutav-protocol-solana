"use client";

/**
 * The /reserve platform shell: one read of /api/ledger shared by every tab.
 * Page header (kicker, title, the live line and the ? that opens "How to read
 * this page"), then a sticky tab row. Each tab owns its figures; this shell
 * does not repeat them.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoneyProvider, ProvidedUsdNote } from "@/components/MoneyProvider";
import { ReadError } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { IntroDialog, introSeen } from "@/components/reserve/IntroDialog";
import { usePoll } from "@/lib/client/use-poll";
import { fmtDuration, fmtTime } from "@/lib/format";
import type { Data } from "@/components/reserve/sections/shared";

type Ctx = { d: Data; refresh: () => Promise<void> };
const ReserveCtx = createContext<Ctx | null>(null);

/** The shared /api/ledger read. Only rendered once the data is in. */
export function useReserve(): Ctx {
  const c = useContext(ReserveCtx);
  if (!c) throw new Error("useReserve outside ReserveShell");
  return c;
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
  const poll = usePoll<Data>("/api/ledger", 10_000);
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/reserve" ? pathname === "/reserve" : pathname.startsWith(href));
  const d = poll.data;
  // null until the reader opens or closes the steps: then a first visit opens them once the first read is in (they quote it).
  const [intro, setIntro] = useState<boolean | null>(null);
  const introOpen = d !== null && (intro ?? !introSeen());

  const published = d?.reserve.state.lastRefreshTs;
  const liveTitle = [
    "This page reads the chain every 10 seconds.",
    poll.updatedAt ? `Last read ${new Date(poll.updatedAt).toISOString().slice(11, 19)} UTC.` : "",
    published ? `NAV, coverage and mode were last published on-chain at ${fmtTime(published)}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <MoneyProvider>
      <div className="flex w-full flex-1 flex-col">
        <header className="bg-(--color-canvas) relative overflow-hidden" style={PAD}>
          {/* Decorative photo bleeding from the right, behind the title only (never behind numbers); hidden on phones. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/img/dashboard-header.jpg"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute top-0 right-0 hidden h-full w-[40%] border-l object-cover grayscale select-none md:block"
            style={{ objectPosition: "50% 40%", opacity: 0.12 }}
          />
          <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pt-7 pb-5">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="font-mono text-(--color-accent) text-xs uppercase" style={{ letterSpacing: "0.12em" }}>
                Reserve · Solana {d ? d.reserve.cluster : ""}
              </span>
              <h1 className="font-display text-(--color-text) m-0 leading-[1.05] uppercase" style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.02em" }}>
                Transparency
              </h1>
              <p className="font-body text-(--color-text-2) m-0 max-w-[640px] text-sm text-pretty">
                Every figure is read from the MUTAV program&apos;s on-chain accounts.
                {!pathname.startsWith("/reserve/verify") && (
                  <>
                    {" "}
                    <Link href="/reserve/verify" className="ext-link arrow-link">
                      Verify <span aria-hidden="true">→</span>
                    </Link>
                  </>
                )}
              </p>
            </div>
            <div className="font-mono text-(--color-text-3) flex items-center gap-3 text-xs">
              {d && (
                <span title={liveTitle} className="inline-flex cursor-default items-center gap-2 whitespace-nowrap">
                  <span className="live-dot" aria-hidden="true" />
                  Live · {published ? `updated on-chain ${fmtDuration(d.reserve.now - published)} ago` : "not yet updated on-chain"}
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
          </div>
        </header>
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
            <ReserveCtx.Provider value={{ d, refresh: poll.refresh }}>
              <div className="flex flex-col gap-4">
                <ProvidedUsdNote />
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
