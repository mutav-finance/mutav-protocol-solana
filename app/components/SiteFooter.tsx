import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="bg-(--color-surface) mt-auto border-t" style={{ padding: "28px var(--section-pad-x)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "space-between", alignItems: "flex-start" }}>
        <p className="font-body" style={{ fontSize: 12, color: "var(--color-text-2)", margin: 0, maxWidth: 640, lineHeight: 1.6 }}>
          Capital requests are gated by an allowlist (KYC off-chain).
        </p>
        <nav aria-label="Footer" style={{ display: "flex", gap: 18 }}>
          {[
            ["/reserve", "Transparency"],
            ["/operator", "Operator"],
            ["/investment", "Investment"],
            ["/demo", "Demo"],
            ["/admin", "Admin"],
          ].map(([href, label]) => (
            <Link key={href} href={href!} className="font-mono ext-link" style={{ fontSize: 12 }}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
