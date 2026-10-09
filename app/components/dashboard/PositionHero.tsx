"use client";

/**
 * The hero: one number (the wallet's total in the reserve, a preview at the
 * current NAV), then one composition bar that says where it sits: held as
 * shares, waiting in the queue, or ready to claim. The bar replaces the old
 * empty history chart: the chain keeps no balance history, so there is no
 * time series to draw (ui-reference §2 Charts: "show the composition bar and
 * no fake time series").
 */
import type { ReactNode } from "react";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Mono } from "@/components/Mono";
import { fmtBps, fmtBrs, fmtShares } from "@/lib/format";
import type { InvestorView } from "@/lib/server/investor";
import { LABEL, TRACKING, type Position } from "./shared";

/** The three places a position sits. Greys plus the success green that also marks READY TO CLAIM rows; no amber. */
const LEGEND = [
  { key: "held", name: "Shares held", color: "var(--color-text)" },
  { key: "queued", name: "In the queue", color: "var(--color-text-3)" },
  { key: "ready", name: "Ready to claim", color: "var(--color-success)" },
] as const;

type Part = (typeof LEGEND)[number] & { value: bigint; note: string };

function parts(p: Position, inv: InvestorView): Part[] {
  const [held, queued, ready] = LEGEND;
  return [
    { ...held, value: p.held, note: inv.shares.amount === null ? "no share account yet" : `${fmtShares(p.shares)} sh · ${fmtBps(p.ownBps)} of all shares` },
    { ...queued, value: p.queued, note: `${fmtBrs(p.depositsWaiting)} deposits · ${fmtShares(p.redeemSharesWaiting)} sh to redeem` },
    { ...ready, value: p.ready, note: p.ready > 0n ? "claim it in the panel" : "nothing to claim" },
  ];
}

/** 100% bar, flat fills, 1px outline (ui-reference pattern 5). Empty frame when there is nothing to split. */
function CompositionBar({ items, total }: { items: Part[] | null; total: bigint }) {
  const shown = items && total > 0n ? items.filter((x) => x.value > 0n) : [];
  return (
    <div className="flex h-3 w-full border" role="img" aria-label={shown.length ? `Position split: ${shown.map((x) => `${x.name} ${fmtBrs(x.value)}`).join(", ")}` : "No position yet"}>
      {shown.map((x) => (
        <span key={x.key} style={{ width: `${Number((x.value * 10_000n) / total) / 100}%`, background: x.color }} />
      ))}
    </div>
  );
}

export function PositionHero({ position, inv, owner, asOf, error }: { position: Position | null; inv: InvestorView | null; owner: string | null; asOf: number | null; error?: ReactNode }) {
  const known = position !== null && inv !== null;
  const items = known ? parts(position, inv) : null;
  const sub = !owner ? "Connect a wallet to see its position." : "Total in the reserve, valued at the current NAV.";
  return (
    <section aria-labelledby="pos-h" className="bg-(--color-surface) flex min-w-0 flex-col gap-6 border p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <h2 id="pos-h" className={`${LABEL} m-0`} style={TRACKING}>
            Your position
          </h2>
          <InfoTooltip label="About your position">
            Shares held, deposits and shares waiting in the queue, and anything ready to claim, valued at the current NAV with the client&apos;s math mirror of the
            program&apos;s assets_for. Fills settle at the NAV of their moment.
          </InfoTooltip>
          <span className="font-mono text-(--color-text-3) text-2xs uppercase" style={{ letterSpacing: "0.08em" }}>
            preview
          </span>
        </span>
        {asOf !== null && (
          <span className="font-mono text-(--color-text-3) inline-flex items-center gap-2 text-xs whitespace-nowrap">
            <span className="live-dot" aria-hidden="true" />
            as of {new Date(asOf).toISOString().slice(11, 19)} UTC
          </span>
        )}
      </header>

      {error ?? (
        <>
          <div className="flex flex-col gap-2">
            <Mono style={{ fontSize: "clamp(32px, 8vw, 48px)", fontWeight: 700, lineHeight: 1, color: "var(--color-text)", whiteSpace: "nowrap" }}>
              {known ? fmtBrs(position.total) : "—"}
            </Mono>
            <p className="font-body text-(--color-text-2) m-0 text-sm">{sub}</p>
          </div>

          <div className="flex flex-col gap-3">
            <CompositionBar items={items} total={position?.total ?? 0n} />
            {/* Legend as one strip: swatch, label, amount, one sub-line (ui-reference §2 metric groups). */}
            <dl className="m-0 grid grid-cols-1 gap-px border sm:grid-cols-3" style={{ background: "var(--color-border)" }}>
              {LEGEND.map((l, i) => {
                const x = items?.[i];
                return (
                  <div key={l.key} className="bg-(--color-surface) flex min-w-0 flex-col gap-1 px-4 py-3">
                    <dt className="font-body text-(--color-text-2) flex items-center gap-2 text-xs">
                      <span aria-hidden="true" style={{ width: 8, height: 8, flexShrink: 0, background: l.color }} />
                      {l.name}
                    </dt>
                    <dd className="m-0 flex flex-col gap-1">
                      <Mono style={{ fontSize: "clamp(16px, 4vw, 20px)", fontWeight: 700, lineHeight: 1.1, color: "var(--color-text)", whiteSpace: "nowrap" }}>
                        {x ? fmtBrs(x.value) : "—"}
                      </Mono>
                      <span className="font-mono text-(--color-text-3) truncate text-2xs" title={x?.note}>
                        {x?.note ?? "—"}
                      </span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </>
      )}
    </section>
  );
}
