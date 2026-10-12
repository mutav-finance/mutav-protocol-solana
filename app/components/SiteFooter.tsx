import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="bg-(--color-surface) mt-auto border-t" style={{ padding: "28px var(--section-pad-x)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="flex max-w-[640px] flex-col gap-2">
          <p className="font-mono text-(--color-text-3) m-0 text-[11px] tracking-[0.15em] uppercase">MUTAV Finance · Onchain rental guarantee · Brazil</p>
          <p className="font-body" style={{ fontSize: 12, color: "var(--color-text-2)", margin: 0, lineHeight: 1.6 }}>
            Deposit requests are gated by an allowlist (KYC off-chain); holders can always redeem.
          </p>
        </div>
        <nav aria-label="Footer" style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
          {[
            ["/reserve", "Transparency"],
            ["/operator", "Operator"],
            ["/admin", "Admin"],
            ["/capital", "Capital queue"],
          ].map(([href, label]) => (
            <Link key={href} href={href!} className="font-mono ext-link" style={{ fontSize: 12 }}>
              {label}
            </Link>
          ))}
          <a href="https://www.mutav.finance" target="_blank" rel="noopener noreferrer" className="font-mono ext-link" style={{ fontSize: 12 }}>
            mutav.finance ↗
          </a>
        </nav>
      </div>
    </footer>
  );
}
