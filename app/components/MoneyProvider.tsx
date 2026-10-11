"use client";

/**
 * The display currency for a page. Investor-facing pages (/investment,
 * /reserve) wrap themselves in it to show BRS amounts in dollars at the
 * /api/fx rate; outside it, amounts stay in BRS as reais (admin, operator).
 */
import { createContext, useContext, type ReactNode } from "react";
import { fmtBrs } from "@/lib/format";
import { useMoney } from "@/lib/client/use-money";

type Fmt = (base: bigint, places?: number) => string;
const MoneyCtx = createContext<Fmt>(fmtBrs);

export function MoneyProvider({ children }: { children: ReactNode }) {
  const { fmt } = useMoney();
  return <MoneyCtx.Provider value={fmt}>{children}</MoneyCtx.Provider>;
}

/** Format a BRS amount in the page's display currency. */
export const useFmt = (): Fmt => useContext(MoneyCtx);
