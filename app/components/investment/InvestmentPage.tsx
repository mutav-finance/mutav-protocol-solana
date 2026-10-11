"use client";

/**
 * /investment — the capital provider's page (the Investor role): send a new
 * deposit or redemption request, then follow, cancel and claim it. Everyone
 * can read it; only a wallet on the on-chain allowlist can send requests.
 * Cancels and claims need only the request's owner (spec §5.5).
 *
 * Layout: centred header, one strip of three reserve figures, then the
 * request card on the left as the lead and the wallet's requests beside it.
 */
import type { ReactNode } from "react";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Mono } from "@/components/Mono";
import { ReadError } from "@/components/Section";
import { LiveProvider } from "@/components/demo/shared";
import { QueueEntries } from "./QueueEntries";
import { useInvestor } from "./useInvestor";
import { fmtNav } from "@/lib/format";
import { useMoney, type Money } from "@/lib/client/use-money";
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

function Stats({ r, money }: { r: ReserveView; money: Money }) {
  const usd = money.rate ? ` Shown in dollars at ${money.rate}; BRS is valued at par to BRL.` : "";
  return (
    <div role="group" aria-label="Reserve figures" className="bg-(--color-surface-2) grid grid-cols-1 gap-x-6 gap-y-4 border px-5 py-4 sm:grid-cols-3">
      <Stat
        icon={svg("M3 17l6-6 4 4 8-8M15 7h6v6")}
        label="NAV per share"
        tip="Net assets (stable assets − open provisions) ÷ shares outstanding. Published on-chain at each refresh."
        value={fmtNav(r.state.navPerShare)}
      />
      <Stat
        icon={svg("M4 6h16v12H4zM4 10h16")}
        label="Stable assets"
        tip={`BRS in the reserve token account. Excludes pending deposits and assets owed to filled redemptions.${usd}`}
        value={money.fmt(r.solvency.stableAssets)}
      />
      <Stat
        icon={svg("M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6")}
        label="Free capital"
        tip={`Stable assets − coverage required. Redemptions are filled from it; it gates new guarantees and redemptions, never a claim payment.${usd}`}
        value={money.fmt(r.solvency.freeCapital)}
      />
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Reading the chain" className="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
      <span className="sr-only">Reading the chain…</span>
      <div className="bg-(--color-surface) h-[72px] border" />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="bg-(--color-surface) h-[480px] border" />
        <div className="bg-(--color-surface) h-[240px] border" />
      </div>
    </div>
  );
}

export function InvestmentPage() {
  const { connected, owner, poll, d, inv, invData, mine, refresh } = useInvestor();
  const money = useMoney();
  const pad = { paddingLeft: "var(--section-pad-x)", paddingRight: "var(--section-pad-x)" };
  return (
    <main className="flex w-full flex-1 flex-col gap-6 py-8" style={pad}>
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-(--color-text) m-0 text-3xl font-bold tracking-tight">Investment</h1>
        <p className="font-body text-(--color-text-2) m-0 max-w-[60ch] text-sm text-balance">
          Deposit BRS or redeem shares through the capital queue.
        </p>
      </header>

      {poll.error && !d && <ReadError error={poll.error} />}
      {!d && !poll.error && <Skeleton />}

      {d && (
        <LiveProvider value={{ reserve: d.reserve, ledger: d.ledger, refresh }}>
          <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
            <Stats r={d.reserve} money={money} />
            {inv.error && !inv.data && <ReadError error={inv.error} />}
            <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
              <RequestCard inv={invData} connected={connected} money={money} />
              <QueueEntries rows={mine} owner={owner} connected={connected} inv={invData} money={money} now={d.reserve.now} />
            </div>
          </div>
        </LiveProvider>
      )}
    </main>
  );
}
