"use client";

/**
 * /investment — the capital provider's page (the Investor role): send a new
 * deposit or redemption request, then follow, cancel and collect it. Everyone
 * can read it; only a wallet on the on-chain allowlist can send requests.
 * Cancels and collects need only the request's owner (spec §5.5).
 *
 * Layout: a left-aligned header with a decorative photo bleeding from the
 * right (never behind numbers), one strip of three reserve figures, then the
 * request card on the left as the lead and the wallet's requests beside it.
 */
import { NAV_SCALE } from "@mutav-finance/mutav-protocol-solana";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Mono } from "@/components/Mono";
import { ReadError } from "@/components/Section";
import { LiveProvider } from "@/components/demo/shared";
import { QueueEntries } from "./QueueEntries";
import { useInvestor } from "./useInvestor";
import { fmtUnits } from "@/lib/format";
import { useMoney, type Money } from "@/lib/client/use-money";
import type { ReserveView } from "@/lib/view";
import { RequestCard } from "./RequestCard";

/** NAV per share as a share price in BRS, 4 places: `1.3240 BRS`. */
function sharePrice(nav: bigint): string {
  if (nav === 0n) return "—";
  return `${fmtUnits(nav, NAV_SCALE.toString().length - 1, 4)} BRS`;
}

/** One figure of the strip: a caps label with its definition, and the value. */
function Stat({ label, tip, value }: { label: string; tip: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="inline-flex items-center gap-1.5">
        <span className="font-body text-(--color-text-2) text-[11px] font-medium whitespace-nowrap uppercase" style={{ letterSpacing: "0.01em" }}>
          {label}
        </span>
        <InfoTooltip label={`Info: ${label}`} width={240}>
          {tip}
        </InfoTooltip>
      </span>
      <Mono style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{value}</Mono>
    </div>
  );
}

function Stats({ r, money }: { r: ReserveView; money: Money }) {
  const usd = money.rate ? ` Shown in dollars at ${money.rate}.` : "";
  return (
    <div role="group" aria-label="Reserve figures" className="bg-(--color-surface-2) grid grid-cols-1 gap-x-6 gap-y-4 border px-5 py-4 sm:grid-cols-3">
      <Stat label="Share price" tip="Reserve value after claims set aside, per share." value={sharePrice(r.state.navPerShare)} />
      <Stat label="Reserve balance" tip={`BRS the reserve holds now.${usd}`} value={money.fmt(r.solvency.stableAssets)} />
      <Stat label="Free capital" tip={`What the reserve can use for redemptions and new guarantees.${usd}`} value={money.fmt(r.solvency.freeCapital)} />
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

/** Page header: amber mono kicker, display title and lede, left-aligned; a grayscale photo bleeds in from the right. */
function Header() {
  const pad = { paddingLeft: "var(--section-pad-x)", paddingRight: "var(--section-pad-x)" };
  return (
    <header className="relative overflow-hidden py-8" style={pad}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/img/dashboard-header.jpg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-0 hidden h-full w-[45%] object-cover grayscale md:block"
        style={{ opacity: 0.14 }}
      />
      <div className="relative mx-auto flex w-full max-w-[1040px] flex-col gap-3">
        <span className="font-mono text-(--color-accent) text-xs uppercase tracking-[0.12em]">Capital queue</span>
        <h1
          className="font-display text-(--color-text) m-0 uppercase md:max-w-[50%]"
          style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.05 }}
        >
          Investment
        </h1>
        <p className="font-body text-(--color-text-2) m-0 max-w-[60ch] text-sm md:max-w-[50%]">Deposit BRS for shares. Redeem shares for BRS. Requests fill in order.</p>
      </div>
    </header>
  );
}

export function InvestmentPage() {
  const { connected, owner, poll, d, inv, invData, mine, refresh } = useInvestor();
  const money = useMoney();
  const pad = { paddingLeft: "var(--section-pad-x)", paddingRight: "var(--section-pad-x)" };
  return (
    <main className="flex w-full flex-1 flex-col pb-8">
      <Header />

      <div className="flex flex-col gap-6" style={pad}>
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
      </div>
    </main>
  );
}
