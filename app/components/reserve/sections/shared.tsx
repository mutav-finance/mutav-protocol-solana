"use client";

/** Helpers shared by the /reserve sections. */
import type { ReactNode } from "react";
import { Mono } from "@/components/Mono";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Money, UsdHint } from "@/components/MoneyProvider";
import { capacityLeft, type CeilingBlock, type CoverageCeiling } from "@/lib/charts";
import type { Ledger, ReserveView } from "@/lib/view";

/** What /api/ledger returns. */
export type Data = { reserve: ReserveView; ledger: Ledger };

export const short = (hex: string) => `${hex.slice(0, 8)}…`;

/** "1 claim", "3 claims"; pass `many` for irregular plurals. */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const abs = (v: bigint) => (v < 0n ? -v : v);

/** A movement with its sign: "+R$ 10.00", "−R$ 4.00". */
export const signed = (v: bigint, fmt: (b: bigint) => string) => `${v >= 0n ? "+" : "−"}${fmt(abs(v))}`;

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="font-body" style={{ fontSize: 13, color: "var(--color-text-3)", margin: 0, padding: "14px 0" }}>
      {children}
    </p>
  );
}

/**
 * A data table. `tips` adds an ⓘ to the named column headers (what the column
 * means, in one or two sentences). `className` goes on the <table> (e.g. a
 * phone layout such as `claims-table`).
 */
