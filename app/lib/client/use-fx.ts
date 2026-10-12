"use client";

/**
 * The USD/BRL display rate from /api/fx (BCB PTAX), for the small "≈ US$"
 * hints next to BRS figures. Read once on load, then about every 30 minutes
 * (PTAX publishes once a day); stops when the route answers no rate.
 */
import type { FxResponse, FxView } from "../server/fx";
import { usePoll } from "./use-poll";

export const FX_POLL_MS = 30 * 60_000;

/** /api/fx answered no rate: the hints stay hidden and polling stops. */
export const noFx = (r: FxResponse) => r.fx === null;

export function useFx(): FxView | null {
  return usePoll<FxResponse>("/api/fx", FX_POLL_MS, noFx).data?.fx ?? null;
}
