"use client";

/**
 * "How to read this page": the terms the /reserve views use, in one place,
 * collapsed by default. The wording matches the tooltips beside each figure.
 * Ordered as the Overview reads: the hero first, then the strip, then cover.
 */
const TERMS: [string, string][] = [
  ["Coverage ratio", "Stable assets ÷ coverage required. Above 100%, the reserve holds more than it must."],
  ["Coverage required", "Required share of remaining cover, set by the Reserve Admin (at least 10%). Never less than open claim provisions."],
  ["Free capital", "Stable assets − coverage required. Gates new guarantees and redemptions, never a claim payment."],
  ["NAV per share", "Net assets (stable assets − open provisions) ÷ shares outstanding. Published on-chain at each refresh."],
  ["Provision", "Booked when a claim is filed, until it is paid. Already out of NAV."],
  ["Mode", "Normal while stable assets cover what is required. UnderCovered stops new guarantees and redemptions, never claim payments."],
  ["Guarantee", "One limited fiança for one lease, recorded on-chain. Ceiling: default leg + exit leg, fixed at registration."],
  ["Default leg", "Sub-limit for rent and charges in arrears while the lease runs."],
  ["Exit leg", "Sub-limit for the tenant's debts up to and at the end of occupation."],
  ["Remaining cover", "Both legs of every active guarantee, minus what was already paid."],
];

export function Glossary() {
  return (
    <details className="bg-(--color-surface) group border px-6 py-4">
      <summary className="font-body text-(--color-text-2) hover:text-(--color-text) flex cursor-pointer list-none items-center gap-3 text-sm [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="font-mono text-(--color-text-3) inline-block w-3 group-open:hidden">+</span>
        <span aria-hidden="true" className="font-mono text-(--color-text-3) hidden w-3 group-open:inline-block">−</span>
        <span className="font-display text-(--color-text) font-bold">How to read this page</span>
        <span className="font-mono text-(--color-text-3) text-xs">{TERMS.length} terms</span>
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
