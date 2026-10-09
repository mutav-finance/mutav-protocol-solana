"use client";

/**
 * /reserve Overview answers one question: "Can the reserve cover every open
 * guarantee?" Three blocks, 48px apart:
 *   1. Health: the coverage ratio as the hero, then one strip of four figures.
 *   2. What never changes: the two spec promises, under a decorative band.
 *   3. Footnotes: verify it yourself, and the glossary (collapsed).
 * The per-view figures live in the shell's stats strip.
 */
import Link from "next/link";
import { useReserve } from "@/components/reserve/ReserveShell";
import { HealthSection } from "@/components/reserve/sections/Health";
import { VerifyStrip } from "@/components/reserve/sections/Disclosures";
import { Glossary } from "@/components/reserve/sections/Glossary";
import { ImageSlot } from "@/components/ImageSlot";

/** The two promises the spec makes, each linked to the view that shows them. */
const PROMISES: [string, string, string, string][] = [
  ["Claim payments are never blocked by solvency.", "The gate stops new guarantees and redemptions only.", "/reserve/claims", "See claims"],
  ["Pilot on MUTAV's own capital. Not open to public investment.", "Only MUTAV's capital wallet is on the on-chain allowlist.", "/reserve/disclosures", "Read the risks"],
];

export function Overview() {
  const { d } = useReserve();
  return (
    <div className="flex flex-col">
      {/* 1 · hero + support strip (Section brings 24px above and below) */}
      <HealthSection d={d} />

      {/* 2 · the promises; the band is decorative and carries no figures */}
      <section aria-labelledby="promises-h" className="flex flex-col pt-6 pb-6">
        <ImageSlot slot="overview-promises" aspect="8:1" opacity={0.12} className="h-20 md:h-28">
          <div className="flex h-full items-end px-6 pb-4">
            <h2 id="promises-h" className="font-display text-(--color-text) m-0 text-2xl font-bold tracking-tight">
              What never changes
            </h2>
          </div>
        </ImageSlot>
        <ul className="m-0 grid grid-cols-1 gap-px border border-t-0 p-0 md:grid-cols-2" style={{ background: "var(--color-border)" }}>
          {PROMISES.map(([text, note, href, cta]) => (
            <li key={href} className="bg-(--color-surface) flex list-none flex-col gap-2 p-6">
              <span className="font-display text-(--color-text) text-base font-bold">{text}</span>
              <span className="font-body text-(--color-text-2) text-sm">{note}</span>
              <Link href={href} className="ext-link font-body mt-2 text-xs">
                {cta} →
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* 3 · footnotes: verify links, then definitions on demand */}
      <div className="flex flex-col gap-6 pt-6">
        <VerifyStrip r={d.reserve} />
        <Glossary />
      </div>
    </div>
  );
}
