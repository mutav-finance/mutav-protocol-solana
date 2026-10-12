"use client";

/**
 * The request card on /capital: one form for both sides of the capital
 * queue, switched by the Deposit / Redeem tabs. The first field is what waits
 * in line (BRS for a deposit, shares for a redemption); "You receive" is
 * worked out at today's share price: the Reserve Admin fills requests in order
 * at the share price of the fill. The server composes the unsigned
 * transaction (with the Merkle proof); the connected wallet signs.
 *
 * Demo (`CAPITAL_FORMS_PUBLIC`, lib/flags.ts): every visitor sees the form;
 * the on-chain actions stay gated. Deposit needs a connected, allowlisted
 * wallet; Redeem needs one that is allowlisted or holds shares (entry is
 * gated, exit is not: ADR 0023). Otherwise the buttons are disabled with the
 * reason. With the switch off (launch), the form renders only for an
 * allowlisted wallet, a holder outside the allowlist gets Redeem only, and
 * everyone else sees a static card: allowlisted wallets only, not an offer.
 */
import { useState, type ReactNode } from "react";
import { assetsFor, sharesFor } from "@mutav-finance/mutav-protocol-solana";
import { Button } from "@/components/ui/button";
import { ConnectButton } from "@/components/ConnectButton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Action, Note, useLive } from "@/components/demo/shared";
import { LABEL, TRACKING } from "./shared";
import { CAPITAL_FORMS_PUBLIC } from "@/lib/flags";
import { BRS_DECIMALS, SHARE_DECIMALS, fmtBrs, fmtShares, fmtUnits, parseBrs, parseUnitsOrZero, toInput } from "@/lib/format";
import { limitWithSlippage } from "@/lib/queue";
import type { Money } from "@/lib/client/use-money";
import type { InvestorView } from "@/lib/server/investor";
import { redeemSizeCheck } from "@/lib/view";

type Side = "deposit" | "redeem";

/** Room left for the NAV to move between the request and its fill, in the "limit at preview" price limit. */
const LIMIT_SLIPPAGE_BPS = 100;

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

const LIMITED = "Capital requests are limited to allowlisted wallets during the pilot. This is not an offer.";

/** Launch (`CAPITAL_FORMS_PUBLIC` off): what a wallet that is not allowlisted (or no wallet) sees: no form, no amounts, no offer. */
function GatedCard({ connected, checking }: { connected: boolean; checking: boolean }) {
  return (
    <section aria-label="Capital requests" className="bg-(--color-surface) flex w-full flex-col gap-4 border px-6 py-5">
      <p className="font-body text-(--color-text) m-0 text-sm leading-relaxed">{LIMITED}</p>
      {!connected && (
        <div className="self-start">
          <ConnectButton />
        </div>
      )}
      {connected && checking && <p className="font-body text-(--color-text-3) m-0 text-xs">Checking access…</p>}
    </section>
  );
}

/**
 * `loading`: the connected wallet's /api/investor read is in flight (its
 * allowlist state is not known yet). On a read error it is false: the page
 * shows the error with a retry, not "Checking access…".
 */
