"use client";

/**
 * /reserve Overview: the two spec promises in one compact band, then the Health
 * view. The per-view figures live in the shell's stats strip; Risks and Accounts
 * open from the Views menu.
 */
import Link from "next/link";
import { useReserve } from "@/components/reserve/ReserveShell";
import { HealthSection } from "@/components/reserve/sections/Health";

/** The two promises the spec makes, each linked to the view that shows them. */
const PROMISES: [string, string, string][] = [
  ["Claim payments are never blocked by solvency.", "/reserve/claims", "See claims"],
  ["Pilot on MUTAV's own capital. Not open to public investment.", "/reserve/disclosures", "Read the risks"],
];

export function Overview() {
  const { d } = useReserve();
  return (
    <div className="flex flex-col">
      {/* One line on desktop, stacked on phones. */}
      <ul className="m-0 mt-2 flex flex-col border p-0 md:flex-row">
        {PROMISES.map(([text, href, cta], i) => (
          <li key={href} className={`flex flex-1 list-none flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 ${i > 0 ? "border-t md:border-t-0 md:border-l" : ""}`}>
            <span className="font-display text-(--color-text) text-sm font-bold">{text}</span>
            <Link href={href} className="ext-link font-body shrink-0 text-xs">
              {cta} →
            </Link>
          </li>
        ))}
      </ul>

      <HealthSection d={d} />
    </div>
  );
}
