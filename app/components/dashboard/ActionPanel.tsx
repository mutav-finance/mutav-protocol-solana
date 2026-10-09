"use client";

/**
 * The sticky action panel (ui-reference pattern 8): everything this wallet can
 * do, in one bordered column, top to bottom by urgency: can I act (allowlist
 * status), what is ready to claim, then a new deposit or redemption request.
 * Same requests as before: the server composes unsigned transactions (with the
 * Merkle proof for request_*), the connected wallet signs.
 */
import { useState, type ReactNode } from "react";
import { assetsFor } from "@mutav-finance/mutav-protocol-solana";
import { InfoTooltip } from "@/components/InfoTooltip";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mono } from "@/components/Mono";
import { Action, Note, useLive } from "@/components/demo/shared";
import { ALLOWLIST_TEXT, type AllowlistState } from "@/lib/allowlist";
import { SHARE_DECIMALS, fmtBrs, fmtShares, parseBrs } from "@/lib/format";
import type { InvestorView } from "@/lib/server/investor";
import type { InvestorRequest } from "@/lib/view";
import { ACTION_LABEL, LABEL, TRACKING, claimOf, claimsInPanel, sideName } from "./shared";

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
function Access({ state, owner, paused }: { state: AllowlistState | null; owner: string | null; paused: boolean }) {
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

/** A large amount field with the wallet balance and Max. */
function AmountField({ id, title, unit, value, onChange, balance, onMax }: { id: string; title: string; unit: string; value: string; onChange: (v: string) => void; balance: ReactNode; onMax?: () => void }) {
  return (
    <div className="bg-(--color-canvas) flex flex-col gap-2 border p-4">
      <label htmlFor={id} className={LABEL} style={TRACKING}>
        {title}
      </label>
      <div className="flex items-center gap-3">
        <Input id={id} value={value} placeholder="0.00" inputMode="decimal" onChange={(e) => onChange(e.target.value)} className="font-mono h-12 border-0 bg-transparent px-0 text-2xl font-bold shadow-none focus-visible:ring-0" />
        <span className="font-mono text-(--color-text-2) shrink-0 text-sm">{unit}</span>
      </div>
      <div className="font-mono text-(--color-text-3) flex min-h-6 items-center justify-between gap-2 text-2xs">
        <span>{balance}</span>
        {onMax && (
          <Button type="button" variant="ghost" size="sm" onClick={onMax} className="h-6 px-2 text-2xs">
            Max
          </Button>
        )}
      </div>
    </div>
  );
}

/** Mono meta line under the field: what the program will accept, and the preview when there is one. */
const Meta = ({ children }: { children: ReactNode }) => <p className="font-mono text-(--color-text-3) m-0 text-2xs">{children}</p>;

/** Row 3: the request form. Deposit / Redeem tabs, one field, one button. */
function NewRequest({ canRequest, inv }: { canRequest: boolean; inv: InvestorView | null }) {
  const { reserve } = useLive();
  const caps = reserve.config.caps;
  const [amount, setAmount] = useState("");
  const [sharesIn, setSharesIn] = useState("");
  const assets = parseBrs(amount);
  const shares = parseBrs(sharesIn, SHARE_DECIMALS);
  const depOut = assets !== null && (assets < caps.minRequest || assets > caps.maxRequest);
  const redValue = shares ? assetsFor(shares, reserve.state.sharesOutstanding, reserve.solvency.netAssets) : null;
  const redOut = redValue !== null && (redValue < caps.minRequest || redValue > caps.maxRequest);
  const brs = inv?.brs.amount ?? null;
  const held = inv?.shares.amount ?? null;
  const limits = `Limits ${fmtBrs(caps.minRequest, 0)} – ${fmtBrs(caps.maxRequest, 0)} per request`;
  const button = "[&>div>button]:h-11 [&>div>button]:w-full";
  return (
    <section aria-labelledby="new-h" className="flex flex-col gap-4 px-6 py-4">
      <h2 id="new-h" className="font-display text-(--color-text) m-0 text-base font-bold">
        New request
      </h2>
      <Tabs defaultValue="deposit">
        <TabsList className="w-full">
          <TabsTrigger value="deposit" className="flex-1">
            Deposit
          </TabsTrigger>
          <TabsTrigger value="redeem" className="flex-1">
            Redeem
          </TabsTrigger>
        </TabsList>
        <TabsContent value="deposit" className="flex flex-col gap-3">
          <AmountField
            id="dash-dep"
            title="You deposit"
            unit="BRS"
            value={amount}
            onChange={setAmount}
            balance={<>Wallet {brs === null ? "—" : fmtBrs(brs)}</>}
            onMax={brs !== null && brs > 0n ? () => setAmount((Number(brs) / 1e6).toString()) : undefined}
          />
          <Meta>{limits}</Meta>
          <div className={button}>
            <Action label="Request deposit" disabled={!canRequest} request={assets ? { kind: "request_deposit", assets } : null} />
          </div>
          {depOut && <Note tone="warn">Outside the per-request limits: the program will refuse it.</Note>}
        </TabsContent>
        <TabsContent value="redeem" className="flex flex-col gap-3">
          <AmountField
            id="dash-red"
            title="You redeem"
            unit="shares"
            value={sharesIn}
            onChange={setSharesIn}
            balance={<>Held {held === null ? "—" : fmtShares(held)}</>}
            onMax={held !== null && held > 0n ? () => setSharesIn((Number(held) / 10 ** SHARE_DECIMALS).toString()) : undefined}
          />
          <Meta>{redValue !== null ? `PREVIEW ≈ ${fmtBrs(redValue)} at NAV now` : limits}</Meta>
          <div className={button}>
            <Action label="Request redemption" disabled={!canRequest} request={shares ? { kind: "request_redeem", shares } : null} />
          </div>
          {redOut && <Note tone="warn">Worth less than {fmtBrs(caps.minRequest, 0)} or more than {fmtBrs(caps.maxRequest, 0)} at the current NAV: the program will refuse it.</Note>}
        </TabsContent>
      </Tabs>
    </section>
  );
}

/** How requests work: one collapsed disclosure instead of three tooltips (ui-reference §2 Tooltips vs inline text). */
function HowItWorks() {
  return (
    <details className="group border-t px-6 py-4">
      <summary className="font-body text-(--color-text-2) hover:text-(--color-text) cursor-pointer text-sm select-none">How requests work</summary>
      <ul className="font-body text-(--color-text-2) m-0 mt-3 flex list-none flex-col gap-2 p-0 text-xs leading-relaxed">
        <li>
          <span className="text-(--color-text) font-medium">Deposit.</span> BRS waits in escrow, in queue order. The Reserve Admin fulfils it at the NAV of that moment;
          then you claim the shares.
        </li>
        <li>
          <span className="text-(--color-text) font-medium">Redemption.</span> Shares wait in escrow, in queue order. They are filled from free capital, never while the
          reserve is under-covered; then you claim the BRS.
        </li>
        <li>
          <span className="text-(--color-text) font-medium">Cancel and claim</span> need only the request&apos;s owner and are never paused. Your wallet signs every
          request; the server holds no key.
        </li>
      </ul>
    </details>
  );
}

export function ActionPanel({ inv, owner, connected, mine }: { inv: InvestorView | null; owner: string | null; connected: boolean; mine: InvestorRequest[] }) {
  const { reserve } = useLive();
  const state = inv?.allowlist.state ?? null;
  const paused = reserve.config.paused;
  // One rule for the badge and the gate: no real wallet vs. a wallet that is not allowlisted.
  const canRequest = connected && state === "allowlisted" && !paused;
  return (
    <aside
      aria-label="Actions"
      className="bg-(--color-surface) flex min-w-0 flex-col border lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto"
    >
      <Access state={state} owner={owner} paused={paused} />
      <ReadyToClaim rows={mine} connected={connected} />
      <NewRequest canRequest={canRequest} inv={inv} />
      <HowItWorks />
    </aside>
  );
}
