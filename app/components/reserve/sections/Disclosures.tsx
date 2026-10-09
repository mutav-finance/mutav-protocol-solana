"use client";

/**
 * /reserve · Disclosures. Renders on-chain values from /api/ledger; nothing is
 * computed here beyond sums and differences of account fields.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { fmtBrs, fmtDuration } from "@/lib/format";
import { type ReserveView } from "@/lib/view";

import { ImageSlot, type ImageSlotName } from "@/components/ImageSlot";
import { Section } from "@/components/Section";
import type { Data } from "@/components/reserve/sections/shared";

// ── Disclosures ─────────────────────────────────────────────────────────────

const LABEL = { letterSpacing: "0.01em" } as const;

/** One disclosure: Declaration (Geist), Explanation (Inter), Evidence (mono rows). */
function Tile({ title, children, evidence, image, border }: { title: string; children: ReactNode; evidence?: ReactNode; image?: ImageSlotName; border?: string }) {
  return (
    <article className="bg-(--color-surface) relative flex flex-col gap-4 overflow-hidden border p-6 lg:col-span-4" style={border ? { borderColor: border } : undefined}>
      {/* Decorative image slot; no numbers on this tile. */}
      {image && <ImageSlot slot={image} aspect="tile" opacity={0.1} fill />}
      <h3 className="font-display text-(--color-text) relative m-0 text-lg font-bold leading-snug">{title}</h3>
      <div className="font-body text-(--color-text-2) relative text-sm leading-relaxed">{children}</div>
      {evidence && <dl className="relative m-0 mt-auto flex flex-col gap-2 border-t pt-4">{evidence}</dl>}
    </article>
  );
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <dt className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={LABEL}>{k}</dt>
      <dd className="m-0 text-sm">{children}</dd>
    </div>
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

const BUILT_LATER = [
  "Partial redemption fills at the queue head",
  "On-chain claim notices",
  "More reserve assets through capped adapters",
];

/**
 * "Verify it yourself": what a verifier opens first (the program, the key that
 * governs it, the cluster) and the audit status, said plainly. Shared by the
 * Overview and Risks; every value is already on the page.
 */
export function VerifyStrip({ r, accountsLink = true }: { r: ReserveView; accountsLink?: boolean }) {
  const cell = (k: string, v: ReactNode) => (
    <div className="bg-(--color-surface) flex min-w-0 flex-col gap-2 px-6 py-4">
      <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={LABEL}>{k}</span>
      <span className="min-w-0 text-sm">{v}</span>
    </div>
  );
  return (
    <section aria-labelledby="verify-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="verify-h" className="font-display text-(--color-text) m-0 text-base font-bold">Verify it yourself</h2>
        {accountsLink && (
          <Link href="/reserve/accounts" className="ext-link font-body text-xs">
            Every account →
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-px border sm:grid-cols-2 lg:grid-cols-4" style={{ background: "var(--color-border)" }}>
        {cell("Program", <Explorer value={r.programId} />)}
        {cell("Governed by", <span className="inline-flex flex-wrap items-center gap-2"><Explorer value={r.config.admin} /><span className="font-body text-(--color-text-3) text-xs">Squads multisig</span></span>)}
        {cell("Cluster", <Mono style={{ fontSize: 12, color: "var(--color-text)" }}>{r.cluster.toUpperCase()}</Mono>)}
        {cell("Audit", <Badge color="var(--color-accent)" label="UNAUDITED PILOT" />)}
      </div>
    </section>
  );
}

export function Disclosures({ r }: { r: ReserveView }) {
  const frozen = r.token.reserveFrozen;
  return (
    <div className="flex flex-col gap-4">
      <VerifyStrip r={r} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Tile
          title="BRS is issued by Nora, and Nora can freeze it"
          border={frozen ? "var(--color-error)" : undefined}
          evidence={
            <>
              <Fact k="Reserve token account">
                <Badge color={frozen ? "var(--color-error)" : "var(--color-text-3)"} label={frozen ? "FROZEN NOW" : "NOT FROZEN NOW"} />
              </Fact>
              <Fact k="Freeze authority">
                {r.token.freezeAuthority ? <Explorer value={r.token.freezeAuthority} /> : <Mono>none</Mono>}
                <span className="font-body text-(--color-text-3) ml-2 text-xs">{r.cluster === "localnet" ? "" : "a single Nora wallet"}</span>
              </Fact>
            </>
          }
        >
          A freeze of the reserve token account stops every outflow, claim payments included, until it is thawed.
        </Tile>

        <Tile
          title="Claim payments are never blocked by solvency"
          evidence={
            <>
              <Fact k="Cap per call"><Mono>{fmtBrs(r.config.caps.maxClaimPerCall)}</Mono></Fact>
              <Fact k="Cap per period">
                <Mono>{fmtBrs(r.config.caps.maxClaimPerPeriod)} / {fmtDuration(r.config.caps.claimPeriodSecs)}</Mono>
              </Fact>
            </>
          }
        >
          The solvency gate stops new guarantees and redemptions when free capital runs out, never a claim payment. A claim payment is bounded by the
          guarantee&apos;s remaining cover, the liquid BRS and these caps.
        </Tile>

        <Tile title="MUTAV's own capital, not open to public investment" image="reserve-disclosures">
          Deposits and redemptions are gated by an on-chain allowlist (KYC off-chain); in the pilot only MUTAV&apos;s capital wallet is on it, and it waits in the
          same FIFO queue as anyone. Nothing on this page is an offer to invest.
        </Tile>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <details open className="bg-(--color-surface) group border px-6 py-4 lg:col-span-8">
        <summary className="font-body text-(--color-text-2) hover:text-(--color-text) flex cursor-pointer list-none items-center gap-3 text-sm [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="font-mono text-(--color-text-3) inline-block w-3 group-open:hidden">+</span>
          <span aria-hidden="true" className="font-mono text-(--color-text-3) hidden w-3 group-open:inline-block">−</span>
          <span>
            <span className="font-display text-(--color-text) font-bold">Built later</span> · designed, not in this pilot yet
          </span>
        </summary>
        <ul className="font-body text-(--color-text) m-0 mt-4 flex flex-col gap-2 border-t p-0 pt-4 text-sm">
          {BUILT_LATER.map((x) => (
            <li key={x} className="flex list-none items-start gap-3">
              <span aria-hidden="true" className="mt-2 inline-block size-1.5 shrink-0 bg-(--color-text-3)" />
              {x}
            </li>
          ))}
        </ul>
      </details>
      <ImageSlot slot="reserve-risks" aspect="tile" className="min-h-[160px] lg:col-span-4" />
      </div>
    </div>
  );
}

/** The Disclosures section of /reserve: heading, roles and body. */
export function DisclosuresSection({ d }: { d: Data }) {
  return (
    <Section id="disclosures" title="Risks" kicker="Disclosures" subtitle="The risks and limits to know before relying on this reserve.">
      <Disclosures r={d.reserve} />
    </Section>
  );
}