export function RequestCard({ inv, loading, connected, money }: { inv: InvestorView | null; loading: boolean; connected: boolean; money: Money }) {
  const { reserve } = useLive();
  const caps = reserve.config.caps;
  const { sharesOutstanding } = reserve.state;
  const { netAssets } = reserve.coverage;
  const state = inv?.allowlist.state ?? null;
  const paused = reserve.config.paused;
  const listed = connected && state === "allowlisted";
  // The program skips the allowlist for an owner whose share account holds shares (request_redeem.rs).
  const holder = connected && (inv?.shares.amount ?? 0n) > 0n;
  const checking = connected && loading;
  // Demo: everyone gets both tabs. Launch: a holder outside the allowlist can only redeem.
  const depositTab = CAPITAL_FORMS_PUBLIC || listed;

  const [chosen, setSide] = useState<Side>("deposit");
  const side: Side = depositTab ? chosen : "redeem";
  const [input, setInput] = useState("");
  // Price limit (min shares out / min BRS out). Blank = no limit (0 on-chain).
  const [limit, setLimit] = useState("");
  const deposit = side === "deposit";
  const amount = parseBrs(input, deposit ? BRS_DECIMALS : SHARE_DECIMALS);
  const preview = amount ? (deposit ? sharesFor(amount, sharesOutstanding, netAssets) : assetsFor(amount, sharesOutstanding, netAssets)) : null;
  // What the request is worth in BRS, for the per-request limits.
  const value = amount ? (deposit ? amount : preview) : null;
  const canRequest = !paused && (deposit ? listed : listed || holder);
  const balance = deposit ? (inv?.brs.amount ?? null) : (inv?.shares.amount ?? null);
  // Redeem: below the minimum only a full exit of the share account passes (ADR 0029).
  const outside = deposit
    ? value !== null && (value < caps.minRequest || value > caps.maxRequest)
    : amount !== null && redeemSizeCheck(amount, balance, sharesOutstanding, netAssets, caps) !== null;
  const decimals = deposit ? BRS_DECIMALS : SHARE_DECIMALS;
  const overBalance = !deposit && amount !== null && balance !== null && amount > balance;
  const outDecimals = deposit ? SHARE_DECIMALS : BRS_DECIMALS;
  const minOut = limit.trim() ? parseUnitsOrZero(limit, outDecimals) : 0n;
  const switchTo = (s: Side) => {
    setSide(s);
    setInput("");
    setLimit("");
  };
  if (!CAPITAL_FORMS_PUBLIC && !listed && !holder) return <GatedCard connected={connected} checking={checking} />;
  // Per-request limits in BRS, the deposit field's unit; on Redeem also as shares at today's share price.
  const capShares = (v: bigint) => (deposit ? "" : ` (≈ ${fmtShares(sharesFor(v, sharesOutstanding, netAssets))} shares)`);

  return (
    <section aria-label={deposit ? "Deposit request" : "Redemption request"} className="bg-(--color-surface) flex w-full flex-col border">
      <div className="flex flex-col gap-4 px-6 py-5">
        <Tabs value={side} onValueChange={(v) => switchTo(v as Side)}>
          <TabsList className="w-full">
            {depositTab && (
              <TabsTrigger value="deposit" className="flex-1">
                Deposit
              </TabsTrigger>
            )}
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
          <Field
            id="inv-limit"
            title={deposit ? "Price limit: min shares (blank = none)" : "Price limit: min BRS (blank = none)"}
            unit={deposit ? "shares" : "BRS"}
            value={limit}
            onChange={setLimit}
            foot={
              <>
                <span>A fill below the limit stops at your request, which stays pending: you (or the admin) can cancel it.</span>
                {preview !== null && preview > 0n && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setLimit(toInput(limitWithSlippage(preview, LIMIT_SLIPPAGE_BPS), outDecimals))} className="h-6 shrink-0 px-2 text-2xs">
                    Preview − 1%
                  </Button>
                )}
              </>
            }
          />
        </div>

        <p className="font-mono text-(--color-text-3) m-0 text-2xs">
          Min {fmtBrs(caps.minRequest, 0)}
          {capShares(caps.minRequest)} · max {fmtBrs(caps.maxRequest, 0)}
          {capShares(caps.maxRequest)} per request
        </p>
        <div className="[&>div>button]:h-11 [&>div>button]:w-full [&>div>button:disabled]:bg-(--color-surface-3) [&>div>button:disabled]:text-(--color-text-3) [&>div>button:disabled]:opacity-100">
          {deposit ? (
            <Action label="Request deposit" disabled={!canRequest} request={amount && minOut !== null ? { kind: "request_deposit", assets: amount, minSharesOut: minOut } : null} />
          ) : (
            <Action label="Request redemption" disabled={!canRequest} request={amount && minOut !== null ? { kind: "request_redeem", shares: amount, minAssetsOut: minOut } : null} />
          )}
        </div>
        {!connected ? (
          <>
            <Note>{LIMITED}</Note>
            <div className="self-start">
              <ConnectButton />
            </div>
          </>
        ) : checking ? (
          <Note>Checking access…</Note>
        ) : (
          !listed && <Note>{holder ? "The allowlist gates new capital; existing holders can always redeem." : LIMITED}</Note>
        )}
        {paused && <Note tone="warn">Requests are paused by the Reserve Admin. Cancel and collect stay open.</Note>}
        {outside && <Note tone="warn">Outside the per-request limits: the program will refuse it.</Note>}
        {overBalance && <Note tone="warn">More than this wallet holds ({fmtShares(balance!)}): the program will refuse it.</Note>}
        {minOut === null && <Note tone="warn">The price limit is not {deposit ? "a share amount" : "a BRS amount"}.</Note>}
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
