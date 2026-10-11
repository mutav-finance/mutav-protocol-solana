"use client";

/**
 * The request card on /investment: one form for both sides of the capital
 * queue, switched by the Deposit / Redeem tabs. The first field is what waits
 * in line (BRS for a deposit, shares for a redemption); "You receive" is
 * worked out at today's share price: the Reserve Admin fills requests in order
 * at the share price of the fill. The server composes the unsigned
 * transaction (with the Merkle proof); the connected wallet signs.
 */
import { useState, type ReactNode } from "react";
import { assetsFor, sharesFor } from "@mutav-finance/mutav-protocol-solana";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Action, Note, useLive } from "@/components/demo/shared";
import { LABEL, TRACKING } from "./shared";
import { BRS_DECIMALS, SHARE_DECIMALS, fmtShares, fmtUnits, parseBrs } from "@/lib/format";
import type { Money } from "@/lib/client/use-money";
import type { InvestorView } from "@/lib/server/investor";

type Side = "deposit" | "redeem";

/** One field of the form: label, a large amount, the unit, and a balance line. */
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

export function RequestCard({ inv, connected, money }: { inv: InvestorView | null; connected: boolean; money: Money }) {
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
  const blocked = paused ? null : !connected ? "Connect an approved wallet to request." : state === null ? "Checking access…" : canRequest ? null : "This wallet isn't approved. Access is by allowlist (KYC off-chain).";

  return (
    <section aria-label={deposit ? "Deposit request" : "Redemption request"} className="bg-(--color-surface) flex w-full flex-col border">
      <div className="flex flex-col gap-4 px-6 py-5">
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

        <div className="flex flex-col gap-2">
          <Field
            id="inv-pay"
            title={deposit ? "You deposit" : "You redeem"}
            unit={deposit ? "BRS" : "shares"}
            value={input}
            onChange={setInput}
            foot={
              <>
                <span>
                  Balance {balance === null ? "—" : deposit ? `${fmtUnits(balance, BRS_DECIMALS)} BRS` : fmtShares(balance)}
                </span>
                {balance !== null && balance > 0n && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setInput(fmtUnits(balance, decimals, decimals).replace(/,/g, ""))} className="h-6 px-2 text-2xs">
                    Max
                  </Button>
                )}
              </>
            }
          />
          <Field
            id="inv-receive"
            title="You receive"
            unit={deposit ? "shares" : "BRS"}
            value={preview === null ? "" : deposit ? fmtShares(preview) : fmtUnits(preview, BRS_DECIMALS)}
            readOnly
            foot={<span>{value !== null && money.fx ? `≈ ${money.fmt(value)} · ` : ""}At today&apos;s share price. The fill price sets the final amount.</span>}
          />
        </div>

        <p className="font-mono text-(--color-text-3) m-0 text-2xs">
          Min {money.fmt(caps.minRequest, 0)} · max {money.fmt(caps.maxRequest, 0)} per request
        </p>
        {blocked && <p className="font-body text-(--color-text-2) m-0 text-center text-xs">{blocked}</p>}
        <div className="[&>div>button]:h-11 [&>div>button]:w-full [&>div>button:disabled]:bg-(--color-surface-3) [&>div>button:disabled]:text-(--color-text-3) [&>div>button:disabled]:opacity-100">
          {deposit ? (
            <Action label="Request deposit" disabled={!canRequest} request={amount ? { kind: "request_deposit", assets: amount } : null} />
          ) : (
            <Action label="Request redemption" disabled={!canRequest} request={amount ? { kind: "request_redeem", shares: amount } : null} />
          )}
        </div>
        {paused && <Note tone="warn">Requests are paused by the Reserve Admin. Cancel and collect stay open.</Note>}
        {outside && <Note tone="warn">Outside the per-request limits: the program will refuse it.</Note>}
      </div>
      <HowItWorks />
    </section>
  );
}

/** A helper line with a bold lead phrase and the rest in the secondary tone. */
function Lead({ lead, children }: { lead: string; children: ReactNode }) {
  return (
    <li>
      <span className="text-(--color-text) font-semibold">{lead}</span> {children}
    </li>
  );
}

/** How requests work: one collapsed disclosure. */
function HowItWorks() {
  return (
    <details className="group border-t px-6 py-4">
      <summary className="font-body text-(--color-text-2) hover:text-(--color-text) cursor-pointer text-sm select-none">How requests work</summary>
      <ul className="font-body text-(--color-text-2) m-0 mt-3 flex list-none flex-col gap-2 p-0 text-xs leading-relaxed">
        <Lead lead="Deposit.">Your BRS waits in line. When filled, collect your shares here.</Lead>
        <Lead lead="Redemption.">Your shares wait in line and fill from free capital. Then collect your BRS.</Lead>
        <Lead lead="Cancel or collect anytime.">Your wallet signs every request.</Lead>
      </ul>
    </details>
  );
}
