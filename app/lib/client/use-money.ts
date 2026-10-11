"use client";

/**
 * Money for investor screens: BRS amounts shown in dollars at the /api/fx
 * rate. Without a rate (not configured, or not read yet) it falls back to BRS
 * in reais, so a figure is never shown at a made-up rate.
 */
import { fmtBrs, fmtUnits, fmtUsd } from "../format";
import type { FxView } from "../server/fx";
import { usePoll } from "./use-poll";

export type Money = {
  fx: FxView | null;
  /** A BRS amount as dollars, or as reais when there is no rate. */
  fmt: (base: bigint, places?: number) => string;
  /** The rate in use, `$1 = R$ 5.40`; null without one. */
  rate: string | null;
};

export function useMoney(): Money {
  const fx = usePoll<FxView>("/api/fx", 60_000).data;
  return {
    fx,
    fmt: (base, places = 2) => (fx ? fmtUsd(base, fx.usdBrl, places) : fmtBrs(base, places)),
    rate: fx ? `$1 = R$ ${fmtUnits(fx.usdBrl, 6)}` : null,
  };
}
