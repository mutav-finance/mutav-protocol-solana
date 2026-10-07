import type { ReactNode } from "react";
import { InfoTooltip } from "@/components/InfoTooltip";

/** A page section: Geist heading, optional explainer, hairline top border. */
export function Section({ id, title, kicker, info, children, action }: { id?: string; title: string; kicker?: string; info?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} style={{ borderTop: "1px solid var(--color-border)", padding: "32px 0" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          {kicker && (
            <p className="font-mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-3)", margin: "0 0 6px" }}>
              {kicker}
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 id={id ? `${id}-h` : undefined} style={{ fontSize: 22, margin: 0, letterSpacing: "-0.01em" }}>
              {title}
            </h2>
            {info && <InfoTooltip label={`About ${title}`}>{info}</InfoTooltip>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Page({ children, title, lede }: { children: ReactNode; title: string; lede?: ReactNode }) {
  return (
    <main style={{ padding: "40px var(--section-pad-x) 80px", width: "100%" }}>
      <header style={{ marginBottom: 32, maxWidth: 820 }}>
        <h1 style={{ fontSize: "clamp(28px, 4vw, 40px)", margin: "0 0 12px", letterSpacing: "-0.02em", lineHeight: 1.1 }}>{title}</h1>
        {lede && (
          <div className="font-body" style={{ fontSize: 15, color: "var(--color-text-2)", lineHeight: 1.6 }}>
            {lede}
          </div>
        )}
      </header>
      {children}
    </main>
  );
}

/** Shown when a read fails: the app never invents a number to fill the gap. */
export function ReadError({ error }: { error: Error & { notConfigured?: boolean } }) {
  return (
    <div role="alert" style={{ border: "1px solid var(--color-error)", padding: "14px 16px", background: "var(--color-surface)" }}>
      <p className="font-mono" style={{ fontSize: 12, color: "var(--color-error)", margin: 0 }}>
        {error.notConfigured ? "Not configured: set CONFIG_ADDRESS (see .env.example)." : `Could not read the chain: ${error.message}`}
      </p>
    </div>
  );
}
