"use client";

/**
 * /reserve · Risks (Disclosures). Answers one question: "What could stop this
 * reserve, and what limits each risk?" Three blocks, top to bottom:
 *   1. The live freeze state of the reserve's BRS token account.
 *   2. Claim payments: bounded by the two caps.
 *   3. Admin caps: the other limits the Reserve Admin sets (reserve size, cover per guarantee, stress buffer).
 *   4. Authority: where claim payments go (the payments account) and who can pause.
 *   5. Who provides capital (the allowlist; not open to public investment).
 * The BRS freeze authority is shown on the Verify tab's mint card.
 * Renders on-chain values from /api/ledger; nothing is computed here.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { StatusBadge } from "@/components/StatusBadge";
import { Money } from "@/components/MoneyProvider";
import { CLAIM_WINDOW_DAYS } from "@mutav-finance/mutav-protocol-solana";
import { type ReserveView } from "@/lib/view";

import { Section } from "@/components/Section";
import { BlockHead, Lead, Table } from "@/components/reserve/sections/shared";
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
        <StatusBadge color={frozen ? "var(--color-error)" : "var(--color-success)"} label={frozen ? "FROZEN NOW" : "NOT FROZEN"} />
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
      <span className="font-body text-(--color-text-2) text-xs leading-snug">{sub}</span>
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
        {cell(`Max in any ${CLAIM_WINDOW_DAYS} days`, <Money brs={caps.maxClaimPerPeriod} block />, "all claim payments together")}
      </div>
    </section>
  );
}

/**
 * Block 3 · the caps the Reserve Admin sets, kept apart from the coverage
 * ceiling: the ceiling moves with the reserve, these move only when the admin
 * changes them.
 */
function AdminCaps({ r }: { r: ReserveView }) {
  const caps = r.config.caps;
  const rows: [string, bigint, string][] = [
    ["Max reserve size", caps.maxTvl, "New capital is accepted only up to this reserve size."],
    ["Max cover per guarantee", caps.maxCoverPerGuarantee, "The largest cover one new guarantee may carry."],
    ["Stress buffer", caps.stressBuffer, "Feeds the stress floor of required coverage."],
  ];
  return (
    <section aria-labelledby="risk-caps-h" className="flex flex-col gap-4">
      <BlockHead
        id="risk-caps-h"
        title="Admin caps"
        note={<Lead lead="Set by the Reserve Admin, separate from the coverage ceiling." className="text-sm">The ceiling follows the reserve; these change only when the admin sets them. The claim payment caps are above.</Lead>}
        aside={<HeadLink href="/reserve/coverage">See the ceiling</HeadLink>}
      />
      <Table label="Admin caps" head={["Cap", ["Value", "num"], "What it limits"]}>
        {rows.map(([k, v, what]) => (
          <tr key={k}>
            <td>{k}</td>
            <td className="num">
              <Mono>
                <Money brs={v} />
              </Mono>
            </td>
            <td>{what}</td>
          </tr>
        ))}
      </Table>
    </section>
  );
}

/** An address on Explorer with who holds it. */
const Key = ({ address, rpc, who }: { address: string; rpc: string; who: string }) => (
  <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
    <Explorer value={address} rpc={rpc} />
    <span className="font-body text-(--color-text-3) text-xs">{who}</span>
  </span>
);

/** The program's empty key slot (`Pubkey::default()`): an unset guardian. */
const EMPTY_KEY = "11111111111111111111111111111111";

/**
 * Block 4 · authority: the fixed account every claim payment goes to, and
 * who can pause the program. Both read from the config account.
 */
function Authority({ r }: { r: ReserveView }) {
  const c = r.config;
  const rpc = r.explorerRpc;
  const guardians = c.guardians.filter((g) => g !== EMPTY_KEY);
  return (
    <section aria-labelledby="risk-authority-h" className="flex flex-col gap-4">
      <BlockHead
        id="risk-authority-h"
        title="Where claim payments go, and who can pause"
        note={<Lead lead="Claim payments go to one fixed account." className="text-sm">Only the Reserve Admin can change it. Below it, every key that can pause the program.</Lead>}
        aside={<HeadLink href="/reserve/verify">See every account</HeadLink>}
      />
      <div role="group" aria-label="Authority" className="grid grid-cols-1 gap-px border md:grid-cols-2" style={{ background: "var(--color-border)" }}>
        <div className="bg-(--color-surface) flex min-w-0 flex-col gap-3 px-6 py-4">
          <Label>Payments account</Label>
          <Key address={c.paymentsAccount} rpc={rpc} who="fixed; set by the Reserve Admin" />
          <span className="font-body text-(--color-text-2) text-xs leading-snug">Receives every claim payment. The operator cannot pay anywhere else.</span>
        </div>
        <div className="bg-(--color-surface) flex min-w-0 flex-col gap-3 px-6 py-4">
          <Label>Pause / guardian</Label>
          <span className="flex flex-col gap-1.5">
            <Key address={c.pauser} rpc={rpc} who="pauser" />
            <Key address={c.admin} rpc={rpc} who="Reserve Admin" />
            {guardians.map((g) => (
              <Key key={g} address={g} rpc={rpc} who="guardian" />
            ))}
          </span>
          <span className="font-body text-(--color-text-2) text-xs leading-snug">
            Can pause the program: new guarantees and capital moves stop; claim payments do not.
            {guardians.length === 0 ? " No guardian keys are set." : ` ${guardians.length === 1 ? "The guardian key" : "Guardian keys"} may pause, nothing else.`} Only the Reserve Admin unpauses.
          </span>
        </div>
      </div>
    </section>
  );
}

/** Block 5 · who provides capital. Text only, no figures. */
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
      <AdminCaps r={r} />
      <Authority r={r} />
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
      kicker="Disclosures"
      subtitle="What limits each payment, and who can move money."
    >
      <Disclosures r={d.reserve} />
    </Section>
  );
}
