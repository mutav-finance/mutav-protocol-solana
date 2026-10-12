"use client";

/**
 * /capital — the capital provider's page (the Investor role): send a new
 * deposit or redemption request, then follow, cancel and collect it. Everyone
 * can read it (and, in the demo, see the request form); only a wallet on the
 * on-chain allowlist can deposit, and a wallet holding shares can always
 * redeem (ADR 0023).
 * Cancels and collects need only the request's owner (spec §5.5).
 *
 * Layout: the shared page header (PageHeader, as on /reserve: kicker, title,
 * the decorative photo bleeding from the right, never behind numbers), then,
 * left-aligned at the page width like every other page, the not-open note,
 * one strip of three reserve figures, and the request card as the lead with
 * the wallet's requests beside it.
 */
import type { ReactNode } from "react";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Money, MoneyProvider, UsdSource } from "@/components/MoneyProvider";
import { Mono } from "@/components/Mono";
import { PageHeader } from "@/components/PageHeader";
import { ReadError, ReadPending } from "@/components/Section";
import { SimulationNote } from "@/components/SimulationNote";
import { CLUSTER } from "@/lib/client/env";
import { LiveProvider } from "@/components/demo/shared";
import { QueueEntries } from "./QueueEntries";
import { useInvestor } from "./useInvestor";
import { fmtSharePrice, fmtTime } from "@/lib/format";
import type { ReserveView } from "@/lib/view";
import { RequestCard } from "./RequestCard";

/** One figure of the strip: a caps label with its definition, and the value. */
function Stat({ label, tip, value }: { label: string; tip: string; value: ReactNode }) {
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

function Stats({ r }: { r: ReserveView }) {
  return (
    <div role="group" aria-label="Reserve figures" className="bg-(--color-surface-2) grid grid-cols-1 gap-x-6 gap-y-4 border px-5 py-4 sm:grid-cols-3">
      {/* The strip's labels do not wrap: the publication time goes in the definition. */}
      <Stat
        label="Share price"
        tip={`Reserve value per share, after claims set aside. Published at the last on-chain refresh, ${fmtTime(r.state.lastRefreshTs)}.`}
        value={fmtSharePrice(r.state.navPerShare)}
      />
      <Stat label="Reserve balance" tip="BRS the reserve holds now." value={<Money brs={r.coverage.stableAssets} block />} />
      <Stat label="Free capital" tip="What the reserve can use for redemptions and new guarantees." value={<Money brs={r.coverage.freeCapital} block />} />
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Reading the chain" className="flex w-full flex-col gap-6">
      <span className="sr-only">Reading the chain…</span>
      <div className="bg-(--color-surface) h-[72px] border" />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="bg-(--color-surface) h-[480px] border" />
        <div className="bg-(--color-surface) h-[240px] border" />
      </div>
    </div>
  );
}

/** Not open to public investment: the page leads with it, under the header. */
function NotOpenNote() {
  return (
    <p
      role="note"
      aria-label="Not open to public investment"
      className="font-body text-(--color-text) m-0 max-w-[72ch] py-1 pl-3 text-sm font-medium"
      style={{ borderLeft: "1px solid var(--color-copper)" }}
    >
      Pilot capital comes from MUTAV&apos;s own wallet only. The pilot is not open to public investment and nothing here is an offer. New capital needs a wallet on the on-chain allowlist; existing holders can always redeem.
    </p>
  );
}

export function InvestmentPage() {
  const { connected, owner, poll, accounts, accountsStatus, d, inv, invData, mine, refresh } = useInvestor();
  const pad = { paddingLeft: "var(--section-pad-x)", paddingRight: "var(--section-pad-x)" };
  return (
    <MoneyProvider>
    <main className="flex w-full flex-1 flex-col pb-20">
      <PageHeader
        kicker={<>Capital · Solana {CLUSTER}</>}
        title="Capital queue"
        sub="The pilot reserve's capital queue: deposits of BRS for shares and redemptions of shares for BRS, filled in order."
      />

      <div className="flex flex-col gap-6 pt-8" style={pad}>
        <NotOpenNote />
        {poll.error && !d && <ReadError error={poll.error} />}
        {!d && !poll.error && <Skeleton />}

        {d && (
          <LiveProvider value={{ reserve: d.reserve, ledger: d.ledger, refresh }}>
            <div className="flex w-full flex-col gap-6">
              <div className="flex flex-col gap-2">
                <Stats r={d.reserve} />
                <SimulationNote />
                <UsdSource />
              </div>
              {inv.error && !invData && <ReadError error={inv.error} onRetry={() => void inv.refresh()} />}
              <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
                <RequestCard inv={invData} loading={inv.loading} connected={connected} />
                {accountsStatus === "ready" ? (
                  <QueueEntries rows={mine} owner={owner} connected={connected} inv={invData} now={d.reserve.now} />
                ) : (
                  <ReadPending status={accountsStatus} label="Requests loading…" error={accounts.error} onRetry={() => void accounts.refresh()} />
                )}
              </div>
            </div>
          </LiveProvider>
        )}
      </div>
    </main>
    </MoneyProvider>
  );
}
