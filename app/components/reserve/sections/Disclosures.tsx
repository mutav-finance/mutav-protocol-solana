"use client";

/**
 * /reserve · Risks (Disclosures). Answers one question: "What could stop this
 * reserve, and what limits each risk?" Four blocks, top to bottom:
 *   1. Hero: the one risk with a live on-chain state (Nora's freeze).
 *   2. Claim payments: never gated by solvency, bounded by the two caps.
 *   3. The pilot's terms: own capital (not investable) and what is built later.
 *   4. Verify it yourself (shared with the Overview).
 * Renders on-chain values from /api/ledger; nothing is computed here.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtBrs, fmtDuration } from "@/lib/format";
import { type ReserveView } from "@/lib/view";

import { ImageSlot } from "@/components/ImageSlot";
import { Section } from "@/components/Section";
import type { Data } from "@/components/reserve/sections/shared";

const LABEL = { letterSpacing: "0.01em" } as const;
const KICKER = { letterSpacing: "0.08em" } as const;

/** Inter Medium 12px caps label (STYLE.md card label). */
function Label({ children }: { children: ReactNode }) {
  return (
    <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={LABEL}>
      {children}
    </span>
  );
}

/** Brand badge (STYLE.md §3.5): 6px square in the status color + mono label in text-2. */
function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="inline-block size-1.5 shrink-0" style={{ background: color }} />
      <Mono style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--color-text-2)" }}>{label}</Mono>
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

const BUILT_LATER = ["Partial redemption fills at the queue head", "On-chain claim notices", "More reserve assets through capped adapters"];

/**
 * "Verify it yourself": what a verifier opens first (the program, the key that
 * governs it, the cluster) and the audit status, said plainly. Shared by the
 * Overview and Risks; every value is already on the page.
 */
