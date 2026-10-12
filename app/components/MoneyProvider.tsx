"use client";

/**
 * Money display: BRS is always the figure. Inside a MoneyProvider, with a
 * USD/BRL rate from /api/fx (BCB PTAX), a small muted `≈ US$ X` hint follows
 * it, plus one source line per page. Display only; the reserve holds BRS.
 * Without a rate (or outside a provider: admin, operator) the hints render
 * nothing and figures stay exactly as they were.
 */
import { createContext, useContext, type ReactNode } from "react";
import { fmtBrs, fmtUsdHint, fxSourceLine, toScaledRate } from "@/lib/format";
import { useFx } from "@/lib/client/use-fx";
import type { FxView } from "@/lib/server/fx";

const FxCtx = createContext<FxView | null>(null);

/** Provides the display rate to the hints below it (reads /api/fx). */
export function MoneyProvider({ children }: { children: ReactNode }) {
  return <FxCtx.Provider value={useFx()}>{children}</FxCtx.Provider>;
}

/** Test and preview hook: provide a fixed rate (or none). */
export const FxProvider = FxCtx.Provider;

/** The page's display rate, or null when there is none. */
export const useDisplayFx = (): FxView | null => useContext(FxCtx);

/**
 * The small `≈ US$ X` after (or, with `block`, under) a BRS figure: mono,
 * 2xs, regular weight, text-2. Renders nothing without a rate. `sign` is shown
 * on both (pass the magnitude as `brs`).
 */
export function UsdHint({ brs, sign = "", block = false }: { brs: bigint; sign?: string; block?: boolean }) {
  const fx = useContext(FxCtx);
  const text = fx ? fmtUsdHint(brs, fx.rate, sign) : "";
  if (!text) return null;
  return (
    <span
      data-testid="usd-hint"
      className={`font-mono text-(--color-text-2) text-2xs font-normal whitespace-nowrap ${block ? "mt-1 block" : "ml-2"}`}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {text}
    </span>
  );
}

/** A BRS figure (`fmtBrs`) with its US$ hint; drop it where `fmtBrs(x)` used to render. */
export function Money({ brs, places = 2, sign = "", block = false }: { brs: bigint; places?: number; sign?: string; block?: boolean }) {
  return (
    <>
      {sign}
      {fmtBrs(brs, places)}
      <UsdHint brs={brs} sign={sign} block={block} />
    </>
  );
}

/** The one source line wherever US$ hints show; nothing without a rate. */
export function UsdSource({ className = "" }: { className?: string }) {
  const fx = useContext(FxCtx);
  if (!fx || toScaledRate(fx.rate) === null) return null;
  return (
    <p className={`font-mono text-(--color-text-3) m-0 text-2xs ${className}`} data-testid="usd-source">
      {fxSourceLine(fx)}
    </p>
  );
}
