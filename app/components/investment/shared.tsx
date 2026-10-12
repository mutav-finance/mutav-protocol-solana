/**
 * Shared bits of the /capital views: labels, row formatters and the brand
 * block frame. Pure reads of the shared poll; no new data.
 */
import type { ReactNode } from "react";
import { InfoTooltip } from "@/components/InfoTooltip";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtShares } from "@/lib/format";
import type { Money } from "@/lib/client/use-money";
import type { InvestorRequest } from "@/lib/view";

/** Dev only: with the mock chain and no wallet, preview MUTAV's capital wallet. */
export const MOCK = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_MOCK_CHAIN === "1";

export const ACTION_LABEL = { cancel_deposit: "Cancel deposit", claim_shares: "Collect shares", cancel_redeem: "Cancel redemption", claim_assets: "Collect BRS" } as const;

/** A parked request's cancel only returns the escrow to its owner (ADR 0030): it reads as a collect. */
export const PARKED_ACTION_LABEL = { cancel_deposit: "Collect BRS", cancel_redeem: "Collect shares" } as const;

/** The button label for `a` on row `x`. */
export const actionLabel = (x: InvestorRequest, a: InvestorRequest["actions"][number]) =>
  x.status === "parked" && (a === "cancel_deposit" || a === "cancel_redeem") ? PARKED_ACTION_LABEL[a] : ACTION_LABEL[a];

/** Inter Medium 12px caps label (STYLE.md card label). */
export const LABEL = "font-body text-(--color-text-2) text-xs font-medium uppercase";
export const TRACKING = { letterSpacing: "0.01em" };

export const sideName = (x: InvestorRequest) => (x.side === "deposit" ? "Deposit" : "Redemption");
export const waitingOf = (x: InvestorRequest, m: Money) => (x.waiting === 0n ? "—" : x.side === "deposit" ? m.fmt(x.waiting) : `${fmtShares(x.waiting)} sh`);
export const claimOf = (x: InvestorRequest, m: Money) => (x.claimable === 0n ? "—" : x.side === "deposit" ? `${fmtShares(x.claimable)} sh` : m.fmt(x.claimable));
export const lineOf = (x: InvestorRequest) => (x.position === null ? "—" : ordinal(x.position));

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

/** The on-chain status in UI words: pending is "Waiting", fulfilled is "Filled". */
export function statusName(x: InvestorRequest): string {
  switch (x.status) {
    case "pending":
      return "Waiting";
    case "fulfilled":
    case "filled":
      return "Filled";
    case "parked":
      // Parked by the admin's cancel (ADR 0030): out of the queue; the owner collects with cancel_deposit / cancel_redeem.
      return "Parked";
    default:
      return x.status;
  }
}

/** Status as a brand badge: 6px square + mono label. */
export function StatusOf({ x }: { x: InvestorRequest }) {
  if (x.claimable > 0n) return <StatusBadge color="var(--color-success)" label="READY TO COLLECT" />;
  return <StatusBadge color="var(--color-text-3)" label={statusName(x).toUpperCase()} />;
}

/** A bordered surface block with a one-line header (title, optional definition, optional aside). */
export function Block({ id, title, info, aside, children, flush = false }: { id: string; title: string; info?: ReactNode; aside?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section aria-labelledby={id} className="bg-(--color-surface) flex min-w-0 flex-col border">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <span className="flex items-center gap-2">
          <h2 id={id} className="font-display text-(--color-text) m-0 text-base font-bold">
            {title}
          </h2>
          {info && <InfoTooltip label={`About ${title}`}>{info}</InfoTooltip>}
        </span>
        {aside}
      </header>
      <div className={flush ? "flex flex-col" : "flex flex-col gap-4 p-6"}>{children}</div>
    </section>
  );
}
