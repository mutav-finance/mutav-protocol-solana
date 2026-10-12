/**
 * The reserve's money paths, in the deck's style. Purely presentational: no
 * figures, so nothing here mirrors the chain.
 *
 *   Guarantee fees ──▶ ┌─────────┐ ──▶ Claim payments (landlords, via PIX)
 *   (MUTAV fee split)  │ Reserve │
 *   Approved wallets ┄▶└─────────┘ ──▶ Redemptions (approved wallets)
 *
 * Amber arrows carry money in, grey arrows money out; a dashed segment is a
 * deposit waiting in line. Wide screens (lg+) read left to right; phones stack it
 * top to bottom with the inputs and outputs in two columns.
 */
import type { ReactNode } from "react";

const IN = "var(--color-accent)";
const OUT = "var(--color-text-3)";

const LABEL = "font-mono text-[11px] leading-4 uppercase tracking-[0.08em]";

const ARIA =
  "How money moves through the reserve. In: guarantee fees, after the MUTAV fee is split off, and deposits from approved wallets, which first wait in line. " +
  "Out: claim payments to landlords via PIX, and redemptions to approved wallets.";

function Node({ title, sub, children, compact }: { title: string; sub?: string; children?: ReactNode; compact?: boolean }) {
  return (
    <div className={`bg-(--color-surface) flex min-w-0 flex-1 flex-col justify-center border ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      <span className="font-body text-(--color-text) text-sm font-medium">{title}</span>
      {sub && <span className={`${LABEL} text-(--color-text-3) mt-0.5`}>{sub}</span>}
      {children}
    </div>
  );
}

/** A 1px segment: vertical on phones, horizontal from lg. */
function Segment({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <span
      className="block h-4 w-0 border-l lg:h-0 lg:w-auto lg:flex-1 lg:border-t lg:border-l-0"
      style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }}
    />
  );
}

/** Arrowhead: points down on phones, right from lg. */
function Head({ color }: { color: string }) {
  return (
    <svg width="7" height="5" viewBox="0 0 7 5" aria-hidden="true" className="shrink-0 lg:-rotate-90" style={{ fill: color }}>
      <path d="M0 0h7L3.5 5z" />
    </svg>
  );
}

/**
 * An arrow with its label: on phones the line runs down with the label beside
 * it; from lg the label sits above a horizontal line. `waiting` adds a dashed
 * lead segment (money waiting in line before it moves).
 */
function Arrow({ color, label, waiting }: { color: string; label: string; waiting?: string }) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-2 py-1 lg:w-[136px] lg:flex-col lg:items-stretch lg:gap-1 lg:px-2 lg:py-0">
      <span className="flex flex-col items-center lg:order-2 lg:flex-row">
        {waiting && <Segment color={color} dashed />}
        <Segment color={color} />
        <Head color={color} />
      </span>
      <span className="flex flex-col lg:order-1 lg:items-center lg:text-center">
        <span className={LABEL} style={{ color }}>
          {label}
        </span>
        {waiting && <span className={`${LABEL} text-(--color-text-3)`}>{waiting}</span>}
      </span>
    </div>
  );
}

export function FlowDiagram({ compact = false }: { compact?: boolean }) {
  const side = "grid grid-cols-2 gap-3 lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:justify-center lg:gap-6";
  return (
    <div role="img" aria-label={ARIA} className="flex w-full flex-col gap-4">
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        {/* Money in */}
        <div className={side}>
          <div className="flex flex-col lg:flex-row lg:items-center">
            <Node title="Guarantee fees" sub={compact ? undefined : "paid per guarantee"} compact={compact}>
              <span className={`${LABEL} text-(--color-text-3) mt-2 flex items-center gap-1.5 border-t pt-2`}>
                <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true" className="shrink-0" style={{ fill: "none", stroke: OUT, strokeWidth: 1 }}>
                  <path d="M1 0v5h7M6 3l2 2-2 2" />
                </svg>
                MUTAV fee split off
              </span>
            </Node>
            <Arrow color={IN} label="Net fees" />
          </div>
          <div className="flex flex-col lg:flex-row lg:items-center">
            <Node title="Approved wallets" sub={compact ? undefined : "on the allowlist"} compact={compact} />
            <Arrow color={IN} label="Deposits" waiting="waiting in line" />
          </div>
        </div>

        {/* The reserve */}
        <div
          className={`flex flex-col items-center justify-center border text-center lg:w-[200px] lg:shrink-0 ${compact ? "px-4 py-4" : "px-5 py-6"}`}
          style={{ borderColor: IN, background: "color-mix(in oklch, var(--color-accent) 12%, var(--color-canvas))" }}
        >
          <span className="font-display text-(--color-text) text-lg uppercase" style={{ fontWeight: 800, letterSpacing: "-0.01em" }}>
            Reserve
          </span>
          {!compact && <span className={`${LABEL} text-(--color-text-2) mt-1`}>held on-chain by the program</span>}
        </div>

        {/* Money out */}
        <div className={side}>
          <div className="flex flex-col lg:flex-row lg:items-center">
            <Arrow color={OUT} label="Paid out" />
            <Node title="Claim payments" sub="landlords, via PIX" compact={compact} />
          </div>
          <div className="flex flex-col lg:flex-row lg:items-center">
            <Arrow color={OUT} label="Redeemed" />
            <Node title="Redemptions" sub="approved wallets" compact={compact} />
          </div>
        </div>
      </div>

      {!compact && (
        <div className={`${LABEL} text-(--color-text-3) flex flex-wrap gap-x-5 gap-y-1`}>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-5 border-t" style={{ borderColor: IN }} /> Money in
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-5 border-t" style={{ borderColor: OUT }} /> Money out
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-5 border-t border-dashed" style={{ borderColor: IN }} /> Waiting in line
          </span>
        </div>
      )}
    </div>
  );
}
