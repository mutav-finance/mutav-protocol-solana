"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getJson } from "./api";

export type Poll<T> = {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
  /** Wall-clock time of the last successful read. */
  updatedAt: number | null;
  refresh: () => Promise<void>;
};

/**
 * Poll a read route. Pauses while the tab is hidden; `refresh()` reads now
 * (used right after a transaction confirms) and skips the CDN's 3 s read
 * cache with a fresh query parameter, so "how the numbers moved" is current.
 * `until(data)` true stops the polling after that read (an answer that cannot
 * change, e.g. /api/fx with no rate source); `refresh()` still reads.
 */
export function usePoll<T>(url: string, intervalMs = 10_000, until?: (data: T) => boolean): Poll<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  // Loading until the first read of the current URL settles (a new URL, e.g. a
  // newly connected wallet, is loading again until its own read lands or fails).
  const [settledUrl, setSettledUrl] = useState<string | null>(null);
  const loading = settledUrl !== url;
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const stop = useRef(until);
  useEffect(() => {
    stop.current = until;
  });

  const read = useCallback(async (fresh = false): Promise<T | null> => {
    try {
      const d = await getJson<T>(fresh ? `${url}${url.includes("?") ? "&" : "?"}fresh=${Date.now()}` : url);
      if (!alive.current) return null;
      setData(d);
      setError(null);
      setUpdatedAt(Date.now());
      return d;
    } catch (e) {
      if (alive.current) setError(e as Error);
      return null;
    } finally {
      if (alive.current) setSettledUrl(url);
    }
  }, [url]);

  useEffect(() => {
    alive.current = true;
    const tick = async () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        const d = await read();
        if (d !== null && stop.current?.(d)) return;
      }
      if (alive.current) timer.current = setTimeout(tick, intervalMs);
    };
    void tick();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [read, intervalMs]);

  const refresh = useCallback(async () => {
    await read(true);
  }, [read]);
  return { data, error, loading, updatedAt, refresh };
}
