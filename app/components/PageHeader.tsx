import type { ReactNode } from "react";

/**
 * The page header shared by /reserve, /operator and /admin: amber mono kicker,
 * display title in caps, a subline, an optional right-hand slot, and a
 * grayscale photo bleeding in from the right at low opacity (decorative only,
 * never behind numbers; hidden on phones).
 */
export function PageHeader({ kicker, title, sub, aside }: { kicker: ReactNode; title: string; sub?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="bg-(--color-canvas) relative overflow-hidden" style={{ paddingLeft: "var(--section-pad-x)", paddingRight: "var(--section-pad-x)" }}>
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
            {kicker}
          </span>
          <h1 className="font-display text-(--color-text) m-0 leading-[1.05] uppercase" style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.02em" }}>
            {title}
          </h1>
          {sub && <p className="font-body text-(--color-text-2) m-0 max-w-[640px] text-sm text-pretty">{sub}</p>}
        </div>
        {aside}
      </div>
    </header>
  );
}
