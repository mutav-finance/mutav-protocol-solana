"use client";

/**
 * The request card on /investment: one swap-style form for both sides of the
 * capital queue. "You pay" is what goes into escrow (BRS for a deposit, shares
 * for a redemption); "You receive" is a preview at today's NAV, labelled as
 * one: the Reserve Admin fills requests in queue order at the NAV of the fill.
 * The arrow between the fields switches sides. The server composes the
 * unsigned transaction (with the Merkle proof); the connected wallet signs.
 */
import { useState, type ReactNode } from "react";
import { assetsFor, sharesFor } from "@mutav-finance/mutav-protocol-solana";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Action, Note, useLive } from "@/components/demo/shared";
import { Access } from "@/components/dashboard/ActionPanel";
import { LABEL, TRACKING } from "@/components/dashboard/shared";
import { BRS_DECIMALS, SHARE_DECIMALS, fmtBrs, fmtShares, fmtUnits, parseBrs } from "@/lib/format";
import type { InvestorView } from "@/lib/server/investor";

type Side = "deposit" | "redeem";

/** One field of the swap: label, a large amount, the unit, and a balance line. */
function Field({ id, title, unit, value, onChange, foot, readOnly }: { id: string; title: string; unit: string; value: string; onChange?: (v: string) => void; foot: ReactNode; readOnly?: boolean }) {
  return (
    <div className="bg-(--color-canvas) flex flex-col gap-2 border p-4">
      <label htmlFor={id} className={LABEL} style={TRACKING}>
        {title}
      </label>
      <div className="flex items-center gap-3">
        <Input
          id={id}
          value={value}
          placeholder="0.00"
          inputMode="decimal"
          readOnly={readOnly}
          tabIndex={readOnly ? -1 : undefined}
          onChange={(e) => onChange?.(e.target.value)}
          className={`font-mono h-12 border-0 bg-transparent px-0 text-[28px] font-bold shadow-none focus-visible:ring-0 ${readOnly ? "text-(--color-text-2)" : ""}`}
        />
        <span className="font-mono text-(--color-text) shrink-0 text-base font-medium">{unit}</span>
      </div>
      <div className="font-mono text-(--color-text-3) flex min-h-6 items-center justify-between gap-2 text-2xs">{foot}</div>
    </div>
  );
}

export function RequestCard({ inv, owner, connected }: { inv: InvestorView | null; owner: string | null; connected: boolean }) {
  const { reserve } = useLive();
  const caps = reserve.config.caps;
  const { sharesOutstanding } = reserve.state;
  const { netAssets } = reserve.solvency;
  const state = inv?.allowlist.state ?? null;
  const paused = reserve.config.paused;
  const canRequest = connected && state === "allowlisted" && !paused;

  const [side, setSide] = useState<Side>("deposit");
  const [input, setInput] = useState("");
  const deposit = side === "deposit";
  const amount = parseBrs(input, deposit ? BRS_DECIMALS : SHARE_DECIMALS);
  const preview = amount ? (deposit ? sharesFor(amount, sharesOutstanding, netAssets) : assetsFor(amount, sharesOutstanding, netAssets)) : null;
  // What the request is worth in BRS, for the per-request limits.
  const value = amount ? (deposit ? amount : preview) : null;
  const outside = value !== null && (value < caps.minRequest || value > caps.maxRequest);

  const balance = deposit ? (inv?.brs.amount ?? null) : (inv?.shares.amount ?? null);
  const decimals = deposit ? BRS_DECIMALS : SHARE_DECIMALS;
  const switchTo = (s: Side) => {
    setSide(s);
    setInput("");
  };

  return (
    <section aria-labelledby="request-h" className="bg-(--color-surface) flex w-full flex-col border">
      <Access state={state} owner={owner} paused={paused} />
      <div className="flex flex-col gap-4 px-6 py-5">
        <h2 id="request-h" className="font-display text-(--color-text) m-0 text-center text-xl font-bold">
          {deposit ? "Deposit" : "Redeem"}
        </h2>
        <Tabs value={side} onValueChange={(v) => switchTo(v as Side)}>
          <TabsList className="w-full">
            <TabsTrigger value="deposit" className="flex-1">
              Deposit
            </TabsTrigger>
            <TabsTrigger value="redeem" className="flex-1">
              Redeem
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-col">
          <Field
            id="inv-pay"
            title="You pay"
            unit={deposit ? "BRS" : "shares"}
            value={input}
            onChange={setInput}
            foot={
              <>
                <span>
                  {deposit ? "Wallet" : "Held"} {balance === null ? "—" : deposit ? fmtBrs(balance) : fmtShares(balance)}
                </span>
                {balance !== null && balance > 0n && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setInput(fmtUnits(balance, decimals, decimals).replace(/,/g, ""))} className="h-6 px-2 text-2xs">
                    Max
                  </Button>
                )}
              </>
            }
          />
          <div className="relative z-10 -my-3 flex justify-center">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={deposit ? "Switch to redeem" : "Switch to deposit"}
              title={deposit ? "Switch to redeem" : "Switch to deposit"}
              onClick={() => switchTo(deposit ? "redeem" : "deposit")}
              className="bg-(--color-surface-2) text-(--color-text-2) hover:text-(--color-text) size-8 border [border-color:var(--color-border)]"
            >
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </Button>
          </div>
          <Field
            id="inv-receive"
            title="You receive"
            unit={deposit ? "shares" : "BRS"}
            value={preview === null ? "" : deposit ? fmtShares(preview) : fmtUnits(preview, BRS_DECIMALS)}
            readOnly
            foot={<span>PREVIEW · at NAV now; filled at the NAV of the fill</span>}
          />
        </div>

        <p className="font-mono text-(--color-text-3) m-0 text-2xs">
          Limits {fmtBrs(caps.minRequest, 0)} – {fmtBrs(caps.maxRequest, 0)} per request{deposit ? "" : ", valued at NAV now"}
        </p>
        <div className="[&>div>button]:h-11 [&>div>button]:w-full">
          {deposit ? (
            <Action label="Request deposit" disabled={!canRequest} request={amount ? { kind: "request_deposit", assets: amount } : null} />
          ) : (
            <Action label="Request redemption" disabled={!canRequest} request={amount ? { kind: "request_redeem", shares: amount } : null} />
          )}
        </div>
        {outside && <Note tone="warn">Outside the per-request limits: the program will refuse it.</Note>}
      </div>
      <HowItWorks />
    </section>
  );
}

/** How requests work: one collapsed disclosure. */
function HowItWorks() {
  return (
    <details className="group border-t px-6 py-4">
      <summary className="font-body text-(--color-text-2) hover:text-(--color-text) cursor-pointer text-sm select-none">How requests work</summary>
      <ul className="font-body text-(--color-text-2) m-0 mt-3 flex list-none flex-col gap-2 p-0 text-xs leading-relaxed">
        <li>
          <span className="text-(--color-text) font-medium">Deposit.</span> BRS waits in escrow, in queue order. The Reserve Admin fulfils it at the NAV of that moment;
          then you claim the shares on the Dashboard.
        </li>
        <li>
          <span className="text-(--color-text) font-medium">Redemption.</span> Shares wait in escrow, in queue order. They are filled from free capital, never while the
          reserve is under-covered; then you claim the BRS on the Dashboard.
        </li>
        <li>
          <span className="text-(--color-text) font-medium">Cancel and claim</span> need only the request&apos;s owner and are never paused. Your wallet signs every
          request; the server holds no key.
        </li>
      </ul>
    </details>
  );
}
