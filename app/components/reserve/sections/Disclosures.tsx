"use client";

/**
 * /reserve · Risks (Disclosures). Answers one question: "What could stop this
 * reserve, and what limits each risk?" Three blocks, top to bottom:
 *   1. The live freeze state of the reserve's BRS token account.
 *   2. Claim payments: bounded by the two caps.
 *   3. Who provides capital (the allowlist; not open to public investment).
 * The BRS freeze authority is shown on the Verify tab's mint card.
 * Renders on-chain values from /api/ledger; nothing is computed here.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { Mono } from "@/components/Mono";
import { Money } from "@/components/MoneyProvider";
import { type ReserveView } from "@/lib/view";

import { Section } from "@/components/Section";
import { BlockHead, Lead } from "@/components/reserve/sections/shared";
import type { Data } from "@/components/reserve/sections/shared";

const LABEL = { letterSpacing: "0.01em" } as const;

/** Inter Medium 12px caps label (STYLE.md card label). */
function Label({ children }: { children: ReactNode }) {
  return (
    <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={LABEL}>
      {children}
    </span>
  );
}

/** A link on the right of a block heading. */
const HeadLink = ({ href, children }: { href: string; children: string }) => (
  <Link href={href} className="ext-link font-body text-xs">
    {children} →
  </Link>
);

/** Block 1 · the one risk with a live on-chain state: is the reserve's BRS token account frozen? Error colour only when frozen. */
function FreezeStatus({ r }: { r: ReserveView }) {
  const frozen = r.token.reserveFrozen;
  return (
    <section aria-labelledby="risk-freeze-h" className="flex flex-col gap-4">
      <BlockHead id="risk-freeze-h" title="Reserve token account freeze" note={<Lead lead="BRS is issued by Nora, and Nora can freeze it." className="text-sm">A freeze stops every outflow, claim payments included.</Lead>} />
      <div className="bg-(--color-surface) flex flex-col gap-2 border px-6 py-4" style={frozen ? { borderColor: "var(--color-error)" } : undefined} role="status" aria-label="Reserve token account freeze status">
        <Label>Reserve token account</Label>
        <Mono style={{ fontSize: 22, fontWeight: 700, color: frozen ? "var(--color-error)" : "var(--color-text)", whiteSpace: "nowrap" }}>{frozen ? "FROZEN NOW" : "NOT FROZEN"}</Mono>
      </div>
    </section>
  );
}

/** Block 2 · claim payments: two caps in one strip. */
function ClaimLimits({ r }: { r: ReserveView }) {
  const caps = r.config.caps;
  const cell = (k: string, v: ReactNode, sub: ReactNode) => (
    <div className="bg-(--color-surface) flex min-w-0 flex-col gap-2 px-6 py-4">
      <Label>{k}</Label>
      <Mono style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text)", whiteSpace: "nowrap" }}>{v}</Mono>
      <span className="font-mono text-(--color-text-3) text-2xs">{sub}</span>
    </div>
  );
  return (
    <section aria-labelledby="risk-claims-h" className="flex flex-col gap-4">
      <BlockHead
        id="risk-claims-h"
        title="Claim payment caps"
        note={<Lead lead="Each claim payment has two caps." className="text-sm">The guarantee&apos;s remaining cover and the BRS on hand bound it too.</Lead>}
        aside={<HeadLink href="/reserve/claims">See claims</HeadLink>}
      />
      <div className="grid grid-cols-1 gap-px border sm:grid-cols-2" style={{ background: "var(--color-border)" }}>
        {cell("Operator limit per payment", <Money brs={caps.maxClaimPerCall} block />, "above it, the Reserve Admin approves the exact amount")}
        {cell("Max in any 31 days", <Money brs={caps.maxClaimPerPeriod} block />, "all claim payments together")}
      </div>
    </section>
  );
}

/** Block 3 · who provides capital. Text only, no figures. */
function CapitalTerms() {
  return (
    <section aria-labelledby="risk-capital-h" className="flex flex-col gap-4">
      <BlockHead id="risk-capital-h" title="Who provides capital" />
      <div className="flex flex-col">
        <article className="bg-(--color-surface) flex flex-col gap-3 border p-6">
          <h4 className="font-display text-(--color-text) m-0 text-lg leading-snug font-bold">Approved wallets only</h4>
          <p className="m-0">
            <Lead lead="The allowlist gates new capital; existing holders can always redeem." className="text-sm">
              The on-chain allowlist (KYC off-chain) gates deposits. Every request waits in the same line, oldest first.
            </Lead>
          </p>
          <p className="m-0">
            <Lead lead="Not open to public investment." className="text-sm">
              The pilot runs on MUTAV&apos;s own capital; new capital requests are limited to allowlisted wallets, and nothing here is an offer.
            </Lead>
          </p>
        </article>
      </div>
    </section>
  );
}

export function Disclosures({ r }: { r: ReserveView }) {
  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <FreezeStatus r={r} />
      <ClaimLimits r={r} />
      <CapitalTerms />
    </div>
  );
}

/** The Risks view of /reserve: the question as subtitle, the audit status beside it. */
export function DisclosuresSection({ d }: { d: Data }) {
  return (
    <Section
      id="disclosures"
      title="Risks"
      subtitle="What limits each payment, and who can move money."
    >
      <Disclosures r={d.reserve} />
    </Section>
  );
}
