"use client";

/**
 * The glossary: the terms the /reserve views use, in one place, collapsed by
 * default. The wording matches the tooltips beside each figure. Ordered as
 * the Overview reads: the hero first, then the strip, then cover.
 */
import { PlusMark } from "@/components/reserve/sections/shared";
import { fmtPct } from "@/lib/format";

/** The terms; the coverage ratio is read from the config account, never typed in. */
const terms = (coverageRatioBps: number): [string, string][] => [
  ["Reserve balance", "BRS in the reserve token account. Deposits waiting in line and redeemed BRS ready to collect are not counted."],
  ["Coverage required", `What the reserve must hold: ${fmtPct(coverageRatioBps)} of remaining cover, never less than what is set aside for claims.`],
  ["Free capital", "Reserve balance − coverage required. Gates new guarantees and redemptions, never a claim payment."],
  ["Share price", "Net assets (reserve balance − set aside for claims) ÷ shares outstanding. Published on-chain at each refresh."],
  ["Set aside for claims", "Booked when a claim is filed, until it is paid. Already out of the share price."],
  ["Mode", "Normal while the reserve balance covers what is required. Under-covered stops new guarantees and redemptions, never claim payments."],
  ["Guarantee", "One limited fiança for one lease, recorded on-chain. Ceiling: unpaid rent + move-out debts, fixed at registration."],
  ["Unpaid rent", "Limit for rent and charges in arrears while the lease runs."],
  ["Move-out debts", "Limit for the tenant's debts up to and at the end of occupation."],
  ["Remaining cover", "Both parts of every active guarantee, minus what was already paid."],
  ["Waiting in line", "Deposits and redemptions wait in one line each, oldest first, until the Reserve Admin fills them."],
  ["MUTAV fee", "MUTAV's share of each guarantee fee. Issuer income goes 100% to the reserve."],
];

export function Glossary({ coverageRatioBps }: { coverageRatioBps: number }) {
  const TERMS = terms(coverageRatioBps);
  return (
    <details className="bg-(--color-surface) group border px-6 py-4">
      <summary className="font-body text-(--color-text-2) hover:text-(--color-text) flex cursor-pointer list-none items-center gap-3 text-sm [&::-webkit-details-marker]:hidden">
        <PlusMark />
        <span className="font-display text-(--color-text) font-bold">Glossary</span>
        <span className="font-body text-(--color-text-3) text-xs tabular-nums">{TERMS.length} terms</span>
      </summary>
      <dl className="m-0 mt-4 grid grid-cols-1 gap-x-12 gap-y-4 border-t pt-4 md:grid-cols-2">
        {TERMS.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1">
            <dt className="font-body text-(--color-text) text-sm font-medium">{k}</dt>
            <dd className="font-body text-(--color-text-2) m-0 text-sm leading-relaxed">{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
