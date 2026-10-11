"use client";

/**
 * /reserve · Risks (Disclosures). Answers one question: "What could stop this
 * reserve, and what limits each risk?" Two blocks, top to bottom:
 *   1. Claim payments: bounded by the two caps.
 *   2. Who provides capital (the allowlist).
 * The BRS freeze authority is shown on the Overview's mint card.
 * Renders on-chain values from /api/ledger; nothing is computed here.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { Mono } from "@/components/Mono";
import { fmtDuration } from "@/lib/format";
import { useFmt } from "@/components/MoneyProvider";
import { type ReserveView } from "@/lib/view";

import { Section } from "@/components/Section";
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

/** Block heading: Geist 16 bold, optional one-line intro (≤ 20 words) and a link on the right. */
function BlockHead({ id, title, intro, link }: { id: string; title: string; intro?: string; link?: [string, string] }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="flex max-w-[720px] flex-col gap-1">
        <h3 id={id} className="font-display text-(--color-text) m-0 text-base font-bold">
          {title}
        </h3>
        {intro && <p className="font-body text-(--color-text-2) m-0 text-sm leading-relaxed">{intro}</p>}
      </div>
      {link && (
        <Link href={link[0]} className="ext-link font-body text-xs">
          {link[1]} →
        </Link>
      )}
    </div>
  );
}

/** Block 1 · claim payments: two caps in one strip. */
function ClaimLimits({ r }: { r: ReserveView }) {
  const fmtBrs = useFmt();
  const caps = r.config.caps;
  const cell = (k: string, v: string, sub: ReactNode) => (
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
        intro="Remaining cover, liquid BRS and two caps bound each claim payment."
        link={["/reserve/claims", "See claims"]}
      />
      <div className="grid grid-cols-1 gap-px border sm:grid-cols-2" style={{ background: "var(--color-border)" }}>
        {cell("Cap per call", fmtBrs(caps.maxClaimPerCall), "largest single claim payment")}
        {cell("Cap per period", fmtBrs(caps.maxClaimPerPeriod), `in total, every ${fmtDuration(caps.claimPeriodSecs)}`)}
      </div>
    </section>
  );
}

/** Block 2 · who provides capital. Text only, no figures. */
function CapitalTerms() {
  return (
    <section aria-labelledby="risk-capital-h" className="flex flex-col gap-4">
      <div className="bg-(--color-surface) border-l-(--color-text-3) border border-l-2 px-6 py-3">
        <h3 id="risk-capital-h" className="font-display text-(--color-text) m-0 text-base font-bold">
          Who provides capital
        </h3>
      </div>
      <div className="flex flex-col">
        <article className="bg-(--color-surface) flex flex-col gap-3 border p-6">
          <h4 className="font-display text-(--color-text) m-0 text-lg leading-snug font-bold">Approved wallets only</h4>
          <p className="font-body text-(--color-text-2) m-0 text-sm leading-relaxed">
            An on-chain allowlist gates deposits and redemptions (KYC off-chain). Every approved wallet waits in the same FIFO queue.
          </p>
        </article>
      </div>
    </section>
  );
}

export function Disclosures({ r }: { r: ReserveView }) {
  return (
    <div className="flex flex-col gap-10 md:gap-12">
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
      subtitle="What could stop this reserve, and what limits each risk?"
    >
      <Disclosures r={d.reserve} />
    </Section>
  );
}
