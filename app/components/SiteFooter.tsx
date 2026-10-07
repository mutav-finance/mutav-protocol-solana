import Link from "next/link";

export function SiteFooter() {
  return (
    <footer style={{ borderTop: "1px solid var(--color-border)", padding: "28px var(--section-pad-x)", marginTop: "auto" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "space-between", alignItems: "flex-start" }}>
        <p className="font-body" style={{ fontSize: 12, color: "var(--color-text-2)", margin: 0, maxWidth: 640, lineHeight: 1.6 }}>
          The pilot reserve holds MUTAV&apos;s own capital. It is not open to outside investors and nothing here is an offer to invest. The program is unaudited
          and runs on Solana devnet for the Colosseum Crypto World&apos;s Fair.
        </p>
        <nav aria-label="Footer" style={{ display: "flex", gap: 18 }}>
          {[
            ["/reserve", "Reserve"],
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