export function Table({ head, children, label, tips = {}, className = "" }: { head: (string | [string, "num"])[]; children: ReactNode; label: string; tips?: Record<string, string>; className?: string }) {
  const cell = (name: string) =>
    tips[name] ? (
      <span className="inline-flex items-center gap-1.5">
        {name}
        <InfoTooltip label={`About ${name}`} width={240}>{tips[name]}</InfoTooltip>
      </span>
    ) : (
      name
    );
  return (
    <div className="table-wrap scroll-dark">
      <table className={`data-table ${className}`} aria-label={label}>
        <thead>
          <tr>
            {head.map((h) => (Array.isArray(h) ? <th key={h[0]} className="num">{cell(h[0])}</th> : <th key={h}>{cell(h)}</th>))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** A right-aligned figure cell; `label` names it where a phone layout drops the header row. */
export const Num = ({ children, color, label }: { children: ReactNode; color?: string; label?: string }) => (
  <td className="num" data-label={label}>
    <Mono style={color ? { color } : undefined}>{children}</Mono>
  </td>
);

/** Splits a formatted amount into currency sign, whole part and decimals: "R$ ", "28,300", ".00". */
export function moneyParts(s: string): [string, string, string] {
  const m = /^([^\d]*)(\d[\d,.\s]*?)([.,]\d{2})?([^\d]*)$/.exec(s);
  if (!m) return ["", s, ""];
  return [m[1] ?? "", m[2] ?? "", `${m[3] ?? ""}${m[4] ?? ""}`];
}

/**
 * A tab's hero figure: an uppercase display phrase, the amount in the display
 * face at weight 800 (a deliberate exception to mono, for the hero only) with
 * the sign and decimals at 0.55em in text-2, then a context line after a 1px
 * rule. One amber hero per view; the others pass `color` text. `usd` (the
 * BRS amount behind `value`) adds the small US$ hint under it when a rate is set.
 */
export function HeroAmount({ value, ...rest }: HeroProps & { value: string; usd?: bigint }) {
  return <Hero parts={moneyParts(value)} {...rest} />;
}

/**
 * A tab's hero figure as a percentage ("18.2%"): the same typography as
 * {@link HeroAmount}, with the "%" at 0.55em in text-2 like the decimals.
 */
export function HeroPercent({ value, ...rest }: HeroProps & { value: string }) {
  const pct = value.endsWith("%");
  return <Hero parts={["", pct ? value.slice(0, -1) : value, pct ? "%" : ""]} {...rest} />;
}

type HeroProps = { phrase: string; tip?: ReactNode; color?: string; size?: string; children?: ReactNode };

function Hero({ phrase, tip, parts: [sign, whole, small], usd, color = "var(--color-text)", size = "clamp(40px, 5vw, 60px)", children }: HeroProps & { parts: [string, string, string]; usd?: bigint }) {
  const minor = { fontSize: "0.55em", color: "var(--color-text-2)", letterSpacing: 0 } as const;
  return (
    <div className="flex flex-col gap-3">
      <span className="inline-flex items-center gap-1.5">
        <span className="font-display text-(--color-text) text-[15px] font-extrabold uppercase" style={{ letterSpacing: "0.02em" }}>
          {phrase}
        </span>
        {tip && (
          <InfoTooltip label={`Info: ${phrase}`} width={240}>
            {tip}
          </InfoTooltip>
        )}
      </span>
      <span className="font-display" style={{ fontVariantNumeric: "tabular-nums", fontSize: size, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.03em", color, overflowWrap: "anywhere" }}>
        {sign && <span style={minor}>{sign}</span>}
        {whole}
        {small && <span style={minor}>{small}</span>}
        {usd !== undefined && <UsdHint brs={usd} block />}
      </span>
      {children && <div className="flex max-w-[640px] items-baseline gap-2.5 border-t pt-3 text-sm">{children}</div>}
    </div>
  );
}

/** Seconds in plain words: "5 days", "3 hours", "12 minutes". */
export function fmtSpan(secs: bigint): string {
  const s = secs < 0n ? 0n : secs;
  const unit = (n: bigint, one: string) => `${n} ${one}${n === 1n ? "" : "s"}`;
  if (s >= 86_400n) return unit(s / 86_400n, "day");
  if (s >= 3_600n) return unit(s / 3_600n, "hour");
  if (s >= 60n) return unit(s / 60n, "minute");
  return "under a minute";
}

/** How long before `now` a timestamp was: "5 days ago", "just now". */
export const fmtAgo = (now: bigint, at: bigint) => (now - at < 60n ? "just now" : `${fmtSpan(now - at)} ago`);

/**
 * Block heading inside a tab. One style for every block: a plain heading, an
 * optional one-line note under it, an optional control on the right.
 */
export function BlockHead({ id, title, note, aside }: { id?: string; title: ReactNode; note?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="flex max-w-[720px] min-w-0 flex-col gap-1">
        <h3 id={id} className="font-display text-(--color-text) m-0 text-base font-bold">
          {title}
        </h3>
        {note && <p className="font-body text-(--color-text-2) m-0 text-sm leading-relaxed">{note}</p>}
      </div>
      {aside}
    </div>
  );
}

/** Helper text with a bold lead: the first phrase in text colour, the rest in text-2. */
export function Lead({ lead, children, className = "text-[13px]" }: { lead: string; children?: ReactNode; className?: string }) {
  return (
    <span className={`font-body text-(--color-text-2) leading-relaxed text-pretty ${className}`}>
      <span className="text-(--color-text) font-semibold">{lead}</span>
      {children ? <> {children}</> : null}
    </span>
  );
}

/**
 * Mount-only motion for bars, compositor-only (transform). `.mv-grow` grows
 * one bar from its left edge; `.mv-grow-bars` does the same for the chart
 * bars inside it (right-aligned tracks grow from the right). Off under
 * reduced motion.
 */
const MOTION_CSS = `
@keyframes mv-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.mv-grow, .mv-grow-bars .chart-bar { transform-origin: left center; animation: mv-grow 400ms cubic-bezier(0.2, 0, 0, 1) both; }
.mv-grow-bars [style*="flex-end"] > .chart-bar { transform-origin: right center; }
@media (prefers-reduced-motion: reduce) { .mv-grow, .mv-grow-bars .chart-bar { animation: none; } }
`;

/** Render once per view that uses `.mv-grow`; React hoists and dedupes it by `href`. */
export function MotionStyle() {
  return (
    <style href="mv-reserve-motion" precedence="default">
      {MOTION_CSS}
    </style>
  );
}

/** The "+" of an expander: turns 45° (into a ×) when open. Inside a `group` <details>, leave `open` unset. */
export function PlusMark({ open }: { open?: boolean }) {
  const turn = open === undefined ? "group-open:rotate-45" : open ? "rotate-45" : "";
  return (
    <span aria-hidden="true" className={`font-mono text-(--color-text-3) inline-block w-3 text-center transition-transform duration-150 motion-reduce:transition-none ${turn}`}>
      +
    </span>
  );
}


/** Why no new guarantee fits right now, in plain words. */
export const CEILING_BLOCK: Record<CeilingBlock, string> = {
  paused: "the program is paused",
  "under-covered": "the reserve is under-covered",
  frozen: "the reserve token account is frozen",
  provisions: "claims set aside exceed the reserve",
};

/** "The reserve can back up to R$ X of remaining cover · R$ Y guaranteed today · R$ Z free for new leases (N% of capacity)", from {@link CoverageCeiling}. */
export function CapacityLine({ k }: { k: CoverageCeiling }) {
  const fig = { fontVariantNumeric: "tabular-nums", color: "var(--color-text)" } as const;
  return (
    <span className="font-body text-(--color-text-2) leading-relaxed text-pretty">
      The reserve can back up to{" "}
      <Mono style={fig}>
        <Money brs={k.ceiling} />
      </Mono>{" "}
      of remaining cover ·{" "}
      <Mono style={fig}>
        <Money brs={k.inUse} />
      </Mono>{" "}
      guaranteed today ·{" "}
      <Mono style={fig}>
        <Money brs={k.headroom} />
      </Mono>{" "}
      free for new leases ({capacityLeft(k)} of capacity){k.blockedBy ? ` while ${CEILING_BLOCK[k.blockedBy]}` : ""}.
    </span>
  );
}
