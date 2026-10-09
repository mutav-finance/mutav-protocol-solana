"use client";

/**
 * /reserve Overview, in three steps: is the reserve covered (Health), how to
 * check it (Verify it yourself), and what never changes (the two spec
 * promises). The per-view figures live in the shell's stats strip.
 */
import Link from "next/link";
import { useReserve } from "@/components/reserve/ReserveShell";
import { HealthSection } from "@/components/reserve/sections/Health";
import { VerifyStrip } from "@/components/reserve/sections/Disclosures";
import { Glossary } from "@/components/reserve/sections/Glossary";

/** The two promises the spec makes, each linked to the view that shows them. */
const PROMISES: [string, string, string, string][] = [
  ["Claim payments are never blocked by solvency.", "The solvency gate stops new guarantees and redemptions, never a claim payment.", "/reserve/claims", "See claims"],
  ["Pilot on MUTAV's own capital. Not open to public investment.", "Only MUTAV's capital wallet is on the on-chain allowlist.", "/reserve/disclosures", "Read the risks"],
];

export function Overview() {
  const { d } = useReserve();
  return (
    <div className="flex flex-col">
      <HealthSection d={d} />

      <div className="pt-2 pb-6">
        <VerifyStrip r={d.reserve} />
      </div>

      <section aria-labelledby="promises-h" className="flex flex-col gap-3 pb-6">
        <h2 id="promises-h" className="font-display text-(--color-text) m-0 text-base font-bold">What never changes</h2>
        <ul className="m-0 grid grid-cols-1 gap-px border p-0 md:grid-cols-2" style={{ background: "var(--color-border)" }}>
          {PROMISES.map(([text, note, href, cta]) => (
            <li key={href} className="bg-(--color-surface) flex list-none flex-col gap-2 px-6 py-4">
              <span className="font-display text-(--color-text) text-sm font-bold">{text}</span>
              <span className="font-body text-(--color-text-2) text-sm">{note}</span>
              <Link href={href} className="ext-link font-body mt-auto text-xs">
                {cta} →
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Glossary />
    </div>
  );
}