export function VerifyStrip({ r, accountsLink = true }: { r: ReserveView; accountsLink?: boolean }) {
  const cell = (k: string, v: ReactNode) => (
    <div className="bg-(--color-surface) flex min-w-0 flex-col gap-2 px-6 py-4">
      <Label>{k}</Label>
      <span className="min-w-0 text-sm">{v}</span>
    </div>
  );
  return (
    <section aria-labelledby="verify-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="verify-h" className="font-display text-(--color-text) m-0 text-base font-bold">
          Verify it yourself
        </h2>
        {accountsLink && (
          <Link href="/reserve/verify" className="ext-link font-body text-xs">
            Every account →
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-px border sm:grid-cols-2 lg:grid-cols-4" style={{ background: "var(--color-border)" }}>
        {cell("Program", <Explorer value={r.programId} />)}
        {cell(
          "Governed by",
          <span className="inline-flex flex-wrap items-center gap-2">
            <Explorer value={r.config.admin} />
            <span className="font-body text-(--color-text-3) text-xs">Squads multisig</span>
          </span>,
        )}
        {cell("Cluster", <Mono style={{ fontSize: 12, color: "var(--color-text)" }}>{r.cluster.toUpperCase()}</Mono>)}
        {cell("Audit", <Badge color="var(--color-accent)" label="UNAUDITED PILOT" />)}
      </div>
    </section>
  );
}

/** Block 1 · hero: the only risk with a live on-chain state. Error colour only when frozen. */
function FreezeHero({ r }: { r: ReserveView }) {
  const frozen = r.token.reserveFrozen;
  const state = frozen ? "var(--color-error)" : "var(--color-text)";
  return (
    <article
        aria-labelledby="risk-freeze-h"
        className="bg-(--color-surface) flex flex-col gap-6 border p-6"
        style={frozen ? { borderColor: "var(--color-error)" } : undefined}
      >
        <div className="flex flex-col gap-2">
          <span className="font-mono text-(--color-text-3) text-2xs uppercase" style={KICKER}>
            Live risk · reserve token account
          </span>
          <h3 id="risk-freeze-h" className="font-display text-(--color-text) m-0 text-xl leading-snug font-bold md:text-2xl">
            BRS is issued by Nora, and Nora can freeze it
          </h3>
        </div>
        <div className="flex flex-col gap-2" role="status">
          <Mono style={{ fontSize: "clamp(32px, 6vw, 48px)", fontWeight: 700, lineHeight: 1, color: state }}>{frozen ? "FROZEN NOW" : "NOT FROZEN NOW"}</Mono>
          <p className="font-body text-(--color-text-2) m-0 text-sm">A freeze stops every outflow, claim payments included, until thawed.</p>
        </div>
        <dl className="m-0 mt-auto flex flex-wrap items-baseline gap-x-4 gap-y-2 border-t pt-4">
          <dt>
            <Label>Freeze authority</Label>
          </dt>
          <dd className="m-0 inline-flex flex-wrap items-baseline gap-2 text-sm">
            {r.token.freezeAuthority ? <Explorer value={r.token.freezeAuthority} /> : <Mono>none</Mono>}
            {r.cluster !== "localnet" && <span className="font-body text-(--color-text-3) text-xs">a single Nora wallet</span>}
          </dd>
        </dl>
      </article>
  );
}

/** Block 2 · claim payments: one statement, two caps in one strip. */
function ClaimLimits({ r }: { r: ReserveView }) {
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
        title="Claim payments are never blocked by solvency"
        intro="The solvency gate stops new guarantees and redemptions, not claims. Remaining cover, liquid BRS and two caps bound each payment."
        link={["/reserve/claims", "See claims"]}
      />
      <div className="grid grid-cols-1 gap-px border sm:grid-cols-2" style={{ background: "var(--color-border)" }}>
        {cell("Cap per call", fmtBrs(caps.maxClaimPerCall), "largest single claim payment")}
        {cell("Cap per period", fmtBrs(caps.maxClaimPerPeriod), `in total, every ${fmtDuration(caps.claimPeriodSecs)}`)}
      </div>
    </section>
  );
}

/** Block 3 · the pilot's terms: whose capital it is, and what is not built yet. Text only, no figures. */
function PilotTerms() {
  return (
    <section aria-labelledby="risk-pilot-h" className="flex flex-col gap-4">
      <ImageSlot slot="reserve-risks" aspect="8:1" opacity={0.12} className="h-14">
        <div className="flex h-full items-end px-6 pb-3">
          <h3 id="risk-pilot-h" className="font-display text-(--color-text) m-0 text-base font-bold">
            What this pilot is, and is not
          </h3>
        </div>
      </ImageSlot>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <article className="bg-(--color-surface) relative flex flex-col gap-3 overflow-hidden border p-6">
          {/* Decorative image slot; this tile carries no numbers. */}
          <ImageSlot slot="reserve-disclosures" aspect="tile" opacity={0.1} fill />
          <h4 className="font-display text-(--color-text) relative m-0 text-lg leading-snug font-bold">MUTAV&apos;s own capital, not open to public investment</h4>
          <p className="font-body text-(--color-text-2) relative m-0 text-sm leading-relaxed">
            An on-chain allowlist gates deposits and redemptions (KYC off-chain). Only MUTAV&apos;s capital wallet is on it, and it waits in the same FIFO queue as
            anyone.
          </p>
          <p className="font-body text-(--color-text) relative m-0 mt-auto text-sm font-medium">Nothing on this page is an offer to invest.</p>
        </article>
        <article className="bg-(--color-surface) flex flex-col gap-3 border p-6">
          <div className="flex flex-col gap-1">
            <h4 className="font-display text-(--color-text) m-0 text-lg leading-snug font-bold">Built later</h4>
            <p className="font-body text-(--color-text-2) m-0 text-sm">Designed, not in this pilot yet.</p>
          </div>
          <ul className="font-body text-(--color-text) m-0 flex flex-col gap-2 border-t p-0 pt-4 text-sm">
            {BUILT_LATER.map((x) => (
              <li key={x} className="flex list-none items-start gap-3">
                <span aria-hidden="true" className="bg-(--color-text-3) mt-2 inline-block size-1.5 shrink-0" />
                {x}
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

export function Disclosures({ r }: { r: ReserveView }) {
  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <FreezeHero r={r} />
      <ClaimLimits r={r} />
      <PilotTerms />
      <VerifyStrip r={r} />
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
      action={<StatusBadge color="var(--color-accent)" label="UNAUDITED PILOT" />}
    >
      <Disclosures r={d.reserve} />
    </Section>
  );
}
