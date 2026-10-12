"use client";

/**
 * The display currency for a page. Investor-facing pages (/capital,
 * /reserve) wrap themselves in it to show BRS amounts in dollars at the
 * /api/fx rate; outside it, amounts stay in BRS as reais (admin, operator).
 */
import { createContext, useContext, type ReactNode } from "react";
import { fmtBrs } from "@/lib/format";
import { useMoney } from "@/lib/client/use-money";

type Fmt = (base: bigint, places?: number) => string;
const MoneyCtx = createContext<Fmt>(fmtBrs);
/** The dollar rate in use (`US$1 = R$ 5.40`), or null when amounts show in BRS. */
const RateCtx = createContext<string | null>(null);

export function MoneyProvider({ children }: { children: ReactNode }) {
  const { fmt, rate } = useMoney();
  return (
    <MoneyCtx.Provider value={fmt}>
      <RateCtx.Provider value={rate}>{children}</RateCtx.Provider>
    </MoneyCtx.Provider>
  );
}

/** One visible line wherever amounts show in dollars; nothing when there is no rate (amounts are then in BRS). */
export function UsdNote({ rate }: { rate: string | null }) {
  if (!rate) return null;
  return (
    <p className="font-mono text-(--color-text-3) m-0 text-2xs" data-testid="usd-note">
      Shown in US dollars at {rate}, for display only. The reserve holds BRS.
    </p>
  );
}

/** The dollar line for the page's MoneyProvider. */
export const ProvidedUsdNote = () => <UsdNote rate={useContext(RateCtx)} />;

/** Format a BRS amount in the page's display currency. */
export const useFmt = (): Fmt => useContext(MoneyCtx);
