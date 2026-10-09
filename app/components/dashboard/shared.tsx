/**
 * Shared bits of the /dashboard views: labels, row formatters, the position
 * split and the brand block frame. Pure reads of the shared poll; no new data.
 */
import type { ReactNode } from "react";
import { assetsFor } from "@mutav-finance/mutav-protocol-solana";
import { InfoTooltip } from "@/components/InfoTooltip";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtBrs, fmtShares } from "@/lib/format";
import type { InvestorView } from "@/lib/server/investor";
import type { InvestorRequest, ReserveView } from "@/lib/view";

/** Dev only: with the mock chain and no wallet, preview MUTAV's capital wallet. */
export const MOCK = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_MOCK_CHAIN === "1";

export const ACTION_LABEL = { cancel_deposit: "Cancel deposit", claim_shares: "Claim shares", cancel_redeem: "Cancel redemption", claim_assets: "Claim BRS" } as const;

/** Inter Medium 12px caps label (STYLE.md card label). */
export const LABEL = "font-body text-(--color-text-2) text-xs font-medium uppercase";
export const TRACKING = { letterSpacing: "0.01em" };

export const sideName = (x: InvestorRequest) => (x.side === "deposit" ? "Deposit" : "Redemption");
export const waitingOf = (x: InvestorRequest) => (x.waiting === 0n ? "—" : x.side === "deposit" ? fmtBrs(x.waiting) : `${fmtShares(x.waiting)} sh`);
export const claimOf = (x: InvestorRequest) => (x.claimable === 0n ? "—" : x.side === "deposit" ? `${fmtShares(x.claimable)} sh` : fmtBrs(x.claimable));
export const lineOf = (x: InvestorRequest) => (x.position === null ? "—" : `#${x.position}`);

/** Claim buttons live in the action panel's "Ready to claim" list; rows keep every other action, so each action shows exactly once. */
export const claimsInPanel = (x: InvestorRequest) => (x.claimable > 0n ? x.actions.filter((a) => a.startsWith("claim")) : []);
export const rowActions = (x: InvestorRequest) => {
  const inPanel = claimsInPanel(x);
  return x.actions.filter((a) => !inPanel.includes(a));
};

/** Status as a brand badge: 6px square + mono label. */
export function StatusOf({ x }: { x: InvestorRequest }) {
  if (x.claimable > 0n) return <StatusBadge color="var(--color-success)" label="READY TO CLAIM" />;
  return <StatusBadge color="var(--color-text-3)" label={x.status.toUpperCase()} />;
}

/**
 * The wallet's position split three ways, valued at the current NAV (a preview,
 * the client's math mirror of assets_for). held + queued + ready is the same
 * total the page always showed: shares held, deposits waiting, shares waiting to
 * redeem, and anything ready to claim.
 */
export type Position = {
  shares: bigint;
  held: bigint;
  queued: bigint;
  ready: bigint;
  total: bigint;
  depositsWaiting: bigint;
  redeemSharesWaiting: bigint;
  ownBps: bigint;
};

export function splitPosition(r: ReserveView, inv: InvestorView | null, mine: InvestorRequest[]): Position {
  const s = r.state;
  const at = (sh: bigint) => assetsFor(sh, s.sharesOutstanding, r.solvency.netAssets);
  const shares = inv?.shares.amount ?? 0n;
  const held = at(shares);
  let queued = 0n;
  let ready = 0n;
  let depositsWaiting = 0n;
  let redeemSharesWaiting = 0n;
  for (const x of mine) {
    if (x.side === "deposit") {
      queued += x.waiting;
      depositsWaiting += x.waiting;
      ready += at(x.claimable);
    } else {
      queued += at(x.waiting);
      redeemSharesWaiting += x.waiting;
      ready += x.claimable;
    }
  }
  const ownBps = s.sharesOutstanding === 0n ? 0n : (shares * 10_000n) / s.sharesOutstanding;
  return { shares, held, queued, ready, total: held + queued + ready, depositsWaiting, redeemSharesWaiting, ownBps };
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
