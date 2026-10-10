"use client";

/**
 * The sticky action panel (ui-reference pattern 8): everything this wallet can
 * do here, in one bordered column, top to bottom by urgency: can I act
 * (allowlist status), what is ready to claim, then the way to /investment for
 * a new deposit or redemption. The server composes unsigned transactions, the
 * connected wallet signs.
 */
import Link from "next/link";
import { InfoTooltip } from "@/components/InfoTooltip";
import { StatusBadge } from "@/components/StatusBadge";
import { Mono } from "@/components/Mono";
import { Action, Note, useLive } from "@/components/demo/shared";
import { ALLOWLIST_TEXT, type AllowlistState } from "@/lib/allowlist";
import type { InvestorView } from "@/lib/server/investor";
import type { InvestorRequest } from "@/lib/view";
import { ACTION_LABEL, claimOf, claimsInPanel, sideName } from "./shared";

/** Plain-language allowlist text for this page; the Merkle wording lives in the ⓘ. */
const ALLOWLIST_PLAIN: Record<AllowlistState, string> = {
  ...ALLOWLIST_TEXT,
  allowlisted: "This wallet can send deposit and redemption requests.",
};

const ACCESS_BADGE: Record<AllowlistState, { label: string; color: string }> = {
  allowlisted: { label: "ALLOWLISTED", color: "var(--color-success)" },
  "not-listed": { label: "NOT LISTED", color: "var(--color-copper)" },
  "root-unset": { label: "ROOT UNSET", color: "var(--color-copper)" },
  "list-mismatch": { label: "LIST MISMATCH", color: "var(--color-copper)" },
};

/** Row 1: can this wallet act? One badge, one line, the definition behind the ⓘ. */
export function Access({ state, owner, paused }: { state: AllowlistState | null; owner: string | null; paused: boolean }) {
  const badge = state ? ACCESS_BADGE[state] : { label: owner ? "CHECKING" : "NO WALLET", color: "var(--color-text-3)" };
  const text = state ? ALLOWLIST_PLAIN[state] : owner ? "Checking the allowlist…" : "Connect a wallet to check it. Without one, this page is read-only.";
  return (
    <div className="flex flex-col gap-2 border-b px-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge color={badge.color} label={badge.label} />
        <InfoTooltip label="About the allowlist">
          Only wallets on the on-chain allowlist can send requests; KYC is done off-chain. The Reserve Admin sets the allowlist root. The program checks a Merkle proof of
          your wallet against it; the server builds the proof from the public list.
        </InfoTooltip>
      </div>
      <p className="font-body text-(--color-text-2) m-0 text-sm">{text}</p>
      {paused && <Note tone="warn">Requests are paused by the Reserve Admin. Cancels and claims stay open.</Note>}
    </div>
  );
}

/** Row 2, only when something is filled: the claim buttons, one per request. */
function ReadyToClaim({ rows, connected }: { rows: InvestorRequest[]; connected: boolean }) {
  const ready = rows.filter((x) => claimsInPanel(x).length > 0);
  if (ready.length === 0) return null;
  return (
    <section aria-labelledby="ready-h" className="flex flex-col gap-3 border-b px-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="ready-h" className="font-display text-(--color-text) m-0 text-base font-bold">
          Ready to claim
        </h2>
        <StatusBadge color="var(--color-success)" label={`${ready.length} READY`} />
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {ready.map((x) => (
          <li key={x.address} className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-body text-(--color-text-2) flex flex-col text-xs">
              {sideName(x)}
              <Mono style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text)" }}>{claimOf(x)}</Mono>
            </span>
            <div className="flex flex-wrap gap-2">
              {claimsInPanel(x).map((a) => (
                <Action key={a} label={ACTION_LABEL[a]} disabled={!connected} request={{ kind: a, seq: x.seq }} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Row 3: new requests live on /investment. */
function NewRequestLink() {
  return (
    <div className="flex flex-col gap-3 px-6 py-4">
      <p className="font-body text-(--color-text-2) m-0 text-sm">Deposit BRS or redeem shares on the Investment page. Requests join the queue in order.</p>
      <Link href="/investment" className="font-body text-(--color-text) inline-flex h-11 items-center justify-center border text-sm font-medium no-underline [border-color:var(--color-border)] hover:[border-color:var(--color-accent)]">
        Deposit or redeem →
      </Link>
    </div>
  );
}

export function ActionPanel({ inv, owner, connected, mine }: { inv: InvestorView | null; owner: string | null; connected: boolean; mine: InvestorRequest[] }) {
  const { reserve } = useLive();
  const state = inv?.allowlist.state ?? null;
  const paused = reserve.config.paused;
  return (
    <aside
      aria-label="Actions"
      className="bg-(--color-surface) flex min-w-0 flex-col border lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto"
    >
      <Access state={state} owner={owner} paused={paused} />
      <ReadyToClaim rows={mine} connected={connected} />
      <NewRequestLink />
    </aside>
  );
}
