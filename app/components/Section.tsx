import type { ReactNode } from "react";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";

/**
 * A page section (web investidor rhythm, deck styling): amber mono caps kicker, 24px Geist ExtraBold heading,
 * optional explainer and actions; sections are separated by space, not rules.
 * `subtitle`: one line, at most ~12 words, under the heading.
 * `roles`: who signs or owns what this section shows (a RoleLine), under the heading.
 */
export function Section({ id, title, kicker, subtitle, info, children, action, roles }: { id?: string; title: string; kicker?: string; subtitle?: string; info?: string; children: ReactNode; action?: ReactNode; roles?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className="flex scroll-mt-20 flex-col gap-4 py-6 md:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          {kicker && <p className="font-mono text-(--color-accent) m-0 text-xs tracking-[0.12em] uppercase">{kicker}</p>}
          <div className="flex items-center gap-2">
            <h2 id={id ? `${id}-h` : undefined} className="font-display text-(--color-text) m-0 text-2xl tracking-tight" style={{ fontWeight: 800 }}>
              {title}
            </h2>
            {info && <InfoTooltip label={`About ${title}`}>{info}</InfoTooltip>}
          </div>
          {subtitle && <p className="font-body text-(--color-text-2) m-0 text-sm">{subtitle}</p>}
          {roles && <div className="mt-2">{roles}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * The page frame (web investidor PageShell + PageHeader + PageContent, wide):
 * content capped at the brand max-width with the shared side padding, a 36px title and a
 * 14px subtitle.
 *
 * `kicker`: the /reserve page header instead (amber kicker, display title,
 * `lede` as its subline, `aside` on the right, the decorative photo).
 *
 * `banner`: a decorative image (public path) in a bordered, centred frame at
 * low opacity, with the title in caps over it; the lede and `intro` sit
 * centred below.
 */
export function Page({ children, title, lede, banner, intro, kicker, aside }: { children: ReactNode; title: string; lede?: ReactNode; banner?: string; intro?: ReactNode; kicker?: ReactNode; aside?: ReactNode }) {
  // With a kicker: the /reserve page header (PageHeader), the lede as its subline.
  if (kicker)
    return (
      <div className="flex w-full flex-1 flex-col">
        <PageHeader kicker={kicker} title={title} sub={lede} aside={aside} />
        <main className="flex w-full flex-1 flex-col gap-4 pt-6 pb-20 md:gap-6" style={{ paddingLeft: "var(--section-pad-x)", paddingRight: "var(--section-pad-x)" }}>
          {intro}
          <div className="flex flex-col">{children}</div>
        </main>
      </div>
    );
  return (
    <main className="flex w-full flex-1 flex-col gap-4 py-6 md:gap-6 md:py-8" style={{ paddingLeft: "var(--section-pad-x)", paddingRight: "var(--section-pad-x)" }}>
      {banner ? (
        <header className="flex flex-col items-center gap-5 pb-4 text-center">
          <div className="relative flex h-[200px] w-full max-w-[960px] items-end justify-center overflow-hidden border pb-8 md:h-[280px] md:pb-12">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={banner} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover grayscale" style={{ objectPosition: "50% 55%", opacity: 0.16 }} />
            <h1 className="font-display text-(--color-text) relative m-0 px-6 font-bold uppercase" style={{ fontSize: "clamp(24px, 4.2vw, 48px)", letterSpacing: "-0.01em", lineHeight: 1.1 }}>
              {title}
            </h1>
          </div>
          {lede && <div className="font-body text-(--color-text-2) text-base-sm max-w-[720px] leading-relaxed">{lede}</div>}
          {intro && <div className="flex w-full max-w-[960px] flex-col items-center gap-3">{intro}</div>}
        </header>
      ) : (
        <header className="flex max-w-[820px] flex-col gap-2">
          <h1 className="font-display text-(--color-text) m-0 text-4xl font-bold tracking-tight">{title}</h1>
          {lede && <div className="font-body text-(--color-text-2) text-base-sm leading-relaxed">{lede}</div>}
          {intro}
        </header>
      )}
      <div className="flex flex-col">{children}</div>
    </main>
  );
}

/** Shown when a read fails: the app never invents a number to fill the gap. `onRetry` reads again now. */
export function ReadError({ error, onRetry }: { error: Error & { notConfigured?: boolean; busy?: boolean }; onRetry?: () => void }) {
  // The RPC is rate limiting: the poll backs off and retries on its own.
  if (error.busy)
    return (
      <div role="status" style={{ border: "1px solid var(--color-border)", padding: "14px 16px", background: "var(--color-surface)" }}>
        <p className="font-mono" style={{ fontSize: 12, color: "var(--color-text-2)", margin: 0 }}>
          Chain busy, retrying…
        </p>
      </div>
    );
  if (error.notConfigured)
    return (
      <div role="status" style={{ border: "1px solid var(--color-border)", padding: "14px 16px", background: "var(--color-surface)" }}>
        <p className="font-body" style={{ fontSize: 13, color: "var(--color-text-2)", margin: 0, lineHeight: 1.6 }}>
          The reserve program is being deployed to devnet. Live numbers appear here once the reserve is initialized.
        </p>
      </div>
    );
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3" style={{ border: "1px solid var(--color-error)", padding: "14px 16px", background: "var(--color-surface)" }}>
      <p className="font-body" style={{ fontSize: 12, color: "var(--color-error)", margin: 0 }}>
        Could not read the chain: {error.message}
      </p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/**
 * A panel waiting on a read the rest of the page does not need (e.g. the
 * history behind an activity feed): a small state inside the panel, in the
 * ReadError styles. Loading says what is coming; busy and failed reads show
 * ReadError (busy retries on its own; a failure offers Retry).
 */
export function ReadPending({ status, label, error, onRetry }: { status: "loading" | "busy" | "error"; label: string; error?: (Error & { notConfigured?: boolean; busy?: boolean }) | null; onRetry?: () => void }) {
  if (status === "error" && error) return <ReadError error={error} onRetry={onRetry} />;
  return (
    <div role="status" aria-busy={status === "loading"} style={{ border: "1px solid var(--color-border)", padding: "14px 16px", background: "var(--color-surface)" }}>
      <p className="font-mono" style={{ fontSize: 12, color: "var(--color-text-2)", margin: 0 }}>
        {status === "busy" ? "Chain busy, retrying…" : label}
      </p>
    </div>
  );
}
