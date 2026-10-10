"use client";

/**
 * /investment — the capital provider's page (the Investor role): send a new
 * deposit or redemption request, then follow, cancel and claim it. Everyone
 * can read it; only a wallet on the on-chain allowlist can send requests.
 * Cancels and claims need only the request's owner (spec §5.5).
 * The pilot runs on MUTAV's own capital and is not open to public investment.
 *
 * Layout: centred header, one strip of three reserve figures, the request
 * card (centred and narrow like a swap form), then the wallet's requests.
 */
import type { ReactNode } from "react";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Mono } from "@/components/Mono";
import { ReadError } from "@/components/Section";
import { LiveProvider } from "@/components/demo/shared";
import { QueueEntries } from "./QueueEntries";
import { useInvestor } from "./useInvestor";
import { fmtBrs, fmtNav } from "@/lib/format";
import type { ReserveView } from "@/lib/view";
import { RequestCard } from "./RequestCard";

/** One figure of the strip: an icon tile, a caps label with its definition, and the value. */
function Stat({ icon, label, tip, value }: { icon: ReactNode; label: string; tip: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span aria-hidden="true" className="text-(--color-text-2) inline-flex shrink-0">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="font-body text-(--color-text-2) text-[11px] font-medium whitespace-nowrap uppercase" style={{ letterSpacing: "0.01em" }}>
            {label}
          </span>
          <InfoTooltip label={`Info: ${label}`} width={240}>
            {tip}
          </InfoTooltip>
        </span>
        <Mono style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{value}</Mono>
      </span>
    </div>
  );
}

const svg = (d: string) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d={d} />
  </svg>
);

function Stats({ r }: { r: ReserveView }) {
  return (
    <div role="group" aria-label="Reserve figures" className="bg-(--color-surface) grid grid-cols-1 gap-x-6 gap-y-4 border px-5 py-4 sm:grid-cols-3">
      <Stat
        icon={svg("M3 17l6-6 4 4 8-8M15 7h6v6")}
        label="NAV per share"
        tip="Net assets (stable assets − open provisions) ÷ shares outstanding. Published on-chain at each refresh."
        value={fmtNav(r.state.navPerShare)}
      />
      <Stat
        icon={svg("M4 6h16v12H4zM4 10h16")}
        label="Stable assets"
        tip="BRS in the reserve token account. Excludes pending deposits and assets owed to filled redemptions."
        value={fmtBrs(r.solvency.stableAssets)}
      />
      <Stat
        icon={svg("M12 3v18M7 8h7a3 3 0 010 6H8a3 3 0 000 6h8")}
        label="Free capital"
        tip="Stable assets − coverage required. Redemptions are filled from it; it gates new guarantees and redemptions, never a claim payment."
        value={fmtBrs(r.solvency.freeCapital)}
      />
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Reading the chain" className="mx-auto flex w-full max-w-[560px] flex-col gap-6">
      <span className="sr-only">Reading the chain…</span>
      <div className="bg-(--color-surface) h-[72px] border" />
      <div className="bg-(--color-surface) h-[480px] border" />
    </div>
  );
}

export function InvestmentPage() {
  const { connected, owner, poll, d, inv, invData, mine, refresh } = useInvestor();
  const pad = { paddingLeft: "var(--section-pad-x)", paddingRight: "var(--section-pad-x)" };
  return (
    <main className="flex w-full flex-1 flex-col gap-6 py-8" style={pad}>
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-(--color-text) m-0 text-3xl font-bold tracking-tight">Investment</h1>
        <p className="font-body text-(--color-text-2) m-0 max-w-[60ch] text-sm text-balance">
          Deposit BRS or redeem shares through the capital queue. The pilot runs on MUTAV&apos;s own capital and is not open to public investment.
        </p>
      </header>

      {poll.error && !d && <ReadError error={poll.error} />}
      {!d && !poll.error && <Skeleton />}

      {d && (
        <LiveProvider value={{ reserve: d.reserve, ledger: d.ledger, refresh }}>
          <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6">
            <Stats r={d.reserve} />
            {inv.error && !inv.data && <ReadError error={inv.error} />}
            <RequestCard inv={invData} connected={connected} />
          </div>
          <div className="mx-auto w-full max-w-[960px]">
            <QueueEntries rows={mine} owner={owner} connected={connected} inv={invData} />
          </div>
        </LiveProvider>
      )}
    </main>
  );
}
