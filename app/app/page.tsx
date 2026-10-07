import Link from "next/link";
import { HeroWithSwap } from "@/components/landing/LandingNav";
import { LiveStrip } from "@/components/landing/LiveStrip";
import { ProtocolDiagram } from "@/components/landing/ProtocolDiagram";
import { SiteFooter } from "@/components/SiteFooter";
import { WhoDoesWhat } from "@/components/landing/WhoDoesWhat";

const STEPS: [string, string, string][] = [
  [
    "01",
    "An agency registers a lease",
    "MUTAV guarantees the rent and the property's recovery for the landlord. The guarantee is recorded on Solana with its cover: a default leg for unpaid rent and an exit leg for recovering the property.",
  ],
  [
    "02",
    "The reserve covers it, gated by solvency",
    "A guarantee is accepted only if its cover fits in the reserve's free capital. When it would not fit, the program refuses it. No promise is made that the reserve cannot keep.",
  ],
  [
    "03",
    "Claims are paid from the reserve, never blocked",
    "When rent goes unpaid, the claim is filed, paid from the reserve and settled by PIX, each step timestamped on-chain. The solvency gate never stops a claim payment.",
  ],
];

export default function Landing() {
  return (
    <>
      <HeroWithSwap>
        <div style={{ padding: "56px var(--section-pad-x) 72px", maxWidth: 1100 }}>
          <p className="font-mono" style={{ fontSize: 12, letterSpacing: "0.08em", color: "var(--color-text-3)", margin: "0 0 18px", textTransform: "uppercase" }}>
            Rental guarantees · Brazil · Solana pilot
          </p>
          <h1 style={{ fontSize: "clamp(36px, 6vw, 68px)", lineHeight: 1.04, letterSpacing: "-0.03em", margin: "0 0 22px", maxWidth: 920 }}>
            Every rental guarantee, backed by a reserve anyone can verify.
          </h1>
          <p className="font-body" style={{ fontSize: "clamp(16px, 1.6vw, 19px)", color: "var(--color-text-2)", lineHeight: 1.6, margin: "0 0 32px", maxWidth: 720 }}>
            MUTAV is an institutional rental guarantor in Brazil. Its guarantees are backed by a reserve that lives on Solana: the capital, the coverage it
            owes and every claim payment are public, on-chain accounts.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/reserve" className="font-body cta-fill" style={{ background: "var(--color-accent)", color: "var(--color-canvas)", fontSize: 15, fontWeight: 600, padding: "12px 20px", textDecoration: "none" }}>
              See the reserve
            </Link>
            <Link href="/demo" className="font-body cta-outline" style={{ border: "1px solid var(--color-border-input)", color: "var(--color-text)", fontSize: 15, fontWeight: 500, padding: "11px 20px", textDecoration: "none" }}>
              Run the demo
            </Link>
          </div>
        </div>
      </HeroWithSwap>

      <main id="main-content" tabIndex={-1} style={{ outline: "none" }}>
        <LiveStrip />

        <section aria-labelledby="how-h" style={{ padding: "64px var(--section-pad-x)", borderBottom: "1px solid var(--color-border)" }}>
          <h2 id="how-h" style={{ fontSize: 28, margin: "0 0 32px", letterSpacing: "-0.02em" }}>
            How it works
          </h2>
          <ol style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24, margin: 0, padding: 0 }}>
            {STEPS.map(([n, t, d]) => (
              <li key={n} style={{ listStyle: "none", borderTop: "1px solid var(--color-border)", paddingTop: 18 }}>
                <span className="font-mono" style={{ fontSize: 12, color: "var(--color-accent)" }}>{n}</span>
                <h3 style={{ fontSize: 18, margin: "8px 0 10px" }}>{t}</h3>
                <p className="font-body" style={{ fontSize: 14, color: "var(--color-text-2)", lineHeight: 1.6, margin: 0 }}>{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="roles-h" style={{ padding: "64px var(--section-pad-x)", borderBottom: "1px solid var(--color-border)" }}>
          <h2 id="roles-h" style={{ fontSize: 28, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
            Who does what
          </h2>
          <p className="font-body" style={{ fontSize: 14, color: "var(--color-text-2)", margin: "0 0 28px", maxWidth: 720, lineHeight: 1.6 }}>
            Three roles touch the program, each with its own key, and the program checks which one signed. The same marks tag every action and every number
            across this site.
          </p>
          <WhoDoesWhat />
        </section>

        <section aria-labelledby="diagram-h" style={{ padding: "64px var(--section-pad-x)", borderBottom: "1px solid var(--color-border)" }}>
          <h2 id="diagram-h" style={{ fontSize: 28, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
            The program
          </h2>
          <p className="font-body" style={{ fontSize: 14, color: "var(--color-text-2)", margin: "0 0 28px", maxWidth: 720, lineHeight: 1.6 }}>
            One Solana program holds the reserve. The Operator runs guarantees and claims; the Reserve Admin is a Squads multisig with a time lock; the
            Investor enters and leaves through the FIFO queue. Nobody holds a key that can move reserve funds alone.
          </p>
          <ProtocolDiagram />
        </section>

        <section aria-labelledby="cta-h" style={{ padding: "64px var(--section-pad-x)" }}>
          <h2 id="cta-h" style={{ fontSize: 28, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
            Check it yourself
          </h2>
          <p className="font-body" style={{ fontSize: 14, color: "var(--color-text-2)", margin: "0 0 24px", maxWidth: 720, lineHeight: 1.6 }}>
            The pilot runs on MUTAV&apos;s own capital and is not open to public investment. Capital requests are gated by an on-chain allowlist (KYC off-chain); in the pilot the only allowlisted capital provider is MUTAV&apos;s capital
            wallet. What is open to everyone is the evidence: every account, every claim and every payment, on Solana.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/reserve" className="font-body cta-fill" style={{ background: "var(--color-accent)", color: "var(--color-canvas)", fontSize: 15, fontWeight: 600, padding: "12px 20px", textDecoration: "none" }}>
              See the reserve
            </Link>
            <Link href="/demo" className="font-body cta-outline" style={{ border: "1px solid var(--color-border-input)", color: "var(--color-text)", fontSize: 15, padding: "11px 20px", textDecoration: "none" }}>
              Run the demo
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
