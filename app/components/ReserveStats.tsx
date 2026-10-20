"use client";

/**
 * The live reserve figures for the tool pages (/operator, /admin), labelled
 * as on the /reserve Overview: BRS first with the US$ hint, the published
 * share price, and the mode as a status badge. Needs a MoneyProvider above it
 * for the hints. `badges` go before the mode badge; `sticky` pins the strip
 * under the nav from tablet up, so a send and its effect stay in one view.
 */
import type { ReactNode } from "react";
import { MetricCard } from "@/components/MetricCard";
import { Money, UsdSource } from "@/components/MoneyProvider";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtSharePrice, fmtTime } from "@/lib/format";
import { MODE_LABEL, type ReserveView } from "@/lib/view";

export function ReserveStats({ r, badges, sticky = false }: { r: ReserveView; badges?: ReactNode; sticky?: boolean }) {
  const s = r.state;
  const covered = s.mode === 0;
  return (
    <div data-testid="reserve-stats" className={`bg-(--color-canvas) flex flex-col gap-3 pt-2 pb-4 ${sticky ? "z-50 border-b md:sticky md:top-14" : ""}`}>
      <div className="flex flex-wrap items-center gap-2.5">
        {badges}
        <StatusBadge bordered color={covered ? "var(--color-success)" : "var(--color-error)"} label={`MODE · ${covered ? "NORMAL" : "UNDER-COVERED"}`} ariaLabel={`Mode: ${MODE_LABEL(s.mode)}`} />
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <MetricCard dense label="Reserve balance" tooltip="BRS in the reserve token account." value={<Money brs={r.coverage.stableAssets} block />} />
        <MetricCard dense label="Coverage required" tooltip="What the reserve must hold for the cover outstanding." value={<Money brs={r.coverage.coverageRequired} block />} />
        <MetricCard dense label="Free capital" tooltip="Free for new guarantees and redemptions." value={<Money brs={r.coverage.freeCapital} block />} />
        <MetricCard dense label="Set aside for claims" tooltip="For claims filed, not yet paid." value={<Money brs={s.provisions} block />} />
        <MetricCard
          dense
          label="Share price"
          tooltip="What each share is worth, after claims are set aside. Published by refresh; Refresh on-chain publishes a new one."
          value={fmtSharePrice(s.navPerShare)}
          unit={`published ${fmtTime(s.lastRefreshTs)}`}
        />
      </div>
      <UsdSource />
    </div>
  );
}
